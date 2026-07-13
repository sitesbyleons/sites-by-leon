#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT=${SOURCE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}
MARKETING_URL=${MARKETING_URL:-https://leonsites.org}
DEMO_URL=${DEMO_URL:-https://demo.leonsites.org}
TEST_URL=${TEST_URL:-https://test.leonsites.org}

curl --fail --silent --show-error --location "${MARKETING_URL}" >/dev/null
curl --fail --silent --show-error --location "${TEST_URL}" >/dev/null
curl --fail --silent --show-error "${MARKETING_URL}/api/health" | jq -e '.ok == true' >/dev/null
curl --fail --silent --show-error "${DEMO_URL}/api/health" | jq -e '.ok == true' >/dev/null
cd "${SOURCE_ROOT}/infra/ovh"
docker compose exec -T database pg_isready --username "${POSTGRES_USER:-leon_app}" --dbname "${POSTGRES_DB:-leon_platform}" >/dev/null
docker compose exec -T database psql --username "${POSTGRES_USER:-leon_app}" --dbname "${POSTGRES_DB:-leon_platform}" --tuples-only --command \
  "select count(*) from client_workspaces;" >/dev/null
echo "Marketing, dashboard, demo, API, and PostgreSQL health checks passed."
