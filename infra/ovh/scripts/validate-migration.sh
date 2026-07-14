#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT=${SOURCE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}
SCHEMA_PATH=${SCHEMA_PATH:-${SOURCE_ROOT}/infra/ovh/postgres/schema.sql}
VALIDATION_DATABASE=leon_platform_migration_check
cd "${SOURCE_ROOT}/infra/ovh"

cleanup() {
  docker compose --env-file .env exec -T database sh -c \
    'dropdb --if-exists --force --username "$POSTGRES_USER" leon_platform_migration_check; rm -f /tmp/leon-platform-migration-check.dump' >/dev/null
}
trap cleanup EXIT

cleanup
docker compose --env-file .env exec -T database sh -c '
  set -eu
  pg_dump --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --format custom \
    --no-owner --no-privileges --file /tmp/leon-platform-migration-check.dump
  createdb --username "$POSTGRES_USER" leon_platform_migration_check
  pg_restore --exit-on-error --username "$POSTGRES_USER" --dbname leon_platform_migration_check \
    --no-owner --no-privileges /tmp/leon-platform-migration-check.dump >/dev/null
'

docker compose --env-file .env exec -T database sh -c \
  'psql --set ON_ERROR_STOP=1 --single-transaction --username "$POSTGRES_USER" --dbname leon_platform_migration_check' \
  < "${SCHEMA_PATH}" >/dev/null

docker compose --env-file .env exec -T database sh -c '
  psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname leon_platform_migration_check --tuples-only --command "
    select count(*)
    from information_schema.columns
    where table_schema = '\''public'\''
      and (
        (table_name = '\''site_connections'\'' and column_name in ('\''billing_mode'\'', '\''desired_status'\'', '\''archived_at'\''))
        or (table_name = '\''site_domain_aliases'\'' and column_name = '\''hostname'\'')
        or (table_name = '\''domain_jobs'\'' and column_name = '\''status'\'')
      );
  " | grep -Eq "^[[:space:]]*5[[:space:]]*$"
'

echo "The migration passed against a disposable copy of production data."
