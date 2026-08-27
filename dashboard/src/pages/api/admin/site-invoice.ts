import type { APIRoute } from 'astro';
import Stripe from 'stripe';

import { checkAppAdmin } from '../../../lib/admin';
import { canSendAdminHostingInvoice, getCheckoutPlan } from '../../../lib/billing';
import { createPlatformDatabase } from '../../../lib/database';
import { isTrustedOrigin, resolveTrustedOrigin } from '../../../lib/request-security';

const MAX_BODY_BYTES = 8 * 1024;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const POST: APIRoute = async ({ request, locals, url }) => {
  if (!isTrustedOrigin(request.headers.get('origin'), url.origin)) {
    return Response.json({ message: 'This request could not be verified.' }, { status: 403 });
  }
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return Response.json({ message: 'The request is too large.' }, { status: 413 });
  }

  const auth = locals.auth();
  if (!auth.userId) return Response.json({ message: 'Sign in again.' }, { status: 401 });
  const database = createPlatformDatabase();
  const admin = await checkAppAdmin(database, auth.userId);
  if (!admin.isAdmin || !database) return Response.json({ message: 'Admin access required.' }, { status: 403 });

  const publicOrigin = resolveTrustedOrigin(request.headers.get('origin'), url.origin);
  if (!publicOrigin) return Response.json({ message: 'This request could not be verified.' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const workspaceId = typeof body?.workspace_id === 'string' ? body.workspace_id : '';
  const emailed = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!workspaceId || !emailPattern.test(emailed) || emailed.length > 254) {
    return Response.json({ message: 'Enter a valid billing email.' }, { status: 400 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return Response.json({ message: 'Checkout is not configured yet.' }, { status: 503 });

  const workspace = await database
    .from('client_workspaces')
    .select<{ id: string; name: string; status: string; stripe_customer_id: string | null }>('id,name,status,stripe_customer_id')
    .eq('id', workspaceId)
    .maybeSingle();
  const subscription = await database
    .from('subscriptions')
    .select<{ status: string }>('status')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  const project = await database
    .from('website_projects')
    .select<{ plan_key: string | null }>('plan_key')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (workspace.error || subscription.error || project.error) {
    return Response.json({ message: 'Billing status could not be verified. Try again.' }, { status: 503 });
  }
  if (!workspace.data) return Response.json({ message: 'Site not found.' }, { status: 404 });

  const requestedPlan = typeof body?.plan_key === 'string' ? getCheckoutPlan(body.plan_key) : null;
  const plan = requestedPlan ?? getCheckoutPlan(project.data?.plan_key ?? '');
  const priceId = plan ? process.env[plan.priceEnv] : null;
  if (!plan || !priceId) return Response.json({ message: 'Choose Essential or Studio before sending an invoice.' }, { status: 409 });
  if (!canSendAdminHostingInvoice({
    workspaceStatus: workspace.data.status,
    subscriptionStatus: subscription.data?.status ?? null,
    planKey: plan.key,
    billingEmail: emailed,
  })) {
    return Response.json({ message: 'This site cannot start another hosting invoice yet.' }, { status: 409 });
  }

  if (project.data?.plan_key !== plan.key) {
    const savedPlan = await database
      .from('website_projects')
      .update({ plan_key: plan.key })
      .eq('workspace_id', workspaceId);
    if (savedPlan.error) return Response.json({ message: 'The hosting plan could not be saved.' }, { status: 503 });
  }

  const savedEmail = await database
    .from('studio_settings')
    .update({ contact_email: emailed })
    .eq('workspace_id', workspaceId);
  if (savedEmail.error) return Response.json({ message: 'The billing email could not be saved.' }, { status: 503 });

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
    if (existing.data.checkout_url) return Response.json({ ok: true, url: existing.data.checkout_url, message: 'Invoice link is ready.' });
    return Response.json({ message: 'Checkout is already starting. Try again shortly.' }, { status: 409 });
  }

  try {
    const stripe = new Stripe(stripeKey);
    let customerId = workspace.data.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: workspace.data.name,
        email: emailed,
        metadata: { workspace_id: workspace.data.id, created_by: 'leon-admin' },
      }, { idempotencyKey: `workspace-customer:${workspace.data.id}` });
      customerId = customer.id;
      const saved = await database.from('client_workspaces').update({ stripe_customer_id: customerId }).eq('id', workspace.data.id);
      if (saved.error) return Response.json({ message: 'The billing customer could not be saved.' }, { status: 503 });
    } else {
      await stripe.customers.update(customerId, { email: emailed, name: workspace.data.name }).catch(() => null);
    }

    const checkout = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: workspace.data.id,
      consent_collection: { terms_of_service: 'required' },
      line_items: [{ price: priceId, quantity: 1 }],
      expires_at: Math.floor(checkoutExpiresAt.getTime() / 1000),
      success_url: `${publicOrigin}/admin/sites/${workspace.data.id}?invoice=success`,
      cancel_url: `${publicOrigin}/admin/sites/${workspace.data.id}?invoice=cancelled`,
      metadata: { workspace_id: workspace.data.id, plan_key: plan.key, created_by: 'leon-admin' },
      subscription_data: { metadata: { workspace_id: workspace.data.id, plan_key: plan.key } },
    }, { idempotencyKey: `admin-workspace-checkout:${attemptKey}` });
    if (!checkout.url) return Response.json({ message: 'Stripe did not return a Checkout URL.' }, { status: 502 });
    const saved = await database.from('checkout_attempts').update({
      stripe_session_id: checkout.id,
      checkout_url: checkout.url,
    }).eq('workspace_id', workspace.data.id).eq('attempt_key', attemptKey);
    if (saved.error || !saved.data.length) {
      await stripe.checkout.sessions.expire(checkout.id).catch(() => null);
      return Response.json({
        message: saved.error
          ? 'Checkout started but could not be synchronized. Retry the same plan.'
          : 'A newer checkout replaced this one. Retry to continue safely.',
      }, { status: saved.error ? 503 : 409 });
    }
    return Response.json({ ok: true, url: checkout.url, message: 'Invoice link created.' });
  } catch {
    return Response.json({ message: 'The invoice could not start. Nothing was charged.' }, { status: 502 });
  }
};
