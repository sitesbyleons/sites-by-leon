import type { APIRoute } from 'astro';
import Stripe from 'stripe';

import { createStudioDatabase } from '../../../lib/database';

const duplicateEvent = (message: string) => /duplicate key|unique constraint|stripe_events_pkey/i.test(message);

export const POST: APIRoute = async ({ request }) => {
  const database = createStudioDatabase();
  const stripeKey = process.env.STRIPE_CONNECT_SECRET_KEY ?? process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
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
    event_type: `connect:${event.type}`,
    status: 'processing',
  });
  if (claim.error) {
    return duplicateEvent(claim.error.message)
      ? Response.json({ received: true, duplicate: true })
      : Response.json({ message: 'Webhook event could not be claimed.' }, { status: 503 });
  }

  try {
    const connectedAccountId = typeof event.account === 'string' ? event.account : null;
    if (event.type === 'account.updated') {
      const account = event.data.object as Stripe.Account;
      const status = account.charges_enabled && account.payouts_enabled
        ? 'enabled'
        : account.details_submitted ? 'restricted' : 'pending';
      const synchronized = await database.from('connected_payment_accounts').update({
        onboarding_status: status,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
      }).eq('stripe_account_id', account.id);
      if (synchronized.error) throw new Error(synchronized.error.message);
    } else if (event.type === 'account.application.deauthorized' && connectedAccountId) {
      const disabled = await database.from('connected_payment_accounts').update({
        onboarding_status: 'disabled',
        charges_enabled: false,
        payouts_enabled: false,
      }).eq('stripe_account_id', connectedAccountId);
      if (disabled.error) throw new Error(disabled.error.message);
    } else if (['invoice.paid', 'invoice.payment_failed', 'invoice.voided'].includes(event.type)) {
      const invoice = event.data.object as Stripe.Invoice;
      const status = event.type === 'invoice.paid' ? 'paid' : event.type === 'invoice.voided' ? 'void' : 'open';
      const synchronized = await database.from('studio_invoices').update({
        status,
        hosted_invoice_url: invoice.hosted_invoice_url,
      }).eq('stripe_invoice_id', invoice.id);
      if (synchronized.error) throw new Error(synchronized.error.message);
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
