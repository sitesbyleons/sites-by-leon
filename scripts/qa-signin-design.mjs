import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {transformSignin} from '../infra/signin-design/transform.mjs';
const live=process.argv.includes('--live');
const browser=await chromium.launch({channel:'chrome',headless:true});
await mkdir('work/qa-signin',{recursive:true});
try {
 const context=await browser.newContext(); const page=await context.newPage(); const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const scene=await readFile('dashboard/src/components/SignInScene.html','utf8');
 if(!live){
  await page.route('https://leonsites.org/admin-assets/signin-*',async route=>{
   const filename=new URL(route.request().url()).pathname.split('/').pop();
   await route.fulfill({path:`dashboard/public/admin-assets/${filename}`,contentType:filename.endsWith('.css')?'text/css':filename.endsWith('.woff2')?'font/woff2':'image/webp'});
  });
  await page.route('https://leonsites.org/sign-in**',async route=>{
   if(route.request().resourceType()!=='document')return route.continue();
   const response=await route.fetch(); const original=await response.text();
   const patched=transformSignin(original,scene);
   const options=/<div data-clerk-ui="sign-in" data-clerk-options="([^"]*)"/;
   assert.equal(patched.match(options)?.[1],original.match(options)?.[1]);
   await route.fulfill({response,body:patched});
  });
 }
 for(const width of [1440,900,768,390,320]){
  await page.setViewportSize({width,height:1000});
  await page.goto('https://leonsites.org/sign-in?redirect_url=%2Fdashboard',{waitUntil:'networkidle'});
  await page.locator('.cl-formFieldInput').first().waitFor({state:'visible'});
  await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('.auth-signin').count(),1);
  assert.equal(await page.locator('[data-clerk-ui]').evaluate(el=>JSON.parse(el.dataset.clerkOptions).forceRedirectUrl),'/dashboard');
  const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,broken:[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src)}));
  assert(!layout.overflow);assert.deepEqual(layout.broken,[]);
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  assert.deepEqual(axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
  await page.screenshot({path:`work/qa-signin/${live?'live':'preview'}-${width}.png`,fullPage:true});
  console.log(`${width}: real Clerk controls, redirect options, images, overflow and axe passed`);
 }
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('https://leonsites.org/sign-in?redirect_url=https%3A%2F%2Fevil.example',{waitUntil:'networkidle'});
 const redirect=await page.locator('[data-clerk-ui]').evaluate(el=>JSON.parse(el.dataset.clerkOptions).forceRedirectUrl);
 assert(redirect.startsWith('/')&&!redirect.startsWith('//'));
 const protectedResponse=await page.request.get('https://leonsites.org/admin/users',{maxRedirects:0});
 assert.equal(protectedResponse.status(),302);
 assert.deepEqual(errors,[]);
 console.log('Unsafe return URL rejected; admin remains protected. No credentials, sign-in submissions or account mutations performed.');
}finally{await browser.close();}
