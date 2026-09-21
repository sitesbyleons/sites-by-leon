import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
await mkdir('work/qa-client-home',{recursive:true});
try{const context=await browser.newContext();const page=await context.newPage();
 for(const mode of ['connected','empty'])for(const width of [2560,1440,768,390,320]){
  await page.setViewportSize({width,height:1000});await page.goto('http://127.0.0.1:4332/dashboard?preview=true',{waitUntil:'networkidle'});
  if(mode==='empty')await page.evaluate(guide=>{
   document.querySelector('.client-intro h1').textContent='Sites By Leon';document.querySelector('.client-intro>span').textContent='Leon will add your website after setup.';
   document.querySelector('.client-status-grid').outerHTML='<section class="onboarding-card"><div><span class="simple-label">No website connected</span><h2>Contact Leon to get started.</h2><p>Leon will create the project and add it to your account.</p></div><div class="onboarding-card__actions"><a class="simple-button" href="mailto:sites.by.leon@gmail.com">Contact Leon</a><button class="simple-button simple-button--quiet">Sign out</button></div>'+guide+'</section>';
   document.querySelector('.client-two-column').remove();
  },await readFile('dashboard/src/components/ClientWelcome.html','utf8'));
  await page.evaluate(()=>document.fonts.ready);
  assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
  await page.screenshot({path:`work/qa-client-home/${mode}-${width}.png`,fullPage:true});console.log(`${mode} ${width}: layout and accessibility passed`);
 }
 await page.goto('http://127.0.0.1:4332/dashboard?preview=true',{waitUntil:'networkidle'});
 await page.route('**/api/content-requests',route=>route.fulfill({status:200,contentType:'application/json',body:'{}'}));
 await page.locator('[name=subject]').fill('Update my gallery');await page.locator('[name=details]').fill('Please update the order of the photographs in my gallery.');await page.getByRole('button',{name:'Send ticket',exact:true}).click();await page.getByText('Ticket sent.',{exact:true}).waitFor();
 assert.equal(await page.locator('form[action="/api/billing/portal"]').count(),1);
 console.log('Support submission tested with local mock; billing action preserved, not submitted.');
}finally{await browser.close();}
