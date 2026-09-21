#!/usr/bin/env bash
set -euo pipefail
umask 077
export SECRETS_ROOT=/opt/leon-platform/secrets
export RELEASE_SHA=25e345ad4533e0d50a11cfd22c2f7f5afff64680
bundle=/opt/leon-platform/design-releases/demos-refined-20260920
base=/opt/leon-platform/current/infra/ovh/docker-compose.yml
exec 9>/run/lock/leon-platform-maintenance.lock
flock -w 60 9
test "$(docker inspect leon-platform-photographer-1 --format '{{.Image}}')" = 'sha256:85c79baf9f8daf09fd9ee9da7418ad00ab56e7b6bb44b64cce3f0d76a3771d42'
python3 /opt/leon-platform/design-releases/20260920/guard.py before "$bundle/runtime-before.json"
find /opt/leon-platform/uploads -type f -exec sha256sum {} + > "$bundle/uploads-before.sha256"
docker build -f "$bundle/Dockerfile.refinement" -t leon-design-prod:demos-refined-20260920 "$bundle"
rollback(){ docker compose --env-file /opt/leon-platform/secrets/.env -f "$base" -f "$bundle/refinement-rollback.yml" up -d --no-deps --no-build --wait --wait-timeout 120 photographer; }
trap rollback ERR
docker compose --env-file /opt/leon-platform/secrets/.env -f "$base" -f "$bundle/refinement.yml" up -d --no-deps --no-build --wait --wait-timeout 120 photographer
python3 /opt/leon-platform/design-releases/20260920/guard.py after "$bundle/runtime-before.json"
sha256sum -c --status "$bundle/uploads-before.sha256"
for host in demo.leonsites.org vow-and-light.leonsites.org; do
 for route in / /work /packages /contact; do
  curl --retry 4 --retry-all-errors --retry-delay 2 -fsS "https://$host$route" | grep -F 'demo-v3.css' > /dev/null
 done
 curl -fsS "https://$host/demo-assets/demo-v3.js" > /dev/null
 test "$(curl -s -o /dev/null -w '%{http_code}' "https://$host/admin")" = 302
done
trap - ERR
echo 'Refined demo designs deployed; runtime configuration, client uploads and protected services unchanged.'
