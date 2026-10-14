"""Pure native task metadata checks. No Agent, provider, environment file or model request."""
from pathlib import Path
import os
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import task_runtime
from task_agent import NativeTaskStopped, create_task_agent_class
from task_runtime import write_task_model_context


class NativeContextTests(unittest.TestCase):
    def test_first_turn_bootstrap_caches_the_real_sdk_prompt_and_keeps_replay_immutable(self):
        built = []; calls = []
        def build(instructions):
            built.append(instructions)
            return 'Native identity\n\n' + instructions + '\n\nNative skill guidance and session date'
        class NativeBuilder:
            def _build_system_prompt(self, instructions): return build(instructions)
        agent = create_task_agent_class(NativeBuilder, lambda: None, {'skill_view'})()
        def call(path, value): calls.append((path, value)); return {'bound': True}
        config = {'instructions': 'Worker instructions', 'goal': 'Worker goal'}
        task_runtime.bind_native_first_turn(agent, config, call)
        self.assertEqual(built, [])
        self.assertEqual(calls, [])
        # The native loop itself invokes and caches this builder; its first-session
        # hook remains in that loop, rather than being skipped by prebuilt cache.
        agent._cached_system_prompt = agent._build_system_prompt(config['instructions'])
        self.assertEqual(built, ['Worker instructions'])
        self.assertEqual(calls[-1], ('/task/config', {'systemPrompt': agent._cached_system_prompt}))
        original = agent._cached_system_prompt
        task_runtime.bind_native_first_turn(agent, {**config, 'systemPrompt': original}, call)
        self.assertEqual(built, ['Worker instructions'])
        self.assertEqual(agent._cached_system_prompt, original)

    def test_transport_authenticates_both_control_and_sdk_requests_without_exposing_the_capability(self):
        captured = []
        class Request:
            url = SimpleNamespace(host='openscience-worker')
            def __init__(self): self.headers = {'Authorization': 'Bearer public-sdk-label'}
        class HTTPTransport:
            def __init__(self, **_kwargs): pass
            def handle_request(self, request):
                captured.append(dict(request.headers))
                return SimpleNamespace(status_code=200)
            def close(self): pass
        httpx = SimpleNamespace(BaseTransport=object, HTTPTransport=HTTPTransport)
        with patch.dict(sys.modules, {'httpx': httpx}):
            cls = task_runtime.worker_transport_class('a' * 64)
            for _ in range(2): cls().handle_request(Request())
        self.assertEqual(captured, [{'Authorization': 'Bearer public-sdk-label',
            'x-openscience-native-caller': 'a' * 64}] * 2)

    def test_private_credential_is_required_and_is_never_embedded_in_stop_errors(self):
        for value in ['', 'fixture-secret', 'b' * 63, 'b' * 65, 'G' * 64, 'b' * 64 + '\n']:
            with self.subTest(length=len(value)):
                with tempfile.TemporaryDirectory(dir=Path.cwd()) as folder:
                    path = Path(folder)/'native-caller'; path.write_text(value)
                    with self.assertRaises(NativeTaskStopped) as stopped:
                        task_runtime.read_caller_credential(path)
                    self.assertNotIn('fixture-secret', str(stopped.exception))

    def test_unknown_transport_error_discards_its_request_and_credential_context(self):
        class HTTPTransport:
            def __init__(self, **_kwargs): pass
            def handle_request(self, request): raise RuntimeError(str(request.headers))
        httpx = SimpleNamespace(BaseTransport=object, HTTPTransport=HTTPTransport)
        with patch.dict(sys.modules, {'httpx': httpx}):
            transport = task_runtime.worker_transport_class('b' * 64)()
            with self.assertRaises(NativeTaskStopped) as stopped:
                transport.handle_request(SimpleNamespace(url=SimpleNamespace(host='openscience-worker'), headers={}))
        self.assertNotIn('b' * 64, str(stopped.exception))
        self.assertTrue(stopped.exception.__suppress_context__)

    def test_startup_fixes_sdk_waits_to_610_after_clearing_inherited_environment(self):
        with patch.dict(os.environ, {'OPENSCIENCE_NATIVE_INSTANCE': 'invalid-fixture',
                'HERMES_API_CALL_STALE_TIMEOUT': '1', 'HERMES_API_TIMEOUT': '1800',
                'UNTRUSTED_PARENT_SETTING': 'discard'}, clear=True), \
                patch.dict(sys.modules, {'httpx': SimpleNamespace()}), patch.object(sys, 'path', list(sys.path)):
            # Reject the fixture identity before any socket/client/model is created.
            with self.assertRaisesRegex(NativeTaskStopped, 'Native unit identity is unavailable'):
                task_runtime.main()
            self.assertEqual(os.environ.get('HERMES_API_CALL_STALE_TIMEOUT'), '610')
            self.assertEqual(os.environ.get('HERMES_API_TIMEOUT'), '610')
            self.assertNotIn('UNTRUSTED_PARENT_SETTING', os.environ)

    def test_writes_only_the_trusted_capacity_and_keeps_native_context_management_enabled(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as folder:
            root = Path(folder)
            write_task_model_context(root, {'contextWindowTokens': 512000})
            self.assertEqual((root/'config.yaml').read_text(), 'model:\n  context_length: 512000\n')

    def test_unknown_model_metadata_uses_the_native_resolver(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as folder:
            root = Path(folder)
            write_task_model_context(root, {})
            self.assertFalse((root/'config.yaml').exists())

    def test_invalid_metadata_cannot_inject_yaml_or_start_a_model(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as folder:
            root = Path(folder)
            for value in [True, -1, 0, 1000001, '512000\napi_key: forbidden']:
                with self.subTest(value=value), self.assertRaises(ValueError):
                    write_task_model_context(root, {'contextWindowTokens': value})
            self.assertFalse((root/'config.yaml').exists())


if __name__ == '__main__':
    unittest.main()
