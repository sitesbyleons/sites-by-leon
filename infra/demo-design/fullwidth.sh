#!/usr/bin/env bash
set -euo pipefail
umask 077
export SECRETS_ROOT=/opt/leon-platform/secrets
export RELEASE_SHA=25e345ad4533e0d50a11cfd22c2f7f5afff64680
bundle=/opt/leon-platform/design-releases/demos-fullwidth-20260920
base=/opt/leon-platform/current/infra/ovh/docker-compose.yml
exec 9>/run/lock/leon-platform-maintenance.lock
flock -w 60 9
test "$(docker inspect leon-platform-photographer-1 --format '{{.Image}}')" = 'sha256:97f20ff6667f485061b7d4223217eb106772ffd597a65fce17a7a02aadca35bc'
python3 /opt/leon-platform/design-releases/20260920/guard.py before "$bundle/runtime-before.json"
docker build -f "$bundle/Dockerfile.fullwidth" -t leon-design-prod:demos-fullwidth-20260920 "$bundle"
rollback(){ docker compose --env-file /opt/leon-platform/secrets/.env -f "$base" -f "$bundle/fullwidth-rollback.yml" up -d --no-deps --no-build --wait --wait-timeout 120 photographer; }
trap rollback ERR
docker compose --env-file /opt/leon-platform/secrets/.env -f "$base" -f "$bundle/fullwidth.yml" up -d --no-deps --no-build --wait --wait-timeout 120 photographer
python3 /opt/leon-platform/design-releases/20260920/guard.py after "$bundle/runtime-before.json"
for host in demo.leonsites.org vow-and-light.leonsites.org; do
 curl --retry 4 --retry-all-errors --retry-delay 2 -fsS "https://$host/" | grep -F 'demo-v2.css' > /dev/null
 curl -fsS "https://$host/demo-assets/demo-v2.css" > /dev/null
done
trap - ERR
echo 'Full-width demo stylesheet live; runtime settings and protected services unchanged.'
