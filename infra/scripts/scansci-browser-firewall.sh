#!/usr/bin/env bash

set -euo pipefail

[ "$#" -le 1 ] || { echo "usage: scansci-browser-firewall.sh [install|remove]" >&2; exit 64; }
action="${1:-install}"
case "$action" in install|remove) ;; *) exit 64 ;; esac
[ "$(id -u)" -eq 0 ] || { echo "root required" >&2; exit 77; }

iptables_bin='/usr/sbin/iptables'
bridge_name='xgs-browser0'
subnet='172.26.0.0/24'
gateway='172.26.0.1'
browser_ip='172.26.0.2'
comment='openscience-scansci-browser'

iptables_real="$(readlink -f -- "$iptables_bin")"
[ -x "$iptables_bin" ] && [ -f "$iptables_real" ] && [ ! -L "$iptables_real" ] \
  || { echo "iptables unavailable" >&2; exit 66; }
read -r iptables_uid iptables_mode < <(stat -Lc '%u %a' -- "$iptables_real")
[ "$iptables_uid" -eq 0 ] && (( (8#$iptables_mode & 8#022) == 0 )) \
  || { echo "iptables identity unsafe" >&2; exit 66; }

accept=(INPUT -i "$bridge_name" -s "$browser_ip/32" -d "$gateway" -p tcp --dport 7891 -m comment --comment "$comment" -j ACCEPT)
legacy_accept=(INPUT -i "$bridge_name" -s "$subnet" -d "$gateway" -p tcp --dport 7891 -m comment --comment "$comment" -j ACCEPT)
reject=(INPUT -i "$bridge_name" -s "$subnet" -m comment --comment "$comment" -j REJECT --reject-with icmp-port-unreachable)

if [ "$action" = remove ]; then
  while "$iptables_bin" -w -C "${accept[@]}" >/dev/null 2>&1; do
    "$iptables_bin" -w -D "${accept[@]}"
  done
  while "$iptables_bin" -w -C "${legacy_accept[@]}" >/dev/null 2>&1; do
    "$iptables_bin" -w -D "${legacy_accept[@]}"
  done
  while "$iptables_bin" -w -C "${reject[@]}" >/dev/null 2>&1; do
    "$iptables_bin" -w -D "${reject[@]}"
  done
  exit 0
fi

while "$iptables_bin" -w -C "${accept[@]}" >/dev/null 2>&1; do
  "$iptables_bin" -w -D "${accept[@]}"
done
while "$iptables_bin" -w -C "${legacy_accept[@]}" >/dev/null 2>&1; do
  "$iptables_bin" -w -D "${legacy_accept[@]}"
done
while "$iptables_bin" -w -C "${reject[@]}" >/dev/null 2>&1; do
  "$iptables_bin" -w -D "${reject[@]}"
done
"$iptables_bin" -w -I "${reject[@]}"
"$iptables_bin" -w -I "${accept[@]}"
"$iptables_bin" -w -C "${accept[@]}"
"$iptables_bin" -w -C "${reject[@]}"

mapfile -t input_rules < <("$iptables_bin" -w -S INPUT)
accept_index=-1
reject_index=-1
commented_count=0
for index in "${!input_rules[@]}"; do
  rule="${input_rules[$index]}"
  commented=0
  if [[ "$rule" == *"--comment \"$comment\""* || "$rule" == *"--comment $comment"* ]]; then
    commented=1
    commented_count=$((commented_count + 1))
  fi
  if [ "$commented" -eq 1 ] && [[ "$rule" == *"--dport 7891"*"-j ACCEPT" ]]; then
    [ "$accept_index" -eq -1 ] || exit 65
    accept_index="$index"
  elif [ "$commented" -eq 1 ] && [[ "$rule" == *"-j REJECT"* ]]; then
    [ "$reject_index" -eq -1 ] || exit 65
    reject_index="$index"
  fi
done
[ "$commented_count" -eq 2 ] && [ "$accept_index" -ge 0 ] && [ "$reject_index" -gt "$accept_index" ]
