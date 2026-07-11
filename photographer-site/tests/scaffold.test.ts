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
});
