import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const wrapperPath = fileURLToPath(new URL('../auth-login.py', import.meta.url));

const harness = String.raw`
import importlib.util
import os
import sys
import types

wrapper_path = sys.argv[1]
expected_proxy = "http://openscience-egress:7891"
calls = []
control = {"config": {}, "outcome": True}

def official_launch(*args, **kwargs):
    calls.append((args, kwargs))
    return "official-browser"

browser_login = types.ModuleType("scansci_pdf.browser_login")
browser_login.launch = official_launch
config_module = types.ModuleType("scansci_pdf.config")
config_module.load_config = lambda: dict(control["config"])

class FakeClient:
    instances = []

    def __init__(self, config):
        self.config = config
        self.login_calls = []
        self.closed = False
        self.__class__.instances.append(self)

    def login(self, publisher, force=False):
        self.login_calls.append((publisher, force))
        outcome = control["outcome"]
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome

    def close(self):
        self.closed = True

carsi_module = types.ModuleType("scansci_pdf.sources.carsi")
carsi_module.CARSIClient = FakeClient
sources_module = types.ModuleType("scansci_pdf.sources")
sources_module.__path__ = []
package = types.ModuleType("scansci_pdf")
package.__path__ = []
package.browser_login = browser_login
sys.modules.update({
    "scansci_pdf": package,
    "scansci_pdf.browser_login": browser_login,
    "scansci_pdf.config": config_module,
    "scansci_pdf.sources": sources_module,
    "scansci_pdf.sources.carsi": carsi_module,
})

spec = importlib.util.spec_from_file_location("openscience_auth_login", wrapper_path)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)

os.environ["SCANSCI_PDF_PROXY"] = expected_proxy
module.install_proxy_override({})
assert browser_login.launch is not official_launch
result = browser_login.launch(
    "positional",
    headless=False,
    args=["--no-proxy-server", "--proxy-server=http://wrong", "--keep-this"],
)
assert result == "official-browser"
assert calls == [
    (("positional",), {
        "headless": False,
        "args": ["--keep-this", f"--proxy-server={expected_proxy}"],
    })
]

for configured, environment in [({}, ""), ({"network_proxy": expected_proxy}, "http://wrong")]:
    if environment:
        os.environ["SCANSCI_PDF_PROXY"] = environment
    else:
        os.environ.pop("SCANSCI_PDF_PROXY", None)
    browser_login.launch = official_launch
    try:
        module.install_proxy_override(configured)
    except RuntimeError:
        pass
    else:
        raise AssertionError("missing or unexpected proxy was accepted")

os.environ.pop("SCANSCI_PDF_PROXY", None)
browser_login.launch = official_launch
module.install_proxy_override({"network_proxy": expected_proxy})
assert browser_login.launch is not official_launch

def run_main(outcome):
    control["config"] = {"network_proxy": expected_proxy}
    control["outcome"] = outcome
    FakeClient.instances.clear()
    browser_login.launch = official_launch
    os.environ["SCANSCI_PDF_PROXY"] = expected_proxy
    try:
        result = module.main(["auth-login.py", "sciencedirect"])
    except BaseException as exc:
        result = exc
    assert len(FakeClient.instances) == 1
    client = FakeClient.instances[0]
    assert client.login_calls == [("sciencedirect", True)]
    assert client.closed is True
    return result

assert run_main(True) == 0
assert run_main(False) == 1
failure = RuntimeError("login failed")
assert run_main(failure) is failure
print("AUTH_LOGIN_BEHAVIOR_OK")
`;

test('official CARSI wrapper enforces the fixed proxy and closes every client lifecycle', () => {
  const candidates = process.platform === 'win32' ? ['python'] : ['python3', 'python'];
  let result;
  for (const candidate of candidates) {
    result = spawnSync(candidate, ['-c', harness, wrapperPath], { encoding: 'utf8' });
    if (result.error?.code !== 'ENOENT') break;
  }

  assert.ok(result, 'Python runtime was not attempted');
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /AUTH_LOGIN_BEHAVIOR_OK/);
});
