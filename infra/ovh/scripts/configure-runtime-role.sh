#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT=${SOURCE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}
SECRETS_ROOT=${SECRETS_ROOT:-${SOURCE_ROOT}/infra/ovh/secrets}
COMPOSE_ENV_FILE=${COMPOSE_ENV_FILE:-${SOURCE_ROOT}/infra/ovh/.env}
export SECRETS_ROOT
cd "${SOURCE_ROOT}/infra/ovh"

docker compose --env-file "${COMPOSE_ENV_FILE}" exec \
  -e DISABLE_LEGACY_RUNTIME_ROLE="${DISABLE_LEGACY_RUNTIME_ROLE:-false}" \
  -T database sh -s <<'CONTAINER_SH'
set -eu

if [ -z "${POSTGRES_DASHBOARD_PASSWORD:-}" ] || [ "${#POSTGRES_DASHBOARD_PASSWORD}" -lt 32 ]; then
  echo "POSTGRES_DASHBOARD_PASSWORD must contain at least 32 characters." >&2
  exit 1
fi
if [ -z "${POSTGRES_PHOTOGRAPHER_PASSWORD:-}" ] || [ "${#POSTGRES_PHOTOGRAPHER_PASSWORD}" -lt 32 ]; then
  echo "POSTGRES_PHOTOGRAPHER_PASSWORD must contain at least 32 characters." >&2
  exit 1
fi
if [ "${POSTGRES_DASHBOARD_PASSWORD}" = "${POSTGRES_PHOTOGRAPHER_PASSWORD}" ]; then
  echo "Dashboard and photographer database passwords must be different." >&2
  exit 1
fi
if [ "${DISABLE_LEGACY_RUNTIME_ROLE}" != true ] && [ "${DISABLE_LEGACY_RUNTIME_ROLE}" != false ]; then
  echo "DISABLE_LEGACY_RUNTIME_ROLE must be true or false." >&2
  exit 1
fi

psql --set ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set dashboard_password="$POSTGRES_DASHBOARD_PASSWORD" \
  --set photographer_password="$POSTGRES_PHOTOGRAPHER_PASSWORD" <<'SQL'
select format(
  'create role leon_dashboard login nosuperuser nocreatedb nocreaterole noreplication password %L',
  :'dashboard_password'
)
where not exists (select 1 from pg_roles where rolname = 'leon_dashboard') \gexec

select format('alter role leon_dashboard password %L', :'dashboard_password') \gexec
alter role leon_dashboard login inherit nosuperuser nocreatedb nocreaterole noreplication;
revoke leon_photographer_runtime from leon_dashboard;
grant leon_runtime to leon_dashboard;

select format(
  'create role leon_photographer login nosuperuser nocreatedb nocreaterole noreplication password %L',
  :'photographer_password'
)
where not exists (select 1 from pg_roles where rolname = 'leon_photographer') \gexec

select format('alter role leon_photographer password %L', :'photographer_password') \gexec
alter role leon_photographer login inherit nosuperuser nocreatedb nocreaterole noreplication;
revoke leon_runtime from leon_photographer;
grant leon_photographer_runtime to leon_photographer;
SQL

if [ "${DISABLE_LEGACY_RUNTIME_ROLE}" = true ]; then
  psql --set ON_ERROR_STOP=1 \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" <<'SQL'
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'leon_web') then
    execute 'revoke leon_runtime from leon_web';
    execute 'revoke leon_photographer_runtime from leon_web';
    execute 'alter role leon_web nologin';
  end if;
end $$;
SQL
fi

if [ -n "${POSTGRES_DOMAIN_WORKER_PASSWORD:-}" ]; then
  if [ "${#POSTGRES_DOMAIN_WORKER_PASSWORD}" -lt 32 ]; then
    echo "POSTGRES_DOMAIN_WORKER_PASSWORD must contain at least 32 characters when domain automation is enabled." >&2
    exit 1
  fi
  psql --set ON_ERROR_STOP=1 \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    --set domain_worker_password="$POSTGRES_DOMAIN_WORKER_PASSWORD" <<'SQL'
select format(
  'create role leon_domain_worker login nosuperuser nocreatedb nocreaterole noreplication password %L',
  :'domain_worker_password'
)
where not exists (select 1 from pg_roles where rolname = 'leon_domain_worker') \gexec

select format('alter role leon_domain_worker password %L', :'domain_worker_password') \gexec
alter role leon_domain_worker login inherit nosuperuser nocreatedb nocreaterole noreplication;
grant usage on schema public to leon_domain_worker;
revoke all on table site_domain_aliases, domain_jobs from leon_domain_worker;
grant select, update on table site_domain_aliases to leon_domain_worker;
grant select, update on table domain_jobs to leon_domain_worker;
SQL
else
  echo "Custom-domain worker database login is not enabled yet."
fi
CONTAINER_SH

echo "Separate least-privilege application database logins are configured."
