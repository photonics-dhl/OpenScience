"""Narrow, legal-only adapter around the pinned ScanSci downloader."""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
import ipaddress
import json
from pathlib import Path
import threading
import tempfile
from typing import Any, Callable, Iterator
from urllib.parse import urlsplit

from .policy import LegalDownloadRequest, PolicyError, validate_source_result


DownloadFunction = Callable[..., dict[str, Any]]


class AcquisitionError(RuntimeError):
    """A stable failure code that is safe to expose to the internal caller."""

    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


@dataclass(frozen=True)
class AcquiredPdf:
    file_path: Path
    route: str
    source: str
    source_url: str
    license: str | None = None
    entitlement_valid_until: str | None = None


class ScanSciAcquisitionClient:
    """Call only ``scansci_pdf.sources.download`` with an immutable safe policy."""

    def __init__(self, runtime_dir: Path, *, download_function: DownloadFunction | None = None):
        self._runtime_dir = runtime_dir.resolve()
        self._download_function = download_function or _pinned_download_function()
        self._upstream_lock = threading.Lock()

    def acquire(self, request: LegalDownloadRequest) -> AcquiredPdf:
        self._runtime_dir.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="scansci-legal-", dir=self._runtime_dir) as directory:
            output_dir = Path(directory).resolve()
            fixed_config = _fixed_config(output_dir, self._runtime_dir)
            (output_dir / "scansci-legal-config.json").write_text(
                json.dumps(fixed_config, sort_keys=True, separators=(",", ":")), encoding="utf-8"
            )
            try:
                with self._upstream_lock, _fixed_upstream_globals(self._download_function, fixed_config, output_dir):
                    result = self._download_function(
                        request.identifier,
                        str(output_dir),
                        scihub_enabled=False,
                        use_tor=False,
                        use_vpnsci=True,
                        bibtex=False,
                        rename=False,
                        strategy="legal_only",
                    )
            except AcquisitionError:
                raise
            except TimeoutError as error:
                raise AcquisitionError("upstream_timeout") from error
            except Exception as error:
                raise AcquisitionError("upstream_unavailable") from error
            return _validated_result(result, request, output_dir)


def _pinned_download_function() -> DownloadFunction:
    try:
        from scansci_pdf.sources import download
    except Exception as error:
        raise AcquisitionError("upstream_unavailable") from error
    return download


def _fixed_config(output_dir: Path, runtime_dir: Path) -> dict[str, Any]:
    return {
        "output_dir": str(output_dir),
        "cache_dir": str(output_dir / "cache"),
        "download_strategy": "legal_only",
        "scihub_enabled": False,
        "use_tor": False,
        "tor_proxy": "",
        "use_tor_for_scihub": False,
        "network_proxy": "",
        "proxy_pool": "",
        "batch_workers": 1,
        "parallel_sources": False,
        "parallel_probes": False,
        "connect_timeout": 15,
        "read_timeout": 30,
        "carsi_enabled": True,
        "carsi_idp_name": "浙江大学",
        "carsi_cookie_dir": str(runtime_dir),
        "auto_relogin": False,
    }


@contextmanager
def _fixed_upstream_globals(download_function: DownloadFunction, config: dict[str, Any], output_dir: Path) -> Iterator[None]:
    """Keep the upstream import in-process while replacing its unsafe defaults."""
    globals_dict = getattr(download_function, "__globals__", None)
    if not isinstance(globals_dict, dict) or "load_config" not in globals_dict:
        yield
        return
    previous_loader = globals_dict["load_config"]
    previous_data_dir = globals_dict.get("DATA_DIR")
    globals_dict["load_config"] = lambda: dict(config)
    if previous_data_dir is not None:
        globals_dict["DATA_DIR"] = output_dir
    try:
        yield
    finally:
        globals_dict["load_config"] = previous_loader
        if previous_data_dir is not None:
            globals_dict["DATA_DIR"] = previous_data_dir


def _validated_result(result: object, request: LegalDownloadRequest, output_dir: Path) -> AcquiredPdf:
    if not isinstance(result, dict) or result.get("success") is not True:
        raise AcquisitionError(_failure_code(result))
    try:
        source = str(result.get("source", ""))
        route = _route_for_source(source)
        provenance = validate_source_result({"success": True, "route": route, "source": source})
        source_url = _source_url(result, request.identifier)
    except PolicyError as error:
        raise AcquisitionError("policy_blocked") from error
    file_path = _safe_result_path(result.get("file"), output_dir)
    license_value = result.get("license")
    if license_value is not None and (not isinstance(license_value, str) or not _safe_header_value(license_value)):
        raise AcquisitionError("policy_blocked")
    entitlement_valid_until = result.get("entitlement_valid_until")
    if entitlement_valid_until is not None and (not isinstance(entitlement_valid_until, str) or not _safe_header_value(entitlement_valid_until)):
        raise AcquisitionError("policy_blocked")
    return AcquiredPdf(file_path, provenance.route, provenance.source, source_url, license_value, entitlement_valid_until)


def _route_for_source(source: str) -> str:
    for route in ("open_access", "publisher_api", "institutional"):
        try:
            validate_source_result({"success": True, "route": route, "source": source})
            return route
        except PolicyError:
            continue
    raise PolicyError("source is not allowlisted")


def _source_url(result: dict[str, Any], identifier: str) -> str:
    candidate = result.get("url") or result.get("source_url")
    if not isinstance(candidate, str) or not candidate:
        candidate = f"https://arxiv.org/abs/{identifier.removeprefix('arXiv:')}" if identifier.lower().startswith("arxiv:") else f"https://doi.org/{identifier}"
    if not _safe_external_url(candidate):
        raise PolicyError("source URL is unsafe")
    return candidate


def _safe_result_path(value: object, output_dir: Path) -> Path:
    if not isinstance(value, str) or not value:
        raise AcquisitionError("invalid_pdf")
    candidate = Path(value)
    try:
        resolved = candidate.resolve(strict=True)
        resolved.relative_to(output_dir)
    except (OSError, RuntimeError, ValueError) as error:
        raise AcquisitionError("invalid_pdf") from error
    if candidate.is_symlink() or not resolved.is_file():
        raise AcquisitionError("invalid_pdf")
    return resolved


def _safe_external_url(value: str) -> bool:
    if not value.isascii() or len(value) > 2048 or any(character.isspace() or ord(character) < 32 for character in value):
        return False
    try:
        parsed = urlsplit(value)
    except ValueError:
        return False
    if parsed.scheme != "https" or not parsed.hostname or parsed.username is not None or parsed.password is not None:
        return False
    hostname = parsed.hostname.rstrip(".").lower()
    if hostname == "localhost":
        return False
    try:
        return ipaddress.ip_address(hostname).is_global
    except ValueError:
        return "." in hostname and all(part and len(part) <= 63 for part in hostname.split("."))


def _safe_header_value(value: str) -> bool:
    return value.isascii() and bool(value.strip()) and len(value) <= 256 and "\r" not in value and "\n" not in value


def _failure_code(result: object) -> str:
    if not isinstance(result, dict):
        return "upstream_unavailable"
    status = result.get("status_code")
    error_type = str(result.get("error_type", "")).lower()
    action = str(result.get("action", "")).lower()
    if action == "login_required" or error_type in {"auth_required", "login_required"}:
        return "auth_required"
    if error_type in {"paywall", "not_entitled"}:
        return "not_entitled"
    if status == 429 or error_type == "rate_limited":
        return "rate_limited"
    if error_type in {"timeout", "upstream_timeout"}:
        return "upstream_timeout"
    if error_type in {"not_found", "no_pdf"}:
        return "not_found"
    return "not_found"
