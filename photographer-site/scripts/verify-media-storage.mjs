import {
  DeleteObjectCommand,
  GetBucketVersioningCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import crypto from 'node:crypto';

if ((process.env.MEDIA_STORAGE_BACKEND?.trim() || 'local') !== 's3') {
  console.log('Local media storage selected; object-storage verification skipped.');
  process.exit(0);
}

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};
const endpoint = new URL(required('S3_ENDPOINT'));
if (endpoint.protocol !== 'https:') throw new Error('S3_ENDPOINT must use HTTPS.');
const region = required('S3_REGION');
const bucket = required('S3_BUCKET');
const accessKeyId = required('S3_ACCESS_KEY_ID');
const secretAccessKey = required('S3_SECRET_ACCESS_KEY');
const prefix = (process.env.S3_KEY_PREFIX?.trim() || 'media').replace(/^\/+|\/+$/g, '');
const key = `${prefix}/health/${crypto.randomUUID()}.txt`;
const expected = crypto.randomBytes(32);
const client = new S3Client({
  endpoint: endpoint.toString().replace(/\/$/, ''),
  region,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE?.trim() !== 'false',
  credentials: { accessKeyId, secretAccessKey },
  maxAttempts: 3,
});

let created = false;
try {
  const versioning = await client.send(new GetBucketVersioningCommand({ Bucket: bucket }));
  if (versioning.Status !== 'Enabled') {
    throw new Error('The private media bucket must have versioning enabled.');
  }
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: expected,
    ContentLength: expected.byteLength,
    ContentType: 'application/octet-stream',
    IfNoneMatch: '*',
  }));
  created = true;
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const actual = result.Body && 'transformToByteArray' in result.Body
    ? await result.Body.transformToByteArray()
    : result.Body;
  if (!(actual instanceof Uint8Array)
    || actual.byteLength !== expected.byteLength
    || !crypto.timingSafeEqual(actual, expected)) {
    throw new Error('Object-storage verification returned different bytes.');
  }
} finally {
  if (created) await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

console.log('Private media object storage passed write, read, and delete verification.');
