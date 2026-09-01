"""Owner-separated filesystem protocol for institutional browser jobs."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import stat
import time
from typing import Any
from urllib.parse import urlsplit
from uuid import uuid4

from .limits import (
    MAX_BROWSER_COOKIE_BYTES,
    MAX_BROWSER_MANIFEST_BYTES,
    MAX_BROWSER_PROOF_BYTES,
    MAX_PDF_BYTES,
)
from .policy import DOI_OR_ARXIV


BROWSER_JOB_TIMEOUT_SECONDS = 210
ACK_CLEANUP_TIMEOUT_SECONDS = 5
BROWSER_UID = 10002
SHARED_GID = 11000
MAX_BROWSER_COOKIES = 64
JOB_ID = re.compile(r"^[0-9a-f]{32}$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")
PROOF_KEYS = frozenset({
    "http_status", "mime", "final_url", "source", "byte_count", "sha256",
})
PROOF_ENVELOPE_KEYS = frozenset({"schema", "job_id", "identifier", "proof"})
MANIFEST_KEYS = frozenset({"schema", "job_id", "identifier"})
FAILURE_KEYS = frozenset({"schema", "job_id", "identifier", "error"})
ALLOWED_BROWSER_FAILURES = frozenset({
    "browser_auth_required",
    "browser_policy_blocked",
    "browser_timeout",
    "browser_worker_crash",
})
COOKIE_KEYS = frozenset({
    "name", "value", "url", "domain", "path", "expires", "httpOnly",
    "secure", "sameSite", "rest", "port", "port_specified",
    "domain_specified", "domain_initial_dot", "path_specified", "discard",
    "comment", "comment_url", "rfc2109", "version",
})
ALLOWED_INSTITUTIONAL_HOST_SUFFIXES = (
    "elsevier.com", "sciencedirect.com", "elsevierusercontent.com",
)


class BrowserProtocolError(RuntimeError):
    """Stable, non-secret failure raised at the browser job boundary."""

    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


@dataclass(frozen=True)
class BrowserProof:
    http_status: int
    mime: str
    final_url: str
    source: str
    byte_count: int
    sha256: str


@dataclass(frozen=True)
class BrowserResult:
    content: bytes
    proof: BrowserProof


class BrowserJobClient:
    """Publish legal-owned inputs and consume browser-owned outputs."""

    def __init__(
        self,
        input_root: Path = Path("/browser-inputs"),
        output_root: Path = Path("/browser-outputs"),
        *,
        timeout_seconds: float = BROWSER_JOB_TIMEOUT_SECONDS,
        cleanup_timeout_seconds: float = ACK_CLEANUP_TIMEOUT_SECONDS,
        poll_interval_seconds: float = 0.05,
        expected_browser_uid: int | None = BROWSER_UID,
        expected_shared_gid: int | None = SHARED_GID,
    ):
        if not 0 < timeout_seconds <= BROWSER_JOB_TIMEOUT_SECONDS:
            raise ValueError("invalid browser timeout")
        if not 0 < poll_interval_seconds <= 1:
            raise ValueError("invalid browser poll interval")
        if not 0 < cleanup_timeout_seconds <= 10:
            raise ValueError("invalid browser cleanup timeout")
        self._input_root = _validated_root(input_root)
        self._output_root = _validated_root(output_root)
        if self._input_root == self._output_root:
            raise ValueError("browser job roots must be separate")
        self._timeout_seconds = float(timeout_seconds)
        self._cleanup_timeout_seconds = float(cleanup_timeout_seconds)
        self._poll_interval_seconds = float(poll_interval_seconds)
        self._expected_browser_uid = expected_browser_uid
        self._expected_shared_gid = expected_shared_gid

    def submit(self, identifier: str, cookie_json: bytes) -> BrowserResult:
        _validate_identifier(identifier)
        _validate_cookie_snapshot(cookie_json)
        job_id = uuid4().hex
        input_job = self._input_root / job_id
        output_job = self._output_root / job_id
        deadline = time.monotonic() + self._timeout_seconds
        published = False
        try:
            input_job.mkdir(mode=0o750)
            _set_group(input_job, self._expected_shared_gid)
            _write_atomic(input_job / "cookies.json", cookie_json, 0o640, self._expected_shared_gid)
            manifest = json.dumps(
                {"schema": 1, "job_id": job_id, "identifier": identifier},
                sort_keys=True,
                separators=(",", ":"),
            ).encode("ascii")
            if len(manifest) > MAX_BROWSER_MANIFEST_BYTES:
                raise BrowserProtocolError("invalid_browser_job")
            _write_atomic(input_job / "job.json", manifest, 0o640, self._expected_shared_gid)
            _fsync_directory(input_job)
            published = True

            while time.monotonic() < deadline:
                proof_path = output_job / "proof.json"
                pdf_path = output_job / "document.pdf"
                failure_path = output_job / "failure.json"
                if failure_path.exists():
                    try:
                        error_code = validate_browser_failure(
                            job_id,
                            failure_path,
                            output_root=self._output_root,
                            identifier=identifier,
                            expected_browser_uid=self._expected_browser_uid,
                            expected_shared_gid=self._expected_shared_gid,
                        )
                    except BrowserProtocolError:
                        self._acknowledge(input_job, "rejected")
                        raise
                    self._acknowledge(input_job, "rejected")
                    raise BrowserProtocolError(error_code)
                if proof_path.exists() and pdf_path.exists():
                    try:
                        result = validate_browser_result(
                            job_id,
                            proof_path,
                            pdf_path,
                            output_root=self._output_root,
                            identifier=identifier,
                            expected_browser_uid=self._expected_browser_uid,
                            expected_shared_gid=self._expected_shared_gid,
                        )
                    except BrowserProtocolError:
                        self._acknowledge(input_job, "rejected")
                        raise
                    self._acknowledge(input_job, "consumed")
                    return result
                time.sleep(self._poll_interval_seconds)
            if output_job.exists():
                self._acknowledge(input_job, "rejected")
            raise BrowserProtocolError("browser_timeout")
        except BrowserProtocolError:
            raise
        except (OSError, UnicodeError, ValueError) as error:
            raise BrowserProtocolError("invalid_browser_job") from error
        finally:
            if published or input_job.exists():
                _remove_input_job(input_job, self._input_root)

    def _acknowledge(self, input_job: Path, status_value: str) -> None:
        payload = json.dumps(
            {"status": status_value}, sort_keys=True, separators=(",", ":"),
        ).encode("ascii")
        _write_atomic(input_job / "ack.json", payload, 0o640, self._expected_shared_gid)
        output_job = self._output_root / input_job.name
        cleanup_deadline = time.monotonic() + self._cleanup_timeout_seconds
        while output_job.exists() and time.monotonic() < cleanup_deadline:
            time.sleep(self._poll_interval_seconds)
        if output_job.exists():
            raise BrowserProtocolError("browser_timeout")


def validate_browser_result(
    job_id: str,
    proof_path: Path,
    pdf_path: Path,
    *,
    output_root: Path,
    identifier: str,
    expected_browser_uid: int | None = BROWSER_UID,
    expected_shared_gid: int | None = SHARED_GID,
) -> BrowserResult:
    """Independently validate proof and bytes without mutating browser output."""

    try:
        if not isinstance(job_id, str) or not JOB_ID.fullmatch(job_id):
            raise ValueError("invalid job id")
        _validate_identifier(identifier)
        root = _validated_root(output_root)
        job_root = root / job_id
        _require_exact_output_paths(proof_path, pdf_path, job_root)
        if _supports_directory_fds():
            proof_bytes, content = _read_result_pair_posix(
                root, job_id, expected_browser_uid, expected_shared_gid,
            )
        else:
            _validate_output_job_path(job_root, root, expected_browser_uid, expected_shared_gid)
            proof_bytes = _read_owned_regular(
                proof_path,
                job_root / "proof.json",
                root,
                MAX_BROWSER_PROOF_BYTES,
                expected_browser_uid,
                expected_shared_gid,
            )
            content = _read_owned_regular(
                pdf_path,
                job_root / "document.pdf",
                root,
                MAX_PDF_BYTES,
                expected_browser_uid,
                expected_shared_gid,
            )
        raw = json.loads(proof_bytes.decode("ascii"), object_pairs_hook=_no_duplicate_keys)
        proof_payload = _validate_proof_envelope(raw, job_id, identifier)
        proof = _validate_proof(proof_payload, content)
        return BrowserResult(content, proof)
    except BrowserProtocolError:
        raise
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError, TypeError, RecursionError) as error:
        raise BrowserProtocolError("invalid_browser_result") from error


def validate_browser_failure(
    job_id: str,
    failure_path: Path,
    *,
    output_root: Path,
    identifier: str,
    expected_browser_uid: int | None = BROWSER_UID,
    expected_shared_gid: int | None = SHARED_GID,
) -> str:
    """Validate a browser-owned terminal failure with the same owner boundary."""

    try:
        if not isinstance(job_id, str) or not JOB_ID.fullmatch(job_id):
            raise ValueError("invalid job id")
        _validate_identifier(identifier)
        root = _validated_root(output_root)
        job_root = root / job_id
        candidate = Path(failure_path)
        if not candidate.is_absolute() or candidate != job_root / "failure.json":
            raise ValueError("unexpected browser failure path")
        if _supports_directory_fds():
            failure_bytes = _read_failure_posix(
                root, job_id, expected_browser_uid, expected_shared_gid,
            )
        else:
            _validate_output_job_path(job_root, root, expected_browser_uid, expected_shared_gid)
            failure_bytes = _read_owned_regular(
                candidate,
                job_root / "failure.json",
                root,
                MAX_BROWSER_PROOF_BYTES,
                expected_browser_uid,
                expected_shared_gid,
            )
        value = json.loads(failure_bytes.decode("ascii"), object_pairs_hook=_no_duplicate_keys)
        if not isinstance(value, dict) or set(value) != FAILURE_KEYS:
            raise ValueError("invalid failure envelope")
        if value["schema"] != 1 or value["job_id"] != job_id or value["identifier"] != identifier:
            raise ValueError("failure envelope mismatch")
        error_code = value["error"]
        if not isinstance(error_code, str) or error_code not in ALLOWED_BROWSER_FAILURES:
            raise ValueError("invalid failure code")
        return error_code
    except BrowserProtocolError:
        raise
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError, TypeError, RecursionError) as error:
        raise BrowserProtocolError("invalid_browser_result") from error


def _validate_proof_envelope(value: object, job_id: str, identifier: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != PROOF_ENVELOPE_KEYS:
        raise ValueError("invalid proof envelope")
    schema = value["schema"]
    result_job_id = value["job_id"]
    result_identifier = value["identifier"]
    if isinstance(schema, bool) or schema != 1:
        raise ValueError("invalid proof schema version")
    if not isinstance(result_job_id, str) or not hmac.compare_digest(result_job_id, job_id):
        raise ValueError("proof job mismatch")
    if not isinstance(result_identifier, str) or not hmac.compare_digest(result_identifier, identifier):
        raise ValueError("proof identifier mismatch")
    proof = value["proof"]
    if not isinstance(proof, dict):
        raise ValueError("invalid proof payload")
    return proof


def _validate_proof(value: object, content: bytes) -> BrowserProof:
    if not isinstance(value, dict) or set(value) != PROOF_KEYS:
        raise ValueError("invalid proof schema")
    status_value = value["http_status"]
    byte_count = value["byte_count"]
    if isinstance(status_value, bool) or not isinstance(status_value, int) or not 200 <= status_value <= 299:
        raise ValueError("invalid proof status")
    if value["mime"] != "application/pdf":
        raise ValueError("invalid proof mime")
    if value["source"] != "CARSI-Browser":
        raise ValueError("invalid proof source")
    final_url = value["final_url"]
    if not isinstance(final_url, str) or not _allowed_institutional_url(final_url):
        raise ValueError("invalid proof URL")
    if isinstance(byte_count, bool) or not isinstance(byte_count, int) or byte_count != len(content):
        raise ValueError("invalid proof byte count")
    digest = value["sha256"]
    if not isinstance(digest, str) or not SHA256.fullmatch(digest):
        raise ValueError("invalid proof digest")
    if len(content) < 5 or not content.startswith(b"%PDF-"):
        raise ValueError("invalid PDF magic")
    if not hmac.compare_digest(hashlib.sha256(content).hexdigest(), digest):
        raise ValueError("invalid PDF digest")
    return BrowserProof(status_value, "application/pdf", final_url, "CARSI-Browser", byte_count, digest)


def _allowed_institutional_url(value: str) -> bool:
    if not value.isascii() or len(value) > 2048 or any(not 32 <= ord(character) <= 126 for character in value):
        return False
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError:
        return False
    if parsed.scheme != "https" or not parsed.hostname or parsed.username is not None or parsed.password is not None:
        return False
    if port not in (None, 443):
        return False
    hostname = parsed.hostname.rstrip(".").lower()
    return any(hostname == suffix or hostname.endswith("." + suffix) for suffix in ALLOWED_INSTITUTIONAL_HOST_SUFFIXES)


def _validate_identifier(identifier: str) -> None:
    if (
        not isinstance(identifier, str)
        or len(identifier) > 300
        or not identifier.lower().startswith("10.")
        or not DOI_OR_ARXIV.fullmatch(identifier)
    ):
        raise BrowserProtocolError("invalid_browser_job")


def _validate_cookie_snapshot(cookie_json: bytes) -> None:
    if not isinstance(cookie_json, bytes) or not 0 < len(cookie_json) <= MAX_BROWSER_COOKIE_BYTES:
        raise BrowserProtocolError("invalid_browser_job")
    try:
        cookies = json.loads(cookie_json.decode("utf-8"), object_pairs_hook=_no_duplicate_keys)
    except (UnicodeError, json.JSONDecodeError, ValueError, RecursionError) as error:
        raise BrowserProtocolError("invalid_browser_job") from error
    if not isinstance(cookies, list) or not 1 <= len(cookies) <= MAX_BROWSER_COOKIES:
        raise BrowserProtocolError("invalid_browser_job")
    identities: set[tuple[str, str, str]] = set()
    for cookie in cookies:
        if not isinstance(cookie, dict) or not {"name", "value"}.issubset(cookie) or not set(cookie).issubset(COOKIE_KEYS):
            raise BrowserProtocolError("invalid_browser_job")
        if any(not isinstance(key, str) for key in cookie):
            raise BrowserProtocolError("invalid_browser_job")
        name, value = cookie["name"], cookie["value"]
        domain, path = cookie.get("domain", ""), cookie.get("path", "")
        if (
            not isinstance(name, str) or not name or len(name) > 256
            or not isinstance(value, str) or len(value) > 16 * 1024
            or not isinstance(domain, str) or len(domain) > 253
            or not isinstance(path, str) or len(path) > 2048
        ):
            raise BrowserProtocolError("invalid_browser_job")
        identity = (name, domain.lower(), path)
        if identity in identities:
            raise BrowserProtocolError("invalid_browser_job")
        if not _cookie_is_publisher_scoped(cookie):
            raise BrowserProtocolError("invalid_browser_job")
        identities.add(identity)


def _cookie_is_publisher_scoped(cookie: object) -> bool:
    if not isinstance(cookie, dict):
        return False
    hosts: list[str] = []
    domain = cookie.get("domain", "")
    if isinstance(domain, str) and domain:
        hosts.append(domain.lstrip(".").lower())
    url = cookie.get("url", "")
    if isinstance(url, str) and url:
        try:
            parsed = urlsplit(url)
            port = parsed.port
        except ValueError:
            return False
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or port not in (None, 443)
        ):
            return False
        hosts.append(parsed.hostname.lower())
    return bool(hosts) and all(
        any(host == suffix or host.endswith(f".{suffix}") for suffix in ALLOWED_INSTITUTIONAL_HOST_SUFFIXES)
        for host in hosts
    )


def _validated_root(root: Path) -> Path:
    candidate = Path(root)
    details = candidate.lstat()
    if candidate.is_symlink() or not stat.S_ISDIR(details.st_mode):
        raise ValueError("invalid browser job root")
    return candidate.resolve(strict=True)


def _require_exact_output_paths(proof_path: Path, pdf_path: Path, job_root: Path) -> None:
    proof = Path(proof_path)
    pdf = Path(pdf_path)
    if not proof.is_absolute() or proof != job_root / "proof.json":
        raise ValueError("unexpected browser proof path")
    if not pdf.is_absolute() or pdf != job_root / "document.pdf":
        raise ValueError("unexpected browser PDF path")


def _supports_directory_fds() -> bool:
    return (
        os.name == "posix"
        and os.open in os.supports_dir_fd
        and os.stat in os.supports_dir_fd
        and hasattr(os, "O_DIRECTORY")
        and hasattr(os, "O_NOFOLLOW")
    )


def _read_result_pair_posix(
    output_root: Path,
    job_id: str,
    expected_uid: int | None,
    expected_gid: int | None,
) -> tuple[bytes, bytes]:
    root_flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    root_fd = os.open(output_root, root_flags)
    job_fd = -1
    try:
        job_fd = os.open(job_id, root_flags, dir_fd=root_fd)
        opened_job = os.fstat(job_fd)
        _validate_output_job_stat(opened_job, expected_uid, expected_gid)
        _require_same_directory(root_fd, job_id, opened_job)
        proof = _read_owned_regular_at(
            job_fd, "proof.json", MAX_BROWSER_PROOF_BYTES, expected_uid, expected_gid,
        )
        _require_same_directory(root_fd, job_id, opened_job)
        pdf = _read_owned_regular_at(
            job_fd, "document.pdf", MAX_PDF_BYTES, expected_uid, expected_gid,
        )
        _require_same_directory(root_fd, job_id, opened_job)
        return proof, pdf
    finally:
        if job_fd >= 0:
            os.close(job_fd)
        os.close(root_fd)


def _read_failure_posix(
    output_root: Path,
    job_id: str,
    expected_uid: int | None,
    expected_gid: int | None,
) -> bytes:
    root_flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    root_fd = os.open(output_root, root_flags)
    job_fd = -1
    try:
        job_fd = os.open(job_id, root_flags, dir_fd=root_fd)
        opened_job = os.fstat(job_fd)
        _validate_output_job_stat(opened_job, expected_uid, expected_gid)
        _require_same_directory(root_fd, job_id, opened_job)
        failure = _read_owned_regular_at(
            job_fd, "failure.json", MAX_BROWSER_PROOF_BYTES, expected_uid, expected_gid,
        )
        _require_same_directory(root_fd, job_id, opened_job)
        return failure
    finally:
        if job_fd >= 0:
            os.close(job_fd)
        os.close(root_fd)


def _require_same_directory(parent_fd: int, name: str, opened: os.stat_result) -> None:
    current = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    if not stat.S_ISDIR(current.st_mode) or (opened.st_dev, opened.st_ino) != (current.st_dev, current.st_ino):
        raise ValueError("browser output directory changed")


def _validate_output_job_path(
    job_root: Path,
    output_root: Path,
    expected_uid: int | None,
    expected_gid: int | None,
) -> None:
    if job_root.parent != output_root:
        raise ValueError("unexpected browser output directory")
    details = job_root.lstat()
    if job_root.is_symlink():
        raise ValueError("unsafe browser output directory")
    _validate_output_job_stat(details, expected_uid, expected_gid)
    if job_root.resolve(strict=True).parent != output_root:
        raise ValueError("browser output directory escapes root")


def _validate_output_job_stat(
    details: os.stat_result,
    expected_uid: int | None,
    expected_gid: int | None,
) -> None:
    if not stat.S_ISDIR(details.st_mode):
        raise ValueError("unsafe browser output directory")
    if os.name == "nt":
        return
    if expected_uid is not None and details.st_uid != expected_uid:
        raise ValueError("unsafe browser output directory owner")
    if expected_gid is not None and details.st_gid != expected_gid:
        raise ValueError("unsafe browser output directory group")
    if stat.S_IMODE(details.st_mode) != 0o750:
        raise ValueError("unsafe browser output directory mode")


def _read_owned_regular_at(
    directory_fd: int,
    name: str,
    maximum_bytes: int,
    expected_uid: int | None,
    expected_gid: int | None,
) -> bytes:
    before = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
    _validate_output_stat(before, expected_uid, expected_gid)
    descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory_fd)
    try:
        opened = os.fstat(descriptor)
        _validate_output_stat(opened, expected_uid, expected_gid)
        if (before.st_dev, before.st_ino) != (opened.st_dev, opened.st_ino):
            raise ValueError("browser output changed before open")
        with os.fdopen(descriptor, "rb", closefd=False) as source:
            content = source.read(maximum_bytes + 1)
        after = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
        _validate_output_stat(after, expected_uid, expected_gid)
        if (opened.st_dev, opened.st_ino, opened.st_size) != (after.st_dev, after.st_ino, after.st_size):
            raise ValueError("browser output changed during read")
    finally:
        os.close(descriptor)
    if len(content) > maximum_bytes:
        raise ValueError("browser output exceeds bound")
    return content


def _read_owned_regular(
    path: Path,
    expected_path: Path,
    output_root: Path,
    maximum_bytes: int,
    expected_uid: int | None,
    expected_gid: int | None,
) -> bytes:
    candidate = Path(path)
    if not candidate.is_absolute() or candidate.parent != expected_path.parent or candidate.name != expected_path.name:
        raise ValueError("unexpected browser output path")
    expected_path.parent.resolve(strict=True).relative_to(output_root)
    before = candidate.lstat()
    if candidate.is_symlink():
        raise ValueError("unsafe browser output")
    _validate_output_stat(before, expected_uid, expected_gid)
    descriptor = os.open(candidate, os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0))
    try:
        opened = os.fstat(descriptor)
        _validate_output_stat(opened, expected_uid, expected_gid)
        if (before.st_dev, before.st_ino) != (opened.st_dev, opened.st_ino):
            raise ValueError("browser output changed before open")
        with os.fdopen(descriptor, "rb", closefd=False) as source:
            content = source.read(maximum_bytes + 1)
    finally:
        os.close(descriptor)
    after = candidate.lstat()
    _validate_output_stat(after, expected_uid, expected_gid)
    if (opened.st_dev, opened.st_ino, opened.st_size) != (after.st_dev, after.st_ino, after.st_size):
        raise ValueError("browser output changed during read")
    if len(content) > maximum_bytes:
        raise ValueError("browser output exceeds bound")
    return content


def _validate_output_stat(
    details: os.stat_result,
    expected_uid: int | None,
    expected_gid: int | None,
) -> None:
    if not stat.S_ISREG(details.st_mode) or details.st_nlink != 1:
        raise ValueError("unsafe browser output")
    if os.name == "nt":
        return
    if expected_uid is not None and details.st_uid != expected_uid:
        raise ValueError("unsafe browser output owner")
    if expected_gid is not None and details.st_gid != expected_gid:
        raise ValueError("unsafe browser output group")
    if stat.S_IMODE(details.st_mode) != 0o640:
        raise ValueError("unsafe browser output mode")


def _write_atomic(path: Path, content: bytes, mode: int, shared_gid: int | None) -> None:
    temporary = path.parent / f".{path.name}.{uuid4().hex}.tmp"
    descriptor = os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY, mode)
    try:
        if os.name != "nt":
            os.fchmod(descriptor, mode)
            if shared_gid is not None:
                os.fchown(descriptor, -1, shared_gid)
        target = os.fdopen(descriptor, "wb")
        descriptor = -1
        with target:
            target.write(content)
            target.flush()
            os.fsync(target.fileno())
        os.replace(temporary, path)
    finally:
        if descriptor >= 0:
            try:
                os.close(descriptor)
            except OSError:
                pass
        try:
            try:
                temporary.unlink()
            except FileNotFoundError:
                pass
        except OSError:
            pass


def _set_group(path: Path, shared_gid: int | None) -> None:
    if os.name == "nt":
        return
    path.chmod(0o750)
    if shared_gid is not None:
        os.chown(path, -1, shared_gid)


def _fsync_directory(path: Path) -> None:
    if os.name == "nt":
        return
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _remove_input_job(job: Path, input_root: Path) -> None:
    if job.parent != input_root or not JOB_ID.fullmatch(job.name):
        return
    for name in ("ack.json", "job.json", "cookies.json"):
        candidate = job / name
        try:
            details = candidate.lstat()
            if stat.S_ISREG(details.st_mode) and not candidate.is_symlink():
                candidate.unlink()
        except FileNotFoundError:
            pass
    try:
        job.rmdir()
    except OSError:
        pass


def _no_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if not isinstance(key, str) or key in result:
            raise ValueError("duplicate or invalid JSON key")
        result[key] = value
    return result
