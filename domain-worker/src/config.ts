import { normalizeHostname } from './hostname.js';

export interface WorkerConfig {
  databaseUrl: string;
  databasePoolMax: number;
  cloudflareApiToken: string;
  cloudflareZoneId: string;
  cloudflareExpectedFallbackOrigin: string;
  cloudflareRequestTimeoutMs: number;
  pollIntervalMs: number;
  reconcileIntervalMs: number;
  maxAttempts: number;
  retryBaseMs: number;
  retryMaxMs: number;
  lockTimeoutMs: number;
}

function requireValue(name: string, value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}

function readInteger(
  name: string,
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined || value.trim() === '') return fallback;
  if (!/^\d+$/u.test(value.trim())) throw new Error(`${name} must be an integer.`);

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

export function readWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const retryBaseMs = readInteger('DOMAIN_WORKER_RETRY_BASE_MS', env.DOMAIN_WORKER_RETRY_BASE_MS, 5_000, 1, 86_400_000);
  const retryMaxMs = readInteger('DOMAIN_WORKER_RETRY_MAX_MS', env.DOMAIN_WORKER_RETRY_MAX_MS, 3_600_000, 1, 86_400_000);
  const cloudflareRequestTimeoutMs = readInteger('CLOUDFLARE_REQUEST_TIMEOUT_MS', env.CLOUDFLARE_REQUEST_TIMEOUT_MS, 15_000, 1_000, 120_000);
  const lockTimeoutMs = readInteger('DOMAIN_WORKER_LOCK_TIMEOUT_MS', env.DOMAIN_WORKER_LOCK_TIMEOUT_MS, 300_000, 30_000, 3_600_000);
  if (retryMaxMs < retryBaseMs) {
    throw new Error('DOMAIN_WORKER_RETRY_MAX_MS must be greater than or equal to DOMAIN_WORKER_RETRY_BASE_MS.');
  }
  if (lockTimeoutMs <= cloudflareRequestTimeoutMs) {
    throw new Error('DOMAIN_WORKER_LOCK_TIMEOUT_MS must exceed CLOUDFLARE_REQUEST_TIMEOUT_MS.');
  }

  return {
    databaseUrl: requireValue('DATABASE_URL', env.DATABASE_URL),
    databasePoolMax: readInteger('DATABASE_POOL_MAX', env.DATABASE_POOL_MAX, 4, 1, 20),
    cloudflareApiToken: requireValue('CLOUDFLARE_API_TOKEN', env.CLOUDFLARE_API_TOKEN),
    cloudflareZoneId: requireValue('CLOUDFLARE_ZONE_ID', env.CLOUDFLARE_ZONE_ID),
    cloudflareExpectedFallbackOrigin: normalizeHostname(
      env.CLOUDFLARE_EXPECTED_FALLBACK_ORIGIN ?? 'customers.leonsites.org',
    ),
    cloudflareRequestTimeoutMs,
    pollIntervalMs: readInteger('DOMAIN_WORKER_POLL_INTERVAL_MS', env.DOMAIN_WORKER_POLL_INTERVAL_MS, 2_000, 100, 60_000),
    reconcileIntervalMs: readInteger(
      'DOMAIN_WORKER_RECONCILE_INTERVAL_MS',
      env.DOMAIN_WORKER_RECONCILE_INTERVAL_MS,
      300_000,
      30_000,
      86_400_000,
    ),
    maxAttempts: readInteger('DOMAIN_WORKER_MAX_ATTEMPTS', env.DOMAIN_WORKER_MAX_ATTEMPTS, 8, 1, 20),
    retryBaseMs,
    retryMaxMs,
    lockTimeoutMs,
  };
}
