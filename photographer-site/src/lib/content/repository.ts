import { demoPortfolio } from './demo';
import type { Gallery, JournalPost, Portfolio } from './types';
import { createStudioDatabase } from '../database';

export interface PortfolioRepository {
  getPortfolio(): Promise<Portfolio>;
  listGalleries(): Promise<Gallery[]>;
  getGallery(slug: string): Promise<Gallery | null>;
  listPosts(): Promise<JournalPost[]>;
  getPost(slug: string): Promise<JournalPost | null>;
}

export class ManagedContentUnavailableError extends Error {
  readonly status = 503;

  constructor(cause?: unknown) {
    super('Managed site content is unavailable');
    this.name = 'ManagedContentUnavailableError';
    this.cause = cause;
  }
}

export const demoRepository: PortfolioRepository = {
  async getPortfolio() {
    return demoPortfolio;
  },
  async listGalleries() {
    return demoPortfolio.galleries;
  },
  async getGallery(slug) {
    return demoPortfolio.galleries.find((gallery) => gallery.slug === slug) ?? null;
  },
  async listPosts() {
    return demoPortfolio.posts;
  },
  async getPost(slug) {
    return demoPortfolio.posts.find((post) => post.slug === slug) ?? null;
  },
};

const image = (id: string, src: string, alt: string) => ({ id, src, alt, caption: null, width: 1600, height: 1200 });

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
type GalleryRow = { id: string; slug: string; title: string; category: string; description: string; cover_image_url: string; updated_at: string };
type GalleryImageRow = { id: string; gallery_id: string; image_url: string; alt_text: string };
type PostRow = { id: string; slug: string; title: string; excerpt: string; body: string; cover_image_url: string | null; published_at: string | null };
type ServiceRow = { id: string; name: string; description: string; price_type: 'fixed' | 'from' | 'custom'; price_cents: number | null };

export async function loadSiteTheme(): Promise<SiteTheme> {
  const fallback: SiteTheme = { paperColor: '#f4f6f8', inkColor: '#090d12', accentColor: '#ff3b30', fontPreset: 'athletic' };
  try {
    const client = createStudioDatabase();
    if (!client) return fallback;
    const workspace = await client.from('client_workspaces').select<{ id: string }>('id').eq('slug', process.env.SITE_WORKSPACE_SLUG ?? 'northline').maybeSingle();
    if (!workspace.data) return fallback;
    const settings = await client.from('studio_settings').select<Pick<SettingsRow, 'paper_color' | 'ink_color' | 'accent_color' | 'font_preset'>>('paper_color,ink_color,accent_color,font_preset').eq('workspace_id', workspace.data.id).maybeSingle();
    if (!settings.data) return fallback;
    return {
      paperColor: settings.data.paper_color,
      inkColor: settings.data.ink_color,
      accentColor: settings.data.accent_color,
      fontPreset: settings.data.font_preset,
    } as SiteTheme;
  } catch {
    return fallback;
  }
}

async function loadManagedPortfolio(): Promise<Portfolio> {
  try {
    const slug = process.env.SITE_WORKSPACE_SLUG ?? 'northline';
    const client = createStudioDatabase();
    if (!client) throw new ManagedContentUnavailableError();
    const workspace = await client.from('client_workspaces').select<WorkspaceRow>('id,name').eq('slug', slug).maybeSingle();
    if (workspace.error || !workspace.data) throw new ManagedContentUnavailableError(workspace.error);
    const id = workspace.data.id;
    const [settings, galleries, galleryImages, posts, services] = await Promise.all([
      client.from('studio_settings').select<Pick<SettingsRow, 'site_title' | 'hero_title' | 'hero_subtitle' | 'contact_email'>>('site_title,hero_title,hero_subtitle,contact_email').eq('workspace_id', id).maybeSingle(),
      client.from('studio_galleries').select<GalleryRow>('id,slug,title,category,description,cover_image_url,updated_at').eq('workspace_id', id).eq('status', 'published').order('sort_order'),
      client.from('studio_gallery_images').select<GalleryImageRow>('id,gallery_id,image_url,alt_text').eq('workspace_id', id).order('sort_order'),
      client.from('studio_posts').select<PostRow>('id,slug,title,excerpt,body,cover_image_url,published_at').eq('workspace_id', id).eq('status', 'published').order('sort_order'),
      client.from('studio_services').select<ServiceRow>('id,name,description,price_type,price_cents').eq('workspace_id', id).eq('is_active', true).order('sort_order'),
    ]);
    const queryError = [settings, galleries, galleryImages, posts, services].find((result) => result.error)?.error;
    if (queryError) throw new ManagedContentUnavailableError(queryError);

    const mappedGalleries: Gallery[] = (galleries.data ?? []).map((gallery) => {
      const frames = (galleryImages.data ?? []).filter((item) => item.gallery_id === gallery.id).map((item) => image(item.id, item.image_url, item.alt_text));
      const cover = image(`${gallery.id}-cover`, gallery.cover_image_url, `${gallery.title} gallery cover`);
      return { id: gallery.id, slug: gallery.slug, title: gallery.title, category: gallery.category, description: gallery.description, cover, images: frames.length ? frames : [cover], publishedAt: gallery.updated_at };
    });
    const mappedPosts: JournalPost[] = (posts.data ?? []).map((post) => ({
      id: post.id,
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      body: post.body.split(/\n{2,}/).map((paragraph: string) => paragraph.trim()).filter(Boolean),
      cover: post.cover_image_url ? image(`${post.id}-cover`, post.cover_image_url, `${post.title} cover`) : null,
      relatedGallerySlug: null,
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
  async getPortfolio() {
    return usesDemoContent() ? demoPortfolio : loadManagedPortfolio();
  },
  async listGalleries() { return (await this.getPortfolio()).galleries; },
  async getGallery(slug) { return (await this.listGalleries()).find((gallery) => gallery.slug === slug) ?? null; },
  async listPosts() { return (await this.getPortfolio()).posts; },
  async getPost(slug) { return (await this.listPosts()).find((post) => post.slug === slug) ?? null; },
};
