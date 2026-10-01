"""Immutable resource closure tests only; never invokes installer/systemd/provider."""
import os
from pathlib import Path
import tempfile
import unittest
if os.name == 'posix':
    from install import copy_resources, close_symlinks, freeze


@unittest.skipUnless(os.name == 'posix', 'Installer targets Linux')
class InstallResourceTests(unittest.TestCase):
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
