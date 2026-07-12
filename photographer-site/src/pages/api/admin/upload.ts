
import type { APIRoute } from 'astro';

import { createStudioClient } from '../../../lib/studio';

export const prerender = false;

const allowedTypes: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

const route: APIRoute = async ({ request, locals, url }) => {
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return Response.json({ message: 'Request not allowed.' }, { status: 403 });
  if (Number(request.headers.get('content-length') ?? 0) > 8_000) return Response.json({ message: 'Request is too large.' }, { status: 413 });
  const auth = locals.auth();
  if (!auth.userId) return Response.json({ message: 'Sign in again.' }, { status: 401 });
  const client = createStudioClient(async () => (await auth.getToken()) ?? null);
  if (!client) return Response.json({ message: 'Studio storage is not configured.' }, { status: 503 });
  const workspace = await client.from('client_workspaces').select('id').eq('slug', import.meta.env.SITE_WORKSPACE_SLUG ?? 'northline').maybeSingle<{ id: string }>();
  if (!workspace.data) return Response.json({ message: 'You do not have access to this studio.' }, { status: 403 });

  let source: Record<string, unknown>;
  try { source = await request.json(); } catch { return Response.json({ message: 'Invalid request.' }, { status: 400 }); }
  const workspaceId = workspace.data.id;

  if (request.method === 'DELETE') {
    const path = typeof source.path === 'string' ? source.path : '';
    if (!path.startsWith(workspaceId + '/')) return Response.json({ message: 'Invalid image path.' }, { status: 422 });
    const removed = await client.storage.from('portfolio-images').remove([path]);
    return removed.error ? Response.json({ message: 'Image could not be removed.' }, { status: 400 }) : Response.json({ ok: true });
  }

  if (request.method !== 'POST') return Response.json({ message: 'Method not allowed.' }, { status: 405 });
  const mime = typeof source.mime === 'string' ? source.mime : '';
  const size = Number(source.size);
  const kind = typeof source.kind === 'string' && ['galleries', 'posts', 'covers'].includes(source.kind) ? source.kind : 'images';
  const extension = allowedTypes[mime];
  if (!extension || !Number.isFinite(size) || size <= 0 || size > 15 * 1024 * 1024) return Response.json({ message: 'Choose a JPG, PNG, WebP, or AVIF image smaller than 15 MB.' }, { status: 422 });
  const path = workspaceId + '/' + kind + '/' + crypto.randomUUID() + '.' + extension;
  const signed = await client.storage.from('portfolio-images').createSignedUploadUrl(path);
  if (signed.error || !signed.data) return Response.json({ message: 'Upload could not be started.' }, { status: 400 });
  const publicUrl = client.storage.from('portfolio-images').getPublicUrl(path).data.publicUrl;
  return Response.json({ path, token: signed.data.token, publicUrl });
};

export const POST = route;
export const DELETE = route;
