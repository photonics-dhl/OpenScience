"""Isolated, legal-only adapter around the pinned ScanSci downloader."""

from __future__ import annotations

from dataclasses import dataclass
import ipaddress
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
from typing import Any, Mapping, Sequence
from urllib.parse import urlsplit

from .policy import LegalDownloadRequest, PolicyError, validate_source_result


MAX_PDF_BYTES = 100 * 1024 * 1024
MAX_PROTOCOL_BYTES = 8 * 1024
WORKER_TIMEOUT_SECONDS = 60
MAX_SESSION_FILES = 16
MAX_SESSION_FILE_BYTES = 64 * 1024


class AcquisitionError(RuntimeError):
    """A stable failure code that is safe to expose to the internal caller."""

    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


@dataclass(frozen=True)
class AcquiredPdf:
    content: bytes
    route: str
    source: str
    source_url: str
    license: str | None = None
    entitlement_valid_until: str | None = None


class ScanSciAcquisitionClient:
    """Execute the pinned library in a fresh, proxy-free worker process."""

    def __init__(
        self,
        runtime_dir: Path,
        *,
        worker_command: Sequence[str] | None = None,
        maximum_pdf_bytes: int = MAX_PDF_BYTES,
        session_root: Path = Path("/session"),
    ):
        self._runtime_dir = runtime_dir.resolve()
        if session_root.exists() and session_root.is_symlink():
            raise ValueError("ScanSci session configuration is invalid")
        self._session_root = session_root.resolve()
        self._worker_command = tuple(worker_command or (sys.executable, str(Path(__file__).with_name("upstream_worker.py"))))
        if not self._worker_command or maximum_pdf_bytes <= 0 or maximum_pdf_bytes > MAX_PDF_BYTES:
            raise ValueError("ScanSci acquisition configuration is invalid")
        self._maximum_pdf_bytes = maximum_pdf_bytes

    def acquire(self, request: LegalDownloadRequest) -> AcquiredPdf:
        self._runtime_dir.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="scansci-legal-", dir=self._runtime_dir) as directory:
            output_dir = Path(directory).resolve()
            session_snapshot = _snapshot_session(self._session_root, output_dir / "session-snapshot") if request.institutional else None
            (output_dir / "config.json").write_text(
                json.dumps(_fixed_config(output_dir, session_snapshot), sort_keys=True, separators=(",", ":")),
                encoding="utf-8",
            )
            result = _run_worker(self._worker_command, request, output_dir)
            return _validated_result(
                result,
                request,
                output_dir,
                self._maximum_pdf_bytes,
                institutional_allowed=session_snapshot is not None and request.institutional,
            )


def _run_worker(command: Sequence[str], request: LegalDownloadRequest, output_dir: Path) -> object:
    protocol_path = output_dir / "worker-response.json"
    payload = json.dumps({"identifier": request.identifier, "output_dir": str(output_dir)}, separators=(",", ":")).encode("utf-8")
    with protocol_path.open("xb") as protocol:
        try:
            process = subprocess.Popen(list(command), stdin=subprocess.PIPE, stdout=protocol, stderr=subprocess.DEVNULL, cwd=output_dir, env=_sanitized_environment(output_dir))
            process.communicate(payload, timeout=WORKER_TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired as error:
            process.kill()
            process.wait()
            raise AcquisitionError("upstream_timeout") from error
        except OSError as error:
            raise AcquisitionError("upstream_unavailable") from error
    if process.returncode != 0:
        raise AcquisitionError("upstream_unavailable")
    try:
        data = _read_bounded_regular_file(protocol_path, output_dir, MAX_PROTOCOL_BYTES)
        return json.loads(data.decode("utf-8"), object_pairs_hook=_no_duplicate_keys)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
        raise AcquisitionError("upstream_unavailable") from error


def _sanitized_environment(output_dir: Path) -> dict[str, str]:
    environment = {"PATH": os.environ.get("PATH", ""), "PYTHONNOUSERSITE": "1", "PYTHONDONTWRITEBYTECODE": "1", "HOME": str(output_dir), "TMPDIR": str(output_dir), "TMP": str(output_dir), "TEMP": str(output_dir), "SCANSCI_PDF_DATA_DIR": str(output_dir)}
    if os.name == "nt":
        root = str(output_dir)
        drive = output_dir.drive
        environment.update({"USERPROFILE": root, "HOMEDRIVE": drive, "HOMEPATH": root[len(drive):] or "\\"})
    for key in ("SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "LANG", "LC_ALL", "TZ"):
        if value := os.environ.get(key):
            environment[key] = value
    return environment


def _fixed_config(output_dir: Path, session_snapshot: Path | None) -> dict[str, Any]:
    snapshot_root = session_snapshot or output_dir / "empty-session"
    return {
        "output_dir": str(output_dir), "cache_dir": str(output_dir / "cache"), "download_strategy": "legal_only",
        "scihub_enabled": False, "use_tor": False, "tor_proxy": "", "use_tor_for_scihub": False,
        "network_proxy": "", "proxy_pool": "", "batch_workers": 1, "parallel_sources": False,
        "parallel_probes": False, "connect_timeout": 15, "read_timeout": 30,
        "carsi_enabled": session_snapshot is not None,
        "carsi_idp_name": "浙江大学",
        "carsi_cookie_dir": str(snapshot_root / "carsi_cookies"),
        "chrome_profile_dir": str(snapshot_root / "chromium"),
        "auto_relogin": False,
    }


def _snapshot_session(session_root: Path, destination: Path) -> Path | None:
    cookie_root = session_root / "scansci" / "cache" / "carsi_cookies"
    try:
        _validate_session_directory(session_root)
        for parent in (session_root / "scansci", session_root / "scansci" / "cache", cookie_root):
            _validate_session_directory(parent)
        candidates = sorted(cookie_root.glob("*.json"))
        if not candidates or len(candidates) > MAX_SESSION_FILES:
            return None
        copied = [(candidate.name, _read_session_file(candidate)) for candidate in candidates]
    except (OSError, ValueError):
        return None
    target = destination / "carsi_cookies"
    target.mkdir(parents=True, mode=0o700)
    for name, content in copied:
        path = target / name
        descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        with os.fdopen(descriptor, "wb") as output:
            output.write(content)
    return destination


def _validate_session_directory(path: Path) -> None:
    details = os.lstat(path)
    if stat.S_ISLNK(details.st_mode) or not stat.S_ISDIR(details.st_mode):
        raise ValueError("unsafe session directory")
    if os.name != "nt":
        expected_uid = os.geteuid()
        if details.st_uid != expected_uid or stat.S_IMODE(details.st_mode) & 0o077:
            raise ValueError("unsafe session directory")


def _read_session_file(path: Path) -> bytes:
    before = os.lstat(path)
    if stat.S_ISLNK(before.st_mode) or not stat.S_ISREG(before.st_mode):
        raise ValueError("unsafe session file")
    if os.name != "nt":
        if before.st_uid != os.geteuid() or stat.S_IMODE(before.st_mode) != 0o600:
            raise ValueError("unsafe session file")
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0))
    try:
        opened = os.fstat(descriptor)
        if not stat.S_ISREG(opened.st_mode) or (before.st_dev, before.st_ino) != (opened.st_dev, opened.st_ino):
            raise ValueError("session file changed before open")
        with os.fdopen(descriptor, "rb", closefd=False) as source:
            content = source.read(MAX_SESSION_FILE_BYTES + 1)
        after = os.lstat(path)
        if (opened.st_dev, opened.st_ino) != (after.st_dev, after.st_ino):
            raise ValueError("session file changed during read")
    finally:
        os.close(descriptor)
    if len(content) > MAX_SESSION_FILE_BYTES:
        raise ValueError("session file exceeds bound")
    return content


def _validated_result(
    result: object,
    request: LegalDownloadRequest,
    output_dir: Path,
    maximum_pdf_bytes: int,
    *,
    institutional_allowed: bool,
) -> AcquiredPdf:
    if not isinstance(result, dict) or result.get("success") is not True:
        raise AcquisitionError(_failure_code(result))
    try:
        source = str(result.get("source", ""))
        route = _route_for_source(source)
        provenance = validate_source_result({"success": True, "route": route, "source": source})
        source_url = _source_url(result, request.identifier)
    except PolicyError as error:
        raise AcquisitionError("policy_blocked") from error
    if provenance.route == "institutional" and not institutional_allowed:
        raise AcquisitionError("auth_required")
    content = _read_result_pdf(result.get("file"), output_dir, maximum_pdf_bytes)
    license_value = result.get("license")
    if license_value is not None and (not isinstance(license_value, str) or not _safe_header_value(license_value)):
        raise AcquisitionError("policy_blocked")
    entitlement_valid_until = result.get("entitlement_valid_until")
    if entitlement_valid_until is not None and (not isinstance(entitlement_valid_until, str) or not _safe_header_value(entitlement_valid_until)):
        raise AcquisitionError("policy_blocked")
    return AcquiredPdf(content, provenance.route, provenance.source, source_url, license_value, entitlement_valid_until)


def _read_result_pdf(value: object, output_dir: Path, maximum_pdf_bytes: int) -> bytes:
    if not isinstance(value, str) or not value:
        raise AcquisitionError("invalid_pdf")
    try:
        content = _read_bounded_regular_file(Path(value), output_dir, maximum_pdf_bytes)
    except (OSError, ValueError) as error:
        raise AcquisitionError("invalid_pdf") from error
    if len(content) < 5 or not content.startswith(b"%PDF-"):
        raise AcquisitionError("invalid_pdf")
    return content


def _read_bounded_regular_file(path: Path, root: Path, maximum_bytes: int) -> bytes:
    if not path.is_absolute():
        raise ValueError("relative path is forbidden")
    resolved = path.resolve(strict=True)
    resolved.relative_to(root)
    before = os.lstat(path)
    if stat.S_ISLNK(before.st_mode) or not stat.S_ISREG(before.st_mode):
        raise ValueError("result is not a regular file")
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0))
    try:
        after = os.fstat(descriptor)
        if not stat.S_ISREG(after.st_mode) or (before.st_dev, before.st_ino) != (after.st_dev, after.st_ino):
            raise ValueError("result changed before open")
        with os.fdopen(descriptor, "rb", closefd=False) as file:
            content = file.read(maximum_bytes + 1)
    finally:
        os.close(descriptor)
    if len(content) > maximum_bytes:
        raise ValueError("result exceeds bound")
    return content


def _no_duplicate_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate protocol key")
        result[key] = value
    return result


def _route_for_source(source: str) -> str:
    for route in ("open_access", "publisher_api", "institutional"):
        try:
            validate_source_result({"success": True, "route": route, "source": source})
            return route
        except PolicyError:
            continue
    raise PolicyError("source is not allowlisted")


def _source_url(result: Mapping[str, object], identifier: str) -> str:
    candidate = result.get("url") or result.get("source_url")
    if not isinstance(candidate, str) or not candidate:
        candidate = f"https://arxiv.org/abs/{identifier.removeprefix('arXiv:')}" if identifier.lower().startswith("arxiv:") else f"https://doi.org/{identifier}"
    if not _safe_external_url(candidate):
        raise PolicyError("source URL is unsafe")
    return candidate


def _safe_external_url(value: str) -> bool:
    if not value.isascii() or len(value) > 2048 or any(not 32 <= ord(character) <= 126 for character in value):
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
    return value.isascii() and bool(value.strip()) and len(value) <= 256 and all(32 <= ord(character) <= 126 for character in value)


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
    if error_type == "upstream_unavailable":
        return "upstream_unavailable"
    return "not_found"
