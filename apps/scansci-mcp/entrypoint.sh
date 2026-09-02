#!/bin/sh
set -eu

install -d -m 0700 "$SCANSCI_PDF_DATA_DIR" "$HOME" "$SCANSCI_PDF_DATA_DIR/tor" /data/papers /tmp/scansci-runtime

if [ "${SCANSCI_TOR_AUTOSTART:-true}" = "true" ]; then
  tor \
    --SocksPort 127.0.0.1:1080 \
    --HTTPSProxy openscience-egress:7891 \
    --DataDirectory "$SCANSCI_PDF_DATA_DIR/tor" \
    --PidFile /tmp/scansci-runtime/tor.pid \
    --Log "notice file /tmp/scansci-runtime/tor.log" &
fi

exec xvfb-run -a -s "-screen 0 1440x1000x24 -nolisten tcp" \
  scansci-pdf run --mode streamable_http --host 0.0.0.0 --port 8000
