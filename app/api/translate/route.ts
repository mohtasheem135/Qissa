import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/check-admin";
import { runStoryPartTranslation } from "@/lib/translation/run-part";
import type { ProviderId } from "@/lib/ai/registry";

/**
 * POST /api/translate
 *
 * Body: { storyPartTranslationId, providerName?, modelName? }
 *
 * Single (variant, part) translation. All persistence + retry + version +
 * job-log logic lives in lib/translation/run-part.ts (shared with the queue
 * endpoint).
 */
export async function POST(request: Request): Promise<Response> {
  await requireAdmin();

  let body: {
    storyPartTranslationId?: string;
    providerName?: string;
    modelName?: string;
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

  const result = await runStoryPartTranslation(storyPartTranslationId, {
    providerName: body.providerName as ProviderId | undefined,
    modelName: body.modelName,
    signal: request.signal,
  });

  if (result.ok) {
    return NextResponse.json({
      ok: true,
      translatedText: result.output.translatedText,
      tokensUsed: result.output.tokensUsed,
      modelUsed: result.output.modelUsed,
      provider: result.output.provider,
      durationMs: result.durationMs,
    });
  }

  return NextResponse.json(
    {
      ok: false,
      error: result.error,
      provider: result.provider,
      modelUsed: result.model,
      durationMs: result.durationMs,
    },
    { status: result.status && result.status >= 400 ? result.status : 502 },
  );
}
