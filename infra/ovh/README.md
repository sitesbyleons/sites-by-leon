# Sites By Leon — OVH platform

This stack hosts the Sites By Leon marketing site, client/admin dashboard, photographer example site, PostgreSQL database, Stripe endpoints, and uploaded images on the OVH VPS.

## Public routing

- `leonsites.org` and `www.leonsites.org`: Coming Soon page plus sign-in/dashboard routes.
- `leonsites.org/admin`: private administration area behind Clerk authentication.
- `test.leonsites.org`: full Sites By Leon marketing test site.
- `demo.leonsites.org`: Northline sports photographer site and photographer admin.
- Each additional published photographer hostname: the same tenant-aware photographer runtime, isolated by workspace.
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
5. Keep `infra/ovh/secrets/domain-worker.env.example` as a reference until custom-domain automation is activated.
6. Put the Cloudflare Tunnel token only in `infra/ovh/secrets/cloudflare-tunnel-token`.
7. Copy `infra/ovh/secrets/backup.env.example` to `/opt/leon-platform/secrets/backup.env`.
8. Generate `/opt/leon-platform/secrets/restic-password` with `openssl rand -base64 48` and keep an offline copy.

Set every secret file to mode `600`. The backup installer also refuses to source `backup.env` or read the Restic password unless each is a regular, root-owned file with no group or world permissions. `POSTGRES_PASSWORD` is the migration/backup credential and stays only in `postgres.env`. Put the separate `POSTGRES_RUNTIME_PASSWORD` into the `leon_web` database URLs in `dashboard.env` and `northline.env`; web containers must never use the database administrator login. The `northline.env` filename is retained for deployment compatibility, but it now configures the single shared photographer runtime rather than one Northline-only container.
Generate `CONTACT_HASH_SALT` independently with `openssl rand -hex 32`; it is required for privacy-preserving inquiry rate limits.
Each application uses at most four PostgreSQL connections by default. Set `DATABASE_POOL_MAX` to a value from 1 through 20 only when capacity planning shows that a different limit is safe. Set `PLATFORM_PROVISIONABLE_STORAGE_BYTES` in the dashboard environment to the amount of the media disk that customer quotas may reserve; provisioning rejects requests that would exceed it. Keep operating-system, database, deployment, backup staging, and free-space headroom outside that number.

## Adding a customer

1. The photographer creates their Clerk account.
2. Leon opens `/admin/sites/new`, chooses that account, and creates the customer site. Workspace, owner access, project, starter content, quota, and hostname records are committed atomically and start in maintenance.
3. Publish the requested hostname in Cloudflare Tunnel/DNS. Leon Sites subdomains may use one wildcard route; custom domains require their own DNS onboarding.
4. Review the public site and private editor at the addresses shown by the admin.
5. Change the site to Active only after DNS, sign-in, upload, inquiry, and mobile checks pass.

For the repeatable authenticated content and billing-guard check, follow the **Repeatable authenticated CRUD smoke test** in `docs/operations/client-provisioning.md`. It uses an existing private Clerk cookie jar or short-lived bearer-header file, refuses to run against a Stripe-enabled studio, and removes its temporary customer records on exit.

Do not expose the Docker socket, SSH credentials, Cloudflare token, GitHub token, or database administrator password to either web application. Domain and repository automation belongs in a restricted host-side worker, not a browser request.

## Activating custom client domains

The normal deployment keeps custom-domain automation off. To activate it safely:

1. Enable Cloudflare for SaaS for `leonsites.org` and confirm `customers.leonsites.org` is the Active fallback origin.
2. Create a zone-scoped Cloudflare API token for `leonsites.org` with **SSL and Certificates: Edit**.
3. Copy `secrets/domain-worker.env.example` to `secrets/domain-worker.env`. Put the token and zone ID there. Generate a separate 32+ character database password, use it in that file's `DATABASE_URL`, and put the same password in `POSTGRES_DOMAIN_WORKER_PASSWORD` inside `secrets/postgres.env`.
4. Set `CUSTOM_DOMAIN_AUTOMATION_ENABLED=true` and add `domains` to `COMPOSE_PROFILES` in `.env` (for example `COMPOSE_PROFILES=tunnel,domains`). These settings must change together; deployment refuses a mismatched state.
5. Deploy, confirm the domain worker is healthy, then connect one test hostname from `/admin/sites` before onboarding a client domain.

For Namecheap, add the client's `www` CNAME to `customers.leonsites.org`, then add an unmasked permanent redirect from `@` to the `https://www...` address. Do not remove or replace MX/TXT email records.

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

Validate an upcoming schema against a disposable copy of the current production database:

```bash
SOURCE_ROOT=/path/to/release infra/ovh/scripts/validate-migration.sh
```

```bash
SOURCE_ROOT=/opt/leon-platform/current infra/ovh/scripts/deploy.sh
```

Then run:

```bash
infra/ovh/scripts/healthcheck.sh
```

Configure Stripe webhook destinations as:

- `https://leonsites.org/api/webhooks/stripe`
- `https://demo.leonsites.org/api/webhooks/stripe-connect` for invoice and payment events
- `https://demo.leonsites.org/api/webhooks/stripe-connect-v2` for connected-account status events

## Backups

`backup-database.sh` encrypts the PostgreSQL dump, application configuration, and uploaded images with restic. Keep the restic password offline as well as on the host. Install the nightly timer with:

Until an OVH Object Storage bucket is configured, `RESTIC_REPOSITORY=/opt/leon-platform/backups/restic` provides an encrypted local repository for initial testing. It is not an independent backup because it shares the VPS disk. Move to the S3 repository in `backup.env.example` before storing production client media.

The backup makes a short-lived consistent copy of uploads before Restic reads them. It refuses to start unless the staging filesystem has the upload size plus 10 GiB free; a local Restic repository on the same filesystem requires twice the upload size plus 10 GiB. `BACKUP_STAGING_ROOT` must be a dedicated directory ending in `/staging-current` and cannot overlap the application, uploads, backup repository, or source release. Mount `/opt/leon-platform-backup-staging` on separate storage to avoid consuming the live disk. Before approaching 40 GiB of client uploads, use both separate staging storage and OVH Object Storage (or another S3-compatible offsite repository).

The installer copies the recurring backup and health-check programs into root-owned `/usr/local/libexec/leon-platform`; systemd never executes a script from a writable release directory. The backup stops only the two write-serving application containers, starts them again after the snapshot is consistent, and requires the full public and PostgreSQL health check to recover before it writes a Restic snapshot. `RESTIC_PASSWORD_FILE` is always excluded using the configured path rather than a hard-coded filename.

```bash
sudo SOURCE_ROOT=/opt/leon-platform/current infra/ovh/scripts/install-systemd.sh
```

Do not delete the old Vercel or managed database projects until the OVH deployment has passed the full cutover checklist and the rollback window has ended.
