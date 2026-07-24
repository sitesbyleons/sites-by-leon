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

read_optional_value() {
  local key=$1 file=$2
  local values
  mapfile -t values < <(sed -n "s/^${key}=//p" "${file}")
  [[ ${#values[@]} -le 1 ]] || fail "${key} must appear at most once."
  [[ ${#values[@]} -eq 1 ]] && printf '%s' "${values[0]%$'\r'}"
  return 0
}

validate_media_storage() {
  local file=$1 backend key value endpoint region bucket access_key secret_key force_path_style prefix
  backend=$(read_optional_value MEDIA_STORAGE_BACKEND "${file}")
  backend=${backend:-local}
  [[ ${backend} == local || ${backend} == s3 ]] || fail 'MEDIA_STORAGE_BACKEND must be local or s3.'
  [[ ${backend} == s3 ]] || return 0

  for key in S3_ENDPOINT S3_REGION S3_BUCKET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY; do
    value=$(read_optional_value "${key}" "${file}")
    [[ -n ${value} ]] || fail "${key} is required when MEDIA_STORAGE_BACKEND=s3."
    [[ ${value} != *replace_* ]] || fail "${key} cannot contain a placeholder."
  done
  endpoint=$(read_optional_value S3_ENDPOINT "${file}")
  region=$(read_optional_value S3_REGION "${file}")
  bucket=$(read_optional_value S3_BUCKET "${file}")
  access_key=$(read_optional_value S3_ACCESS_KEY_ID "${file}")
  secret_key=$(read_optional_value S3_SECRET_ACCESS_KEY "${file}")
  force_path_style=$(read_optional_value S3_FORCE_PATH_STYLE "${file}")
  prefix=$(read_optional_value S3_KEY_PREFIX "${file}")
  [[ ${endpoint} == https://* && ${endpoint} != *'@'* && ${endpoint} != *'?'* && ${endpoint} != *'#'* ]] || fail 'S3_ENDPOINT must be a credential-free HTTPS URL.'
  [[ ${region} =~ ^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$ ]] || fail 'S3_REGION is invalid.'
  [[ ${bucket} =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ && ${bucket} != *..* ]] || fail 'S3_BUCKET is invalid.'
  (( ${#access_key} <= 256 && ${#secret_key} <= 512 )) || fail 'S3 credentials are invalid.'
  [[ -z ${force_path_style} || ${force_path_style} == true || ${force_path_style} == false ]] || fail 'S3_FORCE_PATH_STYLE must be true or false.'
  [[ -z ${prefix} || ${prefix} =~ ^[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*$ ]] || fail 'S3_KEY_PREFIX is invalid.'
}

require_private_directory "${SECRETS_ROOT}"
require_secret_file "${COMPOSE_ENV_FILE}" '.env'
for name in postgres.env dashboard.env northline.env cloudflare-tunnel-token; do
  require_secret_file "${SECRETS_ROOT}/${name}" "${name}"
done
if [[ -e ${SECRETS_ROOT}/domain-worker.env || -L ${SECRETS_ROOT}/domain-worker.env ]]; then
  require_secret_file "${SECRETS_ROOT}/domain-worker.env" 'domain-worker.env'
fi
validate_media_storage "${SECRETS_ROOT}/northline.env"

mapfile -t public_site_mode_lines < <(sed -n 's/^PUBLIC_SITE_MODE=//p' "${COMPOSE_ENV_FILE}")
if [[ ${#public_site_mode_lines[@]} -ne 1 ]]; then
  fail 'PUBLIC_SITE_MODE must appear exactly once in .env.'
fi
public_site_mode=${public_site_mode_lines[0]%$'\r'}
if [[ ${public_site_mode} != coming-soon && ${public_site_mode} != live ]]; then
  fail 'PUBLIC_SITE_MODE must be coming-soon or live.'
fi

echo 'Runtime secret preflight passed.'
