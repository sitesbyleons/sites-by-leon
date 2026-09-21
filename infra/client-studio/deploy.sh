#!/usr/bin/env bash
set -euo pipefail
umask 077
export SECRETS_ROOT=/opt/leon-platform/secrets
export RELEASE_SHA=25e345ad4533e0d50a11cfd22c2f7f5afff64680
bundle=/opt/leon-platform/design-releases/client-studio-20260920
base=/opt/leon-platform/current/infra/ovh/docker-compose.yml
exec 9>/run/lock/leon-platform-maintenance.lock
flock -w 60 9
test "$(docker inspect leon-platform-dashboard-1 --format '{{.Image}}')" = 'sha256:6383ca9ef5ec28aa86405d523f975de08d6852c5a97f233f82c05e564b6e7eb7'
test "$(docker inspect leon-platform-photographer-1 --format '{{.Image}}')" = 'sha256:7ec941801ffe2d651380ed1dc47236952f54fd81038791b2f606cd842b155191'
python3 /opt/leon-platform/design-releases/20260920/guard.py before "$bundle/runtime-before.json"
docker inspect leon-platform-gateway-1 --format '{{.Id}} {{.Image}} {{.State.StartedAt}}' > "$bundle/gateway-before.txt"
docker exec leon-platform-dashboard-1 find /workspace/dashboard/dist -type f ! -path /workspace/dashboard/dist/server/chunks/index_KlbIBE6S.mjs -exec sha256sum '{}' + > "$bundle/dashboard-before.sha256"
docker exec leon-platform-photographer-1 find /workspace/photographer-site/dist -type f ! -path /workspace/photographer-site/dist/server/chunks/StudioAdminLayout_CE1vc9jo.mjs ! -path /workspace/photographer-site/dist/server/entry.mjs -exec sha256sum '{}' + > "$bundle/cms-before.sha256"
find /opt/leon-platform/uploads -type f -exec sha256sum '{}' + > "$bundle/uploads-before.sha256"
docker build -f "$bundle/Dockerfile.dashboard" -t leon-design-prod:client-workspace-20260920 "$bundle"
docker build -f "$bundle/Dockerfile.cms" -t leon-design-prod:ishot-workspace-20260920 "$bundle"
docker run --rm -i --network none --entrypoint sha256sum leon-design-prod:client-workspace-20260920 -c --status < "$bundle/dashboard-before.sha256"
docker run --rm -i --network none --entrypoint sha256sum leon-design-prod:ishot-workspace-20260920 -c --status < "$bundle/cms-before.sha256"
python3 "$bundle/smoke.py"
rollback(){ docker compose --env-file /opt/leon-platform/secrets/.env -f "$base" -f "$bundle/rollback.yml" up -d --no-deps --no-build --wait --wait-timeout 120 dashboard photographer; }
trap rollback ERR
docker compose --env-file /opt/leon-platform/secrets/.env -f "$base" -f "$bundle/compose.yml" up -d --no-deps --no-build --wait --wait-timeout 120 dashboard photographer
python3 /opt/leon-platform/design-releases/20260920/guard.py after "$bundle/runtime-before.json"
test "$(cat "$bundle/gateway-before.txt")" = "$(docker inspect leon-platform-gateway-1 --format '{{.Id}} {{.Image}} {{.State.StartedAt}}')"
sha256sum -c --status "$bundle/uploads-before.sha256"
docker exec -i leon-platform-dashboard-1 sha256sum -c --status < "$bundle/dashboard-before.sha256"
docker exec -i leon-platform-photographer-1 sha256sum -c --status < "$bundle/cms-before.sha256"
curl --retry 4 --retry-all-errors --retry-delay 2 -fsS https://www.ishotyouu.net/ | grep -F 'page.ishot-public-v1.js' >/dev/null
for host in leonsites.org ishotyouu.leonsites.org; do test "$(curl -s -o /dev/null -w '%{http_code}' https://$host/admin)" = 302;done
trap - ERR
echo 'Client/studio update deployed; public visual content, customer data and protected services preserved.'
