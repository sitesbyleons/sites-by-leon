export const planKeys = ['essential', 'studio', 'signature'] as const;
export type PlanKey = (typeof planKeys)[number];

const liveSubscriptionStatuses = new Set([
  'incomplete',
  'trialing',
  'active',
  'past_due',
  'unpaid',
  'paused',
]);

const allowedSubscriptionStatuses = new Set([
  ...liveSubscriptionStatuses,
  'incomplete_expired',
  'canceled',
]);

const isPlanKey = (value: unknown): value is PlanKey =>
  typeof value === 'string' && planKeys.includes(value as PlanKey);

export function readClerkIdentity(jwt: string) {
  try {
    const payloadPart = jwt.split('.')[1];
    if (!payloadPart) return null;
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const payload = JSON.parse(atob(padded)) as Record<string, unknown>;
    const userId = typeof payload.sub === 'string' ? payload.sub : null;
    const compactOrg =
      payload.o && typeof payload.o === 'object'
        ? (payload.o as Record<string, unknown>).id
        : null;
    const orgId =
      typeof payload.org_id === 'string'
        ? payload.org_id
        : typeof compactOrg === 'string'
          ? compactOrg
          : null;

    return userId ? { userId, orgId } : null;
  } catch {
    return null;
  }
}

export function resolvePlan(key: unknown, env: (name: string) => string | undefined) {
  if (!isPlanKey(key)) return null;
  const name = `STRIPE_PRICE_${key.toUpperCase()}`;
  const priceId = env(name);
  return priceId ? { key, priceId } : null;
}

export function checkoutAllowed(workspaceStatus: string, subscriptionStatus: string | null) {
  return (
    (workspaceStatus === 'approved' || workspaceStatus === 'active') &&
    (!subscriptionStatus || !liveSubscriptionStatuses.has(subscriptionStatus))
  );
}

export function subscriptionIdForEvent(eventType: string, object: Record<string, unknown>) {
  if (
    eventType === 'customer.subscription.created' ||
    eventType === 'customer.subscription.updated' ||
    eventType === 'customer.subscription.deleted'
  ) {
    return typeof object.id === 'string' ? object.id : null;
  }

  if (eventType === 'checkout.session.completed') {
    if (typeof object.subscription === 'string') return object.subscription;
    if (object.subscription && typeof object.subscription === 'object') {
      const id = (object.subscription as Record<string, unknown>).id;
      return typeof id === 'string' ? id : null;
    }
  }

  return null;
}

type StripeSubscriptionLike = {
  id?: unknown;
  customer?: unknown;
  status?: unknown;
  cancel_at_period_end?: unknown;
  current_period_end?: unknown;
  metadata?: Record<string, unknown> | null;
  items?: {
    data?: Array<{
      price?: { id?: unknown };
      current_period_end?: unknown;
    }>;
  };
};

export function normalizeSubscription(subscription: StripeSubscriptionLike) {
  const workspaceId = subscription.metadata?.workspace_id;
  const planKey = subscription.metadata?.plan_key;
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer && typeof subscription.customer === 'object'
        ? (subscription.customer as Record<string, unknown>).id
        : null;
  const firstItem = subscription.items?.data?.[0];
  const priceId = firstItem?.price?.id;
  const periodEnd = firstItem?.current_period_end ?? subscription.current_period_end;

  if (
    typeof subscription.id !== 'string' ||
    typeof customerId !== 'string' ||
    typeof workspaceId !== 'string' ||
    !isPlanKey(planKey) ||
    typeof priceId !== 'string' ||
    typeof subscription.status !== 'string' ||
    !allowedSubscriptionStatuses.has(subscription.status)
  ) {
    return null;
  }

  return {
    workspace_id: workspaceId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId,
    plan_key: planKey,
    status: subscription.status,
    current_period_end:
      typeof periodEnd === 'number' ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: subscription.cancel_at_period_end === true,
  };
}

type SubscriptionIdentity = {
  stripe_subscription_id: string;
  status: string;
};

export function shouldApplySubscriptionUpdate(
  existing: SubscriptionIdentity | null,
  incoming: SubscriptionIdentity,
) {
  if (!existing || existing.stripe_subscription_id === incoming.stripe_subscription_id) return true;
  return existing.status === 'canceled' || existing.status === 'incomplete_expired';
}
