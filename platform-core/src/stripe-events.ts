import type { DataClient } from './index';

export type StripeEventState = {
  status: 'processed' | 'failed';
  lastError: string | null;
  observedAt?: string;
};

export async function markStripeEvent(
  client: DataClient,
  eventId: string,
  state: StripeEventState,
): Promise<void> {
  const observedAt = state.observedAt ?? new Date().toISOString();
  const result = await client.from('stripe_events').update({
    status: state.status,
    processed_at: state.status === 'processed' ? observedAt : null,
    last_attempt_at: observedAt,
    last_error: state.lastError,
  }).eq('event_id', eventId);

  if (result.error) throw new Error('Stripe event state could not be saved.');
  if (result.data.length !== 1) throw new Error('Stripe event ledger row was not found.');
}
