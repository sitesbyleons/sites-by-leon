import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
await fs.mkdir('work/qa-statistics',{recursive:true});
try{
 const dashboardContext=await browser.newContext();const page=await dashboardContext.newPage();
 for(const width of [1920,1440,768,390,320]){
  await page.setViewportSize({width,height:1000});
  await page.goto('http://127.0.0.1:4346/admin/statistics?preview=true',{waitUntil:'networkidle'});
  await page.getByRole('heading',{name:'Every visit tells a story.'}).waitFor();
  assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),`overflow ${width}`);
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  assert.deepEqual(axe.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],`accessibility ${width}`);
  await page.screenshot({path:`work/qa-statistics/dashboard-${width}.png`,fullPage:true});
  console.log(`Statistics ${width}: layout and accessibility passed`);
 }
 await page.getByText('View daily numbers',{exact:true}).click();assert.equal(await page.locator('tbody tr').count(),30);
 await page.locator('#traffic-period').selectOption('7');await page.getByRole('button',{name:'Update',exact:true}).click();assert.equal(await page.locator('tbody tr').count(),7);
 await page.goto('http://127.0.0.1:4346/statistics-privacy');await page.getByRole('button',{name:'Decline optional statistics'}).click();assert.match(await page.locator('#choice-result').innerText(),/declined/);
 // Isolated browser fixture exercises the real collector without sending events to any server.
 const collector=await fs.readFile('photographer-site/public/statistics/collector-v1.js','utf8');
 for(const signal of ['none','gpc','dnt']){
  const context=await browser.newContext();const p=await context.newPage();let calls=[];
  await context.route('https://analytics-fixture.invalid/**',route=>{if(route.request().url().endsWith('/api/statistics/event')){calls.push(route.request().postDataJSON());return route.fulfill({status:204});}return route.fulfill({contentType:'text/html',body:'<aside id="traffic-consent" hidden><button data-traffic-choice="accepted">Allow</button><button data-traffic-choice="declined">Decline</button></aside><button id="traffic-preferences">Privacy choices</button>'});});
  if(signal!=='none')await context.addInitScript(s=>Object.defineProperty(navigator,s==='gpc'?'globalPrivacyControl':'doNotTrack',{value:s==='gpc'?true:'1'}),signal);
  await p.goto('https://analytics-fixture.invalid/');await p.clock.install();await p.addScriptTag({content:collector});
  await p.clock.runFor(31000);assert.equal(calls.length,0,'no requests before consent');
  if(signal==='none'){
   await p.getByRole('button',{name:'Decline',exact:true}).click();await p.clock.runFor(31000);assert.equal(calls.length,0);
   await p.getByRole('button',{name:'Privacy choices',exact:true}).click();await p.getByRole('button',{name:'Allow',exact:true}).click();await p.waitForFunction(()=>sessionStorage.getItem('leon-statistics-session-v1')!==null);
   await p.clock.runFor(31000);assert(calls.length>=1);assert.equal(calls[0].kind,'view');
   await p.getByRole('button',{name:'Privacy choices',exact:true}).click();await p.getByRole('button',{name:'Decline',exact:true}).click();const before=calls.length;await p.clock.runFor(61000);assert.equal(calls.length,before,'withdrawal stops events');assert.equal(await p.evaluate(()=>sessionStorage.getItem('leon-statistics-session-v1')),null);
  }else{await p.locator('#traffic-preferences').click();await p.getByRole('button',{name:'Allow',exact:true}).click();await p.clock.runFor(61000);assert.equal(calls.length,0,'privacy signals override accept');}
  await context.close();console.log(`Consent ${signal}: passed`);
 }
}finally{await browser.close();}
