#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
SCRIPT="${ROOT}/infra/ovh/scripts/switch-public-site-mode.sh"
FIXTURE=$(mktemp -d)
trap 'rm -rf -- "${FIXTURE}"' EXIT

SOURCE_ROOT="${FIXTURE}/release"
SECRETS_ROOT="${FIXTURE}/secrets"
COMPOSE_ENV_FILE="${SECRETS_ROOT}/.env"
DEPLOY_LOG="${FIXTURE}/deploy.log"
DEPLOY_STATE="${FIXTURE}/deploy-state"
mkdir -p "${SOURCE_ROOT}/infra/ovh/scripts" "${SECRETS_ROOT}"

cat >"${SOURCE_ROOT}/infra/ovh/scripts/deploy.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
sed -n 's/^PUBLIC_SITE_MODE=//p' "${COMPOSE_ENV_FILE}" >>"${DEPLOY_LOG}"
if [[ ${FAIL_FIRST_DEPLOY:-0} == 1 && ! -e ${DEPLOY_STATE} ]]; then
  touch "${DEPLOY_STATE}"
  exit 1
fi
EOF
chmod 0755 "${SOURCE_ROOT}/infra/ovh/scripts/deploy.sh"

write_env() {
  printf 'MARKETING_DOMAIN=leonsites.org\nPUBLIC_SITE_MODE=%s\n' "$1" >"${COMPOSE_ENV_FILE}"
  chmod 0600 "${COMPOSE_ENV_FILE}"
  rm -f "${DEPLOY_LOG}" "${DEPLOY_STATE}"
}

run_switch() {
  env \
    SOURCE_ROOT="${SOURCE_ROOT}" \
    SECRETS_ROOT="${SECRETS_ROOT}" \
    COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE}" \
    MAINTENANCE_LOCK="${FIXTURE}/maintenance.lock" \
    DEPLOY_LOG="${DEPLOY_LOG}" \
    DEPLOY_STATE="${DEPLOY_STATE}" \
    FAIL_FIRST_DEPLOY="${FAIL_FIRST_DEPLOY:-0}" \
    bash "${SCRIPT}" "$@"
}

write_env coming-soon
if run_switch preview >"${FIXTURE}/invalid-output" 2>"${FIXTURE}/invalid-error"; then
  echo 'Launch switch accepted an invalid mode.' >&2
  exit 1
fi
grep -qx 'PUBLIC_SITE_MODE=coming-soon' "${COMPOSE_ENV_FILE}"
[[ ! -e ${DEPLOY_LOG} ]]

printf 'PUBLIC_SITE_MODE=coming-soon\nPUBLIC_SITE_MODE=live\n' >"${COMPOSE_ENV_FILE}"
chmod 0600 "${COMPOSE_ENV_FILE}"
if run_switch live >"${FIXTURE}/duplicate-output" 2>"${FIXTURE}/duplicate-error"; then
  echo 'Launch switch accepted duplicate mode declarations.' >&2
  exit 1
fi
grep -q 'must appear exactly once' "${FIXTURE}/duplicate-error"

write_env coming-soon
run_switch live >"${FIXTURE}/success-output" 2>"${FIXTURE}/success-error"
grep -qx 'PUBLIC_SITE_MODE=live' "${COMPOSE_ENV_FILE}"
grep -qx 'live' "${DEPLOY_LOG}"
[[ $(stat -c '%a' "${COMPOSE_ENV_FILE}") == 600 ]]

write_env coming-soon
if FAIL_FIRST_DEPLOY=1 run_switch live >"${FIXTURE}/rollback-output" 2>"${FIXTURE}/rollback-error"; then
  echo 'Launch switch reported success after a failed deployment.' >&2
  exit 1
fi
grep -qx 'PUBLIC_SITE_MODE=coming-soon' "${COMPOSE_ENV_FILE}"
[[ $(sed -n '1p' "${DEPLOY_LOG}") == live ]]
[[ $(sed -n '2p' "${DEPLOY_LOG}") == coming-soon ]]
[[ $(wc -l <"${DEPLOY_LOG}") -eq 2 ]]
[[ $(stat -c '%a' "${COMPOSE_ENV_FILE}") == 600 ]]
grep -q 'restoring coming-soon' "${FIXTURE}/rollback-error"

echo 'Public site mode switch regression tests passed.'
