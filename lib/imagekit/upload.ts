import ImageKit from "imagekit";

/**
 * Server-only ImageKit client. Reads NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT +
 * the public + private keys from env.
 *
 * Phase 1 uses ImageKit for cover images (free tier is 20GB storage +
 * 20GB bandwidth/month). All uploads go to /qissa/covers/ by default.
 */
let cachedClient: ImageKit | null = null;

export function getImageKitClient(): ImageKit {
  if (cachedClient) return cachedClient;

  const urlEndpoint = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT;
  const publicKey = process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY;
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;

  if (!urlEndpoint || !publicKey || !privateKey) {
    throw new Error(
      "ImageKit env vars missing — set NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT, " +
        "NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY, and IMAGEKIT_PRIVATE_KEY in .env.local.",
    );
  }

  cachedClient = new ImageKit({ urlEndpoint, publicKey, privateKey });
  return cachedClient;
}

export interface UploadCoverInput {
  /** Raw file bytes (from FormData). */
  buffer: Buffer;
  /** Original filename — used as the upload's display name. */
  fileName: string;
  /** Optional subfolder under /qissa/covers (e.g., a year for organization). */
  folder?: string;
}

export interface UploadCoverResult {
  url: string;
  fileId: string;
  /** Width/height the file was uploaded with (useful for cards). */
  width?: number;
  height?: number;
}

/**
 * Upload a cover image. Returns the canonical URL (no transform params)
 * which we store in `stories.cover_image_url`. Display surfaces append
 * `?tr=w-400,h-225` etc. via the ImageKit URL builder.
 */
export async function uploadCoverImage(input: UploadCoverInput): Promise<UploadCoverResult> {
  const ik = getImageKitClient();
  const folder = input.folder ? `/qissa/covers/${input.folder}` : "/qissa/covers";

  const result = await ik.upload({
    file: input.buffer,
    fileName: input.fileName,
    folder,
    useUniqueFileName: true,
  });

  return {
    url: result.url,
    fileId: result.fileId,
    width: result.width,
    height: result.height,
  };
}
