import Groq from "groq-sdk";
import { buildTranslationPrompt } from "../prompt-builder";
import { getProviderMeta } from "../registry";
import {
  isRetryableStatus,
  ProviderError,
  type TranslationInput,
  type TranslationOutput,
  type TranslationProvider,
} from "../types";

const PROVIDER_ID = "groq" as const;

export class GroqProvider implements TranslationProvider {
  readonly id = PROVIDER_ID;
  readonly name: string;
  readonly models: ReadonlyArray<string>;
  readonly #defaultModel: string;
  readonly #client: Groq;

  constructor() {
    const meta = getProviderMeta(PROVIDER_ID);
    if (!meta) throw new Error("Groq provider metadata missing");
    this.name = meta.name;
    this.models = meta.models;
    this.#defaultModel = meta.defaultModel;

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new ProviderError({
        message: "GROQ_API_KEY is not set",
        providerId: PROVIDER_ID,
        isRetryable: false,
      });
    }
    this.#client = new Groq({ apiKey });
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
          message: "Groq returned an empty response",
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
      throw toProviderError(err);
    }
  }
}

function toProviderError(raw: unknown): ProviderError {
  const e = raw as { status?: number; message?: string };
  const status = typeof e?.status === "number" ? e.status : undefined;
  return new ProviderError({
    message: e?.message ?? "Groq request failed",
    providerId: PROVIDER_ID,
    status,
    isRetryable: isRetryableStatus(status),
    cause: raw,
  });
}
