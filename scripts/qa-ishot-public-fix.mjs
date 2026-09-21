import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const live=process.argv.includes('--live');const browser=await chromium.launch({channel:'chrome',headless:true});
try{const context=await browser.newContext();const page=await context.newPage();let clerkRequests=0;page.on('request',r=>{if(r.url().includes('clerk.leonsites.org'))clerkRequests++;});
 if(!live)await page.route('**/_astro/page.CUXRZZlb.js',async route=>{const r=await route.fetch();const s=await r.text();const marker='if(document.querySelector';assert.equal(s.split(marker).length,2);const guard='if(!(["www.ishotyouu.net","ishotyouu.net"].includes(location.hostname)&&["/","/work","/about","/inquire"].includes(location.pathname.replace(/\\/$/,"")||"/"))){';await route.fulfill({response:r,body:s.replace(marker,guard+marker)+'\n}'});});
 for(const path of ['/','/work','/about','/inquire']){
  await page.goto('https://www.ishotyouu.net'+path,{waitUntil:'networkidle'});await page.evaluate(async()=>{await Promise.all([...document.images].map(i=>{i.loading='eager';return i.decode().catch(()=>{});}));});
  assert.deepEqual(await page.locator('img').evaluateAll(imgs=>imgs.filter(i=>!i.naturalWidth).map(i=>i.src)),[],path);
 }
 assert.equal(clerkRequests,0,'Public pages should not bootstrap account login');
 let sent;await page.route('**/api/inquiry',route=>{sent=route.request().postDataJSON();return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});});
 await page.locator('[name=instagram]').fill('@local_preview_only');await page.locator('[name=message]').fill('Local browser-only test; never sent to the server.');await page.getByRole('button',{name:'Send inquiry',exact:true}).click();await page.getByText('Inquiry sent. ISHOTYOUU will follow up.').waitFor();assert.equal(sent.instagram,'@local_preview_only');
 await page.goto('https://ishotyouu.leonsites.org/sign-in',{waitUntil:'networkidle'});await page.locator('.cl-formFieldInput').first().waitFor({state:'visible'});assert(clerkRequests>0,'Real admin login must still load Clerk');
 console.log('Public photos load, no stray Clerk bootstrap, inquiry works with intercepted response, actual admin login still renders. No real inquiry sent.');
}finally{await browser.close();}
