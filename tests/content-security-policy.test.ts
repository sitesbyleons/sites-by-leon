import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const read = (path: string) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const configs = [
  ['marketing', read('astro.config.mjs')],
  ['dashboard', read('dashboard/astro.config.mjs')],
  ['photographer', read('photographer-site/astro.config.mjs')],
] as const;

describe('content security policy', () => {
  it.each(configs)('%s delegates exact inline-script authorization to Astro hashes', (_name, config) => {
    expect(config).toMatch(/security:\s*{[\s\S]*?csp:\s*{/);
    expect(config).toContain('scriptDirective:');
    expect(config).toContain('styleDirective:');
    expect(config).toContain('strictDynamic: false');
    const scriptDirective = config.slice(
      config.indexOf('scriptDirective:'),
      config.indexOf('styleDirective:'),
    );
    expect(scriptDirective).not.toContain("'unsafe-inline'");

    for (const directive of [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      'font-src ',
      'img-src ',
      'connect-src ',
      'frame-src ',
      'worker-src ',
    ]) {
      expect(config).toContain(directive);
    }
  });

  it('keeps the temporary inline exception restricted to styles', () => {
    for (const [, config] of configs) {
      expect(config).toMatch(/styleDirective:[\s\S]*?resources:[\s\S]*?['"]'unsafe-inline'['"]/);
      expect(config).toContain("style-src-elem 'self' 'unsafe-inline'");
      expect(config).toContain("style-src-attr 'unsafe-inline'");
    }
  });

  it('bundles the static no-JS bootstrap so Astro can authorize it', () => {
    const layout = read('src/layouts/BaseLayout.astro');

    expect(layout).not.toContain('<script is:inline>');
    expect(layout.indexOf('<script>')).toBeGreaterThan(layout.indexOf('<body'));
  });

  it('mounts Clerk UI through bundled first-party controls instead of random inline scripts', () => {
    const dashboardMount = read('dashboard/src/components/ClerkUI.astro');
    const photographerMount = read('photographer-site/src/components/ClerkUI.astro');
    const applicationSources = [
      read('dashboard/src/pages/sign-in/[...signin].astro'),
      read('dashboard/src/pages/sign-up/[...signup].astro'),
      read('dashboard/src/pages/dashboard/index.astro'),
      read('dashboard/src/pages/dashboard/support.astro'),
      read('dashboard/src/pages/dashboard/billing.astro'),
      read('dashboard/src/pages/admin/access-denied.astro'),
      read('dashboard/src/components/AdminFrame.astro'),
      read('photographer-site/src/pages/sign-in/[...signin].astro'),
      read('photographer-site/src/pages/sign-up/[...signup].astro'),
      read('photographer-site/src/pages/admin/access-denied.astro'),
      read('photographer-site/src/layouts/StudioAdminLayout.astro'),
    ].join('\n');

    for (const mount of [dashboardMount, photographerMount]) {
      expect(mount).toContain("from '@clerk/astro/client'");
      expect(mount).toContain('data-clerk-ui');
      expect(mount).not.toContain('is:inline');
      expect(mount).not.toContain('define:vars');
    }
    expect(applicationSources).not.toContain("from '@clerk/astro/components'");
    expect(applicationSources).toContain('<ClerkUI');
    expect(applicationSources).toContain('<ClerkSignOutButton');
  });

  it('keeps only transport, navigation, and embedding policy in Caddy', () => {
    const caddy = read('infra/ovh/Caddyfile');
    const policy = caddy.match(/Content-Security-Policy "([^"]+)"/)?.[1];

    expect(caddy).toContain('+Content-Security-Policy');
    expect(policy).toBeDefined();
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).not.toContain('script-src');
    expect(policy).not.toContain('style-src');
    expect(policy).not.toContain("'unsafe-inline'");
  });
});
