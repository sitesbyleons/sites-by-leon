import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { resolveTrustedOrigin } from '@leon/platform-core/request-security';

import { resolveManagedStudio } from '../../lib/studio';
import {
  connectAccountCreateParams,
  connectAccountIncludes,
  connectAccountLinkParams,
  connectAccountStatus,
  disabledConnectStatus,
  isUnavailableConnectAccount,
  safeConnectErrorMessage,
} from '../../lib/stripe-connect';

type Connection = {
  stripe_account_id: string;
  onboarding_status: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
};

const duplicateRecord = (message: string) => /duplicate key|unique constraint/i.test(message);
const stripeDiagnostic = (error: unknown) => error instanceof Stripe.errors.StripeError
  ? { type: error.type, code: error.code ?? null, status: error.statusCode ?? null }
  : { type: error instanceof Error ? error.name : 'unknown', code: null, status: null };

export const POST: APIRoute = async ({ request, locals, url }) => {
  const publicOrigin = resolveTrustedOrigin(request.headers.get('origin'), url.origin);
  if (!publicOrigin) {
    return Response.json({ message: 'Request not allowed.' }, { status: 403 });
  }
  const auth = locals.auth();
  if (!auth.userId) return Response.json({ message: 'Sign in again.' }, { status: 401 });

  const stripeKey = process.env.STRIPE_CONNECT_SECRET_KEY ?? process.env.STRIPE_SECRET_KEY;
  const { client, workspaceId } = await resolveManagedStudio(auth.userId, locals.siteContext.workspaceId);
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
    let account: Stripe.V2.Core.Account | null = null;
    const [workspace, settings] = await Promise.all([
      client.from('client_workspaces')
        .select('name')
        .eq('id', workspaceId)
        .maybeSingle<{ name: string }>(),
      client.from('studio_settings')
        .select('contact_email')
        .eq('workspace_id', workspaceId)
        .maybeSingle<{ contact_email: string | null }>(),
    ]);
    if (workspace.error || settings.error) return Response.json({ message: 'Studio details could not be loaded.' }, { status: 503 });
    const displayName = workspace.data?.name ?? 'Photography studio';
    const contactEmail = settings.data?.contact_email?.trim() ?? '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      return Response.json({ message: 'Add a valid contact email under Homepage before connecting Stripe.' }, { status: 422 });
    }
    const configuredCountry = process.env.STRIPE_CONNECT_DEFAULT_COUNTRY?.trim().toLowerCase() ?? 'us';
    const country = /^[a-z]{2}$/.test(configuredCountry) ? configuredCountry : 'us';
    const createAccount = (idempotencyKey: string) => stripe.v2.core.accounts.create(
      connectAccountCreateParams(workspaceId, displayName, contactEmail, country),
      { idempotencyKey },
    );
    const retrieveAccount = (id: string) => stripe.v2.core.accounts.retrieve(id, {
      include: connectAccountIncludes,
    });
    const replaceAccount = async (oldAccountId: string) => {
      const replacement = await createAccount(`studio-connect-account:v2-identity:${workspaceId}:${country}:replace:${oldAccountId}`);
      const installed = await client.replaceConnectedAccount({
        workspace_id: workspaceId,
        expected_account_id: oldAccountId,
        stripe_account_id: replacement.id,
        ...connectAccountStatus(replacement),
      });
      if (installed.error) throw new Error('Replacement account could not be saved.');
      if (installed.data.length) return { accountId: replacement.id, account: replacement };
      const winner = await client.from('connected_payment_accounts')
        .select('stripe_account_id,onboarding_status,charges_enabled,payouts_enabled,details_submitted')
        .eq('workspace_id', workspaceId)
        .maybeSingle<Connection>();
      if (winner.error || !winner.data) throw new Error('Replacement account could not be synchronized.');
      const winningAccount = await retrieveAccount(winner.data.stripe_account_id);
      if (winningAccount.closed) throw new Error('Replacement account is unavailable.');
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
      account = await createAccount(`studio-connect-account:v2-identity:${workspaceId}:${country}:initial`);
      accountId = account.id;
      const saved = await client.from('connected_payment_accounts').insert({
        workspace_id: workspaceId,
        stripe_account_id: account.id,
        ...connectAccountStatus(account),
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
      const disabled = disabledConnectStatus();
      if (action === 'status') return Response.json({ ok: true, ...disabled });
      const replacement = await replaceAccount(accountId);
      accountId = replacement.accountId;
      account = replacement.account;
    }

    if (!accountId) return Response.json({ message: 'Stripe account could not be loaded.' }, { status: 503 });
    let retrieved: Stripe.V2.Core.Account;
    try {
      retrieved = account ?? await retrieveAccount(accountId);
    } catch (error) {
      if (!isUnavailableConnectAccount(error)) throw error;
      const disabled = disabledConnectStatus();
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
    if (retrieved.closed) {
      const disabled = disabledConnectStatus();
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
    const status = connectAccountStatus(account);
    const synchronized = await client.from('connected_payment_accounts').update(status).eq('workspace_id', workspaceId);
    if (synchronized.error) return Response.json({ message: 'Stripe status could not be synchronized.' }, { status: 503 });
    if (action === 'status') return Response.json({ ok: true, ...status });

    const link = await stripe.v2.core.accountLinks.create(connectAccountLinkParams(accountId, publicOrigin));
    return Response.json({ url: link.url, ...status });
  } catch (error) {
    console.error('Stripe Connect request failed.', stripeDiagnostic(error));
    return Response.json({ message: safeConnectErrorMessage(error) }, { status: 502 });
  }
};
