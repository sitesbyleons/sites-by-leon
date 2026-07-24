#!/usr/bin/env bash
set -euo pipefail

MAINTENANCE_LOCK=${MAINTENANCE_LOCK:-/run/lock/leon-platform-maintenance.lock}
if [[ ${MAINTENANCE_LOCK_HELD:-0} != 1 ]]; then
  exec 9>"${MAINTENANCE_LOCK}"
  flock -w "${MAINTENANCE_LOCK_TIMEOUT:-900}" 9 || { echo 'Another platform deployment is running.' >&2; exit 1; }
fi

SOURCE_ROOT=${SOURCE_ROOT:-/opt/leon-platform/current-test}
SOURCE_ROOT=$(readlink -f "${SOURCE_ROOT}")
TEST_SECRETS_ROOT=${TEST_SECRETS_ROOT:-/opt/leon-platform/secrets-test}
TEST_COMPOSE_ENV_FILE=${TEST_COMPOSE_ENV_FILE:-${TEST_SECRETS_ROOT}/.env}
export TEST_SECRETS_ROOT RELEASE_SHA=${RELEASE_SHA:-$(basename "${SOURCE_ROOT}")}

TEST_SECRETS_ROOT="${TEST_SECRETS_ROOT}" TEST_COMPOSE_ENV_FILE="${TEST_COMPOSE_ENV_FILE}" \
  /usr/bin/bash "${SOURCE_ROOT}/infra/ovh/scripts/preflight-test-secrets.sh"
cd "${SOURCE_ROOT}/infra/ovh"
compose=(docker compose --env-file "${TEST_COMPOSE_ENV_FILE}" -f docker-compose.test.yml)

docker network inspect leon-edge >/dev/null 2>&1 || docker network create leon-edge >/dev/null
"${compose[@]}" up -d database-test
"${compose[@]}" exec -T database-test sh -c \
  'until psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --command "select 1" >/dev/null 2>&1; do sleep 1; done'
"${compose[@]}" exec -T database-test sh -c \
  'psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"' <<'SQL'
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'leon_runtime') then create role leon_runtime nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'leon_photographer_runtime') then create role leon_photographer_runtime nologin; end if;
end $$;
SQL
"${compose[@]}" exec -T database-test sh -c \
  'psql --set ON_ERROR_STOP=1 --single-transaction --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"' \
  < "${SOURCE_ROOT}/infra/ovh/postgres/schema.sql"
SOURCE_ROOT="${SOURCE_ROOT}" TEST_SECRETS_ROOT="${TEST_SECRETS_ROOT}" TEST_COMPOSE_ENV_FILE="${TEST_COMPOSE_ENV_FILE}" \
  /usr/bin/bash "${SOURCE_ROOT}/infra/ovh/scripts/configure-test-runtime-role.sh"
"${compose[@]}" build gateway-test dashboard-test photographer-test
"${compose[@]}" up -d --no-build --remove-orphans
SOURCE_ROOT="${SOURCE_ROOT}" TEST_SECRETS_ROOT="${TEST_SECRETS_ROOT}" TEST_COMPOSE_ENV_FILE="${TEST_COMPOSE_ENV_FILE}" \
  /usr/bin/bash "${SOURCE_ROOT}/infra/ovh/scripts/healthcheck-test.sh"

BUILD_CACHE_RETENTION_HOURS=${BUILD_CACHE_RETENTION_HOURS:-72}
BUILD_CACHE_MAX_SIZE=${BUILD_CACHE_MAX_SIZE:-8GB}
if [[ ${BUILD_CACHE_RETENTION_HOURS} =~ ^[1-9][0-9]*$ && ${BUILD_CACHE_MAX_SIZE} =~ ^[1-9][0-9]*(B|KB|MB|GB)$ ]]; then
  docker builder prune --force --filter "until=${BUILD_CACHE_RETENTION_HOURS}h" >/dev/null
  docker builder prune --force --max-used-space "${BUILD_CACHE_MAX_SIZE}" >/dev/null
  docker image prune --force --filter "until=${BUILD_CACHE_RETENTION_HOURS}h" >/dev/null
else
  echo "Build-cache retention and maximum size settings are invalid." >&2
  exit 1
fi

echo "Staging release ${RELEASE_SHA} deployed independently."
