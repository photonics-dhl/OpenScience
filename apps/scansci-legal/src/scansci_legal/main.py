"""Run the internal ScanSci legal-download service."""

from __future__ import annotations

import os
from pathlib import Path
import time
from typing import Mapping

from .http_service import ServiceConfig, create_server
from .session import PersistedProfileRefresher, SessionManager, SessionStore
from .upstream import ScanSciAcquisitionClient


def load_service_token(environment: Mapping[str, str] = os.environ) -> str:
    """Load the internal token from exactly one configured source."""
    inline = environment.get("SCANSCI_SERVICE_TOKEN", "")
    token_file = environment.get("SCANSCI_SERVICE_TOKEN_FILE", "")
    if bool(inline) == bool(token_file):
        raise ValueError("exactly one service token source is required")
    token = inline if inline else Path(token_file).read_text(encoding="utf-8").strip()
    if not token or "\n" in token or "\r" in token:
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
    server = create_server(
        ServiceConfig(
            host=os.environ.get("SCANSCI_HOST", "0.0.0.0"),
            port=int(os.environ.get("SCANSCI_PORT", "8080")),
            service_token=token,
            session_status=session_manager.status,
            session_auth_redirect=session_manager.on_auth_redirect,
        ),
        ScanSciAcquisitionClient(runtime_dir, session_root=session_store.root),
    )
    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
