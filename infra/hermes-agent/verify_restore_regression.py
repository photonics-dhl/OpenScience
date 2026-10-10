"""Run exact Git installers against the final lifecycle fixture in Linux CI only."""
import argparse
import importlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import unittest

BASELINE = 'd8a02e26a2ca5225c7977370584a7181fbc9a0b6'
INSTALL = 'infra/hermes-agent/install.py'
FILES = (
    INSTALL, 'infra/hermes-agent/sdk_compat.py',
    'infra/hermes-agent/test_install_lifecycle.py', 'infra/hermes-agent/test_sdk_compat.py',
    'infra/hermes-agent/task_agent.py', 'scripts/release-input-manifest.mjs',
    '.agents/skills/openscience-synclip-capabilities/SKILL.md',
    '.agents/skills/openscience-research-video/SKILL.md',
    'infra/hermes-agent/science-references/LICENSE.md',
    'infra/hermes-agent/science-references/README.md',
    'infra/hermes-agent/science-references/critical-thinking-method.md',
    'infra/hermes-agent/science-references/references/common_biases.md',
    'infra/hermes-agent/science-references/references/core_capabilities.md',
    'infra/hermes-agent/science-references/references/evidence_hierarchy.md',
    'infra/hermes-agent/science-references/references/experimental_design.md',
    'infra/hermes-agent/science-references/references/logical_fallacies.md',
    'infra/hermes-agent/science-references/references/review_sources.md',
    'infra/hermes-agent/science-references/references/scientific_method.md',
    'infra/hermes-agent/science-references/references/statistical_pitfalls.md',
)
PREFIX = 'test_install_lifecycle.InstallLifecycleTests.'
RED_TESTS = {
    PREFIX + 'test_late_restore_manifest_accepts_archived_directory_and_unit_modes':
        ('Native recovery directory is not protected', '_protected_directory',
         'app-releases/' + 'a'*40 + '/infra', 0o775, stat.S_IFDIR),
    PREFIX + 'test_late_restore_manifest_accepts_archived_unit_modes_with_private_directories':
        ('Native recovery file is not protected', '_protected_bytes',
         'app-releases/' + 'a'*40 + '/infra/hermes-agent/openscience-hermes@.service',
         0o664, stat.S_IFREG),
}


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8')


def git_blob(repo, revision, path):
    # sudo reads an explicitly selected checkout; no global safe.directory mutation.
    try:
        result = subprocess.run(['git', '-c', 'safe.directory=' + str(repo), '-C', str(repo),
                                 'show', revision + ':' + path],
                                capture_output=True, check=True, timeout=30)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        raise RuntimeError('PRECONDITION: required existing Git object unavailable: '
                           + revision + ':' + path) from None
    return result.stdout


def strict_red(packet, returncode):
    if returncode != 1 or packet.get('testsRun') != 2 or packet.get('errors') != 2 \
            or any(packet.get(key) != 0 for key in
                   ('failures', 'skipped', 'expectedFailures', 'unexpectedSuccesses')):
        return False
    records = packet.get('errorRecords', [])
    if len(records) != 2 or {item.get('test') for item in records} != set(RED_TESTS):
        return False
    for item in records:
        message, function, path, mode, kind = RED_TESTS[item['test']]
        if item.get('exceptionType') != 'builtins.ValueError' or item.get('message') != message:
            return False
        if item.get('guard') != {'function': function, 'path': path, 'mode': mode,
                                'kind': kind, 'uid': 0, 'gid': 0}:
            return False
    return True


def strict_green(packet, returncode):
    expected = packet.get('expectedTestCount')
    return returncode == 0 and isinstance(expected, int) and expected > 0 \
        and packet.get('testsRun') == expected \
        and all(packet.get(key) == 0 for key in
                ('errors', 'failures', 'skipped', 'expectedFailures', 'unexpectedSuccesses'))


class RecordedResult(unittest.TextTestResult):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.error_records = []

    def addError(self, test, error):
        kind, value, trace = error
        record = {'test': test.id(), 'exceptionType': kind.__module__ + '.' + kind.__qualname__,
                  'message': str(value)}
        while trace is not None:
            frame = trace.tb_frame
            if test.id() in RED_TESTS and frame.f_code.co_name in ('_protected_directory', '_protected_bytes') \
                    and Path(frame.f_code.co_filename).resolve() == \
                    Path(test_install_module.__file__).with_name('install.py').resolve():
                info = frame.f_locals.get('info'); path = frame.f_locals.get('path')
                if info is not None and isinstance(path, Path):
                    record['guard'] = {'function': frame.f_code.co_name,
                        'path': path.relative_to(test.folder).as_posix(),
                        'mode': stat.S_IMODE(info.st_mode), 'kind': stat.S_IFMT(info.st_mode),
                        'uid': info.st_uid, 'gid': info.st_gid}
            trace = trace.tb_next
        self.error_records.append(record)
        super().addError(test, error)


def child(mode, source, receipt, candidate):
    global test_install_module
    os.umask(0o022)
    sys.path.insert(0, str(source/'infra/hermes-agent'))
    test_install_module = importlib.import_module('test_install_lifecycle')
    installer = importlib.import_module('install')
    for module, name in ((test_install_module, 'test_install_lifecycle.py'), (installer, 'install.py')):
        if Path(module.__file__).resolve() != source/'infra/hermes-agent'/name:
            raise RuntimeError('Isolated test module resolved outside its Git source copy')
    loader = unittest.defaultTestLoader
    if mode == 'red':
        suite = loader.loadTestsFromNames(list(RED_TESTS))
    else:
        suite = loader.loadTestsFromModule(test_install_module)
    expected = suite.countTestCases()
    result = unittest.TextTestRunner(stream=sys.stdout, verbosity=2, resultclass=RecordedResult).run(suite)
    write_json(receipt, {'candidate': candidate, 'expectedTestCount': expected,
        'testsRun': result.testsRun, 'errors': len(result.errors),
        'failures': len(result.failures), 'skipped': len(result.skipped),
        'expectedFailures': len(result.expectedFailures),
        'unexpectedSuccesses': len(result.unexpectedSuccesses), 'errorRecords': result.error_records})
    return 0 if result.wasSuccessful() else 1


def run_phase(mode, source, output, node, candidate):
    working = source/'tmp'; working.mkdir()
    log = output/(mode + '.log'); receipt = output/(mode + '.json')
    env = dict(os.environ)
    env['PATH'] = str(node.parent) + os.pathsep + env.get('PATH', '')
    env['PYTHONDONTWRITEBYTECODE'] = '1'
    argv = [sys.executable, '-B', str(Path(__file__).resolve()), '--candidate', candidate, '--child', mode,
            '--source', str(source), '--receipt', str(receipt)]
    with log.open('w', encoding='utf-8') as stream:
        process = subprocess.Popen(argv, cwd=working, env=env, stdout=stream,
                                   stderr=subprocess.STDOUT, start_new_session=True)
        try:
            returncode = process.wait(timeout=300)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL); process.wait()
            raise RuntimeError(mode + ' exceeded its finite test budget; see full log')
    if not receipt.exists():
        raise RuntimeError(mode + ' did not produce a unittest result; see full log')
    return json.loads(receipt.read_text(encoding='utf-8')), returncode


def verify(repo, output, node, candidate):
    if os.name != 'posix' or not hasattr(os, 'geteuid') or os.geteuid() != 0:
        raise RuntimeError('Requires existing Linux root CI consumer; skips are not evidence')
    repo = repo.resolve(strict=True)
    output = output.resolve()
    if not output.is_relative_to(repo/'tmp'):
        raise RuntimeError('Evidence output must stay inside this checkout\'s ignored tmp')
    output.mkdir(parents=True, exist_ok=True)
    if (output/'red.log').exists() or (output/'green.log').exists():
        raise RuntimeError('Use a fresh evidence output directory; do not overwrite prior runs')
    if node is None:
        raise RuntimeError('Existing Node executable is unavailable; no installation permitted')
    node = node.resolve(strict=True)
    inputs = {path: git_blob(repo, candidate, path) for path in FILES}
    original = git_blob(repo, BASELINE, INSTALL)
    summary = {'baseline': BASELINE, 'candidate': candidate,
               'files': list(FILES), 'fileCount': len(inputs),
               'candidateBytes': sum(map(len, inputs.values())), 'redVerified': False,
               'greenVerified': False}
    write_json(output/'summary.json', summary)
    # These are source copies for unit fixtures, not installed Agent runtimes.
    with tempfile.TemporaryDirectory(prefix='restore-git-', dir=output) as temporary:
        copies = Path(temporary)
        for mode in ('red', 'green'):
            source = copies/mode; source.mkdir()
            for path, content in inputs.items():
                target = source/path; target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(original if mode == 'red' and path == INSTALL else content)
            packet, returncode = run_phase(mode, source, output, node, candidate)
            verified = strict_red(packet, returncode) if mode == 'red' else strict_green(packet, returncode)
            summary[mode + 'Verified'] = verified
            summary[mode + 'ExitCode'] = returncode
            summary[mode + 'ExpectedTestCount'] = packet.get('expectedTestCount')
            write_json(output/'summary.json', summary)
            if not verified:
                raise RuntimeError(mode + ' did not meet the exact acceptance; see full log/receipt')
            print(mode + ': exact acceptance verified; full evidence in ' + str(output))
    return 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--candidate', required=True)
    parser.add_argument('--repo', type=Path, default=Path.cwd())
    parser.add_argument('--output', type=Path)
    parser.add_argument('--node', type=Path, default=Path(shutil.which('node')) if shutil.which('node') else None)
    parser.add_argument('--child', choices=('red', 'green'))
    parser.add_argument('--source', type=Path)
    parser.add_argument('--receipt', type=Path)
    args = parser.parse_args()
    if not re.fullmatch('[a-f0-9]{40}', args.candidate):
        parser.error('--candidate must be the current CI full Git commit SHA')
    if args.child:
        if os.name != 'posix' or os.geteuid() != 0 or args.source is None or args.receipt is None:
            parser.error('Child requires existing Linux root consumer and explicit source/receipt')
        return child(args.child, args.source, args.receipt, args.candidate)
    if args.output is None:
        parser.error('An explicit fresh ignored evidence output is required')
    return verify(args.repo, args.output, args.node, args.candidate)


if __name__ == '__main__':
    sys.exit(main())
