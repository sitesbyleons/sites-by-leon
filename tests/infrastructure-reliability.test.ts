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
  it('keeps the custom-domain worker and deployment safety checks in GitHub CI', () => {
    const workflow = read('.github/workflows/quality.yml');

    expect(workflow).toContain('fetch-depth: 0');
    expect(workflow).toContain('PROVISIONING_DATABASE_URL: postgresql://leon_test:leon_test@127.0.0.1:5432/leon_platform_test');
    expect(workflow).toContain('pnpm --dir domain-worker check');
    expect(workflow).toContain('pnpm --dir domain-worker test');
    expect(workflow).toContain('pnpm --dir domain-worker build');
    expect(workflow).toContain('bash infra/ovh/tests/preflight-domain-worker.test.sh');
    expect(workflow).toContain('bash infra/ovh/tests/healthcheck-domain-worker.test.sh');
    expect(workflow).toContain('infra/ovh/scripts/validate-migration.sh');
  });

  it('validates migrations from the PR base or previous pushed commit', () => {
    const workflow = read('.github/workflows/quality.yml');

    expect(workflow).toContain(
      "BASE_SCHEMA_REF: ${{ github.event_name == 'pull_request' && github.event.pull_request.base.sha || github.event.before }}",
    );
    expect(workflow).toContain('if [[ "${BASE_SCHEMA_REF}" =~ ^0{40}$ ]]; then');
    expect(workflow).not.toContain('github.event.pull_request.base.sha || github.sha');
  });

  it('keeps the disposable migration database within hosted runner limits', () => {
    const validation = read('infra/ovh/tests/validate-migration-ci.sh');

    expect(validation).toContain('docker-compose.ci.yml');
    expect(validation).toContain('cpus: 1');
    expect(validation).toContain('mem_limit: 1g');
    expect(validation).toContain('export COMPOSE_FILE=');
  });

  it('installs immutable backup helpers while reading data from the active release', () => {
    const backup = read('infra/ovh/scripts/backup-database.sh');
    const installer = read('infra/ovh/scripts/install-systemd.sh');
    const service = read('infra/ovh/systemd/leon-backup.service');

    expect(backup).toContain('SOURCE_ROOT=${SOURCE_ROOT:-/opt/leon-platform/current}');
    expect(installer).toContain('SOURCE_ROOT=${SOURCE_ROOT:-/opt/leon-platform/current}');
    expect(installer).toContain('LIBEXEC_ROOT=/usr/local/libexec/leon-platform');
    expect(installer).toContain('install -o root -g root -m 0755');
    expect(installer).toContain('supabase-storage-session-token.sh');
    expect(installer).toContain('load-backup-environment.sh');
    expect(service).toContain('/usr/local/libexec/leon-platform/backup-database.sh');
    expect(service).toContain('UMask=0077');
    expect(service).not.toContain('/opt/leon-platform/current/infra/ovh/scripts');
    expect(`${backup}\n${installer}\n${service}`).not.toContain('/opt/leon-platform/app');
  });

  it('requires an offsite backup repository unless local mode is explicitly enabled', () => {
    const backup = read('infra/ovh/scripts/backup-database.sh');
    const installer = read('infra/ovh/scripts/install-systemd.sh');
    const backupEnv = read('infra/ovh/secrets/backup.env.example');

    for (const script of [backup, installer]) {
      expect(script).toContain('s3:*|b2:*|azure:*|gs:*|sftp:*|rest:*|rclone:*');
      expect(script).toContain('ALLOW_LOCAL_BACKUP:-false');
      expect(script).toContain('Local Restic repositories require ALLOW_LOCAL_BACKUP=true');
      expect(script).toContain('if [[ "${RESTIC_REPOSITORY}" == s3:* ]]');
      expect(script).toContain(': "${AWS_ACCESS_KEY_ID:?Set the S3 access key.}"');
      expect(script).toContain(': "${AWS_SECRET_ACCESS_KEY:?Set the S3 secret key.}"');
    }
    expect(backupEnv).toMatch(/^RESTIC_REPOSITORY=rclone:/m);
    expect(backupEnv).toContain('ALLOW_LOCAL_BACKUP=false');
  });

  it('refreshes a scoped Supabase Storage session immediately before Restic access', () => {
    const backup = read('infra/ovh/scripts/backup-database.sh');
    const drill = read('infra/ovh/scripts/verify-backup-restore.sh');
    const helper = read('infra/ovh/scripts/supabase-storage-session-token.sh');
    const installer = read('infra/ovh/scripts/install-systemd.sh');
    const backupEnv = read('infra/ovh/secrets/backup.env.example');

    for (const script of [backup, drill]) {
      expect(script).toContain('/usr/local/libexec/leon-platform/supabase-storage-session-token.sh');
      expect(script).toContain('export AWS_SESSION_TOKEN');
      expect(script).toContain('restic_with_fresh_session()');
      expect(script).toContain('timeout --kill-after=30s');
      expect(script).toContain('SUPABASE_BACKUP_COMMAND_TIMEOUT_SECONDS > 3000');
    }
    expect(backup).toContain('restic_with_fresh_session cat config');
    expect(backup).not.toContain('snapshots >/dev/null 2>&1 ||');
    expect(helper).toContain(
      "^https://([a-z0-9-]+)\\.supabase\\.co/auth/v1/token\\?grant_type=password$",
    );
    expect(helper).toContain('--data-binary @-');
    expect(helper).toContain('must use the scoped Supabase rclone remote');
    expect(helper).toContain("'.access_token | select(type == \"string\" and length > 0)'");
    expect(helper).toContain('SUPABASE_BACKUP_COMMAND_TIMEOUT_SECONDS + 300');
    expect(helper).toContain('SUPABASE_BACKUP_COMMAND_TIMEOUT_SECONDS > 3000');
    expect(helper).not.toContain('set -x');
    expect(installer).toContain('command -v rclone');
    expect(installer).toContain('command -v curl');
    expect(installer).toContain('Backup repository preflight failed');
    expect(installer).toContain('restic init');
    expect(installer).toContain('restic cat config');
    expect(installer).toContain('repository_status == 10');
    expect(installer).toContain('SUPABASE_BACKUP_COMMAND_TIMEOUT_SECONDS > 3000');
    expect(backupEnv).toContain('SUPABASE_BACKUP_AUTH_URL=https://');
    expect(backupEnv).toContain('RCLONE_CONFIG_SUPABASE_ENDPOINT=https://');
    expect(backupEnv).toContain('AWS_DEFAULT_REGION=replace_with_project_region');
    expect(backupEnv).toContain('RCLONE_CONFIG_SUPABASE_REGION=replace_with_project_region');
    expect(backupEnv).not.toContain('AWS_SESSION_TOKEN=');
  });

  it('parses backup environment files as data instead of root shell code', () => {
    const installer = read('infra/ovh/scripts/install-systemd.sh');
    const drill = read('infra/ovh/scripts/verify-backup-restore.sh');
    const loader = read('infra/ovh/scripts/load-backup-environment.sh');

    for (const script of [installer, drill]) {
      expect(script).toContain('load_backup_environment "${BACKUP_ENV}"');
      expect(script).not.toContain('source "${BACKUP_ENV}"');
    }
    expect(loader).toContain('Unsupported backup environment key');
    expect(loader).toContain('contains an unsafe value');
    expect(loader).not.toContain('eval ');
  });

  it('installs a private restore drill that verifies the latest database and uploads', () => {
    const drill = read('infra/ovh/scripts/verify-backup-restore.sh');
    const installer = read('infra/ovh/scripts/install-systemd.sh');
    const readme = read('infra/ovh/README.md');

    expect(drill).toContain('restic_with_fresh_session check');
    expect(drill).toContain(
      'restic_with_fresh_session snapshots --host "${BACKUP_HOSTNAME}" --json',
    );
    expect(drill).toContain('max_by(.time)');
    expect(drill).toContain('mktemp -d');
    expect(drill).toContain('chmod 0700');
    expect(drill).toContain('trap cleanup EXIT');
    expect(drill).toContain(
      'restic_with_fresh_session restore "${snapshot_id}" --target "${restore_target}"',
    );
    expect(drill).toContain('pg_restore --list');
    expect(drill).toContain('cmp --');
    expect(drill).toContain('No restored secret values are printed.');
    expect(installer).toContain('verify-backup-restore.sh');
    expect(readme).toContain('/usr/local/libexec/leon-platform/verify-backup-restore.sh');
  });

  it('freezes application writes while taking a consistent database and upload snapshot', () => {
    const backup = read('infra/ovh/scripts/backup-database.sh');
    expect(backup).toContain('rsync -a --delete "${UPLOAD_ROOT}/" "${staged_uploads}/"');
    expect(backup).toContain('stop_attempted=1');
    expect(backup).toContain('com.docker.compose.project=${COMPOSE_PROJECT_NAME}');
    expect(backup).toContain('photographer_container=$(service_container photographer)');
    expect(backup).toContain('docker stop "${dashboard_container}" "${photographer_container}"');
    expect(backup).toContain('docker start "${dashboard_container}" "${photographer_container}"');
    expect(backup).not.toContain('northline_container');
    expect(backup).toContain('backup_paths=("${dump}" "${staged_uploads}")');
  });

  it('recovers the shared runtime only after every active customer site is healthy', () => {
    const backup = read('infra/ovh/scripts/backup-database.sh');
    const healthcheck = read('infra/ovh/scripts/healthcheck.sh');

    expect(backup).toContain('wait_for_application_health');
    expect(backup).toContain('SOURCE_ROOT="${SOURCE_ROOT}" /usr/bin/bash "${BACKUP_HEALTHCHECK_SCRIPT}"');
    expect(healthcheck).toContain('mapfile -t active_site_domains');
    expect(healthcheck).toContain('from site_connections where status =');
    expect(healthcheck).toContain('for domain in "${active_site_domains[@]}"');
    expect(healthcheck).toContain('Expected at least one active customer site.');
    expect(healthcheck).toContain('${#active_site_domains[@]} active customer site(s)');
  });

  it('waits for the recovered applications to pass health checks before backing them up', () => {
    const backup = read('infra/ovh/scripts/backup-database.sh');

    expect(backup).toContain('BACKUP_HEALTHCHECK_SCRIPT');
    expect(backup).toContain('wait_for_application_health');
    expect(backup).toContain('SOURCE_ROOT="${SOURCE_ROOT}" /usr/bin/bash "${BACKUP_HEALTHCHECK_SCRIPT}"');
    expect(backup).toContain('Application health checks did not recover after backup restart.');
    expect(backup).toContain('BACKUP_HEALTHCHECK_SCRIPT must be root-owned and not group- or world-writable.');
  });

  it('recovers application containers before deleting temporary backup files', () => {
    const backup = read('infra/ovh/scripts/backup-database.sh');
    const cleanup = backup.slice(backup.indexOf('cleanup() {'), backup.indexOf('trap cleanup EXIT'));

    expect(cleanup.indexOf('restart_application_containers')).toBeGreaterThan(-1);
    expect(cleanup.indexOf('rm -f "${dump}"')).toBeGreaterThan(cleanup.indexOf('restart_application_containers'));
    expect(cleanup.indexOf('rm -rf -- "${staging}"')).toBeGreaterThan(cleanup.indexOf('restart_application_containers'));
    expect(cleanup).toContain('if ! rm -f "${dump}"');
    expect(cleanup).toContain('if ! rm -rf -- "${staging}"');
  });

  it('excludes the configured Restic password file from every encrypted snapshot', () => {
    const backup = read('infra/ovh/scripts/backup-database.sh');

    expect(backup).toContain('--exclude "${RESTIC_PASSWORD_FILE}"');
    expect(backup).not.toContain('restic backup --exclude /opt/leon-platform/secrets/restic-password');
  });

  it('applies retention across changing dump and release paths', () => {
    const backup = read('infra/ovh/scripts/backup-database.sh');

    expect(backup).toContain('restic_with_fresh_session forget --group-by host');
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
    expect(installer).toContain('/opt/leon-platform/backup-secrets');
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

  it('shares the maintenance lock between root backups and deploy-user operations', () => {
    const installer = read('infra/ovh/scripts/install-systemd.sh');
    const tmpfiles = read('infra/ovh/tmpfiles/leon-platform.conf');
    const scripts = [
      read('infra/ovh/scripts/backup-database.sh'),
      read('infra/ovh/scripts/deploy.sh'),
      read('infra/ovh/scripts/migrate-database.sh'),
      read('infra/ovh/scripts/verify-backup-restore.sh'),
    ];

    expect(tmpfiles).toContain(
      'f /run/lock/leon-platform-maintenance.lock 0660 root docker -',
    );
    expect(installer).toContain('/etc/tmpfiles.d/leon-platform.conf');
    expect(installer).toContain('systemd-tmpfiles --create /etc/tmpfiles.d/leon-platform.conf');
    for (const script of scripts) {
      expect(script).toContain('/run/lock/leon-platform-maintenance.lock');
    }
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

  it('keeps selected media-library files while still sweeping abandoned uploads', () => {
    const schema = read('infra/ovh/postgres/schema.sql');
    const core = read('platform-core/src/index.ts');

    expect(schema).toContain('is_retained boolean not null default false');
    expect(schema).toContain('original_filename text');
    expect(schema).toContain('update workspace_uploads as upload');
    expect(schema).toContain('is_retained = true');
    expect(core).toContain("pending.${quote('is_retained')} = false");
  });

  it('prevents private admin and API responses from being cached', () => {
    const caddy = read('infra/ovh/Caddyfile');

    expect(caddy).toContain('header @private Cache-Control "private, no-store"');
    expect(caddy).toContain('Cross-Origin-Resource-Policy same-site');
    expect(caddy).toContain('X-Permitted-Cross-Domain-Policies none');
  });

  it('keeps deleted public media revocable through short revalidation', () => {
    const caddy = read('infra/ovh/Caddyfile');

    expect(caddy).toContain('header Cache-Control "public, max-age=300, must-revalidate"');
    expect(caddy).not.toContain('Cache-Control "public, max-age=31536000, immutable"');
  });

  it('permits the Cloudflare analytics beacon required on proxied sites', () => {
    const configs = [
      read('astro.config.mjs'),
      read('dashboard/astro.config.mjs'),
      read('photographer-site/astro.config.mjs'),
    ];

    for (const config of configs) {
      expect(config).toContain('https://static.cloudflareinsights.com');
      expect(config).toContain('connect-src');
      expect(config).toContain('https://cloudflareinsights.com');
    }
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

  it('passes resolved custom-domain settings into the deployment health gate', () => {
    const deploy = read('infra/ovh/scripts/deploy.sh');

    expect(deploy).toContain('COMPOSE_PROFILES="${compose_profiles}"');
    expect(deploy).toContain('CUSTOM_DOMAIN_AUTOMATION_ENABLED="${domain_api_enabled}"');
    expect(deploy).toContain('infra/ovh/scripts/healthcheck.sh');
  });

  it('configures a least-privilege runtime database login during every deployment', () => {
    const schema = read('infra/ovh/postgres/schema.sql');
    const configureRole = read('infra/ovh/scripts/configure-runtime-role.sh');
    const deploy = read('infra/ovh/scripts/deploy.sh');
    const dashboardEnv = read('infra/ovh/secrets/dashboard.env.example');
    const photographerEnv = read('infra/ovh/secrets/northline.env.example');
    const postgresEnv = read('infra/ovh/secrets/postgres.env.example');

    expect(schema).toContain('create role leon_runtime nologin nosuperuser nocreatedb nocreaterole noreplication');
    expect(schema).toContain('create role leon_photographer_runtime nologin nosuperuser nocreatedb nocreaterole noreplication');
    expect(schema).toContain('revoke create on schema public from public');
    expect(schema).toContain('grant select, insert, update, delete on all tables in schema public to leon_runtime');
    expect(schema).toContain('grant select on table client_workspaces, workspace_members, site_connections, site_domain_aliases to leon_photographer_runtime');
    expect(schema).toContain('grant select, insert, update, delete on table');
    expect(schema).toContain('studio_posts');
    expect(schema).toContain('to leon_photographer_runtime');
    expect(schema).toContain('revoke all privileges on table app_admins, subscriptions, checkout_attempts, website_projects, site_provisioning_runs, domain_jobs from leon_photographer_runtime');
    expect(configureRole).toContain('POSTGRES_DASHBOARD_PASSWORD must contain at least 32 characters.');
    expect(configureRole).toContain('POSTGRES_PHOTOGRAPHER_PASSWORD must contain at least 32 characters.');
    expect(configureRole).toContain('create role leon_dashboard login nosuperuser nocreatedb nocreaterole noreplication');
    expect(configureRole).toContain('create role leon_photographer login nosuperuser nocreatedb nocreaterole noreplication');
    expect(configureRole).toContain('grant leon_runtime to leon_dashboard');
    expect(configureRole).toContain('grant leon_photographer_runtime to leon_photographer');
    expect(configureRole).toContain('alter role leon_web nologin');
    expect(deploy).toContain('configure-runtime-role.sh');
    expect(deploy).toContain('DISABLE_LEGACY_RUNTIME_ROLE=true');
    expect(dashboardEnv).toMatch(/^DATABASE_URL=postgresql:\/\/leon_dashboard:/m);
    expect(photographerEnv).toMatch(/^DATABASE_URL=postgresql:\/\/leon_photographer:/m);
    expect(dashboardEnv).not.toMatch(/^POSTGRES_PASSWORD=/m);
    expect(photographerEnv).not.toMatch(/^POSTGRES_PASSWORD=/m);
    expect(postgresEnv).toMatch(/^POSTGRES_PASSWORD=/m);
    expect(postgresEnv).toMatch(/^POSTGRES_DASHBOARD_PASSWORD=/m);
    expect(postgresEnv).toMatch(/^POSTGRES_PHOTOGRAPHER_PASSWORD=/m);
    expect(postgresEnv).not.toMatch(/^POSTGRES_RUNTIME_PASSWORD=/m);
  });

  it('loads production secrets from a stable root and syncs only an explicit allowlist', () => {
    const compose = read('infra/ovh/docker-compose.yml');
    const deploy = read('infra/ovh/scripts/deploy.sh');
    const preflight = read('infra/ovh/scripts/preflight-runtime-secrets.sh');
    const sync = read('infra/ovh/scripts/sync-secrets.sh');
    const envExample = read('infra/ovh/.env.example');

    for (const file of ['postgres.env', 'dashboard.env', 'northline.env', 'domain-worker.env']) {
      expect(compose).toContain(`\${SECRETS_ROOT:-./secrets}/${file}`);
    }
    expect(envExample).toMatch(/^SECRETS_ROOT=\/opt\/leon-platform\/secrets$/m);
    expect(envExample).toMatch(/^CLOUDFLARE_TUNNEL_TOKEN_FILE=\/opt\/leon-platform\/secrets\/cloudflare-tunnel-token$/m);
    expect(deploy).toContain('SECRETS_ROOT=${SECRETS_ROOT:-${PLATFORM_ROOT}/secrets}');
    expect(deploy).toContain('COMPOSE_ENV_FILE=${COMPOSE_ENV_FILE:-${SECRETS_ROOT}/.env}');
    expect(deploy).toContain('CLOUDFLARE_TUNNEL_TOKEN_FILE=${SECRETS_ROOT}/cloudflare-tunnel-token');
    expect(deploy).toContain('preflight-runtime-secrets.sh');
    expect(deploy).toContain('--env-file "${COMPOSE_ENV_FILE}"');
    expect(preflight).toContain('must be a regular, non-symlink file');
    expect(preflight).toContain('must have mode 600');
    expect(preflight).toContain('must belong to the deployment user');
    expect(sync).toContain('required_names=(.env postgres.env dashboard.env northline.env cloudflare-tunnel-token)');
    expect(sync).toContain('optional_names=(domain-worker.env)');
    expect(sync).toContain('StrictHostKeyChecking=yes');
    expect(sync).toContain('install -m 600');
    expect(sync).toContain('mv --');
    expect(sync).not.toContain('set -x');
  });

  it('reserves aggregate media capacity atomically before provisioning a customer', () => {
    const provisioning = read('platform-core/src/provisioning.ts');
    const dashboardEnv = read('infra/ovh/secrets/dashboard.env.example');
    const readme = read('infra/ovh/README.md');

    expect(provisioning).toContain('capacity_limit_bytes?: number');
    expect(provisioning).toContain('pg_advisory_xact_lock');
    expect(provisioning).toContain('coalesce(sum("quota_bytes"), 0)::bigint as reserved_bytes');
    expect(provisioning).toContain('capacity.reserved_bytes + $13::bigint <= $14::bigint');
    expect(provisioning).toContain('Omitting the platform ceiling fails closed');
    expect(dashboardEnv).toMatch(/^PLATFORM_PROVISIONABLE_STORAGE_BYTES=\d+$/m);
    expect(readme).toContain('PLATFORM_PROVISIONABLE_STORAGE_BYTES');
    expect(readme).toContain('provisioning rejects requests that would exceed it');
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

  it('documents pool, capacity, runtime-role, and offsite-backup boundaries for operators', () => {
    const readme = read('infra/ovh/README.md');
    const dashboardEnv = read('infra/ovh/secrets/dashboard.env.example');
    const photographerEnv = read('infra/ovh/secrets/northline.env.example');
    const backupEnv = read('infra/ovh/secrets/backup.env.example');

    expect(readme).toContain('/opt/leon-platform/current');
    expect(readme).toContain('DATABASE_POOL_MAX');
    expect(dashboardEnv).toContain('DATABASE_POOL_MAX=4');
    expect(photographerEnv).toContain('DATABASE_POOL_MAX=4');
    expect(dashboardEnv).toContain('PLATFORM_PROVISIONABLE_STORAGE_BYTES=');
    expect(readme).toContain('single shared photographer runtime');
    expect(readme).toContain('web containers must never use the database administrator login');
    expect(readme).toContain('Production requires an offsite repository');
    expect(readme).toContain('it is not an independent backup because it shares the VPS disk');
    expect(backupEnv).toMatch(/^RESTIC_REPOSITORY=rclone:/m);
    expect(backupEnv).toContain('ALLOW_LOCAL_BACKUP=false');
  });
});
