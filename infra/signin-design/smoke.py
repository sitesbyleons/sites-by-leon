import json, subprocess, urllib.request, time, re
base=json.loads(subprocess.check_output(['docker','inspect','leon-platform-dashboard-1']))[0]
name='leon-signin-candidate-20260920'
args=['docker','run','-d','--name',name,'--network','leon-platform_leon-internal','--cap-drop','ALL','--security-opt','no-new-privileges:true','--memory','768m','-p','127.0.0.1:4383:4321']
for value in base['Config']['Env']: args.extend(['-e',value])
args.append('leon-design-prod:signin-20260920')
if subprocess.run(args,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode: raise RuntimeError('Candidate failed to start')
try:
 subprocess.run(['docker','network','connect','leon-platform_egress',name],check=True)
 for attempt in range(30):
  try: urllib.request.urlopen('http://127.0.0.1:4383/api/health',timeout=3);break
  except Exception: time.sleep(1)
 else: raise RuntimeError('Candidate health timed out')
 def get(path):
  request=urllib.request.Request('http://127.0.0.1:4383'+path,headers={'Host':'leonsites.org','X-Forwarded-Host':'leonsites.org','X-Forwarded-Proto':'https'})
  return urllib.request.urlopen(request,timeout=20)
 for path in ['/sign-in','/sign-in?redirect_url=%2Fadmin%2Fusers','/sign-in/factor-one']:
  response=get(path);html=response.read().decode()
  assert 'auth-signin' in html and 'data-clerk-ui="sign-in"' in html
  assert "script-src 'self'" in response.headers.get('Content-Security-Policy','')
 assert 'auth-signin' not in get('/sign-up').read().decode()
 for asset in ['signin-studio-v1.css','signin-barlow-v1.woff2','signin-portrait-v1.webp','leon-mark-v1.png']:
  assert len(get('/admin-assets/'+asset).read())>100
 with open('/opt/leon-platform/design-releases/signin-20260920/untouched.sha256','rb') as hashes:
  subprocess.run(['docker','exec','-i',name,'sha256sum','-c','--status'],stdin=hashes,check=True)
 print('Candidate passed sign-in, nested route, sign-up isolation, CSP, assets and unchanged application file hashes.')
finally:
 subprocess.run(['docker','stop','--time','5',name],stdout=subprocess.DEVNULL,check=True)
 subprocess.run(['docker','rm',name],stdout=subprocess.DEVNULL,check=True)
