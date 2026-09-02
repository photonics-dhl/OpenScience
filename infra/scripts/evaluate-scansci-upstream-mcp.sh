#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" != "--confirm" ] || [ "$#" -ne 1 ]; then
  echo "usage: $0 --confirm" >&2
  exit 64
fi

PYTHON_IMAGE="python:3.12-slim@sha256:7a8b475003c4fe15a2cd4e55e5cfc2f3560bdc9333d624f24cdd6d4340fd7a17"
SCANSCI_VERSION="1.13.1"
SCANSCI_WHEEL_SHA256="f68c30503834fc093eb192bd556090d210241eed48445017fdb3d32f6e1355e5"
SCANSCI_PORT="18081"
SUFFIX="${SCANSCI_EVAL_SUFFIX:-$(date -u +%Y%m%d%H%M%S)-$$}"
CONTAINER="openscience-eval-scansci-mcp-${SUFFIX}"
VOLUME="openscience-eval-scansci-mcp-${SUFFIX}"

case "$SUFFIX" in
  *[!a-zA-Z0-9_.-]*|'') echo "invalid evaluation suffix" >&2; exit 64 ;;
esac

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker volume rm "$VOLUME" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

if docker container inspect "$CONTAINER" >/dev/null 2>&1 || docker volume inspect "$VOLUME" >/dev/null 2>&1; then
  echo "evaluation identity already exists" >&2
  exit 73
fi

docker volume create "$VOLUME" >/dev/null

INSTALL_AND_RUN="set -eu; \
mkdir -p /tmp/scansci-wheel /data/papers; \
python -m pip download --disable-pip-version-check --no-cache-dir --no-deps --only-binary=:all: scansci-pdf==${SCANSCI_VERSION} -d /tmp/scansci-wheel; \
echo '${SCANSCI_WHEEL_SHA256}  /tmp/scansci-wheel/scansci_pdf-${SCANSCI_VERSION}-py3-none-any.whl' | sha256sum -c -; \
python -m pip install --disable-pip-version-check --no-cache-dir /tmp/scansci-wheel/scansci_pdf-${SCANSCI_VERSION}-py3-none-any.whl; \
exec scansci-pdf run --mode streamable_http --host 127.0.0.1 --port ${SCANSCI_PORT}"

docker run -d \
  --name "$CONTAINER" \
  --network host \
  --label org.openscience.role=scansci-mcp-evaluation \
  --label org.openscience.scansci.version="$SCANSCI_VERSION" \
  -e HTTP_PROXY=http://127.0.0.1:7891 \
  -e HTTPS_PROXY=http://127.0.0.1:7891 \
  -e NO_PROXY=localhost,127.0.0.1 \
  -e SCANSCI_PDF_PROXY=http://127.0.0.1:7891 \
  -e SCANSCI_PDF_DATA_DIR=/data \
  -v "$VOLUME:/data" \
  "$PYTHON_IMAGE" \
  sh -ec "$INSTALL_AND_RUN" >/dev/null

MCP_CLIENT_CODE=$(cat <<'PY'
import asyncio
import hashlib
import importlib.metadata
import json
import os
import stat
from pathlib import Path

from mcp import ClientSession
try:
    from mcp.client.streamable_http import streamable_http_client as connect_mcp
except ImportError:
    from mcp.client.streamable_http import streamablehttp_client as connect_mcp

EXPECTED = {
    "scansci_pdf_batch_download", "scansci_pdf_cache_clear",
    "scansci_pdf_channel_status", "scansci_pdf_citation",
    "scansci_pdf_config", "scansci_pdf_diagnostics",
    "scansci_pdf_download", "scansci_pdf_elsevier_setup",
    "scansci_pdf_expand_citations", "scansci_pdf_find",
    "scansci_pdf_login", "scansci_pdf_parse_list",
    "scansci_pdf_prepare_queue", "scansci_pdf_schools",
    "scansci_pdf_search", "scansci_pdf_tor", "scansci_pdf_zotero_push",
}


async def main():
    async with connect_mcp("http://127.0.0.1:18081/mcp") as streams:
        read_stream, write_stream = streams[0], streams[1]
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            listed = await session.list_tools()
            names = {tool.name for tool in listed.tools}
            missing = EXPECTED - names
            if missing:
                raise RuntimeError("expected MCP tools are missing")
            response = await session.call_tool(
                "scansci_pdf_download",
                {"identifier": "arXiv:2009.06045v1", "output_dir": "/data/papers"},
            )
            text_blocks = [block.text for block in response.content if hasattr(block, "text")]
            if len(text_blocks) != 1:
                raise RuntimeError("unexpected MCP result shape")
            result = json.loads(text_blocks[0])
            if result.get("success") is not True:
                raise RuntimeError("positive ScanSci download failed")
            root = Path("/data/papers").resolve()
            path = Path(result.get("file", ""))
            before = path.lstat()
            if not stat.S_ISREG(before.st_mode) or stat.S_ISLNK(before.st_mode):
                raise RuntimeError("ScanSci result is not a regular file")
            resolved = path.resolve(strict=True)
            resolved.relative_to(root)
            descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
            try:
                opened = os.fstat(descriptor)
                if (before.st_dev, before.st_ino) != (opened.st_dev, opened.st_ino):
                    raise RuntimeError("ScanSci result changed before open")
                size = opened.st_size
                if size < 5 or size > 100 * 1024 * 1024:
                    raise RuntimeError("ScanSci result size is invalid")
                with os.fdopen(descriptor, "rb", closefd=False) as source:
                    magic = source.read(5)
                    source.seek(0)
                    digest = hashlib.file_digest(source, "sha256").hexdigest()
            finally:
                os.close(descriptor)
            if magic != b"%PDF-":
                raise RuntimeError("ScanSci result is not a PDF")
            source_name = str(result.get("source", "")).strip()
            if not source_name or any(character in source_name for character in "\r\n"):
                raise RuntimeError("ScanSci source is invalid")
            print(f"SCANSCI_VERSION={importlib.metadata.version('scansci-pdf')}")
            print(f"SCANSCI_TOOLS={','.join(sorted(names))}")
            print(f"SCANSCI_SOURCE={source_name}")
            print("SCANSCI_PDF_MAGIC=%PDF-")
            print(f"SCANSCI_PDF_BYTES={size}")
            print(f"SCANSCI_PDF_SHA256={digest}")


asyncio.run(main())
PY
)

attempt=1
while [ "$attempt" -le 90 ]; do
  if output=$(docker exec "$CONTAINER" python -c "$MCP_CLIENT_CODE" 2>/dev/null); then
    printf '%s\n' "$output"
    exit 0
  fi
  if ! docker container inspect "$CONTAINER" >/dev/null 2>&1; then
    echo "ScanSci MCP evaluation container stopped" >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 2
done

echo "ScanSci MCP evaluation timed out" >&2
exit 1
