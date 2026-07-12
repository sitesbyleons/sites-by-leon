import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Leon admin routing', () => {
  it('proxies the admin surface to the separate dashboard deployment', () => {
    const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
    const rewrites = new Map(
      config.rewrites.map((rewrite: { source: string; destination: string }) => [rewrite.source, rewrite.destination]),
    );

    expect(rewrites.get('/admin')).toBe('https://sites-by-leon-dashboard.vercel.app/admin');
    expect(rewrites.get('/admin/:path*')).toBe('https://sites-by-leon-dashboard.vercel.app/admin/:path*');
    expect(rewrites.get('/admin-assets/:path*')).toBe(
      'https://sites-by-leon-dashboard.vercel.app/admin-assets/:path*',
    );
    expect(rewrites.get('/api/:path*')).toBe('https://sites-by-leon-dashboard.vercel.app/api/:path*');
  });

  it('uses an isolated asset directory for the dashboard', () => {
    const config = readFileSync(new URL('../dashboard/astro.config.mjs', import.meta.url), 'utf8');

    expect(config).toContain("assets: 'admin-assets'");
    expect(config).toContain("site: 'https://leonsites.org'");
  });
});
