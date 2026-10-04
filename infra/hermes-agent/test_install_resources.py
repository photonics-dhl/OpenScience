"""Immutable resource closure tests only; never invokes installer/systemd/provider."""
import os
from pathlib import Path
import tempfile
import unittest
if os.name == 'posix':
    from install import copy_resources, close_symlinks, freeze, write_science_skills
    from task_agent import SkillScope


@unittest.skipUnless(os.name == 'posix', 'Installer targets Linux')
class InstallResourceTests(unittest.TestCase):
    def test_native_entry_uses_executable_method_instead_of_static_projection(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as folder:
            root = Path(folder).resolve(); source = root/'source'
            copy_resources(Path(__file__).resolve().parent/'science-references', source/'infra'/'hermes-agent'/'science-references')
            method = {'version': 'fixture', 'instructions': 'STATIC_SYNTHESIS_ONLY',
                      'sourceReviewInstructions': 'STATIC_REVIEW_ONLY',
                      'nativeInstructions': 'NATIVE_APPRAISAL_STEPS\nSHARED_SOURCE_ALIGNMENT',
                      'nativeEvidenceAlignmentInstructions': 'SHARED_SOURCE_ALIGNMENT',
                      'nativeSourceReviewInstructions': 'NATIVE_COMPARE_SAVED_DRAFT'}
            write_science_skills(source, root/'catalogue', method)
            scope = SkillScope(root/'catalogue')
            primary = scope.resolve('scientific-critical-thinking').read_text()
            review = scope.resolve('openscience-source-review').read_text()
            self.assertIn('NATIVE_APPRAISAL_STEPS', primary)
            self.assertEqual(primary.count('SHARED_SOURCE_ALIGNMENT'), 1)
            self.assertIn('NATIVE_COMPARE_SAVED_DRAFT', review)
            self.assertNotIn('STATIC_SYNTHESIS_ONLY', primary)
            self.assertNotIn('STATIC_REVIEW_ONLY', review)
            self.assertEqual(scope.resolve('scientific-critical-thinking', 'references/source-evidence-alignment.md').read_text(),
                             'SHARED_SOURCE_ALIGNMENT\n')
            self.assertEqual(scope.resolve('scientific-critical-thinking', 'upstream/critical-thinking-method.md').read_bytes(),
                             (source/'infra'/'hermes-agent'/'science-references'/'critical-thinking-method.md').read_bytes())

    def test_installed_science_reference_is_complete_independent_and_readonly(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as folder:
            root = Path(folder).resolve(); source = root/'source'
            resources = source/'infra'/'hermes-agent'/'science-references'
            copy_resources(Path(__file__).resolve().parent/'science-references', resources)
            (resources/'.env').write_text('excluded fixture')
            catalogue = root/'catalogue'
            method = {'version': 'fixture', 'instructions': 'Retained understanding method',
                      'nativeEvidenceAlignmentInstructions': 'Retained shared source alignment',
                      'sourceReviewInstructions': 'Retained review method'}
            write_science_skills(source, catalogue, method)
            scope = SkillScope(catalogue)
            primary = scope.resolve('scientific-critical-thinking')
            reference = scope.resolve('scientific-critical-thinking', 'upstream/references/logical_fallacies.md')
            original = (resources/'references'/'logical_fallacies.md').read_bytes()
            self.assertGreater(len(original), 10_000)
            self.assertEqual(reference.read_bytes(), original)
            self.assertIn('Retained understanding method', primary.read_text())
            self.assertIn('references/', primary.read_text())
            self.assertIn('Retained review method', scope.resolve('openscience-source-review').read_text())
            self.assertFalse((reference.parent/'.env').exists())
            close_symlinks(catalogue, source); freeze(catalogue)
            (resources/'references'/'logical_fallacies.md').write_text('Changed source')
            self.assertEqual(reference.read_bytes(), original)
            self.assertEqual(reference.stat().st_mode & 0o222, 0)

    def test_existing_source_link_becomes_an_independent_snapshot_reference(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as folder:
            root = Path(folder).resolve(); source = root/'source'; source.mkdir()
            (source/'method.py').write_text('original method')
            (source/'link.py').symlink_to(source/'method.py')
            (source/'.env').write_text('fixture excluded')
            target = root/'snapshot'; copy_resources(source,target)
            close_symlinks(target,source); freeze(target)
            (source/'method.py').write_text('mutated source')
            self.assertEqual((target/'link.py').read_text(),'original method')
            self.assertFalse((target/'.env').exists())
            self.assertEqual((target/'method.py').stat().st_mode & 0o222,0)

    def test_unmounted_external_link_cannot_survive_freezing(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as folder:
            root=Path(folder).resolve(); source=root/'source'; source.mkdir()
            outside=root/'unmounted'; outside.write_text('fixture outside resource closure')
            (source/'external.py').symlink_to(outside)
            target=root/'snapshot'; copy_resources(source,target)
            with self.assertRaises(ValueError): close_symlinks(target,source)
            self.assertTrue(outside.exists())


if __name__ == '__main__':
    unittest.main()
