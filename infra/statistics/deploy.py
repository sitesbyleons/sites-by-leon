import datetime, hashlib, json, os, pathlib, secrets, subprocess
root=pathlib.Path('/opt/leon-platform/design-releases/statistics-20260920')
def run(*args,**kwargs):return subprocess.run(args,check=True,**kwargs)
def inspect(name):return json.loads(subprocess.check_output(['docker','inspect',name]))[0]
protected=['leon-platform-gateway-1','leon-platform-dashboard-1','leon-platform-database-1','leon-platform-test-database-test-1','leon-platform-ishotyouu-stills-1','ishotyouu-demo','leon-platform-cloudflared-1']
before={name:inspect(name)['Id'] for name in protected}
cms=inspect('leon-platform-photographer-1')
assert cms['Image']=='sha256:a190cb0bb5ad9019e527bb3c91b9e6c8a16f1ddd8a1f0ca89a09d22cdf5112be','Baseline changed'
backup=pathlib.Path('/opt/leon-platform/backups/statistics-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
backup.mkdir(mode=0o700)
with (backup/'database.dump').open('wb') as out:run('docker','exec','leon-platform-database-1','sh','-c','exec pg_dump --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom',stdout=out)
os.chmod(backup/'database.dump',0o600)
with (backup/'database.dump').open('rb') as source:run('docker','exec','-i','leon-platform-database-1','pg_restore','--list',stdin=source,stdout=subprocess.DEVNULL)
uploads={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in pathlib.Path('/opt/leon-platform/uploads').rglob('*') if p.is_file()}
def psql(file):
 with file.open('rb') as source:run('docker','exec','-i','leon-platform-database-1','sh','-c','exec psql --no-psqlrc --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --set=ON_ERROR_STOP=1',stdin=source)
psql(root/'infra/ovh/postgres/migrations/20260920-statistics.sql')
target=pathlib.Path('/opt/leon-platform/statistics');target.mkdir(mode=0o755,exist_ok=True)
for name in ['statistics-retention.sh','statistics-retention.sql']:
 run('install','-m','644',str(root/'infra/ovh/postgres'/name),str(target/name))
for name in ['leon-statistics-retention.service','leon-statistics-retention.timer']:
 run('install','-m','644',str(root/'infra/ovh/postgres'/name),'/etc/systemd/system/'+name)
run('systemctl','daemon-reload');run('systemctl','start','leon-statistics-retention.service');run('systemctl','enable','--now','leon-statistics-retention.timer');run('systemctl','is-active','leon-statistics-retention.timer')
secret=pathlib.Path('/opt/leon-platform/secrets/statistics.env')
if secret.exists():raise RuntimeError('Analytics config already exists; inspect before retrying')
secret.write_text('ANALYTICS_HASH_SECRET='+secrets.token_hex(32)+'\nANALYTICS_ENABLED_SITE_KEYS=ishotyouu-demo\n');secret.chmod(0o600)
env=os.environ.copy();env.update(SECRETS_ROOT='/opt/leon-platform/secrets',RELEASE_SHA='25e345ad4533e0d50a11cfd22c2f7f5afff64680')
base=['docker','compose','--env-file','/opt/leon-platform/secrets/.env','-f','/opt/leon-platform/current/infra/ovh/docker-compose.yml','-f']
try:
 run(*base,str(root/'infra/statistics/compose.yml'),'up','-d','--no-deps','--no-build','--wait','--wait-timeout','120','photographer',env=env)
 after=inspect('leon-platform-photographer-1')
 oldenv=set(cms['Config']['Env']);newenv=set(after['Config']['Env'])
 assert oldenv<=newenv,'Existing runtime environment changed'
 assert all(x.startswith(('ANALYTICS_HASH_SECRET=','ANALYTICS_ENABLED_SITE_KEYS=')) for x in newenv-oldenv),'Unexpected runtime environment change'
 assert sorted(cms['Mounts'],key=lambda x:x['Destination'])==sorted(after['Mounts'],key=lambda x:x['Destination']),'Mounts changed'
 for name,id in before.items():assert inspect(name)['Id']==id,'Protected service changed: '+name
 for p,digest in uploads.items():assert hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()==digest,'Existing upload changed'
 run('curl','-fsS','--retry','3','https://www.ishotyouu.net/statistics-privacy',stdout=subprocess.DEVNULL)
except BaseException:
 run(*base,str(root/'infra/statistics/rollback.yml'),'up','-d','--no-deps','--no-build','--wait','--wait-timeout','120','photographer',env=env)
 raise
(root/'release-result.json').write_text(json.dumps({'backup':str(backup),'image':after['Image'],'protectedContainersUnchanged':True,'existingEnvironmentPreserved':True,'existingUploadsPreserved':len(uploads)},indent=2))
print('Statistics deployed; backup verified; existing runtime settings, uploads and protected containers preserved.')
