import { GoogleGenAI } from "@google/genai";
import { buildTranslationPrompt } from "../prompt-builder";
import { getProviderMeta } from "../registry";
import {
  isRetryableStatus,
  ProviderError,
  type TranslationInput,
  type TranslationOutput,
  type TranslationProvider,
} from "../types";

const PROVIDER_ID = "gemini" as const;

export class GeminiProvider implements TranslationProvider {
  readonly id = PROVIDER_ID;
  readonly name: string;
  readonly models: ReadonlyArray<string>;
  readonly #defaultModel: string;
  readonly #client: GoogleGenAI;

  constructor() {
    const meta = getProviderMeta(PROVIDER_ID);
    if (!meta) throw new Error("Gemini provider metadata missing");
    this.name = meta.name;
    this.models = meta.models;
    this.#defaultModel = meta.defaultModel;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new ProviderError({
        message: "GEMINI_API_KEY is not set",
        providerId: PROVIDER_ID,
        isRetryable: false,
      });
    }
    this.#client = new GoogleGenAI({ apiKey });
  }

  async translate(input: TranslationInput, modelName?: string): Promise<TranslationOutput> {
    const model = modelName && this.models.includes(modelName) ? modelName : this.#defaultModel;
    const { system, user } = buildTranslationPrompt(input);

    try {
      const response = await this.#client.models.generateContent({
        model,
        contents: user,
        config: {
          systemInstruction: system,
          // Conservative-ish — we want literary translation, not creative riffs.
          temperature: 0.7,
        },
      });

      const text = (response.text ?? "").trim();
      if (!text) {
        // An empty candidate has several distinct causes — surface which one so
        // failures are diagnosable instead of an opaque "empty response":
        //   - promptFeedback.blockReason → the PROMPT was blocked outright.
        //   - finishReason RECITATION    → Gemini refused to echo text it
        //     recognises as near-verbatim training data (common when asked to
        //     reproduce a classic/public-domain text, e.g. the narration task).
        //   - finishReason SAFETY        → the output tripped a safety filter.
        //   - finishReason MAX_TOKENS    → ran out of output budget (retryable).
        const candidate = response.candidates?.[0];
        const finishReason = candidate?.finishReason
          ? String(candidate.finishReason)
          : undefined;
        const blockReason = response.promptFeedback?.blockReason
          ? String(response.promptFeedback.blockReason)
          : undefined;
        const detail = blockReason
          ? `prompt blocked (${blockReason})`
          : finishReason
            ? `finishReason=${finishReason}`
            : "no text in candidate";
        throw new ProviderError({
          message: `Gemini returned an empty response — ${detail}`,
          providerId: PROVIDER_ID,
          // RECITATION / SAFETY / a blocked prompt won't change on retry; only
          // a token-budget miss (or a truly unknown empty) is worth retrying.
          isRetryable: finishReason === "MAX_TOKENS" || (!finishReason && !blockReason),
        });
      }

      const usage = response.usageMetadata;
      return {
        translatedText: text,
        modelUsed: model,
        provider: PROVIDER_ID,
        tokensUsed: usage
          ? {
              input: usage.promptTokenCount ?? 0,
              output: usage.candidatesTokenCount ?? 0,
            }
          : undefined,
      };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw toProviderError(err);
    }
  }
}

/**
 * Map @google/genai's error shape onto our ProviderError. The SDK throws
 * objects with `status` (number) on HTTP failures and plain Errors on
 * network failures.
 */
function toProviderError(raw: unknown): ProviderError {
  const e = raw as { status?: number; message?: string; code?: string };
  const status = typeof e?.status === "number" ? e.status : undefined;
  return new ProviderError({
    message: e?.message ?? "Gemini request failed",
    providerId: PROVIDER_ID,
    status,
    isRetryable: isRetryableStatus(status),
    cause: raw,
  });
}
