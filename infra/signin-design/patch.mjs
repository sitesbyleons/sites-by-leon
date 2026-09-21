import fs from 'node:fs';
import crypto from 'node:crypto';
import {transformSignin} from './transform.mjs';
const file='/workspace/dashboard/dist/server/chunks/_.._DhZRX37C.mjs';
const source=fs.readFileSync(file,'utf8');
if(crypto.createHash('sha256').update(source).digest('hex')!=='7f049bc823068b185c1e2eacb531c2d54e606514f8b358facf12bb2cacf05c91')throw Error('Unexpected production sign-in source');
fs.writeFileSync(file,transformSignin(source,fs.readFileSync('/tmp/signin-design/SignInScene.html','utf8')));
console.log('Reversible sign-in presentation patch applied. Auth options and handlers unchanged.');
