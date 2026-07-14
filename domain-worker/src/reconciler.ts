import { CloudflareApiError, type CloudflareCustomHostname, type CustomHostnameProvider } from './cloudflare.js';
import type { DomainReconciliation, DomainReconciliationStore } from './database.js';
import { deriveAliasProviderState } from './domain-state.js';
import { normalizeHostname } from './hostname.js';
import { errorMessage } from './retry.js';

export interface AliasReconcilerOptions {
  store: DomainReconciliationStore;
  provider: CustomHostnameProvider;
}

export type ReconcileOutcome =
  | { status: 'updated' }
  | { status: 'missing' }
  | { status: 'failed' }
  | { status: 'superseded' };

function hasExpectedHostname(hostname: CloudflareCustomHostname, expected: string): boolean {
  try {
    return normalizeHostname(hostname.hostname) === expected;
  } catch {
    return false;
  }
}

async function findProviderHostname(
  provider: CustomHostnameProvider,
  target: DomainReconciliation,
  normalizedHostname: string,
): Promise<CloudflareCustomHostname | null> {
  if (target.cloudflareCustomHostnameId) {
    try {
      const byId = await provider.getCustomHostname(target.cloudflareCustomHostnameId);
      if (hasExpectedHostname(byId, normalizedHostname)) return byId;
    } catch (error) {
      if (!(error instanceof CloudflareApiError) || error.status !== 404) throw error;
    }
  }

  const exact = await provider.findCustomHostname(normalizedHostname);
  return exact && hasExpectedHostname(exact, normalizedHostname) ? exact : null;
}

export function createAliasReconciler(options: AliasReconcilerOptions) {
  return async function reconcileAlias(target: DomainReconciliation): Promise<ReconcileOutcome> {
    let hostname: string;
    try {
      hostname = normalizeHostname(target.hostname);
    } catch (error) {
      const updated = await options.store.markAliasReconciliationMissing(target, errorMessage(error));
      return { status: updated ? 'missing' : 'superseded' };
    }

    try {
      const providerHostname = await findProviderHostname(options.provider, target, hostname);
      if (!providerHostname) {
        const updated = await options.store.markAliasReconciliationMissing(
          target,
          `Cloudflare custom hostname ${hostname} does not exist.`,
        );
        return { status: updated ? 'missing' : 'superseded' };
      }

      const updated = await options.store.completeAliasReconciliation(
        target,
        providerHostname.id,
        deriveAliasProviderState(providerHostname),
      );
      return { status: updated ? 'updated' : 'superseded' };
    } catch (error) {
      const updated = await options.store.recordAliasReconciliationFailure(target, errorMessage(error));
      return { status: updated ? 'failed' : 'superseded' };
    }
  };
}

export type AliasReconciler = ReturnType<typeof createAliasReconciler>;
