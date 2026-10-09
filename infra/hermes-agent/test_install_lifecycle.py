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
            if name in {'openscience-synclip-capabilities', 'openscience-research-video'}:
                install.copy_resources(Path(__file__).resolve().parents[2]/'.agents/skills'/name, skills/name)
            else:
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
        self.fail_restore_reload = False; self.reloads = 0
        self.broker_state = 'inactive'; self.instance_rows = ''
        self.missing_timer_active = 'unknown'; self.missing_timer_enabled = 'not-found'
        self.missing_timer_load = 'not-found'; self.restored_timer_active = None
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
        returncode = 0
        timer_exists = (self.units/'openscience-hermes-broker.timer').exists()
        if argv[0] == 'node':
            if any(action in argv for action in ('verify', 'runtime-verify')) and self.verification_seconds > timeout:
                raise subprocess.TimeoutExpired(argv, timeout)
            if '-e' in argv:
                output = json.dumps({'instructions':'fixture scientific method','sourceReviewInstructions':'fixture after-draft review',
                    'nativeEvidenceAlignmentInstructions':'Bind retained measurements to their objects, definitions, comparison and scope.', 'version':5})
        elif argv[1] == 'is-active':
            if argv[2].endswith('.timer'):
                output = ('active' if self.active else 'inactive') if timer_exists else self.missing_timer_active
                if timer_exists and self.reloads > 1 and self.restored_timer_active is not None:
                    output = self.restored_timer_active
                returncode = 0 if output == 'active' else (4 if output == 'unknown' else 3)
            else: output = self.broker_state
        elif argv[1] == 'list-units': output = self.instance_rows
        elif argv[1] == 'is-enabled':
            output = ('enabled' if 'persistent' in self.layers else ('enabled-runtime' if 'runtime' in self.layers else 'disabled')) if timer_exists else self.missing_timer_enabled
            returncode = 0 if output in ('enabled', 'enabled-runtime') else (4 if output == 'not-found' else 1)
        elif argv[1] == 'show': output = 'loaded' if timer_exists else self.missing_timer_load
        elif argv[1] == 'stop':
            if self.fail_stop: raise subprocess.CalledProcessError(1, argv)
            self.active = False
        elif argv[1] == 'enable': self.layers.add('runtime' if '--runtime' in argv else 'persistent')
        elif argv[1] == 'disable': self.layers.clear()
        elif argv[1] == 'start': self.active = True
        elif argv[1] == 'daemon-reload':
            self.reloads += 1
            if self.fail_restore_reload and self.reloads > 1:
                raise subprocess.CalledProcessError(1, argv)
        return SimpleNamespace(stdout=output, returncode=returncode)

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

    def test_failure_after_staging_restores_runtime_enable_then_active(self):
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
        self.assertEqual(self.layers, set())
        self.assertFalse(any(event[:2] == ('systemctl','start') for event in self.events))
        self.assertFalse(any(event[:2] == ('systemctl','enable') for event in self.events))
        self.assertEqual((self.root/'releases'/self.source.name/'runtime/run_agent.py').stat().st_mode & 0o222, 0)
        self.assertTrue(any(event[0] == 'node' and 'runtime-verify' in event for event in self.events))
        runtime = self.root/'releases'/self.source.name/'runtime'
        self.assertEqual(receipt['runtimeId'], 'installed-native-continuation-'+self.source.name)
        self.assertEqual((runtime/'.runtime-id').read_text().strip(), receipt['runtimeId'])
        self.assertIn('OpenScience controlled thinking-only continuation', (runtime/'run_agent.py').read_text())
        self.assertEqual((self.native/'run_agent.py').read_text(), native_fixture_source())

    def test_live_file_updates_happen_only_with_inactive_disabled_timer(self):
        original = Path.write_text
        def observe_write(path, *args, **kwargs):
            if path.parent == self.units or path == self.root/'runtime.env':
                self.assertFalse(self.active)
                self.assertEqual(self.layers, set())
            return original(path, *args, **kwargs)
        with patch.object(Path, 'write_text', observe_write):
            install.install(self.source, self.snapshot)

    def test_file_restoration_failure_does_not_enable_or_start_timer(self):
        original_write = Path.write_text
        original_copy = install.shutil.copy2
        def fail_receipt(path, *args, **kwargs):
            if path.name == 'installation.json': raise OSError('fixture receipt write failed')
            return original_write(path, *args, **kwargs)
        def fail_restore(source, destination, *args, **kwargs):
            if Path(source).parent.name == 'previous': raise OSError('fixture old file restore failed')
            return original_copy(source, destination, *args, **kwargs)
        with patch.object(Path, 'write_text', fail_receipt), patch.object(install.shutil, 'copy2', fail_restore):
            with self.assertRaisesRegex(OSError, 'old file restore failed'):
                install.install(self.source, self.snapshot)
        self.assertFalse(self.active); self.assertEqual(self.layers, set())
        self.assertFalse(any(event[1] in ('enable', 'start') for event in self.events if event[0] == 'systemctl'))

    def test_reload_during_restoration_failure_does_not_enable_or_start_timer(self):
        original = Path.write_text
        def fail_receipt(path, *args, **kwargs):
            if path.name == 'installation.json': raise OSError('fixture receipt write failed')
            return original(path, *args, **kwargs)
        self.fail_restore_reload = True
        with patch.object(Path, 'write_text', fail_receipt), self.assertRaises(subprocess.CalledProcessError):
            install.install(self.source, self.snapshot)
        self.assert_old_files()
        self.assertFalse(self.active); self.assertEqual(self.layers, set())
        self.assertFalse(any(event[1] in ('enable', 'start') for event in self.events if event[0] == 'systemctl'))

    def test_catalogue_exposes_shared_evidence_alignment_through_restricted_skill_read(self):
        from task_agent import SkillScope
        install.install(self.source, self.snapshot)
        catalogue=self.root/'releases'/self.source.name/'catalogue'
        resource='references/source-evidence-alignment.md'
        scope=SkillScope(catalogue)
        reference=scope.resolve('scientific-critical-thinking',resource)
        self.assertEqual(reference.read_text(), 'Bind retained measurements to their objects, definitions, comparison and scope.\n')
        self.assertIn(resource, scope.resolve('scientific-critical-thinking').read_text())
        source_method=scope.resolve('openscience-source-review').read_text()
        self.assertIn('without peer-reviewing the paper', source_method)
        self.assertIn('separately requested critical assessment', source_method)
        # Verify installation fidelity through the restricted reader, not a
        # historical capability statement that changes as adapters are added.
        for name in ('openscience-synclip-capabilities', 'openscience-research-video'):
            with self.subTest(skill=name):
                source = self.source/'.agents/skills'/name/'SKILL.md'
                installed = scope.resolve(name)
                self.assertEqual(installed.read_bytes(), source.read_bytes())
                self.assertEqual(installed.stat().st_mode & 0o222, 0)
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

    def prepare_late_restore(self, absent=False):
        if absent:
            for name in install.UNIT_NAMES: (self.units/name).unlink()
            (self.root/'runtime.env').unlink()
            self.layers.clear(); self.active = False
        else:
            (self.root/'runtime.env').write_text(
                'HERMES_NATIVE_AGENT_ENABLED=true\n'
                'HERMES_NATIVE_RUNTIME_ID=installed-native-previous-observed\n'
                'HERMES_NATIVE_SKILL_CATALOGUE_ID=project-catalogue-previous-observed\n'
                'HERMES_NATIVE_AGENT_MODEL=MiniMax-M3\n'
                'HERMES_NATIVE_AGENT_INBOX=/native-agent/inbox\n')
            (self.root/'runtime.env').chmod(0o600)
        paths = [*(self.units/name for name in install.UNIT_NAMES), self.root/'runtime.env']
        self.previous_contents = {path: path.read_bytes() if path.exists() else None for path in paths}
        self.previous_modes = {path: path.stat().st_mode & 0o777 for path in paths if path.exists()}
        install.install(self.source, self.snapshot)
        self.install_release = self.root/'releases'/self.source.name
        self.candidate_contents = {path: path.read_bytes() for path in paths}
        self.events.clear()

    def assert_candidate_unchanged(self):
        for path, value in self.candidate_contents.items(): self.assertEqual(path.read_bytes(), value)

    def assert_no_producer_start(self):
        self.assertFalse(self.active); self.assertEqual(self.layers, set())
        self.assertFalse(any(event[1] in ('enable', 'start') for event in self.events if event[0] == 'systemctl'))

    def test_late_restore_recovers_exact_files_modes_and_observed_ids_without_start(self):
        self.prepare_late_restore()
        result = install.restore_previous(self.source.name)
        self.assertEqual(result, {'releaseSha': self.source.name, 'restored': True, 'timerDeferred': True,
            'previousRuntimeId': 'installed-native-previous-observed',
            'previousSkillCatalogueId': 'project-catalogue-previous-observed'})
        for path, value in self.previous_contents.items():
            self.assertEqual(path.read_bytes(), value)
            self.assertEqual(path.stat().st_mode & 0o777, self.previous_modes[path])
        self.assert_no_producer_start()
        self.assertTrue((self.install_release/'runtime').is_dir())
        self.assertTrue((self.install_release/'previous/state.json').is_file())

    def test_late_restore_null_ids_only_for_recorded_original_absence(self):
        self.prepare_late_restore(absent=True)
        result = install.restore_previous(self.source.name)
        self.assertIsNone(result['previousRuntimeId']); self.assertIsNone(result['previousSkillCatalogueId'])
        for path in self.previous_contents: self.assertFalse(path.exists())
        self.assert_no_producer_start()

    def test_late_restore_accepts_inactive_missing_timer_and_empty_failed_enable_output(self):
        self.prepare_late_restore(absent=True)
        self.missing_timer_active = 'inactive'; self.missing_timer_enabled = ''
        result = install.restore_previous(self.source.name)
        self.assertTrue(result['restored']); self.assertIsNone(result['previousRuntimeId'])
        self.assert_no_producer_start()

    def test_late_restore_does_not_accept_absence_without_manager_load_evidence(self):
        self.prepare_late_restore(absent=True)
        self.missing_timer_load = 'loaded'
        with self.assertRaises(ValueError): install.restore_previous(self.source.name)
        self.assert_no_producer_start()

    def test_late_restore_does_not_accept_empty_successful_enable_output(self):
        self.prepare_late_restore(absent=True)
        def command(argv, check=True, timeout=120):
            result = self.command(argv, check, timeout)
            if argv[1] == 'is-enabled' and not (self.units/'openscience-hermes-broker.timer').exists():
                return SimpleNamespace(stdout='', returncode=0)
            return result
        with patch.object(install, 'command', command):
            with self.assertRaises(ValueError): install.restore_previous(self.source.name)
        self.assert_no_producer_start()

    def test_late_restore_does_not_accept_an_active_missing_timer(self):
        self.prepare_late_restore(absent=True)
        self.missing_timer_active = 'active'
        with self.assertRaises(ValueError): install.restore_previous(self.source.name)
        self.assert_no_producer_start()

    def test_late_restore_existing_timer_still_requires_inactive_or_failed(self):
        self.prepare_late_restore()
        self.restored_timer_active = 'unknown'
        with self.assertRaises(ValueError): install.restore_previous(self.source.name)
        self.assert_no_producer_start()

    def test_installer_private_records_and_recovery_ignore_permissive_umask(self):
        previous_umask = os.umask(0o002)
        try:
            self.prepare_late_restore()
        finally:
            os.umask(previous_umask)
        for path in (self.root/'install.lock', self.install_release/'previous/state.json',
                     self.install_release/'installation.json'):
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.assertEqual((self.root/'releases').stat().st_mode & 0o022, 0)
        self.assertTrue(install.restore_previous(self.source.name)['restored'])
        self.assert_no_producer_start()

    def test_late_restore_accepts_only_known_partial_or_already_restored_files(self):
        self.prepare_late_restore()
        first = install.UNIT_NAMES[0]
        install.shutil.copy2(self.install_release/'previous'/first, self.units/first)
        first_result = install.restore_previous(self.source.name)
        self.assertEqual(install.restore_previous(self.source.name), first_result)
        self.assert_no_producer_start()

    def test_late_restore_prevalidates_the_last_fixed_file_before_any_write(self):
        self.prepare_late_restore()
        env = self.root/'runtime.env'; env.write_text('foreign live configuration')
        expected = {path: path.read_bytes() for path in self.candidate_contents}
        with self.assertRaises(ValueError): install.restore_previous(self.source.name)
        for path, value in expected.items(): self.assertEqual(path.read_bytes(), value)
        self.assertEqual(self.events, [])

    def test_late_restore_rejects_missing_recorded_backup_before_any_write(self):
        self.prepare_late_restore()
        (self.install_release/'previous/runtime.env').unlink()
        with self.assertRaises((ValueError, OSError)): install.restore_previous(self.source.name)
        self.assert_candidate_unchanged(); self.assertEqual(self.events, [])

    def test_late_restore_rejects_backup_conflicting_with_recorded_absence(self):
        self.prepare_late_restore(absent=True)
        (self.install_release/'previous/runtime.env').write_text('unexpected backup')
        with self.assertRaises(ValueError): install.restore_previous(self.source.name)
        self.assert_candidate_unchanged(); self.assertEqual(self.events, [])

    def test_late_restore_rejects_live_symlink_before_any_write(self):
        self.prepare_late_restore()
        env = self.root/'runtime.env'; target = self.root/'unrelated.env'
        target.write_bytes(env.read_bytes()); env.unlink(); env.symlink_to(target)
        with self.assertRaises(ValueError): install.restore_previous(self.source.name)
        self.assertTrue(env.is_symlink()); self.assertEqual(self.events, [])

    def test_late_restore_rejects_missing_or_duplicate_identity_keys(self):
        self.prepare_late_restore()
        env = self.install_release/'previous/runtime.env'; original = env.read_text()
        for changed in (original.replace('HERMES_NATIVE_RUNTIME_ID=installed-native-previous-observed\n', ''),
                        original + 'HERMES_NATIVE_RUNTIME_ID=installed-native-previous-observed\n',
                        original.replace('HERMES_NATIVE_SKILL_CATALOGUE_ID=project-catalogue-previous-observed\n', ''),
                        original + 'HERMES_NATIVE_SKILL_CATALOGUE_ID=project-catalogue-previous-observed\n',
                        original.replace('HERMES_NATIVE_RUNTIME_ID=installed-native-previous-observed', 'HERMES_NATIVE_RUNTIME_ID=')):
            with self.subTest(configuration=changed):
                env.write_text(changed)
                with self.assertRaises(ValueError): install.restore_previous(self.source.name)
                self.assert_candidate_unchanged(); self.assertEqual(self.events, [])

    def test_late_restore_rejects_invalid_receipt_and_backup_flags(self):
        self.prepare_late_restore()
        receipt = self.install_release/'installation.json'; original = receipt.read_text()
        receipt.write_text(original.rstrip()[:-1] + ', "releaseSha": "' + self.source.name + '"}')
        with self.assertRaises(ValueError): install.restore_previous(self.source.name)
        changed = json.loads(original); changed['releaseSha'] = 'c'*40
        receipt.write_text(json.dumps(changed))
        with self.assertRaises(ValueError): install.restore_previous(self.source.name)
        receipt.write_text(original)
        state = self.install_release/'previous/state.json'; changed = json.loads(state.read_text())
        changed['files']['runtime.env'] = 1
        state.write_text(json.dumps(changed))
        with self.assertRaises(ValueError): install.restore_previous(self.source.name)
        self.assert_candidate_unchanged(); self.assertEqual(self.events, [])

    def test_late_restore_rejects_unsafe_backup_mode_before_any_write(self):
        self.prepare_late_restore()
        (self.install_release/'previous'/install.UNIT_NAMES[-1]).chmod(0o666)
        with self.assertRaises(ValueError): install.restore_previous(self.source.name)
        self.assert_candidate_unchanged(); self.assertEqual(self.events, [])

    def test_late_restore_refuses_broker_instance_or_inbox_work(self):
        self.prepare_late_restore()
        for busy in ('broker', 'instance', 'inbox'):
            with self.subTest(busy=busy):
                self.broker_state = 'deactivating' if busy == 'broker' else 'inactive'
                self.instance_rows = 'an active native instance' if busy == 'instance' else ''
                pending = self.root/'inbox/pending'; pending.unlink(missing_ok=True)
                if busy == 'inbox': pending.write_text('preserved pending request')
                with self.assertRaises(ValueError): install.restore_previous(self.source.name)
                self.assert_candidate_unchanged(); self.assert_no_producer_start()
                if busy == 'inbox': self.assertEqual(pending.read_text(), 'preserved pending request')

    def test_late_restore_copy_or_reload_failure_does_not_start(self):
        self.prepare_late_restore()
        with patch.object(install.shutil, 'copy2', side_effect=OSError('fixture late restore copy failed')):
            with self.assertRaisesRegex(OSError, 'late restore copy'): install.restore_previous(self.source.name)
        self.assert_candidate_unchanged(); self.assert_no_producer_start()
        self.fail_restore_reload = True
        with self.assertRaises(subprocess.CalledProcessError): install.restore_previous(self.source.name)
        self.assert_no_producer_start()

    def test_restore_cli_dispatches_only_restore_and_rejects_snapshot(self):
        import contextlib
        import io
        result = {'releaseSha': self.source.name, 'restored': True, 'timerDeferred': True,
                  'previousRuntimeId': 'old-runtime', 'previousSkillCatalogueId': 'old-catalogue'}
        output = io.StringIO()
        with patch.object(install, 'restore_previous', return_value=result) as restore, \
             patch.object(install, 'install') as installing, contextlib.redirect_stdout(output):
            install.main(['--restore-previous', self.source.name])
        restore.assert_called_once_with(self.source.name); installing.assert_not_called()
        self.assertEqual(json.loads(output.getvalue()), result)
        installation_receipt = {'releaseSha': self.source.name, 'runtimeId': 'new-runtime',
                                'skillCatalogueId': 'new-catalogue', 'timerDeferred': True}
        output = io.StringIO()
        with patch.object(install, 'install', return_value=installation_receipt) as installing, \
             patch.object(install, 'restore_previous') as restore, contextlib.redirect_stdout(output):
            install.main(['--source', str(self.source), '--runtime-snapshot', str(self.snapshot)])
        installing.assert_called_once_with(self.source, self.snapshot, True); restore.assert_not_called()
        self.assertEqual(json.loads(output.getvalue()), installation_receipt)
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            install.main(['--restore-previous', self.source.name, '--runtime-snapshot', str(self.snapshot)])


if __name__ == '__main__': unittest.main()
