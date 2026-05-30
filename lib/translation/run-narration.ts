import { createAdminClient } from "@/lib/supabase/admin";
import { narrate } from "@/lib/ai/translate";
import { getProviderMeta, isProviderConfigured, type ProviderId } from "@/lib/ai/registry";
import { getComplexityMeta } from "@/lib/ai/complexity";

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

export interface RunNarrationOptions {
  /** Override the provider the variant / global config would default to. */
  providerName?: ProviderId;
  /** Override the model. */
  modelName?: string;
  /** Cancel mid-flight. */
  signal?: AbortSignal;
}

export type RunNarrationResult =
  | { ok: true; emotionText: string; durationMs: number }
  | { ok: false; error: string; durationMs: number };

/**
 * Generate the expressive narration script (`emotion_text`) for one translation
 * row. Mirrors lib/translation/run-part.ts (runStoryPartTranslation) but:
 *   - reads the already-translated `text` (not the source),
 *   - calls the AI adapter with `task:"narrate"` (same prompt-builder, providers,
 *     retry — see lib/ai/prompt-builder.ts),
 *   - writes `emotion_text` + `emotion_status` ('generating' → 'ready'/'failed').
 *
 * NEVER throws — failures are recorded (emotion_status='failed') and returned as
 * `{ ok:false }`, so the TTS pipeline can fall back to the plain reading text.
 */
export async function runStoryPartNarration(
  storyPartTranslationId: string,
  options: RunNarrationOptions = {},
): Promise<RunNarrationResult> {
  const admin = createAdminClient();
  const startedAt = Date.now();

  // 1) Load translation row (needs `text`) + parent variant.
  const { data: translation, error: trErr } = await admin
    .from("story_part_translations")
    .select(
      `id, text,
       variant:story_variants!inner (
         id, target_language, tone_id, complexity,
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
  const variant = translation.variant;
  if (!variant) {
    return { ok: false, error: "Parent variant missing.", durationMs: Date.now() - startedAt };
  }
  if (!translation.text || translation.text.trim().length === 0) {
    return {
      ok: false,
      error: "Translation has no text to narrate.",
      durationMs: Date.now() - startedAt,
    };
  }

  // 2) Tone + language (parallel) — same loads as runStoryPartTranslation.
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

  // 3) Resolve provider/model. Explicit override > variant default > global.
  let providerId: ProviderId;
  if (options.providerName) {
    providerId = options.providerName;
  } else if (isKnownProviderId(variant.ai_provider)) {
    providerId = variant.ai_provider;
  } else {
    const { data: cfg } = await admin.from("ai_config").select("default_provider").single();
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
    return { ok: false, error: `Unknown provider "${providerId}".`, durationMs: Date.now() - startedAt };
  }
  if (!isProviderConfigured(providerId)) {
    return {
      ok: false,
      error: `${providerMeta.name} is not configured — set ${providerMeta.envKey} in env.`,
      durationMs: Date.now() - startedAt,
    };
  }

  const modelName = options.modelName ?? variant.ai_model ?? providerMeta.defaultModel;

  // 4) Mark generating so the admin UI shows a spinner.
  await admin
    .from("story_part_translations")
    .update({ emotion_status: "generating" })
    .eq("id", storyPartTranslationId);

  // 5) Run narrate() (translate() with task:"narrate") and persist.
  try {
    const result = await narrate(
      providerId,
      {
        text: translation.text,
        targetLanguage: variant.target_language,
        targetLanguageNameEnglish: language.name_english,
        targetLanguageNameNative: language.name_native,
        toneFragment: tone.prompt_fragment,
        complexityFragment: complexity?.fragment ?? "",
        customInstructions: variant.custom_instructions ?? undefined,
      },
      { modelName, retry: { signal: options.signal } },
    );

    const emotionText = result.translatedText.trim();
    if (emotionText.length === 0) throw new Error("Narration returned empty text.");

    await admin
      .from("story_part_translations")
      .update({ emotion_text: emotionText, emotion_status: "ready" })
      .eq("id", storyPartTranslationId);

    return { ok: true, emotionText, durationMs: Date.now() - startedAt };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown narration error";
    await admin
      .from("story_part_translations")
      .update({ emotion_status: "failed" })
      .eq("id", storyPartTranslationId);
    return { ok: false, error: errorMessage, durationMs: Date.now() - startedAt };
  }
}
