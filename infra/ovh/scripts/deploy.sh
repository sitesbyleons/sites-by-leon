#!/usr/bin/env bash
set -euo pipefail

MAINTENANCE_LOCK=${MAINTENANCE_LOCK:-/run/lock/leon-platform-maintenance.lock}
if [[ ${MAINTENANCE_LOCK_HELD:-0} != 1 ]]; then
  exec 9>"${MAINTENANCE_LOCK}"
  flock -w "${MAINTENANCE_LOCK_TIMEOUT:-900}" 9 || {
    echo "Another platform deployment, migration, or backup is still running." >&2
    exit 1
  }
fi

SOURCE_ROOT=${SOURCE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}
PLATFORM_ROOT=${PLATFORM_ROOT:-/opt/leon-platform}
SECRETS_ROOT=${SECRETS_ROOT:-${PLATFORM_ROOT}/secrets}
COMPOSE_ENV_FILE=${COMPOSE_ENV_FILE:-${SECRETS_ROOT}/.env}
CLOUDFLARE_TUNNEL_TOKEN_FILE=${SECRETS_ROOT}/cloudflare-tunnel-token
export SECRETS_ROOT COMPOSE_ENV_FILE CLOUDFLARE_TUNNEL_TOKEN_FILE
export RELEASE_SHA=${RELEASE_SHA:-$(basename "$(readlink -f "${SOURCE_ROOT}")")}

SOURCE_ROOT="${SOURCE_ROOT}" SECRETS_ROOT="${SECRETS_ROOT}" COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE}" \
  /usr/bin/bash "${SOURCE_ROOT}/infra/ovh/scripts/preflight-runtime-secrets.sh"
cd "${SOURCE_ROOT}/infra/ovh"

read_env_setting() {
  local key=$1
  local value
  value=$(sed -n "s/^${key}=//p" "${COMPOSE_ENV_FILE}" | tail -n 1 | tr -d '\r')
  value=${value#\"}
  value=${value%\"}
  printf '%s' "${value}"
}

domain_api_enabled=${CUSTOM_DOMAIN_AUTOMATION_ENABLED:-$(read_env_setting CUSTOM_DOMAIN_AUTOMATION_ENABLED)}
domain_api_enabled=${domain_api_enabled:-false}
compose_profiles=${COMPOSE_PROFILES:-$(read_env_setting COMPOSE_PROFILES)}
domain_profile_enabled=false
case ",${compose_profiles// /}," in
  *,domains,*) domain_profile_enabled=true ;;
esac
if [[ ${domain_api_enabled} != true && ${domain_api_enabled} != false ]]; then
  echo "CUSTOM_DOMAIN_AUTOMATION_ENABLED must be true or false." >&2
  exit 1
fi
if [[ ${domain_api_enabled} != ${domain_profile_enabled} ]]; then
  echo "Custom-domain API and worker profile must be enabled or disabled together." >&2
  exit 1
fi
if [[ ${domain_profile_enabled} == true ]]; then
  SOURCE_ROOT="${SOURCE_ROOT}" /usr/bin/bash "${SOURCE_ROOT}/infra/ovh/scripts/preflight-domain-worker.sh"
fi

docker network inspect leon-edge >/dev/null 2>&1 || docker network create leon-edge >/dev/null

if [[ ${domain_profile_enabled} != true ]]; then
  docker compose --env-file "${COMPOSE_ENV_FILE}" --profile domains rm --stop --force domain-worker >/dev/null 2>&1 || true
fi

docker compose --env-file "${COMPOSE_ENV_FILE}" up -d database
docker compose --env-file "${COMPOSE_ENV_FILE}" exec -T database sh -c \
  'until pg_isready --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"; do sleep 1; done'
build_services=(gateway dashboard photographer)
if [[ ${domain_profile_enabled} == true ]]; then
  build_services+=(domain-worker)
fi
docker compose --env-file "${COMPOSE_ENV_FILE}" build "${build_services[@]}"
MAINTENANCE_LOCK_HELD=1 SOURCE_ROOT="${SOURCE_ROOT}" /usr/bin/bash "${SOURCE_ROOT}/infra/ovh/scripts/migrate-database.sh"
SOURCE_ROOT="${SOURCE_ROOT}" /usr/bin/bash "${SOURCE_ROOT}/infra/ovh/scripts/configure-runtime-role.sh"
docker compose --env-file "${COMPOSE_ENV_FILE}" up -d --no-build --remove-orphans
docker compose --env-file "${COMPOSE_ENV_FILE}" ps
for attempt in $(seq 1 "${DEPLOY_HEALTHCHECK_ATTEMPTS:-24}"); do
  if COMPOSE_PROFILES="${compose_profiles}" \
    CUSTOM_DOMAIN_AUTOMATION_ENABLED="${domain_api_enabled}" \
    SOURCE_ROOT="${SOURCE_ROOT}" \
    /usr/bin/bash "${SOURCE_ROOT}/infra/ovh/scripts/healthcheck.sh"; then
    break
  fi
  if [[ ${attempt} -eq ${DEPLOY_HEALTHCHECK_ATTEMPTS:-24} ]]; then
    echo "The new release did not become healthy." >&2
    exit 1
  fi
  sleep "${DEPLOY_HEALTHCHECK_INTERVAL_SECONDS:-5}"
done

DISABLE_LEGACY_RUNTIME_ROLE=true SOURCE_ROOT="${SOURCE_ROOT}" \
  /usr/bin/bash "${SOURCE_ROOT}/infra/ovh/scripts/configure-runtime-role.sh"

BUILD_CACHE_RETENTION_HOURS=${BUILD_CACHE_RETENTION_HOURS:-72}
if [[ ${BUILD_CACHE_RETENTION_HOURS} =~ ^[1-9][0-9]*$ ]]; then
  docker builder prune --force --filter "until=${BUILD_CACHE_RETENTION_HOURS}h" >/dev/null
  docker image prune --force --filter "until=${BUILD_CACHE_RETENTION_HOURS}h" >/dev/null
else
  echo "BUILD_CACHE_RETENTION_HOURS must be a positive whole number." >&2
  exit 1
fi
