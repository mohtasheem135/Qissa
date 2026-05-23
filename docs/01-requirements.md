# Qissa — Requirements Document

> A multi-language story translation platform with style-preserved AI translation, built as an installable PWA for readers and a powerful admin console for translators.

**Version:** 1.0
**Last updated:** 2026-05-20
**Project codename:** `qissa`

---

## 1. Vision & Core Concept

Qissa is a web platform where an admin curates stories in any source language and translates them into target languages (Urdu, Arabic, Hindi, English, Odia, Bengali, Tamil, Punjabi, and others) using AI — but with a critical twist: translations mimic the prose style of legendary writers of that target language (e.g., Premchand for Hindi, Manto for Urdu, Tagore for Bengali). The output is literary, not robotic.

Readers consume these stories through a beautiful, installable Progressive Web App optimized for both flagship and budget Android phones, with a premium reader experience comparable to Kindle or Medium.

### Guiding Principles

1. **Readability first** — Every design decision prioritizes the reading experience
2. **Inclusive performance** — Must run smoothly on 5-year-old budget Android phones
3. **Style over speed** — Translation quality (literary tone) trumps translation speed
4. **Multi-provider AI** — Never lock into a single AI vendor; admin can switch
5. **Mobile-first, PWA-first** — Designed as if desktop doesn't exist, then enhanced

---

## 2. User Roles

| Role | Capabilities |
|---|---|
| **Admin** (single user, Phase 1) | Manage categories, tones, languages, create/translate/edit/publish stories, view analytics |
| **Reader** (no login, Phase 1) | Browse, search, filter, read, bookmark (localStorage), install PWA, read offline |

User accounts for readers are explicitly **out of scope** for Phase 1 but the database schema must allow adding them later without migration.

---

## 3. Feature Specifications

### 3.1 Admin: Category Management

**Hierarchy:** Strictly two levels — `Category → Subcategory`. No deeper nesting.

**Examples:**
- Stories
  - Motivational
  - Islamic
  - Real Life
  - Autobiography
  - Mystery
  - Children
- News
  - Politics
  - Sports
  - Technology
- Poetry
  - Ghazal
  - Nazm
  - Sher

**Operations (CRUD):**
- Create category (name, slug, icon emoji, display order, description)
- Create subcategory under any category (same fields + parent reference)
- Edit any field
- Soft-delete (sets `is_active = false` so existing stories don't break; UI shows confirmation)
- Reorder via drag handles in admin

**Validation:**
- Category name unique within scope (categories can't have same name; subcategories must be unique within their parent)
- Slug auto-generated from name, editable, must be URL-safe
- Cannot delete a category that still has active subcategories with stories

---

### 3.2 Admin: Tone Management

Tones are writer-style presets used during AI translation. Each tone is tied to a target language.

**Schema:**
- `id` (uuid)
- `language_code` (e.g., `hi`, `ur`, `bn`)
- `name` (e.g., "Premchand", "Saadat Hasan Manto", "Rabindranath Tagore")
- `display_name` (localized, e.g., "मुंशी प्रेमचंद")
- `description` (admin-facing explanation of the style)
- `prompt_fragment` (the actual text injected into the AI prompt — e.g., *"Write in the style of Munshi Premchand: simple yet emotionally rich Hindi, rooted in rural Indian life, with vivid character portraits, moral undertones, and natural dialogue. Use everyday Hindi-Urdu vocabulary, avoid heavy Sanskrit-derived words."*)
- `is_active`
- `created_at`, `updated_at`

**Pre-seeded tones (initial database seed):**

| Language | Tones to seed |
|---|---|
| Hindi | Premchand, Harivansh Rai Bachchan, Phanishwar Nath Renu, Krishna Sobti, Mannu Bhandari |
| Urdu | Saadat Hasan Manto, Ismat Chughtai, Mirza Ghalib, Ibn-e-Safi, Quratulain Hyder |
| Bengali | Rabindranath Tagore, Sarat Chandra Chattopadhyay, Bibhutibhushan Bandyopadhyay, Mahasweta Devi |
| Arabic | Naguib Mahfouz, Khalil Gibran, Tayeb Salih |
| Tamil | Kalki Krishnamurthy, Pudumaipithan, Jeyamohan |
| Odia | Fakir Mohan Senapati, Gopinath Mohanty |
| Punjabi | Amrita Pritam, Bhai Vir Singh |
| English | Hemingway (terse, simple), Tolkien (mythic, formal), Salinger (intimate, colloquial), Orwell (clear, direct) |

**Operations:** Full CRUD via admin panel. The `prompt_fragment` is the most important field — admin should be able to refine it iteratively to improve translation quality.

---

### 3.3 Admin: Language Management

A `languages` table managed by admin (so new languages can be added without code changes).

**Schema:**
- `code` (ISO 639-1, e.g., `hi`, `ur`, `bn`, `ar`, `en`)
- `name_english` (e.g., "Hindi")
- `name_native` (e.g., "हिन्दी")
- `direction` (`ltr` | `rtl`)
- `font_family` (CSS font stack for this language — see §3.10)
- `font_family_reading` (serif variant for reader mode)
- `is_active`
- `display_order`

**Pre-seeded languages:** Hindi, Urdu, English, Arabic, Bengali, Tamil, Odia, Punjabi, Marathi, Gujarati, Telugu, Kannada, Malayalam.

---

### 3.4 Admin: AI Provider Configuration

A pluggable system allowing the admin to use any of several AI providers.

**Supported providers (Phase 1):**
| Provider | Default Model | Free Tier |
|---|---|---|
| Google Gemini | `gemini-2.0-flash` | 15 RPM, 1500 RPD |
| Groq | `llama-3.3-70b-versatile` | 30 RPM (generous) |
| OpenAI | `gpt-4o-mini` | Paid only (no free tier) |
| Anthropic Claude | `claude-sonnet-4-5` | Paid only |
| OpenRouter | various | Has free models |

**Architecture:** Adapter pattern. Each provider implements a common `TranslationProvider` interface:

```ts
interface TranslationProvider {
  name: string;
  translate(input: TranslationInput): Promise<TranslationOutput>;
  estimateCost?(text: string): number;
}

interface TranslationInput {
  text: string;
  sourceLanguage?: string; // auto-detected if missing
  targetLanguage: string;
  toneFragment: string;
  complexityFragment: string;
  customInstructions?: string;
  previousPartContext?: string; // for coherence
  glossary?: Array<{ original: string; translated: string }>;
}

interface TranslationOutput {
  translatedText: string;
  detectedSourceLanguage?: string;
  tokensUsed?: { input: number; output: number };
  modelUsed: string;
  provider: string;
}
```

**Configuration:** Provider API keys live in environment variables. Admin UI lets you:
- Set the default provider/model
- Override provider/model per-translation
- See current provider's rate limit status
- Test connection with a "Send test prompt" button

**Adding a new provider** = creating a new file `lib/ai/providers/<name>.ts` implementing the interface, then registering it in `lib/ai/registry.ts`. No other code changes needed.

---

### 3.5 Admin: Complexity Levels

A fixed enum (not a database table — too small to warrant one):

| Key | Label | Prompt fragment example |
|---|---|---|
| `daily` | Daily/Conversational | "Use everyday spoken vocabulary that any literate adult uses in conversation. Avoid literary or archaic words." |
| `simple` | Simple Literary | "Use clear, accessible literary language. Sentences should flow naturally. Avoid jargon and rare words." |
| `standard` | Standard Literary | "Use rich literary vocabulary appropriate for educated readers. Balance accessibility with depth." |
| `advanced` | Advanced/Classical | "Use sophisticated, classical vocabulary including less common words. Embrace literary register and complex sentence structures." |
| `scholarly` | Scholarly/Archaic | "Use the most refined, scholarly vocabulary including rare, archaic, and Sanskrit/Persian/Arabic-derived words as appropriate. Aim for the register of classical literature." |

The admin can override the prompt fragment per-story if needed.

---

### 3.6 Admin: Story Creation & Translation Flow

#### Step 1 — Category Selection
A clean grid of all active categories. Click → enter category. Shows subcategories. Click subcategory → "New Story" button visible.

#### Step 2 — New Story Form

**Fields:**
| Field | Type | Required | Notes |
|---|---|---|---|
| Title (original) | text | ✓ | In source language |
| Title (translated) | text | auto-filled after translation, editable | |
| Author (original) | text | ✗ | Name of original author |
| Source URL | url | ✗ | Where the original was found |
| Cover image | file or URL | ✗ | Uploaded to ImageKit |
| Subcategory | select | ✓ | Pre-filled from previous step |
| Target language | select | ✓ | From `languages` table |
| Tone | select | ✓ | Filtered to selected target language |
| Complexity | select | ✓ | The 5 fixed levels above |
| AI Provider | select | ✓ | Defaults to admin's default |
| AI Model | select | ✓ | Models available for chosen provider |
| Custom prompt override | textarea | ✗ | Extra instructions appended to the system prompt |
| Status | radio | ✓ | `draft` (default) or `published` |

#### Step 3 — Story Content Input

Two modes:

**Mode A — Manual parts:**
- Story title (one)
- Add part button → each part has its own textarea
- Each part gets auto-labeled "Part 1", "Part 2", ... (label is editable)
- Parts can be reordered via drag handles
- Parts can be deleted

**Mode B — Bulk import:**
- One big textarea
- User pastes the full story with `---` separators between parts
- Click "Split into parts" → system auto-splits, shows preview, admin confirms
- Falls back to Mode A view for editing

**Word count + estimated cost** shown live as admin types/pastes.

#### Step 4 — Translation Execution

Click "Translate All Parts" button → translation begins.

**Translation execution rules:**
1. Parts translated sequentially (Part 1 → Part 2 → ... → Part N)
2. Live progress UI: `[✓] Part 1 translated · [⏳] Part 2 translating · [ ] Part 3 pending · ...`
3. Each part's translation uses:
   - Tone prompt fragment
   - Complexity prompt fragment
   - Custom instructions (if any)
   - **Context memory:** Previous part's translated text is included (truncated to last ~1500 chars) with explicit instruction: *"Maintain consistency in character names, terminology, and tone with the previous translated section provided below."*
   - **Glossary memory:** A running list of key terms is extracted (Phase 1.5; manual seed acceptable for Phase 1)
4. Per-part retry: Up to 3 attempts with exponential backoff (1s, 3s, 9s)
5. If a part fails after retries → mark as `failed`, show error, allow admin to:
   - Click "Resume" to retry that part and all subsequent
   - Click "Retry this part" for single-part retry
   - Click "Skip" to mark `pending` and translate manually later
6. Throughout: admin can pause/cancel the queue

**Per-part status states:**
- `pending` — not yet translated
- `translating` — currently in progress
- `completed` — translated successfully (untouched)
- `edited` — admin manually edited after translation
- `failed` — last attempt failed

#### Step 5 — Review & Edit

After translation completes, admin sees a split view per part:
- Left: original text
- Right: translated text (editable inline)
- Per-part actions: Re-translate, Edit, Mark as final
- Each edit creates a version (see §3.7)

#### Step 6 — Publish

A "Publish" toggle moves status `draft → published`. Published stories appear in the reader-facing app immediately.

---

### 3.7 Admin: Translation History / Versioning

Every time a part is re-translated OR manually edited, the previous version is preserved.

**Schema (`story_part_versions` table):**
- `id`
- `story_part_id`
- `version_number` (auto-increment per part)
- `translated_text`
- `provider_used`, `model_used`, `tone_used`, `complexity_used`, `custom_instructions_used`
- `created_by` (`ai` | `admin`)
- `created_at`

Admin UI: "Version history" button per part → modal with diff view, "Restore this version" action.

---

### 3.8 Admin: Story Listing & Management

A dashboard table view:

**Columns:** Cover thumbnail · Title (original / translated) · Subcategory · Target language · Status (draft / published) · Parts translated (e.g., 4/6) · Provider used · Updated at · Actions

**Filters:**
- Category
- Subcategory
- Target language
- Tone
- Status
- Provider used
- Date range

**Search:** by title (both original and translated)

**Bulk actions:** publish, unpublish, delete (soft delete)

---

### 3.9 Admin: Authentication

Single admin, simple flow:

1. Supabase Auth with email + password
2. Admin email hardcoded in env: `ADMIN_EMAIL=...`
3. A route middleware checks: logged in AND email matches `ADMIN_EMAIL` → allow `/admin/*` routes
4. Anything else → redirect to `/admin/login`
5. Magic link login as fallback option

**No public sign-up exists.** The admin is created once manually via Supabase dashboard.

---

### 3.10 Reader: Public-Facing PWA

#### Home Page (`/`)
- Hero banner (optional, simple)
- Featured/recent stories (last 8 published)
- Browse by category tiles (top-level categories grid)
- Search bar (top, sticky)

#### Category Page (`/c/[categorySlug]`)
- Lists all subcategories with story counts
- Tapping subcategory → subcategory page

#### Subcategory Page (`/c/[categorySlug]/[subcategorySlug]`)
- Story cards grid (cover, title in target language, target language flag, estimated reading time, number of parts)
- Filters: target language, tone, sort by (newest / oldest / longest / shortest)
- Infinite scroll / "Load more" button (lazy loading)

#### Search Page (`/search?q=...`)
- Full-text search on story titles (original + translated)
- Optional filters: language, category

#### Story Page (`/s/[storyId]`)
- Cover image, title, author, target language, tone used, total parts, total reading time
- "Start reading" → opens Reader on Part 1
- Parts list with reading status (read / unread / in-progress — from localStorage)
- "View original" toggle exposed here too

#### Reader (`/s/[storyId]/p/[partNumber]`)
**This is the heart of the product. See §3.11.**

---

### 3.11 The Reader Experience

A premium, distraction-free reading interface.

#### Layout
- Top app bar: back button · part X/N · settings (gear) icon · share icon · bookmark icon
- Main: title (Part X · Part Label) → body text
- Bottom app bar: ← Previous Part · Reading progress dot · Next Part →
- All chrome auto-hides after 3 seconds of no interaction; tap anywhere to bring back

#### Settings Panel (slides up from bottom)
1. **Font size:** A− / A+ floating buttons (also pinch-to-zoom on the body)
2. **Line height:** compact / normal / relaxed
3. **Theme:** see modes below
4. **Font:** primary (sans) / reading (serif) per-language
5. **Show original:** toggle (default: off) — when on, shows the original text below or in a tabbed view
6. **Text alignment:** left / justify (default justify for languages that look better justified)

#### Reading Modes (Themes)
| Theme | BG | Text | Accent | Use case |
|---|---|---|---|---|
| **Day** | `#FFFFFF` | `#1A1A1A` | indigo | Default daytime |
| **Sepia** | `#F4ECD8` | `#5B4636` | brown | Easy on eyes, paper-like |
| **Night** | `#0A0A0A` (true black) | `#E8E8E8` | indigo | OLED-friendly, night |
| **Gray** | `#1A1B26` | `#A9B1D6` | teal | Low-contrast, comfortable |
| **Focus** | `#FFFFFF` | dimmed paragraphs `#999`, current `#000` | indigo | Distraction-free deep reading |

User's choice persists in localStorage.

#### Font Stacks Per Language

```css
/* Hindi, Marathi */
--font-hi: 'Tiro Devanagari Hindi', 'Noto Sans Devanagari', 'Noto Serif Devanagari', serif;

/* Urdu */
--font-ur: 'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', serif;

/* Arabic */
--font-ar: 'Noto Naskh Arabic', 'Amiri', serif;

/* Bengali */
--font-bn: 'Tiro Bangla', 'Noto Serif Bengali', serif;

/* Tamil */
--font-ta: 'Noto Serif Tamil', 'Tiro Tamil', serif;

/* Odia */
--font-or: 'Noto Sans Oriya', serif;

/* Punjabi (Gurmukhi) */
--font-pa: 'Noto Serif Gurmukhi', serif;

/* English (default reader serif) */
--font-en: 'Lora', 'Source Serif Pro', Georgia, serif;
--font-en-sans: 'Inter', system-ui, sans-serif;
```

#### Reading Progress
- Thin progress bar at top showing how far in the current part the user has scrolled
- Saved to localStorage every 5 seconds: `qissa:progress:{storyId}:{partNumber} = { scroll: 0.42, updatedAt }`
- "Continue reading" on home shows last-read story with resume position

#### Bookmark/Favorite
- Heart icon in top bar
- Saved to localStorage: `qissa:bookmarks = [storyId1, storyId2, ...]`
- Accessible via `/bookmarks` page

#### Font Resizing
- Floating A− / A+ buttons (bottom-right corner, semi-transparent, fade away when not interacting)
- Pinch-to-zoom on the reading body (CSS `font-size` adjusted, not browser zoom)
- Saved to localStorage: `qissa:fontSize = 18` (px)
- Range: 14px → 32px

#### Original Text Toggle
- Settings panel has "Show original text"
- When on: each paragraph of translated text shows the matching paragraph of original underneath, in a subtle muted color
- Implemented by storing parts with **paragraph-level alignment** (one paragraph in original = one paragraph in translated; the AI prompt enforces this)

#### Share
- Web Share API (native share sheet on mobile)
- Shares the story URL with title pre-filled

#### Offline Reading
- Once a story page is opened, the service worker caches all parts of that story
- Reader works fully offline for cached stories
- Bookmark = automatic offline cache (Phase 1.5; Phase 1 = "open once = cached")

#### Accessibility
- All interactive elements meet WCAG AA contrast in every theme
- Font scaling respects user's OS-level font size preference as starting point
- All controls reachable via keyboard (Tab order)
- ARIA labels on icon-only buttons
- Reduced motion respected (`prefers-reduced-motion`)

#### Performance Targets
- Lighthouse mobile Performance ≥ 90
- First Contentful Paint < 1.5s on a 4G connection
- Time to Interactive < 3s on a budget Android device
- JS bundle < 200KB gzipped on reader page
- No layout shift (CLS < 0.05)
- Smooth 60fps scrolling

---

### 3.12 PWA Requirements

- `manifest.json` with name, short_name, icons (multiple sizes), theme_color, background_color, display: `standalone`
- Service worker via `next-pwa` or Serwist
- Install prompt: shown after user reads at least 1 story (avoid annoying first-time visitors)
- Custom install banner: "Install Qissa for offline reading" with one-tap install
- App icon designed (placeholder Phase 1, polished Phase 1.5)
- Splash screen
- Works fully offline for previously visited stories
- Background sync: not needed Phase 1

---

### 3.13 Performance & Compatibility

**Target devices:**
- Modern: any phone from 2022+
- Old: Android 8+ on devices like Redmi 6, Realme C2 (2GB RAM, slow CPU)

**Compatibility requirements:**
- Polyfills as needed via Next.js defaults
- No CSS features that fail silently on old WebViews (test with Chrome 80+)
- Avoid `backdrop-filter` (poor support on old Android Chrome)
- Avoid heavy JS animations; use CSS transforms only
- Images served via ImageKit with auto-format (WebP/AVIF where supported, JPEG fallback)
- Images lazy-loaded with `loading="lazy"`
- Lists virtualized if > 50 items
- Code-split per route (Next.js does this by default)
- No tracking scripts, no analytics SDKs Phase 1 (add Plausible later if wanted)

---

## 4. Out of Scope (Phase 1)

These are explicitly **not** built in Phase 1, but the architecture must not preclude them:

- Reader user accounts, profiles, login
- Comments / reactions / ratings
- Multi-admin support, roles, permissions
- Audio reading (TTS) — Phase 2
- Per-paragraph alignment view UI (data structure supports it; UI later)
- Translation cost tracking dashboard
- Analytics / reading time analytics for admin
- Newsletter / push notifications
- Comments and reactions
- Background translation queue
- Glossary auto-extraction (manual entry only Phase 1)
- A/B comparison view of two AI provider outputs side by side
- Translation memory across stories (i.e., remembering how "Ramesh" was translated last time across all stories)
- Multi-target translation of one story (e.g., translate Premchand into both Bengali and Tamil from the same source — Phase 2)

---

## 5. Database Schema (High-Level)

Full SQL in `guidance.md` and `implementation-plan.md`. Tables:

1. `categories` — top-level categories
2. `subcategories` — children of categories
3. `languages` — supported target languages
4. `tones` — writer-style presets per language
5. `stories` — story metadata (title, author, category, target lang, tone, status)
6. `story_parts` — individual parts of a story (order, original text, translated text, status)
7. `story_part_versions` — historical translations per part
8. `ai_providers_config` — admin's default provider/model settings
9. `translation_jobs` — log of translation runs (for debugging, retry, cost tracking)

All tables use `uuid` primary keys, `created_at`, `updated_at`, and `is_active` (where applicable) columns.

---

## 6. Success Criteria

The MVP is "done" when:

- [ ] Admin can log in, create a category and subcategory
- [ ] Admin can create a tone for a language with a custom prompt fragment
- [ ] Admin can paste a 4-part Hindi story (original in English), select Premchand tone, click translate, and watch all 4 parts translate live
- [ ] Admin can re-translate Part 3 alone without redoing Parts 1, 2, 4
- [ ] Admin can edit a translation, save, and publish
- [ ] A reader on a 4-year-old Android phone can: open the site, browse categories, open a story, read smoothly with sepia theme and font size 24px
- [ ] The reader can install the site as a PWA from Chrome's "Add to Home Screen"
- [ ] After visiting one story, reader can disconnect from internet and still read it
- [ ] Reader's bookmark + reading progress persists across sessions
- [ ] Switching from Gemini to Groq as the provider requires zero code changes (only env var + admin UI selection)
- [ ] Site achieves Lighthouse mobile Performance ≥ 90 on the home and reader pages

---

## 7. Future Phases (Roadmap)

**Phase 1.5** (immediately after MVP):
- Glossary auto-extraction
- Per-paragraph alignment UI in reader
- Better cover image management
- Admin: cost tracking dashboard

**Phase 2:**
- Reader accounts (Supabase Auth)
- Comments, reactions
- TTS (text-to-speech with language-appropriate voices)
- Push notifications for new stories
- Multiple admins with roles
- Translation memory across stories
- Multi-target language translation (one source → many translations)

**Phase 3:**
- Community contributions (users submit stories)
- Translator marketplace (human + AI hybrid)
- Mobile apps (React Native or Capacitor wrapping the PWA)

---

**End of requirements document.**
