#!/usr/bin/env bash
# Run on Windows with: & 'C:/Program Files/Git/bin/bash.exe' ./infra/scripts/scansci-auth-tunnel.sh <start|stop|status> [local-port]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"
STATE_ROOT="${XDG_STATE_HOME:-${LOCALAPPDATA:-$HOME/.local/state}}/openscience"
PID_FILE="$STATE_ROOT/scansci-auth-tunnel.pid"
PORT_FILE="$STATE_ROOT/scansci-auth-tunnel.port"
SSH_KEY="$HOME/.ssh/id_ed25519_xgs"
KNOWN_HOSTS="$HOME/.ssh/known_hosts"

usage() {
  echo "usage: scansci-auth-tunnel.sh <start|stop|status> [local-port]" >&2
  exit 64
}

is_running() {
  [ -f "$PID_FILE" ] || return 1
  local pid
  pid="$(tr -d '\r\n' < "$PID_FILE")"
  [[ "$pid" =~ ^[1-9][0-9]*$ ]] || return 1
  kill -0 "$pid" 2>/dev/null
}

current_port() {
  [ -f "$PORT_FILE" ] || return 1
  tr -d '\r\n' < "$PORT_FILE"
}

read_env() {
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -n1 | cut -d= -f2- \
    | tr -d '\r' \
    | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
      -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

pick() {
  local key value
  for key in "$@"; do
    value="$(read_env "$key")"
    if [ -n "$value" ]; then
      printf '%s' "$value"
      return 0
    fi
  done
  return 1
}

load_connection() {
  [ -f "$ENV_FILE" ] || { echo "connection settings unavailable" >&2; return 66; }
  [ -f "$SSH_KEY" ] && [ ! -L "$SSH_KEY" ] || { echo "project SSH key unavailable" >&2; return 66; }
  [ -f "$KNOWN_HOSTS" ] && [ ! -L "$KNOWN_HOSTS" ] || { echo "known hosts unavailable" >&2; return 66; }
  SSH_HOST="$(pick SERVER_HOST SSH_HOST 公网ip)" || { echo "connection settings unavailable" >&2; return 66; }
  SSH_USER="$(pick SERVER_USER SSH_USER 用户名)" || { echo "connection settings unavailable" >&2; return 66; }
  SSH_PORT="$(pick SERVER_PORT SSH_PORT SSH端口 || true)"
  SSH_PORT="${SSH_PORT:-22}"
  [[ "$SSH_PORT" =~ ^[1-9][0-9]{0,4}$ ]] && [ "$SSH_PORT" -le 65535 ] \
    || { echo "connection settings invalid" >&2; return 66; }
  { [[ "$SSH_HOST" =~ ^[A-Za-z0-9][A-Za-z0-9._:-]*$ ]] || [[ "$SSH_HOST" =~ ^\[[0-9A-Fa-f:]+\]$ ]]; } \
    && [[ "$SSH_USER" =~ ^[A-Za-z0-9_][A-Za-z0-9._-]*$ ]] \
    || { echo "connection settings invalid" >&2; return 66; }
  SSH_ARGS=(
    -o BatchMode=yes
    -o ConnectTimeout=10
    -o StrictHostKeyChecking=yes
    -o "UserKnownHostsFile=$KNOWN_HOSTS"
    -o ServerAliveInterval=15
    -o ServerAliveCountMax=3
    -o ExitOnForwardFailure=yes
    -i "$SSH_KEY"
    -p "$SSH_PORT"
  )
  SSH_TARGET="$SSH_USER@$SSH_HOST"
}

remote_compose_command() {
  local action="$1"
  printf '%s' 'sha=$(cat /opt/openscience/.release-id); root=/opt/openscience-releases/$sha; cd "$root" && XGS_RELEASE_ROOT="$root" XGS_RELEASE_IMAGE_TAG="$sha" docker compose --env-file /opt/openscience/.env.prod -f infra/compose/docker-compose.prod.yml --profile scansci-auth '"$action"' scansci-auth'
}

stop_remote_helper() {
  ssh "${SSH_ARGS[@]}" "$SSH_TARGET" "$(remote_compose_command 'stop')" >/dev/null 2>&1
}

start_tunnel() {
  local port="${1:-6080}"
  [[ "$port" =~ ^[0-9]+$ ]] && [ "$port" -ge 1024 ] && [ "$port" -le 65535 ] || usage
  if is_running; then
    local active_port
    active_port="$(current_port || true)"
    if [ "$active_port" != "$port" ]; then
      echo "tunnel already running on another local port" >&2
      return 65
    fi
    echo "already running on http://127.0.0.1:$port"
    return 0
  fi
  rm -f "$PID_FILE" "$PORT_FILE"
  load_connection
  mkdir -p "$STATE_ROOT"
  chmod 700 "$STATE_ROOT" 2>/dev/null || true

  if ! ssh "${SSH_ARGS[@]}" "$SSH_TARGET" "$(remote_compose_command 'up -d')" >/dev/null 2>&1; then
    echo "auth helper start failed" >&2
    return 1
  fi

  ssh "${SSH_ARGS[@]}" -N -L "127.0.0.1:$port:127.0.0.1:6080" "$SSH_TARGET" >/dev/null 2>&1 &
  local tunnel_pid=$!
  printf '%s\n' "$tunnel_pid" > "$PID_FILE"
  printf '%s\n' "$port" > "$PORT_FILE"
  chmod 600 "$PID_FILE" "$PORT_FILE" 2>/dev/null || true
  sleep 0.2
  if ! kill -0 "$tunnel_pid" 2>/dev/null; then
    rm -f "$PID_FILE" "$PORT_FILE"
    stop_remote_helper || true
    echo "loopback tunnel start failed" >&2
    return 1
  fi
  echo "started on http://127.0.0.1:$port"
}

stop_tunnel() {
  if is_running; then
    local pid
    pid="$(tr -d '\r\n' < "$PID_FILE")"
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
  rm -f "$PID_FILE" "$PORT_FILE"

  load_connection
  if ! stop_remote_helper; then
    echo "auth helper stop failed" >&2
    return 1
  fi
  echo "stopped"
}

show_status() {
  if is_running; then
    local port
    port="$(current_port || true)"
    [[ "$port" =~ ^[0-9]+$ ]] || { echo "tunnel state invalid" >&2; return 65; }
    echo "running on http://127.0.0.1:$port"
    return 0
  fi
  echo "stopped"
  return 3
}

command="${1:-}"
case "$command" in
  start)
    [ "$#" -le 2 ] || usage
    start_tunnel "${2:-6080}"
    ;;
  stop)
    [ "$#" -eq 1 ] || usage
    stop_tunnel
    ;;
  status)
    [ "$#" -eq 1 ] || usage
    show_status
    ;;
  *) usage ;;
esac
