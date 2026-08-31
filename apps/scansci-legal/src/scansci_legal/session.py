"""Persistent, secret-free lifecycle for the operator-owned CARSI profile."""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass, replace
import json
import os
from pathlib import Path
import stat
import threading
import time
from typing import Callable, Iterator, Protocol
from uuid import uuid4


SESSION_ROOT = Path("/session")
PROBE_INTERVAL_SECONDS = 15 * 60
REFRESH_LEASE_SECONDS = 5 * 60
INITIAL_BACKOFF_SECONDS = 60
MAX_BACKOFF_SECONDS = 6 * 60 * 60
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

    def as_json(self) -> dict[str, str | int | float]:
        return {
            "status": self.status,
            "last_probe_at": self.last_probe_at,
            "lease_until": self.lease_until,
            "failure_count": self.failure_count,
            "next_attempt_at": self.next_attempt_at,
            "reason": self.reason,
            "generation": self.generation,
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
        try:
            self._validate_directory(self.root)
        except (OSError, ValueError):
            return False
        candidates = [self.root / "chromium" / "Default" / "Cookies"]
        candidates.extend((self.root / "scansci" / "cache" / "carsi_cookies").glob("*.json"))
        safe_files = 0
        for candidate in candidates:
            if not candidate.exists():
                continue
            try:
                self._validate_regular_file(candidate)
                self._validate_parents(candidate.parent)
            except (OSError, ValueError):
                return False
            safe_files += 1
        return safe_files > 0

    def load(self, fallback_status: str) -> SessionSnapshot:
        if fallback_status not in VALID_STATES:
            raise ValueError("invalid session status")
        if not self.state_path.exists():
            return SessionSnapshot(fallback_status)
        try:
            self._validate_regular_file(self.state_path)
            raw = json.loads(self.state_path.read_text(encoding="utf-8"))
            if not isinstance(raw, dict) or set(raw) not in ({
                "status", "last_probe_at", "lease_until", "failure_count", "next_attempt_at", "reason",
            }, {
                "status", "last_probe_at", "lease_until", "failure_count", "next_attempt_at", "reason", "generation",
            }):
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
            return SessionSnapshot(
                status,
                float(raw["last_probe_at"]),
                float(raw["lease_until"]),
                int(raw["failure_count"]),
                float(raw["next_attempt_at"]),
                raw["reason"],
                generation,
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

    def publish_status(self, status: str, *, reason: str = "") -> SessionSnapshot:
        if status not in VALID_STATES:
            raise ValueError("invalid session status")
        self.ensure_root()
        with self._state_guard():
            current = self.load("auth_required")
            updated = SessionSnapshot(status, reason=reason, generation=current.generation + 1)
            self._write_snapshot(updated)
            return updated

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
        else:
            profile_safe = self._store.profile_is_safe()
            fallback = "ready" if profile_safe else "auth_required"
            self._snapshot = self._store.load(fallback)
            if self._snapshot.status == "disabled":
                self._store.save(SessionSnapshot(fallback), expected_generation=self._snapshot.generation)
                self._snapshot = self._store.load(fallback)
            if self._snapshot.status == "ready" and not profile_safe:
                unsafe = SessionSnapshot("auth_required", reason="unsafe_profile")
                self._store.save(unsafe, expected_generation=self._snapshot.generation)
                self._snapshot = self._store.load("auth_required")
            elif self._snapshot.generation == 0:
                self._store.save(self._snapshot, expected_generation=0)
                self._snapshot = self._store.load(fallback)

    def status(self) -> str:
        with self._lock:
            if not self._enabled:
                return "disabled"
            self._reload()
            if self._snapshot.status == "refreshing":
                if self._clock() < self._snapshot.lease_until:
                    return "refreshing"
                expired_refresh = True
            elif self._snapshot.status != "ready":
                return self._snapshot.status
            else:
                expired_refresh = False
                now = self._clock()
                if now - self._snapshot.last_probe_at < PROBE_INTERVAL_SECONDS:
                    return "ready"
                if self._probe_in_progress:
                    return "ready"
                self._probe_in_progress = True
                expected_generation = self._snapshot.generation
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
                self._store.save(
                    replace(self._snapshot, status="ready", last_probe_at=now),
                    expected_generation=expected_generation,
                )
                self._reload()
                return self._snapshot.status
        return self.on_auth_redirect()

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
            if refreshed is True or refreshed == "ready":
                outcome = SessionSnapshot("ready", last_probe_at=now, lease_until=now + REFRESH_LEASE_SECONDS)
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
            self._store.save(outcome, expected_generation=refresh_generation)
            self._store.release_refresh_lease(lease_owner)
            self._reload()
            return self._snapshot.status

    def _reload(self) -> None:
        persisted = self._store.load(self._snapshot.status)
        if persisted.reason == "unsafe_profile" or persisted.generation >= self._snapshot.generation:
            self._snapshot = persisted


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
    from scansci_pdf.sources.carsi import CARSIClient

    cache_root = session_root / "scansci" / "cache"
    client = CARSIClient(
        {
            "cache_dir": str(cache_root),
            "carsi_enabled": True,
            "carsi_idp_name": "浙江大学",
            "download_strategy": "legal_only",
            "scihub_enabled": False,
            "use_tor": False,
            "use_tor_for_scihub": False,
            "network_proxy": "",
            "proxy_pool": "",
        },
    )
    try:
        return bool(client._try_load_cookies("sciencedirect"))
    finally:
        client.close()


def _current_uid() -> int | None:
    getter = getattr(os, "geteuid", None)
    return getter() if getter is not None else None
