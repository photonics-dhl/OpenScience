import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import process from 'node:process';
import test from 'node:test';

const patcher = resolve(import.meta.dirname, '..', 'patch-upstream.py');
const python = process.platform === 'win32' ? 'python' : 'python3';

function runPython(args, env = process.env) {
  return spawnSync(python, args, { encoding: 'utf8', env });
}

test('upstream patch preserves explicit controlled proxy and reaps browser-source workers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'scansci-upstream-patch-'));
  const packageRoot = join(root, 'scansci_pdf');
  const sources = join(packageRoot, 'sources');
  try {
    await mkdir(sources, { recursive: true });
    await writeFile(join(packageRoot, '__init__.py'), [
      'import os as _os',
      '_os.environ["NO_PROXY"] = "*"',
      '_os.environ["no_proxy"] = "*"',
      '',
    ].join('\n'));
    await writeFile(join(packageRoot, '_publisher_strategies_core.py'), [
      'tab_id = create_tab("https://www.google.com/", config, timeout=15.0)',
      '',
    ].join('\n'));
    await writeFile(join(packageRoot, 'browser_engine.py'), [
      'import os',
      'from pathlib import Path',
      'proxy = config.get("browser_static_proxy", "")',
      '    context = browser.new_context()',
      '',
      '    # Launching the sync API leaves its dispatcher event loop "running" in',
      '',
    ].join('\n'));
    await writeFile(join(packageRoot, 'browser_engine.py.tmp'), [
      'shutdown_calls = 0',
      'def shutdown_shared_browser():',
      '    global shutdown_calls',
      '    shutdown_calls += 1',
      '',
    ].join('\n'));
    await writeFile(join(sources, '__init__.py'), [
      'def exercise(is_browser, sem):',
      '    try:',
      '        return "ok"',
      '    finally:',
      '        if sem:',
      '            sem.release()',
      '',
    ].join('\n'));

    const patched = runPython([patcher, packageRoot]);
    assert.equal(patched.status, 0, patched.stderr || patched.stdout);

    const browserEngineFixture = await readFile(join(packageRoot, 'browser_engine.py.tmp'), 'utf8');
    await writeFile(join(packageRoot, 'browser_engine.py'), browserEngineFixture);

    const proxyProbe = [
      'import os, runpy, sys',
      'runpy.run_path(sys.argv[1])',
      'print(os.environ.get("NO_PROXY", ""))',
    ].join(';');
    const explicit = runPython(['-c', proxyProbe, join(packageRoot, '__init__.py')], {
      ...process.env,
      SCANSCI_PDF_PROXY: 'http://controlled-proxy:7891',
      HTTP_PROXY: 'http://controlled-proxy:7891',
      HTTPS_PROXY: 'http://controlled-proxy:7891',
      NO_PROXY: 'localhost,127.0.0.1',
      no_proxy: 'localhost,127.0.0.1',
    });
    assert.equal(explicit.status, 0, explicit.stderr);
    assert.equal(explicit.stdout.trim(), 'localhost,127.0.0.1');

    const fallbackEnv = { ...process.env, NO_PROXY: 'localhost', no_proxy: 'localhost' };
    delete fallbackEnv.SCANSCI_PDF_PROXY;
    const fallback = runPython(['-c', proxyProbe, join(packageRoot, '__init__.py')], fallbackEnv);
    assert.equal(fallback.status, 0, fallback.stderr);
    assert.equal(fallback.stdout.trim(), '*');

    const lifecycleProbe = [
      'import sys',
      'sys.path.insert(0, sys.argv[1])',
      'from scansci_pdf import browser_engine',
      'from scansci_pdf import sources',
      'class Sem:',
      '    released = 0',
      '    def release(self): self.released += 1',
      'sem = Sem()',
      'assert sources.exercise(True, sem) == "ok"',
      'assert browser_engine.shutdown_calls == 1',
      'assert sem.released == 1',
      'assert sources.exercise(False, sem) == "ok"',
      'assert browser_engine.shutdown_calls == 1',
      'assert sem.released == 2',
    ].join('\n');
    const lifecycle = runPython(['-c', lifecycleProbe, root]);
    assert.equal(lifecycle.status, 0, lifecycle.stderr || lifecycle.stdout);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
