# API — AI test

## POST `/api/ai/test`

**File:** [app/api/ai/test/route.ts](../../app/api/ai/test/route.ts)

A real round-trip to a configured AI provider, used by the AI config page's **Send test request** button. Doesn't just check connectivity — actually performs a literary translation, so a successful response demonstrates the full prompt → provider → response pipeline.

### Request

```jsonc
{
  "providerName": "gemini" | "groq" | "openrouter" | "openai" | "anthropic",
  "modelName": "gemini-2.5-flash"   // optional — falls back to provider's defaultModel
}
```

### What it actually sends

Server reads the **seeded Premchand (Hindi) tone** from the DB and the Hindi language metadata, then calls [translate()](../../lib/ai/translate.ts) with a fixed English test sentence:

> "She walked through the village at dusk, the air heavy with the smell of wet earth and woodsmoke. An old man called out a greeting from his doorway, and she answered without looking back."

Complexity = `standard`. Retry disabled (`delays: []`) for fast feedback — admins want either an answer or an error within seconds, not after 13s of backoff.

### Response (success — HTTP 200)

```jsonc
{
  "ok": true,
  "latencyMs": 902,
  "provider": "Groq",
  "modelUsed": "llama-3.3-70b-versatile",
  "tokensUsed": { "input": 243, "output": 94 },
  "tone": "Premchand",
  "targetLanguage": "Hindi (हिन्दी)",
  "translatedText": "वह शाम को गाँव से गुजर रही थी, हवा में भीगी मिट्टी और लकड़ी के धुएं की गंध भारी थी..."
}
```

### Response (failure)

```jsonc
{
  "ok": false,
  "latencyMs": 531,
  "provider": "Google Gemini",
  "status": 429,
  "retryable": true,
  "error": "Gemini 429: You exceeded your current quota..."
}
```

Status code: 400 for bad input / unconfigured provider / unknown provider; 500 for DB lookup failures; 502 for `ProviderError`.

### UI consumer

[AiConfigForm](../../components/admin/AiConfigForm.tsx) → `TestConnectionCard`. Renders the JSON response as a `<pre>`, with red background on `ok: false`. Shows latency next to the result — useful for benchmarking models side by side.

---

## Why this endpoint exists

Translation in production goes through [/api/translate](./translate.md) which requires an existing `story_parts` row. That's overkill for "is my API key working." This endpoint is the diagnostic.

It's a real translation though — not a `Say "hello"` ping — because seeing actual Premchand-flavored Hindi come back is a much stronger signal that the full pipeline is correctly assembled (env keys + prompt builder + provider adapter + response parsing + token accounting).
