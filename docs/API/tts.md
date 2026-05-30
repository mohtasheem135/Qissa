# API — TTS (audio narration)

> Three admin endpoints mirroring the translation endpoints. All gated by
> `requireAdmin()`. Generation logic lives in
> [lib/tts/run-part.ts](../../lib/tts/run-part.ts) — see
> [tts-provider-adapter.md](../INTERNALS/tts-provider-adapter.md).

---

## `POST /api/tts`

Single (variant, part) audio generation. Mirrors `/api/translate`.

**Body:** `{ storyPartTranslationId, voiceId?, providerName?, model? }`

`model` + `voiceId` are resolved/validated server-side against the provider's
model list and (model-scoped) voice catalog — see
[tts-provider-adapter.md](../INTERNALS/tts-provider-adapter.md).

**200:** `{ ok: true, audioUrl, provider, voiceId, characters, durationSeconds, durationMs }`
**4xx/502:** `{ ok: false, error, provider?, voiceId?, durationMs }`

File: [app/api/tts/route.ts](../../app/api/tts/route.ts)

---

## `POST /api/tts/queue` (SSE)

Generates audio for every translation of a variant that has narratable text
(`completed`/`edited`) and no completed audio yet, in `part_number` order.
SSE-over-fetch (newline-delimited `data: {…}`). Mirrors `/api/translate/queue`.

**Body:** `{ variantId, fromPartNumber?, voiceId?, providerName?, model? }`
(`model` threads through to every part; resolved/validated per part).

**Events:**
- `queue_started { totalParts }`
- `part_started { translationId, partId, partNumber }`
- `part_completed { translationId, partNumber, audioUrl, durationSeconds }`
- `part_failed { translationId, partNumber, error }`
- `queue_done { completed, failed }` · `queue_cancelled` · `queue_error`

**Cancellation:** `request.signal` (browser disconnect) stops dispatch at the
next part boundary; the in-flight part runs to completion.

File: [app/api/tts/queue/route.ts](../../app/api/tts/queue/route.ts)

---

## `POST /api/tts/test`

Synthesizes a short sample and returns it inline so the
[TTS config page](../UI/admin.md) can play it. Mirrors `/api/ai/test`.

**Body:** `{ providerName, voiceId?, model? }` — model + voice are resolved with
`resolveTtsModel`/`resolveTtsVoice` before synthesizing.

**200:** `{ ok: true, latencyMs, provider, voiceUsed, characters, mimeType, audioBase64 }`
(client plays `data:<mimeType>;base64,<audioBase64>`).
**4xx/5xx:** `{ ok: false, error, ... }`

File: [app/api/tts/test/route.ts](../../app/api/tts/test/route.ts)

See also: [API/OVERVIEW.md](./OVERVIEW.md).
