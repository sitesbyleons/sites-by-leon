"""Loopback-only candidate, GET requests only; no secrets printed or written."""
import json, subprocess, time, urllib.request, sys
candidate_image=sys.argv[1] if len(sys.argv)>1 else 'leon-design-prod:demos-20260920'
version=sys.argv[2] if len(sys.argv)>2 else '1'
base=json.loads(subprocess.check_output(['docker','inspect','leon-platform-photographer-1']))[0]
name='leon-demo-design-candidate-20260920'
args=['docker','run','-d','--name',name,'--network','leon-platform_leon-internal','--volumes-from','leon-platform-photographer-1:ro','--security-opt','no-new-privileges:true','--cap-drop','ALL','--memory','768m','--cpus','1','-p','127.0.0.1:4380:4321']
for value in base['Config']['Env']: args.extend(['-e',value])
args.append(candidate_image)
result=subprocess.run(args,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
if result.returncode: raise SystemExit('Candidate did not start; inspect Docker status without exposing environment.')
try:
 subprocess.run(['docker','network','connect','leon-platform_egress',name],check=True)
 for attempt in range(30):
  try:
   urllib.request.urlopen('http://127.0.0.1:4380/api/health',timeout=3);break
  except Exception as error:
   if attempt==29: print(type(error).__name__, str(error))
   time.sleep(1)
 else: raise RuntimeError('Candidate health timed out')
 for host in ['demo.leonsites.org','vow-and-light.leonsites.org','www.ishotyouu.net']:
  for route in ['/','/work','/packages','/contact'] if host!='www.ishotyouu.net' else ['/','/work','/about','/inquire']:
   print('Checking candidate',host,route,flush=True)
   req=urllib.request.Request('http://127.0.0.1:4380'+route,headers={'Host':host,'X-Forwarded-Host':host,'X-Forwarded-Proto':'https'})
   response=urllib.request.urlopen(req,timeout=20)
   policy=response.headers.get('Content-Security-Policy','')
   assert "default-src 'self'" in policy and "script-src 'self'" in policy
   html=response.read().decode()
   if host=='www.ishotyouu.net': assert 'demo-assets/demo-v' not in html
   else:
    assert f'demo-assets/demo-v{version}.css' in html
    assert '<!doctype html><html lang="en" class="demo-' in html
    assert '&lt;!doctype' not in html
 for asset in [f'demo-v{version}.css',f'demo-v{version}.js','manrope.woff2','newsreader.woff2','barlow.woff2']:
  req=urllib.request.Request('http://127.0.0.1:4380/demo-assets/'+asset,headers={'Host':'demo.leonsites.org'})
  assert len(urllib.request.urlopen(req,timeout=20).read())>100
 print('Candidate passed: actual server-rendered demo pages and assets, real customer excluded. GET requests only.')
finally:
 subprocess.run(['docker','stop','--time','5',name],stdout=subprocess.DEVNULL,check=True)
 subprocess.run(['docker','rm',name],stdout=subprocess.DEVNULL,check=True)
