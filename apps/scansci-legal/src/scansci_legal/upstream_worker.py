"""Subprocess entry point for the pinned ScanSci library; never an HTTP surface."""

from __future__ import annotations

from contextlib import redirect_stderr, redirect_stdout
import ast
import io
import ipaddress
import inspect
import json
import os
from pathlib import Path
import re
import socket
import sys
import textwrap
import time
from typing import Any
from urllib.parse import urlsplit


_NAT64_WELL_KNOWN = ipaddress.IPv6Network("64:ff9b::/96")
_NAT64_LOCAL_USE = ipaddress.IPv6Network("64:ff9b:1::/48")
_SERIAL_SOURCE_LIMIT = 64
_PARALLEL_RUNNER_PARAMETERS = (
    "tiers", "doi", "target_dir", "output_path", "config", "use_tor", "overall_timeout",
)
_GREY_SOURCE_LABEL = re.compile(r"sci[\s._-]*hub|lib[\s._-]*gen|scibban|(?:^|[\s._-])tor(?:$|[\s._-])", re.IGNORECASE)


def _is_public_network_address(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    if isinstance(address, ipaddress.IPv6Address):
        if address in _NAT64_LOCAL_USE:
            return False
        embedded: list[ipaddress.IPv4Address] = []
        if address in _NAT64_WELL_KNOWN:
            embedded.append(ipaddress.IPv4Address(int(address) & 0xFFFFFFFF))
        if address.ipv4_mapped is not None:
            embedded.append(address.ipv4_mapped)
        if address.sixtofour is not None:
            embedded.append(address.sixtofour)
        if address.teredo is not None:
            embedded.extend(address.teredo)
        if any(not candidate.is_global or candidate.is_multicast for candidate in embedded):
            return False
    return address.is_global and not address.is_multicast


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
        if not _is_public_network_address(address):
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
        if not _is_public_network_address(address):
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


def _parallel_runner_is_compatible(function: object, source_reader=inspect.getsource) -> bool:
    if not callable(function):
        return False
    try:
        signature = inspect.signature(function)
        if tuple(signature.parameters) != _PARALLEL_RUNNER_PARAMETERS:
            return False
        if any(
            parameter.kind is not inspect.Parameter.POSITIONAL_OR_KEYWORD
            or parameter.default is not inspect.Parameter.empty
            for parameter in signature.parameters.values()
        ):
            return False
        tree = ast.parse(textwrap.dedent(source_reader(function)))
    except (OSError, TypeError, ValueError, SyntaxError):
        return False
    definitions = [node for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))]
    if len(definitions) < 1 or definitions[0].name != "_run_tiers_parallel":
        return False
    names = {node.id for node in ast.walk(definitions[0]) if isinstance(node, ast.Name)}
    attributes = {node.attr for node in ast.walk(definitions[0]) if isinstance(node, ast.Attribute)}
    return (
        {"ThreadPoolExecutor", "_try_source", "safe_filename"} <= names
        and {"Lock", "Event", "submit", "wait", "shutdown"} <= attributes
        and sum(isinstance(node, (ast.For, ast.comprehension)) for node in ast.walk(definitions[0])) >= 2
    )


def _validate_legal_source_config(config: object, use_tor: object) -> dict[str, Any]:
    if not isinstance(config, dict) or use_tor is not False:
        raise RuntimeError("ScanSci legal source policy drifted")
    expected = {
        "download_strategy": "legal_only",
        "scihub_enabled": False,
        "use_tor": False,
        "use_tor_for_scihub": False,
        "network_proxy": "",
        "proxy_pool": "",
        "batch_workers": 1,
        "parallel_sources": False,
        "parallel_probes": False,
    }
    if any(config.get(key) != value or isinstance(config.get(key), bool) != isinstance(value, bool) for key, value in expected.items()):
        raise RuntimeError("ScanSci legal source policy drifted")
    return config


def _serial_source_tiers(module: object, tiers: object, doi: object, target_dir: object) -> list[tuple[object, str, str, int, Path]]:
    if not isinstance(tiers, list) or not isinstance(doi, str) or not doi or not isinstance(target_dir, Path):
        raise RuntimeError("ScanSci legal source contract drifted")
    safe_name = module.safe_filename(doi)
    if not isinstance(safe_name, str) or not safe_name or Path(safe_name).name != safe_name:
        raise RuntimeError("ScanSci legal source contract drifted")
    flattened: list[tuple[object, str, str, int, Path]] = []
    for tier in tiers:
        if not isinstance(tier, tuple) or len(tier) != 3:
            raise RuntimeError("ScanSci legal source contract drifted")
        sources, tier_label, tier_timeout = tier
        if not isinstance(sources, list) or not isinstance(tier_label, str) or not tier_label:
            raise RuntimeError("ScanSci legal source contract drifted")
        if isinstance(tier_timeout, bool) or not isinstance(tier_timeout, int) or tier_timeout <= 0:
            raise RuntimeError("ScanSci legal source contract drifted")
        for source in sources:
            if not isinstance(source, tuple) or len(source) != 2:
                raise RuntimeError("ScanSci legal source contract drifted")
            function, label = source
            if not callable(function) or not isinstance(label, str) or not label or len(label) > 128:
                raise RuntimeError("ScanSci legal source contract drifted")
            if Path(label).name != label or _GREY_SOURCE_LABEL.search(label):
                raise RuntimeError("ScanSci legal source policy drifted")
            flattened.append((function, label, tier_label, tier_timeout, target_dir / f"{safe_name}_{label}.pdf"))
            if len(flattened) > _SERIAL_SOURCE_LIMIT:
                raise RuntimeError("ScanSci legal source contract drifted")
    return flattened


def _remove_source_temp(path: Path, output_path: Path) -> None:
    if path == output_path or not os.path.lexists(path):
        return
    if path.is_dir() and not path.is_symlink():
        raise RuntimeError("ScanSci legal source temp path drifted")
    path.unlink(missing_ok=True)


def _install_serial_legal_source_override(module: object, *, source_reader=inspect.getsource) -> None:
    original = getattr(module, "_run_tiers_parallel", None)
    if getattr(original, "_scansci_serial_legal", False):
        return
    if not _parallel_runner_is_compatible(original, source_reader):
        raise RuntimeError("ScanSci parallel source contract drifted")
    if not callable(getattr(module, "_try_source", None)) or not callable(getattr(module, "safe_filename", None)):
        raise RuntimeError("ScanSci legal source helpers drifted")

    def serial_legal_sources(tiers, doi, target_dir, output_path, config, use_tor, overall_timeout):
        fixed_config = _validate_legal_source_config(config, use_tor)
        if isinstance(overall_timeout, bool) or not isinstance(overall_timeout, int) or overall_timeout <= 0:
            raise RuntimeError("ScanSci legal source timeout drifted")
        target = Path(target_dir).resolve()
        output = Path(output_path).resolve()
        if output.parent != target:
            raise RuntimeError("ScanSci legal source output drifted")
        sources = _serial_source_tiers(module, tiers, doi, target)
        deadline = time.monotonic() + overall_timeout
        try:
            current_tier = None
            tier_deadline = deadline
            for function, label, tier_label, tier_timeout, source_output in sources:
                if tier_label != current_tier:
                    current_tier = tier_label
                    tier_deadline = min(deadline, time.monotonic() + tier_timeout)
                if time.monotonic() >= deadline or time.monotonic() >= tier_deadline:
                    continue
                _remove_source_temp(source_output, output)
                try:
                    result = module._try_source(
                        function, doi, source_output, fixed_config, label, use_tor=False,
                    )
                except Exception:
                    result = None
                if result and isinstance(result, dict) and result.get("success") is True:
                    final_path = Path(result.get("file", ""))
                    if final_path != output and final_path.exists():
                        output.parent.mkdir(parents=True, exist_ok=True)
                        output.unlink(missing_ok=True)
                        final_path.rename(output)
                        result["file"] = str(output)
                    return result
                _remove_source_temp(source_output, output)
            return None
        finally:
            for *_details, source_output in sources:
                _remove_source_temp(source_output, output)

    serial_legal_sources._scansci_serial_legal = True  # type: ignore[attr-defined]
    module._run_tiers_parallel = serial_legal_sources


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
                from scansci_pdf import sources
                _install_serial_legal_source_override(sources)
                result = sources.download(identifier, str(output_dir), scihub_enabled=False, use_tor=False, use_vpnsci=True, bibtex=False, rename=False, strategy="legal_only")
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
