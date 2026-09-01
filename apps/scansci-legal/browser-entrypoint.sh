#!/usr/bin/env bash

set -euo pipefail
umask 077

python -m scansci_legal.source_guard >/dev/null

export DISPLAY=":99"
xvfb_pid=""

install -d -m 0700 "$HOME" /tmp/scansci-browser

cleanup() {
  if [ -n "$xvfb_pid" ]; then
    kill "$xvfb_pid" 2>/dev/null || true
    wait "$xvfb_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

Xvfb "$DISPLAY" -screen 0 1280x800x24 -nolisten tcp &
xvfb_pid="$!"

attempt=0
while [ ! -S /tmp/.X11-unix/X99 ]; do
  kill -0 "$xvfb_pid" 2>/dev/null || exit 70
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 100 ]; then
    exit 70
  fi
  sleep 0.05
done

exec python -m scansci_legal.browser_worker
