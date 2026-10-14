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
STOP_FILE = 'stop.json'
STOP_SENT = 'stop.sent'
IPC_MAX_BYTES = 1024


def _unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError('Duplicate native IPC field')
        value[key] = item
    return value


def _decode_object(body, error):
    try:
        value = json.loads(body, object_pairs_hook=_unique_object)
    except (TypeError, ValueError, json.JSONDecodeError):
        raise ValueError(error) from None
    if not isinstance(value, dict):
        raise ValueError(error)
    return value


def _read_json_file(directory_fd, name, owner, mode, error, max_bytes=IPC_MAX_BYTES):
    descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory_fd)
    try:
        info = os.fstat(descriptor)
        modes = {mode} if isinstance(mode, int) else set(mode)
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != owner or info.st_nlink != 1
                or stat.S_IMODE(info.st_mode) not in modes or info.st_size > max_bytes):
            raise ValueError(error)
        body = os.read(descriptor, max_bytes + 1)
        if len(body) > max_bytes:
            raise ValueError(error)
        return body, _decode_object(body, error)
    finally:
        os.close(descriptor)


def _expected_identity(instance):
    task_id, attempt = instance.rsplit('-', 1)
    return {'taskId': task_id, 'executionAttempt': int(attempt)}


def _read_stop(directory_fd, instance, owner):
    body, value = _read_json_file(directory_fd, STOP_FILE, owner, 0o600,
                                  'Invalid native stop request')
    if value != _expected_identity(instance) or type(value.get('executionAttempt')) is not int:
        raise ValueError('Native stop request identity changed')
    return body, value


def _write_exact(directory_fd, name, body, mode, error):
    descriptor = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode,
                         dir_fd=directory_fd)
    try:
        os.fchmod(descriptor, mode)
        os.write(descriptor, body)
        os.fsync(descriptor)
    except BaseException:
        try:
            os.unlink(name, dir_fd=directory_fd)
        except OSError:
            pass
        raise
    finally:
        os.close(descriptor)


def private_caller(directory_fd, owner):
    descriptor = os.open('caller.credential', os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory_fd)
    try:
        info = os.fstat(descriptor)
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != owner or info.st_nlink != 1
                or stat.S_IMODE(info.st_mode) != 0o600 or info.st_size != 64):
            raise ValueError('Native caller credential is unavailable')
        value = os.read(descriptor, 65)
        if not re.fullmatch(rb'[a-f0-9]{64}', value):
            raise ValueError('Native caller credential is unavailable')
        return value
    finally:
        os.close(descriptor)


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
        value = _decode_object(body, 'Invalid native launch request')
        if value != _expected_identity(instance) or type(value.get('executionAttempt')) is not int:
            raise ValueError("Native launch request identity changed")
        caller = private_caller(task_fd, producer_uid)
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
        caller_fd = os.open('caller.credential', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=bridge_fd)
        try:
            os.fchmod(caller_fd, 0o600)
            os.write(caller_fd, caller)
            os.fsync(caller_fd)
        finally:
            os.close(caller_fd)
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


def stop_unit(instance, run=subprocess.run):
    """Stop only the fixed, validated attempt unit; never accept a caller command."""
    validated_instance(instance)
    return run(['systemctl', 'stop', f'openscience-hermes@{instance}.service'], check=True, timeout=30,
               env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'}, capture_output=True)


def _open_task(root, instance, producer_uid):
    inbox_fd = secure_open_directory(root / 'inbox', producer_uid)
    try:
        task_fd = os.open(instance, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=inbox_fd)
    except BaseException:
        os.close(inbox_fd)
        raise
    return inbox_fd, task_fd


def _validate_producer_stop(task_fd, instance, producer_uid):
    """Read all three producer identities before accepting a stop side effect."""
    request_body, request = _read_json_file(task_fd, 'request.json', producer_uid, 0o600,
                                            'Invalid native launch request')
    if request != _expected_identity(instance) or type(request.get('executionAttempt')) is not int:
        raise ValueError('Native launch request identity changed')
    caller = private_caller(task_fd, producer_uid)
    stop_body, stop = _read_stop(task_fd, instance, producer_uid)
    return request_body, request, caller, stop_body, stop


def _write_root_stop(bridge_fd, stop_body):
    """Pin the producer stop JSON in the root-owned bridge exactly once."""
    try:
        _write_exact(bridge_fd, STOP_FILE, stop_body, 0o600, 'Native root stop changed')
    except FileExistsError:
        existing, _ = _read_json_file(bridge_fd, STOP_FILE, 0, 0o600, 'Native root stop changed')
        if existing != stop_body:
            raise ValueError('Native root stop identity changed')


def _validate_root_stop(bridge_fd, instance):
    body, value = _read_stop(bridge_fd, instance, 0)
    return body, value


def _write_tombstone(root, instance, request_body, caller, stop_body, producer_uid):
    """Create a root-owned no-restart receipt for a task stopped before pin/start."""
    bridges_fd = secure_open_directory(root / 'bridges', 0)
    bridge_fd = None
    try:
        try:
            os.mkdir(instance, 0o755, dir_fd=bridges_fd)
        except FileExistsError:
            pass
        bridge_fd = os.open(instance, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=bridges_fd)
        os.fchmod(bridge_fd, 0o755)
        info = os.fstat(bridge_fd)
        if info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o755:
            raise ValueError('Native root bridge ownership changed')
        entries = set(os.listdir(bridge_fd))
        if not entries <= {STOP_FILE, STOP_SENT, 'request.json', 'caller.credential', 'ended'}:
            raise ValueError('Unexpected native bridge contents')
        if 'worker.sock' in entries:
            raise ValueError('Native bridge already has a live socket')
        if 'request.json' not in entries:
            _write_exact(bridge_fd, 'request.json', request_body, 0o444, 'Native root receipt changed')
        else:
            existing, _ = _read_json_file(bridge_fd, 'request.json', 0, (0o444, 0o400), 'Native root receipt changed')
            if existing != request_body:
                raise ValueError('Native root receipt identity changed')
        if 'caller.credential' not in entries:
            _write_exact(bridge_fd, 'caller.credential', caller, 0o600, 'Native root caller changed')
        elif private_caller(bridge_fd, 0) != caller:
            raise ValueError('Native root caller identity changed')
        _write_root_stop(bridge_fd, stop_body)
        if 'ended' not in set(os.listdir(bridge_fd)):
            ended_fd = os.open('ended', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o444,
                               dir_fd=bridge_fd)
            os.close(ended_fd)
    finally:
        if bridge_fd is not None:
            os.close(bridge_fd)
        os.close(bridges_fd)


def _remove_stopped_producer(root, instance, request_body, caller, stop_body, producer_uid):
    """Remove only validated ephemeral producer IPC after a before-start tombstone."""
    inbox_fd = task_fd = None
    try:
        inbox_fd, task_fd = _open_task(root, instance, producer_uid)
        entries = set(os.listdir(task_fd))
        if 'worker.sock' in entries:
            return False
        if not entries <= {'request.json', 'caller.credential', STOP_FILE}:
            raise ValueError('Unexpected native producer contents')
        request, _ = _read_json_file(task_fd, 'request.json', producer_uid, 0o600,
                                     'Native producer request changed')
        if request != request_body:
            raise ValueError('Native producer request changed')
        if private_caller(task_fd, producer_uid) != caller:
            raise ValueError('Native producer caller changed')
        stop, _ = _read_stop(task_fd, instance, producer_uid)
        if stop != stop_body:
            raise ValueError('Native producer stop changed')
        for name in ('request.json', 'caller.credential', STOP_FILE):
            os.unlink(name, dir_fd=task_fd)
        os.rmdir(instance, dir_fd=inbox_fd)
        return True
    except FileNotFoundError:
        return True
    finally:
        for descriptor in (task_fd, inbox_fd):
            if descriptor is not None:
                os.close(descriptor)


def consume_stop(root, instance, run=subprocess.run, producer_uid=PRODUCER_UID):
    """Apply one exact-attempt stop request, including a pre-start tombstone.

    The database/Worker owns the durable cancellation decision.  This helper only
    delivers that decision to the fixed native unit and never accepts a unit,
    command, path, or wildcard from the producer JSON.
    """
    validated_instance(instance)
    inbox = root / 'inbox'
    bridges = root / 'bridges'
    bridge = bridges / instance
    task = inbox / instance
    if bridge.exists() or bridge.is_symlink():
        bridge_fd = secure_open_directory(bridge, 0)
        try:
            entries = set(os.listdir(bridge_fd))
            if not entries <= {'worker.sock', 'ended', 'request.json', 'caller.credential', STOP_FILE, STOP_SENT}:
                raise ValueError('Unexpected native bridge contents')
            root_stop = None
            if STOP_FILE in entries:
                root_stop, _ = _validate_root_stop(bridge_fd, instance)
            producer = None
            inbox_fd = task_fd = None
            try:
                if task.exists() or task.is_symlink():
                    inbox_fd, task_fd = _open_task(root, instance, producer_uid)
                    if STOP_FILE in set(os.listdir(task_fd)):
                        request_body, _request, caller, stop_body, _stop = _validate_producer_stop(
                            task_fd, instance, producer_uid)
                        root_manifest, _ = _read_json_file(bridge_fd, 'request.json', 0, (0o444, 0o400),
                                                           'Native root receipt changed')
                        if root_manifest != request_body:
                            raise ValueError('Native producer request changed')
                        if 'caller.credential' in entries and private_caller(bridge_fd, 0) != caller:
                            raise ValueError('Native producer caller changed')
                        if root_stop is not None and root_stop != stop_body:
                            raise ValueError('Native root stop identity changed')
                        if root_stop is None:
                            _write_root_stop(bridge_fd, stop_body)
                            root_stop = stop_body
                        producer = (request_body, caller, stop_body)
            finally:
                for descriptor in (task_fd, inbox_fd):
                    if descriptor is not None:
                        os.close(descriptor)
            if root_stop is None:
                return False
            if 'ended' in entries:
                if producer is not None:
                    _remove_stopped_producer(root, instance, *producer, producer_uid)
                return True
            if STOP_SENT not in entries:
                stop_unit(instance, run)
                sent_fd = os.open(STOP_SENT, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o444,
                                  dir_fd=bridge_fd)
                os.close(sent_fd)
            return True
        finally:
            os.close(bridge_fd)

    if not task.exists() and not task.is_symlink():
        return False
    inbox_fd = task_fd = None
    try:
        inbox_fd, task_fd = _open_task(root, instance, producer_uid)
        entries = set(os.listdir(task_fd))
        if STOP_FILE not in entries:
            return False
        request_body, _request, caller, stop_body, _stop = _validate_producer_stop(
            task_fd, instance, producer_uid)
        # A stop observed before the socket is published must prevent pin/start.
        # If a socket won the race, pin it first and immediately deliver the same
        # exact stop; never start a unit from a stopped request.
        if 'worker.sock' not in entries:
            _write_tombstone(root, instance, request_body, caller, stop_body, producer_uid)
            _remove_stopped_producer(root, instance, request_body, caller, stop_body, producer_uid)
            return True
    finally:
        for descriptor in (task_fd, inbox_fd):
            if descriptor is not None:
                os.close(descriptor)
    # The producer directory had a socket.  Pinning authenticates and fixes its
    # inode before any systemd operation, then the next branch issues exact stop.
    pin_bridge(root / 'inbox', root / 'bridges', instance, producer_uid=producer_uid)
    return consume_stop(root, instance, run, producer_uid)


def notify_stopped(path):
    # Only failure notification; success always requires the Worker's saved paid response.
    class UnixConnection(http.client.HTTPConnection):
        def connect(self):
            self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            self.sock.settimeout(2)
            self.sock.connect(str(path))
    connection = UnixConnection('openscience-worker', timeout=2)
    bridge_fd = secure_open_directory(path.parent, 0)
    try:
        caller = private_caller(bridge_fd, 0).decode('ascii')
        connection.request('POST', '/task/finish', body=b'{"status":"stopped"}',
                           headers={'Content-Type': 'application/json', 'x-openscience-native-caller': caller})
        response = connection.getresponse()
        body = json.loads(response.read(1024))
        return (response.status == 200 and body == {'received': True}) or (
            response.status == 409 and isinstance(body, dict) and isinstance(body.get('error'), dict)
            and body['error'].get('code') == 'NATIVE_TASK_STOPPED')
    finally:
        connection.close()
        os.close(bridge_fd)


def cleanup_ended(root, instance, run=subprocess.run, notify=notify_stopped, producer_uid=PRODUCER_UID):
    """Clean only the fixed terminated unit and its exact producer files. Keep a tiny no-restart receipt."""
    validated_instance(instance)
    bridge_path = root / 'bridges' / instance
    prestart_tombstone = (bridge_path / 'ended').is_file() and (bridge_path / STOP_FILE).is_file() \
        and not (bridge_path / 'worker.sock').exists()
    if not prestart_tombstone and not unit_ended(instance, run):
        return False
    bridge = bridge_path
    bridge_fd = secure_open_directory(bridge, 0)
    producer_fd = inbox_fd = None
    try:
        entries = set(os.listdir(bridge_fd))
        if not entries <= {'worker.sock', 'ended', 'request.json', 'caller.credential', STOP_FILE, STOP_SENT}:
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
        root_stop = None
        if STOP_FILE in entries:
            root_stop, _ = _validate_root_stop(bridge_fd, instance)
        if 'ended' not in entries:
            private_caller(bridge_fd, 0)
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
            if info.st_uid != producer_uid or info.st_mode & stat.S_IWOTH or not remaining <= {
                    'request.json', 'worker.sock', 'caller.credential', STOP_FILE}:
                raise ValueError('Native producer contents changed')
            if prestart_tombstone and 'worker.sock' in remaining:
                # A producer won the socket-publication race after the tombstone.
                # Keep that IPC for the Worker to close; never unlink an unpinned
                # socket whose owner cannot be proven against a root bridge.
                return False
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
            if 'caller.credential' in remaining:
                if private_caller(producer_fd, producer_uid) != private_caller(bridge_fd, 0):
                    raise ValueError('Native producer caller changed')
            if STOP_FILE in remaining:
                if root_stop is None:
                    raise ValueError('Native producer stop has no root receipt')
                stop_body, _ = _read_stop(producer_fd, instance, producer_uid)
                if stop_body != root_stop:
                    raise ValueError('Native producer stop changed')
            if 'worker.sock' in remaining:
                original = os.stat('worker.sock', dir_fd=producer_fd, follow_symlinks=False)
                pinned = os.stat('worker.sock', dir_fd=bridge_fd, follow_symlinks=False)
                if not stat.S_ISSOCK(original.st_mode) or original.st_uid != producer_uid or (original.st_dev, original.st_ino) != (pinned.st_dev, pinned.st_ino):
                    raise ValueError('Native producer socket changed')
                os.unlink('worker.sock', dir_fd=producer_fd)
            if 'request.json' in remaining:
                os.unlink('request.json', dir_fd=producer_fd)
            if 'caller.credential' in remaining:
                os.unlink('caller.credential', dir_fd=producer_fd)
            if STOP_FILE in remaining:
                os.unlink(STOP_FILE, dir_fd=producer_fd)
            os.rmdir(instance, dir_fd=inbox_fd)
        if 'worker.sock' in set(os.listdir(bridge_fd)):
            os.unlink('worker.sock', dir_fd=bridge_fd)
        if 'caller.credential' in set(os.listdir(bridge_fd)):
            os.unlink('caller.credential', dir_fd=bridge_fd)
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
            instance = validated_instance(bridge.name)
            consume_stop(root, instance, run)
            if (bridge / 'ended').is_file() and not (inbox / bridge.name).exists() and not (bridge / 'worker.sock').exists():
                continue  # Small root-owned receipt prevents restarting an already terminated attempt.
            cleanup_ended(root, instance, run)
        except (OSError, ValueError, subprocess.SubprocessError):
            continue
    for request_dir in inbox.iterdir():
        try:
            instance = validated_instance(request_dir.name)
            if (bridges / instance).exists():
                continue  # No automatic process restart/replay.
            if consume_stop(root, instance, run):
                continue  # An exact stop artifact becomes a tombstone, never a launch.
            pin_bridge(inbox, bridges, instance)
            run(["systemctl", "start", f"openscience-hermes@{instance}.service"], check=True, timeout=30,
                env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}, capture_output=True)
        except (OSError, ValueError, subprocess.SubprocessError):
            # No contents, source text or model details enter the system journal.
            continue


if __name__ == "__main__":
    poll_once()
