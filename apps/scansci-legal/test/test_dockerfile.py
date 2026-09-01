from pathlib import Path
import re
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
            source.index("ARG SCANSCI_BROWSER_REQUIREMENTS_SHA256"),
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


class BrowserDockerfileContractTests(unittest.TestCase):
    PINNED_BASE = (
        "python:3.12-slim@sha256:"
        "7a8b475003c4fe15a2cd4e55e5cfc2f3560bdc9333d624f24cdd6d4340fd7a17"
    )
    EXPECTED_BROWSER_REQUIREMENTS = {
        "greenlet==3.5.5": (
            "147b25a42e5ca5be3d42356e8f608b37af715a1c196e9bf9d1627f3341adfe1d",
        ),
        "pyee==13.0.0": (
            "48195a3cddb3b1515ce0695ed76036b5ccc2ef3a9f963ff9f77aec0139845498",
        ),
        "patchright==1.62.2": (
            "1b90b6c31c16ce8ed9ce932c168fffd0c7b452cedd833fef4271e6989b56b7bd",
        ),
        "typing-extensions==4.16.0": (
            "481caa481374e813c1b176ada14e97f1f67a4539ce9cfeb3f350d78d6370c2e8",
            "dc983d19a509c94bda722ee6abd33940f7c05a89e243c47e907eb4db6f1a43e5",
        ),
    }

    def test_browser_and_auth_share_one_exact_hashed_patchright_lock(self) -> None:
        lock = (APP_ROOT / "browser-requirements.lock").read_text(encoding="ascii")
        browser = (APP_ROOT / "Dockerfile.browser").read_text(encoding="utf-8")
        auth = (APP_ROOT / "Dockerfile.auth").read_text(encoding="utf-8")
        lines = [line.strip() for line in lock.splitlines() if line.strip()]

        self.assertEqual(len(lines), len(self.EXPECTED_BROWSER_REQUIREMENTS))
        for requirement, hashes in self.EXPECTED_BROWSER_REQUIREMENTS.items():
            matching = [line for line in lines if line.startswith(requirement + " ")]
            self.assertEqual(len(matching), 1)
            self.assertEqual(
                re.findall(r"--hash=sha256:([0-9a-f]{64})", matching[0]),
                list(hashes),
            )
        for dockerfile in (browser, auth):
            self.assertIn(
                "COPY build-requirements.lock requirements.lock browser-requirements.lock ./",
                dockerfile,
            )
            self.assertIn(
                "python -m pip install --require-hashes -r browser-requirements.lock",
                dockerfile,
            )
            self.assertNotIn("/tmp/auth-requirements.lock", dockerfile)

    def test_browser_runtime_is_cpu_only_secretless_and_fixed_identity(self) -> None:
        source = (APP_ROOT / "Dockerfile.browser").read_text(encoding="utf-8")

        self.assertEqual(source.count(f"FROM {self.PINNED_BASE}"), 2)
        self.assertIn(
            "apt-get install -y --no-install-recommends "
            "ca-certificates chromium fonts-noto-cjk tini xvfb",
            source,
        )
        for forbidden in ("novnc", "x11vnc", "websockify", "playwright install"):
            self.assertNotIn(forbidden, source.lower())
        self.assertIn("groupadd --gid 11000", source)
        self.assertIn("useradd --uid 10002 --gid 11000", source)
        self.assertIn("USER 10002:11000", source)
        self.assertIn("org.openscience.scansci.role=browser", source)
        self.assertIn("/browser-inputs", source)
        self.assertIn("/browser-outputs", source)
        self.assertIn("/browser-profile-jobs", source)
        self.assertIn("/tmp/scansci-browser", source)
        self.assertIn("/opt/scansci-browser-packages.txt", source)
        self.assertIn(
            'ENTRYPOINT ["/usr/bin/tini", "-g", "--", '
            '"/usr/local/bin/scansci-browser-entrypoint"]',
            source,
        )
        for forbidden in (
            "SCANSCI_SERVICE_TOKEN", "/run/secrets", "/session", "VOLUME ",
            "EXPOSE ", "HEALTHCHECK ",
        ):
            self.assertNotIn(forbidden, source)

    def test_browser_entrypoint_waits_for_private_xvfb_then_execs_worker(self) -> None:
        source = (APP_ROOT / "browser-entrypoint.sh").read_text(encoding="utf-8")

        self.assertIn("umask 077", source)
        self.assertIn('DISPLAY=":99"', source)
        self.assertIn('Xvfb "$DISPLAY" -screen 0 1280x800x24 -nolisten tcp', source)
        self.assertIn('/tmp/.X11-unix/X99', source)
        self.assertIn('install -d -m 0700 "$HOME" /tmp/scansci-browser', source)
        self.assertIn('kill -0 "$xvfb_pid"', source)
        self.assertIn("trap cleanup EXIT INT TERM", source)
        self.assertIn("exec python -m scansci_legal.browser_worker", source)
        for forbidden in ("novnc", "x11vnc", "websockify", "6080", "5900"):
            self.assertNotIn(forbidden, source.lower())

    def test_browser_wrapper_has_one_executable_and_no_direct_egress_escape(self) -> None:
        source = (APP_ROOT / "chromium-container-wrapper.sh").read_text(encoding="utf-8")

        self.assertIn("exec /usr/bin/chromium", source)
        self.assertIn('"--proxy-server=$proxy"', source)
        self.assertIn("--disable-quic", source)
        self.assertIn("--force-webrtc-ip-handling-policy=disable_non_proxied_udp", source)
        for forbidden in (
            "latest", "playwright install", "--channel", "chrome-headless-shell",
        ):
            self.assertNotIn(forbidden, source.lower())


if __name__ == "__main__":
    unittest.main()
