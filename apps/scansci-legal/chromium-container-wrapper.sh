#!/usr/bin/env sh

set -eu

# Chromium's inner namespace/setuid sandbox is unavailable under the hardened
# auth container (non-root, read-only, cap-drop ALL, no-new-privileges). The
# container remains the outer sandbox boundary for this operator-only browser.
exec /usr/bin/chromium --no-sandbox "$@"
