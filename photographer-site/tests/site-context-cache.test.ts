import { describe, expect, it } from 'vitest';

import { SiteContextCache, type SiteContext } from '../src/lib/site-context';

const context = (hostname: string): SiteContext => ({
  workspaceId: `workspace:${hostname}`,
  siteKey: `site:${hostname}`,
  hostname,
  primaryDomain: hostname,
  adminDomain: hostname,
  canonicalOrigin: `https://${hostname}`,
  status: 'active',
  isAdminHost: false,
  isFallback: false,
});

describe('site context cache', () => {
  it('keys exact lowercase hostnames without suffix matching', () => {
    const cache = new SiteContextCache();
    cache.set('Photos.Example.com', context('photos.example.com'));
    cache.set('local.example.com', { ...context('local.example.com'), isFallback: true });

    expect(cache.get('photos.example.com')?.workspaceId).toBe('workspace:photos.example.com');
    expect(cache.get('photos.example.com.attacker.net')).toBeNull();
    expect(cache.get('local.example.com')).toBeNull();
  });

  it('expires status quickly and remains bounded', () => {
    let now = 1_000;
    const cache = new SiteContextCache({ maxEntries: 2, ttlMs: 5_000, now: () => now });
    cache.set('one.example.com', context('one.example.com'));
    cache.set('two.example.com', context('two.example.com'));
    cache.set('three.example.com', context('three.example.com'));

    expect(cache.size).toBe(2);
    expect(cache.get('one.example.com')).toBeNull();
    expect(cache.get('three.example.com')).not.toBeNull();

    now += 5_001;
    expect(cache.get('three.example.com')).toBeNull();
    expect(cache.size).toBe(1);
  });
});
