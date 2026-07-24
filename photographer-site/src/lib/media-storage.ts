import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { isManagedUploadPath, resolveManagedUpload } from '@leon/platform-core/image-storage';

export type MediaStorageBackend = 'local' | 's3';

export type StoredMedia = {
  body: BodyInit;
  contentLength: number | null;
  contentType: string;
  etag: string | null;
  lastModified: Date | null;
};

type S3Sender = {
  send(command: DeleteObjectCommand | GetObjectCommand | PutObjectCommand): Promise<unknown>;
};

type MediaStorageEnvironment = Record<string, string | undefined>;

type MediaStorageOptions = {
  s3Client?: S3Sender;
};

export class MediaStorageConfigurationError extends Error {}

const contentTypes = new Map([
  ['.avif', 'image/avif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);

export const mediaContentType = (managedPath: string, providerType?: string) => {
  if ([...contentTypes.values()].includes(providerType ?? '')) return providerType!;
  return contentTypes.get(path.extname(managedPath).toLowerCase()) ?? 'application/octet-stream';
};

const required = (environment: MediaStorageEnvironment, key: string) => {
  const value = environment[key]?.trim();
  if (!value) throw new MediaStorageConfigurationError(`${key} is required when MEDIA_STORAGE_BACKEND=s3.`);
  return value;
};

const parseBoolean = (value: string | undefined, fallback: boolean) => {
  if (!value?.trim()) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new MediaStorageConfigurationError('S3_FORCE_PATH_STYLE must be true or false.');
};

const validEndpoint = (value: string, nodeEnv: string | undefined) => {
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new MediaStorageConfigurationError('S3_ENDPOINT must be a valid URL.');
  }
  const local = ['localhost', '127.0.0.1', '::1'].includes(endpoint.hostname);
  if (endpoint.protocol !== 'https:' && !(nodeEnv === 'test' && local && endpoint.protocol === 'http:')) {
    throw new MediaStorageConfigurationError('S3_ENDPOINT must use HTTPS.');
  }
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new MediaStorageConfigurationError('S3_ENDPOINT cannot contain credentials, a query, or a fragment.');
  }
  return endpoint.toString().replace(/\/$/, '');
};

const s3KeyPrefix = (value: string | undefined) => {
  const prefix = value?.trim().replace(/^\/+|\/+$/g, '') || 'media';
  if (prefix.length > 128
    || prefix.includes('..')
    || !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(prefix)) {
    throw new MediaStorageConfigurationError('S3_KEY_PREFIX must contain safe path segments.');
  }
  return prefix;
};

const missingObject = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const source = error as { name?: unknown; Code?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return source.name === 'NoSuchKey'
    || source.Code === 'NoSuchKey'
    || source.$metadata?.httpStatusCode === 404;
};

const responseBody = (output: GetObjectCommandOutput): BodyInit => {
  const body = output.Body;
  if (!body) return new Uint8Array();
  if (body instanceof Uint8Array) return body as unknown as BodyInit;
  if ('transformToWebStream' in body && typeof body.transformToWebStream === 'function') {
    return body.transformToWebStream() as ReadableStream<Uint8Array>;
  }
  throw new Error('Object storage returned an unsupported response body.');
};

export class MediaStorage {
  readonly backend: MediaStorageBackend;

  private readonly uploadRoot: string;
  private readonly s3: S3Sender | null;
  private readonly bucket: string | null;
  private readonly keyPrefix: string | null;

  constructor(
    backend: MediaStorageBackend,
    uploadRoot: string,
    s3: S3Sender | null,
    bucket: string | null,
    keyPrefix: string | null,
  ) {
    this.backend = backend;
    this.uploadRoot = uploadRoot;
    this.s3 = s3;
    this.bucket = bucket;
    this.keyPrefix = keyPrefix;
  }

  private localPath(workspaceId: string, managedPath: string) {
    const absolute = resolveManagedUpload(this.uploadRoot, workspaceId, managedPath);
    if (!absolute) throw new Error('Invalid managed media path.');
    return absolute;
  }

  private objectKey(workspaceId: string, managedPath: string) {
    if (!isManagedUploadPath(workspaceId, managedPath) || !this.keyPrefix) {
      throw new Error('Invalid managed media path.');
    }
    return `${this.keyPrefix}/${managedPath}`;
  }

  async write(workspaceId: string, managedPath: string, bytes: Uint8Array) {
    if (this.backend === 'local') {
      const absolute = this.localPath(workspaceId, managedPath);
      await mkdir(path.dirname(absolute), { recursive: true, mode: 0o750 });
      await writeFile(absolute, bytes, { flag: 'wx', mode: 0o640 });
      return;
    }

    await this.s3!.send(new PutObjectCommand({
      Bucket: this.bucket!,
      Key: this.objectKey(workspaceId, managedPath),
      Body: bytes,
      CacheControl: 'public, max-age=300, must-revalidate',
      ContentType: 'image/webp',
      IfNoneMatch: '*',
    }));
  }

  async read(workspaceId: string, managedPath: string): Promise<StoredMedia | null> {
    const absolute = this.localPath(workspaceId, managedPath);
    try {
      const details = await stat(absolute);
      return {
        body: Readable.toWeb(createReadStream(absolute)) as ReadableStream<Uint8Array>,
        contentLength: details.size,
        contentType: mediaContentType(managedPath),
        etag: null,
        lastModified: details.mtime,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (!this.s3) return null;

    try {
      const output = await this.s3.send(new GetObjectCommand({
        Bucket: this.bucket!,
        Key: this.objectKey(workspaceId, managedPath),
      })) as GetObjectCommandOutput;
      return {
        body: responseBody(output),
        contentLength: output.ContentLength ?? null,
        contentType: mediaContentType(managedPath, output.ContentType),
        etag: output.ETag ?? null,
        lastModified: output.LastModified ?? null,
      };
    } catch (error) {
      if (missingObject(error)) return null;
      throw error;
    }
  }

  async remove(workspaceId: string, managedPath: string) {
    const absolute = this.localPath(workspaceId, managedPath);
    await unlink(absolute).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
    if (!this.s3) return;
    await this.s3.send(new DeleteObjectCommand({
      Bucket: this.bucket!,
      Key: this.objectKey(workspaceId, managedPath),
    }));
  }
}

export function createMediaStorage(
  environment: MediaStorageEnvironment = process.env,
  options: MediaStorageOptions = {},
) {
  const backendValue = environment.MEDIA_STORAGE_BACKEND?.trim() || 'local';
  if (backendValue !== 'local' && backendValue !== 's3') {
    throw new MediaStorageConfigurationError('MEDIA_STORAGE_BACKEND must be local or s3.');
  }
  const uploadRoot = environment.UPLOAD_ROOT?.trim() || '/data/uploads';
  if (backendValue === 'local') return new MediaStorage('local', uploadRoot, null, null, null);

  const endpoint = validEndpoint(required(environment, 'S3_ENDPOINT'), environment.NODE_ENV);
  const region = required(environment, 'S3_REGION');
  const bucket = required(environment, 'S3_BUCKET');
  const accessKeyId = required(environment, 'S3_ACCESS_KEY_ID');
  const secretAccessKey = required(environment, 'S3_SECRET_ACCESS_KEY');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/.test(region)) {
    throw new MediaStorageConfigurationError('S3_REGION is invalid.');
  }
  if (bucket.length > 63
    || bucket.includes('..')
    || !/^[a-z0-9][a-z0-9.-]+[a-z0-9]$/.test(bucket)) {
    throw new MediaStorageConfigurationError('S3_BUCKET is invalid.');
  }
  if (accessKeyId.length > 256 || secretAccessKey.length > 512) {
    throw new MediaStorageConfigurationError('S3 credentials are invalid.');
  }
  const s3 = options.s3Client ?? new S3Client({
    endpoint,
    region,
    forcePathStyle: parseBoolean(environment.S3_FORCE_PATH_STYLE, true),
    credentials: { accessKeyId, secretAccessKey },
    maxAttempts: 3,
  });
  return new MediaStorage('s3', uploadRoot, s3, bucket, s3KeyPrefix(environment.S3_KEY_PREFIX));
}

let singleton: MediaStorage | null = null;

export function mediaStorage() {
  singleton ??= createMediaStorage();
  return singleton;
}
