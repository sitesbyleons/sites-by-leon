import { readFile } from 'node:fs/promises';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import SelectedWorkReel from '../src/components/SelectedWorkReel';
import { demoPortfolio } from '../src/lib/content/demo';

describe('SelectedWorkReel', () => {
  it('turns a single featured gallery into a complete three-frame showcase', () => {
    const gallery = demoPortfolio.galleries[0];
    const html = renderToStaticMarkup(
      <SelectedWorkReel galleries={[gallery]} tone="editorial" />,
    );

    expect(html.match(/data-portfolio-item/g)).toHaveLength(1);
    expect(html).toContain('data-frame-count="3"');
    expect(html.match(/class="work-project__frame/g)).toHaveLength(3);
    expect(html).toContain('data-tone="editorial"');
    expect(html).toContain('data-motion-libraries="skiper-ui react-spring motion"');
    expect(html).toContain(`href="/work/${gallery.slug}"`);
    expect(html).toContain('1 project');
    expect(html).toContain('3 photographs');
  });

  it('uses full transform strings for scroll-linked motion', async () => {
    const source = await readFile(
      new URL('../src/components/SelectedWorkReel.tsx', import.meta.url),
      'utf8',
    );

    expect(source).not.toContain('style={{ y }}');
    expect(source).not.toContain('style={{ x: headingX }}');
    expect(source).toContain('translate3d');
    expect(source).toContain('once: true');
  });
});
