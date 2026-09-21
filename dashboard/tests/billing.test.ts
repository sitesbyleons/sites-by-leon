import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { canManageBilling, canManageSubscription, canSendAdminHostingInvoice, canStartCheckout, checkoutAttemptIsOpen, getCheckoutPlan, getPlan, hostingAmountLabel, listClientHostingRows, parseDomainOptions, parseMonthlyCents, plans, publicBillingErrorMessage } from '../src/lib/billing';

const read = (path: string) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('custom hosting amounts', () => {
  it('parses a $20 monthly amount and domain choices without changing catalog prices', () => {
    expect(parseMonthlyCents('20')).toBe(2000);
    expect(parseMonthlyCents('20.00')).toBe(2000);
    expect(parseDomainOptions('ishotyouu.com\nishotyouu.org')).toEqual(['ishotyouu.com', 'ishotyouu.org']);
    expect(parseDomainOptions('https://ISHOTYOUU.com/')).toEqual(['ishotyouu.com']);
    expect(plans).toEqual([
      { key: 'essential', name: 'Essential', monthlyUsd: 25, priceEnv: 'STRIPE_PRICE_ESSENTIAL' },
      { key: 'studio', name: 'Studio', monthlyUsd: 35, priceEnv: 'STRIPE_PRICE_STUDIO' },
    ]);
  });

  it('returns no plan for an untrusted plan key', () => {
    expect(getPlan('made-up-plan')).toBeNull();
  });

  it('keeps legacy records readable without allowing new legacy checkouts', () => {
    expect(getPlan('signature')?.name).toBe('Signature');
    expect(getCheckoutPlan('signature')).toBeNull();
  });
});

describe('canStartCheckout', () => {
  it('requires an authenticated approved workspace with no active subscription', () => {
    expect(
      canStartCheckout({
        userId: 'user_123',
        workspaceStatus: 'approved',
        subscriptionStatus: null,
      }),
    ).toBe(true);

    expect(
      canStartCheckout({
        userId: 'user_123',
        workspaceStatus: 'lead',
        subscriptionStatus: null,
      }),
    ).toBe(false);

    expect(
      canStartCheckout({
        userId: 'user_123',
        workspaceStatus: 'approved',
        subscriptionStatus: 'active',
      }),
    ).toBe(false);
  });

  it('allows a canceled or expired subscription to be replaced', () => {
    for (const subscriptionStatus of ['canceled', 'incomplete_expired']) {
      expect(
        canStartCheckout({
          userId: 'user_123',
          workspaceStatus: 'approved',
          subscriptionStatus,
        }),
      ).toBe(true);
    }
  });
});

describe('canManageSubscription', () => {
  it('only opens the billing portal for a subscription that can still be managed', () => {
    expect(canManageSubscription('active')).toBe(true);
    expect(canManageSubscription('past_due')).toBe(true);
    expect(canManageSubscription('canceled')).toBe(false);
    expect(canManageSubscription('incomplete_expired')).toBe(false);
    expect(canManageSubscription(null)).toBe(false);
  });
});

describe('canSendAdminHostingInvoice', () => {
  it('allows Leon to invoice a lead client with an assigned plan and email', () => {
    expect(canSendAdminHostingInvoice({
      workspaceStatus: 'lead',
      subscriptionStatus: null,
      monthlyCents: 2000,
      billingEmail: 'hello@studio.example',
    })).toBe(true);
  });

  it('blocks invoices without a billing email or while a subscription is already active', () => {
    expect(canSendAdminHostingInvoice({
      workspaceStatus: 'lead',
      subscriptionStatus: null,
      planKey: 'essential',
      billingEmail: '',
    })).toBe(false);
    expect(canSendAdminHostingInvoice({
      workspaceStatus: 'active',
      subscriptionStatus: 'active',
      planKey: 'studio',
      billingEmail: 'hello@studio.example',
    })).toBe(false);
    expect(canSendAdminHostingInvoice({
      workspaceStatus: 'lead',
      subscriptionStatus: null,
      monthlyCents: 2000,
      billingEmail: 'hello@studio.example',
    })).toBe(true);
  });
});

describe('hosting amount labels', () => {
  it('labels a custom $20 amount without calling it Essential', () => {
    expect(hostingAmountLabel(2000, 'essential')).toBe('Custom · $20/mo');
    expect(hostingAmountLabel(3500, 'studio')).toBe('Studio · $35/mo');
    expect(hostingAmountLabel(null, 'essential')).toBe('Essential · $25/mo');
  });

  it('treats a checkout URL as closed when less than a minute remains', () => {
    const now = Date.parse('2026-08-27T18:00:00.000Z');
    expect(checkoutAttemptIsOpen({
      checkout_url: 'https://checkout.stripe.com/c/pay/test',
      expires_at: '2026-08-27T18:00:30.000Z',
    }, now)).toBe(false);
    expect(checkoutAttemptIsOpen({
      checkout_url: 'https://checkout.stripe.com/c/pay/test',
      expires_at: '2026-08-27T18:02:00.000Z',
    }, now)).toBe(true);
  });

  it('keeps Stripe errors visible without leaking secret values', () => {
    expect(publicBillingErrorMessage(new Error('Terms of service URL is not set in the Dashboard.'), 'fallback')).toBe(
      'Terms of service URL is not set in the Dashboard.',
    );
    expect(publicBillingErrorMessage(new Error('bad sk_live_abc'), 'Checkout could not start. Nothing was charged.')).toBe(
      'Checkout could not start. Nothing was charged.',
    );
  });

  it('lists unpaid custom hosting next to paid catalog subscriptions', () => {
    const rows = listClientHostingRows({
      workspaces: [
        { id: 'ws_ishotyouu', name: 'ISHOTYOUU' },
        { id: 'ws_fieldwork', name: 'Fieldwork Commercial' },
        { id: 'ws_northline', name: 'Northline Portraits' },
      ],
      projects: [
        { workspace_id: 'ws_ishotyouu', plan_key: 'essential', monthly_cents: 2000 },
        { workspace_id: 'ws_fieldwork', plan_key: 'studio', monthly_cents: 3500 },
        { workspace_id: 'ws_northline', plan_key: 'studio', monthly_cents: 3500 },
      ],
      subscriptions: [
        { workspace_id: 'ws_northline', plan_key: 'studio', status: 'active', current_period_end: '2026-09-10T00:00:00.000Z' },
      ],
      checkoutAttempts: [
        {
          workspace_id: 'ws_ishotyouu',
          checkout_url: 'https://checkout.stripe.com/c/pay/preview_ishotyouu',
          expires_at: '2026-08-27T19:00:00.000Z',
          monthly_cents: 2000,
          plan_key: 'essential',
        },
      ],
      includeWorkspaceIds: ['ws_ishotyouu', 'ws_fieldwork', 'ws_northline'],
      now: Date.parse('2026-08-27T18:00:00.000Z'),
    });

    expect(rows).toEqual([
      {
        workspaceId: 'ws_ishotyouu',
        clientName: 'ISHOTYOUU',
        amountLabel: 'Custom · $20/mo',
        statusKey: 'invoice_open',
        statusLabel: 'invoice open',
        nextAt: '2026-08-27T19:00:00.000Z',
      },
      {
        workspaceId: 'ws_fieldwork',
        clientName: 'Fieldwork Commercial',
        amountLabel: 'Studio · $35/mo',
        statusKey: 'not_billed',
        statusLabel: 'not billed',
        nextAt: null,
      },
      {
        workspaceId: 'ws_northline',
        clientName: 'Northline Portraits',
        amountLabel: 'Studio · $35/mo',
        statusKey: 'active',
        statusLabel: 'active',
        nextAt: '2026-09-10T00:00:00.000Z',
      },
    ]);
    expect(read('src/pages/admin/subscriptions.astro')).toContain('listClientHostingRows');
    expect(read('src/lib/admin.ts')).toContain("from('checkout_attempts')");
  });
});

describe('admin hosting invoice', () => {
  it('lets Leon send a custom monthly amount without changing public Essential or Studio prices', () => {
    const invoice = read('src/pages/api/admin/site-invoice.ts');
    expect(invoice).toContain('body?.monthly_usd');
    expect(invoice).toContain('price_data');
    expect(invoice).toContain("recurring: { interval: 'month'");
    expect(invoice).toContain('/admin/hosting?invoice=success');
    expect(invoice).not.toContain('payment_method_types');
    expect(plans.map((plan) => plan.monthlyUsd)).toEqual([25, 35]);
    const page = read('src/pages/admin/sites/[workspaceId].astro');
    expect(page).toContain('name="monthly_usd"');
    expect(page).toContain('Send hosting invoice');
    expect(page).toContain('Hosting rate and domains');
    expect(page).toContain('/api/admin/site-onboarding');
    expect(page).toContain('catalogForAmount?.key === plan.key');
    expect(page).toContain('data-open-url="true"');
    expect(page).toContain("form.hasAttribute('data-open-url')");
    expect(page).toContain("createElement('a')");
    expect(page).toContain('Open invoice link');
    expect(invoice).toContain('checkoutAttemptIsOpen');
    expect(invoice).toContain('publicBillingErrorMessage');
    expect(invoice).toContain('expires_at');
    expect(invoice).not.toContain("if (existing.data.checkout_url) return Response.json({ ok: true, url: existing.data.checkout_url");
  });
});

describe('canManageBilling', () => {
  it('permits owners and admins but not ordinary members', () => {
    expect(canManageBilling('owner')).toBe(true);
    expect(canManageBilling('admin')).toBe(true);
    expect(canManageBilling('member')).toBe(false);
    expect(canManageBilling(null)).toBe(false);
  });

  it('distinguishes a missing workspace from a forbidden workspace member', () => {
    for (const routePath of ['src/pages/api/billing/checkout.ts', 'src/pages/api/billing/portal.ts']) {
      const route = read(routePath);
      expect(route).toContain("resolved.reason === 'not-found'");
      expect(route.indexOf("resolved.reason === 'not-found'")).toBeLessThan(route.indexOf('!canManageBilling(resolved.role)'));
      expect(route).toContain("resolved.reason === 'forbidden'");
    }
  });
});

describe('billing portal configuration', () => {
  it('requires and passes an explicit Stripe Portal configuration', () => {
    const portal = read('src/pages/api/billing/portal.ts');
    const localEnv = read('.env.example');
    const productionEnv = read('../infra/ovh/secrets/dashboard.env.example');

    expect(portal).toContain('STRIPE_BILLING_PORTAL_CONFIGURATION');
    expect(portal).toContain('configuration: portalConfiguration');
    expect(localEnv).toMatch(/^STRIPE_BILLING_PORTAL_CONFIGURATION=bpc_/m);
    expect(productionEnv).toMatch(/^STRIPE_BILLING_PORTAL_CONFIGURATION=bpc_/m);
  });
});

describe('checkout reservation recovery', () => {
  it('does not reuse a nearly expired Stripe session deadline after a failed start', () => {
    const checkout = read('src/pages/api/billing/checkout.ts');
    expect(checkout).not.toContain('checkoutExpiresAt = new Date(existing.data.expires_at)');
    expect(checkout).toContain('Checkout is already starting. Try again shortly.');
    expect(checkout).toContain('checkoutAttemptIsOpen');
    expect(checkout).toContain('publicBillingErrorMessage');
    expect(checkout).toContain(".eq('attempt_key', attemptKey)");
    expect(checkout).toContain('!saved.data.length');
    expect(checkout).toContain('stripe.checkout.sessions.expire(session.id)');
    expect(checkout).toContain("consent_collection: { terms_of_service: 'required' }");
    expect(checkout).toContain('workspace.error || subscription.error');
    expect(checkout).toContain('project.data.plan_key !== plan.key');
    expect(checkout).toContain('This is not the hosting plan assigned to your website.');
    expect(checkout).toContain("request.headers.get('accept')?.includes('application/json')");
    expect(checkout).toContain('Response.json({ url: checkoutUrl })');
  });
});

describe('test checkout isolation', () => {
  it('uses test-only keys and prices without writing live subscription records', () => {
    const checkout = read('src/pages/api/billing/test-checkout.ts');
    expect(checkout).toContain("url.hostname !== 'test.leonsites.org'");
    expect(checkout).toContain('STRIPE_TEST_SECRET_KEY');
    expect(checkout).toContain('STRIPE_TEST_PRICE_ESSENTIAL');
    expect(checkout).toContain("environment: 'test'");
    expect(checkout).not.toContain("from('subscriptions').upsert");
    expect(checkout).not.toContain('stripe_customer_id:');
  });
});

describe('subscription webhook isolation', () => {
  it('acknowledges unrelated Stripe subscriptions and only cleans up known workspaces', () => {
    const webhook = read('src/pages/api/webhooks/stripe.ts');
    expect(webhook).toContain('ignored: true');
    expect(webhook).toContain("from('client_workspaces')");
    expect(webhook.indexOf("from('client_workspaces')")).toBeLessThan(webhook.indexOf('applyHostingSubscriptionSnapshot(hostingExecutor'));
    expect(webhook).not.toContain('database.syncSubscription');
  });

  it('only clears the checkout reservation completed by the matching Stripe Session', () => {
    const webhook = read('src/pages/api/webhooks/stripe.ts');
    expect(webhook).toContain("event.type === 'checkout.session.completed'");
    expect(webhook).toContain(".eq('stripe_session_id', completedSessionId)");
    expect(webhook).not.toContain("delete().eq('workspace_id', workspaceId);");
  });

  it('uses checked event finalization for processed and failed outcomes', () => {
    const webhook = read('src/pages/api/webhooks/stripe.ts');
    expect(webhook).toContain("from '@leon/platform-core/stripe-events'");
    expect(webhook).toContain('await markStripeEvent');
    expect(webhook).not.toContain("from('stripe_events').update");
  });

  it('rejects a missing Stripe signature as a bad request', () => {
    const webhook = read('src/pages/api/webhooks/stripe.ts');
    expect(webhook).toContain(
      "if (!signature) return Response.json({ message: 'Invalid Stripe signature.' }, { status: 400 });",
    );
  });

  it('bounds webhook bodies and verification pressure before parsing', () => {
    const webhook = read('src/pages/api/webhooks/stripe.ts');
    const caddy = read('../infra/ovh/Caddyfile');

    expect(webhook).toContain('STRIPE_WEBHOOK_MAX_BYTES = 256 * 1024');
    expect(webhook).toContain('STRIPE_WEBHOOK_MAX_CONCURRENT_VERIFICATIONS = 8');
    expect(webhook).toContain('STRIPE_WEBHOOK_MAX_VERIFICATIONS_PER_MINUTE = 120');
    expect(webhook).toContain('readLimitedBody(request, STRIPE_WEBHOOK_MAX_BYTES)');
    expect(webhook).toContain("status: 413");
    expect(webhook).toContain("status: 429");
    expect(webhook).not.toContain('await request.text()');
    expect(caddy).toContain('@stripe_webhook path /api/webhooks/stripe /api/webhooks/stripe/');
    expect(caddy).toMatch(/request_body @stripe_webhook \{\s+max_size 256KB/);
  });
});
