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
