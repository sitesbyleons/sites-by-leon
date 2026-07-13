import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { optimizeUploadedImage } from '../src/lib/image-processing';

describe('uploaded image processing', () => {
  it('autorotates, bounds dimensions, strips metadata, and emits WebP', async () => {
    const input = await sharp({
      create: {
        width: 3_000,
        height: 1_000,
        channels: 3,
        background: '#a1422b',
      },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const result = await optimizeUploadedImage(input);
    const metadata = await sharp(result.bytes).metadata();

    expect(result.extension).toBe('webp');
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(800);
    expect(metadata.height).toBe(2_400);
    expect(metadata.orientation).toBeUndefined();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
  });

  it('does not enlarge a small image', async () => {
    const input = await sharp({
      create: {
        width: 120,
        height: 80,
        channels: 3,
        background: '#ffffff',
      },
    }).png().toBuffer();

    const result = await optimizeUploadedImage(input);

    expect({ width: result.width, height: result.height }).toEqual({ width: 120, height: 80 });
  });

  it('rejects images above the decoded pixel limit before optimization', async () => {
    const input = await sharp({
      create: {
        width: 101,
        height: 101,
        channels: 3,
        background: '#000000',
      },
    }).png().toBuffer();

    await expect(optimizeUploadedImage(input, { maxInputPixels: 10_000 }))
      .rejects.toMatchObject({ code: 'pixel-limit' });
  });
});
