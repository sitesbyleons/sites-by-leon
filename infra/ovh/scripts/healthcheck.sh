#!/usr/bin/env bash
set -euo pipefail

COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-leon-platform}
MARKETING_URL=${MARKETING_URL:-https://leonsites.org}
DEMO_URL=${DEMO_URL:-https://demo.leonsites.org}
TEST_URL=${TEST_URL:-https://test.leonsites.org}
CURL_CONNECT_TIMEOUT_SECONDS=${CURL_CONNECT_TIMEOUT_SECONDS:-5}
CURL_MAX_TIME_SECONDS=${CURL_MAX_TIME_SECONDS:-20}
for positive_number in CURL_CONNECT_TIMEOUT_SECONDS CURL_MAX_TIME_SECONDS; do
  if [[ ! ${!positive_number} =~ ^[1-9][0-9]*$ ]]; then
    echo "${positive_number} must be a positive whole number." >&2
    exit 1
  fi
done
curl_options=(
  --fail
  --silent
  --show-error
  --connect-timeout "${CURL_CONNECT_TIMEOUT_SECONDS}"
  --max-time "${CURL_MAX_TIME_SECONDS}"
)

curl "${curl_options[@]}" --location "${MARKETING_URL}" >/dev/null
curl "${curl_options[@]}" --location "${TEST_URL}" >/dev/null
curl "${curl_options[@]}" "${MARKETING_URL}/api/health" | jq -e '.ok == true' >/dev/null
curl "${curl_options[@]}" "${DEMO_URL}/api/health" | jq -e '.ok == true' >/dev/null

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
