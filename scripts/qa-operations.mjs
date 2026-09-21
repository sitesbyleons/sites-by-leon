import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
await mkdir('work/qa-operations',{recursive:true});
try {
 const context=await browser.newContext();const page=await context.newPage();
 for(const width of [1920,1440,768,390,320]) {
  await page.setViewportSize({width,height:1000});
  await page.goto('http://127.0.0.1:4359/admin/operations?preview=true',{waitUntil:'networkidle'});
  await page.getByRole('heading',{name:'OVH primary',exact:true}).waitFor();
  assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  assert.deepEqual(axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
  await page.screenshot({path:`work/qa-operations/${width}.png`,fullPage:true});
  console.log(`${width}: Operations layout and automated accessibility checks passed`);
 }
}finally{await browser.close();}
