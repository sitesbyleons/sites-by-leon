import type { APIRoute } from 'astro';
import Stripe from 'stripe';

import { canManageBilling } from '../../../lib/billing';
import { createPlatformDatabase } from '../../../lib/database';
import { resolveTrustedOrigin } from '../../../lib/request-security';
import { resolveClientWorkspace } from '../../../lib/workspaces';

export const POST: APIRoute = async ({ request, locals, url }) => {
  const publicOrigin = resolveTrustedOrigin(request.headers.get('origin'), url.origin);
  if (!publicOrigin) {
    return Response.json({ message: 'This request could not be verified.' }, { status: 403 });
  }
  const auth = locals.auth();
  if (!auth.userId) return auth.redirectToSignIn({ returnBackUrl: '/dashboard' });
  const database = createPlatformDatabase();
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const portalConfiguration = process.env.STRIPE_BILLING_PORTAL_CONFIGURATION;
  if (!database || !stripeKey || !portalConfiguration) {
    return Response.json({ message: 'Billing management is not configured yet.' }, { status: 503 });
  }

  const resolved = await resolveClientWorkspace(database, { userId: auth.userId, orgId: auth.orgId ?? null });
  if (resolved.reason === 'database') return Response.json({ message: 'Billing status could not be verified. Try again.' }, { status: 503 });
  if (resolved.reason === 'ambiguous') return Response.json({ message: 'Activate the organization you want to bill and try again.' }, { status: 409 });
  if (resolved.reason === 'not-found') return Response.json({ message: 'No client workspace is connected to this account.' }, { status: 404 });
  if (resolved.reason === 'forbidden' || !canManageBilling(resolved.role)) {
    return Response.json({ message: 'Only a workspace owner or admin can manage billing.' }, { status: 403 });
  }
  const workspace = resolved.workspace
    ? await database.from('client_workspaces').select<{ stripe_customer_id: string | null }>('stripe_customer_id').eq('id', resolved.workspace.id).maybeSingle()
    : { data: null, error: null };
  if (!workspace.data?.stripe_customer_id) return Response.json({ message: 'No billing customer is connected to this workspace.' }, { status: 404 });

  try {
    const stripe = new Stripe(stripeKey);
    const session = await stripe.billingPortal.sessions.create({
      customer: workspace.data.stripe_customer_id,
      configuration: portalConfiguration,
      return_url: `${publicOrigin}/dashboard`,
    });
    return Response.redirect(session.url, 303);
  } catch {
    return Response.json({ message: 'Billing could not open. Your plan was not changed.' }, { status: 502 });
  }
};
