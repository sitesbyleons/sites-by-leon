import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('preview HTTPS redirect', () => {
  const caddy = readFileSync('ops/caddy/test.leonsites.org.Caddyfile', 'utf8');

  it('308s HTTP to HTTPS on test.leonsites.org only', () => {
    expect(caddy).toContain('http://test.leonsites.org');
    expect(caddy).toContain('redir https://test.leonsites.org{uri} 308');
    expect(caddy).not.toContain('http://leonsites.org {');
    expect(caddy).not.toContain('www.leonsites.org');
  });
});
