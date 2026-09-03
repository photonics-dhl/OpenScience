import sys
from pathlib import Path


DEFAULT_PACKAGE = Path("/opt/scansci-venv/lib/python3.12/site-packages/scansci_pdf")


def patches(package: Path) -> tuple[tuple[Path, str, str, str], ...]:
    return (
        (
            package / "__init__.py",
            """_os.environ["NO_PROXY"] = "*"
_os.environ["no_proxy"] = "*""",
            """if not _os.environ.get("SCANSCI_PDF_PROXY"):
    _os.environ["NO_PROXY"] = "*"
    _os.environ["no_proxy"] = "*""",
            "proxy environment",
        ),
        (
            package / "_publisher_strategies_core.py",
            """import json
import re""",
            """import json
import os
import re""",
            "institutional session environment",
        ),
        (
            package / "_publisher_strategies_core.py",
            """def _restore_cookies_to_context(context: Any, config: dict[str, Any]) -> None:
    try:
        from .browser_cookies import load_saved_cookies
        saved = load_saved_cookies(config)
        if saved:
            pw_cookies = []
            for c in saved:
                pw_c = {"name": c.get("name", ""), "value": c.get("value", ""),
                         "domain": c.get("domain", ""), "path": c.get("path", "/")}
                if pw_c["domain"]:
                    pw_cookies.append(pw_c)
            if pw_cookies:
                context.add_cookies(pw_cookies)
    except Exception:
        pass""",
            """def _restore_cookies_to_context(context: Any, config: dict[str, Any]) -> None:
    try:
        from .browser_cookies import load_saved_cookies
        saved = load_saved_cookies(config)
        session_file = os.environ.get("SCANSCI_PDF_SESSION_FILE", "").strip()
        session_path = Path(session_file) if session_file else None
        if session_path and session_path.is_file():
            try:
                from .browser_engine import _parse_netscape_cookies
                official = _parse_netscape_cookies(session_path.read_text(encoding="utf-8"))
                def cookie_key(cookie: dict[str, Any]) -> tuple[str, str, str]:
                    domain = str(cookie.get("domain", "")).lstrip(".").lower()
                    path = str(cookie.get("path", "/")) or "/"
                    return str(cookie.get("name", "")), domain, path
                merged = {
                    cookie_key(c): c
                    for c in saved
                }
                for cookie in official:
                    merged[cookie_key(cookie)] = cookie
                saved = list(merged.values())
            except Exception:
                pass
        if saved:
            pw_cookies = []
            for c in saved:
                pw_c = {"name": c.get("name", ""), "value": c.get("value", ""),
                         "domain": c.get("domain", ""), "path": c.get("path", "/")}
                if pw_c["domain"]:
                    pw_cookies.append(pw_c)
            if pw_cookies:
                context.add_cookies(pw_cookies)
    except Exception:
        pass""",
            "institutional browser session restore",
        ),
        (
            package / "_publisher_strategies_core.py",
            'tab_id = create_tab("https://www.google.com/", config, timeout=15.0)',
            'tab_id = create_tab("about:blank", config, timeout=15.0)',
            "browser bootstrap",
        ),
        (
            package / "_publisher_strategies_core.py",
            """def _visible_browser(config: dict[str, Any], publisher: str, *, viewport: dict | None = None):
    \"\"\"Open visible CloakBrowser with persistent profile. Falls back to ephemeral.\"\"\"
    if not _HAS_CLOAKBROWSER:
        raise RuntimeError(\"cloakbrowser not installed. Run: pip install cloakbrowser\")
    profile_dir = _get_profile_dir(config, publisher)
    browser = None

    try:
        ctx = launch_persistent_context(
            str(profile_dir),
            headless=False, humanize=True,
            args=[\"--disable-features=CrossOriginOpenerPolicy\"],
        )
        page = ctx.new_page()
        log.info(f\"   [{publisher}] persistent browser profile: {profile_dir}\")
        # Ensure cookies are loaded from saved file
        _restore_cookies_to_context(ctx, config)
    except Exception as _e:
        log.info(f\"   [{publisher}] persistent context unavailable ({_e}), using ephemeral\")
        _vp = viewport or {\"width\": 1440, \"height\": 900}
        browser = launch(headless=False, humanize=True,
                         args=[\"--disable-features=CrossOriginOpenerPolicy\"])
        ctx = browser.new_context(viewport=_vp)
        _restore_cookies_to_context(ctx, config)
        page = ctx.new_page()

    try:
        yield ctx, page
    finally:
        try:
            if browser:
                browser.close()
            else:
                ctx.close()
        except Exception:
            pass""",
            """def _visible_browser(config: dict[str, Any], publisher: str, *, viewport: dict | None = None):
    \"\"\"Open visible CloakBrowser with persistent profile. Falls back to ephemeral.\"\"\"
    if not _HAS_CLOAKBROWSER:
        raise RuntimeError(\"cloakbrowser not installed. Run: pip install cloakbrowser\")
    profile_dir = _get_profile_dir(config, publisher)
    browser = None
    ctx = None

    def close_owned(owner: Any) -> None:
        if owner is None:
            return
        proc = None
        snapshot = None
        tree_kill = None
        try:
            proc = owner._impl_obj._connection._transport._proc
            from .browser_engine import _snapshot_process_tree, _tree_kill
            snapshot = _snapshot_process_tree(proc)
            tree_kill = _tree_kill
        except Exception:
            pass
        try:
            owner.close()
        except Exception:
            pass
        try:
            if tree_kill is not None:
                tree_kill(proc, snapshot)
        except Exception:
            pass

    try:
        try:
            ctx = launch_persistent_context(
                str(profile_dir),
                headless=False, humanize=True,
                args=[\"--disable-features=CrossOriginOpenerPolicy\"],
            )
            page = ctx.new_page()
            log.info(f\"   [{publisher}] persistent browser profile: {profile_dir}\")
            # Ensure cookies are loaded from saved file
            _restore_cookies_to_context(ctx, config)
        except Exception as _e:
            close_owned(ctx)
            ctx = None
            log.info(f\"   [{publisher}] persistent context unavailable ({_e}), using ephemeral\")
            _vp = viewport or {\"width\": 1440, \"height\": 900}
            browser = launch(headless=False, humanize=True,
                             args=[\"--disable-features=CrossOriginOpenerPolicy\"])
            ctx = browser.new_context(viewport=_vp)
            _restore_cookies_to_context(ctx, config)
            page = ctx.new_page()

        yield ctx, page
    finally:
        close_owned(browser or ctx)""",
            "institutional browser process cleanup",
        ),
        (
            package / "browser_engine.py",
            """import shutil
import subprocess""",
            """import shutil
import signal
import subprocess""",
            "Linux browser process cleanup import",
        ),
        (
            package / "browser_engine.py",
            'proxy = config.get("browser_static_proxy", "")',
            'proxy = os.environ.get("SCANSCI_PDF_PROXY") or config.get("browser_static_proxy", "")',
            "browser proxy",
        ),
        (
            package / "browser_engine.py",
            """    context = browser.new_context()

    # Launching the sync API leaves its dispatcher event loop \"running\" in""",
            """    context = browser.new_context()
    session_file = os.environ.get("SCANSCI_PDF_SESSION_FILE", "")
    if session_file and Path(session_file).is_file():
        context.add_cookies(_parse_netscape_cookies(Path(session_file).read_text(encoding="utf-8")))

    # Launching the sync API leaves its dispatcher event loop \"running\" in""",
            "browser session restore",
        ),
        (
            package / "browser_engine.py",
            """def _tree_kill(proc: Any) -> None:
    \"\"\"Force-kill a driver process and its whole child tree (Windows-safe).\"\"\"
    if proc is None or proc.poll() is not None:
        return
    if os.name == \"nt\":
        subprocess.run(
            [\"taskkill\", \"/F\", \"/T\", \"/PID\", str(proc.pid)],
            capture_output=True, timeout=15,
        )
    else:
        proc.kill()""",
            """def _linux_process_starttime(pid: int, proc_root: Path = Path(\"/proc\")) -> str | None:
    try:
        raw = (proc_root / str(pid) / \"stat\").read_text(encoding=\"utf-8\")
    except OSError:
        return None
    closing_parenthesis = raw.rfind(\")\")
    if closing_parenthesis < 0:
        return None
    fields = raw[closing_parenthesis + 2:].split()
    return fields[19] if len(fields) > 19 else None


def _linux_descendant_processes(root_pid: int, proc_root: Path = Path(\"/proc\")) -> list[tuple[int, str]]:
    \"\"\"Return Linux descendants with PID-reuse-resistant identities.\"\"\"
    descendants: list[tuple[int, str]] = []
    pending = [root_pid]
    seen = {root_pid}
    while pending:
        parent_pid = pending.pop()
        children_path = proc_root / str(parent_pid) / \"task\" / str(parent_pid) / \"children\"
        try:
            child_tokens = children_path.read_text(encoding=\"utf-8\").split()
        except OSError:
            continue
        for token in child_tokens:
            try:
                child_pid = int(token)
            except ValueError:
                continue
            if child_pid <= 0 or child_pid in seen:
                continue
            seen.add(child_pid)
            pending.append(child_pid)
            starttime = _linux_process_starttime(child_pid, proc_root)
            if starttime is not None:
                descendants.append((child_pid, starttime))
    return descendants


def _snapshot_process_tree(proc: Any) -> tuple[str, list[tuple[int, str]]] | None:
    if proc is None or os.name == \"nt\":
        return None
    root_pid = int(proc.pid)
    root_starttime = _linux_process_starttime(root_pid)
    if root_starttime is None:
        return None
    return root_starttime, _linux_descendant_processes(root_pid)


def _tree_kill(proc: Any, snapshot: tuple[str, list[tuple[int, str]]] | None = None) -> None:
    \"\"\"Force-kill a driver process and its whole child tree (Windows-safe).\"\"\"
    if proc is None:
        return
    poll = getattr(proc, \"poll\", None)
    if callable(poll):
        root_alive = poll() is None
    else:
        root_alive = getattr(proc, \"returncode\", None) is None
    if os.name == \"nt\":
        if root_alive:
            subprocess.run(
                [\"taskkill\", \"/F\", \"/T\", \"/PID\", str(proc.pid)],
                capture_output=True, timeout=15,
            )
        return
    if snapshot is None:
        if not root_alive:
            return
        snapshot = _snapshot_process_tree(proc)
    if snapshot is not None:
        root_starttime, descendants = snapshot
        for child_pid, child_starttime in reversed(descendants):
            if _linux_process_starttime(child_pid) != child_starttime:
                continue
            try:
                os.kill(child_pid, signal.SIGKILL)
            except OSError:
                pass
        if _linux_process_starttime(int(proc.pid)) != root_starttime:
            return
    if root_alive:
        proc.kill()""",
            "async browser process cleanup",
        ),
        (
            package / "browser_engine.py",
            """def shutdown_shared_browser():
    \"\"\"Shut down the current thread's browser. Call on thread exit or process exit.\"\"\"
    browser = getattr(_tls, \"browser\", None)
    if browser is not None:
        try:
            browser.close()
        except Exception:
            pass
        _unregister_browser(browser)
        _tls.browser = None
        _tls.context = None
        logger.info(\"browser_engine: browser shut down\")""",
            """def shutdown_shared_browser():
    \"\"\"Shut down the current thread's browser. Call on thread exit or process exit.\"\"\"
    browser = getattr(_tls, \"browser\", None)
    if browser is not None:
        proc = None
        snapshot = None
        try:
            proc = browser._impl_obj._connection._transport._proc
            snapshot = _snapshot_process_tree(proc)
        except Exception:
            pass
        try:
            browser.close()
        except Exception:
            pass
        try:
            _tree_kill(proc, snapshot)
        except Exception:
            pass
        _unregister_browser(browser)
        _tls.browser = None
        _tls.context = None
        _tls.owned_loop = None
        logger.info(\"browser_engine: browser shut down\")""",
            "shared browser process cleanup",
        ),
        (
            package / "browser_backend.py",
            """# Public entry points
# ---------------------------------------------------------------------------

def launch(""",
            """# Public entry points
# ---------------------------------------------------------------------------

def _controlled_proxy(explicit_proxy):
    if explicit_proxy:
        return explicit_proxy
    configured_proxy = os.environ.get("SCANSCI_PDF_PROXY", "").strip()
    return {"server": configured_proxy} if configured_proxy else None


def launch(""",
            "institutional browser proxy helper",
        ),
        (
            package / "browser_backend.py",
            """    ``playwright.chromium.launch()`` / ``cloakbrowser.launch()``.
    \"\"\"
    backend = resolve_backend(config)""",
            """    ``playwright.chromium.launch()`` / ``cloakbrowser.launch()``.
    \"\"\"
    proxy = _controlled_proxy(proxy)
    backend = resolve_backend(config)""",
            "institutional browser launch proxy",
        ),
        (
            package / "browser_backend.py",
            """    Same contract as ``playwright.chromium.launch_persistent_context()``.
    \"\"\"
    backend = resolve_backend(config)""",
            """    Same contract as ``playwright.chromium.launch_persistent_context()``.
    \"\"\"
    proxy = _controlled_proxy(proxy)
    backend = resolve_backend(config)""",
            "institutional persistent browser proxy",
        ),
        (
            package / "sources" / "carsi_source.py",
            """                parsed = urlparse(resolved_url)
                resolved_url = urlunparse(parsed._replace(
                    scheme="https", netloc=primary_domain))""",
            """                parsed = urlparse(resolved_url)
                primary_path = parsed.path
                if publisher == "sciencedirect" and primary_path.startswith("/retrieve/pii/"):
                    primary_path = primary_path.replace("/retrieve/pii/", "/science/article/pii/", 1)
                resolved_url = urlunparse(parsed._replace(
                    scheme="https", netloc=primary_domain, path=primary_path))""",
            "ScienceDirect primary article URL",
        ),
        (
            package / "sources" / "__init__.py",
            """    finally:
        if sem:
            sem.release()""",
            """    finally:
        if is_browser:
            try:
                from ..browser_engine import shutdown_shared_browser

                shutdown_shared_browser()
            except Exception as cleanup_error:
                log.warning(f"   Browser cleanup failed for {label}: {cleanup_error}")
        if sem:
            sem.release()""",
            "browser worker cleanup",
        ),
    )


def main() -> None:
    if len(sys.argv) > 2:
        raise SystemExit("usage: patch-upstream.py [scansci-package-root]")
    package = Path(sys.argv[1]) if len(sys.argv) == 2 else DEFAULT_PACKAGE
    for target, old, new, label in patches(package):
        source = target.read_text(encoding="utf-8")
        if source.count(old) != 1 or new in source:
            raise SystemExit(f"unexpected scansci-pdf {label} preimage")
        target.write_text(source.replace(old, new), encoding="utf-8")


if __name__ == "__main__":
    main()
