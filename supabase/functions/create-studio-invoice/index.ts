import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { readInternalIdentity } from '../_shared/internal-auth.ts';
import { createConnectStripe } from '../_shared/stripe-client.ts';
import { createSupabaseAdmin } from '../_shared/supabase-admin.ts';

const allowedOrigins = (Deno.env.get('PORTFOLIO_ADMIN_ORIGINS') ?? '').split(',').map((value) => value.trim()).filter(Boolean);
const headers = (origin: string | null) => ({ ...(origin && allowedOrigins.includes(origin) ? { 'Access-Control-Allow-Origin': origin } : {}), 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json; charset=utf-8', Vary: 'Origin' });
const json = (origin: string | null, body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: headers(origin) });

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') return origin && allowedOrigins.includes(origin) ? new Response(null, { status: 204, headers: headers(origin) }) : json(origin, { message: 'Origin not allowed.' }, 403);
  if (request.method !== 'POST') return json(origin, { message: 'Method not allowed.' }, 405);
  if (!origin || !allowedOrigins.includes(origin)) return json(origin, { message: 'Origin not allowed.' }, 403);
  const identity = readInternalIdentity(request);
  if (!identity) return json(origin, { message: 'Sign in to send an invoice.' }, 401);

  const input = await request.json().catch(() => null);
  const invoiceId = typeof input?.invoiceId === 'string' ? input.invoiceId : '';
  const workspaceSlug = typeof input?.workspaceSlug === 'string' ? input.workspaceSlug : '';
  const stripe = createConnectStripe();
  const supabase = createSupabaseAdmin();
  if (!stripe || !supabase) return json(origin, { message: 'Photographer payments are not configured yet.' }, 503);

  const { data: workspace } = await supabase.from('client_workspaces').select('id').eq('slug', workspaceSlug).maybeSingle<{ id: string }>();
  if (!workspace) return json(origin, { message: 'Studio not found.' }, 404);
  const [{ data: member }, { data: admin }] = await Promise.all([
    supabase.from('workspace_members').select('role').eq('workspace_id', workspace.id).eq('clerk_user_id', identity.userId).maybeSingle<{ role: string }>(),
    supabase.from('app_admins').select('clerk_user_id').eq('clerk_user_id', identity.userId).maybeSingle(),
  ]);
  if (!admin && !member?.role?.match(/^(owner|admin)$/)) return json(origin, { message: 'Studio owner access required.' }, 403);

  const [{ data: connection }, { data: invoice }] = await Promise.all([
    supabase.from('connected_payment_accounts').select('stripe_account_id,charges_enabled,payouts_enabled').eq('workspace_id', workspace.id).maybeSingle<{ stripe_account_id: string; charges_enabled: boolean; payouts_enabled: boolean }>(),
    supabase.from('studio_invoices').select('id,client_id,status,description,amount_due_cents,deposit_cents,due_date').eq('id', invoiceId).eq('workspace_id', workspace.id).maybeSingle<{ id: string; client_id: string; status: string; description: string; amount_due_cents: number; deposit_cents: number | null; due_date: string | null }>(),
  ]);
  if (!connection?.charges_enabled || !connection.payouts_enabled) return json(origin, { message: 'Finish Stripe onboarding first.' }, 409);
  if (!invoice || invoice.status !== 'draft') return json(origin, { message: 'Choose a draft invoice.' }, 409);
  const { data: client } = await supabase.from('studio_clients').select('id,name,email,stripe_customer_id').eq('id', invoice.client_id).eq('workspace_id', workspace.id).maybeSingle<{ id: string; name: string; email: string | null; stripe_customer_id: string | null }>();
  if (!client?.email) return json(origin, { message: 'Add an email address to this client first.' }, 422);

  let customerId = client.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({ name: client.name, email: client.email, metadata: { workspace_id: workspace.id, client_id: client.id } }, { stripeAccount: connection.stripe_account_id });
    customerId = customer.id;
    await supabase.from('studio_clients').update({ stripe_customer_id: customerId }).eq('id', client.id);
  }

  const chargeAmount = invoice.deposit_cents && invoice.deposit_cents > 0 ? invoice.deposit_cents : invoice.amount_due_cents;
  await stripe.invoiceItems.create({ customer: customerId, amount: chargeAmount, currency: 'usd', description: invoice.deposit_cents ? `Deposit: ${invoice.description}` : invoice.description }, { stripeAccount: connection.stripe_account_id });
  const daysUntilDue = invoice.due_date ? Math.max(1, Math.ceil((Date.parse(`${invoice.due_date}T23:59:59Z`) - Date.now()) / 86_400_000)) : 14;
  const created = await stripe.invoices.create({ customer: customerId, collection_method: 'send_invoice', days_until_due: daysUntilDue, metadata: { studio_invoice_id: invoice.id, workspace_id: workspace.id } }, { stripeAccount: connection.stripe_account_id });
  const sent = await stripe.invoices.sendInvoice(created.id, {}, { stripeAccount: connection.stripe_account_id });
  const { error } = await supabase.from('studio_invoices').update({ stripe_invoice_id: sent.id, status: 'open', hosted_invoice_url: sent.hosted_invoice_url }).eq('id', invoice.id);
  return error ? json(origin, { message: 'Invoice was sent but could not be synchronized.' }, 503) : json(origin, { ok: true, url: sent.hosted_invoice_url });
});
