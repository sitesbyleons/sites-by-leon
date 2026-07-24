import type { APIRoute } from 'astro';
import Stripe from 'stripe';

import { canManageBilling, canStartCheckout, getPlan } from '../../../lib/billing';
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
  if (resolved.reason === 'database') return Response.json({ message: 'Billing status could not be verified. Try again.' }, { status: 503 });
  if (resolved.reason === 'ambiguous') return Response.json({ message: 'Activate the organization you want to bill and try again.' }, { status: 409 });
  if (resolved.reason === 'not-found') return Response.json({ message: 'This client workspace is not ready yet.' }, { status: 404 });
  if (resolved.reason === 'forbidden' || !canManageBilling(resolved.role)) {
    return Response.json({ message: 'Only a workspace owner or admin can manage billing.' }, { status: 403 });
  }
  if (!resolved.workspace) return Response.json({ message: 'Billing status could not be verified. Try again.' }, { status: 503 });
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
  if (workspace.error || subscription.error) return Response.json({ message: 'Billing status could not be verified. Try again.' }, { status: 503 });
  if (!workspace.data || !canStartCheckout({ userId: auth.userId, workspaceStatus: workspace.data.status, subscriptionStatus: subscription.data?.status ?? null })) {
    return Response.json({ message: 'This workspace cannot start another subscription.' }, { status: 409 });
  }

  const attemptKey = crypto.randomUUID();
  const checkoutExpiresAt = new Date(Date.now() + 35 * 60 * 1000);
  const claimed = await database.claimCheckoutAttempt({
    workspace_id: workspace.data.id,
    attempt_key: attemptKey,
    plan_key: plan.key,
    expires_at: checkoutExpiresAt.toISOString(),
  });
  if (claimed.error) return Response.json({ message: 'Checkout could not be reserved.' }, { status: 503 });
  if (!claimed.data.length) {
    const existing = await database.from('checkout_attempts')
      .select('attempt_key,plan_key,checkout_url')
      .eq('workspace_id', workspace.data.id)
      .maybeSingle<{ attempt_key: string; plan_key: string; checkout_url: string | null }>();
    if (existing.error || !existing.data) return Response.json({ message: 'Checkout is already starting. Try again shortly.' }, { status: 409 });
    if (existing.data.plan_key !== plan.key) return Response.json({ message: 'Another plan checkout is already open. Finish it or wait for it to expire.' }, { status: 409 });
    if (existing.data.checkout_url) return Response.redirect(existing.data.checkout_url, 303);
    return Response.json({ message: 'Checkout is already starting. Try again shortly.' }, { status: 409 });
  }

  try {
    const stripe = new Stripe(stripeKey);
    let customerId = workspace.data.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: workspace.data.name,
        metadata: { workspace_id: workspace.data.id, clerk_user_id: auth.userId },
      }, { idempotencyKey: `workspace-customer:${workspace.data.id}` });
      customerId = customer.id;
      const saved = await database.from('client_workspaces').update({ stripe_customer_id: customerId }).eq('id', workspace.data.id);
      if (saved.error) return Response.json({ message: 'The billing customer could not be saved.' }, { status: 503 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: workspace.data.id,
      consent_collection: { terms_of_service: 'required' },
      line_items: [{ price: priceId, quantity: 1 }],
      expires_at: Math.floor(checkoutExpiresAt.getTime() / 1000),
      success_url: `${publicOrigin}/dashboard?checkout=success`,
      cancel_url: `${publicOrigin}/dashboard?checkout=cancelled`,
      metadata: { workspace_id: workspace.data.id, plan_key: plan.key },
      subscription_data: { metadata: { workspace_id: workspace.data.id, plan_key: plan.key } },
    }, { idempotencyKey: `workspace-checkout:${attemptKey}` });
    if (!session.url) return Response.json({ message: 'Stripe did not return a Checkout URL.' }, { status: 502 });
    const saved = await database.from('checkout_attempts').update({
      stripe_session_id: session.id,
      checkout_url: session.url,
    }).eq('workspace_id', workspace.data.id).eq('attempt_key', attemptKey);
    if (saved.error || !saved.data.length) {
      await stripe.checkout.sessions.expire(session.id).catch(() => null);
      return Response.json({
        message: saved.error
          ? 'Checkout started but could not be synchronized. Retry the same plan.'
          : 'A newer checkout replaced this one. Retry to continue safely.',
      }, { status: saved.error ? 503 : 409 });
    }
    return Response.redirect(session.url, 303);
  } catch {
    return Response.json({ message: 'Checkout could not start. Nothing was charged.' }, { status: 502 });
  }
};
