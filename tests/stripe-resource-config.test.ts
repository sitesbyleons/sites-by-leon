import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  configureConnect,
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
      default_return_url: 'https://leonsites.org/dashboard',
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
    const create = vi.fn();
    const stripe = { billingPortal: { configurations: { create, retrieve } } };

    const result = await configurePlatform(stripe, file, {
      STRIPE_EXPECTED_MODE: 'test',
      STRIPE_BILLING_PORTAL_CONFIGURATION: 'bpc_existing',
    });

    expect(retrieve).toHaveBeenCalledWith('bpc_existing');
    expect(create).not.toHaveBeenCalled();
    expect(result).toEqual({ created: false, portal_configuration: 'bpc_existing' });
  });

  it('replaces the wrong Connect origin only after persisting the new signing secret', async () => {
    const file = envFile('STRIPE_CONNECT_WEBHOOK_SECRET=whsec_old\n');
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
      id: 'we_new', status: 'enabled', livemode: true, connect: true,
      enabled_events: [], url: snapshotUrl, secret: 'whsec_new',
    }));
    const disable = vi.fn(async (id: string, input: unknown) => {
      expect(input).toEqual({ disabled: true });
      if (id === 'ed_old') {
        expect(fs.readFileSync(file, 'utf8')).toContain('STRIPE_CONNECT_WEBHOOK_SECRET=whsec_new');
      }
      return { id, status: 'disabled' };
    });
    const update = vi.fn(async (id: string, input: Record<string, unknown>) => ({ id, ...input }));
    const retrieve = vi.fn(async (id: string) => ({
      id, status: 'enabled', livemode: true, event_payload: 'snapshot',
      events_from: ['other_accounts'], enabled_events: [
        'account.updated', 'account.application.deauthorized', 'invoice.paid',
        'invoice.payment_failed', 'invoice.voided', 'invoice.marked_uncollectible',
      ], webhook_endpoint: { url: snapshotUrl },
    }));
    const stripe = {
      webhookEndpoints: { create, update: disable },
      v2: { core: { eventDestinations: {
        list: vi.fn(() => destinations([oldSnapshot, thin])),
        retrieve,
        update,
      } } },
    };

    const result = await configureConnect(stripe, file, {
      STRIPE_EXPECTED_MODE: 'live',
      STRIPE_CONNECT_WEBHOOK_URL: snapshotUrl,
      STRIPE_CONNECT_V2_WEBHOOK_URL: thinUrl,
    });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      connect: true,
      url: snapshotUrl,
    }));
    expect(disable).toHaveBeenCalledWith('ed_old', { disabled: true });
    expect(retrieve).toHaveBeenCalledWith('we_new', { include: ['webhook_endpoint.url'] });
    expect(update).toHaveBeenCalledWith('ed_thin', expect.objectContaining({
      enabled_events: expect.arrayContaining([
        'v2.core.account.updated',
        'v2.core.account[configuration.merchant].updated',
        'v2.core.account[configuration.merchant].capability_status_updated',
      ]),
    }));
    expect(result).toEqual({
      snapshot_destination: 'we_new',
      snapshot_replaced: true,
      thin_destination: 'ed_thin',
      thin_updated: true,
    });
  });

  it('disables a replacement and preserves the old secret when Stripe returns the wrong origin', async () => {
    const file = envFile('STRIPE_CONNECT_WEBHOOK_SECRET=whsec_old\n');
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
      id: 'we_wrong', status: 'enabled', livemode: true, secret: 'whsec_wrong', url: snapshotUrl,
    }));
    const disable = vi.fn(async (id: string) => ({ id, status: 'disabled' }));
    const stripe = {
      webhookEndpoints: { create, update: disable },
      v2: { core: { eventDestinations: {
        list: vi.fn(() => destinations([oldSnapshot, thin])),
        retrieve: vi.fn(async () => ({
          id: 'we_wrong', status: 'enabled', livemode: true, event_payload: 'snapshot',
          events_from: ['@self'], enabled_events: ['account.updated'], webhook_endpoint: { url: snapshotUrl },
        })),
        update: vi.fn(),
      } } },
    };

    await expect(configureConnect(stripe, file, {
      STRIPE_EXPECTED_MODE: 'live',
      STRIPE_CONNECT_WEBHOOK_URL: snapshotUrl,
      STRIPE_CONNECT_V2_WEBHOOK_URL: thinUrl,
    })).rejects.toThrow(/connected accounts/);

    expect(fs.readFileSync(file, 'utf8')).toContain('STRIPE_CONNECT_WEBHOOK_SECRET=whsec_old');
    expect(disable).toHaveBeenCalledTimes(1);
    expect(disable).toHaveBeenCalledWith('we_wrong', { disabled: true });
    expect(disable).not.toHaveBeenCalledWith('we_old', expect.anything());
  });

  it('accepts the legacy connected-account origin while using the current API enum for new destinations', async () => {
    const file = envFile('STRIPE_CONNECT_WEBHOOK_SECRET=whsec_existing\n');
    const snapshotUrl = 'https://demo.leonsites.org/api/webhooks/stripe-connect';
    const thinUrl = 'https://demo.leonsites.org/api/webhooks/stripe-connect-v2';
    const stripe = {
      webhookEndpoints: { create: vi.fn(), update: vi.fn() },
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
        retrieve: vi.fn(), update: vi.fn(),
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
    expect(stripe.webhookEndpoints.create).not.toHaveBeenCalled();
  });

  it('fails closed before Stripe mutation when the env file cannot safely store a secret', async () => {
    const file = envFile('STRIPE_CONNECT_WEBHOOK_SECRET=one\nSTRIPE_CONNECT_WEBHOOK_SECRET=two\n');
    const create = vi.fn();
    const stripe = {
      webhookEndpoints: { create, update: vi.fn() },
      v2: { core: { eventDestinations: {
        list: vi.fn(() => destinations([])), update: vi.fn(),
      } } },
    };

    await expect(configureConnect(stripe, file, { STRIPE_EXPECTED_MODE: 'live' }))
      .rejects.toThrow(/exactly once/);
    expect(create).not.toHaveBeenCalled();
  });
});
