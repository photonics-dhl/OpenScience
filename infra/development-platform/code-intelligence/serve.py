"""Compose the official Serena MCP factory with source-bound read results."""

import json
import logging

from mcp.server.transport_security import TransportSecuritySettings
from serena.mcp import SerenaMCPFactory

from snapshot_identity import read_source_revision


class SourceBoundSerenaMCPFactory(SerenaMCPFactory):
    """Attach the mounted snapshot revision to every actual MCP tool result."""

    def __init__(self, *, source_revision: str, **kwargs):
        super().__init__(**kwargs)
        self.source_revision = source_revision

    def make_mcp_tool(self, tool, openai_tool_compatible=True, structured_output=None):
        mcp_tool = super().make_mcp_tool(tool, openai_tool_compatible, structured_output)
        execute = mcp_tool.fn

        def execute_with_source_revision(**kwargs):
            return json.dumps({
                "sourceRevision": self.source_revision,
                "result": execute(**kwargs),
            }, ensure_ascii=False)

        mcp_tool.fn = execute_with_source_revision
        return mcp_tool


def main():
    logging.basicConfig(level=logging.INFO)
    server = SourceBoundSerenaMCPFactory(
        source_revision=read_source_revision(),
        transport="streamable-http",
        context="/opt/serena/readonly-context.yml",
        project="/workspace",
    ).create_mcp_server(
        host="0.0.0.0",
        port=3132,
        enable_web_dashboard=False,
        open_web_dashboard=False,
        enable_gui_log_window=False,
    )
    # FastMCP's constructor supplies transport_security=None to Settings, which
    # overrides the environment setting. Configure the actual server instance.
    server.settings.transport_security = TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=["127.0.0.1:*", "localhost:*"],
        allowed_origins=["http://127.0.0.1:*", "http://localhost:*"],
    )
    server.run(transport="streamable-http")


if __name__ == "__main__":
    main()
