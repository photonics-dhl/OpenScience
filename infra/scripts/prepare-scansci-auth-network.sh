#!/usr/bin/env bash

set -euo pipefail

usage() {
  echo "usage: prepare-scansci-auth-network.sh <release-root> <release-sha>" >&2
  exit 64
}

[ "$#" -eq 2 ] || usage
release_root="$1"
release_sha="$2"
[[ "$release_sha" =~ ^[0-9a-f]{40}$ ]] || usage
[ "$release_root" = "/opt/openscience-releases/$release_sha" ] || usage
[ "$(id -u)" -eq 0 ] || { echo "root required" >&2; exit 77; }

network_name='openscience-prod_auth_net'
bridge_name='xgs-auth0'
subnet='172.25.0.0/29'
gateway='172.25.0.1'
auth_ip='172.25.0.2'
source_config="$release_root/infra/squid/openscience-egress.conf"
target_config="${OPENSCIENCE_SQUID_CONFIG:-/etc/squid/squid.conf}"
atomic_config="$release_root/infra/scripts/atomic-squid-config.mjs"
ss_bin='/usr/sbin/ss'

[ -f "$source_config" ] && [ ! -L "$source_config" ] || { echo "source config unavailable" >&2; exit 66; }
[ -f "$target_config" ] && [ ! -L "$target_config" ] || { echo "target config unavailable" >&2; exit 66; }
[ -f "$atomic_config" ] && [ ! -L "$atomic_config" ] || { echo "atomic config helper unavailable" >&2; exit 66; }
[ -x "$ss_bin" ] && [ ! -L "$ss_bin" ] || { echo "socket inspection unavailable" >&2; exit 66; }
[ "$(docker network inspect --format '{{.Internal}}' "$network_name")" = true ] \
  || { echo "auth network is not internal" >&2; exit 65; }
[ "$(docker network inspect --format '{{(index .IPAM.Config 0).Subnet}}:{{(index .IPAM.Config 0).Gateway}}' "$network_name")" = "$subnet:$gateway" ] \
  || { echo "auth network IPAM mismatch" >&2; exit 65; }
[ "$(docker network inspect --format '{{index .Options "com.docker.network.bridge.name"}}' "$network_name")" = "$bridge_name" ] \
  || { echo "auth network bridge mismatch" >&2; exit 65; }

mapfile -t peers < <(docker network inspect --format '{{range .Containers}}{{.Name}}{{"\n"}}{{end}}' "$network_name" | sed '/^$/d')
if [ "${#peers[@]}" -gt 1 ] || { [ "${#peers[@]}" -eq 1 ] && [[ "${peers[0]}" != *-scansci-auth-1 ]]; }; then
  echo "auth network has an unauthorized peer" >&2
  exit 65
fi

next_config="$(mktemp /etc/squid/.openscience-next.XXXXXX)"
cleanup() {
  rm -f "$next_config"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

install -o root -g root -m 0644 "$source_config" "$next_config"
/usr/sbin/squid -k parse -f "$next_config" >/dev/null 2>&1
/usr/bin/node "$atomic_config" activate "$next_config" "$target_config"

return_rule=(INPUT -i "$bridge_name" -s "$auth_ip/32" -d "$gateway/32" -p tcp --sport 6080 -m conntrack --ctstate ESTABLISHED -m comment --comment openscience-scansci-auth-return -j ACCEPT)
accept=(INPUT -i "$bridge_name" -s "$subnet" -d "$gateway" -p tcp --dport 7891 -m comment --comment openscience-scansci-auth -j ACCEPT)
reject=(INPUT -i "$bridge_name" -s "$subnet" -m comment --comment openscience-scansci-auth -j REJECT --reject-with icmp-port-unreachable)
while /usr/sbin/iptables -w -C "${return_rule[@]}" >/dev/null 2>&1; do
  /usr/sbin/iptables -w -D "${return_rule[@]}"
done
while /usr/sbin/iptables -w -C "${accept[@]}" >/dev/null 2>&1; do
  /usr/sbin/iptables -w -D "${accept[@]}"
done
while /usr/sbin/iptables -w -C "${reject[@]}" >/dev/null 2>&1; do
  /usr/sbin/iptables -w -D "${reject[@]}"
done
/usr/sbin/iptables -w -I "${reject[@]}"
/usr/sbin/iptables -w -I "${accept[@]}"
/usr/sbin/iptables -w -I "${return_rule[@]}"
/usr/sbin/iptables -w -C "${return_rule[@]}"
/usr/sbin/iptables -w -C "${accept[@]}"
/usr/sbin/iptables -w -C "${reject[@]}"

for _attempt in $(seq 1 20); do
  if "$ss_bin" -lntH | awk '$4 == "172.25.0.1:7891" { found=1 } END { exit found ? 0 : 1 }'; then
    exit 0
  fi
  sleep 0.1
done
echo "auth proxy listener unavailable" >&2
exit 1
