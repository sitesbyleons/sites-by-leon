import fs from 'node:fs';
import crypto from 'node:crypto';
const file='/workspace/dashboard/dist/server/chunks/AdminFrame_BKBu-iPL.mjs';
const before=fs.readFileSync(file,'utf8');
if(crypto.createHash('sha256').update(before).digest('hex')!=='36b5bafcb7af68fd1a76fb90bc0a607723624e9efb99b84ba263f2cd12a1374b')throw Error('Unexpected admin frame');
if(before.split('admin-workspace-v4.css').length!==2)throw Error('Unexpected stylesheet count');
const after=before.replace('admin-workspace-v4.css','admin-workspace-v5.css');
if(after.replace('admin-workspace-v5.css','admin-workspace-v4.css')!==before)throw Error('Nonreversible patch');
fs.writeFileSync(file,after);
