"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/check-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { INITIAL_LANGUAGE_FORM_STATE, type LanguageFormState } from "./languages.types";

const LANGUAGE_CODE_RE = /^[a-z]{2,3}(-[a-z]{2,4})?$/;

export async function saveLanguage(
  _previousState: LanguageFormState,
  formData: FormData,
): Promise<LanguageFormState> {
  await requireAdmin();

  // For languages, the primary key (`code`) is the identifier — there is no
  // separate `id`. We treat the form as create-or-update keyed by code:
  // - `original_code` (hidden) is set on edit; if present we UPDATE on that
  //   code, allowing the code field itself to be renamed.
  // - On create `original_code` is empty and we INSERT.
  const originalCode = (formData.get("original_code")?.toString() ?? "").trim().toLowerCase();
  const code = (formData.get("code")?.toString() ?? "").trim().toLowerCase();
  const nameEnglish = (formData.get("name_english")?.toString() ?? "").trim();
  const nameNative = (formData.get("name_native")?.toString() ?? "").trim();
  const direction = formData.get("direction")?.toString() === "rtl" ? "rtl" : "ltr";
  const fontFamily = (formData.get("font_family")?.toString() ?? "").trim();
  const fontFamilyReading = (formData.get("font_family_reading")?.toString() ?? "").trim();
  const displayOrderRaw = formData.get("display_order")?.toString() ?? "0";

  if (!code || !LANGUAGE_CODE_RE.test(code)) {
    return {
      ...INITIAL_LANGUAGE_FORM_STATE,
      error: "Code must be an ISO 639-1 / BCP-47 tag (e.g., 'hi', 'pa', 'zh-hans').",
    };
  }
  if (!nameEnglish || !nameNative) {
    return { ...INITIAL_LANGUAGE_FORM_STATE, error: "English and native names are required." };
  }

  const displayOrder = Number.parseInt(displayOrderRaw, 10);
  if (!Number.isFinite(displayOrder)) {
    return { ...INITIAL_LANGUAGE_FORM_STATE, error: "Display order must be a number." };
  }

  const payload = {
    code,
    name_english: nameEnglish,
    name_native: nameNative,
    direction,
    font_family: fontFamily || null,
    font_family_reading: fontFamilyReading || null,
    display_order: displayOrder,
  };

  const admin = createAdminClient();
  const { error } = originalCode
    ? await admin.from("languages").update(payload).eq("code", originalCode)
    : await admin.from("languages").insert(payload);

  if (error) {
    if (error.code === "23505") {
      return { ...INITIAL_LANGUAGE_FORM_STATE, error: `Code "${code}" is already used.` };
    }
    return { ...INITIAL_LANGUAGE_FORM_STATE, error: error.message };
  }

  revalidatePath("/admin/languages");
  return { error: null, success: true, savedAt: Date.now() };
}

export async function setLanguageActive(code: string, isActive: boolean): Promise<void> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("languages")
    .update({ is_active: isActive })
    .eq("code", code);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/languages");
}
