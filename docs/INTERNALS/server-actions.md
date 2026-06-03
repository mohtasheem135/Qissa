# Internals — Server Actions

> Every admin mutation goes through a Server Action under [lib/actions/](../../lib/actions/). React 19 + Next 16 idioms.

---

## Files

| File | Owns |
|---|---|
| [categories.ts](../../lib/actions/categories.ts) + [.types.ts](../../lib/actions/categories.types.ts) | saveCategory, setCategoryActive, deleteCategory |
| [subcategories.ts](../../lib/actions/subcategories.ts) + [.types.ts](../../lib/actions/subcategories.types.ts) | saveSubcategory, setSubcategoryActive, deleteSubcategory |
| [languages.ts](../../lib/actions/languages.ts) + [.types.ts](../../lib/actions/languages.types.ts) | saveLanguage, setLanguageActive |
| [tones.ts](../../lib/actions/tones.ts) + [.types.ts](../../lib/actions/tones.types.ts) | saveTone, setToneActive, deleteTone |
| [ai-config.ts](../../lib/actions/ai-config.ts) + [.types.ts](../../lib/actions/ai-config.types.ts) | saveAiConfig |
| [stories.ts](../../lib/actions/stories.ts) + [.types.ts](../../lib/actions/stories.types.ts) | createStory, updateStoryFromForm, updateStoryMetadata, setStoryPublished, deleteStory |
| [story-parts.ts](../../lib/actions/story-parts.ts) | updatePartTexts, addStoryPart, deleteStoryPart, moveStoryPart, restorePartVersion |

---

## The "use server" + types split

**Next 16 enforces that `"use server"` files only export async functions.** Exporting a constant or (in strict reading) a type triggers:

> A "use server" file can only export async functions, found object.

So every action has a sibling `*.types.ts` (plain module) holding:

- The form-state shape (`type CategoryFormState = { error, success, savedAt }`)
- The initial constant (`INITIAL_CATEGORY_FORM_STATE`)

Both the action and the client component import from `*.types.ts`:

```ts
// action — re-uses the same constant internally
import { INITIAL_CATEGORY_FORM_STATE, type CategoryFormState } from "./categories.types";

// client form — passes to useActionState
import { INITIAL_CATEGORY_FORM_STATE, type CategoryFormState } from "@/lib/actions/categories.types";
import { saveCategory } from "@/lib/actions/categories";
```

---

## Two function shapes

### A. FormData actions for useActionState

Signature: `(prev: State, formData: FormData) => Promise<State>`.

Used in `*FormDialog.tsx` Client Components via `useActionState`:

```tsx
const [state, formAction] = useActionState<State, FormData>(saveCategory, INITIAL_STATE);
<form action={formAction}>...</form>
```

Pattern inside each action:

1. `await requireAdmin()`
2. Pull every expected field via `formData.get("name")?.toString().trim() ?? ""`
3. Validate each, returning `{ ...INITIAL_STATE, error: "…" }` on failure
4. Call the admin Supabase client to insert/update
5. Map Postgres `23505` (unique violation) to a friendly inline error
6. `revalidatePath` on every affected page
7. Return `{ error: null, success: true, savedAt: Date.now() }`

`savedAt` (a bumped timestamp) is what the client `useEffect` watches to auto-close the dialog and toast — it changes on every successful save even if the saved values are identical.

### B. Plain action functions

Signature: `(arg1, arg2, ...) => Promise<void | { error: string | null }>`.

Used for direct calls outside a form context — e.g., Switch's `onCheckedChange`, AlertDialog's confirm action:

```ts
await setCategoryActive(row.id, isActive);   // throws on error
const result = await deleteCategory(row.id); // returns { error }
```

Voids are appropriate when the caller will toast on `catch`; the `{ error }` shape is used when the [DeleteConfirmDialog](../../components/admin/DeleteConfirmDialog.tsx) wants to keep its alert open on failure.

Both wrap `requireAdmin()` and `revalidatePath()` calls.

---

## React-19 patterns the form dialogs use

### Adjust state during render (not in useEffect)

The old code:

```tsx
useEffect(() => {
  if (open) {
    setName(initialValue?.name ?? "");
    setSlug(initialValue?.slug ?? "");
  }
}, [open, initialValue]);
```

…trips `react-hooks/set-state-in-effect`. The canonical React-19 replacement: track previous prop signature in state, reset during render when it changes:

```tsx
const signature = open ? `open:${initialValue?.id ?? "new"}` : "closed";
const [prevSignature, setPrevSignature] = useState(signature);
if (signature !== prevSignature) {
  setPrevSignature(signature);
  if (open) {
    setName(initialValue?.name ?? "");
    setSlug(initialValue?.slug ?? "");
  }
}
```

Used in: [CategoryFormDialog](../../components/admin/CategoryFormDialog.tsx), [SubcategoryFormDialog](../../components/admin/SubcategoryFormDialog.tsx), [ToneFormDialog](../../components/admin/ToneFormDialog.tsx), [EditStoryMetadataDialog](../../components/admin/EditStoryMetadataDialog.tsx), [PartCard](../../components/admin/PartCard.tsx), [StoryForm](../../components/admin/StoryForm.tsx) (for cascade dropdowns).

### Microtask-deferred setState for genuine init-on-mount

For things like "read localStorage on mount + flip state", a synchronous setState in the effect also trips the lint. Defer via microtask:

```tsx
useEffect(() => {
  let cancelled = false;
  Promise.resolve().then(() => {
    if (!cancelled) setSettings(getReaderSettings());
  });
  return () => { cancelled = true; };
}, []);
```

Used in: [StoryBrowser](../../components/shared/StoryBrowser.tsx) (deferred last-read read), [BookmarksPage](../../app/(public)/bookmarks/page.tsx), [ReaderShell](../../components/reader/ReaderShell.tsx) hydration effect.

### Discriminated-union state for async data

For "load data on mount → render different shapes" the cleanest fit:

```tsx
type State =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "loaded"; story: StoryCardData; lastRead: LastRead };

const [state, setState] = useState<State>({ kind: "loading" });
```

Single setState call inside the async callback → no React-19 lint issue. (Pattern shape; a good fit whenever a client component loads data on mount and renders loading / empty / loaded shapes.)

### Auto-close on save via savedAt timestamp

```tsx
useEffect(() => {
  if (state.savedAt > 0 && !state.error) {
    toast.success("Saved.");
    onOpenChange(false);
  }
}, [state.savedAt, state.error, onOpenChange]);
```

Watching `savedAt` instead of `success` makes consecutive identical saves still close the dialog (because the timestamp bumps each time).

---

## Auth gating

Every action's first line is `await requireAdmin()` ([lib/auth/check-admin.ts](../../lib/auth/check-admin.ts)). On a missing or wrong session, the function `redirect()`s — which throws — so the action exits before any DB work. No-op even on `setCategoryActive` toggling a switch.

---

## Revalidation

Each action calls `revalidatePath(...)` for every URL whose server-rendered data could be stale after the mutation. Examples:

- `saveCategory` → `revalidatePath("/admin/categories")`
- `saveSubcategory` → `revalidatePath(`/admin/categories/${parentId}`)` + `/admin/categories`
- `updateStoryFromForm` → `/admin/stories` + `/admin/stories/<id>`

The public reader pages all use `revalidate = 60`, so admin changes propagate to the public side within a minute without needing explicit invalidation.

---

## Story Actions worth a closer look

### `createStory` ([stories.ts](../../lib/actions/stories.ts))

Atomic-ish: inserts the story row, then inserts every part. If parts fail, the story row is deleted (`admin.from("stories").delete().eq("id", story.id)`) → best-effort rollback so we don't leave an orphaned story. Returns `{ createdStoryId }` so the client can `router.push` to the edit page.

The form serializes parts as `parts[0].label`, `parts[0].text`, etc. The action's `readParts(formData)` walks the keys with a regex to reconstruct the array.

### `updatePartTexts` ([story-parts.ts](../../lib/actions/story-parts.ts))

Two-phase:

1. Read the current row (to know if `text_translated` actually changed)
2. UPDATE only the fields the input mentions
3. If translated text changed AND the prior translation was non-empty: insert a `story_part_versions` row with the **previous** translated text + provider/model snapshot. This is what creates the audit trail on admin edits.

### `moveStoryPart` ([story-parts.ts](../../lib/actions/story-parts.ts))

Two-phase swap to dodge the `(story_id, part_number) UNIQUE`:

1. Park the target part at `part_number = -1`
2. Move the neighbor to the target's old slot
3. Move the target (now at -1) to the neighbor's old slot

Done in three sequential UPDATEs — fine for the once-per-click cadence.

### `restorePartVersion` ([story-parts.ts](../../lib/actions/story-parts.ts))

Forward-only: inserts a NEW `story_part_versions` row holding the old text, then updates `story_parts` to match. The original version remains in the history table — nothing is destroyed.
