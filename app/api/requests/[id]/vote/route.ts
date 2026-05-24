import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp, rateLimit } from "@/lib/requests/rate-limit";

/**
 * POST /api/requests/[id]/vote
 *
 * Upvote a public request. Per-IP dedupe via story_request_votes
 * (voter_hash = sha256(ip + salt)).
 */
interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, ctx: RouteContext): Promise<Response> {
  const { id } = await ctx.params;

  const ip = clientIp(request);
  const limit = rateLimit(`votes:${ip}`, { max: 30, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) {
    return NextResponse.json({ ok: false, error: "Too many votes." }, { status: 429 });
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("story_requests")
    .select("id, votes, status")
    .eq("id", id)
    .single();
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Request not found." }, { status: 404 });
  }
  if (existing.status === "fulfilled" || existing.status === "declined") {
    return NextResponse.json(
      { ok: false, error: "Request is closed." },
      { status: 409 },
    );
  }

  const voterHash = sha256(`${ip}:requests-salt`);
  const { error: voteErr } = await admin
    .from("story_request_votes")
    .insert({ request_id: id, voter_hash: voterHash });

  // Duplicate vote → tell the client politely.
  if (voteErr && voteErr.code === "23505") {
    return NextResponse.json({ ok: true, alreadyVoted: true, votes: existing.votes });
  }
  if (voteErr) {
    return NextResponse.json({ ok: false, error: voteErr.message }, { status: 500 });
  }

  const nextVotes = existing.votes + 1;
  await admin.from("story_requests").update({ votes: nextVotes }).eq("id", id);

  return NextResponse.json({ ok: true, alreadyVoted: false, votes: nextVotes });
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
