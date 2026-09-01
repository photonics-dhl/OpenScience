from __future__ import annotations

import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import tempfile
import time
import unittest
from unittest import mock

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from scansci_legal.browser_worker import (
    BROWSER_PROCESS_TIMEOUT_SECONDS,
    BROWSER_TERMINAL_RESERVE_SECONDS,
    BrowserWorkerError,
    _cleanup_acknowledged_outputs,
    _cleanup_stale_outputs,
    _launch_job,
    _refresh_heartbeat,
    _terminate_and_reap,
    browser_worker_is_healthy,
)
from scansci_legal.browser_protocol import BROWSER_JOB_TIMEOUT_SECONDS


DOI = "10.1016/j.physleta.2023.129241"


class BrowserWorkerHealthTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        self.heartbeat = self.root / "heartbeat"

    def tearDown(self):
        self.directory.cleanup()

    @unittest.skipIf(os.name == "nt", "POSIX owner and mode contract")
    def test_health_is_passive_and_accepts_only_fresh_owned_mode_0600_file(self):
        _refresh_heartbeat(self.heartbeat)
        details = self.heartbeat.stat()
        self.assertEqual(stat.S_IMODE(details.st_mode), 0o600)
        self.assertTrue(browser_worker_is_healthy(self.heartbeat, now=details.st_mtime + 19))
        self.assertFalse(browser_worker_is_healthy(self.heartbeat, now=details.st_mtime + 21))
        self.heartbeat.chmod(0o640)
        self.assertFalse(browser_worker_is_healthy(self.heartbeat, now=details.st_mtime))

    def test_health_rejects_symlink_and_never_invokes_browser_or_job_code(self):
        target = self.root / "target"
        target.write_text("ok", encoding="ascii")
        target.chmod(0o600)
        try:
            self.heartbeat.symlink_to(target)
        except OSError:
            self.skipTest("symlinks unavailable")
        with mock.patch("scansci_legal.browser_worker._launch_job") as launch:
            self.assertFalse(browser_worker_is_healthy(self.heartbeat))
        launch.assert_not_called()


class BrowserWorkerControllerTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        self.inputs = self.root / "inputs"
        self.outputs = self.root / "outputs"
        self.inputs.mkdir()
        self.outputs.mkdir()
        self.profiles = self.root / "profiles"
        self.profiles.mkdir()
        self.job_id = "a" * 32
        self.input_job = self.inputs / self.job_id
        self.input_job.mkdir()
        (self.input_job / "job.json").write_text(json.dumps({
            "schema": 1, "job_id": self.job_id, "identifier": DOI,
        }), encoding="ascii")
        (self.input_job / "cookies.json").write_text("[]", encoding="ascii")

    def tearDown(self):
        self.directory.cleanup()

    def test_launches_one_fresh_process_group_and_returns_success(self):
        calls = []

        class Process:
            pid = 4321
            returncode = 0
            def wait(self, timeout):
                calls.append(("wait", timeout))
                return 0

        def popen(command, **kwargs):
            calls.append((command, kwargs))
            return Process()

        self.assertTrue(_launch_job(
            self.job_id, self.inputs, self.outputs,
            popen_factory=popen, profile_root=self.profiles,
        ))
        command, kwargs = calls[0]
        self.assertIn("--job", command)
        self.assertIn(self.job_id, command)
        if os.name == "posix":
            self.assertIs(kwargs["start_new_session"], True)
        self.assertEqual(calls[1], ("wait", 5))

    def test_worker_budget_leaves_a_fixed_terminal_window_before_client_timeout(self):
        self.assertEqual(
            BROWSER_PROCESS_TIMEOUT_SECONDS + BROWSER_TERMINAL_RESERVE_SECONDS,
            BROWSER_JOB_TIMEOUT_SECONDS,
        )
        self.assertGreaterEqual(BROWSER_TERMINAL_RESERVE_SECONDS, 30)

    def test_refreshes_heartbeat_while_a_job_is_still_running(self):
        heartbeat = self.root / "heartbeat"

        class Process:
            pid = 4321
            attempts = 0
            def wait(self, timeout=None):
                self.attempts += 1
                if self.attempts == 1:
                    raise subprocess.TimeoutExpired("browser-job", timeout)
                return 0

        self.assertTrue(_launch_job(
            self.job_id,
            self.inputs,
            self.outputs,
            popen_factory=lambda *_args, **_kwargs: Process(),
            heartbeat=heartbeat,
            timeout_seconds=10,
            profile_root=self.profiles,
        ))
        self.assertTrue(heartbeat.exists())

    def test_heartbeat_failure_terminates_the_active_child(self):
        class Process:
            pid = 4321
            killed = False
            attempts = 0
            def wait(self, timeout=None):
                self.attempts += 1
                if self.killed:
                    return -9
                if self.attempts == 1:
                    raise subprocess.TimeoutExpired("browser-job", timeout)
                return -15
            def kill(self):
                self.killed = True

        process = Process()
        patches = [mock.patch(
            "scansci_legal.browser_worker._refresh_heartbeat",
            side_effect=OSError("disk failure"),
        )]
        if os.name == "posix":
            def signal_group(_pid, sent_signal):
                if sent_signal == 0:
                    raise ProcessLookupError
            patches.append(mock.patch(
                "scansci_legal.browser_worker.os.killpg", side_effect=signal_group,
            ))
        with patches[0] as _heartbeat:
            if os.name == "posix":
                with patches[1] as killpg:
                    with self.assertRaises(BrowserWorkerError):
                        _launch_job(
                            self.job_id, self.inputs, self.outputs,
                            popen_factory=lambda *_args, **_kwargs: process,
                            profile_root=self.profiles,
                        )
                    self.assertGreaterEqual(killpg.call_count, 3)
            else:
                with self.assertRaises(BrowserWorkerError):
                    _launch_job(
                        self.job_id, self.inputs, self.outputs,
                        popen_factory=lambda *_args, **_kwargs: process,
                        profile_root=self.profiles,
                    )
                self.assertTrue(process.killed)

    @unittest.skipUnless(os.name == "posix", "process-group signals are POSIX-only")
    def test_timeout_kills_the_whole_process_group(self):
        class Process:
            pid = 4321
            returncode = None
            waits = 0
            def wait(self, timeout=None):
                self.waits += 1
                if self.waits == 1:
                    raise subprocess.TimeoutExpired("browser-job", timeout)
                self.returncode = -9
                return -9

        process = Process()
        clock_values = iter((0.0, 0.0, 1.0))

        def signal_group(_pid, sent_signal):
            if sent_signal == 0:
                raise ProcessLookupError

        with mock.patch(
            "scansci_legal.browser_worker.os.killpg", side_effect=signal_group,
        ) as killpg:
            with self.assertRaises(BrowserWorkerError):
                _launch_job(
                    self.job_id,
                    self.inputs,
                    self.outputs,
                    popen_factory=lambda *_args, **_kwargs: process,
                    timeout_seconds=0.5,
                    clock=lambda: next(clock_values),
                    profile_root=self.profiles,
                )
        self.assertIn(mock.call(process.pid, signal.SIGTERM), killpg.call_args_list)
        self.assertIn(mock.call(process.pid, signal.SIGKILL), killpg.call_args_list)
        self.assertIn(mock.call(process.pid, 0), killpg.call_args_list)

    def test_crash_publishes_stable_failure_and_leaves_input_owned_by_legal(self):
        class Process:
            pid = 4321
            def wait(self, timeout=None):
                return 2

        self.assertFalse(_launch_job(
            self.job_id,
            self.inputs,
            self.outputs,
            popen_factory=lambda *_args, **_kwargs: Process(),
            heartbeat=None,
            profile_root=self.profiles,
        ))
        failure = json.loads((self.outputs / self.job_id / "failure.json").read_text("ascii"))
        self.assertEqual(failure["error"], "browser_worker_crash")
        self.assertEqual(failure["job_id"], self.job_id)
        self.assertTrue(self.input_job.exists())

    def test_removes_only_the_exact_killed_jobs_fresh_profile(self):
        other = self.profiles / ("b" * 32)
        other.mkdir()

        class Process:
            pid = 4321
            def wait(self, timeout=None):
                return 0

        def popen(command, **_kwargs):
            workspace = Path(command[command.index("--workspace") + 1])
            (workspace / "private-cookie-cache").write_text("secret", encoding="ascii")
            workspace.chmod(0o755)
            return Process()

        _launch_job(
            self.job_id,
            self.inputs,
            self.outputs,
            popen_factory=popen,
            heartbeat=None,
            profile_root=self.profiles,
        )
        self.assertFalse((self.profiles / self.job_id).exists())
        self.assertTrue(other.exists())

    def test_removes_only_browser_output_after_matching_input_ack(self):
        output_job = self.outputs / self.job_id
        output_job.mkdir()
        (output_job / "document.pdf").write_bytes(b"%PDF-x")

        self.assertEqual(_cleanup_acknowledged_outputs(self.inputs, self.outputs), 0)
        (self.input_job / "ack.json").write_text('{"status":"consumed"}', encoding="ascii")
        self.assertEqual(_cleanup_acknowledged_outputs(self.inputs, self.outputs), 1)
        self.assertFalse(output_job.exists())
        self.assertTrue(self.input_job.exists())

    def test_stale_sweep_removes_only_old_browser_owned_job_outputs(self):
        stale = self.outputs / self.job_id
        fresh = self.outputs / ("b" * 32)
        unrelated = self.outputs / "not-a-job"
        for path in (stale, fresh, unrelated):
            path.mkdir()
        old = time.time() - 601
        os.utime(stale, (old, old))

        self.assertEqual(_cleanup_stale_outputs(self.outputs, now=time.time()), 1)
        self.assertFalse(stale.exists())
        self.assertTrue(fresh.exists())
        self.assertTrue(unrelated.exists())

    def test_unpublishable_terminal_failure_is_fatal_not_retried(self):
        class Process:
            pid = 4321
            def wait(self, timeout=None):
                return 2

        with mock.patch("scansci_legal.browser_worker._publish_failure", return_value=False):
            with self.assertRaises(BrowserWorkerError) as raised:
                _launch_job(
                    self.job_id,
                    self.inputs,
                    self.outputs,
                    popen_factory=lambda *_args, **_kwargs: Process(),
                    heartbeat=None,
                    profile_root=self.profiles,
                )
        self.assertTrue(raised.exception.fatal)


@unittest.skipUnless(os.name == "posix", "real process-group contract is POSIX-only")
class ProcessGroupIntegrationTest(unittest.TestCase):
    def _spawn_group(self, *, leader_waits: bool) -> tuple[subprocess.Popen[str], int]:
        leader_delay = "time.sleep(60)" if leader_waits else "None"
        script = (
            "import subprocess,sys,time;"
            "child=subprocess.Popen([sys.executable,'-c','import time;time.sleep(60)'],"
            "stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);"
            "print(child.pid,flush=True);"
            f"{leader_delay}"
        )
        process = subprocess.Popen(
            [sys.executable, "-c", script],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            start_new_session=True,
        )
        assert process.stdout is not None
        child_pid = int(process.stdout.readline().strip())
        return process, child_pid

    def _assert_group_absent(self, process_group: int) -> None:
        with self.assertRaises(ProcessLookupError):
            os.killpg(process_group, 0)

    def test_timeout_cleanup_reaps_a_live_leader_and_descendant(self):
        process, _child_pid = self._spawn_group(leader_waits=True)
        try:
            _terminate_and_reap(process)
            self._assert_group_absent(process.pid)
        finally:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass

    def test_normal_leader_exit_still_kills_and_reaps_its_descendant(self):
        process, _child_pid = self._spawn_group(leader_waits=False)
        process.wait(timeout=5)
        try:
            _terminate_and_reap(process, leader_exited=True)
            self._assert_group_absent(process.pid)
        finally:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass


if __name__ == "__main__":
    unittest.main()
