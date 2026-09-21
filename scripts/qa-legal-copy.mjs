import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
for(const page of ['privacy','terms']){
 const file='src/pages/'+page+'.astro';
 const before=execFileSync('git',['show','HEAD:'+file],{encoding:'utf8'});
 const after=readFileSync(file,'utf8');
 const extract=s=>[...s.matchAll(/<section(?: [^>]*?)?>([\s\S]*?)<\/section>/g)].map(m=>m[1].replace(/\s+/g,' ').trim());
 if(JSON.stringify(extract(before))!==JSON.stringify(extract(after)))throw new Error(page+' legal copy changed');
 if(!after.includes('Last updated July 27, 2026'))throw new Error('Update date changed');
 console.log(page+': all '+extract(after).length+' legal sections preserved verbatim (whitespace normalized).');
}

