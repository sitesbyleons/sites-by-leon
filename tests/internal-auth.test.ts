
import { describe, expect, it } from 'vitest';

describe('photographer payment bridge', () => {
  it('keeps the bridge secret server-only', async () => {
    const connectSource = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../photographer-site/src/pages/api/connect.ts', import.meta.url), 'utf8'),
    );
    expect(connectSource).toContain('SITE_FUNCTION_SECRET');
    expect(connectSource).toContain("'x-site-api-secret': functionSecret");
    expect(connectSource).toContain("'x-clerk-user-id': auth.userId");
    expect(connectSource).not.toContain('authorization: `Bearer ${token}`');
  });

  it('requires custom authentication before Clerk identity is trusted', async () => {
    const functionSource = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../supabase/functions/connect-account/index.ts', import.meta.url), 'utf8'),
    );
    expect(functionSource).toContain('readInternalIdentity(request)');
    expect(functionSource).toContain("identity: { country: 'us' }");
    expect(functionSource).not.toContain('readClerkIdentity(bearerToken(request))');
  });
});

