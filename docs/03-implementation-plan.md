# Qissa — Implementation Plan

> Step-by-step build plan optimized for execution with **Claude Code**. Each phase has clear deliverables, acceptance criteria, and copy-paste prompts you can give Claude Code.

**Version:** 1.0
**Total phases:** 10
**Estimated build time:** 25–40 hours of active work spread across 1–3 weeks

---

## How to Use This Plan

This plan is organized into **10 sequential phases**. Each phase:

1. Has a clear **goal**
2. Lists **deliverables** (files/features that must exist)
3. Lists **acceptance criteria** (how you verify it works)
4. Contains a **Claude Code prompt** you can copy-paste verbatim

**Workflow with Claude Code:**

1. Open your terminal in `~/projects/qissa`
2. Run `claude` to launch Claude Code
3. Paste the prompt for the current phase
4. Let Claude Code execute (it will ask for env vars and credentials as needed — have your credentials note open)
5. Verify acceptance criteria
6. Commit to git: `git add . && git commit -m "phase X: <description>"`
7. Move to the next phase

**Do not skip phases.** Each builds on the previous.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  Browser (Reader PWA + Admin Console)               │
│  Next.js 16 App Router · Tailwind · shadcn/ui       │
└────────────┬─────────────────────────┬──────────────┘
             │                         │
             │ Public reads            │ Admin reads/writes
             │                         │
     ┌───────▼───────┐         ┌───────▼────────────┐
     │  Supabase     │         │  Next.js Server    │
     │  (Postgres)   │◄────────┤  Actions / Routes  │
     │  Anon role    │         │  Service role key  │
     └───────────────┘         └───────┬────────────┘
                                       │
                       ┌───────────────┼──────────────┐
                       │               │              │
                ┌──────▼────┐   ┌──────▼─────┐   ┌────▼─────┐
                │ Gemini    │   │ Groq       │   │ ImageKit │
                │ (free)    │   │ (free)     │   │ Uploads  │
                └───────────┘   └────────────┘   └──────────┘
```

**Key principles:**
- All AI calls happen on the **server** (Next.js Server Actions or Route Handlers) — keys never reach browser
- All admin writes happen on the **server** using the Supabase service role key
- Public reads use the Supabase **anon** key + RLS policies
- The browser only ever holds public keys

---

## Folder Structure (Target)

```
qissa/
├── app/
│   ├── (public)/                 # reader-facing routes
│   │   ├── page.tsx              # home
│   │   ├── c/
│   │   │   ├── [category]/page.tsx
│   │   │   └── [category]/[subcategory]/page.tsx
│   │   ├── s/
│   │   │   ├── [storyId]/page.tsx           # story landing
│   │   │   └── [storyId]/p/[partNumber]/page.tsx  # reader
│   │   ├── search/page.tsx
│   │   └── bookmarks/page.tsx
│   ├── admin/
│   │   ├── login/page.tsx
│   │   ├── layout.tsx            # auth-gated
│   │   ├── page.tsx              # dashboard
│   │   ├── categories/page.tsx
│   │   ├── languages/page.tsx
│   │   ├── tones/page.tsx
│   │   ├── ai-config/page.tsx
│   │   └── stories/
│   │       ├── page.tsx          # list
│   │       ├── new/page.tsx
│   │       └── [id]/page.tsx     # edit/translate
│   ├── api/
│   │   ├── translate/route.ts    # POST: translate a part
│   │   └── upload/route.ts       # POST: ImageKit upload
│   ├── layout.tsx                # root with PWA setup
│   ├── manifest.ts               # PWA manifest
│   └── globals.css
├── components/
│   ├── ui/                       # shadcn primitives
│   ├── reader/
│   │   ├── ReaderShell.tsx
│   │   ├── ReaderSettings.tsx
│   │   ├── ThemeSwitcher.tsx
│   │   ├── FontControls.tsx
│   │   └── ProgressBar.tsx
│   ├── admin/
│   │   ├── CategoryForm.tsx
│   │   ├── ToneForm.tsx
│   │   ├── StoryForm.tsx
│   │   ├── TranslationProgress.tsx
│   │   └── PartEditor.tsx
│   └── shared/
│       ├── StoryCard.tsx
│       ├── CategoryTile.tsx
│       └── SearchBar.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # browser client
│   │   ├── server.ts             # server client with cookies
│   │   └── admin.ts              # service role client
│   ├── ai/
│   │   ├── types.ts              # TranslationProvider interface
│   │   ├── registry.ts           # provider lookup
│   │   ├── prompt-builder.ts     # constructs translation prompt
│   │   └── providers/
│   │       ├── gemini.ts
│   │       ├── groq.ts
│   │       ├── openrouter.ts
│   │       ├── openai.ts
│   │       └── anthropic.ts
│   ├── imagekit/
│   │   └── upload.ts
│   ├── i18n/
│   │   ├── languages.ts          # language metadata + font stacks
│   │   └── fonts.ts              # Google Fonts loader
│   ├── reader/
│   │   ├── themes.ts             # 5 reader themes
│   │   ├── progress.ts           # localStorage helpers
│   │   └── bookmarks.ts
│   └── utils/
│       ├── slug.ts
│       ├── word-count.ts
│       └── reading-time.ts
├── supabase/
│   ├── migrations/
│   │   └── 0001_initial.sql
│   └── seed.sql
├── public/
│   ├── icons/                    # PWA icons
│   └── og-default.png
├── .env.example
├── .env.local                    # gitignored
├── .gitignore
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

---

# PHASE 1 — Project Bootstrap & Configuration

**Goal:** A working Next.js 16 project with Tailwind, shadcn/ui, TypeScript, ESLint, Prettier, env handling, and `.gitignore` set up. Pushed to GitHub.

### Deliverables
- `package.json` with all dependencies
- `next.config.ts` with PWA-ready config
- `tailwind.config.ts` and `globals.css` with theme tokens
- `.env.example` and `.env.local`
- `tsconfig.json` with strict mode
- shadcn/ui initialized
- Empty placeholder pages render OK
- Initial commit pushed to GitHub

### Acceptance Criteria
- [ ] `npm run dev` starts the app at `http://localhost:3000` showing a placeholder home page
- [ ] No TypeScript errors
- [ ] No ESLint errors
- [ ] `.env.local` is in `.gitignore`
- [ ] GitHub repo shows the initial commit

### Claude Code Prompt for Phase 1

```
We are building "Qissa", a multi-language story translation platform.

Initialize a new Next.js 16 project in the current directory with the following stack:
- Next.js 16 (App Router) with TypeScript strict mode
- Tailwind CSS
- shadcn/ui (initialize and configure)
- ESLint + Prettier
- npm (not yarn/pnpm)

Create the following:
1. Next.js project with App Router, TypeScript, Tailwind, ESLint
2. Initialize shadcn/ui with the `slate` base color and CSS variables enabled
3. Create folder structure: app/(public), app/admin, components/{ui,reader,admin,shared}, lib/{supabase,ai,imagekit,i18n,reader,utils}, supabase/migrations
4. Create .env.example with these placeholders (do NOT fill in values):
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY
   - SUPABASE_SERVICE_ROLE_KEY
   - ADMIN_EMAIL
   - NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT
   - NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY
   - IMAGEKIT_PRIVATE_KEY
   - GEMINI_API_KEY
   - GROQ_API_KEY (optional)
   - OPENROUTER_API_KEY (optional)
   - OPENAI_API_KEY (optional)
   - ANTHROPIC_API_KEY (optional)
   - NEXT_PUBLIC_APP_URL
5. Create .env.local from .env.example (copy structure; I will fill in values)
6. Add .env.local to .gitignore (it already should be, but verify)
7. Configure Tailwind with CSS variables for theming
8. Create a simple placeholder home page at app/(public)/page.tsx with "Qissa" heading
9. Create a README.md explaining the project
10. Initialize git, create .gitignore appropriate for Next.js
11. Tell me when done; I will create the GitHub repo and push.

Stop after this; do not start phase 2 yet.
```

---

# PHASE 2 — Supabase Client Setup & Type Safety

**Goal:** Three Supabase clients (browser, server-with-cookies, server-with-service-role) and TypeScript types generated from the schema (after Phase 3 sets up the schema, we'll re-generate).

### Deliverables
- `lib/supabase/client.ts` — browser client
- `lib/supabase/server.ts` — server client with cookie support for auth
- `lib/supabase/admin.ts` — service-role client (server-only, for admin operations)
- `lib/supabase/types.ts` — generated types (initially empty, regenerated after Phase 3)
- `@supabase/supabase-js` and `@supabase/ssr` installed

### Acceptance Criteria
- [ ] All three clients exported and importable
- [ ] No runtime errors when imported
- [ ] Strict TypeScript passes

### Claude Code Prompt for Phase 2

```
Phase 2: Supabase client setup.

1. Install: @supabase/supabase-js, @supabase/ssr
2. Create lib/supabase/client.ts:
   - Browser-side client using createBrowserClient from @supabase/ssr
   - Uses NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
3. Create lib/supabase/server.ts:
   - Server-side client using createServerClient from @supabase/ssr
   - Handles cookies via next/headers
   - For use in Server Components, Server Actions, Route Handlers
4. Create lib/supabase/admin.ts:
   - Service role client using createClient from @supabase/supabase-js
   - Uses SUPABASE_SERVICE_ROLE_KEY (never exposed to browser)
   - Add a runtime check: throw if called from client code (check typeof window === 'undefined')
5. Create lib/supabase/types.ts as a stub for now — will be regenerated after migrations.
6. Add a sanity check: a tiny server component at app/(public)/page.tsx that imports the server client (don't query yet, just import).

Make sure all imports resolve. Stop after this.
```

---

# PHASE 3 — Database Schema & Migrations

**Goal:** Complete Postgres schema with RLS policies, seeded with initial languages, tones, complexity levels.

### Deliverables
- `supabase/migrations/0001_initial.sql` with all tables
- `supabase/migrations/0002_rls_policies.sql` with all policies
- `supabase/seed.sql` with initial data
- Tables created in Supabase (run via SQL Editor or Supabase CLI)
- Generated TypeScript types in `lib/supabase/types.ts`

### Schema Summary

```sql
-- Categories (top-level)
categories (
  id uuid PK, name text, slug text UNIQUE, icon_emoji text,
  description text, display_order int, is_active bool,
  created_at, updated_at
)

-- Subcategories (under categories)
subcategories (
  id uuid PK, category_id uuid FK→categories,
  name text, slug text, icon_emoji text, description text,
  display_order int, is_active bool, created_at, updated_at,
  UNIQUE(category_id, slug)
)

-- Languages
languages (
  code text PK,             -- 'hi', 'ur', 'bn', etc
  name_english text, name_native text,
  direction text CHECK (direction IN ('ltr','rtl')),
  font_family text, font_family_reading text,
  is_active bool, display_order int
)

-- Tones (writer-style presets)
tones (
  id uuid PK, language_code text FK→languages,
  name text, display_name text,
  description text, prompt_fragment text NOT NULL,
  is_active bool, created_at, updated_at,
  UNIQUE(language_code, name)
)

-- Stories
stories (
  id uuid PK,
  subcategory_id uuid FK→subcategories,
  target_language text FK→languages,
  tone_id uuid FK→tones,
  complexity text CHECK (complexity IN ('daily','simple','standard','advanced','scholarly')),
  
  title_original text NOT NULL, title_translated text,
  author_original text, source_url text, cover_image_url text,
  
  ai_provider text, ai_model text,
  custom_instructions text,
  
  status text CHECK (status IN ('draft','published')) DEFAULT 'draft',
  is_active bool DEFAULT true,
  
  total_parts int DEFAULT 0,
  total_words_original int DEFAULT 0,
  total_words_translated int DEFAULT 0,
  estimated_reading_minutes int,
  
  created_at, updated_at, published_at
)

-- Story parts
story_parts (
  id uuid PK,
  story_id uuid FK→stories,
  part_number int NOT NULL,             -- 1, 2, 3, ...
  part_label text,                       -- 'Part 1', or custom
  text_original text NOT NULL,
  text_translated text,
  status text CHECK (status IN ('pending','translating','completed','edited','failed')) DEFAULT 'pending',
  error_message text,
  last_provider_used text, last_model_used text,
  word_count_original int, word_count_translated int,
  created_at, updated_at,
  UNIQUE(story_id, part_number)
)

-- Translation versions (history)
story_part_versions (
  id uuid PK,
  story_part_id uuid FK→story_parts,
  version_number int,
  translated_text text NOT NULL,
  provider_used text, model_used text,
  tone_id uuid, complexity text, custom_instructions text,
  created_by text CHECK (created_by IN ('ai','admin')),
  created_at,
  UNIQUE(story_part_id, version_number)
)

-- AI provider configuration (singleton row for admin defaults)
ai_config (
  id uuid PK DEFAULT '00000000-...',
  default_provider text DEFAULT 'gemini',
  default_model text DEFAULT 'gemini-2.0-flash',
  updated_at
)

-- Translation jobs (logging)
translation_jobs (
  id uuid PK,
  story_part_id uuid FK→story_parts,
  attempt_number int,
  status text CHECK (status IN ('started','succeeded','failed')),
  provider text, model text,
  input_tokens int, output_tokens int,
  duration_ms int,
  error_message text,
  created_at
)
```

### RLS Policies Summary
- **Public reads:** Everyone can SELECT from `categories`, `subcategories`, `languages`, `tones`, `stories` (where `status='published'` and `is_active=true`), `story_parts` (where parent story is published)
- **Admin only:** All INSERT/UPDATE/DELETE require service role key (bypasses RLS automatically)

### Acceptance Criteria
- [ ] All tables created in Supabase
- [ ] Seeded data includes 13 languages and ~25 tones
- [ ] `npx supabase gen types typescript` runs and produces types file
- [ ] Public SELECT works on `languages` from the browser (test by writing a tiny script)
- [ ] Admin client can INSERT a test row via service role

### Claude Code Prompt for Phase 3

```
Phase 3: Database schema and migrations.

1. Create supabase/migrations/0001_initial.sql with the complete schema (see below).
2. Create supabase/migrations/0002_rls_policies.sql with Row Level Security policies.
3. Create supabase/seed.sql with seed data for:
   - 13 languages: en, hi, ur, ar, bn, ta, or, pa, mr, gu, te, kn, ml
     - With direction, font_family, native names
     - English uses Inter/Lora, RTL for Urdu and Arabic
   - At least 25 tones across these languages:
     * Hindi: Premchand, Bachchan, Renu, Sobti, Bhandari
     * Urdu: Manto, Chughtai, Ghalib, Ibn-e-Safi, Hyder
     * Bengali: Tagore, Sarat Chandra, Bibhutibhushan, Mahasweta Devi
     * Arabic: Mahfouz, Gibran, Tayeb Salih
     * Tamil: Kalki, Pudumaipithan, Jeyamohan
     * Odia: Fakir Mohan, Gopinath Mohanty
     * Punjabi: Amrita Pritam, Bhai Vir Singh
     * English: Hemingway, Tolkien, Salinger, Orwell
   - Each tone needs a detailed prompt_fragment (~2-3 sentences) describing the writer's literary style.
   - One row in ai_config with default_provider='gemini', default_model='gemini-2.0-flash'

4. Schema details (use exact column names — they're referenced throughout the app):

[INSERT THE FULL SCHEMA FROM ABOVE INTO THE PROMPT]

5. RLS policies:
   - Enable RLS on all tables
   - Public SELECT allowed on languages, tones, categories, subcategories (where is_active = true)
   - Public SELECT on stories where status='published' AND is_active=true
   - Public SELECT on story_parts where parent story is published and active
   - No public INSERT/UPDATE/DELETE on any table
   - Service role bypasses RLS by default — admin operations use service role client

6. Tell me how to apply these migrations:
   - Option A: paste SQL into Supabase Dashboard → SQL Editor (recommended for first time)
   - Option B: install Supabase CLI and run `supabase db push`
   Recommend Option A for the first run.

7. After I confirm migrations are applied in Supabase dashboard:
   - Walk me through generating types via Supabase Dashboard → API → "Generate TypeScript types"
   - Save the output to lib/supabase/types.ts
   - Update lib/supabase/client.ts, server.ts, admin.ts to use the typed client (Database generic)

Stop after this.
```

---

# PHASE 4 — Authentication & Admin Gating

**Goal:** Admin login page, middleware that protects `/admin/*` routes, only the configured admin email allowed.

### Deliverables
- `app/admin/login/page.tsx` with email+password form (uses shadcn/ui Form, Input, Button)
- `app/admin/layout.tsx` that checks auth on every admin page
- `middleware.ts` at project root with Supabase session refresh
- Logout button in admin nav
- `lib/auth/check-admin.ts` helper

### Acceptance Criteria
- [ ] Visiting `/admin` redirects to `/admin/login` if not logged in
- [ ] Logging in with `ADMIN_EMAIL` + correct password → access to `/admin`
- [ ] Logging in with any other email → "Not authorized" error, stays logged out
- [ ] Logout button works
- [ ] Session persists across page refreshes

### Claude Code Prompt for Phase 4

```
Phase 4: Authentication and admin gating.

Build:

1. middleware.ts at project root:
   - Uses @supabase/ssr's updateSession pattern
   - Refreshes the auth cookie on every request

2. app/admin/login/page.tsx:
   - shadcn/ui Card containing Form with email + password
   - Submits via Server Action that calls supabase.auth.signInWithPassword
   - On success: check that user's email === process.env.ADMIN_EMAIL
     - If yes: redirect to /admin
     - If no: sign out, show error "Not authorized"
   - On failure: show specific error

3. app/admin/layout.tsx:
   - Server Component
   - Checks session via supabase.auth.getUser()
   - If no user OR user.email !== ADMIN_EMAIL → redirect('/admin/login')
   - Renders an AdminShell with sidebar nav (links to: Dashboard, Categories, Languages, Tones, AI Config, Stories) and logout button

4. lib/auth/check-admin.ts:
   - Reusable helper: requireAdmin() that returns the user or redirects
   - Use this at the top of every admin Server Action

5. Logout: Server Action that calls supabase.auth.signOut() and redirects to /admin/login

6. app/admin/page.tsx: dashboard placeholder showing "Welcome, admin" with stats cards (story count, draft count, published count) — fetch counts via the admin server client

Test scenarios you should verify:
- /admin → redirects to /admin/login
- Login with wrong email → not authorized error
- Login with ADMIN_EMAIL → success, lands on /admin
- Refresh page while logged in → stays logged in
- Logout → redirects to login

Stop after this.
```

---

# PHASE 5 — Admin: Categories, Languages, Tones, AI Config

**Goal:** Full CRUD admin UIs for the four "config" entities.

### Deliverables
- `app/admin/categories/page.tsx` — list + create/edit/delete + drag reorder
- `app/admin/categories/[id]/page.tsx` — manage subcategories of a category
- `app/admin/languages/page.tsx` — full CRUD (mostly view, since seeded)
- `app/admin/tones/page.tsx` — full CRUD with prompt_fragment editor (large textarea)
- `app/admin/ai-config/page.tsx` — set default provider/model, test connection

### Acceptance Criteria
- [ ] Admin can create, edit, soft-delete categories and subcategories
- [ ] Admin can create a new tone for any language with a custom prompt_fragment
- [ ] Admin can change the default AI provider (dropdown of installed providers)
- [ ] "Test connection" button on AI config calls the provider with "Say hello" and shows the response

### Claude Code Prompt for Phase 5

```
Phase 5: Admin CRUD for categories, languages, tones, AI config.

Build these admin pages using shadcn/ui components (Table, Dialog, Form, Input, Textarea, Select, Button, Toast). All mutations use Server Actions with the admin Supabase client.

A) app/admin/categories/page.tsx:
   - Table of categories with: icon, name, slug, subcategory count, story count, status toggle, edit/delete buttons
   - "New Category" button opens a Dialog with Form (name, slug auto-from-name, icon_emoji, description, display_order)
   - Each row links to /admin/categories/[id] to manage subcategories of that category
   - Soft delete: confirms with Dialog, sets is_active = false
   - Drag-to-reorder via @dnd-kit/sortable (install it)

B) app/admin/categories/[id]/page.tsx:
   - Shows the parent category info + a table of its subcategories
   - Same CRUD pattern as above for subcategories

C) app/admin/languages/page.tsx:
   - Table view of languages
   - Edit: can toggle is_active, change display_order, edit font_family
   - Add new language: full form
   - Cannot delete (only deactivate)

D) app/admin/tones/page.tsx:
   - Filter by language at top
   - Table: name, language, description (truncated), is_active, actions
   - Create/edit dialog with a BIG textarea for prompt_fragment (this is the most important field)
   - Include a "Preview prompt" section showing how the prompt_fragment will be combined with complexity to form the final system prompt

E) app/admin/ai-config/page.tsx:
   - Card with: current default provider (dropdown), current default model (dropdown that depends on provider)
   - Provider options visible based on which API keys are set in env (use a helper to check)
   - "Save" button updates the ai_config singleton row
   - "Test connection" button: calls a /api/ai/test endpoint that uses the chosen provider/model to translate "Hello" to Hindi and shows result + latency + tokens used

F) Server Actions in lib/actions/ for each: createCategory, updateCategory, deleteCategory, etc. All call requireAdmin() first.

G) Use sonner for toast notifications.

Stop after this. Walk me through testing each CRUD before moving on.
```

---

# PHASE 6 — AI Provider Adapter System

**Goal:** The pluggable translation engine with Gemini, Groq, OpenRouter, OpenAI, Anthropic providers. Prompt builder that combines tone + complexity + custom + context.

### Deliverables
- `lib/ai/types.ts` — `TranslationProvider` interface, input/output types
- `lib/ai/prompt-builder.ts` — assembles the final prompt
- `lib/ai/registry.ts` — provider lookup
- `lib/ai/providers/gemini.ts`
- `lib/ai/providers/groq.ts`
- `lib/ai/providers/openrouter.ts`
- `lib/ai/providers/openai.ts`
- `lib/ai/providers/anthropic.ts`
- `app/api/ai/test/route.ts` — used by the Test Connection button
- `app/api/translate/route.ts` — server endpoint for translating a single part

### Prompt Structure

```
SYSTEM:
You are a literary translator. Translate the user's text into {target_language_name} ({target_language_native}).

STYLE INSTRUCTIONS:
{tone.prompt_fragment}

COMPLEXITY:
{complexity_fragment}

{if custom_instructions}
ADDITIONAL INSTRUCTIONS:
{custom_instructions}
{/if}

{if previous_part_context}
PREVIOUS PART CONTEXT (for consistency in character names, terminology, and tone):
"""
{previous_part_context (last 1500 chars)}
"""

Maintain consistency with the above. Use the same translations for character names, place names, and recurring phrases.
{/if}

OUTPUT RULES:
- Preserve paragraph breaks exactly (one paragraph in = one paragraph out)
- Do not add any commentary or explanation
- Do not include the original text in your response
- Output ONLY the translation, nothing else
- If the input is short, the output should be short
- Keep dialogue marked as dialogue in the target language's convention

USER:
{the original text}
```

### Acceptance Criteria
- [ ] Calling `/api/translate` with a sample paragraph + tone="Premchand" + targetLang="hi" returns Hindi text in Premchand's style
- [ ] Test connection works for Gemini, Groq, and any other provider with a configured key
- [ ] Switching the default provider in admin UI changes which provider is used (no code change needed)
- [ ] Rate limit errors are retried with exponential backoff up to 3 times
- [ ] Each translation request creates a row in `translation_jobs` with timing and token counts

### Claude Code Prompt for Phase 6

```
Phase 6: AI provider adapter system.

This is critical — get the architecture right so adding new providers later is one-file changes.

A) Install SDKs:
   - npm install @google/genai groq-sdk openai @anthropic-ai/sdk
   - (No SDK for OpenRouter — uses OpenAI-compatible REST)

B) lib/ai/types.ts:
   - Export TranslationProvider interface (translate, name, supportedModels)
   - Export TranslationInput, TranslationOutput types as specified in requirements doc §3.4
   - Export ProviderError class with retry-able flag

C) lib/ai/prompt-builder.ts:
   - export buildTranslationPrompt(input: TranslationInput, targetLangMeta): { system: string; user: string }
   - Uses the exact template shown in implementation plan §Phase 6
   - The complexity argument maps to one of 5 fixed fragments (define them as a const map in lib/ai/complexity.ts)
   - previousPartContext is truncated to the last 1500 chars
   - Returns { system, user } object so providers can use them per their API format

D) lib/ai/providers/gemini.ts:
   - Class GeminiProvider implementing TranslationProvider
   - Uses @google/genai package
   - Models: 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash'
   - In translate(): combines system+user into one prompt (Gemini handles instructions inline)
   - Returns tokensUsed from response.usageMetadata
   - Throws ProviderError with isRetryable=true for 429s, 503s, network errors

E) lib/ai/providers/groq.ts:
   - Uses groq-sdk
   - Models: 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'
   - Standard OpenAI-style chat completions with system+user messages
   - Same retry-able error semantics

F) lib/ai/providers/openrouter.ts:
   - REST call to https://openrouter.ai/api/v1/chat/completions
   - OpenAI-compatible payload
   - Models: 'google/gemini-2.0-flash-exp:free', 'meta-llama/llama-3.3-70b-instruct:free', etc — fetch the list dynamically if possible, otherwise hardcode a few free ones

G) lib/ai/providers/openai.ts and anthropic.ts:
   - Skeleton implementations using their SDKs
   - Models: gpt-4o-mini, gpt-4o for OpenAI; claude-sonnet-4-5, claude-haiku-4-5 for Anthropic
   - These won't be tested in Phase 1 (paid only) but should be wired up

H) lib/ai/registry.ts:
   - export function getProvider(name: string): TranslationProvider
   - Returns the singleton instance of the requested provider
   - Throws if the API key isn't set
   - Export function getAvailableProviders() that returns the list of providers whose API keys are present in env

I) lib/ai/retry.ts:
   - Helper: async function withRetry<T>(fn, opts) — 3 attempts with 1s, 3s, 9s delays
   - Only retries on ProviderError where isRetryable is true

J) app/api/translate/route.ts (POST):
   - Body: { storyPartId, providerName?, modelName? }
   - Server-only: requireAdmin first
   - Fetches the story_part + its story + tone from DB
   - Builds previousPartContext from the previous part's text_translated (if exists)
   - Updates story_part.status = 'translating'
   - Calls provider.translate() with withRetry wrapper
   - On success: updates story_part.text_translated, status='completed', creates a version row
   - On failure: status='failed', error_message saved
   - Creates translation_jobs entries for each attempt
   - Returns { success, translatedText, error?, tokensUsed?, durationMs? }

K) app/api/ai/test/route.ts (POST):
   - Body: { providerName, modelName }
   - Sends a tiny test prompt: "Translate to Hindi: 'Hello, world.'"
   - Returns { result, latencyMs, tokensUsed }
   - Used by the AI config page's Test Connection button

Important:
- All routes are server-only, use service role client when DB writes are needed
- Never log full API keys in errors
- Stream responses are NOT needed in Phase 1 (we wait for full completion per part)

Stop after this. We'll wire it into the UI in Phase 7.
```

---

# PHASE 7 — Admin: Story Creation, Parts, Translation

**Goal:** The end-to-end story translation workflow with live progress.

### Deliverables
- `app/admin/stories/page.tsx` — story list with filters, search, status, etc.
- `app/admin/stories/new/page.tsx` — new story form (multi-step)
- `app/admin/stories/[id]/page.tsx` — edit/translate/manage a story
- `components/admin/StoryForm.tsx`
- `components/admin/PartEditor.tsx` — manage parts (add, reorder, delete, edit)
- `components/admin/BulkImportDialog.tsx` — paste with `---` separators
- `components/admin/TranslationProgress.tsx` — live progress UI
- `components/admin/VersionHistory.tsx` — diff view per part
- ImageKit upload integration

### Translation Flow Detail

When admin clicks "Translate All Parts":
1. Client sends POST to `/api/translate/queue` with `storyId`
2. Server enqueues all `pending` parts in order
3. **Streaming response** (Server-Sent Events or response stream) emits events per part:
   - `{ type: 'part_started', partNumber: 1 }`
   - `{ type: 'part_completed', partNumber: 1, translatedText: '...' }`
   - `{ type: 'part_failed', partNumber: 2, error: '...' }`
   - `{ type: 'queue_done', completed: N, failed: M }`
4. Client UI shows progress in real-time
5. Admin can click "Cancel" → server stops after current part finishes

### Acceptance Criteria
- [ ] Admin creates a 4-part Hindi story (translated from English) with Premchand tone, clicks Translate, watches all 4 parts complete live
- [ ] Admin re-translates only Part 2 — Parts 1, 3, 4 untouched
- [ ] Admin edits Part 3's translation manually — version history shows both versions
- [ ] Admin uploads a cover image — appears in story list
- [ ] Bulk import: paste a story with `---` separators, system splits correctly

### Claude Code Prompt for Phase 7

```
Phase 7: Admin story creation, parts management, and translation execution.

This is the biggest phase. Build it in sub-steps. Tell me when each sub-step is done so I can test before continuing.

SUB-STEP 7.1: Story listing page
- app/admin/stories/page.tsx
- Table: cover thumb, title (original / translated), subcategory, target language, tone, status, parts (translated/total), updated at, actions
- Filters: category, subcategory, target language, status (draft/published), provider used
- Search by title
- Pagination (20 per page)

SUB-STEP 7.2: New story form
- app/admin/stories/new/page.tsx
- Multi-step UI (use shadcn/ui Tabs or a stepper):
  Step 1: Metadata (title_original, author, source_url, subcategory, target language, tone, complexity, custom instructions, ai provider/model)
  Step 2: Cover image upload (ImageKit — see SUB-STEP 7.5)
  Step 3: Parts entry (manual add OR bulk import)
  Step 4: Review & save as draft
- "Save Draft" creates the story + parts (status='pending'), redirects to /admin/stories/[id]

SUB-STEP 7.3: Story edit/translate page
- app/admin/stories/[id]/page.tsx
- Top: metadata edit (in-place editable fields)
- Middle: Parts list, each part is a card with:
  - Part label (editable)
  - Status badge (pending/translating/completed/edited/failed)
  - Two-column view: original (left, read-only) | translated (right, editable textarea)
  - Per-part actions: Translate (if pending), Re-translate, Edit, Version History, Delete
- Top-right: big "Translate All Pending" button
- Bottom: Publish/Unpublish toggle, Delete story, Save (auto-save on blur)
- Provider/model selector at top can override the story's default per-translation

SUB-STEP 7.4: Translation streaming + progress UI
- Create app/api/translate/queue/route.ts (POST):
  - Body: { storyId, fromPartNumber? } (fromPartNumber for "Resume")
  - Uses Response with ReadableStream (Server-Sent Events format)
  - Iterates pending parts in order, calls the translation logic from Phase 6 per part
  - Emits events: part_started, part_progress, part_completed, part_failed, queue_done, queue_error
  - Each event is a JSON line: `data: {...}\n\n`
  - Handles cancellation via AbortController
- components/admin/TranslationProgress.tsx:
  - Uses fetch() with reader.read() to consume the stream
  - Shows per-part status icons updating live
  - Shows current part's accumulated text as it arrives (optional Phase 1.5; Phase 1 just shows completion)
  - Has a "Cancel" button that aborts the request

SUB-STEP 7.5: ImageKit upload
- lib/imagekit/upload.ts: helper to upload a file via the server-side SDK (install `imagekit` npm package)
- app/api/upload/route.ts:
  - POST, multipart/form-data, requireAdmin
  - Receives a File, validates size (<2MB), validates mime type (image/jpeg, png, webp)
  - Uploads to ImageKit folder `/qissa/covers/`
  - Returns { url, fileId }
- In story form, image upload uses this endpoint, stores returned URL in stories.cover_image_url

SUB-STEP 7.6: Bulk import dialog
- components/admin/BulkImportDialog.tsx
- Big textarea
- "Split by separator" input (default `---`)
- Preview: shows the detected parts with labels
- "Confirm & Add" replaces the form's parts array

SUB-STEP 7.7: Version history
- components/admin/VersionHistory.tsx
- Dialog showing list of versions (newest first) with: version number, created_at, source (AI/admin), provider used
- "View" shows the version's text
- "Restore" copies that version to current text_translated and creates a new version row
- "Diff" shows side-by-side comparison with current

Important details:
- All mutations are Server Actions or API routes that use the admin Supabase client (service role) and call requireAdmin
- Use optimistic UI updates where safe (e.g., status badge updates immediately on translate click)
- Word counts auto-recompute on save (lib/utils/word-count.ts handles all languages — split on whitespace + remove punctuation)
- Estimated reading time: ~200 words/min for most languages; adjust per language config later
- Save story_part.status updates after each translation so a refresh shows correct state

Stop after each sub-step and tell me to test. Don't proceed until I confirm.
```

---

# PHASE 8 — Reader: Public Pages (Home, Browse, Story Landing)

**Goal:** The public-facing browse experience. No reader yet — just the pages that lead up to it.

### Deliverables
- `app/(public)/page.tsx` — home with featured stories + categories
- `app/(public)/c/[category]/page.tsx` — category page (subcategories grid)
- `app/(public)/c/[category]/[subcategory]/page.tsx` — story listing under a subcategory
- `app/(public)/s/[storyId]/page.tsx` — story landing page (cover, meta, parts list, "Start Reading")
- `app/(public)/search/page.tsx`
- `app/(public)/bookmarks/page.tsx`
- `components/shared/StoryCard.tsx`
- `components/shared/CategoryTile.tsx`
- `components/shared/SearchBar.tsx`
- Lazy loading on story lists (Intersection Observer)
- Font loading per page based on story's target language

### Acceptance Criteria
- [ ] Home shows latest 8 published stories + clickable category tiles
- [ ] Tapping a category shows its subcategories
- [ ] Tapping a subcategory shows its stories
- [ ] Search by title works (Postgres ILIKE on both title fields)
- [ ] Story landing page shows cover, meta, parts list with read/unread status from localStorage
- [ ] Bookmarks page shows bookmarked stories (from localStorage)
- [ ] All pages render server-side (fast first paint on slow phones)
- [ ] Mobile-first: looks great on 320px width

### Claude Code Prompt for Phase 8

```
Phase 8: Public reader pages (browse, search, story landing — but NOT the reader itself yet).

A) app/(public)/layout.tsx:
   - Mobile-first shell with bottom navigation (Home, Browse, Search, Bookmarks)
   - Auto-hides bottom nav on /s/[id]/p/[n] (reader) — for now just a global flag
   - Top: small Qissa logo, install PWA banner (only after user has read ≥1 story; use localStorage flag `qissa:installPromptDismissed`)

B) app/(public)/page.tsx (Home):
   - Hero: "Stories, translated with soul." (or similar) + search bar
   - Section: "Continue Reading" — shows last-read story from localStorage if exists
   - Section: "Recently Published" — 8 latest stories (Server Component, server-fetches)
   - Section: "Browse by Category" — top-level categories as tiles with emoji icons

C) app/(public)/c/[categorySlug]/page.tsx:
   - Title, subcategories listed as cards with story count
   - 404 if category doesn't exist or inactive

D) app/(public)/c/[categorySlug]/[subcategorySlug]/page.tsx:
   - Story grid (2 cols on mobile, 3-4 on tablet, responsive)
   - Filters in a collapsible top bar: target language (multi-select), tone (multi-select), sort (newest/oldest)
   - Lazy load more via IntersectionObserver — initial 20, load 20 more on scroll
   - URL state for filters (so back button works)

E) app/(public)/search/page.tsx:
   - Query param ?q=
   - Server-side search via Postgres: WHERE title_original ILIKE %q% OR title_translated ILIKE %q%
   - Results in same grid format

F) app/(public)/s/[storyId]/page.tsx:
   - Cover image (16:9), title (translated), author, target language flag/badge, tone used
   - Meta: total parts, estimated reading time, published date
   - Big primary button: "Start Reading" → /s/[id]/p/1
   - Parts list: numbered, each with label + word count + read status icon (read/unread/in-progress from localStorage key qissa:progress:{storyId}:{partNum})
   - "Show original" toggle (Phase 1.5 detail; Phase 1 just toggles between showing translated vs original title here)
   - Bookmark heart button (top right)
   - Share button (Web Share API; fallback: copy link)

G) app/(public)/bookmarks/page.tsx:
   - Reads qissa:bookmarks from localStorage (client component or rendered via 'use client')
   - Fetches those stories from Supabase
   - Same grid as subcategory page

H) components/shared/StoryCard.tsx:
   - Cover (lazy-loaded, with ImageKit transformation params for size: w-400)
   - Title (translated, in target language font), original title (smaller, muted)
   - Tone name badge
   - Reading time + parts count
   - Click → /s/[storyId]

I) Font loading strategy:
   - lib/i18n/fonts.ts: a function getFontStackForLanguage(code) returning CSS family
   - In app/layout.tsx: load critical fonts (Inter, Lora) via next/font
   - For story-specific fonts: use next/font with display: 'swap' and load language-specific font in the story page only

J) Performance:
   - All these pages are Server Components, fetching data via server Supabase client
   - Use Next.js's `revalidate` (e.g., revalidate: 60) for ISR-like behavior
   - Images use ImageKit URLs with `tr:` transformation params for size + WebP

Stop after this. I'll test browse flow before we build the reader.
```

---

# PHASE 9 — Reader: The Reading Experience

**Goal:** The reader page at `/s/[id]/p/[n]` — the heart of the product. Themes, fonts, controls, progress, offline, RTL support.

### Deliverables
- `app/(public)/s/[storyId]/p/[partNumber]/page.tsx`
- `components/reader/ReaderShell.tsx` (client component wrapping the content)
- `components/reader/ReaderSettings.tsx` (slide-up panel)
- `components/reader/ThemeSwitcher.tsx`
- `components/reader/FontControls.tsx`
- `components/reader/ProgressBar.tsx`
- `components/reader/AutoHideChrome.tsx`
- `lib/reader/themes.ts` (5 themes as CSS variable sets)
- `lib/reader/progress.ts` (localStorage helpers)
- `lib/reader/bookmarks.ts`
- `lib/reader/font-size.ts`
- RTL support via `dir="rtl"` attribute on story body
- Pinch-to-zoom font sizing (touch events)
- "Show original" toggle

### Acceptance Criteria
- [ ] Reader loads instantly (story content is server-rendered)
- [ ] All 5 themes work and persist
- [ ] Font A+/A- buttons resize text smoothly (14px → 32px range)
- [ ] Pinch-to-zoom works on mobile
- [ ] Reading progress saves every 5 seconds, restores on revisit
- [ ] Previous/Next part navigation works
- [ ] Chrome auto-hides after 3s, taps to reappear
- [ ] Urdu/Arabic stories render RTL with correct fonts
- [ ] "Show original" reveals original text below each paragraph
- [ ] Story works offline if previously visited (service worker test)

### Claude Code Prompt for Phase 9

```
Phase 9: The Reader — the core reading experience.

This is the showpiece. Take time to make it polished.

A) app/(public)/s/[storyId]/p/[partNumber]/page.tsx:
   - Server Component
   - Fetches the story, the specific part, the language metadata, the tone
   - 404 if part doesn't exist or story isn't published
   - Loads the language-specific font via next/font dynamically
   - Renders <ReaderShell> with the part data
   - Sets <html dir="..."> via Next.js generateMetadata? No, set on the article element instead

B) components/reader/ReaderShell.tsx ('use client'):
   - Manages: current theme, font size, line height, font choice (sans/serif), show-original toggle
   - All state initialized from localStorage with safe defaults
   - All state changes persist immediately
   - Listens for chrome-hide timer (3s inactivity)
   - Layout:
     - <ChromeTop>: back button, part X of N, settings gear, share, bookmark heart
     - <article dir={lang.direction}>: paragraph-by-paragraph rendering
       - If showOriginal: each translated paragraph followed by its original (smaller, muted, different language font)
     - <ChromeBottom>: prev part button, progress dot, next part button
     - <FloatingFontControls>: A- / A+ buttons bottom-right, fade out when not interacted
     - <ProgressBar>: thin bar at top showing scroll progress within current part
     - <ReaderSettings>: slide-up sheet (shadcn/ui Sheet component)
   - All chrome auto-hides via single state isChromeVisible toggled by activity

C) lib/reader/themes.ts:
   - Export 5 themes as objects with CSS variable names:
     - day: { '--bg': '#FFFFFF', '--fg': '#1A1A1A', '--accent': '#4F46E5', '--muted': '#666666', '--chrome-bg': '#FFFFFF', ... }
     - sepia: { '--bg': '#F4ECD8', '--fg': '#5B4636', ... }
     - night: { '--bg': '#0A0A0A', '--fg': '#E8E8E8', ... }
     - gray: { '--bg': '#1A1B26', '--fg': '#A9B1D6', ... }
     - focus: { '--bg': '#FFFFFF', '--fg': '#000000', '--muted': '#DDD', ... } (paragraphs except current have opacity 0.3 via CSS)
   - applyTheme(themeName) sets these on document.documentElement.style

D) components/reader/FontControls.tsx:
   - Floating buttons bottom-right (or bottom-center on very narrow screens)
   - A- decreases font size, A+ increases (range 14-32px, step 2px)
   - Display fades after 3s of no interaction; reappears on touch
   - Setting persists to localStorage key 'qissa:fontSize'

E) Pinch-to-zoom:
   - Listen to touchstart, touchmove with 2 fingers
   - Calculate distance between fingers, compare to initial → scale factor
   - Apply to font size with smoothing
   - Use lib/reader/font-size.ts as the central state owner

F) RTL support:
   - <article dir={lang.direction}> handles direction
   - In RTL mode: previous-part button on right, next-part on left (swap automatically using CSS logical properties: paddingInlineStart etc.)
   - Test with Urdu and Arabic samples

G) Show original toggle:
   - When ON: render translated text and original text alternating, paragraph by paragraph
   - Original text in a muted color and smaller font, in source language font (use lib/i18n/fonts.ts)
   - Toggle is in ReaderSettings panel
   - State persists

H) Progress tracking:
   - lib/reader/progress.ts:
     - saveProgress(storyId, partNum, scrollRatio)
     - getProgress(storyId, partNum): { scroll: number, updatedAt: string } | null
     - getLastReadStory(): the most recently progressed story for "Continue Reading"
   - Save every 5 seconds via setInterval, also on visibilitychange (when user backgrounds the tab)
   - Restore scroll position on mount (with a delay to let content render)
   - Top progress bar reflects current scroll position

I) Bookmarks:
   - lib/reader/bookmarks.ts: get/add/remove from localStorage 'qissa:bookmarks' (array of storyIds)
   - Heart button toggles, optimistic update, brief toast

J) Prev/Next navigation:
   - If current part is last, "Next" disabled and shows "End of story" message
   - If current part is first, "Prev" disabled
   - Use Next.js Link with prefetch=true for instant navigation

K) Auto-scroll detection for chrome:
   - useEffect: listener on scroll, touch, mousemove → reset 3s timer → set isChromeVisible=true
   - On timer expiry → setIsChromeVisible(false)
   - Tapping the article body toggles chrome too

L) Reduced motion / accessibility:
   - Use prefers-reduced-motion media query
   - All transitions short (150ms)
   - Tab order: top chrome → article → bottom chrome
   - Aria labels on all icon buttons

M) Performance:
   - The reader page must hit FCP < 1.5s on a 4G connection
   - Server-rendered HTML contains the full story text (no client-side fetch needed for content)
   - Minimal JS — only the client component for state/persistence

Use shadcn/ui Sheet for the settings panel, Button for controls, Toggle for boolean settings.

Stop after this. Test thoroughly on real mobile devices (Chrome DevTools mobile mode is OK for first pass).
```

---

# PHASE 10 — PWA, Offline, Polish, Deployment

**Goal:** Make Qissa installable, offline-capable, performant. Deploy to Vercel. Final polish.

### Deliverables
- `public/manifest.json` (or `app/manifest.ts`)
- App icons in `public/icons/` (multiple sizes)
- Service worker via `next-pwa` or Serwist
- Offline fallback page
- Caching strategies (stale-while-revalidate for stories, network-first for admin)
- Install prompt component
- Vercel deployment + env vars configured
- Lighthouse audit + fixes

### Acceptance Criteria
- [ ] Site shows "Install" option in Chrome on Android
- [ ] After installing, the icon appears on home screen and opens fullscreen
- [ ] Previously visited stories work offline (airplane mode test)
- [ ] Service worker registers and caches assets
- [ ] Lighthouse mobile: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 90, PWA ≥ 90
- [ ] Deployed to Vercel with production URL
- [ ] All env vars set in Vercel dashboard
- [ ] Custom domain (if you have one) connected

### Claude Code Prompt for Phase 10

```
Phase 10: PWA setup, offline support, polish, and deployment.

A) PWA with Serwist (modern, Next.js 16 compatible):
   - npm install @serwist/next serwist
   - Configure next.config.ts to wrap with withSerwist
   - Create app/sw.ts as the service worker entry
   - Caching strategy:
     * Static assets: cache-first
     * /s/[id]/* (story pages): stale-while-revalidate
     * /api/*: network-only (never cache)
     * /admin/*: network-only (admin must be live)
     * ImageKit images: cache-first with 30-day expiration
   - Offline fallback page at app/(public)/offline/page.tsx

B) Manifest:
   - app/manifest.ts (Next.js typed manifest)
   - name: "Qissa", short_name: "Qissa"
   - theme_color: "#4F46E5" (or your chosen color)
   - background_color: "#FFFFFF"
   - display: "standalone"
   - icons: 192x192, 512x512, maskable 512x512 (placeholder icons OK — generate from a simple "Q" letter on indigo background, you can replace later)
   - start_url: "/"

C) Icons:
   - Use a simple generated SVG with "Q" letter, white on indigo
   - Generate PNG sizes 192, 512, and maskable 512
   - Place in public/icons/
   - For real launch, recommend the user create proper icons via realfavicongenerator.net

D) Install prompt:
   - components/shared/InstallPrompt.tsx ('use client')
   - Captures the beforeinstallprompt event
   - Shows a dismissable banner: "Install Qissa for offline reading 📖"
   - Only shows if: localStorage 'qissa:installPromptDismissed' not set AND user has read ≥1 story (track via 'qissa:storiesRead' counter)
   - On click: deferredPrompt.prompt(), then mark dismissed
   - On X click: mark dismissed for 7 days

E) Performance pass:
   - Audit with: npx @lhci/cli autorun (or run Lighthouse in DevTools)
   - Fix any quick wins:
     * Add width/height to all images (no CLS)
     * Preload hero font
     * Remove unused Tailwind classes (purge config)
     * Compress images
   - Verify mobile Performance ≥ 90 on /, /s/[someId], /s/[id]/p/1

F) SEO basics:
   - Per-page metadata via generateMetadata
   - OpenGraph image: for now, use cover image; default fallback at /public/og-default.png
   - sitemap.ts at app root listing published stories
   - robots.ts allowing public pages, disallowing /admin
   - JSON-LD Article schema on story pages

G) Error handling:
   - app/(public)/error.tsx and app/admin/error.tsx — friendly error UI
   - app/not-found.tsx — friendly 404

H) Deployment to Vercel:
   - Walk me through: connect GitHub repo to Vercel → import qissa
   - Set all env vars in Vercel dashboard (provide a checklist matching .env.example)
   - Set production branch to main
   - Deploy
   - Verify production URL works
   - Set NEXT_PUBLIC_APP_URL to the production URL and redeploy

I) Post-deploy verification:
   - Visit production URL in mobile browser
   - Install as PWA
   - Try offline access
   - Run Lighthouse on production
   - Test admin login on production (note: admin user already exists in Supabase from Phase setup)

J) README.md final pass:
   - Project description
   - Tech stack
   - Local development setup
   - Deployment notes
   - Architecture diagram (ASCII or link to a diagram image)
   - Adding a new AI provider — explain the one-file pattern

Stop after this. Qissa is live.
```

---

## Post-Launch Quick Wins (Phase 1.5)

After the MVP is live, these are high-value next steps:

1. **Glossary auto-extraction** — Run a small LLM call after translation to extract named entities and persist them per story; pass to subsequent parts as a "glossary" section in the prompt
2. **Cost tracking dashboard** — Sum tokens by provider, show monthly estimate
3. **Better cover image management** — Crop/edit before upload, generate OG variants
4. **Translation comparison** — Run same part through 2 providers side by side, admin picks the better one
5. **Per-paragraph alignment** — Match original and translated paragraphs strictly for the "Show original" view, with click-to-sync scrolling

---

## Critical Tips for Working with Claude Code

1. **Feed it one phase at a time** — paste the phase prompt, let it execute fully, test, then move on
2. **Don't approve sweeping changes without reading** — Claude Code shows file diffs; skim them
3. **When something breaks, paste the exact error** — Claude Code is excellent at debugging when given full stack traces
4. **For UI tweaks, reference shadcn/ui components by name** — "use the shadcn Sheet component for the settings panel" vs vague "make a slide-up panel"
5. **Commit frequently** — after each sub-step. If Claude Code goes off the rails, you can `git checkout` back
6. **Save your env vars in Vercel before the first deploy** — otherwise the deploy fails and you debug for an hour
7. **The Supabase service role key is secret** — never paste it into a client component, never log it, never commit it
8. **Test on a real cheap Android phone before declaring done** — emulators lie

---

## Total Build Estimate

| Phase | Estimated time |
|---|---|
| 1. Bootstrap | 1 hour |
| 2. Supabase clients | 1 hour |
| 3. Schema & migrations | 2-3 hours |
| 4. Auth | 2 hours |
| 5. Admin CRUD | 4-5 hours |
| 6. AI providers | 4-5 hours |
| 7. Story workflow | 6-8 hours |
| 8. Public pages | 4-5 hours |
| 9. Reader | 5-7 hours |
| 10. PWA + deploy | 3-4 hours |
| **Total** | **32-41 hours** |

Spread across 2-3 weeks of evenings/weekends — very achievable.

---

## What "Done" Looks Like

When Phase 10 acceptance criteria all pass, you'll have:

- A live Qissa instance on a Vercel URL (or your domain)
- One admin (you) able to log in, create stories, translate with AI, edit, publish
- Anyone in the world able to visit, browse, install as PWA, read offline
- A clean codebase that adds new AI providers in one file
- Free hosting and free AI translation as long as you stay in free tiers
- A foundation to add user accounts, comments, TTS, and other Phase 2 features without rewrites

Good luck. Ship it.

---

**End of implementation plan.**
