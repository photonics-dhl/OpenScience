import importlib.util
import os
import re
import unittest
import sys
from pathlib import Path
import tempfile

PROJECT = Path(__file__).resolve().parents[2]
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('monitor_view', Path(__file__).with_name('prepare-monitor-view.py'))
view = importlib.util.module_from_spec(spec)
spec.loader.exec_module(view)
MOUNTINFO = '42 1 8:1 / / rw,relatime shared:2 - ext4 /dev/vda1 rw\n43 42 0:9 / /run rw - tmpfs tmpfs rw\n'


def mount_sources(text):
    service = text.split('\n  netdata:\n', 1)[1].split('\n  vnstat:\n', 1)[0]
    return set(re.findall(r'^\s+source: (\S+)\s*$', service, re.M)) | set(re.findall(r'^\s+- (/[^:]*):', service, re.M))


def reject_host_aliases(text):
    permitted = {'/opt/monitor/root-filesystem', '/opt/monitor/root-mountinfo', '/opt/monitor/msmtprc',
                 '/proc/stat', '/proc/meminfo', '/proc/vmstat', '/proc/diskstats', '/proc/loadavg', '/proc/uptime',
                 '/proc/net/dev', '/sys/devices/system/cpu', '/etc/localtime', '/etc/os-release'}
    sources = mount_sources(text)
    if not sources <= permitted:
        raise ValueError('host directory/socket/proc root alias exposed')


class MonitorView(unittest.TestCase):
    def fixture(self):
        parent = PROJECT / 'tmp' / 'architecture-remediation'
        parent.mkdir(parents=True, exist_ok=True)
        root = Path(tempfile.mkdtemp(prefix='monitor-view-', dir=parent))
        mountinfo = root / 'host-mountinfo.fixture'
        mountinfo.write_text(MOUNTINFO, encoding='utf-8')
        monitor = root / 'monitor'
        monitor.mkdir(mode=0o700)
        return monitor, mountinfo, os.getuid() if hasattr(os, 'getuid') else 0

    def test_probe_is_empty_same_device_and_root_record_targets_only_capacity_path(self):
        monitor, mountinfo, uid = self.fixture()
        view.prepare(monitor, monitor, mountinfo, uid)
        self.assertEqual(list((monitor / view.PROBE).iterdir()), [])
        record = (monitor / view.METADATA).read_text(encoding='utf-8')
        self.assertEqual(record, '42 1 8:1 / /host/root rw,relatime - ext4 /dev/vda1 rw\n')
        self.assertNotIn('/run', record)
        view.check(monitor, monitor, mountinfo, uid)

    def test_nonempty_probe_is_refused_without_deleting_payload_or_publishing_metadata(self):
        monitor, mountinfo, uid = self.fixture()
        probe = monitor / view.PROBE
        probe.mkdir(mode=0o755)
        (probe / 'docker.sock').write_text('socket-alias-fixture')
        if os.name != 'nt': probe.chmod(0o555)
        with self.assertRaises(ValueError): view.prepare(monitor, monitor, mountinfo, uid)
        self.assertEqual((probe / 'docker.sock').read_text(), 'socket-alias-fixture')
        self.assertFalse((monitor / view.METADATA).exists())

    def test_other_device_is_refused(self):
        monitor, mountinfo, uid = self.fixture()
        view.prepare(monitor, monitor, mountinfo, uid)
        class OtherDevice:
            def stat(self):
                class Info: st_dev = (monitor / view.PROBE).stat().st_dev + 1
                return Info()
        with self.assertRaises(ValueError): view.check(monitor, OtherDevice(), mountinfo, uid)

    def test_changed_mount_metadata_fails_readonly_check(self):
        monitor, mountinfo, uid = self.fixture()
        view.prepare(monitor, monitor, mountinfo, uid)
        mountinfo.write_text(MOUNTINFO.replace('8:1', '8:2'), encoding='utf-8')
        with self.assertRaises(ValueError): view.check(monitor, monitor, mountinfo, uid)

    def test_ambiguous_or_missing_root_record_is_refused(self):
        for text in ('', MOUNTINFO + MOUNTINFO):
            with self.assertRaises(ValueError): view.root_mount_metadata(text)

    @unittest.skipIf(os.name == 'nt', 'file/directory symlink privilege unavailable on Windows fixture host')
    def test_symlink_probe_is_refused_without_following_or_replacing_it(self):
        monitor, mountinfo, uid = self.fixture()
        other = monitor.parent / 'unrelated'
        other.mkdir(mode=0o555)
        (monitor / view.PROBE).symlink_to(other, target_is_directory=True)
        with self.assertRaises(ValueError): view.prepare(monitor, monitor, mountinfo, uid)
        self.assertTrue((monitor / view.PROBE).is_symlink())
        self.assertFalse((monitor / view.METADATA).exists())

    def test_compose_has_no_full_root_runtime_socket_or_proc_magic_link_view(self):
        compose = (PROJECT / 'infra/compose/docker-compose.monitor.yml').read_text(encoding='utf-8')
        reject_host_aliases(compose)
        self.assertIn('/opt/monitor/root-filesystem', mount_sources(compose))
        self.assertIn('/proc/net/dev', mount_sources(compose))
        # Concrete old bypasses must fail the source-level check, even when ro:
        # /host/root/run/docker.sock and /host/proc/<pid>/root/run/docker.sock.
        for safe, hostile in [('/opt/monitor/root-filesystem', '/'), ('/proc/stat', '/proc'), ('/proc/stat', '/proc/1/root'), ('/proc/stat', '/run')]:
            with self.assertRaises(ValueError): reject_host_aliases(compose.replace('source: ' + safe, 'source: ' + hostile))

    @unittest.skipIf(os.name == 'nt', 'Linux statvfs/permissions and symlink semantics require POSIX CI')
    def test_posix_probe_has_rootfs_statvfs_without_host_file_access(self):
        monitor, mountinfo, uid = self.fixture()
        view.prepare(monitor, Path('/'), mountinfo, uid)
        probe = monitor / view.PROBE
        self.assertEqual(os.statvfs(probe).f_blocks, os.statvfs('/').f_blocks)
        self.assertEqual(probe.stat().st_mode & 0o777, 0o555)
        self.assertEqual((monitor / view.METADATA).stat().st_mode & 0o777, 0o644)
        self.assertFalse((probe / 'run/docker.sock').exists())


if __name__ == '__main__':
    unittest.main()
