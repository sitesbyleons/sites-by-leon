import {describe,it,expect} from 'vitest';
import {parseSnapshot,snapshotWarnings,loadOperations} from '../src/lib/operations';
import {readFileSync} from 'node:fs';
const now=Date.UTC(2026,8,20,23);
const job={result:'success',lastFinished:'2026-09-20',state:'inactive'};
const fixture={version:1,id:'test',label:'Test server',hostname:'test',collectedAt:new Date(now).toISOString(),cpuCores:6,loadAverage:[.1,.2,.3],uptimeSeconds:1000,memoryTotalBytes:12000,memoryAvailableBytes:10000,diskTotalBytes:100000,diskFreeBytes:60000,backupLastSuccess:now/1000,backup:job,monitor:job,retention:job,services:[],errors:[]};
describe('safe operations snapshots',()=>{
 it('rejects incomplete and impossible measurements',()=>{expect(parseSnapshot({})).toBeNull();expect(parseSnapshot({...fixture,memoryAvailableBytes:999999})).toBeNull();expect(parseSnapshot({...fixture,loadAverage:[NaN,1,2]})).toBeNull();expect(parseSnapshot({...fixture,services:new Array(101).fill({})})).toBeNull();});
 it('drops unrecognized fields including nested credentials',()=>{const parsed=parseSnapshot({...fixture,secret:'secret',backup:{...job,password:'secret'}});expect(parsed).not.toBeNull();expect(JSON.stringify(parsed)).not.toContain('secret');});
 it('marks stale or future telemetry, low disk and old backups',()=>{const parsed=parseSnapshot({...fixture,collectedAt:new Date(now-240000).toISOString(),diskFreeBytes:1000,backupLastSuccess:1})!;expect(snapshotWarnings(parsed,now).join(' ')).toMatch(/stale/);expect(snapshotWarnings(parsed,now).join(' ')).toMatch(/Disk/);expect(snapshotWarnings(parsed,now).join(' ')).toMatch(/36 hours/);});
 it('does not mistake normal inactive oneshot jobs for failures',()=>expect(snapshotWarnings(parseSnapshot(fixture)!,now)).toEqual([]));
 it('fails closed with an explicit unavailable state',async()=>{const result=await loadOperations('/missing-operations-test-path');expect(result.servers).toEqual([]);expect(result.errors.length).toBe(1);});
 it('warns when reservations prevent onboarding',()=>{const parsed=parseSnapshot({...fixture,storage:{workspaces:2,usedBytes:100,reservedBytes:30*1073741824,provisionableBytes:20*1073741824}})!;expect(snapshotWarnings(parsed,now).join(' ')).toMatch(/cannot fit/);});
 it('checks platform-admin access before reading telemetry and disables public caching',()=>{const source=readFileSync(new URL('../src/pages/admin/operations.astro',import.meta.url),'utf8');expect(source.indexOf("if(access.kind!=='admin')")).toBeLessThan(source.indexOf('await loadOperations()'));expect(source).toContain("import.meta.env.DEV&&");expect(source).toContain("'private, no-store'");expect(source).toContain('checkAppAdmin');});
});
