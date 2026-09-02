#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA = /^[0-9a-f]{40}$/u;
const IMAGE_ID = /^sha256:[0-9a-f]{64}$/u;
const HASH = /^[0-9a-f]{64}$/u;
const WHEEL_SHA256 = 'f68c30503834fc093eb192bd556090d210241eed48445017fdb3d32f6e1355e5';

export const EXPECTED_SCANSCI_TOOLS = Object.freeze([
  'scansci_pdf_batch_download',
  'scansci_pdf_cache_clear',
  'scansci_pdf_channel_status',
  'scansci_pdf_citation',
  'scansci_pdf_config',
  'scansci_pdf_diagnostics',
  'scansci_pdf_download',
  'scansci_pdf_elsevier_setup',
  'scansci_pdf_expand_citations',
  'scansci_pdf_find',
  'scansci_pdf_login',
  'scansci_pdf_parse_list',
  'scansci_pdf_prepare_queue',
  'scansci_pdf_schools',
  'scansci_pdf_search',
  'scansci_pdf_tor',
  'scansci_pdf_zotero_push',
]);

function fail(message) {
  throw new Error(`ScanSci MCP runtime ${message}`);
}

function environment(values = []) {
  return new Map(values.map((entry) => {
    const separator = entry.indexOf('=');
    return [separator < 0 ? entry : entry.slice(0, separator), separator < 0 ? '' : entry.slice(separator + 1)];
  }));
}

function exactImage(image, expectedId, releaseSha, role, entrypoint) {
  const labels = image?.Config?.Labels ?? {};
  if (image?.Id !== expectedId || !IMAGE_ID.test(expectedId)
    || labels['org.openscience.source'] !== releaseSha
    || labels['org.openscience.scansci.role'] !== role
    || labels['org.openscience.scansci.version'] !== '1.13.1'
    || labels['org.openscience.scansci.wheel-sha256'] !== WHEEL_SHA256
    || JSON.stringify(image?.Config?.Entrypoint) !== JSON.stringify(entrypoint)) {
    fail(`${role} image identity is invalid`);
  }
}

function exactVolume(container, destination, suffix, writable) {
  const mounts = (container?.Mounts ?? []).filter((mount) => mount.Destination === destination);
  if (mounts.length !== 1 || mounts[0].Type !== 'volume' || !mounts[0].Name?.endsWith(suffix)
    || mounts[0].RW !== writable) {
    fail(`${destination} paper mount is invalid`);
  }
  return mounts[0].Name;
}

export function verifyRuntimeSnapshot(input) {
  if (!SHA.test(input.releaseSha)
    || input.releaseRoot !== `/opt/openscience-releases/${input.releaseSha}`) {
    fail('release identity is invalid');
  }
  exactImage(input.mcpImage, input.expectedMcpImageId, input.releaseSha, 'official-mcp',
    ['/usr/bin/dumb-init', '--', '/opt/scansci/entrypoint.sh']);
  exactImage(input.authImage, input.expectedAuthImageId, input.releaseSha, 'official-auth',
    ['/usr/bin/dumb-init', '--', '/opt/scansci/auth-entrypoint.sh']);

  const mcp = input.mcpContainer;
  const mcpEnvironment = environment(mcp?.Config?.Env);
  if (mcp?.Image !== input.expectedMcpImageId || mcp?.Config?.User !== '10001:10001'
    || mcp?.Config?.Labels?.['com.docker.compose.service'] !== 'scansci-mcp'
    || mcp?.State?.Running !== true || mcp?.State?.Health?.Status !== 'healthy'
    || !(mcp?.HostConfig?.GroupAdd ?? []).includes('11000')
    || mcpEnvironment.get('SCANSCI_PDF_PROXY') !== 'http://openscience-egress:7891') {
    fail('container topology is invalid');
  }
  for (const key of mcpEnvironment.keys()) {
    if (/^(?:DATABASE|POSTGRES|REDIS|S3_|MINIO|AWS_|MINIMAX|TAVILY|SEMANTIC|.*(?:API_KEY|SECRET|TOKEN|COOKIE))/iu.test(key)) {
      fail('container environment includes an application secret');
    }
  }
  exactVolume(mcp, '/data/scansci', '_scansci-data', true);
  const paperVolume = exactVolume(mcp, '/data/papers', '_scansci-papers', true);

  const tools = [...new Set(input.toolNames)].sort();
  if (JSON.stringify(tools) !== JSON.stringify(EXPECTED_SCANSCI_TOOLS)) {
    fail('tool interface is invalid');
  }

  const markers = ['SCANSCI_MCP_IMAGE_OK', 'SCANSCI_MCP_TOOLS_OK', 'SCANSCI_MCP_STORAGE_OK'];
  if (input.requireWorker) {
    const worker = input.workerContainer;
    const workerEnvironment = environment(worker?.Config?.Env);
    const workerPaperVolume = exactVolume(worker, '/data/papers', '_scansci-papers', true);
    if (worker?.Config?.User !== 'node' || worker?.State?.Running !== true
      || worker?.State?.Health?.Status !== 'healthy'
      || !(worker?.HostConfig?.GroupAdd ?? []).includes('11000')
      || workerEnvironment.get('SCANSCI_ENABLED') !== 'true'
      || workerEnvironment.get('SCANSCI_MCP_URL') !== 'http://scansci-mcp:8000/mcp'
      || workerEnvironment.get('SCANSCI_PAPERS_DIR') !== '/data/papers'
      || workerPaperVolume !== paperVolume) {
      fail('Worker contract is invalid');
    }
    markers.push('SCANSCI_MCP_WORKER_OK');
  }
  if (input.requireOa) {
    const canary = input.oaCanary;
    if (canary?.source !== 'arXiv' || !Number.isInteger(canary?.bytes)
      || canary.bytes < 5 || canary.bytes > 100 * 1024 * 1024
      || !HASH.test(canary?.sha256) || canary?.cleanupCount !== 0) {
      fail('OA cleanup result is invalid');
    }
    markers.push('SCANSCI_MCP_OA_OK');
  }
  return markers;
}

function run(command, args, maximum = 16 * 1024 * 1024) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: maximum });
  if (result.status !== 0) throw new Error(`${command} ${args[0] ?? ''} failed with status ${result.status ?? 'signal'}`);
  return result.stdout.trim();
}

function inspect(kind, target) {
  const values = JSON.parse(run('docker', kind === 'image' ? ['image', 'inspect', target] : ['inspect', target]));
  if (!Array.isArray(values) || values.length !== 1) fail(`${kind} inspect is invalid`);
  return values[0];
}

const toolProbe = `import asyncio,json\nfrom mcp import ClientSession\nfrom mcp.client.streamable_http import streamable_http_client\nasync def main():\n async with streamable_http_client("http://127.0.0.1:8000/mcp") as streams:\n  async with ClientSession(*streams) as session:\n   await session.initialize()\n   result=await session.list_tools()\n   print(json.dumps(sorted(tool.name for tool in result.tools)))\nasyncio.run(main())`;

const oaProbe = `import asyncio,hashlib,json,os\nfrom pathlib import Path\nfrom mcp import ClientSession\nfrom mcp.client.streamable_http import streamable_http_client\nasync def main():\n async with streamable_http_client("http://127.0.0.1:8000/mcp") as streams:\n  async with ClientSession(*streams) as session:\n   await session.initialize()\n   result=await session.call_tool("scansci_pdf_download",{"identifier":"arXiv:2009.06045v1","output_dir":"/data/papers"})\n   texts=[item.text for item in result.content if getattr(item,"type",None)=="text"]\n   assert not result.is_error and len(texts)==1\n   payload=json.loads(texts[0]); assert payload.get("success") is True\n   root=Path("/data/papers").resolve(); target=Path(payload["file"]).resolve()\n   assert target.is_relative_to(root) and target.is_file() and not target.is_symlink()\n   body=target.read_bytes(); assert body.startswith(b"%PDF-") and len(body)<=100*1024*1024\n   os.unlink(target)\n   print(json.dumps({"source":payload["source"],"bytes":len(body),"sha256":hashlib.sha256(body).hexdigest(),"cleanupCount":int(target.exists())},sort_keys=True))\nasyncio.run(main())`;

function containerPython(container, source) {
  return run('docker', ['exec', container, 'python', '-c',
    'import base64,sys;exec(base64.b64decode(sys.argv[1]))', Buffer.from(source).toString('base64')]);
}

export function parseCli(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith('--') || !argv[index + 1] || values.has(argv[index])) fail('CLI arguments are invalid');
    values.set(argv[index], argv[index + 1]);
  }
  const expected = ['--release-root', '--release-sha', '--compose-file', '--expected-mcp-image-id', '--expected-auth-image-id', '--require-worker', '--require-oa'];
  if (values.size !== expected.length || expected.some((key) => !values.has(key))
    || !['0', '1'].includes(values.get('--require-worker')) || !['0', '1'].includes(values.get('--require-oa'))) {
    fail('CLI arguments are invalid');
  }
  const releaseSha = values.get('--release-sha');
  const releaseRoot = values.get('--release-root');
  if (!SHA.test(releaseSha) || releaseRoot !== `/opt/openscience-releases/${releaseSha}`
    || values.get('--compose-file') !== `${releaseRoot}/infra/compose/docker-compose.prod.yml`) {
    fail('CLI release paths are invalid');
  }
  return {
    releaseRoot,
    releaseSha,
    expectedMcpImageId: values.get('--expected-mcp-image-id'),
    expectedAuthImageId: values.get('--expected-auth-image-id'),
    requireWorker: values.get('--require-worker') === '1',
    requireOa: values.get('--require-oa') === '1',
  };
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  const mcpContainerName = 'openscience-prod-scansci-mcp-1';
  const workerContainerName = 'openscience-prod-agent-worker-1';
  const snapshot = {
    ...options,
    mcpImage: inspect('image', `openscience-scansci-mcp:${options.releaseSha}`),
    authImage: inspect('image', `openscience-scansci-auth:${options.releaseSha}`),
    mcpContainer: inspect('container', mcpContainerName),
    workerContainer: options.requireWorker ? inspect('container', workerContainerName) : undefined,
    toolNames: JSON.parse(containerPython(mcpContainerName, toolProbe)),
    oaCanary: options.requireOa ? JSON.parse(containerPython(mcpContainerName, oaProbe)) : undefined,
  };
  process.stdout.write(`${verifyRuntimeSnapshot(snapshot).join('\n')}\n`);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'ScanSci MCP runtime verification failed');
    process.exitCode = 65;
  });
}
