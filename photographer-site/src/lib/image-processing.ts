import sharp from 'sharp';

export const MAX_IMAGE_DIMENSION = 2_400;
export const MAX_INPUT_PIXELS = 40_000_000;

type ProcessingOptions = {
  maxInputPixels?: number;
};

export class ImageProcessingError extends Error {
  constructor(
    readonly code: 'invalid-image' | 'pixel-limit',
    cause?: unknown,
  ) {
    super(code === 'pixel-limit'
      ? 'Image dimensions exceed the supported limit.'
      : 'Image could not be processed.');
    this.name = 'ImageProcessingError';
    this.cause = cause;
  }
}

export async function optimizeUploadedImage(
  input: Uint8Array,
  options: ProcessingOptions = {},
) {
  const maxInputPixels = options.maxInputPixels ?? MAX_INPUT_PIXELS;
  if (!Number.isSafeInteger(maxInputPixels) || maxInputPixels < 1) {
    throw new ImageProcessingError('invalid-image');
  }

  const source = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  try {
    const metadata = await sharp(source, {
      failOn: 'error',
      limitInputPixels: maxInputPixels,
      sequentialRead: true,
    }).metadata();
    const width = metadata.width ?? 0;
    const pageHeight = metadata.pageHeight ?? metadata.height ?? 0;
    const pages = metadata.pages ?? 1;
    if (!width || !pageHeight) throw new ImageProcessingError('invalid-image');
    if (width * pageHeight * pages > maxInputPixels) {
      throw new ImageProcessingError('pixel-limit');
    }

    const { data, info } = await sharp(source, {
      failOn: 'error',
      limitInputPixels: maxInputPixels,
      sequentialRead: true,
    })
      .rotate()
      .resize({
        width: MAX_IMAGE_DIMENSION,
        height: MAX_IMAGE_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 84, effort: 4, smartSubsample: true })
      .toBuffer({ resolveWithObject: true });

    return {
      bytes: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      extension: 'webp' as const,
      width: info.width,
      height: info.height,
    };
  } catch (error) {
    if (error instanceof ImageProcessingError) throw error;
    if (error instanceof Error && /pixel limit/i.test(error.message)) {
      throw new ImageProcessingError('pixel-limit', error);
    }
    throw new ImageProcessingError('invalid-image', error);
  }
}
