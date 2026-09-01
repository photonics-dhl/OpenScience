"""Run the internal ScanSci legal-download service."""

from __future__ import annotations

import os
from pathlib import Path
import stat
import time
from typing import Mapping

from .http_service import ServiceConfig, create_server
from .browser_protocol import BrowserJobClient
from .session import PersistedProfileRefresher, SessionManager, SessionStore
from .upstream import ScanSciAcquisitionClient


def load_service_token(environment: Mapping[str, str] = os.environ) -> str:
    """Load the internal token once from a private, pinned file descriptor."""
    if "SCANSCI_SERVICE_TOKEN" in environment:
        raise ValueError("inline service token is forbidden")
    token_file = environment.get("SCANSCI_SERVICE_TOKEN_FILE", "")
    if not token_file:
        raise ValueError("service token file is required")
    descriptor: int | None = None
    try:
        descriptor = os.open(token_file, os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0))
        opened = os.fstat(descriptor)
        if not stat.S_ISREG(opened.st_mode) or opened.st_nlink != 1 or opened.st_size < 1 or opened.st_size > 4097:
            raise ValueError("service token file is unsafe")
        if os.name != "nt" and (
            opened.st_uid != os.geteuid()
            or opened.st_gid != os.getegid()
            or stat.S_IMODE(opened.st_mode) != 0o400
        ):
            raise ValueError("service token file is unsafe")
        with os.fdopen(descriptor, "rb", closefd=False) as source:
            raw = source.read(opened.st_size + 1)
        current = os.stat(token_file, follow_symlinks=False)
        if (opened.st_dev, opened.st_ino) != (current.st_dev, current.st_ino):
            raise ValueError("service token file changed during read")
    except (OSError, ValueError) as error:
        raise ValueError("service token file is unsafe") from error
    finally:
        if descriptor is not None:
            os.close(descriptor)
    try:
        decoded = raw.decode("utf-8")
    except UnicodeDecodeError as error:
        raise ValueError("service token is invalid") from error
    token = decoded.removesuffix("\r\n") if decoded.endswith("\r\n") else decoded.removesuffix("\n")
    if not token or token.strip() != token or any(character in token for character in "\0\r\n"):
        raise ValueError("service token is invalid")
    return token


def main() -> None:
    token = load_service_token()
    runtime_dir = Path(os.environ.get("SCANSCI_RUNTIME_DIR", "/tmp/scansci-legal"))
    session_store = SessionStore()
    session_manager = SessionManager(
        session_store,
        PersistedProfileRefresher(session_store),
        time.time,
        enabled=os.environ.get("SCANSCI_ENABLED", "true").lower() in {"1", "true", "yes"},
    )

    def mark_session_verified(cookie_sha256: str) -> None:
        snapshot = session_manager.mark_verified_ready(time.time(), cookie_sha256)
        if snapshot.status != "ready":
            raise RuntimeError("verified session state was not committed")

    server = create_server(
        ServiceConfig(
            host=os.environ.get("SCANSCI_HOST", "0.0.0.0"),
            port=int(os.environ.get("SCANSCI_PORT", "8080")),
            service_token=token,
            session_status=session_manager.status,
            session_auth_redirect=session_manager.mark_auth_required,
            session_verified=mark_session_verified,
        ),
        ScanSciAcquisitionClient(
            runtime_dir,
            session_root=session_store.root,
            browser_job_client=BrowserJobClient(),
        ),
    )
    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
