import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {statisticsRepository} from '../platform-core/src/statistics.ts';
let sql;
await statisticsRepository(async(query)=>{sql=query;return []}).report('00000000-0000-0000-0000-000000000002',7);
const result=execFileSync('ssh',['-i','C:/Users/leonl/.ssh/leonsites_ovh','-o','BatchMode=yes','ubuntu@15.204.230.82','docker exec -i -u postgres leon-statistics-scratch-20260920 psql -X -t -A -v ON_ERROR_STOP=1'],{input:`set timezone='Pacific/Honolulu'; PREPARE analytics_report(uuid,int) AS ${sql}; EXECUTE analytics_report('00000000-0000-0000-0000-000000000002',7);`,encoding:'utf8'});
const report=JSON.parse(result.split('\n').find(line=>line.startsWith('{')));
assert.equal(report.visits,1);assert.equal(report.views,1);assert.equal(report.daily.length,7);assert.equal(report.daily.at(-1).day,new Date().toISOString().slice(0,10));assert.deepEqual(report.countries,[{name:'GB',visits:1}]);console.log('Real PostgreSQL report: country grouping, tenant isolation, UTC dates and counts passed.');
