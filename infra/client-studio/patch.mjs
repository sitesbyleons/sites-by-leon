import fs from 'node:fs';
import crypto from 'node:crypto';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function patch(file,hash,edit,reverse){const before=fs.readFileSync(file,'utf8');if(sha(before)!==hash)throw Error('Unexpected source '+file);const after=edit(before);if(after===before||reverse(after)!==before)throw Error('Patch not reversible '+file);fs.writeFileSync(file,after);console.log('Verified presentation patch',file);}
if(process.argv[2]==='dashboard'){
 const guide=fs.readFileSync('/tmp/client-studio/ClientWelcome.html','utf8').trim();if(/[`]|\$\{/.test(guide))throw Error('Literal HTML required');
 const old='<div class="client-shell">',next='<link rel="stylesheet" href="/admin-assets/client-workspace-v1.css"><div class="client-shell client-home">';
 const brand='<span>Sites</span><span>By</span><span>Leon</span>',newBrand='<img src="/admin-assets/leon-mark-v1.png" alt="" width="34" height="34"><span>sites by leon</span>';
 patch('/workspace/dashboard/dist/server/chunks/index_KlbIBE6S.mjs','92d7128b30a9b42cc2e40c32c9aa84304b360486bd3b5dbc1765d2f6c295c3dc',s=>{
  if(s.split(old).length!==2||s.split(brand).length!==2)throw Error('Unexpected markup');
  const start=s.indexOf('<section class="onboarding-card">'),end=s.indexOf('</section>',start);if(start<0||end<0)throw Error('Missing onboarding');
  return (s.slice(0,end)+guide+s.slice(end)).replace(old,next).replace(brand,newBrand);
 },s=>s.replace(next,old).replace(newBrand,brand).replace(guide,''));
}else{
 const root='/workspace/photographer-site/dist';
 const injection='${ishotyouu ? renderTemplate`<link rel="stylesheet" href="/admin-assets/ishotyouu-workspace-v1.css">` : ""}';
 patch(root+'/server/chunks/StudioAdminLayout_CE1vc9jo.mjs','b3095711ae54a2441503f1fdc04d58280323db9cb2f8b3524f2b271db37a31dd',s=>{const marker='<div class="studio-shell">';if(s.split(marker).length!==2)throw Error('Unexpected studio shell');return s.replace(marker,injection+marker);},s=>s.replace(injection,''));
 const original=fs.readFileSync(root+'/client/_astro/page.CUXRZZlb.js','utf8');
 if(sha(original)!=='a2eb7ab81ba10e031b0dedf3caa1adfd1fcef982f777c1b52c25a37bc9c5218c')throw Error('Unexpected Clerk bootstrap');
 const marker='if(document.querySelector';
 if(original.split(marker).length!==2)throw Error('Unexpected bootstrap structure');
 // Public portfolio pages need no browser authentication. Admin/sign-in are excluded.
 const guard='if(!(["www.ishotyouu.net","ishotyouu.net"].includes(location.hostname)&&["/","/work","/about","/inquire"].includes(location.pathname.replace(/\\/$/,"")||"/"))){';
 const replacement=original.replace(marker,guard+marker)+'\n}';
 if(replacement.replace(guard,'').slice(0,-2)!==original)throw Error('Bootstrap reversal failed');
 fs.writeFileSync(root+'/client/_astro/page.ishot-public-v1.js',replacement);
 patch(root+'/server/entry.mjs','56c0dfa32209032cde8f4c83fef28264015acfadd5108470fa7f4ccc870073d7',s=>s.replaceAll('page.CUXRZZlb.js','page.ishot-public-v1.js'),s=>s.replaceAll('page.ishot-public-v1.js','page.CUXRZZlb.js'));
}
