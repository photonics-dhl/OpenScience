from pathlib import Path
import unittest


APP_ROOT = Path(__file__).resolve().parents[1]


class AuthDockerfileContractTests(unittest.TestCase):
    def test_release_metadata_cannot_invalidate_the_stable_browser_layer(self) -> None:
        source = (APP_ROOT / "Dockerfile.auth").read_text(encoding="utf-8")
        browser_layer = source.index("RUN apt-get update")
        release_arguments = [
            source.index("ARG XGS_RELEASE_IMAGE_TAG"),
            source.index("ARG SCANSCI_ARCHIVE_SHA256"),
            source.index("ARG SCANSCI_REQUIREMENTS_SHA256"),
            source.index("ARG SCANSCI_BUILD_REQUIREMENTS_SHA256"),
        ]
        source_label = source.index("LABEL org.openscience.source=$XGS_RELEASE_IMAGE_TAG")

        self.assertTrue(all(browser_layer < argument for argument in release_arguments))
        self.assertTrue(all(argument < source_label for argument in release_arguments))


if __name__ == "__main__":
    unittest.main()
