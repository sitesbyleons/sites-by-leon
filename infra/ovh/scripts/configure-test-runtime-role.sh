#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT=${SOURCE_ROOT:-/opt/leon-platform/current-test}
TEST_SECRETS_ROOT=${TEST_SECRETS_ROOT:-/opt/leon-platform/secrets-test}
TEST_COMPOSE_ENV_FILE=${TEST_COMPOSE_ENV_FILE:-${TEST_SECRETS_ROOT}/.env}
cd "${SOURCE_ROOT}/infra/ovh"
compose=(docker compose --env-file "${TEST_COMPOSE_ENV_FILE}" -f docker-compose.test.yml)

"${compose[@]}" exec -T database-test sh -s <<'CONTAINER_SH'
set -eu

if [ -z "${POSTGRES_DASHBOARD_PASSWORD:-}" ] || [ "${#POSTGRES_DASHBOARD_PASSWORD}" -lt 32 ]; then
  echo 'POSTGRES_DASHBOARD_PASSWORD must contain at least 32 characters.' >&2
  exit 1
fi

psql --set ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set dashboard_password="$POSTGRES_DASHBOARD_PASSWORD" <<'SQL'
select format(
  'create role leon_test_dashboard login nosuperuser nocreatedb nocreaterole noreplication password %L',
  :'dashboard_password'
)
where not exists (select 1 from pg_roles where rolname = 'leon_test_dashboard') \gexec

select format('alter role leon_test_dashboard password %L', :'dashboard_password') \gexec
alter role leon_test_dashboard login inherit nosuperuser nocreatedb nocreaterole noreplication;
revoke leon_photographer_runtime from leon_test_dashboard;
grant leon_runtime to leon_test_dashboard;
SQL
CONTAINER_SH

echo 'The staging dashboard database login is least-privilege.'
