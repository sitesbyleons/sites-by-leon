#!/usr/bin/env bash
set -euo pipefail

TEST_SECRETS_ROOT=${TEST_SECRETS_ROOT:-/opt/leon-platform/secrets-test}
TEST_COMPOSE_ENV_FILE=${TEST_COMPOSE_ENV_FILE:-${TEST_SECRETS_ROOT}/.env}

fail() {
  echo "Staging secret preflight failed: $1" >&2
  exit 1
}

[[ -d ${TEST_SECRETS_ROOT} && ! -L ${TEST_SECRETS_ROOT} ]] || fail 'the staging secret directory is invalid.'
[[ $(stat -c '%a' "${TEST_SECRETS_ROOT}") == 700 ]] || fail 'the staging secret directory must use mode 700.'
for file in "${TEST_COMPOSE_ENV_FILE}" "${TEST_SECRETS_ROOT}/postgres.env" "${TEST_SECRETS_ROOT}/dashboard.env" "${TEST_SECRETS_ROOT}/photographer.env"; do
  [[ -f ${file} && ! -L ${file} ]] || fail 'a required staging secret file is missing.'
  [[ $(stat -c '%a' "${file}") == 600 ]] || fail 'staging secret files must use mode 600.'
  [[ $(stat -c '%u' "${file}") == $(id -u) ]] || fail 'staging secrets must belong to the deployment user.'
done

read_value() {
  local key=$1 file=$2
  local values
  mapfile -t values < <(sed -n "s/^${key}=//p" "${file}")
  [[ ${#values[@]} -eq 1 ]] || fail "${key} must appear exactly once."
  printf '%s' "${values[0]}"
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

[[ $(read_value DEPLOYMENT_ENVIRONMENT "${TEST_COMPOSE_ENV_FILE}") == staging ]] || fail 'DEPLOYMENT_ENVIRONMENT must be staging.'
[[ $(read_value STRIPE_TEST_MODE_ENABLED "${TEST_SECRETS_ROOT}/dashboard.env") == true ]] || fail 'Stripe test mode must be enabled.'
stripe_key=$(read_value STRIPE_SECRET_KEY "${TEST_SECRETS_ROOT}/dashboard.env")
[[ ${stripe_key} == sk_test_* ]] || fail 'staging STRIPE_SECRET_KEY must be a Stripe test key.'
database_url=$(read_value DATABASE_URL "${TEST_SECRETS_ROOT}/dashboard.env")
[[ ${database_url} == 'postgresql://leon_test_dashboard:'*'@database-test:5432/leon_platform_test' ]] || fail 'staging DATABASE_URL must use its least-privilege login and isolated database.'
dashboard_password=$(read_value POSTGRES_DASHBOARD_PASSWORD "${TEST_SECRETS_ROOT}/postgres.env")
photographer_password=$(read_value POSTGRES_PHOTOGRAPHER_PASSWORD "${TEST_SECRETS_ROOT}/postgres.env")
[[ ${#dashboard_password} -ge 32 ]] || fail 'POSTGRES_DASHBOARD_PASSWORD must contain at least 32 characters.'
[[ ${#photographer_password} -ge 32 ]] || fail 'POSTGRES_PHOTOGRAPHER_PASSWORD must contain at least 32 characters.'
[[ ${dashboard_password} != "${photographer_password}" ]] || fail 'staging application database passwords must be different.'
[[ ${database_url} == "postgresql://leon_test_dashboard:${dashboard_password}@database-test:5432/leon_platform_test" ]] || fail 'staging dashboard database credentials must match.'
photographer_database_url=$(read_value DATABASE_URL "${TEST_SECRETS_ROOT}/photographer.env")
[[ ${photographer_database_url} == "postgresql://leon_test_photographer:${photographer_password}@database-test:5432/leon_platform_test" ]] || fail 'staging photographer database credentials must match.'
photographer_stripe_key=$(read_value STRIPE_CONNECT_SECRET_KEY "${TEST_SECRETS_ROOT}/photographer.env")
[[ ${photographer_stripe_key} == sk_test_* ]] || fail 'staging photographer Stripe key must be a test key.'
validate_media_storage "${TEST_SECRETS_ROOT}/photographer.env"

echo 'Staging secret preflight passed.'
