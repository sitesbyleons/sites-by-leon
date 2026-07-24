#!/usr/bin/env bash
set -euo pipefail

[[ $# -eq 1 && $1 =~ ^[0-9a-f]{40}$ ]] || { echo 'Usage: activate-test-release.sh <40-character-release-sha>' >&2; exit 2; }
sha=$1
platform_root=${PLATFORM_ROOT:-/opt/leon-platform}
release=${platform_root}/releases/${sha}
[[ -d ${release} && ! -L ${release} ]] || { echo 'The immutable staging release is missing.' >&2; exit 1; }

maintenance_lock=${MAINTENANCE_LOCK:-/run/lock/leon-platform-maintenance.lock}
exec 9>"${maintenance_lock}"
flock -w "${MAINTENANCE_LOCK_TIMEOUT:-900}" 9 || { echo 'Another platform deployment is running.' >&2; exit 1; }

previous=$(readlink -f "${platform_root}/current-test" 2>/dev/null || true)
sudo ln -sfn "${release}" "${platform_root}/current-test.new"
sudo mv -Tf "${platform_root}/current-test.new" "${platform_root}/current-test"
if ! MAINTENANCE_LOCK_HELD=1 RELEASE_SHA="${sha}" SOURCE_ROOT="${release}" \
  /usr/bin/bash "${release}/infra/ovh/scripts/deploy-test.sh"; then
  if [[ -n ${previous} && -d ${previous} ]]; then
    sudo ln -sfn "${previous}" "${platform_root}/current-test.new"
    sudo mv -Tf "${platform_root}/current-test.new" "${platform_root}/current-test"
    MAINTENANCE_LOCK_HELD=1 RELEASE_SHA=$(basename "${previous}") SOURCE_ROOT="${previous}" \
      /usr/bin/bash "${previous}/infra/ovh/scripts/deploy-test.sh" || true
  fi
  exit 1
fi

echo "Staging release ${sha} activated with automatic rollback protection."
