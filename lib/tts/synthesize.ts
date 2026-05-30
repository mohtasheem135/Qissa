import { withRetry, type RetryOptions } from "@/lib/ai/retry";
import { getTtsProvider, type TtsProviderId } from "./registry";
import type { TtsInput, TtsOutput } from "./types";

/**
 * High-level synthesize: pick the requested TTS provider, run with retry,
 * surface a typed TtsOutput. Mirrors lib/ai/translate.ts and reuses the same
 * generic withRetry backoff (lib/ai/retry.ts).
 *
 * Callers that need per-attempt logging into tts_jobs pass `onAttemptError`
 * via the retry options.
 */
export async function synthesize(
  providerId: TtsProviderId,
  input: TtsInput,
  options: {
    voiceId?: string;
    model?: string;
    retry?: RetryOptions;
  } = {},
): Promise<TtsOutput> {
  const provider = await getTtsProvider(providerId);
  return withRetry(
    () => provider.synthesize(input, options.voiceId, options.model),
    options.retry,
  );
}
