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
docker network inspect leon-edge >/dev/null 2>&1 || docker network create leon-edge >/dev/null

cd "${SOURCE_ROOT}/infra/ovh"
docker compose --env-file .env up -d database
docker compose --env-file .env exec -T database sh -c \
  'until pg_isready --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"; do sleep 1; done'
MAINTENANCE_LOCK_HELD=1 SOURCE_ROOT="${SOURCE_ROOT}" /usr/bin/bash "${SOURCE_ROOT}/infra/ovh/scripts/migrate-database.sh"
docker compose --env-file .env up -d --build
docker compose ps
