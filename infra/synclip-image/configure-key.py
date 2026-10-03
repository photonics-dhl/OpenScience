"""Receive one credential on stdin; never print it or enable image generation."""
import json
import os
from pathlib import Path
import stat
import sys
import tempfile


def parse_key(raw):
    if len(raw) > 8192:
        raise ValueError('Invalid credential input')
    value = json.loads(raw)
    if not isinstance(value, dict) or set(value) != {'apiKey'}:
        raise ValueError('Invalid credential input')
    key = value['apiKey']
    if not isinstance(key, str) or not 1 <= len(key) <= 4096 or any(ord(c) < 33 or ord(c) > 126 for c in key):
        raise ValueError('Invalid credential input')
    return key.encode('ascii')


def write_key(root, key):
    if os.geteuid() != 0 or not root.is_absolute():
        raise ValueError('Root private configuration is required')
    for parent in (root.parent, *root.parent.parents):
        info = parent.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise ValueError('Unsafe credential directory')
    root.mkdir(mode=0o700, exist_ok=True)
    info = root.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o700:
        raise ValueError('Unsafe credential directory')
    target = root / 'api-key'
    # Initial setup only. A later rotation needs an explicit, separate operation.
    temporary = None
    try:
        fd, temporary = tempfile.mkstemp(prefix='.api-key-', dir=root)
        with os.fdopen(fd, 'wb') as handle:
            handle.write(key)
            handle.flush()
            os.fsync(handle.fileno())
        os.link(temporary, target, follow_symlinks=False)
        parent = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
    finally:
        if temporary is not None:
            os.unlink(temporary)


def main():
    try:
        key = parse_key(sys.stdin.buffer.read(8193))
        write_key(Path('/opt/openscience-synclip'), key)
        print(json.dumps({'credentialStored': True, 'providerEnabled': False, 'providerCalls': 0}))
    except FileExistsError:
        print('Credential already exists; no overwrite or provider call.', file=sys.stderr)
        return 2
    except Exception:
        print('Private credential setup failed; no provider call.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
