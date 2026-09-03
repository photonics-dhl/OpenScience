from pathlib import Path


TARGET = Path(
    "/opt/scansci-venv/lib/python3.12/site-packages/"
    "scansci_pdf/_publisher_strategies_core.py"
)
OLD = 'tab_id = create_tab("https://www.google.com/", config, timeout=15.0)'
NEW = 'tab_id = create_tab("about:blank", config, timeout=15.0)'


def main() -> None:
    source = TARGET.read_text(encoding="utf-8")
    if source.count(OLD) != 1 or NEW in source:
        raise SystemExit("unexpected scansci-pdf browser bootstrap preimage")
    TARGET.write_text(source.replace(OLD, NEW), encoding="utf-8")


if __name__ == "__main__":
    main()
