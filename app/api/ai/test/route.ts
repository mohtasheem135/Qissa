import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/check-admin";
import { getProviderMeta, isProviderConfigured, type ProviderId } from "@/lib/ai/registry";

/**
 * Phase 5 stub. Returns a structured "not wired" response so the AI config
 * page's "Test connection" button gives meaningful feedback today without
 * pretending to call the model.
 *
 * Phase 6 replaces the body with a real provider.translate('Hello') round
 * trip and returns { result, latencyMs, tokensUsed }.
 */
export async function POST(request: Request): Promise<Response> {
  await requireAdmin();

  let body: { providerName?: string; modelName?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const providerId = body.providerName as ProviderId | undefined;
  if (!providerId) {
    return NextResponse.json({ error: "providerName is required." }, { status: 400 });
  }

  const meta = getProviderMeta(providerId);
  if (!meta) {
    return NextResponse.json({ error: `Unknown provider "${providerId}".` }, { status: 400 });
  }
  if (!isProviderConfigured(providerId)) {
    return NextResponse.json(
      { error: `${meta.name} is not configured — set ${meta.envKey} in .env.local.` },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    pending: true,
    message: `Provider "${meta.name}" is configured. Real round-trip lands in Phase 6.`,
    provider: meta.name,
    model: body.modelName ?? meta.defaultModel,
  });
}
