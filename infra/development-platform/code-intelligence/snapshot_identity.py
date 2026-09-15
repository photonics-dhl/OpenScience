"""Read the immutable source revision mounted into the Serena container."""

import json
from pathlib import Path
import re
import stat


SNAPSHOT_MANIFEST = Path("/workspace/snapshot.json")
MAX_SNAPSHOT_MANIFEST_BYTES = 16 * 1024


def read_source_revision(path: Path = SNAPSHOT_MANIFEST) -> str:
    metadata = path.lstat()
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_size > MAX_SNAPSHOT_MANIFEST_BYTES:
        raise RuntimeError("Invalid source snapshot metadata")
    value = json.loads(path.read_text(encoding="utf-8"))
    revision = value.get("revision") if isinstance(value, dict) else None
    if not isinstance(revision, str) or not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise RuntimeError("Invalid source snapshot revision")
    return revision
