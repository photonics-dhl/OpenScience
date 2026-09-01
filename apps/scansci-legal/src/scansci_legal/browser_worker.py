"""Serial controller for the owner-separated institutional browser worker."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import json
import os
from pathlib import Path
import shutil
import signal
import stat
import subprocess
import sys
import time
from typing import Callable, Sequence

from .browser_protocol import BROWSER_JOB_TIMEOUT_SECONDS, JOB_ID, SHARED_GID
from .limits import MAX_BROWSER_MANIFEST_BYTES
from .strict_browser import BrowserPolicyError, capture_institutional_pdf


HEARTBEAT_PATH = Path("/tmp/scansci-browser-heartbeat")
PROFILE_ROOT = Path("/browser-profile-jobs")
HEARTBEAT_INTERVAL_SECONDS = 5
HEARTBEAT_MAX_AGE_SECONDS = 20
STALE_OUTPUT_SECONDS = 10 * 60
STALE_SWEEP_INTERVAL_SECONDS = 60
POLL_INTERVAL_SECONDS = 0.2
BROWSER_TERMINAL_RESERVE_SECONDS = 30
BROWSER_PROCESS_TIMEOUT_SECONDS = (
    BROWSER_JOB_TIMEOUT_SECONDS - BROWSER_TERMINAL_RESERVE_SECONDS
)


class BrowserWorkerError(RuntimeError):
    """Stable controller failure that does not expose secrets."""

    def __init__(self, message: str, *, fatal: bool = False):
        self.fatal = fatal
        super().__init__(message)


@dataclass(frozen=True)
class _WorkspaceLease:
    root: Path
    path: Path
    device: int
    inode: int


def browser_worker_is_healthy(
    heartbeat: Path = HEARTBEAT_PATH,
    *,
    now: float | None = None,
) -> bool:
    """Passively validate only the heartbeat inode and timestamp."""

    try:
        details = os.lstat(heartbeat)
        expected_uid = os.geteuid() if hasattr(os, "geteuid") else details.st_uid
        current = time.time() if now is None else now
        return (
            stat.S_ISREG(details.st_mode)
            and details.st_nlink == 1
            and details.st_uid == expected_uid
            and stat.S_IMODE(details.st_mode) == 0o600
            and 0 <= current - details.st_mtime <= HEARTBEAT_MAX_AGE_SECONDS
        )
    except (OSError, TypeError, ValueError):
        return False


def run_browser_worker(
    input_root: Path = Path("/browser-inputs"),
    output_root: Path = Path("/browser-outputs"),
) -> None:
    """Observe legal inputs and execute at most one isolated job at a time."""

    inputs = _existing_root(input_root)
    outputs = _existing_root(output_root)
    if inputs == outputs:
        raise BrowserWorkerError("browser roots must be separate")
    _cleanup_stale_outputs(outputs)
    last_heartbeat = 0.0
    last_stale_sweep = time.monotonic()
    attempted: set[str] = set()
    while True:
        current = time.monotonic()
        if current - last_heartbeat >= HEARTBEAT_INTERVAL_SECONDS:
            _refresh_heartbeat(HEARTBEAT_PATH)
            last_heartbeat = current
        _cleanup_acknowledged_outputs(inputs, outputs)
        if current - last_stale_sweep >= STALE_SWEEP_INTERVAL_SECONDS:
            _cleanup_stale_outputs(outputs)
            last_stale_sweep = current
        present = {
            path.name for path in inputs.iterdir()
            if JOB_ID.fullmatch(path.name)
        }
        attempted.intersection_update(present)
        for input_job in sorted(inputs.iterdir(), key=lambda path: path.name):
            if not _observable_job(input_job, inputs):
                continue
            if input_job.name in attempted:
                continue
            output_job = outputs / input_job.name
            if output_job.exists():
                continue
            attempted.add(input_job.name)
            try:
                _launch_job(input_job.name, inputs, outputs)
            except BrowserWorkerError as error:
                if error.fatal:
                    HEARTBEAT_PATH.unlink(missing_ok=True)
                    raise
            break
        time.sleep(POLL_INTERVAL_SECONDS)


def _launch_job(
    job_id: str,
    input_root: Path,
    output_root: Path,
    *,
    popen_factory: Callable[..., object] = subprocess.Popen,
    timeout_error: type[BaseException] = subprocess.TimeoutExpired,
    heartbeat: Path | None = HEARTBEAT_PATH,
    profile_root: Path = PROFILE_ROOT,
    timeout_seconds: float = BROWSER_PROCESS_TIMEOUT_SECONDS,
    clock: Callable[[], float] = time.monotonic,
) -> bool:
    if not JOB_ID.fullmatch(job_id):
        raise BrowserWorkerError("invalid browser job")
    if not 0 < timeout_seconds <= BROWSER_PROCESS_TIMEOUT_SECONDS:
        raise BrowserWorkerError("invalid browser timeout")
    inputs = _existing_root(input_root)
    outputs = _existing_root(output_root)
    input_job = inputs / job_id
    if not _observable_job(input_job, inputs):
        raise BrowserWorkerError("invalid browser job")
    manifest = _read_manifest(input_job)
    identifier = manifest["identifier"]
    workspace = _prepare_job_workspace(job_id, profile_root)
    command = [
        sys.executable,
        "-m",
        "scansci_legal.browser_worker",
        "--job",
        job_id,
        "--input-root",
        str(inputs),
        "--output-root",
        str(outputs),
        "--workspace",
        str(workspace.path),
    ]
    process = None
    return_code: int | None = None
    timed_out = False
    process_group_gone = False
    workspace_cleaned = False
    try:
        process = popen_factory(
            command,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            close_fds=True,
            start_new_session=os.name == "posix",
        )
        deadline = clock() + timeout_seconds
        while True:
            remaining = deadline - clock()
            if remaining <= 0:
                timed_out = True
                break
            try:
                return_code = process.wait(  # type: ignore[attr-defined]
                    timeout=min(HEARTBEAT_INTERVAL_SECONDS, remaining),
                )
                break
            except timeout_error:
                if heartbeat is not None:
                    _refresh_heartbeat(heartbeat)
        if timed_out:
            _terminate_and_reap(process)
            process_group_gone = True
            _require_failure_published(outputs / job_id, job_id, identifier, "browser_timeout")
            raise BrowserWorkerError("browser job timed out")
    except BrowserWorkerError:
        raise
    except timeout_error as error:
        _terminate_and_reap(process)
        process_group_gone = True
        _require_failure_published(outputs / job_id, job_id, identifier, "browser_timeout")
        raise BrowserWorkerError("browser job timed out") from error
    except (OSError, ValueError) as error:
        if process is not None:
            try:
                _terminate_and_reap(process)
                process_group_gone = True
            except BrowserWorkerError:
                raise
        else:
            process_group_gone = True
        _require_failure_published(outputs / job_id, job_id, identifier, "browser_worker_crash")
        raise BrowserWorkerError("browser job could not start") from error
    finally:
        if process_group_gone:
            _cleanup_job_workspace(workspace)
            workspace_cleaned = True
    if return_code != 0:
        _terminate_and_reap(process, leader_exited=True)
        process_group_gone = True
        if not workspace_cleaned:
            _cleanup_job_workspace(workspace)
            workspace_cleaned = True
        _require_failure_published(outputs / job_id, job_id, identifier, "browser_worker_crash")
        return False
    _terminate_and_reap(process, leader_exited=True)
    process_group_gone = True
    if not workspace_cleaned:
        _cleanup_job_workspace(workspace)
    return True


def _terminate_and_reap(process: object | None, *, leader_exited: bool = False) -> None:
    if process is None:
        return
    if os.name != "posix":
        try:
            if not leader_exited:
                process.kill()  # type: ignore[attr-defined]
            process.wait(timeout=5)  # type: ignore[attr-defined]
            return
        except Exception as error:
            raise BrowserWorkerError("browser process could not be reaped", fatal=True) from error
    pid = process.pid  # type: ignore[attr-defined]
    try:
        if not leader_exited:
            try:
                os.killpg(pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                process.wait(timeout=2)  # type: ignore[attr-defined]
            except subprocess.TimeoutExpired:
                pass
        if os.name == "posix":
            try:
                os.killpg(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        if not leader_exited:
            process.wait(timeout=5)  # type: ignore[attr-defined]
        _wait_for_process_group_exit(pid)
    except BrowserWorkerError:
        raise
    except Exception as error:
        raise BrowserWorkerError("browser process group could not be reaped", fatal=True) from error


def _wait_for_process_group_exit(pid: int) -> None:
    deadline = time.monotonic() + 5
    while True:
        try:
            os.killpg(pid, 0)
        except ProcessLookupError:
            return
        except OSError as error:
            raise BrowserWorkerError("browser process group state is unknown", fatal=True) from error
        if time.monotonic() >= deadline:
            raise BrowserWorkerError("browser process group did not exit", fatal=True)
        time.sleep(0.05)


def _prepare_job_workspace(job_id: str, profile_root: Path) -> _WorkspaceLease:
    root = Path(profile_root)
    try:
        if root.is_symlink() or not root.is_dir():
            raise ValueError("invalid profile root")
        resolved_root = root.resolve(strict=True)
        root_details = os.lstat(resolved_root)
        if os.name != "nt" and (
            root_details.st_uid != os.geteuid()
            or stat.S_IMODE(root_details.st_mode) != 0o700
        ):
            raise ValueError("unsafe profile root")
        workspace = resolved_root / job_id
        workspace.mkdir(mode=0o700)
        if os.name != "nt":
            workspace.chmod(0o700)
        details = os.lstat(workspace)
        return _WorkspaceLease(resolved_root, workspace, details.st_dev, details.st_ino)
    except (OSError, ValueError) as error:
        raise BrowserWorkerError("browser workspace could not be prepared", fatal=True) from error


def _cleanup_job_workspace(lease: _WorkspaceLease) -> None:
    try:
        details = os.lstat(lease.path)
        if (
            lease.path.parent.resolve() != lease.root
            or lease.path.is_symlink()
            or not stat.S_ISDIR(details.st_mode)
            or (details.st_dev, details.st_ino) != (lease.device, lease.inode)
        ):
            raise ValueError("workspace identity drifted")
        if os.name != "nt" and details.st_uid != os.geteuid():
            raise ValueError("workspace owner drifted")
        _remove_owned_entry(lease.path)
        if lease.path.exists() or lease.path.is_symlink():
            raise ValueError("workspace still exists")
    except (OSError, ValueError) as error:
        raise BrowserWorkerError("browser workspace could not be cleaned", fatal=True) from error


def _remove_owned_entry(path: Path) -> None:
    details = os.lstat(path)
    if os.name != "nt" and details.st_uid != os.geteuid():
        raise ValueError("profile entry owner drifted")
    if stat.S_ISDIR(details.st_mode) and not stat.S_ISLNK(details.st_mode):
        path.chmod(0o700)
        for child in tuple(path.iterdir()):
            _remove_owned_entry(child)
        path.rmdir()
        return
    if not stat.S_ISLNK(details.st_mode):
        path.chmod(0o600)
    path.unlink()


def _run_one_job(job_id: str, input_root: Path, output_root: Path, workspace: Path) -> int:
    try:
        inputs = _existing_root(input_root)
        outputs = _existing_root(output_root)
        input_job = inputs / job_id
        manifest = _read_manifest(input_job)
        capture_institutional_pdf(
            manifest["identifier"], input_job, outputs / job_id, workspace=workspace,
        )
        return 0
    except BrowserPolicyError as error:
        failure_code = (
            "browser_auth_required"
            if error.code == "browser_auth_required"
            else "browser_policy_blocked"
        )
        try:
            _require_failure_published(outputs / job_id, job_id, manifest["identifier"], failure_code)
        except BrowserWorkerError:
            return 1
        return 0
    except (BrowserWorkerError, OSError, ValueError):
        return 1


def _refresh_heartbeat(heartbeat: Path) -> None:
    path = Path(heartbeat)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    descriptor = None
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "wb", closefd=True) as stream:
            descriptor = None
            stream.write(b"ok\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        if descriptor is not None:
            os.close(descriptor)
        temporary.unlink(missing_ok=True)


def _cleanup_acknowledged_outputs(input_root: Path, output_root: Path) -> int:
    inputs = _existing_root(input_root)
    outputs = _existing_root(output_root)
    removed = 0
    for output_job in tuple(outputs.iterdir()):
        if not _browser_owned_output(output_job, outputs):
            continue
        ack = inputs / output_job.name / "ack.json"
        if not _matching_ack(ack):
            continue
        _remove_exact_output(output_job, outputs)
        removed += 1
    return removed


def _cleanup_stale_outputs(output_root: Path, *, now: float | None = None) -> int:
    outputs = _existing_root(output_root)
    current = time.time() if now is None else now
    removed = 0
    for output_job in tuple(outputs.iterdir()):
        if not _browser_owned_output(output_job, outputs):
            continue
        try:
            age = current - output_job.stat(follow_symlinks=False).st_mtime
        except OSError:
            continue
        if age >= STALE_OUTPUT_SECONDS:
            _remove_exact_output(output_job, outputs)
            removed += 1
    return removed


def _require_failure_published(
    output_job: Path,
    job_id: str,
    identifier: object,
    code: str,
) -> None:
    if not _publish_failure(output_job, job_id, identifier, code):
        raise BrowserWorkerError("browser terminal state could not be published", fatal=True)


def _publish_failure(output_job: Path, job_id: str, identifier: object, code: str) -> bool:
    try:
        if not JOB_ID.fullmatch(job_id) or not isinstance(identifier, str):
            return False
        if output_job.exists():
            if not _browser_owned_output(output_job, output_job.parent):
                return False
        else:
            output_job.mkdir(mode=0o750)
            _set_group(output_job)
        payload = json.dumps({
            "schema": 1,
            "job_id": job_id,
            "identifier": identifier,
            "error": code,
        }, sort_keys=True, separators=(",", ":")).encode("ascii")
        _write_atomic(output_job / "failure.json", payload, 0o640)
        return True
    except (OSError, ValueError, BrowserWorkerError):
        return False


def _read_manifest(input_job: Path) -> dict[str, object]:
    try:
        if input_job.is_symlink() or not input_job.is_dir() or not JOB_ID.fullmatch(input_job.name):
            raise ValueError("invalid job directory")
        path = input_job / "job.json"
        if path.is_symlink() or not path.is_file():
            raise ValueError("invalid manifest")
        with path.open("rb") as stream:
            data = stream.read(MAX_BROWSER_MANIFEST_BYTES + 1)
        if len(data) > MAX_BROWSER_MANIFEST_BYTES:
            raise ValueError("manifest too large")
        manifest = json.loads(data.decode("ascii"))
        expected_keys = {"schema", "job_id", "identifier"}
        if not isinstance(manifest, dict) or set(manifest) != expected_keys:
            raise ValueError("invalid manifest")
        if manifest["schema"] != 1 or manifest["job_id"] != input_job.name:
            raise ValueError("invalid manifest")
        if not isinstance(manifest["identifier"], str):
            raise ValueError("invalid manifest")
        return manifest
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as error:
        raise BrowserWorkerError("invalid browser manifest") from error


def _observable_job(input_job: Path, input_root: Path) -> bool:
    try:
        if input_job.parent.resolve() != input_root.resolve():
            return False
        _read_manifest(input_job)
        cookies = input_job / "cookies.json"
        return cookies.is_file() and not cookies.is_symlink()
    except (OSError, BrowserWorkerError):
        return False


def _matching_ack(path: Path) -> bool:
    try:
        if path.is_symlink() or not path.is_file() or path.stat().st_size > 128:
            return False
        value = json.loads(path.read_text(encoding="ascii"))
        return value in ({"status": "consumed"}, {"status": "rejected"})
    except (OSError, UnicodeError, json.JSONDecodeError):
        return False


def _browser_owned_output(path: Path, root: Path) -> bool:
    try:
        if path.parent.resolve() != root.resolve() or not JOB_ID.fullmatch(path.name):
            return False
        details = os.lstat(path)
        if not stat.S_ISDIR(details.st_mode):
            return False
        if not hasattr(os, "geteuid"):
            return True
        return (
            details.st_uid == os.geteuid()
            and details.st_gid == SHARED_GID
            and stat.S_IMODE(details.st_mode) == 0o750
        )
    except OSError:
        return False


def _remove_exact_output(path: Path, root: Path) -> None:
    if not _browser_owned_output(path, root):
        raise BrowserWorkerError("refusing unsafe browser output cleanup")
    shutil.rmtree(path)


def _existing_root(path: Path) -> Path:
    root = Path(path)
    try:
        if root.is_symlink() or not root.is_dir():
            raise ValueError("invalid root")
        return root.resolve(strict=True)
    except (OSError, ValueError) as error:
        raise BrowserWorkerError("invalid browser root") from error


def _write_atomic(path: Path, data: bytes, mode: int) -> None:
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    descriptor = None
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
        _set_group(temporary)
        with os.fdopen(descriptor, "wb", closefd=True) as stream:
            descriptor = None
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if descriptor is not None:
            os.close(descriptor)
        temporary.unlink(missing_ok=True)


def _set_group(path: Path) -> None:
    if hasattr(os, "chown"):
        os.chown(path, -1, SHARED_GID)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--healthcheck", action="store_true")
    parser.add_argument("--job")
    parser.add_argument("--input-root", type=Path, default=Path("/browser-inputs"))
    parser.add_argument("--output-root", type=Path, default=Path("/browser-outputs"))
    parser.add_argument("--workspace", type=Path)
    arguments = parser.parse_args(argv)
    if arguments.healthcheck:
        return 0 if browser_worker_is_healthy() else 1
    if arguments.job:
        if arguments.workspace is None:
            return 1
        return _run_one_job(
            arguments.job, arguments.input_root, arguments.output_root, arguments.workspace,
        )
    run_browser_worker(arguments.input_root, arguments.output_root)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
