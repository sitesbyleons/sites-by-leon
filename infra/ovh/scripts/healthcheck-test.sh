#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT=${SOURCE_ROOT:-/opt/leon-platform/current-test}
TEST_SECRETS_ROOT=${TEST_SECRETS_ROOT:-/opt/leon-platform/secrets-test}
TEST_COMPOSE_ENV_FILE=${TEST_COMPOSE_ENV_FILE:-${TEST_SECRETS_ROOT}/.env}
cd "${SOURCE_ROOT}/infra/ovh"
compose=(docker compose --env-file "${TEST_COMPOSE_ENV_FILE}" -f docker-compose.test.yml)

for service in database-test dashboard-test photographer-test gateway-test; do
  container=$("${compose[@]}" ps -q "${service}")
  [[ -n ${container} ]] || { echo "Staging ${service} is not running." >&2; exit 1; }
  state=$(docker inspect --format '{{.State.Status}}' "${container}")
  [[ ${state} == running ]] || { echo "Staging ${service} is ${state}." >&2; exit 1; }
done

"${compose[@]}" exec -T database-test sh -c \
  'pg_isready --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" >/dev/null && psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --tuples-only --command "select count(*) from client_workspaces;" >/dev/null'
health=$("${compose[@]}" exec -T gateway-test sh -c \
  'wget -qO- --header="Host: ${TEST_DOMAIN}" http://127.0.0.1/api/health')
printf '%s' "${health}" | grep -q '"ok":true' || { echo 'Staging dashboard health response is invalid.' >&2; exit 1; }
photographer_health=$("${compose[@]}" exec -T photographer-test node -e "fetch('http://127.0.0.1:4321/api/health').then(async r=>{process.stdout.write(await r.text());if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))")
printf '%s' "${photographer_health}" | grep -q '"service":"leon-photographer-runtime"' \
  || { echo 'Staging photographer health response is invalid.' >&2; exit 1; }

if [[ -n ${TEST_EXTERNAL_URL:-} ]]; then
  curl --fail --silent --show-error --max-time 20 "${TEST_EXTERNAL_URL}" >/dev/null
  curl --fail --silent --show-error --max-time 20 "${TEST_EXTERNAL_URL}/api/health" | grep -q '"ok":true'
fi

echo 'Isolated staging gateway, dashboard, and PostgreSQL health checks passed.'
