import type { Metadata } from "next";
import { RequestsPanel, type RequestRow } from "@/components/admin/RequestsPanel";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Requests",
};

export const dynamic = "force-dynamic";

type DbStatus = "open" | "planned" | "in_progress" | "fulfilled" | "declined";

export default async function RequestsPage() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("story_requests")
    .select(
      `id, type, story_id, requested_title, requested_author, target_language, tone_id,
       requester_email, votes, status, fulfilled_variant_id, admin_notes, created_at,
       story:stories ( title_original ),
       language:languages ( name_english ),
       tone:tones ( name ),
       fulfilled_variant:story_variants!story_requests_fulfilled_variant_id_fkey (
         slug,
         language:languages!inner ( name_english ),
         tone:tones!inner ( name )
       )`,
    )
    .order("status", { ascending: true })
    .order("votes", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;

  const requests: RequestRow[] = (data ?? []).map((r) => ({
    id: r.id,
    type: (r.type === "new_variant" ? "new_variant" : "new_story") as RequestRow["type"],
    story_id: r.story_id,
    story_title_original: r.story?.title_original ?? null,
    requested_title: r.requested_title,
    requested_author: r.requested_author,
    target_language: r.target_language,
    language_name_english: r.language?.name_english ?? null,
    tone_name: r.tone?.name ?? null,
    votes: r.votes,
    status: r.status as DbStatus,
    requester_email: r.requester_email,
    fulfilled_variant_id: r.fulfilled_variant_id,
    fulfilled_variant_label: r.fulfilled_variant
      ? `${r.fulfilled_variant.language?.name_english ?? ""} · ${r.fulfilled_variant.tone?.name ?? ""}`
      : null,
    admin_notes: r.admin_notes,
    created_at: r.created_at,
  }));

  return <RequestsPanel requests={requests} />;
}
