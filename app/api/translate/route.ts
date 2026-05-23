import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/check-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { translate } from "@/lib/ai/translate";
import { getProviderMeta, isProviderConfigured, type ProviderId } from "@/lib/ai/registry";
import { getComplexityMeta } from "@/lib/ai/complexity";
import { ProviderError } from "@/lib/ai/types";
import { wordCount } from "@/lib/utils/word-count";

/**
 * POST /api/translate
 *
 * Body: { storyPartId, providerName?, modelName? }
 *
 * Translates one story part end-to-end:
 *   1. Load the part + parent story + tone + language from DB.
 *   2. Load the previous part's translated text for coherence (if any).
 *   3. Mark the part as `translating`.
 *   4. Call the provider (default = the story's ai_provider, or ai_config
 *      singleton's default if the story has none set).
 *   5. Each attempt is logged into translation_jobs.
 *   6. On success: insert a story_part_versions row, then update the part
 *      with the new text, word counts, status='completed'.
 *   7. On failure: mark status='failed' with error_message.
 *
 * Phase 7 wires this into the admin UI as a streaming queue.
 */
export async function POST(request: Request): Promise<Response> {
  await requireAdmin();

  let body: { storyPartId?: string; providerName?: string; modelName?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const storyPartId = body.storyPartId?.trim();
  if (!storyPartId) {
    return NextResponse.json({ ok: false, error: "storyPartId is required." }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1) Load the part + every joined thing the prompt needs.
  const { data: part, error: partErr } = await admin
    .from("story_parts")
    .select(
      `id, story_id, part_number, text_original,
       story:stories!inner (
         id, target_language, tone_id, complexity, custom_instructions,
         ai_provider, ai_model
       )`,
    )
    .eq("id", storyPartId)
    .single();

  if (partErr) {
    return NextResponse.json(
      { ok: false, error: `Story part not found: ${partErr.message}` },
      { status: 404 },
    );
  }

  const story = part.story;
  if (!story) {
    return NextResponse.json({ ok: false, error: "Parent story missing." }, { status: 500 });
  }

  // 2) Tone + language metadata for the prompt.
  const [{ data: tone, error: toneErr }, { data: language, error: langErr }] = await Promise.all([
    admin
      .from("tones")
      .select("id, prompt_fragment")
      .eq("id", story.tone_id)
      .single(),
    admin
      .from("languages")
      .select("name_english, name_native")
      .eq("code", story.target_language)
      .single(),
  ]);

  if (toneErr || !tone) {
    return NextResponse.json({ ok: false, error: "Tone not found." }, { status: 500 });
  }
  if (langErr || !language) {
    return NextResponse.json({ ok: false, error: "Target language not found." }, { status: 500 });
  }

  const complexity = getComplexityMeta(story.complexity);
  if (!complexity) {
    return NextResponse.json(
      { ok: false, error: `Unknown complexity "${story.complexity}".` },
      { status: 500 },
    );
  }

  // 3) Previous part's translated text → context for coherence.
  let previousPartContext: string | undefined;
  if (part.part_number > 1) {
    const { data: prev } = await admin
      .from("story_parts")
      .select("text_translated")
      .eq("story_id", story.id)
      .eq("part_number", part.part_number - 1)
      .single();
    if (prev?.text_translated) previousPartContext = prev.text_translated;
  }

  // 4) Resolve provider + model. Override > story default > global default.
  const requestedProvider = body.providerName as ProviderId | undefined;
  let providerId: ProviderId;
  if (requestedProvider) {
    providerId = requestedProvider;
  } else if (story.ai_provider && isKnownProviderId(story.ai_provider)) {
    providerId = story.ai_provider;
  } else {
    const { data: defaults, error: cfgErr } = await admin
      .from("ai_config")
      .select("default_provider, default_model")
      .single();
    if (cfgErr || !defaults) {
      return NextResponse.json({ ok: false, error: "ai_config missing." }, { status: 500 });
    }
    if (!isKnownProviderId(defaults.default_provider)) {
      return NextResponse.json(
        { ok: false, error: `ai_config.default_provider invalid: ${defaults.default_provider}` },
        { status: 500 },
      );
    }
    providerId = defaults.default_provider;
  }
  const providerMeta = getProviderMeta(providerId);
  if (!providerMeta) {
    return NextResponse.json(
      { ok: false, error: `Unknown provider "${providerId}".` },
      { status: 400 },
    );
  }
  if (!isProviderConfigured(providerId)) {
    return NextResponse.json(
      {
        ok: false,
        error: `${providerMeta.name} is not configured — set ${providerMeta.envKey} in env.`,
      },
      { status: 400 },
    );
  }

  const modelName = body.modelName ?? story.ai_model ?? providerMeta.defaultModel;

  // 5) Flip the part to 'translating' so the UI shows the spinner.
  await admin
    .from("story_parts")
    .update({ status: "translating", error_message: null })
    .eq("id", storyPartId);

  // 6) Run the provider with retry; log every attempt.
  const startedAt = Date.now();
  let attemptCounter = 0;
  let lastAttemptStartedAt = startedAt;

  try {
    const result = await translate(
      providerId,
      {
        text: part.text_original,
        targetLanguage: story.target_language,
        targetLanguageNameEnglish: language.name_english,
        targetLanguageNameNative: language.name_native,
        toneFragment: tone.prompt_fragment,
        complexityFragment: complexity.fragment,
        customInstructions: story.custom_instructions ?? undefined,
        previousPartContext,
      },
      {
        modelName,
        retry: {
          onAttemptError: async ({ attempt, error, nextDelayMs }) => {
            const duration = Date.now() - lastAttemptStartedAt;
            await admin.from("translation_jobs").insert({
              story_part_id: storyPartId,
              attempt_number: attempt,
              status: "failed",
              provider: providerId,
              model: modelName,
              duration_ms: duration,
              error_message: error instanceof Error ? error.message : String(error),
            });
            attemptCounter = attempt;
            // Reset wall-clock for the next attempt's duration measurement.
            if (nextDelayMs !== null) lastAttemptStartedAt = Date.now() + nextDelayMs;
          },
        },
      },
    );

    // 7) Success path. Insert version row + update the part.
    const duration = Date.now() - lastAttemptStartedAt;
    const successAttempt = attemptCounter + 1;

    await admin.from("translation_jobs").insert({
      story_part_id: storyPartId,
      attempt_number: successAttempt,
      status: "succeeded",
      provider: providerId,
      model: result.modelUsed,
      input_tokens: result.tokensUsed?.input ?? null,
      output_tokens: result.tokensUsed?.output ?? null,
      duration_ms: duration,
    });

    // Compute the next version_number for this part.
    const { data: latestVersion } = await admin
      .from("story_part_versions")
      .select("version_number")
      .eq("story_part_id", storyPartId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = (latestVersion?.version_number ?? 0) + 1;

    await admin.from("story_part_versions").insert({
      story_part_id: storyPartId,
      version_number: nextVersion,
      translated_text: result.translatedText,
      provider_used: providerId,
      model_used: result.modelUsed,
      tone_id: story.tone_id,
      complexity: story.complexity,
      custom_instructions: story.custom_instructions,
      created_by: "ai",
    });

    await admin
      .from("story_parts")
      .update({
        text_translated: result.translatedText,
        status: "completed",
        error_message: null,
        last_provider_used: providerId,
        last_model_used: result.modelUsed,
        word_count_translated: wordCount(result.translatedText),
      })
      .eq("id", storyPartId);

    return NextResponse.json({
      ok: true,
      translatedText: result.translatedText,
      tokensUsed: result.tokensUsed,
      modelUsed: result.modelUsed,
      provider: providerId,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown translation error";
    const status =
      err instanceof ProviderError && typeof err.status === "number" ? err.status : 502;

    await admin
      .from("story_parts")
      .update({ status: "failed", error_message: errorMessage })
      .eq("id", storyPartId);

    return NextResponse.json(
      { ok: false, error: errorMessage, provider: providerId, modelUsed: modelName },
      { status },
    );
  }
}

function isKnownProviderId(value: string | null): value is ProviderId {
  if (!value) return false;
  return ["gemini", "groq", "openrouter", "openai", "anthropic"].includes(value);
}
