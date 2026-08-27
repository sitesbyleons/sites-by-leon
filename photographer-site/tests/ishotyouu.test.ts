import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ISHOTYOUU_FALLBACK_WORK, ishotyouuLibraryStills } from '../src/lib/content/ishotyouu-fallback';
import {
  ishotyouuInternalPath,
  ishotyouuNavHref,
  ishotyouuPublicPathname,
  isIshotyouuHiddenPublicPath,
  isIshotyouuPublicPath,
  isIshotyouuSite,
  isIshotyouuWorkDetailPath,
} from '../src/lib/ishotyouu';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('ISHOTYOUU public CMS wiring', () => {
  it('recognizes the ISHOTYOUU tenant without treating other hosts as that site', () => {
    expect(isIshotyouuSite({ siteKey: 'ishotyouu-demo', hostname: 'ishotyouu-test.leonsites.org' })).toBe(true);
    expect(isIshotyouuSite({ siteKey: 'northline-demo', hostname: 'demo.leonsites.org' })).toBe(false);
    expect(isIshotyouuPublicPath('/work/selected-stills')).toBe(false);
    expect(isIshotyouuWorkDetailPath('/work/selected-stills')).toBe(true);
    expect(isIshotyouuPublicPath('/journal')).toBe(false);
    expect(isIshotyouuPublicPath('/packages')).toBe(false);
    expect(isIshotyouuHiddenPublicPath('/journal/selected-stills')).toBe(true);
    expect(isIshotyouuHiddenPublicPath('/packages')).toBe(true);
    expect(isIshotyouuHiddenPublicPath('/i/journal')).toBe(true);
    expect(isIshotyouuHiddenPublicPath('/i/packages')).toBe(true);
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
    expect(read('src/pages/i/inquire.astro')).toContain('name="phone"');
    expect(read('src/pages/i/inquire.astro')).not.toContain('name="email" type="email" autocomplete="email" maxlength="254" required');
    expect(read('src/pages/i/inquire.astro')).toContain('searchParams.get(\'package\')');
    expect(read('src/pages/i/index.astro')).toContain('class="hero"');
    expect(read('src/pages/i/index.astro')).toContain('hero-lede');
    expect(read('src/pages/i/index.astro')).toContain('portfolio.home.introduction');
    expect(read('src/pages/i/work/index.astro')).toContain('publicWorkFrames');
    expect(read('src/pages/i/work/index.astro')).toContain('listWorkStills');
    expect(read('src/pages/i/work/index.astro')).toContain('instagramUrl');
    expect(read('src/pages/i/work/index.astro')).not.toContain('portfolio.galleries');
    expect(read('src/layouts/StudioAdminLayout.astro')).toContain("label: 'Files'");
    expect(read('src/layouts/StudioAdminLayout.astro')).toContain("label: 'Your website'");
    expect(read('src/layouts/StudioAdminLayout.astro')).toContain('ishotyouu ?');
    expect(read('src/pages/admin/work.astro')).toContain('Add to Work');
    expect(read('src/pages/admin/work.astro')).toContain('studio-panel--add-work');
    expect(read('src/pages/admin/work.astro')).toContain('data-load-live-work');
    expect(read('src/pages/admin/work.astro')).toContain('ISHOTYOUU_FALLBACK_WORK');
    expect(read('src/pages/admin/work.astro')).toContain('WORK_STILLS_PAGE_SIZE');
    expect(read('src/pages/admin/work.astro')).toContain("redirect('/admin/galleries')");
    expect(read('src/pages/api/admin/[resource].ts')).toContain("resource === 'stills'");
    expect(read('src/pages/api/admin/[resource].ts')).toContain('isIshotyouuSite');
    expect(read('src/pages/api/admin/[resource].ts')).toContain('normalizeInstagramUrl');
    expect(read('src/pages/admin/galleries.astro')).toContain("redirect('/admin/media')");
    expect(read('src/pages/admin/posts.astro')).toContain("redirect('/admin/media')");
    expect(read('src/layouts/IshotyouuLayout.astro')).toContain("label: 'Home'");
    expect(read('src/layouts/IshotyouuLayout.astro')).toContain("label: 'Work'");
    expect(read('src/layouts/IshotyouuLayout.astro')).toContain("label: 'About'");
    expect(read('src/layouts/IshotyouuLayout.astro')).toContain("label: 'Inquire'");
    expect(read('src/layouts/IshotyouuLayout.astro')).not.toContain('Edit site');
    expect(read('src/layouts/IshotyouuLayout.astro')).not.toContain('nav-edit');
    expect(read('src/layouts/IshotyouuLayout.astro')).not.toContain('href="/admin"');
    expect(read('src/styles/ishotyouu.css')).not.toContain('.nav-edit');
    expect(read('src/layouts/StudioAdminLayout.astro')).toContain("label: 'Edit homepage'");
    expect(read('src/layouts/StudioAdminLayout.astro')).toContain("label: 'Edit Work'");
    expect(read('src/layouts/IshotyouuLayout.astro')).toContain('ISHOTYOUU_INSTAGRAM_URL');
    expect(read('src/layouts/IshotyouuLayout.astro')).not.toContain("label: 'Journal'");
    expect(read('src/layouts/IshotyouuLayout.astro')).not.toContain("label: 'Services'");
    expect(existsSync(new URL('../src/pages/i/journal/index.astro', import.meta.url))).toBe(false);
    expect(existsSync(new URL('../src/pages/i/packages.astro', import.meta.url))).toBe(false);
    expect(read('src/pages/sitemap.xml.ts')).toContain("path: isIshotyouu ? '/inquire' : '/contact'");
    expect(read('src/pages/sitemap.xml.ts')).toContain('isIshotyouu ? []');
    expect(read('src/layouts/SiteLayout.astro')).not.toContain('IshotyouuLayout');
    expect(read('src/pages/i/index.astro')).toContain('IshotyouuLayout');
    expect(read('src/pages/index.astro')).not.toContain('IshotyouuLayout');
    expect(read('src/pages/index.astro')).toContain('ContactSheet');
    expect(read('src/styles/ishotyouu.css')).toContain('html[data-site="ishotyouu"]');
    expect(read('src/styles/ishotyouu.css')).not.toContain(':root{');
    expect(read('src/styles/studio-admin.css')).toContain('.studio-access-screen .cl-rootBox');
    expect(read('src/styles/studio-admin.css')).not.toContain('.cl-rootBox, .cl-card, .cl-internal-b3fm6y { max-width: 100% !important; width: 100% !important; }');
    expect(read('src/components/StudioIcon.astro')).toContain("name === 'invoices'");
    expect(read('src/pages/admin/services.astro')).toContain('studio-section-heading--center');
    expect(read('src/pages/admin/services.astro').indexOf('Add a service')).toBeLessThan(
      read('src/pages/admin/services.astro').indexOf('Your services'),
    );
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
    expect(middleware).toContain('isIshotyouuWorkDetailPath');
  });

  it('reuses an existing ISHOTYOUU workspace slug instead of inserting a colliding UUID', () => {
    const schema = readFileSync(new URL('../../infra/ovh/postgres/schema.sql', import.meta.url), 'utf8');
    expect(schema).toContain("select id into ws_id from client_workspaces where slug = 'ishotyouu'");
    expect(schema).toContain('if ws_id is null then');
    expect(schema).toContain("if not exists (select 1 from studio_services where workspace_id = ws_id)");
    expect(schema).toContain("if not exists (select 1 from studio_work_stills where workspace_id = ws_id)");
    expect(schema).toContain('copy the live homepage text');
    expect(schema).toContain('create the workspace, change billing, or add members.');
    expect(schema).toContain('related_gallery_id');
    expect(schema).toContain('Keep ISHOTYOUU owners that Leon linked. Do not copy owners from other workspaces.');
    expect(schema).not.toContain('clerk_user_id not in (select clerk_user_id from app_admins)');
    expect(schema).not.toContain('where workspace_id <> ws_id and role in');
    expect(schema).toContain('monthly_cents = 2000');
    expect(schema).toContain('ishotyouu.com');
    expect(schema).toContain('ishotyouu.org');
    expect(schema).toContain('public Work is Instagram stills, not CMS galleries or posts');
    expect(schema).toContain("values (ws_id, 'ishotyouu-demo', 'client', 'ishotyouu-test.leonsites.org'");
    expect(schema).toContain("site_kind = 'client'");
    expect(schema).toContain("where primary_domain in ('demo.leonsites.org', 'vow-and-light.leonsites.org');");
    expect(schema).not.toContain("vow-and-light.leonsites.org', 'ishotyouu.leonsites.org");
  });

  it('routes TEST HTML to photographer-test while keeping OG work images on the sidecar', () => {
    const caddy = readFileSync(new URL('../../infra/ovh/Caddyfile.test', import.meta.url), 'utf8');
    const production = readFileSync(new URL('../../infra/ovh/Caddyfile', import.meta.url), 'utf8');
    expect(caddy).toContain('@ishotyouu_media_files');
    expect(caddy).toContain('path /work/*.jpg');
    expect(caddy).toContain('@ishotyouu host ishotyouu-test.leonsites.org');
    expect(caddy).not.toContain('@ishotyouu_public');
    expect(caddy).toContain('reverse_proxy photographer-test:4321');
    expect(production).toContain('host ishotyouu.leonsites.org');
    expect(production).toContain('reverse_proxy ishotyouu-stills:80');
    expect(production).not.toContain('reverse_proxy ishotyouu-demo:4321');
    expect(production).toContain('reverse_proxy photographer:4321');
  });
});
