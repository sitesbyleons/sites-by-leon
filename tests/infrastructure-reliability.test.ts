import fs from 'node:fs';

import { afterEach, describe, expect, it } from 'vitest';

import { createDataClient, createPostgresDataClient } from '../platform-core/src/index';

const read = (path: string) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const originalPoolMax = process.env.DATABASE_POOL_MAX;

afterEach(() => {
  if (originalPoolMax === undefined) delete process.env.DATABASE_POOL_MAX;
  else process.env.DATABASE_POOL_MAX = originalPoolMax;
});

describe('OVH infrastructure reliability', () => {
  it('runs backups from the active release instead of the retired app path', () => {
    const backup = read('infra/ovh/scripts/backup-database.sh');
    const installer = read('infra/ovh/scripts/install-systemd.sh');
    const service = read('infra/ovh/systemd/leon-backup.service');

    expect(backup).toContain('SOURCE_ROOT=${SOURCE_ROOT:-/opt/leon-platform/current}');
    expect(backup).toContain('cd "${SOURCE_ROOT}/infra/ovh"');
    expect(installer).toContain('SOURCE_ROOT=${SOURCE_ROOT:-/opt/leon-platform/current}');
    expect(service).toContain('/opt/leon-platform/current/infra/ovh/scripts/backup-database.sh');
    expect(`${backup}\n${installer}\n${service}`).not.toContain('/opt/leon-platform/app');
  });

  it('allows encrypted local backups until object-storage credentials are configured', () => {
    const backup = read('infra/ovh/scripts/backup-database.sh');
    expect(backup).toContain('if [[ "${RESTIC_REPOSITORY}" == s3:* ]]');
    expect(backup).toContain(': "${AWS_ACCESS_KEY_ID:?Set the OVH S3 access key.}"');
    expect(backup).toContain(': "${AWS_SECRET_ACCESS_KEY:?Set the OVH S3 secret key.}"');
  });

  it('freezes application writes while taking a consistent database and upload snapshot', () => {
    const backup = read('infra/ovh/scripts/backup-database.sh');
    expect(backup).toContain('rsync -a --delete "${UPLOAD_ROOT}/" "${staged_uploads}/"');
    expect(backup).toContain('stop_attempted=1');
    expect(backup).toContain('docker compose stop dashboard northline');
    expect(backup).toContain('docker compose up -d dashboard northline');
    expect(backup).toContain('backup_paths=("${dump}" "${staged_uploads}")');
  });

  it('refuses to stage uploads when the backup filesystem lacks safe headroom', () => {
    const backup = read('infra/ovh/scripts/backup-database.sh');
    const readme = read('infra/ovh/README.md');

    expect(backup).toContain('BACKUP_MIN_FREE_BYTES');
    expect(backup).toContain('BACKUP_STAGING_ROOT');
    expect(backup).toContain('Not enough free space for a safe backup');
    expect(readme).toContain('BACKUP_STAGING_ROOT');
    expect(readme).toContain('40 GiB');
  });

  it('will only recursively clean a dedicated non-overlapping staging directory', () => {
    const backup = read('infra/ovh/scripts/backup-database.sh');

    expect(backup).toContain("basename \"${staging}\"");
    expect(backup).toContain('staging-current');
    expect(backup).toContain('BACKUP_STAGING_ROOT must be a dedicated');
    expect(backup).toContain('paths_overlap');
    expect(backup).toContain('Refusing to use / as an application or backup path');
  });

  it('refuses to enable the backup timer until its secret files exist', () => {
    const installer = read('infra/ovh/scripts/install-systemd.sh');
    const readme = read('infra/ovh/README.md');
    expect(installer).toContain('/opt/leon-platform/secrets/backup.env');
    expect(installer).toContain('RESTIC_PASSWORD_FILE');
    expect(readme).toContain('backup.env.example');
    expect(readme).toContain('restic-password');
  });

  it('requires root-owned private backup secrets before sourcing them', () => {
    const installer = read('infra/ovh/scripts/install-systemd.sh');

    expect(installer).toContain('require_root_secret');
    expect(installer).toContain("stat -c '%u'");
    expect(installer).toContain("stat -c '%a'");
    expect(installer).toContain('group or other permissions');
  });

  it('defines indexes for every previously unindexed foreign key', () => {
    const schema = read('infra/ovh/postgres/schema.sql');

    for (const index of [
      'studio_clients_workspace_idx on studio_clients (workspace_id)',
      'studio_clients_service_idx on studio_clients (service_id)',
      'studio_gallery_images_workspace_idx on studio_gallery_images (workspace_id)',
      'studio_invoices_workspace_idx on studio_invoices (workspace_id)',
      'studio_invoices_client_idx on studio_invoices (client_id)',
    ]) {
      expect(schema).toContain(`create index if not exists ${index}`);
    }
  });

  it('tracks a hard database-backed storage quota for every workspace', () => {
    const schema = read('infra/ovh/postgres/schema.sql');
    const caddy = read('infra/ovh/Caddyfile');

    expect(schema).toContain('create table if not exists workspace_storage_usage');
    expect(schema).toContain('create table if not exists workspace_uploads');
    expect(schema).toContain('quota_bytes bigint not null default 4294967296');
    expect(caddy).toContain('max_size 16MB');
  });

  it('keeps the schema safe to apply more than once', () => {
    const schema = read('infra/ovh/postgres/schema.sql');

    expect(schema).toContain('create or replace function set_updated_at()');
    for (const trigger of [
      'client_workspaces_updated',
      'studio_settings_updated',
      'studio_invoices_updated',
      'site_connections_updated',
    ]) {
      expect(schema).toContain(`drop trigger if exists ${trigger}`);
    }
  });

  it('migrates existing invoices for partial deposit accounting', () => {
    const schema = read('infra/ovh/postgres/schema.sql');

    expect(schema).toContain('amount_paid_cents integer not null default 0');
    expect(schema).toContain('add column if not exists amount_paid_cents integer not null default 0');
    expect(schema).toContain('drop constraint if exists studio_invoices_status_check');
    expect(schema).toContain("status in ('draft', 'sending', 'open', 'deposit_paid', 'paid', 'void', 'uncollectible', 'review')");
    expect(schema).toContain('check (amount_paid_cents >= 0)');
    expect(schema).toContain("set status = 'deposit_paid', amount_paid_cents = deposit_cents");
    expect(schema).toContain("set amount_paid_cents = amount_due_cents");
  });

  it('allows application code to persist the amount already paid', async () => {
    let query = '';
    const client = createDataClient(async (text) => {
      query = text;
      return [];
    });

    const result = await client
      .from('studio_invoices')
      .update({ amount_paid_cents: 25_000 })
      .eq('id', 'invoice-id');

    expect(result.error).toBeNull();
    expect(query).toContain('"amount_paid_cents" = $1');
  });

  it('caps each application database pool at four connections by default', () => {
    delete process.env.DATABASE_POOL_MAX;
    let options: { max?: number } | undefined;

    createPostgresDataClient('postgresql://platform.test/leon', (_connectionString, suppliedOptions) => {
      options = suppliedOptions;
      return { unsafe: async () => [] };
    });

    expect(options?.max).toBe(4);
  });

  it('allows a bounded database pool override for larger deployments', () => {
    process.env.DATABASE_POOL_MAX = '7';
    let options: { max?: number } | undefined;

    createPostgresDataClient('postgresql://platform.test/leon', (_connectionString, suppliedOptions) => {
      options = suppliedOptions;
      return { unsafe: async () => [] };
    });

    expect(options?.max).toBe(7);
  });

  it('rejects unsafe database pool overrides', () => {
    process.env.DATABASE_POOL_MAX = '1000';
    let options: { max?: number } | undefined;

    createPostgresDataClient('postgresql://platform.test/leon', (_connectionString, suppliedOptions) => {
      options = suppliedOptions;
      return { unsafe: async () => [] };
    });

    expect(options?.max).toBe(4);
  });

  it('rejects partially numeric database pool overrides', () => {
    process.env.DATABASE_POOL_MAX = '7-connections';
    let options: { max?: number } | undefined;

    createPostgresDataClient('postgresql://platform.test/leon', (_connectionString, suppliedOptions) => {
      options = suppliedOptions;
      return { unsafe: async () => [] };
    });

    expect(options?.max).toBe(4);
  });

  it('applies the rerunnable schema during every deployment', () => {
    const deploy = read('infra/ovh/scripts/deploy.sh');
    const migration = read('infra/ovh/scripts/migrate-database.sh');

    expect(deploy).toContain('migrate-database.sh');
    expect(deploy).toContain('SOURCE_ROOT="${SOURCE_ROOT}" /usr/bin/bash');
    expect(migration).toContain('SOURCE_ROOT=${SOURCE_ROOT:-/opt/leon-platform/current}');
    expect(migration).toContain('psql --set ON_ERROR_STOP=1');
    expect(migration).toContain('--single-transaction');
    expect(migration).toContain('< "${SOURCE_ROOT}/infra/ovh/postgres/schema.sql"');
  });

  it('serializes deployments, migrations, and consistent backups with one host lock', () => {
    const backup = read('infra/ovh/scripts/backup-database.sh');
    const deploy = read('infra/ovh/scripts/deploy.sh');
    const migration = read('infra/ovh/scripts/migrate-database.sh');

    for (const script of [backup, deploy, migration]) {
      expect(script).toContain('/run/lock/leon-platform-maintenance.lock');
      expect(script).toContain('flock');
    }
    expect(deploy).toContain('MAINTENANCE_LOCK_HELD=1');
  });

  it('documents the pool override and active release paths for operators', () => {
    const readme = read('infra/ovh/README.md');
    const dashboardEnv = read('infra/ovh/secrets/dashboard.env.example');
    const northlineEnv = read('infra/ovh/secrets/northline.env.example');

    expect(readme).toContain('/opt/leon-platform/current');
    expect(readme).toContain('DATABASE_POOL_MAX');
    expect(dashboardEnv).toContain('DATABASE_POOL_MAX=4');
    expect(northlineEnv).toContain('DATABASE_POOL_MAX=4');
  });
});
