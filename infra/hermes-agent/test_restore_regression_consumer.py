"""Validate only the CI consumer predicates; this is not Linux lifecycle evidence."""
from copy import deepcopy
import contextlib
import io
import unittest
from unittest.mock import patch
from verify_restore_regression import RED_TESTS, main, strict_green, strict_red


def valid_red():
    records = []
    for name, (message, function, path, mode, kind) in RED_TESTS.items():
        records.append({'test': name, 'exceptionType': 'builtins.ValueError', 'message': message,
            'guard': {'function': function, 'path': path, 'mode': mode, 'kind': kind, 'uid': 0, 'gid': 0}})
    return {'testsRun': 2, 'errors': 2, 'failures': 0, 'skipped': 0, 'expectedFailures': 0,
            'unexpectedSuccesses': 0, 'errorRecords': records}


class ConsumerAcceptanceTests(unittest.TestCase):
    def test_cli_requires_explicit_full_candidate_sha(self):
        for args in ([], ['--candidate', 'main'], ['--candidate', 'a'*39]):
            with self.subTest(args=args), patch('sys.argv', ['consumer', *args]), \
                 contextlib.redirect_stderr(io.StringIO()) as error:
                with self.assertRaises(SystemExit) as raised:
                    main()
                self.assertEqual(raised.exception.code, 2)
                self.assertIn('--candidate', error.getvalue())

    def test_accepts_only_exact_recorded_baseline_errors(self):
        self.assertTrue(strict_red(valid_red(), 1))

    def test_rejects_wrong_exit_test_count_skip_failure_or_error_count(self):
        self.assertFalse(strict_red(valid_red(), 0))
        for key, value in (('testsRun', 1), ('errors', 1), ('failures', 1), ('skipped', 1),
                           ('expectedFailures', 1), ('unexpectedSuccesses', 1)):
            with self.subTest(key=key):
                packet = valid_red(); packet[key] = value
                self.assertFalse(strict_red(packet, 1))

    def test_rejects_import_fixture_and_wrong_guard_errors(self):
        for change in ('import', 'fixture', 'function', 'path', 'mode', 'kind', 'owner', 'duplicate'):
            with self.subTest(change=change):
                packet = valid_red(); error = packet['errorRecords'][0]
                if change == 'import': error['exceptionType'] = 'builtins.ImportError'
                elif change == 'fixture': error['message'] = 'unrelated fixture failure'
                elif change == 'duplicate': packet['errorRecords'][1] = deepcopy(error)
                else:
                    key, value = {'function': ('function', 'setUp'), 'path': ('path', 'native-root'),
                                  'mode': ('mode', 0o755), 'kind': ('kind', 0), 'owner': ('uid', 1)}[change]
                    error['guard'][key] = value
                self.assertFalse(strict_red(packet, 1))

    def test_green_requires_current_nonempty_full_suite_without_skips_or_failures(self):
        packet = {'expectedTestCount': 39, 'testsRun': 39, 'errors': 0, 'failures': 0, 'skipped': 0,
                  'expectedFailures': 0, 'unexpectedSuccesses': 0}
        self.assertTrue(strict_green(packet, 0))
        self.assertFalse(strict_green(packet, 1))
        for key, value in (('testsRun', 2), ('errors', 1), ('failures', 1), ('skipped', 1),
                           ('expectedFailures', 1), ('unexpectedSuccesses', 1)):
            with self.subTest(key=key):
                changed = dict(packet); changed[key] = value
                self.assertFalse(strict_green(changed, 0))
        for count in (1, 40, 41):
            with self.subTest(current_suite_count=count):
                changed = dict(packet); changed['expectedTestCount'] = count; changed['testsRun'] = count
                self.assertTrue(strict_green(changed, 0))
        for count in (None, 0, -1):
            with self.subTest(empty_or_missing_suite=count):
                changed = dict(packet); changed['expectedTestCount'] = count; changed['testsRun'] = count
                self.assertFalse(strict_green(changed, 0))


if __name__ == '__main__':
    unittest.main()
