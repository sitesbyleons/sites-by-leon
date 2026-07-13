import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { isTrustedOrigin } from '@leon/platform-core/request-security';

import { invoiceStageAmount, type InvoicePaymentStage } from '../../../lib/invoice-events';
import { resolveManagedStudio } from '../../../lib/studio';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const missingStripeResource = (error: unknown) => error instanceof Stripe.errors.StripeError
  && (error.code === 'resource_missing' || error.statusCode === 404);

export const POST: APIRoute = async ({ request, locals, url }) => {
  if (!isTrustedOrigin(request.headers.get('origin'), url.origin)) return Response.json({ message: 'Request not allowed.' }, { status: 403 });
  const auth = locals.auth();
  if (!auth.userId) return Response.json({ message: 'Sign in again.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const invoiceId = typeof body?.invoiceId === 'string' ? body.invoiceId : '';
  if (!uuidPattern.test(invoiceId)) return Response.json({ message: 'Choose a valid draft invoice.' }, { status: 400 });

  const stripeKey = process.env.STRIPE_CONNECT_SECRET_KEY ?? process.env.STRIPE_SECRET_KEY;
  const { client: database, workspaceId } = await resolveManagedStudio(auth.userId);
  if (!stripeKey) return Response.json({ message: 'Invoice payments are not configured yet.' }, { status: 503 });
  if (!database || !workspaceId) return Response.json({ message: 'Studio owner access required.' }, { status: 403 });

  const [connectionResult, invoiceResult] = await Promise.all([
    database.from('connected_payment_accounts')
      .select('stripe_account_id,charges_enabled,payouts_enabled')
      .eq('workspace_id', workspaceId)
      .maybeSingle<{ stripe_account_id: string; charges_enabled: boolean; payouts_enabled: boolean }>(),
    database.from('studio_invoices')
      .select('id,client_id,stripe_invoice_id,status,description,amount_due_cents,deposit_cents,amount_paid_cents,due_date')
      .eq('id', invoiceId)
      .eq('workspace_id', workspaceId)
      .maybeSingle<{ id: string; client_id: string; stripe_invoice_id: string | null; status: string; description: string; amount_due_cents: number; deposit_cents: number | null; amount_paid_cents: number; due_date: string | null }>(),
  ]);
  const connection = connectionResult.data;
  let invoice = invoiceResult.data;
  if (!connection?.charges_enabled || !connection.payouts_enabled) {
    return Response.json({ message: 'Finish Stripe onboarding first.' }, { status: 409 });
  }
  if (!invoice || !['draft', 'sending', 'deposit_paid', 'uncollectible'].includes(invoice.status)) return Response.json({ message: 'Choose a draft invoice or a payment that can be retried.' }, { status: 409 });
  const claimed = await database.claimInvoiceSend(workspaceId, invoice.id);
  if (claimed.error) return Response.json({ message: 'Invoice sending could not start.' }, { status: 503 });
  if (!claimed.data.length) return Response.json({ message: 'Another invoice send is already in progress. Retry in a few minutes.' }, { status: 409 });
  invoice = claimed.data[0] as NonNullable<typeof invoice>;

  const clientResult = await database.from('studio_clients')
    .select('id,name,email,stripe_customer_id')
    .eq('id', invoice.client_id)
    .eq('workspace_id', workspaceId)
    .maybeSingle<{ id: string; name: string; email: string | null; stripe_customer_id: string | null }>();
  const studioClient = clientResult.data;
  const releaseSendClaim = async () => database.from('studio_invoices').update({
    status: invoice.amount_paid_cents > 0 ? 'deposit_paid' : 'draft',
  }).eq('id', invoice.id).eq('workspace_id', workspaceId).eq('status', 'sending');
  if (!studioClient?.email) {
    await releaseSendClaim();
    return Response.json({ message: 'Add an email address to this client first.' }, { status: 422 });
  }

  const stage: Exclude<InvoicePaymentStage, null> = invoice.amount_paid_cents > 0
    ? 'balance'
    : invoice.deposit_cents && invoice.deposit_cents > 0 && invoice.deposit_cents < invoice.amount_due_cents ? 'deposit' : 'full';
  const amount = invoiceStageAmount({
    amountDueCents: invoice.amount_due_cents,
    depositCents: invoice.deposit_cents,
    amountPaidCents: invoice.amount_paid_cents,
  }, stage);
  if (amount === null) {
    await releaseSendClaim();
    return Response.json({ message: 'This invoice amount cannot be processed safely by Stripe.' }, { status: 422 });
  }

  try {
    const stripe = new Stripe(stripeKey);
    const stripeAccount = connection.stripe_account_id;
    let customerId = studioClient.stripe_customer_id;
    if (customerId) {
      try {
        await stripe.customers.update(customerId, {
          name: studioClient.name,
          email: studioClient.email,
        }, { stripeAccount });
      } catch (error) {
        if (!missingStripeResource(error)) throw error;
        customerId = null;
      }
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: studioClient.name,
        email: studioClient.email,
        metadata: { workspace_id: workspaceId, client_id: studioClient.id },
      }, { stripeAccount, idempotencyKey: `studio-client:${studioClient.id}:${stripeAccount}` });
      customerId = customer.id;
      const saved = await database.bindStudioClientStripeCustomer({
        workspace_id: workspaceId,
        client_id: studioClient.id,
        stripe_account_id: stripeAccount,
        expected_customer_id: studioClient.stripe_customer_id,
        stripe_customer_id: customerId,
      });
      if (saved.error || !saved.data.length) {
        await releaseSendClaim();
        return Response.json({
          message: saved.error
            ? 'The Stripe customer could not be saved. Retry safely.'
            : 'The connected Stripe account changed. Retry with the current account.',
        }, { status: saved.error ? 503 : 409 });
      }
    }

    const attemptKey = invoice.stripe_invoice_id ?? 'initial';
    const daysUntilDue = invoice.due_date
      ? Math.min(365, Math.max(1, Math.ceil((Date.parse(`${invoice.due_date}T23:59:59Z`) - Date.now()) / 86_400_000)))
      : 14;
    const createStripeInvoice = (key = attemptKey) => stripe.invoices.create({
      customer: customerId,
      collection_method: 'send_invoice',
      days_until_due: daysUntilDue,
      pending_invoice_items_behavior: 'exclude',
      metadata: { studio_invoice_id: invoice.id, workspace_id: workspaceId, payment_stage: stage },
    }, { stripeAccount, idempotencyKey: `studio-invoice:${invoice.id}:${stage}:${key}` });
    const customerFor = (candidate: Stripe.Invoice) => typeof candidate.customer === 'string'
      ? candidate.customer
      : candidate.customer?.id ?? null;
    const identityMatches = (candidate: Stripe.Invoice) => candidate.metadata?.studio_invoice_id === invoice.id
      && candidate.metadata?.workspace_id === workspaceId
      && candidate.metadata?.payment_stage === stage
      && candidate.currency === 'usd'
      && customerFor(candidate) === customerId;
    const finalAmountMatches = (candidate: Stripe.Invoice) => identityMatches(candidate)
      && candidate.total === amount
      && (candidate.status !== 'paid' || candidate.amount_paid === amount);
    let created: Stripe.Invoice;
    if (invoice.stripe_invoice_id) {
      try {
        const candidate = await stripe.invoices.retrieve(invoice.stripe_invoice_id, {}, { stripeAccount });
        created = identityMatches(candidate) ? candidate : await createStripeInvoice();
      } catch (error) {
        if (!missingStripeResource(error)) throw error;
        created = await createStripeInvoice(`missing:${invoice.stripe_invoice_id}`);
      }
    } else created = await createStripeInvoice();

    if (created.status === 'open' || created.status === 'paid') {
      if (!finalAmountMatches(created)) {
        if (created.status === 'open') {
          await stripe.invoices.voidInvoice(created.id, {}, { stripeAccount, idempotencyKey: `studio-invoice-void-invalid:${created.id}` });
          created = await createStripeInvoice(`replace:${created.id}`);
        } else {
          const resetStatus = invoice.amount_paid_cents > 0 ? 'deposit_paid' : 'draft';
          await database.from('studio_invoices').update({ status: resetStatus })
            .eq('id', invoice.id)
            .eq('status', 'sending');
          return Response.json({ message: 'Stripe reports a payment that does not match this invoice. Review it in Stripe before retrying.' }, { status: 409 });
        }
      }
    }

    if (created.status === 'open' || created.status === 'paid') {
      const recoveredStatus = created.status === 'paid'
        ? stage === 'deposit' ? 'deposit_paid' : 'paid'
        : 'open';
      const recoveredPaid = created.status === 'paid'
        ? stage === 'deposit' ? invoice.deposit_cents : invoice.amount_due_cents
        : invoice.amount_paid_cents;
      const recovered = await database.from('studio_invoices').update({
        stripe_invoice_id: created.id,
        status: recoveredStatus,
        amount_paid_cents: recoveredPaid,
        hosted_invoice_url: created.hosted_invoice_url,
      }).eq('id', invoice.id).eq('status', 'sending').eq('stripe_invoice_id', invoice.stripe_invoice_id);
      return recovered.error || !recovered.data.length
        ? Response.json({ message: 'Stripe has the invoice, but synchronization needs another retry.' }, { status: 503 })
        : Response.json({ ok: true, url: created.hosted_invoice_url });
    }
    if (created.status !== 'draft') {
      created = await createStripeInvoice(`replace:${created.id}`);
      if (created.status !== 'draft') {
        const resetStatus = invoice.amount_paid_cents > 0 ? 'deposit_paid' : 'draft';
        await database.from('studio_invoices').update({ status: resetStatus }).eq('id', invoice.id).eq('status', 'sending');
        return Response.json({ message: 'The previous Stripe invoice is closed. Retry to create a fresh one.' }, { status: 409 });
      }
    }

    let existingItems = await stripe.invoiceItems.list({ invoice: created.id, limit: 100 }, { stripeAccount });
    const itemMatches = (item: Stripe.InvoiceItem) => item.metadata?.studio_invoice_id === invoice.id
      && item.metadata?.payment_stage === stage
      && item.amount === amount
      && item.currency === 'usd';
    if (existingItems.data.length && (existingItems.data.length !== 1 || !itemMatches(existingItems.data[0]))) {
      await stripe.invoices.del(created.id, {}, { stripeAccount });
      created = await createStripeInvoice(`repair:${created.id}`);
      if (created.status !== 'draft' || !identityMatches(created)) {
        return Response.json({ message: 'Stripe invoice details could not be verified safely.' }, { status: 409 });
      }
      existingItems = await stripe.invoiceItems.list({ invoice: created.id, limit: 100 }, { stripeAccount });
      if (existingItems.data.length) return Response.json({ message: 'Stripe invoice items could not be verified safely.' }, { status: 409 });
    }

    const persisted = await database.from('studio_invoices').update({ stripe_invoice_id: created.id })
      .eq('id', invoice.id)
      .eq('status', 'sending')
      .eq('stripe_invoice_id', invoice.stripe_invoice_id);
    if (persisted.error || !persisted.data.length) {
      return Response.json({ message: 'The draft invoice could not be synchronized. Retry safely.' }, { status: 503 });
    }

    if (!existingItems.data.length) {
      await stripe.invoiceItems.create({
        customer: customerId,
        invoice: created.id,
        amount,
        currency: 'usd',
        description: stage === 'deposit' ? `Deposit: ${invoice.description}` : stage === 'balance' ? `Remaining balance: ${invoice.description}` : invoice.description,
        metadata: { studio_invoice_id: invoice.id, payment_stage: stage },
      }, { stripeAccount, idempotencyKey: `studio-invoice-item:${created.id}` });
    }
    const sent = await stripe.invoices.sendInvoice(created.id, {}, { stripeAccount, idempotencyKey: `studio-invoice-send:${created.id}` });
    if (!finalAmountMatches(sent)) {
      if (sent.status === 'open') await stripe.invoices.voidInvoice(sent.id, {}, { stripeAccount, idempotencyKey: `studio-invoice-void-invalid:${sent.id}` });
      return Response.json({ message: 'Stripe returned invoice details that did not match. Nothing should be paid from this link.' }, { status: 502 });
    }
    const saved = await database.from('studio_invoices').update({
      stripe_invoice_id: sent.id,
      status: 'open',
      hosted_invoice_url: sent.hosted_invoice_url,
    }).eq('id', invoice.id).eq('status', 'sending').eq('stripe_invoice_id', sent.id);
    return saved.error || !saved.data.length
      ? Response.json({ message: 'Invoice was sent but could not be synchronized.' }, { status: 503 })
      : Response.json({ ok: true, url: sent.hosted_invoice_url });
  } catch {
    await releaseSendClaim();
    return Response.json({ message: 'The invoice could not be completed. Retry it safely from the invoice list.' }, { status: 502 });
  }
};
