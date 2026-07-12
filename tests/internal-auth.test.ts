import { describe, expect, it } from 'vitest';

describe('self-hosted photographer payments', () => {
  it('keeps Stripe and workspace authorization server-only', async () => {
    const connectSource = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../photographer-site/src/pages/api/connect.ts', import.meta.url), 'utf8'),
    );
    expect(connectSource).toContain('process.env.STRIPE_CONNECT_SECRET_KEY');
    expect(connectSource).toContain('resolveManagedStudio(auth.userId)');
    expect(connectSource).toContain("request.headers.get('origin') !== url.origin");
    expect(connectSource).not.toContain('PUBLIC_CONNECT_FUNCTION_URL');
  });

  it('verifies Connect webhook signatures before trusting Stripe events', async () => {
    const webhookSource = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../photographer-site/src/pages/api/webhooks/stripe-connect.ts', import.meta.url), 'utf8'),
    );
    expect(webhookSource).toContain("request.headers.get('stripe-signature')");
    expect(webhookSource).toContain('constructEventAsync');
    expect(webhookSource).toContain("from('stripe_events').insert");
  });
});
