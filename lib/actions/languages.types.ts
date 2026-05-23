export type LanguageFormState = {
  error: string | null;
  success: boolean;
  savedAt: number;
};

export const INITIAL_LANGUAGE_FORM_STATE: LanguageFormState = {
  error: null,
  success: false,
  savedAt: 0,
};
