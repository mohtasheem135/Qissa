/**
 * Approximate USD pricing per **1 million tokens** for the AI models we use.
 *
 * Used by the admin analytics page ([app/admin/(protected)/analytics/page.tsx])
 * to render *estimated* cost from the `translation_jobs.input_tokens` and
 * `output_tokens` columns logged in [lib/translation/run-part.ts].
 *
 * These are public list prices at the time of writing and will drift — when
 * a provider changes pricing, edit this file. Unlisted models fall back to
 * `FALLBACK_PRICE` so the dashboard still renders something sensible (a 0).
 *
 * Key shape: `"<provider>:<model>"` (exact match against translation_jobs.provider
 * + translation_jobs.model). Both fields are normalised lowercase before lookup.
 */
export interface ModelPrice {
  /** USD per 1M input tokens. */
  in: number;
  /** USD per 1M output tokens. */
  out: number;
}

export const FALLBACK_PRICE: ModelPrice = { in: 0, out: 0 };

const PRICES: Record<string, ModelPrice> = {
  // Gemini — https://ai.google.dev/gemini-api/docs/pricing
  "gemini:gemini-2.5-flash": { in: 0.3, out: 2.5 },
  "gemini:gemini-2.0-flash": { in: 0.1, out: 0.4 },
  "gemini:gemini-2.0-flash-lite": { in: 0.075, out: 0.3 },
  "gemini:gemini-1.5-pro": { in: 1.25, out: 5.0 },
  "gemini:gemini-1.5-flash": { in: 0.075, out: 0.3 },

  // Groq — https://groq.com/pricing
  "groq:llama-3.3-70b-versatile": { in: 0.59, out: 0.79 },
  "groq:llama-3.1-8b-instant": { in: 0.05, out: 0.08 },
  "groq:mixtral-8x7b-32768": { in: 0.24, out: 0.24 },

  // OpenAI — https://openai.com/api/pricing
  "openai:gpt-4o-mini": { in: 0.15, out: 0.6 },
  "openai:gpt-4o": { in: 2.5, out: 10.0 },

  // Anthropic — https://www.anthropic.com/pricing
  "anthropic:claude-sonnet-4-5": { in: 3.0, out: 15.0 },
  "anthropic:claude-haiku-4-5": { in: 1.0, out: 5.0 },

  // OpenRouter routes through whatever model it picks; ":free" tier costs 0,
  // paid passes through underlying provider prices. We default the bare router
  // to 0 and admins can split out specific OpenRouter models below if needed.
  "openrouter:openrouter/free": { in: 0, out: 0 },
  "openrouter:openai/gpt-4o-mini": { in: 0.15, out: 0.6 },
  "openrouter:anthropic/claude-sonnet-4-5": { in: 3.0, out: 15.0 },
};

/**
 * Looks up a per-1M-token price for a given (provider, model) pair logged
 * in `translation_jobs`. Returns `FALLBACK_PRICE` (zeros) if unknown — the
 * caller can treat that as "uncosted" rather than crashing.
 */
export function getModelPrice(provider: string | null, model: string | null): ModelPrice {
  if (!provider || !model) return FALLBACK_PRICE;
  const key = `${provider.toLowerCase()}:${model.toLowerCase()}`;
  return PRICES[key] ?? FALLBACK_PRICE;
}

/**
 * Cost of one logged attempt in USD.
 *
 *   cost = (input_tokens / 1e6) * price.in + (output_tokens / 1e6) * price.out
 *
 * `null` tokens are treated as 0. Failed attempts that still report token
 * usage (some providers bill for the prompt even on errors) are included —
 * the caller can filter by `status` if it wants only successful spend.
 */
export function estimateJobCost(
  provider: string | null,
  model: string | null,
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined,
): number {
  const price = getModelPrice(provider, model);
  const inCost = ((inputTokens ?? 0) / 1_000_000) * price.in;
  const outCost = ((outputTokens ?? 0) / 1_000_000) * price.out;
  return inCost + outCost;
}

/**
 * Approximate USD pricing per **1 million characters** for TTS models. TTS
 * bills by characters synthesized (logged in `tts_jobs.characters`), not tokens.
 *
 * ⚠️ These are ROUGH PLACEHOLDER ESTIMATES — TTS pricing varies a lot by plan
 * and changes often. Edit these to your actual contracted rates so the audio
 * analytics cost column is meaningful. Key shape: `"<provider>:<model>"`,
 * lowercased (note Sarvam models contain a colon → e.g. "sarvam:bulbul:v3").
 * Unlisted pairs fall back to 0 (uncosted).
 */
const TTS_PRICES_PER_MILLION_CHARS: Record<string, number> = {
  "sarvam:bulbul:v3": 60,
  "sarvam:bulbul:v2": 60,
  "elevenlabs:eleven_multilingual_v2": 180,
  "elevenlabs:eleven_turbo_v2_5": 100,
  "elevenlabs:eleven_flash_v2_5": 100,
};

/** USD per 1M characters for a (provider, model) TTS pair; 0 if unknown. */
export function getTtsCharPrice(provider: string | null, model: string | null): number {
  if (!provider || !model) return 0;
  const key = `${provider.toLowerCase()}:${model.toLowerCase()}`;
  return TTS_PRICES_PER_MILLION_CHARS[key] ?? 0;
}

/** Estimated USD cost of synthesizing `characters` with a (provider, model). */
export function estimateTtsCost(
  provider: string | null,
  model: string | null,
  characters: number | null | undefined,
): number {
  return ((characters ?? 0) / 1_000_000) * getTtsCharPrice(provider, model);
}

/** Formatter for the dashboard — fixed 4dp under a cent, 2dp otherwise. */
export function formatUsd(amount: number): string {
  if (amount === 0) return "$0";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
}
