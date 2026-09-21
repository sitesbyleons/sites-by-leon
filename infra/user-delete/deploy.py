import fcntl,http.client,json,os,pathlib,subprocess,tempfile,time
root=pathlib.Path('/opt/leon-platform/design-releases/user-delete-20260920')
def run(*args,**kw):return subprocess.run(args,check=True,**kw)
def inspect(name):return json.loads(subprocess.check_output(['docker','inspect',name]))[0]
lock=open('/run/lock/leon-platform-maintenance.lock','w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
old=inspect('leon-platform-dashboard-1')
assert old['Image']=='sha256:ceb7d63517985cf7d24af35c078924916de16fbb9c0d783482cec5464176f3f4','Baseline changed'
protected={n:inspect(n)['Id'] for n in subprocess.check_output(['docker','ps','--format','{{.Names}}'],text=True).splitlines() if n!='leon-platform-dashboard-1'}
env=os.environ.copy();env['PUBLIC_CLERK_PUBLISHABLE_KEY']=dict(x.split('=',1) for x in old['Config']['Env'])['PUBLIC_CLERK_PUBLISHABLE_KEY']
run('docker','build','--build-arg','PUBLIC_CLERK_PUBLISHABLE_KEY','-f',str(root/'infra/user-delete/Dockerfile'),'-t','leon-design-prod:user-delete-20260920',str(root),env=env)
candidate='leon-user-delete-candidate'
with tempfile.TemporaryDirectory(prefix='user-delete-',dir='/opt/leon-platform/secrets') as temp:
    config=pathlib.Path(temp)/'runtime.env';config.write_text('\n'.join(old['Config']['Env'])+'\n');config.chmod(0o600)
    run('docker','run','-d','--name',candidate,'--network','leon-platform_egress','--env-file',str(config),'-p','127.0.0.1:18801:4321','--memory','1g','--cpus','1','-v','/var/lib/leon-platform/operations:/run/leon-operations:ro','leon-design-prod:user-delete-20260920',stdout=subprocess.DEVNULL)
    try:
        run('docker','network','connect','leon-platform_leon-internal',candidate)
        for _ in range(60):
            if inspect(candidate)['State'].get('Health',{}).get('Status')=='healthy':break
            time.sleep(1)
        else:raise RuntimeError('Candidate not healthy')
        for path in ['/admin/users','/admin/operations?preview=true']:
            conn=http.client.HTTPConnection('127.0.0.1',18801,timeout=20);conn.request('GET',path,headers={'Host':'leonsites.org','X-Forwarded-Proto':'https'});response=conn.getresponse();assert response.status in [302,303,307];response.read();conn.close()
        conn=http.client.HTTPConnection('127.0.0.1',18801,timeout=20);conn.request('POST','/api/admin/delete-user',body='{}',headers={'Host':'leonsites.org','Origin':'https://evil.test','Content-Type':'application/json'});response=conn.getresponse();assert response.status in [401,403];response.read();conn.close()
    finally:run('docker','rm','-f',candidate,stdout=subprocess.DEVNULL)
env.update(SECRETS_ROOT='/opt/leon-platform/secrets',RELEASE_SHA='25e345ad4533e0d50a11cfd22c2f7f5afff64680')
base=['docker','compose','--env-file','/opt/leon-platform/secrets/.env','-f','/opt/leon-platform/current/infra/ovh/docker-compose.yml','-f']
def deploy(file):run(*base,str(root/'infra/user-delete'/file),'up','-d','--no-deps','--no-build','--wait','--wait-timeout','120','dashboard',env=env)
try:
    deploy('compose.yml');after=inspect('leon-platform-dashboard-1')
    assert set(after['Config']['Env'])==set(old['Config']['Env'])
    assert sorted(after['Mounts'],key=lambda m:m['Destination'])==sorted(old['Mounts'],key=lambda m:m['Destination'])
    for n,id in protected.items():assert inspect(n)['Id']==id
except BaseException:deploy('rollback.yml');raise
(root/'release-result.json').write_text(json.dumps({'image':after['Image'],'runtimeSettingsPreserved':True,'protectedContainersUnchanged':True,'realAccountsDeleted':0},indent=2))
print('Deployed dashboard deletion feature; runtime settings and all other containers preserved. No account deleted.',flush=True)
