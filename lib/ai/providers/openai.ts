import OpenAI from "openai";
import { buildTranslationPrompt } from "../prompt-builder";
import { getProviderMeta } from "../registry";
import {
  isRetryableStatus,
  ProviderError,
  type TranslationInput,
  type TranslationOutput,
  type TranslationProvider,
} from "../types";

const PROVIDER_ID = "openai" as const;

export class OpenAIProvider implements TranslationProvider {
  readonly id = PROVIDER_ID;
  readonly name: string;
  readonly models: ReadonlyArray<string>;
  readonly #defaultModel: string;
  readonly #client: OpenAI;

  constructor() {
    const meta = getProviderMeta(PROVIDER_ID);
    if (!meta) throw new Error("OpenAI provider metadata missing");
    this.name = meta.name;
    this.models = meta.models;
    this.#defaultModel = meta.defaultModel;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ProviderError({
        message: "OPENAI_API_KEY is not set",
        providerId: PROVIDER_ID,
        isRetryable: false,
      });
    }
    this.#client = new OpenAI({ apiKey });
  }

  async translate(input: TranslationInput, modelName?: string): Promise<TranslationOutput> {
    const model = modelName && this.models.includes(modelName) ? modelName : this.#defaultModel;
    const { system, user } = buildTranslationPrompt(input);

    try {
      const completion = await this.#client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.7,
      });

      const choice = completion.choices[0];
      const text = (choice?.message?.content ?? "").trim();
      if (!text) {
        throw new ProviderError({
          message: "OpenAI returned an empty response",
          providerId: PROVIDER_ID,
          isRetryable: true,
        });
      }

      const usage = completion.usage;
      return {
        translatedText: text,
        modelUsed: model,
        provider: PROVIDER_ID,
        tokensUsed: usage
          ? { input: usage.prompt_tokens ?? 0, output: usage.completion_tokens ?? 0 }
          : undefined,
      };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      const e = err as { status?: number; message?: string };
      throw new ProviderError({
        message: e?.message ?? "OpenAI request failed",
        providerId: PROVIDER_ID,
        status: e?.status,
        isRetryable: isRetryableStatus(e?.status),
        cause: err,
      });
    }
  }
}
