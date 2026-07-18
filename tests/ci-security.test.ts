import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const workflow = fs.readFileSync(
  new URL('../.github/workflows/quality.yml', import.meta.url),
  'utf8',
);

describe('CI security', () => {
  it('pins every third-party action to a full commit SHA', () => {
    const actions = Array.from(workflow.matchAll(/^\s*uses:\s*([^\s#]+)/gm), ([, action]) => action);

    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      expect(action, action).toMatch(/^[^@\s]+@[a-f0-9]{40}$/);
    }
  });

  it('keeps Clerk credentials out of the job-wide environment', () => {
    const jobEnvironment = workflow.match(/^\s{4}env:\n((?:\s{6}[^\n]*\n)*)/m)?.[1] ?? '';

    expect(jobEnvironment).not.toContain('CLERK');
    expect(workflow).toContain('PUBLIC_CLERK_PUBLISHABLE_KEY: ${{ secrets.PUBLIC_CLERK_PUBLISHABLE_KEY }}');
    expect(workflow).toContain('CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY }}');
  });

  it('runs secret-sync and backup-restore regressions without credentials', () => {
    expect(workflow).toContain('bash infra/ovh/tests/sync-secrets.test.sh');
    expect(workflow).toContain('bash infra/ovh/tests/backup-restore.test.sh');
  });
});
