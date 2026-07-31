import fs from 'node:fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const databaseState = vi.hoisted(() => ({
  available: true,
  errors: {} as Record<string, Error>,
  tables: {} as Record<string, unknown[]>,
  singles: {} as Record<string, unknown | null>,
  queries: [] as string[],
}));

vi.mock('../src/lib/database', () => ({
  createStudioDatabase: () => databaseState.available ? ({
    from(table: string) {
      databaseState.queries.push(table);
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        order() {
          return Promise.resolve({
            data: databaseState.tables[table] ?? [],
            error: databaseState.errors[table] ?? null,
          });
        },
        maybeSingle() {
          return Promise.resolve({
            data: databaseState.singles[table] ?? null,
            error: databaseState.errors[table] ?? null,
          });
        },
      };

      return query;
    },
  }) : null,
}));

import { demoPortfolio } from '../src/lib/content/demo';
import {
  clearManagedContentCache,
  loadSiteTheme,
  siteRepository,
} from '../src/lib/content/repository';

describe('managed portfolio content', () => {
  beforeEach(() => {
    vi.stubEnv('SITE_CONTENT_MODE', 'managed');
    databaseState.available = true;
    databaseState.queries = [];
    clearManagedContentCache();
    databaseState.errors = {};
    databaseState.singles = {
      client_workspaces: { id: 'workspace-1', name: 'Managed Studio' },
      studio_settings: {
        site_title: 'Managed Studio',
        hero_title: 'Sports photography',
        hero_subtitle: 'Football, basketball, and track.',
        contact_email: 'owner@example.com',
      },
    };
    databaseState.tables = {
      studio_galleries: [],
      studio_gallery_images: [],
      studio_posts: [],
      studio_services: [],
    };
  });

  it('fails closed when a managed site has no database connection', async () => {
    databaseState.available = false;

    await expect(siteRepository.getPortfolio('workspace-1')).rejects.toThrow('Managed site content is unavailable');
  });

  it('fails closed when a managed content query fails', async () => {
    databaseState.errors.studio_galleries = new Error('database unavailable');

    await expect(siteRepository.getPortfolio('workspace-1')).rejects.toThrow('Managed site content is unavailable');
  });

  it('uses the sample portfolio only when demo content mode is explicit', async () => {
    vi.stubEnv('SITE_CONTENT_MODE', 'demo');
    databaseState.available = false;

    await expect(siteRepository.getPortfolio('workspace-1')).resolves.toBe(demoPortfolio);
  });

  it('does not inherit Northline identity fields in managed mode', async () => {
    databaseState.singles.studio_settings = null;

    const portfolio = await siteRepository.getPortfolio('workspace-1');

    expect(portfolio.studioName).toBe('Managed Studio');
    expect(portfolio.email).toBe('');
    expect(portfolio.home.headline).toBe('Managed Studio');
    expect(portfolio.home.biography).toBe('');
    expect(portfolio.home.announcement).toBe('');
  });

  it('keeps deleted or hidden managed collections empty instead of restoring demo content', async () => {
    const portfolio = await siteRepository.getPortfolio('workspace-1');

    expect(portfolio.galleries).toEqual([]);
    expect(portfolio.posts).toEqual([]);
    expect(portfolio.packages).toEqual([]);
    expect(portfolio.home.featuredGallerySlugs).toEqual([]);
  });

  it('indexes gallery images once before assembling galleries', () => {
    const repository = fs.readFileSync(
      new URL('../src/lib/content/repository.ts', import.meta.url),
      'utf8',
    );

    expect(repository).toContain('const imagesByGallery = new Map<string, GalleryImageRow[]>()');
    expect(repository).toContain('imagesByGallery.get(gallery.id) ?? []');
    expect(repository).not.toContain('.filter((item) => item.gallery_id === gallery.id)');
  });

  it('briefly reuses successful managed portfolio and theme reads per workspace', async () => {
    await siteRepository.getPortfolio('workspace-1');
    await siteRepository.getPortfolio('workspace-1');
    expect(databaseState.queries.filter((table) => table === 'client_workspaces')).toHaveLength(1);

    const settingsQueriesBeforeTheme = databaseState.queries.filter((table) => table === 'studio_settings').length;
    await loadSiteTheme('workspace-1');
    await loadSiteTheme('workspace-1');
    expect(databaseState.queries.filter((table) => table === 'studio_settings'))
      .toHaveLength(settingsQueriesBeforeTheme + 1);
  });

  it('does not give a managed post without an uploaded cover a demo photograph', async () => {
    databaseState.tables.studio_posts = [
      {
        id: 'post-1',
        slug: 'season-recap',
        title: 'Season recap',
        excerpt: 'Highlights from the season.',
        body: 'First paragraph.\n\nSecond paragraph.',
        cover_image_url: null,
        published_at: '2026-07-12T00:00:00.000Z',
      },
    ];

    const [post] = await siteRepository.listPosts('workspace-1');

    expect(post.cover).toBeNull();
  });

  it('reads tenant identity from request context in the reusable server image', () => {
    for (const path of [
      'src/lib/studio.ts',
      'src/lib/content/repository.ts',
      'src/pages/api/inquiry.ts',
      'src/pages/api/site-status.ts',
      'src/pages/contact.astro',
    ]) {
      const source = fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
      expect(source).not.toMatch(/(?:import\.meta\.env|process\.env)\.(SITE_KEY|SITE_WORKSPACE_SLUG)/);
    }
  });

  it('uses the request tenant origin for canonical and social URLs', () => {
    const layout = fs.readFileSync(new URL('../src/layouts/SiteLayout.astro', import.meta.url), 'utf8');
    expect(layout).toMatch(/canonicalOrigin\s*}\s*=\s*Astro\.locals\.siteContext/);
    expect(layout).toContain('property="og:url"');
    expect(layout).not.toContain('Astro.site');
  });
});
