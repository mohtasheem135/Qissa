# API — Upload

## POST `/api/upload`

**File:** [app/api/upload/route.ts](../../app/api/upload/route.ts)

Multipart form-data upload to ImageKit. Returns the **path** under your configured endpoint — never the full URL. See [INTERNALS/imagekit.md](../INTERNALS/imagekit.md) for the rationale (DB stays portable across endpoint changes).

### Request

```
Content-Type: multipart/form-data
Body: file=<binary>
```

### Validation

- `file` must be present and be a `File`
- MIME type must be one of: `image/jpeg`, `image/png`, `image/webp`, `image/avif`
- Size ≤ 2 MB

### Response (HTTP 200)

```jsonc
{
  "ok": true,
  "path": "/covers/the_bet_zwXqNpy5g.png",
  "fileId": "imagekit-file-id",
  "width": 1920,
  "height": 1080
}
```

The `path` is what gets stored in `stories.cover_image_url`. The render-side composes the full URL via [coverUrl(stored, transform)](../../lib/imagekit/url.ts).

### Response (HTTP 4xx)

| Status | When |
|---|---|
| 400 | Missing or invalid form data |
| 413 | File over 2 MB |
| 415 | MIME type not in the allowed set |
| 500 | ImageKit SDK upload threw |

### Upload destination

Uploads land under `/covers/` in your ImageKit account by default. Overridable via `IMAGEKIT_UPLOAD_FOLDER` env (e.g., `/qissa-covers`).

### Auth

`requireAdmin()` at the top. Returns 307 to `/admin/login` on missing/wrong session.

---

## Why path-only and not the full URL

The DB used to store the full URL like `https://ik.imagekit.io/azadstudio/covers/foo.png`. That couples persisted data to whichever ImageKit endpoint you happened to be using at upload time — switching ImageKit accounts or moving behind a custom CDN would require a data migration.

The current shape:

| Stored | Composed at render |
|---|---|
| `/covers/foo.png` (path) | `${NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT}/covers/foo.png?tr=…` |
| `https://ik.imagekit.io/.../foo.png` (legacy) | URL + `?tr=…` set via `URL().searchParams.set` |
| `https://external.example/foo.png` (admin pasted) | URL as-is, no transforms |

All three forms are handled transparently by [coverUrl()](../../lib/imagekit/url.ts) — so legacy rows in the DB still render.

The full transition is covered in [INTERNALS/imagekit.md](../INTERNALS/imagekit.md).
