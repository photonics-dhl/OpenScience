from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest import mock

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from scansci_legal.browser_protocol import (
    BrowserJobClient,
    BrowserProof,
    BrowserProtocolError,
    BrowserResult,
    validate_browser_result,
)


PDF = b"%PDF-1.7\nstrict-browser-proof\n"
DOI = "10.1016/j.physleta.2023.129241"


def _proof(content: bytes = PDF) -> dict[str, object]:
    return {
        "http_status": 200,
        "mime": "application/pdf",
        "final_url": "https://www.sciencedirect.com/science/article/pii/S0375960123007779/pdfft",
        "source": "CARSI-Browser",
        "byte_count": len(content),
        "sha256": hashlib.sha256(content).hexdigest(),
    }


def _envelope(
    job_id: str,
    identifier: str = DOI,
    proof: dict[str, object] | None = None,
) -> dict[str, object]:
    return {
        "schema": 1,
        "job_id": job_id,
        "identifier": identifier,
        "proof": proof or _proof(),
    }


def _identity() -> tuple[int | None, int | None]:
    uid = os.geteuid() if hasattr(os, "geteuid") else None
    gid = os.getegid() if hasattr(os, "getegid") else None
    return uid, gid


class BrowserResultValidationTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name).resolve()
        self.output_root = self.root / "outputs"
        self.output_root.mkdir()
        self.job_id = "a" * 32
        self.job = self.output_root / self.job_id
        self.job.mkdir()
        self.pdf_path = self.job / "document.pdf"
        self.proof_path = self.job / "proof.json"
        if os.name != "nt":
            self.job.chmod(0o750)

    def tearDown(self):
        self.directory.cleanup()

    def write_result(
        self,
        proof: dict[str, object] | bytes,
        content: bytes = PDF,
        *,
        job_id: str | None = None,
        identifier: str = DOI,
    ) -> None:
        self.pdf_path.write_bytes(content)
        payload = proof if isinstance(proof, bytes) else _envelope(
            job_id or self.job_id, identifier, proof,
        )
        encoded = payload if isinstance(payload, bytes) else json.dumps(
            payload, sort_keys=True, separators=(",", ":"),
        ).encode("ascii")
        self.proof_path.write_bytes(encoded)
        if os.name != "nt":
            self.pdf_path.chmod(0o640)
            self.proof_path.chmod(0o640)

    def validate(self) -> BrowserResult:
        uid, gid = _identity()
        return validate_browser_result(
            self.job_id,
            self.proof_path,
            self.pdf_path,
            output_root=self.output_root,
            identifier=DOI,
            expected_browser_uid=uid,
            expected_shared_gid=gid,
        )

    def assert_invalid(self) -> None:
        with self.assertRaises(BrowserProtocolError) as raised:
            self.validate()
        self.assertEqual(raised.exception.code, "invalid_browser_result")

    def test_accepts_only_matching_browser_originated_pdf_proof(self):
        self.write_result(_proof())

        result = self.validate()

        self.assertEqual(result, BrowserResult(PDF, BrowserProof(**_proof())))

    def test_rejects_status_mime_source_url_and_pdf_mismatches(self):
        cases = (
            {"http_status": 403},
            {"http_status": 300},
            {"mime": "text/html"},
            {"mime": "application/pdf; charset=binary"},
            {"source": "CARSI"},
            {"final_url": "http://www.sciencedirect.com/pdfft"},
            {"final_url": "https://evilsciencedirect.com/pdfft"},
            {"final_url": "https://127.0.0.1/pdfft"},
            {"byte_count": len(PDF) + 1},
            {"sha256": "0" * 64},
        )
        for mutation in cases:
            with self.subTest(mutation=mutation):
                self.write_result({**_proof(), **mutation})
                self.assert_invalid()

        self.write_result(_proof(b"not-a-pdf"), b"not-a-pdf")
        self.assert_invalid()

    def test_rejects_duplicate_unknown_missing_or_oversized_proof_fields(self):
        encoded_proof = json.dumps(_proof(), sort_keys=True, separators=(",", ":")).encode("ascii")
        duplicate = (
            b'{"schema":1,"job_id":"' + self.job_id.encode("ascii")
            + b'","job_id":"' + self.job_id.encode("ascii")
            + b'","identifier":"' + DOI.encode("ascii") + b'","proof":'
            + encoded_proof + b"}"
        )
        for proof in (
            duplicate,
            {key: value for key, value in _proof().items() if key != "source"},
            {**_proof(), "job_id": self.job_id},
            b"{" + b" " * (8 * 1024) + b"}",
        ):
            with self.subTest(proof=type(proof).__name__):
                self.write_result(proof)
                self.assert_invalid()

    def test_rejects_noncanonical_job_identity_and_paths_outside_output_root(self):
        self.write_result(_proof())
        uid, gid = _identity()
        for job_id in ("A" * 32, "a" * 31, "../" + "a" * 29):
            with self.subTest(job_id=job_id), self.assertRaises(BrowserProtocolError):
                validate_browser_result(
                    job_id,
                    self.proof_path,
                    self.pdf_path,
                    output_root=self.output_root,
                    identifier=DOI,
                    expected_browser_uid=uid,
                    expected_shared_gid=gid,
                )

        outside = self.root / "outside.pdf"
        outside.write_bytes(PDF)
        if os.name != "nt":
            outside.chmod(0o640)
        with self.assertRaises(BrowserProtocolError):
            validate_browser_result(
                self.job_id,
                self.proof_path,
                outside,
                output_root=self.output_root,
                identifier=DOI,
                expected_browser_uid=uid,
                expected_shared_gid=gid,
            )

    def test_rejects_linked_result_files(self):
        self.write_result(_proof())
        linked = self.job / "linked.pdf"
        os.link(self.pdf_path, linked)

        self.assert_invalid()

    def test_rejects_a_hardlink_added_after_the_result_file_is_opened(self):
        self.write_result(_proof())
        linked = self.job / "late-linked.pdf"
        real_fstat = os.fstat
        raced = False

        def add_link_after_open(descriptor: int):
            nonlocal raced
            details = real_fstat(descriptor)
            if not raced and details.st_size == len(PDF):
                os.link(self.pdf_path, linked)
                raced = True
            return details

        with mock.patch("scansci_legal.browser_protocol.os.fstat", side_effect=add_link_after_open):
            self.assert_invalid()

    def test_rejects_proof_from_another_job_or_identifier(self):
        for job_id, identifier in (("b" * 32, DOI), (self.job_id, "10.1000/other")):
            with self.subTest(job_id=job_id, identifier=identifier):
                self.write_result(_proof(), job_id=job_id, identifier=identifier)
                self.assert_invalid()

    @unittest.skipIf(os.name == "nt", "directory no-follow contract is POSIX-only")
    def test_rejects_a_job_directory_symlinked_to_a_stale_job(self):
        stale_job = self.output_root / ("b" * 32)
        stale_job.mkdir(mode=0o750)
        self.job.rmdir()
        self.job.symlink_to(stale_job, target_is_directory=True)
        self.write_result(_proof())

        self.assert_invalid()

    def test_rejects_deeply_nested_proof_with_a_stable_error(self):
        self.write_result(b"[" * 1100 + b"0" + b"]" * 1100)

        self.assert_invalid()


class BrowserJobClientTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name).resolve()
        self.input_root = self.root / "inputs"
        self.output_root = self.root / "outputs"
        self.input_root.mkdir()
        self.output_root.mkdir()

    def tearDown(self):
        self.directory.cleanup()

    def client(self, timeout: float = 1.0, cleanup_timeout: float = 0.2) -> BrowserJobClient:
        uid, gid = _identity()
        return BrowserJobClient(
            self.input_root,
            self.output_root,
            timeout_seconds=timeout,
            cleanup_timeout_seconds=cleanup_timeout,
            poll_interval_seconds=0.005,
            expected_browser_uid=uid,
            expected_shared_gid=gid,
        )

    def test_submits_cookie_outside_manifest_and_completes_owner_safe_handshake(self):
        observed: dict[str, object] = {}

        def browser() -> None:
            deadline = time.monotonic() + 1
            while time.monotonic() < deadline:
                jobs = list(self.input_root.iterdir())
                if jobs and (jobs[0] / "job.json").exists():
                    break
                time.sleep(0.005)
            else:
                return
            input_job = jobs[0]
            manifest_bytes = (input_job / "job.json").read_bytes()
            observed["manifest"] = manifest_bytes
            observed["cookie"] = (input_job / "cookies.json").read_bytes()
            manifest = json.loads(manifest_bytes)
            output_job = self.output_root / manifest["job_id"]
            output_job.mkdir()
            if os.name != "nt":
                output_job.chmod(0o750)
            (output_job / "document.pdf").write_bytes(PDF)
            (output_job / "proof.json").write_text(
                json.dumps(
                    _envelope(manifest["job_id"], manifest["identifier"]),
                    sort_keys=True,
                    separators=(",", ":"),
                ),
                encoding="ascii",
            )
            if os.name != "nt":
                (output_job / "document.pdf").chmod(0o640)
                (output_job / "proof.json").chmod(0o640)
            while time.monotonic() < deadline and not (input_job / "ack.json").exists():
                time.sleep(0.005)
            for child in output_job.iterdir():
                child.unlink()
            output_job.rmdir()

        thread = threading.Thread(target=browser)
        thread.start()
        cookie = b'[{"name":"session","value":"private-cookie"}]'

        result = self.client().submit(DOI, cookie)
        thread.join(timeout=1)

        self.assertEqual(result.content, PDF)
        self.assertEqual(observed["cookie"], cookie)
        self.assertNotIn(b"private-cookie", observed["manifest"])
        self.assertEqual(json.loads(observed["manifest"])["identifier"], DOI)
        self.assertEqual(list(self.input_root.iterdir()), [])
        self.assertEqual(list(self.output_root.iterdir()), [])

    def test_timeout_removes_only_legal_owned_input(self):
        sentinel = self.output_root / "browser-owned-sentinel"
        sentinel.mkdir()
        (sentinel / "proof.json").write_text("browser-owned", encoding="ascii")

        with self.assertRaises(BrowserProtocolError) as raised:
            self.client(timeout=0.02).submit(
                DOI, b'[{"name":"session","value":"private-cookie"}]',
            )

        self.assertEqual(raised.exception.code, "browser_timeout")
        self.assertEqual(list(self.input_root.iterdir()), [])
        self.assertEqual((sentinel / "proof.json").read_text(encoding="ascii"), "browser-owned")

    def test_result_at_acquisition_deadline_gets_a_separate_cleanup_window(self):
        def browser() -> None:
            deadline = time.monotonic() + 1
            while time.monotonic() < deadline:
                jobs = list(self.input_root.iterdir())
                if jobs and (jobs[0] / "job.json").exists():
                    break
                time.sleep(0.001)
            input_job = jobs[0]
            manifest = json.loads((input_job / "job.json").read_bytes())
            time.sleep(0.2)
            output_job = self.output_root / manifest["job_id"]
            output_job.mkdir()
            if os.name != "nt":
                output_job.chmod(0o750)
            (output_job / "document.pdf").write_bytes(PDF)
            (output_job / "proof.json").write_text(
                json.dumps(_envelope(manifest["job_id"], manifest["identifier"])),
                encoding="ascii",
            )
            if os.name != "nt":
                (output_job / "document.pdf").chmod(0o640)
                (output_job / "proof.json").chmod(0o640)
            while not (input_job / "ack.json").exists():
                time.sleep(0.001)
            time.sleep(0.15)
            for child in output_job.iterdir():
                child.unlink()
            output_job.rmdir()

        thread = threading.Thread(target=browser)
        thread.start()
        result = self.client(timeout=0.3, cleanup_timeout=0.3).submit(
            DOI, b'[{"name":"session","value":"private-cookie"}]',
        )
        thread.join(timeout=1)

        self.assertEqual(result.content, PDF)

    def test_atomic_cookie_publish_failures_leave_no_temp_or_secret(self):
        for operation in ("fsync", "replace"):
            with self.subTest(operation=operation):
                patch_target = f"scansci_legal.browser_protocol.os.{operation}"
                with mock.patch(patch_target, side_effect=OSError("private-cookie")):
                    with self.assertRaises(BrowserProtocolError) as raised:
                        self.client(timeout=0.01).submit(
                            DOI, b'[{"name":"session","value":"private-cookie"}]',
                        )
                self.assertEqual(raised.exception.code, "invalid_browser_job")
                self.assertNotIn("private-cookie", str(raised.exception))
                self.assertEqual(list(self.input_root.iterdir()), [])

    def test_rejects_invalid_identifier_and_cookie_before_publishing_a_job(self):
        for identifier, cookie in (
            ("https://www.sciencedirect.com/private", b'[{"name":"a","value":"b"}]'),
            (DOI, b"not-json"),
            (DOI, b'[{"name":"a","value":"b"},{"name":"a","value":"b"}]'),
            (DOI, b'[{"name":"a","value":"b","name":"duplicate"}]'),
            (DOI, b"[" * 1100 + b"0" + b"]" * 1100),
        ):
            with self.subTest(identifier=identifier, cookie=cookie), self.assertRaises(BrowserProtocolError):
                self.client(timeout=0.01).submit(identifier, cookie)
        self.assertEqual(list(self.input_root.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
