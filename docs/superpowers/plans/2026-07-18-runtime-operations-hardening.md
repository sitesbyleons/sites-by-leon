# Runtime And Operations Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split database privileges, remove secret drift, bound deleted-media caching, and establish a verified off-site Restic backup.

**Architecture:** Keep immutable release archives free of secrets, create separate PostgreSQL login groups for dashboard and photographer workloads, and block live cutover unless the remote backup passes a restore drill.

**Tech Stack:** PostgreSQL 17, Bash, Docker Compose, Caddy, Restic, OVH S3-compatible Object Storage, Vitest.

## Global Constraints

- Runtime secret values are never printed or committed.
- Photographer credentials cannot access platform administration, subscription, provisioning, or domain-job tables.
- Production Restic repositories must be remote.
- Deleted media must require revalidation within 300 seconds.

---

### Task 1: Split PostgreSQL Runtime Roles

**Files:**
- Modify: `infra/ovh/postgres/schema.sql`
- Modify: `infra/ovh/scripts/configure-runtime-role.sh`
- Modify: `infra/ovh/secrets/postgres.env.example`
- Modify: `infra/ovh/secrets/dashboard.env.example`
- Modify: `infra/ovh/secrets/northline.env.example`
- Modify: `tests/infrastructure-reliability.test.ts`
- Create: `tests/runtime-roles-postgres.integration.test.ts`

**Interfaces:**
- Produces: `leon_dashboard` login inheriting `leon_runtime`.
- Produces: `leon_photographer` login inheriting `leon_photographer_runtime`.

- [ ] **Step 1: Write failing grant and denial tests**

```ts
await expect(photographer`select * from studio_posts limit 1`).resolves.toBeDefined();
await expect(photographer`select * from subscriptions limit 1`).rejects.toThrow(/permission denied/i);
await expect(photographer`delete from app_admins`).rejects.toThrow(/permission denied/i);
```

- [ ] **Step 2: Verify RED**

Run: `TEST_DATABASE_URL=... pnpm test -- tests/runtime-roles-postgres.integration.test.ts tests/infrastructure-reliability.test.ts`

- [ ] **Step 3: Define explicit photographer grants and separate logins**

Create `leon_photographer_runtime NOLOGIN`, revoke inherited/public access, grant schema usage, explicit CRUD on the studio/connect/upload/event tables, read-only access to workspace/site-resolution tables, and required sequence usage. Create/rotate `leon_dashboard` and `leon_photographer` with independent 32-character passwords.

- [ ] **Step 4: Run integration tests and commit**

Run: `pnpm test -- tests/runtime-roles-postgres.integration.test.ts tests/infrastructure-reliability.test.ts`

```bash
git add infra/ovh/postgres/schema.sql infra/ovh/scripts/configure-runtime-role.sh infra/ovh/secrets tests
git commit -m "security: split application database roles"
```

### Task 2: Stable Secret Root And Atomic Sync

**Files:**
- Modify: `infra/ovh/docker-compose.yml`
- Modify: `infra/ovh/.env.example`
- Modify: `infra/ovh/scripts/deploy.sh`
- Create: `infra/ovh/scripts/sync-secrets.sh`
- Create: `infra/ovh/tests/sync-secrets.test.sh`
- Modify: `tests/infrastructure-reliability.test.ts`
- Modify: `infra/ovh/README.md`

**Interfaces:**
- Produces: `SECRETS_ROOT`, default `./secrets`, production `/opt/leon-platform/secrets`.
- Produces: `sync-secrets.sh <host> <identity-file>` with an explicit allowlist.

- [ ] **Step 1: Write failing Compose, preflight, and sync tests**

Assert Compose interpolates `${SECRETS_ROOT:-./secrets}`, deployment rejects missing/symlink/permissive files, and sync uses `install -m 600` plus atomic rename without `set -x` or value output.

- [ ] **Step 2: Verify RED**

Run: `bash infra/ovh/tests/sync-secrets.test.sh && pnpm test -- tests/infrastructure-reliability.test.ts`

- [ ] **Step 3: Implement stable paths and atomic sync**

The sync allowlist is `.env`, `postgres.env`, `dashboard.env`, `northline.env`, optional `domain-worker.env`, and the tunnel token. Copy to a temporary remote directory, validate modes, then install atomically into `/opt/leon-platform/secrets`.

- [ ] **Step 4: Run tests and commit**

```bash
bash infra/ovh/tests/sync-secrets.test.sh
pnpm test -- tests/infrastructure-reliability.test.ts
git add infra/ovh/docker-compose.yml infra/ovh/.env.example infra/ovh/scripts infra/ovh/tests infra/ovh/README.md tests/infrastructure-reliability.test.ts
git commit -m "ops: deploy secrets outside releases"
```

### Task 3: Revocable Media Cache And Cleanup Reporting

**Files:**
- Modify: `infra/ovh/Caddyfile`
- Modify: `photographer-site/src/lib/upload-cleanup.ts`
- Modify: `photographer-site/tests/resource-mutations.test.ts`
- Modify: `tests/infrastructure-reliability.test.ts`

**Interfaces:**
- Produces: `Cache-Control: public, max-age=300, must-revalidate` for `/media/*`.

- [ ] **Step 1: Write failing cache and cleanup tests**

```ts
expect(caddy).toContain('public, max-age=300, must-revalidate');
expect(caddy).not.toContain('max-age=31536000, immutable');
expect(cleanup).toContain('console.error');
```

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- tests/infrastructure-reliability.test.ts && pnpm --dir photographer-site test -- tests/resource-mutations.test.ts`

- [ ] **Step 3: Change cache policy and surface cleanup failures**

Keep direct delete failures user-visible. In background orphan cleanup, log unlink and quota-release failures with workspace/path identifiers and continue processing other files.

- [ ] **Step 4: Run tests and commit**

```bash
pnpm test -- tests/infrastructure-reliability.test.ts
pnpm --dir photographer-site test -- tests/resource-mutations.test.ts
git add infra/ovh/Caddyfile photographer-site/src/lib/upload-cleanup.ts photographer-site/tests tests
git commit -m "security: bound media cache lifetime"
```

### Task 4: Mandatory Remote Backup And Restore Drill

**Files:**
- Modify: `infra/ovh/scripts/backup-database.sh`
- Create: `infra/ovh/scripts/verify-backup-restore.sh`
- Modify: `infra/ovh/scripts/install-systemd.sh`
- Modify: `infra/ovh/secrets/backup.env.example`
- Modify: `infra/ovh/README.md`
- Modify: `tests/infrastructure-reliability.test.ts`

**Interfaces:**
- Consumes: remote `RESTIC_REPOSITORY` and root-only credentials.
- Produces: restore-drill exit status with no restored secret values printed.

- [ ] **Step 1: Replace the local-backup acceptance test with a failing remote-only test**

Assert local repositories are rejected unless `ALLOW_LOCAL_BACKUP=true`, and the production example is S3.

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- tests/infrastructure-reliability.test.ts`

- [ ] **Step 3: Enforce remote repositories and implement the drill**

```bash
case "${RESTIC_REPOSITORY}" in
  s3:*|b2:*|azure:*|gs:*|sftp:*|rest:*) ;;
  *) [[ ${ALLOW_LOCAL_BACKUP:-false} == true ]] || exit 1 ;;
esac
```

The drill runs `restic check`, restores the latest snapshot into a mode-700 temporary directory, validates the dump with `pg_restore --list`, compares one upload if available, then removes the directory through a trap.

- [ ] **Step 4: Run tests and commit**

```bash
pnpm test -- tests/infrastructure-reliability.test.ts
git add infra/ovh/scripts infra/ovh/secrets/backup.env.example infra/ovh/README.md tests/infrastructure-reliability.test.ts
git commit -m "ops: require verified offsite backups"
```

### Task 5: Provision And Verify Production Operations

**Files:**
- Runtime-only: `/opt/leon-platform/secrets/*`
- Runtime-only: OVH Object Storage bucket and access key

**Interfaces:**
- Consumes: owner-approved OVH and SSH access.
- Produces: passing production grant checks, remote backup snapshot, and restore drill.

- [ ] **Step 1: Create the private OVH object-storage bucket and scoped credentials**

Enable server-side bucket protections available for the selected OVH service. Store credentials only in root-owned `backup.env`.

- [ ] **Step 2: Sync stable application secrets and migrate role URLs**

Use `sync-secrets.sh`; do not display values. Set dashboard and photographer URLs to their separate login roles.

- [ ] **Step 3: Take and verify the remote backup**

Run the installed backup service, `restic snapshots`, and `verify-backup-restore.sh`. Record only snapshot ID, time, and verification status.

- [ ] **Step 4: Deploy and verify grants**

Run deployment, health checks, positive photographer table access, and negative subscription/admin-table access.

### Task 6: Full Operations Gate

- [ ] **Step 1: Run local tests**

Run: `pnpm test && pnpm --dir dashboard test && pnpm --dir photographer-site test && pnpm --dir domain-worker test`

- [ ] **Step 2: Run schema and infrastructure checks**

Run: `bash infra/ovh/tests/preflight-domain-worker.test.sh && bash infra/ovh/tests/healthcheck-domain-worker.test.sh && bash infra/ovh/tests/sync-secrets.test.sh`

- [ ] **Step 3: Commit any verification documentation**

```bash
git add docs infra/ovh/README.md
git commit -m "docs: record operations hardening verification"
```

