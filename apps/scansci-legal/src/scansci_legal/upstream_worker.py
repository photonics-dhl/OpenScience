"""Subprocess entry point for the pinned ScanSci library; never an HTTP surface."""

from __future__ import annotations

from contextlib import redirect_stderr, redirect_stdout
import io
import json
import os
from pathlib import Path
import sys
from typing import Any


class _BoundedDiscard(io.TextIOBase):
    def __init__(self, limit: int = 4096):
        self._remaining = limit

    def write(self, value: str) -> int:
        self._remaining = max(0, self._remaining - len(value.encode("utf-8", errors="replace")))
        return len(value)


def main() -> None:
    try:
        request = json.load(sys.stdin)
        output_dir = Path(request["output_dir"]).resolve()
        if not output_dir.is_dir():
            raise ValueError("invalid worker request")
        if request.get("probe") == "environment":
            from scansci_pdf import config
            keys = ("HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "SCANSCI_PDF_DATA_DIR", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "SCANSCI_PDF_PROXY")
            response = {"home": str(Path.home()), "data_dir": str(config.DATA_DIR), "environment": {key: os.environ[key] for key in keys if key in os.environ}}
        else:
            identifier = request["identifier"]
            if not isinstance(identifier, str) or not (output_dir / "config.json").is_file():
                raise ValueError("invalid worker request")
            with redirect_stdout(_BoundedDiscard()), redirect_stderr(_BoundedDiscard()):
                from scansci_pdf.sources import download
                result = download(identifier, str(output_dir), scihub_enabled=False, use_tor=False, use_vpnsci=True, bibtex=False, rename=False, strategy="legal_only")
            response = _minimal_response(result)
    except Exception:
        response = {"success": False, "error_type": "upstream_unavailable"}
    sys.__stdout__.write(json.dumps(response, separators=(",", ":")))
    sys.__stdout__.flush()


def _minimal_response(result: object) -> dict[str, Any]:
    if not isinstance(result, dict) or result.get("success") is not True:
        error_type = result.get("error_type") if isinstance(result, dict) else "upstream_unavailable"
        return {"success": False, "error_type": error_type if isinstance(error_type, str) else "not_found"}
    return {"success": True, "file": result.get("file"), "source": result.get("source"), "url": result.get("url") or result.get("source_url"), "license": result.get("license"), "entitlement_valid_until": result.get("entitlement_valid_until")}


if __name__ == "__main__":
    main()
