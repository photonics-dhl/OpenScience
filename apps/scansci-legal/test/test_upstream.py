from __future__ import annotations

import os
from pathlib import Path
import json
import socket
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from scansci_legal.policy import LegalDownloadRequest
from scansci_legal.upstream import AcquisitionError, ScanSciAcquisitionClient, _sanitized_environment
from scansci_legal import upstream_worker


REQUEST = LegalDownloadRequest("10.1038/nature12373", "legal_only", False, False, True, "a" * 64)


class ScanSciAcquisitionClientTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        self.session_root = self.root / "session"
        cookie = self.session_root / "scansci" / "cache" / "carsi_cookies" / "sciencedirect.json"
        cookie.parent.mkdir(parents=True)
        cookie.write_text('[{"name":"session","value":"fixture"}]', encoding="utf-8")
        if os.name != "nt":
            for parent in (self.session_root, self.session_root / "scansci", self.session_root / "scansci" / "cache", cookie.parent):
                parent.chmod(0o700)
            cookie.chmod(0o600)

    def tearDown(self):
        self.directory.cleanup()

    def client(self, command: list[str]) -> ScanSciAcquisitionClient:
        return ScanSciAcquisitionClient(self.root, worker_command=command, session_root=self.session_root)

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
        result = self.client(self.worker()).acquire(REQUEST)

        self.assertEqual(result.route, "institutional")
        self.assertEqual(result.source, "CARSI")
        self.assertEqual(result.source_url, "https://publisher.example/paper")
        self.assertEqual(result.content, b"%PDF-safe-from-worker")

    def test_rejects_an_unsafe_fixed_config_before_the_worker_can_report_a_grey_source(self):
        result = self.client(self.worker("unsafe-config")).acquire(REQUEST)

        self.assertEqual(result.content, b"%PDF-safe-from-worker")

    def test_sanitizes_hostile_inherited_proxy_environment_before_starting_the_worker(self):
        hostile = {"SCANSCI_PDF_PROXY": "http://user:secret@proxy.example", "HTTP_PROXY": "http://proxy.example", "HTTPS_PROXY": "http://proxy.example", "ALL_PROXY": "socks5://proxy.example"}
        with mock.patch.dict(os.environ, hostile, clear=False):
            result = self.client(self.worker("hostile-env")).acquire(REQUEST)

        self.assertEqual(result.content, b"%PDF-safe-from-worker")

    def test_default_worker_resolves_home_and_scansci_config_inside_the_request_root(self):
        worker = Path(__file__).resolve().parents[1] / "src" / "scansci_legal" / "upstream_worker.py"
        environment = _sanitized_environment(self.root)
        completed = subprocess.run(
            [sys.executable, str(worker)], input=json.dumps({"probe": "environment", "output_dir": str(self.root)}).encode("utf-8"),
            cwd=self.root, env=environment, capture_output=True, check=False,
        )

        self.assertEqual(completed.returncode, 0)
        response = json.loads(completed.stdout.decode("utf-8"))
        self.assertEqual(response["home"], str(self.root))
        self.assertEqual(response["data_dir"], str(self.root))
        self.assertFalse(any(name.lower().endswith("proxy") for name in response["environment"]))
        if os.name == "nt":
            self.assertEqual(response["environment"]["USERPROFILE"], str(self.root))
            self.assertEqual(response["environment"]["HOMEDRIVE"] + response["environment"]["HOMEPATH"], str(self.root))
        else:
            self.assertNotIn("USERPROFILE", response["environment"])

    def test_discards_worker_stderr_and_returns_only_a_stable_error_code(self):
        with self.assertRaises(AcquisitionError) as raised:
            self.client(self.worker("leak")).acquire(REQUEST)

        self.assertEqual(raised.exception.code, "upstream_unavailable")
        self.assertNotIn("secret", str(raised.exception))
        self.assertNotIn("private", str(raised.exception))

    def test_preserves_the_worker_unavailable_code_without_turning_it_into_not_found(self):
        with self.assertRaises(AcquisitionError) as raised:
            self.client(self.worker("unavailable")).acquire(REQUEST)

        self.assertEqual(raised.exception.code, "upstream_unavailable")

    def test_rejects_non_successful_results_unknown_source_and_unsafe_urls(self):
        for behavior in ("failure", "grey-source", "unsafe-url"):
            with self.subTest(behavior=behavior):
                with self.assertRaises(AcquisitionError) as raised:
                    self.client(self.worker(behavior)).acquire(REQUEST)
                self.assertNotIn("secret", str(raised.exception))
                self.assertNotIn("private", str(raised.exception))

    def test_rejects_a_worker_result_that_points_outside_its_isolated_directory(self):
        script = self.root / "outside-worker.py"
        script.write_text(
            "import json, pathlib, sys\nrequest=json.load(sys.stdin)\npath=pathlib.Path(request['output_dir']).parent/'outside.pdf'\npath.write_bytes(b'%PDF-safe')\nprint(json.dumps({'success': True, 'file': str(path), 'source': 'CARSI', 'url': 'https://publisher.example/paper'}))\n",
            encoding="utf-8",
        )
        with self.assertRaises(AcquisitionError) as raised:
            self.client([sys.executable, str(script)]).acquire(REQUEST)
        self.assertEqual(raised.exception.code, "invalid_pdf")


class UpstreamNetworkBoundaryTest(unittest.TestCase):
    def guarded_resolve(self, records, port=443):
        guard = getattr(upstream_worker, "_guarded_getaddrinfo", None)
        if guard is None:
            self.fail("upstream DNS/redirect guard is missing")
        return guard(
            "publisher.example",
            port,
            0,
            socket.SOCK_STREAM,
            0,
            0,
            resolver=lambda *_args, **_kwargs: records,
        )

    def test_allows_only_public_addresses_for_https_connections(self):
        public = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))]
        self.assertEqual(self.guarded_resolve(public), public)

        for address in ("127.0.0.1", "10.0.0.1", "169.254.169.254", "192.0.2.1", "::1", "fc00::1"):
            family = socket.AF_INET6 if ":" in address else socket.AF_INET
            record = [(family, socket.SOCK_STREAM, 6, "", (address, 443))]
            with self.subTest(address=address), self.assertRaises(OSError):
                self.guarded_resolve(record)

    def test_rejects_dns_answers_mixed_with_private_addresses_and_non_https_ports(self):
        mixed = [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("169.254.169.254", 443)),
        ]
        with self.assertRaises(OSError):
            self.guarded_resolve(mixed)
        with self.assertRaises(OSError):
            self.guarded_resolve(mixed[:1], port=80)

    def test_rejects_non_https_and_credentialed_redirect_urls_before_send(self):
        guard = getattr(upstream_worker, "_require_public_https_url", None)
        if guard is None:
            self.fail("upstream redirect guard is missing")
        self.assertEqual(guard("https://publisher.example/paper"), "https://publisher.example/paper")
        for value in (
            "http://publisher.example:443/paper",
            "https://user:password@publisher.example/paper",
            "https://localhost/paper",
        ):
            with self.subTest(value=value), self.assertRaises(OSError):
                guard(value)


if __name__ == "__main__":
    unittest.main()
