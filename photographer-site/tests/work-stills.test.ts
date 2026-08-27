import { describe, expect, it } from 'vitest';

import {
  instagramShortcode,
  isSidecarWorkImage,
  libraryStillsForInstagramUrl,
  normalizeInstagramUrl,
  stillToFrame,
} from '../src/lib/work-stills';

describe('ISHOTYOUU work stills', () => {
  it('accepts sidecar Work images and rejects other URLs', () => {
    expect(isSidecarWorkImage('/work/19-DbxBpe1lvmD.jpg')).toBe(true);
    expect(isSidecarWorkImage('/work/27-DbY_1lAoMaf.jpg')).toBe(true);
    expect(isSidecarWorkImage('/work/still.webp')).toBe(true);
    expect(isSidecarWorkImage('https://example.com/work/19-DbxBpe1lvmD.jpg')).toBe(false);
    expect(isSidecarWorkImage('/images/sports/football-huddle.webp')).toBe(false);
    expect(isSidecarWorkImage('/work/../secret.jpg')).toBe(false);
  });

  it('normalizes Instagram post and reel URLs', () => {
    expect(normalizeInstagramUrl('https://www.instagram.com/p/DbxBpe1lvmD/')).toBe('https://www.instagram.com/p/DbxBpe1lvmD/');
    expect(normalizeInstagramUrl('https://instagram.com/p/DbxBpe1lvmD/?img_index=1')).toBe('https://www.instagram.com/p/DbxBpe1lvmD/');
    expect(normalizeInstagramUrl('https://www.instagram.com/reel/DcWUeeYIMSf')).toBe('https://www.instagram.com/reel/DcWUeeYIMSf/');
    expect(normalizeInstagramUrl('https://evil.example/p/DbxBpe1lvmD/')).toBeNull();
    expect(normalizeInstagramUrl('not-a-url')).toBeNull();
  });

  it('matches library stills from a pasted Instagram URL without scraping Instagram', () => {
    expect(instagramShortcode('https://www.instagram.com/p/DbxBpe1lvmD/?img_index=2')).toBe('DbxBpe1lvmD');
    expect(libraryStillsForInstagramUrl('https://instagram.com/p/DbxBpe1lvmD/').map((frame) => frame.src)).toEqual([
      '/work/19-DbxBpe1lvmD.jpg',
      '/work/20-DbxBpe1lvmD.jpg',
    ]);
    expect(libraryStillsForInstagramUrl('https://evil.example/p/DbxBpe1lvmD/')).toEqual([]);
  });

  it('maps saved stills onto the public Work frame shape', () => {
    expect(stillToFrame({
      image_url: '/work/19-DbxBpe1lvmD.jpg',
      alt_text: 'Selected still',
      instagram_url: 'https://www.instagram.com/p/DbxBpe1lvmD/',
    })).toEqual({
      src: '/work/19-DbxBpe1lvmD.jpg',
      alt: 'Selected still',
      instagramUrl: 'https://www.instagram.com/p/DbxBpe1lvmD/',
    });
  });
});
