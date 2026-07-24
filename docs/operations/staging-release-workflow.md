# Staging release workflow

## Environment boundary

| Resource | Staging | Production |
| --- | --- | --- |
| Public host | `test.leonsites.org` | `leonsites.org` |
| Active release | `/opt/leon-platform/current-test` | `/opt/leon-platform/current` |
| Compose project | `leon-platform-test` | `leon-platform` |
| PostgreSQL database | `leon_platform_test` | `leon_platform` |
| Application logins | `leon_test_dashboard`, `leon_test_photographer` | `leon_dashboard`, `leon_photographer` |
| Runtime secrets | `/opt/leon-platform/secrets-test` | `/opt/leon-platform/secrets` |
| Stripe mode | Test products, webhook, and Portal | Live resources only |

Both environments run the same immutable source release. They do not share application data, database credentials, Stripe customers, subscriptions, webhook secrets, or price IDs. Clerk is currently the shared development identity provider; use dedicated test users and never place production-only identity metadata in a staging account.

Customer sites created from `test.leonsites.org/admin` use public preview hostnames such as `studio-test.leonsites.org`. Those hostnames resolve through the staging gateway and renderer only; they never read the production database.

## Release acceptance

1. Run `pnpm test`, `pnpm check`, and the application builds locally.
2. Upload the commit as `/opt/leon-platform/releases/<sha>` without modifying that directory afterward.
3. Synchronize owner-only staging secrets with `SECRETS_PROFILE=staging`.
4. Run `activate-test-release.sh <sha>`. It atomically changes `current-test` and restores the previous staging release if deployment fails.
5. Run `healthcheck-test.sh` with `TEST_EXTERNAL_URL=https://test.leonsites.org`.
6. Sign in as a test client. Verify assigned-plan display, Stripe test checkout, webhook-updated subscription state, Billing Portal, cancellation, admin assignment, and client dashboard navigation.
7. Query both databases. The staging test rows must exist only in `leon_platform_test`; production counts and subscription IDs must be unchanged.
8. Promote with `promote-tested-release.sh <sha>`. Only the SHA currently linked by `current-test` is accepted.
9. Run the production health check and a focused public smoke test.

## Rollback

Activation and promotion automatically restore the prior symlink and redeploy the prior release when a health check fails. For a healthy but behaviorally rejected staging release, activate the prior SHA explicitly:

```bash
/opt/leon-platform/releases/<prior-sha>/infra/ovh/scripts/activate-test-release.sh <prior-sha>
```

For a healthy but behaviorally rejected production release, first verify the desired prior SHA in staging, then promote that exact SHA. Do not point production at an untested release manually.

## Secret rules

- Staging Stripe secret keys must begin with `sk_test_`; preflight rejects live keys.
- The staging dashboard URL must use `leon_test_dashboard` and match `POSTGRES_DASHBOARD_PASSWORD`.
- The staging photographer URL must use `leon_test_photographer` and match the distinct `POSTGRES_PHOTOGRAPHER_PASSWORD`.
- Secret directories use mode `700`; files use mode `600` and are never stored in a release.
- Rotate a key exposed in chat, screenshots, shell history, or logs, then synchronize only the affected environment.
