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

const duplicateEvent = (message: string) => /duplicate key|unique constraint|stripe_events_pkey/i.test(message);

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

  const claim = await database.from('stripe_events').insert({
    event_id: event.id,
    event_type: event.type,
    status: 'processing',
  });
  if (claim.error) {
    return duplicateEvent(claim.error.message)
      ? Response.json({ received: true, duplicate: true })
      : Response.json({ message: 'Webhook event could not be claimed.' }, { status: 503 });
  }

  try {
    let subscriptionId: string | null = null;
    if (subscriptionEvents.has(event.type)) {
      subscriptionId = (event.data.object as Stripe.Subscription).id;
    } else if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;
    }

    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const item = subscription.items.data[0];
      const workspaceId = subscription.metadata.workspace_id;
      const planKey = subscription.metadata.plan_key;
      const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
      if (!item || !workspaceId || !planKeys.has(planKey) || !subscriptionStatuses.has(subscription.status)) {
        throw new Error('Subscription metadata is incomplete.');
      }
      const synchronized = await database.from('subscriptions').upsert({
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
    await database.from('stripe_events').delete().eq('event_id', event.id);
    return Response.json({ message: 'Webhook processing failed and will be retried.' }, { status: 500 });
  }
};
