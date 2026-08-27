import { detectImageExtension, isManagedUploadPath } from '@leon/platform-core/image-storage';
import { isTrustedOrigin } from '@leon/platform-core/request-security';
import type { APIRoute } from 'astro';

import { ImageProcessingError, optimizeUploadedImage } from '../../../lib/image-processing';
import { mediaStorage } from '../../../lib/media-storage';
import { resolveManagedStudio } from '../../../lib/studio';
import { sweepOrphanedUploads } from '../../../lib/upload-cleanup';

export const prerender = false;

const mediaOrigin = (process.env.PUBLIC_MEDIA_URL ?? 'https://api.leonsites.org').replace(/\/$/, '');
const maxImageBytes = 15 * 1024 * 1024;
const defaultWorkspaceQuotaBytes = 4 * 1024 * 1024 * 1024;
const configuredWorkspaceQuota = Number(process.env.WORKSPACE_UPLOAD_QUOTA_BYTES ?? defaultWorkspaceQuotaBytes);
const workspaceQuotaBytes = Number.isSafeInteger(configuredWorkspaceQuota)
  && configuredWorkspaceQuota >= 16 * 1024 * 1024
  && configuredWorkspaceQuota <= 1_099_511_627_776
  ? configuredWorkspaceQuota
  : defaultWorkspaceQuotaBytes;
const uploadKinds = new Set(['galleries', 'posts', 'covers', 'stills']);

const publicUrl = (managedPath: string) =>
  `${mediaOrigin}/media/${managedPath.split('/').map(encodeURIComponent).join('/')}`;

const route: APIRoute = async ({ request, locals, url }) => {
  if (!isTrustedOrigin(request.headers.get('origin'), url.origin)) return Response.json({ message: 'Request not allowed.' }, { status: 403 });
  if (Number(request.headers.get('content-length') ?? 0) > maxImageBytes + 64_000) {
    return Response.json({ message: 'Choose an image smaller than 15 MB.' }, { status: 413 });
  }

  const auth = locals.auth();
  if (!auth.userId) return Response.json({ message: 'Sign in again.' }, { status: 401 });
  const { client, workspaceId } = await resolveManagedStudio(auth.userId, locals.siteContext.workspaceId);
  if (!client || !workspaceId) return Response.json({ message: 'You do not have access to this studio.' }, { status: 403 });
  const storage = mediaStorage();

  if (request.method === 'DELETE') {
    const source = await request.json().catch(() => null);
    const managedPath = typeof source?.path === 'string' ? source.path : '';
    if (!isManagedUploadPath(workspaceId, managedPath)) return Response.json({ message: 'Invalid image path.' }, { status: 422 });
    const reference = await client.isWorkspaceUploadReferenced(workspaceId, managedPath);
    if (reference.error) return Response.json({ message: 'Image use could not be checked. Try again.' }, { status: 503 });
    if (reference.data) return Response.json({ ok: true, retained: true });
    try {
      await storage.remove(workspaceId, managedPath);
    } catch {
      return Response.json({ message: 'Image storage is temporarily unavailable.' }, { status: 503 });
    }
    const released = await client.releaseWorkspaceUpload(workspaceId, managedPath);
    if (released.error) return Response.json({ message: 'Image was removed, but storage accounting needs a retry.' }, { status: 503 });
    return Response.json({ ok: true });
  }

  if (request.method !== 'POST') return Response.json({ message: 'Method not allowed.' }, { status: 405 });
  await sweepOrphanedUploads(client, workspaceId, storage);
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const requestedKind = form?.get('kind');
  const kind = typeof requestedKind === 'string' && uploadKinds.has(requestedKind) ? requestedKind : 'galleries';
  const retain = form?.get('retain') === 'true';
  if (!(file instanceof File) || file.size < 1 || file.size > maxImageBytes) {
    return Response.json({ message: 'Choose a JPG, PNG, WebP, or AVIF image smaller than 15 MB.' }, { status: 422 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const extension = detectImageExtension(bytes);
  if (!extension) return Response.json({ message: 'That file is not a supported image.' }, { status: 422 });
  const optimized = await optimizeUploadedImage(bytes).catch((error: unknown) =>
    error instanceof ImageProcessingError ? null : Promise.reject(error));
  if (!optimized) {
    return Response.json({ message: 'That image is damaged or its dimensions are too large.' }, { status: 422 });
  }

  const managedPath = `${workspaceId}/${kind}/${crypto.randomUUID()}.webp`;
  if (!isManagedUploadPath(workspaceId, managedPath)) return Response.json({ message: 'Upload path could not be created.' }, { status: 500 });
  const claimed = await client.claimWorkspaceUpload(workspaceId, managedPath, optimized.bytes.byteLength, workspaceQuotaBytes);
  if (claimed.error) return Response.json({ message: 'Storage could not be reserved.' }, { status: 503 });
  if (!claimed.data.length) return Response.json({ message: 'This studio has reached its image storage limit. Contact Leon to add storage.' }, { status: 413 });
  try {
    await storage.write(workspaceId, managedPath, optimized.bytes);
  } catch {
    const released = await client.releaseWorkspaceUpload(workspaceId, managedPath);
    return Response.json({
      message: released.error
        ? 'Image storage failed and its quota reservation needs support.'
        : 'Image storage is temporarily unavailable.',
    }, { status: released.error ? 503 : 507 });
  }
  if (retain) {
    const originalFilename = file.name.trim().slice(0, 160) || 'image.webp';
    const retained = await client.from('workspace_uploads').update({
      original_filename: originalFilename,
      media_kind: kind,
      is_retained: true,
    }).eq('workspace_id', workspaceId).eq('storage_path', managedPath);
    if (retained.error || !retained.data.length) {
      await storage.remove(workspaceId, managedPath).catch(() => null);
      await client.releaseWorkspaceUpload(workspaceId, managedPath);
      return Response.json({ message: 'The image could not be added to your files.' }, { status: 503 });
    }
  }
  return Response.json({
    path: managedPath,
    publicUrl: publicUrl(managedPath),
    filename: file.name.trim().slice(0, 160) || 'image.webp',
    kind,
    size: optimized.bytes.byteLength,
  }, { status: 201 });
};

export const POST = route;
export const DELETE = route;
