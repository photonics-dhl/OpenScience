from __future__ import annotations

import os
from pathlib import Path
import errno
import json
import socket
import subprocess
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from scansci_legal.policy import LegalDownloadRequest
from scansci_legal.upstream import AcquisitionError, ScanSciAcquisitionClient, _sanitized_environment
from scansci_legal import upstream_worker


REQUEST = LegalDownloadRequest("10.1038/nature12373", "legal_only", False, False, True, "a" * 64)


def _run_tiers_parallel(
    tiers, doi, target_dir, output_path, config, use_tor, overall_timeout,
):
    all_sources = [source for tier_sources, _tier_label, _tier_timeout in tiers for source in tier_sources]
    result_lock = threading.Lock()
    success_event = threading.Event()
    pool = ThreadPoolExecutor(max_workers=len(all_sources))
    try:
        futures = [
            pool.submit(
                _try_source,
                fn,
                doi,
                target_dir / f"{safe_filename(doi)}_{label}.pdf",
                config,
                label,
                use_tor,
            )
            for fn, label in all_sources
        ]
        success_event.wait(timeout=overall_timeout)
        for future in futures:
            result = future.result(timeout=overall_timeout)
            if result and result.get("success"):
                with result_lock:
                    return result
    finally:
        pool.shutdown(wait=False)
    return None


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

    def test_maps_only_the_fixed_controlled_egress_proxy_into_the_worker(self):
        with mock.patch.dict(os.environ, {"SCANSCI_EGRESS_PROXY": "http://openscience-egress:7891"}, clear=False):
            environment = _sanitized_environment(self.root)

        self.assertEqual(environment["SCANSCI_PDF_PROXY"], "http://openscience-egress:7891")
        self.assertEqual(environment["HTTP_PROXY"], "http://openscience-egress:7891")
        self.assertEqual(environment["HTTPS_PROXY"], "http://openscience-egress:7891")
        self.assertEqual(environment["NO_PROXY"], "localhost,127.0.0.1")
        self.assertNotIn("SCANSCI_EGRESS_PROXY", environment)

    def test_rejects_an_alternate_controlled_egress_proxy(self):
        with mock.patch.dict(os.environ, {"SCANSCI_EGRESS_PROXY": "http://attacker.invalid:7891"}, clear=False):
            with self.assertRaisesRegex(AcquisitionError, "policy_blocked"):
                _sanitized_environment(self.root)

    @unittest.skipIf(os.name == "nt", "production worker entry requires POSIX RLIMIT_FSIZE")
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

        public_nat64 = [(socket.AF_INET6, socket.SOCK_STREAM, 6, "", ("64:ff9b::808:808", 443))]
        self.assertEqual(self.guarded_resolve(public_nat64), public_nat64)

        for address in (
            "127.0.0.1", "10.0.0.1", "169.254.169.254", "192.0.2.1", "224.0.0.1",
            "::1", "fc00::1", "ff02::1",
            "64:ff9b::a9fe:a9fe",  # RFC 6052 NAT64 -> 169.254.169.254 metadata
            "64:ff9b::6464:64c8",  # RFC 6052 NAT64 -> Alibaba 100.100.100.200
            "64:ff9b:1::a9fe:a9fe",  # RFC 8215 local-use NAT64 prefix
            "::ffff:a9fe:a9fe",  # IPv4-mapped -> 169.254.169.254
            "2002:a9fe:a9fe::",  # 6to4 -> 169.254.169.254
            "2001:0000:0808:0808:0000:ffff:f5ff:fffe",  # Teredo client -> 10.0.0.1
        ):
            family = socket.AF_INET6 if ":" in address else socket.AF_INET
            record = [(family, socket.SOCK_STREAM, 6, "", (address, 443))]
            with self.subTest(address=address), self.assertRaises(OSError):
                self.guarded_resolve(record)

    def test_rejects_dns_answers_mixed_with_private_addresses_and_non_https_ports(self):
        mixed = [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443)),
            (socket.AF_INET6, socket.SOCK_STREAM, 6, "", ("64:ff9b::6464:64c8", 443)),
        ]
        with self.assertRaises(OSError):
            self.guarded_resolve(mixed)
        with self.assertRaises(OSError):
            self.guarded_resolve(mixed[:1], port=80)

    def test_allows_only_the_exact_controlled_proxy_socket_exception(self):
        guard = getattr(upstream_worker, "_guarded_getaddrinfo", None)
        if guard is None:
            self.fail("upstream DNS/redirect guard is missing")
        proxy = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("172.24.0.1", 7891))]
        self.assertEqual(guard(
            "openscience-egress", 7891, 0, socket.SOCK_STREAM, 0, 0,
            resolver=lambda *_args, **_kwargs: proxy,
        ), proxy)
        for host, records in (
            ("wrong-egress", proxy),
            ("openscience-egress", [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("172.24.0.2", 7891))]),
        ):
            with self.subTest(host=host), self.assertRaises(OSError):
                guard(host, 7891, 0, socket.SOCK_STREAM, 0, 0, resolver=lambda *_args, _records=records, **_kwargs: _records)

    def test_rejects_non_https_and_credentialed_redirect_urls_before_send(self):
        guard = getattr(upstream_worker, "_require_public_https_url", None)
        if guard is None:
            self.fail("upstream redirect guard is missing")
        self.assertEqual(guard("https://publisher.example/paper"), "https://publisher.example/paper")
        for value in (
            "http://publisher.example:443/paper",
            "https://publisher.example:444/paper",
            "https://user:password@publisher.example/paper",
            "https://localhost/paper",
            "https://[64:ff9b::a9fe:a9fe]/latest/meta-data",
            "https://[64:ff9b::6464:64c8]/latest/meta-data",
            "https://[64:ff9b:1::a9fe:a9fe]/latest/meta-data",
        ):
            with self.subTest(value=value), self.assertRaises(OSError):
                guard(value)


class SerialLegalSourceOverrideTest(unittest.TestCase):
    def module(self):
        negative_cache = set()
        negative_events = []

        def try_source(source, _doi, output_path, _config, _label, use_tor=False):
            if use_tor:
                raise AssertionError("Tor reached an upstream source")
            return source(output_path)

        def neg_blocked(label, doi):
            negative_events.append(("blocked", label, doi))
            return (label, doi) in negative_cache

        def neg_record(label, doi, result):
            negative_events.append(("record", label, doi, result))
            if result and not result.get("cancelled"):
                negative_cache.add((label, doi))

        return SimpleNamespace(
            _run_tiers_parallel=_run_tiers_parallel,
            _try_source=try_source,
            safe_filename=lambda _doi: "paper",
            _neg_blocked=neg_blocked,
            _neg_record=neg_record,
            negative_cache=negative_cache,
            negative_events=negative_events,
        )

    def installer(self):
        installer = getattr(upstream_worker, "_install_serial_legal_source_override", None)
        if installer is None:
            self.fail("serial legal-source override is missing")
        return installer

    def test_runs_sources_serially_in_tier_order_stops_on_first_success_and_cleans_temps(self):
        module = self.module()
        self.installer()(module)
        active = 0
        maximum_active = 0
        calls = []
        lock = threading.Lock()

        def source(label, succeeds):
            def run(path):
                nonlocal active, maximum_active
                with lock:
                    active += 1
                    maximum_active = max(maximum_active, active)
                    calls.append(label)
                path.write_bytes(b"%PDF-source-temp")
                time.sleep(0.02)
                with lock:
                    active -= 1
                return {"success": True, "file": str(path), "source": "Unpaywall"} if succeeds else None
            return run

        config = {
            "download_strategy": "legal_only", "scihub_enabled": False,
            "use_tor": False, "use_tor_for_scihub": False,
            "network_proxy": "", "proxy_pool": "", "batch_workers": 1,
            "parallel_sources": False, "parallel_probes": False,
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "paper.pdf"
            tiers = [
                ([(source("free-first", False), "Unpaywall"), (source("free-second", True), "DOAJ")], "free", 5),
                ([(source("institutional-never", True), "CARSI")], "institutional", 5),
            ]
            with mock.patch(f"{__name__}.ThreadPoolExecutor", side_effect=AssertionError("parallel fanout")):
                result = module._run_tiers_parallel(tiers, "10.1000/example", root, output, config, False, 10)

            self.assertEqual(calls, ["free-first", "free-second"])
            self.assertEqual(maximum_active, 1)
            self.assertEqual(result["file"], str(output))
            self.assertEqual(output.read_bytes(), b"%PDF-source-temp")
            self.assertEqual(list(root.glob("paper_*.pdf")), [])

    def test_rejects_parallel_source_drift_and_non_legal_runtime_flags(self):
        module = self.module()
        with self.assertRaises(RuntimeError):
            self.installer()(module, source_reader=lambda _function: (
                "def _run_tiers_parallel(tiers, doi, target_dir, output_path, config, use_tor, overall_timeout):\n"
                "    return None\n"
            ))
        self.assertIs(module._run_tiers_parallel, _run_tiers_parallel)

        self.installer()(module)
        calls = []
        config = {
            "download_strategy": "legal_only", "scihub_enabled": True,
            "use_tor": False, "use_tor_for_scihub": False,
            "network_proxy": "", "proxy_pool": "", "batch_workers": 1,
            "parallel_sources": False, "parallel_probes": False,
        }
        with tempfile.TemporaryDirectory() as directory, self.assertRaises(RuntimeError):
            module._run_tiers_parallel(
                [([(lambda _path: calls.append("called"), "Sci-Hub")], "grey", 1)],
                "10.1000/example", Path(directory), Path(directory) / "paper.pdf", config, False, 1,
            )
        self.assertEqual(calls, [])

    def test_preserves_negative_cache_across_free_and_institutional_invocations(self):
        module = self.module()
        self.installer()(module)
        calls = []
        cancelled = {"success": False, "cancelled": True, "error_type": "cancelled"}
        failed = {"success": False, "error_type": "not_found"}
        config = {
            "download_strategy": "legal_only", "scihub_enabled": False,
            "use_tor": False, "use_tor_for_scihub": False,
            "network_proxy": "", "proxy_pool": "", "batch_workers": 1,
            "parallel_sources": False, "parallel_probes": False,
        }

        def source(label, result):
            def run(path):
                calls.append(label)
                path.write_bytes(b"%PDF-partial")
                return {**result, "file": str(path)} if result.get("success") else result
            return run

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "paper.pdf"
            free = [([
                (source("cancelled", cancelled), "Cancelled"),
                (source("failed", failed), "Failed"),
            ], "free", 5)]
            self.assertIsNone(module._run_tiers_parallel(free, "10.1000/example", root, output, config, False, 10))
            self.assertEqual(list(root.glob("paper_*.pdf")), [])
            self.assertEqual(module.negative_cache, {("Failed", "10.1000/example")})

            blocked_sentinel = root / "paper_Failed.pdf"
            blocked_sentinel.write_bytes(b"do-not-touch-blocked")
            institutional = [([
                (source("blocked-should-not-run", failed), "Failed"),
                (source("institutional-success", {"success": True, "source": "CARSI"}), "CARSI"),
            ], "institutional", 5)]
            result = module._run_tiers_parallel(
                institutional, "10.1000/example", root, output, config, False, 10,
            )

            self.assertEqual(calls, ["cancelled", "failed", "institutional-success"])
            self.assertEqual(blocked_sentinel.read_bytes(), b"do-not-touch-blocked")
            self.assertEqual(result["source"], "CARSI")
            self.assertEqual(result["file"], str(output))
            records = [event for event in module.negative_events if event[0] == "record"]
            self.assertEqual([(event[1], event[2]) for event in records], [
                ("Cancelled", "10.1000/example"),
                ("Failed", "10.1000/example"),
            ])
            self.assertIs(records[0][3], cancelled)
            self.assertIs(records[1][3], failed)

    def test_rejects_missing_negative_cache_helpers_before_any_source_call(self):
        for helper in ("_neg_blocked", "_neg_record"):
            module = self.module()
            delattr(module, helper)
            with self.subTest(helper=helper), self.assertRaises(RuntimeError):
                self.installer()(module)

    def test_cleans_an_efbig_partial_and_continues_with_the_next_serial_source(self):
        module = self.module()
        self.installer()(module)
        calls = []
        config = {
            "download_strategy": "legal_only", "scihub_enabled": False,
            "use_tor": False, "use_tor_for_scihub": False,
            "network_proxy": "", "proxy_pool": "", "batch_workers": 1,
            "parallel_sources": False, "parallel_probes": False,
        }

        def too_large(path):
            calls.append("too-large")
            path.write_bytes(b"partial")
            raise OSError(errno.EFBIG, "sensitive upstream path")

        def success(path):
            calls.append("success")
            path.write_bytes(b"%PDF-success")
            return {"success": True, "file": str(path), "source": "Unpaywall"}

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "paper.pdf"
            result = module._run_tiers_parallel(
                [([(too_large, "TooLarge"), (success, "Unpaywall")], "free", 5)],
                "10.1000/example", root, output, config, False, 10,
            )
            self.assertEqual(calls, ["too-large", "success"])
            self.assertEqual(output.read_bytes(), b"%PDF-success")
            self.assertEqual(result["file"], str(output))
            self.assertFalse((root / "paper_TooLarge.pdf").exists())

    def test_rejects_success_that_does_not_reference_the_exact_source_temp(self):
        module = self.module()
        self.installer()(module)
        config = {
            "download_strategy": "legal_only", "scihub_enabled": False,
            "use_tor": False, "use_tor_for_scihub": False,
            "network_proxy": "", "proxy_pool": "", "batch_workers": 1,
            "parallel_sources": False, "parallel_probes": False,
        }

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            other = root / "other.pdf"

            def wrong_path(_source_path):
                other.write_bytes(b"%PDF-wrong-path")
                return {"success": True, "file": str(other), "source": "Unpaywall"}

            with self.assertRaises(RuntimeError):
                module._run_tiers_parallel(
                    [([(wrong_path, "Unpaywall")], "free", 5)],
                    "10.1000/example", root, root / "paper.pdf", config, False, 10,
                )
            self.assertFalse((root / "paper.pdf").exists())


class SourceFileLimitTest(unittest.TestCase):
    def installer(self):
        installer = getattr(upstream_worker, "_install_source_file_limit", None)
        if installer is None:
            self.fail("source file limit installer is missing")
        return installer

    def executor(self):
        executor = getattr(upstream_worker, "_execute_worker_request", None)
        if executor is None:
            self.fail("common worker request executor is missing")
        return executor

    def test_probe_and_acquisition_share_one_verified_limit_prelude(self):
        exact = "104857600:104857600"

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "config.json").write_text("{}", encoding="utf-8")

            probe_events = []
            probe = self.executor()(
                {"probe": "file-limit", "output_dir": str(root)},
                root,
                file_limit_installer=lambda: probe_events.append("install"),
                file_limit_reader=lambda: probe_events.append("read") or exact,
                sources_loader=lambda: self.fail("probe imported upstream"),
                override_installer=lambda _module: self.fail("probe installed upstream override"),
            )
            self.assertEqual(probe, {"file_limit": exact})
            self.assertEqual(probe_events, ["install", "read"])

            acquisition_events = []

            class Sources:
                @staticmethod
                def download(*_args, **_kwargs):
                    acquisition_events.append("download")
                    return {"success": False, "error_type": "not_found"}

            response = self.executor()(
                {"identifier": "10.1000/example", "output_dir": str(root)},
                root,
                file_limit_installer=lambda: acquisition_events.append("install"),
                file_limit_reader=lambda: acquisition_events.append("read") or exact,
                sources_loader=lambda: acquisition_events.append("load") or Sources,
                override_installer=lambda _module: acquisition_events.append("override"),
            )
            self.assertEqual(response, {"success": False, "error_type": "not_found"})
            self.assertEqual(acquisition_events, ["install", "read", "load", "override", "download"])

    def test_fresh_tmp_probe_uses_no_files_or_upstream_while_acquisition_requires_config(self):
        exact = "104857600:104857600"
        events = []
        with tempfile.TemporaryDirectory() as directory:
            tmp = Path(directory) / "tmp"
            tmp.mkdir()
            self.assertFalse((tmp / "scansci-legal").exists())
            with mock.patch.object(Path, "is_file", side_effect=AssertionError("probe read a file")), \
                    mock.patch("builtins.open", side_effect=AssertionError("probe opened a file")):
                response = self.executor()(
                    {"probe": "file-limit", "output_dir": "/tmp"},
                    tmp,
                    file_limit_installer=lambda: events.append("install"),
                    file_limit_reader=lambda: events.append("read") or exact,
                    sources_loader=lambda: self.fail("probe imported upstream"),
                    override_installer=lambda _module: self.fail("probe installed upstream override"),
                )
            self.assertEqual(response, {"file_limit": exact})
            self.assertEqual(events, ["install", "read"])
            self.assertEqual(list(tmp.iterdir()), [])

            loaded = []
            with self.assertRaises(ValueError):
                self.executor()(
                    {"identifier": "10.1000/example", "output_dir": "/tmp"},
                    tmp,
                    file_limit_installer=lambda: None,
                    file_limit_reader=lambda: exact,
                    sources_loader=lambda: loaded.append("upstream"),
                    override_installer=lambda _module: None,
                )
            self.assertEqual(loaded, [])

    def test_missing_common_entry_install_breaks_probe_and_acquisition_before_upstream(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "config.json").write_text("{}", encoding="utf-8")
            loaded = []
            for request in (
                {"probe": "file-limit", "output_dir": str(root)},
                {"identifier": "10.1000/example", "output_dir": str(root)},
            ):
                with self.subTest(request=request), self.assertRaises(RuntimeError):
                    self.executor()(
                        request,
                        root,
                        file_limit_installer=lambda: None,
                        file_limit_reader=lambda: "-1:-1",
                        sources_loader=lambda: loaded.append("upstream"),
                        override_installer=lambda _module: None,
                    )
            self.assertEqual(loaded, [])

    def test_installs_exact_soft_and_hard_limit_after_the_signal_handler(self):
        events = []

        class FakeResource:
            RLIMIT_FSIZE = 1
            RLIM_INFINITY = -1
            current = None

            @classmethod
            def getrlimit(cls, kind):
                events.append(("getrlimit", kind))
                return cls.current

            @classmethod
            def setrlimit(cls, kind, limits):
                events.append(("setrlimit", kind, limits))
                cls.current = limits

        FakeResource.current = (FakeResource.RLIM_INFINITY, FakeResource.RLIM_INFINITY)

        class FakeSignal:
            SIGXFSZ = 25

            @staticmethod
            def signal(number, handler):
                events.append(("signal", number, callable(handler)))

        self.installer()(100 * 1024 * 1024, resource_module=FakeResource, signal_module=FakeSignal)
        self.assertEqual(events, [
            ("getrlimit", FakeResource.RLIMIT_FSIZE),
            ("signal", FakeSignal.SIGXFSZ, True),
            ("setrlimit", FakeResource.RLIMIT_FSIZE, (100 * 1024 * 1024, 100 * 1024 * 1024)),
            ("getrlimit", FakeResource.RLIMIT_FSIZE),
        ])

        FakeResource.current = (4096, 4096)
        events.clear()
        with self.assertRaises(RuntimeError):
            self.installer()(4097, resource_module=FakeResource, signal_module=FakeSignal)
        self.assertEqual(events, [("getrlimit", FakeResource.RLIMIT_FSIZE)])

    @unittest.skipUnless(os.name == "posix", "RLIMIT_FSIZE is a Linux production boundary")
    def test_posix_kernel_blocks_the_first_byte_over_limit_and_external_children_inherit(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            script = """
import errno, json, subprocess, sys
from pathlib import Path
from scansci_legal.upstream_worker import _install_source_file_limit
limit = 4096
_install_source_file_limit(limit)
root = Path(sys.argv[1])
parent = root / 'parent.bin'
parent_errno = None
try:
    with parent.open('wb') as handle:
        handle.write(b'x' * limit)
        handle.flush()
        handle.write(b'y')
        handle.flush()
except OSError as error:
    parent_errno = error.errno
child = root / 'child.bin'
child_code = "from pathlib import Path; import sys; p=Path(sys.argv[1]); f=p.open('wb'); f.write(b'x'*4096); f.flush(); f.write(b'y'); f.flush()"
completed = subprocess.run([sys.executable, '-c', child_code, str(child)], check=False)
print(json.dumps({'parentSize': parent.stat().st_size, 'parentErrno': parent_errno, 'childSize': child.stat().st_size, 'childCode': completed.returncode}))
"""
            environment = {**os.environ, "PYTHONPATH": str(Path(__file__).resolve().parents[1] / "src")}
            completed = subprocess.run(
                [sys.executable, "-c", script, str(root)],
                cwd=root, env=environment, capture_output=True, text=True, check=False,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            result = json.loads(completed.stdout)
            self.assertEqual(result["parentSize"], 4096)
            self.assertEqual(result["parentErrno"], errno.EFBIG)
            self.assertLessEqual(result["childSize"], 4096)
            self.assertNotEqual(result["childCode"], 0)


if __name__ == "__main__":
    unittest.main()
