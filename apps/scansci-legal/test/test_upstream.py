from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from scansci_legal.policy import LegalDownloadRequest
from scansci_legal.upstream import AcquisitionError, ScanSciAcquisitionClient


REQUEST = LegalDownloadRequest("10.1038/nature12373", "legal_only", False, False, True, "a" * 64)


class ScanSciAcquisitionClientTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)

    def tearDown(self):
        self.directory.cleanup()

    def test_uses_only_the_pinned_download_function_with_the_fixed_legal_arguments(self):
        captured: dict[str, object] = {}

        def download(identifier: str, output_dir: str, **kwargs):
            captured["identifier"] = identifier
            captured["output_dir"] = output_dir
            captured["kwargs"] = kwargs
            path = Path(output_dir) / "paper.pdf"
            path.write_bytes(b"%PDF-safe")
            return {"success": True, "file": str(path), "source": "CARSI", "url": "https://publisher.example/paper"}

        result = ScanSciAcquisitionClient(self.root, download_function=download).acquire(REQUEST)

        self.assertEqual(captured["identifier"], REQUEST.identifier)
        self.assertEqual(captured["kwargs"], {"scihub_enabled": False, "use_tor": False, "use_vpnsci": True, "bibtex": False, "rename": False, "strategy": "legal_only"})
        self.assertEqual(result.route, "institutional")
        self.assertEqual(result.source, "CARSI")
        self.assertEqual(result.source_url, "https://publisher.example/paper")

    def test_writes_a_fixed_upstream_config_with_no_proxy_tor_or_grey_paths(self):
        seen: dict[str, object] = {}

        def download(identifier: str, output_dir: str, **kwargs):
            config_path = Path(output_dir) / "scansci-legal-config.json"
            seen.update(json.loads(config_path.read_text(encoding="utf-8")))
            path = Path(output_dir) / "paper.pdf"
            path.write_bytes(b"%PDF-safe")
            return {"success": True, "file": str(path), "source": "oa_url", "url": "https://publisher.example/paper"}

        ScanSciAcquisitionClient(self.root, download_function=download).acquire(REQUEST)

        self.assertEqual(seen["download_strategy"], "legal_only")
        self.assertIs(seen["scihub_enabled"], False)
        self.assertIs(seen["use_tor"], False)
        self.assertEqual(seen["tor_proxy"], "")
        self.assertEqual(seen["network_proxy"], "")
        self.assertEqual(seen["proxy_pool"], "")
        self.assertEqual(seen["batch_workers"], 1)

    def test_rejects_non_successful_results_unknown_source_and_unsafe_urls(self):
        cases = (
            {"success": False, "error": "cookies=secret"},
            {"success": True, "file": str(self.root / "missing.pdf"), "source": "Sci-Hub", "url": "https://publisher.example/paper"},
            {"success": True, "file": str(self.root / "missing.pdf"), "source": "CARSI", "url": "http://127.0.0.1/private"},
        )
        for result in cases:
            with self.subTest(result=result["success"]):
                with self.assertRaises(AcquisitionError) as raised:
                    ScanSciAcquisitionClient(self.root, download_function=lambda *args, _result=result, **kwargs: _result).acquire(REQUEST)
                self.assertNotIn("secret", str(raised.exception))
                self.assertNotIn("private", str(raised.exception))

    def test_rejects_non_ascii_source_url_before_it_can_become_an_http_header(self):
        def download(identifier: str, output_dir: str, **kwargs):
            path = Path(output_dir) / "paper.pdf"
            path.write_bytes(b"%PDF-safe")
            return {"success": True, "file": str(path), "source": "CARSI", "url": "https://publisher.example/café"}

        with self.assertRaises(AcquisitionError) as raised:
            ScanSciAcquisitionClient(self.root, download_function=download).acquire(REQUEST)

        self.assertEqual(raised.exception.code, "policy_blocked")

    def test_rejects_a_result_file_outside_its_isolated_directory(self):
        external = self.root.parent / "outside.pdf"
        external.write_bytes(b"%PDF-safe")
        try:
            with self.assertRaises(AcquisitionError):
                ScanSciAcquisitionClient(self.root, download_function=lambda *args, **kwargs: {"success": True, "file": str(external), "source": "CARSI", "url": "https://publisher.example/paper"}).acquire(REQUEST)
        finally:
            external.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
