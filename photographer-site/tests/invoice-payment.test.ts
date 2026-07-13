import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { invoiceStageAmount, parseUsdCents, resolveInvoiceEventUpdate } from '../src/lib/invoice-events';

const read = (path: string) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const readWorkspace = (path: string) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('studio invoice payment lifecycle', () => {
  it('sends each invoice stage idempotently and can request a remaining balance', () => {
    const send = read('src/pages/api/invoices/send.ts');
    const page = read('src/pages/admin/invoices.astro');
    expect(send).toContain("'deposit_paid', 'uncollectible'");
    expect(send).toContain('idempotencyKey');
    expect(send).toContain('attemptKey');
    expect(send).toContain('claimInvoiceSend');
    expect(send).toContain("payment_stage: stage");
    expect(send).toContain('stripe.customers.update');
    expect(page).toContain('Send remaining balance');
  });

  it('records a paid deposit separately from a fully paid invoice', () => {
    const webhook = read('src/pages/api/webhooks/stripe-connect.ts');
    const resolver = read('src/lib/invoice-events.ts');
    expect(resolver).toContain("status: 'deposit_paid'");
    expect(resolver).toContain('amount_paid_cents');
    expect(webhook).toContain('resolveInvoiceEventUpdate');
    expect(webhook).toContain("eq('workspace_id', connection.data.workspace_id)");
  });

  it('creates and replaces Connect accounts idempotently', () => {
    const connect = read('src/pages/api/connect.ts');
    expect(connect).toContain('createAccount(`studio-connect-account:');
    expect(connect).toContain('replaceConnectedAccount');
    expect(connect).toContain('stripe.v2.core.accounts.create');
    expect(connect).toContain('stripe.v2.core.accountLinks.create');
    expect(connect).not.toContain('connected Stripe account is no longer available');
  });

  it('keeps Accounts v2 requirements synchronized through a signed event destination', () => {
    const webhook = read('src/pages/api/webhooks/stripe-connect-v2.ts');
    expect(webhook).toContain('parseEventNotificationAsync');
    expect(webhook).toContain('STRIPE_CONNECT_V2_WEBHOOK_SECRET');
    expect(webhook).toContain('connectAccountStatus');
    expect(webhook).toContain('resolveWorkspaceForStripeAccount');
  });

  it('recovers a customer missing from the current Connect account without a stale rebind', () => {
    const send = read('src/pages/api/invoices/send.ts');

    expect(send).toContain('if (!missingStripeResource(error)) throw error');
    expect(send).toContain('bindStudioClientStripeCustomer');
    expect(send).toContain('expected_customer_id: studioClient.stripe_customer_id');
    expect(send).toContain('stripe_account_id: stripeAccount');
    expect(send).toContain('idempotencyKey: `studio-client:${studioClient.id}:${stripeAccount}`');
  });

  it('releases the invoice send claim when customer recovery cannot complete', () => {
    const send = read('src/pages/api/invoices/send.ts');

    expect(send).toContain('const releaseSendClaim');
    expect(send).toContain('await releaseSendClaim()');
    expect(send).toMatch(/catch[^]*await releaseSendClaim\(\)[^]*Retry it safely/i);
  });

  it('keeps old-account invoices non-sendable while retired webhooks remain traceable', () => {
    const webhook = read('src/pages/api/webhooks/stripe-connect.ts');
    const page = read('src/pages/admin/invoices.astro');
    const core = readWorkspace('platform-core/src/index.ts');
    const schema = readWorkspace('infra/ovh/postgres/schema.sql');

    expect(core).toContain('connected_payment_account_history');
    expect(core).toContain("then 'review'");
    expect(webhook).toContain('resolveWorkspaceForStripeAccount');
    expect(webhook).toContain('connection.data.is_current');
    expect(page).toContain("invoice.status === 'review'");
    expect(page).toContain('Do not resend it');
    expect(schema).toContain("'uncollectible', 'review'");
  });
});

describe('invoice webhook ordering', () => {
  const invoice = { status: 'open', amountDueCents: 45_000, depositCents: 15_000, amountPaidCents: 15_000, currentStripeInvoiceId: 'in_balance_2' };

  it('never lets a delayed deposit failure downgrade a balance or paid invoice', () => {
    expect(resolveInvoiceEventUpdate(invoice, 'invoice.payment_failed', 'deposit', 'in_deposit', null)).toBeNull();
    expect(resolveInvoiceEventUpdate({ ...invoice, status: 'paid', amountPaidCents: 45_000 }, 'invoice.payment_failed', 'balance', 'in_balance', null)).toBeNull();
  });

  it('advances deposits and balances monotonically', () => {
    expect(resolveInvoiceEventUpdate({ ...invoice, status: 'sending', amountPaidCents: 0, currentStripeInvoiceId: 'in_deposit' }, 'invoice.paid', 'deposit', 'in_deposit', 'https://pay/deposit')).toMatchObject({
      status: 'deposit_paid', amount_paid_cents: 15_000, stripe_invoice_id: 'in_deposit',
    });
    expect(resolveInvoiceEventUpdate(invoice, 'invoice.paid', 'balance', 'in_balance_2', 'https://pay/balance')).toMatchObject({
      status: 'paid', amount_paid_cents: 45_000, stripe_invoice_id: 'in_balance_2',
    });
  });

  it('ignores a late failure from a replaced invoice attempt', () => {
    expect(resolveInvoiceEventUpdate(
      invoice,
      'invoice.payment_failed',
      'balance',
      'in_balance_1',
      'https://pay/old-balance',
    )).toBeNull();
  });

  it('keeps void and uncollectible attempts from reopening on delayed failures', () => {
    expect(resolveInvoiceEventUpdate({ ...invoice, status: 'void' }, 'invoice.payment_failed', 'balance', 'in_balance_2', null)).toBeNull();
    expect(resolveInvoiceEventUpdate({ ...invoice, status: 'uncollectible' }, 'invoice.payment_failed', 'balance', 'in_balance_2', null)).toBeNull();
    expect(resolveInvoiceEventUpdate(invoice, 'invoice.marked_uncollectible', 'balance', 'in_balance_2', null)).toMatchObject({ status: 'uncollectible' });
  });

  it('keeps a retired-account invoice in review after a payment failure', () => {
    expect(resolveInvoiceEventUpdate({ ...invoice, status: 'review' }, 'invoice.payment_failed', 'balance', 'in_balance_2', null)).toBeNull();
  });
});

describe('invoice money validation', () => {
  it('parses exact cents and rejects fractions or Stripe-unsafe ranges', () => {
    expect(parseUsdCents('0.50')).toBe(50);
    expect(parseUsdCents('450')).toBe(45_000);
    expect(parseUsdCents('1.005')).toBeNull();
    expect(parseUsdCents('1000000')).toBeNull();
    expect(parseUsdCents('0.49')).toBeNull();
  });

  it('calculates the expected deposit and balance sent to Stripe', () => {
    expect(invoiceStageAmount({ amountDueCents: 45_000, depositCents: 15_000, amountPaidCents: 0 }, 'deposit')).toBe(15_000);
    expect(invoiceStageAmount({ amountDueCents: 45_000, depositCents: 15_000, amountPaidCents: 15_000 }, 'balance')).toBe(30_000);
  });
});
