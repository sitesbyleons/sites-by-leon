import type { DomainJobStore } from './database.js';
import type { JobProcessor } from './processor.js';

export interface WorkerLogger {
  info(message: string, details?: Record<string, unknown>): void;
  error(message: string, details?: Record<string, unknown>): void;
}

export interface RunWorkerOptions {
  store: DomainJobStore;
  processJob: JobProcessor;
  pollIntervalMs: number;
  lockTimeoutMs: number;
  signal: AbortSignal;
  logger?: WorkerLogger;
  onHealthy?: () => Promise<void> | void;
}

export const consoleLogger: WorkerLogger = {
  info(message, details) {
    console.info(message, details ?? {});
  },
  error(message, details) {
    console.error(message, details ?? {});
  },
};

export function waitFor(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();

  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timeout = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });
}

export async function runWorker(options: RunWorkerOptions): Promise<void> {
  const logger = options.logger ?? consoleLogger;
  logger.info('Domain worker started.');

  while (!options.signal.aborted) {
    try {
      const job = await options.store.claimNextJob(options.lockTimeoutMs);
      await options.onHealthy?.();
      if (!job) {
        await waitFor(options.pollIntervalMs, options.signal);
        continue;
      }

      const outcome = await options.processJob(job);
      logger.info('Domain job processed.', {
        jobId: job.id,
        domainId: job.domainId,
        action: job.action,
        outcome: outcome.status,
        attemptCount: job.attemptCount,
      });
    } catch (error) {
      logger.error('Domain worker iteration failed.', {
        error: error instanceof Error ? error.message : 'Unknown worker error.',
      });
      await waitFor(options.pollIntervalMs, options.signal);
    }
  }

  logger.info('Domain worker stopped.');
}
