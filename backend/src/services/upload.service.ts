/**
 * Upload Service — S3 for production, base64 for dev fallback
 *
 * If AWS_S3_BUCKET is set, uploads go to S3 and return a public URL.
 * Otherwise, the file is stored as a base64 data URL in the database.
 *
 * S3 client is lazy-initialized on first upload to avoid dotenv timing issues
 * (dotenv.config() runs after imports in app.ts).
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import logger from "../utils/logger";

let s3: S3Client | null = null;
let s3Checked = false;

function getS3(): { client: S3Client; bucket: string; region: string } | null {
  if (s3Checked) {
    return s3
      ? { client: s3, bucket: process.env.AWS_S3_BUCKET!, region: process.env.AWS_S3_REGION || "ap-south-1" }
      : null;
  }
  s3Checked = true;

  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_S3_REGION || "ap-south-1";
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (bucket && accessKeyId && secretAccessKey) {
    s3 = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
    logger.info({ bucket, region }, "S3 upload enabled");
    return { client: s3, bucket, region };
  }

  logger.info("S3 not configured — uploads will use base64 (dev mode)");
  return null;
}

export interface UploadResult {
  url: string;
  storageType: "s3" | "base64";
}

/**
 * Upload a school logo.
 * @param fileBuffer - The raw file buffer (from multer)
 * @param mimetype   - e.g. "image/png"
 * @param schoolId   - Used to namespace the S3 key
 */
export async function uploadLogo(
  fileBuffer: Buffer,
  mimetype: string,
  schoolId: string
): Promise<UploadResult> {
  const s3Config = getS3();

  if (s3Config) {
    const ext = mimetype.split("/")[1].replace(/\+.*/, "") || "png";
    const key = `logos/${schoolId}/logo.${ext}`;

    await s3Config.client.send(
      new PutObjectCommand({
        Bucket: s3Config.bucket,
        Key: key,
        Body: fileBuffer,
        ContentType: mimetype,
        CacheControl: "public, max-age=31536000",
      })
    );

    const url = `https://${s3Config.bucket}.s3.${s3Config.region}.amazonaws.com/${key}`;
    return { url, storageType: "s3" };
  }

  // Dev fallback: base64
  const base64 = `data:${mimetype};base64,${fileBuffer.toString("base64")}`;
  return { url: base64, storageType: "base64" };
}

/**
 * Delete a logo from S3 (no-op for base64).
 */
export async function deleteLogo(logoUrl: string): Promise<void> {
  const s3Config = getS3();
  if (!s3Config || !logoUrl.includes(".amazonaws.com/")) return;

  try {
    const key = logoUrl.split(".amazonaws.com/")[1];
    if (key) {
      await s3Config.client.send(new DeleteObjectCommand({ Bucket: s3Config.bucket, Key: key }));
    }
  } catch (err) {
    logger.warn({ err }, "Failed to delete old logo from S3");
  }
}

const GALLERY_MAX_DIMENSION = 1920;
const GALLERY_WEBP_QUALITY = 80;

/**
 * Resize and re-encode a gallery photo before it's stored.
 * Uploaded photos are only ever displayed at web sizes, so re-encoding
 * at a capped resolution routinely cuts file size by 80-95% with no
 * visible quality loss, and stripping EXIF drops embedded GPS data.
 * Falls back to the original buffer if the input can't be decoded
 * (e.g. an unsupported format) so an upload never hard-fails on this step.
 */
async function compressGalleryImage(
  fileBuffer: Buffer
): Promise<{ buffer: Buffer; mimetype: string }> {
  try {
    const buffer = await sharp(fileBuffer)
      .rotate() // apply EXIF orientation before it's stripped
      .resize({
        width: GALLERY_MAX_DIMENSION,
        height: GALLERY_MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: GALLERY_WEBP_QUALITY })
      .toBuffer();
    return { buffer, mimetype: "image/webp" };
  } catch (err) {
    logger.warn({ err }, "Gallery photo compression failed, storing original");
    return { buffer: fileBuffer, mimetype: "image/jpeg" };
  }
}

/**
 * Upload a gallery photo.
 * @param fileBuffer - The raw file buffer (from multer)
 * @param mimetype   - e.g. "image/jpeg"
 * @param schoolId   - Used to namespace the S3 key
 * @param photoId    - Used to make the S3 key unique per photo
 */
export async function uploadGalleryPhoto(
  fileBuffer: Buffer,
  mimetype: string,
  schoolId: string,
  photoId: string
): Promise<UploadResult> {
  const compressed = await compressGalleryImage(fileBuffer);
  const s3Config = getS3();

  if (s3Config) {
    const ext = compressed.mimetype.split("/")[1];
    const key = `gallery/${schoolId}/${photoId}.${ext}`;

    await s3Config.client.send(
      new PutObjectCommand({
        Bucket: s3Config.bucket,
        Key: key,
        Body: compressed.buffer,
        ContentType: compressed.mimetype,
        CacheControl: "public, max-age=31536000",
      })
    );

    const url = `https://${s3Config.bucket}.s3.${s3Config.region}.amazonaws.com/${key}`;
    return { url, storageType: "s3" };
  }

  // Dev fallback: base64
  const base64 = `data:${compressed.mimetype};base64,${compressed.buffer.toString("base64")}`;
  return { url: base64, storageType: "base64" };
}

/**
 * Delete a gallery photo from S3 (no-op for base64).
 */
export async function deleteGalleryPhoto(photoUrl: string): Promise<void> {
  const s3Config = getS3();
  if (!s3Config || !photoUrl.includes(".amazonaws.com/")) return;

  try {
    const key = photoUrl.split(".amazonaws.com/")[1];
    if (key) {
      await s3Config.client.send(new DeleteObjectCommand({ Bucket: s3Config.bucket, Key: key }));
    }
  } catch (err) {
    logger.warn({ err }, "Failed to delete gallery photo from S3");
  }
}

/**
 * Upload a homepage announcement image. Reuses the gallery compression
 * pipeline — an announcement banner is the same shape of image (full-size
 * marketing graphic, not a small headshot like a student photo).
 * @param fileBuffer    - The raw file buffer (from multer)
 * @param mimetype      - e.g. "image/jpeg"
 * @param schoolId      - Used to namespace the S3 key
 * @param announcementId - Used to make the S3 key unique per announcement
 */
export async function uploadAnnouncementImage(
  fileBuffer: Buffer,
  mimetype: string,
  schoolId: string,
  announcementId: string
): Promise<UploadResult> {
  const compressed = await compressGalleryImage(fileBuffer);
  const s3Config = getS3();

  if (s3Config) {
    const ext = compressed.mimetype.split("/")[1];
    const key = `announcements/${schoolId}/${announcementId}.${ext}`;

    await s3Config.client.send(
      new PutObjectCommand({
        Bucket: s3Config.bucket,
        Key: key,
        Body: compressed.buffer,
        ContentType: compressed.mimetype,
        CacheControl: "public, max-age=31536000",
      })
    );

    const url = `https://${s3Config.bucket}.s3.${s3Config.region}.amazonaws.com/${key}`;
    return { url, storageType: "s3" };
  }

  // Dev fallback: base64
  const base64 = `data:${compressed.mimetype};base64,${compressed.buffer.toString("base64")}`;
  return { url: base64, storageType: "base64" };
}

/**
 * Delete an announcement image from S3 (no-op for base64).
 */
export async function deleteAnnouncementImage(imageUrl: string): Promise<void> {
  const s3Config = getS3();
  if (!s3Config || !imageUrl.includes(".amazonaws.com/")) return;

  try {
    const key = imageUrl.split(".amazonaws.com/")[1];
    if (key) {
      await s3Config.client.send(new DeleteObjectCommand({ Bucket: s3Config.bucket, Key: key }));
    }
  } catch (err) {
    logger.warn({ err }, "Failed to delete announcement image from S3");
  }
}

// ─── Student photos ─────────────────────────────────────
const STUDENT_PHOTO_MAX = 400;
const STUDENT_PHOTO_QUALITY = 80;

async function compressStudentPhoto(
  fileBuffer: Buffer
): Promise<{ buffer: Buffer; mimetype: string }> {
  try {
    const buffer = await sharp(fileBuffer)
      .rotate()
      .resize({ width: STUDENT_PHOTO_MAX, height: STUDENT_PHOTO_MAX, fit: "cover" })
      .webp({ quality: STUDENT_PHOTO_QUALITY })
      .toBuffer();
    return { buffer, mimetype: "image/webp" };
  } catch {
    return { buffer: fileBuffer, mimetype: "image/jpeg" };
  }
}

export function isBase64DataUri(value: string): boolean {
  return value.startsWith("data:");
}

function parseDataUri(dataUri: string): { buffer: Buffer; mimetype: string } {
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid data URI");
  return { buffer: Buffer.from(match[2], "base64"), mimetype: match[1] };
}

export async function uploadStudentPhoto(
  dataUri: string,
  schoolId: string,
  studentId: string
): Promise<UploadResult> {
  const { buffer } = parseDataUri(dataUri);
  const compressed = await compressStudentPhoto(buffer);
  const s3Config = getS3();

  if (s3Config) {
    const ext = compressed.mimetype.split("/")[1];
    const key = `students/${schoolId}/${studentId}.${ext}`;

    await s3Config.client.send(
      new PutObjectCommand({
        Bucket: s3Config.bucket,
        Key: key,
        Body: compressed.buffer,
        ContentType: compressed.mimetype,
        CacheControl: "public, max-age=31536000",
      })
    );

    return {
      url: `https://${s3Config.bucket}.s3.${s3Config.region}.amazonaws.com/${key}`,
      storageType: "s3",
    };
  }

  const base64 = `data:${compressed.mimetype};base64,${compressed.buffer.toString("base64")}`;
  return { url: base64, storageType: "base64" };
}

export async function deleteStudentPhoto(photoUrl: string): Promise<void> {
  const s3Config = getS3();
  if (!s3Config || !photoUrl.includes(".amazonaws.com/")) return;

  try {
    const key = photoUrl.split(".amazonaws.com/")[1];
    if (key) {
      await s3Config.client.send(new DeleteObjectCommand({ Bucket: s3Config.bucket, Key: key }));
    }
  } catch {
    // best-effort
  }
}