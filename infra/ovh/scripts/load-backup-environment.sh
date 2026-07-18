#!/usr/bin/env bash

load_backup_environment() {
  local environment_file=$1
  local key line value
  local line_number=0
  declare -A seen_keys=()

  while IFS= read -r line || [[ -n ${line} ]]; do
    ((line_number += 1))
    if [[ -z ${line} || ${line} == \#* ]]; then
      continue
    fi
    if [[ ! ${line} =~ ^([A-Z][A-Z0-9_]*)=(.*)$ ]]; then
      echo "Backup environment line ${line_number} is not KEY=VALUE." >&2
      return 1
    fi
    key=${BASH_REMATCH[1]}
    value=${BASH_REMATCH[2]}
    case "${key}" in
      RESTIC_REPOSITORY|RESTIC_PASSWORD_FILE|ALLOW_LOCAL_BACKUP|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_DEFAULT_REGION|SUPABASE_BACKUP_AUTH_URL|SUPABASE_BACKUP_EMAIL|SUPABASE_BACKUP_PASSWORD|SUPABASE_BACKUP_COMMAND_TIMEOUT_SECONDS|RCLONE_CONFIG_SUPABASE_TYPE|RCLONE_CONFIG_SUPABASE_PROVIDER|RCLONE_CONFIG_SUPABASE_ENV_AUTH|RCLONE_CONFIG_SUPABASE_ENDPOINT|RCLONE_CONFIG_SUPABASE_REGION|RCLONE_CONFIG_SUPABASE_FORCE_PATH_STYLE|BACKUP_STAGING_ROOT|RESTORE_DRILL_ROOT|BACKUP_MIN_FREE_BYTES|BACKUP_HEALTHCHECK_SCRIPT|BACKUP_HEALTHCHECK_ATTEMPTS|BACKUP_HEALTHCHECK_INTERVAL_SECONDS|BACKUP_HOSTNAME|UPLOAD_ROOT|BACKUP_ROOT) ;;
      *)
        echo "Unsupported backup environment key on line ${line_number}: ${key}." >&2
        return 1
        ;;
    esac
    if [[ ${value} == *[[:space:]]* || ${value} == *'$'* || ${value} == *'`'* || ${value} == *'"'* || ${value} == *"'"* || ${value} == *\\* ]]; then
      echo "Backup environment key ${key} contains an unsafe value." >&2
      return 1
    fi
    if [[ -n ${seen_keys[${key}]:-} ]]; then
      echo "Backup environment key ${key} is duplicated." >&2
      return 1
    fi
    seen_keys[${key}]=1
    printf -v "${key}" '%s' "${value}"
    export "${key}"
  done <"${environment_file}"
}
