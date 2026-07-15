export type MediaAspectRatio = 'square' | 'portrait' | 'landscape' | 'wide';
export type GalleryLayoutMode = 'grid' | 'stack';

export type GalleryImage = {
  id: string;
  src: string;
  alt: string;
  caption: string | null;
  width: number;
  height: number;
  aspectRatio: MediaAspectRatio;
  cropX: number;
  cropY: number;
  cropZoom: number;
};

export type Gallery = {
  id: string;
  slug: string;
  title: string;
  category: string;
  description: string;
  cover: GalleryImage;
  images: GalleryImage[];
  layoutMode: GalleryLayoutMode;
  gridColumns: 1 | 2 | 3 | 4;
  imageAspectRatio: MediaAspectRatio;
  publishedAt: string;
};

export type JournalPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string[];
  cover: GalleryImage | null;
  relatedGallerySlug: string | null;
  publishedAt: string;
};

export type DisplayPackage = {
  id: string;
  name: string;
  startingPrice: string;
  description: string;
  features: string[];
  ctaLabel: 'Ask about this package';
};

export type HomeContent = {
  eyebrow: string;
  headline: string;
  introduction: string;
  biography: string;
  announcement: string;
  contactLabel: string;
  featuredGallerySlugs: string[];
};

export type Portfolio = {
  studioName: string;
  location: string;
  email: string;
  conceptNotice: string;
  home: HomeContent;
  galleries: Gallery[];
  posts: JournalPost[];
  packages: DisplayPackage[];
};
