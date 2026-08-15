#!/usr/bin/env bash
set -euo pipefail

METRICS_URL="${METRICS_URL:-http://127.0.0.1:49312/metrics}"
PUBLIC_URL="${PUBLIC_URL:-https://openscience.428312321.xyz/}"
MIN_HA_CONNECTIONS="${MIN_HA_CONNECTIONS:-3}"
RESTART_COOLDOWN_SECONDS="${RESTART_COOLDOWN_SECONDS:-180}"
STATE_FILE="${STATE_FILE:-/run/openscience-cloudflared-watchdog.last_restart}"

read_ha_connections() {
  local metrics
  metrics="$(curl -fsS --max-time 3 "$METRICS_URL" 2>/dev/null || true)"
  awk '/^cloudflared_tunnel_ha_connections / {print int($2); found=1} END {if (!found) print 0}' <<< "$metrics"
}

read_public_status() {
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 12 "$PUBLIC_URL" 2>/dev/null || true)"
  if [[ ! "$code" =~ ^[0-9]{3}$ ]]; then
    code=000
  fi
  printf '%s\n' "$code"
}

log_status() {
  logger -t openscience-cloudflared-watchdog -- "$*"
}

main() {
  exec 9>"${STATE_FILE}.lock"
  flock -n 9 || exit 0

  local ha_connections http_code now last_restart new_ha new_http
  ha_connections="$(read_ha_connections)"
  http_code="$(read_public_status)"
  if (( ha_connections >= MIN_HA_CONNECTIONS )) && [[ "$http_code" == 200 || "$http_code" == 304 ]]; then
    exit 0
  fi

  now="$(date +%s)"
  last_restart=0
  if [[ -r "$STATE_FILE" ]]; then
    read -r last_restart < "$STATE_FILE" || last_restart=0
  fi
  if [[ ! "$last_restart" =~ ^[0-9]+$ ]]; then
    last_restart=0
  fi

  if (( now - last_restart < RESTART_COOLDOWN_SECONDS )); then
    log_status "degraded during cooldown: ha_connections=$ha_connections public_http=$http_code"
    exit 0
  fi

  log_status "restarting cloudflared: ha_connections=$ha_connections public_http=$http_code"
  printf '%s\n' "$now" > "$STATE_FILE"
  systemctl restart cloudflared
  sleep 10

  new_ha="$(read_ha_connections)"
  new_http="$(read_public_status)"
  log_status "post_restart: ha_connections=$new_ha public_http=$new_http"

  if (( new_ha < 1 )) || [[ "$new_http" != 200 && "$new_http" != 304 ]]; then
    exit 1
  fi
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
