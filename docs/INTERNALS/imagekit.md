# Internals — ImageKit (cover images)

> **DB stores the path. The endpoint lives in env. Compose at render time.**

---

## Files

- [lib/imagekit/upload.ts](../../lib/imagekit/upload.ts) — server-only ImageKit SDK client + `uploadCoverImage()`
- [lib/imagekit/url.ts](../../lib/imagekit/url.ts) — `coverUrl()`, `thumbnailUrl()`, `heroUrl()`, `normalizeStoredValue()`
- [app/api/upload/route.ts](../../app/api/upload/route.ts) — POST handler; returns the path, not the URL
- [components/admin/ImageUploadField.tsx](../../components/admin/ImageUploadField.tsx) — file picker + URL paste field

---

## Why path-only

The DB column `stories.cover_image_url` is a string. Originally we stored full URLs (`https://ik.imagekit.io/azadstudio/covers/foo.png`). That coupled persisted data to whichever ImageKit endpoint you happened to use at upload time. Switching ImageKit accounts, moving behind a CDN, or just changing the `/qissa/` path prefix would require rewriting every row.

Current shape:

| What's stored | Composed at render |
|---|---|
| `/covers/foo.png` | `<endpoint>/covers/foo.png?tr=…` ← new |
| `https://ik.imagekit.io/.../foo.png` | URL + `?tr=…` set via `URL().searchParams.set` ← legacy still works |
| `https://example.com/foo.png` | URL as-is, no transforms ← external |

All three paths are handled transparently by `coverUrl()` → no migration needed.

---

## Upload flow

1. [ImageUploadField](../../components/admin/ImageUploadField.tsx) → `fetch("/api/upload", { multipart, file })`
2. [app/api/upload/route.ts](../../app/api/upload/route.ts) validates type + size, calls `uploadCoverImage({ buffer, fileName })`
3. [lib/imagekit/upload.ts](../../lib/imagekit/upload.ts) → ImageKit SDK `upload()` → returns `{ path: result.filePath, fileId, width, height }`
4. The response surface drops `result.url` entirely — the API contract surfaces ONLY the path
5. Client stores it in the form's hidden `cover_image_url` input

Default folder: `/covers` (overridable via `IMAGEKIT_UPLOAD_FOLDER` env). `useUniqueFileName: true` so concurrent uploads of the same name don't collide.

---

## `coverUrl(stored, transform)` — the heart of it

```ts
function coverUrl(stored, transform: string): string | null {
  if (!stored) return null;
  let baseUrl = stored.startsWith("/")
    ? `${getEndpoint()}${stored}`            // path → compose with endpoint
    : stored;                                // already a URL

  if (!baseUrl.includes("ik.imagekit.io")) return baseUrl;  // external → as-is

  const url = new URL(baseUrl);
  url.searchParams.set("tr", transform);     // replaces existing tr= if present
  return url.toString();
}
```

`getEndpoint()` strips trailing slashes from `NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT`.

Two derived helpers for the common sizes:

- `thumbnailUrl(stored)` → `coverUrl(stored, "w-600,h-400,c-maintain_ratio")` — used by [StoryCard](../../components/shared/StoryCard.tsx) + admin list thumbs
- `heroUrl(stored)` → `coverUrl(stored, "w-1200,h-700,c-maintain_ratio")` — used by story landing

Every render-side consumer goes through these helpers — never construct the URL inline.

---

## `normalizeStoredValue(input)` — the paste path

When the admin pastes a URL into the cover field (the field's `<Input>`, not the file picker), `normalizeStoredValue` decides what to store:

| Input | Output |
|---|---|
| `/covers/foo.png` | `/covers/foo.png` (pass through) |
| `https://ik.imagekit.io/azadstudio/covers/foo.png` (matches our endpoint) | `/covers/foo.png` (strip endpoint) |
| `https://ik.imagekit.io/.../foo.png?tr=…` | `/covers/foo.png` (strip endpoint AND query) |
| `https://example.com/foo.png` (different host) | `https://example.com/foo.png` (pass through) |

So pasting any URL gets normalized to the smallest stable form: a path for our ImageKit, full URL for anything else.

---

## ImageUploadField — UI behavior

[components/admin/ImageUploadField.tsx](../../components/admin/ImageUploadField.tsx) is the cover widget used in both [StoryForm](../../components/admin/StoryForm.tsx) (create) and [EditStoryMetadataDialog](../../components/admin/EditStoryMetadataDialog.tsx) (edit).

Layout:

```
┌─────────────────┐  Upload file    [Clear]
│  preview thumb  │  ┌─────────────────────┐
│  (96x128)       │  │ paste URL or path   │
│                 │  └─────────────────────┘
└─────────────────┘  JPEG/PNG/WebP/AVIF, max 2MB.
                     Uploads return a path under NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT;
                     full ImageKit URLs are normalized to that path on paste.
```

Preview always passes through `coverUrl()` so it works for new paths, legacy full URLs, and external URLs alike.

Hidden `<input type="hidden" name={name} value={stored}>` is what the form submits.

---

## Env vars

| Var | Purpose | Public? |
|---|---|---|
| `NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT` | The render-side base — e.g. `https://ik.imagekit.io/azadstudio` (no trailing slash) | yes (used in `coverUrl()` from any context) |
| `NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY` | Required by ImageKit SDK init | yes |
| `IMAGEKIT_PRIVATE_KEY` | Required for server uploads | **no** (server only) |
| `IMAGEKIT_UPLOAD_FOLDER` | Override the default `/covers` folder | optional, server only |

---

## Migrating legacy rows

`coverUrl()` handles them automatically — no migration required. But to normalize them to the new path-only form, run this in Supabase SQL Editor (single statement, idempotent):

```sql
update stories
set cover_image_url = replace(cover_image_url, 'https://ik.imagekit.io/azadstudio', '')
where cover_image_url like 'https://ik.imagekit.io/azadstudio%';
```

Or just re-upload via the EditStoryMetadataDialog — the new upload writes a path.

---

## next.config.ts

```ts
images: {
  remotePatterns: [{ protocol: "https", hostname: "ik.imagekit.io" }],
}
```

Allowlists ImageKit so `<next/image src=…>` doesn't reject. We pass `unoptimized` anyway (ImageKit already optimizes via `?tr=…`), but the allowlist makes the option available if we ever decide to chain Next's optimizer.
