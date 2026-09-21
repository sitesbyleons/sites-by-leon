import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
const live=process.argv.includes('--live');
const origins=live?['https://demo.leonsites.org','https://vow-and-light.leonsites.org']:['http://127.0.0.1:4348','http://127.0.0.1:4349'];
fs.mkdirSync('work/qa-demos',{recursive:true});
const browser=await chromium.launch({channel:'chrome'});
for(const [idx,origin] of origins.entries()){
 const context=await browser.newContext();const page=await context.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 for(const width of [1440,768,390,320]){
  await page.setViewportSize({width,height:1000});
  for(const route of ['/','/work','/packages','/contact',idx===0?'/work/above-the-rim':'/work/recent-stories']){
   const response=await page.goto(origin+route,{waitUntil:'networkidle'});
   if(!response.ok())throw Error(`${origin}${route} ${response.status()}`);
   await page.evaluate(async()=>{await document.fonts.ready;for(const i of document.images){i.loading='eager';}await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));});
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Overflow '+width+route);
   const broken=await page.locator('main img').evaluateAll(imgs=>imgs.filter(i=>!i.naturalWidth).map(i=>i.src));if(broken.length)throw Error('Broken images '+broken);
   const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();if(axe.violations.length)throw Error(JSON.stringify({origin,width,route,violations:axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))}));
   await page.screenshot({path:`work/qa-demos/${idx}-${width}-${route.replaceAll('/','_')||'home'}.png`,fullPage:true});
  }
 }
 await page.goto(origin+'/work/'+(idx===0?'above-the-rim':'recent-stories'),{waitUntil:'networkidle'});
 await page.locator('[data-lightbox]').first().click();
 if(!await page.locator('dialog').isVisible())throw Error('Lightbox failed');
 await page.keyboard.press('ArrowRight');if(!(await page.locator('[data-lightbox-counter]').innerText()).startsWith('02'))throw Error('Lightbox next failed');
 await page.keyboard.press('Escape');if(await page.locator('dialog').isVisible())throw Error('Lightbox escape failed');
 if(!await page.locator('[data-lightbox]').first().evaluate(e=>e===document.activeElement))throw Error('Focus not restored');
 await page.goto(origin+'/packages');const href=await page.locator('.service-action a').first().getAttribute('href');await page.goto(origin+href);
 if(!await page.locator('select').inputValue())throw Error('Package handoff failed');
 const writes=[];page.on('request',r=>{if(r.method()!=='GET')writes.push(r.url())});
 await page.locator('[name=name]').fill('Demo Visitor');await page.locator('[name=email]').fill('visitor@example.com');await page.locator('[name=date]').fill('2027-06-15');await page.locator('[name=location]').fill('Example venue');await page.locator('[name=message]').fill('A local demonstration only.');await page.locator('form button').click();
 if(!await page.locator('.form-result').isVisible()||writes.length)throw Error('Demo form unsafe or broken '+writes);
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto(origin+'/');if(await page.locator('html').evaluate(e=>e.classList.contains('motion-ready')))throw Error('Reduced motion ignored');
 if(errors.length)throw Error(JSON.stringify(errors));
 await context.close();console.log(origin+': five routes at four widths, axe, images, gallery keyboard/focus, package handoff, no-write inquiry and reduced motion passed.');
 const noJs=await browser.newContext({javaScriptEnabled:false});const fallback=await noJs.newPage();await fallback.goto(origin+'/contact');
 if(!await fallback.locator('form button').isDisabled()||await fallback.locator('form').getAttribute('method')!=='dialog')throw Error('No-JS demo form can submit');
 await noJs.close();
}
await browser.close();
