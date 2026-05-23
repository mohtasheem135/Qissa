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

/**
 * Edit (metadata-only) flow on the story detail page.
 * No createdStoryId — we're updating, not creating.
 */
export type StoryEditFormState = {
  error: string | null;
  savedAt: number;
};

export const INITIAL_STORY_EDIT_FORM_STATE: StoryEditFormState = {
  error: null,
  savedAt: 0,
};
