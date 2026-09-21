"""Run on the VPS as root. Secrets stay in memory/root-only temporary files."""
import datetime, fcntl, hashlib, http.client, json, os, pathlib, subprocess, tempfile, time
ROOT=pathlib.Path('/opt/leon-platform/design-releases/operations-20260920')
def run(*args,**kw):return subprocess.run(args,check=True,**kw)
def inspect(name):return json.loads(subprocess.check_output(['docker','inspect',name]))[0]
def request(port,path,host):
    c=http.client.HTTPConnection('127.0.0.1',port,timeout=20)
    c.request('GET',path,headers={'Host':host,'X-Forwarded-Proto':'https'})
    r=c.getresponse();body=r.read().decode('utf-8');headers=dict(r.getheaders());status=r.status;c.close()
    return status,body,headers
def healthy(name):
    for _ in range(60):
        state=inspect(name)['State']
        if state.get('Health',{}).get('Status')=='healthy':return
        if state['Status']!='running':raise RuntimeError('Container failed: '+name)
        time.sleep(1)
    raise RuntimeError('Health timeout: '+name)
lock=open('/run/lock/leon-platform-maintenance.lock','w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
names={'dashboard':'leon-platform-dashboard-1','photographer':'leon-platform-photographer-1'}
old={key:inspect(name) for key,name in names.items()}
assert old['dashboard']['Image']=='sha256:c4e26df64e5a6d21ab5430f75e464c2b59ed67c659064dcf234f2c16d3d559fa','Dashboard baseline changed'
assert old['photographer']['Image']=='sha256:f1c9cf19f6946a171d842d73be5675d21c2b9c223de39738800dd62964592c33','Photographer baseline changed'
protected={name:inspect(name)['Id'] for name in subprocess.check_output(['docker','ps','--format','{{.Names}}'],text=True).splitlines() if name not in names.values()}
uploads={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in pathlib.Path('/opt/leon-platform/uploads').rglob('*') if p.is_file()}
tags={'dashboard':'leon-design-prod:operations-20260920','photographer':'leon-design-prod:statistics-live-20260920'}
for key in names:
    env=os.environ.copy();source=dict(item.split('=',1) for item in old[key]['Config']['Env'])
    env['PUBLIC_CLERK_PUBLISHABLE_KEY']=source['PUBLIC_CLERK_PUBLISHABLE_KEY']
    run('docker','build','--build-arg','PUBLIC_CLERK_PUBLISHABLE_KEY','-f',str(ROOT/'infra/operations'/('Dockerfile.'+key)),'-t',tags[key],str(ROOT),env=env)
print('Both Linux candidate images built.',flush=True)
run('install','-d','-m','755','/var/lib/leon-platform/operations','/usr/local/libexec/leon-platform')
run('install','-m','644',str(ROOT/'infra/operations/collect.py'),'/usr/local/libexec/leon-platform/collect-operations.py')
for unit in ['leon-operations.service','leon-operations.timer']:
    run('install','-m','644',str(ROOT/'infra/operations'/unit),'/etc/systemd/system/'+unit)
run('systemctl','daemon-reload');run('systemctl','start','leon-operations.service')
snapshot=pathlib.Path('/var/lib/leon-platform/operations/ovh-primary.json')
assert time.time()-datetime.datetime.fromisoformat(json.loads(snapshot.read_text())['collectedAt']).timestamp()<60
candidates=[]
try:
    with tempfile.TemporaryDirectory(prefix='leon-operations-',dir='/opt/leon-platform/secrets') as temp:
        for index,key in enumerate(names):
            envpath=pathlib.Path(temp)/(key+'.env');envpath.write_text('\n'.join(old[key]['Config']['Env'])+'\n');envpath.chmod(0o600)
            candidate='leon-operations-candidate-'+key
            args=['docker','run','-d','--name',candidate,'--network','leon-platform_egress','--env-file',str(envpath),'-p',f'127.0.0.1:{18801+index}:4321','--memory','1g','--cpus','1','--security-opt','no-new-privileges:true','--cap-drop','ALL']
            if key=='dashboard':args+=['-v','/var/lib/leon-platform/operations:/run/leon-operations:ro']
            else:args+=['-v','/opt/leon-platform/uploads:/data/uploads:ro']
            run(*args,tags[key],stdout=subprocess.DEVNULL);candidates.append(candidate)
            run('docker','network','connect','leon-platform_leon-internal',candidate);healthy(candidate)
        for path in ['/admin/operations','/admin/operations?preview=true','/dashboard']:
            status,body,_=request(18801,path,'leonsites.org');assert status in [302,303,307],(path,status)
            assert 'vps-aa71e2f6' not in body
        assert request(18801,'/sign-in','leonsites.org')[0]==200
        assert request(18802,'/api/admin/statistics?mode=live','ishotyouu.leonsites.org')[0] in [401,302,303,307]
        for path in ['/','/work','/about','/inquire','/statistics-privacy']:
            assert request(18802,path,'www.ishotyouu.net')[0]==200,path
        assert request(18802,'/admin/statistics?preview=true','ishotyouu.leonsites.org')[0] in [302,303,307]
        run('docker','exec',candidates[0],'node','-e',"const fs=require('fs');const x=JSON.parse(fs.readFileSync('/run/leon-operations/ovh-primary.json'));if(x.cpuCores!==6||!x.storage)process.exit(1)")
        print('Candidates passed health, public-route and anonymous access checks.',flush=True)
finally:
    for candidate in candidates:run('docker','rm','-f',candidate,stdout=subprocess.DEVNULL)
backup=pathlib.Path('/opt/leon-platform/backups')/('operations-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
backup.mkdir(mode=0o700)
with (backup/'database.dump').open('wb') as output:run('docker','exec','leon-platform-database-1','sh','-c','exec pg_dump --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom',stdout=output)
(backup/'database.dump').chmod(0o600)
with (backup/'database.dump').open('rb') as source:run('docker','exec','-i','leon-platform-database-1','pg_restore','--list',stdin=source,stdout=subprocess.DEVNULL)
env=os.environ.copy();env.update(SECRETS_ROOT='/opt/leon-platform/secrets',RELEASE_SHA='25e345ad4533e0d50a11cfd22c2f7f5afff64680')
base=['docker','compose','--env-file','/opt/leon-platform/secrets/.env','-f','/opt/leon-platform/current/infra/ovh/docker-compose.yml','-f']
def deploy(file):run(*base,str(ROOT/'infra/operations'/file),'up','-d','--no-deps','--no-build','--wait','--wait-timeout','120','dashboard','photographer',env=env)
try:
    deploy('compose.yml')
    for key,name in names.items():
        after=inspect(name)
        assert set(after['Config']['Env'])==set(old[key]['Config']['Env']),'Runtime settings changed: '+key
        beforemounts={m['Destination']:(m['Source'],m['RW']) for m in old[key]['Mounts']}
        aftermounts={m['Destination']:(m['Source'],m['RW']) for m in after['Mounts']}
        if key=='dashboard':beforemounts['/run/leon-operations']=('/var/lib/leon-platform/operations',False)
        assert beforemounts==aftermounts,'Mounts changed unexpectedly'
    for name,id in protected.items():assert inspect(name)['Id']==id,'Protected service changed'
    for p,digest in uploads.items():assert hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()==digest,'Upload changed'
    assert request(8080,'/admin/operations?preview=true','leonsites.org')[0] in [302,303,307]
    assert request(8080,'/','www.ishotyouu.net')[0]==200
    run('systemctl','enable','--now','leon-operations.timer')
    run('systemctl','start','leon-operations.service')
except BaseException:
    deploy('rollback.yml');raise
result={'deployedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'images':{key:inspect(name)['Image'] for key,name in names.items()},'backup':str(backup),'protectedContainersUnchanged':True,'existingUploadsPreserved':len(uploads),'runtimeEnvironmentPreserved':True}
(ROOT/'release-result.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2),flush=True)
