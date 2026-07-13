import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { detectImageExtension, resolveManagedUpload } from '@leon/platform-core/image-storage';
import { isTrustedOrigin } from '@leon/platform-core/request-security';
import type { APIRoute } from 'astro';

import { resolveManagedStudio } from '../../../lib/studio';

export const prerender = false;

const uploadRoot = process.env.UPLOAD_ROOT ?? '/data/uploads';
const mediaOrigin = (process.env.PUBLIC_MEDIA_URL ?? 'https://api.leonsites.org').replace(/\/$/, '');
const maxImageBytes = 15 * 1024 * 1024;
const uploadKinds = new Set(['galleries', 'posts', 'covers']);

const publicUrl = (managedPath: string) =>
  `${mediaOrigin}/media/${managedPath.split('/').map(encodeURIComponent).join('/')}`;

const route: APIRoute = async ({ request, locals, url }) => {
  if (!isTrustedOrigin(request.headers.get('origin'), url.origin)) return Response.json({ message: 'Request not allowed.' }, { status: 403 });
  if (Number(request.headers.get('content-length') ?? 0) > maxImageBytes + 64_000) {
    return Response.json({ message: 'Choose an image smaller than 15 MB.' }, { status: 413 });
  }

  const auth = locals.auth();
  if (!auth.userId) return Response.json({ message: 'Sign in again.' }, { status: 401 });
  const { workspaceId } = await resolveManagedStudio(auth.userId);
  if (!workspaceId) return Response.json({ message: 'You do not have access to this studio.' }, { status: 403 });

  if (request.method === 'DELETE') {
    const source = await request.json().catch(() => null);
    const managedPath = typeof source?.path === 'string' ? source.path : '';
    const absolute = resolveManagedUpload(uploadRoot, workspaceId, managedPath);
    if (!absolute) return Response.json({ message: 'Invalid image path.' }, { status: 422 });
    await unlink(absolute).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
    return Response.json({ ok: true });
  }

  if (request.method !== 'POST') return Response.json({ message: 'Method not allowed.' }, { status: 405 });
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const requestedKind = form?.get('kind');
  const kind = typeof requestedKind === 'string' && uploadKinds.has(requestedKind) ? requestedKind : 'galleries';
  if (!(file instanceof File) || file.size < 1 || file.size > maxImageBytes) {
    return Response.json({ message: 'Choose a JPG, PNG, WebP, or AVIF image smaller than 15 MB.' }, { status: 422 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const extension = detectImageExtension(bytes);
  if (!extension) return Response.json({ message: 'That file is not a supported image.' }, { status: 422 });

  const managedPath = `${workspaceId}/${kind}/${crypto.randomUUID()}.${extension}`;
  const absolute = resolveManagedUpload(uploadRoot, workspaceId, managedPath);
  if (!absolute) return Response.json({ message: 'Upload path could not be created.' }, { status: 500 });
  await mkdir(path.dirname(absolute), { recursive: true, mode: 0o750 });
  await writeFile(absolute, bytes, { flag: 'wx', mode: 0o640 });
  return Response.json({ path: managedPath, publicUrl: publicUrl(managedPath) }, { status: 201 });
};

export const POST = route;
export const DELETE = route;
