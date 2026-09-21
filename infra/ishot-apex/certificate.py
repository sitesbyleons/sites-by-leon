import json, urllib.request, urllib.parse, sys
from pathlib import Path
env={}
for line in Path('/opt/leon-platform/secrets/domain-worker.env').read_text().splitlines():
 if line.strip() and not line.lstrip().startswith('#') and '=' in line:
  k,v=line.split('=',1);env[k.strip()]=v.strip().strip('\"\'')
base='https://api.cloudflare.com/client/v4/zones/'+env['CLOUDFLARE_ZONE_ID']+'/custom_hostnames'
def request(url,payload=None,method=None):
 req=urllib.request.Request(url,data=json.dumps(payload).encode() if payload is not None else None,method=method,headers={'Authorization':'Bearer '+env['CLOUDFLARE_API_TOKEN'],'Content-Type':'application/json'})
 data=json.load(urllib.request.urlopen(req,timeout=30));assert data['success'];return data['result']
found=[v for v in request(base+'?'+urllib.parse.urlencode({'hostname[exact]':'ishotyouu.net'})) if v['hostname']=='ishotyouu.net']
if not found and '--create' in sys.argv:
 found=[request(base,{'hostname':'ishotyouu.net','ssl':{'method':'http','type':'dv'}})]
for v in found:
 if '--refresh-host' in sys.argv:v=request(base+'/'+v['id'],{},'PATCH')
 if '--txt' in sys.argv:v=request(base+'/'+v['id'],{'ssl':{'method':'txt','type':'dv'}},'PATCH')
 print(json.dumps({k:v.get(k) for k in ['id','hostname','status','ownership_verification','verification_errors']}|{'ssl':{k:v.get('ssl',{}).get(k) for k in ['status','validation_records','validation_errors']}}))
