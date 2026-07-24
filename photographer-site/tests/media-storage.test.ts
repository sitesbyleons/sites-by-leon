import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createMediaStorage,
  mediaContentType,
  MediaStorageConfigurationError,
} from '../src/lib/media-storage';

const workspaceId = 'workspace-1';
const managedPath = `${workspaceId}/galleries/photo.webp`;
const temporaryRoots: string[] = [];

async function temporaryRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'leon-media-'));
  temporaryRoots.push(root);
  return root;
}

const s3Environment = (root: string) => ({
  NODE_ENV: 'test',
  MEDIA_STORAGE_BACKEND: 's3',
  UPLOAD_ROOT: root,
  S3_ENDPOINT: 'http://127.0.0.1:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'leonsites-media-test',
  S3_ACCESS_KEY_ID: 'scoped-key',
  S3_SECRET_ACCESS_KEY: 'scoped-secret',
  S3_FORCE_PATH_STYLE: 'true',
  S3_KEY_PREFIX: 'tenant-media',
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('managed media storage', () => {
  it('preserves supported legacy image content types without trusting arbitrary provider values', () => {
    expect(mediaContentType('workspace-1/covers/legacy.png')).toBe('image/png');
    expect(mediaContentType('workspace-1/covers/legacy.jpg')).toBe('image/jpeg');
    expect(mediaContentType(managedPath, 'text/html')).toBe('image/webp');
    expect(mediaContentType('workspace-1/covers/unknown.bin', 'text/html')).toBe('application/octet-stream');
  });

  it('writes, streams, and removes local media without leaving the workspace root', async () => {
    const root = await temporaryRoot();
    const storage = createMediaStorage({ MEDIA_STORAGE_BACKEND: 'local', UPLOAD_ROOT: root });
    const bytes = new TextEncoder().encode('image-data');

    await storage.write(workspaceId, managedPath, bytes);
    const media = await storage.read(workspaceId, managedPath);

    expect(media?.contentLength).toBe(bytes.byteLength);
    expect(new Uint8Array(await new Response(media?.body).arrayBuffer())).toEqual(bytes);
    await expect(readFile(path.join(root, managedPath))).resolves.toEqual(Buffer.from(bytes));

    await storage.remove(workspaceId, managedPath);
    await expect(storage.read(workspaceId, managedPath)).resolves.toBeNull();
    await expect(storage.remove(workspaceId, managedPath)).resolves.toBeUndefined();
  });

  it('rejects traversal and cross-tenant paths before touching storage', async () => {
    const root = await temporaryRoot();
    const storage = createMediaStorage({ MEDIA_STORAGE_BACKEND: 'local', UPLOAD_ROOT: root });

    await expect(storage.write(workspaceId, '../workspace-2/private.webp', new Uint8Array([1])))
      .rejects.toThrow('Invalid managed media path.');
    await expect(storage.read(workspaceId, 'workspace-2/galleries/private.webp'))
      .rejects.toThrow('Invalid managed media path.');
  });

  it('fails closed for incomplete, insecure, or malformed S3 configuration', async () => {
    const root = await temporaryRoot();
    expect(() => createMediaStorage({ MEDIA_STORAGE_BACKEND: 's3', UPLOAD_ROOT: root }))
      .toThrow(MediaStorageConfigurationError);
    expect(() => createMediaStorage({
      ...s3Environment(root),
      NODE_ENV: 'production',
      S3_ENDPOINT: 'http://objects.example.com',
    })).toThrow('S3_ENDPOINT must use HTTPS.');
    expect(() => createMediaStorage({ ...s3Environment(root), S3_KEY_PREFIX: '../private' }))
      .toThrow('S3_KEY_PREFIX must contain safe path segments.');
  });

  it('uses tenant-prefixed private object commands and local-first compatibility', async () => {
    const root = await temporaryRoot();
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof GetObjectCommand) {
        return {
          Body: new TextEncoder().encode('s3-image'),
          ContentLength: 8,
          ContentType: 'image/webp',
          ETag: '"etag"',
          LastModified: new Date('2026-07-24T12:00:00Z'),
        };
      }
      return {};
    });
    const storage = createMediaStorage(s3Environment(root), { s3Client: { send } });

    await storage.write(workspaceId, managedPath, new Uint8Array([1, 2, 3]));
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(PutObjectCommand);
    expect((send.mock.calls[0]?.[0] as PutObjectCommand).input).toMatchObject({
      Bucket: 'leonsites-media-test',
      Key: `tenant-media/${managedPath}`,
      ContentType: 'image/webp',
      IfNoneMatch: '*',
    });

    const remote = await storage.read(workspaceId, managedPath);
    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(GetObjectCommand);
    expect(await new Response(remote?.body).text()).toBe('s3-image');

    const localPath = path.join(root, managedPath);
    await mkdir(path.dirname(localPath), { recursive: true });
    await writeFile(localPath, 'local-image');
    send.mockClear();
    expect(await new Response((await storage.read(workspaceId, managedPath))?.body).text()).toBe('local-image');
    expect(send).not.toHaveBeenCalled();

    await storage.remove(workspaceId, managedPath);
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(DeleteObjectCommand);
    expect((send.mock.calls[0]?.[0] as DeleteObjectCommand).input.Key).toBe(`tenant-media/${managedPath}`);
  });

  it('treats missing S3 objects as absent without hiding other provider failures', async () => {
    const root = await temporaryRoot();
    const missing = createMediaStorage(s3Environment(root), {
      s3Client: { send: vi.fn().mockRejectedValue({ name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } }) },
    });
    await expect(missing.read(workspaceId, managedPath)).resolves.toBeNull();

    const unavailable = createMediaStorage(s3Environment(root), {
      s3Client: { send: vi.fn().mockRejectedValue(new Error('provider unavailable')) },
    });
    await expect(unavailable.read(workspaceId, managedPath)).rejects.toThrow('provider unavailable');
  });
});
