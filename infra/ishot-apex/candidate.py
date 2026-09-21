import subprocess,json,urllib.request,urllib.error
base=json.loads(subprocess.check_output(['docker','inspect','leon-platform-gateway-1']))[0]
args=['docker','run','-d','--name','leon-apex-candidate','--network','leon-platform_leon-internal','-p','127.0.0.1:4385:80']
for value in base['Config']['Env']:args.extend(['-e',value])
args.append('leon-design-prod:ishot-apex-20260920')
subprocess.run(args,check=True,stdout=subprocess.DEVNULL)
try:
 for network in base['NetworkSettings']['Networks']:
  if network!='leon-platform_leon-internal':subprocess.run(['docker','network','connect',network,'leon-apex-candidate'],check=True)
 subprocess.run(['curl','--retry','5','--retry-all-errors','--retry-delay','1','-fsS','http://127.0.0.1:4385/healthz'],check=True)
 subprocess.run(['docker','exec','leon-apex-candidate','caddy','validate','--config','/etc/caddy/Caddyfile'],check=True)
 class NoRedirect(urllib.request.HTTPRedirectHandler):
  def redirect_request(self,*args):return None
 opener=urllib.request.build_opener(NoRedirect)
 for path in ['/','/work?source=check','/admin']:
  try:opener.open(urllib.request.Request('http://127.0.0.1:4385'+path,headers={'Host':'ishotyouu.net'}),timeout=10);raise AssertionError('Missing redirect')
  except urllib.error.HTTPError as r:
   assert r.code==308 and r.headers['Location']=='https://www.ishotyouu.net'+path
 print('Candidate valid; apex redirects preserve paths and queries.')
finally:
 subprocess.run(['docker','stop','--time','5','leon-apex-candidate'],check=True,stdout=subprocess.DEVNULL)
 subprocess.run(['docker','rm','leon-apex-candidate'],check=True,stdout=subprocess.DEVNULL)
