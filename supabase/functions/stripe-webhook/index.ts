import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { normalizeSubscription, subscriptionIdForEvent } from '../_shared/billing-core.ts';
import { createStripe, stripeCryptoProvider, type Stripe } from '../_shared/stripe-client.ts';
import { createSupabaseAdmin } from '../_shared/supabase-admin.ts';

const respond = (body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

const safeError = (error: unknown) =>
  (error instanceof Error ? error.message : 'Unknown webhook processing error').slice(0, 1000);

async function syncSubscription(
  subscription: Stripe.Subscription,
  supabase: NonNullable<ReturnType<typeof createSupabaseAdmin>>,
) {
  const normalized = normalizeSubscription(subscription);
  if (!normalized) throw new Error('Subscription metadata or billing data is incomplete.');

  const { error } = await supabase
    .from('subscriptions')
    .upsert(normalized, { onConflict: 'workspace_id' });
  if (error) throw error;

  const workspaceStatus = normalized.status === 'active' || normalized.status === 'trialing'
    ? 'active'
    : normalized.status === 'canceled' || normalized.status === 'incomplete_expired'
      ? 'approved'
      : null;

  if (workspaceStatus) {
    const { error: workspaceError } = await supabase
      .from('client_workspaces')
      .update({ status: workspaceStatus, stripe_customer_id: normalized.stripe_customer_id })
      .eq('id', normalized.workspace_id);
    if (workspaceError) throw workspaceError;
  }
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return respond({ message: 'Method not allowed.' }, 405);

  const stripe = createStripe();
  const supabase = createSupabaseAdmin();
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const signature = request.headers.get('stripe-signature');
  if (!stripe || !supabase || !webhookSecret || !signature) {
    return respond({ message: 'Webhook verification is not configured.' }, 503);
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
      undefined,
      stripeCryptoProvider,
    );
  } catch {
    return respond({ message: 'Invalid Stripe signature.' }, 400);
  }

  const { data: claim, error: claimError } = await supabase.rpc('claim_stripe_event', {
    p_event_id: event.id,
    p_event_type: event.type,
    p_retry_after_seconds: 300,
  });
  if (claimError) return respond({ message: 'Webhook event could not be claimed.' }, 503);
  if (claim === 'duplicate') return respond({ received: true, duplicate: true });
  if (claim === 'busy') return respond({ message: 'Webhook event is already processing.' }, 409);
  if (claim !== 'claimed') return respond({ message: 'Webhook event claim was invalid.' }, 503);

  try {
    const subscriptionId = subscriptionIdForEvent(
      event.type,
      event.data.object as unknown as Record<string, unknown>,
    );
    if (subscriptionId) {
      // Always retrieve current state so out-of-order webhook delivery cannot
      // overwrite newer subscription status with a stale event payload.
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await syncSubscription(subscription, supabase);
    }

    const { error: completeError } = await supabase.rpc('finish_stripe_event', {
      p_event_id: event.id,
      p_error: null,
    });
    if (completeError) throw completeError;

    return respond({ received: true });
  } catch (error) {
    await supabase.rpc('finish_stripe_event', {
      p_event_id: event.id,
      p_error: safeError(error),
    });
    return respond({ message: 'Webhook processing failed and will be retried.' }, 500);
  }
});
