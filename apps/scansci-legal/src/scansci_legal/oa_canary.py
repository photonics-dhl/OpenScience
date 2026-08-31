"""Bounded real-path OA acquisition canary for prepublication deployment."""

from __future__ import annotations

import json
import os
import sys
from typing import Any
import urllib.request

from .limits import MAX_PDF_BYTES
from .main import load_service_token


IDENTIFIER = "arXiv:2009.06045v1"


def build_request_payload() -> dict[str, object]:
    return {
        "identifier": IDENTIFIER,
        "strategy": "legal_only",
        "scihub": False,
        "tor": False,
        "institutional": True,
        "subject_id": "0" * 64,
    }


def inspect_pdf_response(response: Any) -> dict[str, object]:
    content_type = response.headers.get_content_type()
    route = response.headers.get("X-ScanSci-Route")
    size = 0
    magic = b""
    while True:
        chunk = response.read(65536)
        if not chunk:
            break
        if len(magic) < 5:
            magic = (magic + chunk)[:5]
        size += len(chunk)
        if size > MAX_PDF_BYTES:
            raise RuntimeError("OA canary PDF is too large")
    if content_type != "application/pdf" or route != "open_access" or magic != b"%PDF-" or size < 6:
        raise RuntimeError("OA canary response is invalid")
    return {
        "identifier": IDENTIFIER,
        "route": route,
        "contentType": content_type,
        "magic": magic.decode("ascii", errors="strict"),
        "bytes": size,
    }


def main() -> None:
    token = load_service_token(os.environ)
    payload = json.dumps(build_request_payload(), separators=(",", ":")).encode("ascii")
    request = urllib.request.Request(
        "http://127.0.0.1:8080/v1/legal-download",
        data=payload,
        method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=75) as response:
        result = inspect_pdf_response(response)
    sys.stdout.write(json.dumps(result, separators=(",", ":")))
    sys.stdout.flush()


if __name__ == "__main__":
    main()
