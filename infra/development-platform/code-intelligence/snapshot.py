"""Materialize selected release files plus controlled TypeScript analysis config.

Server installation utility. Does not execute repository files, install project
dependencies, index code, test code, or load repository Serena/TS configuration.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import tempfile


EXCLUDED_PARTS = {
    ".git", ".serena", ".worktrees", "node_modules", ".next", "dist", "build",
    "out", "coverage", "data", "datasets", "fixtures", "__fixtures__", "tmp",
    "cache", ".cache", "vendor", "generated", "test", "tests", "__tests__",
}
SOURCE_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}
SOURCE_ROOTS = {"apps", "packages", "infra", "scripts"}


def read_regular(root, relative_path):
    """Read only regular files without following any symlink path component."""
    raw_parts = relative_path.split("/")
    if any(part in {"", ".", ".."} for part in raw_parts) or "\\" in relative_path:
        raise ValueError("Invalid release-relative path")
    directory = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in raw_parts[:-1]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory)
            os.close(directory)
            directory = child
        descriptor = os.open(raw_parts[-1], os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory)
        with os.fdopen(descriptor, "rb") as stream:
            if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
                raise ValueError("Source entry is not a regular file")
            return stream.read()
    finally:
        os.close(directory)


def selected_source(path):
    return (
        path.parts[0] in SOURCE_ROOTS
        and not any(part in EXCLUDED_PARTS or part.startswith(".env") for part in path.parts)
        and not any(part in {"..", "."} for part in path.parts)
        and path.suffix in SOURCE_SUFFIXES
        and not re.search(r"\.(test|spec)\.[cm]?[jt]sx?$", path.name)
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-release", required=True)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--output", required=True)
    arguments = parser.parse_args()
    source_release = Path(arguments.source_release).absolute()
    if source_release.resolve() != source_release:
        raise ValueError("The source release path must not contain symlinks")
    revision = arguments.revision
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("A full Git commit is required")
    # Reuse the deployment's existing identity and entry list. Do not run its
    # verification command, recreate hashes or import a Git bundle.
    marker = read_regular(source_release, ".release-source").decode().strip()
    release_manifest = json.loads(read_regular(source_release, ".release-inputs.sha256"))
    if marker != revision or release_manifest.get("sourceSha") != revision or release_manifest.get("schemaVersion") != 2:
        raise ValueError("The selected release identity does not match --revision")
    destination = Path(arguments.output).absolute()
    if destination.exists():
        raise FileExistsError("Snapshot path already exists; retain it and use a new destination")
    destination.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=revision + ".partial-", dir=destination.parent))
    source_files = []
    packages = {}

    for entry in release_manifest["entries"]:
        if entry.get("type") != "file":
            continue
        raw_path = entry["path"]
        path = PurePosixPath(raw_path)
        is_manifest = len(path.parts) == 3 and path.parts[0] in {"apps", "packages"} and path.name == "package.json"
        if not selected_source(path) and not is_manifest:
            continue
        blob = read_regular(source_release, raw_path)
        # Reuse the deployment manifest's digest for the files being copied;
        # a modified release file must not acquire a false source revision.
        expected = entry.get("sha256", "")
        if not re.fullmatch(r"[a-f0-9]{64}", expected) or hashlib.sha256(blob).hexdigest() != expected:
            raise ValueError("Selected source differs from the recorded release")
        if is_manifest:
            package = json.loads(blob)
            name = package.get("name")
            if isinstance(name, str) and name.startswith("@openscience/"):
                packages[name] = str(path.parent)
            continue  # Do not copy package scripts, loaders or dependencies.
        target = staging.joinpath(*path.parts)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(blob)
        target.chmod(0o444)
        source_files.append(str(path))

    paths = {"@/*": ["apps/web/*"]}
    selected = set(source_files)
    for package_name, package_path in sorted(packages.items()):
        entry = package_path + "/src/index.ts"
        if entry in selected:
            paths[package_name] = [entry]
            paths[package_name + "/*"] = [package_path + "/src/*"]
    analysis_config = {
        "compilerOptions": {
            "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
            "jsx": "preserve", "allowJs": True, "checkJs": False,
            "noEmit": True, "skipLibCheck": True, "baseUrl": ".", "paths": paths,
        },
        "include": ["apps/**/*", "packages/**/*", "infra/**/*", "scripts/**/*"],
        "exclude": ["node_modules", "dist", "build"],
    }
    (staging / "tsconfig.json").write_text(json.dumps(analysis_config, indent=2) + "\n", encoding="utf-8")
    manifest = {
        "repository": "https://github.com/photonics-dhl/OpenScience",
        "revision": revision,
        "sourceFileCount": len(source_files),
        "analysisConfig": "Generated tsconfig.json; repository configs, package scripts and dependencies are excluded.",
        "scope": "Selected TypeScript and JavaScript source from apps, packages, infra and scripts; no tests, generated output, data or secrets.",
    }
    (staging / "snapshot.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    for directory, directories, files in os.walk(staging, topdown=False):
        for filename in files:
            (Path(directory) / filename).chmod(0o444)
        for child in directories:
            (Path(directory) / child).chmod(0o555)
    staging.chmod(0o555)
    staging.rename(destination)
    print(json.dumps(manifest))


if __name__ == "__main__":
    main()
