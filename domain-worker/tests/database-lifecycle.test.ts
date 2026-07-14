import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('domain job lifecycle fencing', () => {
  const source = fs.readFileSync(new URL('../src/database.ts', import.meta.url), 'utf8');

  it('does not reclaim or retry create jobs after removal starts', () => {
    expect(source).toContain("job.action <> 'delete' and alias.status not in ('removing', 'removed')");
    expect(source).toContain("alias.status in ('removing', 'removed')");
    expect(source).toContain('Superseded by domain removal.');
  });

  it('serializes domain jobs and fences stale duplicate deletions', () => {
    expect(source).toContain('active_job.status = \'processing\'');
    expect(source).toContain('coalesce(active_job.locked_at, active_job.updated_at) > now()');
    expect(source).toContain('for update of job, alias skip locked');
    expect(source).toContain("job.action = 'delete' and alias.status <> 'removed'");
    expect(source).toContain('Superseded by completed domain removal.');
  });

  it('lets deletion take over after a crashed create job reaches its lock timeout', () => {
    expect(source).toContain("claimed_job.action = 'delete'");
    expect(source).toContain("sibling.action in ('create', 'refresh')");
    expect(source).toContain('coalesce(sibling.locked_at, sibling.updated_at) <= now()');
    expect(source).toContain("action in ('create', 'refresh') and status in ('queued', 'processing')");
  });

  it('records late provider IDs without reactivating a removing alias', () => {
    expect(source).toContain("when alias.status = 'removing' then 'removing'");
    expect(source).toContain("when alias.status = 'removing' then false");
    expect(source).toContain("alias.status <> 'removed'");
  });
});
