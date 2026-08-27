import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ISHOTYOUU_FALLBACK_WORK, ishotyouuLibraryStills } from '../src/lib/content/ishotyouu-fallback';
import {
  ishotyouuInternalPath,
  ishotyouuNavHref,
  ishotyouuPublicPathname,
  isIshotyouuHiddenPublicPath,
  isIshotyouuPublicPath,
  isIshotyouuSite,
} from '../src/lib/ishotyouu';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('ISHOTYOUU public CMS wiring', () => {
  it('recognizes the ISHOTYOUU tenant without treating other hosts as that site', () => {
    expect(isIshotyouuSite({ siteKey: 'ishotyouu-demo', hostname: 'ishotyouu-test.leonsites.org' })).toBe(true);
    expect(isIshotyouuSite({ siteKey: 'northline-demo', hostname: 'demo.leonsites.org' })).toBe(false);
    expect(isIshotyouuPublicPath('/work/selected-stills')).toBe(true);
    expect(isIshotyouuPublicPath('/journal')).toBe(false);
    expect(isIshotyouuPublicPath('/packages')).toBe(false);
    expect(isIshotyouuHiddenPublicPath('/journal/selected-stills')).toBe(true);
    expect(isIshotyouuHiddenPublicPath('/packages')).toBe(true);
    expect(isIshotyouuPublicPath('/admin')).toBe(false);
    expect(ishotyouuInternalPath('/work')).toBe('/i/work');
    expect(ishotyouuPublicPathname('/i/work/selected-stills')).toBe('/work/selected-stills');
    expect(ishotyouuNavHref('/i/work/friday-night', '/work')).toBe(true);
    expect(ishotyouuNavHref('/about', '/work')).toBe(false);
  });

  it('keeps OG public routes on an isolated page tree and the shared inquire API', () => {
    expect(read('src/pages/i/about.astro')).toContain('canonicalPath="/about"');
    expect(read('src/pages/i/inquire.astro')).toContain("fetch('/api/inquiry'");
    expect(read('src/pages/i/inquire.astro')).toContain('name="instagram"');
    expect(read('src/pages/i/inquire.astro')).toContain('searchParams.get(\'package\')');
    expect(read('src/pages/i/index.astro')).toContain('class="hero"');
    expect(read('src/pages/i/work/index.astro')).toContain('ISHOTYOUU_FALLBACK_WORK');
    expect(read('src/layouts/IshotyouuLayout.astro')).toContain("label: 'Inquire'");
    expect(read('src/layouts/IshotyouuLayout.astro')).not.toContain("label: 'Journal'");
    expect(read('src/layouts/IshotyouuLayout.astro')).not.toContain("label: 'Services'");
    expect(read('src/pages/sitemap.xml.ts')).toContain("path: isIshotyouu ? '/inquire' : '/contact'");
    expect(read('src/pages/sitemap.xml.ts')).toContain('isIshotyouu ? []');
    expect(read('src/layouts/SiteLayout.astro')).not.toContain('IshotyouuLayout');
    expect(read('src/pages/i/index.astro')).toContain('IshotyouuLayout');
    expect(read('src/pages/index.astro')).not.toContain('IshotyouuLayout');
    expect(read('src/pages/index.astro')).toContain('ContactSheet');
  });

  it('does not swap ISHOTYOUU onto the Northline template homepage', () => {
    expect(read('src/pages/index.astro')).toContain('editorial-hero');
    expect(read('src/pages/i/index.astro')).toContain('class="hero"');
    expect(ISHOTYOUU_FALLBACK_WORK.length).toBeGreaterThan(10);
    expect(ishotyouuLibraryStills().length).toBeGreaterThan(5);
  });

  it('rewrites ISHOTYOUU public URLs onto the isolated page tree', () => {
    const middleware = read('src/middleware.ts');
    expect(middleware).toContain('ishotyouuRoutes');
    expect(middleware).toContain('context.rewrite');
    expect(middleware).toContain('ishotyouuInternalPath');
    expect(middleware).toContain('isIshotyouuHiddenPublicPath');
  });

  it('reuses an existing ISHOTYOUU workspace slug instead of inserting a colliding UUID', () => {
    const schema = readFileSync(new URL('../../infra/ovh/postgres/schema.sql', import.meta.url), 'utf8');
    expect(schema).toContain("select id into ws_id from client_workspaces where slug = 'ishotyouu'");
    expect(schema).toContain('if ws_id is null then');
    expect(schema).toContain("if not exists (select 1 from studio_galleries where workspace_id = ws_id)");
    expect(schema).toContain("if not exists (select 1 from studio_posts where workspace_id = ws_id)");
    expect(schema).toContain("if not exists (select 1 from studio_services where workspace_id = ws_id)");
    expect(schema).toContain('related_gallery_id');
  });

  it('routes TEST HTML to photographer-test while keeping OG work images on the sidecar', () => {
    const caddy = readFileSync(new URL('../../infra/ovh/Caddyfile.test', import.meta.url), 'utf8');
    expect(caddy).toContain('@ishotyouu_media_files');
    expect(caddy).toContain('path /work/*.jpg');
    expect(caddy).toContain('@ishotyouu host ishotyouu-test.leonsites.org');
    expect(caddy).not.toContain('@ishotyouu_public');
    expect(caddy).toContain('reverse_proxy photographer-test:4321');
  });
});
