import subprocess,json,time,urllib.request,re
base=json.loads(subprocess.check_output(['docker','inspect','leon-platform-photographer-1']))[0]
name='leon-client-studio-candidate'
args=['docker','run','-d','--name',name,'--network','leon-platform_leon-internal','--volumes-from','leon-platform-photographer-1:ro','--cap-drop','ALL','--security-opt','no-new-privileges:true','--memory','768m','-p','127.0.0.1:4384:4321']
for value in base['Config']['Env']:args.extend(['-e',value])
args.append('leon-design-prod:ishot-workspace-20260920')
if subprocess.run(args,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode:raise RuntimeError('Candidate startup failed')
try:
 subprocess.run(['docker','network','connect','leon-platform_egress',name],check=True)
 for attempt in range(30):
  try:urllib.request.urlopen('http://127.0.0.1:4384/api/health',timeout=3);break
  except Exception:time.sleep(1)
 else:raise RuntimeError('Candidate health failed')
 def get(path,host='www.ishotyouu.net'):
  return urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:4384'+path,headers={'Host':host,'X-Forwarded-Host':host,'X-Forwarded-Proto':'https'}),timeout=20)
 for path in ['/','/work','/about','/inquire']:
  new=get(path).read().decode()
  old=subprocess.check_output(['curl','--retry','3','--retry-all-errors','-fsS','https://www.ishotyouu.net'+path],text=True)
  assert re.search(r'<main[\s\S]*?</main>',new)[0]==re.search(r'<main[\s\S]*?</main>',old)[0], 'Public content changed: '+path
  assert 'ishotyouu-workspace-v1.css' not in new
  assert 'page.ishot-public-v1.js' in new
 script=get('/_astro/page.ishot-public-v1.js').read().decode();assert 'location.hostname' in script
 subprocess.run(['docker','exec',name,'node','--check','/workspace/photographer-site/dist/client/_astro/page.ishot-public-v1.js'],check=True)
 for host in ['demo.leonsites.org','vow-and-light.leonsites.org']:
  html=get('/',host).read().decode();assert 'demo-v4.css' in html;assert 'ishotyouu-workspace-v1.css' not in html
 for asset in ['ishotyouu-workspace-v1.css','ishot-workspace-barlow-v1.woff2']:
  assert len(get('/admin-assets/'+asset,'ishotyouu.leonsites.org').read())>100
 print('Candidate passed: public main HTML identical, private CSS excluded from public/demo pages, scoped bootstrap parses, assets ready.')
finally:
 subprocess.run(['docker','stop','--time','5',name],stdout=subprocess.DEVNULL,check=True);subprocess.run(['docker','rm',name],stdout=subprocess.DEVNULL,check=True)
