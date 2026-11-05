// Document storage: Cloudflare R2 (S3-compatible) when configured, local disk otherwise.
// Objects are private; files are only ever streamed back through authorised API routes.
import fs from 'node:fs';
import path from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config, r2Configured } from './config.js';

let client;
const s3 = () => {
  client ||= new S3Client({
    region: 'auto',
    endpoint: config.r2.endpoint || `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.r2.accessKeyId, secretAccessKey: config.r2.secretAccessKey },
  });
  return client;
};
const localPath = key => {
  const resolved = path.resolve(config.uploadsDir, key);
  if (!resolved.startsWith(path.resolve(config.uploadsDir))) throw new Error('Invalid storage key');
  return resolved;
};

export const storageDriver = () => (r2Configured() ? 'r2' : 'local');

export async function putObject(key, buffer, contentType) {
  if (r2Configured()) {
    await s3().send(new PutObjectCommand({ Bucket: config.r2.bucket, Key: key, Body: buffer, ContentType: contentType }));
  } else {
    const file = localPath(key);
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, buffer);
  }
  return { key, driver: storageDriver() };
}

export async function getObject(key) {
  if (r2Configured()) {
    const result = await s3().send(new GetObjectCommand({ Bucket: config.r2.bucket, Key: key }));
    return { stream: result.Body, contentType: result.ContentType };
  }
  return { stream: fs.createReadStream(localPath(key)), contentType: undefined };
}

export async function deleteObject(key) {
  if (!key) return;
  if (r2Configured()) await s3().send(new DeleteObjectCommand({ Bucket: config.r2.bucket, Key: key }));
  else await fs.promises.rm(localPath(key), { force: true });
}
