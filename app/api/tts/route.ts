import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/check-admin";
import { runStoryPartAudio } from "@/lib/tts/run-part";
import { audioUrl } from "@/lib/r2/url";
import type { TtsProviderId } from "@/lib/tts/registry";

/**
 * POST /api/tts
 *
 * Body: { storyPartTranslationId, voiceId?, providerName? }
 *
 * Single (variant, part) audio generation. All persistence + retry + upload +
 * job-log logic lives in lib/tts/run-part.ts (shared with the queue endpoint).
 * Mirrors /api/translate.
 */
export async function POST(request: Request): Promise<Response> {
  await requireAdmin();

  let body: {
    storyPartTranslationId?: string;
    voiceId?: string;
    model?: string;
    providerName?: string;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const storyPartTranslationId = body.storyPartTranslationId?.trim();
  if (!storyPartTranslationId) {
    return NextResponse.json(
      { ok: false, error: "storyPartTranslationId is required." },
      { status: 400 },
    );
  }

  const result = await runStoryPartAudio(storyPartTranslationId, {
    providerId: body.providerName as TtsProviderId | undefined,
    voiceId: body.voiceId,
    model: body.model,
    signal: request.signal,
  });

  if (result.ok) {
    return NextResponse.json({
      ok: true,
      audioUrl: audioUrl(result.audioPath),
      provider: result.provider,
      voiceId: result.voiceId,
      characters: result.characters,
      durationSeconds: result.durationSeconds,
      durationMs: result.durationMs,
    });
  }

  return NextResponse.json(
    {
      ok: false,
      error: result.error,
      provider: result.provider,
      voiceId: result.voiceId,
      durationMs: result.durationMs,
    },
    { status: result.status && result.status >= 400 ? result.status : 502 },
  );
}
