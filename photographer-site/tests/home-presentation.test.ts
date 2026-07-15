import { describe, expect, it } from 'vitest';

import { selectHomeHeroImages } from '../src/lib/content/home';
import { demoPortfolio } from '../src/lib/content/demo';

describe('home presentation', () => {
  it('builds a complete two-image hero from one featured gallery', () => {
    const gallery = demoPortfolio.galleries[0];
    const hero = selectHomeHeroImages([gallery]);

    expect(hero.imageCount).toBe(2);
    expect(hero.leadLandscape?.src).not.toBe(hero.leadPortrait?.src);
    expect([gallery.cover, ...gallery.images]).toContain(hero.leadLandscape);
    expect(gallery.images).toContain(hero.leadPortrait);
  });
});
