from __future__ import annotations

import ast
import base64
import hashlib
import json
import os
from pathlib import Path
import tempfile
import types
import unittest
from unittest import mock

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from scansci_legal.browser_protocol import BrowserProof
from scansci_legal.strict_browser import (
    _ACTIVE_CAPTURE,
    BrowserPolicyError,
    _BrowserPdfCapture,
    capture_institutional_pdf,
    install_strict_scansci_browser,
    launch_strict_patchright,
    _run_pinned_carsi,
    strict_visible_browser,
    verify_institutional_canary,
)


PDF = b"%PDF-1.7\nstrict-carsi-browser\n"


class _Context:
    def __init__(self, page: object):
        self.pages = [page]
        self.closed = 0

    def close(self) -> None:
        self.closed += 1


class _Response:
    def __init__(self, *, status=200, mime="application/pdf", url=None, body=PDF):
        self.status = status
        self.headers = {"content-type": mime}
        self.url = url or "https://www.sciencedirect.com/science/article/pii/x/pdfft"
        self._body = body

    def body(self) -> bytes:
        return self._body


class _CdpSession:
    def __init__(self, body: bytes):
        self.body = body
        self.callback = None
        self.commands = []
        self.read = False

    def on(self, event: str, callback) -> None:
        self.assert_event = event
        self.callback = callback

    def send(self, command: str, params: dict):
        self.commands.append((command, params))
        if command == "Fetch.takeResponseBodyAsStream":
            return {"stream": "stream-1"}
        if command == "IO.read":
            if self.read:
                return {"data": "", "eof": True}
            self.read = True
            return {
                "data": base64.b64encode(self.body).decode("ascii"),
                "base64Encoded": True,
                "eof": True,
            }
        return {}

    def emit(self, response: _Response) -> None:
        self.callback({
            "requestId": "request-1",
            "request": {"url": response.url},
            "responseStatusCode": response.status,
            "responseHeaders": [
                {"name": name, "value": value}
                for name, value in response.headers.items()
            ],
        })


def _capture_response(response: _Response, *, maximum_bytes: int | None = None):
    capture = _BrowserPdfCapture()
    session = _CdpSession(response._body)
    context = types.SimpleNamespace(new_cdp_session=lambda _page: session)
    page = types.SimpleNamespace()
    capture.attach(context, page)
    patcher = mock.patch("scansci_legal.strict_browser.MAX_PDF_BYTES", maximum_bytes) if maximum_bytes else None
    if patcher:
        with patcher:
            session.emit(response)
    else:
        session.emit(response)
    return capture, session


class StrictBrowserLauncherTest(unittest.TestCase):
    def test_pinned_carsi_resolves_doi_through_only_the_controlled_proxy(self):
        observed = {}

        def try_carsi(identifier, output_path, config):
            observed.update({key: os.environ.get(key) for key in (
                "HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy",
                "NO_PROXY", "no_proxy",
            )})
            return {"identifier": identifier, "file": str(output_path), "config": config}

        publisher = types.SimpleNamespace()
        carsi = types.SimpleNamespace()
        carsi_source = types.SimpleNamespace(try_carsi=try_carsi)
        package = types.ModuleType("scansci_pdf")
        package.publisher_strategies = publisher
        sources = types.ModuleType("scansci_pdf.sources")
        sources.carsi = carsi
        sources.carsi_source = carsi_source
        package.sources = sources
        caller_environment = {
            "SCANSCI_BROWSER_PROXY": "http://openscience-egress:7891",
            "HTTP_PROXY": "http://caller-http.invalid",
            "HTTPS_PROXY": "http://caller-https.invalid",
            "http_proxy": "http://caller-http-lower.invalid",
            "https_proxy": "http://caller-https-lower.invalid",
            "NO_PROXY": "caller-no-proxy",
            "no_proxy": "caller-no-proxy-lower",
        }
        with mock.patch.dict(os.environ, caller_environment, clear=False), mock.patch.dict(
            sys.modules,
            {"scansci_pdf": package, "scansci_pdf.sources": sources},
        ), mock.patch("scansci_legal.strict_browser.install_strict_scansci_browser"):
            before = {key: os.environ.get(key) for key in caller_environment}
            result = _run_pinned_carsi(
                "10.1016/j.physleta.2023.129241", Path("paper.pdf"), {"carsi_enabled": True},
            )
            self.assertEqual(result["identifier"], "10.1016/j.physleta.2023.129241")
            self.assertEqual(
                observed,
                {
                    "HTTP_PROXY": "http://openscience-egress:7891",
                    "HTTPS_PROXY": "http://openscience-egress:7891",
                    "http_proxy": "http://openscience-egress:7891",
                    "https_proxy": "http://openscience-egress:7891",
                    "NO_PROXY": "localhost,127.0.0.1",
                    "no_proxy": "localhost,127.0.0.1",
                },
            )
            self.assertEqual(
                {key: os.environ.get(key) for key in caller_environment},
                before,
            )

    def test_pinned_carsi_rejects_an_uncontrolled_resolution_proxy(self):
        with mock.patch.dict(
            os.environ, {"SCANSCI_BROWSER_PROXY": "http://hostile.invalid:3128"}, clear=False,
        ), self.assertRaises(BrowserPolicyError) as raised:
            _run_pinned_carsi(
                "10.1016/j.physleta.2023.129241", Path("paper.pdf"), {"carsi_enabled": True},
            )
        self.assertEqual(raised.exception.code, "scansci_browser_proxy_invalid")

    def test_strict_context_calls_launcher_once_and_never_falls_back(self):
        page = types.SimpleNamespace(on=lambda *_: None)
        context = _Context(page)
        calls = []

        def failing_launcher(profile_dir: Path):
            calls.append(profile_dir)
            raise RuntimeError("launch failed")

        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(BrowserPolicyError):
                with strict_visible_browser(Path(directory), launcher=failing_launcher):
                    self.fail("unreachable")

        self.assertEqual(len(calls), 1)
        self.assertEqual(context.closed, 0)

    def test_patchright_launch_is_exactly_one_fixed_persistent_context(self):
        page = types.SimpleNamespace(on=lambda *_: None)
        context = _Context(page)
        launches = []

        class Chromium:
            def launch_persistent_context(self, *args, **kwargs):
                launches.append((args, kwargs))
                return context

        stopped = []
        playwright = types.SimpleNamespace(
            chromium=Chromium(), stop=lambda: stopped.append(True),
        )
        factory = types.SimpleNamespace(start=lambda: playwright)

        with tempfile.TemporaryDirectory() as directory, mock.patch.dict(
            os.environ, {"DISPLAY": ":99"}, clear=False,
        ):
            handle = launch_strict_patchright(Path(directory), playwright_factory=lambda: factory)
            handle.close()

        self.assertEqual(len(launches), 1)
        args, kwargs = launches[0]
        self.assertEqual(args, (directory,))
        self.assertEqual(kwargs["executable_path"], "/usr/local/bin/scansci-chromium")
        self.assertEqual(kwargs["proxy"], {"server": "http://openscience-egress:7891"})
        self.assertIs(kwargs["headless"], False)
        self.assertNotIn("channel", kwargs)
        self.assertEqual(context.closed, 1)
        self.assertEqual(stopped, [True])

    def test_rejects_nonfresh_profile_or_wrong_display_before_launch(self):
        calls = []
        with tempfile.TemporaryDirectory() as directory:
            profile = Path(directory)
            (profile / "old").write_text("x", encoding="ascii")
            with self.assertRaises(BrowserPolicyError):
                launch_strict_patchright(profile, playwright_factory=lambda: calls.append(True))
            (profile / "old").unlink()
            with mock.patch.dict(os.environ, {"DISPLAY": ":98"}, clear=False):
                with self.assertRaises(BrowserPolicyError):
                    launch_strict_patchright(profile, playwright_factory=lambda: calls.append(True))
        self.assertEqual(calls, [])


class SourceGuardTest(unittest.TestCase):
    VISIBLE_SOURCE = """\
def _visible_browser(config: dict[str, object], publisher: str, *, viewport: dict | None = None):
    yield config, publisher
"""
    CARSI_SOURCE = """\
def _download_via_cloakbrowser(self, doi: str, article_url: str, output_path: object):
    from somewhere import _visible_browser
    with _visible_browser(self.config, "publisher", viewport=None) as (context, page):
        return None
"""

    @staticmethod
    def _digest(source: str) -> str:
        return hashlib.sha256(
            ast.dump(ast.parse(source).body[0], annotate_fields=True, include_attributes=False).encode(),
        ).hexdigest()

    def _modules(self):
        def visible(config, publisher, *, viewport=None):
            del config, publisher, viewport

        def download(self, doi, article_url, output_path):
            del self, doi, article_url, output_path

        publisher = types.SimpleNamespace(_visible_browser=visible)
        carsi = types.SimpleNamespace(
            CARSIClient=types.SimpleNamespace(_download_via_cloakbrowser=download),
        )
        sources = {visible: self.VISIBLE_SOURCE, download: self.CARSI_SOURCE}
        return publisher, carsi, sources

    def test_installs_only_after_both_pinned_sources_match(self):
        publisher, carsi, sources = self._modules()
        install_strict_scansci_browser(
            publisher,
            carsi,
            source_reader=sources.__getitem__,
            expected_visible_digest=self._digest(self.VISIBLE_SOURCE),
            expected_carsi_digest=self._digest(self.CARSI_SOURCE),
        )
        self.assertIsNot(publisher._visible_browser, next(iter(sources)))

    def test_source_or_call_shape_drift_fails_before_install(self):
        publisher, carsi, sources = self._modules()
        old_visible = publisher._visible_browser
        sources[carsi.CARSIClient._download_via_cloakbrowser] = self.CARSI_SOURCE.replace(
            "viewport=None", "viewport={}",
        )
        with self.assertRaises(BrowserPolicyError):
            install_strict_scansci_browser(
                publisher,
                carsi,
                source_reader=sources.__getitem__,
                expected_visible_digest=self._digest(self.VISIBLE_SOURCE),
                expected_carsi_digest=self._digest(self.CARSI_SOURCE),
            )
        self.assertIs(publisher._visible_browser, old_visible)


class BrowserResponseProofTest(unittest.TestCase):
    def test_accepts_only_exact_browser_pdf_response_and_builds_proof(self):
        capture, session = _capture_response(_Response(mime=" Application/PDF ; charset=binary"))
        proof, content = capture.result(PDF)
        self.assertEqual(content, PDF)
        self.assertEqual(
            proof,
            BrowserProof(
                http_status=200,
                mime="application/pdf",
                final_url="https://www.sciencedirect.com/science/article/pii/x/pdfft",
                source="CARSI-Browser",
                byte_count=len(PDF),
                sha256=hashlib.sha256(PDF).hexdigest(),
            ),
        )
        self.assertIn("Fetch.takeResponseBodyAsStream", [item[0] for item in session.commands])
        self.assertIn("Fetch.fulfillRequest", [item[0] for item in session.commands])

    def test_rejects_navigation_only_and_every_nonproof_response(self):
        cases = (
            _Response(status=403),
            _Response(mime="text/html"),
            _Response(mime="application/octet-stream"),
            _Response(url="https://evilsciencedirect.com/paper.pdf"),
            _Response(body=b"not pdf"),
            _Response(body=b"%PDF-" + b"x" * 20),
        )
        for response in cases:
            with self.subTest(status=response.status, mime=response.headers["content-type"]):
                capture, _session = _capture_response(
                    response,
                    maximum_bytes=16 if len(response._body) > 20 else None,
                )
                with self.assertRaises(BrowserPolicyError):
                    capture.result(PDF)

    def test_marks_only_explicit_auth_challenges_as_auth_failures(self):
        for response in (
            _Response(status=403),
            _Response(mime="text/html"),
            _Response(mime="text/html", url="https://zjuam.zju.edu.cn/cas/login"),
        ):
            with self.subTest(status=response.status, url=response.url):
                capture, _session = _capture_response(response)
                self.assertTrue(capture.auth_failure_observed)

        capture, _session = _capture_response(_Response(mime="application/octet-stream"))
        self.assertFalse(capture.auth_failure_observed)

    def test_capture_publishes_only_the_strict_response_with_no_temp_residue(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            job_id = "a" * 32
            input_job = root / "inputs" / job_id
            output_job = root / "outputs" / job_id
            profiles = root / "profiles"
            input_job.mkdir(parents=True)
            output_job.parent.mkdir()
            profiles.mkdir()
            (input_job / "job.json").write_text(json.dumps({
                "schema": 1, "job_id": job_id,
                "identifier": "10.1016/j.physleta.2023.129241",
            }), encoding="ascii")
            (input_job / "cookies.json").write_text("[]", encoding="ascii")

            def runner(_identifier, _output, _config):
                _ACTIVE_CAPTURE.get()._record_streamed(
                    200,
                    "application/pdf",
                    "https://www.sciencedirect.com/science/article/pii/x/pdfft",
                    PDF,
                )
                _output.write_bytes(PDF)
                return {
                    "success": True,
                    "identifier": _identifier,
                    "doi": _identifier,
                    "file": str(_output),
                    "source": "CARSI-Browser",
                }

            previous_umask = os.umask(0o077)
            try:
                with mock.patch("scansci_legal.strict_browser._set_group"):
                    proof = capture_institutional_pdf(
                        "10.1016/j.physleta.2023.129241",
                        input_job,
                        output_job,
                        runner=runner,
                        profile_parent=profiles,
                    )
            finally:
                os.umask(previous_umask)

            envelope = json.loads((output_job / "proof.json").read_text("ascii"))
            self.assertEqual((output_job / "document.pdf").read_bytes(), PDF)
            self.assertEqual(envelope["proof"]["sha256"], proof.sha256)
            if os.name == "posix":
                self.assertEqual(output_job.stat().st_mode & 0o777, 0o750)
                self.assertEqual((output_job / "document.pdf").stat().st_mode & 0o777, 0o640)
                self.assertEqual((output_job / "proof.json").stat().st_mode & 0o777, 0o640)
            self.assertEqual(list(output_job.glob(".*.tmp")), [])
            self.assertEqual(list(profiles.iterdir()), [])

    def test_canary_uses_the_same_strict_capture_without_publishing_pdf_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            profiles = Path(directory) / "profiles"

            def runner(_identifier, _output, _config):
                _ACTIVE_CAPTURE.get()._record_streamed(
                    200,
                    "application/pdf",
                    "https://www.sciencedirect.com/science/article/pii/x/pdfft",
                    PDF,
                )
                _output.write_bytes(PDF)
                return {
                    "success": True,
                    "identifier": _identifier,
                    "doi": _identifier,
                    "file": str(_output),
                    "source": "CARSI-Browser",
                }

            proof = verify_institutional_canary(
                "10.1016/j.physleta.2023.129241",
                b'[{"name":"session","value":"verified","domain":".sciencedirect.com"}]',
                runner=runner,
                profile_parent=profiles,
            )

            self.assertEqual(proof.sha256, hashlib.sha256(PDF).hexdigest())
            self.assertEqual(list(profiles.iterdir()), [])

    def test_capture_rejects_callback_pdf_when_runner_did_not_select_it(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            job_id = "a" * 32
            input_job = root / "inputs" / job_id
            output_job = root / "outputs" / job_id
            profiles = root / "profiles"
            input_job.mkdir(parents=True)
            output_job.parent.mkdir()
            profiles.mkdir()
            identifier = "10.1016/j.physleta.2023.129241"
            (input_job / "job.json").write_text(json.dumps({
                "schema": 1, "job_id": job_id, "identifier": identifier,
            }), encoding="ascii")
            (input_job / "cookies.json").write_text("[]", encoding="ascii")

            def failed_runner(_identifier, _output, _config):
                _ACTIVE_CAPTURE.get()._record_streamed(
                    200,
                    "application/pdf",
                    "https://www.sciencedirect.com/science/article/pii/x/pdfft",
                    PDF,
                )
                return None

            with self.assertRaises(BrowserPolicyError) as raised:
                capture_institutional_pdf(
                    identifier, input_job, output_job,
                    runner=failed_runner, profile_parent=profiles,
                )
            self.assertEqual(raised.exception.code, "browser_policy_blocked")
            self.assertFalse(output_job.exists())

    def test_capture_metadata_is_bounded_across_many_pdf_responses(self):
        capture = _BrowserPdfCapture()
        for index in range(9):
            content = PDF + str(index).encode("ascii")
            capture._record_streamed(
                200,
                "application/pdf",
                f"https://www.sciencedirect.com/science/article/pii/{index}/pdfft",
                content,
            )
        self.assertEqual(capture._candidates, [])
        with self.assertRaises(BrowserPolicyError):
            capture.result(PDF)

    def test_capture_rejects_a_job_wide_pdf_byte_budget_overrun(self):
        capture = _BrowserPdfCapture()
        with mock.patch(
            "scansci_legal.strict_browser.MAX_CAPTURE_TOTAL_BYTES",
            len(PDF) + 1,
        ):
            self.assertTrue(capture._record_streamed(
                200,
                "application/pdf",
                "https://www.sciencedirect.com/first/pdfft",
                PDF,
            ))
            self.assertFalse(capture._record_streamed(
                200,
                "application/pdf",
                "https://www.sciencedirect.com/second/pdfft",
                PDF,
            ))
        self.assertEqual(capture._candidates, [])
        with self.assertRaises(BrowserPolicyError):
            capture.result(PDF)


if __name__ == "__main__":
    unittest.main()
