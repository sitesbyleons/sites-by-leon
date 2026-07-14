# Domain worker

Private Node.js service that processes Cloudflare for SaaS Custom Hostname jobs from Postgres.

The service expects the existing `domain_jobs` and `site_domain_aliases` tables. It does not create or migrate schema. Jobs are claimed atomically with `FOR UPDATE SKIP LOCKED`; stale `processing` jobs are reclaimed using `locked_at`.

Claiming a create or delete job also moves its alias to `configuring` or `removing` in the same statement.

## Runtime

Copy `.env.example` into the service environment and provide `DATABASE_URL`, `CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_ZONE_ID`. The database role needs read/update access to `domain_jobs` and `site_domain_aliases`.

```sh
pnpm build
pnpm start
```

`SIGINT` and `SIGTERM` stop polling, allow the current job to finish, and then close the database pool.

## Job behavior

- `create` finds an existing exact hostname before creating one, so retries are idempotent.
- `refresh` reads current hostname and certificate status; when it is not active, it re-submits `ssl: { method: "http", type: "dv" }` so HTTP DCV can complete after the customer CNAME is in place.
- `delete` treats an already-absent Cloudflare hostname as success.
- An alias becomes `active` only when both Cloudflare hostname and SSL statuses are `active`; otherwise a successful create/refresh leaves it `dns_pending`.
- Retryable failures use capped exponential backoff. Exhausted or permanent failures move the job to `failed` and the alias to `error`.
