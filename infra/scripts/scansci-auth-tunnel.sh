#!/usr/bin/env bash
# Run on Windows with: & 'C:/Program Files/Git/bin/bash.exe' ./infra/scripts/scansci-auth-tunnel.sh <start|stop|status> [local-port]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"
STATE_ROOT="${XDG_STATE_HOME:-${LOCALAPPDATA:-$HOME/.local/state}}/openscience"
STATE_FILE="$STATE_ROOT/scansci-auth-tunnel.state"
LOCK_DIR="$STATE_ROOT/scansci-auth-tunnel.lock"
RUNNER_FILE="$STATE_ROOT/scansci-auth-tunnel-runner.sh"
SSH_KEY="$HOME/.ssh/id_ed25519_xgs"
KNOWN_HOSTS="$HOME/.ssh/known_hosts"
LOCK_HELD=0

usage() {
  echo "usage: scansci-auth-tunnel.sh <start|stop|status> [local-port]" >&2
  exit 64
}

read_state() {
  [ -f "$STATE_FILE" ] && [ ! -L "$STATE_FILE" ] || return 1
  local lines
  mapfile -t lines < "$STATE_FILE"
  [ "${#lines[@]}" -eq 3 ] || return 1
  STATE_TOKEN="${lines[0]}"
  STATE_PID="${lines[1]}"
  STATE_PORT="${lines[2]}"
  [[ "$STATE_TOKEN" =~ ^[0-9a-f]{32}$ ]] || return 1
  [[ "$STATE_PID" =~ ^[1-9][0-9]*$ ]] || return 1
  [[ "$STATE_PORT" =~ ^[0-9]+$ ]] || return 1
}

process_matches_state() {
  read_state || return 1
  kill -0 "$STATE_PID" 2>/dev/null || return 1
  local identity
  identity="$(ps -p "$STATE_PID" -f 2>/dev/null || true)"
  case "$identity" in
    *"scansci-auth-tunnel-runner.sh $STATE_TOKEN $STATE_PORT"*"127.0.0.1:$STATE_PORT:127.0.0.1:6080"*) return 0 ;;
    *) return 1 ;;
  esac
}

is_running() {
  process_matches_state
}

release_lock() {
  if [ "$LOCK_HELD" -eq 1 ]; then
    rm -f "$LOCK_DIR/pid"
    rmdir "$LOCK_DIR" 2>/dev/null || true
    LOCK_HELD=0
  fi
}

acquire_lock() {
  mkdir -p "$STATE_ROOT"
  chmod 700 "$STATE_ROOT" 2>/dev/null || true
  local attempt owner
  for attempt in $(seq 1 100); do
    if mkdir "$LOCK_DIR" 2>/dev/null; then
      printf '%s\n' "$$" > "$LOCK_DIR/pid"
      LOCK_HELD=1
      trap release_lock EXIT INT TERM
      return 0
    fi
    owner="$(tr -d '\r\n' < "$LOCK_DIR/pid" 2>/dev/null || true)"
    if ! [[ "$owner" =~ ^[1-9][0-9]*$ ]] || ! kill -0 "$owner" 2>/dev/null; then
      rm -f "$LOCK_DIR/pid" 2>/dev/null || true
      rmdir "$LOCK_DIR" 2>/dev/null || true
      continue
    fi
    sleep 0.05
  done
  echo "tunnel state busy" >&2
  return 75
}

write_runner() {
  local temporary="$RUNNER_FILE.$$"
  printf '%s\n' \
    '#!/usr/bin/env bash' \
    'set -uo pipefail' \
    'token="$1"; port="$2"; shift 2' \
    'child=0' \
    'cleanup(){ if [ "$child" -gt 0 ]; then kill "$child" 2>/dev/null || true; wait "$child" 2>/dev/null || true; fi; }' \
    'trap cleanup EXIT INT TERM' \
    '"$@" &' \
    'child=$!' \
    'wait "$child"' > "$temporary"
  chmod 700 "$temporary"
  mv -f "$temporary" "$RUNNER_FILE"
}

write_state() {
  local token="$1" pid="$2" port="$3" temporary="$STATE_FILE.$$.$token"
  printf '%s\n%s\n%s\n' "$token" "$pid" "$port" > "$temporary"
  chmod 600 "$temporary" 2>/dev/null || true
  mv -f "$temporary" "$STATE_FILE"
}

remove_state() {
  rm -f "$STATE_FILE" "$STATE_ROOT/scansci-auth-tunnel.pid" "$STATE_ROOT/scansci-auth-tunnel.port"
}

stop_identified_tunnel() {
  if process_matches_state; then
    kill "$STATE_PID" 2>/dev/null || true
    wait "$STATE_PID" 2>/dev/null || true
  fi
  remove_state
}

wait_until_ready() {
  local port="$1" attempt
  for attempt in $(seq 1 8); do
    if curl --noproxy '*' --fail --silent --show-error --connect-timeout 0.2 --max-time 0.5 "http://127.0.0.1:$port/" >/dev/null 2>&1; then
      return 0
    fi
    process_matches_state || return 1
    sleep 0.1
  done
  return 1
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
  acquire_lock
  if is_running; then
    if [ "$STATE_PORT" != "$port" ]; then
      echo "tunnel already running on another local port" >&2
      return 65
    fi
    echo "already running on http://127.0.0.1:$port"
    return 0
  fi
  remove_state
  load_connection

  if ! ssh "${SSH_ARGS[@]}" "$SSH_TARGET" "$(remote_compose_command 'up -d')" >/dev/null 2>&1; then
    echo "auth helper start failed" >&2
    return 1
  fi

  local token
  token="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \r\n')"
  [[ "$token" =~ ^[0-9a-f]{32}$ ]] || { stop_remote_helper || true; echo "tunnel identity failed" >&2; return 1; }
  write_runner
  bash "$RUNNER_FILE" "$token" "$port" ssh "${SSH_ARGS[@]}" -N -L "127.0.0.1:$port:127.0.0.1:6080" "$SSH_TARGET" >/dev/null 2>&1 &
  local tunnel_pid=$!
  write_state "$token" "$tunnel_pid" "$port"
  sleep 0.2
  if ! process_matches_state; then
    stop_identified_tunnel
    stop_remote_helper || true
    echo "loopback tunnel start failed" >&2
    return 1
  fi
  if ! wait_until_ready "$port"; then
    stop_identified_tunnel
    stop_remote_helper || true
    echo "loopback tunnel readiness failed" >&2
    return 1
  fi
  echo "started on http://127.0.0.1:$port"
}

stop_tunnel() {
  acquire_lock
  stop_identified_tunnel

  load_connection
  if ! stop_remote_helper; then
    echo "auth helper stop failed" >&2
    return 1
  fi
  echo "stopped"
}

show_status() {
  acquire_lock
  if is_running; then
    echo "running on http://127.0.0.1:$STATE_PORT"
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
