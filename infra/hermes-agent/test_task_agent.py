"""Local adapter tests; the actual installed AIAgent loop is exercised by offline_native_loop.py."""
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest

from task_agent import NativeTaskStopped, SkillScope, create_task_agent_class, guard_registered_tools


class NativeStub:
    def _execute_tool_calls(self, message, messages, task_id, api_call_count=0):
        messages.append("executed")


class AdapterTests(unittest.TestCase):
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
                                    ("paper-method", "../../private.txt"), ("plugin:paper-method", None)]:
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
            with self.assertRaises(NativeTaskStopped):
                scope.resolve("same")
            self.assertEqual(scope.resolve("a/same"), root / "a" / "same" / "SKILL.md")


if __name__ == "__main__":
    unittest.main()
