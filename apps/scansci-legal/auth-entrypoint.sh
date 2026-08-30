#!/usr/bin/env bash

set -euo pipefail
umask 077

export DISPLAY="${DISPLAY:-:99}"
children=()

cleanup() {
  local pid
  for pid in "${children[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
  for pid in "${children[@]:-}"; do
    wait "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

Xvfb "$DISPLAY" -screen 0 1280x800x24 -nolisten tcp &
children+=("$!")
sleep 0.2

chromium \
  --user-data-dir=/session/chromium \
  --no-first-run \
  --no-default-browser-check \
  --disable-dev-shm-usage \
  --disable-background-networking \
  about:blank &
children+=("$!")

x11vnc -display "$DISPLAY" -rfbport 5900 -localhost -forever -shared -nopw &
children+=("$!")

websockify --web=/usr/share/novnc 6080 127.0.0.1:5900 &
children+=("$!")

python -m scansci_legal.auth_login --operator-start
