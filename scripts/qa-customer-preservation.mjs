import {chromium} from '@playwright/test';
import fs from 'node:fs';
import crypto from 'node:crypto';
const browser=await chromium.launch({channel:'chrome'});
const page=await browser.newPage();
const current={};
for(const path of ['/','/work','/about','/inquire']){
 const response=await page.goto('https://ishotyouu.leonsites.org'+path,{waitUntil:'networkidle'});
 if(!response.ok())throw Error('Customer public route failed: '+path);
 const view=await page.evaluate(()=>({
  title:document.title,
  content:[...document.querySelectorAll('main h1,main h2,main h3,main p')].map(el=>el.textContent.trim().replace(/\s+/g,' ')),
  images:[...document.querySelectorAll('main img')].map(el=>el.getAttribute('src')),
  forms:[...document.querySelectorAll('form')].map(el=>({action:el.getAttribute('action'),method:el.getAttribute('method')})),
 }));
 current[path]=crypto.createHash('sha256').update(JSON.stringify(view)).digest('hex');
}
const file='work/customer-public-before-design.json';
if(process.argv[2]==='before')fs.writeFileSync(file,JSON.stringify(current,null,2));
else if(JSON.stringify(JSON.parse(fs.readFileSync(file)))!==JSON.stringify(current))throw Error('Customer public page content changed');
console.log(process.argv[2]==='before'?'Customer public content fingerprint recorded; no records submitted.':'Customer public Home/Work/About/Inquire content, image URLs and form targets unchanged.');
await browser.close();
