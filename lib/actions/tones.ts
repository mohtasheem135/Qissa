"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/check-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export type ToneFormState = {
  error: string | null;
  success: boolean;
  savedAt: number;
};

export const INITIAL_TONE_FORM_STATE: ToneFormState = {
  error: null,
  success: false,
  savedAt: 0,
};

export async function saveTone(
  _previousState: ToneFormState,
  formData: FormData,
): Promise<ToneFormState> {
  await requireAdmin();

  const id = formData.get("id")?.toString().trim() || null;
  const languageCode = (formData.get("language_code")?.toString() ?? "").trim().toLowerCase();
  const name = (formData.get("name")?.toString() ?? "").trim();
  const displayName = (formData.get("display_name")?.toString() ?? "").trim();
  const description = (formData.get("description")?.toString() ?? "").trim();
  const promptFragment = (formData.get("prompt_fragment")?.toString() ?? "").trim();

  if (!languageCode) {
    return { ...INITIAL_TONE_FORM_STATE, error: "Language is required." };
  }
  if (!name) {
    return { ...INITIAL_TONE_FORM_STATE, error: "Name is required." };
  }
  if (!promptFragment) {
    return {
      ...INITIAL_TONE_FORM_STATE,
      error: "Prompt fragment is required — this is the literary brief injected into every translation.",
    };
  }
  if (promptFragment.length < 40) {
    return {
      ...INITIAL_TONE_FORM_STATE,
      error: "Prompt fragment is too short to give the AI useful style guidance (40+ characters recommended).",
    };
  }

  const payload = {
    language_code: languageCode,
    name,
    display_name: displayName || null,
    description: description || null,
    prompt_fragment: promptFragment,
  };

  const admin = createAdminClient();
  const { error } = id
    ? await admin.from("tones").update(payload).eq("id", id)
    : await admin.from("tones").insert(payload);

  if (error) {
    if (error.code === "23505") {
      return {
        ...INITIAL_TONE_FORM_STATE,
        error: `A tone named "${name}" already exists for this language.`,
      };
    }
    return { ...INITIAL_TONE_FORM_STATE, error: error.message };
  }

  revalidatePath("/admin/tones");
  return { error: null, success: true, savedAt: Date.now() };
}

export async function setToneActive(id: string, isActive: boolean): Promise<void> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("tones").update({ is_active: isActive }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/tones");
}

export async function deleteTone(id: string): Promise<{ error: string | null }> {
  try {
    await requireAdmin();
    const admin = createAdminClient();
    const { error } = await admin.from("tones").update({ is_active: false }).eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/admin/tones");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}
