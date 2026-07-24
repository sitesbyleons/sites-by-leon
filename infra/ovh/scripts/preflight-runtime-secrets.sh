#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT=${SOURCE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}
SECRETS_ROOT=${SECRETS_ROOT:-${SOURCE_ROOT}/infra/ovh/secrets}
COMPOSE_ENV_FILE=${COMPOSE_ENV_FILE:-${SECRETS_ROOT}/.env}
DEPLOYMENT_UID=$(id -u)

fail() {
  echo "Runtime secret preflight failed: $1" >&2
  exit 1
}

require_private_directory() {
  local directory=$1
  local owner mode
  if [[ ! -d ${directory} || -L ${directory} ]]; then
    fail 'SECRETS_ROOT must be a regular, non-symlink directory.'
  fi
  owner=$(stat -c '%u' "${directory}" 2>/dev/null) || fail 'could not inspect SECRETS_ROOT ownership.'
  mode=$(stat -c '%a' "${directory}" 2>/dev/null) || fail 'could not inspect SECRETS_ROOT permissions.'
  if [[ ${owner} != "${DEPLOYMENT_UID}" ]]; then
    fail 'SECRETS_ROOT must belong to the deployment user.'
  fi
  if (( 8#${mode} & 077 )); then
    fail 'SECRETS_ROOT must not allow group or world access.'
  fi
}

require_secret_file() {
  local file=$1
  local label=$2
  local owner mode
  if [[ ! -f ${file} || -L ${file} ]]; then
    fail "${label} must be a regular, non-symlink file."
  fi
  owner=$(stat -c '%u' "${file}" 2>/dev/null) || fail "could not inspect ${label} ownership."
  mode=$(stat -c '%a' "${file}" 2>/dev/null) || fail "could not inspect ${label} permissions."
  if [[ ${owner} != "${DEPLOYMENT_UID}" ]]; then
    fail "${label} must belong to the deployment user."
  fi
  if [[ ${mode} != 600 ]]; then
    fail "${label} must have mode 600."
  fi
}

require_private_directory "${SECRETS_ROOT}"
require_secret_file "${COMPOSE_ENV_FILE}" '.env'
for name in postgres.env dashboard.env northline.env cloudflare-tunnel-token; do
  require_secret_file "${SECRETS_ROOT}/${name}" "${name}"
done
if [[ -e ${SECRETS_ROOT}/domain-worker.env || -L ${SECRETS_ROOT}/domain-worker.env ]]; then
  require_secret_file "${SECRETS_ROOT}/domain-worker.env" 'domain-worker.env'
fi

mapfile -t public_site_mode_lines < <(sed -n 's/^PUBLIC_SITE_MODE=//p' "${COMPOSE_ENV_FILE}")
if [[ ${#public_site_mode_lines[@]} -ne 1 ]]; then
  fail 'PUBLIC_SITE_MODE must appear exactly once in .env.'
fi
public_site_mode=${public_site_mode_lines[0]%$'\r'}
if [[ ${public_site_mode} != coming-soon && ${public_site_mode} != live ]]; then
  fail 'PUBLIC_SITE_MODE must be coming-soon or live.'
fi

echo 'Runtime secret preflight passed.'
