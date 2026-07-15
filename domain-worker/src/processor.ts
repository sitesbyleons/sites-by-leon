import { CloudflareApiError, type CloudflareCustomHostname, type CustomHostnameProvider } from './cloudflare.js';
import type { DomainJob, DomainJobStore, SiteDomainAlias } from './database.js';
import { deriveAliasProviderState } from './domain-state.js';
import { normalizeHostname } from './hostname.js';
import { calculateBackoffMs, errorMessage, isRetryableFailure, PermanentJobError } from './retry.js';

export interface JobProcessorOptions {
  store: DomainJobStore;
  provider: CustomHostnameProvider;
  maxAttempts: number;
  retryBaseMs: number;
  retryMaxMs: number;
}

export type ProcessOutcome =
  | { status: 'completed' }
  | { status: 'retrying'; delayMs: number }
  | { status: 'failed' };

async function hostnameForRefresh(
  provider: CustomHostnameProvider,
  alias: SiteDomainAlias,
  normalizedHostname: string,
): Promise<CloudflareCustomHostname> {
  if (alias.cloudflareCustomHostnameId) {
    try {
      return await provider.refreshCustomHostname(alias.cloudflareCustomHostnameId);
    } catch (error) {
      if (!(error instanceof CloudflareApiError) || error.status !== 404) throw error;
    }
  }

  const existing = await provider.findCustomHostname(normalizedHostname);
  if (!existing) {
    throw new PermanentJobError(`Cloudflare custom hostname ${normalizedHostname} does not exist.`);
  }
  if (existing.status === 'active' && existing.ssl?.status === 'active') return existing;
  return provider.refreshCustomHostname(existing.id);
}

async function deleteHostname(
  provider: CustomHostnameProvider,
  alias: SiteDomainAlias,
  normalizedHostname: string,
): Promise<void> {
  if (alias.cloudflareCustomHostnameId) {
    const deleted = await provider.deleteCustomHostname(alias.cloudflareCustomHostnameId);
    if (deleted) return;
  }

  const existing = await provider.findCustomHostname(normalizedHostname);
  if (existing) await provider.deleteCustomHostname(existing.id);
}

export function createJobProcessor(options: JobProcessorOptions) {
  return async function processJob(job: DomainJob): Promise<ProcessOutcome> {
    try {
      if (job.attemptCount > options.maxAttempts) {
        throw new PermanentJobError(`Domain job exceeded ${options.maxAttempts} attempts.`);
      }

      const alias = await options.store.getAlias(job.domainId);
      if (!alias) throw new PermanentJobError(`Site domain alias ${job.domainId} does not exist.`);

      const hostname = normalizeHostname(alias.hostname);
      if (job.action === 'delete') {
        await deleteHostname(options.provider, alias, hostname);
        await options.store.completeDeleteJob(job);
        return { status: 'completed' };
      }

      const providerHostname = job.action === 'create'
        ? await options.provider.ensureCustomHostname(hostname)
        : await hostnameForRefresh(options.provider, alias, hostname);
      const state = deriveAliasProviderState(providerHostname);
      await options.store.completeProviderJob(job, providerHostname.id, state);
      return { status: 'completed' };
    } catch (error) {
      const message = errorMessage(error);
      if (isRetryableFailure(error) && job.attemptCount < options.maxAttempts) {
        const delayMs = calculateBackoffMs(job.attemptCount, options.retryBaseMs, options.retryMaxMs);
        await options.store.retryJob(job, message, delayMs);
        return { status: 'retrying', delayMs };
      }

      await options.store.failJob(job, message);
      return { status: 'failed' };
    }
  };
}

export type JobProcessor = ReturnType<typeof createJobProcessor>;
