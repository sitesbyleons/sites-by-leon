import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const caddyfile = readFileSync(new URL('../infra/ovh/Caddyfile', import.meta.url), 'utf8');

const matcherBlock = (name: string) => {
  const match = caddyfile.match(new RegExp(`@${name}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`));
  expect(match, `missing @${name} matcher`).not.toBeNull();
  return match?.[1] ?? '';
};

describe('production gateway routing contract', () => {
  it('serves the coming-soon document for both production entry paths', () => {
    const comingSoon = matcherBlock('coming_soon');

    expect(comingSoon).toContain('host {$MARKETING_DOMAIN} {$MARKETING_WWW_DOMAIN}');
    expect(comingSoon).toMatch(/\bpath\s+\/\s+\/index\.html\s*$/m);
    expect(comingSoon).toContain('expression {env.PUBLIC_SITE_MODE} == "coming-soon"');
    expect(caddyfile).toContain('rewrite * /coming-soon/index.html');
  });

  it('keeps the test site and application routes outside the coming-soon matcher', () => {
    const comingSoon = matcherBlock('coming_soon');
    const dashboard = matcherBlock('dashboard');

    expect(comingSoon).not.toContain('{$TEST_DOMAIN}');
    expect(comingSoon).not.toMatch(/\/admin|\/dashboard|\/sign-in|\/sign-up|\/api/);
    expect(caddyfile).toContain('@test host {$TEST_DOMAIN}');
    expect(caddyfile).toContain('reverse_proxy gateway-test:80');
    expect(caddyfile).toContain('@marketing host {$MARKETING_DOMAIN} {$MARKETING_WWW_DOMAIN}');
    expect(dashboard).toContain('host {$MARKETING_DOMAIN} {$MARKETING_WWW_DOMAIN}');
    expect(dashboard).not.toContain('{$TEST_DOMAIN}');
    expect(dashboard).toContain('/admin');
    expect(dashboard).toContain('/api/*');
    expect(caddyfile.indexOf('handle @dashboard')).toBeLessThan(
      caddyfile.indexOf('handle @coming_soon'),
    );
  });
});
