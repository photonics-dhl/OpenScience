#!/usr/bin/env python3
"""Prepare only Netdata's empty root-filesystem probe and nonsecret mount metadata.

Run through the existing monitor maintenance procedure, never on startup. No
Docker/API calls, image pulls, secrets, service changes or new daemon.
"""
import os
import stat
import sys
import tempfile
from pathlib import Path

ROOT = Path('/opt/monitor')
PROBE = 'root-filesystem'
METADATA = 'root-mountinfo'


def root_mount_metadata(text):
    """Current upstream fallback stats the mount-point field without host prefix.

    Keep only host '/' filesystem identity, point its statvfs path at the empty
    bind. This is a collector input record, not a kernel mount operation.
    """
    records = []
    for line in text.splitlines():
        fields = line.split()
        if len(fields) > 9 and fields[4] == '/':
            separator = fields.index('-')
            if fields[3] != '/' or separator < 6 or len(fields) != separator + 4:
                raise ValueError('invalid root mount')
            fields[4] = '/host/root'
            records.append(' '.join(fields[:6] + fields[separator:]))
    if len(records) != 1:
        raise ValueError('root mount unavailable')
    return records[0] + '\n'


def safe_path(path, directory, uid, mode=None):
    info = path.lstat()
    if path.is_symlink() or path.resolve() != path.absolute():
        raise ValueError('linked path')
    if not (stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)):
        raise ValueError('unexpected file type')
    if os.name != 'nt' and (info.st_uid != uid or info.st_mode & 0o022 or mode is not None and stat.S_IMODE(info.st_mode) != mode):
        raise ValueError('unsafe permissions')
    return info


def validate_probe(root, host_root, uid):
    safe_path(root, True, uid)
    probe = root / PROBE
    info = safe_path(probe, True, uid, 0o555)
    if info.st_dev != host_root.stat().st_dev or list(probe.iterdir()):
        raise ValueError('probe must be empty on the root filesystem')


def prepare(root=ROOT, host_root=Path('/'), mountinfo=Path('/proc/self/mountinfo'), uid=0):
    safe_path(root, True, uid)
    # Existing paths never get chmod/chown or cleared to force acceptance.
    probe = root / PROBE
    if not probe.exists() and not probe.is_symlink():
        probe.mkdir(mode=0o700)
        probe.chmod(0o555)  # Only the newly created probe; independent of umask.
    validate_probe(root, host_root, uid)
    expected = root_mount_metadata(mountinfo.read_text(encoding='utf-8'))
    target = root / METADATA
    if target.exists() or target.is_symlink():
        safe_path(target, False, uid, 0o644)
    descriptor, temporary = tempfile.mkstemp(prefix='.root-mountinfo-', dir=root)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as stream:
            stream.write(expected)
            stream.flush()
            os.fchmod(stream.fileno(), 0o644) if hasattr(os, 'fchmod') else None
            os.fsync(stream.fileno())
        os.replace(temporary, target)
        if os.name != 'nt':
            descriptor = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)  # Only this invocation's newly created tempfile.
    check(root, host_root, mountinfo, uid)


def check(root=ROOT, host_root=Path('/'), mountinfo=Path('/proc/self/mountinfo'), uid=0):
    validate_probe(root, host_root, uid)
    target = root / METADATA
    info = safe_path(target, False, uid, 0o644)
    if info.st_size > 8192 or target.read_text(encoding='utf-8') != root_mount_metadata(mountinfo.read_text(encoding='utf-8')):
        raise ValueError('mount metadata changed')


if __name__ == '__main__':
    try:
        if sys.platform != 'linux' or os.geteuid() != 0:
            raise ValueError('Linux root maintenance required')
        if sys.argv[1:] == ['--confirm']:
            prepare()
        elif sys.argv[1:] == ['--check']:
            check()
        else:
            raise ValueError('invalid arguments')
        print('MONITOR_VIEW_OK root_filesystem=matched probe=empty metadata=matched')
    except Exception:
        print('MONITOR_VIEW_FAIL no services changed', file=sys.stderr)
        sys.exit(1)
