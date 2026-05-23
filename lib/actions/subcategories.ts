"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/check-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidSlug, toSlug } from "@/lib/utils/slug";

export type SubcategoryFormState = {
  error: string | null;
  success: boolean;
  savedAt: number;
};

export const INITIAL_SUBCATEGORY_FORM_STATE: SubcategoryFormState = {
  error: null,
  success: false,
  savedAt: 0,
};

export async function saveSubcategory(
  _previousState: SubcategoryFormState,
  formData: FormData,
): Promise<SubcategoryFormState> {
  await requireAdmin();

  const id = formData.get("id")?.toString().trim() || null;
  const categoryId = (formData.get("category_id")?.toString() ?? "").trim();
  const name = (formData.get("name")?.toString() ?? "").trim();
  const slugInput = (formData.get("slug")?.toString() ?? "").trim();
  const iconEmojiRaw = (formData.get("icon_emoji")?.toString() ?? "").trim();
  const descriptionRaw = (formData.get("description")?.toString() ?? "").trim();
  const displayOrderRaw = formData.get("display_order")?.toString() ?? "0";

  if (!categoryId) {
    return { ...INITIAL_SUBCATEGORY_FORM_STATE, error: "Missing parent category." };
  }
  if (!name) {
    return { ...INITIAL_SUBCATEGORY_FORM_STATE, error: "Name is required." };
  }

  const slug = slugInput || toSlug(name);
  if (!isValidSlug(slug)) {
    return {
      ...INITIAL_SUBCATEGORY_FORM_STATE,
      error: `Slug "${slug}" is invalid. Use lowercase letters, digits and single hyphens.`,
    };
  }

  const displayOrder = Number.parseInt(displayOrderRaw, 10);
  if (!Number.isFinite(displayOrder)) {
    return { ...INITIAL_SUBCATEGORY_FORM_STATE, error: "Display order must be a number." };
  }

  const payload = {
    category_id: categoryId,
    name,
    slug,
    icon_emoji: iconEmojiRaw || null,
    description: descriptionRaw || null,
    display_order: displayOrder,
  };

  const admin = createAdminClient();
  const { error } = id
    ? await admin.from("subcategories").update(payload).eq("id", id)
    : await admin.from("subcategories").insert(payload);

  if (error) {
    if (error.code === "23505") {
      return {
        ...INITIAL_SUBCATEGORY_FORM_STATE,
        error: `Slug "${slug}" is already used in this category.`,
      };
    }
    return { ...INITIAL_SUBCATEGORY_FORM_STATE, error: error.message };
  }

  revalidatePath(`/admin/categories/${categoryId}`);
  revalidatePath("/admin/categories");
  return { error: null, success: true, savedAt: Date.now() };
}

export async function setSubcategoryActive(id: string, isActive: boolean): Promise<void> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("subcategories")
    .update({ is_active: isActive })
    .eq("id", id)
    .select("category_id")
    .single();
  if (error) throw new Error(error.message);
  if (data?.category_id) revalidatePath(`/admin/categories/${data.category_id}`);
}

export async function deleteSubcategory(id: string): Promise<{ error: string | null }> {
  try {
    await requireAdmin();
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("subcategories")
      .update({ is_active: false })
      .eq("id", id)
      .select("category_id")
      .single();
    if (error) return { error: error.message };
    if (data?.category_id) revalidatePath(`/admin/categories/${data.category_id}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}
