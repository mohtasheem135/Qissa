/**
 * Form-state types and initial values for the category Server Actions.
 * Lives outside categories.ts because Next 16 forbids non-function exports
 * from a "use server" file.
 */
export type CategoryFormState = {
  error: string | null;
  success: boolean;
  /** Bumped on each successful save so the client can react via useEffect. */
  savedAt: number;
};

export const INITIAL_CATEGORY_FORM_STATE: CategoryFormState = {
  error: null,
  success: false,
  savedAt: 0,
};
