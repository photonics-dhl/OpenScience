from __future__ import annotations

import hashlib
import io
from contextlib import contextmanager, redirect_stderr
import json
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from scansci_legal import auth_login
from scansci_legal.browser_protocol import BrowserProof
from scansci_legal.strict_browser import BrowserPolicyError


class AuthLoginCanaryContractTest(unittest.TestCase):
    def test_main_reports_only_stable_canary_failure_diagnostics(self) -> None:
        cookie_value = "must-never-appear-in-diagnostics"

        def login(staging_root: Path) -> bool:
            auth_login._write_staged_cookie(
                staging_root,
                json.dumps([{
                    "name": "session",
                    "value": cookie_value,
                    "domain": ".sciencedirect.com",
                    "path": "/",
                    "secure": True,
                }]).encode("utf-8"),
            )
            return True

        def reject_canary(_staging_root: Path, _cookie_json: bytes) -> object:
            raise BrowserPolicyError("browser_auth_required")

        diagnostics = io.StringIO()
        with tempfile.TemporaryDirectory() as directory, redirect_stderr(diagnostics):
            result = auth_login.main(
                ["--operator-start"],
                runner=lambda *_args, **_kwargs: SimpleNamespace(returncode=0),
                session_root=Path(directory) / "session",
                proof_validator=reject_canary,
                login_runner=login,
            )

        self.assertEqual(result, 1)
        self.assertEqual(
            diagnostics.getvalue().splitlines(),
            [
                f"SCANSCI_AUTH_CANARY_FAILED attempt={attempt} code=browser_auth_required"
                for attempt in range(1, auth_login.MAX_OPERATOR_LOGIN_ATTEMPTS + 1)
            ],
        )
        self.assertNotIn(cookie_value, diagnostics.getvalue())

    def test_main_suppresses_hostile_canary_output_and_keeps_auth_required(self) -> None:
        cookie_value = "cookie-must-never-reach-output"
        hostile_url = "https://www.sciencedirect.com/private?ticket=must-not-leak"

        def login(staging_root: Path) -> bool:
            auth_login._write_staged_cookie(
                staging_root,
                json.dumps([{
                    "name": "session",
                    "value": cookie_value,
                    "domain": ".sciencedirect.com",
                    "path": "/",
                    "secure": True,
                }]).encode("utf-8"),
            )
            return True

        def hostile_canary(_staging_root: Path, _cookie_json: bytes) -> object:
            os.write(1, f"stdout {cookie_value}\n".encode("utf-8"))
            os.write(2, f"stderr {hostile_url}\n".encode("utf-8"))
            print(f"python-stdout {cookie_value}", flush=True)
            print(f"python-stderr {hostile_url}", file=sys.stderr, flush=True)
            raise RuntimeError(f"unknown canary failure {cookie_value} {hostile_url}")

        with tempfile.TemporaryDirectory() as directory, \
                tempfile.TemporaryFile() as stdout_capture, \
                tempfile.TemporaryFile() as stderr_capture, \
                mock.patch.object(auth_login, "MAX_OPERATOR_LOGIN_ATTEMPTS", 1):
            session_root = Path(directory) / "session"
            saved_stdout = os.dup(1)
            saved_stderr = os.dup(2)
            try:
                sys.stdout.flush()
                sys.stderr.flush()
                os.dup2(stdout_capture.fileno(), 1)
                os.dup2(stderr_capture.fileno(), 2)
                result = auth_login.main(
                    ["--operator-start"],
                    runner=lambda *_args, **_kwargs: SimpleNamespace(returncode=0),
                    session_root=session_root,
                    proof_validator=hostile_canary,
                    login_runner=login,
                )
                sys.stdout.flush()
                sys.stderr.flush()
            finally:
                os.dup2(saved_stdout, 1)
                os.dup2(saved_stderr, 2)
                os.close(saved_stdout)
                os.close(saved_stderr)

            stdout_capture.seek(0)
            stderr_capture.seek(0)
            stdout_text = stdout_capture.read().decode("utf-8")
            stderr_text = stderr_capture.read().decode("utf-8")
            state = json.loads((session_root / "session-state.json").read_text(encoding="utf-8"))
            cookie_persisted = (
                session_root / "scansci" / "cache" / "carsi_cookies" / "sciencedirect.json"
            ).exists()

        self.assertEqual(result, 1)
        self.assertEqual(stdout_text, "")
        self.assertEqual(
            stderr_text,
            f"SCANSCI_AUTH_CANARY_FAILED attempt=1 code=canary_runtime_failed{os.linesep}",
        )
        self.assertEqual(state["status"], "auth_required")
        self.assertEqual(state["reason"], "operator_auth_required")
        self.assertFalse(cookie_persisted)

    def test_strict_login_first_launch_failure_is_final_without_fallback(self) -> None:
        launches: list[Path] = []

        def failing_browser(profile: Path):
            launches.append(profile)
            raise BrowserPolicyError("browser_launch_failed")

        with mock.patch(
            "scansci_legal.auth_login._load_carsi_publisher_configs",
            return_value={
                "sciencedirect": SimpleNamespace(
                    login_url="https://www.sciencedirect.com/user/login",
                    domains=["sciencedirect.com"],
                ),
            },
        ), tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaises(BrowserPolicyError):
                auth_login._strict_operator_login(
                    root,
                    browser_session=failing_browser,
                    sleeper=lambda _seconds: None,
                )

        self.assertEqual(len(launches), 1)
        self.assertEqual(launches[0].parent.parent, root / "chromium-attempts")
        self.assertFalse(launches[0].exists())

    def test_strict_login_publishes_only_cookie_json_from_one_context(self) -> None:
        launches: list[Path] = []
        context = SimpleNamespace(cookies=lambda _urls=None: [{
            "name": "session",
            "value": "verified",
            "domain": ".sciencedirect.com",
            "path": "/",
            "secure": True,
        }, {
            "name": "CASTGC",
            "value": "must-not-persist",
            "domain": "zjuam.zju.edu.cn",
            "path": "/",
            "secure": True,
        }])
        page = SimpleNamespace(
            goto=lambda *_args, **_kwargs: None,
            url="https://www.sciencedirect.com/science/article/pii/x",
        )

        @contextmanager
        def browser(profile: Path):
            launches.append(profile)
            yield context, page

        with mock.patch(
            "scansci_legal.auth_login._load_carsi_publisher_configs",
            return_value={
                "sciencedirect": SimpleNamespace(
                    login_url="https://www.sciencedirect.com/user/login",
                    domains=["sciencedirect.com"],
                ),
            },
        ), tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            result = auth_login._strict_operator_login(
                root,
                browser_session=browser,
                sleeper=lambda _seconds: None,
            )
            cookie = root / "scansci" / "cache" / "carsi_cookies" / "sciencedirect.json"

            self.assertIs(result, True)
            self.assertEqual(len(launches), 1)
            persisted = json.loads(cookie.read_text(encoding="utf-8"))
            self.assertEqual(len(persisted), 1)
            self.assertEqual(persisted[0]["value"], "verified")

    def test_strict_login_submits_publisher_cookie_after_login_url_window(self) -> None:
        context = SimpleNamespace(cookies=lambda _urls=None: [{
            "name": "session",
            "value": "verified",
            "domain": ".sciencedirect.com",
            "path": "/",
            "secure": True,
        }, {
            "name": "CASTGC",
            "value": "must-not-persist",
            "domain": "zjuam.zju.edu.cn",
            "path": "/",
            "secure": True,
        }])
        page = SimpleNamespace(
            goto=lambda *_args, **_kwargs: None,
            url="https://www.sciencedirect.com/user/institution/login",
        )

        @contextmanager
        def browser(_profile: Path):
            yield context, page

        with mock.patch(
            "scansci_legal.auth_login._load_carsi_publisher_configs",
            return_value={
                "sciencedirect": SimpleNamespace(
                    login_url="https://www.sciencedirect.com/user/institution/login",
                    domains=["sciencedirect.com"],
                ),
            },
        ), tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            result = auth_login._strict_operator_login(
                root,
                browser_session=browser,
                sleeper=lambda _seconds: None,
            )
            cookie = root / "scansci" / "cache" / "carsi_cookies" / "sciencedirect.json"

            self.assertIs(result, True)
            persisted = json.loads(cookie.read_text(encoding="utf-8"))
            self.assertEqual(len(persisted), 1)
            self.assertEqual(persisted[0]["value"], "verified")

    def test_strict_login_retry_uses_a_fresh_profile_after_timeout(self) -> None:
        launches: list[Path] = []
        pages = iter((
            SimpleNamespace(
                goto=lambda *_args, **_kwargs: None,
                url="https://www.sciencedirect.com/user/login",
            ),
            SimpleNamespace(
                goto=lambda *_args, **_kwargs: None,
                url="https://www.sciencedirect.com/science/article/pii/x",
            ),
        ))
        context = SimpleNamespace(cookies=lambda _urls=None: [{
            "name": "session", "value": "verified", "domain": ".sciencedirect.com", "path": "/",
        }])

        @contextmanager
        def browser(profile: Path):
            launches.append(profile)
            page = next(pages)
            current_context = context if not page.url.endswith("/login") else SimpleNamespace(
                cookies=lambda _urls=None: [],
            )
            yield current_context, page

        with mock.patch(
            "scansci_legal.auth_login._load_carsi_publisher_configs",
            return_value={
                "sciencedirect": SimpleNamespace(
                    login_url="https://www.sciencedirect.com/user/login",
                    domains=["sciencedirect.com"],
                ),
            },
        ), tempfile.TemporaryDirectory() as directory:
            root = Path(directory)

            first = auth_login._strict_operator_login(
                root, browser_session=browser, sleeper=lambda _seconds: None,
            )
            second = auth_login._strict_operator_login(
                root, browser_session=browser, sleeper=lambda _seconds: None,
            )

            self.assertIs(first, False)
            self.assertIs(second, True)
            self.assertEqual(len(launches), 2)
            self.assertNotEqual(launches[0], launches[1])
            self.assertEqual(list((root / "chromium-attempts").iterdir()), [])

    def test_strict_login_rejects_lookalike_publisher_return(self) -> None:
        context = SimpleNamespace(cookies=lambda _urls=None: [{
            "name": "session", "value": "forged", "domain": ".sciencedirect.com",
        }])
        page = SimpleNamespace(
            goto=lambda *_args, **_kwargs: None,
            url="https://evilsciencedirect.com/science/article/pii/x",
        )

        @contextmanager
        def browser(_profile: Path):
            yield context, page

        with mock.patch(
            "scansci_legal.auth_login._load_carsi_publisher_configs",
            return_value={
                "sciencedirect": SimpleNamespace(
                    login_url="https://www.sciencedirect.com/user/login",
                    domains=["sciencedirect.com"],
                ),
            },
        ), tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            result = auth_login._strict_operator_login(
                root, browser_session=browser, sleeper=lambda _seconds: None,
            )
            self.assertIs(result, False)
            self.assertFalse((root / "scansci" / "cache" / "carsi_cookies" / "sciencedirect.json").exists())

    def test_strict_login_rejects_elsevier_identity_page_as_publisher_return(self) -> None:
        context = SimpleNamespace(cookies=lambda _urls=None: [{
            "name": "session", "value": "premature", "domain": ".sciencedirect.com",
        }])
        page = SimpleNamespace(
            goto=lambda *_args, **_kwargs: None,
            url="https://id.elsevier.com/as/flow/resume/as/authorization.ping?state=retryCounter",
        )

        @contextmanager
        def browser(_profile: Path):
            yield context, page

        with mock.patch(
            "scansci_legal.auth_login._load_carsi_publisher_configs",
            return_value={
                "sciencedirect": SimpleNamespace(
                    login_url="https://www.sciencedirect.com/user/institution/login",
                    domains=["sciencedirect.com", "elsevier.com"],
                ),
            },
        ), tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            result = auth_login._strict_operator_login(
                root, browser_session=browser, sleeper=lambda _seconds: None,
            )

            self.assertIs(result, False)
            self.assertFalse((root / "scansci" / "cache" / "carsi_cookies" / "sciencedirect.json").exists())

    def test_fixed_canary_uses_exact_doi_and_cookie_snapshot(self) -> None:
        cookie_json = b'[{"name":"session","value":"verified","domain":".sciencedirect.com"}]'
        proof = BrowserProof(
            200,
            "application/pdf",
            "https://www.sciencedirect.com/science/article/pii/S0375960123007779/pdfft",
            "CARSI-Browser",
            len(b"%PDF-canary"),
            hashlib.sha256(b"%PDF-canary").hexdigest(),
        )
        with mock.patch.object(
            auth_login,
            "verify_institutional_canary",
            return_value=proof,
        ) as verifier:
            result = auth_login._verify_fixed_canary(Path("/private/staging"), cookie_json)

        self.assertIs(result, proof)
        verifier.assert_called_once_with(auth_login.FIXED_CANARY_DOI, cookie_json)

    def test_canary_proof_requires_exact_browser_pdf_metadata(self) -> None:
        valid_hash = hashlib.sha256(b"%PDF-canary").hexdigest()
        cases = (
            BrowserProof(403, "application/pdf", "https://www.sciencedirect.com/paper.pdf", "CARSI-Browser", 12, valid_hash),
            BrowserProof(200, "text/html", "https://www.sciencedirect.com/paper.pdf", "CARSI-Browser", 12, valid_hash),
            BrowserProof(200, "application/pdf", "https://zjuam.zju.edu.cn/cas/login", "CARSI-Browser", 12, valid_hash),
        )
        for proof in cases:
            with self.subTest(proof=proof), self.assertRaises(ValueError):
                auth_login._validate_canary_proof(proof)


if __name__ == "__main__":
    unittest.main()
