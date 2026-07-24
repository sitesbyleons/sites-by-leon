#!/usr/bin/env bash
set -euo pipefail
umask 077

SOURCE_ROOT=${SOURCE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}
LOCAL_OVH_ROOT=${LOCAL_OVH_ROOT:-${SOURCE_ROOT}/infra/ovh}
LOCAL_SECRETS_ROOT=${LOCAL_SECRETS_ROOT:-${LOCAL_OVH_ROOT}/secrets}
KNOWN_HOSTS=${KNOWN_HOSTS:-${LOCAL_OVH_ROOT}/ssh_known_hosts}
REMOTE_SECRETS_ROOT=${REMOTE_SECRETS_ROOT:-/opt/leon-platform/secrets}
REMOTE_SECRET_OWNER=${REMOTE_SECRET_OWNER:-ubuntu}
SECRETS_PROFILE=${SECRETS_PROFILE:-production}
case "${SECRETS_PROFILE}" in
  production)
    required_names=(.env postgres.env dashboard.env northline.env cloudflare-tunnel-token)
    optional_names=(domain-worker.env)
    ;;
  staging)
    required_names=(.env postgres.env dashboard.env)
    optional_names=()
    ;;
  *)
    echo 'Secret sync failed: SECRETS_PROFILE must be production or staging.' >&2
    exit 1
    ;;
esac

fail() {
  echo "Secret sync failed: $1" >&2
  exit 1
}

if [[ $# -ne 2 ]]; then
  fail 'usage: sync-secrets.sh user@host /path/to/identity-file'
fi
REMOTE_HOST=$1
IDENTITY_FILE=$2
if [[ ! ${REMOTE_HOST} =~ ^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$ ]]; then
  fail 'the remote host must use user@hostname format.'
fi
if [[ ! ${REMOTE_SECRET_OWNER} =~ ^[a-z_][a-z0-9_-]*$ ]]; then
  fail 'REMOTE_SECRET_OWNER is invalid.'
fi
if [[ ! ${REMOTE_SECRETS_ROOT} =~ ^/[A-Za-z0-9._/-]+$ || ${REMOTE_SECRETS_ROOT} == / || ${REMOTE_SECRETS_ROOT} == *'/../'* || ${REMOTE_SECRETS_ROOT} == *'/..' ]]; then
  fail 'REMOTE_SECRETS_ROOT must be an absolute non-root path.'
fi

require_mode_600_file() {
  local file=$1
  local label=$2
  local owner mode
  if [[ ! -f ${file} || -L ${file} ]]; then
    fail "${label} must be a regular, non-symlink file."
  fi
  owner=$(stat -c '%u' "${file}" 2>/dev/null) || fail "could not inspect ${label} ownership."
  mode=$(stat -c '%a' "${file}" 2>/dev/null) || fail "could not inspect ${label} permissions."
  if [[ ${owner} != "$(id -u)" || ${mode} != 600 ]]; then
    fail "${label} must belong to the current user and have mode 600."
  fi
}

require_mode_600_file "${IDENTITY_FILE}" 'identity file'
if [[ ! -f ${KNOWN_HOSTS} || -L ${KNOWN_HOSTS} ]]; then
  fail 'the pinned known-hosts path must be a regular, non-symlink file.'
fi
known_hosts_owner=$(stat -c '%u' "${KNOWN_HOSTS}" 2>/dev/null) || fail 'could not inspect pinned known-hosts ownership.'
known_hosts_mode=$(stat -c '%a' "${KNOWN_HOSTS}" 2>/dev/null) || fail 'could not inspect pinned known-hosts permissions.'
if [[ ${known_hosts_owner} != "$(id -u)" || $((8#${known_hosts_mode} & 022)) -ne 0 ]]; then
  fail 'the pinned known-hosts file must belong to the current user and not be group- or world-writable.'
fi

source_paths=()
remote_names=()
for name in "${required_names[@]}"; do
  if [[ ${name} == .env ]]; then
    if [[ ${SECRETS_PROFILE} == staging ]]; then
      source=${LOCAL_SECRETS_ROOT}/.env
    else
      source=${LOCAL_OVH_ROOT}/.env
    fi
  else
    source=${LOCAL_SECRETS_ROOT}/${name}
  fi
  require_mode_600_file "${source}" "${name}"
  source_paths+=("${source}")
  remote_names+=("${name}")
done
for name in "${optional_names[@]}"; do
  source=${LOCAL_SECRETS_ROOT}/${name}
  if [[ -e ${source} || -L ${source} ]]; then
    require_mode_600_file "${source}" "${name}"
    source_paths+=("${source}")
    remote_names+=("${name}")
  fi
done

ssh_options=(
  -i "${IDENTITY_FILE}"
  -o BatchMode=yes
  -o "ConnectTimeout=${SSH_CONNECT_TIMEOUT_SECONDS:-15}"
  -o "ConnectionAttempts=${SSH_CONNECTION_ATTEMPTS:-3}"
  -o IdentitiesOnly=yes
  -o "ServerAliveInterval=${SSH_SERVER_ALIVE_INTERVAL_SECONDS:-10}"
  -o "ServerAliveCountMax=${SSH_SERVER_ALIVE_COUNT_MAX:-3}"
  -o StrictHostKeyChecking=yes
  -o "UserKnownHostsFile=${KNOWN_HOSTS}"
)
remote_stage=$(ssh "${ssh_options[@]}" "${REMOTE_HOST}" 'mktemp -d /tmp/leon-secrets.XXXXXXXXXX')
if [[ ! ${remote_stage} =~ ^/tmp/leon-secrets\.[A-Za-z0-9._-]+$ ]]; then
  fail 'the remote staging directory was invalid.'
fi

cleanup() {
  ssh "${ssh_options[@]}" "${REMOTE_HOST}" \
    "find '${remote_stage}' -depth -mindepth 1 -delete && rmdir '${remote_stage}'" \
    >/dev/null 2>&1 || true
}
trap cleanup EXIT

scp "${ssh_options[@]}" -- "${source_paths[@]}" "${REMOTE_HOST}:${remote_stage}/"
ssh "${ssh_options[@]}" "${REMOTE_HOST}" sudo bash -s -- \
  "${remote_stage}" "${REMOTE_SECRETS_ROOT}" "${REMOTE_SECRET_OWNER}" "${remote_names[@]}" <<'REMOTE'
set -euo pipefail
umask 077

staging=$1
destination=$2
owner=$3
shift 3
if [[ ! -d ${staging} || -L ${staging} || ${destination} != /* || ${destination} == / ]]; then
  echo 'Remote secret staging validation failed.' >&2
  exit 1
fi
if [[ -e ${destination} && -L ${destination} ]]; then
  echo 'Remote secret destination must not be a symlink.' >&2
  exit 1
fi
install -d -m 700 -o "${owner}" -g "${owner}" -- "${destination}"

for name in "$@"; do
  case "${name}" in
    .env|postgres.env|dashboard.env|northline.env|cloudflare-tunnel-token|domain-worker.env) ;;
    *) echo 'Remote secret allowlist validation failed.' >&2; exit 1 ;;
  esac
  source_file=${staging}/${name}
  temporary=${destination}/.${name}.new.$$
  if [[ ! -f ${source_file} || -L ${source_file} ]]; then
    echo 'Remote staged secret must be a regular file.' >&2
    exit 1
  fi
  install -m 600 -o "${owner}" -g "${owner}" -- "${source_file}" "${temporary}"
done

for name in "$@"; do
  temporary=${destination}/.${name}.new.$$
  mv -- "${temporary}" "${destination}/${name}"
done
REMOTE

trap - EXIT
cleanup
echo "Stable ${SECRETS_PROFILE} secrets were synchronized without exposing their values."
