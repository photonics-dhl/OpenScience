"""Snapshot layout rejection and observable native empty-branch behavior."""
from copy import deepcopy
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest

from sdk_compat import patch_native_sdk_continuation


def native_fixture_source():
    # A small executable flow fixture, retaining the actual 0.10 insertion context.
    return '''from copy import deepcopy
class AIAgent:
    def run_conversation(self, responses):
        messages = []
        api_call_count = 0
        self.legacy_recovery = []
        while (api_call_count < self.max_iterations and self.iteration_budget.remaining > 0) or self._budget_grace_call:
            assistant_message, finish_reason = responses[api_call_count]
            api_call_count += 1
            try:
                if assistant_message.tool_calls:
                    messages.append(self._build_assistant_message(assistant_message, finish_reason))
                else:
                    # No tool calls - this is the final response
                    final_response = assistant_message.content or ""
SDK_BLANK_LINE
                    # Fix: unmute output when entering the no-tool-call branch
                    # so the user can see empty-response warnings and recovery
                    # status messages.  _mute_post_response was set during a
                    # prior housekeeping tool turn and should not silence the
                    # final response path.
                    self._mute_post_response = False
SDK_BLANK_LINE
                    # Check if response only has think block with no actual content after it
                    if not self._has_content_after_think_block(final_response):
                        # ── Partial stream recovery ─────────────────────
                        self.legacy_recovery.append(assistant_message)
                        messages.append({"role": "assistant", "content": "(empty)"})
                        continue
                    messages.append(self._build_assistant_message(assistant_message, finish_reason))
                    break
            finally:
                pass
        return messages, api_call_count
    def _has_content_after_think_block(self, text):
        return bool(text.strip())
    def _build_assistant_message(self, message, reason):
        return {"role": "assistant", "content": message.content, "finish_reason": reason,
                "reasoning_details": deepcopy(message.reasoning_details), "tool_calls": deepcopy(message.tool_calls)}
'''.replace('SDK_BLANK_LINE', ' ' * 20)


def thinking_message():
    return SimpleNamespace(content='', tool_calls=None, reasoning_details=[{
        'type': 'openscience-provider-content', 'provider_content': {
            'provider': 'offline', 'model': 'MiniMax-M3', 'content': [
                {'type': 'thinking', 'thinking': 'Synthetic opaque fixture.', 'signature': 'unchanged'}]}}])


class SdkCompatibilityTests(unittest.TestCase):
    def setUp(self):
        root = Path.cwd()/'tmp/hermes-cleanup-20261003'
        root.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=root, prefix='sdk-compat-')
        self.runtime = Path(self.temp.name)
        self.path = self.runtime/'run_agent.py'
        self.path.write_text(native_fixture_source(), encoding='utf-8')
        (self.runtime/'pyproject.toml').write_text('[project]\nversion = "0.10.0"\n', encoding='utf-8')

    def tearDown(self):
        self.temp.cleanup()

    def agent(self, model='MiniMax-M3', turns=3):
        namespace = {}
        exec(compile(self.path.read_text(encoding='utf-8'), str(self.path), 'exec'), namespace)
        agent = namespace['AIAgent']()
        agent.model = model
        agent.max_iterations = turns
        agent.iteration_budget = SimpleNamespace(remaining=turns)
        agent._budget_grace_call = False
        return agent

    def test_patch_preserves_exact_reply_and_actual_stop_then_uses_the_original_loop(self):
        patch_native_sdk_continuation(self.runtime)
        for reason in ['stop', 'tool_calls']:
            with self.subTest(reason=reason):
                first = thinking_message()
                original = deepcopy(first)
                tool = SimpleNamespace(content='', tool_calls=[{'id': 'real-call'}], reasoning_details=[])
                final = SimpleNamespace(content='Fixture final.', tool_calls=None, reasoning_details=[])
                agent = self.agent()
                messages, calls = agent.run_conversation([(first, reason), (tool, 'tool_calls'), (final, 'stop')])
                self.assertEqual(calls, 3)
                self.assertEqual(messages[0], agent._build_assistant_message(original, reason))
                self.assertEqual(messages[1]['role'], 'user')
                self.assertNotIn('executed tool', messages[1]['content'])
                self.assertEqual([m['content'] for m in messages if m['role'] == 'assistant'], ['', '', 'Fixture final.'])
                self.assertEqual(agent.legacy_recovery, [])
                self.assertEqual(vars(first), vars(original))

    def test_continuous_thinking_consumes_original_loop_limit_without_losing_replies(self):
        patch_native_sdk_continuation(self.runtime)
        agent = self.agent(turns=4)
        messages, calls = agent.run_conversation([(thinking_message(), 'stop')] * 4)
        self.assertEqual(calls, 4)
        self.assertEqual([m['role'] for m in messages], ['assistant', 'user'] * 4)
        self.assertEqual(agent.legacy_recovery, [])

    def test_unknown_duplicate_missing_already_patched_or_wrong_scope_layout_is_not_written(self):
        baseline = native_fixture_source()
        cases = [('', '0.10.0'), (baseline + '\n' + baseline, '0.10.0'),
                 (baseline.replace('Partial stream recovery', 'Changed upstream recovery'), '0.10.0'),
                 (baseline.replace('run_conversation', 'different_method'), '0.10.0'),
                 (baseline.replace('if assistant_message.tool_calls:', 'if True:'), '0.10.0'),
                 (baseline.replace('self.max_iterations and', 'self.max_iterations + 1 and'), '0.10.0'),
                 (baseline.replace('while (api_call_count', 'if (api_call_count'), '0.10.0'),
                 (baseline, '0.21.5')]
        for source, version in cases:
            with self.subTest(version=version, source=source[:30]):
                self.path.write_text(source, encoding='utf-8')
                (self.runtime/'pyproject.toml').write_text(f'[project]\nversion = "{version}"\n', encoding='utf-8')
                before = self.path.read_bytes()
                with self.assertRaises(ValueError):
                    patch_native_sdk_continuation(self.runtime)
                self.assertEqual(self.path.read_bytes(), before)
        self.path.write_text(baseline, encoding='utf-8')
        (self.runtime/'pyproject.toml').write_text('[project]\nversion = "0.10.0"\n', encoding='utf-8')
        patch_native_sdk_continuation(self.runtime)
        before = self.path.read_bytes()
        with self.assertRaises(ValueError):
            patch_native_sdk_continuation(self.runtime)
        self.assertEqual(self.path.read_bytes(), before)

    def test_other_models_uncontrolled_or_malformed_opaque_and_nonempty_text_keep_old_behavior(self):
        patch_native_sdk_continuation(self.runtime)
        cases = []
        for field, value in [('reasoning_details', []), ('reasoning_details', [{}]),
                             ('content', ' '), ('content', '(empty)')]:
            message = thinking_message(); setattr(message, field, value); cases.append((message, 'stop', 'MiniMax-M3'))
        for path, value in [(['type'], 'other'), (['provider_content', 'model'], 'other'),
                            (['provider_content', 'provider'], ''), (['provider_content', 'content'], []),
                            (['provider_content', 'content'], [{'type': 'thinking', 'thinking': ' '}]),
                            (['provider_content', 'content'], [{'type': 'thinking', 'thinking': 42}]),
                            (['provider_content', 'content'], [{'type': 'thinking', 'thinking': 'x', 'signature': 42}]),
                            (['provider_content', 'content'], [{'type': 'text', 'text': ''}])]:
            message = thinking_message(); target = message.reasoning_details[0]
            for key in path[:-1]: target = target[key]
            target[path[-1]] = value
            cases.append((message, 'stop', 'MiniMax-M3'))
        cases.extend([(thinking_message(), 'length', 'MiniMax-M3'), (thinking_message(), 'stop', 'Other-model')])
        for message, reason, model in cases:
            with self.subTest(reason=reason, model=model, content=message.content):
                agent = self.agent(model=model, turns=1)
                messages, _ = agent.run_conversation([(message, reason)])
                self.assertFalse(any(m['role'] == 'user' for m in messages))
                if message.content == '(empty)':
                    self.assertEqual(messages[0]['content'], '(empty)')
                    self.assertEqual(agent.legacy_recovery, [])
                else:
                    self.assertEqual(len(agent.legacy_recovery), 1)


if __name__ == '__main__':
    unittest.main()
