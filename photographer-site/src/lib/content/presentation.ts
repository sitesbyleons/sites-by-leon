import type { GalleryImage, MediaAspectRatio } from './types';

export const aspectRatioCss: Record<MediaAspectRatio, string> = {
  square: '1 / 1',
  portrait: '4 / 5',
  landscape: '4 / 3',
  wide: '16 / 9',
};

export const imagePresentationStyle = (image: GalleryImage, aspectRatio = image.aspectRatio) => [
  `--media-aspect:${aspectRatioCss[aspectRatio]}`,
  `--crop-x:${image.cropX}%`,
  `--crop-y:${image.cropY}%`,
  `--crop-zoom:${image.cropZoom}`,
].join(';');
