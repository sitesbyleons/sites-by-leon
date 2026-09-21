import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844}});
const page=await context.newPage();
await page.goto('http://127.0.0.1:4332/dashboard?preview=true');
for(const name of ['Website','Support','Billing']) if(!await page.getByRole('navigation',{name:'Client dashboard'}).getByRole('link',{name,exact:true}).isVisible()) throw new Error('Mobile client navigation hidden');
await page.screenshot({path:'work/qa-all/dashboard-mobile-nav.png'});
for(const [origin,path] of [['http://127.0.0.1:4332','/admin'],['http://127.0.0.1:4344','/admin'],['http://127.0.0.1:4346','/admin/work']]){
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:900});await page.goto(origin+path+'?preview=true',{waitUntil:'networkidle'});
  if(width<900) {await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('button',{name:'Close navigation',exact:true}).first().click();}
  const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  console.log(JSON.stringify({origin,path,width,overflow,violations:results.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))}));
  if(overflow||results.violations.length)process.exitCode=1;
  if(origin.includes('4346')) await page.screenshot({path:'work/qa-all/ishot-work-'+width+'.png',fullPage:true});
 }
}
await page.goto('http://127.0.0.1:4344/admin/galleries?preview=true',{waitUntil:'networkidle'});
await page.getByRole('button',{name:'Files',exact:true}).click();
await page.locator('dialog[data-media-dialog]').waitFor({state:'visible'});
const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
console.log(JSON.stringify({mediaDialogViolations:axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))}));
if(axe.violations.length)process.exitCode=1;
await page.screenshot({path:'work/qa-all/cms-media-dialog-mobile.png'});
await page.keyboard.press('Escape');
if(await page.locator('dialog[data-media-dialog]').isVisible())throw new Error('Media dialog did not close');
console.log('Customer mobile navigation, both drawers, ISHOTYOUU Work, and media dialog checked.');
await browser.close();
