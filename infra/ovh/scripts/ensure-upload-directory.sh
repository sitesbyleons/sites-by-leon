#!/usr/bin/env bash
set -euo pipefail

setting_name=${1:?setting name is required}
upload_path=${2:?upload path is required}
platform_root=${3:?platform root is required}

normalized_path=$(readlink -m -- "${upload_path}")
platform_root=${platform_root%/}

if [[ ${upload_path} != /* || ${upload_path} != "${normalized_path}" ]]; then
  echo "${setting_name} must be a normalized absolute path." >&2
  exit 1
fi

case "${upload_path}" in
  "${platform_root}/uploads" | "${platform_root}"/uploads-* | /mnt/* | /srv/*) ;;
  *)
    echo "${setting_name} must use the platform uploads directory or a dedicated /mnt or /srv subdirectory." >&2
    exit 1
    ;;
esac

sudo install -d -o "$(id -u)" -g "$(id -g)" -m 0750 "${upload_path}"
