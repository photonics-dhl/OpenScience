from __future__ import annotations

from contextlib import contextmanager
import http.client
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from scansci_legal.http_service import AcquisitionError, AcquiredPdf, create_server
from scansci_legal.policy import LegalDownloadRequest


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
            file_path=self.pdf,
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
            ("credentials", AcquiredPdf(self.pdf, "open_access", "oa_url", "https://user:secret@publisher.example/paper")),
            ("grey-source", AcquiredPdf(self.pdf, "institutional", "Sci-Hub", "https://publisher.example/paper")),
            ("grey-route", AcquiredPdf(self.pdf, "scihub", "CARSI", "https://publisher.example/paper")),
        ):
            with self.subTest(name=name), running_server(FakeClient(self.pdf, result=result)) as server:
                response = request_json(server, "/v1/legal-download", VALID_REQUEST, "service-test-token")
            self.assertEqual(response.status, 422)
            self.assertNotIn(b"secret", response.body.lower())

    def test_rejects_non_ascii_metadata_before_it_can_become_a_response_header(self):
        result = AcquiredPdf(self.pdf, "open_access", "oa_url", "https://publisher.example/paper", license="许可")
        with running_server(FakeClient(self.pdf, result=result)) as server:
            response = request_json(server, "/v1/legal-download", VALID_REQUEST, "service-test-token")

        self.assertEqual(response.status, 422)
        self.assertNotIn("许可".encode("utf-8"), response.body)

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

    def test_fails_closed_for_unallowlisted_routes_without_echoing_the_path(self):
        with running_server(self.client) as server:
            response = request_bytes(server, "/mcp?cookie=secret", token="service-test-token")

        self.assertEqual(response.status, 404)
        self.assertNotIn(b"cookie", response.body.lower())
        self.assertNotIn(b"secret", response.body.lower())


if __name__ == "__main__":
    unittest.main()
