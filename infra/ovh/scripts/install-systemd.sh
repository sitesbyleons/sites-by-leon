#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

SOURCE_ROOT=${SOURCE_ROOT:-/opt/leon-platform/app}
install -m 0644 "${SOURCE_ROOT}/infra/ovh/systemd/leon-backup.service" /etc/systemd/system/leon-backup.service
install -m 0644 "${SOURCE_ROOT}/infra/ovh/systemd/leon-backup.timer" /etc/systemd/system/leon-backup.timer
systemctl daemon-reload
systemctl enable --now leon-backup.timer
systemctl list-timers 'leon-*'
