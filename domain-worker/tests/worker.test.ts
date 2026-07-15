import { describe, expect, it, vi } from 'vitest';

import type { DomainJobStore, DomainReconciliation } from '../src/database.js';
import { runWorker } from '../src/worker.js';

const reconciliation: DomainReconciliation = {
  id: 'domain-1',
  workspaceId: 'workspace-1',
  hostname: 'www.example.com',
  status: 'active',
  isCanonical: true,
  cloudflareCustomHostnameId: 'custom-host-1',
  leaseStartedAt: new Date('2026-07-14T12:00:00.000Z'),
};

function storeWith(overrides: Partial<DomainJobStore> = {}): DomainJobStore {
  return {
    claimNextJob: vi.fn().mockResolvedValue(null),
    claimNextReconciliation: vi.fn().mockResolvedValue(null),
    getAlias: vi.fn(),
    completeProviderJob: vi.fn(),
    completeDeleteJob: vi.fn(),
    retryJob: vi.fn(),
    failJob: vi.fn(),
    completeAliasReconciliation: vi.fn(),
    markAliasReconciliationMissing: vi.fn(),
    recordAliasReconciliationFailure: vi.fn(),
    ...overrides,
  };
}

describe('runWorker reconciliation scheduling', () => {
  it('reconciles a due alias when no requested job is available', async () => {
    const controller = new AbortController();
    const store = storeWith({
      claimNextReconciliation: vi.fn().mockResolvedValueOnce(reconciliation),
    });
    const reconcileAlias = vi.fn().mockImplementation(async () => {
      controller.abort();
      return { status: 'updated' as const };
    });

    await runWorker({
      store,
      processJob: vi.fn(),
      reconcileAlias,
      reconcileIntervalMs: 300_000,
      pollIntervalMs: 1,
      lockTimeoutMs: 60_000,
      signal: controller.signal,
      logger: { info: vi.fn(), error: vi.fn() },
    });

    expect(store.claimNextReconciliation).toHaveBeenCalledWith(300_000, 60_000);
    expect(reconcileAlias).toHaveBeenCalledWith(reconciliation);
  });

  it('prioritizes requested jobs over background reconciliation', async () => {
    const controller = new AbortController();
    const job = { id: 'job-1', domainId: 'domain-1', action: 'refresh' as const, attemptCount: 1 };
    const store = storeWith({ claimNextJob: vi.fn().mockResolvedValueOnce(job) });
    const processJob = vi.fn().mockImplementation(async () => {
      controller.abort();
      return { status: 'completed' as const };
    });

    await runWorker({
      store,
      processJob,
      reconcileAlias: vi.fn(),
      reconcileIntervalMs: 300_000,
      pollIntervalMs: 1,
      lockTimeoutMs: 60_000,
      signal: controller.signal,
      logger: { info: vi.fn(), error: vi.fn() },
    });

    expect(processJob).toHaveBeenCalledWith(job);
    expect(store.claimNextReconciliation).not.toHaveBeenCalled();
  });
});
