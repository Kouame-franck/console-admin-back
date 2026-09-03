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

// Audit sécurité (2026-09-03) : l'extension venait auparavant du nom de fichier envoyé par le
// navigateur (`originalname`), donc entièrement choisi par l'appelant -- sans incidence sur le
// `ContentType` réellement servi (déjà fixé depuis le MIME détecté par multer, voir uploadFile),
// mais une clé R2 mal formée n'a aucune raison d'exister. On dérive maintenant l'extension du
// MIME, une liste fermée aux seuls types déjà acceptés par les fileFilter de blog.js /
// etablissements.js.
const EXTENSION_BY_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export function generateFileName(mimetype, prefix = "") {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).slice(2, 8);
  const extension = EXTENSION_BY_MIME[mimetype] || "bin";
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
