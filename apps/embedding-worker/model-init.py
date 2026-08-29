from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
from typing import Any


MODEL_REVISION = "5617a9f61b028005a4858fdac845db406aefb181"
MANIFEST_NAME = "openscience-model-manifest.json"
MAX_MODEL_FILE_BYTES = 8 * 1024 * 1024 * 1024
MAX_MODEL_TOTAL_BYTES = 8 * 1024 * 1024 * 1024
MAX_MODEL_ENTRIES = 20_000


def _hash_file(path: Path) -> tuple[int, str]:
    if not path.is_file() or path.is_symlink():
        raise ValueError("model_volume_mismatch")
    size = path.stat().st_size
    if size < 0 or size > MAX_MODEL_FILE_BYTES:
        raise ValueError("model_volume_mismatch")
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return size, digest.hexdigest()


def _inventory(root: Path) -> list[dict[str, Any]]:
    if not root.is_dir() or root.is_symlink():
        raise ValueError("model_volume_mismatch")
    files: list[dict[str, Any]] = []
    total_bytes = 0
    entry_count = 0
    for directory, directory_names, file_names in os.walk(root, followlinks=False):
        directory_names.sort()
        file_names.sort()
        for name in directory_names:
            entry_count += 1
            if entry_count > MAX_MODEL_ENTRIES or (Path(directory) / name).is_symlink():
                raise ValueError("model_volume_mismatch")
        for name in file_names:
            entry_count += 1
            path = Path(directory) / name
            if entry_count > MAX_MODEL_ENTRIES or path.is_symlink():
                raise ValueError("model_volume_mismatch")
            if path == root / MANIFEST_NAME:
                continue
            relative = path.relative_to(root).as_posix()
            size, sha256 = _hash_file(path)
            total_bytes += size
            if total_bytes > MAX_MODEL_TOTAL_BYTES:
                raise ValueError("model_volume_mismatch")
            files.append({"path": relative, "size": size, "sha256": sha256})
    files.sort(key=lambda item: item["path"])
    if not files:
        raise ValueError("model_volume_mismatch")
    return files


def write_manifest(root: Path, revision: str) -> None:
    if revision != MODEL_REVISION:
        raise ValueError("model_volume_mismatch")
    manifest = {
        "schemaVersion": 1,
        "modelRevision": revision,
        "files": _inventory(root),
    }
    payload = json.dumps(manifest, ensure_ascii=True, separators=(",", ":"), sort_keys=True).encode("ascii")
    temporary = root / f".{MANIFEST_NAME}.tmp"
    temporary.write_bytes(payload)
    os.replace(temporary, root / MANIFEST_NAME)


def validate_model(root: Path, trusted_manifest: bytes | None = None) -> None:
    manifest_path = root / MANIFEST_NAME
    if not manifest_path.is_file() or manifest_path.is_symlink() or manifest_path.stat().st_size > 4 * 1024 * 1024:
        raise ValueError("model_volume_mismatch")
    try:
        manifest_payload = manifest_path.read_bytes()
        manifest = json.loads(manifest_payload.decode("ascii"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ValueError("model_volume_mismatch") from error
    if (
        not isinstance(manifest, dict)
        or set(manifest) != {"schemaVersion", "modelRevision", "files"}
        or manifest.get("schemaVersion") != 1
        or manifest.get("modelRevision") != MODEL_REVISION
        or not isinstance(manifest.get("files"), list)
        or manifest["files"] != _inventory(root)
        or (trusted_manifest is not None and manifest_payload != trusted_manifest)
    ):
        raise ValueError("model_volume_mismatch")


def initialize_model(seed: Path, target: Path) -> None:
    validate_model(seed)
    trusted_manifest = (seed / MANIFEST_NAME).read_bytes()
    if not target.is_dir() or target.is_symlink():
        raise ValueError("model_volume_mismatch")
    existing = list(target.iterdir())
    if existing:
        validate_model(target, trusted_manifest)
        return

    manifest = json.loads((seed / MANIFEST_NAME).read_text(encoding="ascii"))
    try:
        for item in manifest["files"]:
            relative = Path(item["path"])
            if relative.is_absolute() or ".." in relative.parts:
                raise ValueError("model_volume_mismatch")
            source = seed / relative
            destination = target / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, destination, follow_symlinks=False)
        shutil.copyfile(seed / MANIFEST_NAME, target / MANIFEST_NAME, follow_symlinks=False)
        validate_model(target, trusted_manifest)
    except Exception as error:
        # A partial target is deliberately retained so later starts fail closed.
        raise ValueError("model_volume_mismatch") from error


def main() -> None:
    parser = argparse.ArgumentParser()
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--write-manifest", action="store_true")
    action.add_argument("--initialize", action="store_true")
    action.add_argument("--validate", action="store_true")
    parser.add_argument("--seed", type=Path, default=Path("/opt/bge-m3-seed"))
    parser.add_argument("--target", type=Path, default=Path("/models/bge-m3"))
    arguments = parser.parse_args()
    if arguments.write_manifest:
        write_manifest(arguments.seed, MODEL_REVISION)
    elif arguments.initialize:
        initialize_model(arguments.seed, arguments.target)
    else:
        trusted_manifest = (
            None
            if arguments.target.resolve() == arguments.seed.resolve()
            else (arguments.seed / MANIFEST_NAME).read_bytes()
        )
        validate_model(arguments.target, trusted_manifest)


if __name__ == "__main__":
    main()
