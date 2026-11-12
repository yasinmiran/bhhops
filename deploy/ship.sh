#!/usr/bin/env bash
# Builds and (re)starts the stack on the server's own Docker daemon over SSH.
# Reads SITE and ADMIN_TOKEN from .env; the database volume survives redeploys.
set -euo pipefail

HOST="${1:?usage: deploy/ship.sh <server address>}"
cd "$(dirname "$0")/.."
[[ -f .env ]] || { echo "copy .env.example to .env and fill it in first" >&2; exit 1; }

# Two sessions: cloud-init adds ubuntu to the docker group, and a login that
# started before that never sees the new group.
ssh -o StrictHostKeyChecking=accept-new "ubuntu@$HOST" 'cloud-init status --wait >/dev/null || true'
ssh "ubuntu@$HOST" 'docker version --format "docker {{.Server.Version}} ready"'

# ssh takes a bare IPv6 address, a URL needs it in brackets.
docker_host="ssh://ubuntu@$HOST"
if [[ "$HOST" == *:* ]]; then
  docker_host="ssh://ubuntu@[$HOST]"
fi
DOCKER_HOST="$docker_host" docker compose up -d --build --remove-orphans
DOCKER_HOST="$docker_host" docker compose ps
