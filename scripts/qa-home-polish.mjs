import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
 const page = await browser.newPage();
 for (const width of [320,390,760,768,1440,2560]) {
  await page.setViewportSize({width,height:900});
  await page.goto(process.argv[2] || 'http://127.0.0.1:4350', {waitUntil:'networkidle'});
  await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('.home-polished').count(),1);
  assert.equal(await page.locator('.spatial-cta').getAttribute('href'),'/contact');
  assert(await page.evaluate(()=>document.fonts.check('600 32px "Leon Display"')));
  const layout = await page.evaluate(()=>{
   const box=s=>document.querySelector(s).getBoundingClientRect();
   return {ctaTop:box('.spatial-cta').top,worldBottom:box('.spatial-world').bottom,
    titleBottom:box('.spatial-heading').bottom,worldTop:box('.spatial-world').top,
    overflow:document.documentElement.scrollWidth>innerWidth,
    symbols:[...document.querySelectorAll('a,button')].filter(e=>e.checkVisibility() && /[↗↓]|[\u{1F300}-\u{1FAFF}]/u.test(e.innerText)).map(e=>e.innerText)};
  });
  assert(!layout.overflow,`overflow ${width}`);
  assert(layout.ctaTop>=layout.worldBottom,`CTA must be below photos ${width}`);
  assert.deepEqual(layout.symbols,[],`no decorative emoji-like glyphs in controls ${width}`);
  if(width<=760){assert(layout.titleBottom<layout.worldTop);assert.equal(await page.locator('.pin-spacer').count(),0);}
  console.log(`${width}: lower CTA, font, clean controls and responsive flow passed`);
 }
} finally {await browser.close();}
