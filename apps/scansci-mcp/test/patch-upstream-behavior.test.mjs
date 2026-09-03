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

test('upstream patch connects the controlled institutional context and reaps browser workers', async () => {
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
      'def _parse_netscape_cookies(text):',
      '    assert text == "fixture-session"',
      '    return [{"name": "institution", "value": "ok", "domain": ".example", "path": "/", "expires": 0}]',
      '',
    ].join('\n'));
    await writeFile(join(packageRoot, 'browser_backend.py'), [
      'import os',
      'BACKEND_PATCHRIGHT = "patchright"',
      'BACKEND_CAMOUFOX = "camoufox"',
      'def resolve_backend(config): return BACKEND_PATCHRIGHT',
      'def _launch_patchright(config, headless, proxy, args, **kwargs): return proxy',
      'def _launch_patchright_persistent(config, user_data_dir, headless, proxy, args, **kwargs): return proxy',
      '',
      '# ---------------------------------------------------------------------------',
      '# Public entry points',
      '# ---------------------------------------------------------------------------',
      '',
      'def launch(',
      '    *,',
      '    headless: bool = True,',
      '    proxy = None,',
      '    args = None,',
      '    humanize: bool = True,',
      '    config = None,',
      '    **kwargs,',
      '):',
      '    """Launch.',
      '',
      '    ``playwright.chromium.launch()`` / ``cloakbrowser.launch()``.',
      '    """',
      '    backend = resolve_backend(config)',
      '    if backend == BACKEND_PATCHRIGHT:',
      '        return _launch_patchright(config, headless=headless, proxy=proxy, args=args, **kwargs)',
      '',
      'def launch_persistent_context(',
      '    user_data_dir: str,',
      '    *,',
      '    headless: bool = True,',
      '    proxy = None,',
      '    args = None,',
      '    humanize: bool = True,',
      '    config = None,',
      '    **kwargs,',
      '):',
      '    """Persistent context.',
      '',
      '    Same contract as ``playwright.chromium.launch_persistent_context()``.',
      '    """',
      '    backend = resolve_backend(config)',
      '    if backend == BACKEND_PATCHRIGHT:',
      '        return _launch_patchright_persistent(',
      '            config, user_data_dir, headless=headless, proxy=proxy, args=args, **kwargs',
      '        )',
      '',
    ].join('\n'));
    await writeFile(join(packageRoot, 'browser_cookies.py'), [
      'from __future__ import annotations',
      'import json',
      'import time',
      'from pathlib import Path',
      'from typing import Any',
      'def _is_cookie_valid(cookie, now): return not cookie.get("expires") or cookie["expires"] > now',
      'def load_saved_cookies(config: dict[str, Any]) -> list[dict[str, Any]]:',
      '    """Load previously saved publisher cookies, filtering out expired ones."""',
      '    from .config import DATA_DIR',
      '    cookie_file = Path(config.get("cache_dir", str(DATA_DIR / "cache"))) / "publisher_cookies.json"',
      '    if not cookie_file.exists():',
      '        return []',
      '    try:',
      '        cookies = json.loads(cookie_file.read_text(encoding="utf-8"))',
      '    except Exception:',
      '        return []',
      '    now = time.time()',
      '    return [c for c in cookies if _is_cookie_valid(c, now)]',
      '',
    ].join('\n'));
    await writeFile(join(packageRoot, 'config.py'), [
      'from pathlib import Path',
      'DATA_DIR = Path("/unused")',
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
    const sessionFile = join(root, 'session.netscape');
    await writeFile(sessionFile, 'fixture-session');

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

    const institutionProbe = [
      'import os, sys',
      'from pathlib import Path',
      'sys.path.insert(0, sys.argv[1])',
      'from scansci_pdf import browser_backend, browser_cookies',
      'controlled = {"server": "http://controlled-proxy:7891"}',
      'assert browser_backend.launch() == controlled',
      'assert browser_backend.launch_persistent_context("/profile") == controlled',
      'assert browser_backend.launch(proxy={}) == controlled',
      'explicit = {"server": "http://explicit-proxy:8000"}',
      'assert browser_backend.launch(proxy=explicit) == explicit',
      'cookies = browser_cookies.load_saved_cookies({"cache_dir": str(Path(sys.argv[2]) / "missing-cache")})',
      'assert cookies == [{"name": "institution", "value": "ok", "domain": ".example", "path": "/", "expires": 0}]',
    ].join('\n');
    const institution = runPython(['-c', institutionProbe, root, sessionFile], {
      ...process.env,
      SCANSCI_PDF_PROXY: 'http://controlled-proxy:7891',
      SCANSCI_PDF_SESSION_FILE: sessionFile,
    });
    assert.equal(institution.status, 0, institution.stderr || institution.stdout);

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
