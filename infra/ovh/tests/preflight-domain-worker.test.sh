#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
PREFLIGHT_SCRIPT=${REPOSITORY_ROOT}/infra/ovh/scripts/preflight-domain-worker.sh
RUNTIME_PREFLIGHT_SCRIPT=${REPOSITORY_ROOT}/infra/ovh/scripts/preflight-runtime-secrets.sh
DEPLOY_SCRIPT=${REPOSITORY_ROOT}/infra/ovh/scripts/deploy.sh
VALID_PASSWORD=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
OTHER_PASSWORD=fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210
VALID_TOKEN=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN
VALID_ZONE=0123456789abcdef0123456789abcdef
PASS_COUNT=0
FIXTURE=''

cleanup() {
  if [[ -n ${FIXTURE} ]]; then
    rm -rf "${FIXTURE}"
  fi
}
trap cleanup EXIT

new_fixture() {
  cleanup
  FIXTURE=$(mktemp -d)
  mkdir -p "${FIXTURE}/infra/ovh/secrets" "${FIXTURE}/infra/ovh/scripts"
  write_valid_secrets
}

write_valid_secrets() {
  cat > "${FIXTURE}/infra/ovh/secrets/domain-worker.env" <<EOF
DATABASE_URL=postgresql://leon_domain_worker:${VALID_PASSWORD}@database:5432/leon_platform
CLOUDFLARE_API_TOKEN=${VALID_TOKEN}
CLOUDFLARE_ZONE_ID=${VALID_ZONE}
EOF
  cat > "${FIXTURE}/infra/ovh/secrets/postgres.env" <<EOF
POSTGRES_DOMAIN_WORKER_PASSWORD=${VALID_PASSWORD}
EOF
  printf 'DASHBOARD_SECRET=%s\n' "${VALID_PASSWORD}" > "${FIXTURE}/infra/ovh/secrets/dashboard.env"
  printf 'PHOTOGRAPHER_SECRET=%s\n' "${OTHER_PASSWORD}" > "${FIXTURE}/infra/ovh/secrets/northline.env"
  printf '%s\n' "${VALID_TOKEN}" > "${FIXTURE}/infra/ovh/secrets/cloudflare-tunnel-token"
  chmod 700 "${FIXTURE}/infra/ovh/secrets"
  chmod 600 \
    "${FIXTURE}/infra/ovh/secrets/domain-worker.env" \
    "${FIXTURE}/infra/ovh/secrets/postgres.env" \
    "${FIXTURE}/infra/ovh/secrets/dashboard.env" \
    "${FIXTURE}/infra/ovh/secrets/northline.env" \
    "${FIXTURE}/infra/ovh/secrets/cloudflare-tunnel-token"
}

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  echo "ok ${PASS_COUNT} - $1"
}

fail_test() {
  echo "not ok - $1" >&2
  exit 1
}

run_preflight() {
  SOURCE_ROOT="${FIXTURE}" bash "${PREFLIGHT_SCRIPT}"
}

expect_preflight_failure() {
  local name=$1
  local expected=$2
  local output
  local status

  set +e
  output=$(run_preflight 2>&1)
  status=$?
  set -e

  if [[ ${status} -eq 0 ]]; then
    fail_test "${name}: preflight unexpectedly passed"
  fi
  if [[ ${output} != *"${expected}"* ]]; then
    fail_test "${name}: expected a safe error containing '${expected}'"
  fi
  if [[ ${output} == *"${VALID_PASSWORD}"* || ${output} == *"${OTHER_PASSWORD}"* || ${output} == *"${VALID_TOKEN}"* ]]; then
    fail_test "${name}: preflight disclosed a secret"
  fi
  pass "${name}"
}

replace_line() {
  local file=$1
  local key=$2
  local replacement=$3
  local temporary=${file}.new
  : > "${temporary}"
  while IFS= read -r line || [[ -n ${line} ]]; do
    if [[ ${line} == "${key}="* ]]; then
      printf '%s\n' "${replacement}" >> "${temporary}"
    else
      printf '%s\n' "${line}" >> "${temporary}"
    fi
  done < "${file}"
  mv "${temporary}" "${file}"
  chmod 600 "${file}"
}

remove_line() {
  local file=$1
  local key=$2
  local temporary=${file}.new
  : > "${temporary}"
  while IFS= read -r line || [[ -n ${line} ]]; do
    if [[ ${line} != "${key}="* ]]; then
      printf '%s\n' "${line}" >> "${temporary}"
    fi
  done < "${file}"
  mv "${temporary}" "${file}"
  chmod 600 "${file}"
}

prepare_deploy_fixture() {
  mkdir -p "${FIXTURE}/infra/ovh/tests" "${FIXTURE}/bin"
  cp "${DEPLOY_SCRIPT}" "${FIXTURE}/infra/ovh/scripts/deploy.sh"
  cp "${PREFLIGHT_SCRIPT}" "${FIXTURE}/infra/ovh/scripts/preflight-domain-worker.sh"
  cp "${RUNTIME_PREFLIGHT_SCRIPT}" "${FIXTURE}/infra/ovh/scripts/preflight-runtime-secrets.sh"
  cat > "${FIXTURE}/bin/docker" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "${DOCKER_CALL_LOG}"
exit 91
EOF
  chmod +x "${FIXTURE}/bin/docker"
}

run_deploy() {
  chmod 600 "${FIXTURE}/infra/ovh/.env"
  DOCKER_CALL_LOG="${FIXTURE}/docker-calls" \
    HEALTHCHECK_ENV_LOG="${FIXTURE}/healthcheck-env" \
    MAINTENANCE_LOCK="${FIXTURE}/maintenance.lock" \
    SOURCE_ROOT="${FIXTURE}" \
    PLATFORM_ROOT="${FIXTURE}/platform" \
    SECRETS_ROOT="${FIXTURE}/infra/ovh/secrets" \
    COMPOSE_ENV_FILE="${FIXTURE}/infra/ovh/.env" \
    DEPLOY_HEALTHCHECK_ATTEMPTS=1 \
    DEPLOY_HEALTHCHECK_INTERVAL_SECONDS=0 \
    PATH="${FIXTURE}/bin:${PATH}" \
    bash "${FIXTURE}/infra/ovh/scripts/deploy.sh"
}

prepare_complete_deploy_fixture() {
  mkdir -p "${FIXTURE}/bin"
  cp "${DEPLOY_SCRIPT}" "${FIXTURE}/infra/ovh/scripts/deploy.sh"
  cp "${PREFLIGHT_SCRIPT}" "${FIXTURE}/infra/ovh/scripts/preflight-domain-worker.sh"
  cp "${RUNTIME_PREFLIGHT_SCRIPT}" "${FIXTURE}/infra/ovh/scripts/preflight-runtime-secrets.sh"
  cat > "${FIXTURE}/bin/docker" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "${DOCKER_CALL_LOG}"
EOF
  cat > "${FIXTURE}/infra/ovh/scripts/migrate-database.sh" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
  cat > "${FIXTURE}/infra/ovh/scripts/configure-runtime-role.sh" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
  cat > "${FIXTURE}/infra/ovh/scripts/healthcheck.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n%s\n' \
  "${COMPOSE_PROFILES:-<unset>}" \
  "${CUSTOM_DOMAIN_AUTOMATION_ENABLED:-<unset>}" \
  > "${HEALTHCHECK_ENV_LOG}"
[[ ${COMPOSE_PROFILES:-} == tunnel,domains ]]
[[ ${CUSTOM_DOMAIN_AUTOMATION_ENABLED:-} == true ]]
EOF
  chmod +x "${FIXTURE}/bin/docker" "${FIXTURE}/infra/ovh/scripts/"*.sh
}

new_fixture
output=$(run_preflight)
[[ ${output} == 'Custom-domain deployment preflight passed.' ]] || fail_test 'valid configuration did not pass'
pass 'valid restricted credentials pass'

new_fixture
rm "${FIXTURE}/infra/ovh/secrets/domain-worker.env"
expect_preflight_failure 'missing domain-worker.env is rejected' 'domain-worker.env must be a regular'

new_fixture
chmod 640 "${FIXTURE}/infra/ovh/secrets/domain-worker.env"
expect_preflight_failure 'group-readable domain-worker.env is rejected' 'domain-worker.env must have mode 600'

new_fixture
chmod 640 "${FIXTURE}/infra/ovh/secrets/postgres.env"
expect_preflight_failure 'group-readable postgres.env is rejected' 'postgres.env must have mode 600'

new_fixture
remove_line "${FIXTURE}/infra/ovh/secrets/domain-worker.env" CLOUDFLARE_API_TOKEN
expect_preflight_failure 'missing required worker key is rejected' 'CLOUDFLARE_API_TOKEN must appear exactly once'

new_fixture
printf 'CLOUDFLARE_ZONE_ID=%s\n' "${VALID_ZONE}" >> "${FIXTURE}/infra/ovh/secrets/domain-worker.env"
expect_preflight_failure 'duplicate required worker key is rejected' 'CLOUDFLARE_ZONE_ID must appear exactly once'

new_fixture
replace_line "${FIXTURE}/infra/ovh/secrets/domain-worker.env" CLOUDFLARE_API_TOKEN 'CLOUDFLARE_API_TOKEN=replace_with_scoped_cloudflare_token'
expect_preflight_failure 'placeholder worker token is rejected' 'CLOUDFLARE_API_TOKEN still contains a placeholder'

new_fixture
replace_line "${FIXTURE}/infra/ovh/secrets/domain-worker.env" CLOUDFLARE_ZONE_ID 'CLOUDFLARE_ZONE_ID=not-a-zone-id'
expect_preflight_failure 'malformed Cloudflare zone id is rejected' '32-character hexadecimal'

new_fixture
replace_line "${FIXTURE}/infra/ovh/secrets/domain-worker.env" DATABASE_URL "DATABASE_URL=postgresql://leon_domain_worker:${VALID_PASSWORD}@elsewhere:5432/leon_platform"
expect_preflight_failure 'malformed database endpoint is rejected' 'restricted leon_domain_worker login and internal database endpoint'

new_fixture
remove_line "${FIXTURE}/infra/ovh/secrets/postgres.env" POSTGRES_DOMAIN_WORKER_PASSWORD
expect_preflight_failure 'missing database role password is rejected' 'POSTGRES_DOMAIN_WORKER_PASSWORD must appear exactly once'

new_fixture
replace_line "${FIXTURE}/infra/ovh/secrets/postgres.env" POSTGRES_DOMAIN_WORKER_PASSWORD 'POSTGRES_DOMAIN_WORKER_PASSWORD=too-short'
expect_preflight_failure 'short database role password is rejected' 'at least 32 characters'

new_fixture
replace_line "${FIXTURE}/infra/ovh/secrets/postgres.env" POSTGRES_DOMAIN_WORKER_PASSWORD "POSTGRES_DOMAIN_WORKER_PASSWORD=${OTHER_PASSWORD}"
expect_preflight_failure 'mismatched database passwords are rejected without disclosure' 'does not match'

new_fixture
prepare_deploy_fixture
cat > "${FIXTURE}/infra/ovh/.env" <<'EOF'
CUSTOM_DOMAIN_AUTOMATION_ENABLED=true
COMPOSE_PROFILES=tunnel,domains
PUBLIC_SITE_MODE=coming-soon
EOF
rm "${FIXTURE}/infra/ovh/secrets/domain-worker.env"
set +e
deploy_output=$(run_deploy 2>&1)
deploy_status=$?
set -e
[[ ${deploy_status} -ne 0 ]] || fail_test 'deploy with missing worker secret unexpectedly passed'
[[ ${deploy_output} == *'domain-worker.env must be a regular'* ]] || fail_test 'deploy did not report its preflight failure'
[[ ! -e ${FIXTURE}/docker-calls ]] || fail_test 'deploy called Docker before failed domain preflight'
pass 'enabled deployment fails before Docker mutation when preflight fails'

new_fixture
prepare_deploy_fixture
cat > "${FIXTURE}/infra/ovh/.env" <<'EOF'
CUSTOM_DOMAIN_AUTOMATION_ENABLED=true
COMPOSE_PROFILES=tunnel
PUBLIC_SITE_MODE=coming-soon
EOF
set +e
deploy_output=$(run_deploy 2>&1)
deploy_status=$?
set -e
[[ ${deploy_status} -ne 0 ]] || fail_test 'mismatched API/profile deployment unexpectedly passed'
[[ ${deploy_output} == *'enabled or disabled together'* ]] || fail_test 'mismatched API/profile error changed'
[[ ! -e ${FIXTURE}/docker-calls ]] || fail_test 'mismatched API/profile deployment called Docker'
pass 'API and domains profile parity still fails before Docker mutation'

new_fixture
prepare_deploy_fixture
cat > "${FIXTURE}/infra/ovh/.env" <<'EOF'
CUSTOM_DOMAIN_AUTOMATION_ENABLED=true
COMPOSE_PROFILES=tunnel,domains
PUBLIC_SITE_MODE=coming-soon
EOF
set +e
deploy_output=$(run_deploy 2>&1)
deploy_status=$?
set -e
[[ ${deploy_status} -ne 0 ]] || fail_test 'fake Docker deployment unexpectedly passed'
[[ ${deploy_output} == *'Custom-domain deployment preflight passed.'* ]] || fail_test 'combined tunnel/domains profile did not pass preflight'
[[ -s ${FIXTURE}/docker-calls ]] || fail_test 'combined tunnel/domains profile did not continue to Docker after preflight'
pass 'combined tunnel and domains profile remains supported'

new_fixture
prepare_deploy_fixture
cat > "${FIXTURE}/infra/ovh/.env" <<'EOF'
CUSTOM_DOMAIN_AUTOMATION_ENABLED=false
COMPOSE_PROFILES=tunnel
PUBLIC_SITE_MODE=coming-soon
EOF
rm "${FIXTURE}/infra/ovh/secrets/domain-worker.env"
set +e
run_deploy >/dev/null 2>&1
deploy_status=$?
set -e
[[ ${deploy_status} -ne 0 ]] || fail_test 'fake Docker deployment unexpectedly passed'
[[ -s ${FIXTURE}/docker-calls ]] || fail_test 'tunnel-only deployment did not continue without worker secrets'
pass 'tunnel-only deployment does not require domain-worker secrets'

new_fixture
prepare_complete_deploy_fixture
cat > "${FIXTURE}/infra/ovh/.env" <<'EOF'
CUSTOM_DOMAIN_AUTOMATION_ENABLED=true
COMPOSE_PROFILES=tunnel,domains
PUBLIC_SITE_MODE=coming-soon
EOF
if ! (unset COMPOSE_PROFILES CUSTOM_DOMAIN_AUTOMATION_ENABLED; run_deploy) >/dev/null 2>&1; then
  fail_test 'deployment did not pass .env domain settings to its healthcheck'
fi
expected_healthcheck_env=$'tunnel,domains\ntrue'
actual_healthcheck_env=$(cat "${FIXTURE}/healthcheck-env")
[[ ${actual_healthcheck_env} == "${expected_healthcheck_env}" ]] || \
  fail_test 'healthcheck did not receive the resolved deploy domain settings'
pass 'deployment passes resolved .env domain settings to its healthcheck'

echo "1..${PASS_COUNT}"
