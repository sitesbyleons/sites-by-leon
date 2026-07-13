#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

SOURCE_ROOT=${SOURCE_ROOT:-/opt/leon-platform/current}
BACKUP_ENV=/opt/leon-platform/secrets/backup.env

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
install -m 0644 "${SOURCE_ROOT}/infra/ovh/systemd/leon-backup.service" /etc/systemd/system/leon-backup.service
install -m 0644 "${SOURCE_ROOT}/infra/ovh/systemd/leon-backup.timer" /etc/systemd/system/leon-backup.timer
systemctl daemon-reload
systemctl enable --now leon-backup.timer
systemctl list-timers 'leon-*'
