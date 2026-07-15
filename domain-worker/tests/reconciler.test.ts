import { describe, expect, it, vi } from 'vitest';

import { CloudflareApiError, type CustomHostnameProvider } from '../src/cloudflare.js';
import type { DomainReconciliation, DomainReconciliationStore } from '../src/database.js';
import { createAliasReconciler } from '../src/reconciler.js';

const target: DomainReconciliation = {
  id: 'domain-1',
  workspaceId: 'workspace-1',
  hostname: 'www.example.com',
  status: 'active',
  isCanonical: true,
  cloudflareCustomHostnameId: 'custom-host-1',
  leaseStartedAt: new Date('2026-07-14T12:00:00.000Z'),
};

function dependencies() {
  const pendingHostname = {
    id: 'custom-host-1',
    hostname: 'www.example.com',
    status: 'pending',
    ssl: { status: 'pending_validation' },
  };
  const store: DomainReconciliationStore = {
    completeAliasReconciliation: vi.fn().mockResolvedValue(true),
    markAliasReconciliationMissing: vi.fn().mockResolvedValue(true),
    recordAliasReconciliationFailure: vi.fn().mockResolvedValue(true),
  };
  const provider: CustomHostnameProvider = {
    ensureCustomHostname: vi.fn(),
    findCustomHostname: vi.fn(),
    getCustomHostname: vi.fn().mockResolvedValue(pendingHostname),
    refreshCustomHostname: vi.fn().mockResolvedValue(pendingHostname),
    deleteCustomHostname: vi.fn(),
  };
  return {
    store,
    provider,
    reconcileAlias: createAliasReconciler({ store, provider }),
  };
}

describe('custom hostname reconciliation', () => {
  it('persists provider status changes for an active alias', async () => {
    const { store, provider, reconcileAlias } = dependencies();

    await expect(reconcileAlias(target)).resolves.toEqual({ status: 'updated' });
    expect(provider.refreshCustomHostname).toHaveBeenCalledWith('custom-host-1');
    expect(store.completeAliasReconciliation).toHaveBeenCalledWith(target, 'custom-host-1', {
      aliasStatus: 'dns_pending',
      cloudflareHostnameStatus: 'pending',
      cloudflareSslStatus: 'pending_validation',
      lastError: null,
    });
  });

  it('does not PATCH a custom hostname that is already fully active', async () => {
    const { store, provider, reconcileAlias } = dependencies();
    vi.mocked(provider.getCustomHostname).mockResolvedValueOnce({
      id: 'custom-host-1',
      hostname: 'www.example.com',
      status: 'active',
      ssl: { status: 'active' },
    });

    await expect(reconcileAlias(target)).resolves.toEqual({ status: 'updated' });
    expect(provider.refreshCustomHostname).not.toHaveBeenCalled();
    expect(store.completeAliasReconciliation).toHaveBeenCalledWith(
      target,
      'custom-host-1',
      expect.objectContaining({ aliasStatus: 'active' }),
    );
  });

  it('marks an alias non-canonical when its provider hostname disappeared', async () => {
    const { store, provider, reconcileAlias } = dependencies();
    vi.mocked(provider.getCustomHostname).mockRejectedValueOnce(new CloudflareApiError('not found', 404));
    vi.mocked(provider.findCustomHostname).mockResolvedValueOnce(null);

    await expect(reconcileAlias(target)).resolves.toEqual({ status: 'missing' });
    expect(store.markAliasReconciliationMissing).toHaveBeenCalledWith(
      target,
      'Cloudflare custom hostname www.example.com does not exist.',
    );
    expect(store.completeAliasReconciliation).not.toHaveBeenCalled();
  });

  it('recovers a stale provider ID by finding the exact hostname', async () => {
    const { store, provider, reconcileAlias } = dependencies();
    vi.mocked(provider.getCustomHostname).mockResolvedValueOnce({
      id: 'wrong-id',
      hostname: 'other.example.com',
      status: 'active',
      ssl: { status: 'active' },
    });
    vi.mocked(provider.findCustomHostname).mockResolvedValueOnce({
      id: 'replacement-id',
      hostname: 'www.example.com',
      status: 'active',
      ssl: { status: 'active' },
    });

    await expect(reconcileAlias(target)).resolves.toEqual({ status: 'updated' });
    expect(store.completeAliasReconciliation).toHaveBeenCalledWith(
      target,
      'replacement-id',
      expect.objectContaining({ aliasStatus: 'active' }),
    );
  });

  it('records transient provider failures without declaring the domain missing', async () => {
    const { store, provider, reconcileAlias } = dependencies();
    vi.mocked(provider.getCustomHostname).mockRejectedValueOnce(new CloudflareApiError('rate limited', 429));

    await expect(reconcileAlias(target)).resolves.toEqual({ status: 'failed' });
    expect(store.recordAliasReconciliationFailure).toHaveBeenCalledWith(target, 'rate limited');
    expect(store.markAliasReconciliationMissing).not.toHaveBeenCalled();
  });

  it('persists an observed active-to-pending transition when refresh fails', async () => {
    const { store, provider, reconcileAlias } = dependencies();
    vi.mocked(provider.refreshCustomHostname).mockRejectedValueOnce(
      new CloudflareApiError('rate limited', 429),
    );

    await expect(reconcileAlias(target)).resolves.toEqual({ status: 'failed' });
    expect(store.recordAliasReconciliationFailure).toHaveBeenCalledWith(
      target,
      'rate limited',
      {
        cloudflareCustomHostnameId: 'custom-host-1',
        state: {
          aliasStatus: 'dns_pending',
          cloudflareHostnameStatus: 'pending',
          cloudflareSslStatus: 'pending_validation',
          lastError: null,
        },
      },
    );
    expect(store.completeAliasReconciliation).not.toHaveBeenCalled();
  });

  it('does not persist an observed transition after its lease is superseded', async () => {
    const { store, provider, reconcileAlias } = dependencies();
    vi.mocked(provider.refreshCustomHostname).mockRejectedValueOnce(
      new CloudflareApiError('temporarily unavailable', 503),
    );
    vi.mocked(store.recordAliasReconciliationFailure).mockResolvedValueOnce(false);

    await expect(reconcileAlias(target)).resolves.toEqual({ status: 'superseded' });
    expect(store.recordAliasReconciliationFailure).toHaveBeenCalledWith(
      target,
      'temporarily unavailable',
      expect.objectContaining({ cloudflareCustomHostnameId: 'custom-host-1' }),
    );
  });

  it('reports a superseded lease without overwriting newer state', async () => {
    const { store, reconcileAlias } = dependencies();
    vi.mocked(store.completeAliasReconciliation).mockResolvedValueOnce(false);

    await expect(reconcileAlias(target)).resolves.toEqual({ status: 'superseded' });
  });
});
