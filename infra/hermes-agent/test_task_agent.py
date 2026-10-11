"""Local adapter tests; the actual installed AIAgent loop is exercised by offline_native_loop.py."""
import json
from pathlib import Path
import tempfile
import os
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from task_agent import NativeTaskStopped, SkillScope, create_task_agent_class, guard_registered_tools


class NativeStub:
    def _execute_tool_calls(self, message, messages, task_id, api_call_count=0):
        messages.append("executed")


class AdapterTests(unittest.TestCase):
    def stopped_response_fixture(self, response=None, error=None):
        calls = []
        history = [{'role': 'assistant', 'content': 'Saved paid reply.', 'reasoning_details': [{'opaque': 'original'}]}]
        class NativeConversation:
            def _interruptible_api_call(self, request):
                calls.append(request)
                if error is not None:
                    raise error
                return response
            def run_conversation(self, *args, **kwargs):
                # Model native's ordinary-Exception/invalid-response retry boundary.
                for _ in range(2):
                    try:
                        result = self._interruptible_api_call({'messages': history})
                    except Exception:
                        continue
                    if result is not None:
                        return {'final_response': 'Completed', 'messages': history}
                return {'error': 'Native retries exhausted', 'messages': history}
        agent = create_task_agent_class(NativeConversation, lambda: None, {'paper_read'})()
        return agent, calls, history

    def test_missing_sdk_reply_stops_before_native_retry_and_preserves_paid_history(self):
        agent, calls, history = self.stopped_response_fixture()
        before = json.dumps(history)
        with self.assertRaisesRegex(NativeTaskStopped, 'no valid SDK reply; original paid receipts remain authoritative'):
            agent.run_conversation('Original task')
        self.assertEqual(len(calls), 1)
        self.assertEqual(json.dumps(history), before)
        self.assertIsNone(agent._native_last_context_tokens)

    def test_native_stale_timeout_stops_before_native_retry_and_preserves_paid_history(self):
        timeout = TimeoutError('Non-streaming API call timed out (threshold: 610s)')
        agent, calls, history = self.stopped_response_fixture(error=timeout)
        before = json.dumps(history)
        with self.assertRaisesRegex(NativeTaskStopped, 'no valid SDK reply; original paid receipts remain authoritative') as caught:
            agent.run_conversation('Original task')
        self.assertIs(caught.exception.__cause__, timeout)
        self.assertEqual(len(calls), 1)
        self.assertEqual(json.dumps(history), before)
        self.assertIsNone(agent._native_last_context_tokens)

    def test_valid_sdk_reply_is_returned_intact_and_still_records_actual_context_usage(self):
        response = SimpleNamespace(usage=SimpleNamespace(openscience_context_input_tokens=4933),
            choices=[{'message': {'content': '', 'reasoning_details': [{'opaque': 'exact paid reply'}]}}])
        agent, calls, _ = self.stopped_response_fixture(response=response)
        self.assertIs(agent._interruptible_api_call({'messages': []}), response)
        self.assertEqual(len(calls), 1)
        self.assertEqual(agent._native_last_context_tokens, 4933)

    def test_iteration_exhaustion_stops_without_native_summary_or_changes_to_paid_history(self):
        for limit in [32, 5]:
            with self.subTest(limit=limit):
                messages = [{'role': 'assistant', 'content': '', 'tool_calls': [{'id': f'paid-{limit}'}]},
                    {'role': 'tool', 'tool_call_id': f'paid-{limit}', 'content': ' {"status":"invalid_draft"}\n'}]
                before = json.dumps(messages)
                summary_calls = []
                class NativeConversation:
                    def __init__(self):
                        self.max_iterations = limit
                        self._api_call_count = limit
                    def run_conversation(self, *args, **kwargs):
                        return {'final_response': self._handle_max_iterations(messages, self._api_call_count)}
                    def _handle_max_iterations(self, history, count):
                        history.append({'role': 'user', 'content': 'Native summary request'})
                        summary_calls.append(count)
                        return 'Synthetic final summary'
                agent = create_task_agent_class(NativeConversation, lambda: None, {'paper_draft'})()
                with self.assertRaises(NativeTaskStopped):
                    agent.run_conversation('Bound task')
                self.assertEqual(json.dumps(messages), before)
                self.assertEqual(summary_calls, [])
                self.assertEqual(agent.max_iterations, limit)
                self.assertEqual(agent._api_call_count, limit)

    def test_exhaustion_during_existing_format_continuation_restores_its_original_limit(self):
        summary_calls = []
        class NativeConversation:
            def __init__(self):
                self.max_iterations = 8
                self.runs = 0
            def run_conversation(self, *args, **kwargs):
                self.runs += 1
                if self.runs == 1:
                    return {'api_calls': 3, 'messages': [{'role': 'assistant', 'content': 'Incomplete', 'finish_reason': 'tool_calls'}]}
                return {'final_response': self._handle_max_iterations(kwargs['conversation_history'], self.max_iterations)}
            def _handle_max_iterations(self, messages, count):
                summary_calls.append(count)
                return 'Synthetic final summary'
        agent = create_task_agent_class(NativeConversation, lambda: None, {'paper_draft'})()
        with self.assertRaises(NativeTaskStopped):
            agent.run_conversation('Bound task')
        self.assertEqual(agent.runs, 2)
        self.assertEqual(agent.max_iterations, 8)
        self.assertIsNone(agent._native_format_context)
        self.assertEqual(summary_calls, [])

    def continuation_fixture(self, context_tokens=1000, mutation=None, threshold=256000, fail=False):
        history=[{'role':'user','content':'Original goal'}, {'role':'assistant','content':'Preparing review.',
            'finish_reason':'tool_calls','reasoning_details':[{'opaque':'unchanged'}]}]
        compressed=[];observed=[]
        class NativeConversation:
            def __init__(self):
                self.max_iterations=8;self._cached_system_prompt='Actual original system'
                self.context_compressor=SimpleNamespace(threshold_tokens=threshold);self.runs=0
            def _interruptible_api_call(self, request):
                observed.append(getattr(self,'_native_format_context',None))
                if fail and self.runs==2:raise RuntimeError('transport stopped')
                return SimpleNamespace(usage=SimpleNamespace(openscience_context_input_tokens=context_tokens))
            def _compress_context(self,messages,system_message,**kwargs):
                compressed.append(kwargs.get('approx_tokens'))
                return messages,'Compressed system'
            def run_conversation(self,user_message,system_message=None,conversation_history=None,task_id=None,**kwargs):
                self.runs+=1
                if self.runs==1:
                    self._interruptible_api_call({})
                    return {'messages':history,'final_response':'Preparing review.','api_calls':3,'completed':True}
                messages=[*conversation_history,{'role':'user','content':user_message}]
                if mutation=='history':messages[0]={'role':'user','content':'Changed goal'}
                if mutation=='cached-system':self._cached_system_prompt='Changed actual system'
                result=self._compress_context(messages,system_message,approx_tokens=900000,task_id=task_id)
                observed.append(result[1])
                self._interruptible_api_call({})
                return {'messages':messages,'final_response':'Done.','api_calls':1,'completed':True}
        cls=create_task_agent_class(NativeConversation,lambda:None,{'paper_read'})
        return cls(),compressed,observed

    def test_continuation_uses_known_context_without_counting_existing_image_base64_again(self):
        agent,compressed,observed=self.continuation_fixture()
        agent.run_conversation('Original goal',system_message='Instructions',task_id='same-task')
        self.assertEqual(compressed,[])
        self.assertIn('Actual original system',observed)
        self.assertIsNone(observed[-1])
        self.assertIsNone(getattr(agent,'_native_format_context',None))

    def test_continuation_missing_invalid_or_changed_context_uses_original_compressor(self):
        for tokens,mutation in [(None,None),(-1,None),(1.5,None),(True,None),(1000,'history'),(1000,'cached-system')]:
            with self.subTest(tokens=tokens,mutation=mutation):
                agent,compressed,_=self.continuation_fixture(context_tokens=tokens,mutation=mutation)
                agent.run_conversation('Original goal',system_message='Instructions',task_id='same-task')
                self.assertEqual(compressed,[900000])

    def test_continuation_over_threshold_uses_compressor_and_does_not_leak_into_later_calls(self):
        agent,compressed,_=self.continuation_fixture(context_tokens=256000)
        agent.run_conversation('Original goal',system_message='Instructions',task_id='same-task')
        self.assertGreater(compressed[0],256000)
        agent._compress_context([], 'Instructions', approx_tokens=700000)
        self.assertEqual(compressed[-1],700000)

    def test_continuation_exception_clears_context_and_restores_iteration_limit(self):
        agent,_,_=self.continuation_fixture(fail=True)
        with self.assertRaises(RuntimeError):agent.run_conversation('Original goal',system_message='Instructions',task_id='same-task')
        self.assertIsNone(getattr(agent,'_native_format_context',None))
        self.assertEqual(agent.max_iterations,8)

    def test_missing_call_never_reopens_exhausted_errored_or_interrupted_native_results(self):
        for patch in [{'api_calls':8},{'api_calls':0},{'error':'failed'},{'interrupted':True},{'partial':True}]:
            with self.subTest(patch=patch):
                calls=[]
                class NativeConversation:
                    def __init__(self):self.max_iterations=8
                    def run_conversation(self,*args,**kwargs):
                        calls.append(kwargs)
                        return {'api_calls':2,'messages':[{'role':'assistant','content':'Incomplete','finish_reason':'tool_calls'}],**patch}
                cls=create_task_agent_class(NativeConversation,lambda:None,{'paper_read'})
                with self.assertRaises(NativeTaskStopped):cls().run_conversation('Goal',task_id='same')
                self.assertEqual(len(calls),1)

    def test_repeated_missing_call_stops_after_one_native_correction_and_restores_the_limit(self):
        calls=[]
        class NativeConversation:
            def __init__(self):self.max_iterations=8
            def run_conversation(self,*args,**kwargs):
                calls.append(kwargs)
                return {'api_calls':2,'messages':[{'role':'assistant','content':'Incomplete','finish_reason':'tool_calls'}]}
        cls=create_task_agent_class(NativeConversation,lambda:None,{'paper_read'});agent=cls()
        with self.assertRaises(NativeTaskStopped):agent.run_conversation('Goal',task_id='same')
        self.assertEqual(len(calls),2)
        self.assertEqual(agent.max_iterations,8)

    def test_missing_tool_call_reenters_the_native_loop_with_exact_history_and_remaining_budget_once(self):
        history=[{'role':'user','content':'Original goal'}, {'role':'assistant','content':'Preparing the draft.',
            'finish_reason':'tool_calls','reasoning_details':[{'opaque':'unchanged'}]}]
        calls=[]
        class NativeConversation:
            def __init__(self):self.max_iterations=8
            def run_conversation(self,user_message,system_message=None,conversation_history=None,task_id=None,**kwargs):
                calls.append((user_message,system_message,conversation_history,task_id,self.max_iterations))
                if len(calls)==1:return {'messages':history,'final_response':'Preparing the draft.','api_calls':3,'completed':True}
                return {'messages':[*conversation_history,{'role':'user','content':user_message},
                    {'role':'assistant','content':'Done.','finish_reason':'stop'}],'final_response':'Done.','api_calls':2,'completed':True}
        cls=create_task_agent_class(NativeConversation,lambda:None,{'paper_read'})
        agent=cls();result=agent.run_conversation('Original goal',system_message='Original scope',task_id='same-task')
        self.assertEqual(result['final_response'],'Done.')
        self.assertEqual(len(calls),2)
        self.assertEqual(calls[1][2],history)
        self.assertEqual(calls[1][1],'Original scope')
        self.assertEqual(calls[1][3],'same-task')
        self.assertEqual(calls[1][4],5)
        self.assertEqual(result['api_calls'],5)
        self.assertEqual(agent.max_iterations,8)

    def guarded_skill(self, root, calls, authorize):
        entry = SimpleNamespace(name='skill_view', toolset='skills', schema={},
            handler=lambda args, **_kwargs: calls.append(args) or json.dumps({'success': True}),
            check_fn=None, requires_env=[], is_async=False, description='', emoji='', max_result_size_chars=None)
        registry = SimpleNamespace(get_entry=lambda _name: entry, register=lambda **fields: setattr(entry, 'handler', fields['handler']))
        guard_registered_tools(registry, {'skill_view'}, authorize, SkillScope(root))
        return entry.handler

    def test_unknown_plugin_name_returns_feedback_then_native_handler_accepts_real_skill(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); skill = root/'science'/'paper-method';skill.mkdir(parents=True)
            (skill/'SKILL.md').write_text('method');calls=[];authorized=[]
            handler=self.guarded_skill(root,calls,lambda name,args:authorized.append((name,args)))
            feedback=json.loads(handler({'name':'science:paper-method'}))
            self.assertFalse(feedback['success']);self.assertIn('skills_list',feedback['error']);self.assertEqual(calls,[])
            self.assertTrue(json.loads(handler({'name':'paper-method'}))['success'])
            self.assertEqual(calls,[{'name':'paper-method'}]);self.assertEqual(len(authorized),2)

    def test_missing_reference_returns_feedback_without_invoking_native_handler(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);skill=root/'science'/'paper-method';skill.mkdir(parents=True)
            (skill/'SKILL.md').write_text('method');calls=[]
            handler=self.guarded_skill(root,calls,lambda *_args:None)
            self.assertFalse(json.loads(handler({'name':'paper-method','file_path':'references/absent.md'}))['success'])
            self.assertEqual(calls,[])

    def test_unknown_skill_does_not_hide_revoked_authority(self):
        with tempfile.TemporaryDirectory() as directory:
            calls=[];checks=[]
            def revoked(*args):checks.append(args);raise PermissionError('revoked')
            handler=self.guarded_skill(Path(directory),calls,revoked)
            with self.assertRaises(NativeTaskStopped):handler({'name':'science:paper-method'})
            self.assertEqual(calls,[])
            self.assertEqual(len(checks),1)

    def test_skill_reference_permission_error_is_not_recoverable(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);skill=root/'science'/'paper-method';skill.mkdir(parents=True)
            (skill/'SKILL.md').write_text('method');calls=[]
            handler=self.guarded_skill(root,calls,lambda *_args:None)
            with patch.object(Path,'stat',side_effect=PermissionError('denied')), self.assertRaises(NativeTaskStopped):
                handler({'name':'paper-method','file_path':'reference.md'})
            self.assertEqual(calls,[])

    @unittest.skipUnless(os.name=='posix','Needs real filesystem symlinks')
    def test_missing_escape_symlink_still_stops_instead_of_returning_selection_feedback(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);skill=root/'science'/'paper-method';skill.mkdir(parents=True)
            (skill/'SKILL.md').write_text('method');(skill/'broken.md').symlink_to(root/'outside'/'absent.md');calls=[]
            handler=self.guarded_skill(root,calls,lambda *_args:None)
            with self.assertRaises(NativeTaskStopped):handler({'name':'paper-method','file_path':'broken.md'})
            self.assertEqual(calls,[])

    def test_authority_failure_never_reaches_the_original_native_handler(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            calls = []
            entry = SimpleNamespace(name="skills_list", toolset="skills", schema={}, handler=lambda *_args, **_kwargs: calls.append("executed"),
                check_fn=None, requires_env=[], is_async=False, description="", emoji="", max_result_size_chars=None)
            registry = SimpleNamespace(get_entry=lambda _name: entry, register=lambda **fields: setattr(entry, "handler", fields["handler"]))
            def denied(_name, _args):
                raise PermissionError("revoked")
            guard_registered_tools(registry, {"skills_list"}, denied, SkillScope(root))
            with self.assertRaises(NativeTaskStopped):
                entry.handler({})
            self.assertEqual(calls, [])

    def test_dispatch_rejects_unadvertised_tool_before_native_execution(self):
        cls = create_task_agent_class(NativeStub, lambda: None, {"skill_view"})
        agent = cls()
        messages = []
        call = SimpleNamespace(function=SimpleNamespace(name="terminal"))
        with self.assertRaises(NativeTaskStopped):
            agent._execute_tool_calls(SimpleNamespace(tool_calls=[call]), messages, "task")
        self.assertEqual(messages, [])

    def test_allowed_tool_keeps_the_native_execution_method(self):
        cls = create_task_agent_class(NativeStub, lambda: None, {"skill_view"})
        messages = []
        cls()._execute_tool_calls(SimpleNamespace(tool_calls=[SimpleNamespace(function=SimpleNamespace(name="skill_view"))]), messages, "task")
        self.assertEqual(messages, ["executed"])

    def test_skill_reference_stays_inside_the_selected_installed_skill(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            skill = root / "science" / "paper-method"
            (skill / "references").mkdir(parents=True)
            (skill / "SKILL.md").write_text("method")
            (skill / "references" / "geometry.md").write_text("check locations")
            scope = SkillScope(root)
            self.assertEqual(scope.resolve("paper-method", "references/geometry.md"), skill / "references" / "geometry.md")
            for name, file_path in [(str(skill), None), ("../science/paper-method", None),
                                    ("paper-method", "../../private.txt")]:
                with self.subTest(name=name, file_path=file_path), self.assertRaises(NativeTaskStopped):
                    scope.resolve(name, file_path)

    def test_ambiguous_skill_alias_is_not_allowed_to_select_the_first_match(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for group in ["a", "b"]:
                skill = root / group / "same"
                skill.mkdir(parents=True)
                (skill / "SKILL.md").write_text(group)
            scope = SkillScope(root)
            with self.assertRaises(ValueError):
                scope.resolve("same")
            self.assertEqual(scope.resolve("a/same"), root / "a" / "same" / "SKILL.md")


class PaperReceiptTests(unittest.TestCase):
    """Native budget behavior is stubbed here; captured native methods have a separate offline replay."""
    @staticmethod
    def receipt(size):
        return json.dumps({'text': 'x' * (size - len(json.dumps({'text': ''})))})

    @staticmethod
    def call(call_id='paper-1', name='paper_read', args=None):
        return SimpleNamespace(id=call_id, function=SimpleNamespace(name=name, arguments=json.dumps(args or {})))

    def fixture(self, calls, originals, fault=None, prior=None, page_images=None):
        native_observed = []
        class NativeBudget:
            def __init__(self):
                self.tool_complete_callback = prior
            def _execute_tool_calls(self, message, messages, task_id, api_call_count=0):
                start = len(messages)
                for call in message.tool_calls:
                    value = originals[call.id]
                    event = [call.id, call.function.name, json.loads(call.function.arguments), value]
                    if fault == 'unknown-id': event[0] = 'unknown'
                    if fault == 'wrong-name': event[1] = 'paper_other'
                    if fault == 'skill-name': event[1] = 'skill_view'
                    if fault == 'wrong-args': event[2] = {'page': 2}
                    if fault == 'bool-for-number': event[2] = {'page': True}
                    if fault == 'non-string': event[3] = {'error': 'not a receipt string'}
                    if self.tool_complete_callback and fault != 'missing-callback':
                        for _ in range(2 if fault == 'duplicate-callback' else 1):
                            try:
                                self.tool_complete_callback(*event)
                            except Exception:
                                pass  # The installed native runtime swallows callback exceptions.
                    if fault == 'native-error': raise RuntimeError('native stopped')
                    if fault != 'missing-message':
                        item = {'role': 'tool', 'tool_call_id': call.id,
                            'content': value if len(value) <= 100_000 else 'NATIVE_PERSISTED_PREVIEW'}
                        messages.append(item)
                        if fault == 'duplicate-message': messages.append(dict(item))
                        if fault == 'unknown-message': messages.append({**item, 'tool_call_id': 'unknown'})
                current = messages[start:]
                if sum(len(item['content']) for item in current) > 200_000:
                    max(current, key=lambda item: len(item['content']))['content'] = 'NATIVE_AGGREGATE_PREVIEW'
                native_observed.extend(dict(item) for item in current)
                return 'native-return'
        cls = create_task_agent_class(NativeBudget, lambda: None, {'paper_read', 'paper_view', 'paper_image_view', 'skill_view'}, page_images)
        return cls(), SimpleNamespace(tool_calls=calls), native_observed

    def test_exact_102278_character_receipt_survives_native_per_result_persistence(self):
        original = self.receipt(102278)
        agent, turn, observed = self.fixture([self.call()], {'paper-1': original})
        messages = []
        self.assertEqual(agent._execute_tool_calls(turn, messages, 'task'), 'native-return')
        self.assertEqual(observed[0]['content'], 'NATIVE_PERSISTED_PREVIEW')
        self.assertEqual(messages[0]['content'], original)

    def test_aggregate_over_200000_preserves_current_paper_receipts_and_old_history(self):
        calls = [self.call(str(i)) for i in range(3)]
        originals = {call.id: self.receipt(90000) for call in calls}
        agent, turn, observed = self.fixture(calls, originals)
        old = {'role': 'tool', 'tool_call_id': 'old', 'content': 'original earlier receipt'}
        messages = [dict(old)]
        agent._execute_tool_calls(turn, messages, 'task')
        self.assertIn('NATIVE_AGGREGATE_PREVIEW', [item['content'] for item in observed])
        self.assertEqual(messages[0], old)
        self.assertEqual([item['content'] for item in messages[1:]], list(originals.values()))

    def test_skill_result_keeps_native_per_result_budget(self):
        calls = [self.call(), self.call('skill', 'skill_view')]
        original = self.receipt(102278)
        agent, turn, _ = self.fixture(calls, {'paper-1': original, 'skill': original})
        messages = []
        agent._execute_tool_calls(turn, messages, 'task')
        self.assertEqual(messages[0]['content'], original)
        self.assertEqual(messages[1]['content'], 'NATIVE_PERSISTED_PREVIEW')

    def test_error_receipts_are_exact_and_prior_callback_is_chained_and_restored(self):
        for original in [' { "status": "error", "error": "source unavailable" }\n', 'Error executing tool: original failure']:
            with self.subTest(original=original):
                seen = []
                def previous(*args):
                    seen.append(args)
                    raise ValueError('native already ignores callback exceptions')
                agent, turn, _ = self.fixture([self.call()], {'paper-1': original}, prior=previous)
                messages = []
                agent._execute_tool_calls(turn, messages, 'task')
                self.assertEqual(seen, [('paper-1', 'paper_read', {}, original)])
                self.assertEqual(messages[0]['content'], original)
                self.assertIs(agent.tool_complete_callback, previous)

    def test_page_images_receive_the_restored_result_after_all_tool_messages(self):
        original = json.dumps({'status': 'page_view_ready', 'text': 'x' * 102278})
        seen = []
        def images(call_id, args, result):
            seen.append((call_id, args, result))
            return [{'type': 'image_url', 'image_url': {'url': 'data:image/png;base64,fixture'}}]
        agent, turn, _ = self.fixture([self.call(name='paper_view')], {'paper-1': original}, page_images=images)
        messages = []
        agent._execute_tool_calls(turn, messages, 'task')
        self.assertEqual(seen, [('paper-1', {}, json.loads(original))])
        self.assertEqual([item['role'] for item in messages], ['tool', 'user'])
        self.assertEqual(messages[0]['content'], original)

    def test_mismatched_or_missing_current_receipts_stop_even_if_native_swallows_callback_errors(self):
        faults = ['unknown-id', 'wrong-name', 'skill-name', 'wrong-args', 'bool-for-number', 'non-string',
            'missing-callback', 'duplicate-callback', 'missing-message', 'duplicate-message', 'unknown-message']
        for fault in faults:
            with self.subTest(fault=fault):
                previous = lambda *args: None
                agent, turn, _ = self.fixture([self.call(args={'page': 1})], {'paper-1': '{}'}, fault=fault, prior=previous)
                with self.assertRaises(NativeTaskStopped):
                    agent._execute_tool_calls(turn, [], 'task')
                self.assertIs(agent.tool_complete_callback, previous)

    def test_saved_image_pixels_follow_the_exact_image_tool_receipt(self):
        identity = {'requestId': 'image-task', 'contentHash': 'a'*64,
            'sourceEvidenceIdentity': 'b'*64, 'parentIdentity': 'approved-parent'}
        original = json.dumps({'status': 'image_view_ready', **identity})
        seen = []
        pixels = [{'type': 'image_url', 'image_url': {'url': 'data:image/png;base64,AA=='}}]
        def images(call_id, args, output):
            seen.append((call_id, args, output))
            return pixels
        agent, turn, _ = self.fixture([self.call(name='paper_image_view')], {'paper-1': original}, page_images=images)
        messages = []
        agent._execute_tool_calls(turn, messages, 'image-task')
        self.assertEqual(seen, [('paper-1', {}, {'status': 'image_view_ready', **identity})])
        self.assertEqual(messages, [{'role': 'tool', 'tool_call_id': 'paper-1', 'content': original},
            {'role': 'user', 'content': pixels}])

    def test_image_release_does_not_generalize_tool_names_or_success_statuses(self):
        for name, status in [('paper_read', 'image_view_ready'), ('paper_view', 'image_view_ready'),
                             ('paper_image_view', 'page_view_ready')]:
            with self.subTest(name=name, status=status):
                seen = []
                original = json.dumps({'status': status})
                agent, turn, _ = self.fixture([self.call(name=name)], {'paper-1': original},
                    page_images=lambda *args: seen.append(args))
                messages = []
                agent._execute_tool_calls(turn, messages, 'image-task')
                self.assertEqual(seen, [])
                self.assertEqual([item['role'] for item in messages], ['tool'])

    def test_duplicate_current_call_id_is_rejected_before_native_execution(self):
        agent, turn, observed = self.fixture([self.call(), self.call(name='skill_view')], {'paper-1': '{}'})
        with self.assertRaises(NativeTaskStopped): agent._execute_tool_calls(turn, [], 'task')
        self.assertEqual(observed, [])

    def test_native_failure_restores_the_previous_callback(self):
        previous = lambda *args: None
        agent, turn, _ = self.fixture([self.call()], {'paper-1': '{}'}, fault='native-error', prior=previous)
        with self.assertRaisesRegex(RuntimeError, 'native stopped'):
            agent._execute_tool_calls(turn, [], 'task')
        self.assertIs(agent.tool_complete_callback, previous)

    def test_next_turn_cannot_reuse_an_earlier_captured_result(self):
        originals = {'paper-1': self.receipt(102278)}
        agent, turn, _ = self.fixture([self.call()], originals)
        messages = []
        agent._execute_tool_calls(turn, messages, 'task')
        originals['paper-1'] = 'Error executing tool: second turn'
        agent._execute_tool_calls(turn, messages, 'task')
        self.assertEqual(messages[0]['content'], self.receipt(102278))
        self.assertEqual(messages[1]['content'], originals['paper-1'])


if __name__ == "__main__":
    unittest.main()
