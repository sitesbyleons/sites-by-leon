# July 31 production release gate

This is the evidence checklist for the public Sites by Leon release. A checked item must have current command or external-state evidence; implementation alone does not count.

## Verified July 24

- [x] Immutable release `fae52962a47faf00ba89687fd4d1407a06ac9f64` passed staging and production deployment gates in `coming-soon` mode, with release `8e21b6cd0738f8c542207507c32c91eb5d609546` preserved for rollback.
- [x] Marketing, dashboard, the two intended production customer sites, the isolated staging customer site, API, and PostgreSQL health checks pass after an OS update and reboot.
- [x] `leonsites.org`, `test.leonsites.org`, and `demo.leonsites.org` return HTTP 200 with Content Security Policy headers.
- [x] Dependency audit reports no known vulnerabilities.
- [x] Root and workspace type checks, builds, 419 unit tests, deployment/backup/monitor regressions, and 94 browser tests pass.
- [x] Live Stripe platform prices, Billing Portal, platform webhook, Connect webhook, and Connect v2 destination verify in live mode.
- [x] Live Billing Portal links to `https://leonsites.org/privacy` and `https://leonsites.org/terms`; the release verifier rejects drift in either URL.
- [x] Displayed Essential and Studio prices are approved at $25 and $35 per month. Test and live Stripe both use active monthly prices at exactly those amounts; unused $30 and $40 prices are inactive.
- [x] Test Stripe has one enabled platform webhook at `https://test.leonsites.org/api/webhooks/stripe`; the stale duplicate endpoint and orphaned test subscription/customer are disabled or removed.
- [x] Authenticated staging billing opened a real Stripe Sandbox Checkout for Studio at exactly $35 per month with required Terms consent. The unpaid session was expired and its temporary Stripe customer and database fixture were removed afterward.
- [x] Public, dashboard, and photographer support fallbacks consistently use the established `sites.by.leon@gmail.com` inbox.
- [x] Nightly encrypted offsite backup timer is enabled and successful.
- [x] Fresh snapshot `e9f1d4be7b149a9e0c30ed4252c8b30e187ace1f2b51c1b2de7f54de75974188` restores and validates PostgreSQL plus uploaded media.
- [x] Five-minute monitor verifies public/application/database health, backup age under 36 hours, and disk usage under 80%.
- [x] Build cache is bounded to `8GB` by both deployment paths; cleanup recovered 10.49GB and production disk usage is 26%.
- [x] The host firewall denies unsolicited inbound traffic except key-only SSH; root login, password login, and keyboard-interactive login are disabled.
- [x] Available PAM, rsyslog, Docker, and system security updates were installed, the host was rebooted, and no further reboot is required.
- [x] Playwright uses deterministic foreground Astro 7 servers and produces no hidden application errors or hydration mismatches.
- [x] Reversible `coming-soon` / `live` launch switching is implemented with maintenance locking, atomic environment updates, deployment rollback, and CI regression coverage.
- [x] Production shows the timezone-fixed July 31 noon Eastern countdown, starting price, approved Instagram link, and established support email without mobile or desktop overflow.

## Required before public launch

- [ ] Publish local `main` through `fae52962a47faf00ba89687fd4d1407a06ac9f64` to the private GitHub repository. The local branch is ahead of the remote and the connected GitHub account currently cannot read that private repository.
- [ ] Configure `MONITOR_ALERT_WEBHOOK_URL` in root-owned `/opt/leon-platform/monitor.env` and trigger one controlled failure to prove alert delivery.
- [ ] Add application-scoped object storage or expand the upload volume before assigning the advertised 50 GB or 100 GB customer quotas. The current VPS has a 96 GB root filesystem with 71 GB free and a conservative 20 GB provisioning ceiling, so a 100 GB Studio allocation cannot be honored safely yet.
- [x] Pass the 10- and 50-concurrency read-only production load gates and record results below.
- [x] Authenticated production owner smoke passed for Overview, Sites, Demos, Subscriptions, Tickets, and Users. Authenticated staging smoke also passed all ten customer Studio routes without an access-denied redirect.
- [ ] Complete a controlled live Stripe lifecycle: real checkout, webhook receipt, cancellation, refund, Connect invoice payment, payout confirmation, and webhook replay/idempotency check. Use real owner-approved payment details; never fictional identity data.
- [x] Live Stripe public settings include the business website and Terms URL. A no-charge Checkout preview returned HTTP 200 and visibly rendered required Terms consent; the application now requires that consent for every subscription checkout.
- [ ] Confirm final launch copy, prices, support email, privacy policy, and terms with the business owner.
- [ ] Stripe now displays `leon@leonsites.org` as its support email. Verify that mailbox end to end before replacing the established Gmail address in application fallbacks. Never use `@leonsites.com`; that domain belongs to an unrelated site and has no mail exchanger.
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

Results at `2026-07-24T20:32:03Z`:

| Concurrency | Requests | Failures | p50 | p95 | Requests/second |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 100 | 0 | 63 ms | 394 ms | 86.0 |
| 50 | 500 | 0 | 62 ms | 747 ms | 345.3 |

Results after promoting `fae52962a47faf00ba89687fd4d1407a06ac9f64` at `2026-07-24T21:01:22Z`:

| Concurrency | Requests | Failures | p50 | p95 | Requests/second |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 100 | 0 | 65 ms | 309 ms | 90.8 |
| 50 | 500 | 0 | 66 ms | 1,067 ms | 283.8 |
