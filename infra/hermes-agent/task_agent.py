"""Thin adapter for the installed Nous AIAgent. The upstream agent owns its loop."""
from pathlib import Path, PurePosixPath
import json
import stat


class NativeTaskStopped(BaseException):
    """Stop this process; native tool error/retry handlers must not consume lost authority."""


class SkillSelectionError(ValueError):
    """A correctable selection error grants no read and must not end the native loop."""


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
        if not isinstance(name, str) or not name or '\\' in name or PurePosixPath(name).is_absolute() or '..' in PurePosixPath(name).parts:
            raise NativeTaskStopped('Invalid skill selection path')
        candidates = self.names.get(name, set()) if isinstance(name, str) else set()
        if len(candidates) != 1:
            raise SkillSelectionError('Skill name is unavailable or ambiguous. Use skills_list and its exact name or category/path; category names are not plugin namespaces.')
        folder = next(iter(candidates)).resolve(strict=True)
        reference = file_path if file_path is not None else "SKILL.md"
        if not isinstance(reference, str) or not reference or "\\" in reference:
            raise NativeTaskStopped("Invalid skill reference")
        parts = PurePosixPath(reference)
        if parts.is_absolute() or any(part in ("..", ".") for part in parts.parts):
            raise NativeTaskStopped("Skill reference escapes its selected skill")
        try:
            target = (folder / reference).resolve(strict=False)
        except (OSError, ValueError) as error:
            raise NativeTaskStopped("Skill reference is unavailable") from error
        if not target.is_relative_to(folder):
            raise NativeTaskStopped("Skill reference escapes its selected skill")
        try:
            info = target.stat()
        except FileNotFoundError as error:
            raise SkillSelectionError('Reference is absent within this skill. Use skill_view on SKILL.md and select an available supporting file.') from error
        except OSError as error:
            raise NativeTaskStopped('Skill reference is unavailable') from error
        if not stat.S_ISREG(info.st_mode):
            raise SkillSelectionError('Reference is not a readable file within this skill. Select a file named in SKILL.md.')
        return target


def create_task_agent_class(native_agent_type, transport_factory, allowed_tools, page_images=None):
    """Adapt a fixed readonly tool profile; never use this class for writes or paid tools."""
    allowed = frozenset(allowed_tools)
    if not allowed:
        raise ValueError("The task must have an explicit tool set")

    class TaskAgent(native_agent_type):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            # The installed runtime prefers streaming even without a display consumer.
            # Task checkpoints use complete SDK responses; use its existing non-stream path.
            self._disable_streaming = True

        def run_conversation(self, user_message, system_message=None, conversation_history=None, task_id=None, **kwargs):
            result = super().run_conversation(user_message, system_message=system_message,
                conversation_history=conversation_history, task_id=task_id, **kwargs)

            def missing_call(value):
                history = value.get('messages') or []
                last = history[-1] if history else None
                return isinstance(last, dict) and last.get('role') == 'assistant' \
                    and last.get('finish_reason') == 'tool_calls' and not last.get('tool_calls')

            if not missing_call(result):
                return result
            spent = result.get('api_calls')
            if result.get('error') or result.get('interrupted') or result.get('partial') \
                    or type(spent) is not int or spent < 1 or spent >= self.max_iterations:
                raise NativeTaskStopped('Native incomplete tool response cannot continue in this scope')
            original_limit = self.max_iterations
            self.max_iterations = original_limit - spent
            try:
                continued = super().run_conversation(
                    'Your last response indicated tool use but supplied no tool call. No tool ran for that response. '
                    'Continue from the saved results above and issue the intended call using its tool schema. '
                    'Do not restart the task or save unchanged fields again. Re-read sources as needed for the remaining checks. '
                    'Finish only after the required tools succeed.',
                    system_message=system_message, conversation_history=result['messages'], task_id=task_id, **kwargs)
                if missing_call(continued):
                    raise NativeTaskStopped('Native provider omitted a tool call again')
                continued['api_calls'] = spent + continued.get('api_calls', 0)
                return continued
            finally:
                self.max_iterations = original_limit

        def _create_openai_client(self, client_kwargs, *, reason, shared):
            import httpx
            from openai import OpenAI

            kwargs = dict(client_kwargs)
            # This is a task-local transport label, never a supplier credential.
            kwargs.update(api_key="openscience-task-transport", base_url="http://openscience-worker/v1", max_retries=0)
            kwargs["http_client"] = httpx.Client(transport=transport_factory(), trust_env=False)
            return OpenAI(**kwargs)

        def _execute_tool_calls(self, assistant_message, messages, effective_task_id, api_call_count=0):
            for call in assistant_message.tool_calls or []:
                if call.function.name not in allowed:
                    raise NativeTaskStopped("Native task attempted a tool outside its advertised scope")
            start = len(messages)
            result = super()._execute_tool_calls(assistant_message, messages, effective_task_id, api_call_count)
            if page_images is not None:
                append_bound_page_images(assistant_message.tool_calls, messages[start:], messages, page_images)
            return result

        @staticmethod
        def _deduplicate_tool_calls(tool_calls):
            # Distinct IDs belong to distinct provider tool_use blocks. Removing a
            # harmless readonly call breaks the complete provider continuation.
            return tool_calls

    return TaskAgent


def append_bound_page_images(calls, new_messages, messages, page_images):
    """Adapt successful native source-tool results into actual user pixels, after all tool results."""
    import json
    results = {m.get("tool_call_id"): m for m in new_messages if isinstance(m, dict) and m.get("role") == "tool"}
    content = []
    for call in calls or []:
        if call.function.name != "paper_view":
            continue
        result = results.get(call.id)
        if not result or not isinstance(result.get("content"), str):
            continue
        try:
            output = json.loads(result["content"])
        except (ValueError, TypeError):
            continue
        if not isinstance(output, dict) or output.get("status") != "page_view_ready":
            continue
        # Worker checks this exact successful result against its bound source before releasing pixels.
        parts = page_images(call.id, json.loads(call.function.arguments), output)
        content.extend(parts)
    if content:
        messages.append({"role": "user", "content": content})


def guard_registered_tools(registry, allowed_tools, authorize, skill_scope: SkillScope):
    """Keep upstream native handlers, with authoritative checks at each actual dispatch."""
    for name in allowed_tools:
        entry = registry.get_entry(name)
        if entry is None or entry.is_async:
            raise NativeTaskStopped("Task tool is unavailable or incompatible")
        original = entry.handler

        def guarded(args, _name=name, _handler=original, **kwargs):
            try:
                authorize(_name, args)
            except Exception as error:
                raise NativeTaskStopped("Task tool authorization is unavailable or revoked") from error
            if _name == 'skill_view':
                try:
                    skill_scope.resolve(args.get('name'), args.get('file_path'))
                except SkillSelectionError as error:
                    return json.dumps({'success': False, 'error': str(error)}, ensure_ascii=False)
            return _handler(args, **kwargs)

        registry.register(name=entry.name, toolset=entry.toolset, schema=entry.schema, handler=guarded,
                          check_fn=entry.check_fn, requires_env=entry.requires_env, is_async=False,
                          description=entry.description, emoji=entry.emoji,
                          max_result_size_chars=entry.max_result_size_chars)
