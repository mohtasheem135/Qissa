export type StoryFormState = {
  error: string | null;
  /** Set after a successful create — the form navigates to /admin/stories/<id>. */
  createdStoryId: string | null;
  savedAt: number;
};

export const INITIAL_STORY_FORM_STATE: StoryFormState = {
  error: null,
  createdStoryId: null,
  savedAt: 0,
};
