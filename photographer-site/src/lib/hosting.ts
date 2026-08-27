const hostnamePattern = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
const paidStatuses = new Set(['active', 'trialing']);
const dueStatuses = new Set(['past_due', 'unpaid', 'incomplete']);

export type StudioHosting = {
  monthly_cents: number | null;
  domain_options: string[];
  chosen_domain: string | null;
  plan_key: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  checkout_url: string | null;
  checkout_expires_at: string | null;
};

export function domainChoiceCopy(host: string) {
  const parts = host.toLowerCase().split('.').filter(Boolean);
  const tld = parts.length > 1 ? parts.slice(1).join('.') : '';
  const name = parts[0] ?? host;
  return {
    host,
    name,
    tld,
    badge: tld ? `.${tld}` : host,
    hint: tld === 'com' ? 'The usual web address' : tld === 'org' ? 'The .org address' : 'Use this address',
  };
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

export function hostingDollars(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function checkoutLinkIsOpen(hosting: Pick<StudioHosting, 'checkout_url' | 'checkout_expires_at'>, now = Date.now()) {
  if (!hosting.checkout_url || !hosting.checkout_expires_at) return false;
  const expires = Date.parse(hosting.checkout_expires_at);
  return Number.isFinite(expires) && expires > now + 60_000;
}

export function hostingBillCopy(hosting: StudioHosting) {
  const amount = hosting.monthly_cents ? hostingDollars(hosting.monthly_cents) : null;
  const monthly = amount ? `${amount} a month` : 'the monthly hosting amount Leon set';
  if (hosting.subscription_status && paidStatuses.has(hosting.subscription_status)) {
    const next = hosting.current_period_end
      ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(hosting.current_period_end))
      : null;
    return {
      status: 'paid' as const,
      title: amount ? `${amount} / month` : 'Paid',
      detail: next ? `Hosting is paid. Next bill ${next}.` : 'Hosting is paid.',
      owe: 'Nothing due',
      payUrl: null as string | null,
    };
  }
  if (hosting.subscription_status && dueStatuses.has(hosting.subscription_status)) {
    return {
      status: 'due' as const,
      title: amount ? `You owe ${monthly}` : 'Payment needed',
      detail: 'The hosting subscription needs a payment before the next period is covered.',
      owe: amount ?? 'Amount due',
      payUrl: checkoutLinkIsOpen(hosting) ? hosting.checkout_url : null,
    };
  }
  if (checkoutLinkIsOpen(hosting)) {
    return {
      status: 'invoice' as const,
      title: amount ? `You owe ${monthly}` : 'Invoice ready',
      detail: 'Leon sent a Stripe payment for this website. Nothing is charged until you pay.',
      owe: amount ?? 'Invoice sent',
      payUrl: hosting.checkout_url,
    };
  }
  return {
    status: 'waiting' as const,
    title: amount ? monthly : 'Not billed yet',
    detail: amount
      ? `This website is ${monthly}. Leon will send the Stripe payment when you are ready.`
      : 'Leon has not set a monthly hosting amount yet.',
    owe: amount ? `${amount} / month` : 'Not billed yet',
    payUrl: null as string | null,
  };
}
