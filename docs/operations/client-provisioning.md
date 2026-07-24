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
- Uploads are signature-checked, pixel-limited, autorotated, metadata-stripped, resized to 2400px, and stored as WebP. Quota accounting uses the optimized size. Managed paths are tenant-prefixed and validated before local or private S3-compatible reads, writes, and deletions.

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

### Repeatable authenticated CRUD smoke test

Run `infra/ovh/scripts/customer-acceptance-smoke.sh` against the exact editor origin before activating a newly provisioned customer. This is a destructive acceptance test that creates temporary resources, but an exit trap removes them in dependency order after either success or failure. It covers two real image uploads plus gallery, post, service, client, and draft-invoice create/read/update/delete behavior.

Use a browser session belonging to the customer owner or Leon app administrator. Authentication can come from either a Netscape-format cookie jar containing the active Clerk `__session` cookie or a short-lived Clerk session JWT written as one exact `Authorization: Bearer <JWT>` line. Keep either file outside the repository and make it private with `chmod 600`. Never paste the cookie, JWT, or complete header into a command, shell history, issue, or log. The script passes only the selected file path to curl and never prints its value. Set exactly one of `CLERK_COOKIE_JAR` and `CLERK_AUTH_HEADER_FILE`.

From a secure Linux shell (including WSL), run:

```bash
TENANT_ORIGIN=https://customer-editor.leonsites.org \
CLERK_COOKIE_JAR="$HOME/.config/leonsites/customer-smoke.cookies.txt" \
TEST_IMAGE="$HOME/customer-smoke-image.jpg" \
bash infra/ovh/scripts/customer-acceptance-smoke.sh
```

For a short-lived bearer token instead of a cookie jar, leave `CLERK_COOKIE_JAR` unset and supply the private header file:

```bash
TENANT_ORIGIN=https://customer-editor.leonsites.org \
CLERK_AUTH_HEADER_FILE="$HOME/.config/leonsites/customer-smoke-authorization.txt" \
TEST_IMAGE="$HOME/customer-smoke-image.jpg" \
bash infra/ovh/scripts/customer-acceptance-smoke.sh
```

`TENANT_ORIGIN` must be the exact lowercase HTTPS editor origin with no trailing slash, port, path, query, or fragment. The selected Clerk authentication file must be a regular, non-symlink file owned by the current user with no group or other permissions. A bearer header file must contain exactly one syntactically valid JWT header and nothing else. `TEST_IMAGE` must be a regular JPG, PNG, WebP, or AVIF file smaller than 15 MB.

Only run this automated invoice guard while Stripe is disconnected. Before it creates any temporary records, the script checks the exact tenant health endpoint, verifies that the cookie can open the owner editor, and confirms both Stripe charges and payouts are disabled. It repeats the Stripe check immediately before attempting to send the temporary invoice, expects HTTP 409 with `Finish Stripe onboarding first.`, and uses an `example.com` recipient so the test cannot email a real client. If Stripe is ready or becomes ready during the run, the script stops without attempting the send.

The final success line confirms that all temporary resources were removed. Treat any cleanup warning as a failed test: open the named editor section, remove the marked `SBL smoke` record, and rerun the smoke test before activation. Delete the local cookie jar or authorization header file as soon as the acceptance session is complete.

## Capacity gates

The current VPS has roughly 96 GB usable disk. While uploads, backup staging, and the Restic repository share that disk, keep aggregate customer quota reservations at or below 20 GB. This is an enforced ceiling, not a marketing promise.

Before raising it:

- move Restic to independent S3-compatible object storage;
- run and document an isolated PostgreSQL/media restore;
- configure the private versioned application media bucket, migrate and verify existing files, and add an independent media replica/export;
- add disk, tunnel, database, webhook, and backup-age alerts;
- run 10- and 50-host load tests;
- finish the staged database RLS/service-role separation described in the production audit;
- switch Stripe from sandbox only after real payment, payout, refund, cancellation, and replay tests.

Until those gates are complete, the platform is suitable for controlled demo/beta customers, not unattended high-volume production.

## Recovery

If a new release fails health checks, keep the additive schema, point `/opt/leon-platform/current` to the previous release, deploy that Compose file with `--remove-orphans`, and run the full health check. Do not delete the failed provisioning audit row; its error/history is the operator record.
