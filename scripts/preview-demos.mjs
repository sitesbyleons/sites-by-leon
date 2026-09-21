import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {renderDemoDocument} from '../photographer-site/src/lib/demo-design.mjs';
const code=ts.transpile(fs.readFileSync('photographer-site/src/lib/content/demo.ts','utf8'),{module:ts.ModuleKind.ESNext});
const {demoPortfolio:sports}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const image=(file,alt)=>({src:'/images/cinematic/'+file+'.webp',alt,width:1536,height:1024});
const photos=[image('wedding-courthouse','A couple holding hands outside a courthouse'),image('wedding-dance','A couple sharing a quiet moment beneath a veil'),image('wedding-window','Wedding portrait beside a window')];
const wedding={...sports,studioName:'Vow & Light',galleries:[{slug:'recent-stories',title:'Recent stories',category:'Weddings',description:'The little moments that make it yours.',cover:photos[0],images:photos}],packages:[{id:'wedding',name:'Wedding photography',description:'A collection built around your day.',startingPrice:'Custom',features:['Wedding-day coverage','An edited gallery','A story to revisit']}]};
for(const [port,kind,p] of [[4348,'sports',sports],[4349,'wedding',wedding]]){
 http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname.startsWith('/demo-assets/')||pathname.startsWith('/images/')||pathname==='/favicon.svg'){
   const root=pathname.startsWith('/images/cinematic/')?'public':'photographer-site/public';
   const file=path.resolve(root,'.'+pathname);
   if(!file.startsWith(path.resolve(root)+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
   const type={'.css':'text/css','.js':'text/javascript','.woff2':'font/woff2','.webp':'image/webp','.svg':'image/svg+xml'}[path.extname(file)];
   res.writeHead(200,{'content-type':type||'application/octet-stream'});fs.createReadStream(file).pipe(res);return;
  }
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(renderDemoDocument({kind,portfolio:p,pathname,canonicalOrigin:`http://localhost:${port}`}));
 }).listen(port,'127.0.0.1',()=>console.log(`${kind} preview http://127.0.0.1:${port}`));
}
