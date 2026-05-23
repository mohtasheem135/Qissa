"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/check-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidSlug, toSlug } from "@/lib/utils/slug";
import { INITIAL_CATEGORY_FORM_STATE, type CategoryFormState } from "./categories.types";

/**
 * Create-or-update a category. The form sends `id` (uuid) for edits and
 * omits it for creates. All validation happens server-side — the dialog
 * just relays the result.
 */
export async function saveCategory(
  _previousState: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  await requireAdmin();

  const id = formData.get("id")?.toString().trim() || null;
  const name = (formData.get("name")?.toString() ?? "").trim();
  const slugInput = (formData.get("slug")?.toString() ?? "").trim();
  const iconEmojiRaw = (formData.get("icon_emoji")?.toString() ?? "").trim();
  const descriptionRaw = (formData.get("description")?.toString() ?? "").trim();
  const displayOrderRaw = formData.get("display_order")?.toString() ?? "0";

  if (!name) {
    return { ...INITIAL_CATEGORY_FORM_STATE, error: "Name is required." };
  }

  const slug = slugInput || toSlug(name);
  if (!isValidSlug(slug)) {
    return {
      ...INITIAL_CATEGORY_FORM_STATE,
      error: `Slug "${slug}" is invalid. Use lowercase letters, digits and single hyphens.`,
    };
  }

  const displayOrder = Number.parseInt(displayOrderRaw, 10);
  if (!Number.isFinite(displayOrder)) {
    return { ...INITIAL_CATEGORY_FORM_STATE, error: "Display order must be a number." };
  }

  const payload = {
    name,
    slug,
    icon_emoji: iconEmojiRaw || null,
    description: descriptionRaw || null,
    display_order: displayOrder,
  };

  const admin = createAdminClient();
  const { error } = id
    ? await admin.from("categories").update(payload).eq("id", id)
    : await admin.from("categories").insert(payload);

  if (error) {
    // Friendlier message for the unique-slug clash.
    if (error.code === "23505") {
      return {
        ...INITIAL_CATEGORY_FORM_STATE,
        error: `Slug "${slug}" is already taken. Pick a different one.`,
      };
    }
    return { ...INITIAL_CATEGORY_FORM_STATE, error: error.message };
  }

  revalidatePath("/admin/categories");
  return { error: null, success: true, savedAt: Date.now() };
}

/**
 * Quick on/off toggle (no confirmation). Driven by the Switch in the row.
 * Errors are toasted by the caller, not returned here.
 */
export async function setCategoryActive(id: string, isActive: boolean): Promise<void> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("categories").update({ is_active: isActive }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/categories");
}

/**
 * "Delete" = soft delete (is_active=false) per docs/01-requirements.md §3.1.
 * Hard delete is not exposed in the UI to avoid breaking stories.
 *
 * TODO (Phase 7+): refuse if any subcategory has active stories.
 */
export async function deleteCategory(id: string): Promise<{ error: string | null }> {
  try {
    await requireAdmin();
    const admin = createAdminClient();
    const { error } = await admin.from("categories").update({ is_active: false }).eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/admin/categories");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}
