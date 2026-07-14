#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT=${SOURCE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}
DOMAIN_WORKER_ENV_FILE=${DOMAIN_WORKER_ENV_FILE:-${SOURCE_ROOT}/infra/ovh/secrets/domain-worker.env}
POSTGRES_ENV_FILE=${POSTGRES_ENV_FILE:-${SOURCE_ROOT}/infra/ovh/secrets/postgres.env}

fail() {
  echo "Custom-domain deployment preflight failed: $1" >&2
  exit 1
}

require_secret_file() {
  local file=$1
  local label=$2
  local mode

  if [[ ! -f ${file} || -L ${file} ]]; then
    fail "${label} must be a regular, non-symlink file."
  fi

  mode=$(stat -c '%a' "${file}" 2>/dev/null) || fail "could not inspect ${label} permissions."
  if [[ ${mode} != 600 ]]; then
    fail "${label} must have mode 600."
  fi
}

read_required_env_value() {
  local file=$1
  local key=$2
  local line
  local value=''
  local count=0

  while IFS= read -r line || [[ -n ${line} ]]; do
    line=${line%$'\r'}
    if [[ ${line} == "${key}="* ]]; then
      value=${line#*=}
      count=$((count + 1))
    fi
  done < "${file}"

  if [[ ${count} -ne 1 ]]; then
    fail "${key} must appear exactly once in $(basename "${file}")."
  fi

  if [[ ${value} == \"*\" && ${#value} -ge 2 ]]; then
    value=${value:1:${#value}-2}
  elif [[ ${value} == \'*\' && ${#value} -ge 2 ]]; then
    value=${value:1:${#value}-2}
  fi

  if [[ -z ${value} ]]; then
    fail "${key} must not be empty."
  fi

  ENV_VALUE=${value}
}

reject_placeholder() {
  local key=$1
  local value=$2
  local normalized=${value,,}

  case "${normalized}" in
    *replace_with*|*change_me*|*changeme*|*placeholder*|*example_token*|*example_zone*)
      fail "${key} still contains a placeholder value."
      ;;
  esac
}

require_secret_file "${DOMAIN_WORKER_ENV_FILE}" 'domain-worker.env'
require_secret_file "${POSTGRES_ENV_FILE}" 'postgres.env'

read_required_env_value "${DOMAIN_WORKER_ENV_FILE}" DATABASE_URL
database_url=${ENV_VALUE}
reject_placeholder DATABASE_URL "${database_url}"

read_required_env_value "${DOMAIN_WORKER_ENV_FILE}" CLOUDFLARE_API_TOKEN
cloudflare_api_token=${ENV_VALUE}
reject_placeholder CLOUDFLARE_API_TOKEN "${cloudflare_api_token}"
if [[ ! ${cloudflare_api_token} =~ ^[A-Za-z0-9_-]{20,}$ ]]; then
  fail 'CLOUDFLARE_API_TOKEN has an invalid format.'
fi

read_required_env_value "${DOMAIN_WORKER_ENV_FILE}" CLOUDFLARE_ZONE_ID
cloudflare_zone_id=${ENV_VALUE}
reject_placeholder CLOUDFLARE_ZONE_ID "${cloudflare_zone_id}"
if [[ ! ${cloudflare_zone_id} =~ ^[A-Fa-f0-9]{32}$ ]]; then
  fail 'CLOUDFLARE_ZONE_ID must be a 32-character hexadecimal zone identifier.'
fi

read_required_env_value "${POSTGRES_ENV_FILE}" POSTGRES_DOMAIN_WORKER_PASSWORD
postgres_domain_worker_password=${ENV_VALUE}
reject_placeholder POSTGRES_DOMAIN_WORKER_PASSWORD "${postgres_domain_worker_password}"
if [[ ${#postgres_domain_worker_password} -lt 32 ]]; then
  fail 'POSTGRES_DOMAIN_WORKER_PASSWORD must contain at least 32 characters.'
fi

database_url_prefix='postgresql://leon_domain_worker:'
database_url_suffix='@database:5432/leon_platform'
if [[ ${database_url} != "${database_url_prefix}"*"${database_url_suffix}" ]]; then
  fail 'DATABASE_URL must use the restricted leon_domain_worker login and internal database endpoint.'
fi

database_url_password=${database_url#"${database_url_prefix}"}
database_url_password=${database_url_password%"${database_url_suffix}"}
if [[ -z ${database_url_password} || ! ${database_url_password} =~ ^[A-Za-z0-9._~-]+$ ]]; then
  fail 'DATABASE_URL must contain an unquoted URL-safe password.'
fi
if [[ ${#database_url_password} -lt 32 ]]; then
  fail 'The domain-worker DATABASE_URL password must contain at least 32 characters.'
fi

if [[ ${database_url_password} != "${postgres_domain_worker_password}" ]]; then
  fail 'The domain-worker database password does not match POSTGRES_DOMAIN_WORKER_PASSWORD.'
fi

echo 'Custom-domain deployment preflight passed.'
