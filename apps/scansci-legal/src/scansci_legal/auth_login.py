"""Explicit operator-only launcher for the pinned ScanSci CARSI flow."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
from typing import Callable, Sequence

from .session import SessionStore


INSTITUTION = "浙江大学"
SESSION_ROOT = Path("/session")
CONTROLLED_BROWSER_PROXY = "http://openscience-egress:7891"
# Pinned ScanSci 1.11.0 hard-codes each CARSI window to 180 seconds.
MAX_OPERATOR_LOGIN_ATTEMPTS = 10


def main(
    argv: Sequence[str] | None = None,
    *,
    runner: Callable[..., object] = subprocess.run,
    session_root: Path = SESSION_ROOT,
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
    try:
        _write_legal_config(session_root)
        environment = _browser_environment(session_root)
    except (OSError, UnicodeError, ValueError):
        store.publish_status("auth_required", reason="operator_auth_required")
        return 1
    setup_command = ["scansci-pdf", "setup", INSTITUTION]
    login_command = ["scansci-pdf", "federated-login", "sciencedirect", "--force"]
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
        store.publish_status("auth_required", reason="operator_auth_required")
        return 1
    if getattr(completed, "returncode", 1) != 0:
        store.publish_status("auth_required", reason="operator_auth_required")
        return 1

    for _attempt in range(MAX_OPERATOR_LOGIN_ATTEMPTS):
        try:
            completed = runner(
                login_command,
                check=False,
                env=environment,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except Exception:
            store.publish_status("auth_required", reason="operator_auth_required")
            return 1
        if getattr(completed, "returncode", 1) == 0:
            store.publish_status("ready")
            return 0
    store.publish_status("auth_required", reason="operator_auth_required")
    return 1


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
