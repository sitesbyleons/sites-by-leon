#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
SCRIPT=${REPOSITORY_ROOT}/infra/ovh/scripts/ensure-upload-directory.sh
FIXTURE=$(mktemp -d)
trap 'rm -rf "${FIXTURE}"' EXIT

mkdir -p "${FIXTURE}/bin" "${FIXTURE}/platform"
cat >"${FIXTURE}/bin/sudo" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
"$@"
EOF
chmod 0755 "${FIXTURE}/bin/sudo"

PATH="${FIXTURE}/bin:${PATH}" bash "${SCRIPT}" \
  TEST_UPLOADS_PATH "${FIXTURE}/platform/uploads-test" "${FIXTURE}/platform"

[[ -d ${FIXTURE}/platform/uploads-test ]]
[[ $(stat -c %a "${FIXTURE}/platform/uploads-test") == 750 ]]

for unsafe_path in / /etc "${FIXTURE}/platform" "${FIXTURE}/platform/../outside"; do
  if PATH="${FIXTURE}/bin:${PATH}" bash "${SCRIPT}" UPLOADS_PATH "${unsafe_path}" "${FIXTURE}/platform" \
    >/dev/null 2>&1; then
    echo "Unsafe upload path was accepted: ${unsafe_path}" >&2
    exit 1
  fi
done

ln -s "${FIXTURE}/outside" "${FIXTURE}/platform/uploads-link"
if PATH="${FIXTURE}/bin:${PATH}" bash "${SCRIPT}" UPLOADS_PATH \
  "${FIXTURE}/platform/uploads-link" "${FIXTURE}/platform" >/dev/null 2>&1; then
  echo "Symlinked upload path was accepted." >&2
  exit 1
fi

echo "Upload directory provisioning tests passed."
