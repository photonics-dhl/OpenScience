from __future__ import annotations

import io
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from scansci_legal.oa_canary import build_request_payload, inspect_pdf_response
from scansci_legal.policy import validate_request, validate_source_result


class OaCanaryTest(unittest.TestCase):
    def test_payload_satisfies_the_real_legal_download_contract_but_requires_an_oa_result(self):
        payload = build_request_payload()
        request = validate_request(payload)

        self.assertEqual(request.identifier, "arXiv:2009.06045v1")
        self.assertTrue(request.institutional)

    def test_response_inspection_streams_a_bounded_oa_pdf_without_returning_bytes(self):
        source = validate_source_result({"success": True, "route": "open_access", "source": "arXiv"})
        response = io.BytesIO(b"%PDF-canary")
        response.headers = _Headers(source.route)  # type: ignore[attr-defined]

        self.assertEqual(inspect_pdf_response(response), {
            "identifier": "arXiv:2009.06045v1",
            "route": "open_access",
            "contentType": "application/pdf",
            "magic": "%PDF-",
            "bytes": 11,
        })


class _Headers:
    def __init__(self, route):
        self.route = route

    def get_content_type(self):
        return "application/pdf"

    def get(self, name):
        return self.route if name == "X-ScanSci-Route" else None


if __name__ == "__main__":
    unittest.main()
