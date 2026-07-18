import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const loader = new URL('../infra/ovh/scripts/load-backup-environment.sh', import.meta.url).pathname;
const fixtures: string[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) fs.rmSync(fixture, { recursive: true, force: true });
});

const createFixture = () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'leon-backup-env-'));
  fixtures.push(fixture);
  return fixture;
};

const runLoader = (environmentFile: string) =>
  spawnSync(
    'bash',
    [
      '-c',
      'set -e; source "$1"; load_backup_environment "$2"; printf "%s" "$SUPABASE_BACKUP_PASSWORD"',
      'bash',
      loader,
      environmentFile,
    ],
    { encoding: 'utf8' },
  );

describe('backup environment loader', () => {
  it('loads allowlisted systemd-safe values literally', () => {
    const fixture = createFixture();
    const environmentFile = path.join(fixture, 'backup.env');
    fs.writeFileSync(
      environmentFile,
      'RESTIC_REPOSITORY=rclone:supabase:leon-sites-backups/restic\n' +
        'SUPABASE_BACKUP_PASSWORD=random_password-123\n',
    );

    const result = runLoader(environmentFile);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('random_password-123');
    expect(result.stderr).toBe('');
  });

  it('rejects shell substitutions without executing them', () => {
    const fixture = createFixture();
    const marker = path.join(fixture, 'executed');
    const environmentFile = path.join(fixture, 'backup.env');
    fs.writeFileSync(environmentFile, `SUPABASE_BACKUP_PASSWORD=$(touch${' '}${marker})\n`);

    const result = runLoader(environmentFile);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('contains an unsafe value');
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('rejects variables that could redirect root installer behavior', () => {
    const fixture = createFixture();
    const environmentFile = path.join(fixture, 'backup.env');
    fs.writeFileSync(environmentFile, 'SOURCE_ROOT=/tmp/untrusted-release\n');

    const result = runLoader(environmentFile);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Unsupported backup environment key');
  });
});
