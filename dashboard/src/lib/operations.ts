import {readdir,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
export type OperationService={name:string;state:string;health:string;restarts:number;memoryLimitBytes:number;cpuLimit:number;image:string;startedAt:string};
type Job={result:string;lastFinished:string;state:string};
export type OperationSnapshot={version:1;id:string;label:string;hostname:string;collectedAt:string;cpuCores:number;loadAverage:number[];uptimeSeconds:number;memoryTotalBytes:number;memoryAvailableBytes:number;diskTotalBytes:number;diskFreeBytes:number;backupLastSuccess:number|null;backup:Job;monitor:Job;retention:Job;services:OperationService[];errors:string[];storage?:{workspaces:number;usedBytes:number;reservedBytes:number;provisionableBytes:number|null}};
const text=(v:unknown):v is string=>typeof v==='string'&&v.length<=240;
const number=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const job=(v:any)=>v&&text(v.result)&&text(v.lastFinished)&&text(v.state);
export function parseSnapshot(value:unknown):OperationSnapshot|null{
 const v=value as any;
 if(!v||v.version!==1||!['id','label','hostname','collectedAt'].every(k=>text(v[k]))||!Number.isFinite(Date.parse(v.collectedAt)))return null;
 if(!['cpuCores','uptimeSeconds','memoryTotalBytes','memoryAvailableBytes','diskTotalBytes','diskFreeBytes'].every(k=>number(v[k])))return null;
 if(v.cpuCores<1||v.memoryTotalBytes<=0||v.diskTotalBytes<=0||v.memoryAvailableBytes>v.memoryTotalBytes||v.diskFreeBytes>v.diskTotalBytes)return null;
 if(!Array.isArray(v.loadAverage)||v.loadAverage.length!==3||!v.loadAverage.every(number))return null;
 if(v.backupLastSuccess!==null&&!number(v.backupLastSuccess))return null;
 if(!job(v.backup)||!job(v.monitor)||!job(v.retention))return null;
 if(!Array.isArray(v.errors)||v.errors.length>20||!v.errors.every(text))return null;
 if(!Array.isArray(v.services)||v.services.length>100||!v.services.every((s:any)=>s&&['name','state','health','image','startedAt'].every(k=>text(s[k]))&&['restarts','memoryLimitBytes','cpuLimit'].every(k=>number(s[k]))))return null;
 // Explicit allow-list: unknown keys (including accidental credentials) are never returned.
 const result:OperationSnapshot={version:1,id:v.id,label:v.label,hostname:v.hostname,collectedAt:v.collectedAt,cpuCores:v.cpuCores,loadAverage:v.loadAverage,uptimeSeconds:v.uptimeSeconds,memoryTotalBytes:v.memoryTotalBytes,memoryAvailableBytes:v.memoryAvailableBytes,diskTotalBytes:v.diskTotalBytes,diskFreeBytes:v.diskFreeBytes,backupLastSuccess:v.backupLastSuccess,backup:{result:v.backup.result,lastFinished:v.backup.lastFinished,state:v.backup.state},monitor:{result:v.monitor.result,lastFinished:v.monitor.lastFinished,state:v.monitor.state},retention:{result:v.retention.result,lastFinished:v.retention.lastFinished,state:v.retention.state},errors:v.errors,services:v.services.map((s:any)=>({name:s.name,state:s.state,health:s.health,restarts:s.restarts,memoryLimitBytes:s.memoryLimitBytes,cpuLimit:s.cpuLimit,image:s.image,startedAt:s.startedAt}))};
 if(v.storage&&['workspaces','usedBytes','reservedBytes'].every(k=>number(v.storage[k]))&&(v.storage.provisionableBytes===null||number(v.storage.provisionableBytes)))result.storage={workspaces:v.storage.workspaces,usedBytes:v.storage.usedBytes,reservedBytes:v.storage.reservedBytes,provisionableBytes:v.storage.provisionableBytes};
 return result;
}
export function snapshotWarnings(s:OperationSnapshot,now=Date.now()){
 const warnings=[...s.errors];const age=now-Date.parse(s.collectedAt);
 if(age>180000||age< -60000)warnings.push('Telemetry is stale or its clock is incorrect. Refresh after checking the collector.');
 if(s.diskFreeBytes/s.diskTotalBytes<.2)warnings.push('Disk space is below 20% free. Review capacity before onboarding.');
 if(s.memoryAvailableBytes/s.memoryTotalBytes<.2)warnings.push('Available memory is below 20%. Investigate sustained pressure.');
 if(!s.backupLastSuccess||now-s.backupLastSuccess*1000>36*3600000||s.backupLastSuccess*1000>now+60000)warnings.push('No recent successful backup within 36 hours.');
 if(s.backup.result!=='success')warnings.push('The last backup job did not report success.');
 if(s.monitor.result!=='success')warnings.push('The last production monitor check did not report success.');
 if(s.services.some(x=>x.state!=='running'||['unhealthy','starting'].includes(x.health)))warnings.push('One or more services are stopped, starting or unhealthy.');
 if(s.services.some(x=>x.memoryLimitBytes===0))warnings.push('At least one service has no configured memory limit.');
 if(s.storage&&s.storage.provisionableBytes!==null&&s.storage.provisionableBytes-s.storage.reservedBytes<15*1073741824)warnings.push('The configured storage reservation budget cannot fit another 15 GiB site. Review storage before provisioning.');
 return warnings;
}
export async function loadOperations(directory=process.env.OPERATIONS_SNAPSHOT_DIR??'/run/leon-operations'){
 const servers:OperationSnapshot[]=[],errors:string[]=[];
 try{
  const files=(await readdir(directory)).filter(name=>/^[a-z0-9-]+\.json$/.test(name)).sort();
  if(files.length>20)errors.push('Only the first 20 server snapshots are shown.');
  for(const name of files.slice(0,20)){
   let file;
   try{file=await open(path.join(directory,name),constants.O_RDONLY|constants.O_NOFOLLOW);const stat=await file.stat();if(!stat.isFile()||stat.size>131072)throw Error();const buffer=Buffer.alloc(131073);const read=await file.read(buffer,0,buffer.length,0);if(read.bytesRead>131072)throw Error();const snapshot=parseSnapshot(JSON.parse(buffer.subarray(0,read.bytesRead).toString('utf8')));if(!snapshot)throw Error();servers.push(snapshot);}catch{errors.push(`Cannot read a valid snapshot for ${name.replace('.json','')}.`);}finally{await file?.close();}
  }
 }catch{errors.push('Server telemetry is not connected. The Operations collector must be installed.');}
 return {servers,errors};
}
