export type InvoiceEventType = 'invoice.paid' | 'invoice.payment_failed' | 'invoice.voided' | 'invoice.marked_uncollectible';
export type InvoicePaymentStage = 'deposit' | 'balance' | 'full' | null;
export const MIN_STRIPE_USD_CENTS = 50;
export const MAX_STRIPE_USD_CENTS = 99_999_999;

export function parseUsdCents(value: string): number | null {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0');
  if (cents < BigInt(MIN_STRIPE_USD_CENTS) || cents > BigInt(MAX_STRIPE_USD_CENTS)) return null;
  return Number(cents);
}

export function invoiceStageAmount(
  current: Pick<InvoiceState, 'amountDueCents' | 'depositCents' | 'amountPaidCents'>,
  suppliedStage: Exclude<InvoicePaymentStage, null>,
): number | null {
  const amount = suppliedStage === 'deposit'
    ? current.depositCents
    : suppliedStage === 'balance'
      ? current.amountDueCents - Math.max(current.amountPaidCents, current.depositCents ?? 0)
      : current.amountDueCents;
  return amount !== null
    && Number.isSafeInteger(amount)
    && amount >= MIN_STRIPE_USD_CENTS
    && amount <= MAX_STRIPE_USD_CENTS
    ? amount
    : null;
}

type InvoiceState = {
  status: string;
  amountDueCents: number;
  depositCents: number | null;
  amountPaidCents: number;
  currentStripeInvoiceId: string | null;
};

type InvoiceUpdate = {
  status: string;
  amount_paid_cents?: number | null;
  stripe_invoice_id: string;
  hosted_invoice_url: string | null;
};

export function resolveInvoiceEventUpdate(
  current: InvoiceState,
  eventType: InvoiceEventType,
  suppliedStage: InvoicePaymentStage,
  stripeInvoiceId: string,
  hostedInvoiceUrl: string | null,
): InvoiceUpdate | null {
  if (current.status === 'paid' || current.amountPaidCents >= current.amountDueCents) return null;
  if (current.currentStripeInvoiceId && current.currentStripeInvoiceId !== stripeInvoiceId) return null;
  if (current.status === 'review' && eventType === 'invoice.payment_failed') return null;
  if (eventType !== 'invoice.paid' && ['void', 'uncollectible', 'deposit_paid'].includes(current.status)) return null;

  const hasPartialDeposit = Boolean(
    current.depositCents && current.depositCents > 0 && current.depositCents < current.amountDueCents,
  );
  const stage = suppliedStage ?? (current.amountPaidCents > 0 ? 'balance' : hasPartialDeposit ? 'deposit' : 'full');
  const common = { stripe_invoice_id: stripeInvoiceId, hosted_invoice_url: hostedInvoiceUrl };

  if (eventType === 'invoice.paid') {
    if (stage === 'deposit' && hasPartialDeposit) {
      if (current.amountPaidCents >= current.depositCents!) return null;
      return { ...common, status: 'deposit_paid', amount_paid_cents: current.depositCents };
    }
    return { ...common, status: 'paid', amount_paid_cents: current.amountDueCents };
  }

  if (stage === 'deposit' && current.amountPaidCents > 0) return null;
  if (eventType === 'invoice.voided') {
    return stage === 'balance' && current.amountPaidCents > 0
      ? { ...common, status: 'deposit_paid', amount_paid_cents: current.amountPaidCents }
      : { ...common, status: 'void', amount_paid_cents: current.amountPaidCents };
  }
  if (eventType === 'invoice.marked_uncollectible') {
    return { ...common, status: 'uncollectible', amount_paid_cents: current.amountPaidCents };
  }
  return { ...common, status: 'open', amount_paid_cents: current.amountPaidCents };
}
