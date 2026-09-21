#!/usr/bin/env bash
set -euo pipefail
umask 077
export SECRETS_ROOT=/opt/leon-platform/secrets
export RELEASE_SHA=25e345ad4533e0d50a11cfd22c2f7f5afff64680
bundle=/opt/leon-platform/design-releases/signin-20260920
base=/opt/leon-platform/current/infra/ovh/docker-compose.yml
exec 9>/run/lock/leon-platform-maintenance.lock
flock -w 60 9
test "$(docker inspect leon-platform-dashboard-1 --format '{{.Image}}')" = 'sha256:130326dec8e88429df53bd023f09f32c16f751630b84e7924ab2473093dc71fd'
python3 /opt/leon-platform/design-releases/20260920/guard.py before "$bundle/runtime-before.json"
docker inspect leon-platform-gateway-1 leon-platform-photographer-1 --format '{{.Id}} {{.Image}} {{.State.StartedAt}}' > "$bundle/apps-before.txt"
docker exec leon-platform-dashboard-1 find /workspace/dashboard/dist -type f ! -path /workspace/dashboard/dist/server/chunks/_.._DhZRX37C.mjs -exec sha256sum '{}' + > "$bundle/untouched.sha256"
find /opt/leon-platform/uploads -type f -exec sha256sum '{}' + > "$bundle/uploads-before.sha256"
docker build -t leon-design-prod:signin-20260920 "$bundle"
python3 "$bundle/smoke.py"
rollback(){ docker compose --env-file /opt/leon-platform/secrets/.env -f "$base" -f "$bundle/rollback.yml" up -d --no-deps --no-build --wait --wait-timeout 120 dashboard; }
trap rollback ERR
docker compose --env-file /opt/leon-platform/secrets/.env -f "$base" -f "$bundle/compose.yml" up -d --no-deps --no-build --wait --wait-timeout 120 dashboard
python3 /opt/leon-platform/design-releases/20260920/guard.py after "$bundle/runtime-before.json"
test "$(cat "$bundle/apps-before.txt")" = "$(docker inspect leon-platform-gateway-1 leon-platform-photographer-1 --format '{{.Id}} {{.Image}} {{.State.StartedAt}}')"
docker exec -i leon-platform-dashboard-1 sha256sum -c --status < "$bundle/untouched.sha256"
sha256sum -c --status "$bundle/uploads-before.sha256"
curl --retry 4 --retry-all-errors --retry-delay 2 -fsS https://leonsites.org/sign-in | grep -F 'signin-studio-v1.css' >/dev/null
test "$(curl -s -o /dev/null -w '%{http_code}' https://leonsites.org/admin/users)" = 302
trap - ERR
echo 'Sign-in presentation deployed. Auth logic, other application files, customer services and data preserved.'
