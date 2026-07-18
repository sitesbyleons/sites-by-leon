#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
SCRIPT="${ROOT}/infra/ovh/scripts/verify-backup-restore.sh"
FIXTURE=$(mktemp -d)
trap 'chmod -R u+rwX "${FIXTURE}" 2>/dev/null || true; rm -rf -- "${FIXTURE}"' EXIT

mkdir -p "${FIXTURE}/bin" "${FIXTURE}/uploads/workspace-1" "${FIXTURE}/staging-current"
printf 'test-password\n' > "${FIXTURE}/restic-password"
printf 'sample-upload\n' > "${FIXTURE}/uploads/workspace-1/sample.webp"
chmod 600 "${FIXTURE}/restic-password"

cat > "${FIXTURE}/bin/restic" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${MOCK_COMMAND_LOG}"
case "${1:-}" in
  check)
    ;;
  snapshots)
    printf '[{"id":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","time":"2026-07-18T05:00:00Z"}]\n'
    ;;
  restore)
    target=
    while [[ $# -gt 0 ]]; do
      if [[ $1 == --target ]]; then
        target=$2
        break
      fi
      shift
    done
    [[ -n ${target} ]]
    mkdir -p \
      "${target}${BACKUP_ROOT}" \
      "${target}${BACKUP_STAGING_ROOT}/uploads/workspace-1" \
      "${target}/opt/leon-platform/secrets"
    printf 'valid-custom-dump\n' > "${target}${BACKUP_ROOT}/postgres-20260718T050000Z.dump"
    cp "${UPLOAD_ROOT}/workspace-1/sample.webp" "${target}${BACKUP_STAGING_ROOT}/uploads/workspace-1/sample.webp"
    printf 'RESTORED_SECRET_CANARY\n' > "${target}/opt/leon-platform/secrets/dashboard.env"
    ;;
  *)
    echo "Unexpected Restic command: ${1:-missing}" >&2
    exit 90
    ;;
esac
EOF

cat > "${FIXTURE}/bin/jq" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
filter=${2:-}
if [[ ${filter} == *'.id'* ]]; then
  printf 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n'
elif [[ ${filter} == *'.time'* ]]; then
  printf '2026-07-18T05:00:00Z\n'
else
  exit 91
fi
EOF

cat > "${FIXTURE}/bin/pg_restore" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
[[ ${1:-} == --list ]]
grep -qx 'valid-custom-dump' "${2:?Missing dump path.}"
if [[ ${MOCK_PG_RESTORE_FAIL:-false} == true ]]; then
  exit 92
fi
printf 'pg_restore verified\n' >> "${MOCK_COMMAND_LOG}"
EOF

chmod +x "${FIXTURE}/bin/restic" "${FIXTURE}/bin/jq" "${FIXTURE}/bin/pg_restore"

run_drill() {
  unshare -Ur env \
    PATH="${FIXTURE}/bin:/usr/bin:/bin" \
    RESTIC_REPOSITORY="${TEST_REPOSITORY:-s3:https://example.invalid/leon-backups/restic}" \
    RESTIC_PASSWORD_FILE="${FIXTURE}/restic-password" \
    ALLOW_LOCAL_BACKUP="${ALLOW_LOCAL_BACKUP:-false}" \
    AWS_ACCESS_KEY_ID=test-access-key \
    AWS_SECRET_ACCESS_KEY=test-secret-key \
    MAINTENANCE_LOCK="${FIXTURE}/maintenance.lock" \
    UPLOAD_ROOT="${FIXTURE}/uploads" \
    BACKUP_ROOT="${FIXTURE}/backups" \
    BACKUP_STAGING_ROOT="${FIXTURE}/staging-current" \
    RESTORE_DRILL_ROOT="${FIXTURE}/restore-drills" \
    MOCK_COMMAND_LOG="${FIXTURE}/commands.log" \
    MOCK_PG_RESTORE_FAIL="${MOCK_PG_RESTORE_FAIL:-false}" \
    bash "${SCRIPT}"
}

assert_restore_root_empty() {
  if find "${FIXTURE}/restore-drills" -mindepth 1 -print -quit | grep -q .; then
    echo 'Restore drill left temporary files behind.' >&2
    exit 1
  fi
}

run_drill > "${FIXTURE}/output" 2> "${FIXTURE}/error"
grep -qx 'Snapshot ID: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' "${FIXTURE}/output"
grep -qx 'Snapshot time: 2026-07-18T05:00:00Z' "${FIXTURE}/output"
grep -qx 'Restore verification: passed' "${FIXTURE}/output"
[[ $(wc -l < "${FIXTURE}/output") -eq 3 ]]
[[ ! -s "${FIXTURE}/error" ]]
if grep -q 'RESTORED_SECRET_CANARY' "${FIXTURE}/output" "${FIXTURE}/error"; then
  echo 'Restore drill printed a restored secret value.' >&2
  exit 1
fi
grep -qx 'check' "${FIXTURE}/commands.log"
grep -q '^snapshots --latest 1 --json$' "${FIXTURE}/commands.log"
grep -q '^restore .* --target ' "${FIXTURE}/commands.log"
grep -qx 'pg_restore verified' "${FIXTURE}/commands.log"
assert_restore_root_empty

set +e
MOCK_PG_RESTORE_FAIL=true run_drill > "${FIXTURE}/failed-output" 2> "${FIXTURE}/failed-error"
failure_status=$?
set -e
if [[ ${failure_status} -eq 0 ]]; then
  echo 'Restore drill unexpectedly passed an invalid PostgreSQL archive.' >&2
  exit 1
fi
assert_restore_root_empty

set +e
unshare -Ur env \
  PATH="${FIXTURE}/bin:/usr/bin:/bin" \
  RESTIC_REPOSITORY="${FIXTURE}/local-restic" \
  RESTIC_PASSWORD_FILE="${FIXTURE}/restic-password" \
  MAINTENANCE_LOCK="${FIXTURE}/maintenance.lock" \
  bash "${SCRIPT}" > "${FIXTURE}/local-output" 2> "${FIXTURE}/local-error"
local_status=$?
set -e
if [[ ${local_status} -eq 0 ]]; then
  echo 'Restore drill unexpectedly accepted a local production repository.' >&2
  exit 1
fi
grep -q 'Local Restic repositories require ALLOW_LOCAL_BACKUP=true' "${FIXTURE}/local-error"

TEST_REPOSITORY="${FIXTURE}/local-restic" ALLOW_LOCAL_BACKUP=true \
  run_drill > "${FIXTURE}/local-allowed-output" 2> "${FIXTURE}/local-allowed-error"
grep -qx 'Restore verification: passed' "${FIXTURE}/local-allowed-output"
assert_restore_root_empty

echo 'Backup restore regression tests passed.'
