"""Run the internal ScanSci legal-download service."""

from __future__ import annotations

import os
from pathlib import Path

from .http_service import ServiceConfig, create_server
from .upstream import ScanSciAcquisitionClient


def main() -> None:
    token = os.environ.get("SCANSCI_SERVICE_TOKEN", "")
    runtime_dir = Path(os.environ.get("SCANSCI_RUNTIME_DIR", "/tmp/scansci-legal"))
    server = create_server(
        ServiceConfig(
            host=os.environ.get("SCANSCI_HOST", "0.0.0.0"),
            port=int(os.environ.get("SCANSCI_PORT", "8080")),
            service_token=token,
            session_status=os.environ.get("SCANSCI_SESSION_STATUS", "unavailable"),
        ),
        ScanSciAcquisitionClient(runtime_dir),
    )
    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
