import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { isTrustedOrigin } from '@leon/platform-core/request-security';

import { resolveManagedStudio } from '../../../lib/studio';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
      .select('id,client_id,status,description,amount_due_cents,deposit_cents,due_date')
      .eq('id', invoiceId)
      .eq('workspace_id', workspaceId)
      .maybeSingle<{ id: string; client_id: string; status: string; description: string; amount_due_cents: number; deposit_cents: number | null; due_date: string | null }>(),
  ]);
  const connection = connectionResult.data;
  const invoice = invoiceResult.data;
  if (!connection?.charges_enabled || !connection.payouts_enabled) {
    return Response.json({ message: 'Finish Stripe onboarding first.' }, { status: 409 });
  }
  if (!invoice || invoice.status !== 'draft') return Response.json({ message: 'Choose a draft invoice.' }, { status: 409 });

  const clientResult = await database.from('studio_clients')
    .select('id,name,email,stripe_customer_id')
    .eq('id', invoice.client_id)
    .eq('workspace_id', workspaceId)
    .maybeSingle<{ id: string; name: string; email: string | null; stripe_customer_id: string | null }>();
  const studioClient = clientResult.data;
  if (!studioClient?.email) return Response.json({ message: 'Add an email address to this client first.' }, { status: 422 });

  try {
    const stripe = new Stripe(stripeKey);
    const stripeAccount = connection.stripe_account_id;
    let customerId = studioClient.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: studioClient.name,
        email: studioClient.email,
        metadata: { workspace_id: workspaceId, client_id: studioClient.id },
      }, { stripeAccount });
      customerId = customer.id;
      const saved = await database.from('studio_clients').update({ stripe_customer_id: customerId }).eq('id', studioClient.id);
      if (saved.error) return Response.json({ message: 'The Stripe customer could not be saved.' }, { status: 503 });
    }

    const amount = invoice.deposit_cents && invoice.deposit_cents > 0 ? invoice.deposit_cents : invoice.amount_due_cents;
    await stripe.invoiceItems.create({
      customer: customerId,
      amount,
      currency: 'usd',
      description: invoice.deposit_cents ? `Deposit: ${invoice.description}` : invoice.description,
    }, { stripeAccount });
    const daysUntilDue = invoice.due_date
      ? Math.max(1, Math.ceil((Date.parse(`${invoice.due_date}T23:59:59Z`) - Date.now()) / 86_400_000))
      : 14;
    const created = await stripe.invoices.create({
      customer: customerId,
      collection_method: 'send_invoice',
      days_until_due: daysUntilDue,
      metadata: { studio_invoice_id: invoice.id, workspace_id: workspaceId },
    }, { stripeAccount });
    const sent = await stripe.invoices.sendInvoice(created.id, {}, { stripeAccount });
    const saved = await database.from('studio_invoices').update({
      stripe_invoice_id: sent.id,
      status: 'open',
      hosted_invoice_url: sent.hosted_invoice_url,
    }).eq('id', invoice.id);
    return saved.error
      ? Response.json({ message: 'Invoice was sent but could not be synchronized.' }, { status: 503 })
      : Response.json({ ok: true, url: sent.hosted_invoice_url });
  } catch {
    return Response.json({ message: 'The invoice could not be sent. Nothing was charged.' }, { status: 502 });
  }
};
