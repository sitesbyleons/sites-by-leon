# July 31 production release gate

This is the evidence checklist for the public Sites by Leon release. A checked item must have current command or external-state evidence; implementation alone does not count.

## Verified July 23

- [x] Production release `95cd2626a54c08c41297afe5624b348519020059` deployed with release `8b1e8afee5a4af1d819de560a63e3bfd1bf3db6f` preserved for rollback.
- [x] Marketing, dashboard, three active customer sites, API, and PostgreSQL health checks pass.
- [x] `leonsites.org`, `test.leonsites.org`, and `demo.leonsites.org` return HTTP 200 with Content Security Policy headers.
- [x] Dependency audit reports no known vulnerabilities.
- [x] Root and workspace type checks, builds, unit tests, infrastructure regressions, and 92 browser tests pass.
- [x] Live Stripe platform prices, Billing Portal, platform webhook, Connect webhook, and Connect v2 destination verify in live mode.
- [x] Displayed Essential, Studio, and Signature prices match the active live Stripe prices at $25, $30, and $40 per month.
- [x] Public, dashboard, and photographer support fallbacks consistently use the established `sites.by.leon@gmail.com` inbox.
- [x] Nightly encrypted offsite backup timer is enabled and successful.
- [x] Fresh snapshot `1942470cff7c79ce7167a49cd9bdd8023493eb20308041327f1921bc496ad6d8` restores and validates PostgreSQL plus uploaded media.
- [x] Five-minute monitor verifies public/application/database health, backup age under 36 hours, and disk usage under 80%.
- [x] Production disk usage is 19%.
- [x] Playwright uses deterministic foreground Astro 7 servers and produces no hidden application errors or hydration mismatches.
- [x] Reversible `coming-soon` / `live` launch switching is implemented with maintenance locking, atomic environment updates, deployment rollback, and CI regression coverage.

## Required before public launch

- [ ] Publish release-candidate source to the private GitHub `main` branch; repository authentication is currently unavailable from Codex.
- [ ] Configure `MONITOR_ALERT_WEBHOOK_URL` in root-owned `/opt/leon-platform/monitor.env` and trigger one controlled failure to prove alert delivery.
- [x] Pass the 10- and 50-concurrency read-only production load gates and record results below.
- [ ] Complete one authenticated customer acceptance smoke test with a short-lived Clerk owner session.
- [ ] Complete a controlled live Stripe lifecycle: real checkout, webhook receipt, cancellation, refund, Connect invoice payment, payout confirmation, and webhook replay/idempotency check. Use real owner-approved payment details; never fictional identity data.
- [ ] Confirm final launch copy, prices, support email, privacy policy, and terms with the business owner.
- [ ] If branded email is desired, verify a real `@leonsites.org` mailbox end to end before replacing the established Gmail address. Never use `@leonsites.com`; that domain belongs to an unrelated site and has no mail exchanger.
- [ ] On July 31, run the launch procedure below, rerun this checklist, and keep the previous release plus DNS rollback available.

## Launch and rollback

Before the launch window, confirm the production environment contains exactly one `PUBLIC_SITE_MODE=coming-soon` entry and that `/opt/leon-platform/secrets/.env` is owned by the deployment user with mode `0600`. Do not print the rest of that file.

Launch:

```bash
/opt/leon-platform/current/infra/ovh/scripts/switch-public-site-mode.sh live
/opt/leon-platform/current/infra/ovh/scripts/healthcheck.sh
curl --fail --silent --show-error --location https://leonsites.org/ >/dev/null
```

Rollback the public homepage while preserving dashboard and API routing:

```bash
/opt/leon-platform/current/infra/ovh/scripts/switch-public-site-mode.sh coming-soon
/opt/leon-platform/current/infra/ovh/scripts/healthcheck.sh
curl --fail --silent --show-error --location https://leonsites.org/ >/dev/null
```

The switch script restores and redeploys the previous mode automatically if the requested deployment fails. If application health remains unhealthy after the mode rollback, restore the preserved release symlink and run that release's deployment script.

## Load results

Run from a stable external connection:

```bash
pnpm load:production:10
pnpm load:production:50
```

Record UTC time, request count, failures, p50, p95, and requests/second. Both runs require zero failures and p95 at or below 2.5 seconds.

Results at `2026-07-24T03:03:18Z`:

| Concurrency | Requests | Failures | p50 | p95 | Requests/second |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 100 | 0 | 62 ms | 345 ms | 95.2 |
| 50 | 500 | 0 | 62 ms | 734 ms | 332.4 |
