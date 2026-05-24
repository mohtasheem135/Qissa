# Internals — AI Provider Adapter

> One interface, five implementations, hot-pluggable.

Code lives entirely under [lib/ai/](../../lib/ai/). The goal: **adding a new provider is exactly one file + one switch case**.

---

## Files

```
lib/ai/
  types.ts           TranslationProvider interface + Input/Output + ProviderError
  registry.ts        PROVIDERS metadata + lazy getProvider() factory
  prompt-builder.ts  buildTranslationPrompt(input) -> { system, user }
  retry.ts           withRetry() — 1s/3s/9s backoff, signal-aware
  translate.ts       high-level wrapper combining getProvider + withRetry
  complexity.ts      the 5 fixed complexity-level fragments
  providers/
    gemini.ts        @google/genai
    groq.ts          groq-sdk (OpenAI-compatible)
    openrouter.ts    bare fetch (OpenAI-compatible REST)
    openai.ts        openai
    anthropic.ts     @anthropic-ai/sdk
```

---

## The interface

```ts
// lib/ai/types.ts
interface TranslationProvider {
  readonly id: ProviderId;       // "gemini" | "groq" | "openrouter" | "openai" | "anthropic"
  readonly name: string;         // "Google Gemini"
  readonly models: readonly string[];
  translate(input: TranslationInput, modelName?: string): Promise<TranslationOutput>;
}
```

`TranslationInput` carries:

- `text` (the part body, paragraph breaks preserved)
- `targetLanguage` + `targetLanguageNameEnglish` + `targetLanguageNameNative`
- `toneFragment` (from `tones.prompt_fragment`)
- `complexityFragment` (from [lib/ai/complexity.ts](../../lib/ai/complexity.ts))
- `customInstructions?` (per-story extra guidance)
- `previousPartContext?` (last 1500 chars of the previous part's translation)
- `glossary?` (manual list of `{ original, translated }` — Phase 1.5)

`TranslationOutput`:

- `translatedText`
- `tokensUsed?: { input, output }`
- `modelUsed: string` (after defaulting)
- `provider: ProviderId`

`ProviderError` carries `isRetryable: boolean` + optional `status: number`. [isRetryableStatus()](../../lib/ai/types.ts) is the heuristic — 408, 429, 5xx, network errors retry; everything else aborts.

---

## Prompt assembly — [lib/ai/prompt-builder.ts](../../lib/ai/prompt-builder.ts)

`buildTranslationPrompt(input)` returns `{ system, user }`. The system prompt is the literary brief; the user message is the source text verbatim.

Sections appended in order:

1. Role + target language
2. STYLE INSTRUCTIONS (the tone's `prompt_fragment`)
3. COMPLEXITY fragment
4. ADDITIONAL INSTRUCTIONS (custom_instructions, if present)
5. PREVIOUS PART CONTEXT (last 1500 chars + "maintain consistency")
6. GLOSSARY (if any)
7. OUTPUT RULES — paragraph preservation, no commentary, no original text

OUTPUT RULES go LAST so the model sees the formatting constraints right before the user text. This is intentional — order matters for instruction-tuned models.

---

## Retry policy — [lib/ai/retry.ts](../../lib/ai/retry.ts)

`withRetry(fn, opts)`:

- Default delays: `[1000, 3000, 9000]` ms → up to 4 total attempts
- Only retries on `ProviderError.isRetryable === true` OR on plain network errors (`ECONNRESET`, `ETIMEDOUT`, `EAI_AGAIN`, generic `fetch failed`)
- Non-retryable errors (bad key, 400) abort immediately
- `signal: AbortSignal` cancels both the sleep and the next attempt → `AbortError` propagates

The `onAttemptError` callback fires on every failed attempt — used by [lib/translation/run-part.ts](../../lib/translation/run-part.ts) to write a row to `translation_jobs` per attempt.

---

## Registry + lazy factory — [lib/ai/registry.ts](../../lib/ai/registry.ts)

`PROVIDERS` is a `ReadonlyArray<ProviderMeta>` — the static metadata (id, name, defaultModel, models, envKey, freeTier). The admin UI uses this list directly.

```ts
export async function getProvider(id: ProviderId): Promise<TranslationProvider>;
```

Returns the singleton instance, constructing on first use. Construction reads the API key from env and throws `ProviderError` if missing.

`buildProvider(id)` dynamically imports the provider file. So **a missing SDK in one provider doesn't break the others at module-load time** — only when you actually request that provider.

```ts
switch (id) {
  case "gemini":     return new (await import("./providers/gemini")).GeminiProvider();
  case "groq":       return new (await import("./providers/groq")).GroqProvider();
  case "openrouter": return new (await import("./providers/openrouter")).OpenRouterProvider();
  case "openai":     return new (await import("./providers/openai")).OpenAIProvider();
  case "anthropic":  return new (await import("./providers/anthropic")).AnthropicProvider();
  default:           const _x: never = id; throw new Error(`Unhandled: ${_x}`);
}
```

The `_exhaustive: never = id` makes TS bark if you add a new `ProviderId` and forget the case.

---

## High-level translate — [lib/ai/translate.ts](../../lib/ai/translate.ts)

```ts
export async function translate(
  providerId: ProviderId,
  input: TranslationInput,
  options: { modelName?: string; retry?: RetryOptions } = {},
): Promise<TranslationOutput>;
```

Composes `getProvider + withRetry`. This is what [lib/translation/run-part.ts](../../lib/translation/run-part.ts) calls.

---

## The five providers

All implement the same three things: constructor that reads env + caches the SDK client, `translate()` that builds the prompt + calls the SDK + parses the response + maps errors to `ProviderError`.

| Provider | SDK | Models constant | Notes |
|---|---|---|---|
| [gemini.ts](../../lib/ai/providers/gemini.ts) | `@google/genai 2.6` | `gemini-2.5-flash`, `gemini-2.0-flash`, etc. | Single-prompt API with `systemInstruction` config; `response.text` getter; usage in `response.usageMetadata` |
| [groq.ts](../../lib/ai/providers/groq.ts) | `groq-sdk 1.2` | `llama-3.3-70b-versatile`, etc. | OpenAI-style chat completions |
| [openrouter.ts](../../lib/ai/providers/openrouter.ts) | bare `fetch` | `openrouter/free`, various | OpenAI-compatible REST; sets `HTTP-Referer` (= `NEXT_PUBLIC_APP_URL`) + `X-Title: Qissa` per their docs |
| [openai.ts](../../lib/ai/providers/openai.ts) | `openai 6.39` | `gpt-4o-mini`, `gpt-4o` | Chat completions |
| [anthropic.ts](../../lib/ai/providers/anthropic.ts) | `@anthropic-ai/sdk 0.98` | `claude-sonnet-4-5`, `claude-haiku-4-5` | Messages API; filters `content` to text-only blocks |

All use `temperature: 0.7` — translation is creative work but not free-form generation.

---

## Adding a new provider

Three steps. **No** changes elsewhere in the codebase needed.

1. Add an entry to `PROVIDERS` in [lib/ai/registry.ts](../../lib/ai/registry.ts):
   ```ts
   {
     id: "newprovider",
     name: "NewProvider",
     defaultModel: "their-default-model",
     models: ["their-default-model", "their-other-model"],
     envKey: "NEWPROVIDER_API_KEY",
     freeTier: "describe their free tier",
   }
   ```

2. Extend the `ProviderId` union at the top of the same file:
   ```ts
   export type ProviderId = "gemini" | "groq" | "openrouter" | "openai" | "anthropic" | "newprovider";
   ```
   TS will now bark at every `case` switch that's missing this id.

3. Create [lib/ai/providers/newprovider.ts](../../lib/ai/providers/) implementing `TranslationProvider` (copy [groq.ts](../../lib/ai/providers/groq.ts) for an OpenAI-compatible API, [anthropic.ts](../../lib/ai/providers/anthropic.ts) for a messages-style one).

4. Add the `case "newprovider"` to `buildProvider()` switch.

5. Add the env var to `.env.example` and `.env.local`. The provider auto-appears in the admin's AI config dropdown when `isProviderConfigured()` returns true.

---

## Where the DB persistence happens

The provider itself does **zero** persistence. All DB writes happen in [lib/translation/run-part.ts](../../lib/translation/run-part.ts):

| Event | Write |
|---|---|
| Translation starts | `story_parts.status = 'translating'` |
| Per attempt fails | `INSERT INTO translation_jobs (status='failed', ...)` |
| Final success | `INSERT INTO translation_jobs (status='succeeded', tokens, duration)` + `INSERT INTO story_part_versions (auto-version)` + `UPDATE story_parts (text, status='completed', provider/model snapshot, word_count)` |
| Final failure | `UPDATE story_parts (status='failed', error_message)` |

See [04-database.md](../04-database.md) §4.7–4.9 for the table schemas.

---

## Live smoke test

[scripts/smoke-translate.ts](../../scripts/smoke-translate.ts) iterates every **configured** provider and runs the same Premchand-style Hindi prompt. Prints translation + tokens + latency per provider, exits non-zero if any failed.

```bash
npx tsx --env-file=.env.local scripts/smoke-translate.ts
```

Re-run after switching API keys or changing a provider's `models` list.
