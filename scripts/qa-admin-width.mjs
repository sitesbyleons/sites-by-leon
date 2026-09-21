import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});
await mkdir('work/qa-admin-width',{recursive:true});
try{
 const page=await browser.newPage();
 for(const width of [2560,1920,1440,768,390,320]){
  await page.setViewportSize({width,height:1000});
  for(const route of ['/admin','/admin/users','/admin/sites','/admin/tickets','/admin/subscriptions','/admin/demos']){
   await page.goto('http://127.0.0.1:4332'+route+'?preview=true',{waitUntil:'networkidle'});
   const size=await page.locator('.admin-workspace').evaluate(el=>({right:el.getBoundingClientRect().right,viewport:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,max:getComputedStyle(el).maxWidth}));
   assert.equal(size.max,'none');assert(Math.abs(size.right-width)<2,JSON.stringify({route,width,size}));assert(!size.overflow,JSON.stringify({route,width,size}));
   if(route==='/admin')await page.screenshot({path:`work/qa-admin-width/overview-${width}.png`});
  }
  console.log(`${width}: all six admin pages fill the content column without overflow`);
 }
}finally{await browser.close();}
