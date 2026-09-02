#!/usr/bin/env bash
set -euo pipefail

HOST_IMPORT_ROOT="/run/openscience-scansci-import"
CONTAINER="openscience-prod-scansci-mcp-1"
CONTAINER_IMPORT_DIR="/tmp/scansci-cookie-import"
CONTAINER_IMPORT_FILE="$CONTAINER_IMPORT_DIR/netscape.txt"
DEPLOY_LOCK_DIRECTORY="/run/lock/openscience-production-deploy"
DEPLOY_LOCK_PATH="$DEPLOY_LOCK_DIRECTORY/lock"
ACTIVE_MARKER="/opt/openscience/.release-id"
CAPABILITY_ROOT="/opt/openscience/.release-capabilities"
MAX_BYTES=$((4 * 1024 * 1024))

if [ "$#" -ne 2 ] || [ "$1" != "--confirm" ]; then
  echo "usage: import-scansci-cookies.sh --confirm /run/openscience-scansci-import/<file>" >&2
  exit 64
fi
if [ "$(id -u)" -ne 0 ]; then
  echo "ScanSci cookie import must run as root on the production host" >&2
  exit 77
fi

install -d -o 0 -g 0 -m 0700 "$HOST_IMPORT_ROOT"
[ ! -e "$HOST_IMPORT_ROOT/.cleanup-required" ] || {
  echo "previous ScanSci cookie cleanup requires operator attention" >&2
  exit 70
}
[ -d "$DEPLOY_LOCK_DIRECTORY" ] && [ ! -L "$DEPLOY_LOCK_DIRECTORY" ] \
  && [ "$(stat -c '%u:%a' "$DEPLOY_LOCK_DIRECTORY")" = "0:700" ] \
  && [ -f "$DEPLOY_LOCK_PATH" ] && [ ! -L "$DEPLOY_LOCK_PATH" ] \
  && [ "$(stat -c '%u:%a:%h' "$DEPLOY_LOCK_PATH")" = "0:600:1" ] || {
    echo "production deployment lock identity is invalid" >&2
    exit 71
  }
exec 9<>"$DEPLOY_LOCK_PATH"
flock -n -E 73 9 || { echo "production deployment is active" >&2; exit 73; }

SOURCE_FILE="$(realpath -e -- "$2")"
[ "$(dirname -- "$SOURCE_FILE")" = "$HOST_IMPORT_ROOT" ] || {
  echo "cookie import file must be directly beneath the private staging root" >&2
  exit 65
}
[ ! -L "$SOURCE_FILE" ] || { echo "cookie import file must not be a symlink" >&2; exit 65; }
IFS=: read -r source_uid source_mode source_links source_size < <(stat -c '%u:%a:%h:%s' -- "$SOURCE_FILE")
[ "$source_uid" = 0 ] && [ "$source_mode" = 600 ] && [ "$source_links" = 1 ] \
  && [ "$source_size" -gt 0 ] && [ "$source_size" -le "$MAX_BYTES" ] || {
    echo "cookie import file must be root-owned mode 0600, single-link and bounded" >&2
    exit 65
  }
ACTIVE_SHA="$(cat "$ACTIVE_MARKER")"
[[ "$ACTIVE_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "active release identity is invalid" >&2; exit 65; }
ACTIVE_ROOT="/opt/openscience-releases/$ACTIVE_SHA"
CAPABILITY_FILE="$CAPABILITY_ROOT/$ACTIVE_SHA"
read_capability() {
  local key="$1" count
  count="$(grep -c "^${key}=" "$CAPABILITY_FILE")"
  [ "$count" -eq 1 ] || return 65
  sed -n "s/^${key}=//p" "$CAPABILITY_FILE"
}
[ "$(read_capability schema)" = 6 ] && [ "$(read_capability scansci_deploy)" = true ] || {
  echo "active release is not an official-only ScanSci capability" >&2
  exit 65
}
MCP_IMAGE_ID="$(read_capability scansci_mcp_image_id)"
[[ "$MCP_IMAGE_ID" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "ScanSci MCP image identity is invalid" >&2; exit 65; }
CONTAINER_ID="$(docker inspect --format='{{.Id}}' "$CONTAINER")"
[ "$(docker inspect --format='{{.State.Running}}' "$CONTAINER_ID")" = true ] \
  && [ "$(docker inspect --format='{{.Image}}' "$CONTAINER_ID")" = "$MCP_IMAGE_ID" ] || {
  echo "official ScanSci MCP container is not running" >&2
  exit 69
}
node "$ACTIVE_ROOT/infra/scripts/verify-scansci-mcp-runtime.mjs" \
  --release-root "$ACTIVE_ROOT" --release-sha "$ACTIVE_SHA" \
  --compose-file "$ACTIVE_ROOT/infra/compose/docker-compose.prod.yml" \
  --expected-mcp-image-id "$MCP_IMAGE_ID" --require-worker 1 --require-oa 0 \
  >/dev/null

STAGED=0
cleanup_sensitive() {
  local cleanup_ok=1 running=""
  set +e
  if [ "$STAGED" -eq 1 ]; then
    if docker exec --user 10001:10001 "$CONTAINER_ID" sh -c \
      "if [ -e '$CONTAINER_IMPORT_DIR' ]; then rm -f -- '$CONTAINER_IMPORT_FILE' && rmdir -- '$CONTAINER_IMPORT_DIR'; fi; test ! -e '$CONTAINER_IMPORT_DIR'" \
      >/dev/null 2>&1; then
      STAGED=0
    else
      running="$(docker inspect --format='{{.State.Running}}' "$CONTAINER_ID" 2>/dev/null)"
      [ "$running" = false ] && STAGED=0 || cleanup_ok=0
    fi
  fi
  rm -f -- "$SOURCE_FILE" || cleanup_ok=0
  if [ "$cleanup_ok" -eq 1 ]; then
    rm -f -- "$HOST_IMPORT_ROOT/.cleanup-required"
  else
    (umask 077; : > "$HOST_IMPORT_ROOT/.cleanup-required")
  fi
  set -e
  [ "$cleanup_ok" -eq 1 ]
}
cleanup_on_exit() {
  local original_status=$?
  trap - EXIT INT TERM
  if cleanup_sensitive; then exit "$original_status"; fi
  echo "ScanSci cookie staging cleanup requires operator attention" >&2
  exit 70
}
trap cleanup_on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

docker exec -i --user 10001:10001 "$CONTAINER_ID" sh -c \
  "set -eu; umask 077; test ! -e '$CONTAINER_IMPORT_DIR'; mkdir -- '$CONTAINER_IMPORT_DIR'; cat > '$CONTAINER_IMPORT_FILE'; chmod 0600 '$CONTAINER_IMPORT_FILE'; test -s '$CONTAINER_IMPORT_FILE'" \
  < "$SOURCE_FILE"
STAGED=1

read -r -d '' IMPORT_PROGRAM <<'PY' || true
import asyncio
import json

from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client


async def main():
    async with streamable_http_client("http://127.0.0.1:8000/mcp") as streams:
        async with ClientSession(*streams) as session:
            await session.initialize()
            result = await session.call_tool(
                "scansci_pdf_login",
                {"kind":"cookie_import","cookie_file":"/tmp/scansci-cookie-import/netscape.txt"},
            )
            if result.is_error:
                raise SystemExit(1)
            texts = [item.text for item in result.content if getattr(item, "type", None) == "text"]
            if len(texts) != 1:
                raise SystemExit(1)
            payload = json.loads(texts[0])
            if not isinstance(payload.get("imported"), int) or payload["imported"] <= 0 or "error" in payload:
                raise SystemExit(1)


asyncio.run(main())
PY
IMPORT_PROGRAM_B64="$(printf '%s' "$IMPORT_PROGRAM" | base64 -w0)"
if ! docker exec --user 10001:10001 "$CONTAINER_ID" python -c \
  'import base64,sys;exec(base64.b64decode(sys.argv[1]))' "$IMPORT_PROGRAM_B64" \
  >/dev/null 2>&1; then
  echo "official ScanSci cookie import failed" >&2
  exit 65
fi

test "$(cat "$ACTIVE_MARKER")" = "$ACTIVE_SHA"
test "$(docker inspect --format='{{.Id}}' "$CONTAINER")" = "$CONTAINER_ID"
if ! cleanup_sensitive; then
  echo "ScanSci cookie staging cleanup requires operator attention" >&2
  exit 70
fi
trap - EXIT INT TERM
test ! -e "$SOURCE_FILE"
docker exec --user 10001:10001 "$CONTAINER_ID" test ! -e "$CONTAINER_IMPORT_DIR"
echo "SCANSCI_COOKIE_IMPORT_OK"
