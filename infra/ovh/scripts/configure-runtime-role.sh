#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT=${SOURCE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}
cd "${SOURCE_ROOT}/infra/ovh"

docker compose --env-file .env exec -T database sh -c '
  set -eu
  if [ -z "${POSTGRES_RUNTIME_PASSWORD:-}" ] || [ "${#POSTGRES_RUNTIME_PASSWORD}" -lt 32 ]; then
    echo "POSTGRES_RUNTIME_PASSWORD must contain at least 32 characters." >&2
    exit 1
  fi
  psql --set ON_ERROR_STOP=1 \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    --set runtime_password="$POSTGRES_RUNTIME_PASSWORD" <<'"'"'SQL'"'"'
select format(
  '"'"'create role leon_web login nosuperuser nocreatedb nocreaterole noreplication password %L'"'"',
  :'"'"'runtime_password'"'"'
)
where not exists (select 1 from pg_roles where rolname = '"'"'leon_web'"'"') \gexec

select format('"'"'alter role leon_web password %L'"'"', :'"'"'runtime_password'"'"') \gexec
alter role leon_web nosuperuser nocreatedb nocreaterole noreplication;
grant leon_runtime to leon_web;
SQL
'

echo "Least-privilege application database login is configured."
