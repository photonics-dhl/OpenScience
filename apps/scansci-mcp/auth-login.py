#!/usr/bin/env python3
"""Run the official CARSI login with the production proxy made explicit."""

from __future__ import annotations

import os
import sys
from collections.abc import Callable
from typing import Any

from scansci_pdf import browser_login
from scansci_pdf.config import load_config
from scansci_pdf.sources.carsi import CARSIClient


PRODUCTION_PROXY = "http://openscience-egress:7891"
CARSI_LOGIN_MAX_WAIT_SECONDS = 15 * 60


def install_proxy_override(config: dict[str, Any]) -> None:
    proxy = (
        os.environ.get("SCANSCI_PDF_PROXY", "").strip()
        or str(config.get("network_proxy", "")).strip()
    )
    if proxy != PRODUCTION_PROXY:
        raise RuntimeError("official CARSI login proxy is missing or unexpected")

    official_launch = browser_login.launch
    if not isinstance(official_launch, Callable):
        raise RuntimeError("official ScanSci browser backend is unavailable")
    official_open_login_browser = browser_login.open_login_browser
    if not isinstance(official_open_login_browser, Callable):
        raise RuntimeError("official ScanSci login browser is unavailable")

    def proxied_launch(*args: Any, **kwargs: Any) -> Any:
        launch_args = [
            str(value)
            for value in (kwargs.pop("args", None) or [])
            if value != "--no-proxy-server"
            and not str(value).startswith("--proxy-server=")
        ]
        launch_args.append(f"--proxy-server={proxy}")
        return official_launch(*args, args=launch_args, **kwargs)

    def extended_login_window(*args: Any, **kwargs: Any) -> Any:
        kwargs["max_wait"] = CARSI_LOGIN_MAX_WAIT_SECONDS
        return official_open_login_browser(*args, **kwargs)

    browser_login.launch = proxied_launch
    browser_login.open_login_browser = extended_login_window


def main(argv: list[str]) -> int:
    if len(argv) != 2 or argv[1] != "sciencedirect":
        raise RuntimeError("expected the pinned sciencedirect CARSI publisher")

    publisher = argv[1]
    config = load_config()
    install_proxy_override(config)
    client = CARSIClient(config)
    try:
        return 0 if client.login(publisher, force=True) else 1
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
