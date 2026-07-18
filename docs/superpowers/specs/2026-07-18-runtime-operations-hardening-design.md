# Runtime And Operations Hardening Design

**Status:** Approved through the owner's blanket authorization to fix the audited issues.

## Purpose

Reduce the blast radius of a web-process compromise, make media deletion take effect promptly, remove release-to-release secret drift, and require an independent encrypted backup before live billing is enabled.

## Database Roles

The dashboard and photographer runtime will no longer share `leon_web`.

- `leon_dashboard` inherits the existing broad `leon_runtime` group because the private dashboard owns platform provisioning and administration.
- `leon_photographer` receives explicit privileges only on the tables and sequences used by hostname resolution, managed studio content, inquiries, uploads, Stripe Connect accounts, invoices, content requests, and the Stripe event ledger.
- `leon_domain_worker` keeps its existing two-table grant.

The photographer role receives no access to app administrators, checkout attempts, subscriptions, website projects, provisioning runs, or domain jobs. The schema owns reusable group grants; the deployment script creates or rotates login roles from separate passwords. Integration tests connect as each login and prove both required operations and denied operations.

## Secret Deployment

Production secret files live under `/opt/leon-platform/secrets`, outside immutable release archives. Compose uses a configurable `SECRETS_ROOT`, defaulting to the repository's local `infra/ovh/secrets` directory for development and set to `/opt/leon-platform/secrets` in production.

A deployment preflight validates that required secret files are regular files, are not symlinks, are owned by the deploying user or root as appropriate, and have no group/other permissions. A separate sync command copies explicitly named local secret files over SSH using temporary mode-600 files and atomic renames. It never prints secret values. The application deployment does not silently overwrite secrets.

## Media Deletion

Public media responses use `Cache-Control: public, max-age=300, must-revalidate` instead of a one-year immutable lifetime. A deployment cache purge removes already-cached media objects when credentials permit; the five-minute browser bound remains the guaranteed fallback.

Deletion keeps the existing database reference check before unlinking. Filesystem failures other than `ENOENT` and storage-accounting failures remain visible to the caller. Orphan cleanup reports database release failures to logs instead of silently treating them as success.

## Off-Site Backups

Production backups require a remote Restic repository. Local paths are rejected unless `ALLOW_LOCAL_BACKUP=true` is explicitly set for a one-off development recovery exercise. The production target is OVH S3-compatible Object Storage in the same region family but outside the VPS disk.

The bucket credentials remain root-only in `/opt/leon-platform/secrets/backup.env`. The nightly job backs up PostgreSQL, uploads, current release configuration, and stable secrets while excluding the Restic password file. Completion requires all of the following:

- a successful remote snapshot;
- `restic check` against the remote repository;
- a restore into a disposable directory;
- a successful `pg_restore --list` for the restored database dump;
- a byte comparison for at least one restored upload when uploads exist.

OVH's VPS snapshot and automated-backup features remain defense in depth, not a replacement for the remote Restic repository.

## Verification And Rollback

Database grants are validated in a disposable PostgreSQL instance and again on production after migration. Deployment takes a backup first, keeps the current release symlink available for rollback, and health-checks every active site. The live Stripe cutover is blocked until the remote backup and restore drill pass.

