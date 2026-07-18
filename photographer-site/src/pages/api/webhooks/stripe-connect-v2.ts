import type { APIRoute } from 'astro';
import Stripe from 'stripe';

import { markStripeEvent } from '@leon/platform-core/stripe-events';
import { createStudioDatabase } from '../../../lib/database';
import { connectAccountIncludes, connectAccountStatus } from '../../../lib/stripe-connect';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const database = createStudioDatabase();
  const stripeKey = process.env.STRIPE_CONNECT_SECRET_KEY ?? process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_CONNECT_V2_WEBHOOK_SECRET;
  const signature = request.headers.get('stripe-signature');
  if (!database || !stripeKey || !webhookSecret || !signature) {
    return Response.json({ message: 'Webhook verification is not configured.' }, { status: 503 });
  }

  const stripe = new Stripe(stripeKey);
  let event: Stripe.V2.Core.EventNotification;
  try {
    event = await stripe.parseEventNotificationAsync(await request.text(), signature, webhookSecret);
  } catch {
    return Response.json({ message: 'Invalid Stripe signature.' }, { status: 400 });
  }

  const claim = await database.claimStripeEvent(event.id, `connect-v2:${event.type}`);
  if (claim.error) return Response.json({ message: 'Webhook event could not be claimed.' }, { status: 503 });
  if (!claim.data.length) {
    const existing = await database.from('stripe_events').select('status').eq('event_id', event.id).maybeSingle<{ status: string }>();
    if (existing.error) return Response.json({ message: 'Webhook event status could not be checked.' }, { status: 503 });
    return existing.data?.status === 'processed'
      ? Response.json({ received: true, duplicate: true })
      : Response.json({ message: 'Webhook event is already being processed.' }, { status: 409 });
  }

  try {
    if (event.type.startsWith('v2.core.account')
      && event.type !== 'v2.core.account_link.returned'
      && 'fetchRelatedObject' in event
      && typeof event.fetchRelatedObject === 'function') {
      const related = await event.fetchRelatedObject() as Stripe.V2.Core.Account;
      if (!related?.id) throw new Error('Stripe account event has no account.');
      const connection = await database.resolveWorkspaceForStripeAccount(related.id);
      if (connection.error) throw new Error(connection.error.message);
      if (connection.data?.is_current) {
        const account = await stripe.v2.core.accounts.retrieve(related.id, { include: connectAccountIncludes });
        const synchronized = await database.from('connected_payment_accounts')
          .update(connectAccountStatus(account))
          .eq('workspace_id', connection.data.workspace_id)
          .eq('stripe_account_id', account.id);
        if (synchronized.error) throw new Error(synchronized.error.message);
      }
    }

    await markStripeEvent(database, event.id, {
      status: 'processed',
      lastError: null,
    });
    return Response.json({ received: true });
  } catch {
    await markStripeEvent(database, event.id, {
      status: 'failed',
      lastError: 'Accounts v2 webhook processing failed and will be retried.',
    }).catch(() => undefined);
    return Response.json({ message: 'Webhook processing failed and will be retried.' }, { status: 500 });
  }
};
