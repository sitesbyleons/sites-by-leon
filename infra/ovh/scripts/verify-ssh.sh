#!/usr/bin/env bash
set -euo pipefail

: "${SSH_KEY:?Set SSH_KEY to the private key file supplied for this VPS.}"
SSH_USER=${SSH_USER:-ubuntu}
SSH_HOST=${SSH_HOST:-vps-aa71e2f6.vps.ovh.us}
SOURCE_ROOT=${SOURCE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}
KNOWN_HOSTS=${KNOWN_HOSTS:-${SOURCE_ROOT}/infra/ovh/ssh_known_hosts}

if [[ ! -r ${SSH_KEY} ]]; then
  echo "SSH key is not readable: ${SSH_KEY}" >&2
  exit 1
fi

ssh \
  -o BatchMode=yes \
  -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes \
  -o "UserKnownHostsFile=${KNOWN_HOSTS}" \
  -i "${SSH_KEY}" \
  "${SSH_USER}@${SSH_HOST}" \
  'printf "SSH verified: "; hostname; printf "OS: "; . /etc/os-release; printf "%s %s\n" "$NAME" "$VERSION_ID"; printf "User: "; id -un; df -h / | tail -n 1'

