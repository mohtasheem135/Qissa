# TTS provider adapter + audio storage (`lib/tts/*`, `lib/r2/*`)

> Text-to-speech narration. A near-exact mirror of the translation adapter
> ([ai-provider-adapter.md](./ai-provider-adapter.md)) — same registry/provider
> shape, same `withRetry`, same path-only storage decoupling as ImageKit.

---

## What it is

Two capabilities, one adapter:

1. **Premium audio** — the admin generates an MP3/WAV per translated part with a
   chosen voice; it's stored in **Cloudflare R2** and played in the reader.
2. **Free fallback** — when no premium audio exists, the reader narrates with the
   device's **Web Speech API** ([reader-state.md](./reader-state.md#web-speech-fallback)).

R2 (zero egress, 10 GB free) backs audio because audio is egress-dominated;
ImageKit stays **images-only**. See [ARCHITECTURE.md §8](../ARCHITECTURE.md).

---

## Modules

| File | Role |
|---|---|
| [lib/tts/types.ts](../../lib/tts/types.ts) | `TtsProvider` interface (`synthesize(input, voiceId?, model?)`) + `TtsInput`/`TtsOutput` (`TtsOutput.modelUsed`). **Reuses** `ProviderError` + `withRetry` from `lib/ai` (both generic). |
| [lib/tts/registry.ts](../../lib/tts/registry.ts) | `TtsProviderId`, `TTS_PROVIDERS` meta (per-provider `models: TtsModel[]` + `defaultModel`), `isTtsProviderConfigured`/`getConfiguredTtsProviders`/`getTtsProvider` (lazy+cached), the **voice catalog** + `getVoicesForLanguage(provider, lang, model?)`, the model/voice resolvers (`getTtsModelMeta`/`resolveTtsModel`/`resolveTtsVoice`), and the Sarvam BCP-47 language map. |
| [lib/tts/providers/sarvam.ts](../../lib/tts/providers/sarvam.ts) | Sarvam AI (Indic). `POST /text-to-speech`, base64 WAV in `audios[]`. Sends the resolved `model` in the body; returns `modelUsed`. |
| [lib/tts/providers/elevenlabs.ts](../../lib/tts/providers/elevenlabs.ts) | ElevenLabs (multilingual). `POST /text-to-speech/{voiceId}`, raw MP3. Sends the resolved model as `model_id`; returns `modelUsed`. |
| [lib/tts/synthesize.ts](../../lib/tts/synthesize.ts) | `synthesize(providerId, input, { voiceId, model, retry })` = `getTtsProvider` + `withRetry`, threading `model` to the provider. Mirrors `lib/ai/translate.ts`. |
| [lib/tts/run-part.ts](../../lib/tts/run-part.ts) | `runStoryPartAudio(translationId, opts)` — full pipeline (mirrors `runStoryPartTranslation`). `RunPartAudioOptions` carries `model?` (+ provider/voice overrides). Resolves provider/model/voice, narrates `emotion_text || text` (lazily generating the script first if absent), and writes `tts_model` to `story_part_audio` + `tts_jobs`. |
| [lib/translation/run-narration.ts](../../lib/translation/run-narration.ts) | `runStoryPartNarration(translationId, opts)` — rewrites a part's reading `text` into the expressive `emotion_text` script via [narrate()](./ai-provider-adapter.md). Mirrors `runStoryPartTranslation`; never throws. |
| [lib/r2/upload.ts](../../lib/r2/upload.ts) | `uploadAudio({ buffer, key, contentType })` via `@aws-sdk/client-s3` (R2 is S3-compatible). Returns **path only**. |
| [lib/r2/url.ts](../../lib/r2/url.ts) | `audioUrl(path)` composes `NEXT_PUBLIC_R2_PUBLIC_URL/<path>`. SSR + client safe. |

---

## Providers + models + voice catalog

`TTS_PROVIDERS` (meta only, no secrets) lists each provider's `envKey`,
`models: TtsModel[]`, `defaultModel`, `defaultVoiceId` (= the default model's
default voice), and free-tier note. A **`TtsModel`** is `{ id, name,
defaultVoiceId }` — each provider exposes a **selectable list** of synthesis
engines, not one fixed string. Voices live **in code** (no DB voices table in
v1), keyed by provider, and may be **model-specific** (see below).

- **Sarvam** — two models: `bulbul:v3` (default — audiobook-grade, 36 speakers,
  defaultVoice `priya`) and `bulbul:v2` (legacy, 7 speakers, defaultVoice
  `anushka`). Voices are model-specific: **v2 and v3 have entirely different
  speaker sets**, so `VOICE_CATALOG.sarvam` carries BOTH — the curated v3
  audiobook subset tagged `models: ["bulbul:v3"]` (the storytelling/narration
  voices Sarvam surfaces — aditya, ashutosh, advait, gokul, roopa, suhani, tanya,
  kavitha … plus Tier 1 all-rounders priya, ishita, mani, ratan) AND the
  re-added 7 legacy v2 speakers (anushka, manisha, …) tagged `["bulbul:v2"]`.
  Each carries a short `description` blurb. Speakers are **language-agnostic**
  across Sarvam's Indic languages, so every voice lists every supported code.
  `SARVAM_LANGUAGE_MAP` maps app codes → BCP-47 (`hi`→`hi-IN`, `or`→`od-IN`, …).
  **Urdu (`ur`) and Arabic (`ar`) are NOT in the map** — Sarvam has no voice for
  them, so `getVoicesForLanguage("sarvam", "ur")` returns `[]` and the UI
  disables/hides Sarvam there.
  - To add more voices, copy a speaker id verbatim from Sarvam's catalog into
    `VOICE_CATALOG.sarvam` with its gender + the `models` it belongs to.
    Synthesis self-heals unknown/out-of-model voices to the model default (see
    `resolveTtsVoice`).
  - Request tuning lives in [sarvam.ts](../../lib/tts/providers/sarvam.ts):
    `speech_sample_rate: 24000` (v3 default, audiobook-quality); `model` is the
    resolved value passed in (falling back to `meta.defaultModel`) and is echoed
    back as `modelUsed`. v2-only knobs (`pitch`, `loudness`,
    `enable_preprocessing`) are not sent. Pace defaults to 1.0.
- **ElevenLabs** — three models: `eleven_multilingual_v2` (default),
  `eleven_turbo_v2_5`, `eleven_flash_v2_5`. Voices are **model-agnostic**
  (untagged — `models` undefined ⇒ all models) and multilingual
  (`languageCodes: ["*"]`), so every voice is offered for every language and
  every model. The resolved model is sent as `model_id`.

### Model + voice resolution helpers

- `getTtsModelMeta(provider, modelId)` → the `TtsModel` (or undefined).
- `resolveTtsModel(provider, modelId)` → `modelId` if it's a valid model of the
  provider, else the provider's `defaultModel`.
- `getVoicesForLanguage(provider, appCode, model?)` filters by language **and**,
  when `model` is given, by voice `models` membership (`undefined`/`["*"]` =
  every model). The single filter used by the admin UI (per-variant + `tts-config`
  pickers) — voice lists are always **scoped to the chosen model**.
- `resolveTtsVoice(provider, model, voiceId)` → `voiceId` if that voice exists
  **and** belongs to `model`; else falls back to that model's `defaultVoiceId`,
  then the provider default. This is what makes v2/v3 voice swaps safe.

## Adding a provider

1. Add a `TtsProviderId` + `TTS_PROVIDERS` entry (with its `models` + `defaultModel`)
   + voices in `VOICE_CATALOG` (tag model-specific voices via `models`).
2. Add `lib/tts/providers/<id>.ts` implementing `TtsProvider` (`synthesize(input,
   voiceId?, model?)`, returning `modelUsed`), mapping HTTP/network errors onto
   `ProviderError(isRetryable)` (use `isRetryableStatus`).
3. Add a `case` to `buildTtsProvider()` in the registry.

No other code changes — the pipeline, routes, and UI are provider-agnostic.

---

## Emotion narration script (`emotion_text`)

The reader always shows the clean `story_part_translations.text`. Audio narrates a
**second** per-translation script, `emotion_text` — a rewrite of the same text
that carries emotion via punctuation/pacing (ellipses, em-dashes, paragraph
breaks) and `<break time="…"/>` pause tags only. Those tags are honoured silently
by Sarvam `bulbul:v3` + ElevenLabs `multilingual_v2` and are never read aloud; no
bracketed stage directions are ever inserted. Keeping it in its own column means
the reading translation stays byte-for-byte identical.

The rewrite is **lazy** — it costs no tokens until audio is actually wanted:

- [run-narration.ts](../../lib/translation/run-narration.ts) `runStoryPartNarration(translationId)`
  loads the translation `text` + variant (`ai_provider`, `ai_model`, tone,
  complexity, target language) + tone fragment + language names, sets
  `emotion_status='generating'`, calls [narrate()](./ai-provider-adapter.md)
  (= `translate()` with `task:"narrate"`), and stores `emotion_text` +
  `emotion_status='ready'`. On failure → `emotion_status='failed'`. It **never
  throws** (returns `{ ok: false, error }`).
- It runs automatically inside `runStoryPartAudio` when `emotion_text` is empty
  (see the pipeline below), or on demand via the admin
  [generateNarration](../../lib/actions/story-parts.ts) server action / PartCard's
  "Generate narration script" button.

`emotion_text` is **not versioned** in v1 (no `story_part_versions` snapshot;
[updatePartTexts](../../lib/actions/story-parts.ts) writes it directly) — versioning is noted future work.

---

## The pipeline — `runStoryPartAudio`

Shared by `/api/tts` (single) and `/api/tts/queue` (SSE). Steps:

1. Load `story_part_translations` (must have `text`, status `completed`/`edited`;
   also selects `emotion_text` + `emotion_status`)
   + parent `story_variants` (`target_language`, `tts_provider`, `tts_model`,
   `tts_voice_id`) + `story_parts` (`part_number`), and the global `tts_config`
   singleton once (for the defaults below).
   If `emotion_text` is empty, lazily call `runStoryPartNarration(...)` first.
   Synthesis narrates `emotion_text || text` — a missing/failed script falls back
   to plain `text` and **never blocks** audio.
2. Resolve **provider**: explicit override → `variant.tts_provider` → `tts_config`
   singleton. Validate `isTtsProviderConfigured`.
3. Resolve **model**: explicit override → `variant.tts_model` →
   `tts_config.default_tts_model` → provider default, all run through
   `resolveTtsModel` (invalid ids snap to the provider default).
4. Resolve **voice**: explicit → `variant.tts_voice_id` → `tts_config` →
   default, **scoped to the resolved model** via `resolveTtsVoice` (a voice that
   doesn't belong to the model falls back to that model's default voice, then the
   provider default).
5. Upsert `story_part_audio` (unique on `story_part_translation_id`) → `generating`.
6. `withRetry(provider.synthesize(..., model))`, logging each failed attempt to
   `tts_jobs` (with `tts_model`).
7. `uploadAudio` to R2 with key `audio/<variantId>/<partNumber>-<voiceId>.<ext>`
   (extension derived from the returned MIME type — Sarvam = `wav`, ElevenLabs = `mp3`).
8. Update `story_part_audio` → `completed` (+ `tts_model`, `audio_path`,
   `mime_type`, `byte_size`, `characters`) and insert a success `tts_jobs` row
   (with `tts_model`). On failure → `failed` + `error_message`. **Never throws
   out of the route** (returns a `{ ok }` union like `RunPartResult`; the success
   `RunPartAudioResult` includes the resolved `model`).

Long-text handling: both providers cap text per request (Sarvam **2500**,
ElevenLabs **~10k** chars). Each provider chunks below its limit via the shared
[chunkText](../../lib/tts/chunk.ts) (sentence-aware, Latin + Devanagari danda)
and stitches the per-chunk audio back into one file — Sarvam merges WAV PCM
payloads (`mergeWavs`), ElevenLabs concatenates MP3 byte streams. The pipeline
sends a full part in one `synthesize()` call regardless of length.

> **Sarvam returns multi-segment responses.** Sarvam splits each request
> internally and returns **one WAV per segment** in the `audios[]` array — not a
> single clip. `#synthesizeChunk` must collect **all** elements
> (`audios.map(...)`), then `mergeWavs` stitches every segment of every chunk
> into one track. Reading only `audios[0]` truncates each chunk to its opening
> sentences (the symptom: a long part renders as a few seconds of disjoint
> snippets). All segments share one voice + sample rate, so the PCM concat is
> lossless.

---

## Env

Server-only secrets: `SARVAM_API_KEY`, `ELEVENLABS_API_KEY`, `R2_ACCOUNT_ID`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
Public (browser builds playback URLs): `NEXT_PUBLIC_R2_PUBLIC_URL`.

Related: [API/tts.md](../API/tts.md) · [04-database.md §4.14–§4.17](../04-database.md) ·
[UI/admin.md](../UI/admin.md) (TTS config + VariantPanel audio) ·
[UI/reader.md](../UI/reader.md) (Listen control).
