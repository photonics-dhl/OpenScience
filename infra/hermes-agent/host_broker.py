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
    descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory_fd)
    try:
        info = os.fstat(descriptor)
        modes = {mode} if isinstance(mode, int) else set(mode)
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != owner or info.st_nlink != 1
                or stat.S_IMODE(info.st_mode) not in modes or info.st_size > max_bytes):
            raise ValueError(error)
        _bound_file(directory_fd, name, descriptor, info, error)
        body = os.read(descriptor, max_bytes + 1)
        if len(body) > max_bytes:
            raise ValueError(error)
        _bound_file(directory_fd, name, descriptor, info, error)
        return body, _decode_object(body, error)
    finally:
        os.close(descriptor)



def _expected_identity(instance):
    task_id, attempt = instance.rsplit('-', 1)
    return {'taskId': task_id, 'executionAttempt': int(attempt)}



def private_caller(directory_fd, owner):
    descriptor = os.open('caller.credential', os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory_fd)
    try:
        info = os.fstat(descriptor)
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != owner or info.st_nlink != 1
                or stat.S_IMODE(info.st_mode) != 0o600 or info.st_size != 64):
            raise ValueError('Native caller credential is unavailable')
        _bound_file(directory_fd, 'caller.credential', descriptor, info, 'Native caller credential changed')
        value = os.read(descriptor, 65)
        if not re.fullmatch(rb'[a-f0-9]{64}', value):
            raise ValueError('Native caller credential is unavailable')
        _bound_file(directory_fd, 'caller.credential', descriptor, info, 'Native caller credential changed')
        return value
    finally:
        os.close(descriptor)



def validated_instance(name):
    if not isinstance(name, str) or not INSTANCE.fullmatch(name):
        raise ValueError("Invalid native task instance")
    return name



def secure_open_directory(path, owner):
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        info = os.fstat(descriptor)
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != owner or info.st_mode & 0o022 or info.st_nlink < 1:
            raise ValueError("Native directory ownership changed")
    except BaseException:
        os.close(descriptor)
        raise
    return descriptor



def _file_identity(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid,
            info.st_nlink, info.st_size, info.st_mtime_ns, info.st_ctime_ns)



def _bound_file(directory_fd, name, descriptor, original, error):
    if (_file_identity(os.fstat(descriptor)) != _file_identity(original)
            or _file_identity(os.stat(name, dir_fd=directory_fd, follow_symlinks=False)) != _file_identity(original)):
        raise ValueError(error)



def _task_binding(inbox_fd, instance, task_fd, producer_uid):
    parent = os.fstat(inbox_fd)
    info = os.fstat(task_fd)
    named = os.stat(instance, dir_fd=inbox_fd, follow_symlinks=False)
    if (not stat.S_ISDIR(parent.st_mode) or parent.st_uid != producer_uid or parent.st_mode & 0o022
            or parent.st_nlink < 1 or not stat.S_ISDIR(info.st_mode) or info.st_uid != producer_uid
            or stat.S_IMODE(info.st_mode) != 0o700 or info.st_nlink < 1
            or not stat.S_ISDIR(named.st_mode) or named.st_uid != producer_uid
            or stat.S_IMODE(named.st_mode) != 0o700 or named.st_nlink < 1
            or (info.st_dev, info.st_ino) != (named.st_dev, named.st_ino)):
        raise ValueError('Native task directory custody changed')



def _producer_entries(inbox_fd, instance, task_fd, producer_uid, allow_socket_gone=False):
    _task_binding(inbox_fd, instance, task_fd, producer_uid)
    entries = set(os.listdir(task_fd))
    if not entries <= {'request.json', 'caller.credential', 'worker.sock'}:
        raise ValueError('Unexpected native producer contents')
    identities = {}
    for name in entries:
        try:
            info = os.stat(name, dir_fd=task_fd, follow_symlinks=False)
        except FileNotFoundError:
            if name == 'worker.sock' and allow_socket_gone:
                continue  # Node may close/unlink its authenticated socket during enumeration.
            raise
        if name == 'worker.sock':
            if (not stat.S_ISSOCK(info.st_mode) or info.st_uid != producer_uid
                    or stat.S_IMODE(info.st_mode) != 0o666 or info.st_nlink < 1):
                raise ValueError('Native producer socket changed')
            # Pinning legitimately changes the socket's nlink/ctime.
            identities[name] = (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid)
        else:
            if (not stat.S_ISREG(info.st_mode) or info.st_uid != producer_uid or info.st_nlink != 1
                    or stat.S_IMODE(info.st_mode) != 0o600 or info.st_size > IPC_MAX_BYTES
                    or (name == 'caller.credential' and info.st_size != 64)):
                raise ValueError('Native producer file custody changed')
            identities[name] = _file_identity(info)
    # Directory link counts vary by filesystem. Flat entry types plus the named
    # parent/FD binding prove this layout; no fixed nlink=1/2 assumption is made.
    _task_binding(inbox_fd, instance, task_fd, producer_uid)
    return identities



def _producer_unchanged(inbox_fd, instance, task_fd, producer_uid, original,
                        removed=frozenset(), allow_socket_gone=False):
    current = _producer_entries(inbox_fd, instance, task_fd, producer_uid, allow_socket_gone=allow_socket_gone)
    allowed_missing = set(removed) | ({'worker.sock'} if allow_socket_gone else set())
    if set(current) - set(original) or not (set(original) - set(current)) <= allowed_missing:
        raise ValueError('Native producer layout changed')
    if any(current[name] != original[name] for name in current):
        raise ValueError('Native producer identity changed')
    return current



def _open_producer_task(inbox, instance, producer_uid):
    inbox_fd = secure_open_directory(inbox, producer_uid)
    task_fd = None
    try:
        task_fd = os.open(instance, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=inbox_fd)
        _producer_entries(inbox_fd, instance, task_fd, producer_uid)
        return inbox_fd, task_fd
    except BaseException:
        if task_fd is not None:
            os.close(task_fd)
        os.close(inbox_fd)
        raise



def _unlink_producer(inbox_fd, instance, task_fd, producer_uid, original, allow_socket_gone=False):
    removed = set()
    for name in ('worker.sock', 'request.json', 'caller.credential'):
        current = _producer_unchanged(inbox_fd, instance, task_fd, producer_uid, original,
                                      removed, allow_socket_gone)
        if name in current:
            try:
                os.unlink(name, dir_fd=task_fd)
            except FileNotFoundError:
                if name != 'worker.sock' or not allow_socket_gone:
                    raise
                # Only the authenticated original socket may be closed by Node.
                # Recheck custody and every surviving entry before continuing.
                _producer_unchanged(inbox_fd, instance, task_fd, producer_uid, original,
                                      removed, allow_socket_gone=True)
            removed.add(name)
    if _producer_unchanged(inbox_fd, instance, task_fd, producer_uid, original, removed, allow_socket_gone):
        raise ValueError('Native producer contents changed')
    # These checks reject observed replacement; stat/unlink/rmdir are not an
    # atomic ownership transfer against a malicious concurrent same-UID writer.
    os.rmdir(instance, dir_fd=inbox_fd)



def pin_bridge(inbox, bridges, instance, producer_uid=PRODUCER_UID):
    """Pin the Unix socket inode into a root-owned directory before systemd resolves paths."""
    validated_instance(instance)
    inbox_fd, task_fd = _open_producer_task(inbox, instance, producer_uid)
    bridge_fd = None
    try:
        original = _producer_entries(inbox_fd, instance, task_fd, producer_uid)
        body, value = _read_json_file(task_fd, 'request.json', producer_uid, 0o600, 'Invalid native launch request')
        if value != _expected_identity(instance) or type(value.get('executionAttempt')) is not int:
            raise ValueError("Native launch request identity changed")
        caller = private_caller(task_fd, producer_uid)
        socket_stat = os.stat("worker.sock", dir_fd=task_fd, follow_symlinks=False)
        if not stat.S_ISSOCK(socket_stat.st_mode) or socket_stat.st_uid != producer_uid:
            raise ValueError("Native bridge is not the producer's Unix socket")
        _producer_unchanged(inbox_fd, instance, task_fd, producer_uid, original)
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
        _producer_unchanged(inbox_fd, instance, task_fd, producer_uid, original)
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
        _producer_unchanged(inbox_fd, instance, task_fd, producer_uid, original)
    finally:
        for descriptor in (bridge_fd, task_fd, inbox_fd):
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
    if not unit_ended(instance, run):
        return False
    bridge = root / 'bridges' / instance
    bridge_fd = secure_open_directory(bridge, 0)
    producer_fd = inbox_fd = None
    try:
        entries = set(os.listdir(bridge_fd))
        if not entries <= {'worker.sock', 'ended', 'request.json', 'caller.credential'}:
            raise ValueError('Unexpected native bridge contents')
        _manifest_body, manifest = _read_json_file(bridge_fd, 'request.json', 0, (0o444, 0o400),
                                                   'Native root receipt changed')
        if manifest != _expected_identity(instance) or type(manifest.get('executionAttempt')) is not int:
            raise ValueError('Native root receipt identity changed')
        inbox_fd = secure_open_directory(root / 'inbox', producer_uid)
        try:
            producer_fd = os.open(instance, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=inbox_fd)
        except FileNotFoundError:
            producer_fd = None
        if producer_fd is not None:
            original = _producer_entries(inbox_fd, instance, producer_fd, producer_uid, allow_socket_gone=True)

        def producer_current():
            if producer_fd is None:
                try:
                    os.stat(instance, dir_fd=inbox_fd, follow_symlinks=False)
                except FileNotFoundError:
                    return {}
                raise ValueError('Native producer appeared during cleanup')
            # Node server.close may unlink only its original socket. Requests and
            # credentials never disappear/change until this broker unlinks them.
            remaining = _producer_unchanged(inbox_fd, instance, producer_fd, producer_uid,
                                             original, allow_socket_gone=True)
            if 'request.json' in remaining:
                _body, body = _read_json_file(producer_fd, 'request.json', producer_uid, 0o600,
                                               'Native producer request changed')
                if body != manifest or type(body.get('executionAttempt')) is not int:
                    raise ValueError('Native producer identity changed')
            if 'caller.credential' in remaining:
                if private_caller(producer_fd, producer_uid) != private_caller(bridge_fd, 0):
                    raise ValueError('Native producer caller changed')
            if 'worker.sock' in remaining:
                try:
                    socket_info = os.stat('worker.sock', dir_fd=producer_fd, follow_symlinks=False)
                except FileNotFoundError:
                    _producer_unchanged(inbox_fd, instance, producer_fd, producer_uid,
                                          original, allow_socket_gone=True)
                    socket_info = None
                pinned = os.stat('worker.sock', dir_fd=bridge_fd, follow_symlinks=False)
                if not stat.S_ISSOCK(pinned.st_mode) or (socket_info is not None
                        and (socket_info.st_dev, socket_info.st_ino) != (pinned.st_dev, pinned.st_ino)):
                    raise ValueError('Native producer socket changed')
            return _producer_unchanged(inbox_fd, instance, producer_fd, producer_uid, original, allow_socket_gone=True)

        # Validate producer custody/content before any notification or unit cleanup.
        producer_current()
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
            producer_current()
            run(['systemctl', 'clean', '--what=state', f'openscience-hermes@{instance}.service'], check=True,
                timeout=30, env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'}, capture_output=True)
            producer_current()
            ended_fd = os.open('ended', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o444, dir_fd=bridge_fd)
            os.close(ended_fd)
        producer_current()
        if producer_fd is not None:
            _unlink_producer(inbox_fd, instance, producer_fd, producer_uid, original, allow_socket_gone=True)
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
