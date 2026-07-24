#!/usr/bin/env bash
set -euo pipefail

[[ $# -eq 1 && $1 =~ ^[0-9a-f]{40}$ ]] || { echo 'Usage: promote-tested-release.sh <40-character-release-sha>' >&2; exit 2; }
sha=$1
platform_root=${PLATFORM_ROOT:-/opt/leon-platform}
release=${platform_root}/releases/${sha}
tested=$(basename "$(readlink -f "${platform_root}/current-test")")
[[ ${tested} == "${sha}" ]] || { echo 'Only the currently deployed staging release can be promoted.' >&2; exit 1; }
[[ -d ${release} && ! -L ${release} ]] || { echo 'The tested immutable release is missing.' >&2; exit 1; }

maintenance_lock=${MAINTENANCE_LOCK:-/run/lock/leon-platform-maintenance.lock}
exec 9>"${maintenance_lock}"
flock -w "${MAINTENANCE_LOCK_TIMEOUT:-900}" 9 || { echo 'Another platform deployment is running.' >&2; exit 1; }

previous=$(readlink -f "${platform_root}/current")
sudo ln -sfn "${release}" "${platform_root}/current.new"
sudo mv -Tf "${platform_root}/current.new" "${platform_root}/current"
if ! MAINTENANCE_LOCK_HELD=1 RELEASE_SHA="${sha}" SOURCE_ROOT="${release}" /usr/bin/bash "${release}/infra/ovh/scripts/deploy.sh"; then
  sudo ln -sfn "${previous}" "${platform_root}/current.new"
  sudo mv -Tf "${platform_root}/current.new" "${platform_root}/current"
  MAINTENANCE_LOCK_HELD=1 RELEASE_SHA=$(basename "${previous}") SOURCE_ROOT="${previous}" \
    /usr/bin/bash "${previous}/infra/ovh/scripts/deploy.sh" || true
  exit 1
fi

echo "Tested release ${sha} promoted to production."
