export const plans = [
  { key: 'essential', name: 'Essential', monthlyUsd: 25, priceEnv: 'STRIPE_PRICE_ESSENTIAL' },
  { key: 'studio', name: 'Studio', monthlyUsd: 30, priceEnv: 'STRIPE_PRICE_STUDIO' },
  { key: 'signature', name: 'Signature', monthlyUsd: 40, priceEnv: 'STRIPE_PRICE_SIGNATURE' },
] as const;

export type PlanKey = (typeof plans)[number]['key'];

export function getPlan(value: string) {
  return plans.find((plan) => plan.key === value) ?? null;
}

type CheckoutContext = {
  userId: string | null;
  workspaceStatus: string | null;
  subscriptionStatus: string | null;
};

export function canStartCheckout(context: CheckoutContext) {
  return Boolean(
    context.userId &&
      (context.workspaceStatus === 'approved' || context.workspaceStatus === 'active') &&
      !context.subscriptionStatus,
  );
}
