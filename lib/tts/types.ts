import type { TtsProviderId } from "./registry";

/**
 * The contract every TTS provider implementation honours. Adding a new
 * provider = one file in lib/tts/providers/ implementing this, plus one entry
 * in TTS_PROVIDERS + one `case` in lib/tts/registry.ts. No other code changes.
 *
 * Mirrors lib/ai/types.ts's TranslationProvider. We deliberately REUSE
 * ProviderError + withRetry from lib/ai (both generic over the failure shape)
 * rather than duplicating the retry machinery — see lib/tts/synthesize.ts.
 */
export interface TtsProvider {
  readonly id: TtsProviderId;
  readonly name: string;
  /**
   * Synthesize speech for `input.text` in the requested voice + model. If
   * `voiceId`/`model` are omitted, the provider falls back to its defaults.
   * Throws ProviderError on failure — wrap with withRetry() for standard backoff.
   */
  synthesize(input: TtsInput, voiceId?: string, model?: string): Promise<TtsOutput>;
}

export interface TtsInput {
  /** The text to narrate. Paragraph breaks are preserved by the provider. */
  text: string;
  /**
   * App-internal language code, e.g. 'hi', 'ur', 'ta'. Each provider maps this
   * onto its own language identifier (Sarvam wants BCP-47 like 'hi-IN').
   */
  languageCode: string;
  /** Optional explicit voice; otherwise the provider's default. */
  voiceId?: string;
}

export interface TtsOutput {
  /** Raw audio bytes (typically MP3). */
  audio: Uint8Array;
  /** e.g. "audio/mpeg". */
  mimeType: string;
  /** Duration if the provider surfaces it; otherwise undefined. */
  durationSeconds?: number;
  /** Characters billed — TTS bills by characters; logged into tts_jobs. */
  characters: number;
  /** The voice id actually used (after defaulting). */
  voiceUsed: string;
  /** The model id actually used (after defaulting) — logged into tts_jobs. */
  modelUsed: string;
  /** Provider id — convenient for logging. */
  provider: TtsProviderId;
}
