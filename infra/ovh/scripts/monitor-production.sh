#!/usr/bin/env bash
set -euo pipefail

HEALTHCHECK_SCRIPT=${HEALTHCHECK_SCRIPT:-/usr/local/libexec/leon-platform/healthcheck.sh}
BACKUP_SUCCESS_MARKER=${BACKUP_SUCCESS_MARKER:-/var/lib/leon-platform/last-successful-backup}
BACKUP_MAX_AGE_SECONDS=${BACKUP_MAX_AGE_SECONDS:-129600}
DISK_PATH=${DISK_PATH:-/opt/leon-platform}
DISK_MAX_USED_PERCENT=${DISK_MAX_USED_PERCENT:-80}
MONITOR_ALERT_WEBHOOK_URL=${MONITOR_ALERT_WEBHOOK_URL:-}
CURL_CONNECT_TIMEOUT_SECONDS=${CURL_CONNECT_TIMEOUT_SECONDS:-5}
CURL_MAX_TIME_SECONDS=${CURL_MAX_TIME_SECONDS:-20}

for positive_number in BACKUP_MAX_AGE_SECONDS DISK_MAX_USED_PERCENT CURL_CONNECT_TIMEOUT_SECONDS CURL_MAX_TIME_SECONDS; do
  if [[ ! ${!positive_number} =~ ^[1-9][0-9]*$ ]]; then
    echo "${positive_number} must be a positive whole number." >&2
    exit 1
  fi
done
if (( DISK_MAX_USED_PERCENT > 99 )); then
  echo "DISK_MAX_USED_PERCENT must be between 1 and 99." >&2
  exit 1
fi
if [[ -n ${MONITOR_ALERT_WEBHOOK_URL} && ! ${MONITOR_ALERT_WEBHOOK_URL} =~ ^https://[^[:space:]]+$ ]]; then
  echo "MONITOR_ALERT_WEBHOOK_URL must be an HTTPS URL." >&2
  exit 1
fi

send_alert() {
  local reason=$1
  [[ -z ${MONITOR_ALERT_WEBHOOK_URL} ]] && return 0
  local payload
  payload=$(jq -cn --arg service leon-production-monitor --arg host "$(hostname)" --arg reason "${reason}" \
    '{service:$service,host:$host,status:"failed",reason:$reason}')
  curl --fail --silent --show-error \
    --connect-timeout "${CURL_CONNECT_TIMEOUT_SECONDS}" \
    --max-time "${CURL_MAX_TIME_SECONDS}" \
    --header 'Content-Type: application/json' \
    --data-binary "${payload}" \
    "${MONITOR_ALERT_WEBHOOK_URL}" >/dev/null || \
    echo "Production monitor could not deliver its alert." >&2
}

fail_monitor() {
  local reason=$1
  echo "Production monitor failed: ${reason}" >&2
  send_alert "${reason}"
  exit 1
}

if [[ ! -f ${HEALTHCHECK_SCRIPT} || -L ${HEALTHCHECK_SCRIPT} || ! -x ${HEALTHCHECK_SCRIPT} ]]; then
  fail_monitor "healthcheck program is unavailable"
fi
if ! "${HEALTHCHECK_SCRIPT}" >/dev/null 2>&1; then
  fail_monitor "application, database, or public endpoint health check failed"
fi

if [[ ! -f ${BACKUP_SUCCESS_MARKER} || -L ${BACKUP_SUCCESS_MARKER} ]]; then
  fail_monitor "no successful encrypted backup marker exists"
fi
marker_epoch=$(<"${BACKUP_SUCCESS_MARKER}")
if [[ ! ${marker_epoch} =~ ^[0-9]+$ ]]; then
  fail_monitor "the successful backup marker is invalid"
fi
current_epoch=$(date -u +%s)
backup_age=$((current_epoch - marker_epoch))
if (( backup_age < 0 || backup_age > BACKUP_MAX_AGE_SECONDS )); then
  fail_monitor "the latest successful encrypted backup is too old"
fi

if [[ ! -d ${DISK_PATH} ]]; then
  fail_monitor "the monitored disk path is unavailable"
fi
disk_used_percent=$(df -P "${DISK_PATH}" | awk 'NR == 2 { gsub(/%/, "", $5); print $5 }')
if [[ ! ${disk_used_percent} =~ ^[0-9]+$ ]]; then
  fail_monitor "disk utilization could not be measured"
fi
if (( disk_used_percent >= DISK_MAX_USED_PERCENT )); then
  fail_monitor "disk utilization reached the production threshold"
fi

echo "Production health, backup age, and disk headroom checks passed."
