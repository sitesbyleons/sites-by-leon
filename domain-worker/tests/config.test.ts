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
  });
});
