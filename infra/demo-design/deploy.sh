#!/usr/bin/env bash
set -euo pipefail
umask 077
export SECRETS_ROOT=/opt/leon-platform/secrets
export RELEASE_SHA=25e345ad4533e0d50a11cfd22c2f7f5afff64680
bundle=/opt/leon-platform/design-releases/demos-20260920
base=/opt/leon-platform/current/infra/ovh/docker-compose.yml
backup=/opt/leon-platform/backups/demo-design-20260920
exec 9>/run/lock/leon-platform-maintenance.lock
flock -w 60 9
test "$(docker inspect leon-platform-gateway-1 --format '{{.Image}}')" = 'sha256:c0bcc8bd0bf9676311ce2569f3c5dcf562f12d0848ce24502ea391775e812d94'
test "$(docker inspect leon-platform-photographer-1 --format '{{.Image}}')" = 'sha256:8775835b25dc6e018fda0dc6e1158190838f51d931bd180cd799db068c306421'
test ! -e "$backup"
install -d -m 0700 "$backup"
python3 /opt/leon-platform/design-releases/20260920/guard.py before "$backup/runtime-hashes.json"
docker exec leon-platform-database-1 sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup/database.dump"
test -s "$backup/database.dump"
docker exec -i leon-platform-database-1 pg_restore --list < "$backup/database.dump" > "$backup/database-manifest.txt"
tar -czf "$backup/uploads.tgz" -C /opt/leon-platform uploads
tar -tzf "$backup/uploads.tgz" > "$backup/uploads-manifest.txt"
find /opt/leon-platform/uploads -type f -exec sha256sum {} + > "$backup/uploads.sha256"
docker exec leon-platform-gateway-1 sha256sum /etc/caddy/Caddyfile > "$backup/caddy.sha256"
rollback(){
 echo 'Restoring application images only; no data restore.'
 docker compose --env-file /opt/leon-platform/secrets/.env -f "$base" -f "$bundle/rollback.yml" up -d --no-deps --no-build --wait --wait-timeout 120 photographer gateway
}
trap rollback ERR
docker compose --env-file /opt/leon-platform/secrets/.env -f "$base" -f "$bundle/compose.yml" up -d --no-deps --no-build --wait --wait-timeout 120 photographer gateway
python3 /opt/leon-platform/design-releases/20260920/guard.py after "$backup/runtime-hashes.json"
sha256sum -c --status "$backup/uploads.sha256"
test "$(cat "$backup/caddy.sha256")" = "$(docker exec leon-platform-gateway-1 sha256sum /etc/caddy/Caddyfile)"
for host in demo.leonsites.org vow-and-light.leonsites.org; do
 for route in / /work /packages /contact; do
  curl --retry 4 --retry-all-errors --retry-delay 2 -fsS "https://$host$route" | grep -F 'demo-assets/demo-v1.css' >/dev/null
 done
 curl -fsS "https://$host/demo-assets/demo-v1.css" > /dev/null
 test "$(curl -s -o /dev/null -w '%{http_code}' "https://$host/admin")" = 302
done
curl -fsS https://ishotyouu.leonsites.org/ > "$backup/customer-home.html"
! grep -F 'demo-assets/demo-v1.css' "$backup/customer-home.html"
test "$(curl -s -o /dev/null -w '%{http_code}' https://leonsites.org/admin/users)" = 302
trap - ERR
echo 'Demo designs deployed; database, uploads, runtime settings, customer sidecars and Caddy routing preserved.'
