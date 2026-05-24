export type VariantFormState = {
  error: string | null;
  /** Set after a successful create so the dialog can close + revalidate. */
  createdVariantId: string | null;
  savedAt: number;
};

export const INITIAL_VARIANT_FORM_STATE: VariantFormState = {
  error: null,
  createdVariantId: null,
  savedAt: 0,
};
