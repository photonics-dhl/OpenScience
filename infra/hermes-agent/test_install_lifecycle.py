"""Exercise the installer with real temporary files and a simulated service manager only."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from test_sdk_compat import native_fixture_source
if os.name == 'posix':
    import install


@unittest.skipUnless(os.name == 'posix' and hasattr(os, 'geteuid') and os.geteuid() == 0, 'Requires Linux root-owned temporary files')
class InstallLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path.cwd(), prefix='native-install-')
        self.folder = Path(self.temp.name).resolve()
        self.root = self.folder/'native-root'; self.root.mkdir(mode=0o755)
        self.releases = self.folder/'app-releases'; self.releases.mkdir()
        self.source = self.releases/('a'*40); self.source.mkdir()
        adapter = self.source/'infra/hermes-agent'; adapter.mkdir(parents=True)
        for name in (*install.UNIT_NAMES, 'task_agent.py', 'task_runtime.py', 'host_broker.py'):
            (adapter/name).write_text('fixture new resource')
        install.copy_resources(Path(__file__).resolve().parent/'science-references', adapter/'science-references')
        skills = self.source/'.agents/skills'; skills.mkdir(parents=True)
        for name in install.ART_SKILLS:
            (skills/name).mkdir(); (skills/name/'SKILL.md').write_text('fixture art resource')
        self.native = self.folder/'installed-agent'; self.native.mkdir()
        (self.native/'run_agent.py').write_text(native_fixture_source(), encoding='utf-8')
        (self.native/'pyproject.toml').write_text('[project]\nversion = "0.10.0"\n', encoding='utf-8')
        python = self.native/'.venv/bin/python'; python.parent.mkdir(parents=True)
        python.write_text('fixture existing interpreter'); python.chmod(0o755)
        (self.native/'skills').mkdir(); (self.native/'skills/method.md').write_text('fixture installed skill')
        self.units = self.folder/'units'; self.units.mkdir()
        for name in install.UNIT_NAMES: (self.units/name).write_text('old '+name)
        (self.root/'runtime.env').write_text('old nonsecret configuration')
        self.snapshot = self.folder/'runtime-snapshot.json'; self.snapshot.write_text('{}'); self.snapshot.chmod(0o400)
        self.layers = {'runtime'}; self.active = True; self.events = []
        self.fail_stop = False; self.fail_copy = False
        self.patches = [patch.object(install, k, v) for k,v in {'ROOT':self.root,'NATIVE':self.native,'RELEASES':self.releases,'SYSTEMD_UNITS':self.units}.items()]
        for item in self.patches: item.start()
        self.command_patch = patch.object(install, 'command', self.command); self.command_patch.start()
        self.verification_seconds = 0

    def tearDown(self):
        self.command_patch.stop()
        for item in reversed(self.patches): item.stop()
        # The actual installer freezes its copies; only this owned completed fixture is unfrozen.
        for directory, dirs, files in os.walk(self.folder):
            Path(directory).chmod(0o700)
            for name in files:
                file = Path(directory)/name
                if not file.is_symlink(): file.chmod(0o600)
        self.temp.cleanup()

    def command(self, argv, check=True, timeout=120):
        self.events.append(tuple(argv))
        output = ''
        if argv[0] == 'node':
            if any(action in argv for action in ('verify', 'runtime-verify')) and self.verification_seconds > timeout:
                raise subprocess.TimeoutExpired(argv, timeout)
            if '-e' in argv:
                output = json.dumps({'instructions':'fixture scientific method','sourceReviewInstructions':'fixture after-draft review',
                    'nativeEvidenceAlignmentInstructions':'Bind retained measurements to their objects, definitions, comparison and scope.', 'version':5})
        elif argv[1] == 'is-active':
            output = ('active' if self.active else 'inactive') if argv[2].endswith('.timer') else 'inactive'
        elif argv[1] == 'is-enabled':
            output = 'enabled' if 'persistent' in self.layers else ('enabled-runtime' if 'runtime' in self.layers else 'disabled')
        elif argv[1] == 'show': output = 'loaded'
        elif argv[1] == 'stop':
            if self.fail_stop: raise subprocess.CalledProcessError(1, argv)
            self.active = False
        elif argv[1] == 'enable': self.layers.add('runtime' if '--runtime' in argv else 'persistent')
        elif argv[1] == 'disable': self.layers.clear()
        elif argv[1] == 'start': self.active = True
        return SimpleNamespace(stdout=output, returncode=0)

    def assert_old_files(self):
        for name in install.UNIT_NAMES: self.assertEqual((self.units/name).read_text(), 'old '+name)
        self.assertEqual((self.root/'runtime.env').read_text(), 'old nonsecret configuration')

    def test_full_source_and_runtime_verification_can_finish_beyond_command_default(self):
        self.verification_seconds = 200
        receipt = install.install(self.source, self.snapshot)
        self.assertTrue(receipt['timerDeferred'])
        self.assertFalse(self.active)

    def test_verifier_timeout_remains_bounded_and_precedes_install_mutations(self):
        self.verification_seconds = 1000
        with self.assertRaises(subprocess.TimeoutExpired):
            install.install(self.source, self.snapshot)
        self.assert_old_files()
        self.assertTrue(self.active)
        self.assertFalse((self.root/'releases').exists())
        self.assertFalse(any(event[0] == 'systemctl' for event in self.events))

    def test_failure_after_permanent_enable_restores_runtime_enable_then_active(self):
        original = Path.write_text
        def fail_receipt(path, *args, **kwargs):
            if path.name == 'installation.json': raise OSError('fixture receipt write failed')
            return original(path, *args, **kwargs)
        with patch.object(Path,'write_text',fail_receipt), self.assertRaisesRegex(OSError,'receipt write'):
            install.install(self.source,self.snapshot)
        self.assert_old_files()
        self.assertEqual(self.layers, {'runtime'})
        self.assertTrue(self.active)
        self.assertEqual(self.events[-1], ('systemctl','start','openscience-hermes-broker.timer'))

    def test_stop_failure_aborts_before_any_release_or_unit_write(self):
        self.fail_stop = True
        with self.assertRaises(subprocess.CalledProcessError): install.install(self.source,self.snapshot)
        self.assert_old_files()
        self.assertFalse((self.root/'releases').exists())
        self.assertEqual(self.layers, {'runtime'})

    def test_resource_copy_failure_restores_files_and_service_state(self):
        with patch.object(install,'copy_resources',side_effect=OSError('fixture copy failed')), self.assertRaisesRegex(OSError,'copy failed'):
            install.install(self.source,self.snapshot)
        self.assert_old_files(); self.assertEqual(self.layers, {'runtime'}); self.assertTrue(self.active)

    def test_success_is_staged_and_does_not_start_the_timer(self):
        receipt = install.install(self.source,self.snapshot)
        self.assertTrue(receipt['timerDeferred']); self.assertFalse(self.active)
        self.assertFalse(any(event[:2] == ('systemctl','start') for event in self.events))
        self.assertEqual((self.root/'releases'/self.source.name/'runtime/run_agent.py').stat().st_mode & 0o222, 0)
        self.assertTrue(any(event[0] == 'node' and 'runtime-verify' in event for event in self.events))
        runtime = self.root/'releases'/self.source.name/'runtime'
        self.assertEqual(receipt['runtimeId'], 'installed-native-continuation-'+self.source.name)
        self.assertEqual((runtime/'.runtime-id').read_text().strip(), receipt['runtimeId'])
        self.assertIn('OpenScience controlled thinking-only continuation', (runtime/'run_agent.py').read_text())
        self.assertEqual((self.native/'run_agent.py').read_text(), native_fixture_source())

    def test_catalogue_exposes_shared_evidence_alignment_through_restricted_skill_read(self):
        from task_agent import SkillScope
        install.install(self.source, self.snapshot)
        catalogue=self.root/'releases'/self.source.name/'catalogue'
        resource='references/source-evidence-alignment.md'
        scope=SkillScope(catalogue)
        reference=scope.resolve('scientific-critical-thinking',resource)
        self.assertEqual(reference.read_text(), 'Bind retained measurements to their objects, definitions, comparison and scope.\n')
        self.assertIn(resource, scope.resolve('scientific-critical-thinking').read_text())
        self.assertIn(resource, scope.resolve('openscience-source-review').read_text())
        self.assertEqual(reference.stat().st_mode & 0o222, 0)
        self.assertFalse(self.active)

    def test_unknown_sdk_layout_rejects_before_runtime_identity_and_restores_existing_installation(self):
        (self.native/'run_agent.py').write_text('print("unknown upstream layout")\n')
        with self.assertRaisesRegex(ValueError, 'flow anchor'):
            install.install(self.source, self.snapshot)
        self.assert_old_files()
        self.assertTrue(self.active)
        self.assertEqual(self.layers, {'runtime'})
        self.assertFalse((self.root/'releases'/self.source.name/'runtime/.runtime-id').exists())


if __name__ == '__main__': unittest.main()
