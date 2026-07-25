#!/usr/bin/env node
import {
  closeSync,
  constants,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import Stripe from 'stripe';

const snapshotEvents = [
  'account.updated',
  'account.application.deauthorized',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.voided',
  'invoice.marked_uncollectible',
];

const thinEvents = [
  'v2.core.account.updated',
  'v2.core.account[configuration.merchant].updated',
  'v2.core.account[configuration.merchant].capability_status_updated',
];

export class ConfigurationError extends Error {}

const required = (environment, name) => {
  const value = environment[name]?.trim();
  if (!value) throw new ConfigurationError(`${name} is required.`);
  return value;
};

const expectedLivemode = (environment) => {
  const mode = required(environment, 'STRIPE_EXPECTED_MODE');
  if (!['live', 'test'].includes(mode)) {
    throw new ConfigurationError('STRIPE_EXPECTED_MODE must be live or test.');
  }
  return mode === 'live';
};

const assertConfiguration = (condition, message) => {
  if (!condition) throw new ConfigurationError(message);
};

const inspectEnvFile = (file, key, requireKey = false) => {
  let stat;
  try {
    stat = lstatSync(file);
  } catch {
    throw new ConfigurationError('The environment path must be an existing regular file.');
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new ConfigurationError('The environment path must be an existing regular file.');
  }
  if ((stat.mode & 0o777) !== 0o600) {
    throw new ConfigurationError('The environment file must use mode 600.');
  }
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) {
    throw new ConfigurationError('The environment file must belong to the current user.');
  }

  const contents = readFileSync(file, 'utf8');
  const prefix = `${key}=`;
  const matches = contents.split(/\r?\n/).filter((line) => line.startsWith(prefix));
  if (matches.length > 1 || (requireKey && matches.length !== 1)) {
    throw new ConfigurationError(`${key} must appear exactly once in the environment file.`);
  }
  return { contents, matches };
};

export const setEnvValue = (file, key, value) => {
  assertConfiguration(/^[A-Z_][A-Z0-9_]*$/.test(key), 'The environment key is invalid.');
  assertConfiguration(typeof value === 'string' && !/[\r\n\0]/.test(value), 'Environment values must be single-line strings.');

  const { contents, matches } = inspectEnvFile(file, key);
  const replacement = `${key}=${value}`;
  let updated;
  if (matches.length === 1) {
    updated = contents.split(/\r?\n/)
      .map((line) => line.startsWith(`${key}=`) ? replacement : line)
      .join('\n');
  } else {
    updated = `${contents}${contents && !contents.endsWith('\n') ? '\n' : ''}${replacement}\n`;
  }

  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  let descriptor;
  try {
    descriptor = openSync(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    writeFileSync(descriptor, updated, 'utf8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, file);

    const directoryDescriptor = openSync(path.dirname(file), constants.O_RDONLY);
    try {
      fsyncSync(directoryDescriptor);
    } finally {
      closeSync(directoryDescriptor);
    }
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    rmSync(temporary, { force: true });
    throw error;
  }
};

const assertResourceMode = (resource, livemode, label) => {
  assertConfiguration(resource.livemode === livemode, `${label} was created or selected in the wrong mode.`);
};

const portalBaseUrl = (environment, livemode) => environment.STRIPE_PORTAL_BASE_URL?.trim()
  || (livemode ? 'https://leonsites.org' : 'https://test.leonsites.org');

const portalInput = (environment, livemode) => ({
  name: 'Leon Sites subscription management',
  default_return_url: `${portalBaseUrl(environment, livemode)}/dashboard/billing`,
  business_profile: {
    headline: 'Manage your Leon Sites subscription and payment method.',
    privacy_policy_url: `${portalBaseUrl(environment, livemode)}/privacy`,
    terms_of_service_url: `${portalBaseUrl(environment, livemode)}/terms`,
  },
  features: {
    customer_update: { allowed_updates: [], enabled: false },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: {
      cancellation_reason: {
        enabled: true,
        options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'other'],
      },
      enabled: true,
      mode: 'at_period_end',
      proration_behavior: 'none',
    },
    subscription_update: { enabled: false },
  },
});

const platformPlans = [
  {
    key: 'essential',
    name: 'Sites By Leon Essential',
    description: 'Custom domain, control panel, invoicing, secure client payments, and 15 GB photo storage.',
    amount: 2_500,
    environmentKey: 'STRIPE_PRICE_ESSENTIAL',
    testEnvironmentKey: 'STRIPE_TEST_PRICE_ESSENTIAL',
  },
  {
    key: 'studio',
    name: 'Sites By Leon Studio',
    description: 'Essential features plus early access, advanced settings, 15 GB photo storage, and a social media post gallery.',
    amount: 3_500,
    environmentKey: 'STRIPE_PRICE_STUDIO',
    testEnvironmentKey: 'STRIPE_TEST_PRICE_STUDIO',
  },
];

const priceMatchesPlan = (price, plan, livemode) => price
  && price.active
  && price.livemode === livemode
  && price.currency === 'usd'
  && price.unit_amount === plan.amount
  && price.type === 'recurring'
  && price.recurring?.interval === 'month';

const productIdFromPrice = (price) => typeof price?.product === 'string'
  ? price.product
  : price?.product?.id;

const persistPriceId = (envFile, environment, key, priceId) => {
  setEnvValue(envFile, key, priceId);
  environment[key] = priceId;
};

export const configurePlans = async (stripe, envFile, environment = process.env) => {
  const livemode = expectedLivemode(environment);
  const configured = [];

  for (const plan of platformPlans) {
    inspectEnvFile(envFile, plan.environmentKey);
    const existingId = environment[plan.environmentKey]?.trim();
    const existing = existingId
      ? await stripe.prices.retrieve(existingId, { expand: ['product'] })
      : null;
    if (existing) assertResourceMode(existing, livemode, `${plan.name} price`);

    let productId = productIdFromPrice(existing);
    if (!productId) {
      const matches = await stripe.products.search({
        query: `metadata['leon_plan_key']:'${plan.key}'`,
        limit: 2,
      });
      assertConfiguration(matches.data.length <= 1, `Multiple Stripe products are tagged for ${plan.key}.`);
      const product = matches.data[0] ?? await stripe.products.create({
        name: plan.name,
        description: plan.description,
        metadata: { leon_plan_key: plan.key },
      }, { idempotencyKey: `leon-plan-product:${plan.key}:${livemode ? 'live' : 'test'}` });
      assertResourceMode(product, livemode, `${plan.name} product`);
      productId = product.id;
    }

    await stripe.products.update(productId, {
      active: true,
      name: plan.name,
      description: plan.description,
      metadata: { leon_plan_key: plan.key },
    });

    let price = existing;
    let created = false;
    if (!priceMatchesPlan(existing, plan, livemode)) {
      price = await stripe.prices.create({
        active: true,
        currency: 'usd',
        nickname: `${plan.name} monthly`,
        product: productId,
        recurring: { interval: 'month' },
        unit_amount: plan.amount,
      }, { idempotencyKey: `leon-plan-price:${plan.key}:${plan.amount}:${livemode ? 'live' : 'test'}` });
      assertConfiguration(priceMatchesPlan(price, plan, livemode), `Stripe created an invalid ${plan.key} price.`);
      persistPriceId(envFile, environment, plan.environmentKey, price.id);
      if (existing?.active) await stripe.prices.update(existing.id, { active: false });
      created = true;
    }

    const testAlias = environment[plan.testEnvironmentKey];
    if (!livemode && testAlias !== undefined && testAlias.trim() !== price.id) {
      persistPriceId(envFile, environment, plan.testEnvironmentKey, price.id);
    }

    configured.push({
      key: plan.key,
      price_id: price.id,
      product_id: productId,
      amount: plan.amount,
      created,
    });
  }

  const legacyPriceId = environment.STRIPE_PRICE_SIGNATURE?.trim();
  let legacySignatureRetired = false;
  if (legacyPriceId) {
    const legacy = await stripe.prices.retrieve(legacyPriceId);
    assertResourceMode(legacy, livemode, 'Legacy Signature price');
    if (legacy.active) {
      await stripe.prices.update(legacy.id, { active: false });
      legacySignatureRetired = true;
    }
  }

  return { plans: configured, legacy_signature_retired: legacySignatureRetired };
};

export const configurePlatform = async (stripe, envFile, environment = process.env) => {
  const livemode = expectedLivemode(environment);
  inspectEnvFile(envFile, 'STRIPE_BILLING_PORTAL_CONFIGURATION');
  const existingId = environment.STRIPE_BILLING_PORTAL_CONFIGURATION?.trim();
  const input = portalInput(environment, livemode);

  if (existingId) {
    const existing = await stripe.billingPortal.configurations.retrieve(existingId);
    assertResourceMode(existing, livemode, 'Billing Portal configuration');
    assertConfiguration(existing.active, 'Billing Portal configuration is not active.');
    const updated = await stripe.billingPortal.configurations.update(existing.id, input);
    assertResourceMode(updated, livemode, 'Billing Portal configuration');
    assertConfiguration(updated.active, 'Updated Billing Portal configuration is not active.');
    return { created: false, updated: true, portal_configuration: updated.id };
  }

  const configuration = await stripe.billingPortal.configurations.create(input);
  assertResourceMode(configuration, livemode, 'Billing Portal configuration');
  assertConfiguration(configuration.active, 'New Billing Portal configuration is not active.');
  setEnvValue(envFile, 'STRIPE_BILLING_PORTAL_CONFIGURATION', configuration.id);
  environment.STRIPE_BILLING_PORTAL_CONFIGURATION = configuration.id;
  return { created: true, portal_configuration: configuration.id };
};

const listDestinations = async (stripe) => {
  const found = [];
  const request = stripe.v2.core.eventDestinations.list({
    include: ['webhook_endpoint.url'],
    limit: 100,
  });
  for await (const destination of request) found.push(destination);
  return found;
};

const enabledAt = (destinations, url) => destinations.filter((destination) =>
  destination.status === 'enabled' && destination.webhook_endpoint?.url === url);

const includesAll = (actual, requiredEvents) => {
  const values = new Set(actual);
  return requiredEvents.every((event) => values.has(event));
};

const withRequiredEvents = (actual, requiredEvents) => [...new Set([...actual, ...requiredEvents])].sort();

const connectedAccountOrigins = new Set(['@accounts', 'other_accounts']);

const receivesConnectedAccountEvents = (destination) => destination.events_from?.length === 1
  && connectedAccountOrigins.has(destination.events_from[0]);

const isExpectedSnapshot = (destination, livemode) => destination
  && destination.livemode === livemode
  && destination.event_payload === 'snapshot'
  && receivesConnectedAccountEvents(destination);

export const configureConnect = async (stripe, envFile, environment = process.env) => {
  const livemode = expectedLivemode(environment);
  inspectEnvFile(envFile, 'STRIPE_CONNECT_WEBHOOK_SECRET', true);
  const snapshotUrl = environment.STRIPE_CONNECT_WEBHOOK_URL?.trim()
    || 'https://demo.leonsites.org/api/webhooks/stripe-connect';
  const thinUrl = environment.STRIPE_CONNECT_V2_WEBHOOK_URL?.trim()
    || 'https://demo.leonsites.org/api/webhooks/stripe-connect-v2';
  const destinations = await listDestinations(stripe);
  const snapshots = enabledAt(destinations, snapshotUrl);
  const thinDestinations = enabledAt(destinations, thinUrl);
  assertConfiguration(snapshots.length <= 1, `Expected no more than one enabled Event Destination for ${snapshotUrl}.`);
  assertConfiguration(thinDestinations.length === 1, `Expected exactly one enabled Event Destination for ${thinUrl}.`);

  const oldSnapshot = snapshots[0];
  let snapshot = oldSnapshot;
  let snapshotReplaced = false;
  if (!isExpectedSnapshot(oldSnapshot, livemode)) {
    const created = await stripe.v2.core.eventDestinations.create({
      name: 'Connected-account invoice events',
      description: 'Connected-account invoice events for the tenant-aware photographer runtime.',
      enabled_events: snapshotEvents,
      event_payload: 'snapshot',
      events_from: ['other_accounts'],
      include: ['webhook_endpoint.signing_secret', 'webhook_endpoint.url'],
      type: 'webhook_endpoint',
      webhook_endpoint: { url: snapshotUrl },
    });
    const secret = created.webhook_endpoint?.signing_secret;
    try {
      assertResourceMode(created, livemode, 'Connect snapshot destination');
      assertConfiguration(created.status === 'enabled', 'New Connect snapshot destination is not enabled.');
      assertConfiguration(isExpectedSnapshot(created, livemode),
        'Stripe did not create a connected-account destination. Complete and activate the Connect platform profile in the Stripe Dashboard before retrying.');
      assertConfiguration(created.webhook_endpoint?.url === snapshotUrl,
        'New Connect snapshot destination has the wrong URL.');
      assertConfiguration(includesAll(created.enabled_events, snapshotEvents),
        'New Connect snapshot destination is missing required events.');
      assertConfiguration(Boolean(secret), 'Stripe did not return the new Connect signing secret.');
      setEnvValue(envFile, 'STRIPE_CONNECT_WEBHOOK_SECRET', secret);
    } catch (error) {
      try {
        await stripe.v2.core.eventDestinations.del(created.id);
      } catch {
        await stripe.v2.core.eventDestinations.disable(created.id);
      }
      throw error;
    }

    environment.STRIPE_CONNECT_WEBHOOK_SECRET = secret;
    if (oldSnapshot) await stripe.v2.core.eventDestinations.disable(oldSnapshot.id);
    snapshot = created;
    snapshotReplaced = true;
  } else if (!includesAll(snapshot.enabled_events, snapshotEvents)) {
    snapshot = await stripe.v2.core.eventDestinations.update(snapshot.id, {
      enabled_events: withRequiredEvents(snapshot.enabled_events, snapshotEvents),
    });
  }

  const thin = thinDestinations[0];
  assertResourceMode(thin, livemode, 'Connect thin destination');
  assertConfiguration(thin.event_payload === 'thin', 'Connect account destination must use thin payloads.');
  assertConfiguration(receivesConnectedAccountEvents(thin),
    'Connect account destination must receive events from connected accounts.');
  const thinUpdated = !includesAll(thin.enabled_events, thinEvents);
  if (thinUpdated) {
    await stripe.v2.core.eventDestinations.update(thin.id, {
      enabled_events: withRequiredEvents(thin.enabled_events, thinEvents),
    });
  }

  return {
    snapshot_destination: snapshot.id,
    snapshot_replaced: snapshotReplaced,
    thin_destination: thin.id,
    thin_updated: thinUpdated,
  };
};

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const profile = process.argv[2];
  const envFile = process.argv[3];
  if (!['plans', 'platform', 'connect'].includes(profile) || !envFile) {
    console.error('Usage: configure-stripe-resources.mjs plans|platform|connect /path/to/runtime.env');
    process.exit(2);
  }

  try {
    process.loadEnvFile(envFile);
    const key = profile === 'platform' || profile === 'plans'
      ? required(process.env, 'STRIPE_SECRET_KEY')
      : process.env.STRIPE_CONNECT_SECRET_KEY?.trim() || required(process.env, 'STRIPE_SECRET_KEY');
    const stripe = new Stripe(key, { maxNetworkRetries: 2, timeout: 20_000 });
    const result = profile === 'plans'
      ? await configurePlans(stripe, envFile)
      : profile === 'platform'
        ? await configurePlatform(stripe, envFile)
        : await configureConnect(stripe, envFile);
    console.log(JSON.stringify({ profile, mode: process.env.STRIPE_EXPECTED_MODE, configured: true, ...result }, null, 2));
  } catch (error) {
    console.error(error instanceof ConfigurationError ? error.message : 'Stripe resource configuration failed.');
    process.exit(1);
  }
}
