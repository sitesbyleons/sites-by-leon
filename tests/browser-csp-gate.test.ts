import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const read = (path: string) => {
  const url = new URL(`../${path}`, import.meta.url);
  return fs.existsSync(url) ? fs.readFileSync(url, 'utf8') : '';
};

describe('browser CSP regression gate', () => {
  it('guards every browser suite against policy violations', () => {
    const guard = read('tests/e2e/csp-guard.ts');
    const specs = [
      read('tests/e2e/home.spec.ts'),
      read('dashboard/tests/e2e/dashboard.spec.ts'),
      read('photographer-site/tests/e2e/public-site.spec.ts'),
      read('photographer-site/tests/e2e/studio-admin.spec.ts'),
    ];

    expect(guard).toContain("document.addEventListener('securitypolicyviolation'");
    expect(guard).toContain("page.on('console'");
    expect(guard).toContain('page.exposeFunction');
    expect(guard).not.toContain('page.evaluate');
    for (const spec of specs) {
      expect(spec).toContain('useCspGuard(test)');
    }
  });

  it('runs dedicated dashboard and photographer CSP checks on production builds', () => {
    const projects = [
      {
        config: read('dashboard/playwright.csp.config.ts'),
        packageJson: read('dashboard/package.json'),
        spec: read('dashboard/tests/csp/content-security-policy.spec.ts'),
      },
      {
        config: read('photographer-site/playwright.csp.config.ts'),
        packageJson: read('photographer-site/package.json'),
        spec: read('photographer-site/tests/csp/content-security-policy.spec.ts'),
      },
    ];

    for (const project of projects) {
      expect(project.config).toContain('pnpm build');
      expect(project.config).toContain('pnpm start');
      expect(project.config).not.toContain('pnpm dev');
      expect(project.config).toContain('Production CSP tests require Clerk credentials');
      expect(project.config).toContain('PUBLIC_CLERK_PUBLISHABLE_KEY');
      expect(project.config).toContain('CLERK_SECRET_KEY');
      expect(project.packageJson).toContain('"test:csp"');
      expect(project.spec).toContain('useCspGuard(test)');
      expect(project.spec).toContain("script-src");
      expect(project.spec).toContain("'unsafe-inline'");
    }
  });

  it('runs both production CSP suites only after reviewed main-branch verification', () => {
    const workflow = read('.github/workflows/quality.yml');

    expect(workflow).toContain('pnpm --dir dashboard test:csp');
    expect(workflow).toContain('pnpm --dir photographer-site test:csp');
    expect(workflow).toContain("if: github.event_name == 'push' && github.ref == 'refs/heads/main'");
    expect(workflow).toContain('needs: verify');
    expect(workflow).toContain('ref: ${{ github.sha }}');
    expect(workflow).not.toContain('Clerk credentials unavailable; skipping production CSP tests.');
  });
});
