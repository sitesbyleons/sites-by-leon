import { chromium } from '@playwright/test';
const origin=process.argv[2]||'http://127.0.0.1:4322';
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext();
const page=await context.newPage();
for(const route of ['/terms-and-conditions','/terms-and-conditions/']){
 await page.goto(origin+route);
 await page.waitForURL('**/terms');
 if(await page.locator('h1').innerText()!=='Terms & conditions')throw Error('Terms alias failed');
}
for(const width of [1440,390]){
 await page.setViewportSize({width,height:1000});
 await page.goto(origin+'/terms',{waitUntil:'networkidle'});
 const open=await page.locator('.legal-index').evaluate(el=>el.open);
 if(open!==(width>760))throw Error('Legal contents responsive state failed');
 if(width<760)await page.locator('.legal-index summary').click();
 await page.getByRole('link',{name:'Subscriptions and cancellation',exact:true}).click();
 if(!page.url().endsWith('#subscriptions-and-cancellation'))throw Error('Legal anchor failed');
 const border=await page.locator('.lh-header').evaluate(el=>getComputedStyle(el).borderBottomWidth);
 if(border!=='0px')throw Error('Decorative header rule remains');
}
console.log('Terms aliases, responsive contents, section links and removed header border passed: '+origin);
await browser.close();
