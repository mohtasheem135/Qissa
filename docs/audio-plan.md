# Qissa — Text-to-Speech (Audio Narration) Feature Plan

## Context

Qissa is a fully shipped Phase-1 reading PWA where an admin curates stories and translates
them into Indic/RTL languages via a pluggable AI **translation** provider adapter. Readers get
a Kindle-grade reading experience. TTS is listed as the headline Phase-2 idea (future-plan §3.1)
and is the next feature the user wants.

**Goal — three connected capabilities:**
1. **Reader "Listen to this page"** — a control in the reader that narrates the *current part*.
   Where the admin has pre-generated premium audio, it plays that stored MP3; otherwise it falls
   back to the device's free **Web Speech API** so Listen *always works*.
2. **Admin TTS settings page** (`/admin/tts-config`) — pick/configure TTS providers behind a
   pluggable adapter that mirrors the existing 5-provider translation adapter + `/admin/ai-config`.
   First providers: **Sarvam AI** (Indic-focused) + **ElevenLabs** (multilingual).
3. **Admin "convert to voice" workflow** — per translation variant, choose a voice and generate
   per-part audio (a queue mirroring the SSE translate queue), with per-part preview + re-generate.

**Locked decisions (from user):**
- Free fallback = **Web Speech API** (client, no key, no storage) + stored premium audio.
- Audio storage = **Cloudflare R2** (zero egress, 10 GB free) — audio is egress-dominated, so R2's
  cost model fits where ImageKit's metered bandwidth does not. ImageKit stays **images-only**.
- Store a provider-agnostic `audio_path` (mirrors the path-only ImageKit cover decision) so the
  backing store can later swap R2→S3 as a config change with no migration.

This feature is a near-exact **mirror of the existing translation pipeline**. Reuse, don't reinvent:
the `TranslationProvider`/registry shape, `withRetry`, `runStoryPartTranslation`, the SSE queue
route + client reader, the `ai_config` singleton, the `VariantPanel`/`PartCard` admin UI, the
`ReaderChrome` mount points, and the cached-snapshot localStorage store pattern.

---

## Prerequisites (user-provided; cannot be done in-session)

- **Env keys:** `SARVAM_API_KEY`, `ELEVENLABS_API_KEY`.
- **Cloudflare R2:** create a bucket with public access, then set `R2_ACCOUNT_ID`,
  `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, and `NEXT_PUBLIC_R2_PUBLIC_URL`
  (the `pub-<hash>.r2.dev` URL or a custom Cloudflare domain).
- **Dependency:** `npm i @aws-sdk/client-s3` (R2 is S3-compatible).
- **DB push** for the new migration — only on explicit user OK (per repo rule).

---

## Architecture (new modules, mirroring existing ones)

### 1. Storage — Cloudflare R2 (`lib/r2/`)
- `lib/r2/upload.ts` → `uploadAudio({ buffer, key, contentType }): Promise<{ path }>` via
  `@aws-sdk/client-s3` `PutObjectCommand`. Mirrors [lib/imagekit/upload.ts](./lib/imagekit/upload.ts) (returns **path only**).
- `lib/r2/url.ts` → `audioUrl(path): string` composing `${NEXT_PUBLIC_R2_PUBLIC_URL}/${path}`.
  Mirrors [lib/imagekit/url.ts](./lib/imagekit/url.ts) decoupling.
- Key convention: `audio/<variantId>/<partNumber>-<voiceId>.mp3`.

### 2. TTS provider adapter (`lib/tts/`) — mirrors `lib/ai/`
- `lib/tts/types.ts` — `TtsProvider { id; name; synthesize(input, voiceId): Promise<TtsOutput> }`,
  `TtsInput { text; languageCode; voiceId }`, `TtsOutput { audio: Uint8Array; mimeType;
  durationSeconds?; characters; voiceUsed; provider }`. **Reuse `ProviderError` + `withRetry`** from
  [lib/ai/types.ts](./lib/ai/types.ts) + [lib/ai/retry.ts](./lib/ai/retry.ts) (both generic) rather than duplicating.
- `lib/tts/registry.ts` — `TtsProviderId = "sarvam" | "elevenlabs"`, `TTS_PROVIDERS` meta with
  `envKey` (`SARVAM_API_KEY`, `ELEVENLABS_API_KEY`), `isTtsProviderConfigured(id)`,
  `getConfiguredTtsProviders()`, `getTtsProvider(id)` (lazy + cached). Curated **voice catalog**
  in code keyed by `(provider, languageCode)` — `TtsVoice { id; name; languageCodes; gender }` +
  `getVoicesForLanguage(provider, lang)`. (Code catalog mirrors how model lists live in the
  registry today — no DB voices table needed in v1.)
- `lib/tts/providers/sarvam.ts` — `POST https://api.sarvam.ai/text-to-speech` (`target_language_code`,
  `speaker`); decode base64 audio. `lib/tts/providers/elevenlabs.ts` —
  `POST https://api.elevenlabs.io/v1/text-to-speech/{voiceId}`; read audio bytes. Each maps SDK/HTTP
  errors to `ProviderError(isRetryable)` exactly like [lib/ai/providers/gemini.ts](./lib/ai/providers/gemini.ts).
- `lib/tts/synthesize.ts` → `synthesize(providerId, input, { voiceId, retry })` =
  `getTtsProvider` + `withRetry`. Mirrors [lib/ai/translate.ts](./lib/ai/translate.ts).

### 3. Run pipeline (`lib/tts/run-part.ts`) — mirrors `lib/translation/run-part.ts`
- `runStoryPartAudio(storyPartTranslationId, { voiceId?, providerId?, signal })`:
  1. Load `story_part_translations` row (must have `text`, status `completed`/`edited`) + parent
     `story_variants` (`target_language`, `tts_provider`, `tts_voice_id`).
  2. Resolve provider/voice: explicit override → variant defaults → `tts_config` singleton.
     Validate `isTtsProviderConfigured`.
  3. Upsert `story_part_audio` row → status `generating`.
  4. `withRetry(provider.synthesize(...))` → audio bytes (log attempts to `tts_jobs`).
  5. `uploadAudio(...)` to R2.
  6. Update `story_part_audio` (status `completed`, `audio_path`, `duration_seconds`, `byte_size`,
     `characters`); insert `tts_jobs` success. On failure → status `failed` + `error_message`.
  - Returns a `{ ok }` union like `RunPartResult`. Failures never throw out of the route.

### 4. API routes (`app/api/tts/`) — mirror `app/api/translate/`
- `POST /api/tts` — `{ storyPartTranslationId, voiceId?, providerName? }` → `requireAdmin()` →
  `runStoryPartAudio`. Mirrors [app/api/translate/route.ts](./app/api/translate/route.ts).
- `POST /api/tts/queue` — SSE `ReadableStream`; body `{ variantId, voiceId?, providerName?,
  fromPartNumber? }`. Iterates translation rows that have text; emits `queue_started` /
  `part_started` / `part_completed { audioUrl, durationSeconds }` / `part_failed` / `queue_done`.
  `AbortController` via `request.signal`. Mirrors [app/api/translate/queue/route.ts](./app/api/translate/queue/route.ts) exactly.
- `POST /api/tts/test` — `{ providerName, voiceId? }` → synthesize a short sample, return
  base64 audio + latency. Mirrors [app/api/ai/test/route.ts](./app/api/ai/test/route.ts).

### 5. Admin TTS config page — mirrors `ai-config`
- `app/admin/(protected)/tts-config/page.tsx` — load `tts_config` singleton + configured providers
  + voice catalog → render `TtsConfigForm`.
- `components/admin/TtsConfigForm.tsx` — provider Select (unconfigured disabled with
  "Missing SARVAM_API_KEY" hint), default-voice Select (per language), **Test Connection** card
  that POSTs `/api/tts/test` and plays the returned sample in an inline `<audio>`.
- `lib/actions/tts-config.ts` → `saveTtsConfig` server action updating the pinned singleton
  (mirrors [lib/actions/ai-config.ts](./lib/actions/ai-config.ts)).
- Add a **"TTS / Voices"** entry to [components/admin/SidebarNav.tsx](./components/admin/SidebarNav.tsx) (reused by `MobileAdminNav`).

### 6. Admin per-variant audio generation — extend existing components
- `components/admin/VariantPanel.tsx` — add an **Audio** section: voice picker (Select filtered by
  `variant.target_language` + provider), "Generate audio (N pending)" button → `/api/tts/queue`
  reusing the panel's existing SSE-reader `runQueue` pattern (parameterized for TTS), Cancel via
  `AbortController`. Persist the variant's voice via new `setVariantVoice` action in
  [lib/actions/story-variants.ts](./lib/actions/story-variants.ts) (writes `story_variants.tts_provider` + `tts_voice_id`).
- `components/admin/PartCard.tsx` — add per-part audio status badge (none/generating/ready/failed),
  a small ▶ preview player for the generated file, and a "Generate"/"Re-generate" button → `/api/tts`.
- `app/admin/(protected)/stories/[id]/page.tsx` — extend the variant query to join `story_part_audio`
  per translation row so panels/cards render current audio state.
- `CreateVariantDialog` voice field is **optional/deferred** — voice is chosen in `VariantPanel`.

### 7. Reader "Listen" control
- `app/(public)/s/[storyId]/[variantSlug]/p/[partNumber]/page.tsx` — also fetch the completed
  `story_part_audio` row for this translation; pass `audioUrl` (+ existing `targetLanguage`,
  `textTranslated`) into `ReaderShell` → `ReaderChrome`.
- New `components/reader/ListenButton.tsx`, mounted in [ReaderChrome](./components/reader/ReaderChrome.tsx) top bar (right of the
  variant Select, left of Settings — confirmed mount point):
  - `audioUrl` present → play the stored R2 MP3 via a controlled `<audio>` (play/pause/seek/speed).
  - else → **Web Speech API** fallback (`speechSynthesis` + `SpeechSynthesisUtterance`), voice
    matched to `targetLanguage`, play/pause/stop.
- `lib/reader/speech.ts` — SSR-safe helper: pick a `SpeechSynthesisVoice` for a language code,
  chunk long text (Web Speech length limits), manage the utterance queue.
- (Optional, minimal) `lib/reader/audio.ts` playback-position store using the cached-snapshot +
  `qissa:audio-changed` CustomEvent pattern from [lib/reader/highlights.ts](./lib/reader/highlights.ts).
- `public/sw.js` — add the R2 public hostname + `request.destination === "audio"` to the
  **cache-first** branch so premium audio replays offline (sets up future-plan §2.4).
- **Source reader Listen deferred** — source language isn't tracked per story (same reason
  tap-to-define is disabled there). v1 Listen is variant-readers only; note in docs.

### 8. Database — one new migration (`supabase migration new tts`)
- `tts_config` singleton (pinned id, like `ai_config`): `default_tts_provider`, `default_voice_id`,
  `updated_at`. Seed one row with `ON CONFLICT DO NOTHING`.
- `story_variants` — add `tts_provider text`, `tts_voice_id text`, `audio_status text` (nullable;
  variant-level voice choice, mirroring existing `ai_provider`/`ai_model`).
- `story_part_audio` — `id`, `story_part_translation_id` FK (unique), `variant_id`, `story_part_id`,
  `tts_provider`, `voice_id`, `status` ('pending'|'generating'|'completed'|'failed'),
  `audio_path`, `mime_type`, `duration_seconds`, `byte_size`, `characters`, `error_message`,
  timestamps. One audio per translation row (re-generate overwrites).
- `tts_jobs` — per-attempt log mirroring `translation_jobs`: `story_part_audio_id`,
  `story_part_translation_id`, `variant_id`, `attempt_number`, `status`, `tts_provider`, `voice_id`,
  `characters`, `duration_ms`, `error_message`, `created_at` (feeds a future cost dashboard).
- **RLS:** public read on `story_part_audio` for published+active variants — copy the
  `story_part_translations` "read translations of published variants" policy verbatim.
- Hand-add the new tables to the `lib/supabase/types.ts` Tables block so typecheck passes before
  `db push` (the established convention).

---

## Build order (provable at each phase)

- **Phase A — Foundation + Test Connection.** R2 helpers, `lib/tts/*` (types/registry/providers/
  synthesize), `/api/tts/test`, `tts_config` migration + `/admin/tts-config` page + Test Connection.
  Provable: configure a key, hit Test, hear a sample. No story coupling yet.
- **Phase B — Generation pipeline + admin UI.** Remaining migration (tables, variant columns, RLS),
  `lib/tts/run-part.ts`, `/api/tts` + `/api/tts/queue`, `VariantPanel`/`PartCard` audio UI +
  `setVariantVoice`. Provable: pick a voice, run the queue, watch PartCards flip, files land in R2.
- **Phase C — Reader Listen.** `ListenButton` (stored + Web Speech fallback), `lib/reader/speech.ts`,
  page fetch wiring, SW caching. Provable: published variant with audio plays MP3; without audio
  plays Web Speech.
- **Phase D — Docs.** Per CLAUDE.md doc-update rules (below).

---

## Files to create / modify (representative)

**Create:** `lib/r2/{upload,url}.ts`; `lib/tts/{types,registry,synthesize,run-part}.ts` +
`lib/tts/providers/{sarvam,elevenlabs}.ts`; `app/api/tts/{route,queue/route,test/route}.ts`;
`app/admin/(protected)/tts-config/page.tsx`; `components/admin/TtsConfigForm.tsx`;
`lib/actions/tts-config.ts` (+ `.types.ts` sibling); `components/reader/ListenButton.tsx`;
`lib/reader/speech.ts`; `supabase/migrations/<ts>_tts.sql`; docs (below).

**Modify:** `lib/actions/story-variants.ts` (`setVariantVoice`); `components/admin/{VariantPanel,
PartCard}.tsx`; `app/admin/(protected)/stories/[id]/page.tsx` (join audio); `components/admin/
SidebarNav.tsx`; `app/(public)/s/[storyId]/[variantSlug]/p/[partNumber]/page.tsx`;
`components/reader/{ReaderShell,ReaderChrome}.tsx`; `public/sw.js`; `lib/supabase/types.ts`.

**Reuse as-is:** `lib/ai/retry.ts` (`withRetry`), `lib/ai/types.ts` (`ProviderError`),
`lib/auth/check-admin.ts` (`requireAdmin`), the `VariantPanel` SSE-reader loop, the cached-snapshot
store pattern.

---

## Docs to update (CLAUDE.md doc-update rules)

- New `docs/INTERNALS/tts-provider-adapter.md` (mirror of `ai-provider-adapter.md`) + a storage note
  for `lib/r2/*`.
- New `docs/API/tts.md` (`/api/tts`, `/api/tts/queue` SSE, `/api/tts/test`).
- `docs/04-database.md` — new tables + RLS.
- `docs/ARCHITECTURE.md` — module map rows (`lib/tts`, `lib/r2`), a TTS pipeline section, and the
  ImageKit-images / R2-audio storage decision in §8.
- `docs/FEATURES.md` — reader Listen, admin TTS config, per-variant audio generation.
- `docs/UI/{reader,admin}.md` — Listen control + TTS config page / VariantPanel audio section.
- `docs/INTERNALS/reader-state.md` — `lib/reader/speech.ts` + optional audio store.
- `docs/INTERNALS/pwa-service-worker.md` — R2 host + audio cache-first rule.

---

## Verification

- `npm run typecheck && npm run lint && npm run build` clean (run `rm -rf .next` first after branch
  switches, per future-plan note).
- **Admin:** configure Sarvam + ElevenLabs keys → `/admin/tts-config` shows them as Configured →
  Test Connection plays a sample for each. On a published story with ≥2 variants: pick a voice, run
  "Generate audio", watch PartCard badges flip live, confirm objects appear in the R2 bucket and the
  per-part preview plays. Cancel mid-queue and confirm it stops at the next part boundary.
- **Reader:** open a variant *with* generated audio → Listen plays the stored MP3 (seek/pause work);
  open one *without* → Listen uses Web Speech in the right language. Test Chrome desktop + **iOS
  Safari + Android Chrome PWA** (Web Speech voice availability and the autoplay-needs-gesture rule
  differ per platform — the riskiest area).
- **Offline:** after playing premium audio once, airplane-mode reload replays it from the SW cache.
- **DB:** write the migration; **do not `db push` without explicit OK**; hand-add table types to
  `lib/supabase/types.ts`; document the post-merge `db push` in the commit/PR body.
- Branch off latest `main` as `feat/tts-audio-narration`; `feat(scope): …` commits; leave PR
  creation to the user.

---

## SETUP GUIDE — what you must provide, step by step

Do these **before Phase A code is testable**. Everything goes into `.env.local` (local dev) and,
later, Vercel project env vars (production). I will tell you exactly which file to paste into; you
never paste secrets into chat — put them in `.env.local` yourself.

### Step 1 — Sarvam AI key (Indic-language TTS)
1. Go to **https://dashboard.sarvam.ai/** and sign up (Google/email).
2. In the dashboard, open **API Keys** → **Create API Key** (some accounts also need a free
   "Subscription"/plan attached — pick the free tier).
3. Copy the key (looks like a long token). This is `SARVAM_API_KEY`.
4. Note their free-tier character/credit cap — TTS bills by characters; we log this in `tts_jobs`.

### Step 2 — ElevenLabs key (multilingual TTS)
1. Go to **https://elevenlabs.io/** → **Sign up** (free tier ≈ 10k characters/month).
2. Top-right avatar → **Profile / API Keys** → **Create API Key** (or copy the existing one).
3. Copy it. This is `ELEVENLABS_API_KEY`.
4. (Optional) Browse **Voices** → note any `voice_id`s you like; I'll also ship a curated default
   set in the code registry, so this is optional.

### Step 3 — Cloudflare R2 (audio storage, zero egress)
1. Create a free **Cloudflare account** at **https://dash.cloudflare.com/sign-up** (no card needed
   for the R2 free tier; some flows ask you to add a card to *enable* R2 but the 10 GB tier is free).
2. Left sidebar → **R2 Object Storage** → **Create bucket**. Name it e.g. `qissa-audio`.
   - This bucket name is `R2_BUCKET`.
3. Get your **Account ID**: it's shown on the R2 overview page (and in the dashboard URL). This is
   `R2_ACCOUNT_ID`. (The S3 endpoint we use is `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.)
4. Create access keys: R2 → **Manage R2 API Tokens** → **Create API token** → permission
   **Object Read & Write**, scoped to the bucket. On creation it shows an **Access Key ID** and a
   **Secret Access Key** — copy both now (the secret is shown once).
   - These are `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`.
5. Make the bucket's files publicly readable (so the reader can play them):
   - Bucket → **Settings** → **Public access** → enable the **r2.dev subdomain** (gives a URL like
     `https://pub-<hash>.r2.dev`). Copy that URL → `NEXT_PUBLIC_R2_PUBLIC_URL`.
   - *(Better for production later: connect a custom domain via Cloudflare DNS — same env var,
     nicer URL, no r2.dev rate limits. Optional; the r2.dev URL is fine to start.)*

### Step 4 — Put the keys in `.env.local`
Open the project's **`.env.local`** (same file the other keys live in) and add:
```bash
# --- TTS providers ---
SARVAM_API_KEY=your_sarvam_key
ELEVENLABS_API_KEY=your_elevenlabs_key

# --- Cloudflare R2 (audio storage) ---
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_BUCKET=qissa-audio
NEXT_PUBLIC_R2_PUBLIC_URL=https://pub-xxxxxxxx.r2.dev
```
- `NEXT_PUBLIC_` prefix on the public URL is required (the browser reads it to build playback URLs);
  the other five are **server-only secrets** — never give them a `NEXT_PUBLIC_` prefix.
- Restart `npm run dev` after editing `.env.local`.

### Step 5 — Install the storage SDK
Run once: `npm i @aws-sdk/client-s3` (R2 speaks the S3 API). I'll run this during Phase A if you
allow it, or you can run it yourself.

### Step 6 — Production (Vercel), when you deploy
Add the **same six variables** in Vercel → Project → **Settings → Environment Variables**
(Production + Preview). Redeploy so they take effect.

### Step 7 — Database migration (I write it; you approve the push)
- I'll create the migration file. When you're ready, **you** (or I, on your explicit OK) run:
  ```bash
  npx supabase db push
  npx supabase gen types typescript --linked --schema public > lib/supabase/types.ts
  awk 'found || /^export / { found=1; print }' lib/supabase/types.ts > /tmp/t && mv /tmp/t lib/supabase/types.ts
  npm run typecheck
  ```
- Per repo rule I will **not** push to the DB without your explicit go-ahead.

### What I do vs. what you do — quick split
| You | Me |
|---|---|
| Create Sarvam, ElevenLabs, Cloudflare accounts | Write all code + migration + docs |
| Create the R2 bucket + API token + enable public URL | Wire the adapters, pipeline, UI, reader Listen |
| Paste the 6 env vars into `.env.local` (+ Vercel later) | Run typecheck/lint/build; smoke-test the flow |
| Give explicit OK before `npx supabase db push` | Tell you exactly when each key/var is needed |

### Minimum to start
To make **Phase A** testable I only strictly need **one** provider key (Sarvam *or* ElevenLabs) +
the R2 vars. The second provider key can come later — the adapter framework lands regardless.
