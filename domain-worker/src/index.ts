import { CloudflareClient } from './cloudflare.js';
import { readWorkerConfig } from './config.js';
import { connectPostgres, PostgresDomainJobStore } from './database.js';
import { createJobProcessor } from './processor.js';
import { consoleLogger, runWorker } from './worker.js';

async function main(): Promise<void> {
  const config = readWorkerConfig();
  const sql = connectPostgres(config.databaseUrl, config.databasePoolMax);
  const store = new PostgresDomainJobStore(sql);
  const provider = new CloudflareClient({
    apiToken: config.cloudflareApiToken,
    zoneId: config.cloudflareZoneId,
    requestTimeoutMs: config.cloudflareRequestTimeoutMs,
  });
  await store.assertReady();
  await provider.listCustomHostnames('domain-worker-readiness.invalid');
  await writeFile('/tmp/domain-worker-ready', new Date().toISOString(), { mode: 0o600 });
  const processJob = createJobProcessor({
    store,
    provider,
    maxAttempts: config.maxAttempts,
    retryBaseMs: config.retryBaseMs,
    retryMaxMs: config.retryMaxMs,
  });

  const shutdown = new AbortController();
  const stop = (signal: NodeJS.Signals) => {
    consoleLogger.info('Shutdown requested; finishing the current domain job.', { signal });
    shutdown.abort();
  };
  const onSigint = () => stop('SIGINT');
  const onSigterm = () => stop('SIGTERM');
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);

  try {
    await runWorker({
      store,
      processJob,
      pollIntervalMs: config.pollIntervalMs,
      lockTimeoutMs: config.lockTimeoutMs,
      signal: shutdown.signal,
      onHealthy: () => writeFile('/tmp/domain-worker-ready', new Date().toISOString(), { mode: 0o600 }),
    });
  } finally {
    process.removeListener('SIGINT', onSigint);
    process.removeListener('SIGTERM', onSigterm);
    await sql.end({ timeout: 5 });
  }
}

void main().catch((error: unknown) => {
  consoleLogger.error('Domain worker stopped with a fatal error.', {
    error: error instanceof Error ? error.message : 'Unknown fatal error.',
  });
  process.exitCode = 1;
});
import { writeFile } from 'node:fs/promises';
