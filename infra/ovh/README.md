# Sites By Leon — OVH platform

This stack hosts the Sites By Leon marketing site, client/admin dashboard, photographer example site, PostgreSQL database, Stripe endpoints, and uploaded images on the OVH VPS.

## Public routing

- `leonsites.org` and `www.leonsites.org`: Coming Soon page plus sign-in/dashboard routes.
- `leonsites.org/admin`: private administration area behind Clerk authentication.
- `test.leonsites.org`: full Sites By Leon marketing test site.
- `demo.leonsites.org`: Northline sports photographer site and photographer admin.
- `api.leonsites.org/media/*`: uploaded images.

Cloudflare Tunnel is the only public ingress. Caddy listens inside Docker, PostgreSQL stays on the private Docker network, and no database port is published.

Clerk remains the identity provider, Stripe remains the payment processor, GitHub remains the private code source, and uploaded images live in `/opt/leon-platform/uploads`.

## One-time host setup

```bash
sudo SOURCE_ROOT=/opt/leon-platform/current infra/ovh/scripts/bootstrap-ubuntu.sh
```

The firewall should allow the verified SSH port only. Cloudflare Tunnel connects outbound, so ports 80, 443, and 5432 do not need to be opened.

## Secrets

Copy these ignored examples and replace every placeholder:

1. `infra/ovh/.env.example` to `infra/ovh/.env`.
2. `infra/ovh/secrets/postgres.env.example` to `infra/ovh/secrets/postgres.env`.
3. `infra/ovh/secrets/dashboard.env.example` to `infra/ovh/secrets/dashboard.env`.
4. `infra/ovh/secrets/northline.env.example` to `infra/ovh/secrets/northline.env`.
5. Put the Cloudflare Tunnel token only in `infra/ovh/secrets/cloudflare-tunnel-token`.
6. Copy `infra/ovh/secrets/backup.env.example` to `/opt/leon-platform/secrets/backup.env`.
7. Generate `/opt/leon-platform/secrets/restic-password` with `openssl rand -base64 48` and keep an offline copy.

Set every secret file to mode `600`. The backup installer also refuses to source `backup.env` or read the Restic password unless each is a regular, root-owned file with no group or world permissions. Use the same internal PostgreSQL password in `postgres.env`, `dashboard.env`, and `northline.env`.
Generate `CONTACT_HASH_SALT` independently with `openssl rand -hex 32`; it is required for privacy-preserving inquiry rate limits.
Each application uses at most four PostgreSQL connections by default. Set `DATABASE_POOL_MAX` to a value from 1 through 20 only when capacity planning shows that a different limit is safe.

## Import existing records

The managed export is rendered into parent-first PostgreSQL statements by:

```bash
node infra/ovh/scripts/import-managed-json.mjs migration-artifacts/managed-export.json > migration-artifacts/managed-import.sql
```

After the database container is healthy:

```bash
docker compose exec -T database psql -U leon_app -d leon_platform < migration-artifacts/managed-import.sql
```

The current managed project has no stored image objects, so there are no image bytes to copy. New uploads are written directly to `/opt/leon-platform/uploads`.

## Deploy

```bash
SOURCE_ROOT=/opt/leon-platform/current infra/ovh/scripts/deploy.sh
```

Then run:

```bash
infra/ovh/scripts/healthcheck.sh
```

Configure Stripe webhook destinations as:

- `https://leonsites.org/api/webhooks/stripe`
- `https://demo.leonsites.org/api/webhooks/stripe-connect`

## Backups

`backup-database.sh` encrypts the PostgreSQL dump, application configuration, and uploaded images with restic. Keep the restic password offline as well as on the host. Install the nightly timer with:

Until an OVH Object Storage bucket is configured, `RESTIC_REPOSITORY=/opt/leon-platform/backups/restic` provides an encrypted local repository for initial testing. It is not an independent backup because it shares the VPS disk. Move to the S3 repository in `backup.env.example` before storing production client media.

The backup makes a short-lived consistent copy of uploads before Restic reads them. It refuses to start unless the staging filesystem has the upload size plus 10 GiB free; a local Restic repository on the same filesystem requires twice the upload size plus 10 GiB. `BACKUP_STAGING_ROOT` must be a dedicated directory ending in `/staging-current` and cannot overlap the application, uploads, backup repository, or source release. Mount `/opt/leon-platform-backup-staging` on separate storage to avoid consuming the live disk. Before approaching 40 GiB of client uploads, use both separate staging storage and OVH Object Storage (or another S3-compatible offsite repository).

The installer copies the recurring backup and health-check programs into root-owned `/usr/local/libexec/leon-platform`; systemd never executes a script from a writable release directory. The backup stops only the two write-serving application containers, starts them again after the snapshot is consistent, and requires the full public and PostgreSQL health check to recover before it writes a Restic snapshot. `RESTIC_PASSWORD_FILE` is always excluded using the configured path rather than a hard-coded filename.

```bash
sudo SOURCE_ROOT=/opt/leon-platform/current infra/ovh/scripts/install-systemd.sh
```

Do not delete the old Vercel or managed database projects until the OVH deployment has passed the full cutover checklist and the rollback window has ended.
