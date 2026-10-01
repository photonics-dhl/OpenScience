"""Thin adapter for the installed Nous AIAgent. The upstream agent owns its loop."""
from pathlib import Path, PurePosixPath


class NativeTaskStopped(BaseException):
    """Stop this process; native tool error/retry handlers must not consume lost authority."""


class SkillScope:
    """Restrict native skill_view to the immutable catalogue mounted for this task."""
    def __init__(self, root: Path):
        self.root = root.resolve(strict=True)
        self.names = {}
        for markdown in self.root.rglob("SKILL.md"):
            target = markdown.resolve(strict=True)
            if not target.is_relative_to(self.root):
                raise NativeTaskStopped("Skill catalogue escapes its task mount")
            folder = markdown.parent
            relative = folder.relative_to(self.root).as_posix()
            self.names.setdefault(relative, set()).add(folder)
            self.names.setdefault(folder.name, set()).add(folder)

    def resolve(self, name: str, file_path: str | None = None) -> Path:
        candidates = self.names.get(name, set()) if isinstance(name, str) else set()
        if len(candidates) != 1:
            raise NativeTaskStopped("Skill name is absent, ambiguous or outside the task catalogue")
        folder = next(iter(candidates)).resolve(strict=True)
        reference = file_path if file_path is not None else "SKILL.md"
        if not isinstance(reference, str) or not reference or "\\" in reference:
            raise NativeTaskStopped("Invalid skill reference")
        parts = PurePosixPath(reference)
        if parts.is_absolute() or any(part in ("..", ".") for part in parts.parts):
            raise NativeTaskStopped("Skill reference escapes its selected skill")
        try:
            target = (folder / reference).resolve(strict=True)
        except (OSError, ValueError) as error:
            raise NativeTaskStopped("Skill reference is unavailable") from error
        if not target.is_relative_to(folder) or not target.is_file():
            raise NativeTaskStopped("Skill reference escapes its selected skill")
        return target


def create_task_agent_class(native_agent_type, transport_factory, allowed_tools):
    """Override only client construction and the execution boundary, never the agent loop."""
    allowed = frozenset(allowed_tools)
    if not allowed:
        raise ValueError("The task must have an explicit tool set")

    class TaskAgent(native_agent_type):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            # The installed runtime prefers streaming even without a display consumer.
            # Task checkpoints use complete SDK responses; use its existing non-stream path.
            self._disable_streaming = True

        def _create_openai_client(self, client_kwargs, *, reason, shared):
            import httpx
            from openai import OpenAI

            kwargs = dict(client_kwargs)
            # This is a task-local transport label, never a supplier credential.
            kwargs.update(api_key="openscience-task-transport", base_url="http://openscience-worker/v1", max_retries=0)
            kwargs["http_client"] = httpx.Client(transport=transport_factory())
            return OpenAI(**kwargs)

        def _execute_tool_calls(self, assistant_message, messages, effective_task_id, api_call_count=0):
            for call in assistant_message.tool_calls or []:
                if call.function.name not in allowed:
                    raise NativeTaskStopped("Native task attempted a tool outside its advertised scope")
            return super()._execute_tool_calls(assistant_message, messages, effective_task_id, api_call_count)

    return TaskAgent


def guard_registered_tools(registry, allowed_tools, authorize, skill_scope: SkillScope):
    """Keep upstream native handlers, with authoritative checks at each actual dispatch."""
    for name in allowed_tools:
        entry = registry.get_entry(name)
        if entry is None or entry.is_async:
            raise NativeTaskStopped("Task tool is unavailable or incompatible")
        original = entry.handler

        def guarded(args, _name=name, _handler=original, **kwargs):
            if _name == "skill_view":
                skill_scope.resolve(args.get("name"), args.get("file_path"))
            try:
                authorize(_name, args)
            except Exception as error:
                raise NativeTaskStopped("Task tool authorization is unavailable or revoked") from error
            return _handler(args, **kwargs)

        registry.register(name=entry.name, toolset=entry.toolset, schema=entry.schema, handler=guarded,
                          check_fn=entry.check_fn, requires_env=entry.requires_env, is_async=False,
                          description=entry.description, emoji=entry.emoji,
                          max_result_size_chars=entry.max_result_size_chars)
