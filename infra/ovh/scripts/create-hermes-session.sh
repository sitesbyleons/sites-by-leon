#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ $# -ne 0 ]]; then
  echo 'Usage: create-hermes-session.sh' >&2
  exit 2
fi

mapfile -t dashboard_containers < <(
  docker ps \
    --filter 'label=com.docker.compose.project=leon-platform-test' \
    --filter 'label=com.docker.compose.service=dashboard-test' \
    --format '{{.ID}}'
)
if [[ ${#dashboard_containers[@]} -ne 1 ]]; then
  echo "Expected one running isolated test dashboard; found ${#dashboard_containers[@]}." >&2
  exit 1
fi

docker exec \
  --workdir /workspace/dashboard \
  "${dashboard_containers[0]}" \
  node ./scripts/create-hermes-agent-task.mjs
