"""Exercise the actually installed AIAgent with SDK mock HTTP and real native tools.

No supplier, browser, product task or database is used. Run in an isolated test
directory using the installed Hermes venv; stdout contains only the receipt.
"""
import contextlib
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import socket
import sys
sys.dont_write_bytecode = True
import tempfile
import subprocess
import select
import time
import tomllib
import threading
import traceback


@contextlib.contextmanager
def native_loop_directory(retain):
    if retain:
        directory = Path(tempfile.mkdtemp(prefix="ni-", dir=os.getcwd())).resolve(strict=True)
        print(json.dumps({"retainedFixtureDirectory": str(directory)}), file=sys.stderr)
        yield str(directory)
    else:
        with tempfile.TemporaryDirectory(prefix="native-loop-", dir=os.getcwd()) as directory:
            yield directory


@contextlib.contextmanager
def native_diagnostics(buffer, directory, retain):
    try:
        with contextlib.redirect_stdout(buffer), contextlib.redirect_stderr(buffer):
            yield
    except BaseException:
        if retain:
            buffer.write(traceback.format_exc())
        raise
    finally:
        if retain:
            (directory / "sdk-diagnostics.log").write_text(buffer.getvalue(), encoding="utf-8")


@contextlib.contextmanager
def image_worker_bridge(script, node_modules, directory, configuration=None, typescript=None):
    """Optional real candidate Worker test driver; never substitute SDK/Provider output here."""
    if script is None:
        yield None
        return
    diagnostic_path = directory / "image-worker-stderr.log"
    with diagnostic_path.open("wb") as diagnostics:
        process = subprocess.Popen(["node", str(script), str(directory / "image-worker"),
            str(node_modules) if node_modules else "", str(configuration) if configuration else "", str(typescript) if typescript else ""],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=diagnostics,
            env={"PATH": "/usr/bin:/bin", "NODE_PATH": str(node_modules) if node_modules else ""})
        pending = b""
        exchange_lock = threading.Lock()
        def exchange_locked(value):
            nonlocal pending
            assert process.poll() is None, "Candidate image Worker fixture exited"
            process.stdin.write((json.dumps(value) + "\n").encode("utf-8"))
            process.stdin.flush()
            deadline = time.monotonic() + 30
            while b"\n" not in pending:
                remaining = deadline - time.monotonic()
                if remaining <= 0 or not select.select([process.stdout], [], [], remaining)[0]:
                    detail = diagnostic_path.read_bytes()[-4000:].decode("utf-8", errors="replace")
                    raise TimeoutError("Candidate image Worker fixture did not return its bounded receipt: " + detail)
                chunk = os.read(process.stdout.fileno(), 65536)
                if not chunk:
                    detail = diagnostic_path.read_bytes()[-4000:].decode("utf-8", errors="replace")
                    raise AssertionError("Candidate image Worker fixture closed without a receipt: " + detail)
                pending += chunk
                assert len(pending) <= 4 * 1024 * 1024, "Candidate fixture reply exceeds its test transport budget"
            line, pending = pending.split(b"\n", 1)
            return json.loads(line)
        def exchange(value):
            # Native read-only tools can run together; one pipe exchange must
            # retain its own reply rather than consuming the other tool's line.
            with exchange_lock:
                return exchange_locked(value)
        try:
            yield exchange
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)


def main():
    gateway_script = Path(sys.argv[1]).resolve(strict=True) if len(sys.argv) >= 2 else None
    node_modules = Path(sys.argv[2]).resolve(strict=True) if len(sys.argv) >= 3 else None
    image_gateway_script = Path(sys.argv[3]).resolve(strict=True) if len(sys.argv) >= 4 else None
    image_verdict = sys.argv[4] if len(sys.argv) >= 5 else "blocked"
    assert image_verdict in ("accepted", "blocked")
    image_configuration = Path(sys.argv[5]).resolve(strict=True) if len(sys.argv) >= 6 else None
    image_typescript = Path(sys.argv[6]).resolve(strict=True) if len(sys.argv) >= 7 else None
    sdk_source = Path(sys.argv[7] if len(sys.argv) >= 8 else "/opt/hermes-agent").resolve(strict=True)
    assert sdk_source.is_dir()
    bridge_env = {"PATH": "/usr/bin:/bin", "NODE_PATH": str(node_modules) if node_modules else ""}
    if image_configuration:
        bridge_env["XGS_IMAGE_TEST_CONFIG"] = str(image_configuration)
    if image_typescript:
        bridge_env["XGS_IMAGE_TEST_TYPESCRIPT"] = str(image_typescript)
    with native_loop_directory(bool(image_gateway_script)) as directory:
        task_home = Path(directory)
        # No host profile, supplier keys, project env or proxy is inherited.
        os.environ.clear()
        os.environ.update(HERMES_HOME=str(task_home), HOME=str(task_home), PATH="/usr/bin:/bin", PYTHONUNBUFFERED="1",
                          HERMES_TELEMETRY_ENABLED="false", HERMES_NO_AUTO_UPDATE="1")
        sys.path.insert(0, str(sdk_source))

        def no_network(*_args, **_kwargs):
            raise AssertionError("Offline native loop attempted a network connection")

        socket.socket.connect = no_network
        socket.socket.connect_ex = no_network
        socket.create_connection = no_network
        skill = task_home / "skills" / "science" / "paper-method"
        (skill / "references").mkdir(parents=True)
        (skill / "SKILL.md").write_text("---\nname: paper-method\ndescription: Verify quantities at their stated locations.\n---\nRead references/geometry.md before comparing field thresholds.\n")
        (skill / "references" / "geometry.md").write_text("Compare material-edge and centre values only after identifying their different locations.\n")
        if image_gateway_script:
            # Create before the installed SDK's first skill discovery/cache.
            review_skill = task_home / "skills" / "science" / "openscience-source-review"
            review_skill.mkdir(parents=True)
            (review_skill / "SKILL.md").write_text("---\nname: openscience-source-review\ndescription: Offline image transport fixture only.\n---\nCompare the fixture pixels with their bound source.\n")
        captured = []
        invoked = []
        diagnostics = io.StringIO()
        with native_diagnostics(diagnostics, task_home, bool(image_gateway_script)):
            import httpx
            import run_agent
            import hermes_cli
            from run_agent import AIAgent
            actual_sdk_module = Path(run_agent.__file__).resolve(strict=True)
            assert actual_sdk_module.is_relative_to(sdk_source), "Loaded a different SDK source directory"
            actual_sdk_version = getattr(hermes_cli, "__version__", None)
            actual_sdk_version_source = Path(hermes_cli.__file__).resolve(strict=True)
            if not isinstance(actual_sdk_version, str) or not actual_sdk_version:
                actual_sdk_version_source = sdk_source / "pyproject.toml"
                actual_sdk_version = tomllib.loads(actual_sdk_version_source.read_text())["project"]["version"]
            assert isinstance(actual_sdk_version, str) and actual_sdk_version
            from tools.registry import registry
            from toolsets import create_custom_toolset
            from task_agent import NativeTaskStopped, SkillScope, create_task_agent_class, guard_registered_tools

            schema = {"name": "paper_read", "description": "Read a bound source passage.", "parameters": {
                "type": "object", "properties": {"passageId": {"type": "string"}}, "required": ["passageId"], "additionalProperties": False}}

            def paper_read(args, **_kwargs):
                assert args == {"passageId": "P00021"}
                return json.dumps({"passageId": "P00021", "page": 2, "text": "The material inner edge y=a has field 2e18 V/m."})

            registry.register(name="paper_read", toolset="openscience-sources", schema=schema, handler=paper_read)
            allowed = {"skills_list", "skill_view", "paper_read"}
            create_custom_toolset("openscience-task", "Bound paper and native skill tools", tools=sorted(allowed))
            sequence = [("skills_list", {}), ("skill_view", {"name": "paper-method"}),
                        ("skill_view", {"name": "paper-method", "file_path": "references/geometry.md"}),
                        ("paper_read", {"passageId": "P00021"})]

            def handler(request):
                body = json.loads(request.content)
                captured.append(body)
                assert request.url.host == "openscience-worker"
                assert {tool["function"]["name"] for tool in body.get("tools", [])} == allowed
                ordinal = len(captured) - 1
                message = {"role": "assistant", "content": None}
                if ordinal < len(sequence):
                    name, args = sequence[ordinal]
                    message.update(tool_calls=[{"id": f"call-{ordinal}", "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}],
                                   reasoning_details=[{"type": "openscience-provider-content", "provider_content": {"provider": "offline", "model": "MiniMax-M3",
                                                       "content": [{"type": "thinking", "thinking": "opaque-test", "signature": f"signature-{ordinal}"}]}}])
                    reason = "tool_calls"
                else:
                    assert ordinal == len(sequence), "Native loop sent an unexpected extra model request"
                    message["content"] = "The material-edge value and centre value refer to different positions."
                    reason = "stop"
                if gateway_script:
                    response_content = [{"type": "thinking", "thinking": "opaque-test", "signature": f"signature-{ordinal}"}]
                    if ordinal < len(sequence):
                        response_content.append({"type": "tool_use", "id": f"call-{ordinal}", "name": sequence[ordinal][0], "input": sequence[ordinal][1]})
                    else:
                        response_content.append({"type": "text", "text": message["content"]})
                    node = subprocess.run(["node", str(gateway_script)], input=json.dumps({"request": body, "responseContent": response_content, "ordinal": ordinal}),
                        text=True, capture_output=True, timeout=20,
                        env=bridge_env)
                    assert node.returncode == 0, node.stderr
                    return httpx.Response(200, json=json.loads(node.stdout))
                return httpx.Response(200, json={"id": f"offline-{ordinal}", "object": "chat.completion", "created": 0,
                    "model": "MiniMax-M3", "choices": [{"index": 0, "message": message, "finish_reason": reason}],
                    "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}})

            cls = create_task_agent_class(AIAgent, lambda: httpx.MockTransport(handler), allowed)
            agent = cls(base_url="http://openscience-worker/v1", api_key="openscience-task-transport", provider="openai",
                        api_mode="chat_completions", model="MiniMax-M3", max_iterations=8, max_tokens=4096,
                        enabled_toolsets=["openscience-task"], quiet_mode=True, verbose_logging=False,
                        save_trajectories=False, persist_session=False, skip_context_files=True, session_id="offline-native-loop")
            assert agent.valid_tool_names == allowed
            # Native construction finishes lazy builtin discovery before wrapping its actual handlers.
            skill_handlers = {name: registry.get_entry(name).handler for name in ("skills_list", "skill_view")}
            guard_registered_tools(registry, allowed, lambda name, args: invoked.append({"name": name, "args": args}), SkillScope(task_home / "skills"))
            result = agent.run_conversation("Understand the paper and check the threshold locations.",
                                            system_message="Use the available native skills and source tools, then explain the source relation.",
                                            task_id="offline-native-loop")
            assert result.get("final_response") == "The material-edge value and centre value refer to different positions.", json.dumps({
                "resultKeys": list(result), "final": result.get("final_response"), "error": result.get("error"),
                "requests": len(captured), "tools": [i["name"] for i in invoked],
                "requestTools": [[t.get("function", {}).get("name") for t in b.get("tools", [])] for b in captured],
                "requestKeys": [list(b) for b in captured],
                "lastToolResults": [m.get("content", "")[:300] for m in captured[-1]["messages"] if m.get("role") == "tool"] if captured else []})
            tool_results = [message for message in captured[-1]["messages"] if message.get("role") == "tool"]
            assert [entry["name"] for entry in invoked] == [entry[0] for entry in sequence], json.dumps({"invoked": invoked, "results": tool_results,
                "requests": len(captured), "historyRoles": [m.get("role") for m in result.get("messages", [])], "diagnostic": diagnostics.getvalue()[-3000:]})
            assert len(tool_results) == 4
            assert "different locations" in tool_results[2]["content"]
            assert "2e18 V/m" in tool_results[3]["content"]
            continuity = [m.get("reasoning_details") for m in captured[-1]["messages"] if m.get("role") == "assistant"]
            assert [c[0]["provider_content"]["content"][0]["signature"] for c in continuity] == [f"signature-{i}" for i in range(4)]
            old_client = agent.client
            old_client.close()
            replacement = agent._ensure_primary_openai_client(reason="offline-rebuild")
            assert replacement is not old_client and not replacement.is_closed()
            replacement.close()
            primary_invoked = list(invoked)

            duplicate_requests = []
            duplicate_ids = ["duplicate-a", "duplicate-b"]
            duplicate_blocks = [{"type": "thinking", "thinking": "opaque-test", "signature": "duplicate-signature"}] + [
                {"type": "tool_use", "id": call_id, "name": "paper_read", "input": {"passageId": "P00021"}} for call_id in duplicate_ids]
            def duplicate_handler(request):
                body = json.loads(request.content)
                duplicate_requests.append(body)
                first = len(duplicate_requests) == 1
                content = duplicate_blocks if first else [{"type": "text", "text": "Both bound reads returned."}]
                # On the known failing upstream behavior, finish the fixture so the
                # assertion reports lost IDs directly instead of invoking native retries.
                actual_ids = [m["tool_call_id"] for m in body["messages"] if m.get("role") == "tool"]
                if gateway_script and (first or actual_ids == duplicate_ids):
                    node = subprocess.run(["node", str(gateway_script)], input=json.dumps({"request": body, "responseContent": content, "ordinal": len(duplicate_requests) - 1}),
                        text=True, capture_output=True, timeout=20, env=bridge_env)
                    assert node.returncode == 0, node.stderr
                    return httpx.Response(200, json=json.loads(node.stdout))
                return httpx.Response(200, json={"id": "duplicates", "object": "chat.completion", "created": 0, "model": "MiniMax-M3",
                    "choices": [{"index": 0, "message": {"role": "assistant", "content": None if first else "Both bound reads returned.",
                        **({"tool_calls": [{"id": i, "type": "function", "function": {"name": "paper_read", "arguments": '{"passageId":"P00021"}'}} for i in duplicate_ids],
                            "reasoning_details": [{"type": "openscience-provider-content", "provider_content": {"provider": "offline", "model": "MiniMax-M3", "content": duplicate_blocks}}]} if first else {})},
                        "finish_reason": "tool_calls" if first else "stop"}], "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2}})
            duplicate_cls = create_task_agent_class(AIAgent, lambda: httpx.MockTransport(duplicate_handler), allowed)
            duplicate_agent = duplicate_cls(base_url="http://openscience-worker/v1", api_key="openscience-task-transport", provider="openai",
                api_mode="chat_completions", model="MiniMax-M3", max_iterations=8, max_tokens=4096, enabled_toolsets=["openscience-task"],
                quiet_mode=True, save_trajectories=False, persist_session=False, skip_context_files=True, session_id="offline-duplicates")
            duplicate_result = duplicate_agent.run_conversation("Read the same bound passage twice.", system_message="Use native source tools.", task_id="offline-duplicates")
            assert duplicate_result.get("final_response") == "Both bound reads returned."
            actual_ids = [m["tool_call_id"] for m in duplicate_requests[1]["messages"] if m.get("role") == "tool"]
            assert actual_ids == duplicate_ids and len(invoked) == 6, "Native deduplication lost a valid readonly call ID"
            duplicate_agent.client.close()

            denied_requests = []
            def denied_handler(request):
                denied_requests.append(json.loads(request.content))
                return httpx.Response(200, json={"id": "denied", "object": "chat.completion", "created": 0, "model": "MiniMax-M3",
                    "choices": [{"index": 0, "message": {"role": "assistant", "content": None, "tool_calls": [
                        {"id": call_id, "type": "function", "function": {"name": "paper_read", "arguments": '{"passageId":"P00021"}'}} for call_id in ["allowed-first", "denied-second"]]}, "finish_reason": "tool_calls"}],
                    "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2}})
            denied_cls = create_task_agent_class(AIAgent, lambda: httpx.MockTransport(denied_handler), allowed)
            denied_agent = denied_cls(base_url="http://openscience-worker/v1", api_key="openscience-task-transport", provider="openai",
                api_mode="chat_completions", model="MiniMax-M3", max_iterations=8, max_tokens=4096, enabled_toolsets=["openscience-task"],
                quiet_mode=True, save_trajectories=False, persist_session=False, skip_context_files=True, session_id="offline-denied")
            denied_checks = []
            def revoked(_name, _args):
                denied_checks.append(_name)
                if len(denied_checks) == 2:
                    raise PermissionError("offline task permission revoked")
            guard_registered_tools(registry, allowed, revoked, SkillScope(task_home / "skills"))
            stopped = False
            try:
                denied_agent.run_conversation("Read the bound source.", system_message="Use native skills.", task_id="offline-denied")
            except NativeTaskStopped:
                stopped = True
            assert stopped and len(denied_requests) == 1 and len(invoked) == 7 and len(denied_checks) == 2, "Native loop continued after tool authority was revoked"
            denied_agent.client.close()

            # Exercise the saved-image profile through the real SDK, rather than
            # only testing append_bound_page_images with a stand-in native class.
            # The PNG and model response are fixtures: this proves transport and
            # tool execution, never a scientific or aesthetic judgement.
            for name, original in skill_handlers.items():
                entry = registry.get_entry(name)
                registry.register(name=entry.name, toolset=entry.toolset, schema=entry.schema, handler=original,
                    check_fn=entry.check_fn, requires_env=entry.requires_env, is_async=entry.is_async)
            png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/QWQAAAAASUVORK5CYII=")
            image_identity = {"requestId": "fd319e9b-071f-4adb-a45f-25ebdbd47674" if image_gateway_script else "offline-image-review", "contentHash": hashlib.sha256(png).hexdigest(),
                "sourceEvidenceIdentity": "1" * 64, "parentIdentity": "2" * 64}
            image_receipt = {"status": "image_view_ready", **image_identity}
            image_schema = {"name": "paper_image_view",
                "description": "View the actual saved image for THIS review task, with its exact image, approved parent and source identity. No other image is available.",
                "parameters": {"type": "object", "additionalProperties": False, "properties": {}, "required": []}}
            def image_view(args, **_kwargs):
                assert args == {}
                if image_gateway_script:
                    result = bridge({"kind": "tool-call", "name": "paper_image_view", "arguments": args})["result"]
                    assert result == image_receipt
                    return json.dumps(result, separators=(",", ":"))
                return json.dumps(image_receipt, separators=(",", ":"))
            registry.register(name=image_schema["name"], toolset="openscience-sources", schema=image_schema, handler=image_view)
            image_allowed = {"skills_list", "skill_view", "paper_image_view"}
            create_custom_toolset("openscience-image-task", "Saved image and native skills", tools=sorted(image_allowed))
            with image_worker_bridge(image_gateway_script, node_modules, task_home, image_configuration, image_typescript) as bridge:
                image_requests = []
                image_authorizations = []
                image_releases = []
                image_model = "MiniMax-M3" if bridge else "MiniMax-M3.1"
                image_decision = json.dumps({"decision": image_verdict, "summary": 'Offline "quoted" transport fixture\\only.\nNo scientific verdict.',
                    "repairInstruction": None}, separators=(",", ":")) if bridge else json.dumps({"decision": "blocked", "summary": "Offline transport fixture only.", "repairInstruction": None})
                configured = bridge({"kind": "config", "decision": json.loads(image_decision)}) if bridge else None
                if configured:
                    image_identity = configured["imageIdentity"]
                    assert image_identity["contentHash"] == hashlib.sha256(png).hexdigest()
                    image_receipt = {"status": "image_view_ready", **image_identity}
                    assert configured["config"]["model"] == image_model
                image_url = "data:image/png;base64," + base64.b64encode(png).decode("ascii")
                def saved_pixels(call_id, args, result):
                    assert call_id == "saved-image-view" and args == {} and result == image_receipt
                    image_releases.append(call_id)
                    if bridge:
                        released = bridge({"kind": "tool-images", "callId": call_id, "arguments": args, "result": result})
                        pixels = [part for part in released["content"] if part.get("type") == "image_url"]
                        assert len(pixels) == 1 and pixels[0]["image_url"]["url"] == image_url
                        return released["content"]
                    return [{"type": "text", "text": "Actual saved image; it is not a style reference. " + json.dumps(image_identity)},
                        {"type": "image_url", "image_url": {"url": image_url}}]
                def image_handler(request):
                    body = json.loads(request.content)
                    image_requests.append(body)
                    assert request.url.host == "openscience-worker"
                    assert body["model"] == image_model
                    assert {tool["function"]["name"] for tool in body["tools"]} == image_allowed
                    first = len(image_requests) == 1
                    assert len(image_requests) <= 2, "Saved-image SDK loop made an unexpected extra request"
                    if bridge:
                        received = bridge({"kind": "complete", "request": body, "ordinal": len(image_requests) - 1,
                            "imageIdentity": image_identity, "decision": json.loads(image_decision)})
                        response = received["sdkResponse"]
                        assert received["proof"]["descriptorMatchesSentBody"] is True
                        if not first:
                            assert received["proof"]["rawStopReason"] == "tool_use"
                            assert received["proof"]["rawCheckpointRetained"] is True
                            assert received["proof"]["validatedFinalRetained"] is True
                            assert response["choices"][0]["finish_reason"] == "stop"
                            projected = response["choices"][0]["message"]
                            assert projected["content"] == image_decision
                            assert "tool_calls" not in projected and "reasoning_details" not in projected
                        return httpx.Response(200, json=response)
                    message = {"role": "assistant", "content": None if first else image_decision}
                    if first:
                        message["tool_calls"] = [
                            {"id": "image-method-read", "type": "function", "function": {
                                "name": "skill_view", "arguments": json.dumps({"name": "paper-method"})}},
                            {"id": "saved-image-view", "type": "function", "function": {
                                "name": "paper_image_view", "arguments": "{}"}},
                        ]
                    else:
                        receipts = [m for m in body["messages"] if m.get("role") == "tool"]
                        assert {m["tool_call_id"] for m in receipts} == {"image-method-read", "saved-image-view"}
                        saved = next(m for m in receipts if m["tool_call_id"] == "saved-image-view")
                        assert json.loads(saved["content"]) == image_receipt
                        parts = [part for m in body["messages"] if isinstance(m.get("content"), list) for part in m["content"]]
                        pixels = [part for part in parts if part.get("type") == "image_url"]
                        assert len(pixels) == 1 and pixels[0]["image_url"]["url"] == image_url
                        assert any(part.get("type") == "text" and json.dumps(image_identity) in part.get("text", "") for part in parts)
                    return httpx.Response(200, json={"id": "offline-image", "object": "chat.completion", "created": 0,
                        "model": "MiniMax-M3.1", "choices": [{"index": 0, "message": message,
                            "finish_reason": "tool_calls" if first else "stop"}],
                        "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2}})
                image_cls = create_task_agent_class(AIAgent, lambda: httpx.MockTransport(image_handler), image_allowed, page_images=saved_pixels)
                image_agent = image_cls(base_url="http://openscience-worker/v1", api_key="openscience-task-transport", provider="openai",
                    api_mode="chat_completions", model=image_model,
                    max_iterations=configured["config"]["maxTurns"] if configured else 4,
                    max_tokens=configured["config"]["maxOutputTokens"] if configured else 4096,
                    enabled_toolsets=["openscience-image-task"], quiet_mode=True, verbose_logging=False,
                    save_trajectories=False, persist_session=False, skip_memory=True, skip_context_files=True,
                    session_id=configured["config"]["taskId"] if configured else "offline-image-loop")
                assert image_agent.valid_tool_names == image_allowed
                def authorize_image_tool(name, args):
                    image_authorizations.append(name)
                    if bridge:
                        assert bridge({"kind": "tool-authorize", "name": name, "arguments": args})["authorized"] is True
                guard_registered_tools(registry, image_allowed, authorize_image_tool, SkillScope(task_home / "skills"))
                image_result = image_agent.run_conversation(configured["config"]["goal"] if configured else "Inspect the saved-image transport fixture.",
                    system_message=configured["config"]["instructions"] if configured else "Read the method and view the saved image, then return the fixture decision.",
                    task_id=configured["config"]["taskId"] if configured else "offline-image-loop")
                assert image_result.get("final_response") == image_decision
                assert len(image_requests) == 2 and image_releases == ["saved-image-view"]
                assert sorted(image_authorizations) == ["paper_image_view", "skill_view"] if bridge else image_authorizations == ["skill_view", "paper_image_view"]
                if bridge:
                    finished = bridge({"kind": "finish", "finalResponse": image_result["final_response"]})
                    assert finished["hostFinished"] is True and finished["domainAdopted"] == image_verdict
                    assert finished["sdkRequests"] == 2 and finished["supplierVisualCalls"] == 1
                    assert finished["terminalToolsExecuted"] == 0 and finished["continuationRequests"] == 0
                    assert finished["additionalReservations"] == 0 and finished["externalProviderCalls"] == 0
                image_agent.client.close()

        print(json.dumps({"runtime": "actual installed run_agent.AIAgent", "version": actual_sdk_version,
                          "retainedFixtureDirectory": str(task_home) if image_gateway_script else None,
                          "fixtureArtifactsRetained": bool(image_gateway_script),
                          "sdkSourceDirectory": str(sdk_source), "actualSdkModule": str(actual_sdk_module),
                          "actualSdkVersionSource": str(actual_sdk_version_source), "modelRequests": len(captured),
                          "externalProviderCalls": 0, "nativeToolCalls": [entry["name"] for entry in primary_invoked],
                          "fullReferenceRead": True, "sourceRead": True, "continuationPreserved": True, "clientRebuild": True,
                          "gatewayRoundTrip": bool(gateway_script),
                          "revokedToolStopsLoop": True,
                          "duplicateReadonlyIdsPreserved": True, "duplicateSecondAuthorizationStopsLoop": True,
                          "savedImageSdkLoop": True, "savedImageModelRequests": len(image_requests),
                          "savedImageToolCalls": image_authorizations, "fixturePngInModelRequest": True,
                          "savedImageIdentityPreserved": True,
                          "imageToolFinalCrossLayer": bool(image_gateway_script),
                          "imageToolFinalDecision": image_verdict if image_gateway_script else None,
                          "scientificQualityValidated": False}))


if __name__ == "__main__":
    main()
