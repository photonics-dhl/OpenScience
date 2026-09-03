import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
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
    await writeFile(join(packageRoot, 'log.py'), [
      'class Log:',
      '    def info(self, message): pass',
      'def get_logger(): return Log()',
      '',
    ].join('\n'));
    await writeFile(join(packageRoot, '__init__.py'), [
      'import os as _os',
      '_os.environ["NO_PROXY"] = "*"',
      '_os.environ["no_proxy"] = "*"',
      '',
    ].join('\n'));
    await writeFile(join(packageRoot, '_publisher_strategies_core.py'), [
      'from __future__ import annotations',
      'import contextlib',
      'import json',
      'import re',
      'import threading',
      'import time',
      'from pathlib import Path',
      'from typing import Any',
      'def _restore_cookies_to_context(context: Any, config: dict[str, Any]) -> None:',
      '    try:',
      '        from .browser_cookies import load_saved_cookies',
      '        saved = load_saved_cookies(config)',
      '        if saved:',
      '            pw_cookies = []',
      '            for c in saved:',
      '                pw_c = {"name": c.get("name", ""), "value": c.get("value", ""),',
      '                         "domain": c.get("domain", ""), "path": c.get("path", "/")}',
      '                if pw_c["domain"]:',
      '                    pw_cookies.append(pw_c)',
      '            if pw_cookies:',
      '                context.add_cookies(pw_cookies)',
      '    except Exception:',
      '        pass',
      'class FixtureProc: pass',
      'class FixtureTransport: _proc = FixtureProc()',
      'class FixtureConnection: _transport = FixtureTransport()',
      'class FixtureImpl: _connection = FixtureConnection()',
      'class FixtureContext:',
      '    _impl_obj = FixtureImpl()',
      '    def close(self): raise RuntimeError("fixture close failure")',
      '    def new_page(self): return None',
      '@contextlib.contextmanager',
      'def _visible_browser(config: dict[str, Any], publisher: str, *, viewport: dict | None = None):',
      '    """Open visible CloakBrowser with persistent profile. Falls back to ephemeral."""',
      '    browser = None',
      '    ctx = FixtureContext()',
      '    page = None',
      '    try:',
      '        yield ctx, page',
      '    finally:',
      '        try:',
      '            if browser:',
      '                browser.close()',
      '            else:',
      '                ctx.close()',
      '        except Exception:',
      '            pass',
      'def create_tab(url, config, timeout): return "tab"',
      'config = {}',
      'tab_id = create_tab("https://www.google.com/", config, timeout=15.0)',
      '',
    ].join('\n'));
    await writeFile(join(packageRoot, 'browser_engine.py'), [
      'import os',
      'from pathlib import Path',
      'tree_kills = []',
      'class TLS: pass',
      '_tls = TLS()',
      'def _unregister_browser(browser): pass',
      'def _tree_kill(proc): tree_kills.append(proc)',
      'def configure_context(browser, config):',
      '    proxy = config.get("browser_static_proxy", "")',
      '    context = browser.new_context()',
      '',
      '    # Launching the sync API leaves its dispatcher event loop "running" in',
      '    return context',
      'def _parse_netscape_cookies(text):',
      '    assert text == "fixture-session"',
      '    return [{"name": "institution", "value": "ok", "domain": ".example", "path": "/", "expires": 0}]',
      'def shutdown_shared_browser():',
      '    """Shut down the current thread\'s browser. Call on thread exit or process exit."""',
      '    browser = getattr(_tls, "browser", None)',
      '    if browser is not None:',
      '        try:',
      '            browser.close()',
      '        except Exception:',
      '            pass',
      '        _unregister_browser(browser)',
      '        _tls.browser = None',
      '        _tls.context = None',
      '        logger.info("browser_engine: browser shut down")',
      'class Logger:',
      '    def info(self, message): pass',
      'logger = Logger()',
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
    await writeFile(join(sources, 'carsi.py'), [
      'class PublisherConfig:',
      '    domains = ["sciencedirect.com"]',
      'def detect_publisher(url): return "sciencedirect"',
      'class CARSIClient:',
      '    def __init__(self, config): self._publisher_configs = {"sciencedirect": PublisherConfig()}',
      '    def download_via_browser(self, doi, article_url, output_path): return {"url": article_url}',
      '',
    ].join('\n'));
    await writeFile(join(sources, 'instsci.py'), [
      'def _resolve_doi_url(doi):',
      '    if doi == "query": return "https://linkinghub.elsevier.com/retrieve/pii/QUERY?via=resolver#article"',
      '    if doi == "other": return "https://linkinghub.elsevier.com/other/path?via=resolver#article"',
      '    return "https://linkinghub.elsevier.com/retrieve/pii/S0375960125006267"',
      '',
    ].join('\n'));
    await writeFile(join(sources, 'carsi_source.py'), [
      'from pathlib import Path',
      'from typing import Any',
      'from ..log import get_logger',
      'log = get_logger()',
      'def try_carsi(doi: str, output_path: Path, config: dict[str, Any]) -> dict[str, Any] | None:',
      '    if True:',
      '        from .carsi import CARSIClient, detect_publisher',
      '        from .instsci import _resolve_doi_url',
      '        resolved_url = _resolve_doi_url(doi)',
      '        publisher = detect_publisher(resolved_url)',
      '        client = CARSIClient(config)',
      '        from urllib.parse import urlparse',
      '        cfg = client._publisher_configs.get(publisher)',
      '        if cfg:',
      '            resolved_host = urlparse(resolved_url).hostname or ""',
      '            primary_domain = cfg.domains[0]',
      '            if resolved_host and primary_domain not in resolved_host:',
      '                # Reconstruct URL using primary domain + same path',
      '                from urllib.parse import urlunparse',
      '                parsed = urlparse(resolved_url)',
      '                resolved_url = urlunparse(parsed._replace(',
      '                    scheme="https", netloc=primary_domain))',
      '                log.info(f"   [CARSI] Redirected to primary domain: {resolved_url[:80]}")',
      '        return client.download_via_browser(doi, resolved_url, output_path)',
      '',
    ].join('\n'));

    const patched = runPython([patcher, packageRoot]);
    assert.equal(patched.status, 0, patched.stderr || patched.stdout);

    const sessionFile = join(root, 'session.netscape');
    await writeFile(sessionFile, 'fixture-session');
    const legacyCache = join(root, 'legacy-cache');
    await mkdir(legacyCache);
    await writeFile(join(legacyCache, 'publisher_cookies.json'), JSON.stringify([
      { name: 'institution', value: 'stale', domain: 'EXAMPLE', path: '', expires: 0 },
    ]));

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
      'sys.path.insert(0, sys.argv[1])',
      'from scansci_pdf import browser_backend, _publisher_strategies_core',
      'controlled = {"server": "http://controlled-proxy:7891"}',
      'assert browser_backend.launch() == controlled',
      'assert browser_backend.launch_persistent_context("/profile") == controlled',
      'assert browser_backend.launch(proxy={}) == controlled',
      'explicit = {"server": "http://explicit-proxy:8000"}',
      'assert browser_backend.launch(proxy=explicit) == explicit',
      'class Context:',
      '    cookies = None',
      '    def add_cookies(self, cookies): self.cookies = cookies',
      'context = Context()',
      '_publisher_strategies_core._restore_cookies_to_context(context, {"cache_dir": sys.argv[2]})',
      'assert context.cookies == [{"name": "institution", "value": "ok", "domain": ".example", "path": "/"}]',
      'with _publisher_strategies_core._visible_browser({}, "sciencedirect"):',
      '    pass',
      'assert len(browser_backend.os.environ.get("SCANSCI_PDF_PROXY", "")) > 0',
      'from scansci_pdf import browser_engine',
      'assert browser_engine.tree_kills == [_publisher_strategies_core.FixtureContext._impl_obj._connection._transport._proc]',
      'from scansci_pdf.sources.carsi_source import try_carsi',
      'result = try_carsi("10.1016/j.physleta.2025.130846", None, {})',
      'assert result["url"] == "https://sciencedirect.com/science/article/pii/S0375960125006267"',
      'query_result = try_carsi("query", None, {})',
      'assert query_result["url"] == "https://sciencedirect.com/science/article/pii/QUERY?via=resolver#article"',
      'other_result = try_carsi("other", None, {})',
      'assert other_result["url"] == "https://sciencedirect.com/other/path?via=resolver#article"',
    ].join('\n');
    const institution = runPython(['-c', institutionProbe, root, legacyCache], {
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
      'class Proc: pass',
      'class Transport: _proc = Proc()',
      'class Connection: _transport = Transport()',
      'class Impl: _connection = Connection()',
      'class Browser:',
      '    _impl_obj = Impl()',
      '    def close(self): raise RuntimeError("fixture close failure")',
      'class Sem:',
      '    released = 0',
      '    def release(self): self.released += 1',
      'sem = Sem()',
      'browser_engine._tls.browser = Browser()',
      'assert sources.exercise(True, sem) == "ok"',
      'assert len(browser_engine.tree_kills) == 1',
      'assert sem.released == 1',
      'assert sources.exercise(False, sem) == "ok"',
      'assert len(browser_engine.tree_kills) == 1',
      'assert sem.released == 2',
    ].join('\n');
    const lifecycle = runPython(['-c', lifecycleProbe, root]);
    assert.equal(lifecycle.status, 0, lifecycle.stderr || lifecycle.stdout);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
