#!/usr/bin/env bash
# Creates the NREC instance that runs 31 Hops and prints its address.
# Safe to rerun: existing resources are kept and an interrupted run is finished.
set -euo pipefail

: "${OS_AUTH_URL:?source your NREC keystone rc file first (see deploy/keystone_rc.example.sh)}"
if [[ "${OS_REGION_NAME:-}" != "osl" ]]; then
  echo "OS_REGION_NAME is '${OS_REGION_NAME:-}', expected 'osl'" >&2
  exit 1
fi

# NREC recommends [a-zA-Z0-9] only in instance names.
NAME="${HOPS_SERVER_NAME:-bhhops}"
IMAGE="${HOPS_IMAGE:-GOLD Ubuntu 24.04 LTS}"
FLAVOR="${HOPS_FLAVOR:-m1.small}"
PUBLIC_KEY="${HOPS_PUBLIC_KEY:-$HOME/.ssh/id_ed25519.pub}"
# Remembered before the default is applied: only an address range given on purpose is ever added on a rerun.
SSH_CIDR_GIVEN="${SSH_CIDR+yes}"
# GOLD images accept keys only, so SSH is open by default; narrow it with e.g. SSH_CIDR=203.0.113.7/32.
SSH_CIDR="${SSH_CIDR:-0.0.0.0/0}"
GROUP="$NAME"
HERE="$(cd "$(dirname "$0")" && pwd)"

exists() { openstack "$@" >/dev/null 2>&1; }

# Without this, a wrong password would look like "nothing exists yet".
openstack token issue >/dev/null

# NREC known issue: a rule created through the API without an explicit remote
# address has opened every port, so each rule names its source. A rule that is
# already there is fine, which lets a rerun finish what an interrupted run began.
allow() {
  local ethertype="$1" protocol="$2" port="$3" source="$4" output
  if ! output="$(openstack security group rule create --ingress --ethertype "$ethertype" \
    --protocol "$protocol" --dst-port "$port" --remote-ip "$source" "$GROUP" 2>&1)"; then
    if ! grep -qi "already exists" <<<"$output"; then
      echo "$output" >&2
      exit 1
    fi
  fi
}

if ! exists keypair show "$NAME"; then
  openstack keypair create --public-key "$PUBLIC_KEY" "$NAME" >/dev/null
  echo "keypair $NAME created from $PUBLIC_KEY"
fi

if ! exists security group show "$GROUP"; then
  openstack security group create --description "31 Hops: web from anywhere, SSH" "$GROUP" >/dev/null
  echo "security group $GROUP created"
fi

# SSH rules are added when the group has none yet, or when a range was asked for.
# A plain rerun must not quietly reopen SSH to everyone after it was narrowed by hand.
ssh_rules="$(openstack security group rule list "$GROUP" --ingress --protocol tcp -f value -c "Port Range")"
if [[ -n "$SSH_CIDR_GIVEN" ]] || ! grep -qx "22:22" <<<"$ssh_rules"; then
  if [[ "$SSH_CIDR" == *:* ]]; then
    allow IPv6 tcp 22 "$SSH_CIDR"
  else
    allow IPv4 tcp 22 "$SSH_CIDR"
  fi
  if [[ "$SSH_CIDR" == "0.0.0.0/0" ]]; then
    allow IPv6 tcp 22 ::/0
  fi
fi
# The web ports are published on IPv4 only (see compose.yaml).
allow IPv4 tcp 80 0.0.0.0/0
allow IPv4 tcp 443 0.0.0.0/0
# HTTP/3
allow IPv4 udp 443 0.0.0.0/0

if ! exists server show "$NAME"; then
  # dualStack is the only NREC network with a public IPv4 address.
  openstack server create --image "$IMAGE" --flavor "$FLAVOR" \
    --nic net-id=dualStack --key-name "$NAME" \
    --security-group default --security-group "$GROUP" \
    --user-data "$HERE/cloud-init.yaml" --wait "$NAME" >/dev/null
  echo "server $NAME created"
fi

# An earlier run may have left an instance that exists but never came up.
status="$(openstack server show "$NAME" -f value -c status)"
case "$status" in
  ACTIVE) ;;
  ERROR)
    echo "server $NAME is in ERROR: $(openstack server show "$NAME" -f value -c fault)" >&2
    echo "delete it (openstack server delete --wait $NAME), then rerun this script" >&2
    exit 1
    ;;
  SHUTOFF)
    echo "server $NAME is stopped; start it with: openstack server start $NAME" >&2
    exit 1
    ;;
  *)
    echo "server $NAME is $status, not ACTIVE yet; rerun this script once it is" >&2
    exit 1
    ;;
esac

echo "addresses: $(openstack server show "$NAME" -f value -c addresses)"
echo "Point an A record for your hostname at the IPv4 address, then run: deploy/ship.sh <ipv4-address>"
