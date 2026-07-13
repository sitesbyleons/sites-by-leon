import { createHash } from 'node:crypto';

import type { APIRoute } from 'astro';
import { isTrustedOrigin } from '@leon/platform-core/request-security';

import { createStudioDatabase } from '../../lib/database';
import { validateInquiry } from '../../lib/inquiry';

export const prerender = false;

export const POST: APIRoute = async ({ request, url }) => {
  if (!isTrustedOrigin(request.headers.get('origin'), url.origin)) return Response.json({ ok: false }, { status: 403 });
  if (Number(request.headers.get('content-length') ?? 0) > 24_000) return Response.json({ ok: false }, { status: 413 });

  const input = await request.json().catch(() => null);
  const validation = validateInquiry(input);
  if (!validation.ok) return Response.json({ ok: false, errors: validation.errors }, { status: 422 });

  const database = createStudioDatabase();
  const hashSalt = process.env.CONTACT_HASH_SALT;
  if (!database || !hashSalt) return Response.json({ ok: false }, { status: 503 });
  const workspace = await database
    .from('client_workspaces')
    .select<{ id: string; status: string }>('id,status')
    .eq('slug', validation.payload.workspaceSlug)
    .maybeSingle();
  if (!workspace.data || workspace.data.status === 'closed') return Response.json({ ok: false }, { status: 503 });

  const sourceIp = request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown';
  const ipHash = createHash('sha256').update(`${hashSalt}:${sourceIp}`).digest('hex');
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const recent = await database
    .from('studio_inquiries')
    .select('id')
    .eq('workspace_id', workspace.data.id)
    .eq('ip_hash', ipHash)
    .gte('created_at', since)
    .limit(5);
  if (recent.error) return Response.json({ ok: false }, { status: 503 });
  if (recent.data.length >= 5) return Response.json({ ok: false }, { status: 429 });

  const created = await database.from('studio_inquiries').insert({
    workspace_id: workspace.data.id,
    name: validation.payload.name,
    email: validation.payload.email || null,
    phone: validation.payload.phone || null,
    desired_date: validation.payload.desiredDate,
    message: validation.payload.message,
    ip_hash: ipHash,
  });
  return created.error
    ? Response.json({ ok: false }, { status: 503 })
    : Response.json({ ok: true });
};
