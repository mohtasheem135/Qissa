import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/check-admin";
import { uploadCoverImage } from "@/lib/imagekit/upload";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

/**
 * POST /api/upload
 *
 * Multipart form-data with field `file` — a single image, ≤ 2MB,
 * jpeg/png/webp/avif. Streams to ImageKit and returns the PATH to store
 * in `stories.cover_image_url`, e.g. "/covers/the_bet_xxx.png".
 *
 * The full URL is intentionally not surfaced — render-side composition
 * uses NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT, so switching ImageKit accounts
 * or moving behind a CDN never requires touching the DB.
 */
export async function POST(request: Request): Promise<Response> {
  await requireAdmin();

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ ok: false, error: "Invalid form data." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Missing file." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { ok: false, error: `Unsupported type "${file.type}". Use JPEG / PNG / WebP / AVIF.` },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: `File is ${(file.size / 1024 / 1024).toFixed(1)}MB; max is 2MB.` },
      { status: 413 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadCoverImage({ buffer, fileName: file.name });
    return NextResponse.json({
      ok: true,
      path: result.path,
      fileId: result.fileId,
      width: result.width,
      height: result.height,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Upload failed." },
      { status: 500 },
    );
  }
}
