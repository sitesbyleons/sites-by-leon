import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { demoPortfolio } from '../src/lib/content/demo';
import { demoRepository } from '../src/lib/content/repository';

function readWebpDimensions(path: string) {
  const bytes = readFileSync(path);

  expect(bytes.subarray(0, 4).toString('ascii'), path).toBe('RIFF');
  expect(bytes.subarray(8, 12).toString('ascii'), path).toBe('WEBP');
  const format = bytes.subarray(12, 16).toString('ascii');

  if (format === 'VP8 ') {
    expect([...bytes.subarray(23, 26)], path).toEqual([0x9d, 0x01, 0x2a]);
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  }

  if (format === 'VP8X') {
    const readUInt24LE = (offset: number) =>
      bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);

    return {
      width: readUInt24LE(24) + 1,
      height: readUInt24LE(27) + 1,
    };
  }

  throw new Error(`Unsupported WebP format ${format} for ${path}`);
}

describe('Northline demo portfolio', () => {
  it('does not expose prototype labeling as portfolio content', () => {
    expect(demoPortfolio.conceptNotice).toBe('');
  });

  it('contains enough image-led material for a real portfolio', () => {
    expect(demoPortfolio.galleries).toHaveLength(3);
    expect(demoPortfolio.galleries.flatMap((gallery) => gallery.images)).toHaveLength(9);
    expect(demoPortfolio.posts).toHaveLength(3);
  });

  it('keeps packages inquiry-only', () => {
    expect(demoPortfolio.packages.every((item) => item.ctaLabel === 'Ask about this package')).toBe(true);
  });

  it('uses the complete local sports asset set', () => {
    const images = [
      ...demoPortfolio.galleries.flatMap((gallery) => [gallery.cover, ...gallery.images]),
      ...demoPortfolio.posts.map((post) => post.cover),
    ];
    const assetPaths = new Set(images.map((image) => image.src));

    expect(assetPaths).toEqual(
      new Set([
        '/images/sports/football-huddle.webp',
        '/images/sports/football-player.webp',
        '/images/sports/football-field.webp',
        '/images/sports/basketball-action.webp',
        '/images/sports/basketball-grayscale.webp',
        '/images/sports/basketball-court.webp',
        '/images/sports/track-runner.webp',
        '/images/sports/track-start.webp',
        '/images/sports/track-night.webp',
      ]),
    );
  });

  it('uses each sports asset exactly once across the three gallery sequences', () => {
    const gallerySources = demoPortfolio.galleries.flatMap((gallery) =>
      gallery.images.map((image) => image.src),
    );

    expect(gallerySources).toHaveLength(9);
    expect(new Set(gallerySources).size).toBe(gallerySources.length);
    expect(new Set(gallerySources)).toEqual(
      new Set([
        '/images/sports/football-huddle.webp',
        '/images/sports/football-player.webp',
        '/images/sports/football-field.webp',
        '/images/sports/basketball-action.webp',
        '/images/sports/basketball-grayscale.webp',
        '/images/sports/basketball-court.webp',
        '/images/sports/track-runner.webp',
        '/images/sports/track-start.webp',
        '/images/sports/track-night.webp',
      ]),
    );

    for (const gallery of demoPortfolio.galleries) {
      expect(new Set(gallery.images.map((image) => image.src)).size, gallery.slug).toBe(3);
    }
  });

  it('keeps gallery frames image-led without decorative captions', () => {
    const captions = demoPortfolio.galleries.flatMap((gallery) =>
      gallery.images.map((image) => image.caption),
    );

    expect(captions.every((caption) => caption === null)).toBe(true);
  });

  it('references image files that exist and match their declared dimensions', () => {
    const images = [
      ...demoPortfolio.galleries.flatMap((gallery) => [gallery.cover, ...gallery.images]),
      ...demoPortfolio.posts.map((post) => post.cover),
    ];
    const fixturesBySrc = new Map(images.map((image) => [image.src, image]));

    for (const image of fixturesBySrc.values()) {
      const path = fileURLToPath(new URL(`../public${image.src}`, import.meta.url));

      expect(existsSync(path), image.src).toBe(true);
      expect(readWebpDimensions(path), image.src).toEqual({
        width: image.width,
        height: image.height,
      });
    }
  });

  it('documents the stock source for every local Northline photograph', () => {
    const manifestPath = fileURLToPath(new URL('../STOCK-PHOTOS.md', import.meta.url));
    const manifest = readFileSync(manifestPath, 'utf8');

    for (const image of demoPortfolio.galleries.flatMap((gallery) => gallery.images)) {
      expect(manifest, image.src).toContain(image.src.split('/').at(-1));
    }

    expect(manifest).toContain('https://unsplash.com/license');
    expect(manifest).toContain('none of the images contains a watermark');
  });

  it('gives every distinct fixture asset unique alternative text', () => {
    const images = [
      ...demoPortfolio.galleries.flatMap((gallery) => [gallery.cover, ...gallery.images]),
      ...demoPortfolio.posts.map((post) => post.cover),
    ];
    const altBySrc = new Map(images.map((image) => [image.src, image.alt]));
    const altText = [...altBySrc.values()];

    expect(new Set(altText).size).toBe(altText.length);
    expect(altText.every((alt) => alt.trim().length > 0)).toBe(true);
  });

  it('keeps repeated asset metadata deterministic', () => {
    const images = [
      ...demoPortfolio.galleries.flatMap((gallery) => [gallery.cover, ...gallery.images]),
      ...demoPortfolio.posts.map((post) => post.cover),
    ];
    const contractsBySrc = new Map<string, Set<string>>();

    for (const { src, alt, width, height } of images) {
      const contracts = contractsBySrc.get(src) ?? new Set<string>();
      contracts.add(JSON.stringify({ alt, width, height }));
      contractsBySrc.set(src, contracts);
    }

    expect([...contractsBySrc.entries()].filter(([, contracts]) => contracts.size > 1)).toEqual([]);
  });
});

describe('Northline demo repository', () => {
  it('returns the complete published portfolio', async () => {
    await expect(demoRepository.getPortfolio()).resolves.toBe(demoPortfolio);
    await expect(demoRepository.listGalleries()).resolves.toEqual(demoPortfolio.galleries);
    await expect(demoRepository.listPosts()).resolves.toEqual(demoPortfolio.posts);
  });

  it('finds published entries by slug', async () => {
    await expect(demoRepository.getGallery('above-the-rim')).resolves.toMatchObject({ title: 'Basketball' });
    await expect(demoRepository.getPost('through-the-finish')).resolves.toMatchObject({
      title: 'Photographing Track',
    });
  });

  it('returns null for unknown slugs', async () => {
    await expect(demoRepository.getGallery('missing-gallery')).resolves.toBeNull();
    await expect(demoRepository.getPost('missing-post')).resolves.toBeNull();
  });
});
