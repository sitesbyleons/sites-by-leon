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
for file in "${TEST_COMPOSE_ENV_FILE}" "${TEST_SECRETS_ROOT}/postgres.env" "${TEST_SECRETS_ROOT}/dashboard.env"; do
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

[[ $(read_value DEPLOYMENT_ENVIRONMENT "${TEST_COMPOSE_ENV_FILE}") == staging ]] || fail 'DEPLOYMENT_ENVIRONMENT must be staging.'
[[ $(read_value STRIPE_TEST_MODE_ENABLED "${TEST_SECRETS_ROOT}/dashboard.env") == true ]] || fail 'Stripe test mode must be enabled.'
stripe_key=$(read_value STRIPE_SECRET_KEY "${TEST_SECRETS_ROOT}/dashboard.env")
[[ ${stripe_key} == sk_test_* ]] || fail 'staging STRIPE_SECRET_KEY must be a Stripe test key.'
database_url=$(read_value DATABASE_URL "${TEST_SECRETS_ROOT}/dashboard.env")
[[ ${database_url} == *'@database-test:5432/leon_platform_test' ]] || fail 'staging DATABASE_URL must use the isolated staging database.'

echo 'Staging secret preflight passed.'
