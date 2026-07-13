#!/usr/bin/env bash
set -euo pipefail

COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-leon-platform}
MARKETING_URL=${MARKETING_URL:-https://leonsites.org}
DEMO_URL=${DEMO_URL:-https://demo.leonsites.org}
TEST_URL=${TEST_URL:-https://test.leonsites.org}

curl --fail --silent --show-error --location "${MARKETING_URL}" >/dev/null
curl --fail --silent --show-error --location "${TEST_URL}" >/dev/null
curl --fail --silent --show-error "${MARKETING_URL}/api/health" | jq -e '.ok == true' >/dev/null
curl --fail --silent --show-error "${DEMO_URL}/api/health" | jq -e '.ok == true' >/dev/null

mapfile -t database_containers < <(
  docker ps \
    --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME}" \
    --filter "label=com.docker.compose.service=database" \
    --format '{{.ID}}'
)
if [[ ${#database_containers[@]} -ne 1 ]]; then
  echo "Expected one running ${COMPOSE_PROJECT_NAME} database container; found ${#database_containers[@]}." >&2
  exit 1
fi
database_container=${database_containers[0]}
docker exec "${database_container}" sh -c \
  'pg_isready --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"' >/dev/null
docker exec "${database_container}" sh -c \
  'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --tuples-only --command "select count(*) from client_workspaces;"' >/dev/null
echo "Marketing, dashboard, demo, API, and PostgreSQL health checks passed."
