import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const read = (path: string) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('backup secret isolation', () => {
  it('keeps root backup credentials outside the deploy-user runtime secret directory', () => {
    const backupRoot = '/opt/leon-platform/backup-secrets';
    const service = read('infra/ovh/systemd/leon-backup.service');
    const example = read('infra/ovh/secrets/backup.env.example');
    const installer = read('infra/ovh/scripts/install-systemd.sh');
    const verifier = read('infra/ovh/scripts/verify-backup-restore.sh');

    expect(service).toContain(`EnvironmentFile=${backupRoot}/backup.env`);
    expect(example).toContain(`RESTIC_PASSWORD_FILE=${backupRoot}/restic-password`);
    expect(installer).toContain(`BACKUP_SECRETS_ROOT=${backupRoot}`);
    expect(installer).toContain('require_root_secret_directory "${BACKUP_SECRETS_ROOT}"');
    expect(verifier).toContain(`BACKUP_SECRETS_ROOT=\${BACKUP_SECRETS_ROOT:-${backupRoot}}`);
    expect(verifier).toContain('require_root_secret_directory "$(dirname "${BACKUP_ENV}")"');
    expect(verifier).toContain('require_root_secret_directory "$(dirname "${RESTIC_PASSWORD_FILE}")"');
  });
});
