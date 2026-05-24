# API — Translation

Two endpoints share the same per-part flow.

---

## POST `/api/translate`

**File:** [app/api/translate/route.ts](../../app/api/translate/route.ts)

Translate one (variant × part) end-to-end. The input is a `story_part_translations.id`.

### Request

```jsonc
{
  "storyPartTranslationId": "uuid",
  "providerName": "gemini" | "groq" | "openrouter" | "openai" | "anthropic", // optional override
  "modelName": "gemini-2.5-flash" // optional override
}
```

If `providerName` / `modelName` are omitted, falls back to the parent variant's `ai_provider` / `ai_model` columns, then to the `ai_config` singleton's defaults.

### Response (success — HTTP 200)

```jsonc
{
  "ok": true,
  "translatedText": "...",
  "tokensUsed": { "input": 217, "output": 84 },
  "modelUsed": "gemini-2.5-flash",
  "provider": "gemini",
  "durationMs": 1834
}
```

### Response (failure)

```jsonc
{
  "ok": false,
  "error": "Gemini 429: You exceeded your current quota...",
  "provider": "gemini",
  "modelUsed": "gemini-2.5-flash",
  "durationMs": 612
}
```

Status code = the provider's HTTP status when applicable (e.g., 429, 503), otherwise 502.

### Side effects

All inside [lib/translation/run-part.ts](../../lib/translation/run-part.ts) → `runStoryPartTranslation`:

1. `story_part_translations.status = 'translating'` immediately (UI shows the spinner)
2. Each retry attempt → row in `translation_jobs` with `status='failed'` + error message + duration + `variant_id` + `story_part_translation_id`
3. On success: row in `translation_jobs` with `status='succeeded'` + token counts
4. On success: row in `story_part_versions` with auto-incremented `version_number`, scoped to this `story_part_translation_id`
5. On success: `story_part_translations.update` — text, word count, `status='completed'`, provider/model snapshot, `translated_at`
6. On final failure: `story_part_translations.update` — `status='failed'`, `error_message`

---

## POST `/api/translate/queue` (Server-Sent Events)

**File:** [app/api/translate/queue/route.ts](../../app/api/translate/queue/route.ts)

SSE stream that translates every `pending` or `failed` `story_part_translations` row of one variant in part-number order.

### Request

```jsonc
{
  "variantId": "uuid",
  "fromPartNumber": 3,                            // optional — translate from this part onward
  "providerName": "...",                          // optional override (passed through to run-part)
  "modelName": "..."                              // optional override
}
```

### Response

Headers:

```
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

Body: newline-delimited JSON events, each as `data: …\n\n`:

| Event | Fields |
|---|---|
| `queue_started` | `totalParts`, `variantId` |
| `part_started` | `translationId`, `partId`, `partNumber` |
| `part_completed` | `translationId`, `partId`, `partNumber`, `translatedText`, `modelUsed`, `tokensUsed`, `durationMs` |
| `part_failed` | `translationId`, `partId`, `partNumber`, `error`, `durationMs` |
| `queue_done` | `completed`, `failed` |
| `queue_cancelled` | `completed`, `failed` (emitted when `request.signal.aborted` checked between parts) |
| `queue_error` | `error`, `completed`, `failed` (something threw out of the loop) |

### Cancellation

The browser closes the connection (e.g., user clicks Cancel) → `request.signal.aborted` becomes `true` → the queue stops dispatching new parts at the next iteration. **The in-flight part finishes naturally** to avoid partial DB state. A `queue_cancelled` event is emitted before the controller closes.

The `AbortSignal` is also passed through to [lib/translation/run-part.ts](../../lib/translation/run-part.ts) → [lib/ai/retry.ts](../../lib/ai/retry.ts) `withRetry`, so the sleep between retries respects cancellation too.

### Why SSE-over-fetch and not EventSource

`EventSource` doesn't support custom auth headers, and we need the admin's Supabase session cookie. So the client uses:

```ts
const response = await fetch("/api/translate/queue", {
  method: "POST",
  body: JSON.stringify({ storyId }),
  signal: abortController.signal,
});
const reader = response.body!.getReader();
const decoder = new TextDecoder();
let buffer = "";
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const events = buffer.split("\n\n");
  buffer = events.pop() ?? "";
  for (const ev of events) {
    if (!ev.startsWith("data: ")) continue;
    handleEvent(JSON.parse(ev.slice(6)));
  }
}
```

That logic lives in [StoryEditShell.tsx](../../components/admin/StoryEditShell.tsx) → `runQueue()`.

---

## Shared core

Both endpoints delegate to **one** function: [runStoryPartTranslation](../../lib/translation/run-part.ts).

```
                     ┌─────────────────────────────────┐
                     │ /api/translate                  │
                     │   thin wrapper → run-part       │
                     └────────────────┬────────────────┘
                                      │
                                      ▼
                     ┌─────────────────────────────────┐
                     │ runStoryPartTranslation()       │
                     │  - load part + story + tone +   │
                     │    language + previous part     │
                     │  - flip status to 'translating' │
                     │  - call lib/ai/translate.ts     │
                     │  - log jobs / write version /   │
                     │    update part                  │
                     └────────────────┬────────────────┘
                                      ▲
                                      │
                     ┌─────────────────────────────────┐
                     │ /api/translate/queue            │
                     │   iterate pending parts, emit   │
                     │   SSE events; loop body calls   │
                     │   run-part per part             │
                     └─────────────────────────────────┘
```

Single source of truth → retry / version trail / job logging is identical across single + queue paths.

See [INTERNALS/ai-provider-adapter.md](../INTERNALS/ai-provider-adapter.md) for the provider abstraction itself.

---

## Failure surfaces

Failure never throws out of the route. The discriminated `RunPartResult` shape from `lib/translation/run-part.ts`:

```ts
type RunPartResult =
  | { ok: true;  output: TranslationOutput; durationMs: number }
  | { ok: false; error: string; status?: number; provider?: ProviderId; model?: string; durationMs: number };
```

The route maps `result.status` (when present) onto the HTTP response code so the admin sees the upstream classification (429 stays 429, etc.). Bad keys / 400s become 4xx; transient 5xx / network errors get retried 3× before surfacing.
