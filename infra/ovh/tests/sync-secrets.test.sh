#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
PREFLIGHT_SCRIPT=${REPOSITORY_ROOT}/infra/ovh/scripts/preflight-runtime-secrets.sh
SYNC_SCRIPT=${REPOSITORY_ROOT}/infra/ovh/scripts/sync-secrets.sh
FIXTURE=$(mktemp -d)
PASS_COUNT=0
VALID_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

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

write_fixture() {
  mkdir -p "${FIXTURE}/infra/ovh/secrets" "${FIXTURE}/bin"
  chmod 700 "${FIXTURE}/infra/ovh/secrets"
  cat > "${FIXTURE}/infra/ovh/.env" <<'EOF'
SECRETS_ROOT=/opt/leon-platform/secrets
CLOUDFLARE_TUNNEL_TOKEN_FILE=/opt/leon-platform/secrets/cloudflare-tunnel-token
CUSTOM_DOMAIN_AUTOMATION_ENABLED=false
COMPOSE_PROFILES=tunnel
PUBLIC_SITE_MODE=coming-soon
EOF
  for file in postgres.env dashboard.env northline.env; do
    printf 'SAFE_VALUE=%s\n' "${VALID_SECRET}" > "${FIXTURE}/infra/ovh/secrets/${file}"
  done
  printf '%s\n' "${VALID_SECRET}" > "${FIXTURE}/infra/ovh/secrets/cloudflare-tunnel-token"
  printf 'known-host-placeholder\n' > "${FIXTURE}/infra/ovh/ssh_known_hosts"
  printf 'identity-placeholder\n' > "${FIXTURE}/identity"
  chmod 600 \
    "${FIXTURE}/identity" \
    "${FIXTURE}/infra/ovh/.env" \
    "${FIXTURE}/infra/ovh/secrets/"*
  chmod 644 "${FIXTURE}/infra/ovh/ssh_known_hosts"
}

run_preflight() {
  SECRETS_ROOT="${FIXTURE}/infra/ovh/secrets" \
    COMPOSE_ENV_FILE="${FIXTURE}/infra/ovh/.env" \
    bash "${PREFLIGHT_SCRIPT}"
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
  [[ ${status} -ne 0 ]] || fail_test "${name}: preflight unexpectedly passed"
  [[ ${output} == *"${expected}"* ]] || fail_test "${name}: expected '${expected}'"
  [[ ${output} != *"${VALID_SECRET}"* ]] || fail_test "${name}: preflight disclosed a secret"
  pass "${name}"
}

write_fixture
[[ -x ${PREFLIGHT_SCRIPT} ]] || fail_test 'runtime secret preflight is missing or not executable'
[[ -x ${SYNC_SCRIPT} ]] || fail_test 'secret sync command is missing or not executable'

run_preflight >/dev/null
pass 'owner-only stable secrets pass preflight'

chmod 640 "${FIXTURE}/infra/ovh/secrets/dashboard.env"
expect_preflight_failure 'group-readable secret is rejected' 'dashboard.env must have mode 600'
chmod 600 "${FIXTURE}/infra/ovh/secrets/dashboard.env"

rm "${FIXTURE}/infra/ovh/secrets/northline.env"
ln -s dashboard.env "${FIXTURE}/infra/ovh/secrets/northline.env"
expect_preflight_failure 'symlinked secret is rejected' 'northline.env must be a regular, non-symlink file'
rm "${FIXTURE}/infra/ovh/secrets/northline.env"
printf 'SAFE_VALUE=%s\n' "${VALID_SECRET}" > "${FIXTURE}/infra/ovh/secrets/northline.env"
chmod 600 "${FIXTURE}/infra/ovh/secrets/northline.env"

rm "${FIXTURE}/infra/ovh/secrets/cloudflare-tunnel-token"
expect_preflight_failure 'missing tunnel token is rejected' 'cloudflare-tunnel-token must be a regular, non-symlink file'
printf '%s\n' "${VALID_SECRET}" > "${FIXTURE}/infra/ovh/secrets/cloudflare-tunnel-token"
chmod 600 "${FIXTURE}/infra/ovh/secrets/cloudflare-tunnel-token"

cat > "${FIXTURE}/bin/ssh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%q ' "$@" >> "${SSH_LOG}"
printf '\n' >> "${SSH_LOG}"
if [[ "$*" == *'mktemp -d'* ]]; then
  echo /tmp/leon-secrets.mock-stage
elif [[ "$*" == *'sudo bash -s'* ]]; then
  cat > "${REMOTE_SCRIPT_LOG}"
fi
EOF
cat > "${FIXTURE}/bin/scp" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%q ' "$@" >> "${SCP_LOG}"
printf '\n' >> "${SCP_LOG}"
EOF
chmod +x "${FIXTURE}/bin/ssh" "${FIXTURE}/bin/scp"

sync_output=$(
  SSH_LOG="${FIXTURE}/ssh.log" \
    SCP_LOG="${FIXTURE}/scp.log" \
    REMOTE_SCRIPT_LOG="${FIXTURE}/remote-script.log" \
    SOURCE_ROOT="${FIXTURE}" \
    PATH="${FIXTURE}/bin:${PATH}" \
    bash "${SYNC_SCRIPT}" ubuntu@example.test "${FIXTURE}/identity"
)

for file in .env postgres.env dashboard.env northline.env cloudflare-tunnel-token; do
  grep -Fq "${file}" "${FIXTURE}/scp.log" || fail_test "sync omitted ${file}"
done
if grep -Eq 'backup\.env|\.example' "${FIXTURE}/scp.log"; then
  fail_test 'sync copied a file outside the allowlist'
fi
grep -Fq 'StrictHostKeyChecking=yes' "${FIXTURE}/ssh.log" || fail_test 'sync did not pin SSH host checking'
grep -Fq 'ConnectTimeout=15' "${FIXTURE}/ssh.log" || fail_test 'sync did not bound SSH connection time'
grep -Fq 'ServerAliveInterval=10' "${FIXTURE}/ssh.log" || fail_test 'sync did not configure SSH keepalives'
grep -Fq 'install -m 600' "${FIXTURE}/remote-script.log" || fail_test 'remote install is not mode 600'
grep -Fq 'mv --' "${FIXTURE}/remote-script.log" || fail_test 'remote install is not atomically renamed'
if grep -Fq 'set -x' "${SYNC_SCRIPT}" || [[ ${sync_output} == *"${VALID_SECRET}"* ]]; then
  fail_test 'sync disclosed a secret or enabled shell tracing'
fi
pass 'sync copies only allowlisted files through an atomic owner-only install'

printf 'WORKER_SECRET=%s\n' "${VALID_SECRET}" > "${FIXTURE}/infra/ovh/secrets/domain-worker.env"
chmod 600 "${FIXTURE}/infra/ovh/secrets/domain-worker.env"
: > "${FIXTURE}/scp.log"
SSH_LOG="${FIXTURE}/ssh.log" \
  SCP_LOG="${FIXTURE}/scp.log" \
  REMOTE_SCRIPT_LOG="${FIXTURE}/remote-script.log" \
  SOURCE_ROOT="${FIXTURE}" \
  PATH="${FIXTURE}/bin:${PATH}" \
  bash "${SYNC_SCRIPT}" ubuntu@example.test "${FIXTURE}/identity" >/dev/null
grep -Fq 'domain-worker.env' "${FIXTURE}/scp.log" || fail_test 'optional domain-worker secret was not included'
pass 'optional domain-worker secret is included only when present'

mkdir -p "${FIXTURE}/infra/ovh/secrets-test"
printf 'STAGING_MARKER=true\n' > "${FIXTURE}/infra/ovh/secrets-test/.env"
for file in postgres.env dashboard.env photographer.env; do
  printf 'SAFE_VALUE=%s\n' "${VALID_SECRET}" > "${FIXTURE}/infra/ovh/secrets-test/${file}"
done
chmod 600 "${FIXTURE}/infra/ovh/secrets-test/.env" "${FIXTURE}/infra/ovh/secrets-test/"*.env
: > "${FIXTURE}/scp.log"
SSH_LOG="${FIXTURE}/ssh.log" \
  SCP_LOG="${FIXTURE}/scp.log" \
  REMOTE_SCRIPT_LOG="${FIXTURE}/remote-script.log" \
  SOURCE_ROOT="${FIXTURE}" \
  LOCAL_SECRETS_ROOT="${FIXTURE}/infra/ovh/secrets-test" \
  SECRETS_PROFILE=staging \
  REMOTE_SECRETS_ROOT=/opt/leon-platform/secrets-test \
  PATH="${FIXTURE}/bin:${PATH}" \
  bash "${SYNC_SCRIPT}" ubuntu@example.test "${FIXTURE}/identity" >/dev/null
grep -Fq 'secrets-test/.env' "${FIXTURE}/scp.log" || fail_test 'staging sync used the production compose environment'
if grep -Fq "${FIXTURE}/infra/ovh/.env" "${FIXTURE}/scp.log"; then
  fail_test 'staging sync copied the production compose environment'
fi
pass 'staging sync uses the isolated compose environment'

echo "1..${PASS_COUNT}"
