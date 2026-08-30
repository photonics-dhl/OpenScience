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
  [ "${#lines[@]}" -eq 7 ] || return 1
  STATE_TOKEN="${lines[0]}"
  STATE_PID="${lines[1]}"
  STATE_PORT="${lines[2]}"
  RELEASE_SHA="${lines[3]}"
  RELEASE_ROOT="${lines[4]}"
  RELEASE_COMPOSE="${lines[5]}"
  STATE_LIFECYCLE="${lines[6]}"
  [[ "$STATE_TOKEN" =~ ^[0-9a-f]{32}$ ]] || return 1
  [[ "$STATE_PID" =~ ^[0-9]+$ ]] || return 1
  [[ "$STATE_PORT" =~ ^[0-9]+$ ]] || return 1
  [[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]] || return 1
  [ "$RELEASE_ROOT" = "/opt/openscience-releases/$RELEASE_SHA" ] || return 1
  [ "$RELEASE_COMPOSE" = "$RELEASE_ROOT/infra/compose/docker-compose.prod.yml" ] || return 1
  case "$STATE_LIFECYCLE" in
    running) [ "$STATE_PID" -gt 0 ] || return 1 ;;
    pending_stop) [ "$STATE_PID" -eq 0 ] || return 1 ;;
    *) return 1 ;;
  esac
}

process_matches_state() {
  read_state || return 1
  [ "$STATE_LIFECYCLE" = "running" ] || return 1
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
  local token pid port lifecycle temporary
  token="$1"
  pid="$2"
  port="$3"
  lifecycle="$4"
  temporary="$STATE_FILE.$$.$token"
  printf '%s\n%s\n%s\n%s\n%s\n%s\n%s\n' \
    "$token" "$pid" "$port" "$RELEASE_SHA" "$RELEASE_ROOT" "$RELEASE_COMPOSE" "$lifecycle" > "$temporary"
  chmod 600 "$temporary" 2>/dev/null || true
  mv -f "$temporary" "$STATE_FILE"
}

remove_state() {
  rm -f "$STATE_FILE" "$STATE_ROOT/scansci-auth-tunnel.pid" "$STATE_ROOT/scansci-auth-tunnel.port"
}

stop_identified_tunnel() {
  read_state || return 1
  local identified=0 local_pid="$STATE_PID"
  if [ "$STATE_LIFECYCLE" = "running" ] && process_matches_state; then
    identified=1
    local_pid="$STATE_PID"
  fi
  STATE_PID=0
  STATE_LIFECYCLE="pending_stop"
  write_state "$STATE_TOKEN" 0 "$STATE_PORT" "pending_stop"
  if [ "$identified" -eq 1 ]; then
    kill "$local_pid" 2>/dev/null || true
    wait "$local_pid" 2>/dev/null || true
  fi
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
  printf 'cd "%s" && XGS_RELEASE_ROOT="%s" XGS_RELEASE_IMAGE_TAG="%s" docker compose --env-file /opt/openscience/.env.prod -f "%s" --profile scansci-auth %s scansci-auth' \
    "$RELEASE_ROOT" "$RELEASE_ROOT" "$RELEASE_SHA" "$RELEASE_COMPOSE" "$action"
}

resolve_release_identity() {
  RELEASE_SHA="$(ssh "${SSH_ARGS[@]}" "$SSH_TARGET" 'cat /opt/openscience/.release-id' 2>/dev/null | tr -d '\r\n')" \
    || { echo "release identity unavailable" >&2; return 1; }
  [[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "release identity invalid" >&2; return 1; }
  RELEASE_ROOT="/opt/openscience-releases/$RELEASE_SHA"
  RELEASE_COMPOSE="$RELEASE_ROOT/infra/compose/docker-compose.prod.yml"
}

stop_remote_helper() {
  ssh "${SSH_ARGS[@]}" "$SSH_TARGET" "$(remote_compose_command 'stop')" >/dev/null 2>&1
}

commit_remote_stop() {
  if stop_remote_helper; then
    remove_state
    return 0
  fi
  return 1
}

resolve_existing_state_before_start() {
  if ! read_state; then
    return 0
  fi
  if [ "$STATE_LIFECYCLE" = "running" ] && process_matches_state; then
    return 2
  fi
  stop_identified_tunnel
  load_connection
  if ! commit_remote_stop; then
    echo "pending remote auth helper stop failed" >&2
    return 1
  fi
  return 0
}

start_tunnel() {
  local port="${1:-6080}"
  [[ "$port" =~ ^[0-9]+$ ]] && [ "$port" -ge 1024 ] && [ "$port" -le 65535 ] || usage
  acquire_lock
  local existing_rc=0
  resolve_existing_state_before_start || existing_rc=$?
  if [ "$existing_rc" -eq 1 ]; then
    return 1
  fi
  if [ "$existing_rc" -eq 2 ]; then
    if [ "$STATE_PORT" != "$port" ]; then
      echo "tunnel already running on another local port" >&2
      return 65
    fi
    if wait_until_ready "$port"; then
      echo "already running on http://127.0.0.1:$port"
      return 0
    fi
    stop_identified_tunnel
    load_connection
    commit_remote_stop || true
    echo "loopback tunnel readiness failed" >&2
    return 1
  fi
  load_connection
  resolve_release_identity

  local token
  token="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \r\n')"
  [[ "$token" =~ ^[0-9a-f]{32}$ ]] || { echo "tunnel identity failed" >&2; return 1; }
  write_runner
  write_state "$token" 0 "$port" "pending_stop"

  if ! ssh "${SSH_ARGS[@]}" "$SSH_TARGET" "$(remote_compose_command 'up -d')" >/dev/null 2>&1; then
    echo "auth helper start failed" >&2
    return 1
  fi

  bash "$RUNNER_FILE" "$token" "$port" ssh "${SSH_ARGS[@]}" -N -L "127.0.0.1:$port:127.0.0.1:6080" "$SSH_TARGET" >/dev/null 2>&1 &
  local tunnel_pid=$!
  write_state "$token" "$tunnel_pid" "$port" "running"
  sleep 0.2
  if ! process_matches_state; then
    stop_identified_tunnel
    commit_remote_stop || true
    echo "loopback tunnel start failed" >&2
    return 1
  fi
  if ! wait_until_ready "$port"; then
    stop_identified_tunnel
    commit_remote_stop || true
    echo "loopback tunnel readiness failed" >&2
    return 1
  fi
  echo "started on http://127.0.0.1:$port"
}

stop_tunnel() {
  acquire_lock
  if ! read_state; then
    remove_state
    echo "validated tunnel release state unavailable" >&2
    return 65
  fi
  stop_identified_tunnel

  load_connection
  if ! commit_remote_stop; then
    echo "auth helper stop failed" >&2
    return 1
  fi
  echo "stopped"
}

show_status() {
  acquire_lock
  if read_state && [ "$STATE_LIFECYCLE" = "pending_stop" ]; then
    echo "pending remote stop"
    return 4
  fi
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
