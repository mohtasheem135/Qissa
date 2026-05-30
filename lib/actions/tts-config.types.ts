export type TtsConfigFormState = {
  error: string | null;
  success: boolean;
  savedAt: number;
};

export const INITIAL_TTS_CONFIG_FORM_STATE: TtsConfigFormState = {
  error: null,
  success: false,
  savedAt: 0,
};
