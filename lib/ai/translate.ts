import { getProvider, type ProviderId } from "./registry";
import { withRetry, type RetryOptions } from "./retry";
import type { TranslationInput, TranslationOutput } from "./types";

/**
 * High-level translate: pick the requested provider, run with retry,
 * surface a typed TranslationOutput. Used by both /api/ai/test and the
 * per-part translation queue (Phase 7).
 *
 * Callers that need per-attempt logging into translation_jobs should pass
 * `onAttemptError` via the retry options.
 */
export async function translate(
  providerId: ProviderId,
  input: TranslationInput,
  options: {
    modelName?: string;
    retry?: RetryOptions;
  } = {},
): Promise<TranslationOutput> {
  const provider = await getProvider(providerId);
  return withRetry(() => provider.translate(input, options.modelName), options.retry);
}

/**
 * Narrate: same machinery as translate(), but tags the input as `task:"narrate"`
 * so the prompt builder returns the narration-director prompt instead of the
 * translation prompt. Reuses getProvider + withRetry + every provider's
 * translate() with zero provider changes. See lib/translation/run-narration.ts.
 */
export async function narrate(
  providerId: ProviderId,
  input: TranslationInput,
  options: {
    modelName?: string;
    retry?: RetryOptions;
  } = {},
): Promise<TranslationOutput> {
  return translate(providerId, { ...input, task: "narrate" }, options);
}
