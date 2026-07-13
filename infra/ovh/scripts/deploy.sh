#!/usr/bin/env bash
set -euo pipefail

MAINTENANCE_LOCK=${MAINTENANCE_LOCK:-/run/lock/leon-platform-maintenance.lock}
exec 9>"${MAINTENANCE_LOCK}"
flock -w "${MAINTENANCE_LOCK_TIMEOUT:-900}" 9 || {
  echo "Another platform deployment, migration, or backup is still running." >&2
  exit 1
}

SOURCE_ROOT=${SOURCE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}
PLATFORM_ROOT=${PLATFORM_ROOT:-/opt/leon-platform}
export RELEASE_SHA=${RELEASE_SHA:-$(basename "$(readlink -f "${SOURCE_ROOT}")")}
docker network inspect leon-edge >/dev/null 2>&1 || docker network create leon-edge >/dev/null

cd "${SOURCE_ROOT}/infra/ovh"
docker compose --env-file .env up -d database
docker compose --env-file .env exec -T database sh -c \
  'until pg_isready --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"; do sleep 1; done'
docker compose --env-file .env build gateway dashboard photographer
MAINTENANCE_LOCK_HELD=1 SOURCE_ROOT="${SOURCE_ROOT}" /usr/bin/bash "${SOURCE_ROOT}/infra/ovh/scripts/migrate-database.sh"
SOURCE_ROOT="${SOURCE_ROOT}" /usr/bin/bash "${SOURCE_ROOT}/infra/ovh/scripts/configure-runtime-role.sh"
docker compose --env-file .env up -d --no-build --remove-orphans
docker compose ps
for attempt in $(seq 1 "${DEPLOY_HEALTHCHECK_ATTEMPTS:-24}"); do
  if SOURCE_ROOT="${SOURCE_ROOT}" /usr/bin/bash "${SOURCE_ROOT}/infra/ovh/scripts/healthcheck.sh"; then
    break
  fi
  if [[ ${attempt} -eq ${DEPLOY_HEALTHCHECK_ATTEMPTS:-24} ]]; then
    echo "The new release did not become healthy." >&2
    exit 1
  fi
  sleep "${DEPLOY_HEALTHCHECK_INTERVAL_SECONDS:-5}"
done

BUILD_CACHE_RETENTION_HOURS=${BUILD_CACHE_RETENTION_HOURS:-72}
if [[ ${BUILD_CACHE_RETENTION_HOURS} =~ ^[1-9][0-9]*$ ]]; then
  docker builder prune --force --filter "until=${BUILD_CACHE_RETENTION_HOURS}h" >/dev/null
  docker image prune --force --filter "until=${BUILD_CACHE_RETENTION_HOURS}h" >/dev/null
else
  echo "BUILD_CACHE_RETENTION_HOURS must be a positive whole number." >&2
  exit 1
fi
