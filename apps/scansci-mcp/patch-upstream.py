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
)


def main() -> None:
    for target, old, new, label in PATCHES:
        source = target.read_text(encoding="utf-8")
        if source.count(old) != 1 or new in source:
            raise SystemExit(f"unexpected scansci-pdf {label} preimage")
        target.write_text(source.replace(old, new), encoding="utf-8")


if __name__ == "__main__":
    main()
