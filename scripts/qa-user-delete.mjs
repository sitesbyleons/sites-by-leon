import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();
 await page.goto('http://127.0.0.1:4359/admin/users?preview=true',{waitUntil:'networkidle'});
 const button=page.locator('[data-delete-user]').first();
 // Local development fixture only; all writes below are intercepted.
 await button.evaluate(el=>el.disabled=false);
 let requests=0;
 await page.route('**/api/admin/delete-user',async route=>{requests++;const body=route.request().postDataJSON();assert.equal(body.confirmation,`DELETE ${body.user_id}`);await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({message:'Protected test account.'})});});
 page.once('dialog',dialog=>dialog.dismiss());await button.click();assert.equal(requests,0);
 page.once('dialog',dialog=>dialog.accept('wrong'));await button.click();assert.equal(requests,0);
 page.once('dialog',dialog=>dialog.accept('DELETE'));await button.click();await page.getByText('Protected test account.',{exact:true}).waitFor();assert.equal(requests,1);assert(await button.isEnabled());
 console.log('Cancel, mismatched confirmation, and confirmed mocked request passed. No real account touched.');
}finally{await browser.close();}
