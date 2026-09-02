import asyncio

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client


EXPECTED_TOOLS = {
    "scansci_pdf_batch_download",
    "scansci_pdf_cache_clear",
    "scansci_pdf_channel_status",
    "scansci_pdf_citation",
    "scansci_pdf_config",
    "scansci_pdf_diagnostics",
    "scansci_pdf_download",
    "scansci_pdf_elsevier_setup",
    "scansci_pdf_expand_citations",
    "scansci_pdf_find",
    "scansci_pdf_login",
    "scansci_pdf_parse_list",
    "scansci_pdf_prepare_queue",
    "scansci_pdf_schools",
    "scansci_pdf_search",
    "scansci_pdf_tor",
    "scansci_pdf_zotero_push",
}


async def probe() -> None:
    async with streamablehttp_client("http://127.0.0.1:8000/mcp") as streams:
        async with ClientSession(*streams) as session:
            await session.initialize()
            tools = await session.list_tools()
            assert {tool.name for tool in tools.tools} == EXPECTED_TOOLS


asyncio.run(asyncio.wait_for(probe(), timeout=4))
