import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/check-admin";
import {
  getTtsProviderMeta,
  getVoiceMeta,
  isTtsProviderConfigured,
  resolveTtsModel,
  resolveTtsVoice,
  type TtsProviderId,
} from "@/lib/tts/registry";
import { synthesize } from "@/lib/tts/synthesize";
import { ProviderError } from "@/lib/ai/types";

/**
 * POST /api/tts/test
 *
 * Body: { providerName, voiceId? }
 *
 * Synthesizes a short sample and returns base64 audio + latency so the TTS
 * config page can play it inline. Mirrors /api/ai/test (which returns text).
 */

const SAMPLE_TEXT: Record<TtsProviderId, { text: string; languageCode: string }> = {
  // Sarvam is Indic — exercise the script path with a Hindi sample.
  sarvam: { text: "नमस्ते, यह क़िस्सा की आवाज़ का एक परीक्षण है।", languageCode: "hi" },
  // ElevenLabs multilingual — an English sample is fine.
  elevenlabs: { text: "Hello — this is a test of the Qissa narration voice.", languageCode: "en" },
};

export async function POST(request: Request): Promise<Response> {
  await requireAdmin();

  let body: { providerName?: string; model?: string; voiceId?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const providerId = body.providerName as TtsProviderId | undefined;
  if (!providerId) {
    return NextResponse.json({ ok: false, error: "providerName is required." }, { status: 400 });
  }

  const meta = getTtsProviderMeta(providerId);
  if (!meta) {
    return NextResponse.json(
      { ok: false, error: `Unknown provider "${providerId}".` },
      { status: 400 },
    );
  }
  if (!isTtsProviderConfigured(providerId)) {
    return NextResponse.json(
      { ok: false, error: `${meta.name} is not configured — set ${meta.envKey} in .env.local.` },
      { status: 400 },
    );
  }

  const model = resolveTtsModel(providerId, body.model?.trim());
  const voiceId = resolveTtsVoice(providerId, model, body.voiceId?.trim());
  const sample = SAMPLE_TEXT[providerId];

  const startedAt = performance.now();
  try {
    const result = await synthesize(
      providerId,
      { text: sample.text, languageCode: sample.languageCode, voiceId },
      { voiceId, model, retry: { delays: [] } }, // No retry for the test — fast feedback.
    );

    const latencyMs = Math.round(performance.now() - startedAt);
    const base64 = Buffer.from(result.audio).toString("base64");

    return NextResponse.json({
      ok: true,
      latencyMs,
      provider: meta.name,
      voiceUsed: getVoiceMeta(providerId, result.voiceUsed)?.name ?? result.voiceUsed,
      characters: result.characters,
      mimeType: result.mimeType,
      audioBase64: base64,
    });
  } catch (err) {
    const latencyMs = Math.round(performance.now() - startedAt);
    if (err instanceof ProviderError) {
      return NextResponse.json(
        { ok: false, latencyMs, provider: meta.name, status: err.status, error: err.message },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { ok: false, latencyMs, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
