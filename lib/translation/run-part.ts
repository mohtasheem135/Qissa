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
  /** Override the provider that the variant / global config would default to. */
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
 * Translate one (variant, story_part) pair end-to-end.
 *
 * Reads the story_part_translations row + its parent variant + the shared
 * story_part for the original text. Marks the translation as `translating`,
 * runs the provider via withRetry (logging each attempt into translation_jobs),
 * writes the new version row, then updates the translation row with the
 * translated text + new status.
 *
 * Shared between /api/translate (single translation) and /api/translate/queue
 * (sequential queue with SSE progress).
 */
export async function runStoryPartTranslation(
  storyPartTranslationId: string,
  options: RunPartOptions = {},
): Promise<RunPartResult> {
  const admin = createAdminClient();
  const startedAt = Date.now();

  // 1) Load translation row + parent variant + shared part (original text).
  const { data: translation, error: trErr } = await admin
    .from("story_part_translations")
    .select(
      `id, variant_id, story_part_id,
       part:story_parts!inner ( id, story_id, part_number, text_original ),
       variant:story_variants!inner (
         id, story_id, target_language, tone_id, complexity,
         custom_instructions, ai_provider, ai_model
       )`,
    )
    .eq("id", storyPartTranslationId)
    .single();

  if (trErr || !translation) {
    return {
      ok: false,
      error: `Translation row not found: ${trErr?.message ?? "unknown"}`,
      durationMs: Date.now() - startedAt,
    };
  }
  const part = translation.part;
  const variant = translation.variant;
  if (!part || !variant) {
    return {
      ok: false,
      error: "Parent part or variant missing.",
      durationMs: Date.now() - startedAt,
    };
  }

  // 2) Tone + language (parallel).
  const [{ data: tone, error: toneErr }, { data: language, error: langErr }] = await Promise.all([
    admin.from("tones").select("id, prompt_fragment").eq("id", variant.tone_id).single(),
    admin
      .from("languages")
      .select("name_english, name_native")
      .eq("code", variant.target_language)
      .single(),
  ]);
  if (toneErr || !tone) {
    return { ok: false, error: "Tone not found.", durationMs: Date.now() - startedAt };
  }
  if (langErr || !language) {
    return { ok: false, error: "Target language not found.", durationMs: Date.now() - startedAt };
  }

  const complexity = getComplexityMeta(variant.complexity);
  if (!complexity) {
    return {
      ok: false,
      error: `Unknown complexity "${variant.complexity}".`,
      durationMs: Date.now() - startedAt,
    };
  }

  // 3) Previous part's translated text (same variant) → coherence anchor.
  let previousPartContext: string | undefined;
  if (part.part_number > 1) {
    const { data: prev } = await admin
      .from("story_part_translations")
      .select("text, part:story_parts!inner(part_number, story_id)")
      .eq("variant_id", variant.id)
      .eq("part.story_id", part.story_id)
      .eq("part.part_number", part.part_number - 1)
      .maybeSingle();
    if (prev?.text) previousPartContext = prev.text;
  }

  // 4) Resolve provider/model. Explicit override > variant default > global.
  let providerId: ProviderId;
  if (options.providerName) {
    providerId = options.providerName;
  } else if (isKnownProviderId(variant.ai_provider)) {
    providerId = variant.ai_provider;
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

  const modelName = options.modelName ?? variant.ai_model ?? providerMeta.defaultModel;

  // 5) Flip status to 'translating' so the UI shows a spinner.
  await admin
    .from("story_part_translations")
    .update({ status: "translating", error_message: null })
    .eq("id", storyPartTranslationId);

  // 6) Run translate() with attempt-level logging.
  let attemptCounter = 0;
  let lastAttemptStartedAt = Date.now();

  try {
    const result = await translate(
      providerId,
      {
        text: part.text_original,
        targetLanguage: variant.target_language,
        targetLanguageNameEnglish: language.name_english,
        targetLanguageNameNative: language.name_native,
        toneFragment: tone.prompt_fragment,
        complexityFragment: complexity.fragment,
        customInstructions: variant.custom_instructions ?? undefined,
        previousPartContext,
      },
      {
        modelName,
        retry: {
          signal: options.signal,
          onAttemptError: async ({ attempt, error, nextDelayMs }) => {
            const duration = Date.now() - lastAttemptStartedAt;
            await admin.from("translation_jobs").insert({
              story_part_id: part.id,
              variant_id: variant.id,
              story_part_translation_id: storyPartTranslationId,
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

    // 7) Persist success: log job, insert version, update translation row.
    const successAttempt = attemptCounter + 1;
    const duration = Date.now() - lastAttemptStartedAt;

    await admin.from("translation_jobs").insert({
      story_part_id: part.id,
      variant_id: variant.id,
      story_part_translation_id: storyPartTranslationId,
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
      .eq("story_part_translation_id", storyPartTranslationId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = (latest?.version_number ?? 0) + 1;

    await admin.from("story_part_versions").insert({
      story_part_id: part.id,
      story_part_translation_id: storyPartTranslationId,
      variant_id: variant.id,
      version_number: nextVersion,
      translated_text: result.translatedText,
      provider_used: providerId,
      model_used: result.modelUsed,
      tone_id: variant.tone_id,
      complexity: variant.complexity,
      custom_instructions: variant.custom_instructions,
      created_by: "ai",
    });

    await admin
      .from("story_part_translations")
      .update({
        text: result.translatedText,
        status: "completed",
        error_message: null,
        ai_provider: providerId,
        ai_model: result.modelUsed,
        word_count: wordCount(result.translatedText),
        translated_at: new Date().toISOString(),
      })
      .eq("id", storyPartTranslationId);

    return { ok: true, output: result, durationMs: Date.now() - startedAt };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown translation error";
    const status = err instanceof ProviderError ? err.status : undefined;

    await admin
      .from("story_part_translations")
      .update({ status: "failed", error_message: errorMessage })
      .eq("id", storyPartTranslationId);

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
