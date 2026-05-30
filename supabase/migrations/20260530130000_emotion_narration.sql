-- =============================================================================
-- Qissa — Emotion narration script (per-part TTS narration text)
-- =============================================================================
-- The reader always shows the clean `story_part_translations.text`. For
-- expressive audio we store a SECOND, narration-only script per translation
-- row (`emotion_text`) that the TTS pipeline synthesizes instead of `text`.
--
-- Emotion is expressed purely through punctuation, pacing (ellipses, em-dashes,
-- paragraph breaks) and `<break time="…"/>` pauses — safe for both Sarvam
-- bulbul:v2 and ElevenLabs multilingual_v2, never read aloud as literal tags.
--
-- The script is generated LAZILY (at audio-generation time or via a manual
-- admin button), so the reading translation stays byte-for-byte identical and
-- text-only variants cost no extra tokens.
--
--   emotion_text    the narration script (null until generated)
--   emotion_status  null | 'generating' | 'ready' | 'failed'
-- =============================================================================

set search_path to public, extensions;

alter table public.story_part_translations
  add column emotion_text    text,
  add column emotion_status  text
    check (emotion_status in ('generating','ready','failed'));
