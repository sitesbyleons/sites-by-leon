import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
const target = process.argv[2] || 'http://localhost:4321';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
await mkdir('work/qa-home', { recursive: true });
for (const width of [1440, 390, 320, 768]) {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(target, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => { await Promise.all([...document.images].map(img => { img.loading = 'eager'; return img.decode().catch(() => {}); })); });
  const result = await page.evaluate(() => ({
    viewport: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    missingImages: [...document.images].filter(image => !image.complete || !image.naturalWidth).map(image => image.src),
    overflowing: [...document.querySelectorAll('.leon-home *')].filter(element => !element.closest('.spatial-world') && element.getBoundingClientRect().right > innerWidth + 1).map(element => element.className).slice(0, 10),
  }));
  if (width === 390) {
    await page.locator('.lh-menu').click();
    if (await page.locator('#lh-mobile-nav').isHidden()) throw new Error('Mobile menu did not open');
    await page.keyboard.press('Escape');
    if (!await page.locator('#lh-mobile-nav').isHidden()) throw new Error('Mobile menu did not close');
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  }
  const details = page.locator('.plan-row details').first();
  await details.locator('summary').click();
  if (!await details.evaluate(el => el.open)) throw new Error('Plan details did not expand');
  await details.locator('summary').click();
  if (await details.evaluate(el => el.open)) throw new Error('Plan details did not collapse');
  await page.evaluate(() => scrollTo({top:0,behavior:'instant'}));
  await page.waitForTimeout(700);
  await page.screenshot({ path: `work/qa-home/home-${width}.png`, fullPage: true });
  await page.screenshot({ path: `work/qa-home/viewport-${width}.png` });
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  const violations = axe.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target) }));
  console.log(JSON.stringify({ width, ...result, violations }));
  if (result.scrollWidth > width || result.missingImages.length || result.overflowing.length || violations.length) process.exitCode = 1;
}
await page.setViewportSize({width:1440,height:1000});
await page.goto(target, {waitUntil:'networkidle'});
const before = await page.locator('.spatial-main').evaluate(el => getComputedStyle(el).transform);
await page.evaluate(() => scrollTo({top:1000,behavior:'instant'}));
await page.waitForTimeout(1100);
const after = await page.locator('.spatial-main').evaluate(el => getComputedStyle(el).transform);
if (before === after) throw new Error('Scroll did not change 3D transform');
await page.screenshot({path:'work/qa-home/motion-middle.png'});
await page.emulateMedia({reducedMotion:'reduce'});
await page.goto(target,{waitUntil:'networkidle'});
if (await page.locator('.pin-spacer').count()) throw new Error('Reduced motion should not pin');
await page.screenshot({path:'work/qa-home/reduced-motion.png'});
console.log(JSON.stringify({motionChanges:true,reducedMotionUnpinned:true}));
await page.emulateMedia({reducedMotion:'no-preference'});
await page.setViewportSize({width:390,height:844});
await page.goto(target,{waitUntil:'networkidle'});
await page.evaluate(() => scrollTo({top:500,behavior:'instant'}));
await page.waitForTimeout(750);
await page.screenshot({path:'work/qa-home/motion-mobile.png'});
await page.evaluate(() => scrollTo({top:0,behavior:'instant'}));
await page.waitForTimeout(750);
const resetOpacity = await page.locator('.spatial-heading').evaluate(el => Number(getComputedStyle(el).opacity));
if (resetOpacity < .99) throw new Error('Hero failed to reset after reverse scroll');
await page.locator('.spatial-scroll').click();
await page.waitForTimeout(1000);
const workTop = await page.locator('#work').evaluate(el => el.getBoundingClientRect().top);
if (Math.abs(workTop) > 120) throw new Error('Work anchor did not pass the pinned section');
console.log(JSON.stringify({detailsToggle:true,reverseScroll:true,workAnchor:true}));
console.log(JSON.stringify({ errors }));
if (errors.length) process.exitCode = 1;
await browser.close();
