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
sudo SOURCE_ROOT=/opt/leon-platform/app infra/ovh/scripts/bootstrap-ubuntu.sh
```

The firewall should allow the verified SSH port only. Cloudflare Tunnel connects outbound, so ports 80, 443, and 5432 do not need to be opened.

## Secrets

Copy these ignored examples and replace every placeholder:

1. `infra/ovh/.env.example` to `infra/ovh/.env`.
2. `infra/ovh/secrets/postgres.env.example` to `infra/ovh/secrets/postgres.env`.
3. `infra/ovh/secrets/dashboard.env.example` to `infra/ovh/secrets/dashboard.env`.
4. `infra/ovh/secrets/northline.env.example` to `infra/ovh/secrets/northline.env`.
5. Put the Cloudflare Tunnel token only in `infra/ovh/secrets/cloudflare-tunnel-token`.

Set every secret file to mode `600`. Use the same internal PostgreSQL password in `postgres.env`, `dashboard.env`, and `northline.env`.

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
SOURCE_ROOT=/opt/leon-platform/app infra/ovh/scripts/deploy.sh
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

```bash
sudo SOURCE_ROOT=/opt/leon-platform/app infra/ovh/scripts/install-systemd.sh
```

Do not delete the old Vercel or managed database projects until the OVH deployment has passed the full cutover checklist and the rollback window has ended.
