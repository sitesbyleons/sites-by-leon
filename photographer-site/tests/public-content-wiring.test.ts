import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('managed public content wiring', () => {
  it('renders the configured studio name in the public wordmark', () => {
    const header = read('src/components/SiteHeader.astro');

    expect(header).toContain('>{studioName}</a>');
    expect(header).not.toContain('>Northline Sports</a>');
  });

  it('builds the homepage service preview from managed services and hides it when empty', () => {
    const home = read('src/pages/index.astro');

    expect(home).toContain('portfolio.packages.map');
    expect(home).toContain('portfolio.packages.length > 0');
    expect(home).not.toContain('Game coverage, season coverage, and athlete sessions.');
  });

  it('does not hardcode the demo studio name in editable public pages', () => {
    const editablePages = [
      'src/pages/contact.astro',
      'src/pages/work/index.astro',
      'src/pages/work/[slug].astro',
      'src/pages/journal/index.astro',
      'src/pages/journal/[slug].astro',
      'src/pages/packages.astro',
      'src/pages/invoice/[token].astro',
    ];

    for (const path of editablePages) {
      expect(read(path), path).not.toContain('Northline');
    }

    expect(read('src/pages/contact.astro')).toContain('portfolio.home.contactLabel');
  });

  it('keeps database-independent support and authentication pages tenant-neutral', () => {
    for (const path of [
      'src/pages/maintenance.astro',
      'src/pages/sign-in/[...signin].astro',
      'src/pages/sign-up/[...signup].astro',
    ]) {
      expect(read(path), path).not.toContain('Northline');
    }
  });

  it('links public pages to the shared favicon and tenant sitemap', () => {
    for (const path of ['src/layouts/NorthlineLayout.astro', 'src/layouts/IshotyouuLayout.astro']) {
      const layout = read(path);
      expect(layout, path).toContain('rel="icon"');
      expect(layout, path).toContain('href="/favicon.svg"');
      expect(layout, path).toContain('rel="sitemap"');
      expect(layout, path).toContain('href="/sitemap.xml"');
    }
  });
});
