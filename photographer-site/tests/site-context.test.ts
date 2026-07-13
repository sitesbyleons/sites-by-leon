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
    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain('"primary_domain" = $1');
    expect(calls[0]?.values).toEqual(['photos.example.com']);
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

    expect(calls).toHaveLength(2);
    expect(calls[0]?.values).toEqual(['attacker.example.net']);
    expect(calls[1]?.text).toContain('"admin_domain" = $1');
    expect(calls[1]?.values).toEqual(['attacker.example.net']);
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
