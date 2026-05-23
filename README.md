# Qissa

> Stories, translated with soul.

Qissa is a multi-language story translation platform. An admin curates stories in any source language and translates them into Urdu, Hindi, Bengali, Arabic, Tamil, Odia, Punjabi, English and more — using a pluggable AI provider — with translations that mimic the prose style of legendary writers of the target language (Premchand for Hindi, Manto for Urdu, Tagore for Bengali, etc.).

Readers consume the result through an installable PWA optimized for budget Android phones, with a premium Kindle-grade reading experience.

## Tech Stack

- **Framework:** Next.js 16 (App Router) · React 19 · TypeScript (strict)
- **Styling:** Tailwind CSS v4 · shadcn/ui (slate base, CSS variables)
- **Backend:** Supabase — Postgres + Auth + Storage
- **AI:** Pluggable adapter — Gemini (default), Groq, OpenRouter, OpenAI, Anthropic
- **Images:** ImageKit CDN
- **Hosting:** Vercel
- **PWA:** Serwist service worker (Phase 10)

See `docs/` for the full requirements, setup guidance, and implementation plan.

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Fill in .env.local — use .env.example as the template.
#    See docs/02-guidance.md for how to obtain each value.
cp .env.example .env.local   # (already in place; edit it)

# 3. Run the dev server
npm run dev
```

Open <http://localhost:3000>.

### Other Scripts

```bash
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run format       # Prettier write
npm run build        # Production build
```

## Project Structure

```
app/
  (public)/          reader-facing routes — home, browse, story, reader
  admin/             admin console (auth-gated, Phase 4+)
  api/               server route handlers (translate, upload, …)
components/
  ui/                shadcn primitives
  reader/            reader shell, themes, font controls
  admin/             admin forms, translation progress, version history
  shared/            story card, search bar, category tile
lib/
  supabase/          three clients: browser, server-with-cookies, service-role
  ai/                provider adapter system (gemini.ts, groq.ts, …)
  imagekit/          server-side upload helper
  i18n/              language metadata + font stacks
  reader/            theme tokens, localStorage helpers
  utils/             slug, word-count, cn(), …
supabase/
  migrations/        SQL schema + RLS policies
  seed.sql           initial languages, tones, AI config
docs/                requirements, guidance, implementation plan
```

## Adding a New AI Provider

Create one file at `lib/ai/providers/<name>.ts` implementing the
`TranslationProvider` interface, then register it in `lib/ai/registry.ts`.
No other code changes are needed. See `docs/01-requirements.md` §3.4.

## Roadmap

- **Phase 1** _(this scaffold)_ — Project bootstrap
- **Phases 2–3** — Supabase clients + schema
- **Phase 4** — Admin auth gating
- **Phase 5** — Admin CRUD (categories, tones, languages, AI config)
- **Phase 6** — AI provider adapter system
- **Phase 7** — Story creation + translation flow
- **Phases 8–9** — Public pages + reader experience
- **Phase 10** — PWA, offline, deploy

Full plan: `docs/03-implementation-plan.md`.
