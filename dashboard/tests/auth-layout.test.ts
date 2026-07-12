import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('simple authentication layout', () => {
  const styles = readFileSync(new URL('../src/styles/dashboard.css', import.meta.url), 'utf8');

  it('centers the single sign-in card instead of retaining the old split grid', () => {
    expect(styles).toMatch(/\.auth-page--simple\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(styles).toMatch(/\.auth-page--simple\s*\{[\s\S]*gap:\s*0/);
  });

  it('does not repeat Clerk’s internal heading', () => {
    expect(styles).toContain('.auth-card .cl-header { display: none !important; }');
    expect(styles).not.toContain('.auth-page h1 {');
  });
});
