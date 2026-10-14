"""Linux filesystem checks only; never invokes systemctl or launches an Agent."""
import json
import os
from pathlib import Path
import socket
import stat
import tempfile
import unittest
import subprocess
import uuid
from unittest.mock import patch
import host_broker
from host_broker import (pin_bridge, secure_open_directory, validated_instance, cleanup_ended,
                         private_caller, consume_stop, stop_unit)
from types import SimpleNamespace

INSTANCE = 'af36958a-d6d0-4666-a69c-e3c60170b17f-1'


@unittest.skipUnless(os.name == 'posix' and hasattr(os, 'geteuid') and os.geteuid() == 0, 'Requires Linux root-owned temporary directories')
class BrokerFilesystemTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='native-broker-', dir=Path.cwd())
        self.root = Path(self.temp.name)
        self.inbox = self.root/'inbox'; self.bridges = self.root/'bridges'
        self.inbox.mkdir(mode=0o700); self.bridges.mkdir(mode=0o700)
        self.task = self.inbox/INSTANCE; self.task.mkdir()
        (self.task/'request.json').write_text(json.dumps({'taskId': INSTANCE.rsplit('-',1)[0], 'executionAttempt': 1}))
        (self.task/'caller.credential').write_text('a' * 64)
        (self.task/'caller.credential').chmod(0o600)
        self.socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        previous=Path.cwd()
        try:
            os.chdir(self.task); self.socket.bind('worker.sock')
        finally: os.chdir(previous)
        (self.task/'worker.sock').chmod(0o666)

    def tearDown(self):
        self.socket.close(); self.temp.cleanup()

    def test_pins_the_same_socket_inode_despite_restrictive_broker_umask(self):
        old = os.umask(0o077)
        try: pin_bridge(self.inbox,self.bridges,INSTANCE,producer_uid=0)
        finally: os.umask(old)
        bridge=self.bridges/INSTANCE
        self.assertEqual(stat.S_IMODE(bridge.stat().st_mode),0o755)
        self.assertEqual((bridge/'worker.sock').stat().st_ino,(self.task/'worker.sock').stat().st_ino)
        self.assertEqual((bridge/'caller.credential').read_text(), 'a' * 64)
        self.assertEqual(stat.S_IMODE((bridge/'caller.credential').stat().st_mode), 0o600)
        self.assertEqual((bridge/'caller.credential').stat().st_uid, 0)
        self.assertNotEqual((bridge/'caller.credential').stat().st_ino, (self.task/'caller.credential').stat().st_ino)

    def test_missing_public_symlinked_or_hardlinked_credentials_cannot_launch(self):
        path = self.task/'caller.credential'
        for kind in ('missing', 'public', 'symlink', 'hardlink', 'invalid'):
            with self.subTest(kind=kind):
                if path.exists() or path.is_symlink(): path.unlink()
                if kind == 'symlink': path.symlink_to(self.task/'request.json')
                elif kind != 'missing':
                    path.write_text('not-a-credential' if kind == 'invalid' else 'a' * 64)
                    path.chmod(0o644 if kind == 'public' else 0o600)
                    if kind == 'hardlink': os.link(path, self.task/'credential-link')
                with self.assertRaises((OSError, ValueError)):
                    pin_bridge(self.inbox, self.bridges, INSTANCE, producer_uid=0)
                self.assertFalse((self.bridges/INSTANCE).exists())
                if kind == 'hardlink': (self.task/'credential-link').unlink()

    def test_caller_file_owner_must_match_the_producer(self):
        task_fd = os.open(self.task, os.O_RDONLY | os.O_DIRECTORY)
        try:
            with self.assertRaises(ValueError): private_caller(task_fd, 1000)
        finally: os.close(task_fd)

    def test_root_bridges_parent_cannot_be_group_writable(self):
        self.bridges.chmod(0o770)
        with self.assertRaises(ValueError): pin_bridge(self.inbox,self.bridges,INSTANCE,producer_uid=0)
        self.assertFalse((self.bridges/INSTANCE).exists())

    def test_manifest_cannot_supply_a_command_or_different_task(self):
        (self.task/'request.json').write_text(json.dumps({'taskId': INSTANCE.rsplit('-',1)[0], 'executionAttempt': 1, 'command': 'id'}))
        with self.assertRaises(ValueError): pin_bridge(self.inbox,self.bridges,INSTANCE,producer_uid=0)
        self.assertFalse((self.bridges/INSTANCE).exists())

    def test_swapped_socket_is_rejected_before_a_root_pinned_path_is_available(self):
        original = os.link
        def swap(*args,**kwargs):
            (self.task/'worker.sock').unlink()
            (self.task/'worker.sock').write_text('not a socket')
            return original(*args,**kwargs)
        with patch('host_broker.os.link',side_effect=swap), self.assertRaises(ValueError):
            pin_bridge(self.inbox,self.bridges,INSTANCE,producer_uid=0)
        self.assertFalse((self.bridges/INSTANCE/'worker.sock').exists())

    def test_symlinked_request_cannot_redirect_a_root_read(self):
        (self.task/'request.json').unlink()
        (self.task/'request.json').symlink_to(self.root/'missing')
        with self.assertRaises(OSError): pin_bridge(self.inbox,self.bridges,INSTANCE,producer_uid=0)

    def test_active_or_remaining_process_never_notifies_cleans_or_unlinks(self):
        pin_bridge(self.inbox,self.bridges,INSTANCE,producer_uid=0)
        for fields in ['ActiveState=active\nSubState=running\nMainPID=42\nControlPID=0\nJob=',
                       'ActiveState=inactive\nSubState=dead\nMainPID=42\nControlPID=0\nJob=']:
            commands=[]; notices=[]
            def run(argv, **kwargs):
                commands.append(argv); return SimpleNamespace(stdout=fields)
            self.assertFalse(cleanup_ended(self.root,INSTANCE,run,notices.append,producer_uid=0))
            self.assertEqual(len(commands),1); self.assertEqual(notices,[])
            self.assertTrue((self.task/'worker.sock').exists())

    def test_ended_task_notifies_before_clean_then_removes_only_own_files_once(self):
        pin_bridge(self.inbox,self.bridges,INSTANCE,producer_uid=0)
        events=[]
        def run(argv, **kwargs):
            events.append(argv[1]); return SimpleNamespace(stdout='ActiveState=inactive\nSubState=dead\nMainPID=0\nControlPID=0\nJob=')
        def notify(path): events.append('notify'); self.assertEqual(path,self.bridges/INSTANCE/'worker.sock'); return True
        self.assertTrue(cleanup_ended(self.root,INSTANCE,run,notify,producer_uid=0))
        self.assertEqual(events,['show','notify','clean']); self.assertFalse(self.task.exists())
        self.assertEqual(set(p.name for p in (self.bridges/INSTANCE).iterdir()),{'ended','request.json'})
        self.assertTrue(cleanup_ended(self.root,INSTANCE,run,notify,producer_uid=0))
        self.assertEqual(events,['show','notify','clean','show'])

    def test_unexpected_producer_file_is_preserved_without_recursive_cleanup(self):
        pin_bridge(self.inbox,self.bridges,INSTANCE,producer_uid=0)
        (self.task/'user-paper.pdf').write_text('preserve')
        run=lambda *args,**kwargs: SimpleNamespace(stdout='ActiveState=failed\nSubState=failed\nMainPID=0\nControlPID=0\nJob=')
        with self.assertRaises(ValueError): cleanup_ended(self.root,INSTANCE,run,lambda _:True,producer_uid=0)
        self.assertEqual((self.task/'user-paper.pdf').read_text(),'preserve'); self.assertTrue((self.task/'request.json').exists())

    def test_changed_producer_request_cannot_redirect_cleanup(self):
        pin_bridge(self.inbox,self.bridges,INSTANCE,producer_uid=0)
        (self.task/'request.json').write_text('{"taskId":"other","executionAttempt":1}')
        run=lambda *args,**kwargs: SimpleNamespace(stdout='ActiveState=inactive\nSubState=dead\nMainPID=0\nControlPID=0\nJob=')
        with self.assertRaises(ValueError): cleanup_ended(self.root,INSTANCE,run,lambda _:True,producer_uid=0)
        self.assertTrue((self.task/'worker.sock').exists())

    def test_queued_start_job_prevents_cleanup_even_with_no_pid(self):
        pin_bridge(self.inbox,self.bridges,INSTANCE,producer_uid=0)
        commands=[]; notices=[]
        def run(argv, **kwargs):
            commands.append(argv); return SimpleNamespace(stdout='ActiveState=inactive\nSubState=dead\nMainPID=0\nControlPID=0\nJob=123')
        self.assertFalse(cleanup_ended(self.root,INSTANCE,run,notices.append,producer_uid=0))
        self.assertEqual(len(commands),1); self.assertEqual(notices,[]); self.assertTrue(self.task.exists())

    def test_notification_timeout_preserves_worker_ipc_and_does_not_clean_state(self):
        pin_bridge(self.inbox,self.bridges,INSTANCE,producer_uid=0)
        commands=[]
        def run(argv, **kwargs):
            commands.append(argv); return SimpleNamespace(stdout='ActiveState=inactive\nSubState=dead\nMainPID=0\nControlPID=0\nJob=')
        def notify(_path): raise TimeoutError('unknown outcome')
        self.assertFalse(cleanup_ended(self.root,INSTANCE,run,notify,producer_uid=0))
        self.assertEqual(len(commands),1); self.assertTrue((self.task/'worker.sock').exists())
        self.assertFalse((self.bridges/INSTANCE/'ended').exists())

    def test_partial_unlink_can_resume_from_the_root_owned_original_manifest(self):
        pin_bridge(self.inbox,self.bridges,INSTANCE,producer_uid=0)
        run=lambda *args,**kwargs: SimpleNamespace(stdout='ActiveState=inactive\nSubState=dead\nMainPID=0\nControlPID=0\nJob=')
        unlink=os.unlink
        def interrupted(name, **kwargs):
            if name == 'request.json': raise OSError('interrupted after socket unlink')
            return unlink(name, **kwargs)
        with patch('host_broker.os.unlink', side_effect=interrupted), self.assertRaises(OSError):
            cleanup_ended(self.root,INSTANCE,run,lambda _:True,producer_uid=0)
        self.assertEqual(set(p.name for p in self.task.iterdir()),{'request.json', 'caller.credential'})
        self.assertTrue(cleanup_ended(self.root,INSTANCE,run,lambda _:True,producer_uid=0))
        self.assertFalse(self.task.exists())

    def test_real_broker_mount_namespace_pins_socket_and_keeps_resources_readonly(self):
        if not Path('/run/systemd/system').is_dir():
            self.skipTest('Requires an actual running systemd manager')
        for name in ('releases', 'observations'):
            (self.root/name).mkdir()
        protected = [self.root/'runtime.env', self.root/'install.lock', self.root/'releases'/'resource',
                     self.root/'observations'/'receipt', Path('/etc/ld.so.cache')]
        for path in protected[:-1]:
            path.write_text('owned fixture, no credentials')
        template = (Path(__file__).parent/'openscience-hermes-broker.service').read_text()
        properties = [line.replace('/opt/openscience-hermes', str(self.root)) for line in template.splitlines()
                      if line.startswith(('ProtectSystem=', 'ReadWritePaths=', 'ReadOnlyPaths='))]
        code = '''import json,os,sys
from pathlib import Path
sys.path.insert(0,sys.argv[1])
from host_broker import pin_bridge
root=Path(sys.argv[2]); result={}
try:
 pin_bridge(root/'inbox',root/'bridges',sys.argv[3],producer_uid=0);result['linked']=True
except OSError as error:result.update(linked=False,errno=error.errno)
result['readonly']=[];result['writeErrors']=[]
for path in json.loads(sys.argv[4]):
 try:
  fd=os.open(path,os.O_WRONLY);os.close(fd);result['readonly'].append(False);result['writeErrors'].append(None)
 except OSError as error:result['readonly'].append(error.errno==30);result['writeErrors'].append(error.errno)
print(json.dumps(result))'''
        command = ['systemd-run', '--quiet', '--wait', '--pipe', '--collect',
                   '--unit=openscience-hermes-mount-test-'+uuid.uuid4().hex,
                   '--property=Type=exec', *['--property='+p for p in properties],
                   '/usr/bin/python3', '-c', code, str(Path(__file__).parent.resolve()), str(self.root), INSTANCE,
                   json.dumps([str(path) for path in protected])]
        result = subprocess.run(command, capture_output=True, text=True, timeout=30, check=True)
        observed = json.loads(result.stdout)
        self.assertTrue(observed['linked'], observed)
        self.assertEqual(observed['readonly'], [True]*len(protected), observed)


class InstanceTests(unittest.TestCase):
    def test_stopped_notification_uses_root_private_caller_without_putting_it_in_the_body(self):
        requests = []
        response = SimpleNamespace(status=200, read=lambda _limit: b'{"received":true}')
        with patch.object(host_broker, 'secure_open_directory', return_value=42), \
                patch.object(host_broker, 'private_caller', return_value=b'a' * 64), \
                patch.object(host_broker.os, 'close'), \
                patch.object(host_broker.http.client.HTTPConnection, 'request',
                    side_effect=lambda *args, **kwargs: requests.append((args, kwargs))), \
                patch.object(host_broker.http.client.HTTPConnection, 'getresponse', return_value=response):
            self.assertTrue(host_broker.notify_stopped(Path('/fixture/worker.sock')))
        self.assertEqual(requests[0][1]['headers']['x-openscience-native-caller'], 'a' * 64)
        self.assertEqual(requests[0][1]['body'], b'{"status":"stopped"}')

    def test_only_fixed_uuid_and_execution_attempt_are_unit_names(self):
        self.assertEqual(validated_instance(INSTANCE),INSTANCE)
        for value in ['../other','task;id',INSTANCE+' --property=User=root',INSTANCE.replace('-1','-0'),INSTANCE.upper()]:
            with self.subTest(value=value), self.assertRaises(ValueError): validated_instance(value)

    def test_stop_unit_uses_only_the_validated_fixed_instance(self):
        commands = []
        stop_unit(INSTANCE, lambda argv, **kwargs: commands.append((argv, kwargs)))
        self.assertEqual(commands[0][0], ['systemctl', 'stop', f'openscience-hermes@{INSTANCE}.service'])
        with self.assertRaises(ValueError): stop_unit(INSTANCE + ' --property=User=root', lambda *_a, **_k: None)

    def test_duplicate_stop_json_fields_are_rejected(self):
        with self.assertRaises(ValueError):
            host_broker._decode_object(b'{"taskId":"x","taskId":"y"}', 'invalid')


@unittest.skipUnless(os.name == 'posix' and hasattr(os, 'geteuid') and os.geteuid() == 0,
                     'Requires Linux root-owned temporary directories')
class BrokerStopArtifactTests(unittest.TestCase):
    """Exact stop artifact tests use a fake systemctl callback only."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='native-broker-stop-', dir=Path.cwd())
        self.root = Path(self.temp.name)
        self.inbox = self.root / 'inbox'; self.bridges = self.root / 'bridges'
        self.inbox.mkdir(mode=0o700); self.bridges.mkdir(mode=0o700)
        self.task = self.inbox / INSTANCE; self.task.mkdir(mode=0o700)
        identity = {'taskId': INSTANCE.rsplit('-', 1)[0], 'executionAttempt': 1}
        (self.task / 'request.json').write_text(json.dumps(identity)); (self.task / 'request.json').chmod(0o600)
        (self.task / 'caller.credential').write_text('b' * 64); (self.task / 'caller.credential').chmod(0o600)
        (self.task / host_broker.STOP_FILE).write_text(json.dumps(identity)); (self.task / host_broker.STOP_FILE).chmod(0o600)

    def tearDown(self):
        self.temp.cleanup()

    def test_before_start_without_socket_creates_no_restart_tombstone(self):
        commands = []
        self.assertTrue(consume_stop(self.root, INSTANCE, lambda argv, **kwargs: commands.append(argv), producer_uid=0))
        self.assertEqual(commands, [])

    def test_poll_once_consumes_before_start_stop_without_starting_unit(self):
        commands = []
        original_consume_stop = host_broker.consume_stop
        with patch.object(host_broker, 'consume_stop',
                          side_effect=lambda root, instance, run: original_consume_stop(
                              root, instance, run, producer_uid=0)):
            host_broker.poll_once(self.root, lambda argv, **kwargs: commands.append(argv))
        self.assertFalse(any(command[1] == 'start' for command in commands))
        self.assertTrue((self.bridges / INSTANCE / 'ended').exists())
        self.assertFalse(self.task.exists())
        bridge = self.bridges / INSTANCE
        self.assertEqual(set(path.name for path in bridge.iterdir()),
                         {'ended', 'request.json', 'caller.credential', host_broker.STOP_FILE})
        self.assertFalse(self.task.exists())
        self.assertTrue(consume_stop(self.root, INSTANCE, lambda argv, **kwargs: commands.append(argv), producer_uid=0))
        self.assertEqual(commands, [])

    def test_active_socket_stop_is_exact_and_repeated_delivery_is_inert(self):
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        try:
            previous = Path.cwd()
            try:
                os.chdir(self.task)
                sock.bind('worker.sock')
            finally:
                os.chdir(previous)
            (self.task / 'worker.sock').chmod(0o666)
            commands = []
            fake = lambda argv, **kwargs: commands.append(argv)
            self.assertTrue(consume_stop(self.root, INSTANCE, fake, producer_uid=0))
            self.assertEqual(commands, [['systemctl', 'stop', f'openscience-hermes@{INSTANCE}.service']])
            self.assertTrue((self.bridges / INSTANCE / host_broker.STOP_SENT).exists())
            self.assertTrue(consume_stop(self.root, INSTANCE, fake, producer_uid=0))
            self.assertEqual(commands, [['systemctl', 'stop', f'openscience-hermes@{INSTANCE}.service']])
        finally:
            sock.close()

    def test_queued_unit_is_not_cleaned_until_systemd_job_ends(self):
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        try:
            previous = Path.cwd()
            try:
                os.chdir(self.task)
                sock.bind('worker.sock')
            finally:
                os.chdir(previous)
            (self.task / 'worker.sock').chmod(0o666)
            host_broker.pin_bridge(self.inbox, self.bridges, INSTANCE, producer_uid=0)
            commands = []

            def queued(argv, **kwargs):
                commands.append(argv)
                if argv[1] == 'show':
                    return SimpleNamespace(stdout='ActiveState=inactive\nSubState=dead\nMainPID=0\nControlPID=0\nJob=123')
                return SimpleNamespace(stdout='')

            self.assertTrue(consume_stop(self.root, INSTANCE, queued, producer_uid=0))
            self.assertFalse(cleanup_ended(self.root, INSTANCE, queued, lambda _path: self.fail('not notified'), producer_uid=0))
            self.assertTrue((self.bridges / INSTANCE / host_broker.STOP_SENT).exists())
            self.assertFalse((self.bridges / INSTANCE / 'ended').exists())
            self.assertEqual([command[:2] for command in commands], [
                ['systemctl', 'stop'], ['systemctl', 'show']])
        finally:
            sock.close()

    def test_ended_stop_receipt_is_idempotent_without_another_systemctl_call(self):
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        try:
            previous = Path.cwd()
            try:
                os.chdir(self.task)
                sock.bind('worker.sock')
            finally:
                os.chdir(previous)
            (self.task / 'worker.sock').chmod(0o666)
            host_broker.pin_bridge(self.inbox, self.bridges, INSTANCE, producer_uid=0)
            commands = []
            fake = lambda argv, **kwargs: commands.append(argv)
            self.assertTrue(consume_stop(self.root, INSTANCE, fake, producer_uid=0))
            bridge = self.bridges / INSTANCE
            (bridge / 'ended').touch(mode=0o444)
            # Simulate cleanup having removed only the producer-side IPC while
            # retaining the root-owned stopped receipt.
            for name in ('request.json', 'caller.credential', host_broker.STOP_FILE):
                (self.task / name).unlink()
            (self.task / 'worker.sock').unlink()
            self.task.rmdir()
            self.assertTrue(consume_stop(self.root, INSTANCE, fake, producer_uid=0))
            self.assertEqual([command[:2] for command in commands], [['systemctl', 'stop']])
        finally:
            sock.close()

    def test_stop_artifact_rejects_wrong_uid_mode_hardlink_and_symlink(self):
        path = self.task / host_broker.STOP_FILE
        for kind in ('wrong-uid', 'wrong-mode', 'hardlink', 'symlink'):
            with self.subTest(kind=kind):
                if path.exists() or path.is_symlink():
                    path.unlink()
                link = self.task / 'stop-link'
                if link.exists() or link.is_symlink():
                    link.unlink()
                identity = {'taskId': INSTANCE.rsplit('-', 1)[0], 'executionAttempt': 1}
                path.write_text(json.dumps(identity)); path.chmod(0o600)
                if kind == 'wrong-uid':
                    os.chown(path, 1, -1)
                elif kind == 'wrong-mode':
                    path.chmod(0o644)
                elif kind == 'hardlink':
                    os.link(path, link)
                elif kind == 'symlink':
                    path.unlink(); path.symlink_to(self.task / 'request.json')
                with self.assertRaises((OSError, ValueError)):
                    consume_stop(self.root, INSTANCE, lambda *_args, **_kwargs: self.fail('must not stop'), producer_uid=0)

    def test_task_directory_owner_and_other_writable_bits_are_bound_before_stop(self):
        commands = []
        os.chown(self.task, 1, -1)
        with self.assertRaises(ValueError):
            consume_stop(self.root, INSTANCE, lambda argv, **kwargs: commands.append(argv), producer_uid=0)
        os.chown(self.task, 0, -1)
        self.task.chmod(0o707)
        with self.assertRaises(ValueError):
            consume_stop(self.root, INSTANCE, lambda argv, **kwargs: commands.append(argv), producer_uid=0)
        self.assertEqual(commands, [])

    def test_wrong_stop_identity_or_extra_file_does_not_stop_peer(self):
        (self.task / host_broker.STOP_FILE).write_text(json.dumps({'taskId': 'other', 'executionAttempt': 1}))
        commands = []
        with self.assertRaises(ValueError): consume_stop(self.root, INSTANCE, lambda argv, **kwargs: commands.append(argv), producer_uid=0)
        self.assertEqual(commands, [])

        (self.task / host_broker.STOP_FILE).write_text(json.dumps({'taskId': INSTANCE.rsplit('-', 1)[0], 'executionAttempt': 1}))
        (self.task / 'extra').write_text('preserve')
        with self.assertRaises(ValueError): consume_stop(self.root, INSTANCE, lambda argv, **kwargs: commands.append(argv), producer_uid=0)
        self.assertEqual(commands, [])


if __name__ == '__main__': unittest.main()
