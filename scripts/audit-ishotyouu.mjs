import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});await mkdir('work/qa-ishotyouu',{recursive:true});
try{const context=await browser.newContext();const page=await context.newPage();const errors=[];const report=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 for(const width of [1440,390,320])for(const path of ['/','/work','/about','/inquire']){
  await page.setViewportSize({width,height:1000});const response=await page.goto('https://www.ishotyouu.net'+path,{waitUntil:'networkidle'});
  await page.evaluate(async()=>{await Promise.all([...document.images].map(i=>{i.loading='eager';return i.decode().catch(()=>{});}));});
  const result=await page.evaluate(()=>({title:document.title,overflow:document.documentElement.scrollWidth>innerWidth,broken:[...document.images].filter(i=>!i.naturalWidth).map(i=>i.src),links:[...document.querySelectorAll('a')].map(a=>({text:a.innerText,url:a.href})),forms:[...document.forms].map(f=>({action:f.action,method:f.method,inputs:[...f.elements].map(e=>({name:e.name,type:e.type,required:e.required}))})),buttons:[...document.querySelectorAll('button')].map(b=>({text:b.innerText,label:b.getAttribute('aria-label')}))}));
  report.push({path,width,status:response.status(),...result});await page.screenshot({path:`work/qa-ishotyouu/${path.replaceAll('/','_')}-${width}.png`,fullPage:true});
  console.log(JSON.stringify({path,width,status:response.status(),overflow:result.overflow,broken:result.broken,forms:result.forms,buttons:result.buttons}));
 }
 for(const origin of ['https://www.ishotyouu.net','https://ishotyouu.leonsites.org'])for(const path of ['/admin','/sign-in']){const r=await context.request.get(origin+path,{maxRedirects:0,timeout:10000});console.log(JSON.stringify({origin,path,status:r.status(),location:r.headers().location}));}
 await writeFile('work/qa-ishotyouu/public-audit.json',JSON.stringify({report,errors},null,2));console.log(JSON.stringify({errors:[...new Set(errors)]}));
}finally{await browser.close();}
