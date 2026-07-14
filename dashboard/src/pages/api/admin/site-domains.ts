import type { APIRoute } from 'astro';

import { createPostgresHostingQueryExecutor } from '@leon/platform-core/hosting-access';
import {
  normalizeCustomDomainHostname,
  queueDomainRefresh,
  queueDomainRemoval,
  requestCustomDomain,
} from '@leon/platform-core/site-domains';

import { checkAppAdmin } from '../../../lib/admin';
import { createPlatformDatabase } from '../../../lib/database';
import { isTrustedOrigin } from '../../../lib/request-security';

export const POST: APIRoute = async ({ request, locals, url }) => {
  if (!isTrustedOrigin(request.headers.get('origin'), url.origin)) {
    return Response.json({ message: 'This request could not be verified.' }, { status: 403 });
  }
  const auth = locals.auth();
  if (!auth.userId) return Response.json({ message: 'Sign in again.' }, { status: 401 });
  const database = createPlatformDatabase();
  const admin = await checkAppAdmin(database, auth.userId);
  if (!admin.isAdmin) return Response.json({ message: 'Admin access required.' }, { status: 403 });
  if (process.env.CUSTOM_DOMAIN_AUTOMATION_ENABLED !== 'true') {
    return Response.json({
      message: 'Custom domains are ready, but Cloudflare for SaaS must be enabled before the first domain can be added.',
    }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const action = typeof body?.action === 'string' ? body.action : '';
  const workspaceId = typeof body?.workspace_id === 'string' ? body.workspace_id : '';
  const executor = createPostgresHostingQueryExecutor(process.env.DATABASE_URL);
  if (!workspaceId || !executor) return Response.json({ message: 'Custom-domain setup is not configured.' }, { status: 503 });

  let result;
  if (action === 'create') {
    const suppliedHostname = typeof body?.hostname === 'string' ? body.hostname : '';
    let hostname: string;
    try {
      hostname = normalizeCustomDomainHostname(suppliedHostname);
    } catch {
      return Response.json({ message: 'Enter a valid custom domain, such as www.clientdomain.com.' }, { status: 400 });
    }
    if (!hostname.startsWith('www.')) {
      return Response.json({ message: 'Use the www address so the client’s email records stay safe.' }, { status: 400 });
    }
    result = await requestCustomDomain(executor, {
      workspace_id: workspaceId,
      hostname,
      actor: auth.userId,
      idempotency_key: crypto.randomUUID(),
      dns_target: 'customers.leonsites.org',
    });
  } else if (action === 'refresh' || action === 'remove') {
    const domainId = typeof body?.domain_id === 'string' ? body.domain_id : '';
    if (!domainId) return Response.json({ message: 'Choose a custom domain.' }, { status: 400 });
    const input = { workspace_id: workspaceId, domain_id: domainId, idempotency_key: crypto.randomUUID() };
    result = action === 'refresh'
      ? await queueDomainRefresh(executor, input)
      : await queueDomainRemoval(executor, input);
  } else {
    return Response.json({ message: 'Choose a valid custom-domain action.' }, { status: 400 });
  }

  if (result.error || !result.data) {
    return Response.json({ message: result.error?.message ?? 'The custom domain was not updated.' }, { status: 500 });
  }
  if (['missing_site', 'missing_domain'].includes(result.data.outcome)) {
    return Response.json({ message: 'Site or custom domain not found.' }, { status: 404 });
  }
  if (result.data.outcome === 'archived') {
    return Response.json({ message: 'Restore the site before adding a domain.' }, { status: 409 });
  }
  if (['hostname_conflict', 'idempotency_conflict'].includes(result.data.outcome)) {
    return Response.json({ message: 'That domain is already connected to another site.' }, { status: 409 });
  }
  if (result.data.outcome === 'already_exists') {
    return Response.json({ message: 'That domain is already listed on this site.' }, { status: 409 });
  }
  if (result.data.outcome === 'not_refreshable') {
    return Response.json({ message: 'That domain is already being removed.' }, { status: 409 });
  }
  if (result.data.outcome === 'already_removing') {
    return Response.json({ message: 'That domain is already being removed.' }, { status: 409 });
  }
  return Response.json({
    ok: true,
    message: action === 'create'
      ? 'Domain added. Put the CNAME record into Namecheap.'
      : action === 'refresh' ? 'Connection check queued.' : 'Domain removal queued.',
  });
};
