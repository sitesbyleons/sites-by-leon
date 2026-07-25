import type { APIRoute } from 'astro';
import Stripe from 'stripe';

import { markStripeEvent } from '@leon/platform-core/stripe-events';
import { createStudioDatabase } from '../../../lib/database';
import { invoiceStageAmount, resolveInvoiceEventUpdate, type InvoiceEventType, type InvoicePaymentStage } from '../../../lib/invoice-events';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const POST: APIRoute = async ({ request }) => {
  const database = createStudioDatabase();
  const stripeKey = process.env.STRIPE_CONNECT_SECRET_KEY ?? process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  const signature = request.headers.get('stripe-signature');
  if (!database || !stripeKey || !webhookSecret) {
    return Response.json({ message: 'Webhook verification is not configured.' }, { status: 503 });
  }
  if (!signature) return Response.json({ message: 'Invalid Stripe signature.' }, { status: 400 });

  const stripe = new Stripe(stripeKey);
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await request.text(), signature, webhookSecret);
  } catch {
    return Response.json({ message: 'Invalid Stripe signature.' }, { status: 400 });
  }

  const claim = await database.claimStripeEvent(event.id, `connect:${event.type}`);
  if (claim.error) return Response.json({ message: 'Webhook event could not be claimed.' }, { status: 503 });
  if (!claim.data.length) {
    const existing = await database.from('stripe_events').select('status').eq('event_id', event.id).maybeSingle<{ status: string }>();
    if (existing.error) return Response.json({ message: 'Webhook event status could not be checked.' }, { status: 503 });
    return existing.data?.status === 'processed'
      ? Response.json({ received: true, duplicate: true })
      : Response.json({ message: 'Webhook event is already being processed.' }, { status: 409 });
  }

  try {
    let eventNote: string | null = null;
    const connectedAccountId = typeof event.account === 'string' ? event.account : null;
    if (event.type === 'account.updated') {
      const eventAccount = event.data.object as Stripe.Account;
      const stored = await database.from('connected_payment_accounts')
        .select('onboarding_status')
        .eq('stripe_account_id', eventAccount.id)
        .maybeSingle<{ onboarding_status: string }>();
      if (stored.error) throw new Error(stored.error.message);
      if (stored.data && stored.data.onboarding_status !== 'disabled') {
        const live = await stripe.accounts.retrieve(eventAccount.id);
        const status = live.deleted
          ? { onboarding_status: 'disabled', charges_enabled: false, payouts_enabled: false, details_submitted: false }
          : {
              onboarding_status: live.charges_enabled && live.payouts_enabled ? 'enabled' : live.details_submitted ? 'restricted' : 'pending',
              charges_enabled: live.charges_enabled,
              payouts_enabled: live.payouts_enabled,
              details_submitted: live.details_submitted,
            };
        const synchronized = await database.from('connected_payment_accounts').update(status).eq('stripe_account_id', eventAccount.id);
        if (synchronized.error) throw new Error(synchronized.error.message);
      }
    } else if (event.type === 'account.application.deauthorized' && connectedAccountId) {
      const disabled = await database.from('connected_payment_accounts').update({
        onboarding_status: 'disabled',
        charges_enabled: false,
        payouts_enabled: false,
      }).eq('stripe_account_id', connectedAccountId);
      if (disabled.error) throw new Error(disabled.error.message);
    } else if (['invoice.paid', 'invoice.payment_failed', 'invoice.voided', 'invoice.marked_uncollectible'].includes(event.type)) {
      const invoice = event.data.object as Stripe.Invoice;
      if (connectedAccountId) {
        const connection = await database.resolveWorkspaceForStripeAccount(connectedAccountId);
        if (connection.error) throw new Error(connection.error.message);
        if (connection.data) {
          const metadataInternalId = invoice.metadata?.studio_invoice_id ?? '';
          const internalId = uuidPattern.test(metadataInternalId) ? metadataInternalId : null;
          let query = database.from('studio_invoices')
            .select('id,client_id,status,amount_due_cents,deposit_cents,amount_paid_cents,stripe_invoice_id')
            .eq('workspace_id', connection.data.workspace_id)
            .eq('stripe_invoice_id', invoice.id);
          if (internalId) query = database.from('studio_invoices')
            .select('id,client_id,status,amount_due_cents,deposit_cents,amount_paid_cents,stripe_invoice_id')
            .eq('workspace_id', connection.data.workspace_id)
            .eq('id', internalId);
          const current = await query.maybeSingle<{ id: string; client_id: string; status: string; amount_due_cents: number; deposit_cents: number | null; amount_paid_cents: number; stripe_invoice_id: string | null }>();
          if (current.error) throw new Error(current.error.message);
          if (current.data) {
            const metadataStage = invoice.metadata?.payment_stage ?? null;
            const suppliedStage = metadataStage && ['deposit', 'balance', 'full'].includes(metadataStage)
              ? metadataStage as InvoicePaymentStage
              : null;
            const studioClient = await database.from('studio_clients')
              .select('stripe_customer_id')
              .eq('workspace_id', connection.data.workspace_id)
              .eq('id', current.data.client_id)
              .maybeSingle<{ stripe_customer_id: string | null }>();
            if (studioClient.error) throw new Error(studioClient.error.message);
            const invoiceCustomer = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? null;
            const expectedAmount = suppliedStage ? invoiceStageAmount({
              amountDueCents: current.data.amount_due_cents,
              depositCents: current.data.deposit_cents,
              amountPaidCents: current.data.amount_paid_cents,
            }, suppliedStage) : null;
            const accountScopedCustomerMatches = connection.data.is_current
              ? studioClient.data?.stripe_customer_id === invoiceCustomer
              : current.data.stripe_invoice_id === invoice.id;
            const evidenceMatches = suppliedStage
              && invoice.metadata?.workspace_id === connection.data.workspace_id
              && invoice.metadata?.studio_invoice_id === current.data.id
              && invoice.currency === 'usd'
              && accountScopedCustomerMatches
              && expectedAmount !== null
              && invoice.total === expectedAmount
              && (event.type !== 'invoice.paid' || invoice.amount_paid === expectedAmount);
            if (!evidenceMatches) {
              eventNote = 'Ignored an invoice event whose customer, currency, amount, or workspace metadata did not match.';
            } else {
              const state = {
                status: current.data.status,
                amountDueCents: current.data.amount_due_cents,
                depositCents: current.data.deposit_cents,
                amountPaidCents: current.data.amount_paid_cents,
                currentStripeInvoiceId: current.data.stripe_invoice_id,
              };
              let update = resolveInvoiceEventUpdate(state, event.type as InvoiceEventType, suppliedStage, invoice.id, invoice.hosted_invoice_url ?? null);
              if (connection.data.is_current && event.type === 'invoice.paid' && current.data.stripe_invoice_id && current.data.stripe_invoice_id !== invoice.id) {
                const prospective = resolveInvoiceEventUpdate(
                  { ...state, currentStripeInvoiceId: invoice.id },
                  event.type as InvoiceEventType,
                  suppliedStage,
                  invoice.id,
                  invoice.hosted_invoice_url ?? null,
                );
                if (prospective) {
                  const newerInvoice = await stripe.invoices.retrieve(current.data.stripe_invoice_id, {}, { stripeAccount: connectedAccountId });
                  if (newerInvoice.status === 'open') {
                    await stripe.invoices.voidInvoice(newerInvoice.id, {}, { stripeAccount: connectedAccountId, idempotencyKey: `studio-invoice-void-replaced:${newerInvoice.id}` });
                  } else if (newerInvoice.status === 'draft') {
                    await stripe.invoices.del(newerInvoice.id, {}, { stripeAccount: connectedAccountId });
                  } else if (newerInvoice.status === 'paid') {
                    eventNote = 'Two Stripe invoice attempts were paid; manual refund review is required.';
                  }
                  update = prospective;
                }
              }
              if (update) {
                const synchronized = await database.from('studio_invoices').update(update)
                  .eq('id', current.data.id)
                  .eq('workspace_id', connection.data.workspace_id)
                  .eq('status', current.data.status)
                  .eq('amount_paid_cents', current.data.amount_paid_cents)
                  .eq('stripe_invoice_id', current.data.stripe_invoice_id);
                if (synchronized.error || !synchronized.data.length) throw new Error(synchronized.error?.message ?? 'Invoice changed during webhook processing.');
              }
            }
          }
        }
      }
    }

    await markStripeEvent(database, event.id, {
      status: 'processed',
      lastError: eventNote,
    });
    return Response.json({ received: true });
  } catch {
    await markStripeEvent(database, event.id, {
      status: 'failed',
      lastError: 'Webhook processing failed and will be retried.',
    }).catch(() => undefined);
    return Response.json({ message: 'Webhook processing failed and will be retried.' }, { status: 500 });
  }
};
