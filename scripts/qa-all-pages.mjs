import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
const mode = process.argv[2] || 'public';
const targets = {
 public: {origin:process.argv[3] || 'http://127.0.0.1:4322', paths:['/work','/pricing','/contact','/privacy','/terms','/coming-soon','/404.html']},
 dashboard: {origin:'http://127.0.0.1:4332',paths:['/dashboard','/dashboard/support','/dashboard/billing','/admin','/admin/users','/admin/tickets','/admin/subscriptions','/admin/sites','/admin/demos','/admin/sites/new','/admin/sites/ws_northline','/admin/sites/ws_ishotyouu','/admin/sites/ws_fieldwork','/sign-in','/sign-up']},
 cms: {origin:process.argv[3] || 'http://127.0.0.1:4344',paths:['/admin','/admin/content','/admin/media','/admin/galleries','/admin/posts','/admin/services','/admin/clients','/admin/invoices','/admin/inquiries','/admin/hosting','/admin/support']},
};
const target=targets[mode]; if(!target) throw new Error('Unknown mode');
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext();
if(mode==='public') await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:target.origin});
const page=await context.newPage();
const allErrors=[];
page.on('pageerror',err=>{if(!/Clerk|clerk/.test(err.message)) allErrors.push(err.message)});
page.on('response',res=>{if(res.status()>=400 && res.url().startsWith(target.origin) && !res.url().includes('/404')) allErrors.push(res.status()+' '+res.url())});
await mkdir('work/qa-all',{recursive:true});
for(const width of [1440,390,320,768]){
 await page.setViewportSize({width,height:1000});
 for(const path of target.paths){
  const response=await page.goto(target.origin+path+(mode==='public'?'':'?preview=true'),{waitUntil:'networkidle'});
  await page.evaluate(()=>document.fonts.ready);
  if(mode==='public') await page.evaluate(async()=>{await Promise.all([...document.images].map(img=>{img.loading='eager';return img.decode().catch(()=>{});}));});
  const dimensions=await page.evaluate(()=>({width:innerWidth,content:document.documentElement.scrollWidth,heading:document.querySelector('h1')?.textContent,missingImages:[...document.images].filter(img=>img.loading!=='lazy' && (!img.complete||!img.naturalWidth)).map(img=>img.src)}));
  const isAuth=path.startsWith('/sign-');
  const results= isAuth && mode!=='public' ? {violations:[]} : await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  const violations=results.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary})).slice(0,7)}));
  if(dimensions.content>width || violations.length || (mode==='public' && dimensions.missingImages.length)) process.exitCode=1;
  if(width===1440 || width===390) await page.screenshot({path:'work/qa-all/'+mode+'-'+path.replaceAll('/','-')+'-'+width+'.png',fullPage:true});
  console.log(JSON.stringify({mode,path,width,status:response.status(),...dimensions,violations}));
 }
}
if(mode==='public'){
 await page.goto(target.origin+'/pricing',{waitUntil:'networkidle'});
 const faq=page.locator('.studio-faq details').first(); await faq.locator('summary').click(); if(!await faq.evaluate(el=>el.open)) throw new Error('FAQ did not open');
 await page.locator('.studio-plan').first().getByRole('link').click(); await page.waitForLoadState('networkidle');
 if(!await page.locator('[data-plan-note]').textContent().then(t=>t.includes('Essential'))) throw new Error('Plan selection not carried through');
 if(!await page.locator('[data-contact-email]').getAttribute('href').then(h=>h.includes('Essential'))) throw new Error('Email subject missing');
 await page.locator('[data-copy-email]').click(); await page.getByText('Email address copied.').waitFor();
 await page.setViewportSize({width:390,height:844}); await page.locator('.lh-menu').click();
 await page.locator('#lh-mobile-nav').getByRole('link',{name:'Work',exact:true}).click();
 await page.waitForURL('**/work'); if(!await page.locator('#lh-mobile-nav').isHidden()) throw new Error('Menu remained open after navigation');
 console.log(JSON.stringify({publicInteractions:'FAQ, plan handoff, copy email, mobile navigation passed'}));
}
console.log(JSON.stringify({errors:allErrors})); if(allErrors.length) process.exitCode=1;
await browser.close();
