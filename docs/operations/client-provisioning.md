# Client-site provisioning runbook

## Supported production model

One customer workspace owns one photographer website. Public content, galleries, uploads, inquiries, services, clients, invoices, Stripe Connect state, tickets, and site status all carry that workspace identity.

All standard customer sites run from one shared photographer application. The request hostname must exactly match `site_connections.primary_domain` or `site_connections.admin_domain`; an unknown production hostname returns 404. A customer does not receive a privileged container, database credential, or copy of platform secrets.

The public domain can be custom. The private editor should use `<slug>.leonsites.org/admin` so Clerk authentication stays on the Leon Sites parent domain. A separate GitHub repository is optional metadata for a fully custom build; normal managed sites share the private platform repository and keep customer content in PostgreSQL/media storage.

## Add a customer

1. Have the customer create a Clerk account.
2. In Leon administration, open **Users**, find the unconnected account, and choose **Create site**.
3. Confirm the owner, studio name, short name, public domain, private editor domain, template, monthly plan, and storage allocation.
4. Submit once. The browser keeps the same idempotency key if the response is interrupted, so retrying the same form cannot create duplicates.
5. Provisioning atomically creates the workspace, owner membership, website project, editable settings, starter services, starter gallery/images/post, storage reservation, site connection, and audit run. The site begins in maintenance.
6. For a Leon Sites subdomain, confirm the wildcard Cloudflare route reaches the shared gateway. For a custom domain, finish the customer DNS/Tunnel hostname step.
7. Test public desktop/mobile pages, owner sign-in, image upload, inquiry delivery, content editing, and Stripe sandbox onboarding.
8. Change the site to **Active**. Activation synchronizes site, workspace, project, and provisioning-audit state.

## Safety invariants

- Provisioning is one PostgreSQL statement guarded by advisory locks.
- Reusing an idempotency key with different data fails.
- Public and private domains are normalized and unique across both domain columns.
- One workspace has one project and one site connection.
- Total allocated workspace quotas cannot exceed `PLATFORM_PROVISIONABLE_STORAGE_BYTES`.
- Site pause/activation updates related lifecycle records together.
- Browser applications never receive VPS, Docker, GitHub, Cloudflare, database-admin, or backup credentials.
- Uploads are signature-checked, pixel-limited, autorotated, metadata-stripped, resized to 2400px, and stored as WebP. Quota accounting uses the optimized size.

## Second-customer acceptance test

Use a non-admin Clerk account and the editorial starter.

1. Submit the create request three times with the same key; assert one row in each provisioning table.
2. Confirm the new hostname shows only the new customer’s settings/content and Northline remains unchanged.
3. Confirm the new owner can open only their editor; a stranger receives the access-denied page; Leon can manage both.
4. Create/edit/delete a gallery and post, upload an image, edit homepage copy and a service, submit an inquiry, create a client and draft invoice, then reload every page.
5. Attempt IDs and upload paths from the other workspace; every request must fail or affect zero rows.
6. Pause the new site and confirm only it enters maintenance. Reactivate it.
7. Open Stripe Connect in sandbox and confirm a separate connected account is created for the new workspace. Do not submit fictional identity details.
8. Verify external health, application logs, database counts, disk headroom, and a fresh encrypted backup.

## Capacity gates

The current VPS has roughly 96 GB usable disk. While uploads, backup staging, and the Restic repository share that disk, keep aggregate customer quota reservations at or below 20 GB. This is an enforced ceiling, not a marketing promise.

Before raising it:

- move Restic to independent S3-compatible object storage;
- run and document an isolated PostgreSQL/media restore;
- move customer media or backup staging to separate storage;
- add disk, tunnel, database, webhook, and backup-age alerts;
- run 10- and 50-host load tests;
- finish the staged database RLS/service-role separation described in the production audit;
- switch Stripe from sandbox only after real payment, payout, refund, cancellation, and replay tests.

Until those gates are complete, the platform is suitable for controlled demo/beta customers, not unattended high-volume production.

## Recovery

If a new release fails health checks, keep the additive schema, point `/opt/leon-platform/current` to the previous release, deploy that Compose file with `--remove-orphans`, and run the full health check. Do not delete the failed provisioning audit row; its error/history is the operator record.
