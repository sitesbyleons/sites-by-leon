#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

source /etc/os-release
if [[ ${ID:-} != "ubuntu" ]]; then
  echo "This bootstrap is intended for Ubuntu. Found: ${PRETTY_NAME:-unknown}." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git jq openssl postgresql-client restic rsync ufw

docker_release_url="https://download.docker.com/linux/ubuntu/dists/${VERSION_CODENAME}/Release"
if ! curl --fail --silent --show-error --head "${docker_release_url}" >/dev/null; then
  echo "Docker's official repository does not publish Ubuntu ${VERSION_CODENAME} yet." >&2
  exit 1
fi

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

cat > /etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "live-restore": true
}
JSON

systemctl enable --now docker
systemctl restart docker

install -d -m 0750 /opt/leon-platform /opt/leon-platform/backups /opt/leon-platform/secrets
docker network inspect leon-edge >/dev/null 2>&1 || docker network create leon-edge >/dev/null

if [[ -n ${SUDO_USER:-} && ${SUDO_USER} != "root" ]]; then
  usermod -aG docker "${SUDO_USER}"
  chown -R "${SUDO_USER}:${SUDO_USER}" /opt/leon-platform
fi

if [[ ${CONFIGURE_FIREWALL:-0} == "1" ]]; then
  SSH_PORT=${SSH_PORT:-22}
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow "${SSH_PORT}/tcp" comment SSH
  ufw --force enable
fi

echo "OVH host prerequisites are ready. Public web ports remain closed; Cloudflare Tunnel will reach the gateway from inside Docker."
