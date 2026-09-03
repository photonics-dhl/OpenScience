import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { EXPECTED_SCANSCI_TOOLS, verifyRuntimeSnapshot } from './verify-scansci-mcp-runtime.mjs';

const sha = 'a'.repeat(40);
const mcpId = `sha256:${'b'.repeat(64)}`;
const labels = {
  'org.openscience.source': sha,
  'org.openscience.scansci.version': '1.13.1',
  'org.openscience.scansci.wheel-sha256': 'f68c30503834fc093eb192bd556090d210241eed48445017fdb3d32f6e1355e5',
};

function fixture() {
  return {
    releaseRoot: `/opt/openscience-releases/${sha}`,
    releaseSha: sha,
    expectedMcpImageId: mcpId,
    mcpImage: {
      Id: mcpId,
      Config: {
        Labels: { ...labels, 'org.openscience.scansci.role': 'official-mcp' },
        Entrypoint: ['/usr/bin/dumb-init', '--', '/opt/scansci/entrypoint.sh'],
      },
    },
    mcpContainer: {
      Image: mcpId,
      Config: {
        User: '10001:10001',
        Labels: { 'com.docker.compose.service': 'scansci-mcp' },
        Env: [
          'SCANSCI_PDF_PROXY=http://openscience-egress:7891',
          'SCANSCI_PDF_SESSION_FILE=/data/scansci/publisher-session.netscape',
          'HOME=/data/scansci/home',
        ],
      },
      HostConfig: {
        GroupAdd: ['11000'],
        ReadonlyRootfs: true,
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges:true'],
        PortBindings: {},
        Privileged: false,
        CapAdd: [],
      },
      NetworkSettings: { Networks: { 'openscience-prod_retrieval_net': {} } },
      Mounts: [
        { Type: 'volume', Name: 'openscience-prod_scansci-data', Destination: '/data/scansci', RW: true },
        { Type: 'volume', Name: 'openscience-prod_scansci-papers', Destination: '/data/papers', RW: true },
      ],
      State: { Running: true, Health: { Status: 'healthy' } },
    },
    workerContainer: {
      Config: {
        User: 'node',
        Env: ['SCANSCI_ENABLED=true', 'SCANSCI_MCP_URL=http://scansci-mcp:8000/mcp', 'SCANSCI_PAPERS_DIR=/data/papers'],
      },
      HostConfig: { GroupAdd: ['11000'] },
      NetworkSettings: { Networks: { 'openscience-prod_retrieval_net': {} } },
      Mounts: [{ Type: 'volume', Name: 'openscience-prod_scansci-papers', Destination: '/data/papers', RW: true }],
      State: { Running: true, Health: { Status: 'healthy' } },
    },
    toolNames: [...EXPECTED_SCANSCI_TOOLS],
    workerToolNames: [...EXPECTED_SCANSCI_TOOLS],
    oaCanary: { source: 'arXiv', bytes: 24_671_920, sha256: 'd'.repeat(64), cleanupCount: 0 },
    requireWorker: true,
    requireOa: true,
  };
}

test('official runtime snapshot binds image, mounts, tools, worker and transient cleanup', () => {
  assert.deepEqual(verifyRuntimeSnapshot(fixture()), [
    'SCANSCI_MCP_IMAGE_OK',
    'SCANSCI_MCP_TOOLS_OK',
    'SCANSCI_MCP_STORAGE_OK',
    'SCANSCI_MCP_WORKER_OK',
    'SCANSCI_MCP_OA_OK',
  ]);
});
test('runtime snapshot rejects application secrets and unsafe paper mounts', () => {
  const secret = fixture();
  secret.mcpContainer.Config.Env.push('DATABASE_URL=postgres://forbidden');
  assert.throws(() => verifyRuntimeSnapshot(secret), /secret|environment/u);

  const readOnly = fixture();
  readOnly.workerContainer.Mounts[0].RW = false;
  assert.throws(() => verifyRuntimeSnapshot(readOnly), /paper mount/u);
});

test('runtime snapshot requires the exact 17-tool interface and successful cleanup', () => {
  const missingTool = fixture();
  missingTool.toolNames.pop();
  assert.throws(() => verifyRuntimeSnapshot(missingTool), /tool interface/u);

  const leaked = fixture();
  leaked.oaCanary.cleanupCount = 1;
  assert.throws(() => verifyRuntimeSnapshot(leaked), /cleanup/u);
});

test('runtime snapshot rejects extra MCP exposure and a Worker without retrieval connectivity', () => {
  const extraNetwork = fixture();
  extraNetwork.mcpContainer.NetworkSettings.Networks['openscience-prod_app_net'] = {};
  assert.throws(() => verifyRuntimeSnapshot(extraNetwork), /topology/u);

  const published = fixture();
  published.mcpContainer.HostConfig.PortBindings = { '8000/tcp': [{ HostIp: '0.0.0.0', HostPort: '8000' }] };
  assert.throws(() => verifyRuntimeSnapshot(published), /topology/u);

  const wrongSessionPath = fixture();
  wrongSessionPath.mcpContainer.Config.Env = wrongSessionPath.mcpContainer.Config.Env
    .map((value) => value.startsWith('SCANSCI_PDF_SESSION_FILE=')
      ? 'SCANSCI_PDF_SESSION_FILE=/tmp/session.netscape' : value);
  assert.throws(() => verifyRuntimeSnapshot(wrongSessionPath), /topology/u);

  const disconnected = fixture();
  disconnected.workerContainer.NetworkSettings.Networks = {};
  assert.throws(() => verifyRuntimeSnapshot(disconnected), /Worker contract/u);

  const extraMount = fixture();
  extraMount.mcpContainer.Mounts.push({ Type: 'bind', Source: '/var/run/docker.sock', Destination: '/var/run/docker.sock', RW: true });
  assert.throws(() => verifyRuntimeSnapshot(extraMount), /topology/u);

  const privileged = fixture();
  privileged.mcpContainer.HostConfig.Privileged = true;
  assert.throws(() => verifyRuntimeSnapshot(privileged), /topology/u);

  const capAdded = fixture();
  capAdded.mcpContainer.HostConfig.CapAdd = ['SYS_ADMIN'];
  assert.throws(() => verifyRuntimeSnapshot(capAdded), /topology/u);
});

test('production transaction builds and publishes only the official MCP identity', async () => {
  const source = await readFile(new URL('./production-deploy-transaction.sh', import.meta.url), 'utf8');
  assert.match(source, /compose_current "build scansci-mcp"/u);
  assert.match(source, /openscience-scansci-mcp:\$RELEASE_SHA/u);
  assert.match(source, /up -d --force-recreate --wait --wait-timeout 300 scansci-mcp/u);
  assert.match(source, /verify-scansci-mcp-runtime\.mjs[^\n]+--require-oa '\$require_oa'/u);
  assert.match(source, /schema=6\\n[\s\S]*scansci_mcp_image_id=%s/u);
  assert.doesNotMatch(source, /scansci-(?:auth|legal|browser|secret-init)|SCANSCI_BROWSER/u);
});
