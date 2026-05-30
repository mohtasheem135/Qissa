import { createAdminClient } from "@/lib/supabase/admin";
import { ProviderError } from "@/lib/ai/types";
import { runStoryPartNarration } from "@/lib/translation/run-narration";
import { uploadAudio } from "@/lib/r2/upload";
import { synthesize } from "./synthesize";
import {
  getTtsProviderMeta,
  isTtsProviderConfigured,
  resolveTtsModel,
  resolveTtsVoice,
  TTS_PROVIDERS,
  type TtsProviderId,
} from "./registry";
import type { TtsOutput } from "./types";

function isKnownTtsProviderId(value: string | null | undefined): value is TtsProviderId {
  return !!value && TTS_PROVIDERS.some((p) => p.id === value);
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("ogg")) return "ogg";
  return "mp3"; // audio/mpeg and unknown default
}

export interface RunPartAudioOptions {
  /** Override the provider the variant / global config would default to. */
  providerId?: TtsProviderId;
  /** Override the voice. */
  voiceId?: string;
  /** Override the model/engine (e.g. bulbul:v3). */
  model?: string;
  /** Cancel mid-flight (the queue endpoint passes the request's AbortSignal). */
  signal?: AbortSignal;
}

export type RunPartAudioResult =
  | {
      ok: true;
      audioPath: string;
      audioUrlPath: string;
      provider: TtsProviderId;
      voiceId: string;
      model: string;
      characters: number;
      durationSeconds: number | null;
      durationMs: number;
    }
  | {
      ok: false;
      error: string;
      status?: number;
      provider?: TtsProviderId;
      voiceId?: string;
      durationMs: number;
    };

/**
 * Generate audio for one translation row end-to-end. Mirrors
 * lib/translation/run-part.ts (runStoryPartTranslation):
 *
 *   load row + variant → resolve provider/voice → mark generating →
 *   synthesize() with withRetry (logging attempts to tts_jobs) → upload to R2 →
 *   update story_part_audio (completed) + log success. Failures are caught and
 *   recorded (status 'failed' + error_message); the function never throws.
 *
 * Shared between /api/tts (single) and /api/tts/queue (SSE queue).
 */
export async function runStoryPartAudio(
  storyPartTranslationId: string,
  options: RunPartAudioOptions = {},
): Promise<RunPartAudioResult> {
  const admin = createAdminClient();
  const startedAt = Date.now();

  // 1) Load translation row (needs text) + part (part_number) + variant.
  const { data: translation, error: trErr } = await admin
    .from("story_part_translations")
    .select(
      `id, variant_id, story_part_id, text, emotion_text, emotion_status, status,
       part:story_parts!inner ( id, part_number ),
       variant:story_variants!inner ( id, target_language, tts_provider, tts_model, tts_voice_id )`,
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
    return { ok: false, error: "Parent part or variant missing.", durationMs: Date.now() - startedAt };
  }
  if (!translation.text || !["completed", "edited"].includes(translation.status)) {
    return {
      ok: false,
      error: "Translation has no completed text to narrate.",
      durationMs: Date.now() - startedAt,
    };
  }

  // 2) Load the global config once — used as the final fallback for provider,
  // model, and voice below.
  const { data: cfg } = await admin
    .from("tts_config")
    .select("default_tts_provider, default_tts_model, default_voice_id")
    .single();

  // Resolve provider. Explicit override > variant default > global config.
  let providerId: TtsProviderId;
  if (options.providerId) {
    providerId = options.providerId;
  } else if (isKnownTtsProviderId(variant.tts_provider)) {
    providerId = variant.tts_provider;
  } else if (isKnownTtsProviderId(cfg?.default_tts_provider)) {
    providerId = cfg.default_tts_provider;
  } else {
    return {
      ok: false,
      error: "tts_config default_tts_provider is invalid or missing.",
      durationMs: Date.now() - startedAt,
    };
  }

  const providerMeta = getTtsProviderMeta(providerId);
  if (!providerMeta) {
    return { ok: false, error: `Unknown provider "${providerId}".`, provider: providerId, durationMs: Date.now() - startedAt };
  }
  if (!isTtsProviderConfigured(providerId)) {
    return {
      ok: false,
      error: `${providerMeta.name} is not configured — set ${providerMeta.envKey} in env.`,
      provider: providerId,
      durationMs: Date.now() - startedAt,
    };
  }

  // 3) Resolve model (explicit > variant > global > provider default), then the
  // voice SCOPED to that model. Sarvam v2/v3 have different speaker sets, so a
  // stale/foreign voice id falls back to the model's default voice.
  const model = resolveTtsModel(
    providerId,
    options.model ?? variant.tts_model ?? cfg?.default_tts_model,
  );
  const voiceId = resolveTtsVoice(
    providerId,
    model,
    options.voiceId ?? variant.tts_voice_id ?? cfg?.default_voice_id,
  );

  // 4) Upsert the audio row → 'generating' (one row per translation, unique).
  const { data: audioRow, error: upErr } = await admin
    .from("story_part_audio")
    .upsert(
      {
        story_part_translation_id: storyPartTranslationId,
        variant_id: variant.id,
        story_part_id: part.id,
        tts_provider: providerId,
        tts_model: model,
        voice_id: voiceId,
        status: "generating",
        error_message: null,
      },
      { onConflict: "story_part_translation_id" },
    )
    .select("id")
    .single();
  if (upErr || !audioRow) {
    return {
      ok: false,
      error: `Could not create audio row: ${upErr?.message ?? "unknown"}`,
      provider: providerId,
      voiceId,
      durationMs: Date.now() - startedAt,
    };
  }
  const audioId = audioRow.id;

  // 4b) Resolve the narration script. The reader always shows `text`, but the
  // TTS engine narrates the expressive `emotion_text` (added pauses/punctuation)
  // when available. Generate it lazily on first audio if missing; never block
  // audio — if narration fails or is empty, fall back to the plain text.
  let narrationText = translation.emotion_text?.trim() || "";
  if (!narrationText) {
    const narration = await runStoryPartNarration(storyPartTranslationId, { signal: options.signal });
    if (narration.ok) narrationText = narration.emotionText;
  }
  const textToSynthesize = narrationText || translation.text;

  // 5) Synthesize with attempt-level logging into tts_jobs.
  let attemptCounter = 0;
  let lastAttemptStartedAt = Date.now();
  try {
    const result: TtsOutput = await synthesize(
      providerId,
      { text: textToSynthesize, languageCode: variant.target_language, voiceId },
      {
        voiceId,
        model,
        retry: {
          signal: options.signal,
          onAttemptError: async ({ attempt, error, nextDelayMs }) => {
            const duration = Date.now() - lastAttemptStartedAt;
            await admin.from("tts_jobs").insert({
              story_part_audio_id: audioId,
              story_part_translation_id: storyPartTranslationId,
              variant_id: variant.id,
              attempt_number: attempt,
              status: "failed",
              tts_provider: providerId,
              tts_model: model,
              voice_id: voiceId,
              duration_ms: duration,
              error_message: error instanceof Error ? error.message : String(error),
            });
            attemptCounter = attempt;
            if (nextDelayMs !== null) lastAttemptStartedAt = Date.now() + nextDelayMs;
          },
        },
      },
    );

    // 6) Upload to R2.
    const ext = extensionForMime(result.mimeType);
    const key = `audio/${variant.id}/${part.part_number}-${voiceId}.${ext}`;
    const upload = await uploadAudio({
      buffer: result.audio,
      key,
      contentType: result.mimeType,
    });

    // 7) Persist success: update audio row + log success job.
    const successAttempt = attemptCounter + 1;
    const duration = Date.now() - lastAttemptStartedAt;
    const durationSeconds = result.durationSeconds ?? null;

    await admin
      .from("story_part_audio")
      .update({
        status: "completed",
        audio_path: upload.path,
        mime_type: result.mimeType,
        duration_seconds: durationSeconds,
        byte_size: upload.byteSize,
        characters: result.characters,
        tts_provider: providerId,
        tts_model: result.modelUsed,
        voice_id: result.voiceUsed,
        error_message: null,
      })
      .eq("id", audioId);

    await admin.from("tts_jobs").insert({
      story_part_audio_id: audioId,
      story_part_translation_id: storyPartTranslationId,
      variant_id: variant.id,
      attempt_number: successAttempt,
      status: "succeeded",
      tts_provider: providerId,
      tts_model: result.modelUsed,
      voice_id: result.voiceUsed,
      characters: result.characters,
      duration_ms: duration,
    });

    return {
      ok: true,
      audioPath: upload.path,
      audioUrlPath: upload.path,
      provider: providerId,
      voiceId: result.voiceUsed,
      model: result.modelUsed,
      characters: result.characters,
      durationSeconds,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown audio error";
    const status = err instanceof ProviderError ? err.status : undefined;

    await admin
      .from("story_part_audio")
      .update({ status: "failed", error_message: errorMessage })
      .eq("id", audioId);

    return {
      ok: false,
      error: errorMessage,
      status,
      provider: providerId,
      voiceId,
      durationMs: Date.now() - startedAt,
    };
  }
}
