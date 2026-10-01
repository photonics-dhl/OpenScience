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
from host_broker import pin_bridge, secure_open_directory, validated_instance, cleanup_ended
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
        self.assertEqual(set(p.name for p in self.task.iterdir()),{'request.json'})
        self.assertTrue(cleanup_ended(self.root,INSTANCE,run,lambda _:True,producer_uid=0))
        self.assertFalse(self.task.exists())

    def test_real_broker_mount_namespace_pins_socket_and_keeps_resources_readonly(self):
        if not Path('/run/systemd/system').is_dir():
            self.skipTest('Requires an actual running systemd manager')
        for name in ('releases', 'observations'):
            (self.root/name).mkdir()
        protected = [self.root/'runtime.env', self.root/'install.lock', self.root/'releases'/'resource',
                     self.root/'observations'/'receipt', Path(__file__).resolve()]
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
result['readonly']=[]
for path in json.loads(sys.argv[4]):
 try:
  fd=os.open(path,os.O_WRONLY);os.close(fd);result['readonly'].append(False)
 except OSError as error:result['readonly'].append(error.errno==30)
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
    def test_only_fixed_uuid_and_execution_attempt_are_unit_names(self):
        self.assertEqual(validated_instance(INSTANCE),INSTANCE)
        for value in ['../other','task;id',INSTANCE+' --property=User=root',INSTANCE.replace('-1','-0'),INSTANCE.upper()]:
            with self.subTest(value=value), self.assertRaises(ValueError): validated_instance(value)


if __name__ == '__main__': unittest.main()
