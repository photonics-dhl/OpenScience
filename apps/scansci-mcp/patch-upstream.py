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
                merged = {
                    (c.get("name", ""), c.get("domain", ""), c.get("path", "/")): c
                    for c in saved
                }
                for cookie in official:
                    key = (cookie.get("name", ""), cookie.get("domain", ""), cookie.get("path", "/"))
                    merged[key] = cookie
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
