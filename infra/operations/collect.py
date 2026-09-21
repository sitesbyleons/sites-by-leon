#!/usr/bin/env python3
"""Local read-only collector. Exports selected metrics, never env values or Docker socket access."""
import datetime, json, os, pathlib, shutil, subprocess, tempfile, time
OUTPUT=pathlib.Path('/var/lib/leon-platform/operations')
def command(*args):
    return subprocess.check_output(args,text=True,timeout=15,stderr=subprocess.DEVNULL).strip()
def service(name):
    try:
        fields=dict(line.split('=',1) for line in command('systemctl','show',name,'--property=Result,ExecMainExitTimestamp,ActiveState').splitlines())
        return {'result':fields.get('Result','unknown') if fields.get('ExecMainExitTimestamp') else 'unknown','lastFinished':fields.get('ExecMainExitTimestamp',''),'state':fields.get('ActiveState','unknown')}
    except Exception:return {'result':'unknown','lastFinished':'','state':'unknown'}
def collect():
    memory={line.split(':')[0]:int(line.split()[1])*1024 for line in pathlib.Path('/proc/meminfo').read_text().splitlines()}
    disk=shutil.disk_usage('/opt/leon-platform')
    containers=[];errors=[];capacity=None;storage=None
    try:
        ids=command('docker','ps','-aq','--filter','label=com.docker.compose.project=leon-platform').splitlines()
        # Include the known legacy sidecar for visibility; do not alter it.
        ids += command('docker','ps','-aq','--filter','name=^/ishotyouu-demo$').splitlines()
        if len(ids)>100:raise ValueError('Container inventory exceeds collector bound')
        for row in json.loads(command('docker','inspect',*ids)) if ids else []:
            state=row['State'];limits=row['HostConfig']
            if row['Name']=='/leon-platform-dashboard-1':
                env=dict(item.split('=',1) for item in row['Config'].get('Env',[]))
                capacity=int(env.get('PLATFORM_PROVISIONABLE_STORAGE_BYTES',60*1073741824))
            containers.append({'name':row['Name'].lstrip('/'),'state':state['Status'],'health':state.get('Health',{}).get('Status','not configured'),'restarts':row.get('RestartCount',0),'memoryLimitBytes':limits.get('Memory',0),'cpuLimit':limits.get('NanoCpus',0)/1e9,'image':row['Config']['Image'],'startedAt':state.get('StartedAt','')})
    except Exception:errors.append('Service inventory unavailable')
    try:
        query="select json_build_object('workspaces',count(*),'usedBytes',coalesce(sum(used_bytes),0),'reservedBytes',coalesce(sum(quota_bytes),0)) from workspace_storage_usage;"
        storage=json.loads(command('docker','exec','leon-platform-database-1','sh','-c','exec psql --no-psqlrc --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --tuples-only --no-align --command "$1"','sh',query))
        storage['provisionableBytes']=capacity
    except Exception:errors.append('Storage reservation totals unavailable')
    try:backup=int(pathlib.Path('/var/lib/leon-platform/last-successful-backup').read_text().strip())
    except Exception:backup=None
    return {'version':1,'id':'ovh-primary','label':'OVH primary','hostname':os.uname().nodename,'collectedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'cpuCores':os.cpu_count(),'loadAverage':list(os.getloadavg()),'uptimeSeconds':int(float(pathlib.Path('/proc/uptime').read_text().split()[0])),'memoryTotalBytes':memory['MemTotal'],'memoryAvailableBytes':memory['MemAvailable'],'diskTotalBytes':disk.total,'diskFreeBytes':disk.free,'backupLastSuccess':backup,'backup':service('leon-backup.service'),'monitor':service('leon-monitor.service'),'retention':service('leon-statistics-retention.service'),'storage':storage,'services':containers,'errors':errors}
def main():
    OUTPUT.mkdir(parents=True,exist_ok=True,mode=0o755)
    payload=json.dumps(collect(),separators=(',',':'))
    if len(payload)>131072:raise ValueError('Snapshot too large')
    with tempfile.NamedTemporaryFile(mode='w',dir=OUTPUT,prefix='.snapshot-',delete=False) as file:
        file.write(payload);file.flush();os.fsync(file.fileno());stage=pathlib.Path(file.name)
    stage.chmod(0o644);stage.replace(OUTPUT/'ovh-primary.json')
if __name__=='__main__':main()
