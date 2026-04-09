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
import crypto from "crypto";

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
    console.log(`☁️  S3 upload enabled → ${bucket} (${region})`);
    return { client: s3, bucket, region };
  }

  console.log("💾 S3 not configured — logo uploads will use base64 (dev mode)");
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
    const ext = mimetype.split("/")[1] || "png";
    const key = `logos/${schoolId}-${crypto.randomBytes(4).toString("hex")}.${ext}`;

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
    console.warn("Failed to delete old logo from S3:", err);
  }
}
