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
from contextlib import ExitStack, contextmanager
from unittest.mock import patch
import host_broker
from host_broker import (pin_bridge, secure_open_directory, validated_instance, cleanup_ended,
                         private_caller, consume_stop, stop_unit)
from types import SimpleNamespace

INSTANCE = 'af36958a-d6d0-4666-a69c-e3c60170b17f-1'


class BrokerCustodyPolicyTests(unittest.TestCase):
    """Platform-independent policy tests: OS calls are stubs, not Linux proof."""

    def test_nonroot_group_writable_inbox_is_rejected(self):
        info = SimpleNamespace(st_mode=stat.S_IFDIR | 0o775, st_uid=1000)
        with ExitStack() as stack:
            for name in ('O_DIRECTORY', 'O_NOFOLLOW'):
                stack.enter_context(patch.object(os, name, getattr(os, name, 0), create=True))
            stack.enter_context(patch('host_broker.os.open', return_value=42))
            stack.enter_context(patch('host_broker.os.fstat', return_value=info))
            stack.enter_context(patch('host_broker.os.close'))
            with self.assertRaises(ValueError):
                secure_open_directory(Path('synthetic-inbox'), 1000)

    @staticmethod
    def info(kind, mode, inode, owner=1000, links=1, size=0):
        return SimpleNamespace(st_mode=kind | mode, st_uid=owner, st_gid=1000,
                               st_nlink=links, st_dev=1, st_ino=inode, st_size=size,
                               st_mtime_ns=1, st_ctime_ns=1)

    @contextmanager
    def producer(self, mode=0o700, links=2):
        parent = self.info(stat.S_IFDIR, 0o755, 10, links=2)
        task = self.info(stat.S_IFDIR, mode, 11, links=links)
        state = {'parent': parent, 'task': task, 'named': task, 'entries': {
            'request.json': self.info(stat.S_IFREG, 0o600, 12, size=90),
            'caller.credential': self.info(stat.S_IFREG, 0o600, 13, size=64),
            'worker.sock': self.info(stat.S_IFSOCK, 0o666, 14),
        }}

        def opened(path, _flags, *, dir_fd=None):
            if path == Path('synthetic') / 'inbox' and dir_fd is None:
                return 10
            if path == INSTANCE and dir_fd == 10:
                return 11
            raise AssertionError('Unexpected OS open in policy test')

        def located(name, *, dir_fd, follow_symlinks):
            self.assertFalse(follow_symlinks)
            if name == INSTANCE and dir_fd == 10:
                return state['named']
            if dir_fd == 11:
                return state['entries'][name]
            raise AssertionError('Unexpected OS stat in policy test')

        with ExitStack() as stack:
            for name in ('O_DIRECTORY', 'O_NOFOLLOW'):
                stack.enter_context(patch.object(os, name, getattr(os, name, 0), create=True))
            stack.enter_context(patch('host_broker.os.open', side_effect=opened))
            stack.enter_context(patch('host_broker.os.fstat', side_effect=lambda fd: {10: state['parent'], 11: state['task']}[fd]))
            stack.enter_context(patch('host_broker.os.stat', side_effect=located))
            stack.enter_context(patch('host_broker.os.listdir', side_effect=lambda fd: list(state['entries']) if fd == 11 else self.fail('unexpected listdir')))
            stack.enter_context(patch('host_broker.os.close'))
            yield state

    def test_real_producer_modes_allow_inbox_755_and_private_task_on_link_count_variants(self):
        for links in (1, 2, 3):
            with self.subTest(links=links), self.producer(links=links):
                self.assertEqual(host_broker._open_task(Path('synthetic'), INSTANCE, 1000), (10, 11))

    def test_wrong_task_modes_owner_type_and_unlinked_directory_are_rejected(self):
        for mode in (0o770, 0o775, 0o755, 0o701, 0o1700):
            with self.subTest(mode=oct(mode)), self.producer(mode=mode):
                with self.assertRaises(ValueError):
                    host_broker._open_task(Path('synthetic'), INSTANCE, 1000)
        for change in ('owner', 'type', 'unlinked'):
            with self.subTest(change=change), self.producer() as state:
                if change == 'owner': state['task'].st_uid = 1001
                if change == 'type': state['task'].st_mode = stat.S_IFREG | 0o700
                if change == 'unlinked': state['task'].st_nlink = 0
                with self.assertRaises(ValueError):
                    host_broker._open_task(Path('synthetic'), INSTANCE, 1000)

    def test_flat_layout_rejects_unknown_paid_file_subdirectory_symlink_and_bad_private_file(self):
        for change in ('unknown', 'directory', 'symlink', 'request-mode', 'credential-hardlink', 'socket-mode'):
            with self.subTest(change=change), self.producer() as state:
                files = state['entries']
                if change == 'unknown': files['paid.receipt'] = self.info(stat.S_IFREG, 0o600, 99)
                if change == 'directory': files['request.json'].st_mode = stat.S_IFDIR | 0o700
                if change == 'symlink': files['request.json'].st_mode = stat.S_IFLNK | 0o777
                if change == 'request-mode': files['request.json'].st_mode = stat.S_IFREG | 0o644
                if change == 'credential-hardlink': files['caller.credential'].st_nlink = 2
                if change == 'socket-mode': files['worker.sock'].st_mode = stat.S_IFSOCK | 0o600
                before = dict(files)
                with self.assertRaises(ValueError):
                    host_broker._open_task(Path('synthetic'), INSTANCE, 1000)
                self.assertEqual(files, before)

    def test_named_task_inode_replacement_is_rejected(self):
        with self.producer() as state:
            original = host_broker._producer_entries(10, INSTANCE, 11, 1000)
            state['named'] = self.info(stat.S_IFDIR, 0o700, 99, links=2)
            with self.assertRaises(ValueError):
                host_broker._producer_unchanged(10, INSTANCE, 11, 1000, original)

    def test_changed_named_metadata_is_rejected_even_when_inode_matches_the_open_fd(self):
        for change in ('mode', 'owner', 'unlinked'):
            with self.subTest(change=change), self.producer() as state:
                original = host_broker._producer_entries(10, INSTANCE, 11, 1000)
                state['named'] = SimpleNamespace(**vars(state['task']))
                if change == 'mode': state['named'].st_mode = stat.S_IFDIR | 0o770
                if change == 'owner': state['named'].st_uid = 1001
                if change == 'unlinked': state['named'].st_nlink = 0
                with self.assertRaises(ValueError):
                    host_broker._producer_unchanged(10, INSTANCE, 11, 1000, original)

    def test_callback_may_remove_original_socket_but_cannot_replace_requests_or_add_files(self):
        with self.producer() as state:
            original = host_broker._producer_entries(10, INSTANCE, 11, 1000)
            del state['entries']['worker.sock']
            remaining = host_broker._producer_unchanged(10, INSTANCE, 11, 1000, original, allow_socket_gone=True)
            self.assertEqual(set(remaining), {'request.json', 'caller.credential'})
        for change in ('request-inode', 'request-content', 'caller-inode', 'new-entry', 'request-removed'):
            with self.subTest(change=change), self.producer() as state:
                original = host_broker._producer_entries(10, INSTANCE, 11, 1000)
                if change == 'request-inode': state['entries']['request.json'].st_ino = 99
                if change == 'request-content': state['entries']['request.json'].st_mtime_ns = 2
                if change == 'caller-inode': state['entries']['caller.credential'].st_ino = 99
                if change == 'new-entry': state['entries']['extra'] = self.info(stat.S_IFREG, 0o600, 99)
                if change == 'request-removed': del state['entries']['request.json']
                with self.assertRaises(ValueError):
                    host_broker._producer_unchanged(10, INSTANCE, 11, 1000, original, allow_socket_gone=True)

    @contextmanager
    def stop_model(self, bridge_exists, replace_at=None, producer_present=True, durable_stop=False):
        with self.producer() as state, ExitStack() as stack:
            root = Path('synthetic')
            bridge = root / 'bridges' / INSTANCE
            task = root / 'inbox' / INSTANCE
            identity = host_broker._expected_identity(INSTANCE)
            request = json.dumps(identity).encode()
            caller = b'a' * 64
            state['events'] = []
            state['entries'][host_broker.STOP_FILE] = self.info(stat.S_IFREG, 0o600, 15, size=90)
            if not bridge_exists: del state['entries']['worker.sock']
            original_open, original_list = os.open, os.listdir
            original_secure = host_broker.secure_open_directory

            def effect(name):
                state['events'].append(name)
                if replace_at == name: state['named'] = self.info(stat.S_IFDIR, 0o700, 99, links=2)

            def validate(*_args):
                effect('validate')
                return request, identity, caller, b'stop', identity

            stack.enter_context(patch.object(Path, 'exists', lambda path: (path == bridge and bridge_exists)
                                             or (path == task and producer_present)))
            stack.enter_context(patch.object(Path, 'is_symlink', return_value=False))
            stack.enter_context(patch('host_broker.secure_open_directory', side_effect=lambda path, uid:
                                     42 if path == bridge else original_secure(path, uid)))
            root_entries = {'request.json', 'caller.credential', 'worker.sock'}
            if durable_stop: root_entries.add(host_broker.STOP_FILE)
            stack.enter_context(patch('host_broker.os.listdir', side_effect=lambda fd:
                                     list(root_entries) if fd == 42 else original_list(fd)))
            stack.enter_context(patch('host_broker.os.open', side_effect=lambda name, flags, *args, **kwargs:
                                     43 if name == host_broker.STOP_SENT and kwargs.get('dir_fd') == 42
                                     else original_open(name, flags, *args, **kwargs)))
            stack.enter_context(patch('host_broker._validate_producer_stop', side_effect=validate))
            stack.enter_context(patch('host_broker._read_json_file', return_value=(request, identity)))
            stack.enter_context(patch('host_broker.private_caller', return_value=caller))
            stack.enter_context(patch('host_broker._validate_root_stop', return_value=(b'stop', identity)))
            stack.enter_context(patch('host_broker._write_root_stop', side_effect=lambda *_: effect('root-stop')))
            stack.enter_context(patch('host_broker._write_tombstone', side_effect=lambda *_: effect('tombstone')))
            stack.enter_context(patch('host_broker._remove_stopped_producer', side_effect=lambda *_: effect('remove')))
            stack.enter_context(patch('host_broker.stop_unit', side_effect=lambda *_: effect('stop-unit')))
            yield root, state

    def test_stop_rechecks_named_custody_after_read_before_any_stop_side_effect(self):
        for bridge_exists in (False, True):
            with self.subTest(bridge=bridge_exists), self.stop_model(bridge_exists, 'validate') as (root, state):
                with self.assertRaises(ValueError):
                    host_broker.consume_stop(root, INSTANCE, producer_uid=1000)
                self.assertEqual(state['events'], ['validate'])

    def test_stop_rechecks_after_root_receipt_before_stop_or_producer_removal(self):
        for bridge_exists, event in ((True, 'root-stop'), (False, 'tombstone')):
            with self.subTest(bridge=bridge_exists), self.stop_model(bridge_exists, event) as (root, state):
                with self.assertRaises(ValueError):
                    host_broker.consume_stop(root, INSTANCE, producer_uid=1000)
                self.assertEqual(state['events'], ['validate', event])

    def test_durable_root_stop_without_producer_still_delivers_fixed_stop(self):
        with self.stop_model(True, producer_present=False, durable_stop=True) as (root, state):
            self.assertTrue(host_broker.consume_stop(root, INSTANCE, producer_uid=1000))
            self.assertEqual(state['events'], ['stop-unit'])

    def test_strict_request_reader_detects_replacement_during_read(self):
        original = self.info(stat.S_IFREG, 0o600, 12, size=2)
        replacement = self.info(stat.S_IFREG, 0o600, 99, size=2)
        named = [original]

        def read(_fd, _size):
            named[0] = replacement
            return b'{}'

        with ExitStack() as stack:
            for name in ('O_NOFOLLOW', 'O_NONBLOCK'):
                stack.enter_context(patch.object(os, name, getattr(os, name, 0), create=True))
            stack.enter_context(patch('host_broker.os.open', return_value=12))
            stack.enter_context(patch('host_broker.os.fstat', return_value=original))
            stack.enter_context(patch('host_broker.os.stat', side_effect=lambda *_args, **_kwargs: named[0]))
            stack.enter_context(patch('host_broker.os.read', side_effect=read))
            stack.enter_context(patch('host_broker.os.close'))
            with self.assertRaises(ValueError):
                host_broker._read_json_file(11, 'request.json', 1000, 0o600, 'request changed')

    def test_socket_close_at_unlink_is_allowed_only_while_custody_is_unchanged(self):
        for replace in (False, True):
            with self.subTest(replace=replace), self.producer() as state:
                original = host_broker._producer_entries(10, INSTANCE, 11, 1000)
                events = []

                def unlink(name, *, dir_fd):
                    self.assertEqual(dir_fd, 11)
                    events.append(name)
                    del state['entries'][name]
                    if name == 'worker.sock':
                        if replace: state['named'] = self.info(stat.S_IFDIR, 0o700, 99, links=2)
                        raise FileNotFoundError(name)

                with patch('host_broker.os.unlink', side_effect=unlink), patch('host_broker.os.rmdir') as rmdir:
                    if replace:
                        with self.assertRaises(ValueError):
                            host_broker._unlink_producer(10, INSTANCE, 11, 1000, original, allow_socket_gone=True)
                        self.assertEqual(events, ['worker.sock']); rmdir.assert_not_called()
                    else:
                        host_broker._unlink_producer(10, INSTANCE, 11, 1000, original, allow_socket_gone=True)
                        self.assertEqual(state['entries'], {})
                        rmdir.assert_called_once_with(INSTANCE, dir_fd=10)

    def test_request_disappearance_at_unlink_is_never_treated_as_socket_close(self):
        with self.producer() as state:
            del state['entries']['worker.sock']
            original = host_broker._producer_entries(10, INSTANCE, 11, 1000)
            with patch('host_broker.os.unlink', side_effect=FileNotFoundError('request.json')), \
                    patch('host_broker.os.rmdir') as rmdir:
                with self.assertRaises(FileNotFoundError):
                    host_broker._unlink_producer(10, INSTANCE, 11, 1000, original, allow_socket_gone=True)
                rmdir.assert_not_called()


class BrokerCleanupOrderingTests(unittest.TestCase):
    """Exercise real cleanup control flow with fully stubbed filesystem/runner."""

    @contextmanager
    def cleanup_model(self):
        info = BrokerCustodyPolicyTests.info
        identity = {'taskId': INSTANCE.rsplit('-', 1)[0], 'executionAttempt': 1}
        body = json.dumps(identity).encode()
        root = Path('synthetic')
        bridge = root / 'bridges' / INSTANCE
        state = {'exists': True, 'invalid': False, 'events': [],
                 'root_files': {'request.json', 'caller.credential', 'worker.sock'}, 'files': {
                     'request.json': info(stat.S_IFREG, 0o600, 21, size=len(body)),
                     'caller.credential': info(stat.S_IFREG, 0o600, 22, size=64),
                     'worker.sock': info(stat.S_IFSOCK, 0o666, 23, links=2),
                 }}
        root_request = info(stat.S_IFREG, 0o444, 20, owner=0, size=len(body))
        state['root_request'] = root_request
        task = info(stat.S_IFDIR, 0o700, 11, links=2)

        def opened(name, _flags, *_args, dir_fd=None):
            if name == INSTANCE and dir_fd == 10:
                if not state['exists']: raise FileNotFoundError(name)
                return 11
            if name == 'request.json' and dir_fd in (42, 11):
                return 20 if dir_fd == 42 else 21
            if name == 'ended' and dir_fd == 42:
                state['events'].append('ended'); state['root_files'].add('ended')
                return 30
            raise AssertionError('Unexpected OS open in cleanup model')

        def located(name, *, dir_fd, follow_symlinks):
            self.assertFalse(follow_symlinks)
            if name == INSTANCE and dir_fd == 10:
                if not state['exists']: raise FileNotFoundError(name)
                return task
            if name == 'request.json' and dir_fd == 42: return root_request
            if name == 'worker.sock' and dir_fd == 42: return info(stat.S_IFSOCK, 0o666, 23, links=2)
            if dir_fd == 11:
                if name == 'worker.sock' and state.get('on_socket_stat'):
                    state.pop('on_socket_stat')()
                if name not in state['files']: raise FileNotFoundError(name)
                return state['files'][name]
            raise AssertionError('Unexpected OS stat in cleanup model')

        def snapshot(*_args, **_kwargs):
            if state['invalid']: raise ValueError('Synthetic invalid producer custody')
            return {name: (entry.st_ino, entry.st_mtime_ns) for name, entry in state['files'].items()}

        def listed(fd):
            if fd == 42: return list(state['root_files'])
            if fd == 11: return list(state['files']) + (['paid.receipt'] if state['invalid'] else [])
            raise AssertionError('Unexpected OS listdir in cleanup model')

        def unlinked(name, *, dir_fd):
            state['events'].append('unlink:' + name)
            if dir_fd == 11: del state['files'][name]
            elif dir_fd == 42: state['root_files'].remove(name)
            else: self.fail('Unexpected unlink directory')

        def removed(name, *, dir_fd):
            self.assertEqual((name, dir_fd), (INSTANCE, 10))
            self.assertEqual(state['files'], {})
            state['events'].append('rmdir'); state['exists'] = False

        def run(argv, **_kwargs):
            self.assertEqual(argv, ['systemctl', 'clean', '--what=state', f'openscience-hermes@{INSTANCE}.service'])
            state['events'].append('clean')
            if state.get('on_clean'): state['on_clean']()

        def notify(_path):
            self.assertEqual(_path, bridge / 'worker.sock')
            state['events'].append('notify')
            if state.get('on_notify'): state['on_notify']()
            return True

        with ExitStack() as stack:
            for name in ('O_DIRECTORY', 'O_NOFOLLOW', 'O_NONBLOCK'):
                stack.enter_context(patch.object(os, name, getattr(os, name, 0), create=True))
            stack.enter_context(patch.object(Path, 'is_file', return_value=False))
            stack.enter_context(patch('host_broker.unit_ended', return_value=True))
            stack.enter_context(patch('host_broker.secure_open_directory', side_effect=lambda path, _owner: 42 if path == bridge else 10))
            stack.enter_context(patch('host_broker.private_caller', return_value=b'a' * 64))
            stack.enter_context(patch('host_broker._producer_entries', side_effect=snapshot, create=True))
            stack.enter_context(patch('host_broker.os.open', side_effect=opened))
            stack.enter_context(patch('host_broker.os.fstat', side_effect=lambda fd: {11: task, 20: root_request, 21: state['files']['request.json']}[fd]))
            stack.enter_context(patch('host_broker.os.stat', side_effect=located))
            stack.enter_context(patch('host_broker.os.listdir', side_effect=listed))
            stack.enter_context(patch('host_broker.os.read', return_value=body))
            stack.enter_context(patch('host_broker.os.close'))
            stack.enter_context(patch('host_broker.os.unlink', side_effect=unlinked))
            stack.enter_context(patch('host_broker.os.rmdir', side_effect=removed))
            yield root, state, run, notify

    def test_invalid_producer_is_rejected_before_notify_clean_or_unlink(self):
        with self.cleanup_model() as (root, state, run, notify):
            state['invalid'] = True
            with self.assertRaises(ValueError):
                cleanup_ended(root, INSTANCE, run, notify, producer_uid=1000)
            self.assertEqual(state['events'], [])
            self.assertEqual(set(state['files']), {'request.json', 'caller.credential', 'worker.sock'})
            self.assertEqual(state['root_files'], {'request.json', 'caller.credential', 'worker.sock'})

    def test_manual_cleanup_request_modes_are_checked_before_side_effects(self):
        for target in ('root', 'producer'):
            with self.subTest(target=target), self.cleanup_model() as (root, state, run, notify):
                entry = state['root_request'] if target == 'root' else state['files']['request.json']
                entry.st_mode = stat.S_IFREG | (0o600 if target == 'root' else 0o644)
                with self.assertRaises(ValueError):
                    cleanup_ended(root, INSTANCE, run, notify, producer_uid=1000)
                self.assertEqual(state['events'], [])
                self.assertIn('request.json', state['files'])
                self.assertIn('request.json', state['root_files'])

    def test_notify_may_close_original_socket_then_cleanup_keeps_root_receipt(self):
        with self.cleanup_model() as (root, state, run, notify):
            state['on_notify'] = lambda: state['files'].pop('worker.sock')
            self.assertTrue(cleanup_ended(root, INSTANCE, run, notify, producer_uid=1000))
            self.assertEqual(state['events'][:3], ['notify', 'clean', 'ended'])
            self.assertFalse(state['exists'])
            self.assertEqual(state['root_files'], {'ended', 'request.json'})

    def test_socket_close_at_second_stat_revalidates_before_cleanup_side_effects(self):
        for replace in (False, True):
            with self.subTest(replace=replace), self.cleanup_model() as (root, state, run, notify):
                def close_socket():
                    del state['files']['worker.sock']
                    if replace: state['files']['request.json'].st_ino = 99
                state['on_socket_stat'] = close_socket
                if replace:
                    with self.assertRaises(ValueError):
                        cleanup_ended(root, INSTANCE, run, notify, producer_uid=1000)
                    self.assertEqual(state['events'], [])
                    self.assertIn('request.json', state['files'])
                else:
                    self.assertTrue(cleanup_ended(root, INSTANCE, run, notify, producer_uid=1000))
                    self.assertEqual(state['root_files'], {'ended', 'request.json'})

    def test_request_replacement_or_new_layout_after_notify_blocks_clean_and_unlink(self):
        for change in ('request-inode', 'new-layout'):
            with self.subTest(change=change), self.cleanup_model() as (root, state, run, notify):
                def mutate():
                    if change == 'request-inode': state['files']['request.json'].st_ino = 99
                    else: state['invalid'] = True
                state['on_notify'] = mutate
                with self.assertRaises(ValueError):
                    cleanup_ended(root, INSTANCE, run, notify, producer_uid=1000)
                self.assertEqual(state['events'], ['notify'])
                self.assertIn('request.json', state['files'])
                self.assertNotIn('ended', state['root_files'])

    def test_observed_change_after_clean_preserves_ipc_without_claiming_clean_was_undone(self):
        with self.cleanup_model() as (root, state, run, notify):
            state['on_clean'] = lambda: setattr(state['files']['request.json'], 'st_mtime_ns', 2)
            with self.assertRaises(ValueError):
                cleanup_ended(root, INSTANCE, run, notify, producer_uid=1000)
            self.assertEqual(state['events'], ['notify', 'clean'])
            self.assertIn('request.json', state['files'])
            self.assertEqual(state['root_files'], {'request.json', 'caller.credential', 'worker.sock'})

    def test_partial_unlink_resume_does_not_notify_or_clean_twice(self):
        with self.cleanup_model() as (root, state, run, notify):
            state['root_files'].add('ended')
            del state['files']['worker.sock']
            self.assertTrue(cleanup_ended(root, INSTANCE, run, notify, producer_uid=1000))
            self.assertNotIn('notify', state['events']); self.assertNotIn('clean', state['events'])
            self.assertEqual(state['root_files'], {'ended', 'request.json'})


@unittest.skipUnless(os.name == 'posix' and hasattr(os, 'geteuid') and os.geteuid() == 0, 'Requires Linux root-owned temporary directories')
class BrokerFilesystemTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='native-broker-', dir=Path.cwd())
        self.root = Path(self.temp.name)
        self.inbox = self.root/'inbox'; self.bridges = self.root/'bridges'
        self.inbox.mkdir(mode=0o700); self.bridges.mkdir(mode=0o700)
        self.task = self.inbox/INSTANCE; self.task.mkdir(mode=0o700)
        (self.task/'request.json').write_text(json.dumps({'taskId': INSTANCE.rsplit('-',1)[0], 'executionAttempt': 1}))
        (self.task/'request.json').chmod(0o600)
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

    def nonroot_producer(self):
        self.inbox.chmod(0o755)
        for path in (self.inbox, self.task, *self.task.iterdir()):
            os.chown(path, 1000, 1000)

    def test_real_producer_metadata_with_nonroot_uid_and_node_socket_close_is_accepted(self):
        self.nonroot_producer()
        pin_bridge(self.inbox, self.bridges, INSTANCE, producer_uid=1000)
        events = []

        def run(argv, **_kwargs):
            events.append(argv[1])
            return SimpleNamespace(stdout='ActiveState=inactive\nSubState=dead\nMainPID=0\nControlPID=0\nJob=')

        def notify(_path):
            events.append('notify')
            (self.task / 'worker.sock').unlink()  # Node server.close's producer-side unlink.
            return True

        self.assertTrue(cleanup_ended(self.root, INSTANCE, run, notify, producer_uid=1000))
        self.assertEqual(events, ['show', 'notify', 'clean'])
        self.assertFalse(self.task.exists())
        self.assertEqual(set(path.name for path in (self.bridges / INSTANCE).iterdir()), {'ended', 'request.json'})

    def test_nonroot_wrong_task_mode_and_request_mode_never_create_bridge(self):
        self.nonroot_producer()
        for mode in (0o770, 0o775, 0o755, 0o701):
            with self.subTest(mode=oct(mode)):
                self.task.chmod(mode)
                with self.assertRaises(ValueError):
                    pin_bridge(self.inbox, self.bridges, INSTANCE, producer_uid=1000)
                self.assertFalse((self.bridges / INSTANCE).exists())
        self.task.chmod(0o700)
        (self.task / 'request.json').chmod(0o644)
        with self.assertRaises(ValueError):
            pin_bridge(self.inbox, self.bridges, INSTANCE, producer_uid=1000)
        self.assertFalse((self.bridges / INSTANCE).exists())

    def test_nonroot_cleanup_rejects_changed_directory_and_request_modes_before_side_effects(self):
        self.nonroot_producer()
        pin_bridge(self.inbox, self.bridges, INSTANCE, producer_uid=1000)
        bridge = self.bridges / INSTANCE
        root_mode = stat.S_IMODE((bridge / 'request.json').stat().st_mode)
        for target in (self.task, self.task / 'request.json', bridge / 'request.json'):
            for mode in ((0o770, 0o755) if target == self.task else (0o644,)):
                with self.subTest(target=target.name, mode=oct(mode)):
                    target.chmod(mode)
                    events = []

                    def run(argv, **_kwargs):
                        events.append(argv[1])
                        return SimpleNamespace(stdout='ActiveState=inactive\nSubState=dead\nMainPID=0\nControlPID=0\nJob=')

                    with self.assertRaises(ValueError):
                        cleanup_ended(self.root, INSTANCE, run, lambda _path: events.append('notify'), producer_uid=1000)
                    self.assertEqual(events, ['show'])
                    self.assertTrue((self.task / 'request.json').exists())
                    self.assertFalse((bridge / 'ended').exists())
                    target.chmod(0o700 if target == self.task else root_mode if target.parent == bridge else 0o600)

    def test_extra_directory_or_unknown_file_is_retained_before_acquisition(self):
        self.nonroot_producer()
        for name, directory in (('extra-directory', True), ('paid.receipt', False)):
            path = self.task / name
            if directory: path.mkdir(mode=0o700)
            else: path.write_text('preserve unknown receipt')
            with self.subTest(name=name), self.assertRaises(ValueError):
                pin_bridge(self.inbox, self.bridges, INSTANCE, producer_uid=1000)
            self.assertTrue(path.exists())
            self.assertFalse((self.bridges / INSTANCE).exists())

    def test_directory_replacement_during_acquisition_preserves_both_directories(self):
        self.nonroot_producer()
        original = self.root / 'retained-original'
        listed = os.listdir
        swapped = False

        def replace(fd):
            nonlocal swapped
            names = listed(fd)
            if not swapped and set(names) == {'request.json', 'caller.credential', 'worker.sock'}:
                swapped = True
                self.task.rename(original)
                self.task.mkdir(mode=0o700)
                os.chown(self.task, 1000, 1000)
                (self.task / 'paid.receipt').write_text('preserve replacement')
            return names

        with patch('host_broker.os.listdir', side_effect=replace), self.assertRaises(ValueError):
            pin_bridge(self.inbox, self.bridges, INSTANCE, producer_uid=1000)
        self.assertTrue((original / 'request.json').exists())
        self.assertEqual((self.task / 'paid.receipt').read_text(), 'preserve replacement')
        self.assertFalse((self.bridges / INSTANCE).exists())

    def test_request_inode_replacement_after_notify_preserves_ipc_and_root_receipt(self):
        self.nonroot_producer()
        pin_bridge(self.inbox, self.bridges, INSTANCE, producer_uid=1000)
        request = self.task / 'request.json'
        body = request.read_text()
        events = []

        def run(argv, **_kwargs):
            events.append(argv[1])
            return SimpleNamespace(stdout='ActiveState=inactive\nSubState=dead\nMainPID=0\nControlPID=0\nJob=')

        def notify(_path):
            events.append('notify')
            request.rename(self.root / 'retained-request')
            request.write_text(body); request.chmod(0o600); os.chown(request, 1000, 1000)
            return True

        with self.assertRaises(ValueError):
            cleanup_ended(self.root, INSTANCE, run, notify, producer_uid=1000)
        self.assertEqual(events, ['show', 'notify'])
        self.assertEqual(request.read_text(), body)
        self.assertTrue((self.task / 'worker.sock').exists())
        self.assertTrue((self.bridges / INSTANCE / 'request.json').exists())
        self.assertFalse((self.bridges / INSTANCE / 'ended').exists())

    def test_directory_replacement_after_notify_does_not_clean_or_delete_peer(self):
        self.nonroot_producer()
        pin_bridge(self.inbox, self.bridges, INSTANCE, producer_uid=1000)
        retained = self.root / 'retained-original'
        events = []

        def run(argv, **_kwargs):
            events.append(argv[1])
            return SimpleNamespace(stdout='ActiveState=inactive\nSubState=dead\nMainPID=0\nControlPID=0\nJob=')

        def notify(_path):
            events.append('notify')
            self.task.rename(retained); self.task.mkdir(mode=0o700); os.chown(self.task, 1000, 1000)
            (self.task / 'paid.receipt').write_text('preserve peer')
            return True

        with self.assertRaises(ValueError):
            cleanup_ended(self.root, INSTANCE, run, notify, producer_uid=1000)
        self.assertEqual(events, ['show', 'notify'])
        self.assertEqual((self.task / 'paid.receipt').read_text(), 'preserve peer')
        self.assertTrue((retained / 'request.json').exists())
        self.assertFalse((self.bridges / INSTANCE / 'ended').exists())

    def test_socket_disappearance_during_cleanup_enumeration_is_accepted(self):
        self.nonroot_producer()
        pin_bridge(self.inbox, self.bridges, INSTANCE, producer_uid=1000)
        inode = self.task.stat().st_ino
        located = os.stat
        removed = False

        def disappear(name, *args, dir_fd=None, **kwargs):
            nonlocal removed
            if name == 'worker.sock' and dir_fd is not None and os.fstat(dir_fd).st_ino == inode and not removed:
                removed = True
                (self.task / 'worker.sock').unlink()
            return located(name, *args, dir_fd=dir_fd, **kwargs)

        run = lambda *_args, **_kwargs: SimpleNamespace(stdout='ActiveState=inactive\nSubState=dead\nMainPID=0\nControlPID=0\nJob=')
        with patch('host_broker.os.stat', side_effect=disappear):
            self.assertTrue(cleanup_ended(self.root, INSTANCE, run, lambda _path: True, producer_uid=1000))
        self.assertTrue(removed)
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
