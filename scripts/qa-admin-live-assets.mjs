import fs from 'node:fs';
import crypto from 'node:crypto';
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const origin=process.argv[2]||'https://test.leonsites.org';
for(const file of ['admin-workspace-v4.css','admin-workspace-v4.js']){
 const response=await fetch(origin+'/admin-assets/'+file);
 if(!response.ok)throw Error('Missing deployed asset: '+file);
 const remote=Buffer.from(await response.arrayBuffer());
 if(sha(remote)!==sha(fs.readFileSync('dashboard/public/admin-assets/'+file)))throw Error('Asset mismatch: '+file);
 console.log(file+': deployed bytes match verified source');
}
for(const path of ['/admin','/admin/users','/admin/users?preview=true','/admin/sites','/admin/tickets']){
 const response=await fetch(origin+path,{redirect:'manual'});
 if(response.status!==302 || !response.headers.get('location')?.startsWith('/sign-in'))throw Error('Admin protection changed: '+path);
 console.log(path+': requires sign-in');
}
const signin=await fetch(origin+'/sign-in');
const html=await signin.text();
if(html.includes('admin-workspace-v4'))throw Error('Admin assets leaked to auth layout');
if(!/DashboardLayout\.(?:refined|design)-20260920\.css/.test(html))throw Error('Unexpected auth stylesheet');
console.log('Existing sign-in stylesheet preserved.');
