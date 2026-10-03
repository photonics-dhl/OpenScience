import importlib.util
import io
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('configure_key', Path(__file__).with_name('configure-key.py'))
configure = importlib.util.module_from_spec(spec)
spec.loader.exec_module(configure)


class CredentialInputTests(unittest.TestCase):
    def test_accepts_only_one_printable_credential(self):
        self.assertEqual(configure.parse_key(b'{"apiKey":"fixture-key"}'), b'fixture-key')
        for value in [b'{}', b'[]', b'{"apiKey":""}', b'{"apiKey":"space key"}',
                      b'{"apiKey":"line\\nkey"}', b'{"apiKey":42}', b'{"apiKey":"fixture","extra":1}', b'x' * 8193]:
            with self.assertRaises((ValueError, TypeError)):
                configure.parse_key(value)

    def test_never_overwrites_or_reports_a_credential_after_failure(self):
        for failure in [FileExistsError('fixture-key'), OSError('fixture-key')]:
            stdout, stderr = io.StringIO(), io.StringIO()
            with patch.object(configure, 'write_key', side_effect=failure) as write, \
                    patch.object(configure.sys, 'stdin', type('Input', (), {'buffer': io.BytesIO(b'{"apiKey":"fixture-key"}')})()), \
                    patch.object(configure.sys, 'stdout', stdout), patch.object(configure.sys, 'stderr', stderr):
                self.assertNotEqual(configure.main(), 0)
                write.assert_called_once()
            self.assertNotIn('fixture-key', stdout.getvalue() + stderr.getvalue())

    def test_success_reports_storage_only_and_never_key_contents(self):
        stdout = io.StringIO()
        with patch.object(configure, 'write_key') as write, \
                patch.object(configure.sys, 'stdin', type('Input', (), {'buffer': io.BytesIO(b'{"apiKey":"fixture-key"}')})()), \
                patch.object(configure.sys, 'stdout', stdout):
            self.assertEqual(configure.main(), 0)
            write.assert_called_once_with(Path('/opt/openscience-synclip'), b'fixture-key')
        self.assertIn('"providerEnabled": false', stdout.getvalue())
        self.assertIn('"providerCalls": 0', stdout.getvalue())
        self.assertNotIn('fixture-key', stdout.getvalue())


if __name__ == '__main__':
    unittest.main()
