#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
HEALTHCHECK_SCRIPT=${REPOSITORY_ROOT}/infra/ovh/scripts/healthcheck.sh
FIXTURE=$(mktemp -d)
PASS_COUNT=0

cleanup() {
  rm -rf "${FIXTURE}"
}
trap cleanup EXIT

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  echo "ok ${PASS_COUNT} - $1"
}

fail_test() {
  echo "not ok - $1" >&2
  exit 1
}

cat > "${FIXTURE}/curl" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *'/api/health'* ]]; then
  printf '{"ok":true}\n'
fi
EOF

cat > "${FIXTURE}/jq" <<'EOF'
#!/usr/bin/env bash
cat >/dev/null
EOF

cat > "${FIXTURE}/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

command_name=${1:-}
shift || true
arguments="$*"

case "${command_name}" in
  ps)
    if [[ ${arguments} == *'com.docker.compose.service=database'* ]]; then
      echo database-1
    elif [[ ${arguments} == *'com.docker.compose.service=domain-worker'* ]]; then
      case "${FAKE_DOMAIN_WORKER_STATE:-missing}" in
        healthy|unhealthy) echo domain-worker-1 ;;
        duplicate) printf 'domain-worker-1\ndomain-worker-2\n' ;;
      esac
    fi
    ;;
  exec)
    if [[ ${arguments} == *'select distinct lower(primary_domain)'* ]]; then
      echo demo.leonsites.org
    elif [[ ${arguments} == *'select count(*) from client_workspaces'* ]]; then
      echo 1
    fi
    ;;
  inspect)
    if [[ ${FAKE_DOMAIN_WORKER_STATE:-missing} == healthy ]]; then
      echo running:healthy
    else
      echo running:unhealthy
    fi
    ;;
  *)
    echo "Unexpected Docker command: ${command_name} ${arguments}" >&2
    exit 1
    ;;
esac
EOF

chmod +x "${FIXTURE}/curl" "${FIXTURE}/docker" "${FIXTURE}/jq"

run_healthcheck() {
  PATH="${FIXTURE}:${PATH}" \
    MARKETING_URL=https://leonsites.org \
    TEST_URL=https://test.leonsites.org \
    bash "${HEALTHCHECK_SCRIPT}"
}

expect_failure() {
  local name=$1
  local expected=$2
  local output
  local status

  set +e
  output=$(run_healthcheck 2>&1)
  status=$?
  set -e

  [[ ${status} -ne 0 ]] || fail_test "${name}: healthcheck unexpectedly passed"
  [[ ${output} == *"${expected}"* ]] || fail_test "${name}: expected '${expected}'"
  pass "${name}"
}

COMPOSE_PROFILES=tunnel,domains \
CUSTOM_DOMAIN_AUTOMATION_ENABLED=false \
FAKE_DOMAIN_WORKER_STATE=missing \
expect_failure 'domains profile requires the worker' 'Expected one running domain worker container; found 0.'

COMPOSE_PROFILES=tunnel \
CUSTOM_DOMAIN_AUTOMATION_ENABLED=true \
FAKE_DOMAIN_WORKER_STATE=missing \
expect_failure 'enabled domain API requires the worker' 'Expected one running domain worker container; found 0.'

COMPOSE_PROFILES=tunnel,domains \
CUSTOM_DOMAIN_AUTOMATION_ENABLED=true \
FAKE_DOMAIN_WORKER_STATE=duplicate \
expect_failure 'enabled automation rejects duplicate workers' 'Expected one running domain worker container; found 2.'

COMPOSE_PROFILES=tunnel,domains \
CUSTOM_DOMAIN_AUTOMATION_ENABLED=true \
FAKE_DOMAIN_WORKER_STATE=unhealthy \
expect_failure 'enabled automation rejects an unhealthy worker' 'Custom-domain worker is not healthy (running:unhealthy).'

if ! COMPOSE_PROFILES=tunnel CUSTOM_DOMAIN_AUTOMATION_ENABLED=false FAKE_DOMAIN_WORKER_STATE=missing run_healthcheck >/dev/null; then
  fail_test 'disabled domain automation should not require a worker'
fi
pass 'disabled domain automation does not require a worker'

if ! COMPOSE_PROFILES=tunnel,domains CUSTOM_DOMAIN_AUTOMATION_ENABLED=true FAKE_DOMAIN_WORKER_STATE=healthy run_healthcheck >/dev/null; then
  fail_test 'healthy domain automation should pass'
fi
pass 'enabled domain automation accepts one healthy worker'

echo "1..${PASS_COUNT}"
