# Qissa

> Stories, translated with soul.

Qissa is a multi-language story translation platform. An admin curates stories in any source language and translates them into Urdu, Hindi, Bengali, Arabic, Tamil, Odia, Punjabi, English and more — using a pluggable AI provider — with translations that mimic the prose style of legendary writers of the target language (Premchand for Hindi, Manto for Urdu, Tagore for Bengali, etc.).

Readers consume the result through an installable PWA optimized for budget Android phones, with a premium Kindle-grade reading experience.

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack) · React 19 · TypeScript (strict)
- **Styling:** Tailwind CSS v4 · shadcn/ui (slate base, CSS variables)
- **Backend:** Supabase — Postgres + Auth + Storage
- **AI:** Pluggable adapter — Gemini · Groq · OpenRouter · OpenAI · Anthropic
- **Images:** ImageKit CDN
- **PWA:** Manual service worker (`public/sw.js`) with network-first HTML / cache-first images / SWR for static assets
- **Hosting:** Vercel

See `docs/` for the full requirements, setup guidance, implementation plan, and the database reference.

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Fill in .env.local — use .env.example as the template.
#    See docs/02-guidance.md for how to obtain each value.
cp .env.example .env.local   # (already in place; edit it)

# 3. Apply the Supabase schema (first time only)
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push

# 4. Regenerate the TypeScript Database type
npx supabase gen types typescript --linked --schema public > lib/supabase/types.ts
# (strip the leading "Initialising login role..." line if present)

# 5. Run the dev server
npm run dev
```

Open <http://localhost:3000>.

### Scripts

```bash
npm run dev          # Turbopack dev server
npm run build        # Production build
npm run start        # Run the production build locally
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run format       # Prettier write
```

### Smoke tests

```bash
# Verifies Supabase wiring + RLS
npx tsx --env-file=.env.local scripts/smoke-supabase.ts

# Hits every configured AI provider with one Premchand-style prompt
npx tsx --env-file=.env.local scripts/smoke-translate.ts
```

## Project Structure

```
app/
  (public)/          reader-facing routes — home, browse, story, reader, offline
  admin/             admin console (auth-gated)
  api/               server route handlers (translate, upload, ai/test, …)
  manifest.ts        PWA manifest
  sitemap.ts         public sitemap (includes published stories)
  robots.ts          allows /, disallows /admin + /api
  icon.svg           favicon
components/
  ui/                shadcn primitives
  reader/            ReaderShell, themes, chrome, settings, body
  admin/             stories, parts, edit dialogs, panels
  shared/            StoryCard, CategoryTile, SearchBar, PublicShell,
                     InstallPrompt, ServiceWorkerRegistration, …
lib/
  supabase/          three clients: browser / server-with-cookies / service-role
  ai/                provider adapter (types, prompt-builder, retry, providers/*)
  translation/       run-part.ts — shared translate-one-part flow
  imagekit/          server-side upload + URL builder
  i18n/              language metadata + font stacks
  reader/            theme tokens, settings, font-size, paragraphs,
                     bookmarks, progress, google-fonts
  utils/             slug, word-count, cn()
  actions/           Server Actions (categories, tones, stories, story-parts, …)
  auth/              requireAdmin
supabase/
  migrations/        SQL schema + RLS policies + seed data
public/
  sw.js              service worker
  icons/             PWA icons (SVG)
docs/                requirements, guidance, implementation plan, db reference
scripts/             smoke tests
```

## Architecture Notes

### Adding a new AI provider

1. Add an entry to [`PROVIDERS`](./lib/ai/registry.ts) (id, name, defaultModel, models, envKey).
2. Create [`lib/ai/providers/<id>.ts`](./lib/ai/providers/) implementing `TranslationProvider`.
3. Add a `case` to the switch in `lib/ai/registry.ts`'s `buildProvider()`.

No other changes — the prompt builder, retry policy, version logging, and admin UI pick it up automatically.

### Translation flow

```
[admin clicks Translate]
   ↓
/api/translate/queue (SSE)  ─── for "Translate N pending"
/api/translate              ─── for single re-translate
   ↓
lib/translation/run-part.ts ─── shared core
   ↓
lib/ai/translate.ts → withRetry(provider.translate(input))
   ↓
DB writes: story_part_versions row + story_parts update + translation_jobs log
```

### Reader state

- `qissa:reader-settings` — JSON blob (theme, line height, alignment, font variant, show-original)
- `qissa:fontSize` — separate integer (changed frequently)
- `qissa:progress:<storyId>:<partNumber>` — `{ scroll, updatedAt }` per part
- `qissa:last-read` — pointer for Continue Reading
- `qissa:bookmarks` — array of story IDs
- `qissa:installPromptDismissedAt` — install banner cooldown

All client-only; Phase 2 will migrate to auth.uid-scoped tables.

## Production Deployment (Vercel)

Phase 10's deploy step. ~10 minutes once the repo is on GitHub.

### 1. Push to GitHub

```bash
git remote add origin git@github.com:<you>/qissa.git
git push -u origin main
```

### 2. Import to Vercel

1. Go to <https://vercel.com/new> and pick the `qissa` repo.
2. Framework: **Next.js** (auto-detected).
3. Root directory: leave as `./`.
4. Build & output settings: defaults are correct.
5. **Don't deploy yet** — add env vars first.

### 3. Environment variables

In Vercel project settings → Environment Variables, add every key from `.env.local` (skip `NEXT_PUBLIC_APP_URL` for now — we'll fix it after the first deploy gives us a URL):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ADMIN_EMAIL
NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT
NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY
IMAGEKIT_PRIVATE_KEY
GEMINI_API_KEY
GROQ_API_KEY            # optional
OPENROUTER_API_KEY      # optional
OPENAI_API_KEY          # optional
ANTHROPIC_API_KEY       # optional
```

Apply each to **Production**, **Preview**, and **Development** unless you have a reason not to.

### 4. First deploy

Click **Deploy**. Wait 2–3 minutes. Vercel gives you a URL like `https://qissa-<hash>.vercel.app`.

### 5. Add the production URL

1. Add `NEXT_PUBLIC_APP_URL=https://<your-url>.vercel.app` to Vercel env vars.
2. Trigger a fresh deploy from the dashboard so the sitemap + manifest + OG metadata pick it up.

### 6. Custom domain (optional)

1. Vercel → Domains → add your domain.
2. Add the DNS records Vercel shows you.
3. Once verified, update `NEXT_PUBLIC_APP_URL` to your domain and redeploy.

### 7. Post-deploy verification

- [ ] Visit the production URL in Chrome → Install icon should appear in the address bar
- [ ] Install as PWA → opens fullscreen, icon on home screen
- [ ] Open a story, then toggle airplane mode → reload — page comes back from cache
- [ ] Sign in at `/admin/login` (the admin user from Phase 4 setup)
- [ ] Run Lighthouse mobile: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 90, PWA badge present

## Roadmap

| Phase | Status |
|---|---|
| 1 — Project bootstrap | ✅ |
| 2 — Supabase clients | ✅ |
| 3 — Database schema, migrations, seed | ✅ |
| 4 — Admin auth gating | ✅ |
| 5 — Admin CRUD (categories, tones, languages, AI config) | ✅ |
| 6 — AI provider adapter system | ✅ |
| 7 — Story creation + parts + live translation queue | ✅ |
| 8 — Public reader pages | ✅ |
| 9 — Reader (themes, RTL, pinch-zoom, progress) | ✅ |
| 10 — PWA + SEO + deploy | ✅ |

**Phase 1.5 polish** (post-MVP):
- Glossary auto-extraction from translations
- Per-paragraph alignment UI in the reader
- Admin cost-tracking dashboard from `translation_jobs`
- Drag-to-reorder for categories / parts (currently number-based)
- Switch to `@serwist/next` for build-asset precaching
