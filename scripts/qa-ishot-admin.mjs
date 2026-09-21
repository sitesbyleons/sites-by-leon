import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});await mkdir('work/qa-ishot-admin',{recursive:true});
try{const context=await browser.newContext();const page=await context.newPage();
 for(const width of [1920,1440,768,390,320])for(const path of ['/admin','/admin/content','/admin/work','/admin/media','/admin/inquiries','/admin/clients','/admin/services','/admin/invoices','/admin/hosting','/admin/support']){
  await page.setViewportSize({width,height:1000});await page.goto('http://127.0.0.1:4346'+path+'?preview=true',{waitUntil:'networkidle'});
  assert.equal(await page.locator('link[href="/admin-assets/ishotyouu-workspace-v1.css"]').count(),1);
  assert.equal(await page.locator('.studio-sidebar').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(241, 244, 239)');
  assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),`${path} ${width} overflow`);
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],`${path} ${width}`);
  if(path==='/admin'||path==='/admin/work')await page.screenshot({path:`work/qa-ishot-admin/${path.replaceAll('/','_')}-${width}.png`,fullPage:true});
  console.log(`${path} ${width} layout and axe passed`);
 }
 await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('button',{name:'Close navigation',exact:true}).first().click();
 await page.getByRole('button',{name:'Files',exact:true}).click();await page.locator('dialog[data-media-dialog]').waitFor({state:'visible'});await page.keyboard.press('Escape');assert(!await page.locator('dialog[data-media-dialog]').isVisible());
 await page.goto('http://127.0.0.1:4344/admin?preview=true');assert.equal(await page.locator('link[href="/admin-assets/ishotyouu-workspace-v1.css"]').count(),0);
 console.log('Private menu/media dialog passed; generic demo admin excluded. No records submitted.');
}finally{await browser.close();}
