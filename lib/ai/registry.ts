/**
 * Phase 5 skeleton — describes which AI providers we plan to support and
 * which of them have their API key configured in env. Used by the AI
 * config page to populate the provider/model dropdowns.
 *
 * The actual TranslationProvider implementations (real translate() calls)
 * land in Phase 6 — this file will grow a getProvider() factory at that
 * point. Do NOT import this from a client bundle: the env-key checks
 * read process.env.*_API_KEY which must stay server-only.
 */

export type ProviderId = "gemini" | "groq" | "openrouter" | "openai" | "anthropic";

export interface ProviderMeta {
  id: ProviderId;
  name: string;
  defaultModel: string;
  models: ReadonlyArray<string>;
  envKey: string;
  freeTier: string;
}

export const PROVIDERS: ReadonlyArray<ProviderMeta> = [
  {
    id: "gemini",
    name: "Google Gemini",
    defaultModel: "gemini-2.0-flash",
    models: ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-pro", "gemini-1.5-flash"],
    envKey: "GEMINI_API_KEY",
    freeTier: "15 RPM · 1500 RPD",
  },
  {
    id: "groq",
    name: "Groq",
    defaultModel: "llama-3.3-70b-versatile",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
    envKey: "GROQ_API_KEY",
    freeTier: "30 RPM",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    defaultModel: "google/gemini-2.0-flash-exp:free",
    models: [
      "google/gemini-2.0-flash-exp:free",
      "meta-llama/llama-3.3-70b-instruct:free",
      "openai/gpt-4o-mini",
      "anthropic/claude-3.5-sonnet",
    ],
    envKey: "OPENROUTER_API_KEY",
    freeTier: "free models available",
  },
  {
    id: "openai",
    name: "OpenAI",
    defaultModel: "gpt-4o-mini",
    models: ["gpt-4o-mini", "gpt-4o"],
    envKey: "OPENAI_API_KEY",
    freeTier: "paid only",
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    defaultModel: "claude-sonnet-4-5",
    models: ["claude-sonnet-4-5", "claude-haiku-4-5"],
    envKey: "ANTHROPIC_API_KEY",
    freeTier: "paid only",
  },
];

export function getProviderMeta(id: ProviderId): ProviderMeta | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/**
 * True when the provider has a non-empty API key in env.
 * Server-only — never call from a Client Component.
 */
export function isProviderConfigured(id: ProviderId): boolean {
  const meta = getProviderMeta(id);
  if (!meta) return false;
  const value = process.env[meta.envKey];
  return typeof value === "string" && value.trim().length > 0;
}

export function getConfiguredProviders(): ReadonlyArray<ProviderMeta> {
  return PROVIDERS.filter((p) => isProviderConfigured(p.id));
}
