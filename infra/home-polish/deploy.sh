#!/usr/bin/env bash
set -euo pipefail
umask 077
export SECRETS_ROOT=/opt/leon-platform/secrets
export RELEASE_SHA=25e345ad4533e0d50a11cfd22c2f7f5afff64680
bundle=/opt/leon-platform/design-releases/home-polish-20260920
base=/opt/leon-platform/current/infra/ovh/docker-compose.yml
exec 9>/run/lock/leon-platform-maintenance.lock
flock -w 60 9
test "$(docker inspect leon-platform-gateway-1 --format '{{.Image}}')" = 'sha256:fd948197ccf19463c97036d8c70091d33499bd5d1823be6ee09d42206ec12596'
python3 /opt/leon-platform/design-releases/20260920/guard.py before "$bundle/runtime-before.json"
docker inspect leon-platform-dashboard-1 leon-platform-photographer-1 --format '{{.Id}} {{.Image}} {{.State.StartedAt}}' > "$bundle/apps-before.txt"
docker exec leon-platform-gateway-1 find /srv/marketing -type f ! -path /srv/marketing/index.html -exec sha256sum '{}' + > "$bundle/static-before.sha256"
docker exec leon-platform-gateway-1 sha256sum /etc/caddy/Caddyfile > "$bundle/caddy-before.sha256"
find /opt/leon-platform/uploads -type f -exec sha256sum '{}' + > "$bundle/uploads-before.sha256"
docker build -t leon-design-prod:home-polish-20260920 "$bundle"
# Isolated static candidate: no production environment, networks or volumes.
docker run -d --name leon-home-polish-candidate --network bridge -p 127.0.0.1:4382:80 --cap-drop ALL --cap-add NET_BIND_SERVICE --security-opt no-new-privileges:true --entrypoint caddy leon-design-prod:home-polish-20260920 file-server --root /srv/marketing --listen :80
trap 'docker rm -f leon-home-polish-candidate >/dev/null' EXIT
curl --retry 5 --retry-all-errors --retry-delay 1 -fsS http://127.0.0.1:4382/ | grep -F 'home-polished' >/dev/null
curl -fsS http://127.0.0.1:4382/fonts/barlow-condensed-latin.woff2 >/dev/null
docker exec -i leon-home-polish-candidate sha256sum -c -s < "$bundle/static-before.sha256"
docker exec -i leon-home-polish-candidate sha256sum -c -s < "$bundle/caddy-before.sha256"
docker rm -f leon-home-polish-candidate >/dev/null
trap - EXIT
rollback(){ docker compose --env-file /opt/leon-platform/secrets/.env -f "$base" -f "$bundle/rollback.yml" up -d --no-deps --no-build --wait --wait-timeout 120 gateway; }
trap rollback ERR
docker compose --env-file /opt/leon-platform/secrets/.env -f "$base" -f "$bundle/compose.yml" up -d --no-deps --no-build --wait --wait-timeout 120 gateway
python3 /opt/leon-platform/design-releases/20260920/guard.py after "$bundle/runtime-before.json"
test "$(cat "$bundle/apps-before.txt")" = "$(docker inspect leon-platform-dashboard-1 leon-platform-photographer-1 --format '{{.Id}} {{.Image}} {{.State.StartedAt}}')"
docker exec -i leon-platform-gateway-1 sha256sum -c -s < "$bundle/static-before.sha256"
docker exec -i leon-platform-gateway-1 sha256sum -c -s < "$bundle/caddy-before.sha256"
sha256sum -c --status "$bundle/uploads-before.sha256"
curl --retry 5 --retry-all-errors --retry-delay 2 -fsS https://leonsites.org/ | grep -F 'home-polished' >/dev/null
test "$(curl -s -o /dev/null -w '%{http_code}' https://leonsites.org/admin/users)" = 302
for host in demo.leonsites.org vow-and-light.leonsites.org; do
 curl -fsS "https://$host/" | grep -F 'demo-v4.css' >/dev/null
done
trap - ERR
echo 'Homepage published; all prior non-home static files, Caddy, application containers, databases and uploads preserved.'
