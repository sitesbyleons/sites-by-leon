import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext();
const page=await context.newPage();
const errors=[]; const csp=[];
page.on('pageerror',err=>errors.push(err.message));
page.on('console',msg=>{if(/Content Security Policy|Refused to|violates.*directive/i.test(msg.text()))csp.push(msg.text())});
for(const origin of process.argv[2]==='production'?['https://leonsites.org','https://ishotyouu.leonsites.org']:['https://test.leonsites.org','https://ishotyouu-test.leonsites.org']){
 for(const route of ['/sign-in','/sign-up']){
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});
   const response=await page.goto(origin+route,{waitUntil:'networkidle'});
   await page.locator('.cl-formFieldInput').first().waitFor({state:'visible',timeout:20000});
   await page.evaluate(()=>document.fonts.ready);
   const data=await page.evaluate(()=>({viewport:innerWidth,content:document.documentElement.scrollWidth,bodyBackground:getComputedStyle(document.querySelector('main')).backgroundColor,inputs:document.querySelectorAll('.cl-formFieldInput').length,styles:[...document.querySelectorAll('link[rel=stylesheet]')].map(el=>el.getAttribute('href'))}));
   await page.screenshot({path:'work/qa-all/live-'+(origin.includes('ishot')?'cms':'dashboard')+route.replaceAll('/','-')+'-'+width+'.png',fullPage:true});
   const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
   const violations=axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}));
   console.log(JSON.stringify({origin,route,width,status:response.status(),...data,violations}));
   if(data.content>width||violations.length)process.exitCode=1;
  }
 }
 const res=await context.request.get(origin+'/admin',{maxRedirects:0});
 console.log(JSON.stringify({origin,protectedStatus:res.status(),location:res.headers().location}));
 if(![302,303,307].includes(res.status()))process.exitCode=1;
}
console.log(JSON.stringify({errors,csp}));if(errors.length||csp.length)process.exitCode=1;
await browser.close();
