#!/usr/bin/env bash
set -euo pipefail

MAINTENANCE_LOCK=${MAINTENANCE_LOCK:-/run/lock/leon-platform-maintenance.lock}
exec 9>"${MAINTENANCE_LOCK}"
flock -w "${MAINTENANCE_LOCK_TIMEOUT:-900}" 9 || {
  echo "Another platform deployment, migration, or backup is still running." >&2
  exit 1
}

: "${RESTIC_REPOSITORY:?Set RESTIC_REPOSITORY, for example s3:https://ENDPOINT/BUCKET/restic.}"
: "${RESTIC_PASSWORD_FILE:?Set RESTIC_PASSWORD_FILE to a chmod-600 file.}"
if [[ "${RESTIC_REPOSITORY}" == s3:* ]]; then
  : "${AWS_ACCESS_KEY_ID:?Set the OVH S3 access key.}"
  : "${AWS_SECRET_ACCESS_KEY:?Set the OVH S3 secret key.}"
fi

SOURCE_ROOT=${SOURCE_ROOT:-/opt/leon-platform/current}
SOURCE_ROOT=$(readlink -f "${SOURCE_ROOT}")
UPLOAD_ROOT=${UPLOAD_ROOT:-/opt/leon-platform/uploads}
BACKUP_ROOT=${BACKUP_ROOT:-/opt/leon-platform/backups}
BACKUP_STAGING_ROOT=${BACKUP_STAGING_ROOT:-/opt/leon-platform-backup-staging/staging-current}
BACKUP_MIN_FREE_BYTES=${BACKUP_MIN_FREE_BYTES:-10737418240}
if [[ ! ${BACKUP_MIN_FREE_BYTES} =~ ^[0-9]+$ ]]; then
  echo "BACKUP_MIN_FREE_BYTES must be a whole number of bytes." >&2
  exit 1
fi
UPLOAD_ROOT=$(readlink -m "${UPLOAD_ROOT}")
BACKUP_ROOT=$(readlink -m "${BACKUP_ROOT}")
staging=$(readlink -m "${BACKUP_STAGING_ROOT}")
for required_path in "${SOURCE_ROOT}" "${UPLOAD_ROOT}" "${BACKUP_ROOT}" "${staging}"; do
  if [[ ${required_path} == / ]]; then
    echo "Refusing to use / as an application or backup path." >&2
    exit 1
  fi
done

paths_overlap() {
  local first=$1
  local second=$2
  [[ ${first} != / ]] && first=${first%/}
  [[ ${second} != / ]] && second=${second%/}
  if [[ ${first} == / || ${second} == / ]]; then
    [[ ${first} == "${second}" ]]
    return
  fi
  [[ ${first} == "${second}" || ${first} == "${second}/"* || ${second} == "${first}/"* ]]
}

if [[ $(basename "${staging}") != staging-current ]]; then
  echo "BACKUP_STAGING_ROOT must be a dedicated directory named staging-current." >&2
  exit 1
fi

for protected_path in / "${SOURCE_ROOT}" "${UPLOAD_ROOT}" "${BACKUP_ROOT}"; do
  if paths_overlap "${staging}" "${protected_path}"; then
    echo "BACKUP_STAGING_ROOT must be a dedicated non-overlapping directory." >&2
    exit 1
  fi
done

mkdir -p "${BACKUP_ROOT}" "${UPLOAD_ROOT}" "$(dirname "${staging}")"
dump="${BACKUP_ROOT}/postgres-$(date -u +%Y%m%dT%H%M%SZ).dump"
staged_uploads="${staging}/uploads"
stop_attempted=0

existing_parent() {
  local path=$1
  while [[ ! -e ${path} && ${path} != / ]]; do
    path=$(dirname "${path}")
  done
  printf '%s\n' "${path}"
}

free_bytes() {
  df -Pk "$(existing_parent "$1")" | awk 'NR == 2 { printf "%.0f\n", $4 * 1024 }'
}

filesystem_device() {
  df -P "$(existing_parent "$1")" | awk 'NR == 2 { print $1 }'
}

require_free_space() {
  local path=$1
  local required=$2
  local available
  available=$(free_bytes "${path}")
  if (( available < required )); then
    echo "Not enough free space for a safe backup at ${path}: need ${required} bytes, have ${available}." >&2
    exit 1
  fi
}

upload_bytes=$(du -sb "${UPLOAD_ROOT}" | awk '{ print $1 }')
staging_required=$((upload_bytes + BACKUP_MIN_FREE_BYTES))
repository_path=
case "${RESTIC_REPOSITORY}" in
  /*) repository_path=$(readlink -m "${RESTIC_REPOSITORY}") ;;
  local:/*) repository_path=$(readlink -m "${RESTIC_REPOSITORY#local:}") ;;
esac

if [[ -n ${repository_path} ]]; then
  if paths_overlap "${staging}" "${repository_path}"; then
    echo "BACKUP_STAGING_ROOT must not overlap the Restic repository." >&2
    exit 1
  fi
  repository_required=$((upload_bytes + BACKUP_MIN_FREE_BYTES))
  if [[ $(filesystem_device "${staging}") == $(filesystem_device "${repository_path}") ]]; then
    require_free_space "${staging}" $((upload_bytes * 2 + BACKUP_MIN_FREE_BYTES))
  else
    require_free_space "${staging}" "${staging_required}"
    require_free_space "${repository_path}" "${repository_required}"
  fi
else
  require_free_space "${staging}" "${staging_required}"
fi

cleanup() {
  local status=$?
  trap - EXIT
  rm -f "${dump}"
  rm -rf -- "${staging}"
  if [[ ${stop_attempted} -eq 1 ]]; then
    docker compose up -d dashboard northline >/dev/null || true
  fi
  exit "${status}"
}
trap cleanup EXIT

cd "${SOURCE_ROOT}/infra/ovh"
mkdir -p "${staged_uploads}"
rsync -a --delete "${UPLOAD_ROOT}/" "${staged_uploads}/"
stop_attempted=1
docker compose stop dashboard northline
rsync -a --delete "${UPLOAD_ROOT}/" "${staged_uploads}/"
docker compose exec -T database sh -c 'pg_dump --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --format custom --no-owner --no-acl' > "${dump}"
docker compose up -d dashboard northline >/dev/null
stop_attempted=0
restic snapshots >/dev/null 2>&1 || restic init
backup_paths=("${dump}" "${staged_uploads}")
[[ -d "${SOURCE_ROOT}" ]] && backup_paths+=("${SOURCE_ROOT}")
[[ -d /opt/leon-platform/secrets ]] && backup_paths+=(/opt/leon-platform/secrets)
restic backup --exclude /opt/leon-platform/secrets/restic-password "${backup_paths[@]}"
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
echo "Encrypted database and application backup completed."
