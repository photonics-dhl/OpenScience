"""Internal-only HTTP boundary for legal ScanSci acquisition."""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import threading
from typing import Any, Callable, Mapping, Protocol
from urllib.parse import urlsplit

from .policy import MAX_REQUEST_BYTES, LegalDownloadRequest, PolicyError, validate_request, validate_source_result
from .limits import MAX_PDF_BYTES
from .upstream import AcquiredPdf, AcquisitionError, _safe_external_url, _safe_header_value
from .browser_protocol import _allowed_institutional_url

ERROR_STATUS = {
    "disabled": 503,
    "auth_required": 409,
    "not_entitled": 403,
    "not_found": 404,
    "rate_limited": 429,
    "invalid_pdf": 422,
    "policy_blocked": 422,
    "upstream_timeout": 504,
    "upstream_unavailable": 502,
}
MAX_REJECT_DRAIN_BYTES = 8 * 1024


class AcquisitionClient(Protocol):
    def acquire(self, request: LegalDownloadRequest) -> AcquiredPdf: ...


@dataclass(frozen=True)
class ServiceConfig:
    host: str = "127.0.0.1"
    port: int = 8080
    service_token: str = ""
    session_status: str | Callable[[], str] = "disabled"
    session_auth_redirect: Callable[[], object] | None = None
    session_verified: Callable[[str], object] | None = None
    maximum_pdf_bytes: int = MAX_PDF_BYTES
    entitlement_valid_until: str | None = None


class _DuplicateJsonKey(ValueError):
    pass


def create_server(config: ServiceConfig | Mapping[str, Any] | object, acquisition_client: AcquisitionClient) -> ThreadingHTTPServer:
    settings = _service_config(config)
    token = settings.service_token.encode("utf-8")
    if not token:
        raise ValueError("service token is required")
    acquisition_semaphore = threading.BoundedSemaphore(2)

    class Handler(BaseHTTPRequestHandler):
        server_version = "ScanSciLegal"
        sys_version = ""

        def log_message(self, format: str, *args: object) -> None:
            return

        def do_GET(self) -> None:
            if self.path == "/healthz":
                self._json(200, {"status": "ok"})
                return
            if self.path == "/v1/session/status":
                if not self._authorized():
                    return
                self._json(200, {"status": _live_session_status(settings.session_status)})
                return
            self._json(404, {"code": "not_found"})

        def do_POST(self) -> None:
            if self.path == "/healthz":
                self._json(405, {"code": "not_found"})
                return
            if self.path == "/v1/session/status":
                if not self._authorized():
                    return
                self._json(200, {"status": _live_session_status(settings.session_status)})
                return
            if self.path != "/v1/legal-download":
                self._json(404, {"code": "not_found"})
                return
            if not self._authorized():
                return
            self._legal_download()

        def _authorized(self) -> bool:
            authorization = self.headers.get("Authorization", "")
            expected = b"Bearer " + token
            received = authorization.encode("utf-8", errors="ignore")
            if not hmac.compare_digest(received, expected):
                self._drain_rejected_body()
                self._json(401, {"code": "unauthorized"})
                return False
            return True

        def _legal_download(self) -> None:
            payload = self._request_payload()
            if payload is None:
                return
            try:
                request = validate_request(payload)
            except PolicyError:
                self._json(400, {"code": "invalid_request"})
                return
            session_state = _live_session_status(settings.session_status)
            if session_state == "disabled":
                self._stable_error("disabled")
                return
            if session_state != "ready":
                request = replace(request, institutional=False)
            with acquisition_semaphore:
                try:
                    acquired = acquisition_client.acquire(request)
                    headers, content = _response_pdf(acquired, request, settings)
                    if acquired.route == "institutional":
                        cookie_sha256 = acquired.session_cookie_sha256
                        if (
                            acquired.source != "CARSI-Browser"
                            or not _allowed_institutional_url(acquired.source_url)
                            or not isinstance(cookie_sha256, str)
                            or len(cookie_sha256) != 64
                            or any(character not in "0123456789abcdef" for character in cookie_sha256)
                        ):
                            raise AcquisitionError("policy_blocked")
                        if settings.session_verified is None:
                            raise AcquisitionError("upstream_unavailable")
                        settings.session_verified(cookie_sha256)
                except AcquisitionError as error:
                    if error.code == "auth_required" and settings.session_auth_redirect is not None:
                        try:
                            settings.session_auth_redirect()
                        except Exception:
                            pass
                    self._stable_error(error.code)
                    return
                except Exception:
                    self._stable_error("upstream_unavailable")
                    return
            self._bytes(200, content, headers)

        def _request_payload(self) -> object | None:
            if self.headers.get_content_type() != "application/json":
                self._drain_rejected_body()
                self._json(400, {"code": "invalid_request"})
                return None
            if self.headers.get_all("Transfer-Encoding"):
                self._json(400, {"code": "invalid_request"})
                return None
            lengths = self.headers.get_all("Content-Length") or []
            if not lengths:
                self._json(411, {"code": "length_required"})
                return None
            if len(lengths) != 1:
                self._json(400, {"code": "invalid_request"})
                return None
            length = lengths[0]
            if not length.isascii() or not length.isdecimal():
                self._json(400, {"code": "invalid_request"})
                return None
            if len(length) > 10:
                self._json(413, {"code": "request_too_large"})
                return None
            size = int(length)
            if size > MAX_REQUEST_BYTES:
                self._drain_rejected_body()
                self._json(413, {"code": "request_too_large"})
                return None
            body = self.rfile.read(size)
            if len(body) != size:
                self._json(400, {"code": "invalid_request"})
                return None
            try:
                return json.loads(body.decode("utf-8"), object_pairs_hook=_no_duplicate_json_keys)
            except (UnicodeDecodeError, json.JSONDecodeError, _DuplicateJsonKey):
                self._json(400, {"code": "invalid_request"})
                return None

        def _drain_rejected_body(self) -> None:
            if self.headers.get_all("Transfer-Encoding"):
                return
            lengths = self.headers.get_all("Content-Length") or []
            if len(lengths) != 1:
                return
            value = lengths[0]
            if not value.isascii() or not value.isdecimal() or len(value) > 10:
                return
            size = int(value)
            if 0 < size <= MAX_REJECT_DRAIN_BYTES:
                self.rfile.read(size)

        def _stable_error(self, code: str) -> None:
            safe_code = code if code in ERROR_STATUS else "upstream_unavailable"
            self._json(ERROR_STATUS[safe_code], {"code": safe_code})

        def _json(self, status: int, body: dict[str, str]) -> None:
            self._bytes(status, json.dumps(body, separators=(",", ":")).encode("utf-8"), {"content-type": "application/json"})

        def _bytes(self, status: int, body: bytes, headers: Mapping[str, str]) -> None:
            self.send_response(status)
            for key, value in headers.items():
                self.send_header(key, value)
            self.send_header("content-length", str(len(body)))
            self.send_header("cache-control", "no-store")
            self.end_headers()
            self.wfile.write(body)

    server = ThreadingHTTPServer((settings.host, settings.port), Handler)
    server.daemon_threads = True
    return server


def _service_config(config: ServiceConfig | Mapping[str, Any] | object) -> ServiceConfig:
    if isinstance(config, ServiceConfig):
        return config
    if isinstance(config, Mapping):
        values = config
        getter = values.get
    else:
        getter = lambda key, default=None: getattr(config, key, default)
    maximum = getter("maximum_pdf_bytes", MAX_PDF_BYTES)
    if not isinstance(maximum, int) or maximum <= 0 or maximum > MAX_PDF_BYTES:
        raise ValueError("maximum_pdf_bytes is invalid")
    host = getter("host", "127.0.0.1")
    port = getter("port", 8080)
    token = getter("service_token", "")
    session_status = getter("session_status", "unavailable")
    session_auth_redirect = getter("session_auth_redirect", None)
    session_verified = getter("session_verified", None)
    entitlement = getter("entitlement_valid_until", None)
    if (
        not isinstance(host, str)
        or not isinstance(port, int)
        or not isinstance(token, str)
        or not (isinstance(session_status, str) or callable(session_status))
        or not (session_auth_redirect is None or callable(session_auth_redirect))
        or not (session_verified is None or callable(session_verified))
    ):
        raise ValueError("service configuration is invalid")
    if entitlement is not None and (not isinstance(entitlement, str) or not _safe_header_value(entitlement)):
        raise ValueError("entitlement_valid_until is invalid")
    return ServiceConfig(
        host=host,
        port=port,
        service_token=token,
        session_status=session_status,
        session_auth_redirect=session_auth_redirect,
        session_verified=session_verified,
        maximum_pdf_bytes=maximum,
        entitlement_valid_until=entitlement,
    )


def _live_session_status(provider: str | Callable[[], str]) -> str:
    try:
        value = provider() if callable(provider) else provider
    except Exception:
        return "auth_required"
    return value if value in {"ready", "refreshing", "auth_required", "disabled"} else "auth_required"


def _no_duplicate_json_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise _DuplicateJsonKey()
        result[key] = value
    return result


def _response_pdf(acquired: AcquiredPdf, request: LegalDownloadRequest, settings: ServiceConfig) -> tuple[dict[str, str], bytes]:
    try:
        validate_source_result({"success": True, "route": acquired.route, "source": acquired.source})
    except PolicyError as error:
        raise AcquisitionError("policy_blocked") from error
    if not _safe_external_url(acquired.source_url):
        raise AcquisitionError("policy_blocked")
    content = _read_pdf(acquired.content, settings.maximum_pdf_bytes)
    headers = {
        "content-type": "application/pdf",
        "x-scansci-route": acquired.route,
        "x-scansci-public-url": acquired.source_url,
    }
    if acquired.license:
        if not _safe_header_value(acquired.license):
            raise AcquisitionError("policy_blocked")
        headers["x-scansci-license"] = acquired.license.strip()
    if acquired.route == "institutional":
        entitlement = acquired.entitlement_valid_until or settings.entitlement_valid_until or _short_lived_entitlement()
        if not _safe_header_value(entitlement):
            raise AcquisitionError("policy_blocked")
        headers.update({
            "x-scansci-entitlement": "verified",
            "x-scansci-entitlement-subject": request.subject_id,
            "x-scansci-entitlement-valid-until": entitlement,
        })
    return headers, content


def _read_pdf(content: bytes, maximum_bytes: int) -> bytes:
    if not isinstance(content, bytes) or len(content) > maximum_bytes:
        raise AcquisitionError("invalid_pdf")
    if len(content) < 5 or not content.startswith(b"%PDF-"):
        raise AcquisitionError("invalid_pdf")
    return content


def _short_lived_entitlement() -> str:
    return (datetime.now(UTC) + timedelta(minutes=5)).replace(microsecond=0).isoformat().replace("+00:00", "Z")


__all__ = ["AcquiredPdf", "AcquisitionError", "ERROR_STATUS", "ServiceConfig", "create_server"]
