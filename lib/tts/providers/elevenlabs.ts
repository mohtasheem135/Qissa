import { isRetryableStatus, ProviderError } from "@/lib/ai/types";
import { chunkText } from "../chunk";
import { getTtsProviderMeta } from "../registry";
import type { TtsInput, TtsOutput, TtsProvider } from "../types";

const PROVIDER_ID = "elevenlabs" as const;
const BASE = "https://api.elevenlabs.io/v1/text-to-speech";

/** eleven_multilingual_v2 caps at 10k chars/request; chunk safely below that. */
const MAX_CHARS = 9000;

/**
 * ElevenLabs TTS (multilingual). POSTs to /text-to-speech/{voiceId} with the
 * multilingual model and reads raw MP3 bytes. Voices are not language-bound,
 * so `languageCode` is informational here — the model auto-detects script.
 *
 * Long parts are split into ≤9000-char chunks and the per-chunk MP3 byte
 * streams are concatenated (MP3 frames play back sequentially).
 */
export class ElevenLabsProvider implements TtsProvider {
  readonly id = PROVIDER_ID;
  readonly name: string;
  readonly #apiKey: string;
  readonly #model: string;
  readonly #defaultVoice: string;

  constructor() {
    const meta = getTtsProviderMeta(PROVIDER_ID);
    if (!meta) throw new Error("ElevenLabs provider metadata missing");
    this.name = meta.name;
    this.#model = meta.defaultModel;
    this.#defaultVoice = meta.defaultVoiceId;

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new ProviderError({
        message: "ELEVENLABS_API_KEY is not set",
        providerId: "unknown",
        isRetryable: false,
      });
    }
    this.#apiKey = apiKey;
  }

  async synthesize(input: TtsInput, voiceId?: string, model?: string): Promise<TtsOutput> {
    const voice = voiceId ?? input.voiceId ?? this.#defaultVoice;
    const useModel = model ?? this.#model;

    const chunks = chunkText(input.text, MAX_CHARS);
    const parts: Uint8Array[] = [];
    for (const chunk of chunks) {
      parts.push(await this.#synthesizeChunk(chunk, voice, useModel));
    }

    return {
      audio: parts.length === 1 ? parts[0] : concatBytes(parts),
      mimeType: "audio/mpeg",
      characters: input.text.length,
      voiceUsed: voice,
      modelUsed: useModel,
      provider: PROVIDER_ID,
    };
  }

  /** One ElevenLabs request → raw MP3 bytes for a single within-limit chunk. */
  async #synthesizeChunk(text: string, voice: string, model: string): Promise<Uint8Array> {
    let response: Response;
    try {
      response = await fetch(`${BASE}/${voice}`, {
        method: "POST",
        headers: {
          "xi-api-key": this.#apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: model,
        }),
      });
    } catch (err) {
      throw new ProviderError({
        message: err instanceof Error ? err.message : "ElevenLabs request failed",
        providerId: "unknown",
        isRetryable: true,
        cause: err,
      });
    }

    if (!response.ok) {
      const detail = await safeErrorText(response);
      throw new ProviderError({
        message: `ElevenLabs HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
        providerId: "unknown",
        status: response.status,
        isRetryable: isRetryableStatus(response.status),
      });
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0) {
      throw new ProviderError({
        message: "ElevenLabs returned empty audio.",
        providerId: "unknown",
        isRetryable: true,
      });
    }
    return new Uint8Array(buffer);
  }
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

async function safeErrorText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 300);
  } catch {
    return "";
  }
}
