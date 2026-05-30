import { isRetryableStatus, ProviderError } from "@/lib/ai/types";
import { chunkText } from "../chunk";
import { getTtsProviderMeta, toSarvamLanguageCode } from "../registry";
import type { TtsInput, TtsOutput, TtsProvider } from "../types";

const PROVIDER_ID = "sarvam" as const;
const ENDPOINT = "https://api.sarvam.ai/text-to-speech";

/**
 * Sarvam's bulbul:v3 per-request limit is 2500 characters. We chunk below that
 * on sentence boundaries and stitch the returned WAV clips into one file so a
 * full story part narrates as a single track.
 */
const MAX_CHARS = 2000;

/**
 * Audiobook-grade output sample rate (Hz). 24000 is bulbul:v3's default and a
 * good quality/size balance for long-form narration. Every chunk MUST request
 * the same rate so the WAV clips concatenate losslessly in mergeWavs().
 */
const SPEECH_SAMPLE_RATE = 24000;

/**
 * Sarvam AI TTS (Indic-focused). Sends JSON, receives base64-encoded WAV in
 * `audios[]`. Maps HTTP failures onto the shared ProviderError so withRetry
 * (lib/ai/retry.ts) classifies them exactly like the translation providers.
 *
 * Long parts are split into ≤2000-char chunks (Sarvam caps text at 2500) and
 * the per-chunk WAVs are merged via mergeWavs() — all chunks share one voice +
 * format, so concatenating their PCM payloads is lossless.
 */
export class SarvamProvider implements TtsProvider {
  readonly id = PROVIDER_ID;
  readonly name: string;
  readonly #apiKey: string;
  readonly #model: string;
  readonly #defaultVoice: string;

  constructor() {
    const meta = getTtsProviderMeta(PROVIDER_ID);
    if (!meta) throw new Error("Sarvam provider metadata missing");
    this.name = meta.name;
    this.#model = meta.defaultModel;
    this.#defaultVoice = meta.defaultVoiceId;

    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) {
      throw new ProviderError({
        message: "SARVAM_API_KEY is not set",
        providerId: "unknown",
        isRetryable: false,
      });
    }
    this.#apiKey = apiKey;
  }

  async synthesize(input: TtsInput, voiceId?: string, model?: string): Promise<TtsOutput> {
    const speaker = voiceId ?? input.voiceId ?? this.#defaultVoice;
    const useModel = model ?? this.#model;
    const targetLanguageCode = toSarvamLanguageCode(input.languageCode);
    if (!targetLanguageCode) {
      throw new ProviderError({
        message: `Sarvam does not support language "${input.languageCode}".`,
        providerId: "unknown",
        isRetryable: false,
      });
    }

    const chunks = chunkText(input.text, MAX_CHARS);
    const wavs: Uint8Array[] = [];
    for (const chunk of chunks) {
      // Sarvam splits each request internally and returns ONE WAV per segment
      // in audios[] — collect them all, not just the first, or the part is
      // truncated to its opening sentences.
      wavs.push(...(await this.#synthesizeChunk(chunk, targetLanguageCode, speaker, useModel)));
    }

    return {
      audio: mergeWavs(wavs),
      mimeType: "audio/wav",
      characters: input.text.length,
      voiceUsed: speaker,
      modelUsed: useModel,
      provider: PROVIDER_ID,
    };
  }

  /**
   * One Sarvam request → the raw WAV bytes for EVERY segment Sarvam returns.
   * Sarvam may split a single within-limit chunk into multiple `audios[]`
   * clips; returning all of them (not just the first) is what keeps the full
   * text narrated. The caller spreads these into the merge list.
   */
  async #synthesizeChunk(
    text: string,
    targetLanguageCode: string,
    speaker: string,
    model: string,
  ): Promise<Uint8Array[]> {
    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "api-subscription-key": this.#apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          target_language_code: targetLanguageCode,
          speaker,
          model,
          speech_sample_rate: SPEECH_SAMPLE_RATE,
        }),
      });
    } catch (err) {
      // Network-level failure → retryable.
      throw new ProviderError({
        message: err instanceof Error ? err.message : "Sarvam request failed",
        providerId: "unknown",
        isRetryable: true,
        cause: err,
      });
    }

    if (!response.ok) {
      const detail = await safeErrorText(response);
      throw new ProviderError({
        message: `Sarvam HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
        providerId: "unknown",
        status: response.status,
        isRetryable: isRetryableStatus(response.status),
      });
    }

    const data = (await response.json()) as { audios?: string[] };
    const segments = data.audios ?? [];
    if (segments.length === 0) {
      throw new ProviderError({
        message: "Sarvam returned no audio.",
        providerId: "unknown",
        isRetryable: true,
      });
    }
    return segments.map((base64) => new Uint8Array(Buffer.from(base64, "base64")));
  }
}

interface WavData {
  dataStart: number;
  dataSize: number;
  dataSizeOffset: number;
}

/** Locate the "data" subchunk of a WAV buffer, or null if it isn't a parseable WAV. */
function parseWav(bytes: Uint8Array): WavData | null {
  if (bytes.length < 12) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12; // skip "RIFF" + size + "WAVE"
  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    const size = view.getUint32(offset + 4, true);
    const contentStart = offset + 8;
    if (id === "data") {
      return { dataStart: contentStart, dataSize: size, dataSizeOffset: offset + 4 };
    }
    offset = contentStart + size + (size % 2); // chunks are word-aligned
  }
  return null;
}

/**
 * Concatenate same-format WAV buffers into one. Uses the first file's header as
 * the template, appends every file's PCM payload, and rewrites the RIFF + data
 * size fields. Falls back to the first buffer if anything is unparseable.
 */
function mergeWavs(buffers: Uint8Array[]): Uint8Array {
  if (buffers.length === 1) return buffers[0];

  const first = buffers[0];
  const firstData = parseWav(first);
  if (!firstData) return first;

  const pcmParts: Uint8Array[] = [];
  let totalPcm = 0;
  for (const buf of buffers) {
    const d = parseWav(buf);
    if (!d) continue;
    const pcm = buf.subarray(d.dataStart, d.dataStart + d.dataSize);
    pcmParts.push(pcm);
    totalPcm += pcm.length;
  }

  const headerLen = firstData.dataStart;
  const out = new Uint8Array(headerLen + totalPcm);
  out.set(first.subarray(0, headerLen), 0);
  let pos = headerLen;
  for (const pcm of pcmParts) {
    out.set(pcm, pos);
    pos += pcm.length;
  }

  const outView = new DataView(out.buffer);
  outView.setUint32(4, out.length - 8, true); // RIFF chunk size
  outView.setUint32(firstData.dataSizeOffset, totalPcm, true); // data subchunk size
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
