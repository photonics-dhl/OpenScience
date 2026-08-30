import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from scansci_legal.policy import PolicyError, validate_request, validate_source_result


VALID_REQUEST = {
    "identifier": "10.1038/nature12373",
    "strategy": "legal_only",
    "scihub": False,
    "tor": False,
    "institutional": True,
    "subject_id": "a" * 64,
}


class LegalPolicyTest(unittest.TestCase):
    def test_accepts_only_fixed_legal_contract(self):
        request = validate_request(VALID_REQUEST)

        self.assertEqual(request.identifier, "10.1038/nature12373")
        self.assertEqual(request.strategy, "legal_only")
        self.assertTrue(request.institutional)

    def test_accepts_arxiv_identifier(self):
        request = validate_request({**VALID_REQUEST, "identifier": "arXiv:2009.06045v2"})

        self.assertEqual(request.identifier, "arXiv:2009.06045v2")

    def test_rejects_grey_routes_and_arbitrary_urls(self):
        for change in (
            {"scihub": True},
            {"tor": True},
            {"strategy": "fastest"},
            {"identifier": "https://127.0.0.1/secret"},
        ):
            with self.subTest(change=change), self.assertRaises(PolicyError):
                validate_request({**VALID_REQUEST, **change})

    def test_rejects_unknown_keys_and_invalid_subject(self):
        for change in (
            {"callback": "https://example.test"},
            {"subject_id": "a" * 63},
            {"subject_id": "g" * 64},
        ):
            with self.subTest(change=change), self.assertRaises(PolicyError):
                validate_request({**VALID_REQUEST, **change})

    def test_rejects_a_request_above_the_four_kib_canonical_json_limit(self):
        with self.assertRaises(PolicyError):
            validate_request({**VALID_REQUEST, "identifier": "10.1000/" + ("a" * 5_000)})

    def test_accepts_only_allowlisted_successful_source_results(self):
        for route, source in (
            ("open_access", "Unpaywall"),
            ("publisher_api", "Crossref"),
            ("institutional", "Zhejiang University CARSI"),
        ):
            with self.subTest(route=route):
                result = validate_source_result({"success": True, "route": route, "source": source})
                self.assertEqual(result.route, route)
                self.assertEqual(result.source, source)

    def test_rejects_grey_source_labels_even_after_upstream_success(self):
        for source in ("Sci-Hub", "LibGen", "SciBban", "Tor"):
            with self.subTest(source=source), self.assertRaises(PolicyError):
                validate_source_result({"success": True, "route": "institutional", "source": source})

    def test_rejects_unknown_routes_and_result_keys(self):
        for result in (
            {"success": True, "route": "mirror", "source": "Unpaywall"},
            {"success": True, "route": "open_access", "source": "Unpaywall", "url": "https://example.test"},
        ):
            with self.subTest(result=result), self.assertRaises(PolicyError):
                validate_source_result(result)


if __name__ == "__main__":
    unittest.main()
