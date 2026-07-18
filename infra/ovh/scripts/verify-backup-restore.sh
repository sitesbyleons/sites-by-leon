#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

require_root_secret() {
  local path=$1
  local owner mode
  if [[ ! -f ${path} || -L ${path} ]]; then
    echo "${path} must be a regular, non-symlink secret file." >&2
    exit 1
  fi
  owner=$(stat -c '%u' "${path}")
  mode=$(stat -c '%a' "${path}")
  if [[ ${owner} != 0 || $((8#${mode} & 077)) -ne 0 ]]; then
    echo "${path} must be root-owned with no group or other permissions." >&2
    exit 1
  fi
}

require_root_secret_directory() {
  local path=$1
  local owner mode
  if [[ ! -d ${path} || -L ${path} ]]; then
    echo "${path} must be a regular, non-symlink secret directory." >&2
    exit 1
  fi
  owner=$(stat -c '%u' "${path}")
  mode=$(stat -c '%a' "${path}")
  if [[ ${owner} != 0 || $((8#${mode} & 077)) -ne 0 ]]; then
    echo "${path} must be root-owned with no group or other permissions." >&2
    exit 1
  fi
}

BACKUP_SECRETS_ROOT=${BACKUP_SECRETS_ROOT:-/opt/leon-platform/backup-secrets}
BACKUP_ENV=${BACKUP_ENV:-${BACKUP_SECRETS_ROOT}/backup.env}
if [[ -z ${RESTIC_REPOSITORY:-} || -z ${RESTIC_PASSWORD_FILE:-} ]]; then
  require_root_secret_directory "$(dirname "${BACKUP_ENV}")"
  require_root_secret "${BACKUP_ENV}"
  environment_loader=/usr/local/libexec/leon-platform/load-backup-environment.sh
  if [[ ! -f ${environment_loader} || -L ${environment_loader} ]]; then
    echo "The backup environment loader must be an installed regular file." >&2
    exit 1
  fi
  loader_owner=$(stat -c '%u' "${environment_loader}")
  loader_mode=$(stat -c '%a' "${environment_loader}")
  if [[ ${loader_owner} != 0 || $((8#${loader_mode} & 022)) -ne 0 ]]; then
    echo "The backup environment loader must be root-owned and not group- or world-writable." >&2
    exit 1
  fi
  source "${environment_loader}"
  load_backup_environment "${BACKUP_ENV}"
fi

: "${RESTIC_REPOSITORY:?Set RESTIC_REPOSITORY to the remote backup repository.}"
: "${RESTIC_PASSWORD_FILE:?Set RESTIC_PASSWORD_FILE to a chmod-600 file.}"
require_root_secret_directory "$(dirname "${RESTIC_PASSWORD_FILE}")"
require_root_secret "${RESTIC_PASSWORD_FILE}"
case "${RESTIC_REPOSITORY}" in
  s3:*|b2:*|azure:*|gs:*|sftp:*|rest:*|rclone:*) ;;
  *)
    if [[ ${ALLOW_LOCAL_BACKUP:-false} != true ]]; then
      echo "Local Restic repositories require ALLOW_LOCAL_BACKUP=true and are not production backups." >&2
      exit 1
    fi
    ;;
esac
if [[ "${RESTIC_REPOSITORY}" == s3:* ]]; then
  : "${AWS_ACCESS_KEY_ID:?Set the S3 access key.}"
  : "${AWS_SECRET_ACCESS_KEY:?Set the S3 secret key.}"
fi
if [[ "${RESTIC_REPOSITORY}" == rclone:* ]] && ! command -v rclone >/dev/null 2>&1; then
  echo "The configured Restic repository requires rclone." >&2
  exit 1
fi
SUPABASE_BACKUP_COMMAND_TIMEOUT_SECONDS=${SUPABASE_BACKUP_COMMAND_TIMEOUT_SECONDS:-3000}
if [[ -n ${SUPABASE_BACKUP_AUTH_URL:-} ]]; then
  if [[ ! ${SUPABASE_BACKUP_COMMAND_TIMEOUT_SECONDS} =~ ^[1-9][0-9]*$ ]] || (( SUPABASE_BACKUP_COMMAND_TIMEOUT_SECONDS > 3000 )); then
    echo "SUPABASE_BACKUP_COMMAND_TIMEOUT_SECONDS must be between 1 and 3000." >&2
    exit 1
  fi
  if ! command -v timeout >/dev/null 2>&1; then
    echo "Supabase Storage restore drills require timeout." >&2
    exit 1
  fi
  export RCLONE_CONFIG=/dev/null
fi

refresh_restic_session_token() {
  if [[ -z ${SUPABASE_BACKUP_AUTH_URL:-} ]]; then
    return
  fi
  local helper=/usr/local/libexec/leon-platform/supabase-storage-session-token.sh
  local owner mode
  if [[ ! -x ${helper} || -L ${helper} ]]; then
    echo "The Supabase Storage session helper must be an executable regular file." >&2
    exit 1
  fi
  owner=$(stat -c '%u' "${helper}")
  mode=$(stat -c '%a' "${helper}")
  if [[ ${owner} != 0 || $((8#${mode} & 022)) -ne 0 ]]; then
    echo "The Supabase Storage session helper must be root-owned and not group- or world-writable." >&2
    exit 1
  fi
  AWS_SESSION_TOKEN=$("${helper}")
  export AWS_SESSION_TOKEN
}

restic_with_fresh_session() {
  if [[ -n ${SUPABASE_BACKUP_AUTH_URL:-} ]]; then
    refresh_restic_session_token
    timeout --kill-after=30s "${SUPABASE_BACKUP_COMMAND_TIMEOUT_SECONDS}s" restic "$@"
  else
    restic "$@"
  fi
}

for command_name in cmp find flock hostname install jq mktemp pg_restore readlink restic sort stat; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command is unavailable: ${command_name}." >&2
    exit 1
  fi
done

MAINTENANCE_LOCK=${MAINTENANCE_LOCK:-/run/lock/leon-platform-maintenance.lock}
exec 9>"${MAINTENANCE_LOCK}"
flock -w "${MAINTENANCE_LOCK_TIMEOUT:-900}" 9 || {
  echo "Another platform deployment, migration, backup, or restore drill is still running." >&2
  exit 1
}

UPLOAD_ROOT=$(readlink -m "${UPLOAD_ROOT:-/opt/leon-platform/uploads}")
BACKUP_ROOT=$(readlink -m "${BACKUP_ROOT:-/opt/leon-platform/backups}")
BACKUP_STAGING_ROOT=$(readlink -m "${BACKUP_STAGING_ROOT:-/opt/leon-platform-backup-staging/staging-current}")
restore_drill_root_input=${RESTORE_DRILL_ROOT:-/opt/leon-platform/restore-drills}
if [[ -L ${restore_drill_root_input} ]]; then
  echo "RESTORE_DRILL_ROOT must not be a symlink." >&2
  exit 1
fi
RESTORE_DRILL_ROOT=$(readlink -m "${restore_drill_root_input}")
for required_path in "${UPLOAD_ROOT}" "${BACKUP_ROOT}" "${BACKUP_STAGING_ROOT}" "${RESTORE_DRILL_ROOT}"; do
  if [[ ${required_path} != /* || ${required_path} == / ]]; then
    echo "Restore drill paths must be absolute and cannot be /." >&2
    exit 1
  fi
done
install -o root -g root -m 0700 -d "${RESTORE_DRILL_ROOT}"
restore_root_owner=$(stat -c '%u' "${RESTORE_DRILL_ROOT}")
restore_root_mode=$(stat -c '%a' "${RESTORE_DRILL_ROOT}")
if [[ ${restore_root_owner} != 0 || $((8#${restore_root_mode} & 077)) -ne 0 ]]; then
  echo "RESTORE_DRILL_ROOT must be root-owned with no group or other permissions." >&2
  exit 1
fi

restore_target=
cleanup() {
  local status=$?
  trap - EXIT
  if [[ -n ${restore_target} && -d ${restore_target} ]]; then
    chmod 0700 "${restore_target}" || status=1
    rm -rf -- "${restore_target}" || status=1
  fi
  exit "${status}"
}
trap cleanup EXIT

restore_target=$(mktemp -d "${RESTORE_DRILL_ROOT}/restore.XXXXXXXX")
chmod 0700 "${restore_target}"

# No restored secret values are printed.
restic_with_fresh_session check >/dev/null
BACKUP_HOSTNAME=${BACKUP_HOSTNAME:-$(hostname)}
if [[ ! ${BACKUP_HOSTNAME} =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "BACKUP_HOSTNAME must be a non-empty hostname." >&2
  exit 1
fi
snapshot_json=$(restic_with_fresh_session snapshots --host "${BACKUP_HOSTNAME}" --json)
snapshot_id=$(jq -er 'if type == "array" and length > 0 then max_by(.time).id else empty end | select(type == "string" and test("^[0-9a-f]{64}$"))' <<<"${snapshot_json}")
snapshot_time=$(jq -er 'if type == "array" and length > 0 then max_by(.time).time else empty end | select(type == "string" and length > 0)' <<<"${snapshot_json}")
restic_with_fresh_session restore "${snapshot_id}" --target "${restore_target}" >/dev/null

restored_backup_root="${restore_target}${BACKUP_ROOT}"
if [[ ! -d ${restored_backup_root} ]]; then
  echo "The latest snapshot does not contain the configured backup directory." >&2
  exit 1
fi
mapfile -d '' -t restored_dumps < <(find "${restored_backup_root}" -type f -name 'postgres-*.dump' -print0)
if [[ ${#restored_dumps[@]} -ne 1 ]]; then
  echo "Expected exactly one restored PostgreSQL dump; found ${#restored_dumps[@]}." >&2
  exit 1
fi
pg_restore --list "${restored_dumps[0]}" >/dev/null

restored_uploads="${restore_target}${BACKUP_STAGING_ROOT}/uploads"
if [[ ! -d ${restored_uploads} ]]; then
  echo "The latest snapshot does not contain the staged upload directory." >&2
  exit 1
fi

upload_compared=false
while IFS= read -r -d '' restored_upload; do
  relative_upload=${restored_upload#"${restored_uploads}/"}
  live_upload="${UPLOAD_ROOT}/${relative_upload}"
  if [[ -f ${live_upload} && ! -L ${live_upload} ]]; then
    cmp -- "${restored_upload}" "${live_upload}" >/dev/null
    upload_compared=true
    break
  fi
done < <(find "${restored_uploads}" -type f -print0 | sort -z)

if [[ ${upload_compared} != true ]]; then
  echo "No overlapping live upload was available; database and repository integrity checks passed." >&2
fi

if [[ ${RESTIC_PASSWORD_FILE} == /* && -e "${restore_target}${RESTIC_PASSWORD_FILE}" ]]; then
  echo "The Restic password file was unexpectedly present in the restored snapshot." >&2
  exit 1
fi

printf 'Snapshot ID: %s\nSnapshot time: %s\nRestore verification: passed\n' "${snapshot_id}" "${snapshot_time}"
