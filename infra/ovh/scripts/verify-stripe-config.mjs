#!/usr/bin/env node
import Stripe from 'stripe';

const platformEvents = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
];
const connectSnapshotEvents = [
  'account.updated',
  'account.application.deauthorized',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.voided',
  'invoice.marked_uncollectible',
];
const connectThinEvents = [
  'v2.core.account.updated',
  'v2.core.account[configuration.merchant].updated',
  'v2.core.account[configuration.merchant].capability_status_updated',
];
const prices = [
  ['essential', 'STRIPE_PRICE_ESSENTIAL', 2_500],
  ['studio', 'STRIPE_PRICE_STUDIO', 3_000],
  ['signature', 'STRIPE_PRICE_SIGNATURE', 4_000],
];
const legalUrls = {
  privacy: 'https://leonsites.org/privacy',
  terms: 'https://leonsites.org/terms',
};

class ConfigurationError extends Error {}

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new ConfigurationError(`${name} is required.`);
  return value;
};

const expectedLivemode = () => {
  const value = required('STRIPE_EXPECTED_MODE');
  if (!['live', 'test'].includes(value)) {
    throw new ConfigurationError('STRIPE_EXPECTED_MODE must be live or test.');
  }
  return value === 'live';
};

const assertConfig = (condition, message) => {
  if (!condition) throw new ConfigurationError(message);
};

const assertEvents = (destination, requiredEvents) => {
  const enabled = new Set(destination.enabled_events);
  for (const event of requiredEvents) {
    assertConfig(enabled.has(event), `Event destination ${destination.id} is missing ${event}.`);
  }
};

const originAliases = {
  self: new Set(['@self', 'self']),
  connected: new Set(['@accounts', 'other_accounts']),
};

const listEventDestinations = async (stripe) => {
  const destinations = [];
  const request = stripe.v2.core.eventDestinations.list({
    include: ['webhook_endpoint.url'],
    limit: 100,
  });
  for await (const destination of request) destinations.push(destination);
  return destinations;
};

const destinationAt = (destinations, url) => {
  const matches = destinations.filter((destination) =>
    destination.status === 'enabled' && destination.webhook_endpoint?.url === url);
  assertConfig(matches.length === 1, `Expected exactly one enabled Event Destination for ${url}.`);
  return matches[0];
};

const verifyDestination = (destination, input) => {
  assertConfig(destination.status === 'enabled', `Event destination ${destination.id} is not enabled.`);
  assertConfig(destination.livemode === input.livemode, `Event destination ${destination.id} is in the wrong mode.`);
  assertConfig(destination.event_payload === input.payload, `Event destination ${destination.id} has the wrong payload type.`);
  assertConfig(destination.events_from?.length === 1 && originAliases[input.origin].has(destination.events_from[0]),
    `Event destination ${destination.id} has the wrong event origin.`);
  assertEvents(destination, input.events);
  return {
    id: destination.id,
    status: destination.status,
    livemode: destination.livemode,
    event_payload: destination.event_payload,
    events_from: destination.events_from,
    enabled_events: destination.enabled_events,
    url: destination.webhook_endpoint?.url,
  };
};

const verifyPlatform = async (stripe, livemode) => {
  const verifiedPrices = [];
  for (const [plan, variable, amount] of prices) {
    const price = await stripe.prices.retrieve(required(variable));
    assertConfig(price.active, `${plan} price is not active.`);
    assertConfig(price.livemode === livemode, `${plan} price is in the wrong mode.`);
    assertConfig(price.currency === 'usd', `${plan} price must use USD.`);
    assertConfig(price.unit_amount === amount, `${plan} price has the wrong amount.`);
    assertConfig(price.type === 'recurring' && price.recurring?.interval === 'month', `${plan} price must recur monthly.`);
    verifiedPrices.push({ plan, id: price.id, active: price.active, livemode: price.livemode });
  }

  const portal = await stripe.billingPortal.configurations.retrieve(required('STRIPE_BILLING_PORTAL_CONFIGURATION'));
  assertConfig(portal.active, 'Billing Portal configuration is not active.');
  assertConfig(portal.livemode === livemode, 'Billing Portal configuration is in the wrong mode.');
  assertConfig(portal.features.invoice_history.enabled, 'Billing Portal invoice history is disabled.');
  assertConfig(portal.features.payment_method_update.enabled, 'Billing Portal payment method updates are disabled.');
  assertConfig(portal.features.subscription_cancel.enabled, 'Billing Portal cancellation is disabled.');
  assertConfig(portal.features.subscription_cancel.mode === 'at_period_end', 'Billing Portal must cancel at period end.');
  assertConfig(!portal.features.subscription_update.enabled, 'Billing Portal subscription updates must be disabled.');
  assertConfig(portal.business_profile.privacy_policy_url === legalUrls.privacy,
    'Billing Portal privacy policy URL is incorrect.');
  assertConfig(portal.business_profile.terms_of_service_url === legalUrls.terms,
    'Billing Portal terms of service URL is incorrect.');

  const destinations = await listEventDestinations(stripe);
  const endpoint = verifyDestination(
    destinationAt(destinations, process.env.STRIPE_PLATFORM_WEBHOOK_URL ?? 'https://leonsites.org/api/webhooks/stripe'),
    { livemode, payload: 'snapshot', origin: 'self', events: platformEvents },
  );

  return {
    prices: verifiedPrices,
    portal: {
      id: portal.id,
      active: portal.active,
      livemode: portal.livemode,
      privacy_policy_url: portal.business_profile.privacy_policy_url,
      terms_of_service_url: portal.business_profile.terms_of_service_url,
    },
    destinations: [endpoint],
  };
};

const verifyConnect = async (stripe, livemode) => {
  const destinations = await listEventDestinations(stripe);
  const snapshot = verifyDestination(
    destinationAt(destinations, process.env.STRIPE_CONNECT_WEBHOOK_URL ?? 'https://demo.leonsites.org/api/webhooks/stripe-connect'),
    { livemode, payload: 'snapshot', origin: 'connected', events: connectSnapshotEvents },
  );
  const thin = verifyDestination(
    destinationAt(destinations, process.env.STRIPE_CONNECT_V2_WEBHOOK_URL ?? 'https://demo.leonsites.org/api/webhooks/stripe-connect-v2'),
    { livemode, payload: 'thin', origin: 'connected', events: connectThinEvents },
  );
  return { destinations: [snapshot, thin] };
};

const profile = process.argv[2];
if (!['platform', 'connect'].includes(profile)) {
  console.error('Usage: verify-stripe-config.mjs platform|connect');
  process.exit(2);
}

try {
  const livemode = expectedLivemode();
  const key = profile === 'platform'
    ? required('STRIPE_SECRET_KEY')
    : process.env.STRIPE_CONNECT_SECRET_KEY?.trim() || required('STRIPE_SECRET_KEY');
  const stripe = new Stripe(key, { maxNetworkRetries: 2, timeout: 20_000 });
  const details = profile === 'platform'
    ? await verifyPlatform(stripe, livemode)
    : await verifyConnect(stripe, livemode);
  console.log(JSON.stringify({ profile, mode: livemode ? 'live' : 'test', verified: true, ...details }, null, 2));
} catch (error) {
  console.error(error instanceof ConfigurationError ? error.message : 'Stripe API verification failed.');
  process.exit(1);
}
