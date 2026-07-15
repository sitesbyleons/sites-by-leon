import { describe, expect, it } from 'vitest';

import { readWorkerConfig } from '../src/config.js';

const requiredEnv = {
  DATABASE_URL: 'postgresql://worker:secret@db/domain',
  CLOUDFLARE_API_TOKEN: 'token',
  CLOUDFLARE_ZONE_ID: 'zone',
};

describe('readWorkerConfig', () => {
  it('uses bounded service defaults', () => {
    const config = readWorkerConfig(requiredEnv);
    expect(config.databasePoolMax).toBe(4);
    expect(config.maxAttempts).toBe(8);
    expect(config.retryBaseMs).toBe(5_000);
    expect(config.retryMaxMs).toBe(3_600_000);
    expect(config.reconcileIntervalMs).toBe(300_000);
    expect(config.cloudflareExpectedFallbackOrigin).toBe('customers.leonsites.org');
  });

  it('normalizes an explicitly configured fallback origin', () => {
    const config = readWorkerConfig({
      ...requiredEnv,
      CLOUDFLARE_EXPECTED_FALLBACK_ORIGIN: 'Customers.Example.COM.',
      DOMAIN_WORKER_RECONCILE_INTERVAL_MS: '60000',
    });

    expect(config.cloudflareExpectedFallbackOrigin).toBe('customers.example.com');
    expect(config.reconcileIntervalMs).toBe(60_000);
  });

  it('fails closed when credentials or numeric settings are invalid', () => {
    expect(() => readWorkerConfig({ ...requiredEnv, CLOUDFLARE_API_TOKEN: '' })).toThrow('CLOUDFLARE_API_TOKEN');
    expect(() => readWorkerConfig({ ...requiredEnv, DOMAIN_WORKER_MAX_ATTEMPTS: '21' })).toThrow('between 1 and 20');
    expect(() => readWorkerConfig({
      ...requiredEnv,
      DOMAIN_WORKER_RETRY_BASE_MS: '10000',
      DOMAIN_WORKER_RETRY_MAX_MS: '5000',
    })).toThrow('greater than or equal');
    expect(() => readWorkerConfig({
      ...requiredEnv,
      CLOUDFLARE_REQUEST_TIMEOUT_MS: '60000',
      DOMAIN_WORKER_LOCK_TIMEOUT_MS: '60000',
    })).toThrow('must exceed');
    expect(() => readWorkerConfig({
      ...requiredEnv,
      DOMAIN_WORKER_RECONCILE_INTERVAL_MS: '29999',
    })).toThrow('between 30000 and 86400000');
    expect(() => readWorkerConfig({
      ...requiredEnv,
      CLOUDFLARE_EXPECTED_FALLBACK_ORIGIN: 'https://customers.example.com',
    })).toThrow('without a URL, port, or wildcard');
  });
});
