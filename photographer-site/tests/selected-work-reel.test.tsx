import { readFile } from 'node:fs/promises';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import SelectedWorkReel from '../src/components/SelectedWorkReel';
import { demoPortfolio } from '../src/lib/content/demo';

const selectedWorkSourceUrl = new URL('../src/components/SelectedWorkReel.tsx', import.meta.url);

const requireOpeningTag = (source: string, pattern: RegExp, label: string) => {
  const openingTag = source.match(pattern)?.[0];
  if (!openingTag) throw new Error(`Missing ${label} opening tag`);
  return openingTag;
};

const expectSelectedWorkMotionContracts = (source: string) => {
  const frameTag = requireOpeningTag(source, /<motion\.figure\b[^>]*>/, 'reel frame');
  const imageDriftTag = requireOpeningTag(
    source,
    /<motion\.div\b[^>]*className="work-project__image-drift"[^>]*>/,
    'image drift',
  );
  const projectTag = requireOpeningTag(source, /<motion\.article\b[^>]*>/, 'work project');
  const headingTag = requireOpeningTag(
    source,
    /<motion\.h2\b[^>]*id="selected-work-title"[^>]*>/,
    'selected work heading',
  );

  expect(imageDriftTag).not.toMatch(/\by\s*(?=[:,}])/);
  expect(imageDriftTag).toMatch(
    /style=\{\{[^{}]*\btransform:\s*imageTransform\b[^{}]*\}\}/,
  );
  expect(headingTag).not.toMatch(/\bx\s*:\s*headingX\b/);
  expect(headingTag).toMatch(
    /style=\{\{[^{}]*\btransform:\s*headingTransform\b[^{}]*\}\}/,
  );
  expect(projectTag).toMatch(
    /transform:\s*\[\s*'translate3d\(0,\s*36px,\s*0\)'\s*,\s*'translate3d\(0,\s*0,\s*0\)'\s*\]/,
  );
  expect(frameTag).toMatch(/viewport=\{\{\s*amount:\s*0\.28,\s*once:\s*true\s*\}\}/);
  expect(projectTag).toMatch(/viewport=\{\{\s*amount:\s*0\.08,\s*once:\s*true\s*\}\}/);

  const onceTrueViewportProps = source.match(
    /viewport=\{\{[^{}]*\bonce:\s*true\b[^{}]*\}\}/g,
  ) ?? [];
  expect(onceTrueViewportProps).toHaveLength(2);
  expect(source).not.toMatch(/\bonce:\s*false\b/);
};

const contractMutations = [
  {
    name: 'frame y shorthand',
    from: 'style={{ transform: imageTransform }}',
    to: 'style={{ transform: imageTransform, y }}',
  },
  {
    name: 'heading x shorthand',
    from: 'style={{ transform: headingTransform }}',
    to: 'style={{ transform: headingTransform, x: headingX }}',
  },
  {
    name: 'frame transform binding',
    from: 'style={{ transform: imageTransform }}',
    to: 'style={{ transform: headingTransform }}',
  },
  {
    name: 'heading transform binding',
    from: 'style={{ transform: headingTransform }}',
    to: 'style={{ transform: imageTransform }}',
  },
  {
    name: 'project entrance start keyframe',
    from: "'translate3d(0, 36px, 0)'",
    to: "'translate3d(0, 35px, 0)'",
  },
  {
    name: 'project entrance end keyframe',
    from: "'translate3d(0, 0, 0)'",
    to: "'translate3d(0, 1px, 0)'",
  },
  {
    name: 'frame viewport once setting',
    from: 'viewport={{ amount: 0.28, once: true }}',
    to: 'viewport={{ amount: 0.28, once: false }}',
  },
  {
    name: 'project viewport once setting',
    from: 'viewport={{ amount: 0.08, once: true }}',
    to: 'viewport={{ amount: 0.08, once: false }}',
  },
] as const;

const applyMutation = (source: string, from: string, to: string) => {
  if (!source.includes(from)) throw new Error(`Missing mutation target: ${from}`);
  return source.replace(from, to);
};

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
    const source = await readFile(selectedWorkSourceUrl, 'utf8');

    expectSelectedWorkMotionContracts(source);
  });

  it.each(contractMutations)('rejects a $name regression', async ({ from, to }) => {
    const source = await readFile(selectedWorkSourceUrl, 'utf8');
    const mutatedSource = applyMutation(source, from, to);

    expect(() => expectSelectedWorkMotionContracts(mutatedSource)).toThrow();
  });
});
