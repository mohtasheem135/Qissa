-- =============================================================================
-- Qissa — Selectable TTS model (engine) per provider
-- =============================================================================
-- Providers now expose multiple models (Sarvam bulbul:v3 / bulbul:v2;
-- ElevenLabs multilingual_v2 / turbo / flash). The admin picks a default model
-- in /tts-config and can override it per story variant — mirroring how
-- tts_provider / tts_voice_id already work. Voices are model-specific, so the
-- model travels alongside the voice everywhere.
--
-- New columns (all text):
--   tts_config.default_tts_model    global default engine
--   story_variants.tts_model        per-variant override (null → inherit)
--   story_part_audio.tts_model      which engine generated the stored audio
--   tts_jobs.tts_model              per-attempt log → analytics by model
-- =============================================================================

set search_path to public, extensions;

alter table public.tts_config
  add column default_tts_model text not null default 'bulbul:v3';

alter table public.story_variants
  add column tts_model text;

alter table public.story_part_audio
  add column tts_model text;

alter table public.tts_jobs
  add column tts_model text;
