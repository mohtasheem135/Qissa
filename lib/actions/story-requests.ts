"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/check-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

type RequestStatus = "open" | "planned" | "in_progress" | "fulfilled" | "declined";

export async function updateRequestStatus(
  id: string,
  status: RequestStatus,
): Promise<void> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("story_requests").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/requests");
}

export async function linkFulfillingVariant(
  id: string,
  variantId: string | null,
): Promise<void> {
  await requireAdmin();
  const admin = createAdminClient();
  type RequestUpdate = Database["public"]["Tables"]["story_requests"]["Update"];
  const updates: RequestUpdate = { fulfilled_variant_id: variantId };
  if (variantId) updates.status = "fulfilled";
  const { error } = await admin.from("story_requests").update(updates).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/requests");
}

export async function updateRequestAdminNote(id: string, note: string): Promise<void> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("story_requests")
    .update({ admin_notes: note })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/requests");
}

export async function deleteRequest(id: string): Promise<{ error: string | null }> {
  try {
    await requireAdmin();
    const admin = createAdminClient();
    const { error } = await admin.from("story_requests").delete().eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/admin/requests");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error." };
  }
}
