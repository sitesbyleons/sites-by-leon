import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
const browser=await chromium.launch({channel:'chrome'});
const context=await browser.newContext();const page=await context.newPage();
fs.mkdirSync('work/qa-demo-width',{recursive:true});
const origins=process.argv.includes('--local')?['http://127.0.0.1:4348','http://127.0.0.1:4349']:['https://demo.leonsites.org','https://vow-and-light.leonsites.org'];
for(const [index,origin] of origins.entries()){
 for(const width of [2560,3440,1440,390,320]){
  await page.setViewportSize({width,height:1300});
  await page.goto(origin,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
  const geometry=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,body:document.body.getBoundingClientRect().width,left:document.body.getBoundingClientRect().left,bar:document.querySelector('.demo-bar').getBoundingClientRect().width,overflow:document.documentElement.scrollWidth>innerWidth}));
  console.log(origin,width,geometry);
  if(geometry.left!==0||Math.abs(geometry.body-geometry.viewport)>1||geometry.bar!==geometry.body||geometry.overflow)throw Error('Page does not fill viewport');
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();if(result.violations.length)throw Error(JSON.stringify(result.violations.map(v=>v.id)));
  await page.screenshot({path:`work/qa-demo-width/${index}-${width}.png`});
 }
}
await browser.close();console.log('Both demo shells fill all five viewport widths without overflow or axe violations.');
