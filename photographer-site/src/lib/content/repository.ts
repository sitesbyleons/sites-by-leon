import { demoPortfolio } from './demo';
import type { Gallery, GalleryImage, JournalPost, MediaAspectRatio, Portfolio } from './types';
import { createStudioDatabase } from '../database';

export interface PortfolioRepository {
  getPortfolio(workspaceId: string): Promise<Portfolio>;
  listGalleries(workspaceId: string): Promise<Gallery[]>;
  getGallery(workspaceId: string, slug: string): Promise<Gallery | null>;
  listPosts(workspaceId: string): Promise<JournalPost[]>;
  getPost(workspaceId: string, slug: string): Promise<JournalPost | null>;
}

export class ManagedContentUnavailableError extends Error {
  readonly status = 503;

  constructor(cause?: unknown) {
    super('Managed site content is unavailable');
    this.name = 'ManagedContentUnavailableError';
    this.cause = cause;
  }
}

export const demoRepository = {
  async getPortfolio() {
    return demoPortfolio;
  },
  async listGalleries() {
    return demoPortfolio.galleries;
  },
  async getGallery(slug: string) {
    return demoPortfolio.galleries.find((gallery) => gallery.slug === slug) ?? null;
  },
  async listPosts() {
    return demoPortfolio.posts;
  },
  async getPost(slug: string) {
    return demoPortfolio.posts.find((post) => post.slug === slug) ?? null;
  },
};

const image = (
  id: string,
  src: string,
  alt: string,
  presentation: Partial<Pick<GalleryImage, 'aspectRatio' | 'cropX' | 'cropY' | 'cropZoom'>> = {},
): GalleryImage => ({
  id,
  src,
  alt,
  caption: null,
  width: 1600,
  height: 1200,
  aspectRatio: presentation.aspectRatio ?? 'landscape',
  cropX: presentation.cropX ?? 50,
  cropY: presentation.cropY ?? 50,
  cropZoom: presentation.cropZoom ?? 1,
});

export type SiteTheme = {
  paperColor: string;
  inkColor: string;
  accentColor: string;
  fontPreset: 'editorial' | 'athletic' | 'modern';
};

type WorkspaceRow = { id: string; name: string };
type SettingsRow = {
  site_title: string;
  hero_title: string;
  hero_subtitle: string;
  contact_email: string | null;
  paper_color: string;
  ink_color: string;
  accent_color: string;
  font_preset: SiteTheme['fontPreset'];
};
type GalleryRow = {
  id: string;
  slug: string;
  title: string;
  category: string;
  description: string;
  cover_image_url: string;
  layout_mode: Gallery['layoutMode'];
  grid_columns: Gallery['gridColumns'];
  image_aspect_ratio: MediaAspectRatio;
  cover_aspect_ratio: MediaAspectRatio;
  cover_crop_x: number;
  cover_crop_y: number;
  cover_crop_zoom: number;
  updated_at: string;
};
type GalleryImageRow = {
  id: string;
  gallery_id: string;
  image_url: string;
  alt_text: string;
  aspect_ratio: MediaAspectRatio | 'inherit';
  crop_x: number;
  crop_y: number;
  crop_zoom: number;
};
type PostRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  cover_image_url: string | null;
  cover_aspect_ratio: MediaAspectRatio;
  cover_crop_x: number;
  cover_crop_y: number;
  cover_crop_zoom: number;
  published_at: string | null;
  related_gallery_id: string | null;
};
type ServiceRow = { id: string; name: string; description: string; price_type: 'fixed' | 'from' | 'custom'; price_cents: number | null };

const MANAGED_CACHE_TTL_MS = 3_000;
const MANAGED_CACHE_MAX_ENTRIES = 500;
const portfolioCache = new Map<string, { value: Portfolio; expiresAt: number }>();
const themeCache = new Map<string, { value: SiteTheme; expiresAt: number }>();

const cachedValue = <Value>(cache: Map<string, { value: Value; expiresAt: number }>, key: string) => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
};

const cacheValue = <Value>(cache: Map<string, { value: Value; expiresAt: number }>, key: string, value: Value) => {
  cache.delete(key);
  while (cache.size >= MANAGED_CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.delete(oldest);
  }
  cache.set(key, { value, expiresAt: Date.now() + MANAGED_CACHE_TTL_MS });
  return value;
};

export function clearManagedContentCache() {
  portfolioCache.clear();
  themeCache.clear();
}

export async function loadSiteTheme(workspaceId: string): Promise<SiteTheme> {
  const fallback: SiteTheme = { paperColor: '#f4f6f8', inkColor: '#090d12', accentColor: '#ff3b30', fontPreset: 'athletic' };
  const cached = cachedValue(themeCache, workspaceId);
  if (cached) return cached;
  try {
    const client = createStudioDatabase();
    if (!client) return fallback;
    const settings = await client.from('studio_settings').select<Pick<SettingsRow, 'paper_color' | 'ink_color' | 'accent_color' | 'font_preset'>>('paper_color,ink_color,accent_color,font_preset').eq('workspace_id', workspaceId).maybeSingle();
    if (!settings.data) return fallback;
    return cacheValue(themeCache, workspaceId, {
      paperColor: settings.data.paper_color,
      inkColor: settings.data.ink_color,
      accentColor: settings.data.accent_color,
      fontPreset: settings.data.font_preset,
    } as SiteTheme);
  } catch {
    return fallback;
  }
}

async function loadManagedPortfolio(workspaceId: string): Promise<Portfolio> {
  try {
    const client = createStudioDatabase();
    if (!client) throw new ManagedContentUnavailableError();
    const workspace = await client.from('client_workspaces').select<WorkspaceRow>('id,name').eq('id', workspaceId).maybeSingle();
    if (workspace.error || !workspace.data) throw new ManagedContentUnavailableError(workspace.error);
    const id = workspace.data.id;
    const [settings, galleries, galleryImages, posts, services] = await Promise.all([
      client.from('studio_settings').select<Pick<SettingsRow, 'site_title' | 'hero_title' | 'hero_subtitle' | 'contact_email'>>('site_title,hero_title,hero_subtitle,contact_email').eq('workspace_id', id).maybeSingle(),
      client.from('studio_galleries').select<GalleryRow>('id,slug,title,category,description,cover_image_url,layout_mode,grid_columns,image_aspect_ratio,cover_aspect_ratio,cover_crop_x,cover_crop_y,cover_crop_zoom,updated_at').eq('workspace_id', id).eq('status', 'published').order('sort_order'),
      client.from('studio_gallery_images').select<GalleryImageRow>('id,gallery_id,image_url,alt_text,aspect_ratio,crop_x,crop_y,crop_zoom').eq('workspace_id', id).order('sort_order'),
      client.from('studio_posts').select<PostRow>('id,slug,title,excerpt,body,cover_image_url,cover_aspect_ratio,cover_crop_x,cover_crop_y,cover_crop_zoom,published_at,related_gallery_id').eq('workspace_id', id).eq('status', 'published').order('sort_order'),
      client.from('studio_services').select<ServiceRow>('id,name,description,price_type,price_cents').eq('workspace_id', id).eq('is_active', true).order('sort_order'),
    ]);
    const queryError = [settings, galleries, galleryImages, posts, services].find((result) => result.error)?.error;
    if (queryError) throw new ManagedContentUnavailableError(queryError);

    const imagesByGallery = new Map<string, GalleryImageRow[]>();
    for (const item of galleryImages.data ?? []) {
      const frames = imagesByGallery.get(item.gallery_id);
      if (frames) frames.push(item);
      else imagesByGallery.set(item.gallery_id, [item]);
    }
    const mappedGalleries: Gallery[] = (galleries.data ?? []).map((gallery) => {
      const frames = (imagesByGallery.get(gallery.id) ?? [])
        .map((item) => image(item.id, item.image_url, item.alt_text, {
          aspectRatio: !item.aspect_ratio || item.aspect_ratio === 'inherit' ? (gallery.image_aspect_ratio ?? 'landscape') : item.aspect_ratio,
          cropX: item.crop_x ?? 50,
          cropY: item.crop_y ?? 50,
          cropZoom: Number(item.crop_zoom ?? 1),
        }));
      const cover = image(`${gallery.id}-cover`, gallery.cover_image_url, `${gallery.title} gallery cover`, {
        aspectRatio: gallery.cover_aspect_ratio ?? 'landscape',
        cropX: gallery.cover_crop_x ?? 50,
        cropY: gallery.cover_crop_y ?? 50,
        cropZoom: Number(gallery.cover_crop_zoom ?? 1),
      });
      return {
        id: gallery.id,
        slug: gallery.slug,
        title: gallery.title,
        category: gallery.category,
        description: gallery.description,
        cover,
        images: frames.length ? frames : [cover],
        layoutMode: gallery.layout_mode ?? 'grid',
        gridColumns: gallery.grid_columns ?? 3,
        imageAspectRatio: gallery.image_aspect_ratio ?? 'landscape',
        publishedAt: gallery.updated_at,
      };
    });
    const mappedPosts: JournalPost[] = (posts.data ?? []).map((post) => ({
      id: post.id,
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      body: post.body.split(/\n{2,}/).map((paragraph: string) => paragraph.trim()).filter(Boolean),
      cover: post.cover_image_url ? image(`${post.id}-cover`, post.cover_image_url, `${post.title} cover`, {
        aspectRatio: post.cover_aspect_ratio ?? 'landscape',
        cropX: post.cover_crop_x ?? 50,
        cropY: post.cover_crop_y ?? 50,
        cropZoom: Number(post.cover_crop_zoom ?? 1),
      }) : null,
      relatedGallerySlug: mappedGalleries.find((gallery) => gallery.id === post.related_gallery_id)?.slug ?? null,
      publishedAt: post.published_at ?? new Date().toISOString(),
    }));
    const mappedServices = (services.data ?? []).map((service) => {
      const formatted = service.price_cents === null ? 'Custom' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(service.price_cents / 100);
      return { id: service.id, name: service.name, description: service.description, startingPrice: service.price_type === 'from' ? `From ${formatted}` : formatted, features: [], ctaLabel: 'Ask about this package' as const };
    });
    const managedSettings = settings.data;
    const studioName = managedSettings?.site_title?.trim() || workspace.data.name;
    return {
      studioName,
      location: '',
      email: managedSettings?.contact_email?.trim() || '',
      conceptNotice: '',
      home: {
        eyebrow: '',
        headline: managedSettings?.hero_title?.trim() || studioName,
        introduction: managedSettings?.hero_subtitle?.trim() || '',
        biography: '',
        announcement: '',
        contactLabel: `Contact ${studioName}`,
        featuredGallerySlugs: mappedGalleries.slice(0, 3).map((gallery) => gallery.slug),
      },
      galleries: mappedGalleries,
      posts: mappedPosts,
      packages: mappedServices,
    };
  } catch (error) {
    if (error instanceof ManagedContentUnavailableError) throw error;
    throw new ManagedContentUnavailableError(error);
  }
}

const usesDemoContent = () => {
  const mode = process.env.SITE_CONTENT_MODE?.trim().toLowerCase();
  return mode === 'demo' || mode === 'preview';
};

export const siteRepository: PortfolioRepository = {
  async getPortfolio(workspaceId) {
    if (usesDemoContent()) return demoPortfolio;
    const cached = cachedValue(portfolioCache, workspaceId);
    if (cached) return cached;
    return cacheValue(portfolioCache, workspaceId, await loadManagedPortfolio(workspaceId));
  },
  async listGalleries(workspaceId) { return (await this.getPortfolio(workspaceId)).galleries; },
  async getGallery(workspaceId, slug) { return (await this.listGalleries(workspaceId)).find((gallery) => gallery.slug === slug) ?? null; },
  async listPosts(workspaceId) { return (await this.getPortfolio(workspaceId)).posts; },
  async getPost(workspaceId, slug) { return (await this.listPosts(workspaceId)).find((post) => post.slug === slug) ?? null; },
};
