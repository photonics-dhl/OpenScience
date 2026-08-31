#!/usr/bin/env bash

set -euo pipefail

# Chromium's inner namespace/setuid sandbox is unavailable under the hardened
# auth container (non-root, read-only, cap-drop ALL, no-new-privileges). The
# container remains the outer sandbox boundary for this operator-only browser.
proxy="${SCANSCI_BROWSER_PROXY:-}"
if [ "$proxy" != "http://openscience-egress:7891" ]; then
  exit 64
fi

forwarded=()
for argument in "$@"; do
  if [ "$argument" != "--no-proxy-server" ] \
    && [[ "$argument" != --proxy-server=* ]] \
    && [[ "$argument" != --proxy-bypass-list=* ]] \
    && [[ "$argument" != --proxy-pac-url=* ]] \
    && [ "$argument" != "--proxy-auto-detect" ]; then
    forwarded+=("$argument")
  fi
done

exec /usr/bin/chromium \
  --no-sandbox \
  "--proxy-server=$proxy" \
  '--proxy-bypass-list=<-loopback>' \
  --disable-quic \
  --force-webrtc-ip-handling-policy=disable_non_proxied_udp \
  "${forwarded[@]}"
