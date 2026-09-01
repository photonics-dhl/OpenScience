from __future__ import annotations

import json
import hashlib
import os
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
from scansci_legal.browser_protocol import BrowserProof, BrowserResult
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


def _valid_browser_proof() -> BrowserProof:
    return BrowserProof(
        200,
        "application/pdf",
        "https://www.sciencedirect.com/science/article/pii/S0375960123007779/pdfft",
        "CARSI-Browser",
        len(b"%PDF-canary"),
        hashlib.sha256(b"%PDF-canary").hexdigest(),
    )


def _write_login_cookie(staging_root: Path, value: str = "verified") -> None:
    cookie = staging_root / "scansci" / "cache" / "carsi_cookies" / "sciencedirect.json"
    cookie.parent.mkdir(parents=True, exist_ok=True)
    cookie.write_text(
        json.dumps([{
            "name": "session", "value": value, "domain": ".sciencedirect.com",
        }], separators=(",", ":")),
        encoding="utf-8",
    )


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

    def create_persisted_profile(self, *, verified: bool = True) -> None:
        cookie = self.root / "scansci" / "cache" / "carsi_cookies" / "sciencedirect.json"
        cookie.parent.mkdir(parents=True, exist_ok=True)
        cookie.write_text(
            '[{"name":"session","value":"sensitive-cookie","domain":".sciencedirect.com"}]',
            encoding="utf-8",
        )
        if os.name != "nt":
            for directory in (cookie.parent.parent.parent, cookie.parent.parent, cookie.parent):
                directory.chmod(0o700)
            cookie.chmod(0o600)
        if verified:
            cookie_sha256 = hashlib.sha256(cookie.read_bytes()).hexdigest()
            self.store().save(SessionSnapshot(
                "ready",
                verified_at=10_000,
                verified_cookie_sha256=cookie_sha256,
            ))

    def store(self) -> SessionStore:
        return SessionStore(self.root, expected_uid=None, enforce_permissions=os.name != "nt")

    def test_reuses_a_safe_persisted_profile_after_manager_recreation(self) -> None:
        self.create_persisted_profile(verified=False)
        clock = FakeClock()
        refresher = FakeRefresher()

        first = SessionManager(self.store(), refresher, clock)
        self.assertEqual(first.status(), "auth_required")
        first.mark_verified_ready(clock())
        second = SessionManager(self.store(), refresher, clock)

        self.assertEqual(first.status(), "ready")
        self.assertEqual(second.status(), "ready")
        state_text = (self.root / "session-state.json").read_text(encoding="utf-8")
        self.assertNotIn("sensitive-cookie", state_text)
        self.assertNotIn("sciencedirect.json", state_text)

    def test_verified_ready_expires_after_twenty_four_hours_and_cookie_alone_never_passes(self) -> None:
        self.create_persisted_profile(verified=False)
        clock = FakeClock()
        manager = SessionManager(self.store(), FakeRefresher(), clock)

        self.assertFalse(manager.verified_ready(clock()))
        self.assertEqual(manager.status(), "auth_required")
        marked = manager.mark_verified_ready(clock())
        self.assertEqual(marked.status, "ready")
        self.assertTrue(manager.verified_ready(clock() + 24 * 60 * 60))

        clock.advance(24 * 60 * 60 + 1)
        self.assertFalse(manager.verified_ready(clock()))
        self.assertEqual(manager.status(), "auth_required")

    def test_genuine_institutional_failure_revokes_fresh_ready_state(self) -> None:
        self.create_persisted_profile(verified=False)
        clock = FakeClock()
        manager = SessionManager(self.store(), FakeRefresher(), clock)
        manager.mark_verified_ready(clock())

        revoked = manager.mark_auth_required()

        self.assertEqual(revoked.status, "auth_required")
        self.assertFalse(manager.verified_ready(clock()))

    def test_replacing_the_proven_cookie_revokes_ready_after_recreation(self) -> None:
        self.create_persisted_profile(verified=False)
        clock = FakeClock()
        manager = SessionManager(self.store(), FakeRefresher(), clock)
        manager.mark_verified_ready(clock())
        cookie = self.root / "scansci" / "cache" / "carsi_cookies" / "sciencedirect.json"
        cookie.write_text(
            '[{"name":"session","value":"unproven-replacement","domain":".sciencedirect.com"}]',
            encoding="utf-8",
        )

        recreated = SessionManager(self.store(), FakeRefresher(), clock)

        self.assertEqual(recreated.status(), "auth_required")
        self.assertFalse(recreated.verified_ready(clock()))

    def test_malformed_or_noncanonical_cookie_never_supports_ready(self) -> None:
        cases = (
            '[{"name":"session","value":"x","domain":".sciencedirect.com","unknown":"field"}]',
            json.dumps([{
                "name": f"cookie-{index}", "value": "x", "domain": ".sciencedirect.com",
            } for index in range(65)]),
            "not-json",
        )
        for index, replacement in enumerate(cases):
            with self.subTest(index=index):
                self.create_persisted_profile(verified=False)
                clock = FakeClock()
                manager = SessionManager(self.store(), FakeRefresher(), clock)
                manager.mark_verified_ready(clock())
                cookie = self.root / "scansci" / "cache" / "carsi_cookies" / "sciencedirect.json"
                cookie.write_text(replacement, encoding="utf-8")

                self.assertEqual(SessionManager(self.store(), FakeRefresher(), clock).status(), "auth_required")

    def test_chromium_cookie_database_alone_never_supports_ready(self) -> None:
        self.create_persisted_profile(verified=False)
        clock = FakeClock()
        manager = SessionManager(self.store(), FakeRefresher(), clock)
        manager.mark_verified_ready(clock())
        cookie = self.root / "scansci" / "cache" / "carsi_cookies" / "sciencedirect.json"
        cookie.unlink()
        chromium_cookie = self.root / "chromium" / "Default" / "Cookies"
        chromium_cookie.parent.mkdir(parents=True)
        chromium_cookie.write_bytes(b"SQLite format 3\0")
        if os.name != "nt":
            chromium_cookie.parent.chmod(0o700)
            chromium_cookie.chmod(0o600)

        self.assertEqual(SessionManager(self.store(), FakeRefresher(), clock).status(), "auth_required")

    def test_verified_cookie_publish_rolls_back_when_state_commit_fails(self) -> None:
        self.create_persisted_profile(verified=False)
        store = self.store()
        old_cookie = store.validated_cookie_sha256()
        replacement = b'[{"name":"session","value":"replacement","domain":".sciencedirect.com"}]'

        with mock.patch.object(store, "_write_snapshot", side_effect=OSError("state write failed")):
            with self.assertRaises(OSError):
                store.publish_verified_cookie(replacement, 10_000)

        self.assertEqual(store.validated_cookie_sha256(), old_cookie)

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

    def test_probe_success_cannot_keep_ready_after_cookie_identity_changes(self) -> None:
        self.create_persisted_profile()
        cookie = self.root / "scansci" / "cache" / "carsi_cookies" / "sciencedirect.json"

        class ReplacingRefresher(FakeRefresher):
            def probe(self, _profile_root: Path) -> bool:
                self.probe_calls += 1
                cookie.write_text(
                    '[{"name":"session","value":"unproven-replacement","domain":".sciencedirect.com"}]',
                    encoding="utf-8",
                )
                return True

        manager = SessionManager(self.store(), ReplacingRefresher(), FakeClock())

        self.assertEqual(manager.status(), "auth_required")

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

    def test_reenabling_after_disabled_requires_a_new_verified_download(self) -> None:
        self.create_persisted_profile()
        refresher = FakeRefresher()
        SessionManager(self.store(), refresher, FakeClock(), enabled=False)

        restored = SessionManager(self.store(), refresher, FakeClock(), enabled=True)

        self.assertEqual(restored.status(), "auth_required")

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

        def runner(_command: list[str], **_kwargs: object) -> object:
            return type("Completed", (), {"returncode": 0})()

        def login(staging_root: Path) -> bool:
            _write_login_cookie(staging_root)
            return True

        result = auth_main(
            ["--operator-start"],
            runner=runner,
            session_root=self.root,
            proof_validator=lambda _root, _cookie: _valid_browser_proof(),
            login_runner=login,
            clock=clock,
        )

        self.assertEqual(result, 0)
        self.assertEqual(manager.status(), "ready")

    def test_stale_state_writer_cannot_clobber_newer_helper_generation(self) -> None:
        store = self.store()
        store.ensure_root()
        stale = store.load("auth_required")

        def runner(_command: list[str], **_kwargs: object) -> object:
            return type("Completed", (), {"returncode": 0})()

        def login(staging_root: Path) -> bool:
            _write_login_cookie(staging_root)
            return True

        auth_main(
            ["--operator-start"],
            runner=runner,
            session_root=self.root,
            proof_validator=lambda _root, _cookie: _valid_browser_proof(),
            login_runner=login,
            clock=FakeClock(),
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
    def test_browser_environment_forwards_only_the_fixed_controlled_proxy(self) -> None:
        with mock.patch.dict(os.environ, {
            "SCANSCI_BROWSER_PROXY": "http://openscience-egress:7891",
            "HTTP_PROXY": "http://hostile.invalid:3128",
        }, clear=False):
            environment = auth_login._browser_environment(Path("/session"))

        self.assertEqual(environment["SCANSCI_BROWSER_PROXY"], "http://openscience-egress:7891")
        self.assertNotIn("HTTP_PROXY", environment)
        with mock.patch.dict(os.environ, {"SCANSCI_BROWSER_PROXY": "http://hostile.invalid:3128"}, clear=False):
            with self.assertRaises(ValueError):
                auth_login._browser_environment(Path("/session"))

    def test_requires_an_explicit_operator_action_before_starting_upstream_login(self) -> None:
        calls: list[list[str]] = []

        result = auth_main([], runner=lambda command, **_kwargs: calls.append(command))

        self.assertEqual(result, 64)
        self.assertEqual(calls, [])

    def test_operator_action_invokes_the_pinned_carsi_flow_without_secret_arguments(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "session"
            calls: list[list[str]] = []
            configs: list[dict[str, object]] = []

            def runner(command: list[str], **_kwargs: object) -> object:
                calls.append(command)
                data_root = Path(_kwargs["env"]["SCANSCI_PDF_DATA_DIR"])  # type: ignore[index]
                configs.append(json.loads((data_root / "config.json").read_text(encoding="utf-8")))
                return type("Completed", (), {"returncode": 0})()

            def login(staging_root: Path) -> bool:
                _write_login_cookie(staging_root)
                return True

            result = auth_main(
                ["--operator-start"],
                runner=runner,
                session_root=root,
                proof_validator=lambda _root, _cookie: _valid_browser_proof(),
                login_runner=login,
                clock=lambda: 12_345.0,
            )

            self.assertEqual(result, 0)
            self.assertEqual(
                calls,
                [["scansci-pdf", "setup", "浙江大学"]],
            )
            config = configs[0]
            self.assertEqual(config["carsi_idp_name"], "浙江大学")
            self.assertEqual(config["download_strategy"], "legal_only")
            self.assertEqual(config["browser_executable"], "/usr/local/bin/scansci-chromium")
            self.assertIs(config["scihub_enabled"], False)
            self.assertIs(config["use_tor_for_scihub"], False)
            self.assertNotIn("username", config)
            self.assertNotIn("password", config)
            persisted_cookie = root / "scansci" / "cache" / "carsi_cookies" / "sciencedirect.json"
            self.assertEqual(json.loads(persisted_cookie.read_text(encoding="utf-8"))[0]["value"], "verified")
            state = json.loads((root / "session-state.json").read_text(encoding="utf-8"))
            self.assertEqual(state["verified_at"], 12_345.0)

    def test_operator_login_retries_an_expired_upstream_window_without_rerunning_setup(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "session"
            calls: list[list[str]] = []
            login_results = iter((False, True))
            login_calls: list[Path] = []

            def runner(command: list[str], **_kwargs: object) -> object:
                calls.append(command)
                return type("Completed", (), {"returncode": 0})()

            def login(staging_root: Path) -> bool:
                login_calls.append(staging_root)
                result = next(login_results)
                if result:
                    _write_login_cookie(staging_root)
                return result

            result = auth_main(
                ["--operator-start"],
                runner=runner,
                session_root=root,
                proof_validator=lambda _root, _cookie: _valid_browser_proof(),
                login_runner=login,
            )

            self.assertEqual(result, 0)
            self.assertEqual(
                calls,
                [["scansci-pdf", "setup", "浙江大学"]],
            )
            self.assertEqual(len(login_calls), 2)
            state = json.loads((root / "session-state.json").read_text(encoding="utf-8"))
            self.assertEqual(state["status"], "ready")

    def test_publisher_return_and_cookie_shape_never_publish_ready_without_pdf_proof(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "session"
            proof_calls: list[Path] = []

            def runner(_command: list[str], **_kwargs: object) -> object:
                return type("Completed", (), {"returncode": 0})()

            def login(staging_root: Path) -> bool:
                cookie = staging_root / "scansci" / "cache" / "carsi_cookies" / "sciencedirect.json"
                cookie.parent.mkdir(parents=True, exist_ok=True)
                cookie.write_text(
                    json.dumps([
                        {
                            "name": f"cookie-{index}",
                            "value": "shaped",
                            "domain": ".sciencedirect.com",
                        }
                        for index in range(5)
                    ]),
                    encoding="utf-8",
                )
                return True

            def no_pdf_proof(staging_root: Path, _cookie_json: bytes) -> object:
                proof_calls.append(staging_root)
                return None

            with mock.patch.object(auth_login, "MAX_OPERATOR_LOGIN_ATTEMPTS", 2):
                result = auth_main(
                    ["--operator-start"],
                    runner=runner,
                    session_root=root,
                    proof_validator=no_pdf_proof,
                    login_runner=login,
                )

            self.assertEqual(result, 1)
            self.assertEqual(len(proof_calls), 2)
            state = json.loads((root / "session-state.json").read_text(encoding="utf-8"))
            self.assertEqual(state["status"], "auth_required")
            self.assertEqual(state["verified_at"], 0)
            self.assertFalse((root / "scansci" / "cache" / "carsi_cookies" / "sciencedirect.json").exists())

    def test_operator_login_exhaustion_is_bounded_and_publishes_auth_required(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "session"
            calls: list[list[str]] = []
            login_calls: list[Path] = []

            def runner(command: list[str], **_kwargs: object) -> object:
                calls.append(command)
                return type("Completed", (), {"returncode": 0})()

            def login(staging_root: Path) -> bool:
                login_calls.append(staging_root)
                return False

            with mock.patch.object(auth_login, "MAX_OPERATOR_LOGIN_ATTEMPTS", 2):
                result = auth_main(
                    ["--operator-start"],
                    runner=runner,
                    session_root=root,
                    login_runner=login,
                )

            self.assertEqual(result, 1)
            self.assertEqual(calls, [["scansci-pdf", "setup", "浙江大学"]])
            self.assertEqual(len(login_calls), 2)
            state = json.loads((root / "session-state.json").read_text(encoding="utf-8"))
            self.assertEqual(state["status"], "auth_required")
            self.assertEqual(state["reason"], "operator_auth_required")

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

    def running_server(
        self,
        status_provider,
        client,
        on_auth_redirect=lambda: None,
        on_verified=lambda _cookie_sha256: None,
    ):
        server = create_server(
            {
                "host": "127.0.0.1",
                "port": 0,
                "service_token": "service-test-token",
                "session_status": status_provider,
                "session_auth_redirect": on_auth_redirect,
                "session_verified": on_verified,
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

    def test_verified_institutional_pdf_refreshes_session_proof_after_response_validation(self) -> None:
        notifications: list[str] = []

        class InstitutionalClient:
            def acquire(self, _request):
                return AcquiredPdf(
                    b"%PDF-browser-proof",
                    "institutional",
                    "CARSI-Browser",
                    "https://www.sciencedirect.com/science/article/pii/S0375960123007779/pdfft",
                    session_cookie_sha256="c" * 64,
                )

        server = self.running_server(
            lambda: "ready",
            InstitutionalClient(),
            on_verified=lambda cookie_sha256: notifications.append(cookie_sha256),
        )
        body = json.dumps(
            {
                "identifier": "10.1016/j.physleta.2023.129241",
                "strategy": "legal_only",
                "scihub": False,
                "tor": False,
                "institutional": True,
                "subject_id": "a" * 64,
            },
            separators=(",", ":"),
        ).encode("utf-8")

        status, _body = self.request(server, "POST", "/v1/legal-download", body)

        self.assertEqual(status, 200)
        self.assertEqual(notifications, ["c" * 64])

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


class _RecordingBrowserClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, bytes]] = []

    def submit(self, identifier: str, cookie_json: bytes) -> BrowserResult:
        self.calls.append((identifier, cookie_json))
        content = b"%PDF-persistent-session"
        return BrowserResult(
            content,
            BrowserProof(
                200,
                "application/pdf",
                "https://www.sciencedirect.com/science/article/pii/S0375960123007779/pdfft",
                "CARSI-Browser",
                len(content),
                hashlib.sha256(content).hexdigest(),
            ),
        )


class _FailIfCalledBrowserClient:
    def submit(self, _identifier: str, _cookie_json: bytes) -> BrowserResult:
        raise AssertionError("unsafe session reached browser worker")


class PersistentCookieAcquisitionTest(unittest.TestCase):
    def test_browser_worker_receives_the_persistent_carsi_cookie_without_mutating_it(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            session = root / "session"
            cookie = session / "scansci" / "cache" / "carsi_cookies" / "sciencedirect.json"
            cookie.parent.mkdir(parents=True)
            cookie.write_text('[{"name":"session","value":"persistent-cookie","domain":".sciencedirect.com"}]', encoding="utf-8")
            if os.name != "nt":
                for parent in (session, session / "scansci", session / "scansci" / "cache", cookie.parent):
                    parent.chmod(0o700)
                cookie.chmod(0o600)
            browser = _RecordingBrowserClient()
            client = ScanSciAcquisitionClient(
                root / "runtime",
                worker_command=["must-not-run"],
                session_root=session,
                browser_job_client=browser,
            )

            acquired = client.acquire(
                LegalDownloadRequest("10.1038/nature12373", "legal_only", False, False, True, "a" * 64),
            )

            self.assertEqual(acquired.content, b"%PDF-persistent-session")
            self.assertEqual(browser.calls, [(
                "10.1038/nature12373",
                b'[{"name":"session","value":"persistent-cookie","domain":".sciencedirect.com"}]',
            )])
            self.assertEqual(cookie.read_text(encoding="utf-8"), '[{"name":"session","value":"persistent-cookie","domain":".sciencedirect.com"}]')

    def test_worker_receives_only_a_request_local_cookie_snapshot(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            session = root / "session"
            cookie = session / "scansci" / "cache" / "carsi_cookies" / "sciencedirect.json"
            cookie.parent.mkdir(parents=True)
            cookie.write_text('[{"name":"session","value":"snapshot-cookie","domain":".sciencedirect.com"}]', encoding="utf-8")
            if os.name != "nt":
                for parent in (session, session / "scansci", session / "scansci" / "cache", cookie.parent):
                    parent.chmod(0o700)
                cookie.chmod(0o600)
            browser = _RecordingBrowserClient()
            client = ScanSciAcquisitionClient(
                root / "runtime",
                worker_command=["must-not-run"],
                session_root=session,
                browser_job_client=browser,
            )

            acquired = client.acquire(LegalDownloadRequest("10.1038/nature12373", "legal_only", False, False, True, "a" * 64))

            self.assertEqual(acquired.route, "institutional")
            self.assertEqual(browser.calls[0][1], b'[{"name":"session","value":"snapshot-cookie","domain":".sciencedirect.com"}]')
            self.assertNotIn(str(session).encode("utf-8"), browser.calls[0][1])

    @unittest.skipIf(os.name == "nt", "POSIX profile mode is a container boundary")
    def test_unsafe_cookie_mode_forces_oa_only_and_never_reaches_worker(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            session = root / "session"
            cookie = session / "scansci" / "cache" / "carsi_cookies" / "sciencedirect.json"
            cookie.parent.mkdir(parents=True)
            cookie.write_text('[{"name":"session","value":"unsafe","domain":".sciencedirect.com"}]', encoding="utf-8")
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
            client = ScanSciAcquisitionClient(
                root / "runtime", worker_command=[sys.executable, str(worker)], session_root=session,
                browser_job_client=_FailIfCalledBrowserClient(),
            )

            with self.assertRaises(AcquisitionError) as raised:
                client.acquire(LegalDownloadRequest("10.1038/nature12373", "legal_only", False, False, True, "a" * 64))

            self.assertEqual(raised.exception.code, "auth_required")

    def test_symlink_cookie_forces_oa_only(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            session = root / "session"
            cookie_root = session / "scansci" / "cache" / "carsi_cookies"
            cookie_root.mkdir(parents=True)
            outside = root / "outside.json"
            outside.write_text('[{"name":"session","value":"outside","domain":".sciencedirect.com"}]', encoding="utf-8")
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
            client = ScanSciAcquisitionClient(
                root / "runtime", worker_command=[sys.executable, str(worker)], session_root=session,
                browser_job_client=_FailIfCalledBrowserClient(),
            )

            with self.assertRaises(AcquisitionError) as raised:
                client.acquire(LegalDownloadRequest("10.1038/nature12373", "legal_only", False, False, True, "a" * 64))

            self.assertEqual(raised.exception.code, "auth_required")

    def test_symlink_cookie_parent_cannot_enable_institutional_access(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            session = root / "session"
            cache = session / "scansci" / "cache"
            cache.mkdir(parents=True)
            outside = root / "outside-cookies"
            outside.mkdir()
            (outside / "sciencedirect.json").write_text('[{"name":"session","value":"outside","domain":".sciencedirect.com"}]', encoding="utf-8")
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
            client = ScanSciAcquisitionClient(
                root / "runtime", worker_command=[sys.executable, str(worker)], session_root=session,
                browser_job_client=_FailIfCalledBrowserClient(),
            )

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
            (cookie_root / "sciencedirect.json").write_text('[{"name":"session","value":"original","domain":".sciencedirect.com"}]', encoding="utf-8")
            outside = root / "outside-cookies"
            outside.mkdir()
            (outside / "sciencedirect.json").write_text('[{"name":"session","value":"outside","domain":".sciencedirect.com"}]', encoding="utf-8")
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
            real_fstat = upstream_module.os.fstat
            replaced = False
            fstat_calls = 0

            def replacing_fstat(descriptor):
                nonlocal replaced, fstat_calls
                details = real_fstat(descriptor)
                fstat_calls += 1
                if fstat_calls == 4 and not replaced:
                    replaced = True
                    cookie_root.rename(cache / "carsi_cookies-original")
                    cookie_root.symlink_to(outside, target_is_directory=True)
                return details

            client = ScanSciAcquisitionClient(
                root / "runtime", worker_command=[sys.executable, str(worker)], session_root=session,
                browser_job_client=_FailIfCalledBrowserClient(),
            )
            with mock.patch.object(upstream_module.os, "fstat", side_effect=replacing_fstat):
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
            client = ScanSciAcquisitionClient(
                root / "runtime", worker_command=[sys.executable, str(worker)], session_root=session,
                browser_job_client=_FailIfCalledBrowserClient(),
            )

            with self.assertRaises(AcquisitionError) as raised:
                client.acquire(LegalDownloadRequest("10.1038/nature12373", "legal_only", False, False, True, "a" * 64))

            self.assertEqual(raised.exception.code, "auth_required")

    def test_cookie_replacement_between_check_and_open_forces_oa_only(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            session = root / "session"
            cookie = session / "scansci" / "cache" / "carsi_cookies" / "sciencedirect.json"
            cookie.parent.mkdir(parents=True)
            cookie.write_text('[{"name":"session","value":"original","domain":".sciencedirect.com"}]', encoding="utf-8")
            replacement = root / "replacement.json"
            replacement.write_text('[{"name":"session","value":"replacement","domain":".sciencedirect.com"}]', encoding="utf-8")
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

            client = ScanSciAcquisitionClient(
                root / "runtime", worker_command=[sys.executable, str(worker)], session_root=session,
                browser_job_client=_FailIfCalledBrowserClient(),
            )
            with mock.patch.object(upstream_module.os, "open", side_effect=racing_open):
                with self.assertRaises(AcquisitionError) as raised:
                    client.acquire(LegalDownloadRequest("10.1038/nature12373", "legal_only", False, False, True, "a" * 64))

            self.assertTrue(replaced)
            self.assertEqual(raised.exception.code, "auth_required")


if __name__ == "__main__":
    unittest.main()
