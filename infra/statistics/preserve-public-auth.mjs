import fs from 'node:fs';
import crypto from 'node:crypto';
const root='/workspace/photographer-site/dist';
const matches=fs.readdirSync(root+'/client/_astro').filter(name=>/^page\..*\.js$/.test(name)&&fs.readFileSync(root+'/client/_astro/'+name,'utf8').includes('if(document.querySelector'));
if(matches.length!==1)throw Error('Clerk bootstrap must be uniquely identified');
const name=matches[0],original=fs.readFileSync(root+'/client/_astro/'+name,'utf8');
const marker='if(document.querySelector';
if(original.split(marker).length!==2)throw Error('Unexpected bootstrap structure');
// Preserve the previously deployed public-only guard; authentication on private pages stays intact.
const guard='if(!(["www.ishotyouu.net","ishotyouu.net"].includes(location.hostname)&&["/","/work","/about","/inquire","/statistics-privacy"].includes(location.pathname.replace(/\\/$/,"")||"/"))){';
const output=original.replace(marker,guard+marker)+'\n}';
const next='page.ishot-public-'+crypto.createHash('sha256').update(output).digest('hex').slice(0,12)+'.js';
fs.writeFileSync(root+'/client/_astro/'+next,output);
const entry=root+'/server/entry.mjs',before=fs.readFileSync(entry,'utf8');
if(!before.includes(name))throw Error('Bootstrap not found in manifest');
fs.writeFileSync(entry,before.replaceAll(name,next));
console.log('Preserved public Clerk guard:',next);
