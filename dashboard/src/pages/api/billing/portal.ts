import type { APIRoute } from 'astro';
import Stripe from 'stripe';

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
  if (!database || !stripeKey) return Response.json({ message: 'Billing management is not configured yet.' }, { status: 503 });

  const resolved = await resolveClientWorkspace(database, { userId: auth.userId, orgId: auth.orgId ?? null });
  const workspace = resolved.workspace
    ? await database.from('client_workspaces').select<{ stripe_customer_id: string | null }>('stripe_customer_id').eq('id', resolved.workspace.id).maybeSingle()
    : { data: null, error: null };
  if (!workspace.data?.stripe_customer_id) return Response.json({ message: 'No billing customer is connected to this workspace.' }, { status: 404 });

  try {
    const stripe = new Stripe(stripeKey);
    const session = await stripe.billingPortal.sessions.create({
      customer: workspace.data.stripe_customer_id,
      return_url: `${publicOrigin}/dashboard`,
    });
    return Response.redirect(session.url, 303);
  } catch {
    return Response.json({ message: 'Billing could not open. Your plan was not changed.' }, { status: 502 });
  }
};
