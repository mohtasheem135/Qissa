# CLAUDE.md

> High-signal index for AI sessions and humans. Read this first. Cross-links to the full living docs in [docs/](./docs/).

@AGENTS.md

---

## What this is

**Qissa** — installable PWA where an admin curates stories and translates them into Indic / RTL languages (Urdu, Hindi, Bengali, Arabic, Tamil, Odia, Punjabi…), mimicking the prose style of legendary writers via a **pluggable AI provider adapter**. Readers get a Kindle-grade reading experience (5 themes, RTL, pinch-zoom, offline).

**Stack:** Next.js 16 (App Router · Turbopack · React 19 · TS strict) · Tailwind v4 · shadcn/ui · Supabase (Postgres + Auth + RLS) · ImageKit · 5 AI providers (Gemini default · Groq · OpenRouter · OpenAI · Anthropic) · Vercel · manual service worker.

**Status:** all 10 build phases shipped. Deployed at `qissa-opal.vercel.app`. See [docs/03-implementation-plan.md](./docs/03-implementation-plan.md) for the build history.

---

## How to work on this codebase

### Run + test

```bash
npm run dev          # Turbopack dev server
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run build        # Production build
npm run start        # Run the production build (needed to test the SW)

# Smoke tests (require .env.local)
npx tsx --env-file=.env.local scripts/smoke-supabase.ts
npx tsx --env-file=.env.local scripts/smoke-translate.ts
```

### Database migrations

```bash
npx supabase migration new <name>
# edit supabase/migrations/<timestamp>_<name>.sql
npx supabase db push

# Then regenerate types (strip the leading CLI noise line):
npx supabase gen types typescript --linked --schema public > lib/supabase/types.ts
awk 'found || /^export / { found=1; print }' lib/supabase/types.ts > /tmp/t && mv /tmp/t lib/supabase/types.ts

npm run typecheck   # catches downstream references that broke
```

### Standard workflow for code changes

1. **Read the relevant doc first** — check [FEATURES.md](./docs/FEATURES.md) for the feature → code map, or [ARCHITECTURE.md](./docs/ARCHITECTURE.md) for module / flow context
2. Make the change
3. Run `npm run typecheck && npm run lint && npm run build`
4. **Update the affected doc(s)** under [docs/](./docs/) — see "Doc-update rules" below
5. Commit with a descriptive message; do not push without asking

### What NOT to do without explicit ask

- Push to GitHub
- Deploy to Vercel
- Change env vars or rotate keys
- Run `supabase db reset` (destructive on remote)
- Hard-delete from `stories` / `story_parts` / `categories` (use soft delete via `is_active=false`)

---

## Doc-update rules

The docs are **living** — keep them in sync with code.

| You changed… | Update… |
|---|---|
| A route or page | [docs/UI/*.md](./docs/UI/) — the file matching that route group |
| An API route | [docs/API/*.md](./docs/API/) — the file matching that endpoint |
| `lib/ai/*` (providers, prompt, retry) | [docs/INTERNALS/ai-provider-adapter.md](./docs/INTERNALS/ai-provider-adapter.md) |
| `lib/actions/*` (any Server Action) | [docs/INTERNALS/server-actions.md](./docs/INTERNALS/server-actions.md) + the relevant [docs/UI/admin.md](./docs/UI/admin.md) section |
| `lib/supabase/*` | [docs/INTERNALS/supabase-clients.md](./docs/INTERNALS/supabase-clients.md) |
| `lib/reader/*` (themes, settings, progress, bookmarks) | [docs/INTERNALS/reader-state.md](./docs/INTERNALS/reader-state.md) + [docs/UI/reader.md](./docs/UI/reader.md) if it affects the cockpit |
| `lib/imagekit/*` or cover handling | [docs/INTERNALS/imagekit.md](./docs/INTERNALS/imagekit.md) |
| `public/sw.js`, manifest, install prompt, icons | [docs/INTERNALS/pwa-service-worker.md](./docs/INTERNALS/pwa-service-worker.md) |
| A SQL migration | [docs/04-database.md](./docs/04-database.md) (single source of truth for the schema) |
| `lib/translation/*` or `lib/actions/story-variants.ts` | [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) §5 + [docs/04-database.md](./docs/04-database.md) §4.10–§4.11 |
| `app/api/requests/*` or `lib/actions/story-requests.ts` | [docs/API/requests.md](./docs/API/requests.md) + [docs/04-database.md](./docs/04-database.md) §4.12–§4.13 |
| A new feature surfaced to users | [docs/FEATURES.md](./docs/FEATURES.md) entry + link to relevant UI/API/INTERNALS docs |

When the code and a doc disagree, **treat the code as truth and update the doc**.

---

## Doc tree

```
docs/
  01-requirements.md           — original requirements (immutable; cite §)
  02-guidance.md               — pre-build setup checklist (accounts, env)
  03-implementation-plan.md    — original 10-phase plan
  04-database.md               — schema + RLS + seed + tooling
  ARCHITECTURE.md              — module map + request lifecycles + decisions
  FEATURES.md                  — every user-facing feature → code map
  UI/
    OVERVIEW.md                — routing tree + shells + shared primitives
    public.md                  — / · /c/* · /search · /s/[id] · /bookmarks · /offline
    reader.md                  — /s/[id]/p/[n] cockpit
    admin.md                   — admin shell + CRUD + story workflow
    auth.md                    — login + middleware (proxy) + requireAdmin
  API/
    OVERVIEW.md                — all 4 endpoints summary
    translate.md               — /api/translate + /api/translate/queue (SSE)
    upload.md                  — /api/upload (ImageKit, path-only)
    ai-test.md                 — /api/ai/test (real round-trip)
  INTERNALS/
    ai-provider-adapter.md     — lib/ai/* + how to add a new provider
    server-actions.md          — lib/actions/* pattern + "use server" rules
    supabase-clients.md        — 3 clients + RLS + types regen
    reader-state.md            — themes, settings, font size, progress, bookmarks
    imagekit.md                — path-only storage + URL composition
    pwa-service-worker.md      — sw.js + manifest + install prompt + icons
```

---

## Code conventions

- TypeScript strict; no `any` unless commented why
- Reference files via markdown links so they're clickable in IDEs: `[lib/reader/themes.ts](./lib/reader/themes.ts)`
- Comments explain **why**, not what. The code says what.
- React-19 patterns:
  - **No `setState` synchronously inside `useEffect`** — use the "adjust state during render" pattern or microtask-defer (see [INTERNALS/server-actions.md](./docs/INTERNALS/server-actions.md))
  - `useSyncExternalStore` getters must return cached references — see [lib/reader/bookmarks.ts](./lib/reader/bookmarks.ts) for the pattern
- Server Actions:
  - `*.ts` (the `"use server"` file) exports only async functions
  - `*.types.ts` (sibling) exports form-state types + initial constants
- Tailwind v4: no `tailwind.config.ts`; tokens live in [app/globals.css](./app/globals.css) via `@theme inline`
- shadcn primitives in [components/ui/](./components/ui/) import `cn` from [lib/utils/cn.ts](./lib/utils/cn.ts) — keep that import path stable (components.json depends on it)

---

## Where things live (cheat sheet)

| Topic | First place to look |
|---|---|
| A user-facing feature | [docs/FEATURES.md](./docs/FEATURES.md) |
| A specific URL | [docs/UI/OVERVIEW.md](./docs/UI/OVERVIEW.md) routing tree |
| AI translation | [docs/INTERNALS/ai-provider-adapter.md](./docs/INTERNALS/ai-provider-adapter.md) + [docs/API/translate.md](./docs/API/translate.md) |
| DB table / column | [docs/04-database.md](./docs/04-database.md) |
| Auth / admin gating | [docs/UI/auth.md](./docs/UI/auth.md) + [lib/auth/check-admin.ts](./lib/auth/check-admin.ts) |
| Reader settings, themes, progress | [docs/INTERNALS/reader-state.md](./docs/INTERNALS/reader-state.md) |
| Cover image URLs | [docs/INTERNALS/imagekit.md](./docs/INTERNALS/imagekit.md) |
| Offline / install prompt | [docs/INTERNALS/pwa-service-worker.md](./docs/INTERNALS/pwa-service-worker.md) |
| The "use server" + types-file split | [docs/INTERNALS/server-actions.md](./docs/INTERNALS/server-actions.md) |
| Deploy to Vercel | [README.md](./README.md) → "Production Deployment (Vercel)" |

---

## Known non-blockers (Phase 1.5 polish)

Tracked at the bottom of [README.md](./README.md) and in the individual INTERNALS docs:

- Glossary auto-extraction from translations
- Per-paragraph alignment UI for "Show original"
- Admin cost-tracking dashboard from `translation_jobs` rows
- Drag-to-reorder for categories / parts
- Switch from manual `public/sw.js` to `@serwist/next` for build-asset precaching
- Story listing pagination (currently capped at 200)
