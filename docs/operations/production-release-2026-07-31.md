# July 31 production release gate

This is the evidence checklist for the public Sites by Leon release. A checked item must have current command or external-state evidence; implementation alone does not count.

## Verified July 25

- [x] Immutable application release `2191e733db6178d9c0b1fdc3d6ca4dc52c9bf7fe` is contained in published `origin/main`, passed isolated staging and production deployment gates, and is active in both environments. It adds fail-closed creation and secret persistence for both Connect destination formats and returns HTTP 400 for missing or invalid webhook signatures. Production remains in `coming-soon` mode; the prior release remains available for rollback.
- [x] The upgraded countdown is live and actively flip-animating at 1440x900 and 390x844. Both viewports show the exact `2026-07-31T12:00:00-04:00` target, `$25/month`, approved Instagram and support links, zero horizontal overflow, and no console, page, or failed-request errors.
- [x] Fresh encrypted snapshot `9c9931ef073510e8d02a9022b8842a254d1b6d338dfb9c36cc0c53bfc0bd78d1` restores and validates successfully. The five-minute monitor reports healthy production, backup age, and disk headroom; root disk and inode use are 15% and 4%.
- [x] Immutable release `4dd723b35e4578a54bc28e8c555a35eda6d881ea` passed isolated staging and production deployment gates in `coming-soon` mode. All production health checks pass, and the prior production release remains preserved for rollback.
- [x] Cloudflare Browser Cache TTL now respects origin headers, no custom response-header transform rules exist, and the managed security-header transform is disabled. Targeted purges succeeded for all disposable media URLs and the production media URL.
- [x] A purged production media response returned the exact 1,274,400-byte PNG with `Cache-Control: public, max-age=300, must-revalidate`, exactly one `Cross-Origin-Resource-Policy: cross-origin` header, `MISS` then `HIT`, and a conditional HTTP 304. The staging edge passed the same header, cache, and revalidation assertions with a disposable WebP, which was purged and removed afterward.
- [x] Authenticated staging customer acceptance passed for `leon-tech-fan-test.leonsites.org` using a fresh short-lived Clerk session token. The test uploaded and optimized two real images; created, read, updated, and deleted gallery, post, service, client, and draft-invoice records; verified disconnected Stripe invoice protection; and confirmed all temporary records, uploads, credentials, and edge fixtures were removed.
- [x] The current tree passes 437 unit tests and 98 real-browser tests across the marketing, dashboard, photographer, domain-worker, production-CSP, accessibility, responsive-overflow, reduced-motion, billing, admin, and security-boundary suites. Every workspace type-checks and builds, and the production dependency audit reports no known vulnerabilities.
- [x] Fresh live rendering at 1440x900 and 390x844 shows the actively ticking July 31 countdown, exact noon-Eastern timestamp and launch copy, `$25/month` starting price, approved Instagram URL, four successfully loaded images, zero horizontal overflow, and no browser console, page, or failed-request errors.
- [x] Fresh live/test Stripe verification confirms active $25 and $35 monthly prices, correct Billing Portal legal and return URLs, one enabled platform webhook per environment, and both required live Connect event destinations with the correct payload and event-origin modes.
- [x] Mail DNS now has Zoho MX, SPF, DKIM, and a monitoring-only DMARC policy with strict alignment and aggregate reports sent to the established Gmail inbox. Keep `p=none` until legitimate mail alignment has been observed, then review moving to enforcement.
- [x] The production firewall, key-only SSH policy, secret-file permissions, encrypted backup, five-minute health/backup-age/disk monitor, and 15% root-disk usage were reverified. Fourteen GiB of unused Docker build cache was removed without affecting production or staging health.
- [x] Immutable release `1088fc5c11f9cce4e7c5dc9937cec775975bc888` passed staging and production deployment gates in `coming-soon` mode, with prior production release `fae52962a47faf00ba89687fd4d1407a06ac9f64` preserved for rollback.
- [x] Storage release `1088fc5c11f9cce4e7c5dc9937cec775975bc888` passed isolated staging deployment and health gates. The staging fallback directory is owned by the non-root runtime user with mode `0750`; a disposable PNG streamed through the media proxy with the exact 1,274,400-byte payload and SHA-256 `7b100d77b3658c89a81ccc3298902c707165faef36e81171dfa934186f1b2f86`, returned `image/png`, passed `Last-Modified` revalidation, and was removed from origin storage.
- [x] Marketing, dashboard, the two intended production customer sites, the isolated staging customer site, API, and PostgreSQL health checks pass after an OS update and reboot.
- [x] `leonsites.org`, `test.leonsites.org`, and `demo.leonsites.org` return HTTP 200 with Content Security Policy headers.
- [x] Dependency audit reports no known vulnerabilities.
- [x] Root and workspace type checks, builds, 437 unit tests, deployment/backup/monitor regressions, and 98 browser tests pass.
- [x] Live Stripe platform prices, Billing Portal, platform webhook, Connect webhook, and Connect v2 destination verify in live mode.
- [x] Live Billing Portal links to `https://leonsites.org/privacy` and `https://leonsites.org/terms`; the release verifier rejects drift in either URL.
- [x] Displayed Essential and Studio prices are approved at $25 and $35 per month. Test and live Stripe both use active monthly prices at exactly those amounts; unused $30 and $40 prices are inactive.
- [x] Test Stripe has one enabled platform webhook at `https://test.leonsites.org/api/webhooks/stripe`; the stale duplicate endpoint and orphaned test subscription/customer are disabled or removed.
- [x] Stripe Sandbox Connect now has one snapshot and one thin Accounts v2 destination at the exact `leon-tech-fan-test.leonsites.org` tenant routes. Both use connected-account origins, required events, synchronized signing secrets, and fail closed on invalid signatures; the stale test destination at the production demo URL is disabled.
- [x] Authenticated staging billing opened a real Stripe Sandbox Checkout for Studio at exactly $35 per month with required Terms consent. The unpaid session was expired and its temporary Stripe customer and database fixture were removed afterward.
- [x] A fresh `customer.subscription.updated` test event reached the staging webhook and was recorded exactly once as `processed`; temporary smoke metadata was removed afterward.
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

- [x] Publish the current local `main` to `sitesbyleons/sites-by-leon`. Local `main` and `origin/main` are synchronized; staging and production run application release `2191e733db6178d9c0b1fdc3d6ca4dc52c9bf7fe`, with only release-evidence documentation committed afterward.
- [x] External failure delivery is configured in root-owned `/opt/leon-platform/monitor.env` through a random 192-bit ntfy topic. A controlled missing-healthcheck failure was delivered and independently read back, then the normal monitor passed. The payload contains only the monitor name, host, failed status, and generic reason. The private subscription URL is stored outside the repository at `~/.config/leonsites/monitor-subscription.txt`; both files use mode `0600`. Treat the anonymous topic URL as a secret because anyone who knows it can read its temporarily cached alerts.
- [ ] Rotate the Stripe test secret that was pasted into the working conversation, update the owner-only local and VPS staging secret files, redeploy staging, and rerun the Stripe test verifier. The exposed key cannot charge real cards, but it must not remain trusted for sandbox administration.
- [x] Correct Cloudflare managed-media behavior and purge stale edge objects. Browser caching respects origin headers, no conflicting transform is active, and production now returns the intended five-minute cache policy with exactly one cross-origin resource-policy header.
- [x] Align advertised and enforced media storage with the VPS: every customer workspace receives a hard 15 GB quota, and aggregate reservations are capped at 60 GB. With roughly 83 GB free on July 25, this supports at most four fully allocated workspaces while reserving about 23 GB for the operating system, database, deployments, and working space. Provisioning fails closed beyond that ceiling; expand storage and add an independent media replica before admitting another workspace.
- [x] Complete an authenticated staging image lifecycle through the real application routes. The acceptance run uploaded and publicly read optimized media, exercised references through gallery and post records, deleted those records and uploads through authenticated endpoints, and verified clean final state.
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

Results after promoting managed-media release `1088fc5c11f9cce4e7c5dc9937cec775975bc888` at `2026-07-24T22:06:59Z`:

| Concurrency | Requests | Failures | p50 | p95 | Requests/second |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 100 | 0 | 64 ms | 322 ms | 95.3 |
| 50 | 500 | 0 | 64 ms | 617 ms | 377.5 |

Results after the final Cloudflare, authenticated-media, and host-cleanup pass at `2026-07-25T03:45:19Z`:

| Concurrency | Requests | Failures | p50 | p95 | Requests/second |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 100 | 0 | 64 ms | 628 ms | 67.3 |
| 50 | 500 | 0 | 63 ms | 741 ms | 338.6 |

Results against production application release `158458d1dbc58f5c4d290c5ecdb87e1dc723ba06` at `2026-07-25T23:21:17Z`:

| Concurrency | Requests | Failures | p50 | p95 | Requests/second |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 100 | 0 | 62 ms | 301 ms | 91.2 |
| 50 | 500 | 0 | 62 ms | 824 ms | 339.4 |

Results against hardened Stripe release `2191e733db6178d9c0b1fdc3d6ca4dc52c9bf7fe` at `2026-07-25T23:33:55Z`:

| Concurrency | Requests | Failures | p50 | p95 | Requests/second |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 100 | 0 | 62 ms | 286 ms | 97.9 |
| 50 | 500 | 0 | 63 ms | 701 ms | 366.5 |
