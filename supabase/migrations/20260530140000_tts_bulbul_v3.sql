-- =============================================================================
-- Qissa — Sarvam TTS upgraded to bulbul:v3 (audiobook voices)
-- =============================================================================
-- The Sarvam provider moved from bulbul:v2 → bulbul:v3 (lib/tts/registry.ts):
-- higher-quality, audiobook-grade narration with a new 36-voice catalog. The
-- old v2 speaker ids (anushka, manisha, vidya, arya, abhilash, karun, hitesh)
-- are NOT valid v3 speakers, so any stored references to them are stale.
--
-- The synthesis path already self-heals (an unknown voice falls back to the
-- provider's default), but the admin pickers would show an orphaned selection.
-- This migration resets those stored references to the new v3 default so the
-- UI stays consistent.
--
-- Purely data hygiene — no schema change.
-- =============================================================================

set search_path to public, extensions;

-- The v2 speaker ids that no longer exist under bulbul:v3.
-- (kept inline so this migration is self-contained)

-- 1) Global default voice → new v3 default.
update public.tts_config
   set default_voice_id = 'priya'
 where default_tts_provider = 'sarvam'
   and default_voice_id in ('anushka','manisha','vidya','arya','abhilash','karun','hitesh');

-- 2) Per-variant overrides → null, so they fall back to the v3 default.
update public.story_variants
   set tts_voice_id = null
 where tts_provider = 'sarvam'
   and tts_voice_id in ('anushka','manisha','vidya','arya','abhilash','karun','hitesh');
