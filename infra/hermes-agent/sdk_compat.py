"""Apply the reviewed compatibility change only to a newly copied native snapshot."""
import ast
from pathlib import Path
import tomllib


FLOW_ANCHOR = (
    '                else:\n'
    '                    # No tool calls - this is the final response\n'
    '                    final_response = assistant_message.content or ""\n'
    '                    \n'
    '                    # Fix: unmute output when entering the no-tool-call branch\n'
    '                    # so the user can see empty-response warnings and recovery\n'
    '                    # status messages.  _mute_post_response was set during a\n'
    '                    # prior housekeeping tool turn and should not silence the\n'
    '                    # final response path.\n'
    '                    self._mute_post_response = False\n'
    '                    \n'
    '                    # Check if response only has think block with no actual content after it\n'
    '                    if not self._has_content_after_think_block(final_response):\n'
    '                        # ── Partial stream recovery ─────────────────────\n'
)
INSERT_BEFORE = '                        # ── Partial stream recovery ─────────────────────\n'
MARKER = '# OpenScience controlled thinking-only continuation v1'
CONTINUATION = '''                        # OpenScience controlled thinking-only continuation v1
                        _os_details = getattr(assistant_message, "reasoning_details", None)
                        _os_envelope = (_os_details[0] if type(_os_details) is list and len(_os_details) == 1
                                        and type(_os_details[0]) is dict else {})
                        _os_opaque = _os_envelope.get("provider_content")
                        if (self.model == "MiniMax-M3" and finish_reason in ("stop", "tool_calls")
                                and assistant_message.content == "" and not assistant_message.tool_calls
                                and _os_envelope.get("type") == "openscience-provider-content"
                                and type(_os_opaque) is dict and _os_opaque.get("model") == self.model
                                and type(_os_opaque.get("provider")) is str and _os_opaque["provider"].strip()
                                and type(_os_opaque.get("content")) is list and _os_opaque["content"]
                                and all(type(_os_block) is dict and _os_block.get("type") == "thinking"
                                        and type(_os_block.get("thinking")) is str and _os_block["thinking"].strip()
                                        and ("signature" not in _os_block or type(_os_block["signature"]) is str)
                                        for _os_block in _os_opaque["content"])):
                            messages.append(self._build_assistant_message(assistant_message, finish_reason))
                            messages.append({"role": "user", "content":
                                "Continue from the saved conversation and complete the task using the available tools as needed."})
                            continue
'''


def _validate_flow(source):
    """Reject an anchor under another method or loop: continue must target the original call cap."""
    try:
        tree = ast.parse(source)
    except SyntaxError as error:
        raise ValueError('Native SDK source layout is invalid') from error
    parents = {child: node for node in ast.walk(tree) for child in ast.iter_child_nodes(node)}
    position = source.index(FLOW_ANCHOR) + FLOW_ANCHOR.index('                    if not ')
    line = source[:position].count('\n') + 1
    branches = [node for node in ast.walk(tree) if isinstance(node, ast.If) and node.lineno == line]
    if len(branches) != 1:
        raise ValueError('Native SDK empty branch is not unique')
    branch = branches[0]
    owner = parents.get(branch)
    expected_test = ast.parse('assistant_message.tool_calls', mode='eval').body
    if not isinstance(owner, ast.If) or branch not in owner.orelse or ast.dump(owner.test) != ast.dump(expected_test):
        raise ValueError('Native SDK no-call branch changed')
    ancestry = []
    current = branch
    while current in parents:
        current = parents[current]
        ancestry.append(current)
    functions = [node for node in ancestry if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))]
    classes = [node for node in ancestry if isinstance(node, ast.ClassDef)]
    loops = [node for node in ancestry if isinstance(node, (ast.While, ast.For, ast.AsyncFor))]
    expected_loop = ast.parse('(api_call_count < self.max_iterations and self.iteration_budget.remaining > 0) or self._budget_grace_call', mode='eval').body
    if (len(functions) != 1 or functions[0].name != 'run_conversation'
            or len(classes) != 1 or classes[0].name != 'AIAgent'
            or len(loops) != 1 or not isinstance(loops[0], ast.While)
            or ast.dump(loops[0].test) != ast.dump(expected_loop)):
        raise ValueError('Native SDK continuation loop changed')


def patch_native_sdk_continuation(runtime: Path):
    """Preserve controlled thinking-only replies in the installed 0.10 loop."""
    entry = runtime/'run_agent.py'
    manifest = runtime/'pyproject.toml'
    if entry.is_symlink() or manifest.is_symlink() or not entry.is_file() or not manifest.is_file():
        raise ValueError('Native SDK snapshot files are unavailable')
    try:
        project = tomllib.loads(manifest.read_text(encoding='utf-8')).get('project')
    except (ValueError, UnicodeError) as error:
        raise ValueError('Native SDK version metadata is invalid') from error
    if not isinstance(project, dict) or project.get('version') != '0.10.0':
        raise ValueError('Unsupported native SDK version')
    source = entry.read_text(encoding='utf-8')
    if MARKER in source or source.count(FLOW_ANCHOR) != 1:
        raise ValueError('Native SDK flow anchor is missing, repeated or already patched')
    _validate_flow(source)
    patched = source.replace(FLOW_ANCHOR, FLOW_ANCHOR.replace(INSERT_BEFORE, CONTINUATION + INSERT_BEFORE), 1)
    compile(patched, str(entry), 'exec')
    entry.write_text(patched, encoding='utf-8', newline='')
