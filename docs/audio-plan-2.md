# Plan — Emotion narration script, smart story auto-split, user voice choice

## Context

Building on the just-shipped TTS feature (`lib/tts/*`, `lib/r2/*`, reader Listen button), the user wants three additions:

1. **Emotion-rich narration script for TTS.** Today the reader and the TTS pipeline both read the single clean field `story_part_translations.text`. The user wants narration to sound expressive **without changing what the reader sees**. So we store a *second* per-part script (`emotion_text`) that the TTS pipeline narrates, while the reader keeps showing the plain `text`. The admin can toggle between the plain and emotion views in the editor.
   - **Decisions:** emotion is expressed via *punctuation & pacing* (ellipses, em-dashes, paragraph breaks, `<break>` pauses) — safe for both Sarvam bulbul:v2 and ElevenLabs multilingual_v2, never read aloud as literal tags. The script is generated **lazily** (at audio-generation time, or via a manual "Generate narration script" button), so the reading translation stays byte-for-byte as today and text-only variants cost no extra tokens.

2. **Smart auto-split.** Paste a whole story, click a button, get near-equal parts split at *natural* boundaries (whole paragraphs, never mid-sentence) so TTS narration of each part is smooth. **Decision:** admin sets an approximate **target words/part** (sensible default pre-filled); a balancing algorithm packs paragraphs to near-equal parts. Lives in the **new-story creation** flow only (enhancing `BulkImportDialog`).

3. **User-chosen narration voice.** Confirmed: when a part has no studio MP3, the reader narrates with the Web Speech API using an auto-picked default voice. The user wants a reader-settings control to choose the Web Speech voice (per language). This only affects the free fallback, not stored studio audio.

Repo rules: write the migration but **do not `db push` without explicit OK**; hand-add the new column to `lib/supabase/types.ts`; run `typecheck && lint && build`; commit only when asked.

---

## Feature 1 — Emotion narration script

### DB (one migration: `supabase migration new emotion_narration`)
- `story_part_translations` → add `emotion_text text` (nullable) + `emotion_status text` (nullable: `null`/`generating`/`ready`/`failed`).
- Hand-add both to the `story_part_translations` Row/Insert/Update blocks in [lib/supabase/types.ts](lib/supabase/types.ts).
- (Skip versioning `emotion_text` for v1 — note as future.)

### Narration generation (reuse the AI adapter, providers untouched)
- [lib/ai/types.ts](lib/ai/types.ts): add optional `task?: "translate" | "narrate"` to `TranslationInput` (default `"translate"`).
- [lib/ai/prompt-builder.ts](lib/ai/prompt-builder.ts): when `task === "narrate"`, return a **narration-director** prompt instead of the translation prompt — *"Rewrite this `<language>` literary text into an expressive narration script for text-to-speech. Keep wording and meaning faithful; do NOT translate, summarize, or add bracketed stage directions that would be read aloud. Guide delivery with punctuation, ellipses, em-dashes, paragraph breaks, and `<break time="..."/>` pauses."* `user` = the reading text. The existing translation branch is unchanged → reading output identical.
- This means `translate(providerId, { ...input, task: "narrate" })` reuses `getProvider` + `withRetry` + every provider's `translate()` with **zero provider changes**. Optionally add a thin `narrate()` wrapper in [lib/ai/translate.ts](lib/ai/translate.ts) for readability.
- **New** [lib/translation/run-narration.ts](lib/translation/run-narration.ts) → `runStoryPartNarration(translationId, opts)`, mirroring [lib/translation/run-part.ts](lib/translation/run-part.ts): load the translation row (`text`) + variant (`ai_provider`, `ai_model`, `tone_id`, `target_language`) + tone fragment + language names (same loads as `runStoryPartTranslation`), set `emotion_status='generating'`, call `translate(..., task:"narrate")`, store `emotion_text` + `emotion_status='ready'`. On failure → `emotion_status='failed'` (never throws).

### TTS pipeline uses emotion text
- [lib/tts/run-part.ts](lib/tts/run-part.ts): also select `emotion_text` + the variant's `ai_provider`/`ai_model`/`tone_id`. **Before synthesizing**, if `emotion_text` is empty, call `runStoryPartNarration(...)` to produce it (lazy). Synthesize from `emotion_text ?? text` (fall back to plain text if narration is empty or failed — never block audio).

### Admin UI — view/edit toggle + generate button
- **New server action** in [lib/actions/story-parts.ts](lib/actions/story-parts.ts): `generateNarration(translationId)` → calls `runStoryPartNarration`, `revalidatePath`. Extend `updatePartTexts` to also accept `emotionText?` (writes `emotion_text`, no version snapshot needed).
- [components/admin/PartCard.tsx](components/admin/PartCard.tsx): add `emotion_text` + `emotion_status` to `PartCardData`; add a **segmented control "Reading | Narration"** above the translation Textarea that swaps the bound value between `text_translated` and `emotion_text` (both editable, each autosaves to its column). Add a **"Generate narration script"** button (shows status badge: none/generating/ready/failed) calling `generateNarration`.
- [app/admin/(protected)/stories/[id]/page.tsx](app/admin/(protected)/stories/[id]/page.tsx): add `emotion_text, emotion_status` to the `translations:story_part_translations(...)` select and map into `PartCardData`.
- Reader render path is **untouched** — it keeps reading `text`.

---

## Feature 2 — Smart auto-split (new-story creation)

### Pure algorithm — **new** [lib/stories/smart-split.ts](lib/stories/smart-split.ts)
- `smartSplit(text, { targetWords }): { label: string; text: string }[]` (same `ParsedPart` shape `BulkImportDialog` already emits).
- Algorithm: (1) split into paragraphs via existing [splitParagraphs()](lib/reader/paragraphs.ts) (pure, reusable); (2) if any paragraph is far larger than target, pre-split it on sentence boundaries reusing the sentence regex from [lib/tts/chunk.ts](lib/tts/chunk.ts); (3) greedily pack paragraphs into parts, closing a part when adding the next would overshoot `targetWords` more than stopping undershoots it (minimise per-part deviation → near-equal parts); (4) merge a too-small trailing part into the previous one. Word counts via existing [wordCount()](lib/utils/word-count.ts). Never breaks mid-sentence → TTS-smooth.

### UI — enhance [components/admin/BulkImportDialog.tsx](components/admin/BulkImportDialog.tsx)
- Add a mode toggle **"By separator | Auto-split"**. Auto-split mode: a full-story textarea + a numeric "Target words per part" input (default ~800) + live preview listing each computed part's label and word count. **Import** calls the existing `onImport(parts)` callback → flows unchanged into [StoryForm](components/admin/StoryForm.tsx) state and [createStory](lib/actions/stories.ts). No schema/action changes.
- (Scope: creation only. Note in docs that an "append to existing story" tool can reuse `smartSplit` + `addStoryPart` later.)

---

## Feature 3 — User-chosen Web Speech voice

### Speech helper — [lib/reader/speech.ts](lib/reader/speech.ts)
- Export `listVoicesForLanguage(languageCode): SpeechSynthesisVoice[]` (filter installed voices by lang prefix).
- `pickVoice(languageCode, preferredVoiceURI?)`: honour `preferredVoiceURI` first (if it still exists), else current first-match logic.
- `createSpeechController(text, languageCode, callbacks, rate, preferredVoiceURI?)`: thread the preferred URI into `pickVoice`.

### Setting — [lib/reader/reader-settings.ts](lib/reader/reader-settings.ts)
- Add `narrationVoiceByLang: Record<string, string>` (lang → `voiceURI`) to `ReaderSettings` + `DEFAULT_SETTINGS` (`{}`). The existing `{...DEFAULT_SETTINGS, ...parsed}` merge gives back-compat for free.

### UI — [components/reader/ReaderSettings.tsx](components/reader/ReaderSettings.tsx)
- New "Narration voice" section: a `<Select>` of `listVoicesForLanguage(targetLanguage)` + an "Auto (default)" option; refresh on `voiceschanged`; writes `settings.narrationVoiceByLang[targetLanguage] = voiceURI`. Helper text: "Used for device narration when a part has no studio audio." Needs a new `targetLanguage` prop.

### Threading — [ReaderShell](components/reader/ReaderShell.tsx) → [ReaderChrome](components/reader/ReaderChrome.tsx) → [ListenButton](components/reader/ListenButton.tsx)
- Pass `targetLanguage` into `ReaderSettingsSheet`.
- Pass the resolved `settings.narrationVoiceByLang[targetLanguage]` from ReaderShell → ReaderChrome → `ListenButton` as a `voiceURI` prop; ListenButton forwards it to `createSpeechController`. (ReaderChrome already receives `targetLanguage`.)

---

## Files at a glance

**New:** `supabase/migrations/<ts>_emotion_narration.sql`, `lib/translation/run-narration.ts`, `lib/stories/smart-split.ts`.
**Modified:** `lib/ai/types.ts`, `lib/ai/prompt-builder.ts`, `lib/ai/translate.ts`, `lib/tts/run-part.ts`, `lib/actions/story-parts.ts`, `components/admin/PartCard.tsx`, `app/admin/(protected)/stories/[id]/page.tsx`, `components/admin/BulkImportDialog.tsx`, `lib/reader/speech.ts`, `lib/reader/reader-settings.ts`, `components/reader/ReaderSettings.tsx`, `components/reader/ReaderShell.tsx`, `components/reader/ReaderChrome.tsx`, `components/reader/ListenButton.tsx`, `lib/supabase/types.ts`.
**Reuse:** `withRetry`/`getProvider`/`translate` (lib/ai), `splitParagraphs` (lib/reader/paragraphs.ts), sentence regex (lib/tts/chunk.ts), `wordCount` (lib/utils/word-count.ts), `runStoryPartTranslation` patterns, `ParsedPart`/`onImport` (BulkImportDialog), `audioUrl` (lib/r2/url.ts).

**Docs (per CLAUDE.md rules):** `tts-provider-adapter.md` (emotion script + lazy narration), `ai-provider-adapter.md` (narrate task), `04-database.md` (new columns), `reader-state.md` (voice setting), `UI/admin.md` (PartCard toggle + auto-split), `UI/reader.md` (voice picker), `FEATURES.md` entries.

---

## Verification

- `npm run typecheck && npm run lint && npm run build` clean (`rm -rf .next` first).
- **Migration:** write it; **do not `db push` without explicit OK**; then regen types (`gen types … --linked` + the awk trim) and re-typecheck.
- **Emotion:** on a translated variant, click "Generate narration script" → `emotion_text` fills, toggle shows it differs from reading (added pauses/punctuation), reader page still shows plain `text`. Generate audio → narration is what's synthesized; with `emotion_text` empty it's produced lazily first; if narration fails, audio still uses plain text.
- **Auto-split:** in new-story → Bulk import → Auto-split, paste a multi-paragraph story, set target words, preview shows near-equal parts each ending at a paragraph/sentence boundary; Import populates the form; create the story; confirm `story_parts` rows. Generate audio on a part → no over-limit errors.
- **Voice:** in reader settings on a variant with a language that has ≥2 installed voices, pick a non-default voice → Listen (no studio audio) narrates in that voice; "Auto" reverts; selection persists across reloads (localStorage); a part WITH studio audio still plays the MP3 (voice picker ignored).
