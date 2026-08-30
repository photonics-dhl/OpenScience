import sys
import shutil
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from scansci_legal.policy import PolicyError, load_source_lock, validate_request, validate_source_result


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

    def test_canonicalizes_pinned_upstream_legal_source_labels(self):
        for route, source in (
            ("open_access", "oa_url"),
            ("open_access", "DOAJ"),
            ("publisher_api", "CrossrefPage"),
            ("publisher_api", "elsevier_api"),
            ("institutional", "CARSI"),
            ("institutional", "InstSci"),
            ("institutional", "institutional:broker:Elsevier"),
        ):
            with self.subTest(route=route):
                result = validate_source_result({"success": True, "route": route, "source": source})
                self.assertEqual(result.route, route)
                self.assertEqual(result.source, source)

    def test_rejects_mismatched_canonical_routes_for_raw_sources(self):
        for route, source in (
            ("institutional", "oa_url"),
            ("open_access", "CARSI"),
            ("publisher_api", "oa_url"),
        ):
            with self.subTest(route=route, source=source), self.assertRaises(PolicyError):
                validate_source_result({"success": True, "route": route, "source": source})

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

    def test_loads_a_coherent_source_lock_and_controlled_install_contract(self):
        source_lock = load_source_lock()

        self.assertEqual(source_lock.commit, "7017814758f826ea21470a609890a7d3ca374b8e")
        self.assertEqual(source_lock.archive_sha256, "db537914b9c149f2ef6ba148f47e316fddcfe350e4afe8f9fa88a2a1af9208b9")
        self.assertEqual(source_lock.install_command, "python -m pip install --require-hashes --no-build-isolation -r requirements.lock")

    def test_rejects_source_lock_drift_in_commit_hash_install_mode_and_build_requirements(self):
        app_root = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ("package.json", "requirements.in", "requirements.lock", "upstream.lock.json"):
                shutil.copy2(app_root / name, root / name)
            for name, old, new in (
                ("upstream.lock.json", "7017814758f826ea21470a609890a7d3ca374b8e", "0" * 40),
                ("upstream.lock.json", "db537914b9c149f2ef6ba148f47e316fddcfe350e4afe8f9fa88a2a1af9208b9", "0" * 64),
                ("package.json", "--no-build-isolation ", ""),
                ("requirements.in", "setuptools==", "setuptools>=68=="),
                ("requirements.in", "pycryptodome==", "pycryptodome>=3.20=="),
            ):
                with self.subTest(name=name, old=old):
                    path = root / name
                    original = path.read_text(encoding="utf-8")
                    path.write_text(original.replace(old, new, 1), encoding="utf-8")
                    with self.assertRaises(PolicyError):
                        load_source_lock(root)
                    path.write_text(original, encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
