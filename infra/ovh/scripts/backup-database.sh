#!/usr/bin/env bash
set -euo pipefail

: "${RESTIC_REPOSITORY:?Set RESTIC_REPOSITORY, for example s3:https://ENDPOINT/BUCKET/restic.}"
: "${RESTIC_PASSWORD_FILE:?Set RESTIC_PASSWORD_FILE to a chmod-600 file.}"
: "${AWS_ACCESS_KEY_ID:?Set the OVH S3 access key.}"
: "${AWS_SECRET_ACCESS_KEY:?Set the OVH S3 secret key.}"

BACKUP_ROOT=${BACKUP_ROOT:-/opt/leon-platform/backups}
mkdir -p "${BACKUP_ROOT}"
dump="${BACKUP_ROOT}/postgres-$(date -u +%Y%m%dT%H%M%SZ).dump"
trap 'rm -f "${dump}"' EXIT

cd /opt/leon-platform/app/infra/ovh
docker compose exec -T database pg_dump --username "${POSTGRES_USER:-leon_app}" --dbname "${POSTGRES_DB:-leon_platform}" --format custom --no-owner --no-acl > "${dump}"
restic snapshots >/dev/null 2>&1 || restic init
backup_paths=("${dump}")
[[ -d /opt/leon-platform/app ]] && backup_paths+=(/opt/leon-platform/app)
[[ -d /opt/leon-platform/secrets ]] && backup_paths+=(/opt/leon-platform/secrets)
[[ -d /opt/leon-platform/uploads ]] && backup_paths+=(/opt/leon-platform/uploads)
restic backup --exclude /opt/leon-platform/secrets/restic-password "${backup_paths[@]}"
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
echo "Encrypted database and application backup completed."
