"""Install the existing native runtime and project Skills as immutable, secret-free task resources.

No dependency download, application restart, task creation, model call or database write.
"""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys

# Importing a local helper must not add unmanifested files to the immutable release.
sys.dont_write_bytecode = True
from sdk_compat import patch_native_sdk_continuation

ROOT = Path('/opt/openscience-hermes')
NATIVE = Path('/opt/hermes-agent')
RELEASES = Path('/opt/openscience-releases')
SYSTEMD_UNITS = Path('/etc/systemd/system')
UNIT_NAMES = ('openscience-hermes@.service', 'openscience-hermes-broker.service', 'openscience-hermes-broker.timer')
CODE_DIRECTORIES = ('.venv', 'agent', 'tools', 'hermes_cli', 'plugins', 'skills', 'assets', 'acp_registry',
                    'acp_adapter', 'gateway', 'cron', 'packaging', 'environments', 'templates')
ART_SKILLS = ('openscience-research-illustration', 'openscience-scientific-visual-clarity',
              'openscience-handdraw-style', 'openscience-handdraw-router',
              'baoyu-article-illustrator', 'baoyu-cover-image', 'baoyu-infographic',
              'openscience-synclip-capabilities', 'openscience-research-video')


def command(argv, check=True, timeout=120):
    return subprocess.run(argv, check=check, capture_output=True, text=True, timeout=timeout,
                          env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'})


def copy_resources(source, target):
    def ignore(_directory, names):
        return [name for name in names if name in {'__pycache__', '.git', '.pytest_cache', 'node_modules',
                '.cache', '.credentials', 'credentials.json', 'auth.json'} or name.startswith('.env')]
    shutil.copytree(source, target, symlinks=True, ignore=ignore)


def write_science_skills(source, catalogue, science):
    for name, description, body in [
            ('scientific-critical-thinking', 'Critically appraise scientific validity, research quality or bias when the user explicitly requests such an assessment; not the default paper-understanding or illustration method.', science.get('nativeInstructions', science['instructions'])),
            ('openscience-source-review', 'Understand the paper author\'s main message and faithfully summarize or visualize it; compare our saved statements with original passages, figures, cases and conditions without peer-reviewing the paper.',
             'Use this method for whole-paper understanding and faithful source comparison. When a draft exists, use the actual saved candidate: paper_draft for authors or paper_candidate for independent reviewers. Follow the current task tool protocol for submission and read back its saved content.\n\n'+science.get('nativeSourceReviewInstructions', science['sourceReviewInstructions']))]:
        folder = catalogue/'science'/name
        folder.mkdir(parents=True)
        if name == 'scientific-critical-thinking':
            copy_resources(source/'infra'/'hermes-agent'/'science-references', folder/'upstream')
            references = folder/'references'
            references.mkdir()
            (references/'source-evidence-alignment.md').write_text(science['nativeEvidenceAlignmentInstructions']+'\n', encoding='utf-8')
            body += '\n\n## On-demand original method references\n' \
                'Apply the shared source/evidence alignment above to relevant retained claims. A [standalone copy](references/source-evidence-alignment.md) is available without requiring a second read of the same method. ' \
                'Read [the source index](upstream/README.md) and [the complete original method](upstream/critical-thinking-method.md) when needed. ' \
                'For unsupported inference or scope changes, use [logical fallacies](upstream/references/logical_fallacies.md); ' \
                'for confirmation or anchoring while reviewing your own draft, use [common biases](upstream/references/common_biases.md); ' \
                'for observation, assumption and inference distinctions, use [scientific method](upstream/references/scientific_method.md). ' \
                'Load only relevant references with skill_view and the displayed file_path. Choose an appraisal framework appropriate to this paper; clinical grading is not a default for theoretical physics. ' \
                'These read-only references grant no new tool, script, external service or approval authority.'
        else:
            body += '\n\nThe bound paper is the source of the author\'s message. Recheck our retained statements against it, including cases and conditions. ' \
                'Structural feedback does not establish faithful interpretation. Do not invoke a separate appraisal or add derived quantities to complete this task. ' \
                'The complete scientific-critical-thinking references remain installed for separately requested critical assessment; they are not a mandatory step here.'
        version = science.get('nativeSourceReviewVersion', science['version']) if name == 'openscience-source-review' else science['version']
        (folder/'SKILL.md').write_text(f'---\nname: {name}\ndescription: {description}\nversion: "{version}"\n---\n\n'
            'Project method adaptation; reuse paper_overview, paper_search, paper_read and paper_view for this task. '
            'The Agent controls progressive source reading; do not run external scripts or another provider. '
            'Use P IDs actually fully read, and source pixels for visual scientific relations.\n\n'+body+'\n', encoding='utf-8')


def close_symlinks(snapshot, original, external_mounts=()):
    """A read-only copy must not retain links into mutable source, credentials or an unmounted cache."""
    snapshot = snapshot.resolve(strict=True)
    original = original.resolve(strict=True)
    for directory, dirs, files in os.walk(snapshot, followlinks=False):
        for name in dirs+files:
            link = Path(directory)/name
            if not link.is_symlink():
                continue
            target = Path(os.readlink(link))
            if target.is_absolute() and target.is_relative_to(original):
                replacement = snapshot/target.relative_to(original)
                link.unlink()
                link.symlink_to(os.path.relpath(replacement, link.parent))
            resolved = link.resolve(strict=True)
            if resolved.is_relative_to(snapshot):
                continue
            if not any(resolved.is_relative_to(Path(mount).resolve(strict=True)) for mount in external_mounts):
                raise ValueError('Native resource link escapes the installed task closure')
            if resolved.stat().st_uid != 0 or resolved.stat().st_mode & 0o022:
                raise ValueError('Native system dependency is not immutable to ordinary users')


def freeze(path):
    for directory, dirs, files in os.walk(path, followlinks=False):
        for name in files:
            file = Path(directory)/name
            if not file.is_symlink():
                os.chmod(file, 0o555 if file.stat().st_mode & 0o111 else 0o444)
        for name in dirs:
            entry = Path(directory)/name
            if not entry.is_symlink():
                os.chmod(entry, 0o555)
    os.chmod(path, 0o555)


def _restore_previous_files(backup, previous):
    for name in UNIT_NAMES:
        unit = SYSTEMD_UNITS/name
        if previous[name]:
            shutil.copy2(backup/name, unit, follow_symlinks=False)
        else:
            unit.unlink(missing_ok=True)
    env_path = ROOT/'runtime.env'
    if previous['runtime.env']:
        shutil.copy2(backup/'runtime.env', env_path, follow_symlinks=False)
    else:
        env_path.unlink(missing_ok=True)
    command(['systemctl', 'daemon-reload'])


def _unit_text(source, release, name):
    text = (source/'infra/hermes-agent'/name).read_text()
    for token, value in {'@ROOT_DIRECTORY@': release/'root', '@NATIVE_RUNTIME@': release/'runtime',
                         '@SKILL_CATALOGUE@': release/'catalogue', '@ADAPTER_RELEASE@': release/'adapter'}.items():
        text = text.replace(token, str(value))
    if any(token in text for token in ('@ROOT_', '@NATIVE_', '@ADAPTER_', '@SKILL_')):
        raise ValueError('Native unit has unresolved installation paths')
    return text


def _runtime_configuration(runtime_id, catalogue_id):
    return f'HERMES_NATIVE_AGENT_ENABLED=true\nHERMES_NATIVE_RUNTIME_ID={runtime_id}\nHERMES_NATIVE_SKILL_CATALOGUE_ID={catalogue_id}\nHERMES_NATIVE_AGENT_MODEL=MiniMax-M3\nHERMES_NATIVE_AGENT_INBOX=/native-agent/inbox\n'


def _protected_directory(path):
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
        raise ValueError('Native recovery directory is not protected')


def _protected_bytes(path, allow_missing=False):
    try:
        info = path.lstat()
    except FileNotFoundError:
        if allow_missing: return None
        raise
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
        raise ValueError('Native recovery file is not protected')
    return path.read_bytes()


def _write_private_json(path, value):
    path.touch(mode=0o600, exist_ok=False)
    path.chmod(0o600)
    path.write_text(json.dumps(value))


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result: raise ValueError('Duplicate Native recovery field')
        result[key] = value
    return result


def _previous_identity(configuration):
    try:
        lines = configuration.decode('utf-8').splitlines()
    except UnicodeError:
        raise ValueError('Invalid previous Native configuration') from None
    names = {'HERMES_NATIVE_AGENT_ENABLED', 'HERMES_NATIVE_RUNTIME_ID', 'HERMES_NATIVE_SKILL_CATALOGUE_ID',
             'HERMES_NATIVE_AGENT_MODEL', 'HERMES_NATIVE_AGENT_INBOX'}
    values = {}
    for line in lines:
        if not line: continue
        key, separator, value = line.partition('=')
        if not separator or key not in names or key in values:
            raise ValueError('Invalid previous Native configuration fields')
        values[key] = value
    if set(values) != names or values['HERMES_NATIVE_AGENT_ENABLED'] not in ('true', 'false') \
        or values['HERMES_NATIVE_AGENT_MODEL'] != 'MiniMax-M3' \
        or values['HERMES_NATIVE_AGENT_INBOX'] != '/native-agent/inbox':
        raise ValueError('Incomplete or unsupported previous Native configuration')
    runtime = values['HERMES_NATIVE_RUNTIME_ID']; catalogue = values['HERMES_NATIVE_SKILL_CATALOGUE_ID']
    if any(not re.fullmatch('[A-Za-z0-9][A-Za-z0-9._:-]{0,255}', value) for value in (runtime, catalogue)):
        raise ValueError('Invalid previous Native identities')
    return runtime, catalogue


def restore_previous(candidate_sha):
    if os.geteuid() != 0: raise ValueError('Native restoration requires root')
    if not isinstance(candidate_sha, str) or not re.fullmatch('[a-f0-9]{40}', candidate_sha):
        raise ValueError('Native restoration requires an exact candidate SHA')
    release = ROOT/'releases'/candidate_sha; backup = release/'previous'; source = RELEASES/candidate_sha
    for path in (ROOT, ROOT/'releases', release, backup, RELEASES, source,
                 source/'infra', source/'infra/hermes-agent', SYSTEMD_UNITS):
        _protected_directory(path)
    _protected_bytes(ROOT/'install.lock')
    with open(ROOT/'install.lock', 'r') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        receipt = json.loads(_protected_bytes(release/'installation.json'), object_pairs_hook=_unique_object)
        expected_runtime = f'installed-native-continuation-{candidate_sha}'
        expected_catalogue = f'project-catalogue-{candidate_sha}'
        if not isinstance(receipt, dict) or set(receipt) != {'releaseSha', 'runtimeId', 'skillCatalogueId', 'timerDeferred', 'productionTaskCalls'} \
            or receipt['releaseSha'] != candidate_sha or receipt['runtimeId'] != expected_runtime \
            or receipt['skillCatalogueId'] != expected_catalogue or receipt['timerDeferred'] is not True \
            or type(receipt['productionTaskCalls']) is not int or receipt['productionTaskCalls'] != 0:
            raise ValueError('Native successful installation receipt changed')
        state = json.loads(_protected_bytes(backup/'state.json'), object_pairs_hook=_unique_object)
        if not isinstance(state, dict) or set(state) != {'files', 'timerWasActive', 'timerEnableState'} \
            or not isinstance(state['files'], dict) or set(state['files']) != {*UNIT_NAMES, 'runtime.env'} \
            or any(type(value) is not bool for value in state['files'].values()) \
            or type(state['timerWasActive']) is not bool \
            or state['timerEnableState'] not in ('enabled', 'enabled-runtime', 'disabled', 'not-found'):
            raise ValueError('Native previous installation state changed')
        previous = state['files']
        old = {}
        for name in (*UNIT_NAMES, 'runtime.env'):
            old[name] = _protected_bytes(backup/name, allow_missing=not previous[name])
            if not previous[name] and old[name] is not None:
                raise ValueError('Native recorded absence conflicts with its backup')
        old_ids = _previous_identity(old['runtime.env']) if previous['runtime.env'] else (None, None)
        candidate = {'runtime.env': _runtime_configuration(expected_runtime, expected_catalogue).encode('utf-8')}
        for name in UNIT_NAMES:
            _protected_bytes(source/'infra/hermes-agent'/name)
            candidate[name] = _unit_text(source, release, name).encode('utf-8')
        paths = {**{name: SYSTEMD_UNITS/name for name in UNIT_NAMES}, 'runtime.env': ROOT/'runtime.env'}
        # Validate the entire fixed set before any service or file mutation.
        current_files = {}
        for name, path in paths.items():
            current = _protected_bytes(path, allow_missing=not previous[name])
            if current != candidate[name] and current != old[name]:
                raise ValueError('Native live installation is neither candidate nor previous')
            current_files[name] = current
        timer = 'openscience-hermes-broker.timer'
        loaded = command(['systemctl', 'show', timer, '--property=LoadState', '--value'], False).stdout.strip()
        if loaded == 'loaded':
            command(['systemctl', 'stop', timer])
            if command(['systemctl', 'is-active', timer], False).stdout.strip() not in ('inactive', 'failed'):
                raise ValueError('Native timer did not stop for restoration')
        elif loaded != 'not-found':
            raise ValueError('Native timer load state is unknown')
        command(['systemctl', 'disable', timer], check=loaded != 'not-found')
        broker = 'openscience-hermes-broker.service'
        broker_loaded = command(['systemctl', 'show', broker, '--property=LoadState', '--value'], False).stdout.strip()
        broker_active = command(['systemctl', 'is-active', broker], False).stdout.strip()
        if not previous[broker] and current_files[broker] is None and broker_loaded == 'not-found':
            broker_idle = broker_active in ('unknown', 'inactive')
        else:
            broker_idle = current_files[broker] is not None and broker_loaded == 'loaded' \
                and broker_active in ('inactive', 'failed')
        if not broker_idle:
            raise ValueError('Native broker must drain before restoration')
        active = command(['systemctl', 'list-units', '--no-legend', '--plain', '--state=active,activating,deactivating', 'openscience-hermes@*.service']).stdout.strip()
        inbox = ROOT/'inbox'
        if active or inbox.is_symlink() or (inbox.exists() and any(inbox.iterdir())):
            raise ValueError('Native executions must drain before restoration')
        _restore_previous_files(backup, previous)
        for name, path in paths.items():
            if _protected_bytes(path, allow_missing=not previous[name]) != old[name]:
                raise ValueError('Native previous file restoration is incomplete')
        loaded = command(['systemctl', 'show', timer, '--property=LoadState', '--value'], False).stdout.strip()
        active = command(['systemctl', 'is-active', timer], False).stdout.strip()
        enabled = command(['systemctl', 'is-enabled', timer], False)
        enable_state = enabled.stdout.strip()
        if not previous[timer] and state['timerEnableState'] == 'not-found':
            # Older systemd versions can report an absent unit with empty is-enabled stdout.
            # The restored file absence and manager LoadState must independently agree.
            deferred = loaded == 'not-found' and active in ('unknown', 'inactive') \
                and (enable_state == 'not-found' or (not enable_state and enabled.returncode != 0))
        else:
            deferred = loaded == 'loaded' and active in ('inactive', 'failed') and enable_state == 'disabled'
        if not deferred:
            raise ValueError('Native restored timer is not deferred')
        return {'releaseSha': candidate_sha, 'restored': True, 'timerDeferred': True,
                'previousRuntimeId': old_ids[0], 'previousSkillCatalogueId': old_ids[1]}


def install(source, runtime_snapshot, defer_timer=True):
    if os.geteuid() != 0:
        raise ValueError('Native installation requires root')
    source = source.resolve(strict=True)
    sha = source.name
    if not re.fullmatch('[a-f0-9]{40}', sha) or source != RELEASES/sha:
        raise ValueError('Native installation requires the exact immutable application release')
    # Full source/runtime verification traverses the installed dependency graph. The active release's
    # source-only check exceeded the ordinary 120-second command budget; keep a separate finite limit.
    command(['node', str(source/'scripts/release-input-manifest.mjs'), 'verify', '--root', str(source), '--sha', sha], timeout=900)
    if not defer_timer:
        raise ValueError('Native installation is staged; activate the timer only after the matching application is ready')
    if runtime_snapshot.is_symlink() or not runtime_snapshot.is_file() or runtime_snapshot.stat().st_uid != 0 or runtime_snapshot.stat().st_mode & 0o022:
        raise ValueError('Expected application runtime snapshot is not protected')
    command(['node', str(source/'scripts/release-input-manifest.mjs'), 'runtime-verify', '--root', str(source),
             '--sha', sha, '--snapshot', str(runtime_snapshot)], timeout=900)
    ROOT.mkdir(mode=0o755, exist_ok=True)
    if ROOT.is_symlink() or ROOT.stat().st_uid != 0 or ROOT.stat().st_mode & 0o022:
        raise ValueError('Native installation root changed')
    with os.fdopen(os.open(ROOT/'install.lock', os.O_RDWR | os.O_CREAT | os.O_APPEND | os.O_NOFOLLOW, 0o600), 'a') as lock:
        info = os.fstat(lock.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0:
            raise ValueError('Native installation lock is not protected')
        os.fchmod(lock.fileno(), 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX)
        release = ROOT/'releases'/sha
        if release.exists():
            raise ValueError('Native immutable release already exists; inspect its installation receipt instead of overwriting')
        timer = 'openscience-hermes-broker.timer'
        timer_activity = command(['systemctl', 'is-active', timer], False).stdout.strip()
        timer_enablement = command(['systemctl', 'is-enabled', timer], False)
        timer_enabled = timer_enablement.stdout.strip()
        if not timer_enabled and timer_enablement.returncode != 0:
            timer_enabled = 'not-found'
        if timer_enabled == 'not-found' and (timer_activity not in ('unknown', 'inactive') \
            or _protected_bytes(SYSTEMD_UNITS/timer, allow_missing=True) is not None \
            or command(['systemctl', 'show', timer, '--property=LoadState', '--value'], False).stdout.strip() != 'not-found'):
            raise ValueError('Native timer has an unsupported existing enable state')
        if timer_enabled not in ('enabled', 'enabled-runtime', 'disabled', 'not-found'):
            raise ValueError('Native timer has an unsupported existing enable state')
        timer_was_active = timer_activity == 'active'
        previous_restored = True
        try:
            timer_loaded = command(['systemctl', 'show', 'openscience-hermes-broker.timer', '--property=LoadState', '--value'], False).stdout.strip()
            if timer_loaded == 'loaded':
                command(['systemctl', 'stop', 'openscience-hermes-broker.timer'])
                if command(['systemctl', 'is-active', 'openscience-hermes-broker.timer'], False).stdout.strip() not in ('inactive', 'failed'):
                    raise ValueError('Native timer did not stop')
            elif timer_loaded != 'not-found':
                raise ValueError('Native timer load state is unknown')
            if command(['systemctl', 'is-active', 'openscience-hermes-broker.service'], False).stdout.strip() in ('active', 'activating'):
                raise ValueError('Native broker is still executing; no installation performed')
            active = command(['systemctl', 'list-units', '--no-legend', '--plain', '--state=active,activating,deactivating', 'openscience-hermes@*.service']).stdout.strip()
            inbox = ROOT/'inbox'
            if active or (inbox.exists() and any(inbox.iterdir())):
                raise ValueError('Native executions must drain before replacing task resources')
            command(['systemctl', 'disable', 'openscience-hermes-broker.timer'], check=timer_enabled != 'not-found')
            (ROOT/'releases').mkdir(mode=0o755, exist_ok=True)
            _protected_directory(ROOT/'releases')
            release.mkdir(mode=0o755)
            backup = release/'previous'
            backup.mkdir(mode=0o700)
            previous = {}
            for name in UNIT_NAMES:
                unit = SYSTEMD_UNITS/name
                previous[name] = unit.exists()
                if unit.exists():
                    shutil.copy2(unit, backup/name, follow_symlinks=False)
            env_path = ROOT/'runtime.env'
            previous['runtime.env'] = env_path.exists()
            if env_path.exists():
                shutil.copy2(env_path, backup/'runtime.env', follow_symlinks=False)
            _write_private_json(backup/'state.json', {'files': previous, 'timerWasActive': timer_was_active,
                'timerEnableState': timer_enabled})
            previous_restored = False
            try:
                runtime = release/'runtime'
                runtime.mkdir()
                for file in NATIVE.glob('*.py'):
                    shutil.copy2(file, runtime/file.name)
                for name in ('pyproject.toml', 'requirements.txt', 'LICENSE', 'LICENSE.md', 'NOTICE'):
                    if (NATIVE/name).is_file():
                        shutil.copy2(NATIVE/name, runtime/name)
                for name in CODE_DIRECTORIES:
                    if (NATIVE/name).is_dir():
                        copy_resources(NATIVE/name, runtime/name)
                if not (runtime/'.venv/bin/python').exists() or not (runtime/'run_agent.py').is_file():
                    raise ValueError('The installed native Python runtime is incomplete')
                patch_native_sdk_continuation(runtime)
                runtime_id = f'installed-native-continuation-{sha}'
                catalogue_id = f'project-catalogue-{sha}'
                (runtime/'.runtime-id').write_text(runtime_id+'\n')
                catalogue = release/'catalogue'
                copy_resources(NATIVE/'skills', catalogue)
                science = json.loads(command(['node', '-e',
                    'process.stdout.write(JSON.stringify(require(process.argv[1]).SCIENTIFIC_CRITICAL_THINKING_SKILL))',
                    str(source/'apps/agent-worker/dist/skills/scientific-critical-thinking.js')]).stdout)
                write_science_skills(source, catalogue, science)
                for name in ART_SKILLS:
                    copy_resources(source/'.agents/skills'/name, catalogue/'illustration'/name)
                close_symlinks(runtime, NATIVE, ('/usr', '/lib', '/lib64'))
                close_symlinks(catalogue, NATIVE/'skills')
                (catalogue/'.catalogue-id').write_text(catalogue_id+'\n')
                adapter = release/'adapter'
                adapter.mkdir()
                for name in ('task_agent.py', 'task_runtime.py', 'host_broker.py'):
                    shutil.copy2(source/'infra/hermes-agent'/name, adapter/name)
                jail = release/'root'
                jail.mkdir()
                for name in ('usr', 'lib', 'lib64', 'etc', 'opt', 'adapter', 'catalogue', 'bridge', 'task', 'proc', 'dev', 'run', 'tmp', 'var'):
                    (jail/name).mkdir()
                (jail/'runtime-id').touch()
                freeze(runtime); freeze(catalogue); freeze(adapter)
                for name in UNIT_NAMES:
                    unit = SYSTEMD_UNITS/name
                    unit.write_text(_unit_text(source, release, name))
                    unit.chmod(0o644)
                inbox.mkdir(mode=0o755, exist_ok=True)
                if inbox.is_symlink() or any(inbox.iterdir()):
                    raise ValueError('Native inbox changed during installation')
                os.chown(inbox, 1000, 1000); os.chmod(inbox, 0o755)
                (ROOT/'bridges').mkdir(mode=0o755, exist_ok=True)
                env_path.write_text(_runtime_configuration(runtime_id, catalogue_id)); env_path.chmod(0o644)
                command(['systemctl', 'daemon-reload'])
                _write_private_json(release/'installation.json', {'releaseSha': sha, 'runtimeId': runtime_id,
                    'skillCatalogueId': catalogue_id, 'timerDeferred': defer_timer, 'productionTaskCalls': 0})
                return {'releaseSha': sha, 'runtimeId': runtime_id, 'skillCatalogueId': catalogue_id, 'timerDeferred': defer_timer}
            except BaseException:
                _restore_previous_files(backup, previous)
                previous_restored = True
                raise
        except BaseException:
            # Remove this attempt's persistent enable links before restoring the original layer.
            command(['systemctl', 'disable', 'openscience-hermes-broker.timer'], check=timer_enabled != 'not-found')
            if previous_restored and timer_enabled in ('enabled', 'enabled-runtime'):
                restore_enable = ['systemctl', 'enable', 'openscience-hermes-broker.timer']
                if timer_enabled == 'enabled-runtime':
                    restore_enable.insert(2, '--runtime')
                command(restore_enable)
            if previous_restored and timer_was_active:
                command(['systemctl', 'start', 'openscience-hermes-broker.timer'])
            raise


def main(argv=None):
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--source', type=Path)
    mode.add_argument('--restore-previous')
    parser.add_argument('--runtime-snapshot', type=Path)
    parser.add_argument('--defer-timer', action='store_true', default=True)
    args = parser.parse_args(argv)
    if args.restore_previous is not None:
        if args.runtime_snapshot is not None: parser.error('Restoration does not accept a runtime snapshot')
        result = restore_previous(args.restore_previous)
    else:
        if args.runtime_snapshot is None: parser.error('Installation requires --runtime-snapshot')
        result = install(args.source, args.runtime_snapshot, args.defer_timer)
    print(json.dumps(result))


if __name__ == '__main__': main()
