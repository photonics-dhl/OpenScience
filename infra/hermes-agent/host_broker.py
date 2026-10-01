"""Fixed-unit launcher only. The Worker retains all task/model/source authority."""
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import socket
import http.client
import errno

INSTANCE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[1-9][0-9]{0,8}$")
ROOT = Path("/opt/openscience-hermes")
PRODUCER_UID = 1000


def validated_instance(name):
    if not isinstance(name, str) or not INSTANCE.fullmatch(name):
        raise ValueError("Invalid native task instance")
    return name


def secure_open_directory(path, owner):
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    info = os.fstat(descriptor)
    forbidden = stat.S_IWOTH | (stat.S_IWGRP if owner == 0 else 0)
    if info.st_uid != owner or info.st_mode & forbidden:
        os.close(descriptor)
        raise ValueError("Native directory ownership changed")
    return descriptor


def pin_bridge(inbox, bridges, instance, producer_uid=PRODUCER_UID):
    """Pin the Unix socket inode into a root-owned directory before systemd resolves paths."""
    validated_instance(instance)
    inbox_fd = secure_open_directory(inbox, producer_uid)
    task_fd = bridge_fd = request_fd = None
    try:
        task_fd = os.open(instance, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=inbox_fd)
        task_stat = os.fstat(task_fd)
        if task_stat.st_uid != producer_uid or task_stat.st_mode & stat.S_IWOTH:
            raise ValueError("Native task directory ownership changed")
        request_fd = os.open("request.json", os.O_RDONLY | os.O_NOFOLLOW, dir_fd=task_fd)
        info = os.fstat(request_fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != producer_uid or info.st_nlink != 1 or info.st_size > 1024:
            raise ValueError("Invalid native launch request")
        body = os.read(request_fd, 1025)
        value = json.loads(body)
        task_id, attempt = instance.rsplit("-", 1)
        if value != {"taskId": task_id, "executionAttempt": int(attempt)} or type(value.get("executionAttempt")) is not int:
            raise ValueError("Native launch request identity changed")
        socket_stat = os.stat("worker.sock", dir_fd=task_fd, follow_symlinks=False)
        if not stat.S_ISSOCK(socket_stat.st_mode) or socket_stat.st_uid != producer_uid:
            raise ValueError("Native bridge is not the producer's Unix socket")
        parent_fd = secure_open_directory(bridges, 0)
        try:
            os.mkdir(instance, 0o755, dir_fd=parent_fd)
            bridge_fd = os.open(instance, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent_fd)
            os.fchmod(bridge_fd, 0o755)
        finally:
            os.close(parent_fd)
        os.link("worker.sock", "worker.sock", src_dir_fd=task_fd, dst_dir_fd=bridge_fd, follow_symlinks=False)
        pinned = os.stat("worker.sock", dir_fd=bridge_fd, follow_symlinks=False)
        if not stat.S_ISSOCK(pinned.st_mode) or (pinned.st_dev, pinned.st_ino) != (socket_stat.st_dev, socket_stat.st_ino):
            os.unlink("worker.sock", dir_fd=bridge_fd)
            raise ValueError("Native bridge changed while being pinned")
        manifest_fd = os.open('request.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o444, dir_fd=bridge_fd)
        try:
            os.write(manifest_fd, body)
        finally:
            os.close(manifest_fd)
    finally:
        for descriptor in (request_fd, bridge_fd, task_fd, inbox_fd):
            if descriptor is not None:
                os.close(descriptor)


def unit_ended(instance, run=subprocess.run):
    validated_instance(instance)
    result = run(['systemctl', 'show', f'openscience-hermes@{instance}.service',
                  '--property=ActiveState,SubState,MainPID,ControlPID,Job'], check=True, timeout=10,
                 env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'}, capture_output=True, text=True)
    fields = dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)
    return (fields.get('ActiveState') in ('inactive', 'failed') and fields.get('SubState') in ('dead', 'failed')
            and fields.get('MainPID') == '0' and fields.get('ControlPID') == '0' and fields.get('Job') in ('', '0'))


def notify_stopped(path):
    # Only failure notification; success always requires the Worker's saved paid response.
    class UnixConnection(http.client.HTTPConnection):
        def connect(self):
            self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            self.sock.settimeout(2)
            self.sock.connect(str(path))
    connection = UnixConnection('openscience-worker', timeout=2)
    try:
        connection.request('POST', '/task/finish', body=b'{"status":"stopped"}',
                           headers={'Content-Type': 'application/json'})
        response = connection.getresponse()
        body = json.loads(response.read(1024))
        return (response.status == 200 and body == {'received': True}) or (
            response.status == 409 and isinstance(body, dict) and isinstance(body.get('error'), dict)
            and body['error'].get('code') == 'NATIVE_TASK_STOPPED')
    finally:
        connection.close()


def cleanup_ended(root, instance, run=subprocess.run, notify=notify_stopped, producer_uid=PRODUCER_UID):
    """Clean only the fixed terminated unit and its exact producer files. Keep a tiny no-restart receipt."""
    validated_instance(instance)
    if not unit_ended(instance, run):
        return False
    bridge = root / 'bridges' / instance
    bridge_fd = secure_open_directory(bridge, 0)
    producer_fd = inbox_fd = None
    try:
        entries = set(os.listdir(bridge_fd))
        if not entries <= {'worker.sock', 'ended', 'request.json'}:
            raise ValueError('Unexpected native bridge contents')
        manifest_fd = os.open('request.json', os.O_RDONLY | os.O_NOFOLLOW, dir_fd=bridge_fd)
        try:
            info = os.fstat(manifest_fd)
            task_id, attempt = instance.rsplit('-', 1)
            if info.st_uid != 0 or not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > 1024:
                raise ValueError('Native root receipt changed')
            manifest = json.loads(os.read(manifest_fd, 1025))
            if manifest != {'taskId': task_id, 'executionAttempt': int(attempt)} or type(manifest.get('executionAttempt')) is not int:
                raise ValueError('Native root receipt identity changed')
        finally:
            os.close(manifest_fd)
        if 'ended' not in entries:
            pinned = os.stat('worker.sock', dir_fd=bridge_fd, follow_symlinks=False)
            if not stat.S_ISSOCK(pinned.st_mode):
                raise ValueError('Native pinned socket changed')
            try:
                if notify(bridge / 'worker.sock') is not True:
                    return False
            except (OSError, http.client.HTTPException) as error:
                if not isinstance(error, OSError) or error.errno not in (errno.ECONNREFUSED, errno.ENOENT):
                    return False  # A timeout/reset is not proof that the Worker stopped; retain IPC.
            run(['systemctl', 'clean', '--what=state', f'openscience-hermes@{instance}.service'], check=True,
                timeout=30, env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'}, capture_output=True)
            ended_fd = os.open('ended', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o444, dir_fd=bridge_fd)
            os.close(ended_fd)
        inbox_fd = secure_open_directory(root / 'inbox', producer_uid)
        try:
            producer_fd = os.open(instance, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=inbox_fd)
        except FileNotFoundError:
            producer_fd = None
        if producer_fd is not None:
            info = os.fstat(producer_fd)
            remaining = set(os.listdir(producer_fd))
            if info.st_uid != producer_uid or info.st_mode & stat.S_IWOTH or not remaining <= {'request.json', 'worker.sock'}:
                raise ValueError('Native producer contents changed')
            if 'request.json' in remaining:
                request_fd = os.open('request.json', os.O_RDONLY | os.O_NOFOLLOW, dir_fd=producer_fd)
                try:
                    info = os.fstat(request_fd)
                    if not stat.S_ISREG(info.st_mode) or info.st_uid != producer_uid or info.st_nlink != 1 or info.st_size > 1024:
                        raise ValueError('Native producer request changed')
                    body = json.loads(os.read(request_fd, 1025))
                    if body != manifest or type(body.get('executionAttempt')) is not int:
                        raise ValueError('Native producer identity changed')
                finally:
                    os.close(request_fd)
            if 'worker.sock' in remaining:
                original = os.stat('worker.sock', dir_fd=producer_fd, follow_symlinks=False)
                pinned = os.stat('worker.sock', dir_fd=bridge_fd, follow_symlinks=False)
                if not stat.S_ISSOCK(original.st_mode) or original.st_uid != producer_uid or (original.st_dev, original.st_ino) != (pinned.st_dev, pinned.st_ino):
                    raise ValueError('Native producer socket changed')
                os.unlink('worker.sock', dir_fd=producer_fd)
            if 'request.json' in remaining:
                os.unlink('request.json', dir_fd=producer_fd)
            os.rmdir(instance, dir_fd=inbox_fd)
        if 'worker.sock' in set(os.listdir(bridge_fd)):
            os.unlink('worker.sock', dir_fd=bridge_fd)
        return True
    finally:
        for fd in (producer_fd, inbox_fd, bridge_fd):
            if fd is not None:
                os.close(fd)


def poll_once(root=ROOT, run=subprocess.run):
    # Paths/configuration are owned by the installer, never supplied in manifests.
    inbox, bridges = root / "inbox", root / "bridges"
    for bridge in bridges.iterdir():
        try:
            if (bridge / 'ended').is_file() and not (inbox / bridge.name).exists() and not (bridge / 'worker.sock').exists():
                continue  # Small root-owned receipt prevents restarting an already terminated attempt.
            cleanup_ended(root, validated_instance(bridge.name), run)
        except (OSError, ValueError, subprocess.SubprocessError):
            continue
    for request_dir in inbox.iterdir():
        try:
            instance = validated_instance(request_dir.name)
            if (bridges / instance).exists():
                continue  # No automatic process restart/replay.
            pin_bridge(inbox, bridges, instance)
            run(["systemctl", "start", f"openscience-hermes@{instance}.service"], check=True, timeout=30,
                env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}, capture_output=True)
        except (OSError, ValueError, subprocess.SubprocessError):
            # No contents, source text or model details enter the system journal.
            continue


if __name__ == "__main__":
    poll_once()
