from __future__ import annotations

import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

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

    def worker(self, behavior: str = "success") -> list[str]:
        script = self.root / "fake-upstream-worker.py"
        script.write_text(
            """import json, os, pathlib, sys
request = json.load(sys.stdin)
output = pathlib.Path(request['output_dir'])
config = json.loads((output / 'config.json').read_text(encoding='utf-8'))
proxies = ('SCANSCI_PDF_PROXY', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy')
behavior = %r
if behavior == 'leak':
    print('cookie=secret https://user:password@proxy.example/private', file=sys.stderr)
    raise RuntimeError('cookie=secret /private/path')
if behavior == 'failure':
    print(json.dumps({'success': False, 'error_type': 'not_found'}))
    raise SystemExit(0)
if behavior == 'unavailable':
    print(json.dumps({'success': False, 'error_type': 'upstream_unavailable'}))
    raise SystemExit(0)
if behavior == 'hostile-env' and any(os.environ.get(name) for name in proxies):
    print(json.dumps({'success': False, 'error_type': 'not_found'}))
    raise SystemExit(0)
if behavior == 'unsafe-config' and (config['network_proxy'] or config['proxy_pool'] or config['tor_proxy'] or config['scihub_enabled'] or config['use_tor'] or config['batch_workers'] != 1):
    print(json.dumps({'success': True, 'file': str(output / 'paper.pdf'), 'source': 'Sci-Hub', 'url': 'https://publisher.example/paper'}))
    raise SystemExit(0)
paper = output / 'paper.pdf'
paper.write_bytes(b'%%PDF-safe-from-worker')
if behavior == 'grey-source':
    print(json.dumps({'success': True, 'file': str(paper), 'source': 'Sci-Hub', 'url': 'https://publisher.example/paper'}))
    raise SystemExit(0)
if behavior == 'unsafe-url':
    print(json.dumps({'success': True, 'file': str(paper), 'source': 'CARSI', 'url': 'http://127.0.0.1/private'}))
    raise SystemExit(0)
print(json.dumps({'success': True, 'file': str(paper), 'source': 'CARSI', 'url': 'https://publisher.example/paper'}))
""" % behavior,
            encoding="utf-8",
        )
        return [sys.executable, str(script)]

    def test_runs_the_worker_with_a_fixed_legal_config_and_returns_parent_owned_bytes(self):
        result = ScanSciAcquisitionClient(self.root, worker_command=self.worker()).acquire(REQUEST)

        self.assertEqual(result.route, "institutional")
        self.assertEqual(result.source, "CARSI")
        self.assertEqual(result.source_url, "https://publisher.example/paper")
        self.assertEqual(result.content, b"%PDF-safe-from-worker")

    def test_rejects_an_unsafe_fixed_config_before_the_worker_can_report_a_grey_source(self):
        result = ScanSciAcquisitionClient(self.root, worker_command=self.worker("unsafe-config")).acquire(REQUEST)

        self.assertEqual(result.content, b"%PDF-safe-from-worker")

    def test_sanitizes_hostile_inherited_proxy_environment_before_starting_the_worker(self):
        hostile = {"SCANSCI_PDF_PROXY": "http://user:secret@proxy.example", "HTTP_PROXY": "http://proxy.example", "HTTPS_PROXY": "http://proxy.example", "ALL_PROXY": "socks5://proxy.example"}
        with mock.patch.dict(os.environ, hostile, clear=False):
            result = ScanSciAcquisitionClient(self.root, worker_command=self.worker("hostile-env")).acquire(REQUEST)

        self.assertEqual(result.content, b"%PDF-safe-from-worker")

    def test_discards_worker_stderr_and_returns_only_a_stable_error_code(self):
        with self.assertRaises(AcquisitionError) as raised:
            ScanSciAcquisitionClient(self.root, worker_command=self.worker("leak")).acquire(REQUEST)

        self.assertEqual(raised.exception.code, "upstream_unavailable")
        self.assertNotIn("secret", str(raised.exception))
        self.assertNotIn("private", str(raised.exception))

    def test_preserves_the_worker_unavailable_code_without_turning_it_into_not_found(self):
        with self.assertRaises(AcquisitionError) as raised:
            ScanSciAcquisitionClient(self.root, worker_command=self.worker("unavailable")).acquire(REQUEST)

        self.assertEqual(raised.exception.code, "upstream_unavailable")

    def test_rejects_non_successful_results_unknown_source_and_unsafe_urls(self):
        for behavior in ("failure", "grey-source", "unsafe-url"):
            with self.subTest(behavior=behavior):
                with self.assertRaises(AcquisitionError) as raised:
                    ScanSciAcquisitionClient(self.root, worker_command=self.worker(behavior)).acquire(REQUEST)
                self.assertNotIn("secret", str(raised.exception))
                self.assertNotIn("private", str(raised.exception))

    def test_rejects_a_worker_result_that_points_outside_its_isolated_directory(self):
        script = self.root / "outside-worker.py"
        script.write_text(
            "import json, pathlib, sys\nrequest=json.load(sys.stdin)\npath=pathlib.Path(request['output_dir']).parent/'outside.pdf'\npath.write_bytes(b'%PDF-safe')\nprint(json.dumps({'success': True, 'file': str(path), 'source': 'CARSI', 'url': 'https://publisher.example/paper'}))\n",
            encoding="utf-8",
        )
        with self.assertRaises(AcquisitionError) as raised:
            ScanSciAcquisitionClient(self.root, worker_command=[sys.executable, str(script)]).acquire(REQUEST)
        self.assertEqual(raised.exception.code, "invalid_pdf")


if __name__ == "__main__":
    unittest.main()
