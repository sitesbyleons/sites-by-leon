import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const workflow = fs.readFileSync(
  new URL('../.github/workflows/quality.yml', import.meta.url),
  'utf8',
);

const workflowStep = (name: string) => {
  const marker = `      - name: ${name}`;
  const start = workflow.indexOf(marker);
  if (start < 0) return '';
  const next = workflow.indexOf('\n      - name:', start + marker.length);
  return workflow.slice(start, next < 0 ? undefined : next);
};

const workflowJob = (name: string) => {
  const marker = `  ${name}:`;
  const start = workflow.indexOf(marker);
  if (start < 0) return '';
  const next = workflow.slice(start + marker.length).search(/^\s{2}[a-zA-Z0-9_-]+:\s*$/m);
  return workflow.slice(start, next < 0 ? undefined : start + marker.length + next);
};

describe('CI security', () => {
  it('pins every third-party action to a full commit SHA', () => {
    const actions = Array.from(workflow.matchAll(/^\s*uses:\s*([^\s#]+)/gm), ([, action]) => action);

    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      expect(action, action).toMatch(/^[^@\s]+@[a-f0-9]{40}$/);
    }
  });

  it('keeps pull-request verification completely secretless', () => {
    const verifyJob = workflowJob('verify');

    expect(verifyJob).not.toContain('${{ secrets.');
    expect(verifyJob).not.toContain('CLERK_SECRET_KEY');
    expect(workflowStep('Build client dashboard Worker')).not.toContain('CLERK');
    expect(workflowStep('Build photographer site')).not.toContain('CLERK');
  });

  it('runs credentialed CSP tests only against the reviewed main-branch commit', () => {
    const trustedJob = workflowJob('trusted-csp');

    expect(trustedJob).toContain(
      "if: github.event_name == 'push' && github.ref == 'refs/heads/main'",
    );
    expect(trustedJob).toContain('needs: verify');
    expect(trustedJob).toContain('ref: ${{ github.sha }}');
    expect(trustedJob).toContain(
      'PUBLIC_CLERK_PUBLISHABLE_KEY: ${{ secrets.PUBLIC_CLERK_PUBLISHABLE_KEY }}',
    );
    expect(trustedJob).toContain('CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY }}');
    expect(trustedJob).toContain('pnpm --dir dashboard test:csp');
    expect(trustedJob).toContain('pnpm --dir photographer-site test:csp');
  });

  it('runs secret-sync and backup-restore regressions without credentials', () => {
    expect(workflow).toContain('bash infra/ovh/tests/sync-secrets.test.sh');
    expect(workflow).toContain('bash infra/ovh/tests/backup-restore.test.sh');
    expect(workflow).toContain('bash infra/ovh/tests/monitor-production.test.sh');
    expect(workflow).toContain('bash infra/ovh/tests/switch-public-site-mode.test.sh');
  });
});
