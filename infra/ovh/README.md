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
7. Create the root-only directory `/opt/leon-platform/backup-secrets` with mode `700`, then copy `infra/ovh/secrets/backup.env.example` to `/opt/leon-platform/backup-secrets/backup.env`.
8. Generate `/opt/leon-platform/backup-secrets/restic-password` with `openssl rand -base64 48` and keep an offline copy.

Set every secret file to mode `600`. Keep backup credentials in the separate root-owned `/opt/leon-platform/backup-secrets` directory with mode `700`; the deploy-user-owned runtime secret directory must never contain them. The backup installer refuses to source `backup.env` or read the Restic password unless both the file and its parent directory are root-owned with no group or world permissions. `POSTGRES_PASSWORD` is the migration/backup credential and stays only in `postgres.env`. Use different `POSTGRES_DASHBOARD_PASSWORD` and `POSTGRES_PHOTOGRAPHER_PASSWORD` values in the matching `leon_dashboard` and `leon_photographer` database URLs; web containers must never use the database administrator login. The `northline.env` filename is retained for deployment compatibility, but it now configures the single shared photographer runtime rather than one Northline-only container.

Production runtime secrets live in `/opt/leon-platform/secrets`, outside release archives. Synchronize the explicit owner-only allowlist before a deployment:

```bash
infra/ovh/scripts/sync-secrets.sh ubuntu@vps-aa71e2f6.vps.ovh.us ~/.ssh/leonsites_ovh
```

Staging runtime secrets live separately in `/opt/leon-platform/secrets-test`. Synchronize them with the staging allowlist:

```bash
SECRETS_PROFILE=staging \
LOCAL_SECRETS_ROOT=infra/ovh/secrets-test \
REMOTE_SECRETS_ROOT=/opt/leon-platform/secrets-test \
infra/ovh/scripts/sync-secrets.sh ubuntu@vps-aa71e2f6.vps.ovh.us ~/.ssh/leonsites_ovh
```

The sync command validates local ownership and mode `600`, uses the pinned host key, stages files under a private temporary directory, and atomically renames mode-`600` files into the stable root. It never copies `backup.env` or prints secret values.
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
3. Copy `secrets/domain-worker.env.example` to `secrets/domain-worker.env`. Put the token and zone ID there. Generate a separate URL-safe database password with `openssl rand -hex 32`, use it in that file's `DATABASE_URL`, and put the exact same password in `POSTGRES_DOMAIN_WORKER_PASSWORD` inside `secrets/postgres.env`.
4. Set `CUSTOM_DOMAIN_AUTOMATION_ENABLED=true` and add `domains` to `COMPOSE_PROFILES` in `.env` (for example `COMPOSE_PROFILES=tunnel,domains`). These settings must change together; deployment refuses a mismatched state.
5. Set both secret files to mode `600`. Deployment runs `scripts/preflight-domain-worker.sh` before it creates or changes Docker resources and refuses missing, duplicate, placeholder, malformed, insecure, short, or mismatched worker credentials.
6. Deploy, confirm the domain worker is healthy, then connect one test hostname from `/admin/sites` before onboarding a client domain.

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

Run the non-mutating custom-domain deployment regression tests on a Linux host:

```bash
bash infra/ovh/tests/preflight-domain-worker.test.sh
```

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

## Staging and promotion

`test.leonsites.org` runs the same dashboard and marketing source as production but uses its own Docker project, PostgreSQL volume, database login, environment files, Stripe test products, test webhook, and Billing Portal configuration. Its active release is `/opt/leon-platform/current-test`; production remains `/opt/leon-platform/current`. Authentication currently uses the shared Clerk development instance, so test users must still be treated as real identities even though application and payment data are isolated.

After uploading an immutable 40-character release directory, activate it only in staging:

```bash
/opt/leon-platform/releases/<sha>/infra/ovh/scripts/activate-test-release.sh <sha>
TEST_EXTERNAL_URL=https://test.leonsites.org \
  /opt/leon-platform/current-test/infra/ovh/scripts/healthcheck-test.sh
```

The activation command holds the platform maintenance lock and restores the previous staging release automatically if deployment or health checks fail. Test sign-in, assigned-plan checkout with a Stripe test card, webhook persistence, Billing Portal, and cancellation before promotion. Confirm production data did not change.

Promote the exact currently active staging SHA; the command rejects any other release and rolls production back automatically on failure:

```bash
/opt/leon-platform/current-test/infra/ovh/scripts/promote-tested-release.sh <sha>
/opt/leon-platform/current/infra/ovh/scripts/healthcheck.sh
```

Never copy staging database rows or `secrets-test` files into production. Rotate staging credentials independently. See `docs/operations/staging-release-workflow.md` for the acceptance and rollback checklist.

## Public launch switch

Keep `PUBLIC_SITE_MODE=coming-soon` in `/opt/leon-platform/secrets/.env` until the approved launch window. The release switch validates the private environment file, takes the platform maintenance lock, updates the mode atomically, deploys, and restores the previous mode if deployment fails.

Launch the full marketing site:

```bash
/opt/leon-platform/current/infra/ovh/scripts/switch-public-site-mode.sh live
/opt/leon-platform/current/infra/ovh/scripts/healthcheck.sh
curl --fail --silent --show-error --location https://leonsites.org/ >/dev/null
```

Return the homepage to the coming-soon experience:

```bash
/opt/leon-platform/current/infra/ovh/scripts/switch-public-site-mode.sh coming-soon
/opt/leon-platform/current/infra/ovh/scripts/healthcheck.sh
curl --fail --silent --show-error --location https://leonsites.org/ >/dev/null
```

Do not edit `PUBLIC_SITE_MODE` manually during a launch or rollback. The switch script preserves file ownership and mode `0600`, serializes against deployments and backups, and redeploys the prior mode automatically after a failed change.

Configure Stripe webhook destinations as:

- `https://leonsites.org/api/webhooks/stripe`
- `https://demo.leonsites.org/api/webhooks/stripe-connect` for invoice and payment events
- `https://demo.leonsites.org/api/webhooks/stripe-connect-v2` for connected-account status events

Verify account mode, prices, Billing Portal features, event origin, and event coverage without printing credentials:

```bash
STRIPE_EXPECTED_MODE=test node --env-file=infra/ovh/secrets/dashboard.env infra/ovh/scripts/verify-stripe-config.mjs platform
STRIPE_EXPECTED_MODE=test node --env-file=infra/ovh/secrets/northline.env infra/ovh/scripts/verify-stripe-config.mjs connect
```

Use `STRIPE_EXPECTED_MODE=live` only with the live owner-only environment files. Depending on the Stripe API generation, connected-account origins are reported as `@accounts` or `other_accounts`, while platform origins are reported as `@self` or `self`.

Create a missing Billing Portal configuration or safely replace a Connect destination with the wrong immutable event origin:

```bash
STRIPE_EXPECTED_MODE=test infra/ovh/scripts/configure-stripe-resources.mjs platform infra/ovh/secrets/dashboard.env
STRIPE_EXPECTED_MODE=test infra/ovh/scripts/configure-stripe-resources.mjs connect infra/ovh/secrets/northline.env
```

Before configuring live Connect destinations, register the Stripe account as a platform, add its business details, and complete the platform profile in the Stripe Dashboard. Without that account-side activation, Stripe normalizes connected-account destination requests to account-only destinations and the command rolls them back. The command refuses non-regular files, files not owned by the current user, and permissions other than `600`. A replacement Connect signing secret is written with an atomic rename before the old destination is disabled. Run the verifier immediately afterward.

## Backups

`backup-database.sh` encrypts the PostgreSQL dump, application configuration, and uploaded images with Restic. Keep the Restic password offline as well as on the host. Production requires an offsite repository. The example uses a private Supabase Storage bucket through Restic's supported rclone backend because Supabase's S3 endpoint includes a path prefix. A local repository is rejected unless `ALLOW_LOCAL_BACKUP=true` is explicitly set for a one-off recovery exercise; it is not an independent backup because it shares the VPS disk.

Create a dedicated Supabase Auth identity whose signed `app_metadata.backup_bucket` claim is `leon-sites-backups`. Grant that identity `SELECT`, `INSERT`, `UPDATE`, and `DELETE` only on objects in the private `leon-sites-backups` bucket. Grant bucket `SELECT` and private same-name `INSERT` only so rclone can perform its idempotent bucket bootstrap; do not grant bucket update or delete. Put the identity password and the project's legacy anon key only in root-owned `backup.env`. The installed token helper builds the password body from its environment so the password never enters a child process command line. It requires the Auth URL, S3 endpoint, and S3 access-key project reference to identify the same Supabase project before it exports a session token. The session token itself is never persisted.

Supabase sessions expire after one hour. Each Restic command gets a fresh session and is capped at 3,000 seconds, leaving a five-minute safety margin. Restic safely leaves interrupted data unreferenced, but a backup that reaches this limit has failed and requires either reducing the protected dataset or moving to a durable offsite credential before re-enabling the timer. The installer performs a live authenticated repository preflight, initializes only when Restic explicitly reports a missing repository, and leaves the timer disabled for every other failure.

The backup makes a short-lived consistent copy of uploads before Restic reads them. It refuses to start unless the staging filesystem has the upload size plus 10 GiB free; a local Restic repository on the same filesystem requires twice the upload size plus 10 GiB. `BACKUP_STAGING_ROOT` must be a dedicated directory ending in `/staging-current` and cannot overlap the application, uploads, backup repository, or source release. Mount `/opt/leon-platform-backup-staging` on separate storage to avoid consuming the live disk. Before approaching 40 GiB of client uploads, use both separate staging storage and OVH Object Storage (or another S3-compatible offsite repository).

Install Ubuntu's `rclone` package before enabling the Supabase target. The installer copies the backup, restore-drill, token, and health-check programs into root-owned `/usr/local/libexec/leon-platform`; systemd never executes a script from a writable release directory. The backup stops only the two write-serving application containers, starts them again after the snapshot is consistent, and requires the full public and PostgreSQL health check to recover before it writes a Restic snapshot. `RESTIC_PASSWORD_FILE` is always excluded using the configured path rather than a hard-coded filename.
It also installs a boot-time tmpfiles rule for the shared maintenance lock so root-run backups and the Docker-group deploy user serialize safely across reboots.

```bash
sudo SOURCE_ROOT=/opt/leon-platform/current infra/ovh/scripts/install-systemd.sh
```

The installer also enables `leon-monitor.timer`. Every five minutes it runs the full public/application/database health check, requires the last completed encrypted backup to be less than 36 hours old, and fails when the application disk reaches 80% utilization. To override those defaults or deliver alerts, copy `secrets/monitor.env.example` to `/opt/leon-platform/monitor.env`, keep it root-owned with mode `600`, and set a private HTTPS `MONITOR_ALERT_WEBHOOK_URL`. The monitor never receives backup repository credentials; failure payloads contain only the host, monitor name, and a generic reason. Check current state with `systemctl status leon-monitor.timer leon-monitor.service` and `journalctl -u leon-monitor.service`.

After a fresh backup, run the installed restore drill. It checks the encrypted repository, restores the latest snapshot into a temporary root-only directory, validates the PostgreSQL archive, compares one upload when an overlapping live file exists, and erases the restored files on every exit. Its successful output contains only the snapshot ID, snapshot time, and verification status.

```bash
sudo /usr/local/libexec/leon-platform/verify-backup-restore.sh
```

Do not delete the old Vercel or managed database projects until the OVH deployment has passed the full cutover checklist and the rollback window has ended.
