#!/usr/bin/env bash
# Creates the NREC instance that runs 31 Hops and prints its address.
# Safe to rerun: an existing key pair or server is kept, and nothing is ever deleted or changed.
#
# Credentials come from the OpenStack CLI's usual places: a clouds.yaml profile
# (OS_CLOUD=nrec, with OS_CLIENT_CONFIG_FILE if the file is not in the current
# directory) or a sourced keystone rc file.
set -euo pipefail

if [[ -z "${OS_CLOUD:-}" && -z "${OS_AUTH_URL:-}" ]]; then
  echo "no credentials: set OS_CLOUD to a clouds.yaml profile, or source a keystone rc file" >&2
  exit 1
fi

# NREC recommends [a-zA-Z0-9] only in instance names.
NAME="${HOPS_SERVER_NAME:-bhhops}"
IMAGE="${HOPS_IMAGE:-GOLD Ubuntu 24.04 LTS}"
# 1 vCPU, 2 GB RAM, 20 GB disk: the largest flavor a DEMO project's quota allows,
# and the extra disk over m1.small is what an image build needs.
FLAVOR="${HOPS_FLAVOR:-c1.medium}"
PUBLIC_KEY="${HOPS_PUBLIC_KEY:-$HOME/.ssh/id_ed25519.pub}"
# The project's standing groups: "default" carries the web ports, "ssh" carries 22.
# They are used as they are; this script never edits a security group.
GROUPS_WANTED=(${HOPS_SECURITY_GROUPS:-default ssh})
HERE="$(cd "$(dirname "$0")" && pwd)"

exists() { openstack "$@" >/dev/null 2>&1; }

# Without this, a wrong password would look like "nothing exists yet".
openstack token issue >/dev/null

region="$(openstack configuration show -f value -c region_name)"
if [[ "$region" != "osl" ]]; then
  echo "the active region is '$region', expected 'osl'" >&2
  exit 1
fi

# The instance is only reachable if the groups it joins already open SSH and the web ports.
open_ports=""
for group in "${GROUPS_WANTED[@]}"; do
  if ! exists security group show "$group"; then
    echo "security group '$group' does not exist in osl; set HOPS_SECURITY_GROUPS to the groups to use" >&2
    exit 1
  fi
  open_ports+="$(openstack security group rule list "$group" --ingress --protocol tcp -f value -c "Port Range")"$'\n'
done
for port in 22 80 443; do
  if ! grep -qx "$port:$port" <<<"$open_ports"; then
    echo "none of the groups (${GROUPS_WANTED[*]}) opens tcp $port; add that rule first, with an explicit remote address" >&2
    exit 1
  fi
done

# Key pairs made in the dashboard belong to the Feide user and are invisible here,
# so the API user gets its own copy of the public key.
if ! exists keypair show "$NAME"; then
  openstack keypair create --public-key "$PUBLIC_KEY" "$NAME" >/dev/null
  echo "keypair $NAME created from $PUBLIC_KEY"
fi

if ! exists server show "$NAME"; then
  group_flags=()
  for group in "${GROUPS_WANTED[@]}"; do group_flags+=(--security-group "$group"); done
  # dualStack is the only NREC network with a public IPv4 address, and an instance takes exactly one network.
  openstack server create --image "$IMAGE" --flavor "$FLAVOR" \
    --network dualStack --key-name "$NAME" "${group_flags[@]}" \
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
