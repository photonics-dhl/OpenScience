#!/usr/bin/env bash
set -euo pipefail
umask 077
# Renew only a stale IPC pathname before any UI listener is launched.
node -e 'const fs=require("fs"),p="/control/ui.sock";if(fs.existsSync(p)){if(!fs.lstatSync(p).isSocket())throw Error("INVALID_UI_SOCKET");fs.unlinkSync(p)}'
Xvfb :99 -screen 0 1440x960x24 -nolisten tcp &
node /app/relay.mjs &
for attempt in {1..40}; do [ -S /tmp/.X11-unix/X99 ] && break; sleep 0.25; done
x11vnc -display :99 -localhost -rfbport 5900 -forever -shared -nopw -nosel -quiet &
websockify --web /usr/share/novnc/ --unix-listen=/control/ui.sock 127.0.0.1:5900 &
exec /opt/scansci-browsers/chromium-1234/chrome-linux64/chrome --user-data-dir=/profile/chromium --no-first-run --no-default-browser-check \
  --proxy-server=http://127.0.0.1:7891 --disable-quic --window-size=1440,960 https://chatgpt.com/
