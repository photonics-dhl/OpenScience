"""Build the pinned upstream's config with controlled, read-only settings."""

import dataclasses
import enum
from pathlib import Path

from ruamel.yaml import YAML
from serena.config.serena_config import ProjectConfig, SerenaConfig


TOOLS = ["find_symbol", "get_symbols_overview", "find_referencing_symbols"]


def plain(value):
    if isinstance(value, enum.Enum):
        return value.value
    if dataclasses.is_dataclass(value):
        return {
            field.name: plain(getattr(value, field.name))
            for field in dataclasses.fields(value)
            if not field.name.startswith("_")
        }
    if isinstance(value, dict):
        return {key: plain(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [plain(item) for item in value]
    return value


def write_yaml(path, value):
    with Path(path).open("w", encoding="utf-8") as stream:
        YAML(typ="safe").dump(value, stream)


# Start from the actual pinned dataclass defaults so upstream config loading
# does not try to migrate missing keys into a read-only runtime file.
global_config = plain(SerenaConfig())
global_config.update({
    "projects": ["/workspace"],
    "language_backend": "LSP",
    "base_modes": [],
    "default_modes": [],
    "fixed_tools": TOOLS,
    "excluded_tools": [],
    "included_optional_tools": [],
    "gui_log_window": False,
    "web_dashboard": False,
    "web_dashboard_open_on_launch": False,
    "jetbrains_launch_command": None,
    "trusted_project_path_patterns": [],
    "trace_lsp_communication": False,
    "tool_timeout": 120,
    "default_max_tool_answer_chars": 20000,
    "token_count_estimator": "CHAR_COUNT",
    "ignored_memory_patterns": [".*"],
    "read_only_memory_patterns": [".*"],
    "project_serena_folder_location": "/opt/serena-project",
    "ls_specific_settings": {
        "typescript": {
            "typescript_version": "5.9.3",
            "typescript_language_server_version": "5.1.3",
            "ls_path": "/opt/serena-home/language_servers/static/TypeScriptLanguageServer/ts-lsp/node_modules/.bin/typescript-language-server",
        },
    },
})

project_config = plain(ProjectConfig(
    project_name="OpenScience-source-snapshot",
    language_servers=["typescript"],
))
project_config.update({
    "language_backend": "LSP",
    "read_only": True,
    "ignore_all_files_in_gitignore": False,
    "activation_command": None,
    "default_modes": [],
    "added_modes": [],
    "fixed_tools": TOOLS,
    "excluded_tools": [],
    "included_optional_tools": [],
    "ignored_memory_patterns": [".*"],
    "read_only_memory_patterns": [".*"],
    "initial_prompt": "This is an immutable selected-source snapshot, not a live checkout. The deployment record identifies its exact Git revision.",
})
write_yaml("/opt/serena-home/serena_config.yml", global_config)
write_yaml("/opt/serena-project/project.yml", project_config)
Path("/opt/serena-project/.gitignore").write_text("/cache\n/project.local.yml\n", encoding="utf-8")
