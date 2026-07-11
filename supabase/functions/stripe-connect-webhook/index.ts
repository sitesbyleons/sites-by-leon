import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { createConnectStripe, stripeCryptoProvider, type Stripe } from '../_shared/stripe-client.ts';
import { createSupabaseAdmin } from '../_shared/supabase-admin.ts';

const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
const safeError = (error: unknown) => (error instanceof Error ? error.message : 'Connect webhook failed').slice(0, 1000);

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json({ message: 'Method not allowed.' }, 405);
  const stripe = createConnectStripe();
  const supabase = createSupabaseAdmin();
  const secret = Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET');
  const signature = request.headers.get('stripe-signature');
  if (!stripe || !supabase || !secret || !signature) return json({ message: 'Webhook is not configured.' }, 503);

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await request.text(), signature, secret, undefined, stripeCryptoProvider);
  } catch {
    return json({ message: 'Invalid Stripe signature.' }, 400);
  }

  const { data: claim, error: claimError } = await supabase.rpc('claim_stripe_event', { p_event_id: event.id, p_event_type: `connect:${event.type}`, p_retry_after_seconds: 300 });
  if (claimError) return json({ message: 'Webhook could not be claimed.' }, 503);
  if (claim === 'duplicate') return json({ received: true, duplicate: true });
  if (claim !== 'claimed') return json({ message: 'Webhook is already processing.' }, 409);

  try {
    const connectedAccountId = typeof event.account === 'string' ? event.account : null;
    if (event.type === 'account.updated') {
      const account = event.data.object as Stripe.Account;
      const status = account.charges_enabled && account.payouts_enabled ? 'enabled' : account.details_submitted ? 'restricted' : 'pending';
      await supabase.from('connected_payment_accounts').update({ onboarding_status: status, charges_enabled: account.charges_enabled, payouts_enabled: account.payouts_enabled, details_submitted: account.details_submitted }).eq('stripe_account_id', account.id);
    } else if (event.type === 'account.application.deauthorized' && connectedAccountId) {
      await supabase.from('connected_payment_accounts').update({ onboarding_status: 'disabled', charges_enabled: false, payouts_enabled: false }).eq('stripe_account_id', connectedAccountId);
    } else if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed' || event.type === 'invoice.voided') {
      const invoice = event.data.object as Stripe.Invoice;
      const status = event.type === 'invoice.paid' ? 'paid' : event.type === 'invoice.voided' ? 'void' : 'open';
      await supabase.from('studio_invoices').update({ status, hosted_invoice_url: invoice.hosted_invoice_url }).eq('stripe_invoice_id', invoice.id);
    }
    const { error } = await supabase.rpc('finish_stripe_event', { p_event_id: event.id, p_error: null });
    if (error) throw error;
    return json({ received: true });
  } catch (error) {
    await supabase.rpc('finish_stripe_event', { p_event_id: event.id, p_error: safeError(error) });
    return json({ message: 'Webhook will be retried.' }, 500);
  }
});
