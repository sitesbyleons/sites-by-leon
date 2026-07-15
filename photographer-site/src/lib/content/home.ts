import type { Gallery } from './types';

export const selectHomeHeroImages = (featuredGalleries: Gallery[]) => {
  const firstGallery = featuredGalleries[0];
  const secondGallery = featuredGalleries[1];
  const leadLandscape = firstGallery?.images[1] ?? firstGallery?.cover ?? null;
  const leadPortrait =
    secondGallery?.images[2]
    ?? secondGallery?.cover
    ?? firstGallery?.images.find((image) => image.src !== leadLandscape?.src)
    ?? null;

  return {
    leadLandscape,
    leadPortrait,
    imageCount: Number(Boolean(leadLandscape)) + Number(Boolean(leadPortrait)),
  };
};
