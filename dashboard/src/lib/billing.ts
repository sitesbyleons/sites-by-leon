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
  planKey: string | null;
  billingEmail: string | null;
}) {
  const email = context.billingEmail?.trim().toLowerCase() ?? '';
  return Boolean(
    (context.workspaceStatus === 'lead' || context.workspaceStatus === 'approved' || context.workspaceStatus === 'active')
      && getCheckoutPlan(context.planKey ?? '')
      && email
      && email.length <= 254
      && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
      && (!context.subscriptionStatus || replaceableSubscriptionStatuses.has(context.subscriptionStatus)),
  );
}
