import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { demoPortfolio } from '../src/lib/content/demo';
import { demoRepository } from '../src/lib/content/repository';

function readWebpDimensions(path: string) {
  const bytes = readFileSync(path);

  expect(bytes.subarray(0, 4).toString('ascii'), path).toBe('RIFF');
  expect(bytes.subarray(8, 12).toString('ascii'), path).toBe('WEBP');
  expect(bytes.subarray(12, 16).toString('ascii'), path).toBe('VP8 ');
  expect([...bytes.subarray(23, 26)], path).toEqual([0x9d, 0x01, 0x2a]);

  return {
    width: bytes.readUInt16LE(26) & 0x3fff,
    height: bytes.readUInt16LE(28) & 0x3fff,
  };
}

describe('Northline demo portfolio', () => {
  it('identifies itself as fictional concept content', () => {
    expect(demoPortfolio.conceptNotice).toContain('Fictional');
  });

  it('contains enough image-led material for a real portfolio', () => {
    expect(demoPortfolio.galleries).toHaveLength(3);
    expect(demoPortfolio.galleries.flatMap((gallery) => gallery.images).length).toBeGreaterThanOrEqual(12);
    expect(demoPortfolio.posts).toHaveLength(3);
  });

  it('keeps packages inquiry-only', () => {
    expect(demoPortfolio.packages.every((item) => item.ctaLabel === 'Ask about this package')).toBe(true);
  });

  it('uses the complete local Northline asset set', () => {
    const images = [
      ...demoPortfolio.galleries.flatMap((gallery) => [gallery.cover, ...gallery.images]),
      ...demoPortfolio.posts.map((post) => post.cover),
    ];
    const assetPaths = new Set(images.map((image) => image.src));

    expect(assetPaths).toEqual(
      new Set([
        '/images/northline/artist-window.webp',
        '/images/northline/artist-red-room.webp',
        '/images/northline/artist-profile.webp',
        '/images/northline/night-neon.webp',
        '/images/northline/night-car.webp',
        '/images/northline/night-theater.webp',
        '/images/northline/maker-ceramics.webp',
        '/images/northline/maker-tailor.webp',
        '/images/northline/maker-florist.webp',
        '/images/northline/studio-hands.webp',
        '/images/northline/studio-contact-sheet.webp',
        '/images/northline/studio-print.webp',
      ]),
    );
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
    await expect(demoRepository.getGallery('after-dark')).resolves.toMatchObject({ title: 'After Dark' });
    await expect(demoRepository.getPost('why-we-print-photographs')).resolves.toMatchObject({
      title: 'Why We Print Photographs',
    });
  });

  it('returns null for unknown slugs', async () => {
    await expect(demoRepository.getGallery('missing-gallery')).resolves.toBeNull();
    await expect(demoRepository.getPost('missing-post')).resolves.toBeNull();
  });
});
