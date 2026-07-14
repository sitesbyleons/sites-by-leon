import { createDataClient } from '@leon/platform-core';
import { describe, expect, it } from 'vitest';

import { resolveSiteContext, siteRedirectTarget } from '../src/lib/site-context';

type QueryCall = { text: string; values: unknown[] };

describe('site context resolution', () => {
  it('resolves a production tenant only by the exact request hostname', async () => {
    const calls: QueryCall[] = [];
    const database = createDataClient(async (text, values) => {
      calls.push({ text, values });
      if (values[0] === 'photos.example.com') {
        return [{
          workspace_id: 'workspace-1',
          site_key: 'photos',
          primary_domain: 'photos.example.com',
          admin_domain: 'admin.photos.example.com',
          status: 'active',
        }];
      }
      return [];
    });

    const result = await resolveSiteContext(database, {
      hostname: 'Photos.Example.Com',
      requestOrigin: 'http://internal:4321',
      nodeEnv: 'production',
      fallbackSiteKey: 'ignored-fallback',
      fallbackWorkspaceSlug: 'ignored-fallback',
    });

    expect(result).toEqual({
      context: {
        workspaceId: 'workspace-1',
        siteKey: 'photos',
        hostname: 'photos.example.com',
        primaryDomain: 'photos.example.com',
        adminDomain: 'admin.photos.example.com',
        canonicalOrigin: 'https://photos.example.com',
        status: 'active',
        isAdminHost: false,
        isFallback: false,
      },
      error: null,
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.text).toContain('"primary_domain" = $1');
    expect(calls[0]?.values).toEqual(['photos.example.com']);
    expect(calls[1]?.text).toContain('from "site_domain_aliases"');
    expect(calls[1]?.values).toEqual(['workspace-1', 'active', true]);
  });

  it('fails closed for an unknown production hostname even when fallbacks are configured', async () => {
    const calls: QueryCall[] = [];
    const database = createDataClient(async (text, values) => {
      calls.push({ text, values });
      return [];
    });

    await expect(resolveSiteContext(database, {
      hostname: 'attacker.example.net',
      requestOrigin: 'https://attacker.example.net',
      nodeEnv: 'production',
      fallbackSiteKey: 'photos',
      fallbackWorkspaceSlug: 'northline',
    })).resolves.toEqual({ context: null, error: 'unknown-host' });

    expect(calls).toHaveLength(3);
    expect(calls[0]?.values).toEqual(['attacker.example.net']);
    expect(calls[1]?.text).toContain('"admin_domain" = $1');
    expect(calls[1]?.values).toEqual(['attacker.example.net']);
    expect(calls[2]?.text).toContain('from "site_domain_aliases"');
    expect(calls[2]?.values).toEqual(['attacker.example.net', 'active']);
  });

  it('does not treat a hostname suffix as a tenant match', async () => {
    const database = createDataClient(async (_text, values) => values[0] === 'photos.example.com'
      ? [{
          workspace_id: 'workspace-1',
          site_key: 'photos',
          primary_domain: 'photos.example.com',
          admin_domain: 'admin.photos.example.com',
          status: 'active',
        }]
      : []);

    await expect(resolveSiteContext(database, {
      hostname: 'photos.example.com.attacker.net',
      requestOrigin: 'https://photos.example.com.attacker.net',
      nodeEnv: 'production',
    })).resolves.toEqual({ context: null, error: 'unknown-host' });
  });

  it('supports an explicit local fallback without a database', async () => {
    await expect(resolveSiteContext(null, {
      hostname: 'localhost',
      requestOrigin: 'http://localhost:4321',
      nodeEnv: 'development',
      fallbackSiteKey: 'northline-local',
      fallbackWorkspaceSlug: 'northline',
    })).resolves.toEqual({
      context: {
        workspaceId: 'northline',
        siteKey: 'northline-local',
        hostname: 'localhost',
        primaryDomain: 'localhost',
        adminDomain: 'localhost',
        canonicalOrigin: 'http://localhost:4321',
        status: 'active',
        isAdminHost: false,
        isFallback: true,
      },
      error: null,
    });
  });

  it('reports a database outage separately from an unknown production host', async () => {
    const database = createDataClient(async () => {
      throw new Error('connection refused');
    });

    await expect(resolveSiteContext(database, {
      hostname: 'photos.example.com',
      requestOrigin: 'https://photos.example.com',
      nodeEnv: 'production',
    })).resolves.toEqual({ context: null, error: 'unavailable' });
  });

  it('resolves the private editor by an exact admin hostname', async () => {
    const database = createDataClient(async (text, values) => {
      if (text.includes('"admin_domain" = $1') && values[0] === 'admin.photos.example.com') {
        return [{
          workspace_id: 'workspace-1',
          site_key: 'photos',
          primary_domain: 'photos.example.com',
          admin_domain: 'admin.photos.example.com',
          status: 'active',
        }];
      }
      return [];
    });

    const result = await resolveSiteContext(database, {
      hostname: 'admin.photos.example.com',
      requestOrigin: 'http://internal:4321',
      nodeEnv: 'production',
    });

    expect(result.context).toMatchObject({
      workspaceId: 'workspace-1',
      primaryDomain: 'photos.example.com',
      adminDomain: 'admin.photos.example.com',
      canonicalOrigin: 'https://photos.example.com',
      isAdminHost: true,
    });
  });

  it('uses an active canonical alias for public pages while keeping the editor on the fallback host', async () => {
    const database = createDataClient(async (text, values) => {
      if (text.includes('from "site_connections"') && text.includes('"primary_domain" = $1') && values[0] === 'vow-and-light.leonsites.org') {
        return [{
          workspace_id: 'workspace-vow',
          site_key: 'vow-and-light',
          primary_domain: 'vow-and-light.leonsites.org',
          admin_domain: 'vow-and-light.leonsites.org',
          status: 'active',
        }];
      }
      if (text.includes('from "site_domain_aliases"') && values[0] === 'workspace-vow') {
        return [{
          workspace_id: 'workspace-vow',
          hostname: 'www.vowandlight.com',
          status: 'active',
          is_canonical: true,
        }];
      }
      return [];
    });

    const result = await resolveSiteContext(database, {
      hostname: 'vow-and-light.leonsites.org',
      requestOrigin: 'https://vow-and-light.leonsites.org',
      nodeEnv: 'production',
    });

    expect(result.context).toMatchObject({
      primaryDomain: 'www.vowandlight.com',
      adminDomain: 'vow-and-light.leonsites.org',
      canonicalOrigin: 'https://www.vowandlight.com',
      isAdminHost: true,
    });
    expect(siteRedirectTarget(result.context!, '/work/recent-stories', ''))
      .toBe('https://www.vowandlight.com/work/recent-stories');
    expect(siteRedirectTarget(result.context!, '/admin', '')).toBeNull();
    expect(siteRedirectTarget(result.context!, '/api/health', '')).toBeNull();
    expect(siteRedirectTarget(result.context!, '/api/site-status', '')).toBeNull();
    expect(siteRedirectTarget(result.context!, '/api/webhooks/stripe-connect', '')).toBeNull();
    expect(siteRedirectTarget(result.context!, '/api/inquiry', ''))
      .toBe('https://www.vowandlight.com/api/inquiry');
  });

  it('resolves an active custom-domain alias to its workspace', async () => {
    const database = createDataClient(async (text, values) => {
      if (text.includes('from "site_domain_aliases"') && text.includes('"hostname" = $1') && values[0] === 'www.vowandlight.com') {
        return [{
          workspace_id: 'workspace-vow',
          hostname: 'www.vowandlight.com',
          status: 'active',
          is_canonical: true,
        }];
      }
      if (text.includes('from "site_connections"') && text.includes('"workspace_id" = $1') && values[0] === 'workspace-vow') {
        return [{
          workspace_id: 'workspace-vow',
          site_key: 'vow-and-light',
          primary_domain: 'vow-and-light.leonsites.org',
          admin_domain: 'vow-and-light.leonsites.org',
          status: 'active',
        }];
      }
      return [];
    });

    await expect(resolveSiteContext(database, {
      hostname: 'www.vowandlight.com',
      requestOrigin: 'https://www.vowandlight.com',
      nodeEnv: 'production',
    })).resolves.toEqual({
      context: {
        workspaceId: 'workspace-vow',
        siteKey: 'vow-and-light',
        hostname: 'www.vowandlight.com',
        primaryDomain: 'www.vowandlight.com',
        adminDomain: 'vow-and-light.leonsites.org',
        canonicalOrigin: 'https://www.vowandlight.com',
        status: 'active',
        isAdminHost: false,
        isFallback: false,
      },
      error: null,
    });
  });

  it('does not route a custom domain until the alias is active', async () => {
    const calls: QueryCall[] = [];
    const database = createDataClient(async (text, values) => {
      calls.push({ text, values });
      return [];
    });

    await expect(resolveSiteContext(database, {
      hostname: 'pending.example.com',
      requestOrigin: 'https://pending.example.com',
      nodeEnv: 'production',
    })).resolves.toEqual({ context: null, error: 'unknown-host' });

    expect(calls.at(-1)?.text).toContain('from "site_domain_aliases"');
    expect(calls.at(-1)?.values).toEqual(['pending.example.com', 'active']);
  });

  it('routes public and editor pages to their designated tenant hostnames', () => {
    const primaryContext = {
      workspaceId: 'workspace-1',
      siteKey: 'photos',
      hostname: 'photos.example.com',
      primaryDomain: 'photos.example.com',
      adminDomain: 'admin.photos.example.com',
      canonicalOrigin: 'https://photos.example.com',
      status: 'active' as const,
      isAdminHost: false,
      isFallback: false,
    };
    const adminContext = {
      ...primaryContext,
      hostname: 'admin.photos.example.com',
      isAdminHost: true,
    };

    expect(siteRedirectTarget(adminContext, '/work', '?sport=track'))
      .toBe('https://photos.example.com/work?sport=track');
    expect(siteRedirectTarget(adminContext, '/admin', '')).toBeNull();
    expect(siteRedirectTarget(adminContext, '/_astro/editor.js', '')).toBeNull();
    expect(siteRedirectTarget(adminContext, '/api/inquiry', ''))
      .toBe('https://photos.example.com/api/inquiry');
    expect(siteRedirectTarget(primaryContext, '/admin/posts', '?page=2'))
      .toBe('https://admin.photos.example.com/admin/posts?page=2');
    expect(siteRedirectTarget(primaryContext, '/api/connect', ''))
      .toBe('https://admin.photos.example.com/api/connect');
    expect(siteRedirectTarget(primaryContext, '/contact', '')).toBeNull();
    expect(siteRedirectTarget({ ...primaryContext, isFallback: true }, '/admin', '')).toBeNull();
  });
});
