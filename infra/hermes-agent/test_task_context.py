"""Pure native task metadata checks. No Agent, provider, environment file or model request."""
from pathlib import Path
import os
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import task_runtime
from task_agent import NativeTaskStopped
from task_runtime import write_task_model_context


class NativeContextTests(unittest.TestCase):
    def test_startup_fixes_sdk_waits_to_610_after_clearing_inherited_environment(self):
        with patch.dict(os.environ, {'OPENSCIENCE_NATIVE_INSTANCE': 'invalid-fixture',
                'HERMES_API_CALL_STALE_TIMEOUT': '1', 'HERMES_API_TIMEOUT': '1800',
                'UNTRUSTED_PARENT_SETTING': 'discard'}, clear=True), \
                patch.dict(sys.modules, {'httpx': SimpleNamespace()}), patch.object(sys, 'path', list(sys.path)):
            # Reject the fixture identity before any socket/client/model is created.
            with self.assertRaisesRegex(NativeTaskStopped, 'Native unit identity is unavailable'):
                task_runtime.main()
            self.assertEqual(os.environ.get('HERMES_API_CALL_STALE_TIMEOUT'), '610')
            self.assertEqual(os.environ.get('HERMES_API_TIMEOUT'), '610')
            self.assertNotIn('UNTRUSTED_PARENT_SETTING', os.environ)

    def test_writes_only_the_trusted_capacity_and_keeps_native_context_management_enabled(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as folder:
            root = Path(folder)
            write_task_model_context(root, {'contextWindowTokens': 512000})
            self.assertEqual((root/'config.yaml').read_text(), 'model:\n  context_length: 512000\n')

    def test_unknown_model_metadata_uses_the_native_resolver(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as folder:
            root = Path(folder)
            write_task_model_context(root, {})
            self.assertFalse((root/'config.yaml').exists())

    def test_invalid_metadata_cannot_inject_yaml_or_start_a_model(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as folder:
            root = Path(folder)
            for value in [True, -1, 0, 1000001, '512000\napi_key: forbidden']:
                with self.subTest(value=value), self.assertRaises(ValueError):
                    write_task_model_context(root, {'contextWindowTokens': value})
            self.assertFalse((root/'config.yaml').exists())


if __name__ == '__main__':
    unittest.main()
