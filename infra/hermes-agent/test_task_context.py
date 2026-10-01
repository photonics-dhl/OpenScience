"""Pure native task metadata checks. No Agent, provider, environment file or model request."""
from pathlib import Path
import tempfile
import unittest
from task_runtime import write_task_model_context


class NativeContextTests(unittest.TestCase):
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
