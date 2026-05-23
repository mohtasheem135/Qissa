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
