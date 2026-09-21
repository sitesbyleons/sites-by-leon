import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const live=await browser.newContext(),candidate=await browser.newContext();
 const oldPage=await live.newPage(),page=await candidate.newPage();
 await candidate.route(/https:\/\/(www\.ishotyouu\.net|ishotyouu\.leonsites\.org|vow-and-light\.leonsites\.org|northline-sports\.leonsites\.org)\//,async route=>{
  const url=new URL(route.request().url());
  const response=await candidate.request.fetch('http://127.0.0.1:4358'+url.pathname+url.search,{method:route.request().method(),headers:{...route.request().headers(),host:url.hostname},data:route.request().postDataBuffer()??undefined,maxRedirects:0});
  if(response.status()===404 && (/^\/work\/.*\.(jpg|jpeg|png|webp)$/.test(url.pathname)||url.pathname==='/favicon.svg'))return route.continue();
  await route.fulfill({response});
 });
 let clerk=0;page.on('request',r=>{if(r.url().includes('clerk.leonsites.org'))clerk++;});
 const fingerprint=page=>page.evaluate(()=>({title:document.title,text:[...document.querySelectorAll('main h1,main h2,main h3,main p')].map(e=>e.textContent.trim().replace(/\s+/g,' ')),images:[...document.querySelectorAll('main img')].map(e=>e.getAttribute('src')),forms:[...document.querySelectorAll('form')].map(e=>[e.getAttribute('action'),e.getAttribute('method')])}));
 for(const path of ['/','/work','/about','/inquire']){
  await oldPage.goto('https://www.ishotyouu.net'+path,{waitUntil:'networkidle'});await page.goto('https://www.ishotyouu.net'+path,{waitUntil:'networkidle'});
  assert.deepEqual(await fingerprint(page),await fingerprint(oldPage),`public content preserved ${path}`);
  assert.equal(await page.locator('#traffic-consent').count(),0,'collection disabled');
  assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
 }
 assert.equal(clerk,0,'public Clerk guard preserved');
 await page.goto('https://www.ishotyouu.net/statistics-privacy');await page.getByRole('heading',{name:'Your visit. Your choice.'}).waitFor();
 for(const path of ['/admin/statistics','/admin/statistics?preview=true','/api/admin/statistics']){
  const r=await candidate.request.get('http://127.0.0.1:4358'+path,{headers:{host:'ishotyouu.leonsites.org'},maxRedirects:0});assert([302,303,401].includes(r.status()),`${path}: ${r.status()}`);
 }
 await page.goto('https://ishotyouu.leonsites.org/sign-in',{waitUntil:'networkidle'});await page.locator('.cl-formFieldInput').first().waitFor();
 console.log('Candidate: public content/images/forms unchanged, analytics off, Clerk public fix preserved, real login renders and protected statistics/preview routes reject anonymous users.');
}finally{await browser.close();}
