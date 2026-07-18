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
set -a
source "${BACKUP_ENV}"
set +a
if [[ -z ${RESTIC_PASSWORD_FILE:-} ]]; then
  echo "RESTIC_PASSWORD_FILE must point to a private root-owned file." >&2
  exit 1
fi
require_root_secret "${RESTIC_PASSWORD_FILE}"
require_root_secret_directory "$(dirname "${RESTIC_PASSWORD_FILE}")"

install -o root -g root -m 0755 -d "${LIBEXEC_ROOT}"
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
