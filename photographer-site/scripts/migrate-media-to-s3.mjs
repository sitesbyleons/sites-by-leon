import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const dryRun = process.argv.includes('--dry-run');
const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};
const endpoint = new URL(required('S3_ENDPOINT'));
if (endpoint.protocol !== 'https:') throw new Error('S3_ENDPOINT must use HTTPS.');
if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
  throw new Error('S3_ENDPOINT cannot contain credentials, a query, or a fragment.');
}
const uploadRoot = path.resolve(process.env.UPLOAD_ROOT?.trim() || '/data/uploads');
const region = required('S3_REGION');
const bucket = required('S3_BUCKET');
const accessKeyId = required('S3_ACCESS_KEY_ID');
const secretAccessKey = required('S3_SECRET_ACCESS_KEY');
const prefix = (process.env.S3_KEY_PREFIX?.trim() || 'media').replace(/^\/+|\/+$/g, '');
if (!/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(prefix)) throw new Error('S3_KEY_PREFIX is invalid.');

const client = new S3Client({
  endpoint: endpoint.toString().replace(/\/$/, ''),
  region,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE?.trim() !== 'false',
  credentials: { accessKeyId, secretAccessKey },
  maxAttempts: 3,
});

const managedPathPattern = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
const contentTypes = new Map([
  ['.avif', 'image/avif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);

async function sha256(source) {
  const hash = createHash('sha256');
  if (source instanceof Uint8Array) {
    hash.update(source);
  } else if (source && typeof source === 'object' && Symbol.asyncIterator in source) {
    for await (const chunk of source) hash.update(chunk);
  } else {
    throw new Error('Object storage returned an unsupported response body.');
  }
  return hash.digest('hex');
}

async function filesUnder(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlinks are not allowed in the upload root: ${absolute}`);
    if (entry.isDirectory()) files.push(...await filesUnder(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

const files = await filesUnder(uploadRoot);
let uploaded = 0;
let verified = 0;
let failed = 0;

for (const absolute of files) {
  const relative = path.relative(uploadRoot, absolute).split(path.sep).join('/');
  if (!managedPathPattern.test(relative) || relative.includes('/../')) {
    console.error(`Skipped unsafe managed path: ${relative}`);
    failed += 1;
    continue;
  }
  const details = await stat(absolute);
  const key = `${prefix}/${relative}`;
  const contentType = contentTypes.get(path.extname(relative).toLowerCase()) ?? 'application/octet-stream';
  if (dryRun) {
    console.log(`Would migrate ${relative} (${details.size} bytes)`);
    continue;
  }
  try {
    try {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: createReadStream(absolute),
        ContentLength: details.size,
        ContentType: contentType,
        CacheControl: 'public, max-age=300, must-revalidate',
        IfNoneMatch: '*',
      }));
      uploaded += 1;
    } catch (error) {
      if (error?.$metadata?.httpStatusCode !== 412 && error?.name !== 'PreconditionFailed') throw error;
    }
    const remote = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    if (remote.ContentLength !== details.size) throw new Error('Remote size does not match local size.');
    const [localHash, remoteHash] = await Promise.all([
      sha256(createReadStream(absolute)),
      client.send(new GetObjectCommand({ Bucket: bucket, Key: key })).then((result) => sha256(result.Body)),
    ]);
    if (localHash !== remoteHash) throw new Error('Remote content hash does not match local content.');
    verified += 1;
    console.log(`Verified ${relative} (${details.size} bytes)`);
  } catch (error) {
    failed += 1;
    console.error(`Migration failed for ${relative}: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

console.log(JSON.stringify({ dryRun, discovered: files.length, uploaded, verified, failed }));
if (failed) process.exitCode = 1;
