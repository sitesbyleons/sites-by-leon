import { isTrustedOrigin } from '@leon/platform-core/request-security';
import type { APIRoute } from 'astro';

import { parseDomainOptions } from '../../../lib/hosting';
import { resolveManagedStudio } from '../../../lib/studio';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, url }) => {
  if (!isTrustedOrigin(request.headers.get('origin'), url.origin)) {
    return Response.json({ message: 'Request not allowed.' }, { status: 403 });
  }
  if (Number(request.headers.get('content-length') ?? 0) > 4_000) {
    return Response.json({ message: 'Request is too large.' }, { status: 413 });
  }

  const auth = locals.auth();
  if (!auth.userId) return Response.json({ message: 'Sign in again.' }, { status: 401 });
  const { client, workspaceId } = await resolveManagedStudio(auth.userId, locals.siteContext.workspaceId);
  if (!client || !workspaceId) return Response.json({ message: 'Studio owner access required.' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const chosen = typeof body?.chosen_domain === 'string' ? body.chosen_domain.trim().toLowerCase() : '';
  const project = await client
    .from('website_projects')
    .select('domain_options')
    .eq('workspace_id', workspaceId)
    .maybeSingle<{ domain_options: string | null }>();
  if (project.error) return Response.json({ message: 'Domain options could not be loaded.' }, { status: 503 });
  const options = parseDomainOptions(project.data?.domain_options);
  if (!options.length) return Response.json({ message: 'Leon has not sent domain choices yet.' }, { status: 409 });
  if (!options.includes(chosen)) return Response.json({ message: 'Choose one of the domains Leon sent.' }, { status: 400 });

  const saved = await client
    .from('website_projects')
    .update({ chosen_domain: chosen })
    .eq('workspace_id', workspaceId);
  if (saved.error || !saved.data.length) {
    return Response.json({ message: 'The domain choice could not be saved.' }, { status: 500 });
  }
  return Response.json({ ok: true, message: 'Domain choice saved.' });
};
