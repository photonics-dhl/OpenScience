#!/usr/bin/env bash
# Verify the stable ECS egress proxy without printing credentials.

set -euo pipefail

PROXY_URL="${OPENSCIENCE_EGRESS_PROXY:-http://127.0.0.1:7891}"
PROBE_URL="${OPENSCIENCE_EGRESS_PROBE:-https://www.gstatic.com/generate_204}"
ACCESS_LOG="${OPENSCIENCE_SQUID_ACCESS_LOG:-/var/log/squid/access.log}"

log_lines_before=0
if [ -r "$ACCESS_LOG" ]; then
  log_lines_before="$(wc -l < "$ACCESS_LOG")"
fi

status="$(curl -x "$PROXY_URL" --silent --show-error --output /dev/null \
  --write-out '%{http_code}' --connect-timeout 3 --max-time 10 "$PROBE_URL")"

if [ "$status" != "204" ]; then
  echo "egress probe failed: expected HTTP 204, got $status" >&2
  exit 1
fi

echo "egress_http=204"

if [ -r "$ACCESS_LOG" ]; then
  hierarchy="$(sed -n "$((log_lines_before + 1)),\$p" "$ACCESS_LOG" | awk 'NF >= 9 {print $9}' | tail -n 1)"
  [ -n "$hierarchy" ] || {
    echo "egress hierarchy evidence missing" >&2
    exit 1
  }
  echo "egress_hierarchy=$hierarchy"
fi
