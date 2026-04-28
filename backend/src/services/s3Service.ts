import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';

const s3 = new S3Client({
  region: env.aws.region,
  credentials: env.aws.accessKeyId
    ? { accessKeyId: env.aws.accessKeyId, secretAccessKey: env.aws.secretAccessKey }
    : undefined,
});

const BUCKET = env.aws.s3Bucket;

export type S3Prefix = 'body-photos' | 'clothing-photos' | 'tryon-results';

export async function uploadToS3(
  prefix: S3Prefix,
  userId: string,
  filename: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const key = `${prefix}/${userId}/${filename}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );
  return key;
}

export async function deleteFromS3(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

export async function getPresignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: expiresInSeconds },
  );
}

export function keyFromUrl(url: string): string {
  // Extract S3 key from a stored URL or key path
  if (url.startsWith('http')) {
    const parsed = new URL(url);
    return parsed.pathname.replace(/^\//, '');
  }
  return url;
}
