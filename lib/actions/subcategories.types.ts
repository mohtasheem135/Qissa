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
