#!/usr/bin/env bash
# Prove Squid DIRECT fallback with an isolated listener and a dead parent.

set -euo pipefail

SOURCE_CONFIG="${OPENSCIENCE_SQUID_CONFIG:-/etc/squid/squid.conf}"
TEST_CONFIG=/tmp/openscience-squid-fallback.conf
TEST_ACCESS_LOG=/tmp/openscience-squid-fallback-access.log
TEST_CACHE_LOG=/tmp/openscience-squid-fallback-cache.log
TEST_UNIT=openscience-squid-fallback-test.service

sed \
  -e 's/127\.0\.0\.1:7891/127.0.0.1:7892/' \
  -e 's/127\.0\.0\.1 parent 7890/127.0.0.1 parent 9/' \
  -e "s#/var/log/squid/access.log#$TEST_ACCESS_LOG#" \
  -e "s#/var/log/squid/cache.log#$TEST_CACHE_LOG#" \
  "$SOURCE_CONFIG" > "$TEST_CONFIG"
printf '\npid_filename /run/openscience-squid-fallback.pid\n' >> "$TEST_CONFIG"

squid -k parse -f "$TEST_CONFIG"

stop_test_unit() {
  systemctl stop "$TEST_UNIT" >/dev/null 2>&1 || true
}
trap stop_test_unit EXIT

systemd-run --collect --unit="${TEST_UNIT%.service}" --property=Type=simple \
  /usr/sbin/squid -N -f "$TEST_CONFIG" >/dev/null

for _ in 1 2 3 4 5; do
  if ss -ltn | grep -q '127.0.0.1:7892'; then
    break
  fi
  sleep 1
done

ss -ltn | grep -q '127.0.0.1:7892' || {
  echo 'fallback test listener did not start' >&2
  exit 1
}

status="$(curl -x http://127.0.0.1:7892 --silent --show-error \
  --output /dev/null --write-out '%{http_code}' --connect-timeout 3 \
  --max-time 12 https://www.gstatic.com/generate_204)"
hierarchy="$(tail -n 10 "$TEST_ACCESS_LOG" | awk 'NF >= 9 {print $9}' | tail -n 1)"

echo "fallback_http=$status"
echo "fallback_hierarchy=$hierarchy"

[ "$status" = 204 ]
case "$hierarchy" in
  HIER_DIRECT/*) ;;
  *) echo 'fallback did not use DIRECT' >&2; exit 1 ;;
esac
