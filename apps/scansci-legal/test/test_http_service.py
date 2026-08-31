from __future__ import annotations

from contextlib import contextmanager, redirect_stderr
import http.client
import io
import json
import os
from pathlib import Path
import socket
import sys
import tempfile
import threading
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from scansci_legal.http_service import AcquisitionError, AcquiredPdf, create_server
from scansci_legal.main import load_service_token
from scansci_legal.policy import LegalDownloadRequest
from scansci_legal.upstream import ScanSciAcquisitionClient


class ServiceTokenFileTests(unittest.TestCase):
    def test_loads_service_token_from_fixed_secret_file_without_environment_value(self):
        with tempfile.TemporaryDirectory() as directory:
            secret = Path(directory) / "scansci_service_token"
            secret.write_text("file-token-never-log\n", encoding="utf-8")
            if os.name != "nt":
                secret.chmod(0o400)
            self.assertEqual(load_service_token({"SCANSCI_SERVICE_TOKEN_FILE": str(secret)}), "file-token-never-log")

    def test_rejects_inline_service_token_even_without_a_file(self):
        with self.assertRaisesRegex(ValueError, "service token"):
            load_service_token({"SCANSCI_SERVICE_TOKEN": "inline-token"})

    @unittest.skipIf(os.name == "nt", "POSIX owner/mode contract")
    def test_rejects_service_token_with_unsafe_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            secret = Path(directory) / "scansci_service_token"
            secret.write_text("file-token\n", encoding="utf-8")
            secret.chmod(0o600)
            with self.assertRaisesRegex(ValueError, "service token"):
                load_service_token({"SCANSCI_SERVICE_TOKEN_FILE": str(secret)})

            secret.chmod(0o400)
            os.link(secret, Path(directory) / "second-link")
            with self.assertRaisesRegex(ValueError, "service token"):
                load_service_token({"SCANSCI_SERVICE_TOKEN_FILE": str(secret)})

    def test_rejects_empty_or_ambiguous_service_token_configuration(self):
        with tempfile.TemporaryDirectory() as directory:
            secret = Path(directory) / "scansci_service_token"
            secret.write_text("\n", encoding="utf-8")
            if os.name != "nt":
                secret.chmod(0o400)
            with self.assertRaisesRegex(ValueError, "service token"):
                load_service_token({"SCANSCI_SERVICE_TOKEN_FILE": str(secret)})
            if os.name != "nt":
                secret.chmod(0o600)
            secret.write_text("file-token\n", encoding="utf-8")
            if os.name != "nt":
                secret.chmod(0o400)
            with self.assertRaisesRegex(ValueError, "service token"):
                load_service_token({"SCANSCI_SERVICE_TOKEN_FILE": str(secret), "SCANSCI_SERVICE_TOKEN": "env-token"})


VALID_REQUEST = {
    "identifier": "10.1038/nature12373",
    "strategy": "legal_only",
    "scihub": False,
    "tor": False,
    "institutional": True,
    "subject_id": "a" * 64,
}


class Response:
    def __init__(self, status: int, headers: dict[str, str], body: bytes):
        self.status = status
        self.headers = headers
        self.body = body


def request_bytes(server, path: str, body: bytes = b"", token: str | None = None, *, content_type: str = "application/json", method: str = "POST") -> Response:
    host, port = server.server_address[:2]
    headers = {"content-type": content_type, "content-length": str(len(body))}
    if token is not None:
        headers["authorization"] = f"Bearer {token}"
    connection = http.client.HTTPConnection(host, port, timeout=2)
    try:
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        return Response(response.status, {key.lower(): value for key, value in response.getheaders()}, response.read())
    finally:
        connection.close()


def request_json(server, path: str, payload: object, token: str | None = None) -> Response:
    return request_bytes(server, path, json.dumps(payload, separators=(",", ":")).encode("utf-8"), token)


def raw_request(server, request: bytes) -> Response:
    host, port = server.server_address[:2]
    with socket.create_connection((host, port), timeout=2) as connection:
        connection.sendall(request)
        connection.shutdown(socket.SHUT_WR)
        chunks = []
        while data := connection.recv(4096):
            chunks.append(data)
    response = b"".join(chunks)
    head, body = response.split(b"\r\n\r\n", 1)
    lines = head.split(b"\r\n")
    headers = {key.decode("ascii").lower(): value.decode("ascii") for key, value in (line.split(b": ", 1) for line in lines[1:])}
    return Response(int(lines[0].split()[1]), headers, body)


def legal_raw_request(headers: bytes, body: bytes | None = None) -> bytes:
    body = body or json.dumps(VALID_REQUEST, separators=(",", ":")).encode("utf-8")
    return b"POST /v1/legal-download HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer service-test-token\r\nContent-Type: application/json\r\n" + headers + b"\r\n" + body


class FakeClient:
    def __init__(self, pdf: Path, *, result: AcquiredPdf | None = None, failure: Exception | None = None):
        self.pdf = pdf
        self.result = result
        self.failure = failure
        self.requests: list[LegalDownloadRequest] = []

    def acquire(self, request: LegalDownloadRequest) -> AcquiredPdf:
        self.requests.append(request)
        if self.failure:
            raise self.failure
        return self.result or AcquiredPdf(
            content=self.pdf.read_bytes(),
            route="institutional",
            source="CARSI",
            source_url="https://publisher.example/paper",
            entitlement_valid_until="2026-09-30T00:00:00Z",
        )


@contextmanager
def running_server(client: FakeClient, **config):
    server = create_server({"host": "127.0.0.1", "port": 0, "service_token": "service-test-token", "session_status": "ready", **config}, client)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server
    finally:
        server.shutdown()
        thread.join(timeout=2)
        server.server_close()


class LegalDownloadHttpServiceTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.pdf = Path(self.directory.name) / "paper.pdf"
        self.pdf.write_bytes(b"%PDF-safe-fixture")
        self.client = FakeClient(self.pdf)

    def tearDown(self):
        self.directory.cleanup()

    def test_healthz_is_the_only_unauthenticated_route(self):
        with running_server(self.client) as server:
            health = request_bytes(server, "/healthz", method="GET")
            session = request_bytes(server, "/v1/session/status", method="GET")

        self.assertEqual(health.status, 200)
        self.assertEqual(json.loads(health.body), {"status": "ok"})
        self.assertEqual(session.status, 401)

    def test_rejects_missing_and_wrong_bearer_tokens_without_calling_upstream(self):
        with running_server(self.client) as server:
            missing = request_json(server, "/v1/legal-download", VALID_REQUEST)
            wrong = request_json(server, "/v1/legal-download", VALID_REQUEST, token="wrong")

        self.assertEqual(missing.status, 401)
        self.assertEqual(wrong.status, 401)
        self.assertEqual(self.client.requests, [])

    def test_rejects_duplicate_and_unknown_json_keys_before_acquisition(self):
        duplicate = b'{"identifier":"10.1038/nature12373","identifier":"10.1000/other","strategy":"legal_only","scihub":false,"tor":false,"institutional":true,"subject_id":"' + (b"a" * 64) + b'"}'
        with running_server(self.client) as server:
            duplicate_response = request_bytes(server, "/v1/legal-download", duplicate, "service-test-token")
            unknown_response = request_json(server, "/v1/legal-download", {**VALID_REQUEST, "callback": "https://example.test"}, "service-test-token")

        self.assertEqual(duplicate_response.status, 400)
        self.assertEqual(unknown_response.status, 400)
        self.assertEqual(self.client.requests, [])

    def test_rejects_body_larger_than_four_kib_before_reading_or_acquiring(self):
        with running_server(self.client) as server:
            response = request_bytes(server, "/v1/legal-download", b"{" + (b" " * 4097) + b"}", "service-test-token")

        self.assertEqual(response.status, 413)
        self.assertEqual(self.client.requests, [])

    def test_sends_only_valid_doi_or_arxiv_contracts_to_the_acquisition_client(self):
        with running_server(self.client) as server:
            invalid = request_json(server, "/v1/legal-download", {**VALID_REQUEST, "identifier": "https://127.0.0.1/secret"}, "service-test-token")
            valid = request_json(server, "/v1/legal-download", {**VALID_REQUEST, "identifier": "arXiv:2009.06045v2"}, "service-test-token")

        self.assertEqual(invalid.status, 400)
        self.assertEqual(valid.status, 200)
        self.assertEqual([request.identifier for request in self.client.requests], ["arXiv:2009.06045v2"])

    def test_emits_the_exact_safe_pdf_contract_headers(self):
        with running_server(self.client) as server:
            response = request_json(server, "/v1/legal-download", VALID_REQUEST, token="service-test-token")

        self.assertEqual(response.status, 200)
        self.assertEqual(response.headers["content-type"], "application/pdf")
        self.assertEqual(response.headers["x-scansci-route"], "institutional")
        self.assertEqual(response.headers["x-scansci-public-url"], "https://publisher.example/paper")
        self.assertEqual(response.headers["x-scansci-entitlement"], "verified")
        self.assertEqual(response.headers["x-scansci-entitlement-subject"], "a" * 64)
        self.assertEqual(response.headers["x-scansci-entitlement-valid-until"], "2026-09-30T00:00:00Z")
        self.assertEqual(response.body[:5], b"%PDF-")
        self.assertNotIn(b"cookie", response.body.lower())

    def test_real_client_composition_keeps_worker_pdf_bytes_alive_until_the_http_response(self):
        worker = Path(self.directory.name) / "worker.py"
        worker.write_text(
            "import json, pathlib, sys\nrequest=json.load(sys.stdin)\npath=pathlib.Path(request['output_dir'])/'paper.pdf'\npath.write_bytes(b'%PDF-live-through-response')\nprint(json.dumps({'success': True, 'file': str(path), 'source': 'CARSI', 'url': 'https://publisher.example/paper'}))\n",
            encoding="utf-8",
        )
        session_root = Path(self.directory.name) / "session"
        cookie = session_root / "scansci" / "cache" / "carsi_cookies" / "sciencedirect.json"
        cookie.parent.mkdir(parents=True)
        cookie.write_text('[{"name":"session","value":"fixture"}]', encoding="utf-8")
        if os.name != "nt":
            for parent in (session_root, session_root / "scansci", session_root / "scansci" / "cache", cookie.parent):
                parent.chmod(0o700)
            cookie.chmod(0o600)
        client = ScanSciAcquisitionClient(
            Path(self.directory.name), worker_command=[sys.executable, str(worker)], session_root=session_root,
        )
        with running_server(client) as server:
            response = request_json(server, "/v1/legal-download", VALID_REQUEST, "service-test-token")

        self.assertEqual(response.status, 200)
        self.assertEqual(response.body, b"%PDF-live-through-response")

    def test_rejects_invalid_pdf_magic_and_size_overflow_without_leaking_bytes(self):
        invalid_magic = Path(self.directory.name) / "html.pdf"
        invalid_magic.write_bytes(b"<html>cookie=secret</html>")
        oversized = Path(self.directory.name) / "large.pdf"
        oversized.write_bytes(b"%PDF-" + (b"x" * 32))
        for name, client, config in (
            ("magic", FakeClient(invalid_magic), {}),
            ("size", FakeClient(oversized), {"maximum_pdf_bytes": 16}),
        ):
            with self.subTest(name=name), running_server(client, **config) as server:
                response = request_json(server, "/v1/legal-download", VALID_REQUEST, "service-test-token")
            self.assertEqual(response.status, 422)
            self.assertNotIn(b"cookie", response.body.lower())
            self.assertNotIn(b"%PDF-", response.body)

    def test_rejects_unsafe_source_metadata_and_non_allowlisted_routes(self):
        for name, result in (
            ("credentials", AcquiredPdf(self.pdf.read_bytes(), "open_access", "oa_url", "https://user:secret@publisher.example/paper")),
            ("grey-source", AcquiredPdf(self.pdf.read_bytes(), "institutional", "Sci-Hub", "https://publisher.example/paper")),
            ("grey-route", AcquiredPdf(self.pdf.read_bytes(), "scihub", "CARSI", "https://publisher.example/paper")),
        ):
            with self.subTest(name=name), running_server(FakeClient(self.pdf, result=result)) as server:
                response = request_json(server, "/v1/legal-download", VALID_REQUEST, "service-test-token")
            self.assertEqual(response.status, 422)
            self.assertNotIn(b"secret", response.body.lower())

    def test_rejects_non_ascii_metadata_before_it_can_become_a_response_header(self):
        result = AcquiredPdf(self.pdf.read_bytes(), "open_access", "oa_url", "https://publisher.example/paper", license="许可")
        with running_server(FakeClient(self.pdf, result=result)) as server:
            response = request_json(server, "/v1/legal-download", VALID_REQUEST, "service-test-token")

        self.assertEqual(response.status, 422)
        self.assertNotIn("许可".encode("utf-8"), response.body)

    def test_rejects_c0_and_del_header_controls_before_response_emission(self):
        for value in ("CC-BY\x1f4.0", "CC-BY\x7f4.0"):
            with self.subTest(value=repr(value)), running_server(FakeClient(self.pdf, result=AcquiredPdf(self.pdf.read_bytes(), "open_access", "oa_url", "https://publisher.example/paper", license=value))) as server:
                response = request_json(server, "/v1/legal-download", VALID_REQUEST, "service-test-token")
            self.assertEqual(response.status, 422)
            self.assertNotIn(value.encode("ascii"), response.body)

    def test_rejects_controls_in_every_upstream_controlled_emitted_header(self):
        for field in ("source_url", "license", "entitlement_valid_until"):
            for control in ("\x00", "\x7f", "\r", "\n"):
                with self.subTest(field=field, control=repr(control)):
                    kwargs = {"source_url": "https://publisher.example/paper", "license": None, "entitlement_valid_until": "2026-09-30T00:00:00Z"}
                    if field == "source_url":
                        kwargs[field] = f"https://publisher.example/a{control}b"
                    else:
                        kwargs[field] = f"safe{control}value"
                    result = AcquiredPdf(self.pdf.read_bytes(), "institutional", "CARSI", **kwargs)
                    with running_server(FakeClient(self.pdf, result=result)) as server:
                        response = request_json(server, "/v1/legal-download", VALID_REQUEST, "service-test-token")
                    self.assertEqual(response.status, 422)

    def test_maps_allowlisted_acquisition_errors_and_redacts_raw_exceptions(self):
        cases = (
            (AcquisitionError("auth_required"), 409),
            (AcquisitionError("not_entitled"), 403),
            (AcquisitionError("not_found"), 404),
            (AcquisitionError("rate_limited"), 429),
            (AcquisitionError("upstream_timeout"), 504),
            (AcquisitionError("upstream_unavailable"), 502),
            (RuntimeError("cookie=super-secret /private/path"), 502),
        )
        for failure, status in cases:
            with self.subTest(failure=type(failure).__name__), running_server(FakeClient(self.pdf, failure=failure)) as server:
                response = request_json(server, "/v1/legal-download", VALID_REQUEST, "service-test-token")
            self.assertEqual(response.status, status)
            self.assertNotIn(b"secret", response.body.lower())
            self.assertNotIn(b"private", response.body.lower())

    def test_worker_stderr_never_reaches_the_server_or_response(self):
        worker = Path(self.directory.name) / "leaking-worker.py"
        worker.write_text("import sys\nprint('cookie=secret https://user:password@proxy.example/private', file=sys.stderr)\nraise RuntimeError('cookie=secret /private/path')\n", encoding="utf-8")
        client = ScanSciAcquisitionClient(Path(self.directory.name), worker_command=[sys.executable, str(worker)])
        captured = io.StringIO()
        with redirect_stderr(captured), running_server(client) as server:
            response = request_json(server, "/v1/legal-download", VALID_REQUEST, "service-test-token")

        self.assertEqual(response.status, 502)
        self.assertNotIn(b"secret", response.body.lower())
        self.assertNotIn("secret", captured.getvalue().lower())

    def test_rejects_ambiguous_http_framing_before_the_acquisition_client_runs(self):
        body = json.dumps(VALID_REQUEST, separators=(",", ":")).encode("utf-8")
        length = str(len(body)).encode("ascii")
        cases = (
            legal_raw_request(b"Content-Length: " + length + b"\r\nContent-Length: " + length + b"\r\n", body),
            legal_raw_request(b"Transfer-Encoding: chunked\r\n", body),
            legal_raw_request(b"Transfer-Encoding: chunked\r\nContent-Length: " + length + b"\r\n", body),
            legal_raw_request(b"Content-Length: +" + length + b"\r\n", body),
            legal_raw_request(b"Content-Length: " + length + b" \r\n", body),
            legal_raw_request(b"Content-Length: " + (b"9" * 100) + b"\r\n", body),
        )
        with running_server(self.client) as server:
            responses = [raw_request(server, request) for request in cases]

        self.assertEqual([response.status for response in responses], [400, 400, 400, 400, 400, 413])
        self.assertEqual(self.client.requests, [])
        for response in responses:
            self.assertNotIn(b"exception", response.body.lower())
            self.assertNotIn(b"cookie", response.body.lower())

    def test_rejects_absent_or_non_ascii_content_length_with_stable_framing_errors(self):
        missing = legal_raw_request(b"")
        non_ascii = legal_raw_request(b"Content-Length: \xff\r\n")
        with running_server(self.client) as server:
            missing_response = raw_request(server, missing)
            non_ascii_response = raw_request(server, non_ascii)

        self.assertEqual(missing_response.status, 411)
        self.assertEqual(non_ascii_response.status, 400)
        self.assertEqual(self.client.requests, [])

    def test_fails_closed_for_unallowlisted_routes_without_echoing_the_path(self):
        with running_server(self.client) as server:
            response = request_bytes(server, "/mcp?cookie=secret", token="service-test-token")

        self.assertEqual(response.status, 404)
        self.assertNotIn(b"cookie", response.body.lower())
        self.assertNotIn(b"secret", response.body.lower())


if __name__ == "__main__":
    unittest.main()
