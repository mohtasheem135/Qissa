import Anthropic from "@anthropic-ai/sdk";
import { buildTranslationPrompt } from "../prompt-builder";
import { getProviderMeta } from "../registry";
import {
  isRetryableStatus,
  ProviderError,
  type TranslationInput,
  type TranslationOutput,
  type TranslationProvider,
} from "../types";

const PROVIDER_ID = "anthropic" as const;
const DEFAULT_MAX_TOKENS = 4096;

export class AnthropicProvider implements TranslationProvider {
  readonly id = PROVIDER_ID;
  readonly name: string;
  readonly models: ReadonlyArray<string>;
  readonly #defaultModel: string;
  readonly #client: Anthropic;

  constructor() {
    const meta = getProviderMeta(PROVIDER_ID);
    if (!meta) throw new Error("Anthropic provider metadata missing");
    this.name = meta.name;
    this.models = meta.models;
    this.#defaultModel = meta.defaultModel;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new ProviderError({
        message: "ANTHROPIC_API_KEY is not set",
        providerId: PROVIDER_ID,
        isRetryable: false,
      });
    }
    this.#client = new Anthropic({ apiKey });
  }

  async translate(input: TranslationInput, modelName?: string): Promise<TranslationOutput> {
    const model = modelName && this.models.includes(modelName) ? modelName : this.#defaultModel;
    const { system, user } = buildTranslationPrompt(input);

    try {
      const response = await this.#client.messages.create({
        model,
        system,
        max_tokens: DEFAULT_MAX_TOKENS,
        temperature: 0.7,
        messages: [{ role: "user", content: user }],
      });

      // Concatenate all text-typed content blocks (Anthropic responses are
      // arrays; in our simple translation case there's only one).
      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim();

      if (!text) {
        throw new ProviderError({
          message: "Anthropic returned an empty response",
          providerId: PROVIDER_ID,
          isRetryable: true,
        });
      }

      return {
        translatedText: text,
        modelUsed: model,
        provider: PROVIDER_ID,
        tokensUsed: {
          input: response.usage.input_tokens ?? 0,
          output: response.usage.output_tokens ?? 0,
        },
      };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      const e = err as { status?: number; message?: string };
      throw new ProviderError({
        message: e?.message ?? "Anthropic request failed",
        providerId: PROVIDER_ID,
        status: e?.status,
        isRetryable: isRetryableStatus(e?.status),
        cause: err,
      });
    }
  }
}
