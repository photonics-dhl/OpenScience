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
  const dataVolume = exactVolume(mcp, '/data/scansci', '_scansci-data', true);
  const paperVolume = exactVolume(mcp, '/data/papers', '_scansci-papers', true);

  const tools = [...new Set(input.toolNames)].sort();
  if (JSON.stringify(tools) !== JSON.stringify(EXPECTED_SCANSCI_TOOLS)) {
    fail('tool interface is invalid');
  }

  const markers = ['SCANSCI_MCP_IMAGE_OK', 'SCANSCI_MCP_TOOLS_OK', 'SCANSCI_MCP_STORAGE_OK'];
  if (input.requireAuth) {
    const auth = input.authContainer;
    const authEnvironment = environment(auth?.Config?.Env);
    const authNetworks = Object.keys(auth?.NetworkSettings?.Networks ?? {});
    const authNetwork = auth?.NetworkSettings?.Networks?.[authNetworks[0]];
    const authNetworkContainers = Object.keys(input.authNetwork?.Containers ?? {});
    const portBindings = Object.keys(auth?.HostConfig?.PortBindings ?? {});
    const publishedPorts = Object.keys(auth?.NetworkSettings?.Ports ?? {});
    if (auth?.Image !== input.expectedAuthImageId || auth?.Config?.User !== '10001:10001'
      || auth?.Config?.Labels?.['com.docker.compose.service'] !== 'scansci-auth'
      || auth?.State?.Running !== true
      || authNetworks.length !== 1 || !authNetworks[0]?.endsWith('_auth_net')
      || authNetwork?.IPAddress !== '172.25.0.2'
      || portBindings.length !== 0 || publishedPorts.length !== 0
      || authEnvironment.get('SCANSCI_PDF_PROXY') !== 'http://openscience-egress:7891'
      || exactVolume(auth, '/data/scansci', '_scansci-data', true) !== dataVolume) {
      fail('auth container topology is invalid');
    }
    if (input.authNetwork?.Name !== authNetworks[0]
      || input.authNetwork?.Internal !== true || input.authNetwork?.EnableIPv6 !== false
      || input.authNetwork?.Options?.['com.docker.network.bridge.name'] !== 'xgs-auth0'
      || JSON.stringify(input.authNetwork?.IPAM?.Config) !== JSON.stringify([{
        Subnet: '172.25.0.0/29', Gateway: '172.25.0.1',
      }])
      || authNetworkContainers.length !== 1 || authNetworkContainers[0] !== auth?.Id
      || JSON.stringify(input.authIsolation) !== JSON.stringify({
        proxyStatus: 204,
        hostSsh: 'blocked',
        hostApi: 'blocked',
        hostDocker: 'blocked',
        rawDirect: 'blocked',
        aliyunMetadata: 'blocked',
        mcpPeer: 'blocked',
        workerPeer: 'blocked',
        hostNoVncHttp: 200,
        hostListener6080: 'absent',
        firewall: 'isolated',
      })) {
      fail('auth network isolation is invalid');
    }
    for (const key of authEnvironment.keys()) {
      if (/^(?:DATABASE|POSTGRES|REDIS|S3_|MINIO|AWS_|MINIMAX|TAVILY|SEMANTIC|.*(?:API_KEY|SECRET|TOKEN|COOKIE))/iu.test(key)) {
        fail('auth container environment includes an application secret');
      }
    }
    markers.push('SCANSCI_MCP_AUTH_OK');
  }
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

function blockedPeer(container, runtime, source) {
  return runtime === 'python'
    ? containerPython(container, source)
    : run('docker', ['exec', container, 'node', '-e', source]);
}

function probeAuthIsolation(authContainer, mcpContainer, workerContainer) {
  const authProbe = JSON.parse(containerPython(authContainer, [
    'import json,socket,urllib.request',
    "proxy='http://openscience-egress:7891'",
    "opener=urllib.request.build_opener(urllib.request.ProxyHandler({'http':proxy,'https':proxy}))",
    "proxy_status=opener.open('https://www.gstatic.com/generate_204',timeout=8).status",
    "def blocked(host,port):\n try:\n  probe=socket.create_connection((host,port),timeout=.5)\n  probe.close()\n  return 'connected'\n except OSError:\n  return 'blocked'",
    "print(json.dumps({'proxyStatus':proxy_status,'hostSsh':blocked('172.25.0.1',22),'hostApi':blocked('172.25.0.1',3001),'hostDocker':blocked('172.25.0.1',2375),'rawDirect':blocked('1.1.1.1',443),'aliyunMetadata':blocked('100.100.100.200',80)},separators=(',',':')))",
  ].join('\n')));
  const mcpPeer = blockedPeer(mcpContainer, 'python', [
    'import socket',
    "try:\n probe=socket.create_connection(('172.25.0.2',6080),timeout=1)\n probe.close()\n print('connected')\nexcept OSError:\n print('blocked')",
  ].join('\n'));
  const workerPeer = blockedPeer(workerContainer, 'node', "const net=require('node:net');let done=false;const finish=(value)=>{if(done)return;done=true;console.log(value);socket.destroy()};const socket=net.createConnection({host:'172.25.0.2',port:6080});socket.setTimeout(1000,()=>finish('blocked'));socket.on('connect',()=>finish('connected'));socket.on('error',()=>finish('blocked'));" );
  const returnRule = ['INPUT', '-i', 'xgs-auth0', '-s', '172.25.0.2/32', '-d', '172.25.0.1/32',
    '-p', 'tcp', '--sport', '6080', '-m', 'conntrack', '--ctstate', 'ESTABLISHED',
    '-m', 'comment', '--comment', 'openscience-scansci-auth-return', '-j', 'ACCEPT'];
  const acceptRule = ['INPUT', '-i', 'xgs-auth0', '-s', '172.25.0.0/29', '-d', '172.25.0.1',
    '-p', 'tcp', '--dport', '7891', '-m', 'comment', '--comment', 'openscience-scansci-auth', '-j', 'ACCEPT'];
  const rejectRule = ['INPUT', '-i', 'xgs-auth0', '-s', '172.25.0.0/29',
    '-m', 'comment', '--comment', 'openscience-scansci-auth', '-j', 'REJECT', '--reject-with', 'icmp-port-unreachable'];
  for (const rule of [returnRule, acceptRule, rejectRule]) run('/usr/sbin/iptables', ['-w', '-C', ...rule]);
  const inputRules = run('/usr/sbin/iptables', ['-w', '-S', 'INPUT']).split(/\r?\n/u);
  const returnRules = inputRules.filter((line) => /--comment "?openscience-scansci-auth-return"?(?: |$)/u.test(line));
  const authRules = inputRules.filter((line) => /--comment "?openscience-scansci-auth"?(?: |$)/u.test(line));
  const returnIndex = inputRules.indexOf(returnRules[0]);
  const acceptIndex = inputRules.findIndex((line) => authRules.includes(line) && /--dport 7891 .* -j ACCEPT$/u.test(line));
  const rejectIndex = inputRules.findIndex((line) => authRules.includes(line) && /-j REJECT /u.test(line));
  if (returnRules.length !== 1 || authRules.length !== 2
    || returnIndex < 0 || acceptIndex <= returnIndex || rejectIndex <= acceptIndex) {
    fail('auth network firewall is invalid');
  }
  const hostNoVncHttp = Number(run('curl', [
    '--noproxy', '*', '--fail', '--silent', '--show-error', '--output', '/dev/null',
    '--write-out', '%{http_code}', '--connect-timeout', '2', '--max-time', '3',
    'http://172.25.0.2:6080/vnc.html?autoconnect=true',
  ]));
  const hostListener6080 = run('/usr/sbin/ss', ['-H', '-ltn', 'sport = :6080']) === '' ? 'absent' : 'present';
  return {
    ...authProbe,
    mcpPeer,
    workerPeer,
    hostNoVncHttp,
    hostListener6080,
    firewall: 'isolated',
  };
}

export function parseCli(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith('--') || !argv[index + 1] || values.has(argv[index])) fail('CLI arguments are invalid');
    values.set(argv[index], argv[index + 1]);
  }
  const expected = ['--release-root', '--release-sha', '--compose-file', '--expected-mcp-image-id', '--expected-auth-image-id', '--require-worker', '--require-oa', '--require-auth'];
  if (values.size !== expected.length || expected.some((key) => !values.has(key))
    || !['0', '1'].includes(values.get('--require-worker')) || !['0', '1'].includes(values.get('--require-oa'))
    || !['0', '1'].includes(values.get('--require-auth'))) {
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
    requireAuth: values.get('--require-auth') === '1',
  };
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  const mcpContainerName = 'openscience-prod-scansci-mcp-1';
  const workerContainerName = 'openscience-prod-agent-worker-1';
  const authContainer = options.requireAuth ? inspect('container', 'openscience-prod-scansci-auth-1') : undefined;
  const authNetworkNames = Object.keys(authContainer?.NetworkSettings?.Networks ?? {})
    .filter((name) => name.endsWith('_auth_net'));
  const authNetwork = options.requireAuth && authNetworkNames.length === 1
    ? inspect('network', authNetworkNames[0])
    : undefined;
  const snapshot = {
    ...options,
    mcpImage: inspect('image', `openscience-scansci-mcp:${options.releaseSha}`),
    authImage: inspect('image', `openscience-scansci-auth:${options.releaseSha}`),
    mcpContainer: inspect('container', mcpContainerName),
    authContainer,
    authNetwork,
    authIsolation: options.requireAuth
      ? probeAuthIsolation('openscience-prod-scansci-auth-1', mcpContainerName, workerContainerName)
      : undefined,
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
