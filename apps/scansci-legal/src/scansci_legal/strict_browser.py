"""Fail-closed Patchright adapter for institutional browser acquisition."""

from __future__ import annotations

import ast
import base64
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
import hashlib
import hmac
import inspect
import json
import os
from pathlib import Path
import stat
import tempfile
import textwrap
from typing import Any, Callable, Iterator
from urllib.parse import urlsplit

from .browser_protocol import (
    BrowserProof,
    BrowserProtocolError,
    JOB_ID,
    SHARED_GID,
    _allowed_institutional_url,
    _validate_cookie_snapshot,
)
from .limits import MAX_BROWSER_COOKIE_BYTES, MAX_BROWSER_MANIFEST_BYTES, MAX_PDF_BYTES
from .policy import DOI_OR_ARXIV


CHROMIUM_EXECUTABLE = "/usr/local/bin/scansci-chromium"
EGRESS_PROXY = "http://openscience-egress:7891"
REQUIRED_DISPLAY = ":99"
INSTITUTION = "浙江大学"
MAX_CAPTURE_CANDIDATES = 8
MAX_CAPTURE_TOTAL_BYTES = 150 * 1024 * 1024
AUTH_CHALLENGE_HOSTS = frozenset({"zjuam.zju.edu.cn", "idp.carsi.edu.cn"})
PINNED_VISIBLE_BROWSER_AST_SHA256 = "50fbfbebcfbc28d72eb6b00d9ac1d6e2016eb94dde64d79bd434acf36fc03012"
PINNED_CARSI_DOWNLOAD_AST_SHA256 = "23562196f7e44a0e3cd76e4783d683834e87787772258d6e38c3ee4508a2c734"


class BrowserPolicyError(RuntimeError):
    """Stable failure at the strict browser policy boundary."""

    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


@dataclass
class _PatchrightHandle:
    playwright: object
    context: object
    page: object

    def close(self) -> None:
        try:
            self.context.close()  # type: ignore[attr-defined]
        finally:
            self.playwright.stop()  # type: ignore[attr-defined]


class _BrowserPdfCapture:
    """Collect only an authenticated browser response that proves a PDF."""

    def __init__(self) -> None:
        self._candidates: list[BrowserProof] = []
        self._overflowed = False
        self._observed_pdf_bytes = 0
        self._auth_failure_observed = False

    def attach(self, context: object, page: object) -> None:
        try:
            session = context.new_cdp_session(page)  # type: ignore[attr-defined]
            session.on(
                "Fetch.requestPaused",
                lambda event: self._on_request_paused(session, event),
            )
            session.send("Fetch.enable", {
                "patterns": [
                    {"urlPattern": f"*{host}/*", "requestStage": "Response"}
                    for host in (
                        "sciencedirect.com",
                        "elsevier.com",
                        "elsevierusercontent.com",
                        *AUTH_CHALLENGE_HOSTS,
                    )
                ],
            })
        except Exception as error:
            raise BrowserPolicyError("browser_stream_capture_unavailable") from error

    def _on_request_paused(self, session: object, event: object) -> None:
        request_id = None
        try:
            if not isinstance(event, dict):
                raise ValueError("invalid Fetch event")
            request_id = event.get("requestId")
            request = event.get("request")
            headers_list = event.get("responseHeaders")
            status_value = event.get("responseStatusCode")
            if not isinstance(request_id, str) or not isinstance(request, dict):
                raise ValueError("invalid Fetch event")
            final_url = request.get("url")
            if isinstance(status_value, bool) or not isinstance(status_value, int):
                self._continue_response(session, request_id)
                return
            headers = _cdp_headers(headers_list)
            content_type = headers.get("content-type", "")
            mime = (
                content_type.split(";", 1)[0].strip().lower()
                if isinstance(content_type, str)
                else ""
            )
            if isinstance(final_url, str) and _is_auth_challenge_response(
                status_value, mime, final_url,
            ):
                self._auth_failure_observed = True
            if not 200 <= status_value <= 299:
                self._continue_response(session, request_id)
                return
            if mime != "application/pdf":
                self._continue_response(session, request_id)
                return
            if not isinstance(final_url, str) or not _allowed_institutional_url(final_url):
                self._continue_response(session, request_id)
                return
            stream = session.send(  # type: ignore[attr-defined]
                "Fetch.takeResponseBodyAsStream", {"requestId": request_id},
            )
            if not isinstance(stream, dict) or not isinstance(stream.get("stream"), str):
                raise ValueError("missing Fetch stream")
            content = _read_cdp_stream(session, stream["stream"])
            if not self._record_streamed(status_value, mime, final_url, content):
                raise ValueError("browser capture budget exhausted")
            session.send("Fetch.fulfillRequest", {  # type: ignore[attr-defined]
                "requestId": request_id,
                "responseCode": status_value,
                "responseHeaders": headers_list if isinstance(headers_list, list) else [],
                "body": base64.b64encode(content).decode("ascii"),
            })
        except Exception:
            if isinstance(request_id, str):
                try:
                    session.send("Fetch.failRequest", {  # type: ignore[attr-defined]
                        "requestId": request_id,
                        "errorReason": "BlockedByClient",
                    })
                except Exception:
                    pass

    def _continue_response(self, session: object, request_id: str) -> None:
        session.send("Fetch.continueRequest", {"requestId": request_id})  # type: ignore[attr-defined]

    @property
    def auth_failure_observed(self) -> bool:
        return self._auth_failure_observed

    def _record_streamed(
        self,
        status_value: int,
        mime: str,
        final_url: str,
        content: bytes,
    ) -> bool:
        if (
            isinstance(status_value, bool)
            or not isinstance(status_value, int)
            or not 200 <= status_value <= 299
            or mime != "application/pdf"
            or not _allowed_institutional_url(final_url)
            or not 5 <= len(content) <= MAX_PDF_BYTES
            or not content.startswith(b"%PDF-")
        ):
            raise ValueError("invalid streamed PDF")
        proof = BrowserProof(
            http_status=status_value,
            mime=mime,
            final_url=final_url,
            source="CARSI-Browser",
            byte_count=len(content),
            sha256=hashlib.sha256(content).hexdigest(),
        )
        if (
            self._overflowed
            or len(self._candidates) >= MAX_CAPTURE_CANDIDATES
            or self._observed_pdf_bytes + len(content) > MAX_CAPTURE_TOTAL_BYTES
        ):
            self._overflowed = True
            self._candidates.clear()
            return False
        self._observed_pdf_bytes += len(content)
        self._candidates.append(proof)
        return True

    def result(self, selected_content: bytes) -> tuple[BrowserProof, bytes]:
        if self._overflowed:
            raise BrowserPolicyError("browser_pdf_not_proven")
        digest = hashlib.sha256(selected_content).hexdigest()
        matches = [
            proof
            for proof in self._candidates
            if proof.byte_count == len(selected_content)
            and hmac.compare_digest(proof.sha256, digest)
        ]
        if len(matches) != 1:
            raise BrowserPolicyError("browser_pdf_not_proven")
        return matches[0], selected_content


_ACTIVE_PROFILE: ContextVar[Path | None] = ContextVar("scansci_browser_profile", default=None)
_ACTIVE_CAPTURE: ContextVar[_BrowserPdfCapture | None] = ContextVar("scansci_browser_capture", default=None)


def launch_strict_patchright(
    profile_dir: Path,
    *,
    playwright_factory: Callable[[], object] | None = None,
) -> _PatchrightHandle:
    """Launch exactly one visible persistent context through the fixed proxy."""

    profile = Path(profile_dir)
    try:
        if os.environ.get("DISPLAY") != REQUIRED_DISPLAY:
            raise BrowserPolicyError("browser_display_unavailable")
        if profile.is_symlink() or not profile.is_dir() or any(profile.iterdir()):
            raise BrowserPolicyError("browser_profile_not_fresh")
    except OSError as error:
        raise BrowserPolicyError("browser_profile_not_fresh") from error

    if playwright_factory is None:
        from patchright.sync_api import sync_playwright

        playwright_factory = sync_playwright

    playwright = None
    try:
        playwright = playwright_factory().start()  # type: ignore[attr-defined]
        context = playwright.chromium.launch_persistent_context(  # type: ignore[attr-defined]
            str(profile),
            executable_path=CHROMIUM_EXECUTABLE,
            proxy={"server": EGRESS_PROXY},
            headless=False,
            args=["--disable-features=CrossOriginOpenerPolicy"],
        )
        pages = context.pages
        page = pages[0] if pages else context.new_page()
        return _PatchrightHandle(playwright, context, page)
    except BrowserPolicyError:
        raise
    except Exception as error:
        if playwright is not None:
            try:
                playwright.stop()
            except Exception:
                pass
        raise BrowserPolicyError("browser_launch_failed") from error


@contextmanager
def strict_visible_browser(
    profile_dir: Path,
    *,
    launcher: Callable[[Path], _PatchrightHandle] = launch_strict_patchright,
) -> Iterator[tuple[object, object]]:
    """Yield the sole strict browser context; a failed launch is never retried."""

    try:
        handle = launcher(profile_dir)
    except BrowserPolicyError:
        raise
    except Exception as error:
        raise BrowserPolicyError("browser_launch_failed") from error
    capture = _ACTIVE_CAPTURE.get()
    if capture is not None:
        capture.attach(handle.context, handle.page)
    try:
        yield handle.context, handle.page
    finally:
        handle.close()


def install_strict_scansci_browser(
    sources_module: object,
    carsi_module: object,
    *,
    source_reader: Callable[[object], str] = inspect.getsource,
    expected_visible_digest: str = PINNED_VISIBLE_BROWSER_AST_SHA256,
    expected_carsi_digest: str = PINNED_CARSI_DOWNLOAD_AST_SHA256,
) -> None:
    """Replace the guarded pinned ScanSci launch point with the strict adapter."""

    try:
        visible = getattr(sources_module, "_visible_browser")
        download = getattr(getattr(carsi_module, "CARSIClient"), "_download_via_cloakbrowser")
        visible_source = source_reader(visible)
        carsi_source = source_reader(download)
        if _source_digest(visible_source) != expected_visible_digest:
            raise BrowserPolicyError("scansci_visible_browser_drift")
        if _source_digest(carsi_source) != expected_carsi_digest:
            raise BrowserPolicyError("scansci_carsi_call_shape_drift")
        _validate_pinned_signatures(visible, download)
    except BrowserPolicyError:
        raise
    except Exception as error:
        raise BrowserPolicyError("scansci_browser_guard_failed") from error
    setattr(sources_module, "_visible_browser", _strict_scansci_visible_browser)


def capture_institutional_pdf(
    identifier: str,
    input_dir: Path,
    output_dir: Path,
    *,
    runner: Callable[[str, Path, dict[str, Any]], object] | None = None,
    profile_parent: Path = Path("/tmp/scansci-browser-profiles"),
    workspace: Path | None = None,
) -> BrowserProof:
    """Run guarded ScanSci and atomically publish browser-originated proof."""

    input_job = Path(input_dir)
    output_job = Path(output_dir)
    job_id, cookie_bytes = _read_job_input(identifier, input_job)
    if output_job.name != job_id or output_job.exists():
        raise BrowserPolicyError("browser_output_path_invalid")
    proof, content = _capture_with_cookie(
        identifier,
        cookie_bytes,
        runner=runner,
        profile_parent=profile_parent,
        workspace=workspace,
        workspace_name=job_id,
    )
    _publish_browser_result(output_job, job_id, identifier, proof, content)
    return proof


def verify_institutional_canary(
    identifier: str,
    cookie_json: bytes,
    *,
    runner: Callable[[str, Path, dict[str, Any]], object] | None = None,
    profile_parent: Path = Path("/tmp/scansci-auth-canary"),
) -> BrowserProof:
    """Exercise the fixed canary through the same strict browser adapter."""

    try:
        if not DOI_OR_ARXIV.fullmatch(identifier):
            raise ValueError("invalid identifier")
        _validate_cookie_snapshot(cookie_json)
    except (BrowserProtocolError, TypeError, ValueError) as error:
        raise BrowserPolicyError("browser_input_invalid") from error
    return _capture_with_cookie(
        identifier,
        cookie_json,
        runner=runner,
        profile_parent=profile_parent,
        workspace=None,
        workspace_name="canary",
    )[0]


def _capture_with_cookie(
    identifier: str,
    cookie_bytes: bytes,
    *,
    runner: Callable[[str, Path, dict[str, Any]], object] | None,
    profile_parent: Path,
    workspace: Path | None,
    workspace_name: str,
) -> tuple[BrowserProof, bytes]:
    runner = runner or _run_pinned_carsi

    with _job_workspace(workspace_name, Path(profile_parent), workspace) as work_root:
        profile = work_root / "profile"
        profile.mkdir(mode=0o700)
        cache_dir = work_root / "cache"
        cookie_dir = cache_dir / "carsi_cookies"
        cookie_dir.mkdir(parents=True, mode=0o700)
        (cookie_dir / "sciencedirect.json").write_bytes(cookie_bytes)
        (cookie_dir / "sciencedirect.json").chmod(0o600)
        capture = _BrowserPdfCapture()
        profile_token = _ACTIVE_PROFILE.set(profile)
        capture_token = _ACTIVE_CAPTURE.set(capture)
        try:
            upstream_output = work_root / "upstream.pdf"
            result = runner(identifier, upstream_output, {
                "cache_dir": str(cache_dir),
                "carsi_enabled": True,
                "carsi_idp_name": INSTITUTION,
                "browser_backend": "patchright",
            })
            if not isinstance(result, dict) or result.get("success") is not True:
                code = (
                    "browser_auth_required"
                    if capture.auth_failure_observed
                    else "browser_policy_blocked"
                )
                raise BrowserPolicyError(code)
            selected_content = _validate_runner_result(result, identifier, upstream_output)
            proof, content = capture.result(selected_content)
        finally:
            _ACTIVE_CAPTURE.reset(capture_token)
            _ACTIVE_PROFILE.reset(profile_token)
    return proof, content


@contextmanager
def _job_workspace(
    job_id: str,
    profile_parent: Path,
    workspace: Path | None,
) -> Iterator[Path]:
    if workspace is None:
        profile_parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix=f"{job_id}-", dir=profile_parent) as temporary:
            yield Path(temporary)
        return
    candidate = Path(workspace)
    try:
        details = candidate.lstat()
        if (
            candidate.name != job_id
            or candidate.is_symlink()
            or not stat.S_ISDIR(details.st_mode)
            or any(candidate.iterdir())
        ):
            raise ValueError("invalid job workspace")
        if os.name != "nt" and (
            details.st_uid != os.geteuid() or stat.S_IMODE(details.st_mode) != 0o700
        ):
            raise ValueError("invalid job workspace owner")
    except (OSError, ValueError) as error:
        raise BrowserPolicyError("browser_workspace_invalid") from error
    yield candidate


def _strict_scansci_visible_browser(
    config: dict[str, Any],
    publisher: str,
    *,
    viewport: dict | None = None,
):
    del config, publisher, viewport
    profile = _ACTIVE_PROFILE.get()
    if profile is None:
        raise BrowserPolicyError("browser_job_context_missing")
    return strict_visible_browser(profile)


def _run_pinned_carsi(identifier: str, output_path: Path, config: dict[str, Any]) -> object:
    from scansci_pdf import publisher_strategies
    from scansci_pdf.sources import carsi, carsi_source

    install_strict_scansci_browser(publisher_strategies, carsi)
    return carsi_source.try_carsi(identifier, output_path, config)


def _source_digest(source: str) -> str:
    tree = ast.parse(textwrap.dedent(source))
    if len(tree.body) != 1 or not isinstance(tree.body[0], (ast.FunctionDef, ast.AsyncFunctionDef)):
        raise ValueError("source is not one function")
    normalized = ast.dump(tree.body[0], annotate_fields=True, include_attributes=False)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _validate_runner_result(result: object, identifier: str, output_path: Path) -> bytes:
    try:
        if not isinstance(result, dict):
            raise ValueError("runner did not succeed")
        required = {
            "success": True,
            "identifier": identifier,
            "doi": identifier,
            "file": str(output_path),
            "source": "CARSI-Browser",
        }
        if any(result.get(key) != value for key, value in required.items()):
            raise ValueError("runner result mismatch")
        before = output_path.lstat()
        if output_path.is_symlink() or not output_path.is_file() or before.st_nlink != 1:
            raise ValueError("runner output is unsafe")
        descriptor = os.open(
            output_path,
            os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0),
        )
        try:
            opened = os.fstat(descriptor)
            if not stat_is_same_regular(before, opened):
                raise ValueError("runner output changed")
            with os.fdopen(descriptor, "rb", closefd=False) as stream:
                content = stream.read(MAX_PDF_BYTES + 1)
        finally:
            os.close(descriptor)
        after = output_path.lstat()
        if not stat_is_same_regular(opened, after) or len(content) > MAX_PDF_BYTES:
            raise ValueError("runner output changed")
        if not content.startswith(b"%PDF-"):
            raise ValueError("runner output is not PDF")
        return content
    except (OSError, ValueError) as error:
        raise BrowserPolicyError("browser_runner_result_invalid") from error


def stat_is_same_regular(first: os.stat_result, second: os.stat_result) -> bool:
    return (
        stat.S_ISREG(first.st_mode)
        and stat.S_ISREG(second.st_mode)
        and first.st_nlink == second.st_nlink == 1
        and (first.st_dev, first.st_ino, first.st_size)
        == (second.st_dev, second.st_ino, second.st_size)
    )


def _cdp_headers(value: object) -> dict[str, str]:
    if not isinstance(value, list):
        return {}
    result: dict[str, str] = {}
    for item in value:
        if not isinstance(item, dict):
            continue
        name, item_value = item.get("name"), item.get("value")
        if isinstance(name, str) and isinstance(item_value, str):
            normalized = name.lower()
            if normalized in result:
                return {}
            result[normalized] = item_value
    return result


def _is_auth_challenge_response(status_value: int, mime: str, final_url: str) -> bool:
    try:
        parsed = urlsplit(final_url)
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
    hostname = parsed.hostname.rstrip(".").lower()
    if hostname in AUTH_CHALLENGE_HOSTS:
        return status_value in (401, 403) or mime == "text/html"
    if not _allowed_institutional_url(final_url):
        return False
    if status_value in (401, 403):
        return True
    path = parsed.path.lower()
    is_pdf_endpoint = (
        path.endswith(".pdf")
        or "/pdfft" in path
        or "/pdfdirect/" in path
        or "/doi/pdf/" in path
    )
    return 200 <= status_value <= 299 and mime == "text/html" and is_pdf_endpoint


def _read_cdp_stream(session: object, handle: str) -> bytes:
    content = bytearray()
    empty_reads = 0
    try:
        while True:
            result = session.send(  # type: ignore[attr-defined]
                "IO.read", {"handle": handle, "size": 1024 * 1024},
            )
            if not isinstance(result, dict):
                raise ValueError("invalid CDP stream read")
            data = result.get("data", "")
            if not isinstance(data, str):
                raise ValueError("invalid CDP stream data")
            if result.get("base64Encoded") is True:
                chunk = base64.b64decode(data, validate=True)
            else:
                chunk = data.encode("latin-1", errors="strict")
            if chunk:
                empty_reads = 0
                content.extend(chunk)
                if len(content) > MAX_PDF_BYTES:
                    raise ValueError("CDP stream exceeds PDF bound")
            else:
                empty_reads += 1
            if result.get("eof") is True:
                return bytes(content)
            if empty_reads > 3:
                raise ValueError("CDP stream made no progress")
    finally:
        try:
            session.send("IO.close", {"handle": handle})  # type: ignore[attr-defined]
        except Exception:
            pass


def _validate_pinned_signatures(visible: object, download: object) -> None:
    visible_parameters = inspect.signature(visible).parameters
    if tuple(visible_parameters) != ("config", "publisher", "viewport"):
        raise BrowserPolicyError("scansci_visible_browser_signature_drift")
    if visible_parameters["viewport"].kind is not inspect.Parameter.KEYWORD_ONLY:
        raise BrowserPolicyError("scansci_visible_browser_signature_drift")
    download_parameters = inspect.signature(download).parameters
    if tuple(download_parameters) != ("self", "doi", "article_url", "output_path"):
        raise BrowserPolicyError("scansci_carsi_signature_drift")


def _read_job_input(identifier: str, input_job: Path) -> tuple[str, bytes]:
    try:
        if not DOI_OR_ARXIV.fullmatch(identifier):
            raise ValueError("invalid identifier")
        job_id = input_job.name
        if not JOB_ID.fullmatch(job_id) or input_job.is_symlink() or not input_job.is_dir():
            raise ValueError("invalid input job")
        manifest_bytes = _read_bounded(input_job / "job.json", MAX_BROWSER_MANIFEST_BYTES)
        manifest = json.loads(manifest_bytes.decode("ascii"))
        if manifest != {"schema": 1, "job_id": job_id, "identifier": identifier}:
            raise ValueError("manifest mismatch")
        cookie_bytes = _read_bounded(input_job / "cookies.json", MAX_BROWSER_COOKIE_BYTES)
        cookies = json.loads(cookie_bytes.decode("utf-8"))
        if not isinstance(cookies, list):
            raise ValueError("invalid cookies")
        return job_id, cookie_bytes
    except BrowserPolicyError:
        raise
    except (OSError, UnicodeError, ValueError, json.JSONDecodeError) as error:
        raise BrowserPolicyError("browser_input_invalid") from error


def _read_bounded(path: Path, limit: int) -> bytes:
    if path.is_symlink() or not path.is_file():
        raise ValueError("invalid input file")
    with path.open("rb") as stream:
        data = stream.read(limit + 1)
    if len(data) > limit:
        raise ValueError("input file too large")
    return data


def _publish_browser_result(
    output_job: Path,
    job_id: str,
    identifier: str,
    proof: BrowserProof,
    content: bytes,
) -> None:
    try:
        output_job.mkdir(mode=0o750)
        _set_group(output_job)
        output_job.chmod(0o750)
        envelope = json.dumps({
            "schema": 1,
            "job_id": job_id,
            "identifier": identifier,
            "proof": proof.__dict__,
        }, sort_keys=True, separators=(",", ":")).encode("ascii")
        _write_atomic(output_job / "document.pdf", content, 0o640)
        _write_atomic(output_job / "proof.json", envelope, 0o640)
    except (OSError, ValueError) as error:
        raise BrowserPolicyError("browser_result_publish_failed") from error


def _write_atomic(path: Path, data: bytes, mode: int) -> None:
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    descriptor = None
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
        _set_group(temporary)
        temporary.chmod(mode)
        with os.fdopen(descriptor, "wb", closefd=True) as stream:
            descriptor = None
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if descriptor is not None:
            os.close(descriptor)
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass


def _set_group(path: Path) -> None:
    if hasattr(os, "chown"):
        os.chown(path, -1, SHARED_GID)
