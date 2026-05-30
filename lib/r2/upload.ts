import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * Server-only Cloudflare R2 client. R2 speaks the S3 API, so we use the AWS
 * SDK pointed at the account's R2 endpoint.
 *
 * Audio is egress-dominated (readers stream MP3s repeatedly), so R2's
 * zero-egress / 10 GB-free model fits where ImageKit's metered bandwidth does
 * not. ImageKit stays images-only; R2 is audio-only.
 *
 * Mirrors lib/imagekit/upload.ts: returns a **path only** (never a full URL)
 * so the backing store can later swap R2→S3 as a config change with no data
 * migration. Render-side composition lives in lib/r2/url.ts via audioUrl().
 */
let cachedClient: S3Client | null = null;

function getR2Client(): S3Client {
  if (cachedClient) return cachedClient;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Cloudflare R2 env vars missing — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, " +
        "and R2_SECRET_ACCESS_KEY in .env.local (see docs/audio-plan.md §Setup).",
    );
  }

  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return cachedClient;
}

function getBucket(): string {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) {
    throw new Error("R2_BUCKET env var missing — set it in .env.local.");
  }
  return bucket;
}

export interface UploadAudioInput {
  /** Raw audio bytes from the TTS provider. */
  buffer: Buffer | Uint8Array;
  /**
   * Object key under the bucket, e.g.
   * "audio/<variantId>/<partNumber>-<voiceId>.mp3". No leading slash.
   */
  key: string;
  /** e.g. "audio/mpeg". */
  contentType: string;
}

export interface UploadAudioResult {
  /**
   * The object key we stored — the DB persists THIS as `audio_path`, never
   * the full URL. Playback URLs are composed at render time by audioUrl().
   */
  path: string;
  byteSize: number;
}

export async function uploadAudio(input: UploadAudioInput): Promise<UploadAudioResult> {
  const client = getR2Client();
  const body = input.buffer instanceof Buffer ? input.buffer : Buffer.from(input.buffer);

  await client.send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: input.key,
      Body: body,
      ContentType: input.contentType,
    }),
  );

  return { path: input.key, byteSize: body.byteLength };
}
