import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/check-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { isProviderConfigured, getProviderMeta, type ProviderId } from "@/lib/ai/registry";
import { translate } from "@/lib/ai/translate";
import { getComplexityMeta } from "@/lib/ai/complexity";
import { ProviderError } from "@/lib/ai/types";

/**
 * Sends one tiny test prompt to the chosen provider/model and returns the
 * translation. Used by the AI config page's "Send test request" button to
 * verify the wiring end-to-end.
 *
 * We pull the literary brief from the seeded Premchand (Hindi) tone — so
 * a successful response actually demonstrates style-aware translation,
 * not just API connectivity.
 */
export async function POST(request: Request): Promise<Response> {
  await requireAdmin();

  let body: { providerName?: string; modelName?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const providerId = body.providerName as ProviderId | undefined;
  if (!providerId) {
    return NextResponse.json(
      { ok: false, error: "providerName is required." },
      { status: 400 },
    );
  }

  const meta = getProviderMeta(providerId);
  if (!meta) {
    return NextResponse.json(
      { ok: false, error: `Unknown provider "${providerId}".` },
      { status: 400 },
    );
  }
  if (!isProviderConfigured(providerId)) {
    return NextResponse.json(
      { ok: false, error: `${meta.name} is not configured — set ${meta.envKey} in .env.local.` },
      { status: 400 },
    );
  }

  // Pull a representative tone + language from the DB so the test exercises
  // the same code path real translations use. Premchand/Hindi is seeded.
  const admin = createAdminClient();
  const { data: tone, error: toneErr } = await admin
    .from("tones")
    .select("prompt_fragment, language_code, name")
    .eq("name", "Premchand")
    .eq("language_code", "hi")
    .single();
  if (toneErr) {
    return NextResponse.json(
      { ok: false, error: `Could not load test tone: ${toneErr.message}` },
      { status: 500 },
    );
  }
  const { data: language, error: langErr } = await admin
    .from("languages")
    .select("name_english, name_native")
    .eq("code", tone.language_code)
    .single();
  if (langErr) {
    return NextResponse.json(
      { ok: false, error: `Could not load test language: ${langErr.message}` },
      { status: 500 },
    );
  }

  const complexity = getComplexityMeta("standard");
  if (!complexity) {
    return NextResponse.json(
      { ok: false, error: "Complexity preset missing." },
      { status: 500 },
    );
  }

  const startedAt = performance.now();
  try {
    const result = await translate(providerId, {
      text: "She walked through the village at dusk, the air heavy with the smell of wet earth and woodsmoke. An old man called out a greeting from his doorway, and she answered without looking back.",
      targetLanguage: tone.language_code,
      targetLanguageNameEnglish: language.name_english,
      targetLanguageNameNative: language.name_native,
      toneFragment: tone.prompt_fragment,
      complexityFragment: complexity.fragment,
    }, {
      modelName: body.modelName,
      retry: { delays: [] }, // No retry for the test — we want fast feedback.
    });

    const latencyMs = Math.round(performance.now() - startedAt);
    return NextResponse.json({
      ok: true,
      latencyMs,
      provider: meta.name,
      modelUsed: result.modelUsed,
      tokensUsed: result.tokensUsed,
      tone: tone.name,
      targetLanguage: `${language.name_english} (${language.name_native})`,
      translatedText: result.translatedText,
    });
  } catch (err) {
    const latencyMs = Math.round(performance.now() - startedAt);
    if (err instanceof ProviderError) {
      return NextResponse.json(
        {
          ok: false,
          latencyMs,
          provider: meta.name,
          status: err.status,
          retryable: err.isRetryable,
          error: err.message,
        },
        { status: 502 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        latencyMs,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
