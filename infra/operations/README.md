# Read-only Operations telemetry

Deployed to production on September 20, 2026 at 23:42 UTC. The minute collector timer is enabled and the dashboard has a read-only snapshot mount. See `docs/operations-release-20260920.md` for verification and rollback details. The checklist below also applies to future releases.

`collect.py` runs on the Linux host with permission to inspect Docker and query aggregate storage reservations. It emits only selected operational fields to `/var/lib/leon-platform/operations/ovh-primary.json`. No environment values, credentials, customer names, or Docker socket are exposed to the dashboard.

## Release checklist

1. Reconcile the intended application source with existing production runtime overlays; build and test a Linux candidate image. Preserve existing authentication, customer dashboard and design behavior.
2. Create `/var/lib/leon-platform/operations` before enabling the service. Install the collector as `/usr/local/libexec/leon-platform/collect-operations.py` and both units in `/etc/systemd/system`. Review the fixed project/container names and host identifier for this VPS. For another host, supply a distinct identifier/output filename before collecting it.
3. Run the service once and validate its JSON. Missing historical systemd completion timestamps deliberately produce `unknown`, not an invented success. The backup marker is separate evidence.
4. Enable the minute timer. Verify it actually advances `collectedAt`, including under the service sandbox.
5. Add a **read-only** bind mount from `/var/lib/leon-platform/operations` to `/run/leon-operations` on the dashboard container only. Do not mount `/var/run/docker.sock`. Optional `OPERATIONS_SNAPSHOT_DIR` is for alternate read-only paths/local preview.
6. Validate the candidate: anonymous access redirects/rejects even with `?preview=true`; ordinary clients cannot see server metrics; owner can; stale/unavailable data is visibly flagged. Verify site assignments against production schema without mutating records.
7. During release, retain the previous image/compose configuration for rollback; preserve existing environment, mounts and protected database/upload services. No schema migration is needed for this feature.
8. After release verify owner page, unauthorized access, existing client login, public content and services. Record the exact image and release commit. Do not label the entire platform production-ready on the strength of this panel.

Local checks: `pnpm --dir dashboard test`, `pnpm --dir dashboard check`, and `node scripts/qa-operations.mjs` against the development preview on port 4359 with a captured snapshot directory.
