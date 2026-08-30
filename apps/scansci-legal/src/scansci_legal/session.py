"""Persistent, secret-free lifecycle for the operator-owned CARSI profile."""

from __future__ import annotations

from dataclasses import dataclass
import json
import os
from pathlib import Path
import stat
import threading
from typing import Any, Callable, Protocol
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

    def as_json(self) -> dict[str, str | int | float]:
        return {
            "status": self.status,
            "last_probe_at": self.last_probe_at,
            "lease_until": self.lease_until,
            "failure_count": self.failure_count,
            "next_attempt_at": self.next_attempt_at,
            "reason": self.reason,
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
            if not isinstance(raw, dict) or set(raw) != {
                "status", "last_probe_at", "lease_until", "failure_count", "next_attempt_at", "reason",
            }:
                raise ValueError("invalid session state")
            status = raw["status"]
            if status not in VALID_STATES:
                raise ValueError("invalid session state")
            numeric = (raw["last_probe_at"], raw["lease_until"], raw["failure_count"], raw["next_attempt_at"])
            if any(isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0 for value in numeric):
                raise ValueError("invalid session state")
            if not isinstance(raw["reason"], str) or raw["reason"] not in {"", "operator_auth_required", "unsafe_profile"}:
                raise ValueError("invalid session state")
            return SessionSnapshot(
                status,
                float(raw["last_probe_at"]),
                float(raw["lease_until"]),
                int(raw["failure_count"]),
                float(raw["next_attempt_at"]),
                raw["reason"],
            )
        except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError):
            return SessionSnapshot("auth_required", reason="unsafe_profile")

    def save(self, snapshot: SessionSnapshot) -> None:
        if snapshot.status not in VALID_STATES:
            raise ValueError("invalid session status")
        self.ensure_root()
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

    def acquire_refresh_lease(self, now: float) -> bool:
        self.ensure_root()
        try:
            descriptor = os.open(self.lease_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        except FileExistsError:
            try:
                age = now - self.lease_path.stat().st_mtime
                if age < REFRESH_LEASE_SECONDS:
                    return False
                self._validate_regular_file(self.lease_path)
                self.lease_path.unlink()
                descriptor = os.open(self.lease_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            except (FileExistsError, FileNotFoundError, OSError, ValueError):
                return False
        with os.fdopen(descriptor, "w", encoding="ascii") as lease:
            lease.write(str(int(now + REFRESH_LEASE_SECONDS)))
        return True

    def release_refresh_lease(self) -> None:
        try:
            self.lease_path.unlink()
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
        self._lock = threading.RLock()
        self._store.ensure_root()
        if not enabled:
            self._snapshot = SessionSnapshot("disabled")
        else:
            profile_safe = self._store.profile_is_safe()
            fallback = "ready" if profile_safe else "auth_required"
            self._snapshot = self._store.load(fallback)
            if self._snapshot.status == "disabled":
                self._snapshot = SessionSnapshot(fallback)
            if self._snapshot.status == "ready" and not profile_safe:
                self._snapshot = SessionSnapshot("auth_required", reason="unsafe_profile")
        self._persist()

    def status(self) -> str:
        with self._lock:
            if self._snapshot.status == "refreshing":
                if self._clock() < self._snapshot.lease_until:
                    return "refreshing"
            elif self._snapshot.status != "ready":
                return self._snapshot.status
            else:
                now = self._clock()
                if now - self._snapshot.last_probe_at < PROBE_INTERVAL_SECONDS:
                    return "ready"
                valid = False
                try:
                    valid = bool(self._refresher.probe(self._store.root))
                except Exception:
                    valid = False
                if valid:
                    self._snapshot = SessionSnapshot(
                        "ready",
                        last_probe_at=now,
                        lease_until=self._snapshot.lease_until,
                    )
                    self._persist()
                    return "ready"
        return self.on_auth_redirect()

    def on_auth_redirect(self) -> str:
        with self._lock:
            if self._snapshot.status == "disabled":
                return "disabled"
            now = self._clock()
            if now < self._snapshot.next_attempt_at:
                return "auth_required"
            if now < self._snapshot.lease_until:
                return self._snapshot.status
            if not self._store.acquire_refresh_lease(now):
                return "refreshing"
            self._snapshot = SessionSnapshot(
                "refreshing",
                last_probe_at=self._snapshot.last_probe_at,
                lease_until=now + REFRESH_LEASE_SECONDS,
                failure_count=self._snapshot.failure_count,
            )
            self._persist()
            try:
                refreshed = self._refresher.refresh(self._store.root)
                if refreshed is True or refreshed == "ready":
                    self._snapshot = SessionSnapshot(
                        "ready",
                        last_probe_at=now,
                        lease_until=now + REFRESH_LEASE_SECONDS,
                    )
                else:
                    self._record_failure(now)
            except Exception:
                self._record_failure(now)
            finally:
                self._store.release_refresh_lease()
                self._persist()
            return self._snapshot.status

    def _record_failure(self, now: float) -> None:
        failures = self._snapshot.failure_count + 1
        delay = MAX_BACKOFF_SECONDS if failures >= 10 else INITIAL_BACKOFF_SECONDS * (2 ** (failures - 1))
        self._snapshot = SessionSnapshot(
            "auth_required",
            last_probe_at=self._snapshot.last_probe_at,
            failure_count=failures,
            next_attempt_at=now + delay,
            reason="operator_auth_required",
        )

    def _persist(self) -> None:
        self._store.save(self._snapshot)


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
