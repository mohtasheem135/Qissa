import { createAdminClient } from "@/lib/supabase/admin";
import { translate } from "@/lib/ai/translate";
import { getProviderMeta, isProviderConfigured, type ProviderId } from "@/lib/ai/registry";
import { getComplexityMeta } from "@/lib/ai/complexity";
import { ProviderError, type TranslationOutput } from "@/lib/ai/types";
import { wordCount } from "@/lib/utils/word-count";

const KNOWN_PROVIDER_IDS: ReadonlyArray<ProviderId> = [
  "gemini",
  "groq",
  "openrouter",
  "openai",
  "anthropic",
];

function isKnownProviderId(value: string | null | undefined): value is ProviderId {
  return !!value && (KNOWN_PROVIDER_IDS as ReadonlyArray<string>).includes(value);
}

export interface RunPartOptions {
  /** Override the provider that the story / global config would default to. */
  providerName?: ProviderId;
  /** Override the model. */
  modelName?: string;
  /** Cancel mid-flight (the queue endpoint passes the request's AbortSignal). */
  signal?: AbortSignal;
}

export type RunPartResult =
  | { ok: true; output: TranslationOutput; durationMs: number }
  | { ok: false; error: string; status?: number; provider?: ProviderId; model?: string; durationMs: number };

/**
 * Translate one story_part end-to-end.
 *
 * Reads the part + parent story + tone + language + previous part context,
 * marks the part as `translating`, runs the provider via withRetry (logging
 * each attempt into translation_jobs), writes the new version row, then
 * updates the part with the translated text + new status.
 *
 * On failure the part is left in status='failed' with error_message — the
 * admin can retry without any cleanup. The function never throws; all
 * outcomes return via the discriminated RunPartResult.
 *
 * Shared between /api/translate (single part) and /api/translate/queue
 * (sequential queue with SSE progress).
 */
export async function runStoryPartTranslation(
  storyPartId: string,
  options: RunPartOptions = {},
): Promise<RunPartResult> {
  const admin = createAdminClient();
  const startedAt = Date.now();

  // 1) Load part + story metadata.
  const { data: part, error: partErr } = await admin
    .from("story_parts")
    .select(
      `id, story_id, part_number, text_original,
       story:stories!inner (
         id, target_language, tone_id, complexity, custom_instructions,
         ai_provider, ai_model
       )`,
    )
    .eq("id", storyPartId)
    .single();

  if (partErr || !part) {
    return {
      ok: false,
      error: `Story part not found: ${partErr?.message ?? "unknown"}`,
      durationMs: Date.now() - startedAt,
    };
  }
  const story = part.story;
  if (!story) {
    return { ok: false, error: "Parent story missing.", durationMs: Date.now() - startedAt };
  }

  // 2) Tone + language (parallel).
  const [{ data: tone, error: toneErr }, { data: language, error: langErr }] = await Promise.all([
    admin.from("tones").select("id, prompt_fragment").eq("id", story.tone_id).single(),
    admin
      .from("languages")
      .select("name_english, name_native")
      .eq("code", story.target_language)
      .single(),
  ]);
  if (toneErr || !tone) {
    return { ok: false, error: "Tone not found.", durationMs: Date.now() - startedAt };
  }
  if (langErr || !language) {
    return { ok: false, error: "Target language not found.", durationMs: Date.now() - startedAt };
  }

  const complexity = getComplexityMeta(story.complexity);
  if (!complexity) {
    return {
      ok: false,
      error: `Unknown complexity "${story.complexity}".`,
      durationMs: Date.now() - startedAt,
    };
  }

  // 3) Previous part's translated text → coherence anchor.
  let previousPartContext: string | undefined;
  if (part.part_number > 1) {
    const { data: prev } = await admin
      .from("story_parts")
      .select("text_translated")
      .eq("story_id", story.id)
      .eq("part_number", part.part_number - 1)
      .single();
    if (prev?.text_translated) previousPartContext = prev.text_translated;
  }

  // 4) Resolve provider/model. Explicit override > story default > global.
  let providerId: ProviderId;
  if (options.providerName) {
    providerId = options.providerName;
  } else if (isKnownProviderId(story.ai_provider)) {
    providerId = story.ai_provider;
  } else {
    const { data: cfg } = await admin
      .from("ai_config")
      .select("default_provider")
      .single();
    if (!isKnownProviderId(cfg?.default_provider)) {
      return {
        ok: false,
        error: "ai_config default_provider is invalid or missing.",
        durationMs: Date.now() - startedAt,
      };
    }
    providerId = cfg.default_provider;
  }

  const providerMeta = getProviderMeta(providerId);
  if (!providerMeta) {
    return {
      ok: false,
      error: `Unknown provider "${providerId}".`,
      provider: providerId,
      durationMs: Date.now() - startedAt,
    };
  }
  if (!isProviderConfigured(providerId)) {
    return {
      ok: false,
      error: `${providerMeta.name} is not configured — set ${providerMeta.envKey} in env.`,
      provider: providerId,
      durationMs: Date.now() - startedAt,
    };
  }

  const modelName = options.modelName ?? story.ai_model ?? providerMeta.defaultModel;

  // 5) Flip status to 'translating' so the UI shows a spinner.
  await admin
    .from("story_parts")
    .update({ status: "translating", error_message: null })
    .eq("id", storyPartId);

  // 6) Run translate() with attempt-level logging.
  let attemptCounter = 0;
  let lastAttemptStartedAt = Date.now();

  try {
    const result = await translate(
      providerId,
      {
        text: part.text_original,
        targetLanguage: story.target_language,
        targetLanguageNameEnglish: language.name_english,
        targetLanguageNameNative: language.name_native,
        toneFragment: tone.prompt_fragment,
        complexityFragment: complexity.fragment,
        customInstructions: story.custom_instructions ?? undefined,
        previousPartContext,
      },
      {
        modelName,
        retry: {
          signal: options.signal,
          onAttemptError: async ({ attempt, error, nextDelayMs }) => {
            const duration = Date.now() - lastAttemptStartedAt;
            await admin.from("translation_jobs").insert({
              story_part_id: storyPartId,
              attempt_number: attempt,
              status: "failed",
              provider: providerId,
              model: modelName,
              duration_ms: duration,
              error_message: error instanceof Error ? error.message : String(error),
            });
            attemptCounter = attempt;
            if (nextDelayMs !== null) lastAttemptStartedAt = Date.now() + nextDelayMs;
          },
        },
      },
    );

    // 7) Persist success: log job, insert version, update part.
    const successAttempt = attemptCounter + 1;
    const duration = Date.now() - lastAttemptStartedAt;

    await admin.from("translation_jobs").insert({
      story_part_id: storyPartId,
      attempt_number: successAttempt,
      status: "succeeded",
      provider: providerId,
      model: result.modelUsed,
      input_tokens: result.tokensUsed?.input ?? null,
      output_tokens: result.tokensUsed?.output ?? null,
      duration_ms: duration,
    });

    const { data: latest } = await admin
      .from("story_part_versions")
      .select("version_number")
      .eq("story_part_id", storyPartId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = (latest?.version_number ?? 0) + 1;

    await admin.from("story_part_versions").insert({
      story_part_id: storyPartId,
      version_number: nextVersion,
      translated_text: result.translatedText,
      provider_used: providerId,
      model_used: result.modelUsed,
      tone_id: story.tone_id,
      complexity: story.complexity,
      custom_instructions: story.custom_instructions,
      created_by: "ai",
    });

    await admin
      .from("story_parts")
      .update({
        text_translated: result.translatedText,
        status: "completed",
        error_message: null,
        last_provider_used: providerId,
        last_model_used: result.modelUsed,
        word_count_translated: wordCount(result.translatedText),
      })
      .eq("id", storyPartId);

    return { ok: true, output: result, durationMs: Date.now() - startedAt };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown translation error";
    const status = err instanceof ProviderError ? err.status : undefined;

    await admin
      .from("story_parts")
      .update({ status: "failed", error_message: errorMessage })
      .eq("id", storyPartId);

    return {
      ok: false,
      error: errorMessage,
      status,
      provider: providerId,
      model: modelName,
      durationMs: Date.now() - startedAt,
    };
  }
}
