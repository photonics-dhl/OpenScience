#!/bin/sh
set -eu

chgrp 11000 /data/papers
chmod 0770 /data/papers

install -d -m 0700 "$SCANSCI_PDF_DATA_DIR" "$HOME" "$SCANSCI_PDF_DATA_DIR/tor" /data/papers /tmp/scansci-runtime

if [ "${SCANSCI_TOR_AUTOSTART:-true}" = "true" ]; then
  tor \
    --SocksPort 127.0.0.1:1080 \
    --HTTPSProxy openscience-egress:7891 \
    --DataDirectory "$SCANSCI_PDF_DATA_DIR/tor" \
    --PidFile /tmp/scansci-runtime/tor.pid \
    --Log "notice file /tmp/scansci-runtime/tor.log" &
fi

xvfb-run -a -s "-screen 0 1440x1000x24 -nolisten tcp" \
  scansci-pdf run --mode streamable_http --host 127.0.0.1 --port 18080 &

attempt=0
until python -c "import socket; s=socket.create_connection(('127.0.0.1',18080),1); s.close()" 2>/dev/null; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 90 ] || exit 1
  sleep 1
done

exec nginx -c /opt/scansci/nginx-mcp.conf -g 'daemon off;'
