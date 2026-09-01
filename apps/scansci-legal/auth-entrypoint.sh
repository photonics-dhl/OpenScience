#!/usr/bin/env bash

set -euo pipefail
umask 077

export DISPLAY="${DISPLAY:-:99}"
children=()

cleanup() {
  local pid
  local owned_children=("${children[@]}")
  children=()
  for pid in "${owned_children[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  for pid in "${owned_children[@]}"; do
    wait "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

Xvfb "$DISPLAY" -screen 0 1280x800x24 -nolisten tcp &
children+=("$!")
sleep 0.2

x11vnc -display "$DISPLAY" -rfbport 5900 -listen 127.0.0.1 -forever -shared -nopw -no6 &
children+=("$!")

websockify --web=/usr/share/novnc 0.0.0.0:6080 127.0.0.1:5900 &
children+=("$!")

python -m scansci_legal.auth_login --operator-start &
auth_pid="$!"
children+=("$auth_pid")
set +e
wait "$auth_pid"
auth_status="$?"
set -e
if [ "${#children[@]}" -eq 4 ] && [ "${children[3]}" = "$auth_pid" ]; then
  unset 'children[3]'
fi
exit "$auth_status"
