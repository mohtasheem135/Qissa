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
