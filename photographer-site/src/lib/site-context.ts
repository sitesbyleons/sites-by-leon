import type { DataClient } from '@leon/platform-core';

export type SiteStatus = 'active' | 'paused' | 'maintenance' | 'error' | 'archived';

export type SiteContext = {
  workspaceId: string;
  siteKey: string;
  hostname: string;
  primaryDomain: string;
  adminDomain: string;
  canonicalOrigin: string;
  status: SiteStatus;
  isAdminHost: boolean;
  isFallback: boolean;
};

type SiteConnectionRow = {
  workspace_id: string;
  site_key: string;
  primary_domain: string;
  admin_domain: string | null;
  status: string;
};

type SiteDomainAliasRow = {
  workspace_id: string;
  hostname: string;
  status: string;
  is_canonical: boolean;
};

type ResolutionInput = {
  hostname: string;
  requestOrigin: string;
  nodeEnv?: string;
  fallbackSiteKey?: string;
  fallbackWorkspaceSlug?: string;
};

export type SiteContextResolution =
  | { context: SiteContext; error: null }
  | { context: null; error: 'unknown-host' | 'unavailable' };

type CacheOptions = {
  maxEntries?: number;
  ttlMs?: number;
  now?: () => number;
};

export class SiteContextCache {
  readonly #entries = new Map<string, { context: SiteContext; expiresAt: number }>();
  readonly #maxEntries: number;
  readonly #ttlMs: number;
  readonly #now: () => number;

  constructor({ maxEntries = 500, ttlMs = 10_000, now = Date.now }: CacheOptions = {}) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 500) {
      throw new Error('Site context cache size is invalid.');
    }
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1_000 || ttlMs > 15_000) {
      throw new Error('Site context cache TTL is invalid.');
    }
    this.#maxEntries = maxEntries;
    this.#ttlMs = ttlMs;
    this.#now = now;
  }

  get size() {
    return this.#entries.size;
  }

  get(hostname: string): SiteContext | null {
    const key = hostname.toLowerCase();
    const entry = this.#entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.#now()) {
      this.#entries.delete(key);
      return null;
    }
    return entry.context;
  }

  set(hostname: string, context: SiteContext) {
    if (context.isFallback) return;
    const key = hostname.toLowerCase();
    this.#entries.delete(key);
    while (this.#entries.size >= this.#maxEntries) {
      const oldest = this.#entries.keys().next().value as string | undefined;
      if (!oldest) break;
      this.#entries.delete(oldest);
    }
    this.#entries.set(key, { context, expiresAt: this.#now() + this.#ttlMs });
  }
}

const CONNECTION_COLUMNS = 'workspace_id,site_key,primary_domain,admin_domain,status';
const DOMAIN_ALIAS_COLUMNS = 'workspace_id,hostname,status,is_canonical';
const VALID_STATUSES = new Set<SiteStatus>(['active', 'paused', 'maintenance', 'error', 'archived']);
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

const siteStatus = (value: string): SiteStatus =>
  VALID_STATUSES.has(value as SiteStatus) ? value as SiteStatus : 'error';

const fallbackPermitted = ({ hostname, nodeEnv }: ResolutionInput) =>
  LOCAL_HOSTNAMES.has(hostname) || nodeEnv === 'development' || nodeEnv === 'test';

const fromConnection = (
  row: SiteConnectionRow,
  hostname: string,
  primaryDomain: string,
  canonicalOrigin: string,
  isAdminHost: boolean,
  isFallback: boolean,
): SiteContext => ({
  workspaceId: row.workspace_id,
  siteKey: row.site_key,
  hostname,
  primaryDomain,
  adminDomain: row.admin_domain || row.primary_domain,
  canonicalOrigin,
  status: siteStatus(row.status),
  isAdminHost,
  isFallback,
});

const resolvedConnection = async (
  database: DataClient,
  row: SiteConnectionRow,
  hostname: string,
  matchedAlias?: SiteDomainAliasRow,
): Promise<SiteContextResolution> => {
  let canonicalDomain = row.primary_domain;
  if (matchedAlias?.is_canonical) {
    canonicalDomain = matchedAlias.hostname;
  } else {
    const canonicalAlias = await database
      .from('site_domain_aliases')
      .select<SiteDomainAliasRow>(DOMAIN_ALIAS_COLUMNS)
      .eq('workspace_id', row.workspace_id)
      .eq('status', 'active')
      .eq('is_canonical', true)
      .maybeSingle();

    if (canonicalAlias.error) return { context: null, error: 'unavailable' };
    if (canonicalAlias.data) canonicalDomain = canonicalAlias.data.hostname;
  }

  const adminDomain = row.admin_domain || row.primary_domain;
  return {
    context: fromConnection(
      row,
      hostname,
      canonicalDomain,
      `https://${canonicalDomain}`,
      hostname === adminDomain,
      false,
    ),
    error: null,
  };
};

const matchesPathPrefix = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

const isEditorPath = (pathname: string) =>
  ['/admin', '/sign-in', '/sign-up', '/api/admin', '/api/connect', '/api/invoices']
    .some((prefix) => matchesPathPrefix(pathname, prefix));

const isSharedAssetPath = (pathname: string) =>
  ['/_astro', '/_image', '/images'].some((prefix) => matchesPathPrefix(pathname, prefix));

const isStableOperationalPath = (pathname: string) =>
  ['/api/health', '/api/site-status', '/api/webhooks']
    .some((prefix) => matchesPathPrefix(pathname, prefix));

const redirectUrl = (domain: string, pathname: string, search: string) => {
  const target = new URL(`https://${domain}`);
  target.pathname = pathname;
  target.search = search;
  return target.toString();
};

export function siteRedirectTarget(
  context: SiteContext,
  pathname: string,
  search: string,
): string | null {
  if (context.isFallback || context.adminDomain === context.primaryDomain) return null;
  if (context.isAdminHost && !isEditorPath(pathname) && !isSharedAssetPath(pathname) && !isStableOperationalPath(pathname)) {
    return redirectUrl(context.primaryDomain, pathname, search);
  }
  if (!context.isAdminHost && isEditorPath(pathname)) {
    return redirectUrl(context.adminDomain, pathname, search);
  }
  return null;
}

export async function resolveSiteContext(
  database: DataClient | null,
  input: ResolutionInput,
): Promise<SiteContextResolution> {
  input = { ...input, hostname: input.hostname.toLowerCase() };
  if (database) {
    const exact = await database
      .from('site_connections')
      .select<SiteConnectionRow>(CONNECTION_COLUMNS)
      .eq('primary_domain', input.hostname)
      .maybeSingle();

    if (exact.error) {
      if (!fallbackPermitted(input)) return { context: null, error: 'unavailable' };
    } else if (exact.data) {
      return resolvedConnection(database, exact.data, input.hostname);
    } else {
      const admin = await database
        .from('site_connections')
        .select<SiteConnectionRow>(CONNECTION_COLUMNS)
        .eq('admin_domain', input.hostname)
        .maybeSingle();

      if (admin.error) {
        if (!fallbackPermitted(input)) return { context: null, error: 'unavailable' };
      } else if (admin.data) {
        return resolvedConnection(database, admin.data, input.hostname);
      } else {
        const alias = await database
          .from('site_domain_aliases')
          .select<SiteDomainAliasRow>(DOMAIN_ALIAS_COLUMNS)
          .eq('hostname', input.hostname)
          .eq('status', 'active')
          .maybeSingle();

        if (alias.error) {
          if (!fallbackPermitted(input)) return { context: null, error: 'unavailable' };
        } else if (alias.data) {
          const connection = await database
            .from('site_connections')
            .select<SiteConnectionRow>(CONNECTION_COLUMNS)
            .eq('workspace_id', alias.data.workspace_id)
            .maybeSingle();

          if (connection.error) {
            if (!fallbackPermitted(input)) return { context: null, error: 'unavailable' };
          } else if (connection.data) {
            return resolvedConnection(database, connection.data, input.hostname, alias.data);
          } else if (!fallbackPermitted(input)) {
            return { context: null, error: 'unknown-host' };
          }
        } else if (!fallbackPermitted(input)) {
          return { context: null, error: 'unknown-host' };
        }
      }
    }
  } else if (!fallbackPermitted(input)) {
    return { context: null, error: 'unavailable' };
  }

  if (database && input.fallbackSiteKey) {
    const connection = await database
      .from('site_connections')
      .select<SiteConnectionRow>(CONNECTION_COLUMNS)
      .eq('site_key', input.fallbackSiteKey)
      .maybeSingle();

    if (!connection.error && connection.data) {
      return {
        context: fromConnection(
          connection.data,
          input.hostname,
          connection.data.primary_domain,
          input.requestOrigin,
          false,
          true,
        ),
        error: null,
      };
    }
  }

  if (database && input.fallbackWorkspaceSlug) {
    const workspace = await database
      .from('client_workspaces')
      .select<{ id: string }>('id')
      .eq('slug', input.fallbackWorkspaceSlug)
      .maybeSingle();

    if (!workspace.error && workspace.data) {
      return {
        context: {
          workspaceId: workspace.data.id,
          siteKey: input.fallbackSiteKey ?? `local:${input.fallbackWorkspaceSlug}`,
          hostname: input.hostname,
          primaryDomain: input.hostname,
          adminDomain: input.hostname,
          canonicalOrigin: input.requestOrigin,
          status: 'active',
          isAdminHost: false,
          isFallback: true,
        },
        error: null,
      };
    }
  }

  const localWorkspace = input.fallbackWorkspaceSlug ?? 'local-preview';
  return {
    context: {
      workspaceId: localWorkspace,
      siteKey: input.fallbackSiteKey ?? `local:${localWorkspace}`,
      hostname: input.hostname,
      primaryDomain: input.hostname,
      adminDomain: input.hostname,
      canonicalOrigin: input.requestOrigin,
      status: 'active',
      isAdminHost: false,
      isFallback: true,
    },
    error: null,
  };
}
