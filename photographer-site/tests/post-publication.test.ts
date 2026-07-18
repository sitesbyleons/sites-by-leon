import { describe, expect, it } from 'vitest';

import { resolvePublishedAt } from '../src/lib/post-publication';

describe('resolvePublishedAt', () => {
  const now = '2026-07-18T12:00:00.000Z';

  it('preserves the original timestamp while a published post is edited', () => {
    expect(resolvePublishedAt('2026-01-05T08:30:00.000Z', 'published', now))
      .toBe('2026-01-05T08:30:00.000Z');
  });

  it('sets a timestamp when a draft becomes published', () => {
    expect(resolvePublishedAt(null, 'published', now)).toBe(now);
  });

  it('clears the timestamp when a post becomes a draft', () => {
    expect(resolvePublishedAt('2026-01-05T08:30:00.000Z', 'draft', now)).toBeNull();
    expect(resolvePublishedAt(null, 'draft', now)).toBeNull();
  });
});
