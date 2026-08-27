export const plans = [
  { key: 'essential', name: 'Essential', monthlyUsd: 25, priceEnv: 'STRIPE_PRICE_ESSENTIAL' },
  { key: 'studio', name: 'Studio', monthlyUsd: 35, priceEnv: 'STRIPE_PRICE_STUDIO' },
] as const;

export const legacyPlans = [
  { key: 'signature', name: 'Signature', monthlyUsd: 40, priceEnv: 'STRIPE_PRICE_SIGNATURE' },
] as const;

export type PlanKey = (typeof plans)[number]['key'] | (typeof legacyPlans)[number]['key'];

export function getPlan(value: string) {
  return [...plans, ...legacyPlans].find((plan) => plan.key === value) ?? null;
}

export function getCheckoutPlan(value: string) {
  return plans.find((plan) => plan.key === value) ?? null;
}

export const MIN_HOSTING_MONTHLY_CENTS = 100;
export const MAX_HOSTING_MONTHLY_CENTS = 1_000_000;
const hostnamePattern = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

export function parseMonthlyCents(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value >= MIN_HOSTING_MONTHLY_CENTS && value <= MAX_HOSTING_MONTHLY_CENTS ? value : null;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 12) return null;
  const dollars = Number(trimmed);
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  const cents = Math.round(dollars * 100);
  return cents >= MIN_HOSTING_MONTHLY_CENTS && cents <= MAX_HOSTING_MONTHLY_CENTS ? cents : null;
}

export function hostingInvoiceAmountCents(input: {
  monthlyCents?: number | null;
  planKey?: string | null;
}) {
  if (typeof input.monthlyCents === 'number' && Number.isInteger(input.monthlyCents)
    && input.monthlyCents >= MIN_HOSTING_MONTHLY_CENTS
    && input.monthlyCents <= MAX_HOSTING_MONTHLY_CENTS) {
    return input.monthlyCents;
  }
  const plan = getCheckoutPlan(input.planKey ?? '');
  return plan ? plan.monthlyUsd * 100 : null;
}

export function catalogPlanForMonthlyCents(cents: number) {
  return plans.find((plan) => plan.monthlyUsd * 100 === cents) ?? null;
}

export function parseDomainOptions(value: string | null | undefined) {
  const seen = new Set<string>();
  const options: string[] = [];
  for (const part of (value ?? '').split(/[\n,]+/)) {
    const host = part.trim().toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/\.$/, '');
    if (!hostnamePattern.test(host) || host.length > 253 || seen.has(host)) continue;
    seen.add(host);
    options.push(host);
    if (options.length >= 12) break;
  }
  return options;
}

export function serializeDomainOptions(options: string[]) {
  return options.join('\n');
}

type CheckoutContext = {
  userId: string | null;
  workspaceStatus: string | null;
  subscriptionStatus: string | null;
};

const replaceableSubscriptionStatuses = new Set(['canceled', 'incomplete_expired']);

export function canManageSubscription(status: string | null | undefined) {
  return Boolean(status && !replaceableSubscriptionStatuses.has(status));
}

export function canManageBilling(role: string | null | undefined) {
  return role === 'owner' || role === 'admin';
}

export function canStartCheckout(context: CheckoutContext) {
  return Boolean(
    context.userId &&
      (context.workspaceStatus === 'approved' || context.workspaceStatus === 'active') &&
      (!context.subscriptionStatus || replaceableSubscriptionStatuses.has(context.subscriptionStatus)),
  );
}

export function canSendAdminHostingInvoice(context: {
  workspaceStatus: string | null;
  subscriptionStatus: string | null;
  planKey?: string | null;
  monthlyCents?: number | null;
  billingEmail: string | null;
}) {
  const email = context.billingEmail?.trim().toLowerCase() ?? '';
  return Boolean(
    (context.workspaceStatus === 'lead' || context.workspaceStatus === 'approved' || context.workspaceStatus === 'active')
      && hostingInvoiceAmountCents({ monthlyCents: context.monthlyCents, planKey: context.planKey })
      && email
      && email.length <= 254
      && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
      && (!context.subscriptionStatus || replaceableSubscriptionStatuses.has(context.subscriptionStatus)),
  );
}
