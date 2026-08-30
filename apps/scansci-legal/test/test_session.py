from __future__ import annotations

import json
import os
import stat as stat_module
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
import http.client
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import scansci_legal.auth_login as auth_login
import scansci_legal.upstream as upstream_module
from scansci_legal.auth_login import main as auth_main
from scansci_legal.http_service import create_server
from scansci_legal.session import PersistedProfileRefresher, SessionManager, SessionSnapshot, SessionStore
from scansci_legal.policy import LegalDownloadRequest
from scansci_legal.upstream import AcquiredPdf, AcquisitionError, ScanSciAcquisitionClient


class FakeClock:
    def __init__(self, value: float = 10_000.0):
        self.value = value

    def __call__(self) -> float:
        return self.value

    def advance(self, seconds: float) -> None:
        self.value += seconds


class FakeRefresher:
    def __init__(self, *, refresh_results: list[object] | None = None):
        self.probe_calls = 0
        self.refresh_calls = 0
        self.refresh_results = list(refresh_results or [True])
        self.entered = threading.Event()
        self.release = threading.Event()

    def probe(self, _profile_root: Path) -> bool:
        self.probe_calls += 1
        return True

    def refresh(self, _profile_root: Path) -> object:
        self.refresh_calls += 1
        self.entered.set()
        self.release.wait(timeout=2)
        result = self.refresh_results.pop(0) if self.refresh_results else False
        if isinstance(result, BaseException):
            raise result
        return result


class SessionManagerTest(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name) / "session"
        self.root.mkdir(mode=0o700)
        try:
            self.root.chmod(0o700)
        except OSError:
            pass

    def tearDown(self) -> None:
        self.directory.cleanup()

    def create_persisted_profile(self) -> None:
        cookie = self.root / "scansci" / "cache" / "carsi_cookies" / "sciencedirect.json"
        cookie.parent.mkdir(parents=True)
        cookie.write_text('[{"name":"session","value":"sensitive-cookie"}]', encoding="utf-8")
        if os.name != "nt":
            for directory in (cookie.parent.parent.parent, cookie.parent.parent, cookie.parent):
                directory.chmod(0o700)
            cookie.chmod(0o600)

    def store(self) -> SessionStore:
        return SessionStore(self.root, expected_uid=None, enforce_permissions=os.name != "nt")

    def test_reuses_a_safe_persisted_profile_after_manager_recreation(self) -> None:
        self.create_persisted_profile()
        clock = FakeClock()
        refresher = FakeRefresher()

        first = SessionManager(self.store(), refresher, clock)
        second = SessionManager(self.store(), refresher, clock)

        self.assertEqual(first.status(), "ready")
        self.assertEqual(second.status(), "ready")
        state_text = (self.root / "session-state.json").read_text(encoding="utf-8")
        self.assertNotIn("sensitive-cookie", state_text)
        self.assertNotIn("sciencedirect.json", state_text)

    def test_status_probes_at_most_once_per_fifteen_minutes(self) -> None:
        self.create_persisted_profile()
        clock = FakeClock()
        refresher = FakeRefresher()
        manager = SessionManager(self.store(), refresher, clock)

        self.assertEqual(manager.status(), "ready")
        self.assertEqual(manager.status(), "ready")
        clock.advance(899)
        self.assertEqual(manager.status(), "ready")
        self.assertEqual(refresher.probe_calls, 1)

        clock.advance(1)
        self.assertEqual(manager.status(), "ready")
        self.assertEqual(refresher.probe_calls, 2)

    def test_persisted_refresher_requires_a_real_session_validation(self) -> None:
        self.create_persisted_profile()
        calls: list[Path] = []
        valid = True

        def validator(root: Path) -> bool:
            calls.append(root)
            return valid

        refresher = PersistedProfileRefresher(self.store(), validator=validator)

        self.assertIs(refresher.probe(self.root), True)
        valid = False
        self.assertIs(refresher.refresh(self.root), False)
        self.assertEqual(calls, [self.root.resolve(), self.root.resolve()])

    def test_one_auth_redirect_runs_one_single_flight_refresh(self) -> None:
        self.create_persisted_profile()
        clock = FakeClock()
        refresher = FakeRefresher(refresh_results=[True])
        manager = SessionManager(self.store(), refresher, clock)

        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(manager.on_auth_redirect) for _ in range(5)]
            self.assertTrue(refresher.entered.wait(timeout=1))
            refresher.release.set()
            states = [future.result(timeout=2) for future in futures]

        self.assertEqual(refresher.refresh_calls, 1)
        self.assertEqual(states.count("ready"), 1)
        self.assertEqual(states.count("refreshing"), 4)
        self.assertEqual(SessionManager(self.store(), refresher, clock).status(), "ready")

    def test_repeated_failures_back_off_exponentially_and_cap_at_six_hours(self) -> None:
        self.create_persisted_profile()
        clock = FakeClock()
        refresher = FakeRefresher(refresh_results=[False] * 12)
        refresher.release.set()
        manager = SessionManager(self.store(), refresher, clock)

        expected_delay = 60
        for attempt in range(1, 11):
            self.assertEqual(manager.on_auth_redirect(), "auth_required")
            state = json.loads((self.root / "session-state.json").read_text(encoding="utf-8"))
            self.assertEqual(state["failure_count"], attempt)
            self.assertEqual(state["next_attempt_at"] - clock(), expected_delay)
            calls = refresher.refresh_calls
            self.assertEqual(manager.on_auth_redirect(), "auth_required")
            self.assertEqual(refresher.refresh_calls, calls)
            clock.advance(expected_delay)
            expected_delay = min(expected_delay * 2, 6 * 60 * 60)

        self.assertEqual(expected_delay, 6 * 60 * 60)

    def test_refresh_failures_store_only_a_stable_redacted_reason(self) -> None:
        self.create_persisted_profile()
        password = "operator-password-never-persist"
        refresher = FakeRefresher(
            refresh_results=[RuntimeError(f"MFA CAPTCHA rejected password={password}")],
        )
        refresher.release.set()
        manager = SessionManager(self.store(), refresher, FakeClock())

        self.assertEqual(manager.on_auth_redirect(), "auth_required")
        persisted = (self.root / "session-state.json").read_text(encoding="utf-8")
        self.assertNotIn(password, persisted)
        self.assertNotIn("MFA", persisted)
        self.assertNotIn("CAPTCHA", persisted)
        self.assertEqual(json.loads(persisted)["reason"], "operator_auth_required")

    def test_disabled_manager_never_probes_or_refreshes(self) -> None:
        self.create_persisted_profile()
        refresher = FakeRefresher()
        refresher.release.set()
        manager = SessionManager(self.store(), refresher, FakeClock(), enabled=False)

        self.assertEqual(manager.status(), "disabled")
        self.assertEqual(manager.on_auth_redirect(), "disabled")
        self.assertEqual((refresher.probe_calls, refresher.refresh_calls), (0, 0))

    def test_disabled_manager_ignores_newer_persisted_ready_state(self) -> None:
        self.create_persisted_profile()
        store = self.store()
        refresher = FakeRefresher()
        refresher.release.set()
        manager = SessionManager(store, refresher, FakeClock(), enabled=False)
        store.publish_status("ready")

        self.assertEqual(manager.status(), "disabled")
        self.assertEqual(manager.on_auth_redirect(), "disabled")
        self.assertEqual((refresher.probe_calls, refresher.refresh_calls), (0, 0))

    def test_reenabling_after_disabled_recovers_the_persisted_profile(self) -> None:
        self.create_persisted_profile()
        refresher = FakeRefresher()
        SessionManager(self.store(), refresher, FakeClock(), enabled=False)

        restored = SessionManager(self.store(), refresher, FakeClock(), enabled=True)

        self.assertEqual(restored.status(), "ready")

    def test_expired_refresh_lease_recovers_after_manager_recreation(self) -> None:
        self.create_persisted_profile()
        clock = FakeClock()
        store = self.store()
        store.save(SessionSnapshot("refreshing", lease_until=clock() + 300))
        refresher = FakeRefresher(refresh_results=[False])
        refresher.release.set()
        clock.advance(301)

        restored = SessionManager(store, refresher, clock)

        self.assertEqual(restored.status(), "auth_required")
        self.assertEqual(refresher.refresh_calls, 1)

    def test_running_manager_observes_helper_ready_without_restart(self) -> None:
        clock = FakeClock()
        manager = SessionManager(self.store(), FakeRefresher(), clock)
        self.assertEqual(manager.status(), "auth_required")

        result = auth_main(
            ["--operator-start"],
            runner=lambda *_args, **_kwargs: type("Completed", (), {"returncode": 0})(),
            session_root=self.root,
        )

        self.assertEqual(result, 0)
        self.assertEqual(manager.status(), "ready")

    def test_stale_state_writer_cannot_clobber_newer_helper_generation(self) -> None:
        store = self.store()
        store.ensure_root()
        stale = store.load("auth_required")
        auth_main(
            ["--operator-start"],
            runner=lambda *_args, **_kwargs: type("Completed", (), {"returncode": 0})(),
            session_root=self.root,
        )

        written = store.save(
            replace(stale, status="auth_required", reason="operator_auth_required"),
            expected_generation=stale.generation,
        )

        self.assertIs(written, False)
        self.assertEqual(store.load("auth_required").status, "ready")

    def test_status_observes_refreshing_without_waiting_for_network_refresh(self) -> None:
        self.create_persisted_profile()
        refresher = FakeRefresher(refresh_results=[True])
        manager = SessionManager(self.store(), refresher, FakeClock())
        thread = threading.Thread(target=manager.on_auth_redirect)
        thread.start()
        self.assertTrue(refresher.entered.wait(timeout=1))

        started = time.monotonic()
        state = manager.status()
        elapsed = time.monotonic() - started

        refresher.release.set()
        thread.join(timeout=2)
        self.assertEqual(state, "refreshing")
        self.assertLess(elapsed, 0.2)

    def test_expired_lease_takeover_is_owner_safe_when_first_refresh_finishes_late(self) -> None:
        self.create_persisted_profile()
        clock = FakeClock()
        first = FakeRefresher(refresh_results=[False])
        second = FakeRefresher(refresh_results=[True])
        third = FakeRefresher(refresh_results=[True])
        manager_one = SessionManager(self.store(), first, clock)
        manager_two = SessionManager(self.store(), second, clock)
        manager_three = SessionManager(self.store(), third, clock)
        thread_one = threading.Thread(target=manager_one.on_auth_redirect)
        thread_one.start()
        self.assertTrue(first.entered.wait(timeout=1))
        clock.advance(301)
        thread_two = threading.Thread(target=manager_two.on_auth_redirect)
        thread_two.start()
        self.assertTrue(second.entered.wait(timeout=1))

        first.release.set()
        thread_one.join(timeout=2)
        self.assertEqual(manager_three.on_auth_redirect(), "refreshing")
        self.assertEqual(third.refresh_calls, 0)

        second.release.set()
        thread_two.join(timeout=2)
        self.assertEqual(self.store().load("auth_required").status, "ready")

    @unittest.skipIf(os.name == "nt", "POSIX owner/mode enforcement is a container boundary")
    def test_rejects_a_group_readable_cookie_profile(self) -> None:
        self.create_persisted_profile()
        cookie = self.root / "scansci" / "cache" / "carsi_cookies" / "sciencedirect.json"
        cookie.chmod(0o640)

        manager = SessionManager(self.store(), FakeRefresher(), FakeClock())

        self.assertEqual(manager.status(), "auth_required")


class AuthLoginTest(unittest.TestCase):
    def test_secret_metadata_accepts_only_runtime_uid_regular_0400(self) -> None:
        self.assertIs(auth_login._secret_metadata_is_safe(stat_module.S_IFREG | 0o400, 10001, 10001), True)
        self.assertIs(auth_login._secret_metadata_is_safe(stat_module.S_IFREG | 0o440, 10001, 10001), False)
        self.assertIs(auth_login._secret_metadata_is_safe(stat_module.S_IFREG | 0o400, 0, 10001), False)
        self.assertIs(auth_login._secret_metadata_is_safe(stat_module.S_IFLNK | 0o400, 10001, 10001), False)

    def test_requires_an_explicit_operator_action_before_starting_upstream_login(self) -> None:
        calls: list[list[str]] = []

        result = auth_main([], runner=lambda command, **_kwargs: calls.append(command))

        self.assertEqual(result, 64)
        self.assertEqual(calls, [])

    def test_rejects_an_oversized_fixed_secret_before_starting_login(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            username = root / "scansci_username"
            password = root / "scansci_password"
            username.write_text("u" * 4097, encoding="utf-8")
            password.write_text("password-value", encoding="utf-8")
            if os.name != "nt":
                username.chmod(0o600)
                password.chmod(0o600)
            calls: list[list[str]] = []

            with (
                mock.patch.object(auth_login, "USERNAME_SECRET", username),
                mock.patch.object(auth_login, "PASSWORD_SECRET", password),
            ):
                result = auth_main(
                    ["--operator-start"],
                    runner=lambda command, **_kwargs: calls.append(command),
                    session_root=root / "session",
                )

            self.assertEqual(result, 1)
            self.assertEqual(calls, [])
            persisted = (root / "session" / "session-state.json").read_text(encoding="utf-8")
            self.assertNotIn("password-value", persisted)
            self.assertNotIn("u" * 32, persisted)

    def test_dangling_fixed_secret_symlinks_are_rejected_as_present(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            username = root / "scansci_username"
            password = root / "scansci_password"
            try:
                username.symlink_to(root / "missing-username")
                password.symlink_to(root / "missing-password")
            except OSError:
                self.skipTest("symlinks unavailable")
            calls: list[list[str]] = []

            with (
                mock.patch.object(auth_login, "USERNAME_SECRET", username),
                mock.patch.object(auth_login, "PASSWORD_SECRET", password),
            ):
                result = auth_main(
                    ["--operator-start"],
                    runner=lambda command, **_kwargs: calls.append(command),
                    session_root=root / "session",
                )

            self.assertEqual(result, 1)
            self.assertEqual(calls, [])

    def test_operator_action_invokes_the_pinned_carsi_flow_without_secret_arguments(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "session"
            calls: list[list[str]] = []

            def runner(command: list[str], **_kwargs: object) -> object:
                calls.append(command)
                return type("Completed", (), {"returncode": 0})()

            result = auth_main(
                ["--operator-start"],
                runner=runner,
                session_root=root,
            )

            self.assertEqual(result, 0)
            self.assertEqual(
                calls,
                [
                    ["scansci-pdf", "setup", "浙江大学"],
                    ["scansci-pdf", "federated-login", "sciencedirect", "--force"],
                ],
            )
            config = json.loads((root / "scansci" / "config.json").read_text(encoding="utf-8"))
            self.assertEqual(config["carsi_idp_name"], "浙江大学")
            self.assertEqual(config["download_strategy"], "legal_only")
            self.assertIs(config["scihub_enabled"], False)
            self.assertIs(config["use_tor_for_scihub"], False)
            self.assertNotIn("username", config)
            self.assertNotIn("password", config)

    @unittest.skipIf(os.name == "nt", "POSIX Secret ownership is a container boundary")
    def test_fixed_secrets_require_runtime_uid_and_owner_only_read_mode(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            secret = root / "secret"
            secret.write_text("credential", encoding="utf-8")
            secret.chmod(0o400)
            uid = secret.stat().st_uid

            auth_login._validate_secret(secret, expected_uid=uid)
            with self.assertRaises(ValueError):
                auth_login._validate_secret(secret, expected_uid=uid + 1)
            secret.chmod(0o440)
            with self.assertRaises(ValueError):
                auth_login._validate_secret(secret, expected_uid=uid)
            link = root / "secret-link"
            link.symlink_to(secret)
            with self.assertRaises(ValueError):
                auth_login._validate_secret(link, expected_uid=uid)


class SessionHttpIntegrationTest(unittest.TestCase):
    def request(self, server, method: str, path: str, body: bytes = b"") -> tuple[int, dict[str, str]]:
        host, port = server.server_address[:2]
        connection = http.client.HTTPConnection(host, port, timeout=2)
        headers = {
            "authorization": "Bearer service-test-token",
            "content-type": "application/json",
            "content-length": str(len(body)),
        }
        try:
            connection.request(method, path, body=body, headers=headers)
            response = connection.getresponse()
            content = response.read()
            try:
                decoded = json.loads(content)
            except json.JSONDecodeError:
                decoded = content
            return response.status, decoded
        finally:
            connection.close()

    def running_server(self, status_provider, client, on_auth_redirect=lambda: None):
        server = create_server(
            {
                "host": "127.0.0.1",
                "port": 0,
                "service_token": "service-test-token",
                "session_status": status_provider,
                "session_auth_redirect": on_auth_redirect,
            },
            client,
        )
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(lambda: thread.join(timeout=2))
        self.addCleanup(server.shutdown)
        return server

    def test_session_endpoint_reads_the_live_manager_state(self) -> None:
        states = iter(("ready", "auth_required"))
        client = type("UnusedClient", (), {"acquire": lambda *_args: None})()
        server = self.running_server(lambda: next(states), client)

        first = self.request(server, "GET", "/v1/session/status")
        second = self.request(server, "GET", "/v1/session/status")

        self.assertEqual(first, (200, {"status": "ready"}))
        self.assertEqual(second, (200, {"status": "auth_required"}))

    def test_auth_redirect_notifies_the_session_manager_without_leaking_details(self) -> None:
        notifications: list[str] = []

        class AuthRedirectClient:
            def acquire(self, _request):
                raise AcquisitionError("auth_required")

        server = self.running_server(lambda: "ready", AuthRedirectClient(), lambda: notifications.append("redirect"))
        body = json.dumps(
            {
                "identifier": "10.1038/nature12373",
                "strategy": "legal_only",
                "scihub": False,
                "tor": False,
                "institutional": True,
                "subject_id": "a" * 64,
            },
            separators=(",", ":"),
        ).encode("utf-8")

        response = self.request(server, "POST", "/v1/legal-download", body)

        self.assertEqual(response, (409, {"code": "auth_required"}))
        self.assertEqual(notifications, ["redirect"])

    def test_disabled_session_rejects_download_without_acquisition(self) -> None:
        calls: list[object] = []
        client = type("DisabledClient", (), {"acquire": lambda _self, request: calls.append(request)})()
        server = self.running_server(lambda: "disabled", client)
        body = json.dumps(
            {
                "identifier": "10.1038/nature12373", "strategy": "legal_only",
                "scihub": False, "tor": False, "institutional": True, "subject_id": "a" * 64,
            },
            separators=(",", ":"),
        ).encode("utf-8")

        response = self.request(server, "POST", "/v1/legal-download", body)

        self.assertEqual(response, (503, {"code": "disabled"}))
        self.assertEqual(calls, [])

    def test_disabled_manager_remains_authoritative_after_helper_ready_and_acquires_nothing(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "session"
            root.mkdir(mode=0o700)
            store = SessionStore(root, expected_uid=None, enforce_permissions=os.name != "nt")
            manager = SessionManager(store, FakeRefresher(), FakeClock(), enabled=False)
            store.publish_status("ready")
            calls: list[object] = []
            client = type("DisabledClient", (), {"acquire": lambda _self, request: calls.append(request)})()
            server = self.running_server(manager.status, client)
            body = json.dumps(
                {
                    "identifier": "10.1038/nature12373", "strategy": "legal_only",
                    "scihub": False, "tor": False, "institutional": True, "subject_id": "a" * 64,
                },
                separators=(",", ":"),
            ).encode("utf-8")

            response = self.request(server, "POST", "/v1/legal-download", body)

            self.assertEqual(response, (503, {"code": "disabled"}))
            self.assertEqual(calls, [])

    def test_auth_required_allows_oa_only_without_institutional_request(self) -> None:
        requests = []

        class OpenAccessClient:
            def acquire(self, request):
                requests.append(request)
                return AcquiredPdf(
                    b"%PDF-open-access", "open_access", "Unpaywall", "https://publisher.example/oa.pdf",
                )

        server = self.running_server(lambda: "auth_required", OpenAccessClient())
        body = json.dumps(
            {
                "identifier": "10.1038/nature12373", "strategy": "legal_only",
                "scihub": False, "tor": False, "institutional": True, "subject_id": "a" * 64,
            },
            separators=(",", ":"),
        ).encode("utf-8")

        status, _body = self.request(server, "POST", "/v1/legal-download", body)

        self.assertEqual(status, 200)
        self.assertEqual(len(requests), 1)
        self.assertIs(requests[0].institutional, False)


class PersistentProfileAcquisitionTest(unittest.TestCase):
    def test_worker_receives_the_fixed_persistent_carsi_profile_without_moving_cookie_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            session = root / "session"
            cookie = session / "scansci" / "cache" / "carsi_cookies" / "sciencedirect.json"
            cookie.parent.mkdir(parents=True)
            cookie.write_text('[{"name":"session","value":"persistent-cookie"}]', encoding="utf-8")
            if os.name != "nt":
                for parent in (session, session / "scansci", session / "scansci" / "cache", cookie.parent):
                    parent.chmod(0o700)
                cookie.chmod(0o600)
            worker = root / "worker.py"
            worker.write_text(
                """import json, pathlib, sys
request = json.load(sys.stdin)
output = pathlib.Path(request['output_dir'])
config = json.loads((output / 'config.json').read_text(encoding='utf-8'))
cookie = pathlib.Path(config['carsi_cookie_dir']) / 'sciencedirect.json'
if cookie.read_text(encoding='utf-8') != '[{\"name\":\"session\",\"value\":\"persistent-cookie\"}]':
    raise SystemExit(2)
paper = output / 'paper.pdf'
paper.write_bytes(b'%PDF-persistent-session')
print(json.dumps({'success': True, 'file': str(paper), 'source': 'CARSI', 'url': 'https://publisher.example/paper'}))
""",
                encoding="utf-8",
            )
            client = ScanSciAcquisitionClient(
                root / "runtime",
                worker_command=[sys.executable, str(worker)],
                session_root=session,
            )

            acquired = client.acquire(
                LegalDownloadRequest("10.1038/nature12373", "legal_only", False, False, True, "a" * 64),
            )

            self.assertEqual(acquired.content, b"%PDF-persistent-session")
            self.assertEqual(cookie.read_text(encoding="utf-8"), '[{"name":"session","value":"persistent-cookie"}]')

    def test_worker_receives_only_a_request_local_cookie_snapshot(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            session = root / "session"
            cookie = session / "scansci" / "cache" / "carsi_cookies" / "sciencedirect.json"
            cookie.parent.mkdir(parents=True)
            cookie.write_text('[{"name":"session","value":"snapshot-cookie"}]', encoding="utf-8")
            if os.name != "nt":
                for parent in (session, session / "scansci", session / "scansci" / "cache", cookie.parent):
                    parent.chmod(0o700)
                cookie.chmod(0o600)
            observed = root / "observed.json"
            worker = root / "worker.py"
            worker.write_text(
                f"""import json, pathlib, sys
request = json.load(sys.stdin)
output = pathlib.Path(request['output_dir'])
config = json.loads((output / 'config.json').read_text(encoding='utf-8'))
pathlib.Path({str(observed)!r}).write_text(json.dumps(config), encoding='utf-8')
cookie = pathlib.Path(config['carsi_cookie_dir']) / 'sciencedirect.json'
assert cookie.read_text(encoding='utf-8') == '[{{\"name\":\"session\",\"value\":\"snapshot-cookie\"}}]'
paper = output / 'paper.pdf'; paper.write_bytes(b'%PDF-snapshot')
print(json.dumps({{'success': True, 'file': str(paper), 'source': 'CARSI', 'url': 'https://publisher.example/paper'}}))
""",
                encoding="utf-8",
            )
            client = ScanSciAcquisitionClient(root / "runtime", worker_command=[sys.executable, str(worker)], session_root=session)

            acquired = client.acquire(LegalDownloadRequest("10.1038/nature12373", "legal_only", False, False, True, "a" * 64))
            config = json.loads(observed.read_text(encoding="utf-8"))

            self.assertEqual(acquired.route, "institutional")
            self.assertNotIn(str(session), json.dumps(config))
            self.assertTrue(Path(config["carsi_cookie_dir"]).is_relative_to(root / "runtime"))

    @unittest.skipIf(os.name == "nt", "POSIX profile mode is a container boundary")
    def test_unsafe_cookie_mode_forces_oa_only_and_never_reaches_worker(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            session = root / "session"
            cookie = session / "scansci" / "cache" / "carsi_cookies" / "sciencedirect.json"
            cookie.parent.mkdir(parents=True)
            cookie.write_text('[{"name":"session","value":"unsafe"}]', encoding="utf-8")
            for parent in (session, session / "scansci", session / "scansci" / "cache", cookie.parent):
                parent.chmod(0o700)
            cookie.chmod(0o640)
            worker = root / "worker.py"
            worker.write_text(
                """import json, pathlib, sys
request=json.load(sys.stdin); output=pathlib.Path(request['output_dir'])
config=json.loads((output/'config.json').read_text(encoding='utf-8'))
assert config['carsi_enabled'] is False
paper=output/'paper.pdf'; paper.write_bytes(b'%PDF-oa')
print(json.dumps({'success':True,'file':str(paper),'source':'Unpaywall','url':'https://publisher.example/oa'}))
""",
                encoding="utf-8",
            )
            client = ScanSciAcquisitionClient(root / "runtime", worker_command=[sys.executable, str(worker)], session_root=session)

            acquired = client.acquire(LegalDownloadRequest("10.1038/nature12373", "legal_only", False, False, True, "a" * 64))

            self.assertEqual(acquired.route, "open_access")

    def test_symlink_cookie_forces_oa_only(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            session = root / "session"
            cookie_root = session / "scansci" / "cache" / "carsi_cookies"
            cookie_root.mkdir(parents=True)
            outside = root / "outside.json"
            outside.write_text('[{"name":"session","value":"outside"}]', encoding="utf-8")
            cookie = cookie_root / "sciencedirect.json"
            try:
                cookie.symlink_to(outside)
            except OSError:
                self.skipTest("symlinks unavailable")
            if os.name != "nt":
                for parent in (session, session / "scansci", session / "scansci" / "cache", cookie_root):
                    parent.chmod(0o700)
            worker = root / "worker.py"
            worker.write_text(
                """import json, pathlib, sys
request=json.load(sys.stdin); output=pathlib.Path(request['output_dir'])
config=json.loads((output/'config.json').read_text(encoding='utf-8')); assert config['carsi_enabled'] is False
paper=output/'paper.pdf'; paper.write_bytes(b'%PDF-oa')
print(json.dumps({'success':True,'file':str(paper),'source':'Unpaywall','url':'https://publisher.example/oa'}))
""",
                encoding="utf-8",
            )
            client = ScanSciAcquisitionClient(root / "runtime", worker_command=[sys.executable, str(worker)], session_root=session)

            acquired = client.acquire(LegalDownloadRequest("10.1038/nature12373", "legal_only", False, False, True, "a" * 64))

            self.assertEqual(acquired.route, "open_access")

    def test_symlink_cookie_parent_cannot_enable_institutional_access(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            session = root / "session"
            cache = session / "scansci" / "cache"
            cache.mkdir(parents=True)
            outside = root / "outside-cookies"
            outside.mkdir()
            (outside / "sciencedirect.json").write_text('[{"name":"session","value":"outside"}]', encoding="utf-8")
            try:
                (cache / "carsi_cookies").symlink_to(outside, target_is_directory=True)
            except OSError:
                self.skipTest("symlinks unavailable")
            if os.name != "nt":
                for parent in (session, session / "scansci", cache, outside):
                    parent.chmod(0o700)
                (outside / "sciencedirect.json").chmod(0o600)
            worker = root / "worker.py"
            worker.write_text(
                """import json, pathlib, sys
request=json.load(sys.stdin); output=pathlib.Path(request['output_dir'])
paper=output/'paper.pdf'; paper.write_bytes(b'%PDF-forged')
print(json.dumps({'success':True,'file':str(paper),'source':'CARSI','url':'https://publisher.example/paper'}))
""",
                encoding="utf-8",
            )
            client = ScanSciAcquisitionClient(root / "runtime", worker_command=[sys.executable, str(worker)], session_root=session)

            with self.assertRaises(AcquisitionError) as raised:
                client.acquire(LegalDownloadRequest("10.1038/nature12373", "legal_only", False, False, True, "a" * 64))

            self.assertEqual(raised.exception.code, "auth_required")

    @unittest.skipIf(os.name == "nt", "openat parent replacement contract is POSIX-only")
    def test_cookie_parent_replacement_after_open_cannot_escape_pinned_directory(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            session = root / "session"
            cache = session / "scansci" / "cache"
            cookie_root = cache / "carsi_cookies"
            cookie_root.mkdir(parents=True)
            (cookie_root / "sciencedirect.json").write_text('[{"name":"session","value":"original"}]', encoding="utf-8")
            outside = root / "outside-cookies"
            outside.mkdir()
            (outside / "sciencedirect.json").write_text('[{"name":"session","value":"outside"}]', encoding="utf-8")
            for parent in (session, session / "scansci", cache, cookie_root, outside):
                parent.chmod(0o700)
            (cookie_root / "sciencedirect.json").chmod(0o600)
            (outside / "sciencedirect.json").chmod(0o600)
            worker = root / "worker.py"
            worker.write_text(
                """import json, pathlib, sys
request=json.load(sys.stdin); output=pathlib.Path(request['output_dir'])
paper=output/'paper.pdf'; paper.write_bytes(b'%PDF-forged')
print(json.dumps({'success':True,'file':str(paper),'source':'CARSI','url':'https://publisher.example/paper'}))
""",
                encoding="utf-8",
            )
            real_listdir = upstream_module.os.listdir
            replaced = False

            def replacing_listdir(path):
                nonlocal replaced
                if isinstance(path, int) and not replaced:
                    replaced = True
                    cookie_root.rename(cache / "carsi_cookies-original")
                    cookie_root.symlink_to(outside, target_is_directory=True)
                return real_listdir(path)

            client = ScanSciAcquisitionClient(root / "runtime", worker_command=[sys.executable, str(worker)], session_root=session)
            with mock.patch.object(upstream_module.os, "listdir", side_effect=replacing_listdir):
                with self.assertRaises(AcquisitionError) as raised:
                    client.acquire(LegalDownloadRequest("10.1038/nature12373", "legal_only", False, False, True, "a" * 64))

            self.assertTrue(replaced)
            self.assertEqual(raised.exception.code, "auth_required")

    def test_unsafe_profile_cannot_claim_an_institutional_result(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            session = root / "session"
            session.mkdir()
            worker = root / "worker.py"
            worker.write_text(
                """import json, pathlib, sys
request=json.load(sys.stdin); output=pathlib.Path(request['output_dir'])
paper=output/'paper.pdf'; paper.write_bytes(b'%PDF-forged-institutional')
print(json.dumps({'success':True,'file':str(paper),'source':'CARSI','url':'https://publisher.example/paper'}))
""",
                encoding="utf-8",
            )
            client = ScanSciAcquisitionClient(root / "runtime", worker_command=[sys.executable, str(worker)], session_root=session)

            with self.assertRaises(AcquisitionError) as raised:
                client.acquire(LegalDownloadRequest("10.1038/nature12373", "legal_only", False, False, True, "a" * 64))

            self.assertEqual(raised.exception.code, "auth_required")

    def test_cookie_replacement_between_check_and_open_forces_oa_only(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            session = root / "session"
            cookie = session / "scansci" / "cache" / "carsi_cookies" / "sciencedirect.json"
            cookie.parent.mkdir(parents=True)
            cookie.write_text('[{"name":"session","value":"original"}]', encoding="utf-8")
            replacement = root / "replacement.json"
            replacement.write_text('[{"name":"session","value":"replacement"}]', encoding="utf-8")
            if os.name != "nt":
                for parent in (session, session / "scansci", session / "scansci" / "cache", cookie.parent):
                    parent.chmod(0o700)
                cookie.chmod(0o600)
                replacement.chmod(0o600)
            worker = root / "worker.py"
            worker.write_text(
                """import json, pathlib, sys
request=json.load(sys.stdin); output=pathlib.Path(request['output_dir'])
config=json.loads((output/'config.json').read_text(encoding='utf-8')); assert config['carsi_enabled'] is False
paper=output/'paper.pdf'; paper.write_bytes(b'%PDF-oa')
print(json.dumps({'success':True,'file':str(paper),'source':'Unpaywall','url':'https://publisher.example/oa'}))
""",
                encoding="utf-8",
            )
            real_open = upstream_module.os.open
            replaced = False

            def racing_open(path, flags, *args, **kwargs):
                nonlocal replaced
                if Path(path) == cookie and not replaced and flags & os.O_RDONLY == os.O_RDONLY:
                    replaced = True
                    cookie.unlink()
                    replacement.replace(cookie)
                return real_open(path, flags, *args, **kwargs)

            client = ScanSciAcquisitionClient(root / "runtime", worker_command=[sys.executable, str(worker)], session_root=session)
            with mock.patch.object(upstream_module.os, "open", side_effect=racing_open):
                acquired = client.acquire(LegalDownloadRequest("10.1038/nature12373", "legal_only", False, False, True, "a" * 64))

            self.assertTrue(replaced)
            self.assertEqual(acquired.route, "open_access")


if __name__ == "__main__":
    unittest.main()
