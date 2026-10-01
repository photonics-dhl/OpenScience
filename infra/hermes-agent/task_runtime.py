"""Fixed systemd entrypoint. Native Agent owns reasoning; all external work belongs to Worker."""
import contextlib
import json
import os
from pathlib import Path
import re
import sys


def write_task_model_context(task_home, config):
    value = config.get('contextWindowTokens')
    if value is None:
        return
    if type(value) is not int or value < 1 or value > 1_000_000:
        raise ValueError('Native model context metadata is invalid')
    # Only model capacity metadata; no key, provider config or user-supplied YAML.
    (task_home/'config.yaml').write_text(f'model:\n  context_length: {value}\n', encoding='utf-8')


def main():
    instance = os.environ.get("OPENSCIENCE_NATIVE_INSTANCE", "")
    os.environ.clear()
    os.environ.update(HOME="/task", HERMES_HOME="/task", PATH="/usr/bin:/bin",
        HERMES_TELEMETRY_ENABLED="false", HERMES_NO_AUTO_UPDATE="1", PYTHONUNBUFFERED="1")
    sys.path.insert(0, "/opt/hermes-agent")
    import httpx
    from task_agent import NativeTaskStopped, SkillScope, create_task_agent_class, guard_registered_tools
    if not re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[1-9][0-9]{0,8}", instance):
        raise NativeTaskStopped("Native unit identity is unavailable")

    class WorkerTransport(httpx.BaseTransport):
        def __init__(self):
            self.transport = httpx.HTTPTransport(uds="/bridge/worker.sock", retries=0)

        def handle_request(self, request):
            if request.url.host != "openscience-worker":
                raise NativeTaskStopped("Native transport attempted an unowned destination")
            try:
                response = self.transport.handle_request(request)
                if response.status_code != 200:
                    response.close()
                    raise NativeTaskStopped("Worker stopped the native task")
                return response
            except Exception as error:
                raise NativeTaskStopped("Native task transport outcome is unavailable") from error

        def close(self):
            self.transport.close()

    client = httpx.Client(transport=WorkerTransport(), base_url="http://openscience-worker", trust_env=False,
                          timeout=httpx.Timeout(610, connect=5))

    def call(path, value=None):
        response = client.get(path) if value is None else client.post(path, json=value)
        return response.json()

    config = call("/task/config")
    task_id, attempt = instance.rsplit("-", 1)
    if not isinstance(config, dict) or config.get("taskId") != task_id or config.get("executionAttempt") != int(attempt):
        raise NativeTaskStopped("Native task socket belongs to another execution")
    if not isinstance(config, dict) or config.get("runtimeId") != Path("/runtime-id").read_text().strip():
        raise NativeTaskStopped("Native runtime identity changed")
    if config.get("skillCatalogueId") != Path("/catalogue/.catalogue-id").read_text().strip():
        raise NativeTaskStopped("Native Skill catalogue identity changed")
    write_task_model_context(Path('/task'), config)
    # Empty per-task home; native discovery reads complete immutable resources at its normal skills path.
    skills = Path("/task/skills")
    if not skills.exists():
        skills.symlink_to("/catalogue", target_is_directory=True)
    if skills.resolve(strict=True) != Path("/catalogue"):
        raise NativeTaskStopped("Native Skill profile changed")
    status = "failed"
    agent = None
    try:
        with open(os.devnull, "w") as quiet, contextlib.redirect_stdout(quiet), contextlib.redirect_stderr(quiet):
            from run_agent import AIAgent
            from tools.registry import registry
            from toolsets import create_custom_toolset
            allowed = {"skills_list", "skill_view"}
            for tool in config["sourceTools"]:
                name = tool["name"]
                if not name.startswith("paper_") or name in allowed:
                    raise NativeTaskStopped("Native source tool profile changed")
                allowed.add(name)
                def handler(args, _name=name, **_kwargs):
                    output = call("/task/tools/call", {"name": _name, "arguments": args})
                    return json.dumps(output, ensure_ascii=False, separators=(",", ":"))
                registry.register(name=name, toolset="openscience-sources", schema=tool, handler=handler)
            create_custom_toolset("openscience-task", "Current paper and full native Skills", tools=sorted(allowed))
            def images(call_id, args, result):
                return call("/task/tools/images", {"callId": call_id, "arguments": args, "result": result})["content"]
            cls = create_task_agent_class(AIAgent, WorkerTransport, allowed, page_images=images)
            agent = cls(provider="openai", api_mode="chat_completions", model=config["model"],
                api_key="openscience-task-transport", base_url="http://openscience-worker/v1",
                max_iterations=config["maxTurns"], max_tokens=config["maxOutputTokens"],
                enabled_toolsets=["openscience-task"], quiet_mode=True, verbose_logging=False,
                save_trajectories=False, persist_session=False, skip_memory=True, skip_context_files=True,
                session_id=config["taskId"])
            if agent.valid_tool_names != allowed:
                raise NativeTaskStopped("Native executable tool profile changed")
            guard_registered_tools(registry, allowed,
                lambda name, args: call("/task/tools/authorize", {"name": name, "arguments": args}), SkillScope(skills))
            if config.get("systemPrompt"):
                agent._cached_system_prompt = config["systemPrompt"]
            result = agent.run_conversation(config["goal"], system_message=config["instructions"], task_id=config["taskId"])
            final = result.get("final_response")
            if not isinstance(final, str) or not final.strip() or result.get("error"):
                raise NativeTaskStopped("Native task did not produce a final response")
            call("/task/finish", {"status": "completed", "finalResponse": final})
            status = "completed"
    except NativeTaskStopped:
        # Transport outcome remains in the Worker's original receipt; no provider retry here.
        pass
    finally:
        if agent is not None:
            agent.client.close()
        if status != "completed":
            try:
                call("/task/finish", {"status": "stopped"})
            except NativeTaskStopped:
                pass
        client.close()


if __name__ == "__main__":
    main()
