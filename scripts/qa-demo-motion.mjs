import {chromium} from '@playwright/test';
import fs from 'node:fs';
const origins=process.argv.includes('--live')?['https://demo.leonsites.org','https://vow-and-light.leonsites.org']:['http://127.0.0.1:4348','http://127.0.0.1:4349'];
const b=await chromium.launch({channel:'chrome'});const c=await b.newContext();const p=await c.newPage();
fs.mkdirSync('work/qa-demo-motion',{recursive:true});
for(const [i,origin] of origins.entries()){
 await p.setViewportSize({width:1440,height:1000});await p.emulateMedia({reducedMotion:'no-preference'});await p.goto(origin,{waitUntil:'networkidle'});
 const target=p.locator('.motion-stage').locator(':scope > .project,:scope > figure').first();
 const top=await p.locator('.selected').evaluate(e=>e.getBoundingClientRect().top+scrollY);
 const sample=async y=>{await p.evaluate(y=>scrollTo(0,y),y);await p.waitForTimeout(120);return target.evaluate(e=>getComputedStyle(e).transform);};
 const start=await sample(top-300);const end=await sample(top+750);
 if(start===end||!end.startsWith('matrix3d'))throw Error('No 3D scroll change');
 await p.screenshot({path:`work/qa-demo-motion/${i}-spread.png`});
 const reverse=await sample(top-300);if(start!==reverse)throw Error('Reverse sequence does not match');
 await p.locator('.motion-toggle').click();if(await p.locator('.motion-stage').count())throw Error('Pause retains pinned space');
 await p.locator('.motion-toggle').click();if(!await p.locator('.motion-stage').count())throw Error('Resume failed');
 await p.emulateMedia({reducedMotion:'reduce'});await p.waitForFunction(()=>!document.querySelector('.depth-enabled,.motion-stage'));
 await p.emulateMedia({reducedMotion:'no-preference'});await p.setViewportSize({width:390,height:900});await p.waitForFunction(()=>!document.querySelector('.motion-stage'));
 await p.evaluate(()=>scrollTo(0,500));await p.waitForTimeout(100);if(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow');
 console.log(origin+': 3D change, reverse, pause/resume, reduced motion and normal-flow mobile passed');
}
await b.close();
