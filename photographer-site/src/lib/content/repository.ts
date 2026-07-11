import { demoPortfolio } from './demo';
import type { Gallery, JournalPost, Portfolio } from './types';

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
