import { describe, expect, it } from 'vitest';

describe('tenant search-engine routes', () => {
  it('publishes robots directives pointing at the tenant canonical sitemap', async () => {
    const route = await import('../src/pages/robots.txt').catch(() => null);
    const handler = route?.GET;
    const response = handler
      ? await handler({
          locals: {
            siteContext: { canonicalOrigin: 'https://photos.example.com' },
          },
        } as never)
      : new Response('', { status: 501 });

    expect.soft(route).not.toBeNull();
    expect.soft(handler).toBeTypeOf('function');
    expect.soft(response.status).toBe(200);
    expect.soft(response.headers.get('content-type')).toContain('text/plain');
    expect(await response.text()).toBe([
      'User-agent: *',
      'Allow: /',
      'Sitemap: https://photos.example.com/sitemap.xml',
      '',
    ].join('\n'));
  });
});
