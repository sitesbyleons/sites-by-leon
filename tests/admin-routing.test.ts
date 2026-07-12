import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Leon admin routing', () => {
  it('routes the admin surface to the dashboard inside the OVH gateway', () => {
    const config = readFileSync(new URL('../infra/ovh/Caddyfile', import.meta.url), 'utf8');

    expect(config).toContain('path /admin /admin/* /dashboard /dashboard/* /sign-in /sign-in/* /sign-up /sign-up/* /api/* /admin-assets/*');
    expect(config).toContain('reverse_proxy dashboard:4321');
    expect(config).not.toContain('app.leonsites.org');
  });

  it('uses an isolated asset directory for the dashboard', () => {
    const config = readFileSync(new URL('../dashboard/astro.config.mjs', import.meta.url), 'utf8');

    expect(config).toContain("assets: 'admin-assets'");
    expect(config).toContain("site: 'https://leonsites.org'");
  });

  it('allows Clerk only through the explicit authentication hosts', () => {
    const config = readFileSync(new URL('../infra/ovh/Caddyfile', import.meta.url), 'utf8');

    expect(config).toContain('https://clerk.leonsites.org');
    expect(config).toContain('https://accounts.leonsites.org');
    expect(config).toContain("frame-ancestors 'none'");
    expect(config).toContain("object-src 'none'");
  });
});
