from __future__ import annotations

import hashlib
from contextlib import contextmanager
import json
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
