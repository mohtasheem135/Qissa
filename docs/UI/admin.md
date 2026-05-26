# UI — Admin Console

All under [app/admin/](../../app/admin/). Auth-gated by [app/admin/(protected)/layout.tsx](../../app/admin/(protected)/layout.tsx) → [requireAdmin()](../../lib/auth/check-admin.ts). Login at `/admin/login` is outside `(protected)/` and stands alone. See [UI/auth.md](./auth.md) for the gate itself.

Every CRUD page follows the same pattern: server component fetches data via the service-role client → passes to a Client `*Panel.tsx` that owns dialog open state and renders a shadcn `<Table>` → row actions trigger a `*FormDialog.tsx` (`useActionState` + `useFormStatus`) or a shared [DeleteConfirmDialog](../../components/admin/DeleteConfirmDialog.tsx) (alert dialog → server action → sonner toast).

---

## Shell

[AdminShell](../../components/admin/AdminShell.tsx) renders two layouts off the same content:

- **Desktop (`md:` and up):** sidebar on the left (logo · nav · email · sign-out form) + `max-w-7xl` content on the right. Sidebar uses [SidebarNav](../../components/admin/SidebarNav.tsx) Client Component for `usePathname` active-state highlighting.
- **Mobile (`< md`):** [MobileAdminNav](../../components/admin/MobileAdminNav.tsx) renders a `sticky top-0` top bar with a hamburger button; tapping it opens a slide-out drawer that reuses the same `SidebarNav` (with `onNavigate` to auto-close on link click) plus the email + sign-out form. The drawer closes on Escape, on backdrop tap, and on route changes (tracked via the React-19 "adjust state during render" pattern, not a `useEffect` — the `react-hooks/set-state-in-effect` rule forbids it). Body scroll is locked while the drawer is open.

**Scroll containment:** the shell is locked to viewport height (`h-dvh overflow-hidden`); only the `<main>` scrolls. The sidebar (desktop) and top bar (mobile) stay put when long admin tables (Stories, Requests) overflow vertically.

Sign out is a plain `<form action={signOut}>` ([app/admin/(protected)/actions.ts](../../app/admin/(protected)/actions.ts)) — works without client JS, used identically in the desktop sidebar footer and the mobile drawer footer.

---

## `/admin` — Dashboard

**File:** [app/admin/(protected)/page.tsx](../../app/admin/(protected)/page.tsx)

Three stat cards: total active / drafts / published. Counts via `select("*", { count: "exact", head: true })` — cheap COUNT(*) under the hood. Service-role client (per-request, no caching).

---

## `/admin/categories` — Categories

**Files:**
- Page: [app/admin/(protected)/categories/page.tsx](../../app/admin/(protected)/categories/page.tsx)
- Panel: [CategoriesPanel](../../components/admin/CategoriesPanel.tsx)
- Dialog: [CategoryFormDialog](../../components/admin/CategoryFormDialog.tsx)
- Actions: [lib/actions/categories.ts](../../lib/actions/categories.ts) + [lib/actions/categories.types.ts](../../lib/actions/categories.types.ts)

Table columns: icon · name (links to subcategories page) · slug · subcategory count · order · active toggle · edit · delete.

- **Active toggle** — quick deactivation, no confirmation, optimistic
- **Delete** — confirm via [DeleteConfirmDialog](../../components/admin/DeleteConfirmDialog.tsx) → soft delete (`is_active=false`)
- **Slug auto-fill** — name → slug via [toSlug()](../../lib/utils/slug.ts) until user manually edits
- **No drag-reorder** — `display_order` is an editable number (Phase 1.5 task)

## `/admin/categories/[id]` — Subcategories of a category

**File:** [app/admin/(protected)/categories/[id]/page.tsx](../../app/admin/(protected)/categories/[id]/page.tsx) · Panel: [SubcategoriesPanel](../../components/admin/SubcategoriesPanel.tsx) · Dialog: [SubcategoryFormDialog](../../components/admin/SubcategoryFormDialog.tsx) · Actions: [lib/actions/subcategories.ts](../../lib/actions/subcategories.ts)

Header shows parent category with breadcrumb back to `/admin/categories`. Same Table + Panel + FormDialog pattern. Slug uniqueness is scoped `(category_id, slug)` — see migration 0001.

---

## `/admin/languages` — Languages

**Files:** [page](../../app/admin/(protected)/languages/page.tsx) · [LanguagesPanel](../../components/admin/LanguagesPanel.tsx) · [LanguageFormDialog](../../components/admin/LanguageFormDialog.tsx) · [actions](../../lib/actions/languages.ts)

13 languages seeded. Edit-only model (no delete) — per requirements §3.3. Rename the `code` is supported: edit form has a hidden `original_code` input; the action UPDATEs keyed by that.

Code validated client-side (`pattern="[a-z]{2,3}(-[a-z]{2,4})?"`) and server-side (`LANGUAGE_CODE_RE`).

Native-name column renders in its own `font_family_reading` for visual confirmation.

---

## `/admin/tones` — Writer-style presets

**Files:** [page](../../app/admin/(protected)/tones/page.tsx) · [TonesPanel](../../components/admin/TonesPanel.tsx) · [ToneFormDialog](../../components/admin/ToneFormDialog.tsx) · [actions](../../lib/actions/tones.ts)

The `prompt_fragment` is the most important field in the entire app — it's what gives translations their literary voice. Dialog highlights:

- **Big monospace textarea** for the fragment; min-length 40 chars enforced server-side
- **Live preview**: collapsible `<details>` that splices in any of the 5 [complexity](../../lib/ai/complexity.ts) fragments. Lets admins see the full STYLE INSTRUCTIONS + COMPLEXITY block that ships to the AI
- **Language locked in edit mode** (changing it would belong to a different uniqueness scope)
- **Filter by language** at the top of the panel; "All languages" default

28 tones seeded across 8 languages — see [04-database.md](../04-database.md) §6.

---

## `/admin/ai-config` — Default AI provider/model

**Files:** [page](../../app/admin/(protected)/ai-config/page.tsx) · [AiConfigForm](../../components/admin/AiConfigForm.tsx) · [actions](../../lib/actions/ai-config.ts) · [types](../../lib/actions/ai-config.types.ts)

Three cards:

1. **Default provider & model** — Provider Select shows ALL providers but disables ones without their env key, with `· missing OPENAI_API_KEY` hint inline. Model Select auto-switches to the provider's `defaultModel` when provider changes.
2. **Test connection** — POSTs to [/api/ai/test](../API/ai-test.md) which does a real Premchand-style Hindi translation. JSON result rendered as `<pre>` — failures show in red, successes show in muted.
3. **Provider status** — lists every provider with Configured / Missing badge (server reads `process.env`).

Backed by the singleton `ai_config` row with pinned UUID `00000000-…001`.

---

## `/admin/stories` — Story listing

**Files:** [page](../../app/admin/(protected)/stories/page.tsx) · [StoriesPanel](../../components/admin/StoriesPanel.tsx) · [actions](../../lib/actions/stories.ts)

Filters:

- Search by title or variant language/tone (client-side `includes`)
- Status (All / Draft / Published)
- Has variant in (language filter)

Table columns: cover thumb (via [coverUrl()](../../lib/imagekit/url.ts)) · title (rendered through [toTitleCase()](../../lib/utils/title-case.ts) so ALL-CAPS source titles display uniformly) · category → subcategory · **variants summary** (single "N variants" badge + `<published>/<total>` subline; hover surfaces the per-language / per-tone / ★-primary breakdown via native tooltip) · parts · status · **Publish/Unpublish only** — Delete is intentionally not in the row.

The table uses `table-fixed` with percentage / fixed widths per column so no row can push horizontal overflow. Title and Subcategory cells truncate via the shared [Truncate](../../components/shared/Truncate.tsx) utility — single-line ellipsis, full text on hover via the native `title` attribute. The variants cell intentionally collapses to a count (not a list of badges) so a story with 5+ variants doesn't widen its row.

**Mobile (`< md`):** the table is hidden and replaced by stacked `StoryMobileCard`s — each card shows the cover thumb, title, category → subcategory, status badge, variant count (with the same hover tooltip), parts count, and a Publish/Unpublish button. The card is a single tap-target that opens the edit page. Same component file, same data — just an alternate render below `md:`.

**Pagination** is client-side over the already-loaded set (the page fetches up to 200 stories — Phase 1 cap). Default 20 rows / page, selector for 10/20/50, Prev/Next + "Page X of Y". Page snaps back to 1 on any filter or page-size change via the React-19 "adjust state during render" pattern (signature comparison — see [INTERNALS/server-actions.md](../INTERNALS/server-actions.md) for why we avoid `useEffect` for this kind of derived reset). Server-side pagination + URL-bound filters is the upgrade path if the 200-cap is ever raised.

Destructive **Delete** lives only inside the story edit page ([StoryEditShell](../../components/admin/StoryEditShell.tsx)), gated by [DeleteConfirmDialog](../../components/admin/DeleteConfirmDialog.tsx) — guards against accidental row-level deletes from the list.

---

## `/admin/stories/new` — Create story

**Files:** [page](../../app/admin/(protected)/stories/new/page.tsx) · [StoryForm](../../components/admin/StoryForm.tsx) · [createStory](../../lib/actions/stories.ts) · [types](../../lib/actions/stories.types.ts)

Single dense form (no wizard). Three cards: Metadata · Parts · Save.

### Metadata card

- Title (original / translated) · author · source URL
- Category → Subcategory cascade
- Language → Tone cascade
- Complexity dropdown ([5 levels](../../lib/ai/complexity.ts))
- Provider → Model cascade (unconfigured providers disabled)
- Custom instructions textarea
- Cover via [ImageUploadField](../../components/admin/ImageUploadField.tsx) — stores path, not URL (see [INTERNALS/imagekit.md](../INTERNALS/imagekit.md))

All cascades use the React-19 "adjust state during render" pattern (no `useEffect` — satisfies `react-hooks/set-state-in-effect`).

### Parts card

- Manual rows: editable label + monospace textarea + remove + per-row word count
- "Bulk import" launches [BulkImportDialog](../../components/admin/BulkImportDialog.tsx) — paste full story with separator (default `---` on its own line), live preview of detected parts, "Use these parts" replaces the current parts array
- Total word count displayed at the top

### Save card

- Initial status select (Draft / Published)
- On success: action returns `createdStoryId`, the form's `useEffect` `router.push("/admin/stories/<id>")` → user lands on the edit page to translate

Atomicity: `createStory` inserts the story, then inserts parts; if parts fail, the story row is rolled back with `delete`.

---

## `/admin/stories/[id]` — Edit + translate

**Files:** [page](../../app/admin/(protected)/stories/[id]/page.tsx) · [StoryEditShell](../../components/admin/StoryEditShell.tsx) · [PartCard](../../components/admin/PartCard.tsx) · [VersionHistoryDialog](../../components/admin/VersionHistoryDialog.tsx) · [EditStoryMetadataDialog](../../components/admin/EditStoryMetadataDialog.tsx) · [story-parts actions](../../lib/actions/story-parts.ts) · [stories actions](../../lib/actions/stories.ts)

The biggest single page in the app.

### Header

Breadcrumb · title · language + tone badges · provider · `Edit details` button → opens [EditStoryMetadataDialog](../../components/admin/EditStoryMetadataDialog.tsx) (same cascades as create form + cover re-upload via [ImageUploadField](../../components/admin/ImageUploadField.tsx)) · Publish toggle · Delete confirm.

### Translation queue card

- Counts pending+failed parts; "Translate N pending" button → opens `/api/translate/queue` SSE
- Cancel button while running — aborts the in-flight `fetch` via `AbortController`; server-side `request.signal.aborted` stops the queue at the next part boundary
- Last-run summary "X ok, Y failed" persists in component state

### Per-part editor — [PartCard](../../components/admin/PartCard.tsx)

For each part, in `display_order`:

| Header | Inline label edit · status badge (pending / translating / completed / edited / failed) · provider snapshot · ↑↓ reorder |
|---|---|
| Two columns | Original (collapsed by default with `max-h-96` + Edit toggle to swap to a Textarea) · Translation (always editable Textarea with autosave on blur) |
| Actions row | Translate / Re-translate (per-part) · History (n) → [VersionHistoryDialog](../../components/admin/VersionHistoryDialog.tsx) · Delete part (alert dialog) |

**Live status:** while a queue is running, `liveByPart` in StoryEditShell overrides the DB status for visible feedback. On settle, `router.refresh()` reconciles. PartCard uses the React-19 "adjust state during render" pattern so the new prop value (from the refresh) flows into the local textarea state — no more "had to refresh to see translation" bug.

**Reorder:** `moveStoryPart(partId, "up"|"down")` does a two-phase swap (park at `part_number=-1`, swap neighbors) to dodge the `(story_id, part_number) UNIQUE`.

**Per-part edit creates a version:** [updatePartTexts()](../../lib/actions/story-parts.ts) snapshots the prior translation as a `story_part_versions` row when `text_translated` actually changes.

### Version history dialog

[VersionHistoryDialog](../../components/admin/VersionHistoryDialog.tsx) — list newest-first, each row shows version number · AI/Admin badge · provider/model snapshot · timestamp · text preview · Restore button. Restore creates a NEW forward version with the old text (audit trail preserved).

---

## Cross-cutting admin patterns

| Pattern | Where it lives | Why |
|---|---|---|
| Form-state types separated from Server Actions | `*.types.ts` siblings under [lib/actions/](../../lib/actions/) | Next 16 forbids non-function exports from `"use server"` files |
| Auto-fill slug from name | [CategoryFormDialog](../../components/admin/CategoryFormDialog.tsx), [SubcategoryFormDialog](../../components/admin/SubcategoryFormDialog.tsx) | Convenience; user can override (a "slugDirty" flag stops auto-overwriting after manual edit) |
| Soft delete via Active switch + Delete button | All entities | `is_active=false` keeps FK chain intact; hard delete never exposed |
| Optimistic toggle + sonner toast | All `setXActive` actions | Snappy UX; on error the toast surfaces the message |
| Microtask-deferred state reset on dialog open | All `*FormDialog.tsx` | React-19 "adjust state during render" pattern — see [INTERNALS/server-actions.md](../INTERNALS/server-actions.md) |
