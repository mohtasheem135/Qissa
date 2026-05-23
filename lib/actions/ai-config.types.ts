export type AiConfigFormState = {
  error: string | null;
  success: boolean;
  savedAt: number;
};

export const INITIAL_AI_CONFIG_FORM_STATE: AiConfigFormState = {
  error: null,
  success: false,
  savedAt: 0,
};
