import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  configureConnect,
  configurePlans,
  configurePlatform,
  setEnvValue,
} from '../infra/ovh/scripts/configure-stripe-resources.mjs';

const temporaryDirectories: string[] = [];

const envFile = (contents: string) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'leon-stripe-config-'));
  temporaryDirectories.push(directory);
  const file = path.join(directory, 'runtime.env');
  fs.writeFileSync(file, contents, { mode: 0o600 });
  return file;
};

const destinations = (items: unknown[]) => ({
  async *[Symbol.asyncIterator]() {
    for (const item of items) yield item;
  },
});

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('Stripe resource configuration', () => {
  it('updates exactly one chmod-600 regular env file value atomically', () => {
    const file = envFile('KEEP=value\nTARGET=old\n');

    setEnvValue(file, 'TARGET', 'new');

    expect(fs.readFileSync(file, 'utf8')).toBe('KEEP=value\nTARGET=new\n');
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(fs.readdirSync(path.dirname(file))).toEqual(['runtime.env']);
  });

  it('rejects permissive files, symlinks, duplicate keys, and newline values', () => {
    const permissive = envFile('TARGET=old\n');
    fs.chmodSync(permissive, 0o640);
    expect(() => setEnvValue(permissive, 'TARGET', 'new')).toThrow(/mode 600/);

    const duplicate = envFile('TARGET=one\nTARGET=two\n');
    expect(() => setEnvValue(duplicate, 'TARGET', 'new')).toThrow(/exactly once/);

    const target = envFile('TARGET=old\n');
    const symlink = `${target}.link`;
    fs.symlinkSync(target, symlink);
    expect(() => setEnvValue(symlink, 'TARGET', 'new')).toThrow(/regular file/);
    expect(() => setEnvValue(target, 'TARGET', 'line one\nline two')).toThrow(/single-line/);
  });

  it('creates a constrained Billing Portal configuration and persists its id', async () => {
    const file = envFile('STRIPE_BILLING_PORTAL_CONFIGURATION=\n');
    const create = vi.fn(async () => ({ id: 'bpc_live', active: true, livemode: true }));
    const stripe = { billingPortal: { configurations: { create, retrieve: vi.fn() } } };

    const result = await configurePlatform(stripe, file, {
      STRIPE_EXPECTED_MODE: 'live',
    });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      default_return_url: 'https://leonsites.org/dashboard/billing',
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
    }));
    expect(fs.readFileSync(file, 'utf8')).toContain('STRIPE_BILLING_PORTAL_CONFIGURATION=bpc_live');
    expect(result).toEqual({ created: true, portal_configuration: 'bpc_live' });
  });

  it('reuses an existing Billing Portal configuration without mutating Stripe', async () => {
    const file = envFile('STRIPE_BILLING_PORTAL_CONFIGURATION=bpc_existing\n');
    const retrieve = vi.fn(async () => ({ id: 'bpc_existing', active: true, livemode: false }));
    const update = vi.fn(async (id: string, input: Record<string, unknown>) => ({
      id,
      active: true,
      livemode: false,
      ...input,
    }));
    const create = vi.fn();
    const stripe = { billingPortal: { configurations: { create, retrieve, update } } };

    const result = await configurePlatform(stripe, file, {
      STRIPE_EXPECTED_MODE: 'test',
      STRIPE_BILLING_PORTAL_CONFIGURATION: 'bpc_existing',
    });

    expect(retrieve).toHaveBeenCalledWith('bpc_existing');
    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith('bpc_existing', expect.objectContaining({
      default_return_url: 'https://test.leonsites.org/dashboard/billing',
      business_profile: expect.objectContaining({
        privacy_policy_url: 'https://test.leonsites.org/privacy',
        terms_of_service_url: 'https://test.leonsites.org/terms',
      }),
    }));
    expect(result).toEqual({ created: false, updated: true, portal_configuration: 'bpc_existing' });
  });

  it('replaces retired public prices atomically while preserving the current $25 price', async () => {
    const file = envFile([
      'STRIPE_PRICE_ESSENTIAL=price_essential',
      'STRIPE_PRICE_STUDIO=price_studio_old',
      'STRIPE_PRICE_SIGNATURE=price_signature',
      'STRIPE_TEST_PRICE_ESSENTIAL=price_essential_old_alias',
      'STRIPE_TEST_PRICE_STUDIO=price_studio_old',
      '',
    ].join('\n'));
    const records: Record<string, Record<string, unknown>> = {
      price_essential: {
        id: 'price_essential', active: true, livemode: false, currency: 'usd',
        unit_amount: 2_500, type: 'recurring', recurring: { interval: 'month' },
        product: { id: 'prod_essential', livemode: false },
      },
      price_studio_old: {
        id: 'price_studio_old', active: true, livemode: false, currency: 'usd',
        unit_amount: 3_000, type: 'recurring', recurring: { interval: 'month' },
        product: { id: 'prod_studio', livemode: false },
      },
      price_signature: {
        id: 'price_signature', active: true, livemode: false, currency: 'usd',
        unit_amount: 4_000, type: 'recurring', recurring: { interval: 'month' },
        product: 'prod_signature',
      },
    };
    const retrieve = vi.fn(async (id: string) => records[id]);
    const create = vi.fn(async () => ({
      id: 'price_studio_35',
      active: true,
      livemode: false,
      currency: 'usd',
      unit_amount: 3_500,
      type: 'recurring',
      recurring: { interval: 'month' },
      product: 'prod_studio',
    }));
    const updatePrice = vi.fn(async (id: string, input: Record<string, unknown>) => ({ id, ...input }));
    const updateProduct = vi.fn(async (id: string, input: Record<string, unknown>) => ({ id, ...input }));
    const stripe = {
      prices: { create, retrieve, update: updatePrice },
      products: {
        create: vi.fn(),
        search: vi.fn(),
        update: updateProduct,
      },
    };

    const result = await configurePlans(stripe, file, {
      STRIPE_EXPECTED_MODE: 'test',
      STRIPE_PRICE_ESSENTIAL: 'price_essential',
      STRIPE_PRICE_STUDIO: 'price_studio_old',
      STRIPE_PRICE_SIGNATURE: 'price_signature',
      STRIPE_TEST_PRICE_ESSENTIAL: 'price_essential_old_alias',
      STRIPE_TEST_PRICE_STUDIO: 'price_studio_old',
    });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      currency: 'usd',
      product: 'prod_studio',
      recurring: { interval: 'month' },
      unit_amount: 3_500,
    }), expect.objectContaining({ idempotencyKey: expect.stringContaining('studio:3500:test') }));
    expect(updatePrice).toHaveBeenCalledWith('price_studio_old', { active: false });
    expect(updatePrice).toHaveBeenCalledWith('price_signature', { active: false });
    expect(fs.readFileSync(file, 'utf8')).toContain('STRIPE_PRICE_STUDIO=price_studio_35');
    expect(fs.readFileSync(file, 'utf8')).toContain('STRIPE_TEST_PRICE_STUDIO=price_studio_35');
    expect(fs.readFileSync(file, 'utf8')).toContain('STRIPE_TEST_PRICE_ESSENTIAL=price_essential');
    expect(result).toMatchObject({
      plans: [
        { key: 'essential', price_id: 'price_essential', amount: 2_500, created: false },
        { key: 'studio', price_id: 'price_studio_35', amount: 3_500, created: true },
      ],
      legacy_signature_retired: true,
    });
  });

  it('replaces the wrong Connect origin only after persisting the new signing secret', async () => {
    const file = envFile('STRIPE_CONNECT_WEBHOOK_SECRET=whsec_old\nSTRIPE_CONNECT_V2_WEBHOOK_SECRET=whsec_v2_old\n');
    const snapshotUrl = 'https://demo.leonsites.org/api/webhooks/stripe-connect';
    const thinUrl = 'https://demo.leonsites.org/api/webhooks/stripe-connect-v2';
    const oldSnapshot = {
      id: 'ed_old', status: 'enabled', livemode: true, event_payload: 'snapshot',
      events_from: ['@self'], enabled_events: ['account.updated'], webhook_endpoint: { url: snapshotUrl },
    };
    const thin = {
      id: 'ed_thin', status: 'enabled', livemode: true, event_payload: 'thin',
      events_from: ['@accounts'], enabled_events: ['v2.core.account.updated'], webhook_endpoint: { url: thinUrl },
    };
    const create = vi.fn(async () => ({
      id: 'ed_new', status: 'enabled', livemode: true, event_payload: 'snapshot',
      events_from: ['other_accounts'], enabled_events: [
        'account.updated', 'account.application.deauthorized', 'invoice.paid',
        'invoice.payment_failed', 'invoice.voided', 'invoice.marked_uncollectible',
      ], webhook_endpoint: { url: snapshotUrl, signing_secret: 'whsec_new' },
    }));
    const disable = vi.fn(async (id: string) => {
      if (id === 'ed_old') {
        expect(fs.readFileSync(file, 'utf8')).toContain('STRIPE_CONNECT_WEBHOOK_SECRET=whsec_new');
      }
      return { id, status: 'disabled' };
    });
    const update = vi.fn(async (id: string, input: Record<string, unknown>) => ({ id, ...input }));
    const stripe = {
      v2: { core: { eventDestinations: {
        list: vi.fn(() => destinations([oldSnapshot, thin])),
        create,
        disable,
        update,
      } } },
    };

    const result = await configureConnect(stripe, file, {
      STRIPE_EXPECTED_MODE: 'live',
      STRIPE_CONNECT_WEBHOOK_URL: snapshotUrl,
      STRIPE_CONNECT_V2_WEBHOOK_URL: thinUrl,
    });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      event_payload: 'snapshot',
      events_from: ['other_accounts'],
      include: ['webhook_endpoint.signing_secret', 'webhook_endpoint.url'],
      type: 'webhook_endpoint',
      webhook_endpoint: { url: snapshotUrl },
    }));
    expect(disable).toHaveBeenCalledWith('ed_old');
    expect(update).toHaveBeenCalledWith('ed_thin', expect.objectContaining({
      enabled_events: expect.arrayContaining([
        'v2.core.account.updated',
        'v2.core.account[configuration.merchant].updated',
        'v2.core.account[configuration.merchant].capability_status_updated',
      ]),
    }));
    expect(result).toEqual({
      snapshot_destination: 'ed_new',
      snapshot_replaced: true,
      thin_destination: 'ed_thin',
      thin_updated: true,
    });
  });

  it('deletes an invalid replacement and preserves the old secret when Stripe returns the wrong origin', async () => {
    const file = envFile('STRIPE_CONNECT_WEBHOOK_SECRET=whsec_old\nSTRIPE_CONNECT_V2_WEBHOOK_SECRET=whsec_v2_old\n');
    const snapshotUrl = 'https://demo.leonsites.org/api/webhooks/stripe-connect';
    const thinUrl = 'https://demo.leonsites.org/api/webhooks/stripe-connect-v2';
    const oldSnapshot = {
      id: 'we_old', status: 'enabled', livemode: true, event_payload: 'snapshot',
      events_from: ['@self'], enabled_events: ['account.updated'], webhook_endpoint: { url: snapshotUrl },
    };
    const thin = {
      id: 'ed_thin', status: 'enabled', livemode: true, event_payload: 'thin',
      events_from: ['@accounts'], enabled_events: ['v2.core.account.updated'], webhook_endpoint: { url: thinUrl },
    };
    const create = vi.fn(async () => ({
      id: 'ed_wrong', status: 'enabled', livemode: true, event_payload: 'snapshot',
      events_from: ['@self'], enabled_events: ['account.updated'],
      webhook_endpoint: { url: snapshotUrl, signing_secret: 'whsec_wrong' },
    }));
    const del = vi.fn(async (id: string) => ({ id, deleted: true }));
    const disable = vi.fn(async (id: string) => ({ id, status: 'disabled' }));
    const stripe = {
      v2: { core: { eventDestinations: {
        list: vi.fn(() => destinations([oldSnapshot, thin])),
        create,
        del,
        disable,
        update: vi.fn(),
      } } },
    };

    await expect(configureConnect(stripe, file, {
      STRIPE_EXPECTED_MODE: 'live',
      STRIPE_CONNECT_WEBHOOK_URL: snapshotUrl,
      STRIPE_CONNECT_V2_WEBHOOK_URL: thinUrl,
    })).rejects.toThrow(/Complete and activate the Connect platform profile/);

    expect(fs.readFileSync(file, 'utf8')).toContain('STRIPE_CONNECT_WEBHOOK_SECRET=whsec_old');
    expect(del).toHaveBeenCalledOnce();
    expect(del).toHaveBeenCalledWith('ed_wrong');
    expect(disable).not.toHaveBeenCalled();
  });

  it('disables an invalid replacement when Stripe deletion fails', async () => {
    const file = envFile('STRIPE_CONNECT_WEBHOOK_SECRET=whsec_old\nSTRIPE_CONNECT_V2_WEBHOOK_SECRET=whsec_v2_old\n');
    const snapshotUrl = 'https://demo.leonsites.org/api/webhooks/stripe-connect';
    const thinUrl = 'https://demo.leonsites.org/api/webhooks/stripe-connect-v2';
    const oldSnapshot = {
      id: 'we_old', status: 'enabled', livemode: true, event_payload: 'snapshot',
      events_from: ['@self'], enabled_events: ['account.updated'], webhook_endpoint: { url: snapshotUrl },
    };
    const thin = {
      id: 'ed_thin', status: 'enabled', livemode: true, event_payload: 'thin',
      events_from: ['@accounts'], enabled_events: ['v2.core.account.updated'], webhook_endpoint: { url: thinUrl },
    };
    const create = vi.fn(async () => ({
      id: 'ed_wrong', status: 'enabled', livemode: true, event_payload: 'snapshot',
      events_from: ['@self'], enabled_events: ['account.updated'],
      webhook_endpoint: { url: snapshotUrl, signing_secret: 'whsec_wrong' },
    }));
    const del = vi.fn(async () => { throw new Error('delete failed'); });
    const disable = vi.fn(async (id: string) => ({ id, status: 'disabled' }));
    const stripe = {
      v2: { core: { eventDestinations: {
        list: vi.fn(() => destinations([oldSnapshot, thin])),
        create,
        del,
        disable,
        update: vi.fn(),
      } } },
    };

    await expect(configureConnect(stripe, file, {
      STRIPE_EXPECTED_MODE: 'live',
      STRIPE_CONNECT_WEBHOOK_URL: snapshotUrl,
      STRIPE_CONNECT_V2_WEBHOOK_URL: thinUrl,
    })).rejects.toThrow(/Complete and activate the Connect platform profile/);

    expect(fs.readFileSync(file, 'utf8')).toContain('STRIPE_CONNECT_WEBHOOK_SECRET=whsec_old');
    expect(del).toHaveBeenCalledWith('ed_wrong');
    expect(disable).toHaveBeenCalledWith('ed_wrong');
    expect(disable).not.toHaveBeenCalledWith('we_old');
  });

  it('creates a missing thin Connect destination and persists its signing secret', async () => {
    const file = envFile('STRIPE_CONNECT_WEBHOOK_SECRET=whsec_existing\nSTRIPE_CONNECT_V2_WEBHOOK_SECRET=whsec_v2_old\n');
    const snapshotUrl = 'https://test-tenant.leonsites.org/api/webhooks/stripe-connect';
    const thinUrl = 'https://test-tenant.leonsites.org/api/webhooks/stripe-connect-v2';
    const snapshot = {
      id: 'ed_snapshot', status: 'enabled', livemode: false, event_payload: 'snapshot',
      events_from: ['@accounts'], enabled_events: [
        'account.updated', 'account.application.deauthorized', 'invoice.paid',
        'invoice.payment_failed', 'invoice.voided', 'invoice.marked_uncollectible',
      ], webhook_endpoint: { url: snapshotUrl },
    };
    const create = vi.fn(async () => ({
      id: 'ed_thin_new', status: 'enabled', livemode: false, event_payload: 'thin',
      events_from: ['other_accounts'], enabled_events: [
        'v2.core.account.updated',
        'v2.core.account[configuration.merchant].updated',
        'v2.core.account[configuration.merchant].capability_status_updated',
      ], webhook_endpoint: { url: thinUrl, signing_secret: 'whsec_v2_new' },
    }));
    const stripe = {
      v2: { core: { eventDestinations: {
        list: vi.fn(() => destinations([snapshot])),
        create,
        del: vi.fn(),
        disable: vi.fn(),
        update: vi.fn(),
      } } },
    };

    await expect(configureConnect(stripe, file, {
      STRIPE_EXPECTED_MODE: 'test',
      STRIPE_CONNECT_WEBHOOK_URL: snapshotUrl,
      STRIPE_CONNECT_V2_WEBHOOK_URL: thinUrl,
    })).resolves.toEqual({
      snapshot_destination: 'ed_snapshot',
      snapshot_replaced: false,
      thin_destination: 'ed_thin_new',
      thin_updated: true,
    });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      event_payload: 'thin',
      events_from: ['other_accounts'],
      include: ['webhook_endpoint.signing_secret', 'webhook_endpoint.url'],
      type: 'webhook_endpoint',
      webhook_endpoint: { url: thinUrl },
    }));
    expect(fs.readFileSync(file, 'utf8')).toContain('STRIPE_CONNECT_V2_WEBHOOK_SECRET=whsec_v2_new');
  });

  it('deletes an invalid thin replacement and preserves its old signing secret', async () => {
    const file = envFile('STRIPE_CONNECT_WEBHOOK_SECRET=whsec_existing\nSTRIPE_CONNECT_V2_WEBHOOK_SECRET=whsec_v2_old\n');
    const snapshotUrl = 'https://test-tenant.leonsites.org/api/webhooks/stripe-connect';
    const thinUrl = 'https://test-tenant.leonsites.org/api/webhooks/stripe-connect-v2';
    const snapshot = {
      id: 'ed_snapshot', status: 'enabled', livemode: false, event_payload: 'snapshot',
      events_from: ['@accounts'], enabled_events: [
        'account.updated', 'account.application.deauthorized', 'invoice.paid',
        'invoice.payment_failed', 'invoice.voided', 'invoice.marked_uncollectible',
      ], webhook_endpoint: { url: snapshotUrl },
    };
    const create = vi.fn(async () => ({
      id: 'ed_thin_wrong', status: 'enabled', livemode: false, event_payload: 'thin',
      events_from: ['@self'], enabled_events: ['v2.core.account.updated'],
      webhook_endpoint: { url: thinUrl, signing_secret: 'whsec_v2_wrong' },
    }));
    const del = vi.fn(async (id: string) => ({ id, deleted: true }));
    const disable = vi.fn();
    const stripe = {
      v2: { core: { eventDestinations: {
        list: vi.fn(() => destinations([snapshot])),
        create,
        del,
        disable,
        update: vi.fn(),
      } } },
    };

    await expect(configureConnect(stripe, file, {
      STRIPE_EXPECTED_MODE: 'test',
      STRIPE_CONNECT_WEBHOOK_URL: snapshotUrl,
      STRIPE_CONNECT_V2_WEBHOOK_URL: thinUrl,
    })).rejects.toThrow(/connected-account thin destination/);

    expect(fs.readFileSync(file, 'utf8')).toContain('STRIPE_CONNECT_V2_WEBHOOK_SECRET=whsec_v2_old');
    expect(del).toHaveBeenCalledWith('ed_thin_wrong');
    expect(disable).not.toHaveBeenCalled();
  });

  it('accepts the legacy connected-account origin while using the current API enum for new destinations', async () => {
    const file = envFile('STRIPE_CONNECT_WEBHOOK_SECRET=whsec_existing\nSTRIPE_CONNECT_V2_WEBHOOK_SECRET=whsec_v2_existing\n');
    const snapshotUrl = 'https://demo.leonsites.org/api/webhooks/stripe-connect';
    const thinUrl = 'https://demo.leonsites.org/api/webhooks/stripe-connect-v2';
    const stripe = {
      v2: { core: { eventDestinations: {
        list: vi.fn(() => destinations([
          {
            id: 'ed_snapshot', status: 'enabled', livemode: false, event_payload: 'snapshot',
            events_from: ['@accounts'], enabled_events: [
              'account.updated', 'account.application.deauthorized', 'invoice.paid',
              'invoice.payment_failed', 'invoice.voided', 'invoice.marked_uncollectible',
            ], webhook_endpoint: { url: snapshotUrl },
          },
          {
            id: 'ed_thin', status: 'enabled', livemode: false, event_payload: 'thin',
            events_from: ['other_accounts'], enabled_events: [
              'v2.core.account.updated',
              'v2.core.account[configuration.merchant].updated',
              'v2.core.account[configuration.merchant].capability_status_updated',
            ], webhook_endpoint: { url: thinUrl },
          },
        ])),
        create: vi.fn(), disable: vi.fn(), update: vi.fn(),
      } } },
    };

    await expect(configureConnect(stripe, file, {
      STRIPE_EXPECTED_MODE: 'test',
      STRIPE_CONNECT_WEBHOOK_URL: snapshotUrl,
      STRIPE_CONNECT_V2_WEBHOOK_URL: thinUrl,
    })).resolves.toEqual({
      snapshot_destination: 'ed_snapshot',
      snapshot_replaced: false,
      thin_destination: 'ed_thin',
      thin_updated: false,
    });
    expect(stripe.v2.core.eventDestinations.create).not.toHaveBeenCalled();
  });

  it('fails closed before Stripe mutation when the env file cannot safely store a secret', async () => {
    const file = envFile('STRIPE_CONNECT_WEBHOOK_SECRET=one\nSTRIPE_CONNECT_WEBHOOK_SECRET=two\n');
    const create = vi.fn();
    const stripe = {
      v2: { core: { eventDestinations: {
        list: vi.fn(() => destinations([])), create, disable: vi.fn(), update: vi.fn(),
      } } },
    };

    await expect(configureConnect(stripe, file, { STRIPE_EXPECTED_MODE: 'live' }))
      .rejects.toThrow(/exactly once/);
    expect(create).not.toHaveBeenCalled();
  });
});
