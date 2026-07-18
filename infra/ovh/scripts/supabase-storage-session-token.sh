#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${SUPABASE_BACKUP_AUTH_URL:?Set the Supabase password-token endpoint.}"
: "${SUPABASE_BACKUP_EMAIL:?Set the dedicated Supabase backup identity email.}"
: "${SUPABASE_BACKUP_PASSWORD:?Set the dedicated Supabase backup identity password.}"
: "${AWS_ACCESS_KEY_ID:?Set the Supabase project reference for S3 session authentication.}"
: "${AWS_SECRET_ACCESS_KEY:?Set the Supabase legacy anon key for S3 session authentication.}"
: "${AWS_DEFAULT_REGION:?Set the Supabase project region.}"
: "${RESTIC_REPOSITORY:?Set the scoped Supabase rclone repository.}"
: "${RCLONE_CONFIG_SUPABASE_TYPE:?Set the Supabase rclone remote type.}"
: "${RCLONE_CONFIG_SUPABASE_PROVIDER:?Set the Supabase rclone provider.}"
: "${RCLONE_CONFIG_SUPABASE_ENV_AUTH:?Enable environment authentication for the Supabase rclone remote.}"
: "${RCLONE_CONFIG_SUPABASE_ENDPOINT:?Set the Supabase Storage S3 endpoint.}"
: "${RCLONE_CONFIG_SUPABASE_REGION:?Set the Supabase rclone region.}"
: "${RCLONE_CONFIG_SUPABASE_FORCE_PATH_STYLE:?Enable path-style requests for Supabase Storage.}"

SUPABASE_BACKUP_COMMAND_TIMEOUT_SECONDS=${SUPABASE_BACKUP_COMMAND_TIMEOUT_SECONDS:-3000}
if [[ ! ${SUPABASE_BACKUP_COMMAND_TIMEOUT_SECONDS} =~ ^[1-9][0-9]*$ ]] || (( SUPABASE_BACKUP_COMMAND_TIMEOUT_SECONDS > 3000 )); then
  echo "SUPABASE_BACKUP_COMMAND_TIMEOUT_SECONDS must be between 1 and 3000." >&2
  exit 1
fi

if [[ ! ${SUPABASE_BACKUP_AUTH_URL} =~ ^https://([a-z0-9-]+)\.supabase\.co/auth/v1/token\?grant_type=password$ ]]; then
  echo "SUPABASE_BACKUP_AUTH_URL must be an HTTPS Supabase password-token endpoint." >&2
  exit 1
fi
project_ref=${BASH_REMATCH[1]}
if [[ ${AWS_ACCESS_KEY_ID} != "${project_ref}" ]]; then
  echo "AWS_ACCESS_KEY_ID must match the authenticated Supabase project." >&2
  exit 1
fi
expected_storage_endpoint="https://${project_ref}.storage.supabase.co/storage/v1/s3"
if [[ ${RCLONE_CONFIG_SUPABASE_ENDPOINT} != "${expected_storage_endpoint}" ]]; then
  echo "RCLONE_CONFIG_SUPABASE_ENDPOINT must match the authenticated Supabase project." >&2
  exit 1
fi
case "${RESTIC_REPOSITORY}" in
  rclone:supabase:?*) ;;
  *)
    echo "RESTIC_REPOSITORY must use the scoped Supabase rclone remote." >&2
    exit 1
    ;;
esac
if [[ ${RCLONE_CONFIG_SUPABASE_TYPE} != s3 || ${RCLONE_CONFIG_SUPABASE_PROVIDER} != Other || ${RCLONE_CONFIG_SUPABASE_ENV_AUTH} != true || ${RCLONE_CONFIG_SUPABASE_FORCE_PATH_STYLE} != true ]]; then
  echo "The Supabase rclone remote must use path-style S3 environment authentication." >&2
  exit 1
fi
if [[ ! ${AWS_DEFAULT_REGION} =~ ^[a-z0-9-]+$ || ${RCLONE_CONFIG_SUPABASE_REGION} != "${AWS_DEFAULT_REGION}" ]]; then
  echo "The Supabase rclone region must match AWS_DEFAULT_REGION." >&2
  exit 1
fi

for command_name in curl date jq mktemp; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command is unavailable: ${command_name}." >&2
    exit 1
  fi
done

response=$(mktemp)
cleanup() {
  rm -f "${response}"
}
trap cleanup EXIT

status=$(
  jq -cn '{email:env.SUPABASE_BACKUP_EMAIL,password:env.SUPABASE_BACKUP_PASSWORD}' |
    curl \
      --silent \
      --show-error \
      --proto '=https' \
      --tlsv1.2 \
      --connect-timeout 10 \
      --max-time 30 \
      --output "${response}" \
      --write-out '%{http_code}' \
      --request POST \
      --header "apikey: ${AWS_SECRET_ACCESS_KEY}" \
      --header 'Content-Type: application/json' \
      --data-binary @- \
      "${SUPABASE_BACKUP_AUTH_URL}"
)

if [[ ${status} != 200 ]]; then
  echo "Supabase backup authentication failed with HTTP ${status}." >&2
  exit 1
fi

expires_at=$(jq -er '.expires_at | select(type == "number")' "${response}")
minimum_expiry=$(($(date +%s) + SUPABASE_BACKUP_COMMAND_TIMEOUT_SECONDS + 300))
if (( expires_at <= minimum_expiry )); then
  echo "Supabase returned a backup session with insufficient lifetime." >&2
  exit 1
fi

token=$(jq -er '.access_token | select(type == "string" and length > 0)' "${response}")
if [[ ! ${token} =~ ^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$ ]]; then
  echo "Supabase returned an invalid backup session token." >&2
  exit 1
fi

printf '%s' "${token}"
