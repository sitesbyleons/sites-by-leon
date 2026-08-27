import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ISHOTYOUU_FALLBACK_WORK } from '../src/lib/content/ishotyouu-fallback';
import { ishotyouuNavHref, isIshotyouuSite } from '../src/lib/ishotyouu';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('ISHOTYOUU public CMS wiring', () => {
  it('recognizes the ISHOTYOUU tenant without treating other hosts as that site', () => {
    expect(isIshotyouuSite({ siteKey: 'ishotyouu-demo', hostname: 'ishotyouu-test.leonsites.org' })).toBe(true);
    expect(isIshotyouuSite({ siteKey: 'northline-demo', hostname: 'demo.leonsites.org' })).toBe(false);
    expect(ishotyouuNavHref('/work/friday-night', '/work')).toBe(true);
    expect(ishotyouuNavHref('/about', '/work')).toBe(false);
  });

  it('keeps OG public routes and the shared inquire API', () => {
    expect(read('src/pages/about.astro')).toContain("canonicalPath=\"/about\"");
    expect(read('src/pages/inquire.astro')).toContain("fetch('/api/inquiry'");
    expect(read('src/pages/inquire.astro')).toContain('name="instagram"');
    expect(read('src/pages/index.astro')).toContain('class="hero"');
    expect(read('src/pages/work/index.astro')).toContain('ISHOTYOUU_FALLBACK_WORK');
    expect(read('src/pages/journal/index.astro')).toContain('No posts yet.');
    expect(read('src/layouts/SiteLayout.astro')).toContain('IshotyouuLayout');
    const layout = read('src/layouts/SiteLayout.astro');
    expect(layout.indexOf('NorthlineLayout')).toBeLessThan(layout.indexOf("from './IshotyouuLayout.astro'"));
  });

  it('does not swap ISHOTYOUU onto the Northline template homepage', () => {
    expect(read('src/pages/index.astro')).toContain('ishotyouu ? (');
    expect(read('src/pages/index.astro')).toContain('editorial-hero');
    expect(ISHOTYOUU_FALLBACK_WORK.length).toBeGreaterThan(10);
  });

  it('reuses an existing ISHOTYOUU workspace slug instead of inserting a colliding UUID', () => {
    const schema = readFileSync(new URL('../../infra/ovh/postgres/schema.sql', import.meta.url), 'utf8');
    expect(schema).toContain("select id into ws_id from client_workspaces where slug = 'ishotyouu'");
    expect(schema).toContain('if ws_id is null then');
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
