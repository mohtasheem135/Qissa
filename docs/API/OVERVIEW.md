# API Overview

> Seven HTTP endpoints. Everything else uses Server Actions or anon Supabase reads from server components.

All routes live under [app/api/](../../app/api/). The translate + upload + ai/test routes require `requireAdmin()` (see [UI/auth.md](../UI/auth.md)); the requests routes are **anonymous** (honeypot + IP rate-limit applied inside the handler).

| Route | Method | Auth | Purpose | Doc |
|---|---|---|---|---|
| `/api/translate` | POST | admin | Translate one (variant × part) end-to-end | [translate.md](./translate.md) |
| `/api/translate/queue` | POST | admin | SSE batch translation of a variant's pending part-translations | [translate.md](./translate.md) |
| `/api/upload` | POST (multipart) | admin | ImageKit cover upload | [upload.md](./upload.md) |
| `/api/ai/test` | POST | admin | Real round-trip to a provider with a known prompt | [ai-test.md](./ai-test.md) |
| `/api/requests` | POST | **anon** | Submit a story / variant request (honeypot + rate-limited + dedupe→upvote) | [requests.md](./requests.md) |
| `/api/requests/[id]/vote` | POST | **anon** | Upvote an existing request (per-IP dedupe) | [requests.md](./requests.md) |
| `/api/dictionary` | GET | **anon** | Tap-to-define proxy to English Wiktionary REST API | [dictionary.md](./dictionary.md) |

---

## Auth

All routes await [requireAdmin()](../../lib/auth/check-admin.ts) before doing anything else. On a missing/wrong session, `requireAdmin` throws via `redirect("/admin/login")` — which surfaces as a 307 to the browser. The client (admin UI) only calls these routes from authenticated contexts.

---

## Error contract

JSON shape:

```ts
{ ok: true, ...payload }
// or
{ ok: false, error: string, ... }
```

Status codes:

- 200 — success
- 400 — bad request (missing body field, invalid JSON)
- 404 — referenced row not found
- 413 — payload too large (`/api/upload` only)
- 415 — unsupported content type (`/api/upload` only)
- 500 — server/DB error
- 502 — upstream AI provider failure (`/api/translate`, `/api/ai/test`)

The `ProviderError.status` from [lib/ai/types.ts](../../lib/ai/types.ts) is preserved when meaningful (e.g., a 429 from Gemini surfaces as a 429 from `/api/translate` so the admin can see the upstream classification).

---

## Cross-references

- All translation work goes through [lib/translation/run-part.ts](../../lib/translation/run-part.ts) — see [INTERNALS/ai-provider-adapter.md](../INTERNALS/ai-provider-adapter.md)
- Upload work goes through [lib/imagekit/upload.ts](../../lib/imagekit/upload.ts) — see [INTERNALS/imagekit.md](../INTERNALS/imagekit.md)
- All Server Actions live under [lib/actions/](../../lib/actions/) — see [INTERNALS/server-actions.md](../INTERNALS/server-actions.md)
