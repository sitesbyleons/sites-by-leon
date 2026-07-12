
import { demoPortfolio } from './demo';
import type { Gallery, JournalPost, Portfolio } from './types';
import { createClient } from '@supabase/supabase-js';

export interface PortfolioRepository {
  getPortfolio(): Promise<Portfolio>;
  listGalleries(): Promise<Gallery[]>;
  getGallery(slug: string): Promise<Gallery | null>;
  listPosts(): Promise<JournalPost[]>;
  getPost(slug: string): Promise<JournalPost | null>;
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

export async function loadSiteTheme(): Promise<SiteTheme> {
  const fallback: SiteTheme = { paperColor: '#f4f6f8', inkColor: '#090d12', accentColor: '#ff3b30', fontPreset: 'athletic' };
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const key = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return fallback;
  const client = createClient(url, key, { auth: { persistSession: false } });
  const workspace = await client.from('client_workspaces').select('id').eq('slug', import.meta.env.SITE_WORKSPACE_SLUG ?? 'northline').maybeSingle<{ id: string }>();
  if (!workspace.data) return fallback;
  const settings = await client.from('studio_settings').select('paper_color,ink_color,accent_color,font_preset').eq('workspace_id', workspace.data.id).maybeSingle();
  if (!settings.data) return fallback;
  return {
    paperColor: settings.data.paper_color,
    inkColor: settings.data.ink_color,
    accentColor: settings.data.accent_color,
    fontPreset: settings.data.font_preset,
  } as SiteTheme;
}

async function loadManagedPortfolio(): Promise<Portfolio | null> {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const key = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const slug = import.meta.env.SITE_WORKSPACE_SLUG ?? 'northline';
  if (!url || !key) return null;
  const client = createClient(url, key, { auth: { persistSession: false } });
  const workspace = await client.from('client_workspaces').select('id,name').eq('slug', slug).maybeSingle<{ id: string; name: string }>();
  if (!workspace.data) return null;
  const id = workspace.data.id;
  const [settings, galleries, galleryImages, posts, services] = await Promise.all([
    client.from('studio_settings').select('site_title,hero_title,hero_subtitle,contact_email').eq('workspace_id', id).maybeSingle(),
    client.from('studio_galleries').select('id,slug,title,category,description,cover_image_url,updated_at').eq('workspace_id', id).eq('status', 'published').order('sort_order'),
    client.from('studio_gallery_images').select('id,gallery_id,image_url,alt_text').eq('workspace_id', id).order('sort_order'),
    client.from('studio_posts').select('id,slug,title,excerpt,body,cover_image_url,published_at').eq('workspace_id', id).eq('status', 'published').order('sort_order'),
    client.from('studio_services').select('id,name,description,price_type,price_cents').eq('workspace_id', id).eq('is_active', true).order('sort_order'),
  ]);
  if ([settings, galleries, galleryImages, posts, services].some((result) => result.error)) return null;

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
    cover: image(`${post.id}-cover`, post.cover_image_url || mappedGalleries[0]?.cover.src || demoPortfolio.posts[0].cover.src, `${post.title} cover`),
    relatedGallerySlug: null,
    publishedAt: post.published_at ?? new Date().toISOString(),
  }));
  const mappedServices = (services.data ?? []).map((service) => {
    const formatted = service.price_cents === null ? 'Custom' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(service.price_cents / 100);
    return { id: service.id, name: service.name, description: service.description, startingPrice: service.price_type === 'from' ? `From ${formatted}` : formatted, features: [], ctaLabel: 'Ask about this package' as const };
  });
  const managedSettings = settings.data;
  return {
    ...demoPortfolio,
    studioName: managedSettings?.site_title ?? workspace.data.name,
    email: managedSettings?.contact_email ?? demoPortfolio.email,
    home: {
      ...demoPortfolio.home,
      headline: managedSettings?.hero_title ?? demoPortfolio.home.headline,
      introduction: managedSettings?.hero_subtitle ?? demoPortfolio.home.introduction,
      featuredGallerySlugs: (mappedGalleries.length ? mappedGalleries : demoPortfolio.galleries).slice(0, 3).map((gallery) => gallery.slug),
    },
    galleries: mappedGalleries.length ? mappedGalleries : demoPortfolio.galleries,
    posts: mappedPosts.length ? mappedPosts : demoPortfolio.posts,
    packages: mappedServices.length ? mappedServices : demoPortfolio.packages,
  };
}

export const siteRepository: PortfolioRepository = {
  async getPortfolio() { return (await loadManagedPortfolio()) ?? demoPortfolio; },
  async listGalleries() { return (await this.getPortfolio()).galleries; },
  async getGallery(slug) { return (await this.listGalleries()).find((gallery) => gallery.slug === slug) ?? null; },
  async listPosts() { return (await this.getPortfolio()).posts; },
  async getPost(slug) { return (await this.listPosts()).find((post) => post.slug === slug) ?? null; },
};
