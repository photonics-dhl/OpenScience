"""Subprocess entry point for the pinned ScanSci library; never an HTTP surface."""

from __future__ import annotations

from contextlib import redirect_stderr, redirect_stdout
import io
import ipaddress
import json
import os
from pathlib import Path
import socket
import sys
from typing import Any
from urllib.parse import urlsplit


def _require_public_https_url(value: str) -> str:
    try:
        parsed = urlsplit(value)
    except ValueError as error:
        raise OSError("upstream URL is forbidden") from error
    if parsed.scheme != "https" or not parsed.hostname or parsed.username is not None or parsed.password is not None:
        raise OSError("upstream URL is forbidden")
    hostname = parsed.hostname.rstrip(".").lower()
    if hostname == "localhost" or hostname.endswith(".localhost") or hostname.endswith(".local"):
        raise OSError("upstream URL is forbidden")
    try:
        address = ipaddress.ip_address(hostname)
        if not address.is_global or address.is_multicast:
            raise OSError("upstream URL is forbidden")
    except ValueError:
        if "." not in hostname or any(not part or len(part) > 63 for part in hostname.split(".")):
            raise OSError("upstream URL is forbidden")
    return value


def _guarded_getaddrinfo(
    host: object,
    port: object,
    family: int = 0,
    type: int = 0,
    proto: int = 0,
    flags: int = 0,
    *,
    resolver=socket.getaddrinfo,
):
    if port not in (None, 0, 443, "https"):
        raise OSError("upstream port is forbidden")
    records = resolver(host, port, family, type, proto, flags)
    if not records:
        raise OSError("upstream DNS result is empty")
    for record in records:
        try:
            address = ipaddress.ip_address(record[4][0].split("%", 1)[0])
        except (IndexError, TypeError, ValueError) as error:
            raise OSError("upstream DNS result is invalid") from error
        if not address.is_global or address.is_multicast:
            raise OSError("upstream DNS result is forbidden")
    return records


def _install_network_guard() -> None:
    original_getaddrinfo = socket.getaddrinfo
    if getattr(original_getaddrinfo, "_scansci_legal_guard", False):
        return

    def guarded_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
        return _guarded_getaddrinfo(
            host, port, family, type, proto, flags, resolver=original_getaddrinfo,
        )

    guarded_getaddrinfo._scansci_legal_guard = True  # type: ignore[attr-defined]
    socket.getaddrinfo = guarded_getaddrinfo

    try:
        import requests
    except ImportError as error:
        raise RuntimeError("requests runtime is unavailable") from error
    original_send = requests.sessions.Session.send
    if getattr(original_send, "_scansci_legal_guard", False):
        return

    def guarded_send(session, request, **kwargs):
        _require_public_https_url(request.url)
        return original_send(session, request, **kwargs)

    guarded_send._scansci_legal_guard = True  # type: ignore[attr-defined]
    requests.sessions.Session.send = guarded_send


class _BoundedDiscard(io.TextIOBase):
    def __init__(self, limit: int = 4096):
        self._remaining = limit

    def write(self, value: str) -> int:
        self._remaining = max(0, self._remaining - len(value.encode("utf-8", errors="replace")))
        return len(value)


def main() -> None:
    try:
        _install_network_guard()
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
