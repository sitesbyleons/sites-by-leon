import Stripe from 'stripe';

export const connectAccountIncludes = [
  'configuration.merchant',
  'defaults',
  'requirements',
] satisfies Stripe.V2.Core.AccountRetrieveParams['include'];

export type ConnectAccountStatus = {
  onboarding_status: 'pending' | 'restricted' | 'enabled' | 'disabled';
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
};

export const disabledConnectStatus = (): ConnectAccountStatus => ({
  onboarding_status: 'disabled',
  charges_enabled: false,
  payouts_enabled: false,
  details_submitted: false,
});

export const connectAccountStatus = (account: Stripe.V2.Core.Account): ConnectAccountStatus => {
  if (account.closed || !account.configuration?.merchant?.applied) return disabledConnectStatus();

  const cardStatus = account.configuration.merchant.capabilities?.card_payments?.status;
  const payoutStatus = account.configuration.merchant.capabilities?.stripe_balance?.payouts?.status;
  const chargesEnabled = cardStatus === 'active';
  const payoutsEnabled = payoutStatus === 'active';
  const deadline = account.requirements?.summary?.minimum_deadline?.status;
  const detailsSubmitted = deadline !== 'currently_due' && deadline !== 'past_due';

  return {
    onboarding_status: chargesEnabled && payoutsEnabled
      ? 'enabled'
      : detailsSubmitted ? 'restricted' : 'pending',
    charges_enabled: chargesEnabled,
    payouts_enabled: payoutsEnabled,
    details_submitted: detailsSubmitted,
  };
};

export const connectAccountCreateParams = (
  workspaceId: string,
  displayName: string,
): Stripe.V2.Core.AccountCreateParams => ({
  dashboard: 'full',
  display_name: displayName,
  configuration: {
    merchant: {
      capabilities: {
        card_payments: { requested: true },
      },
    },
  },
  defaults: {
    currency: 'usd',
    locales: ['en-US'],
    responsibilities: {
      fees_collector: 'stripe',
      losses_collector: 'stripe',
    },
  },
  metadata: { workspace_id: workspaceId },
  include: connectAccountIncludes,
});

export const connectAccountLinkParams = (
  account: string,
  publicOrigin: string,
): Stripe.V2.Core.AccountLinkCreateParams => ({
  account,
  use_case: {
    type: 'account_onboarding',
    account_onboarding: {
      configurations: ['merchant'],
      refresh_url: `${publicOrigin}/admin/invoices?connect=refresh`,
      return_url: `${publicOrigin}/admin/invoices?connect=complete`,
      collection_options: {
        fields: 'eventually_due',
        future_requirements: 'include',
      },
    },
  },
});

export const isUnavailableConnectAccount = (error: unknown) => error instanceof Stripe.errors.StripeError
  && (error.code === 'resource_missing'
    || error.code === 'not_found'
    || error.statusCode === 404
    || error.type === 'StripePermissionError');

export const safeConnectErrorMessage = (error: unknown) => {
  if (!(error instanceof Stripe.errors.StripeError)) return 'Stripe could not open right now. Try again.';
  if (error.code === 'accounts_v2_access_blocked') {
    return 'Stripe Connect needs to be enabled for this platform. Leon has been notified.';
  }
  if (error.code === 'configs_must_match_to_use_account_links') {
    return 'Stripe needs a fresh account setup. Try Connect Stripe again.';
  }
  if (error.statusCode === 429) return 'Stripe is busy right now. Wait a moment and try again.';
  return 'Stripe could not open right now. Try again.';
};
