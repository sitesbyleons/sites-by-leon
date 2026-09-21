import json, urllib.request, urllib.parse
from pathlib import Path

env={}
for line in Path('/opt/leon-platform/secrets/domain-worker.env').read_text().splitlines():
 if line.strip() and not line.lstrip().startswith('#') and '=' in line:
  key,value=line.split('=',1);env[key.strip()]=value.strip().strip('\"\'')
for host in ['ishotyouu.net','www.ishotyouu.net']:
 url='https://api.cloudflare.com/client/v4/zones/'+env['CLOUDFLARE_ZONE_ID']+'/custom_hostnames?'+urllib.parse.urlencode({'hostname[exact]':host})
 req=urllib.request.Request(url,headers={'Authorization':'Bearer '+env['CLOUDFLARE_API_TOKEN']})
 data=json.load(urllib.request.urlopen(req,timeout=20))
 print(json.dumps({'host':host,'success':data.get('success'),'matches':[{'hostname':v['hostname'],'status':v.get('status'),'ssl_status':v.get('ssl',{}).get('status'),'custom_origin_server':v.get('custom_origin_server'),'custom_origin_sni':v.get('custom_origin_sni'),'verification_errors':v.get('verification_errors')} for v in data.get('result',[]) if v['hostname']==host]}))
