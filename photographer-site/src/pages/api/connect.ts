import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { resolveTrustedOrigin } from '@leon/platform-core/request-security';

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
const duplicateRecord = (message: string) => /duplicate key|unique constraint/i.test(message);
const unavailableAccount = (error: unknown) => error instanceof Stripe.errors.StripeError
  && (error.code === 'resource_missing' || error.statusCode === 404 || error.type === 'StripePermissionError');

export const POST: APIRoute = async ({ request, locals, url }) => {
  const publicOrigin = resolveTrustedOrigin(request.headers.get('origin'), url.origin);
  if (!publicOrigin) {
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
    let account: Stripe.Account | null = null;
    const createAccount = (idempotencyKey: string) => stripe.accounts.create({
      type: 'express',
      country: 'US',
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { workspace_id: workspaceId },
    }, { idempotencyKey });
    const replaceAccount = async (oldAccountId: string) => {
      const replacement = await createAccount(`studio-connect-account:${workspaceId}:replace:${oldAccountId}`);
      const installed = await client.replaceConnectedAccount({
        workspace_id: workspaceId,
        expected_account_id: oldAccountId,
        stripe_account_id: replacement.id,
        ...accountStatus(replacement),
      });
      if (installed.error) throw new Error('Replacement account could not be saved.');
      if (installed.data.length) return { accountId: replacement.id, account: replacement };
      const winner = await client.from('connected_payment_accounts')
        .select('stripe_account_id,onboarding_status,charges_enabled,payouts_enabled,details_submitted')
        .eq('workspace_id', workspaceId)
        .maybeSingle<Connection>();
      if (winner.error || !winner.data) throw new Error('Replacement account could not be synchronized.');
      const winningAccount = await stripe.accounts.retrieve(winner.data.stripe_account_id);
      if (winningAccount.deleted) throw new Error('Replacement account is unavailable.');
      return { accountId: winningAccount.id, account: winningAccount };
    };
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
      account = await createAccount(`studio-connect-account:${workspaceId}:initial`);
      accountId = account.id;
      const saved = await client.from('connected_payment_accounts').insert({
        workspace_id: workspaceId,
        stripe_account_id: account.id,
        ...accountStatus(account),
      });
      if (saved.error) {
        if (!duplicateRecord(saved.error.message)) return Response.json({ message: 'Stripe account could not be saved. Retry safely.' }, { status: 503 });
        const winner = await client.from('connected_payment_accounts')
          .select('stripe_account_id,onboarding_status,charges_enabled,payouts_enabled,details_submitted')
          .eq('workspace_id', workspaceId)
          .maybeSingle<Connection>();
        if (winner.error || !winner.data) return Response.json({ message: 'Stripe account could not be synchronized.' }, { status: 503 });
        accountId = winner.data.stripe_account_id;
        account = null;
      }
    }

    if (accountId && existing.data?.onboarding_status === 'disabled' && !account) {
      const disabled = { onboarding_status: 'disabled', charges_enabled: false, payouts_enabled: false, details_submitted: false };
      if (action === 'status') return Response.json({ ok: true, ...disabled });
      const replacement = await replaceAccount(accountId);
      accountId = replacement.accountId;
      account = replacement.account;
    }

    if (!accountId) return Response.json({ message: 'Stripe account could not be loaded.' }, { status: 503 });
    let retrieved: Stripe.Account | Stripe.DeletedAccount;
    try {
      retrieved = account ?? await stripe.accounts.retrieve(accountId);
    } catch (error) {
      if (!unavailableAccount(error)) throw error;
      const disabled = { onboarding_status: 'disabled', charges_enabled: false, payouts_enabled: false, details_submitted: false };
      const marked = await client.from('connected_payment_accounts').update(disabled)
        .eq('workspace_id', workspaceId)
        .eq('stripe_account_id', accountId);
      if (marked.error) return Response.json({ message: 'Stripe status could not be synchronized.' }, { status: 503 });
      if (action === 'status') return Response.json({ ok: true, ...disabled });
      const replacement = await replaceAccount(accountId);
      accountId = replacement.accountId;
      account = replacement.account;
      retrieved = replacement.account;
    }
    if (retrieved.deleted) {
      const disabled = { onboarding_status: 'disabled', charges_enabled: false, payouts_enabled: false, details_submitted: false };
      const marked = await client.from('connected_payment_accounts').update(disabled)
        .eq('workspace_id', workspaceId)
        .eq('stripe_account_id', accountId);
      if (marked.error) return Response.json({ message: 'Stripe status could not be synchronized.' }, { status: 503 });
      if (action === 'status') return Response.json({ ok: true, ...disabled });

      const replacement = await replaceAccount(accountId);
      accountId = replacement.accountId;
      account = replacement.account;
    } else account = retrieved;

    if (!account) return Response.json({ message: 'Stripe account could not be loaded.' }, { status: 503 });
    const status = accountStatus(account);
    const synchronized = await client.from('connected_payment_accounts').update(status).eq('workspace_id', workspaceId);
    if (synchronized.error) return Response.json({ message: 'Stripe status could not be synchronized.' }, { status: 503 });
    if (action === 'status') return Response.json({ ok: true, ...status });

    const link = await stripe.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      refresh_url: `${publicOrigin}/admin/invoices?connect=refresh`,
      return_url: `${publicOrigin}/admin/invoices?connect=complete`,
      collect: 'eventually_due',
    });
    return Response.json({ url: link.url, ...status });
  } catch {
    return Response.json({ message: 'Stripe Connect is temporarily unavailable.' }, { status: 502 });
  }
};
