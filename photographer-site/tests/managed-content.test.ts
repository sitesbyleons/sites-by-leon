import fs from 'node:fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const databaseState = vi.hoisted(() => ({
  available: true,
  errors: {} as Record<string, Error>,
  tables: {} as Record<string, unknown[]>,
  singles: {} as Record<string, unknown | null>,
}));

vi.mock('../src/lib/database', () => ({
  createStudioDatabase: () => databaseState.available ? ({
    from(table: string) {
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
import { siteRepository } from '../src/lib/content/repository';

describe('managed portfolio content', () => {
  beforeEach(() => {
    vi.stubEnv('SITE_CONTENT_MODE', 'managed');
    databaseState.available = true;
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

    await expect(siteRepository.getPortfolio()).rejects.toThrow('Managed site content is unavailable');
  });

  it('fails closed when a managed content query fails', async () => {
    databaseState.errors.studio_galleries = new Error('database unavailable');

    await expect(siteRepository.getPortfolio()).rejects.toThrow('Managed site content is unavailable');
  });

  it('uses the sample portfolio only when demo content mode is explicit', async () => {
    vi.stubEnv('SITE_CONTENT_MODE', 'demo');
    databaseState.available = false;

    await expect(siteRepository.getPortfolio()).resolves.toBe(demoPortfolio);
  });

  it('does not inherit Northline identity fields in managed mode', async () => {
    databaseState.singles.studio_settings = null;

    const portfolio = await siteRepository.getPortfolio();

    expect(portfolio.studioName).toBe('Managed Studio');
    expect(portfolio.email).toBe('');
    expect(portfolio.home.headline).toBe('Managed Studio');
    expect(portfolio.home.biography).toBe('');
    expect(portfolio.home.announcement).toBe('');
  });

  it('keeps deleted or hidden managed collections empty instead of restoring demo content', async () => {
    const portfolio = await siteRepository.getPortfolio();

    expect(portfolio.galleries).toEqual([]);
    expect(portfolio.posts).toEqual([]);
    expect(portfolio.packages).toEqual([]);
    expect(portfolio.home.featuredGallerySlugs).toEqual([]);
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

    const [post] = await siteRepository.listPosts();

    expect(post.cover).toBeNull();
  });

  it('reads tenant identity from runtime environment variables in the reusable server image', () => {
    for (const path of [
      'src/middleware.ts',
      'src/lib/studio.ts',
      'src/lib/content/repository.ts',
      'src/pages/api/inquiry.ts',
      'src/pages/api/site-status.ts',
      'src/pages/contact.astro',
    ]) {
      const source = fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
      expect(source).not.toMatch(/import\.meta\.env\.(SITE_KEY|SITE_WORKSPACE_SLUG)/);
    }
  });
});
