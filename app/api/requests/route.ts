import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp, rateLimit } from "@/lib/requests/rate-limit";

/**
 * POST /api/requests
 *
 * Anonymous endpoint: reader submits a request for a new story OR a new
 * variant of an existing story. We collect via service-role (story_requests
 * has no anon insert policy) so honeypot, rate-limit, and dedup logic are
 * centralized here.
 *
 * Body:
 *   {
 *     type: "new_story" | "new_variant",
 *     storyId?: string,             // required when type === "new_variant"
 *     requestedTitle?: string,       // required when type === "new_story"
 *     requestedAuthor?: string,
 *     targetLanguage?: string,       // language code
 *     toneId?: string,
 *     notes?: string,
 *     requesterEmail?: string,
 *     hp?: string                    // honeypot — must be empty
 *   }
 *
 * Dedup: if an OPEN request already matches on (type, storyId, language, tone),
 * we bump its votes and return { ok: true, matched: true }. Otherwise we
 * insert a new row and return { ok: true, matched: false, requestId }.
 */
export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  // Honeypot — bots fill all fields; humans never see this one.
  if (typeof body.hp === "string" && body.hp.trim().length > 0) {
    // Lie and return success so the bot can't tell the field was a trap.
    return NextResponse.json({ ok: true, matched: false });
  }

  // Rate limit: 5 submissions / hour per IP.
  const ip = clientIp(request);
  const limit = rateLimit(`requests:${ip}`, { max: 5, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many requests — try again later." },
      { status: 429 },
    );
  }

  const type = body.type === "new_story" || body.type === "new_variant" ? body.type : null;
  if (!type) {
    return NextResponse.json(
      { ok: false, error: "type must be 'new_story' or 'new_variant'." },
      { status: 400 },
    );
  }

  const storyId = typeof body.storyId === "string" ? body.storyId.trim() : null;
  const requestedTitle =
    typeof body.requestedTitle === "string" ? body.requestedTitle.trim() : null;
  const requestedAuthor =
    typeof body.requestedAuthor === "string" ? body.requestedAuthor.trim() || null : null;
  const targetLanguage =
    typeof body.targetLanguage === "string" && body.targetLanguage.trim()
      ? body.targetLanguage.trim().toLowerCase()
      : null;
  const toneId = typeof body.toneId === "string" && body.toneId.trim() ? body.toneId.trim() : null;
  const notes = typeof body.notes === "string" ? body.notes.trim() || null : null;
  const requesterEmail =
    typeof body.requesterEmail === "string" && body.requesterEmail.includes("@")
      ? body.requesterEmail.trim()
      : null;

  if (type === "new_variant" && !storyId) {
    return NextResponse.json(
      { ok: false, error: "storyId required for new_variant requests." },
      { status: 400 },
    );
  }
  if (type === "new_story" && !requestedTitle) {
    return NextResponse.json(
      { ok: false, error: "requestedTitle required for new_story requests." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Dedup: identical type + storyId + language + tone with status='open'.
  let dedupQuery = admin
    .from("story_requests")
    .select("id, votes")
    .eq("type", type)
    .eq("status", "open");
  dedupQuery = storyId ? dedupQuery.eq("story_id", storyId) : dedupQuery.is("story_id", null);
  dedupQuery = targetLanguage
    ? dedupQuery.eq("target_language", targetLanguage)
    : dedupQuery.is("target_language", null);
  dedupQuery = toneId ? dedupQuery.eq("tone_id", toneId) : dedupQuery.is("tone_id", null);
  if (type === "new_story" && requestedTitle) {
    dedupQuery = dedupQuery.ilike("requested_title", requestedTitle);
  }
  const { data: matches } = await dedupQuery.limit(1);
  const existing = matches?.[0];

  if (existing) {
    // Increment vote with per-IP dedupe. If the same IP already voted, do
    // nothing but still return matched=true so the UX is consistent.
    const voterHash = sha256(`${ip}:requests-salt`);
    const { error: voteErr } = await admin
      .from("story_request_votes")
      .insert({ request_id: existing.id, voter_hash: voterHash });
    if (!voteErr) {
      await admin
        .from("story_requests")
        .update({ votes: existing.votes + 1 })
        .eq("id", existing.id);
    }
    return NextResponse.json({ ok: true, matched: true, requestId: existing.id });
  }

  const { data: inserted, error: insertErr } = await admin
    .from("story_requests")
    .insert({
      type,
      story_id: storyId,
      requested_title: requestedTitle,
      requested_author: requestedAuthor,
      target_language: targetLanguage,
      tone_id: toneId,
      notes,
      requester_email: requesterEmail,
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json(
      { ok: false, error: insertErr?.message ?? "Insert failed." },
      { status: 500 },
    );
  }

  // Record the originator's vote so they can't double-vote when re-submitting.
  await admin
    .from("story_request_votes")
    .insert({ request_id: inserted.id, voter_hash: sha256(`${ip}:requests-salt`) });

  return NextResponse.json({ ok: true, matched: false, requestId: inserted.id });
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
