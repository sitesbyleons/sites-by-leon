#!/usr/bin/env bash
set -euo pipefail
umask 077
export SECRETS_ROOT=/opt/leon-platform/secrets
export RELEASE_SHA=25e345ad4533e0d50a11cfd22c2f7f5afff64680
bundle=/opt/leon-platform/design-releases/ishot-apex-20260920
base=/opt/leon-platform/current/infra/ovh/docker-compose.yml
exec 9>/run/lock/leon-platform-maintenance.lock
flock -w 60 9
test "$(docker inspect leon-platform-gateway-1 --format '{{.Config.Image}}')" = 'leon-design-prod:home-polish-20260920'
python3 /opt/leon-platform/design-releases/20260920/guard.py before "$bundle/runtime-before.json"
docker inspect leon-platform-dashboard-1 leon-platform-photographer-1 --format '{{.Id}} {{.Image}} {{.State.StartedAt}}' > "$bundle/apps-before.txt"
docker exec leon-platform-gateway-1 find /srv/marketing -type f -exec sha256sum '{}' + > "$bundle/static-before.sha256"
docker exec leon-platform-gateway-1 cat /etc/caddy/Caddyfile > "$bundle/Caddyfile.before"
docker build -t leon-design-prod:ishot-apex-20260920 "$bundle"
python3 "$bundle/candidate.py"
rollback(){ docker compose --env-file /opt/leon-platform/secrets/.env -f "$base" -f "$bundle/rollback.yml" up -d --no-deps --no-build --wait --wait-timeout 120 gateway; }
trap rollback ERR
docker compose --env-file /opt/leon-platform/secrets/.env -f "$base" -f "$bundle/compose.yml" up -d --no-deps --no-build --wait --wait-timeout 120 gateway
python3 /opt/leon-platform/design-releases/20260920/guard.py after "$bundle/runtime-before.json"
test "$(cat "$bundle/apps-before.txt")" = "$(docker inspect leon-platform-dashboard-1 leon-platform-photographer-1 --format '{{.Id}} {{.Image}} {{.State.StartedAt}}')"
docker exec -i leon-platform-gateway-1 sha256sum -c -s < "$bundle/static-before.sha256"
test "$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: ishotyouu.net' http://127.0.0.1:8080/work)" = 308
for host in leonsites.org www.ishotyouu.net demo.leonsites.org vow-and-light.leonsites.org; do curl --retry 3 --retry-all-errors -fsS "https://$host/" >/dev/null; done
trap - ERR
echo 'Apex-only redirect deployed; applications, customer data and all marketing files unchanged.'
