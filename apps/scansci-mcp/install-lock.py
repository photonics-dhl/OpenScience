from __future__ import annotations

import argparse
import os
import re
from pathlib import Path


REQUIREMENT = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]*(?:\[[A-Za-z0-9_., -]+\])?==\S+ \\$")
HASH = re.compile(r"^    --hash=sha256:[0-9a-f]{64}(?: \\)?$")


def split_lock(text: str) -> list[str]:
    blocks: list[list[str]] = []
    current: list[str] | None = None
    for line in text.splitlines():
        if line and not line[0].isspace() and not line.startswith("#"):
            if current is not None:
                blocks.append(current)
            if not REQUIREMENT.fullmatch(line):
                raise ValueError("invalid pinned requirement")
            current = [line]
        elif current is not None and line.lstrip().startswith("--hash="):
            if not HASH.fullmatch(line):
                raise ValueError("invalid requirement hash")
            current.append(line)
    if current is not None:
        blocks.append(current)
    if not blocks:
        raise ValueError("lock contains no requirements")
    rendered: list[str] = []
    for block in blocks:
        if len(block) < 2 or block[-1].endswith("\\"):
            raise ValueError("requirement does not end with a complete hash")
        rendered.append("\n".join(block) + "\n")
    return rendered


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--lock", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    blocks = split_lock(args.lock.read_text(encoding="utf-8"))
    args.output.mkdir(mode=0o755, parents=False, exist_ok=False)
    for index, block in enumerate(blocks, start=1):
        target = args.output / f"{index:04d}.txt"
        with target.open("w", encoding="utf-8", newline="\n") as stream:
            stream.write(block)
        os.chmod(target, 0o444)


if __name__ == "__main__":
    main()
