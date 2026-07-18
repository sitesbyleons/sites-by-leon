#!/usr/bin/env bash
set -euo pipefail
umask 077

MAINTENANCE_LOCK=${MAINTENANCE_LOCK:-/run/lock/leon-platform-maintenance.lock}
exec 9>"${MAINTENANCE_LOCK}"
flock -w "${MAINTENANCE_LOCK_TIMEOUT:-900}" 9 || {
  echo "Another platform deployment, migration, or backup is still running." >&2
  exit 1
}

: "${RESTIC_REPOSITORY:?Set RESTIC_REPOSITORY, for example s3:https://ENDPOINT/BUCKET/restic.}"
: "${RESTIC_PASSWORD_FILE:?Set RESTIC_PASSWORD_FILE to a chmod-600 file.}"
case "${RESTIC_REPOSITORY}" in
  s3:*|b2:*|azure:*|gs:*|sftp:*|rest:*) ;;
  *)
    if [[ ${ALLOW_LOCAL_BACKUP:-false} != true ]]; then
      echo "Local Restic repositories require ALLOW_LOCAL_BACKUP=true and are not production backups." >&2
      exit 1
    fi
    ;;
esac
if [[ "${RESTIC_REPOSITORY}" == s3:* ]]; then
  : "${AWS_ACCESS_KEY_ID:?Set the OVH S3 access key.}"
  : "${AWS_SECRET_ACCESS_KEY:?Set the OVH S3 secret key.}"
fi

SOURCE_ROOT=${SOURCE_ROOT:-/opt/leon-platform/current}
SOURCE_ROOT=$(readlink -f "${SOURCE_ROOT}")
COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-leon-platform}
UPLOAD_ROOT=${UPLOAD_ROOT:-/opt/leon-platform/uploads}
BACKUP_ROOT=${BACKUP_ROOT:-/opt/leon-platform/backups}
BACKUP_STAGING_ROOT=${BACKUP_STAGING_ROOT:-/opt/leon-platform-backup-staging/staging-current}
BACKUP_MIN_FREE_BYTES=${BACKUP_MIN_FREE_BYTES:-10737418240}
BACKUP_HEALTHCHECK_SCRIPT=${BACKUP_HEALTHCHECK_SCRIPT:-/usr/local/libexec/leon-platform/healthcheck.sh}
BACKUP_HEALTHCHECK_ATTEMPTS=${BACKUP_HEALTHCHECK_ATTEMPTS:-12}
BACKUP_HEALTHCHECK_INTERVAL_SECONDS=${BACKUP_HEALTHCHECK_INTERVAL_SECONDS:-5}
if [[ ! ${BACKUP_MIN_FREE_BYTES} =~ ^[0-9]+$ ]]; then
  echo "BACKUP_MIN_FREE_BYTES must be a whole number of bytes." >&2
  exit 1
fi
for positive_number in BACKUP_HEALTHCHECK_ATTEMPTS BACKUP_HEALTHCHECK_INTERVAL_SECONDS; do
  if [[ ! ${!positive_number} =~ ^[1-9][0-9]*$ ]]; then
    echo "${positive_number} must be a positive whole number." >&2
    exit 1
  fi
done
if [[ ! -f ${BACKUP_HEALTHCHECK_SCRIPT} || -L ${BACKUP_HEALTHCHECK_SCRIPT} ]]; then
  echo "BACKUP_HEALTHCHECK_SCRIPT must be a regular, non-symlink file." >&2
  exit 1
fi
healthcheck_owner=$(stat -c '%u' "${BACKUP_HEALTHCHECK_SCRIPT}")
healthcheck_mode=$(stat -c '%a' "${BACKUP_HEALTHCHECK_SCRIPT}")
if [[ ${healthcheck_owner} != 0 || $((8#${healthcheck_mode} & 022)) -ne 0 ]]; then
  echo "BACKUP_HEALTHCHECK_SCRIPT must be root-owned and not group- or world-writable." >&2
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

service_container() {
  local service=$1
  local -a containers
  mapfile -t containers < <(
    docker ps --all \
      --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME}" \
      --filter "label=com.docker.compose.service=${service}" \
      --format '{{.ID}}'
  )
  if [[ ${#containers[@]} -ne 1 ]]; then
    echo "Expected one ${COMPOSE_PROJECT_NAME} ${service} container; found ${#containers[@]}." >&2
    return 1
  fi
  printf '%s\n' "${containers[0]}"
}

dashboard_container=$(service_container dashboard)
photographer_container=$(service_container photographer)
database_container=$(service_container database)

if [[ $(docker inspect --format '{{.State.Running}}' "${database_container}") != true ]]; then
  echo "The PostgreSQL container must be running before a backup starts." >&2
  exit 1
fi

wait_for_application_health() {
  local attempt
  for ((attempt = 1; attempt <= BACKUP_HEALTHCHECK_ATTEMPTS; attempt += 1)); do
    if SOURCE_ROOT="${SOURCE_ROOT}" /usr/bin/bash "${BACKUP_HEALTHCHECK_SCRIPT}" >/dev/null 2>&1; then
      return 0
    fi
    if (( attempt < BACKUP_HEALTHCHECK_ATTEMPTS )); then
      sleep "${BACKUP_HEALTHCHECK_INTERVAL_SECONDS}"
    fi
  done
  echo "Application health checks did not recover after backup restart." >&2
  return 1
}

restart_application_containers() {
  docker start "${dashboard_container}" "${photographer_container}" >/dev/null
  wait_for_application_health
}

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
  if [[ ${stop_attempted} -eq 1 ]]; then
    if ! restart_application_containers; then
      echo "The backup failed and application recovery did not pass health checks." >&2
      status=1
    fi
  fi
  if ! rm -f "${dump}"; then
    echo "Could not remove the temporary PostgreSQL dump." >&2
    status=1
  fi
  if ! rm -rf -- "${staging}"; then
    echo "Could not remove the temporary upload staging directory." >&2
    status=1
  fi
  exit "${status}"
}
trap cleanup EXIT

mkdir -p "${staged_uploads}"
rsync -a --delete "${UPLOAD_ROOT}/" "${staged_uploads}/"
stop_attempted=1
docker stop "${dashboard_container}" "${photographer_container}" >/dev/null
rsync -a --delete "${UPLOAD_ROOT}/" "${staged_uploads}/"
docker exec "${database_container}" sh -c \
  'pg_dump --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --format custom --no-owner --no-acl' > "${dump}"
restart_application_containers
stop_attempted=0
restic snapshots >/dev/null 2>&1 || restic init
backup_paths=("${dump}" "${staged_uploads}")
[[ -d "${SOURCE_ROOT}" ]] && backup_paths+=("${SOURCE_ROOT}")
[[ -d /opt/leon-platform/secrets ]] && backup_paths+=(/opt/leon-platform/secrets)
restic backup --exclude "${RESTIC_PASSWORD_FILE}" "${backup_paths[@]}"
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
echo "Encrypted database and application backup completed."
