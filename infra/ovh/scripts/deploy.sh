#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT=${SOURCE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}
PLATFORM_ROOT=${PLATFORM_ROOT:-/opt/leon-platform}
docker network inspect leon-edge >/dev/null 2>&1 || docker network create leon-edge >/dev/null

cd "${SOURCE_ROOT}/infra/ovh"
docker compose --env-file .env up -d --build
docker compose ps
