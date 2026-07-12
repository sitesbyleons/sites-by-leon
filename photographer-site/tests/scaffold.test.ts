import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('photographer site package', () => {
  it('exposes the required verification scripts', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(pkg.scripts).toMatchObject({
      check: 'astro check',
      test: 'vitest run',
      'test:e2e': 'playwright test',
      build: 'astro build',
    });
  });

  it('ships a standalone GitHub quality workflow for the published repository root', () => {
    const workflow = readFileSync(
      new URL('../.github/workflows/quality.yml', import.meta.url),
      'utf8',
    );

    expect(workflow).toContain('version: 11.7.0');
    expect(workflow).toContain('pnpm install --frozen-lockfile');
    expect(workflow).toContain('pnpm exec playwright install --with-deps chromium');
    expect(workflow).toContain('run: pnpm check');
    expect(workflow).toContain('run: pnpm test');
    expect(workflow).toContain('run: pnpm build');
    expect(workflow).toContain('run: pnpm test:e2e');
  });
});
