#!/usr/bin/env bash
set -euo pipefail
umask 077
export SECRETS_ROOT=/opt/leon-platform/secrets
export RELEASE_SHA=25e345ad4533e0d50a11cfd22c2f7f5afff64680
bundle=/opt/leon-platform/design-releases/admin-width-20260920
base=/opt/leon-platform/current/infra/ovh/docker-compose.yml
exec 9>/run/lock/leon-platform-maintenance.lock
flock -w 60 9
test "$(docker inspect leon-platform-dashboard-1 --format '{{.Image}}')" = 'sha256:4527a57e0069cb78cee88d7a74efe106f30cffd47ec2326cbaa9e6f1aea8030e'
python3 /opt/leon-platform/design-releases/20260920/guard.py before "$bundle/runtime-before.json"
docker inspect leon-platform-gateway-1 leon-platform-photographer-1 --format '{{.Id}} {{.Image}} {{.State.StartedAt}}' > "$bundle/apps-before.txt"
docker exec leon-platform-dashboard-1 find /workspace/dashboard/dist -type f ! -path /workspace/dashboard/dist/server/chunks/AdminFrame_BKBu-iPL.mjs -exec sha256sum '{}' + > "$bundle/untouched.sha256"
docker build -t leon-design-prod:admin-width-20260920 "$bundle"
docker run --rm -i --network none --cap-drop ALL --security-opt no-new-privileges:true --entrypoint sha256sum leon-design-prod:admin-width-20260920 -c --status < "$bundle/untouched.sha256"
rollback(){ docker compose --env-file /opt/leon-platform/secrets/.env -f "$base" -f "$bundle/rollback.yml" up -d --no-deps --no-build --wait --wait-timeout 120 dashboard; }
trap rollback ERR
docker compose --env-file /opt/leon-platform/secrets/.env -f "$base" -f "$bundle/compose.yml" up -d --no-deps --no-build --wait --wait-timeout 120 dashboard
python3 /opt/leon-platform/design-releases/20260920/guard.py after "$bundle/runtime-before.json"
test "$(cat "$bundle/apps-before.txt")" = "$(docker inspect leon-platform-gateway-1 leon-platform-photographer-1 --format '{{.Id}} {{.Image}} {{.State.StartedAt}}')"
docker exec -i leon-platform-dashboard-1 sha256sum -c --status < "$bundle/untouched.sha256"
curl --retry 4 --retry-all-errors --retry-delay 2 -fsS https://leonsites.org/admin-assets/admin-workspace-v5.css | grep -F 'max-width:none' >/dev/null
test "$(curl -s -o /dev/null -w '%{http_code}' https://leonsites.org/admin)" = 302
trap - ERR
echo 'Admin width fix deployed. Other application files and customer services unchanged.'
