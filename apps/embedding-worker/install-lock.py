from __future__ import annotations

import argparse
import os
import re
from pathlib import Path


INDEX = re.compile(r"^--(?:extra-)?index-url https://\S+$")
PINNED = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]*==\S+ --hash=sha256:[0-9a-f]{64}$")
LOCAL = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]* @ file:///\S+#sha256=[0-9a-f]{64}$")


def split_lock(text: str) -> list[str]:
    indexes: list[str] = []
    requirements: list[str] = []
    for line in text.splitlines():
        if not line or line.startswith("#"):
            continue
        if INDEX.fullmatch(line):
            indexes.append(line)
        elif PINNED.fullmatch(line) or LOCAL.fullmatch(line):
            requirements.append(line)
        else:
            raise ValueError("invalid hash-locked requirement")
    if not indexes or not requirements:
        raise ValueError("lock must contain an index and requirements")
    prefix = "\n".join(indexes)
    return [f"{prefix}\n{requirement}\n" for requirement in requirements]


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
