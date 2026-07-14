import { describe, expect, it, vi } from 'vitest';

import { CloudflareApiError, type CustomHostnameProvider } from '../src/cloudflare.js';
import type { DomainJob, DomainJobStore, SiteDomainAlias } from '../src/database.js';
import { createJobProcessor } from '../src/processor.js';

const job: DomainJob = {
  id: 'job-1',
  domainId: 'domain-1',
  action: 'create',
  attemptCount: 1,
};

const alias: SiteDomainAlias = {
  id: 'domain-1',
  workspaceId: 'workspace-1',
  hostname: 'www.example.com',
  status: 'configuring',
  isCanonical: false,
  cloudflareCustomHostnameId: null,
};

function dependencies() {
  const store: DomainJobStore = {
    claimNextJob: vi.fn(),
    claimNextReconciliation: vi.fn(),
    getAlias: vi.fn().mockResolvedValue(alias),
    completeProviderJob: vi.fn(),
    completeDeleteJob: vi.fn(),
    retryJob: vi.fn(),
    failJob: vi.fn(),
    completeAliasReconciliation: vi.fn(),
    markAliasReconciliationMissing: vi.fn(),
    recordAliasReconciliationFailure: vi.fn(),
  };
  const provider: CustomHostnameProvider = {
    ensureCustomHostname: vi.fn().mockResolvedValue({
      id: 'custom-host-1',
      hostname: alias.hostname,
      status: 'active',
      ssl: { status: 'active' },
    }),
    findCustomHostname: vi.fn(),
    getCustomHostname: vi.fn(),
    refreshCustomHostname: vi.fn(),
    deleteCustomHostname: vi.fn(),
  };
  const processJob = createJobProcessor({
    store,
    provider,
    maxAttempts: 4,
    retryBaseMs: 1_000,
    retryMaxMs: 8_000,
  });
  return { store, provider, processJob };
}

describe('domain job processor', () => {
  it('persists fully active create state', async () => {
    const { store, processJob } = dependencies();
    await expect(processJob(job)).resolves.toEqual({ status: 'completed' });
    expect(store.completeProviderJob).toHaveBeenCalledWith(job, 'custom-host-1', {
      aliasStatus: 'active',
      cloudflareHostnameStatus: 'active',
      cloudflareSslStatus: 'active',
      lastError: null,
    });
  });

  it('requeues retryable provider failures with exponential delay', async () => {
    const { store, provider, processJob } = dependencies();
    vi.mocked(provider.ensureCustomHostname).mockRejectedValueOnce(new CloudflareApiError('rate limited', 429));
    const secondAttempt = { ...job, attemptCount: 2 };

    await expect(processJob(secondAttempt)).resolves.toEqual({ status: 'retrying', delayMs: 2_000 });
    expect(store.retryJob).toHaveBeenCalledWith(secondAttempt, 'rate limited', 2_000);
    expect(store.failJob).not.toHaveBeenCalled();
  });

  it('retries a rate-limited domain deletion instead of superseding it', async () => {
    const { store, provider, processJob } = dependencies();
    const deleteJob: DomainJob = { ...job, action: 'delete', attemptCount: 2 };
    vi.mocked(store.getAlias).mockResolvedValueOnce({
      ...alias,
      status: 'removing',
      cloudflareCustomHostnameId: 'custom-host-1',
    });
    vi.mocked(provider.deleteCustomHostname).mockRejectedValueOnce(new CloudflareApiError('rate limited', 429));

    await expect(processJob(deleteJob)).resolves.toEqual({ status: 'retrying', delayMs: 2_000 });
    expect(store.retryJob).toHaveBeenCalledWith(deleteJob, 'rate limited', 2_000);
    expect(store.failJob).not.toHaveBeenCalled();
  });

  it('fails permanently when the alias hostname is invalid', async () => {
    const { store, processJob } = dependencies();
    vi.mocked(store.getAlias).mockResolvedValueOnce({ ...alias, hostname: '*.example.com' });

    await expect(processJob(job)).resolves.toEqual({ status: 'failed' });
    expect(store.failJob).toHaveBeenCalledWith(job, expect.stringContaining('without a URL, port, or wildcard'));
    expect(store.retryJob).not.toHaveBeenCalled();
  });
});
