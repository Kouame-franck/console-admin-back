import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME;
const PUBLIC_URL = process.env.R2_PUBLIC_URL;

export function generateFileName(originalName, prefix = "") {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).slice(2, 8);
  const extension = originalName.split(".").pop().toLowerCase();
  const baseName = prefix ? `${prefix}/${timestamp}-${randomString}` : `${timestamp}-${randomString}`;
  return `${baseName}.${extension}`;
}

export async function uploadFile(fileBuffer, fileName, contentType) {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileName,
      Body: fileBuffer,
      ContentType: contentType,
    })
  );
  return { fileName, publicUrl: getPublicUrl(fileName) };
}

export async function deleteFile(fileName) {
  await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: fileName }));
}

export function getPublicUrl(fileName) {
  if (!fileName || !PUBLIC_URL) return null;
  return `${PUBLIC_URL}/${fileName}`;
}
