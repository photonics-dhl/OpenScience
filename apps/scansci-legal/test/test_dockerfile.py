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

    def test_auth_browser_uses_the_outer_container_as_its_sandbox_boundary(self) -> None:
        dockerfile = (APP_ROOT / "Dockerfile.auth").read_text(encoding="utf-8")
        entrypoint = (APP_ROOT / "auth-entrypoint.sh").read_text(encoding="utf-8")
        wrapper = (APP_ROOT / "chromium-container-wrapper.sh").read_text(encoding="utf-8")

        self.assertIn("COPY --chmod=0555 chromium-container-wrapper.sh", dockerfile)
        self.assertIn("ln -s /usr/local/bin/scansci-chromium /opt/google/chrome/chrome", dockerfile)
        self.assertNotIn("ln -s /usr/bin/chromium /opt/google/chrome/chrome", dockerfile)
        self.assertIn("SCANSCI_BROWSER_PROXY", wrapper)
        self.assertNotIn('if [ -z "$proxy" ]', wrapper)
        self.assertIn('"--proxy-server=$proxy"', wrapper)
        self.assertIn("--disable-quic", wrapper)
        self.assertIn("--force-webrtc-ip-handling-policy=disable_non_proxied_udp", wrapper)
        self.assertIn('"$argument" != "--no-proxy-server"', wrapper)
        self.assertNotIn("chromium \\\n  --user-data-dir", entrypoint)


if __name__ == "__main__":
    unittest.main()
