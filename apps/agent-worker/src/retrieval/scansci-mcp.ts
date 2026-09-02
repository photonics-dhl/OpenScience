import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const DOWNLOAD_TOOL = 'scansci_pdf_download';
const MAX_RESULT_TEXT_BYTES = 64 * 1024;

export interface ScanSciMcpDownload {
  success?: unknown;
  identifier?: unknown;
  doi?: unknown;
  file?: unknown;
  source?: unknown;
  url?: unknown;
  source_url?: unknown;
  license?: unknown;
  error?: unknown;
  error_type?: unknown;
  action?: unknown;
  status_code?: unknown;
}

function mcpEndpoint(value: string): URL {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error('ScanSci MCP endpoint is invalid');
  }
  return url;
}

function parseToolResult(value: unknown): ScanSciMcpDownload {
  if (!value || typeof value !== 'object' || !('content' in value) || !Array.isArray(value.content)) {
    throw new Error('ScanSci MCP result is invalid');
  }
  if ('isError' in value && value.isError === true) throw new Error('ScanSci MCP tool failed');
  const text = value.content.filter((block): block is { type: 'text'; text: string } => (
    !!block && typeof block === 'object' && 'type' in block && block.type === 'text'
      && 'text' in block && typeof block.text === 'string'
  ));
  if (text.length !== 1 || Buffer.byteLength(text[0].text, 'utf8') > MAX_RESULT_TEXT_BYTES) {
    throw new Error('ScanSci MCP result is invalid');
  }
  const parsed: unknown = JSON.parse(text[0].text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('ScanSci MCP result is invalid');
  }
  return parsed as ScanSciMcpDownload;
}

export async function downloadThroughScanSciMcp(input: {
  mcpUrl: string;
  identifier: string;
  outputDir: string;
  timeoutMs: number;
}): Promise<ScanSciMcpDownload> {
  const client = new Client(
    { name: 'openscience-agent-worker', version: '1.0.0' },
    { capabilities: {} },
  );
  const transport = new StreamableHTTPClientTransport(mcpEndpoint(input.mcpUrl));
  try {
    await client.connect(transport, { timeout: Math.min(input.timeoutMs, 30_000) });
    const tools = await client.listTools(undefined, { timeout: Math.min(input.timeoutMs, 30_000) });
    if (!tools.tools.some((tool) => tool.name === DOWNLOAD_TOOL)) {
      throw new Error('ScanSci MCP download tool is unavailable');
    }
    const result = await client.callTool({
      name: DOWNLOAD_TOOL,
      arguments: { identifier: input.identifier, output_dir: input.outputDir },
    }, undefined, { timeout: input.timeoutMs, maxTotalTimeout: input.timeoutMs });
    return parseToolResult(result);
  } finally {
    await client.close().catch(() => undefined);
  }
}
