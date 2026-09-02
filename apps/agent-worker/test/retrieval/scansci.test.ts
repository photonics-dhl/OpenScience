import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createScanSciAdapter } from '../../src/retrieval/scansci';

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

interface FakeMcpOptions {
  result: Record<string, unknown>;
  calls?: Array<Record<string, unknown>>;
}

async function fakeMcp(options: FakeMcpOptions): Promise<string> {
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST') {
      response.writeHead(405).end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const message = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
      id?: string | number;
      method: string;
      params?: Record<string, unknown>;
    };
    if (message.method === 'notifications/initialized') {
      response.writeHead(200, { 'content-type': 'application/json' }).end('{}');
      return;
    }
    let result: Record<string, unknown>;
    if (message.method === 'initialize') {
      result = {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'scansci-pdf', version: '1.13.1' },
      };
    } else if (message.method === 'tools/list') {
      result = {
        tools: [{
          name: 'scansci_pdf_download',
          description: 'Download one paper',
          inputSchema: { type: 'object', properties: { identifier: { type: 'string' } } },
        }],
      };
    } else if (message.method === 'tools/call') {
      options.calls?.push(message.params ?? {});
      result = { content: [{ type: 'text', text: JSON.stringify(options.result) }] };
    } else {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'content-type': 'application/json',
      ...(message.method === 'initialize' ? { 'mcp-session-id': 'scansci-test-session' } : {}),
    }).end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}/mcp`;
}

async function paperFixture(): Promise<{ root: string; file: string; bytes: Buffer }> {
  const root = await mkdtemp(join(tmpdir(), 'openscience-scansci-mcp-'));
  const file = join(root, 'paper.pdf');
  const bytes = Buffer.from('%PDF-official-mcp-fixture');
  await writeFile(file, bytes);
  return { root, file, bytes };
}

describe('official ScanSci MCP adapter', () => {
  it('is explicitly unavailable until the capability is enabled', async () => {
    const adapter = createScanSciAdapter({ enabled: false });
    await expect(adapter.acquire({ identifier: '10.1000/example', subjectId: 'a'.repeat(64) })).resolves.toEqual({
      status: 'unavailable', provider: 'scansci', code: 'disabled', retryable: false,
    });
  });

  it('uses the upstream default source strategy and preserves its exact provenance', async () => {
    const fixture = await paperFixture();
    const calls: Array<Record<string, unknown>> = [];
    const mcpUrl = await fakeMcp({
      calls,
      result: {
        success: true,
        identifier: '10.1000/example',
        file: fixture.file,
        source: 'sci-hub.vg',
        url: 'https://doi.org/10.1000/example',
      },
    });
    const adapter = createScanSciAdapter({ enabled: true, mcpUrl, papersDir: fixture.root } as never);

    const result = await adapter.acquire({ identifier: '10.1000/example', subjectId: 'a'.repeat(64) });

    expect(result).toMatchObject({
      status: 'succeeded',
      provider: 'scansci',
      route: 'source_retrieval',
      source: 'sci-hub.vg',
      sourceUrl: 'https://doi.org/10.1000/example',
      access: { kind: 'source_retrieval', source: 'sci-hub.vg' },
      mimeType: 'application/pdf',
    });
    if (result.status !== 'succeeded') throw new Error('expected success');
    expect(result.bytes.equals(fixture.bytes)).toBe(true);
    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(calls).toEqual([{
      name: 'scansci_pdf_download',
      arguments: { identifier: '10.1000/example', output_dir: fixture.root },
    }]);
  });

  it('retains a declared open-access license as open-access evidence', async () => {
    const fixture = await paperFixture();
    const mcpUrl = await fakeMcp({ result: {
      success: true,
      file: fixture.file,
      source: 'Unpaywall',
      url: 'https://repository.example/paper.pdf',
      license: 'CC-BY-4.0',
    } });
    const adapter = createScanSciAdapter({ enabled: true, mcpUrl, papersDir: fixture.root } as never);

    await expect(adapter.acquire({ identifier: '10.1000/example', subjectId: 'a'.repeat(64) })).resolves.toMatchObject({
      status: 'succeeded',
      route: 'open_access',
      source: 'Unpaywall',
      access: { kind: 'open_access', license: 'CC-BY-4.0' },
    });
  });

  it('turns the upstream login instruction into the existing auth-required product state', async () => {
    const fixture = await paperFixture();
    const mcpUrl = await fakeMcp({ result: {
      success: false,
      error_type: 'paywall',
      action: 'login_required',
    } });
    const adapter = createScanSciAdapter({ enabled: true, mcpUrl, papersDir: fixture.root } as never);

    await expect(adapter.acquire({ identifier: '10.1000/example', subjectId: 'a'.repeat(64) })).resolves.toEqual({
      status: 'unavailable', provider: 'scansci', code: 'auth_required', retryable: false,
    });
  });

  it('does not ingest a path returned outside the shared paper volume', async () => {
    const fixture = await paperFixture();
    const outside = join(await mkdtemp(join(tmpdir(), 'openscience-scansci-outside-')), 'paper.pdf');
    await writeFile(outside, fixture.bytes);
    const mcpUrl = await fakeMcp({ result: {
      success: true,
      file: outside,
      source: 'Unpaywall',
    } });
    const adapter = createScanSciAdapter({ enabled: true, mcpUrl, papersDir: fixture.root } as never);

    await expect(adapter.acquire({ identifier: '10.1000/example', subjectId: 'a'.repeat(64) })).resolves.toEqual({
      status: 'unavailable', provider: 'scansci', code: 'invalid_response', retryable: false,
    });
  });
});
