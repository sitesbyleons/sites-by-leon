import type { APIRoute } from 'astro';
import Stripe from 'stripe';

import { resolveManagedStudio } from '../../lib/studio';

type Connection = {
  stripe_account_id: string;
  onboarding_status: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
};

const accountStatus = (account: Stripe.Account) => ({
  onboarding_status: account.charges_enabled && account.payouts_enabled
    ? 'enabled'
    : account.details_submitted ? 'restricted' : 'pending',
  charges_enabled: account.charges_enabled === true,
  payouts_enabled: account.payouts_enabled === true,
  details_submitted: account.details_submitted === true,
});

export const POST: APIRoute = async ({ request, locals, url }) => {
  if (request.headers.get('origin') !== url.origin) {
    return Response.json({ message: 'Request not allowed.' }, { status: 403 });
  }
  const auth = locals.auth();
  if (!auth.userId) return Response.json({ message: 'Sign in again.' }, { status: 401 });

  const stripeKey = process.env.STRIPE_CONNECT_SECRET_KEY ?? process.env.STRIPE_SECRET_KEY;
  const { client, workspaceId } = await resolveManagedStudio(auth.userId);
  if (!stripeKey) return Response.json({ message: 'Stripe Connect is not configured yet.' }, { status: 503 });
  if (!client || !workspaceId) return Response.json({ message: 'Studio owner access required.' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const action = body?.action === 'status' ? 'status' : 'start';
  const existing = await client
    .from('connected_payment_accounts')
    .select('stripe_account_id,onboarding_status,charges_enabled,payouts_enabled,details_submitted')
    .eq('workspace_id', workspaceId)
    .maybeSingle<Connection>();
  if (existing.error) return Response.json({ message: 'Stripe connection could not be loaded.' }, { status: 503 });

  try {
    const stripe = new Stripe(stripeKey);
    let accountId = existing.data?.stripe_account_id ?? null;
    if (!accountId && action === 'status') {
      return Response.json({
        ok: true,
        onboarding_status: 'not_started',
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
      });
    }

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        metadata: { workspace_id: workspaceId },
      });
      accountId = account.id;
      const saved = await client.from('connected_payment_accounts').insert({
        workspace_id: workspaceId,
        stripe_account_id: account.id,
        ...accountStatus(account),
      });
      if (saved.error) return Response.json({ message: 'Stripe account could not be saved.' }, { status: 503 });
    }

    const account = await stripe.accounts.retrieve(accountId);
    if (account.deleted) return Response.json({ message: 'The connected Stripe account is no longer available.' }, { status: 409 });
    const status = accountStatus(account);
    const synchronized = await client.from('connected_payment_accounts').update(status).eq('workspace_id', workspaceId);
    if (synchronized.error) return Response.json({ message: 'Stripe status could not be synchronized.' }, { status: 503 });
    if (action === 'status') return Response.json({ ok: true, ...status });

    const link = await stripe.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      refresh_url: `${url.origin}/admin/invoices?connect=refresh`,
      return_url: `${url.origin}/admin/invoices?connect=complete`,
      collect: 'eventually_due',
    });
    return Response.json({ url: link.url, ...status });
  } catch {
    return Response.json({ message: 'Stripe Connect is temporarily unavailable.' }, { status: 502 });
  }
};
