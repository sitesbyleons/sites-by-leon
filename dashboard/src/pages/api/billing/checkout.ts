import type { APIRoute } from 'astro';
import Stripe from 'stripe';

import { canStartCheckout, getPlan } from '../../../lib/billing';
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

  const form = await request.formData();
  const plan = getPlan(String(form.get('plan') ?? ''));
  const priceId = plan ? process.env[plan.priceEnv] : null;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const database = createPlatformDatabase();
  if (!plan) return Response.json({ message: 'Choose a valid monthly plan.' }, { status: 400 });
  if (!database || !stripeKey || !priceId) return Response.json({ message: 'Checkout is not configured yet.' }, { status: 503 });

  const resolved = await resolveClientWorkspace(database, { userId: auth.userId, orgId: auth.orgId ?? null });
  if (!resolved.workspace) return Response.json({ message: 'This client workspace is not ready yet.' }, { status: 404 });
  const workspace = await database
    .from('client_workspaces')
    .select<{ id: string; name: string; status: string; stripe_customer_id: string | null }>('id,name,status,stripe_customer_id')
    .eq('id', resolved.workspace.id)
    .maybeSingle();
  const subscription = await database
    .from('subscriptions')
    .select<{ status: string }>('status')
    .eq('workspace_id', resolved.workspace.id)
    .maybeSingle();
  if (!workspace.data || !canStartCheckout({ userId: auth.userId, workspaceStatus: workspace.data.status, subscriptionStatus: subscription.data?.status ?? null })) {
    return Response.json({ message: 'This workspace cannot start another subscription.' }, { status: 409 });
  }

  try {
    const stripe = new Stripe(stripeKey);
    let customerId = workspace.data.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: workspace.data.name,
        metadata: { workspace_id: workspace.data.id, clerk_user_id: auth.userId },
      });
      customerId = customer.id;
      const saved = await database.from('client_workspaces').update({ stripe_customer_id: customerId }).eq('id', workspace.data.id);
      if (saved.error) return Response.json({ message: 'The billing customer could not be saved.' }, { status: 503 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: workspace.data.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${publicOrigin}/dashboard?checkout=success`,
      cancel_url: `${publicOrigin}/dashboard?checkout=cancelled`,
      metadata: { workspace_id: workspace.data.id, plan_key: plan.key },
      subscription_data: { metadata: { workspace_id: workspace.data.id, plan_key: plan.key } },
    });
    return session.url
      ? Response.redirect(session.url, 303)
      : Response.json({ message: 'Stripe did not return a Checkout URL.' }, { status: 502 });
  } catch {
    return Response.json({ message: 'Checkout could not start. Nothing was charged.' }, { status: 502 });
  }
};
