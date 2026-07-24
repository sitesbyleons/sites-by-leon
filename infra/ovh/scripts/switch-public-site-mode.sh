#!/usr/bin/env bash
set -euo pipefail
umask 077

requested_mode=${1:-}
if [[ ${requested_mode} != coming-soon && ${requested_mode} != live ]]; then
  echo 'Usage: switch-public-site-mode.sh coming-soon|live' >&2
  exit 2
fi

SOURCE_ROOT=${SOURCE_ROOT:-/opt/leon-platform/current}
SOURCE_ROOT=$(readlink -f "${SOURCE_ROOT}")
PLATFORM_ROOT=${PLATFORM_ROOT:-/opt/leon-platform}
SECRETS_ROOT=${SECRETS_ROOT:-${PLATFORM_ROOT}/secrets}
COMPOSE_ENV_FILE=${COMPOSE_ENV_FILE:-${SECRETS_ROOT}/.env}
MAINTENANCE_LOCK=${MAINTENANCE_LOCK:-/run/lock/leon-platform-maintenance.lock}

if [[ ! -f ${COMPOSE_ENV_FILE} || -L ${COMPOSE_ENV_FILE} ]]; then
  echo 'The production .env must be a regular, non-symlink file.' >&2
  exit 1
fi
env_owner=$(stat -c '%u' "${COMPOSE_ENV_FILE}")
env_mode=$(stat -c '%a' "${COMPOSE_ENV_FILE}")
if [[ ${env_owner} != "$(id -u)" || ${env_mode} != 600 ]]; then
  echo 'The production .env must belong to the deployment user with mode 600.' >&2
  exit 1
fi

mapfile -t existing_modes < <(sed -n 's/^PUBLIC_SITE_MODE=//p' "${COMPOSE_ENV_FILE}")
if [[ ${#existing_modes[@]} -ne 1 ]]; then
  echo 'PUBLIC_SITE_MODE must appear exactly once in the production .env.' >&2
  exit 1
fi
previous_mode=${existing_modes[0]%$'\r'}
if [[ ${previous_mode} != coming-soon && ${previous_mode} != live ]]; then
  echo 'The current PUBLIC_SITE_MODE is invalid.' >&2
  exit 1
fi
if [[ ${previous_mode} == "${requested_mode}" ]]; then
  echo "Public site mode is already ${requested_mode}."
  exit 0
fi

exec 9>"${MAINTENANCE_LOCK}"
flock -w "${MAINTENANCE_LOCK_TIMEOUT:-900}" 9 || {
  echo 'Another platform deployment, migration, backup, or launch switch is still running.' >&2
  exit 1
}

replace_mode() {
  local mode=$1
  local stage
  stage=$(mktemp "${COMPOSE_ENV_FILE}.XXXXXXXX")
  trap 'rm -f -- "${stage:-}"' RETURN
  awk -v mode="${mode}" '
    /^PUBLIC_SITE_MODE=/ { print "PUBLIC_SITE_MODE=" mode; next }
    { print }
  ' "${COMPOSE_ENV_FILE}" >"${stage}"
  chmod 0600 "${stage}"
  mv -f -- "${stage}" "${COMPOSE_ENV_FILE}"
  trap - RETURN
}

replace_mode "${requested_mode}"
if ! MAINTENANCE_LOCK_HELD=1 SOURCE_ROOT="${SOURCE_ROOT}" \
  SECRETS_ROOT="${SECRETS_ROOT}" COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE}" \
  "${SOURCE_ROOT}/infra/ovh/scripts/deploy.sh"; then
  echo "The ${requested_mode} deployment failed; restoring ${previous_mode}." >&2
  replace_mode "${previous_mode}"
  MAINTENANCE_LOCK_HELD=1 SOURCE_ROOT="${SOURCE_ROOT}" \
    SECRETS_ROOT="${SECRETS_ROOT}" COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE}" \
    "${SOURCE_ROOT}/infra/ovh/scripts/deploy.sh" || true
  exit 1
fi

echo "Public site mode changed from ${previous_mode} to ${requested_mode}."
