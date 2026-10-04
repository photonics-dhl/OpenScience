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
import subprocess
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
              'baoyu-article-illustrator', 'baoyu-cover-image', 'baoyu-infographic')


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
            ('scientific-critical-thinking', 'Understand scientific manuscripts and their core contribution using original evidence, conditions and research-type appropriate reasoning.', science.get('nativeInstructions', science['instructions'])),
            ('openscience-source-review', 'Review the caller-provided saved candidate against original passages and actual figures; align central claims, comparisons, conditions and evidence.',
             'Use this method on the actual saved candidate supplied by the task: paper_draft for authors or paper_candidate for independent reviewers. Initial whole-paper understanding uses scientific-critical-thinking; this review preserves the chosen focus. Follow the current task tool protocol for submission and read back its saved content.\n\n'+science.get('nativeSourceReviewInstructions', science['sourceReviewInstructions']))]:
        folder = catalogue/'science'/name
        folder.mkdir(parents=True)
        if name == 'scientific-critical-thinking':
            copy_resources(source/'infra'/'hermes-agent'/'science-references', folder/'upstream')
            body += '\n\n## On-demand original method references\n' \
                'Read [the source index](upstream/README.md) and [the complete original method](upstream/critical-thinking-method.md) when needed. ' \
                'For unsupported inference or scope changes, use [logical fallacies](upstream/references/logical_fallacies.md); ' \
                'for confirmation or anchoring while reviewing your own draft, use [common biases](upstream/references/common_biases.md); ' \
                'for observation, assumption and inference distinctions, use [scientific method](upstream/references/scientific_method.md). ' \
                'Load only relevant references with skill_view and the displayed file_path. Choose an appraisal framework appropriate to this paper; clinical grading is not a default for theoretical physics. ' \
                'These read-only references grant no new tool, script, external service or approval authority.'
        else:
            body += '\n\nFor a difficult inference or possible confirmation bias, select the relevant original references through ' \
                'skill_view(name="scientific-critical-thinking", file_path="upstream/README.md"). ' \
                'The task is source-grounded manuscript appraisal, not a journal intake or editorial decision. ' \
                'Recheck retained claims against the bound paper; structural feedback does not freeze your wording or make it scientifically correct.'
        (folder/'SKILL.md').write_text(f'---\nname: {name}\ndescription: {description}\nversion: "{science["version"]}"\n---\n\n'
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
    with open(ROOT/'install.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        release = ROOT/'releases'/sha
        if release.exists():
            raise ValueError('Native immutable release already exists; inspect its installation receipt instead of overwriting')
        timer_was_active = command(['systemctl', 'is-active', 'openscience-hermes-broker.timer'], False).stdout.strip() == 'active'
        timer_enabled = command(['systemctl', 'is-enabled', 'openscience-hermes-broker.timer'], False).stdout.strip()
        if timer_enabled not in ('enabled', 'enabled-runtime', 'disabled', 'not-found'):
            raise ValueError('Native timer has an unsupported existing enable state')
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
            release.mkdir(parents=True, mode=0o755)
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
            (backup/'state.json').write_text(json.dumps({'files': previous, 'timerWasActive': timer_was_active,
                'timerEnableState': timer_enabled}))
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
                    text = (source/'infra/hermes-agent'/name).read_text()
                    for token, value in {'@ROOT_DIRECTORY@': jail, '@NATIVE_RUNTIME@': runtime,
                                         '@SKILL_CATALOGUE@': catalogue, '@ADAPTER_RELEASE@': adapter}.items():
                        text = text.replace(token, str(value))
                    if '@ROOT_' in text or '@NATIVE_' in text or '@ADAPTER_' in text or '@SKILL_' in text:
                        raise ValueError('Native unit has unresolved installation paths')
                    unit = SYSTEMD_UNITS/name
                    unit.write_text(text)
                    unit.chmod(0o644)
                inbox.mkdir(mode=0o755, exist_ok=True)
                if inbox.is_symlink() or any(inbox.iterdir()):
                    raise ValueError('Native inbox changed during installation')
                os.chown(inbox, 1000, 1000); os.chmod(inbox, 0o755)
                (ROOT/'bridges').mkdir(mode=0o755, exist_ok=True)
                configuration = f'HERMES_NATIVE_AGENT_ENABLED=true\nHERMES_NATIVE_RUNTIME_ID={runtime_id}\nHERMES_NATIVE_SKILL_CATALOGUE_ID={catalogue_id}\nHERMES_NATIVE_AGENT_MODEL=MiniMax-M3\nHERMES_NATIVE_AGENT_INBOX=/native-agent/inbox\n'
                env_path.write_text(configuration); env_path.chmod(0o644)
                command(['systemctl', 'daemon-reload'])
                command(['systemctl', 'enable', 'openscience-hermes-broker.timer'])
                (release/'installation.json').write_text(json.dumps({'releaseSha': sha, 'runtimeId': runtime_id,
                    'skillCatalogueId': catalogue_id, 'timerDeferred': defer_timer, 'productionTaskCalls': 0}))
                return {'releaseSha': sha, 'runtimeId': runtime_id, 'skillCatalogueId': catalogue_id, 'timerDeferred': defer_timer}
            except BaseException:
                for name in UNIT_NAMES:
                    unit = SYSTEMD_UNITS/name
                    if previous[name]:
                        shutil.copy2(backup/name, unit, follow_symlinks=False)
                    else:
                        unit.unlink(missing_ok=True)
                if previous['runtime.env']:
                    shutil.copy2(backup/'runtime.env', env_path, follow_symlinks=False)
                else:
                    env_path.unlink(missing_ok=True)
                command(['systemctl', 'daemon-reload'])
                raise
        except BaseException:
            # Remove this attempt's persistent enable links before restoring the original layer.
            command(['systemctl', 'disable', 'openscience-hermes-broker.timer'], check=timer_enabled != 'not-found')
            if timer_enabled in ('enabled', 'enabled-runtime'):
                restore_enable = ['systemctl', 'enable', 'openscience-hermes-broker.timer']
                if timer_enabled == 'enabled-runtime':
                    restore_enable.insert(2, '--runtime')
                command(restore_enable)
            if timer_was_active:
                command(['systemctl', 'start', 'openscience-hermes-broker.timer'])
            raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--runtime-snapshot', type=Path, required=True)
    parser.add_argument('--defer-timer', action='store_true', default=True)
    args = parser.parse_args()
    print(json.dumps(install(args.source, args.runtime_snapshot, args.defer_timer)))
