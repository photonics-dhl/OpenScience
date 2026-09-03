from pathlib import Path


PACKAGE = Path("/opt/scansci-venv/lib/python3.12/site-packages/scansci_pdf")
PATCHES = (
    (
        PACKAGE / "_publisher_strategies_core.py",
        'tab_id = create_tab("https://www.google.com/", config, timeout=15.0)',
        'tab_id = create_tab("about:blank", config, timeout=15.0)',
        "browser bootstrap",
    ),
    (
        PACKAGE / "browser_engine.py",
        'proxy = config.get("browser_static_proxy", "")',
        'proxy = os.environ.get("SCANSCI_PDF_PROXY") or config.get("browser_static_proxy", "")',
        "browser proxy",
    ),
    (
        PACKAGE / "browser_engine.py",
        """    context = browser.new_context()

    # Launching the sync API leaves its dispatcher event loop \"running\" in""",
        """    context = browser.new_context()
    session_file = os.environ.get("SCANSCI_PDF_SESSION_FILE", "")
    if session_file and Path(session_file).is_file():
        context.add_cookies(_parse_netscape_cookies(Path(session_file).read_text(encoding="utf-8")))

    # Launching the sync API leaves its dispatcher event loop \"running\" in""",
        "browser session restore",
    ),
)


def main() -> None:
    for target, old, new, label in PATCHES:
        source = target.read_text(encoding="utf-8")
        if source.count(old) != 1 or new in source:
            raise SystemExit(f"unexpected scansci-pdf {label} preimage")
        target.write_text(source.replace(old, new), encoding="utf-8")


if __name__ == "__main__":
    main()
