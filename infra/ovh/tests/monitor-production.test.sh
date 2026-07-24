#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
SCRIPT="${ROOT}/infra/ovh/scripts/monitor-production.sh"
FIXTURE=$(mktemp -d)
trap 'rm -rf -- "${FIXTURE}"' EXIT

mkdir -p "${FIXTURE}/disk"
cat >"${FIXTURE}/healthcheck" <<'EOF'
#!/usr/bin/env bash
exit "${MOCK_HEALTH_STATUS:-0}"
EOF
chmod 0755 "${FIXTURE}/healthcheck"
date -u +%s >"${FIXTURE}/last-successful-backup"

run_monitor() {
  env \
    HEALTHCHECK_SCRIPT="${FIXTURE}/healthcheck" \
    BACKUP_SUCCESS_MARKER="${FIXTURE}/last-successful-backup" \
    BACKUP_MAX_AGE_SECONDS=129600 \
    DISK_PATH="${FIXTURE}/disk" \
    DISK_MAX_USED_PERCENT=99 \
    MONITOR_ALERT_WEBHOOK_URL= \
    bash "${SCRIPT}"
}

run_monitor >"${FIXTURE}/output" 2>"${FIXTURE}/error"
grep -qx 'Production health, backup age, and disk headroom checks passed.' "${FIXTURE}/output"
[[ ! -s "${FIXTURE}/error" ]]

printf '1\n' >"${FIXTURE}/last-successful-backup"
if run_monitor >"${FIXTURE}/stale-output" 2>"${FIXTURE}/stale-error"; then
  echo 'Production monitor accepted a stale backup marker.' >&2
  exit 1
fi
grep -q 'latest successful encrypted backup is too old' "${FIXTURE}/stale-error"

date -u +%s >"${FIXTURE}/last-successful-backup"
if MOCK_HEALTH_STATUS=1 run_monitor >"${FIXTURE}/health-output" 2>"${FIXTURE}/health-error"; then
  echo 'Production monitor accepted a failed application health check.' >&2
  exit 1
fi
grep -q 'application, database, or public endpoint health check failed' "${FIXTURE}/health-error"

echo 'Production monitor regression tests passed.'
