import type { APIRoute } from 'astro';
import Stripe from 'stripe';

import { createPlatformDatabase } from '../../../lib/database';

const subscriptionEvents = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);
const subscriptionStatuses = new Set([
  'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused',
]);
const planKeys = new Set(['essential', 'studio', 'signature']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const POST: APIRoute = async ({ request }) => {
  const database = createPlatformDatabase();
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get('stripe-signature');
  if (!database || !stripeKey || !webhookSecret || !signature) {
    return Response.json({ message: 'Webhook verification is not configured.' }, { status: 503 });
  }

  const stripe = new Stripe(stripeKey);
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await request.text(), signature, webhookSecret);
  } catch {
    return Response.json({ message: 'Invalid Stripe signature.' }, { status: 400 });
  }

  const claim = await database.claimStripeEvent(event.id, event.type);
  if (claim.error) return Response.json({ message: 'Webhook event could not be claimed.' }, { status: 503 });
  if (!claim.data.length) {
    const existing = await database.from('stripe_events').select('status').eq('event_id', event.id).maybeSingle<{ status: string }>();
    if (existing.error) return Response.json({ message: 'Webhook event status could not be checked.' }, { status: 503 });
    return existing.data?.status === 'processed'
      ? Response.json({ received: true, duplicate: true })
      : Response.json({ message: 'Webhook event is already being processed.' }, { status: 409 });
  }

  const acknowledgeIgnored = async (reason: string) => {
    const ignored = await database.from('stripe_events').update({
      status: 'processed',
      processed_at: new Date().toISOString(),
      last_error: reason,
    }).eq('event_id', event.id);
    if (ignored.error) throw new Error(ignored.error.message);
    return Response.json({ received: true, ignored: true });
  };

  try {
    let subscriptionId: string | null = null;
    let completedSessionId: string | null = null;
    if (subscriptionEvents.has(event.type)) {
      subscriptionId = (event.data.object as Stripe.Subscription).id;
    } else if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      completedSessionId = session.id;
      subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;
    }

    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const item = subscription.items.data[0];
      const workspaceId = subscription.metadata.workspace_id;
      const planKey = subscription.metadata.plan_key;
      const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
      if (!item || !uuidPattern.test(workspaceId) || !planKeys.has(planKey) || !subscriptionStatuses.has(subscription.status)) {
        return await acknowledgeIgnored('Ignored a Stripe subscription without recognized Sites by Leon metadata.');
      }
      const knownWorkspace = await database.from('client_workspaces')
        .select('id')
        .eq('id', workspaceId)
        .maybeSingle<{ id: string }>();
      if (knownWorkspace.error) throw new Error(knownWorkspace.error.message);
      if (!knownWorkspace.data) return await acknowledgeIgnored('Ignored a Stripe subscription for an unknown workspace.');
      const synchronized = await database.syncSubscription({
        workspace_id: workspaceId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        stripe_price_id: item.price.id,
        plan_key: planKey,
        status: subscription.status,
        current_period_end: new Date(item.current_period_end * 1000).toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end,
      });
      if (synchronized.error) throw new Error(synchronized.error.message);
      if (!synchronized.data.length) {
        const duplicateActive = !['canceled', 'incomplete_expired'].includes(subscription.status);
        let duplicateRefunded = false;
        if (duplicateActive) {
          const latestInvoiceId = typeof subscription.latest_invoice === 'string'
            ? subscription.latest_invoice
            : subscription.latest_invoice?.id ?? null;
          if (latestInvoiceId) {
            const payments = await stripe.invoicePayments.list({ invoice: latestInvoiceId, status: 'paid', limit: 10 });
            const payment = payments.data.find((item) => item.status === 'paid');
            const paymentIntent = payment?.payment.payment_intent;
            const charge = payment?.payment.charge;
            const paymentIntentId = typeof paymentIntent === 'string' ? paymentIntent : paymentIntent?.id;
            const chargeId = typeof charge === 'string' ? charge : charge?.id;
            if (paymentIntentId || chargeId) {
              await stripe.refunds.create({
                ...(paymentIntentId ? { payment_intent: paymentIntentId } : { charge: chargeId! }),
                reason: 'duplicate',
                metadata: { duplicate_subscription_id: subscription.id, workspace_id: workspaceId },
              }, { idempotencyKey: `duplicate-subscription-refund:${subscription.id}` });
              duplicateRefunded = true;
            }
          }
          await stripe.subscriptions.cancel(subscription.id, { invoice_now: false, prorate: false });
        }
        await database.from('stripe_events').update({
          status: 'processed',
          processed_at: new Date().toISOString(),
          last_error: duplicateActive
            ? duplicateRefunded
              ? 'A duplicate active subscription was refunded and canceled automatically.'
              : 'A duplicate active subscription was canceled; no refundable payment was found.'
            : null,
        }).eq('event_id', event.id);
        return Response.json({ received: true, stale: true, duplicate_canceled: duplicateActive, duplicate_refunded: duplicateRefunded });
      }
      if (event.type === 'checkout.session.completed' && completedSessionId) {
        const clearedAttempt = await database.from('checkout_attempts').delete()
          .eq('workspace_id', workspaceId)
          .eq('stripe_session_id', completedSessionId);
        if (clearedAttempt.error) throw new Error(clearedAttempt.error.message);
      }

      const workspaceStatus = ['active', 'trialing'].includes(subscription.status)
        ? 'active'
        : ['canceled', 'incomplete_expired'].includes(subscription.status) ? 'approved' : null;
      if (workspaceStatus) {
        const workspace = await database.from('client_workspaces').update({
          status: workspaceStatus,
          stripe_customer_id: customerId,
        }).eq('id', workspaceId);
        if (workspace.error) throw new Error(workspace.error.message);
      }
    }

    await database.from('stripe_events').update({
      status: 'processed',
      processed_at: new Date().toISOString(),
      last_error: null,
    }).eq('event_id', event.id);
    return Response.json({ received: true });
  } catch {
    await database.from('stripe_events').update({
      status: 'failed',
      last_error: 'Webhook processing failed and will be retried.',
      last_attempt_at: new Date().toISOString(),
    }).eq('event_id', event.id);
    return Response.json({ message: 'Webhook processing failed and will be retried.' }, { status: 500 });
  }
};
