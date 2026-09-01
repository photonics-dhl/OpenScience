"""One-shot contract check for the immutable ScanSci browser integration."""

from __future__ import annotations

from .strict_browser import _strict_scansci_visible_browser, install_strict_scansci_browser


SUCCESS = "STRICT_BROWSER_ADAPTER_OK"


def verify_pinned_source_adapter() -> None:
    """Prove the installed upstream source accepts only our strict adapter."""

    from scansci_pdf import publisher_strategies
    from scansci_pdf.sources import carsi

    original = publisher_strategies._visible_browser
    try:
        install_strict_scansci_browser(publisher_strategies, carsi)
        if publisher_strategies._visible_browser is not _strict_scansci_visible_browser:
            raise RuntimeError("strict browser adapter was not installed")
    finally:
        publisher_strategies._visible_browser = original


def main() -> None:
    verify_pinned_source_adapter()
    print(SUCCESS)


if __name__ == "__main__":
    main()
