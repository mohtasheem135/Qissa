import { buildTranslationPrompt } from "../prompt-builder";
import { getProviderMeta } from "../registry";
import {
  isRetryableStatus,
  ProviderError,
  type TranslationInput,
  type TranslationOutput,
  type TranslationProvider,
} from "../types";

const PROVIDER_ID = "openrouter" as const;
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/**
 * OpenRouter has no first-party SDK; we hit the OpenAI-compatible REST
 * endpoint directly. Their docs recommend setting HTTP-Referer + X-Title
 * so the request shows up under your account properly.
 */
export class OpenRouterProvider implements TranslationProvider {
  readonly id = PROVIDER_ID;
  readonly name: string;
  readonly models: ReadonlyArray<string>;
  readonly #defaultModel: string;
  readonly #apiKey: string;

  constructor() {
    const meta = getProviderMeta(PROVIDER_ID);
    if (!meta) throw new Error("OpenRouter provider metadata missing");
    this.name = meta.name;
    this.models = meta.models;
    this.#defaultModel = meta.defaultModel;

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new ProviderError({
        message: "OPENROUTER_API_KEY is not set",
        providerId: PROVIDER_ID,
        isRetryable: false,
      });
    }
    this.#apiKey = apiKey;
  }

  async translate(input: TranslationInput, modelName?: string): Promise<TranslationOutput> {
    const model = modelName && modelName.length > 0 ? modelName : this.#defaultModel;
    const { system, user } = buildTranslationPrompt(input);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.#apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": appUrl,
          "X-Title": "Qissa",
        },
        body: JSON.stringify({
          model,
          temperature: 0.7,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
    } catch (err) {
      throw new ProviderError({
        message: err instanceof Error ? err.message : "OpenRouter network error",
        providerId: PROVIDER_ID,
        isRetryable: true,
        cause: err,
      });
    }

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      throw new ProviderError({
        message: `OpenRouter ${response.status}: ${bodyText.slice(0, 200)}`,
        providerId: PROVIDER_ID,
        status: response.status,
        isRetryable: isRetryableStatus(response.status),
      });
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = (payload.choices?.[0]?.message?.content ?? "").trim();
    if (!text) {
      throw new ProviderError({
        message: "OpenRouter returned an empty response",
        providerId: PROVIDER_ID,
        isRetryable: true,
      });
    }

    return {
      translatedText: text,
      modelUsed: model,
      provider: PROVIDER_ID,
      tokensUsed: payload.usage
        ? {
            input: payload.usage.prompt_tokens ?? 0,
            output: payload.usage.completion_tokens ?? 0,
          }
        : undefined,
    };
  }
}
