import type { APIRoute } from 'astro';
import Stripe from 'stripe';

import { canManageBilling, canStartCheckout, getCheckoutPlan } from '../../../lib/billing';
import { createPlatformDatabase } from '../../../lib/database';
import { resolveTrustedOrigin } from '../../../lib/request-security';
import { resolveClientWorkspace } from '../../../lib/workspaces';

const testPriceEnvironment = {
  essential: 'STRIPE_TEST_PRICE_ESSENTIAL',
  studio: 'STRIPE_TEST_PRICE_STUDIO',
} as const;

export const POST: APIRoute = async ({ request, locals, url }) => {
  const publicOrigin = resolveTrustedOrigin(request.headers.get('origin'), url.origin);
  if (!publicOrigin || url.hostname !== 'test.leonsites.org') {
    return Response.json({ message: 'Test checkout is only available on the test site.' }, { status: 403 });
  }
  if (process.env.STRIPE_TEST_MODE_ENABLED !== 'true') {
    return Response.json({ message: 'Test checkout is not enabled.' }, { status: 503 });
  }

  const auth = locals.auth();
  if (!auth.userId) return auth.redirectToSignIn({ returnBackUrl: '/dashboard/billing' });
  const form = await request.formData();
  const plan = getCheckoutPlan(String(form.get('plan') ?? ''));
  if (!plan) return Response.json({ message: 'Choose a valid monthly plan.' }, { status: 400 });

  const stripeKey = process.env.STRIPE_TEST_SECRET_KEY;
  const priceId = process.env[testPriceEnvironment[plan.key]];
  const database = createPlatformDatabase();
  if (!database || !stripeKey || !priceId) {
    return Response.json({ message: 'Test checkout is not configured yet.' }, { status: 503 });
  }

  const resolved = await resolveClientWorkspace(database, { userId: auth.userId, orgId: auth.orgId ?? null });
  if (resolved.reason === 'database') return Response.json({ message: 'Billing status could not be verified. Try again.' }, { status: 503 });
  if (resolved.reason === 'ambiguous') return Response.json({ message: 'Activate the organization you want to test and try again.' }, { status: 409 });
  if (resolved.reason === 'not-found') return Response.json({ message: 'This client workspace is not ready yet.' }, { status: 404 });
  if (resolved.reason === 'forbidden' || !canManageBilling(resolved.role)) {
    return Response.json({ message: 'Only a workspace owner or admin can test billing.' }, { status: 403 });
  }

  const workspace = await database.from('client_workspaces')
    .select<{ id: string; name: string; status: string }>('id,name,status')
    .eq('id', resolved.workspace!.id)
    .maybeSingle();
  const subscription = await database.from('subscriptions')
    .select<{ status: string }>('status')
    .eq('workspace_id', resolved.workspace!.id)
    .maybeSingle();
  const project = await database.from('website_projects')
    .select<{ plan_key: string | null }>('plan_key')
    .eq('workspace_id', resolved.workspace!.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (workspace.error || subscription.error || project.error) {
    return Response.json({ message: 'Billing status could not be verified. Try again.' }, { status: 503 });
  }
  if (!workspace.data || !canStartCheckout({ userId: auth.userId, workspaceStatus: workspace.data.status, subscriptionStatus: subscription.data?.status ?? null })) {
    return Response.json({ message: 'This workspace cannot start a test subscription.' }, { status: 409 });
  }
  if (project.data?.plan_key !== plan.key) {
    return Response.json({ message: 'This is not the hosting plan assigned to your website.' }, { status: 409 });
  }

  try {
    const stripe = new Stripe(stripeKey);
    const customers = await stripe.customers.search({
      query: `metadata['workspace_id']:'${workspace.data.id}' AND metadata['environment']:'test'`,
      limit: 1,
    });
    const customer = customers.data[0] ?? await stripe.customers.create({
      name: workspace.data.name,
      metadata: { workspace_id: workspace.data.id, environment: 'test' },
    }, { idempotencyKey: `test-workspace-customer:${workspace.data.id}` });
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customer.id,
      client_reference_id: workspace.data.id,
      consent_collection: { terms_of_service: 'required' },
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${publicOrigin}/dashboard/billing?test_checkout=success`,
      cancel_url: `${publicOrigin}/dashboard/billing?test_checkout=cancelled`,
      metadata: { workspace_id: workspace.data.id, plan_key: plan.key, environment: 'test' },
      subscription_data: { metadata: { workspace_id: workspace.data.id, plan_key: plan.key, environment: 'test' } },
    });
    if (!session.url || session.livemode) throw new Error('Invalid test Checkout session.');
    return Response.json({ url: session.url });
  } catch {
    return Response.json({ message: 'Test checkout could not start. Nothing was charged.' }, { status: 502 });
  }
};
