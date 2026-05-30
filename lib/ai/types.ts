import type { ProviderId } from "./registry";

/**
 * The contract every provider implementation honours. Adding a new
 * provider = one file in lib/ai/providers/ implementing this, plus one
 * `case` in lib/ai/registry.ts. No other code changes.
 */
export interface TranslationProvider {
  readonly id: ProviderId;
  readonly name: string;
  /**
   * The list of model IDs this provider supports. Driven from the static
   * metadata in registry.ts so the AI config UI sees the same list.
   */
  readonly models: ReadonlyArray<string>;
  /**
   * Perform one translation. If `modelName` is omitted, the provider uses
   * its `defaultModel`. Throws ProviderError on failure — wrap with
   * withRetry() (lib/ai/retry.ts) if you want the standard backoff.
   */
  translate(input: TranslationInput, modelName?: string): Promise<TranslationOutput>;
}

export interface GlossaryEntry {
  original: string;
  translated: string;
}

export interface TranslationInput {
  /** The source text. Paragraph breaks (\n\n) are preserved by the prompt. */
  text: string;
  /** Optional — Gemini and most others auto-detect. */
  sourceLanguage?: string;

  /**
   * What the model is being asked to do with `text`:
   *   - "translate" (default) — translate into the target language.
   *   - "narrate" — rewrite the (already target-language) text into an
   *     expressive narration script for text-to-speech. No translation.
   * See lib/ai/prompt-builder.ts for how this switches the prompt.
   */
  task?: "translate" | "narrate";

  /** Target language ISO code, e.g. 'hi'. */
  targetLanguage: string;
  /** "Hindi" — used in the system prompt for clarity. */
  targetLanguageNameEnglish: string;
  /** "हिन्दी" — used in the system prompt so the model sees the script. */
  targetLanguageNameNative: string;

  /** The literary brief from `tones.prompt_fragment`. */
  toneFragment: string;
  /** The complexity guidance from lib/ai/complexity.ts. */
  complexityFragment: string;

  /** Optional admin-supplied extra instructions for this story/part. */
  customInstructions?: string;

  /**
   * Translated text of the previous part, used to keep character names,
   * place names, and tone consistent. Truncated to the last 1500 chars by
   * the prompt builder.
   */
  previousPartContext?: string;

  /** Optional explicit term mappings. Manual entry only in Phase 1. */
  glossary?: ReadonlyArray<GlossaryEntry>;
}

export interface TranslationOutput {
  translatedText: string;
  /** Some providers omit usage. Undefined when the SDK doesn't surface it. */
  tokensUsed?: { input: number; output: number };
  /** The model that was actually invoked (after defaulting). */
  modelUsed: string;
  /** Provider id — convenient for logging/translation_jobs. */
  provider: ProviderId;
  /** Optional — Gemini can return the detected source language. */
  detectedSourceLanguage?: string;
}

/**
 * Translation-time failure. `isRetryable=true` for transient classes
 * (HTTP 408/429/500/502/503/504, network resets); `false` for permanent
 * ones (bad key, bad input, model not found).
 */
export class ProviderError extends Error {
  readonly isRetryable: boolean;
  readonly providerId: ProviderId | "unknown";
  readonly status?: number;

  constructor(opts: {
    message: string;
    providerId: ProviderId | "unknown";
    isRetryable: boolean;
    status?: number;
    cause?: unknown;
  }) {
    super(opts.message, opts.cause ? { cause: opts.cause } : undefined);
    this.name = "ProviderError";
    this.providerId = opts.providerId;
    this.isRetryable = opts.isRetryable;
    this.status = opts.status;
  }
}

/**
 * Heuristic classifier for HTTP status codes. Used by every provider so
 * the retry behaviour stays consistent.
 */
export function isRetryableStatus(status: number | undefined): boolean {
  if (status === undefined) return true; // network errors are retryable
  if (status === 408 || status === 429) return true;
  if (status >= 500 && status < 600) return true;
  return false;
}
