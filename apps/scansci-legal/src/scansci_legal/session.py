"""Persistent, secret-free lifecycle for the operator-owned CARSI profile."""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass, replace
import hashlib
import hmac
import json
import math
import os
from pathlib import Path
import stat
import threading
import time
from typing import Callable, Iterator, Protocol
from uuid import uuid4

from .browser_protocol import BrowserProtocolError, _validate_cookie_snapshot
from .limits import MAX_BROWSER_COOKIE_BYTES


SESSION_ROOT = Path("/session")
PROBE_INTERVAL_SECONDS = 15 * 60
REFRESH_LEASE_SECONDS = 5 * 60
INITIAL_BACKOFF_SECONDS = 60
MAX_BACKOFF_SECONDS = 6 * 60 * 60
VERIFIED_PROOF_MAX_AGE_SECONDS = 24 * 60 * 60
VALID_STATES = frozenset({"ready", "refreshing", "auth_required", "disabled"})


class SessionRefresher(Protocol):
    def probe(self, profile_root: Path) -> bool: ...

    def refresh(self, profile_root: Path) -> object: ...


@dataclass(frozen=True)
class SessionSnapshot:
    status: str
    last_probe_at: float = 0
    lease_until: float = 0
    failure_count: int = 0
    next_attempt_at: float = 0
    reason: str = ""
    generation: int = 0
    verified_at: float = 0
    verified_cookie_sha256: str = ""

    def as_json(self) -> dict[str, str | int | float]:
        return {
            "status": self.status,
            "last_probe_at": self.last_probe_at,
            "lease_until": self.lease_until,
            "failure_count": self.failure_count,
            "next_attempt_at": self.next_attempt_at,
            "reason": self.reason,
            "generation": self.generation,
            "verified_at": self.verified_at,
            "verified_cookie_sha256": self.verified_cookie_sha256,
        }


class SessionStore:
    """Read and write bounded metadata beside one fixed browser profile."""

    def __init__(
        self,
        root: Path = SESSION_ROOT,
        *,
        expected_uid: int | None = None,
        enforce_permissions: bool | None = None,
    ):
        self.root = Path(root).resolve()
        self.state_path = self.root / "session-state.json"
        self.lease_path = self.root / ".refresh-lease"
        self.state_lock_path = self.root / ".state-lock"
        self.expected_uid = _current_uid() if expected_uid is None else expected_uid
        self.enforce_permissions = os.name != "nt" if enforce_permissions is None else enforce_permissions

    def ensure_root(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        if os.name != "nt":
            self.root.chmod(0o700)
        self._validate_directory(self.root)

    def profile_is_safe(self) -> bool:
        return self.validated_cookie_sha256() is not None

    def validated_cookie_sha256(self) -> str | None:
        try:
            cookie_json = self._read_cookie_bytes()
            _validate_cookie_snapshot(cookie_json)
            return hashlib.sha256(cookie_json).hexdigest()
        except (BrowserProtocolError, OSError, UnicodeError, ValueError):
            return None

    def load_bound(self, fallback_status: str) -> tuple[SessionSnapshot, str | None]:
        with self._state_guard():
            return self.load(fallback_status), self.validated_cookie_sha256()

    def load(self, fallback_status: str) -> SessionSnapshot:
        if fallback_status not in VALID_STATES:
            raise ValueError("invalid session status")
        if not self.state_path.exists():
            return SessionSnapshot(fallback_status)
        try:
            self._validate_regular_file(self.state_path)
            raw = json.loads(self.state_path.read_text(encoding="utf-8"))
            required_keys = {
                "status", "last_probe_at", "lease_until", "failure_count", "next_attempt_at", "reason",
            }
            optional_keys = {"generation", "verified_at", "verified_cookie_sha256"}
            keys = set(raw) if isinstance(raw, dict) else set()
            if not isinstance(raw, dict) or not required_keys.issubset(keys) or keys - required_keys - optional_keys:
                raise ValueError("invalid session state")
            status = raw["status"]
            if status not in VALID_STATES:
                raise ValueError("invalid session state")
            numeric = (raw["last_probe_at"], raw["lease_until"], raw["failure_count"], raw["next_attempt_at"])
            if any(isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0 for value in numeric):
                raise ValueError("invalid session state")
            if not isinstance(raw["reason"], str) or raw["reason"] not in {"", "operator_auth_required", "unsafe_profile"}:
                raise ValueError("invalid session state")
            generation = raw.get("generation", 0)
            if isinstance(generation, bool) or not isinstance(generation, int) or generation < 0:
                raise ValueError("invalid session state")
            verified_at = raw.get("verified_at", 0)
            if (
                isinstance(verified_at, bool)
                or not isinstance(verified_at, (int, float))
                or not math.isfinite(verified_at)
                or verified_at < 0
            ):
                raise ValueError("invalid session state")
            verified_cookie_sha256 = raw.get("verified_cookie_sha256", "")
            if (
                not isinstance(verified_cookie_sha256, str)
                or verified_cookie_sha256 != verified_cookie_sha256.lower()
                or (verified_cookie_sha256 and (
                    len(verified_cookie_sha256) != 64
                    or any(character not in "0123456789abcdef" for character in verified_cookie_sha256)
                ))
            ):
                raise ValueError("invalid session state")
            return SessionSnapshot(
                status=status,
                last_probe_at=float(raw["last_probe_at"]),
                lease_until=float(raw["lease_until"]),
                failure_count=int(raw["failure_count"]),
                next_attempt_at=float(raw["next_attempt_at"]),
                reason=raw["reason"],
                generation=generation,
                verified_at=float(verified_at),
                verified_cookie_sha256=verified_cookie_sha256,
            )
        except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError):
            return SessionSnapshot("auth_required", reason="unsafe_profile")

    def save(self, snapshot: SessionSnapshot, *, expected_generation: int | None = None) -> bool:
        if snapshot.status not in VALID_STATES:
            raise ValueError("invalid session status")
        self.ensure_root()
        with self._state_guard():
            current = self.load("auth_required")
            if expected_generation is not None and current.generation != expected_generation:
                return False
            self._write_snapshot(replace(snapshot, generation=current.generation + 1))
        return True

    def save_verified(
        self,
        snapshot: SessionSnapshot,
        *,
        expected_generation: int,
        expected_cookie_sha256: str,
    ) -> bool:
        if snapshot.status != "ready" or snapshot.verified_cookie_sha256 != expected_cookie_sha256:
            raise ValueError("verified session state is invalid")
        with self._state_guard():
            current = self.load("auth_required")
            cookie_sha256 = self.validated_cookie_sha256()
            if (
                current.generation != expected_generation
                or cookie_sha256 is None
                or not hmac.compare_digest(cookie_sha256, expected_cookie_sha256)
            ):
                return False
            self._write_snapshot(replace(snapshot, generation=current.generation + 1))
        return True

    def publish_verified_cookie(self, cookie_json: bytes, verified_at: float) -> SessionSnapshot:
        if (
            isinstance(verified_at, bool)
            or not isinstance(verified_at, (int, float))
            or not math.isfinite(verified_at)
            or verified_at <= 0
        ):
            raise ValueError("verified proof timestamp is invalid")
        _validate_cookie_snapshot(cookie_json)
        cookie_sha256 = hashlib.sha256(cookie_json).hexdigest()
        self.ensure_root()
        with self._state_guard():
            current = self.load("auth_required")
            old_cookie = self._read_cookie_bytes_optional()
            published_identity = self._write_cookie_atomic(cookie_json)
            try:
                verified = SessionSnapshot(
                    "ready",
                    last_probe_at=float(verified_at),
                    generation=current.generation + 1,
                    verified_at=float(verified_at),
                    verified_cookie_sha256=cookie_sha256,
                )
                self._write_snapshot(verified)
                return verified
            except Exception:
                self._rollback_cookie(published_identity, old_cookie)
                raise

    def publish_status(self, status: str, *, reason: str = "") -> SessionSnapshot:
        if status not in VALID_STATES:
            raise ValueError("invalid session status")
        self.ensure_root()
        with self._state_guard():
            current = self.load("auth_required")
            updated = SessionSnapshot(status, reason=reason, generation=current.generation + 1)
            self._write_snapshot(updated)
            return updated

    def _read_cookie_bytes_optional(self) -> bytes | None:
        try:
            cookie_json = self._read_cookie_bytes()
            _validate_cookie_snapshot(cookie_json)
            return cookie_json
        except (BrowserProtocolError, OSError, UnicodeError, ValueError):
            return None

    def _read_cookie_bytes(self) -> bytes:
        if _supports_cookie_dirfds():
            directory_fd = self._open_cookie_dir_fd(create=False)
            descriptor: int | None = None
            try:
                descriptor = os.open(
                    "sciencedirect.json",
                    os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0),
                    dir_fd=directory_fd,
                )
                opened = os.fstat(descriptor)
                self._validate_owner_mode(opened, directory=False)
                if (
                    not stat.S_ISREG(opened.st_mode)
                    or opened.st_nlink != 1
                    or not 0 < opened.st_size <= MAX_BROWSER_COOKIE_BYTES
                ):
                    raise ValueError("session cookie is unsafe")
                self._require_same_entry(directory_fd, "sciencedirect.json", opened)
                with os.fdopen(descriptor, "rb", closefd=False) as source:
                    cookie_json = source.read(MAX_BROWSER_COOKIE_BYTES + 1)
                after = os.fstat(descriptor)
                if (opened.st_dev, opened.st_ino, opened.st_size) != (after.st_dev, after.st_ino, after.st_size):
                    raise ValueError("session cookie changed during read")
                self._require_same_entry(directory_fd, "sciencedirect.json", opened)
                return cookie_json
            finally:
                if descriptor is not None:
                    os.close(descriptor)
                os.close(directory_fd)
        cookie_path = self.root / "scansci" / "cache" / "carsi_cookies" / "sciencedirect.json"
        self._validate_directory(self.root)
        self._validate_parents(cookie_path.parent)
        self._validate_regular_file(cookie_path)
        before = cookie_path.lstat()
        if before.st_nlink != 1 or not 0 < before.st_size <= MAX_BROWSER_COOKIE_BYTES:
            raise ValueError("session cookie is unsafe")
        descriptor = os.open(
            cookie_path,
            os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0),
        )
        try:
            opened = os.fstat(descriptor)
            if (before.st_dev, before.st_ino, before.st_size) != (opened.st_dev, opened.st_ino, opened.st_size):
                raise ValueError("session cookie changed during read")
            with os.fdopen(descriptor, "rb", closefd=False) as source:
                cookie_json = source.read(MAX_BROWSER_COOKIE_BYTES + 1)
        finally:
            os.close(descriptor)
        after = cookie_path.lstat()
        if (opened.st_dev, opened.st_ino, opened.st_size) != (after.st_dev, after.st_ino, after.st_size):
            raise ValueError("session cookie changed during read")
        return cookie_json

    def _write_cookie_atomic(self, cookie_json: bytes) -> tuple[int, int]:
        if _supports_cookie_dirfds():
            directory_fd = self._open_cookie_dir_fd(create=True)
            temporary = f".sciencedirect.{os.getpid()}.{uuid4().hex}.tmp"
            descriptor: int | None = None
            try:
                descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600, dir_fd=directory_fd)
                with os.fdopen(descriptor, "wb", closefd=False) as output:
                    output.write(cookie_json)
                    output.flush()
                    os.fsync(output.fileno())
                os.close(descriptor)
                descriptor = None
                os.replace(
                    temporary,
                    "sciencedirect.json",
                    src_dir_fd=directory_fd,
                    dst_dir_fd=directory_fd,
                )
                os.fsync(directory_fd)
                published = os.stat("sciencedirect.json", dir_fd=directory_fd, follow_symlinks=False)
                return published.st_dev, published.st_ino
            finally:
                if descriptor is not None:
                    os.close(descriptor)
                try:
                    os.unlink(temporary, dir_fd=directory_fd)
                except FileNotFoundError:
                    pass
                os.close(directory_fd)
        target_dir = self.root / "scansci" / "cache" / "carsi_cookies"
        for directory in (self.root / "scansci", self.root / "scansci" / "cache", target_dir):
            directory.mkdir(mode=0o700, exist_ok=True)
            self._validate_directory(directory)
        temporary = target_dir / f".sciencedirect.{os.getpid()}.{uuid4().hex}.tmp"
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with os.fdopen(descriptor, "wb", closefd=False) as output:
                output.write(cookie_json)
                output.flush()
                os.fsync(output.fileno())
            os.close(descriptor)
            descriptor = -1
            os.replace(temporary, target_dir / "sciencedirect.json")
            published = (target_dir / "sciencedirect.json").lstat()
            return published.st_dev, published.st_ino
        finally:
            if descriptor >= 0:
                os.close(descriptor)
            temporary.unlink(missing_ok=True)

    def _rollback_cookie(self, published_identity: tuple[int, int], old_cookie: bytes | None) -> None:
        target = self.root / "scansci" / "cache" / "carsi_cookies" / "sciencedirect.json"
        try:
            current = target.lstat()
            if target.is_symlink() or (current.st_dev, current.st_ino) != published_identity:
                return
            if old_cookie is None:
                target.unlink()
            else:
                self._write_cookie_atomic(old_cookie)
        except OSError:
            return

    def _open_cookie_dir_fd(self, *, create: bool) -> int:
        flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
        current_fd = os.open(self.root, flags)
        try:
            self._validate_owner_mode(os.fstat(current_fd), directory=True)
            for component in ("scansci", "cache", "carsi_cookies"):
                try:
                    child_fd = os.open(component, flags, dir_fd=current_fd)
                except FileNotFoundError:
                    if not create:
                        raise
                    os.mkdir(component, 0o700, dir_fd=current_fd)
                    child_fd = os.open(component, flags, dir_fd=current_fd)
                opened = os.fstat(child_fd)
                if not stat.S_ISDIR(opened.st_mode):
                    os.close(child_fd)
                    raise ValueError("session cookie directory is unsafe")
                self._validate_owner_mode(opened, directory=True)
                self._require_same_entry(current_fd, component, opened)
                os.close(current_fd)
                current_fd = child_fd
            return current_fd
        except Exception:
            os.close(current_fd)
            raise

    @staticmethod
    def _require_same_entry(directory_fd: int, name: str, opened: os.stat_result) -> None:
        current = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
        if (opened.st_dev, opened.st_ino) != (current.st_dev, current.st_ino):
            raise ValueError("session path changed during access")

    def _write_snapshot(self, snapshot: SessionSnapshot) -> None:
        encoded = json.dumps(snapshot.as_json(), sort_keys=True, separators=(",", ":")).encode("utf-8")
        temporary = self.root / f".session-state.{os.getpid()}.{threading.get_ident()}.{uuid4().hex}.tmp"
        descriptor = os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        try:
            with os.fdopen(descriptor, "wb") as output:
                output.write(encoded)
                output.flush()
                os.fsync(output.fileno())
            if os.name != "nt":
                temporary.chmod(0o600)
            os.replace(temporary, self.state_path)
        finally:
            try:
                temporary.unlink()
            except FileNotFoundError:
                pass

    def acquire_refresh_lease(self, now: float, generation: int) -> str | None:
        self.ensure_root()
        owner = uuid4().hex
        with self._state_guard():
            lease = self._load_lease()
            if lease is not None and lease[1] > now:
                return None
            self._write_json_atomic(
                self.lease_path,
                {"owner": owner, "expires_at": now + REFRESH_LEASE_SECONDS, "generation": generation},
            )
        return owner

    def release_refresh_lease(self, owner: str) -> bool:
        with self._state_guard():
            lease = self._load_lease()
            if lease is None or lease[0] != owner:
                return False
            self.lease_path.unlink()
            return True

    def _load_lease(self) -> tuple[str, float, int] | None:
        if not self.lease_path.exists():
            return None
        try:
            self._validate_regular_file(self.lease_path)
            raw = json.loads(self.lease_path.read_text(encoding="ascii"))
            if not isinstance(raw, dict) or set(raw) != {"owner", "expires_at", "generation"}:
                raise ValueError("invalid lease")
            owner, expires_at, generation = raw["owner"], raw["expires_at"], raw["generation"]
            if not isinstance(owner, str) or len(owner) != 32 or any(character not in "0123456789abcdef" for character in owner):
                raise ValueError("invalid lease")
            if isinstance(expires_at, bool) or not isinstance(expires_at, (int, float)) or expires_at < 0:
                raise ValueError("invalid lease")
            if isinstance(generation, bool) or not isinstance(generation, int) or generation < 0:
                raise ValueError("invalid lease")
            return owner, float(expires_at), generation
        except (OSError, UnicodeError, json.JSONDecodeError, ValueError):
            return None

    def _write_json_atomic(self, path: Path, value: object) -> None:
        temporary = self.root / f".{path.name}.{os.getpid()}.{threading.get_ident()}.{uuid4().hex}.tmp"
        descriptor = os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as output:
                json.dump(value, output, sort_keys=True, separators=(",", ":"))
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, path)
        finally:
            try:
                temporary.unlink()
            except FileNotFoundError:
                pass

    @contextmanager
    def _state_guard(self) -> Iterator[None]:
        deadline = time.monotonic() + 2
        while True:
            try:
                os.mkdir(self.state_lock_path, 0o700)
                break
            except FileExistsError:
                try:
                    if time.time() - self.state_lock_path.stat().st_mtime > 30:
                        os.rmdir(self.state_lock_path)
                        continue
                except (FileNotFoundError, OSError):
                    continue
                if time.monotonic() >= deadline:
                    raise TimeoutError("session state lock unavailable")
                time.sleep(0.01)
        try:
            yield
        finally:
            try:
                os.rmdir(self.state_lock_path)
            except FileNotFoundError:
                pass

    def _validate_parents(self, directory: Path) -> None:
        current = directory.resolve()
        while True:
            if current == self.root:
                return
            if self.root not in current.parents:
                raise ValueError("profile path escapes session root")
            self._validate_directory(current)
            current = current.parent

    def _validate_directory(self, path: Path) -> None:
        details = path.lstat()
        if not stat.S_ISDIR(details.st_mode) or path.is_symlink():
            raise ValueError("session directory is unsafe")
        self._validate_owner_mode(details, directory=True)

    def _validate_regular_file(self, path: Path) -> None:
        details = path.lstat()
        if not stat.S_ISREG(details.st_mode) or path.is_symlink():
            raise ValueError("session file is unsafe")
        self._validate_owner_mode(details, directory=False)

    def _validate_owner_mode(self, details: os.stat_result, *, directory: bool) -> None:
        if not self.enforce_permissions:
            return
        if self.expected_uid is not None and details.st_uid != self.expected_uid:
            raise ValueError("session owner is unsafe")
        permissions = stat.S_IMODE(details.st_mode)
        if permissions & 0o077:
            raise ValueError("session mode is unsafe")
        required = 0o700 if directory else 0o600
        if permissions & required != required:
            raise ValueError("session mode is unsafe")


class SessionManager:
    """Serialize refreshes and persist only stable, non-sensitive state."""

    def __init__(
        self,
        store: SessionStore,
        refresher: SessionRefresher,
        clock: Callable[[], float],
        *,
        enabled: bool = True,
    ):
        self._store = store
        self._refresher = refresher
        self._clock = clock
        self._enabled = enabled
        self._lock = threading.RLock()
        self._probe_in_progress = False
        self._store.ensure_root()
        if not enabled:
            self._snapshot = self._store.publish_status("disabled")
            self._cookie_sha256 = None
        else:
            fallback = "auth_required"
            self._snapshot, self._cookie_sha256 = self._store.load_bound(fallback)
            if self._snapshot.status == "disabled":
                self._store.save(SessionSnapshot(fallback), expected_generation=self._snapshot.generation)
                self._snapshot, self._cookie_sha256 = self._store.load_bound(fallback)
            if self._snapshot.status == "ready" and (
                not self._cookie_matches_snapshot()
                or not _proof_is_fresh(self._snapshot.verified_at, self._clock())
            ):
                unavailable = SessionSnapshot(
                    "auth_required",
                    reason="unsafe_profile" if self._cookie_sha256 is None else "operator_auth_required",
                )
                self._store.save(unavailable, expected_generation=self._snapshot.generation)
                self._snapshot, self._cookie_sha256 = self._store.load_bound("auth_required")
            elif self._snapshot.generation == 0:
                self._store.save(self._snapshot, expected_generation=0)
                self._snapshot, self._cookie_sha256 = self._store.load_bound(fallback)

    def status(self) -> str:
        with self._lock:
            if not self._enabled:
                return "disabled"
            self._reload()
            now = self._clock()
            if self._snapshot.status == "ready" and not self._verified_ready_locked(now):
                unavailable = SessionSnapshot(
                    "auth_required",
                    reason="unsafe_profile" if self._cookie_sha256 is None else "operator_auth_required",
                )
                self._store.save(unavailable, expected_generation=self._snapshot.generation)
                self._reload()
                return "auth_required"
            if self._snapshot.status == "refreshing":
                if now < self._snapshot.lease_until:
                    return "refreshing"
                expired_refresh = True
            elif self._snapshot.status != "ready":
                return self._snapshot.status
            else:
                expired_refresh = False
                if now - self._snapshot.last_probe_at < PROBE_INTERVAL_SECONDS:
                    return "ready"
                if self._probe_in_progress:
                    return "ready"
                self._probe_in_progress = True
                expected_generation = self._snapshot.generation
                expected_cookie_sha256 = self._snapshot.verified_cookie_sha256
        if expired_refresh:
            return self.on_auth_redirect()
        try:
            valid = bool(self._refresher.probe(self._store.root))
        except Exception:
            valid = False
        finally:
            with self._lock:
                self._probe_in_progress = False
        if valid:
            with self._lock:
                self._store.save_verified(
                    replace(self._snapshot, status="ready", last_probe_at=now),
                    expected_generation=expected_generation,
                    expected_cookie_sha256=expected_cookie_sha256,
                )
                self._reload()
                if self._verified_ready_locked(now):
                    return "ready"
                unavailable = SessionSnapshot(
                    "auth_required",
                    reason="unsafe_profile" if self._cookie_sha256 is None else "operator_auth_required",
                )
                self._store.save(unavailable, expected_generation=self._snapshot.generation)
                self._reload()
                return "auth_required"
        return self.on_auth_redirect()

    def verified_ready(self, now: float | None = None) -> bool:
        with self._lock:
            if not self._enabled:
                return False
            self._reload()
            observed_at = self._clock() if now is None else now
            return self._verified_ready_locked(observed_at)

    def mark_verified_ready(
        self,
        verified_at: float,
        cookie_sha256: str | None = None,
    ) -> SessionSnapshot:
        with self._lock:
            if not self._enabled:
                return self._snapshot
            now = self._clock()
            if (
                isinstance(verified_at, bool)
                or not isinstance(verified_at, (int, float))
                or not math.isfinite(verified_at)
                or not _proof_is_fresh(float(verified_at), now)
            ):
                raise ValueError("verified proof timestamp is invalid")
            self._reload()
            current_cookie_sha256 = self._cookie_sha256
            if current_cookie_sha256 is None:
                unavailable = SessionSnapshot("auth_required", reason="unsafe_profile")
                self._store.save(unavailable, expected_generation=self._snapshot.generation)
            else:
                expected_cookie_sha256 = cookie_sha256 or current_cookie_sha256
                if (
                    len(expected_cookie_sha256) != 64
                    or any(character not in "0123456789abcdef" for character in expected_cookie_sha256)
                    or not hmac.compare_digest(current_cookie_sha256, expected_cookie_sha256)
                ):
                    raise ValueError("verified Cookie identity changed")
                verified = SessionSnapshot(
                    "ready",
                    last_probe_at=now,
                    verified_at=float(verified_at),
                    verified_cookie_sha256=expected_cookie_sha256,
                )
                saved = self._store.save_verified(
                    verified,
                    expected_generation=self._snapshot.generation,
                    expected_cookie_sha256=expected_cookie_sha256,
                )
                if not saved:
                    self._reload()
                    raise ValueError("verified session changed before commit")
            self._reload()
            return self._snapshot

    def mark_auth_required(self) -> SessionSnapshot:
        with self._lock:
            if not self._enabled:
                return self._snapshot
            self._reload()
            unavailable = SessionSnapshot("auth_required", reason="operator_auth_required")
            self._store.save(unavailable, expected_generation=self._snapshot.generation)
            self._reload()
            return self._snapshot

    def on_auth_redirect(self) -> str:
        with self._lock:
            if not self._enabled:
                return "disabled"
            self._reload()
            if self._snapshot.status == "disabled":
                return "disabled"
            now = self._clock()
            if now < self._snapshot.next_attempt_at:
                return "auth_required"
            if now < self._snapshot.lease_until:
                return self._snapshot.status
            lease_owner = self._store.acquire_refresh_lease(now, self._snapshot.generation)
            if lease_owner is None:
                self._reload()
                return "refreshing"
            refreshing = replace(
                self._snapshot,
                status="refreshing",
                last_probe_at=self._snapshot.last_probe_at,
                lease_until=now + REFRESH_LEASE_SECONDS,
                failure_count=self._snapshot.failure_count,
                next_attempt_at=0,
                reason="",
            )
            if not self._store.save(refreshing, expected_generation=self._snapshot.generation):
                self._store.release_refresh_lease(lease_owner)
                self._reload()
                return self._snapshot.status
            self._reload()
            refresh_generation = self._snapshot.generation
        try:
            refreshed = self._refresher.refresh(self._store.root)
        except Exception:
            refreshed = False
        with self._lock:
            if (refreshed is True or refreshed == "ready") and _proof_is_fresh(self._snapshot.verified_at, now):
                outcome = SessionSnapshot(
                    "ready",
                    last_probe_at=now,
                    lease_until=now + REFRESH_LEASE_SECONDS,
                    verified_at=self._snapshot.verified_at,
                    verified_cookie_sha256=self._snapshot.verified_cookie_sha256,
                )
            else:
                failures = self._snapshot.failure_count + 1
                delay = MAX_BACKOFF_SECONDS if failures >= 10 else INITIAL_BACKOFF_SECONDS * (2 ** (failures - 1))
                outcome = SessionSnapshot(
                    "auth_required",
                    last_probe_at=self._snapshot.last_probe_at,
                    failure_count=failures,
                    next_attempt_at=now + delay,
                    reason="operator_auth_required",
                )
            if outcome.status == "ready":
                self._store.save_verified(
                    outcome,
                    expected_generation=refresh_generation,
                    expected_cookie_sha256=outcome.verified_cookie_sha256,
                )
            else:
                self._store.save(outcome, expected_generation=refresh_generation)
            self._store.release_refresh_lease(lease_owner)
            self._reload()
            return self._snapshot.status

    def _verified_ready_locked(self, now: float) -> bool:
        return (
            self._snapshot.status == "ready"
            and self._cookie_matches_snapshot()
            and _proof_is_fresh(self._snapshot.verified_at, now)
        )

    def _cookie_matches_snapshot(self) -> bool:
        return (
            self._cookie_sha256 is not None
            and bool(self._snapshot.verified_cookie_sha256)
            and hmac.compare_digest(self._cookie_sha256, self._snapshot.verified_cookie_sha256)
        )

    def _reload(self) -> None:
        persisted, cookie_sha256 = self._store.load_bound(self._snapshot.status)
        if persisted.reason == "unsafe_profile" or persisted.generation >= self._snapshot.generation:
            self._snapshot = persisted
            self._cookie_sha256 = cookie_sha256


class PersistedProfileRefresher:
    """Reload the operator profile without opening a browser or reading credentials."""

    def __init__(
        self,
        store: SessionStore,
        *,
        validator: Callable[[Path], bool] | None = None,
    ):
        self._store = store
        self._validator = validator or _validate_pinned_carsi_session

    def probe(self, _profile_root: Path) -> bool:
        return self._validate()

    def refresh(self, _profile_root: Path) -> bool:
        return self._validate()

    def _validate(self) -> bool:
        if not self._store.profile_is_safe():
            return False
        try:
            return bool(self._validator(self._store.root))
        except Exception:
            return False


def _validate_pinned_carsi_session(session_root: Path) -> bool:
    store = SessionStore(session_root, expected_uid=None, enforce_permissions=os.name != "nt")
    return store.validated_cookie_sha256() is not None


def _proof_is_fresh(verified_at: float, now: float) -> bool:
    return (
        not isinstance(now, bool)
        and isinstance(now, (int, float))
        and math.isfinite(now)
        and verified_at > 0
        and verified_at <= now
        and now - verified_at <= VERIFIED_PROOF_MAX_AGE_SECONDS
    )


def _supports_cookie_dirfds() -> bool:
    return (
        os.name == "posix"
        and hasattr(os, "O_DIRECTORY")
        and hasattr(os, "O_NOFOLLOW")
        and os.open in os.supports_dir_fd
        and os.mkdir in os.supports_dir_fd
        and os.stat in os.supports_dir_fd
        and os.unlink in os.supports_dir_fd
    )


def _current_uid() -> int | None:
    getter = getattr(os, "geteuid", None)
    return getter() if getter is not None else None
