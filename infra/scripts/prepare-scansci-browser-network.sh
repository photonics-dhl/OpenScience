#!/usr/bin/env bash

set -euo pipefail

usage() {
  echo "usage: prepare-scansci-browser-network.sh <release-root> <release-sha>" >&2
  exit 64
}

[ "$#" -eq 2 ] || usage
release_root="$1"
release_sha="$2"
[[ "$release_sha" =~ ^[0-9a-f]{40}$ ]] || usage
[ "$release_root" = "/opt/openscience-releases/$release_sha" ] || usage
[ "$(id -u)" -eq 0 ] || { echo "root required" >&2; exit 77; }

network_name='openscience-prod_browser_net'
bridge_name='xgs-browser0'
subnet='172.26.0.0/24'
gateway='172.26.0.1'
source_config="$release_root/infra/squid/openscience-egress.conf"
target_config="${OPENSCIENCE_SQUID_CONFIG:-/etc/squid/squid.conf}"
atomic_config="$release_root/infra/scripts/atomic-squid-config.mjs"
firewall="$release_root/infra/scripts/scansci-browser-firewall.sh"
ss_bin='/usr/sbin/ss'
no_mutation_exit=78
clean_compensated_exit=79
next_config=''
activated=0
mutation_started=0

cleanup() {
  status=$?
  trap - EXIT
  cleanup_failed=0
  if [ -n "$next_config" ]; then
    rm -f "$next_config" || cleanup_failed=1
  fi
  if [ "$status" -eq 0 ]; then
    [ "$cleanup_failed" -eq 0 ] || exit 70
    exit 0
  fi
  if [ "$mutation_started" -eq 0 ]; then
    exit "$no_mutation_exit"
  fi
  if [ "$activated" -eq 1 ]; then
    /usr/bin/node "$atomic_config" restore "$target_config" >/dev/null 2>&1 || cleanup_failed=1
    /usr/sbin/squid -k reconfigure -f "$target_config" >/dev/null 2>&1 || cleanup_failed=1
  fi
  /bin/bash "$firewall" remove >/dev/null 2>&1 || cleanup_failed=1
  if [ "$cleanup_failed" -ne 0 ]; then
    echo "browser network compensation failed" >&2
    exit 70
  fi
  exit "$clean_compensated_exit"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

for source in "$source_config" "$atomic_config" "$firewall"; do
  [ -f "$source" ] && [ ! -L "$source" ] || { echo "runtime source unavailable" >&2; exit 66; }
done
[ -f "$target_config" ] && [ ! -L "$target_config" ] || { echo "target config unavailable" >&2; exit 66; }
[ -x "$ss_bin" ] && [ ! -L "$ss_bin" ] || { echo "socket inspection unavailable" >&2; exit 66; }
[ "$(docker network inspect --format '{{.Driver}}:{{.Internal}}' "$network_name")" = 'bridge:true' ] \
  || { echo "browser network is not an internal bridge" >&2; exit 65; }
[ "$(docker network inspect --format '{{(index .IPAM.Config 0).Subnet}}:{{(index .IPAM.Config 0).Gateway}}' "$network_name")" = "$subnet:$gateway" ] \
  || { echo "browser network IPAM mismatch" >&2; exit 65; }
[ "$(docker network inspect --format '{{index .Options "com.docker.network.bridge.name"}}' "$network_name")" = "$bridge_name" ] \
  || { echo "browser network bridge mismatch" >&2; exit 65; }

mapfile -t peers < <(docker network inspect --format '{{range .Containers}}{{.Name}}{{"\n"}}{{end}}' "$network_name" | sed '/^$/d')
if [ "${#peers[@]}" -ne 1 ] || [[ "${peers[0]}" != *-scansci-browser-1 ]]; then
  echo "browser network has an unauthorized peer" >&2
  exit 65
fi

mutation_started=1
/bin/bash "$firewall"
next_config="$(mktemp /etc/squid/.openscience-next.XXXXXX)"
install -o root -g root -m 0644 "$source_config" "$next_config"
/usr/sbin/squid -k parse -f "$next_config" >/dev/null 2>&1
/usr/bin/node "$atomic_config" activate "$next_config" "$target_config"
activated=1

for _attempt in $(seq 1 20); do
  if "$ss_bin" -lntH | awk '$4 == "172.26.0.1:7891" { found=1 } END { exit found ? 0 : 1 }'; then
    exit 0
  fi
  sleep 0.1
done
echo "browser proxy listener unavailable" >&2
exit 1
