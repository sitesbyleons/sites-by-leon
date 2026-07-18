import { createDataClient, type QueryExecutor } from '../platform-core/src/index';
import { markStripeEvent } from '../platform-core/src/stripe-events';
import { describe, expect, it } from 'vitest';

describe('markStripeEvent', () => {
  it('persists a processed event and verifies exactly one ledger row changed', async () => {
    const calls: Array<{ text: string; values: unknown[] }> = [];
    const execute: QueryExecutor = async (text, values) => {
      calls.push({ text, values });
      return [{ event_id: 'evt_1' }];
    };
    const client = createDataClient(execute);

    await expect(markStripeEvent(client, 'evt_1', {
      status: 'processed',
      lastError: null,
      observedAt: '2026-07-18T12:00:00.000Z',
    })).resolves.toBeUndefined();

    expect(calls[0]?.text).toContain('update "stripe_events"');
    expect(calls[0]?.text).toContain('where "event_id" = $5 returning *');
    expect(calls[0]?.values).toEqual([
      'processed',
      '2026-07-18T12:00:00.000Z',
      '2026-07-18T12:00:00.000Z',
      null,
      'evt_1',
    ]);
  });

  it('rejects database errors instead of acknowledging the webhook', async () => {
    const client = createDataClient(async () => {
      throw new Error('connection failed');
    });

    await expect(markStripeEvent(client, 'evt_1', {
      status: 'processed',
      lastError: null,
    })).rejects.toThrow('Stripe event state could not be saved.');
  });

  it('rejects a missing ledger row', async () => {
    const client = createDataClient(async () => []);

    await expect(markStripeEvent(client, 'evt_1', {
      status: 'failed',
      lastError: 'Retry processing.',
    })).rejects.toThrow('Stripe event ledger row was not found.');
  });
});
