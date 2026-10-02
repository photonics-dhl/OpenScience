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


if __name__ == "__main__":
    unittest.main()
