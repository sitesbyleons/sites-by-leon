#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

SOURCE_ROOT=${SOURCE_ROOT:-/opt/leon-platform/current}
SOURCE_ROOT=$(readlink -f "${SOURCE_ROOT}")
LIBEXEC_ROOT=/usr/local/libexec/leon-platform
BACKUP_SECRETS_ROOT=/opt/leon-platform/backup-secrets
BACKUP_ENV=${BACKUP_SECRETS_ROOT}/backup.env
ENVIRONMENT_LOADER_SOURCE=${SOURCE_ROOT}/infra/ovh/scripts/load-backup-environment.sh

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

require_root_secret_directory "${BACKUP_SECRETS_ROOT}"
if [[ ! -e ${BACKUP_ENV} ]]; then
  echo "Create ${BACKUP_ENV} from backup.env.example before enabling backups." >&2
  exit 1
fi
require_root_secret "${BACKUP_ENV}"
if [[ ! -f ${ENVIRONMENT_LOADER_SOURCE} || -L ${ENVIRONMENT_LOADER_SOURCE} ]]; then
  echo "The backup environment loader must be a regular release file." >&2
  exit 1
fi
source "${ENVIRONMENT_LOADER_SOURCE}"
load_backup_environment "${BACKUP_ENV}"
: "${RESTIC_REPOSITORY:?Set RESTIC_REPOSITORY to the remote backup repository.}"
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
  echo "Install rclone before enabling this Restic repository." >&2
  exit 1
fi
if [[ -n ${SUPABASE_BACKUP_AUTH_URL:-} ]]; then
  : "${SUPABASE_BACKUP_EMAIL:?Set the dedicated Supabase backup identity email.}"
  : "${SUPABASE_BACKUP_PASSWORD:?Set the dedicated Supabase backup identity password.}"
  : "${AWS_ACCESS_KEY_ID:?Set the Supabase project reference for S3 session authentication.}"
  : "${AWS_SECRET_ACCESS_KEY:?Set the Supabase legacy anon key for S3 session authentication.}"
  if [[ "${RESTIC_REPOSITORY}" != rclone:* ]]; then
    echo "Supabase Storage backups require Restic's rclone backend." >&2
    exit 1
  fi
  if ! command -v curl >/dev/null 2>&1; then
    echo "Install curl before enabling Supabase Storage backups." >&2
    exit 1
  fi
  if ! command -v jq >/dev/null 2>&1; then
    echo "Install jq before enabling Supabase Storage backups." >&2
    exit 1
  fi
  SUPABASE_BACKUP_COMMAND_TIMEOUT_SECONDS=${SUPABASE_BACKUP_COMMAND_TIMEOUT_SECONDS:-3000}
  if [[ ! ${SUPABASE_BACKUP_COMMAND_TIMEOUT_SECONDS} =~ ^[1-9][0-9]*$ ]] || (( SUPABASE_BACKUP_COMMAND_TIMEOUT_SECONDS > 3000 )); then
    echo "SUPABASE_BACKUP_COMMAND_TIMEOUT_SECONDS must be between 1 and 3000." >&2
    exit 1
  fi
  if ! command -v timeout >/dev/null 2>&1; then
    echo "Install timeout before enabling Supabase Storage backups." >&2
    exit 1
  fi
fi
if [[ -z ${RESTIC_PASSWORD_FILE:-} ]]; then
  echo "RESTIC_PASSWORD_FILE must point to a private root-owned file." >&2
  exit 1
fi
require_root_secret "${RESTIC_PASSWORD_FILE}"
require_root_secret_directory "$(dirname "${RESTIC_PASSWORD_FILE}")"

install -o root -g root -m 0755 -d "${LIBEXEC_ROOT}"
systemctl disable --now leon-backup.timer >/dev/null 2>&1 || true
install -o root -g root -m 0755 \
  "${ENVIRONMENT_LOADER_SOURCE}" \
  "${LIBEXEC_ROOT}/load-backup-environment.sh"
install -o root -g root -m 0755 \
  "${SOURCE_ROOT}/infra/ovh/scripts/supabase-storage-session-token.sh" \
  "${LIBEXEC_ROOT}/supabase-storage-session-token.sh"
if [[ -n ${SUPABASE_BACKUP_AUTH_URL:-} ]]; then
  AWS_SESSION_TOKEN=$("${LIBEXEC_ROOT}/supabase-storage-session-token.sh")
  export AWS_SESSION_TOKEN
  set +e
  timeout --kill-after=5s 60s restic cat config >/dev/null 2>&1
  repository_status=$?
  set -e
  if (( repository_status == 10 )); then
    AWS_SESSION_TOKEN=$("${LIBEXEC_ROOT}/supabase-storage-session-token.sh")
    export AWS_SESSION_TOKEN
    if ! timeout --kill-after=5s 60s restic init >/dev/null 2>&1; then
      unset AWS_SESSION_TOKEN
      echo "Backup repository preflight failed; the timer remains disabled." >&2
      exit 1
    fi
    AWS_SESSION_TOKEN=$("${LIBEXEC_ROOT}/supabase-storage-session-token.sh")
    export AWS_SESSION_TOKEN
    if ! timeout --kill-after=5s 60s restic cat config >/dev/null 2>&1; then
      unset AWS_SESSION_TOKEN
      echo "Backup repository preflight failed; the timer remains disabled." >&2
      exit 1
    fi
  elif (( repository_status != 0 )); then
    unset AWS_SESSION_TOKEN
    echo "Backup repository preflight failed; the timer remains disabled." >&2
    exit 1
  fi
  unset AWS_SESSION_TOKEN
fi
install -o root -g root -m 0755 \
  "${SOURCE_ROOT}/infra/ovh/scripts/backup-database.sh" \
  "${LIBEXEC_ROOT}/backup-database.sh"
install -o root -g root -m 0755 \
  "${SOURCE_ROOT}/infra/ovh/scripts/verify-backup-restore.sh" \
  "${LIBEXEC_ROOT}/verify-backup-restore.sh"
install -o root -g root -m 0755 \
  "${SOURCE_ROOT}/infra/ovh/scripts/healthcheck.sh" \
  "${LIBEXEC_ROOT}/healthcheck.sh"
install -o root -g root -m 0644 "${SOURCE_ROOT}/infra/ovh/tmpfiles/leon-platform.conf" /etc/tmpfiles.d/leon-platform.conf
systemd-tmpfiles --create /etc/tmpfiles.d/leon-platform.conf
install -o root -g root -m 0644 "${SOURCE_ROOT}/infra/ovh/systemd/leon-backup.service" /etc/systemd/system/leon-backup.service
install -o root -g root -m 0644 "${SOURCE_ROOT}/infra/ovh/systemd/leon-backup.timer" /etc/systemd/system/leon-backup.timer
systemctl daemon-reload
systemctl enable --now leon-backup.timer
systemctl list-timers 'leon-*'
