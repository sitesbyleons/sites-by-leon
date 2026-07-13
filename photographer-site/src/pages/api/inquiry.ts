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
  const workspaceSlug = process.env.SITE_WORKSPACE_SLUG ?? 'northline';
  if (validation.payload.workspaceSlug !== workspaceSlug) return Response.json({ ok: false }, { status: 422 });

  const database = createStudioDatabase();
  const hashSalt = process.env.CONTACT_HASH_SALT;
  if (!database || !hashSalt) return Response.json({ ok: false }, { status: 503 });
  const workspace = await database
    .from('client_workspaces')
    .select<{ id: string; status: string }>('id,status')
    .eq('slug', workspaceSlug)
    .maybeSingle();
  if (!workspace.data || workspace.data.status === 'closed') return Response.json({ ok: false }, { status: 503 });

  const sourceIp = request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown';
  const ipHash = createHash('sha256').update(`${hashSalt}:${sourceIp}`).digest('hex');
  const created = await database.createRateLimitedInquiry({
    workspace_id: workspace.data.id,
    name: validation.payload.name,
    email: validation.payload.email || null,
    phone: validation.payload.phone || null,
    desired_date: validation.payload.desiredDate,
    message: validation.payload.message,
    ip_hash: ipHash,
  });
  if (created.error) return Response.json({ ok: false }, { status: 503 });
  return created.data.length
    ? Response.json({ ok: true })
    : Response.json({ ok: false }, { status: 429 });
};
