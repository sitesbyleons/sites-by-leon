#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
VALIDATOR_SCRIPT=${1:-${REPOSITORY_ROOT}/infra/ovh/scripts/validate-migration.sh}
BASE_SCHEMA_REF=${BASE_SCHEMA_REF:-HEAD}
SCHEMA_PATH=infra/ovh/postgres/schema.sql
FIXTURE=$(mktemp -d)
COMPOSE_PROJECT_NAME="leon-migration-${GITHUB_RUN_ID:-$$}-${GITHUB_RUN_ATTEMPT:-1}"
export COMPOSE_PROJECT_NAME

cleanup() {
  if [[ -f ${FIXTURE}/infra/ovh/.env ]]; then
    docker compose \
      --project-directory "${FIXTURE}/infra/ovh" \
      --env-file "${FIXTURE}/infra/ovh/.env" \
      down --volumes --remove-orphans >/dev/null 2>&1 || true
  fi
  rm -rf "${FIXTURE}"
}
trap cleanup EXIT

if [[ ! -f ${VALIDATOR_SCRIPT} ]]; then
  echo "Migration validator not found: ${VALIDATOR_SCRIPT}" >&2
  exit 1
fi
if ! git -C "${REPOSITORY_ROOT}" cat-file -e "${BASE_SCHEMA_REF}:${SCHEMA_PATH}" 2>/dev/null; then
  echo "Base schema ${BASE_SCHEMA_REF}:${SCHEMA_PATH} is unavailable." >&2
  exit 1
fi

mkdir -p \
  "${FIXTURE}/infra/ovh/postgres" \
  "${FIXTURE}/infra/ovh/secrets" \
  "${FIXTURE}/uploads"
cp "${REPOSITORY_ROOT}/infra/ovh/docker-compose.yml" "${FIXTURE}/infra/ovh/docker-compose.yml"
git -C "${REPOSITORY_ROOT}" show "${BASE_SCHEMA_REF}:${SCHEMA_PATH}" \
  > "${FIXTURE}/infra/ovh/postgres/schema.sql"

cat > "${FIXTURE}/infra/ovh/.env" <<EOF
MARKETING_DOMAIN=leonsites.example.test
MARKETING_WWW_DOMAIN=www.leonsites.example.test
TEST_DOMAIN=test.leonsites.example.test
DEMO_DOMAIN=demo.leonsites.example.test
MEDIA_DOMAIN=media.leonsites.example.test
PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_ci
UPLOADS_PATH=${FIXTURE}/uploads
CLOUDFLARE_TUNNEL_TOKEN_FILE=${FIXTURE}/cloudflare-token
CUSTOM_DOMAIN_AUTOMATION_ENABLED=false
COMPOSE_PROFILES=
EOF

cat > "${FIXTURE}/infra/ovh/secrets/postgres.env" <<'EOF'
POSTGRES_DB=leon_platform
POSTGRES_USER=leon_admin
POSTGRES_PASSWORD=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
POSTGRES_RUNTIME_PASSWORD=123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0
POSTGRES_DOMAIN_WORKER_PASSWORD=23456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef01
EOF
printf 'ci-placeholder-token\n' > "${FIXTURE}/cloudflare-token"
chmod 600 \
  "${FIXTURE}/infra/ovh/.env" \
  "${FIXTURE}/infra/ovh/secrets/postgres.env" \
  "${FIXTURE}/cloudflare-token"

docker compose \
  --project-directory "${FIXTURE}/infra/ovh" \
  --env-file "${FIXTURE}/infra/ovh/.env" \
  up -d database

database_ready=false
consecutive_ready_checks=0
for _ in $(seq 1 60); do
  if docker compose \
    --project-directory "${FIXTURE}/infra/ovh" \
    --env-file "${FIXTURE}/infra/ovh/.env" \
    exec -T database sh -c \
      'pg_isready --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" >/dev/null && psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --tuples-only --command "select exists (select 1 from pg_roles where rolname = '\''leon_runtime'\'');" | grep -Eq "^[[:space:]]*t[[:space:]]*$"' \
      >/dev/null 2>&1; then
    consecutive_ready_checks=$((consecutive_ready_checks + 1))
    if [[ ${consecutive_ready_checks} -ge 3 ]]; then
      database_ready=true
      break
    fi
  else
    consecutive_ready_checks=0
  fi
  sleep 1
done
if [[ ${database_ready} != true ]]; then
  echo 'Disposable migration database did not become ready.' >&2
  exit 1
fi

cp "${REPOSITORY_ROOT}/${SCHEMA_PATH}" "${FIXTURE}/infra/ovh/postgres/schema.sql"
SOURCE_ROOT="${FIXTURE}" /usr/bin/bash "${VALIDATOR_SCRIPT}"
