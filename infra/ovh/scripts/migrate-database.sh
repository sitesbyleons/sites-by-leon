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

SOURCE_ROOT=${SOURCE_ROOT:-/opt/leon-platform/current}
SOURCE_ROOT=$(readlink -f "${SOURCE_ROOT}")
SECRETS_ROOT=${SECRETS_ROOT:-${SOURCE_ROOT}/infra/ovh/secrets}
COMPOSE_ENV_FILE=${COMPOSE_ENV_FILE:-${SOURCE_ROOT}/infra/ovh/.env}
export SECRETS_ROOT

cd "${SOURCE_ROOT}/infra/ovh"
docker compose --env-file "${COMPOSE_ENV_FILE}" exec -T database sh -c \
  'psql --set ON_ERROR_STOP=1 --single-transaction --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"' \
  < "${SOURCE_ROOT}/infra/ovh/postgres/schema.sql"

echo "Database schema is up to date."
