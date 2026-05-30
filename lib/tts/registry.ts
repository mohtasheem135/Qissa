/**
 * TTS provider registry — mirrors lib/ai/registry.ts.
 *
 * Describes which TTS providers we support, which have their API key in env,
 * and the curated **voice catalog** (kept in code, keyed by provider +
 * language — no DB voices table in v1, exactly as model lists live here for
 * translation). Do NOT import from a client bundle: the env-key checks read
 * process.env.*_API_KEY which must stay server-only.
 *
 * Add a provider:
 *   1. Add a TtsProviderId + a TTS_PROVIDERS entry (id, name, envKey, …).
 *   2. Add its voices to VOICE_CATALOG.
 *   3. Add a file lib/tts/providers/<id>.ts implementing TtsProvider.
 *   4. Add a `case` to buildTtsProvider() below.
 */

export type TtsProviderId = "sarvam" | "elevenlabs";

/**
 * One selectable engine/model for a provider. Voices are **model-specific**
 * (Sarvam's bulbul:v2 and bulbul:v3 have entirely different speaker sets), so
 * each model carries its own `defaultVoiceId`.
 */
export interface TtsModel {
  id: string;
  name: string;
  /** Default voice for THIS model. Must exist (with this model tag) in VOICE_CATALOG. */
  defaultVoiceId: string;
}

export interface TtsProviderMeta {
  id: TtsProviderId;
  name: string;
  envKey: string;
  /** Selectable engines/models, newest/best first. */
  models: ReadonlyArray<TtsModel>;
  /** Default model id when a caller doesn't pick one. Must be one of `models`. */
  defaultModel: string;
  /** Default voice (= the default model's default voice). Kept for convenience. */
  defaultVoiceId: string;
  freeTier: string;
}

export interface TtsVoice {
  id: string;
  name: string;
  /**
   * App-internal language codes this voice supports (e.g. 'hi', 'ur'). The
   * sentinel "*" means "all languages" (used for ElevenLabs' multilingual
   * voices, which aren't language-bound).
   */
  languageCodes: ReadonlyArray<string>;
  gender: "female" | "male";
  /**
   * Provider model ids this voice belongs to (e.g. ['bulbul:v3']). Omitted or
   * `["*"]` means every model of the provider (ElevenLabs voices are
   * model-agnostic). Sarvam speakers differ between v2 and v3, so each is
   * tagged with its model.
   */
  models?: ReadonlyArray<string>;
  /** Short audiobook/use-case blurb shown in the admin voice pickers. */
  description?: string;
}

export const TTS_PROVIDERS: ReadonlyArray<TtsProviderMeta> = [
  {
    id: "sarvam",
    name: "Sarvam AI",
    envKey: "SARVAM_API_KEY",
    models: [
      { id: "bulbul:v3", name: "Bulbul v3 · audiobook (36 voices)", defaultVoiceId: "priya" },
      { id: "bulbul:v2", name: "Bulbul v2 · legacy (7 voices)", defaultVoiceId: "anushka" },
    ],
    defaultModel: "bulbul:v3",
    defaultVoiceId: "priya",
    freeTier: "Indic · 30+ audiobook voices · free credits",
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    envKey: "ELEVENLABS_API_KEY",
    models: [
      { id: "eleven_multilingual_v2", name: "Multilingual v2", defaultVoiceId: "21m00Tcm4TlvDq8ikWAM" },
      { id: "eleven_turbo_v2_5", name: "Turbo v2.5 (fast)", defaultVoiceId: "21m00Tcm4TlvDq8ikWAM" },
      { id: "eleven_flash_v2_5", name: "Flash v2.5 (fastest)", defaultVoiceId: "21m00Tcm4TlvDq8ikWAM" },
    ],
    defaultModel: "eleven_multilingual_v2",
    defaultVoiceId: "21m00Tcm4TlvDq8ikWAM", // Rachel
    freeTier: "~10k chars/month",
  },
];

/**
 * App language code → Sarvam BCP-47 `target_language_code`. Sarvam is
 * Indic-focused and does NOT cover Urdu or Arabic — those map to nothing, so
 * getVoicesForLanguage('sarvam', 'ur') returns [] and the UI disables it.
 */
const SARVAM_LANGUAGE_MAP: Readonly<Record<string, string>> = {
  en: "en-IN",
  hi: "hi-IN",
  bn: "bn-IN",
  ta: "ta-IN",
  te: "te-IN",
  gu: "gu-IN",
  kn: "kn-IN",
  ml: "ml-IN",
  mr: "mr-IN",
  or: "od-IN",
  pa: "pa-IN",
};

const SARVAM_LANGUAGES = Object.keys(SARVAM_LANGUAGE_MAP);

/** Map an app language code onto Sarvam's BCP-47 code, or null if unsupported. */
export function toSarvamLanguageCode(appCode: string): string | null {
  return SARVAM_LANGUAGE_MAP[appCode] ?? null;
}

/**
 * Curated voice catalog. Sarvam speakers are language-agnostic (one speaker
 * narrates any supported Indic language), so each lists every Sarvam-supported
 * code. ElevenLabs voices are multilingual → "*".
 *
 * Sarvam voices are **model-specific** — each is tagged with its `models`
 * (bulbul:v3 vs bulbul:v2), and the admin pickers scope the list to the chosen
 * model. The v3 set is a curated audiobook subset of its 36 speakers (the
 * storytelling voices Sarvam surfaces on its dashboard + the Tier-1
 * all-rounders); v2 is the legacy 7-voice set. ElevenLabs voices are
 * model-agnostic (no `models` tag → offered for every ElevenLabs model).
 * Genders are from Sarvam's speaker reference.
 */
export const VOICE_CATALOG: Readonly<Record<TtsProviderId, ReadonlyArray<TtsVoice>>> = {
  sarvam: [
    // ---- bulbul:v3 (audiobook) ----
    // Female
    { id: "priya", name: "Priya", languageCodes: SARVAM_LANGUAGES, models: ["bulbul:v3"], gender: "female", description: "Top-quality voice, excellent across Indic languages" },
    { id: "ishita", name: "Ishita", languageCodes: SARVAM_LANGUAGES, models: ["bulbul:v3"], gender: "female", description: "Clear, expressive voice — strong across languages" },
    { id: "roopa", name: "Roopa", languageCodes: SARVAM_LANGUAGES, models: ["bulbul:v3"], gender: "female", description: "Gentle voice, perfect for audiobooks" },
    { id: "suhani", name: "Suhani", languageCodes: SARVAM_LANGUAGES, models: ["bulbul:v3"], gender: "female", description: "Pleasant and soothing voice" },
    { id: "tanya", name: "Tanya", languageCodes: SARVAM_LANGUAGES, models: ["bulbul:v3"], gender: "female", description: "Friendly and modern voice" },
    { id: "kavitha", name: "Kavitha", languageCodes: SARVAM_LANGUAGES, models: ["bulbul:v3"], gender: "female", description: "Graceful and articulate voice" },
    { id: "pooja", name: "Pooja", languageCodes: SARVAM_LANGUAGES, models: ["bulbul:v3"], gender: "female", description: "Warm voice, strong for Odia & Malayalam" },
    { id: "neha", name: "Neha", languageCodes: SARVAM_LANGUAGES, models: ["bulbul:v3"], gender: "female", description: "Soft voice for Telugu & Kannada" },
    // Male
    { id: "aditya", name: "Aditya", languageCodes: SARVAM_LANGUAGES, models: ["bulbul:v3"], gender: "male", description: "Captivating voice for stories and audiobooks" },
    { id: "ashutosh", name: "Ashutosh", languageCodes: SARVAM_LANGUAGES, models: ["bulbul:v3"], gender: "male", description: "Traditional Hindi narration style" },
    { id: "advait", name: "Advait", languageCodes: SARVAM_LANGUAGES, models: ["bulbul:v3"], gender: "male", description: "Contemporary storytelling voice" },
    { id: "gokul", name: "Gokul", languageCodes: SARVAM_LANGUAGES, models: ["bulbul:v3"], gender: "male", description: "Trustworthy and dependable voice" },
    { id: "mani", name: "Mani", languageCodes: SARVAM_LANGUAGES, models: ["bulbul:v3"], gender: "male", description: "Top-quality male voice, excellent clarity" },
    { id: "ratan", name: "Ratan", languageCodes: SARVAM_LANGUAGES, models: ["bulbul:v3"], gender: "male", description: "Reliable narrator — strong for English, Tamil, Marathi" },
    { id: "shubh", name: "Shubh", languageCodes: SARVAM_LANGUAGES, models: ["bulbul:v3"], gender: "male", description: "Versatile default voice across languages" },
    { id: "varun", name: "Varun", languageCodes: SARVAM_LANGUAGES, models: ["bulbul:v3"], gender: "male", description: "Deep, dramatic voice for suspense & thriller" },
    // ---- bulbul:v2 (legacy) ----
    { id: "anushka", name: "Anushka", languageCodes: SARVAM_LANGUAGES, models: ["bulbul:v2"], gender: "female", description: "Clear and professional" },
    { id: "manisha", name: "Manisha", languageCodes: SARVAM_LANGUAGES, models: ["bulbul:v2"], gender: "female", description: "Warm and friendly" },
    { id: "vidya", name: "Vidya", languageCodes: SARVAM_LANGUAGES, models: ["bulbul:v2"], gender: "female", description: "Articulate and precise" },
    { id: "arya", name: "Arya", languageCodes: SARVAM_LANGUAGES, models: ["bulbul:v2"], gender: "female", description: "Young and energetic" },
    { id: "abhilash", name: "Abhilash", languageCodes: SARVAM_LANGUAGES, models: ["bulbul:v2"], gender: "male", description: "Deep and authoritative" },
    { id: "karun", name: "Karun", languageCodes: SARVAM_LANGUAGES, models: ["bulbul:v2"], gender: "male", description: "Natural and conversational" },
    { id: "hitesh", name: "Hitesh", languageCodes: SARVAM_LANGUAGES, models: ["bulbul:v2"], gender: "male", description: "Professional and engaging" },
  ],
  elevenlabs: [
    { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", languageCodes: ["*"], gender: "female" },
    { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi", languageCodes: ["*"], gender: "female" },
    { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella", languageCodes: ["*"], gender: "female" },
    { id: "ErXwobaYiN019PkySvjV", name: "Antoni", languageCodes: ["*"], gender: "male" },
    { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", languageCodes: ["*"], gender: "male" },
  ],
};

export function getTtsProviderMeta(id: TtsProviderId): TtsProviderMeta | undefined {
  return TTS_PROVIDERS.find((p) => p.id === id);
}

/** True when a voice belongs to the given provider model (untagged = all models). */
function voiceSupportsModel(voice: TtsVoice, model: string | undefined): boolean {
  if (!model || !voice.models || voice.models.includes("*")) return true;
  return voice.models.includes(model);
}

/**
 * Voices a provider offers for a given app language code, optionally scoped to
 * a specific model (voices are model-specific for Sarvam). Omit `model` to get
 * every voice regardless of model.
 */
export function getVoicesForLanguage(
  provider: TtsProviderId,
  languageCode: string,
  model?: string,
): ReadonlyArray<TtsVoice> {
  return (VOICE_CATALOG[provider] ?? []).filter(
    (v) =>
      (v.languageCodes.includes("*") || v.languageCodes.includes(languageCode)) &&
      voiceSupportsModel(v, model),
  );
}

/** Find a voice's metadata across the whole catalog (provider-scoped). */
export function getVoiceMeta(provider: TtsProviderId, voiceId: string): TtsVoice | undefined {
  return (VOICE_CATALOG[provider] ?? []).find((v) => v.id === voiceId);
}

/** Model metadata for a (provider, modelId), or undefined if unknown. */
export function getTtsModelMeta(provider: TtsProviderId, modelId: string): TtsModel | undefined {
  return getTtsProviderMeta(provider)?.models.find((m) => m.id === modelId);
}

/** Resolve a usable model id for a provider: the given one if valid, else its default. */
export function resolveTtsModel(provider: TtsProviderId, modelId: string | null | undefined): string {
  const meta = getTtsProviderMeta(provider);
  if (!meta) return modelId ?? "";
  if (modelId && meta.models.some((m) => m.id === modelId)) return modelId;
  return meta.defaultModel;
}

/**
 * Resolve a usable voice for a (provider, model): the given voice if it exists
 * AND belongs to the model, otherwise that model's default voice (falling back
 * to the provider default). Mirrors the model resolver so audio never fails on
 * a stale/foreign voice id.
 */
export function resolveTtsVoice(
  provider: TtsProviderId,
  model: string,
  voiceId: string | null | undefined,
): string {
  const meta = getTtsProviderMeta(provider);
  if (voiceId) {
    const v = getVoiceMeta(provider, voiceId);
    if (v && voiceSupportsModel(v, model)) return voiceId;
  }
  return getTtsModelMeta(provider, model)?.defaultVoiceId ?? meta?.defaultVoiceId ?? (voiceId ?? "");
}

/**
 * True when the provider has a non-empty API key in env.
 * Server-only — never call from a Client Component.
 */
export function isTtsProviderConfigured(id: TtsProviderId): boolean {
  const meta = getTtsProviderMeta(id);
  if (!meta) return false;
  const value = process.env[meta.envKey];
  return typeof value === "string" && value.trim().length > 0;
}

export function getConfiguredTtsProviders(): ReadonlyArray<TtsProviderMeta> {
  return TTS_PROVIDERS.filter((p) => isTtsProviderConfigured(p.id));
}

/**
 * Lazy-instantiated provider factory — mirrors lib/ai/registry.ts. Imports are
 * dynamic so a missing dependency in one provider doesn't break the others at
 * module-load time.
 */
const PROVIDER_CACHE: Partial<Record<TtsProviderId, import("./types").TtsProvider>> = {};

export async function getTtsProvider(id: TtsProviderId): Promise<import("./types").TtsProvider> {
  const cached = PROVIDER_CACHE[id];
  if (cached) return cached;
  const instance = await buildTtsProvider(id);
  PROVIDER_CACHE[id] = instance;
  return instance;
}

async function buildTtsProvider(id: TtsProviderId): Promise<import("./types").TtsProvider> {
  switch (id) {
    case "sarvam": {
      const { SarvamProvider } = await import("./providers/sarvam");
      return new SarvamProvider();
    }
    case "elevenlabs": {
      const { ElevenLabsProvider } = await import("./providers/elevenlabs");
      return new ElevenLabsProvider();
    }
    default: {
      const _exhaustive: never = id;
      throw new Error(`Unhandled TTS provider: ${String(_exhaustive)}`);
    }
  }
}
