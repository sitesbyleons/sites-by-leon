import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { concepts, contactEmail, plans } from '../src/content/site';

describe('launch content', () => {
  it('keeps every portfolio example honest', () => {
    expect(concepts).toHaveLength(3);
    expect(concepts.every((concept) => concept.label === 'Concept Project')).toBe(true);
  });

  it('ships nine distinct local stock photographs with source documentation', () => {
    const images = concepts.flatMap((concept) => concept.images);
    const sourceManifest = readFileSync(
      fileURLToPath(new URL('../docs/architecture/stock-images.md', import.meta.url)),
      'utf8',
    );
    const hashes = new Set<string>();

    expect(images).toHaveLength(9);

    for (const image of images) {
      const path = fileURLToPath(new URL(`../public${image.src}`, import.meta.url));
      expect(existsSync(path), image.src).toBe(true);

      const bytes = readFileSync(path);
      expect(bytes.subarray(0, 4).toString('ascii'), image.src).toBe('RIFF');
      expect(bytes.subarray(8, 12).toString('ascii'), image.src).toBe('WEBP');
      expect(image.alt.trim().length, image.src).toBeGreaterThan(0);
      expect(sourceManifest, image.src).toContain(image.src.split('/').at(-1));
      hashes.add(createHash('sha256').update(bytes).digest('hex'));
    }

    expect(hashes.size).toBe(images.length);
    expect(sourceManifest).toContain('https://unsplash.com/license');
  });

  it('publishes the approved monthly range without a build fee', () => {
    expect(plans.map((plan) => plan.monthlyPrice)).toEqual([25, 30, 40]);
    expect(plans.every((plan) => plan.buildFee === 0)).toBe(true);
  });

  it('includes domains and payments in every plan while reserving custom design for Signature', () => {
    expect(plans.every((plan) => plan.features.includes('Domain setup'))).toBe(true);
    expect(plans.every((plan) => plan.features.includes('Payment setup'))).toBe(true);
    expect(plans.slice(0, 2).every((plan) => plan.features.some((feature) => /template/i.test(feature)))).toBe(true);
    expect(plans[2].features).toContain('Custom site');
  });

  it('uses the approved contact address', () => {
    expect(contactEmail).toBe('leon@leonsites.com');
  });
});
