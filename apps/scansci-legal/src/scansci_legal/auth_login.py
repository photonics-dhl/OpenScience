"""Explicit operator-only launcher for the pinned ScanSci CARSI flow."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import time
from typing import Callable, Sequence

from .browser_protocol import (
    BrowserProof,
    BrowserProtocolError,
    COOKIE_KEYS,
    _allowed_institutional_url,
    _cookie_is_publisher_scoped,
    _validate_cookie_snapshot,
)
from .limits import MAX_BROWSER_COOKIE_BYTES, MAX_PDF_BYTES
from .session import SessionStore
from .strict_browser import BrowserPolicyError, strict_visible_browser, verify_institutional_canary


INSTITUTION = "浙江大学"
SESSION_ROOT = Path("/session")
CONTROLLED_BROWSER_PROXY = "http://openscience-egress:7891"
# Pinned ScanSci 1.11.0 hard-codes each CARSI window to 180 seconds.
MAX_OPERATOR_LOGIN_ATTEMPTS = 10
FIXED_CANARY_DOI = "10.1016/j.physleta.2023.129241"


def main(
    argv: Sequence[str] | None = None,
    *,
    runner: Callable[..., object] = subprocess.run,
    session_root: Path = SESSION_ROOT,
    proof_validator: Callable[[Path, bytes], object] | None = None,
    login_runner: Callable[[Path], bool] | None = None,
    clock: Callable[[], float] = time.time,
) -> int:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--operator-start", action="store_true")
    try:
        arguments = parser.parse_args(list(argv) if argv is not None else None)
    except SystemExit:
        return 64
    if not arguments.operator_start:
        return 64

    store = SessionStore(session_root, expected_uid=None, enforce_permissions=os.name != "nt")
    store.ensure_root()
    store.publish_status("auth_required", reason="operator_auth_required")
    validator = proof_validator or _verify_fixed_canary
    login = login_runner or _strict_operator_login
    with tempfile.TemporaryDirectory(prefix="scansci-auth-") as temporary:
        staging_root = Path(temporary)
        try:
            _write_legal_config(staging_root)
            environment = _browser_environment(staging_root)
        except (OSError, UnicodeError, ValueError):
            return 1
        setup_command = ["scansci-pdf", "setup", INSTITUTION]
        try:
            completed = runner(
                setup_command,
                check=False,
                env=environment,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except Exception:
            return 1
        if getattr(completed, "returncode", 1) != 0:
            return 1

        for _attempt in range(MAX_OPERATOR_LOGIN_ATTEMPTS):
            try:
                logged_in = login(staging_root)
            except (BrowserPolicyError, OSError, RuntimeError, ValueError):
                return 1
            if logged_in is not True:
                continue
            try:
                cookie_json = _read_staged_cookie(staging_root)
                proof = validator(staging_root, cookie_json)
                _validate_canary_proof(proof)
                if store.publish_verified_cookie(cookie_json, clock()).status != "ready":
                    return 1
                return 0
            except (BrowserPolicyError, BrowserProtocolError, OSError, UnicodeError, ValueError):
                continue
    return 1


def _strict_operator_login(
    staging_root: Path,
    *,
    browser_session: Callable[..., object] = strict_visible_browser,
    sleeper: Callable[[float], None] = time.sleep,
) -> bool:
    from scansci_pdf.sources.carsi import _load_publisher_configs

    publisher = "sciencedirect"
    configs = _load_publisher_configs()
    config = configs.get(publisher)
    if (
        config is None
        or not isinstance(config.login_url, str)
        or not _allowed_institutional_url(config.login_url)
    ):
        raise BrowserPolicyError("scansci_login_config_invalid")
    domains = tuple(dict.fromkeys(
        domain.lstrip(".").rstrip(".").lower()
        for domain in config.domains
        if isinstance(domain, str) and domain
    ))
    if not domains or any(
        not _allowed_institutional_url(f"https://{domain}/")
        for domain in domains
    ):
        raise BrowserPolicyError("scansci_login_config_invalid")
    profile_parent = staging_root / "chromium-attempts"
    profile_parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="login-", dir=profile_parent) as temporary:
        profile = Path(temporary) / "profile"
        profile.mkdir(mode=0o700)
        with browser_session(profile) as (context, page):
            try:
                page.goto(config.login_url, wait_until="domcontentloaded", timeout=60_000)
            except Exception:
                pass
            for _attempt in range(60):
                sleeper(3)
                try:
                    current_url = page.url
                except Exception as error:
                    raise BrowserPolicyError("strict_login_browser_closed") from error
                if not isinstance(current_url, str):
                    raise BrowserPolicyError("strict_login_browser_closed")
                lowered = current_url.lower()
                on_publisher = _allowed_institutional_url(current_url)
                on_login = any(keyword in lowered for keyword in (
                    "login", "institutional", "wayf", "saml", "cas", "idp",
                ))
                if not on_publisher or on_login:
                    continue
                cookies = [
                    {key: value for key, value in cookie.items() if key in COOKIE_KEYS}
                    for cookie in context.cookies([f"https://{domain}/" for domain in domains])
                    if isinstance(cookie, dict) and _cookie_is_publisher_scoped(cookie)
                ]
                cookie_json = json.dumps(cookies, sort_keys=True, separators=(",", ":")).encode("utf-8")
                _validate_cookie_snapshot(cookie_json)
                _write_staged_cookie(staging_root, cookie_json)
                return True
    return False


def _write_staged_cookie(staging_root: Path, cookie_json: bytes) -> None:
    target_dir = staging_root / "scansci" / "cache" / "carsi_cookies"
    target_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    target = target_dir / "sciencedirect.json"
    temporary = target_dir / f".sciencedirect.{os.getpid()}.tmp"
    descriptor: int | None = None
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "wb", closefd=False) as output:
            output.write(cookie_json)
            output.flush()
            os.fsync(output.fileno())
        os.close(descriptor)
        descriptor = None
        os.replace(temporary, target)
    finally:
        if descriptor is not None:
            os.close(descriptor)
        temporary.unlink(missing_ok=True)


def _verify_fixed_canary(_staging_root: Path, cookie_json: bytes) -> BrowserProof:
    return verify_institutional_canary(FIXED_CANARY_DOI, cookie_json)


def _validate_canary_proof(value: object) -> BrowserProof:
    if not isinstance(value, BrowserProof):
        raise ValueError("institutional canary was not proven")
    if (
        isinstance(value.http_status, bool)
        or not isinstance(value.http_status, int)
        or not 200 <= value.http_status <= 299
        or not isinstance(value.mime, str)
        or value.mime != "application/pdf"
        or not isinstance(value.source, str)
        or value.source != "CARSI-Browser"
        or not isinstance(value.final_url, str)
        or not _allowed_institutional_url(value.final_url)
        or isinstance(value.byte_count, bool)
        or not isinstance(value.byte_count, int)
        or not 5 <= value.byte_count <= MAX_PDF_BYTES
        or not isinstance(value.sha256, str)
        or len(value.sha256) != 64
        or any(character not in "0123456789abcdef" for character in value.sha256)
    ):
        raise ValueError("institutional canary was not proven")
    return value


def _read_staged_cookie(staging_root: Path) -> bytes:
    cookie_path = staging_root / "scansci" / "cache" / "carsi_cookies" / "sciencedirect.json"
    descriptor: int | None = None
    try:
        descriptor = os.open(
            cookie_path,
            os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0),
        )
        opened = os.fstat(descriptor)
        if not stat.S_ISREG(opened.st_mode) or opened.st_nlink != 1 or opened.st_size > MAX_BROWSER_COOKIE_BYTES:
            raise ValueError("staged cookie is unsafe")
        with os.fdopen(descriptor, "rb", closefd=False) as source:
            cookie_json = source.read(MAX_BROWSER_COOKIE_BYTES + 1)
        current = os.stat(cookie_path, follow_symlinks=False)
        if (opened.st_dev, opened.st_ino, opened.st_size) != (current.st_dev, current.st_ino, current.st_size):
            raise ValueError("staged cookie changed during read")
        _validate_cookie_snapshot(cookie_json)
        return cookie_json
    finally:
        if descriptor is not None:
            os.close(descriptor)


def _write_legal_config(session_root: Path) -> None:
    data_root = session_root / "scansci"
    cache_root = data_root / "cache"
    profile_root = session_root / "chromium"
    for directory in (data_root, cache_root, profile_root):
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        if os.name != "nt":
            directory.chmod(0o700)
    config = {
        "output_dir": str(session_root / "downloads"),
        "cache_dir": str(cache_root),
        "download_strategy": "legal_only",
        "scihub_enabled": False,
        "use_tor": False,
        "tor_proxy": "",
        "use_tor_for_scihub": False,
        "network_proxy": "",
        "proxy_pool": "",
        "parallel_sources": False,
        "parallel_probes": False,
        "carsi_enabled": True,
        "carsi_idp_name": INSTITUTION,
        "carsi_cookie_dir": str(cache_root / "carsi_cookies"),
        "chrome_profile_dir": str(profile_root),
        "browser_backend": "patchright",
        "browser_executable": "/usr/local/bin/scansci-chromium",
        "browser_auto_upgrade": False,
        "remote_assist_port": 0,
        "auto_relogin": False,
    }
    target = data_root / "config.json"
    target.write_text(json.dumps(config, sort_keys=True, separators=(",", ":")), encoding="utf-8")
    if os.name != "nt":
        target.chmod(0o600)


def _browser_environment(session_root: Path) -> dict[str, str]:
    environment = {
        "PATH": os.environ.get("PATH", ""),
        "HOME": str(session_root / "home"),
        "SCANSCI_PDF_DATA_DIR": str(session_root / "scansci"),
        "PYTHONNOUSERSITE": "1",
        "PYTHONDONTWRITEBYTECODE": "1",
        "DISPLAY": os.environ.get("DISPLAY", ":99"),
    }
    for key in ("LANG", "LC_ALL", "TZ"):
        if value := os.environ.get(key):
            environment[key] = value
    if proxy := os.environ.get("SCANSCI_BROWSER_PROXY", "").strip():
        if proxy != CONTROLLED_BROWSER_PROXY:
            raise ValueError("browser proxy is invalid")
        environment["SCANSCI_BROWSER_PROXY"] = proxy
    return environment

if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
