import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { EXPECTED_SCANSCI_TOOLS, verifyRuntimeSnapshot } from './verify-scansci-mcp-runtime.mjs';

const sha = 'a'.repeat(40);
const mcpId = `sha256:${'b'.repeat(64)}`;
const authId = `sha256:${'c'.repeat(64)}`;
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
    expectedAuthImageId: authId,
    mcpImage: { Id: mcpId, Config: { Labels: { ...labels, 'org.openscience.scansci.role': 'official-mcp' }, Entrypoint: ['/usr/bin/dumb-init', '--', '/opt/scansci/entrypoint.sh'] } },
    authImage: { Id: authId, Config: { Labels: { ...labels, 'org.openscience.scansci.role': 'official-auth' }, Entrypoint: ['/usr/bin/dumb-init', '--', '/opt/scansci/auth-entrypoint.sh'] } },
    mcpContainer: {
      Image: mcpId,
      Config: {
        User: '10001:10001',
        Labels: { 'com.docker.compose.service': 'scansci-mcp' },
        Env: ['SCANSCI_PDF_PROXY=http://openscience-egress:7891', 'HOME=/data/scansci/home'],
      },
      HostConfig: { GroupAdd: ['11000'] },
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
      Mounts: [{ Type: 'volume', Name: 'openscience-prod_scansci-papers', Destination: '/data/papers', RW: true }],
      State: { Running: true, Health: { Status: 'healthy' } },
    },
    toolNames: [...EXPECTED_SCANSCI_TOOLS],
    oaCanary: { source: 'arXiv', bytes: 24_671_920, sha256: 'd'.repeat(64), cleanupCount: 0 },
    requireWorker: true,
    requireOa: true,
  };
}

test('official runtime snapshot binds images, mounts, tools, worker and transient cleanup', () => {
  assert.deepEqual(verifyRuntimeSnapshot(fixture()), [
    'SCANSCI_MCP_IMAGE_OK',
    'SCANSCI_MCP_TOOLS_OK',
    'SCANSCI_MCP_STORAGE_OK',
    'SCANSCI_MCP_WORKER_OK',
    'SCANSCI_MCP_OA_OK',
  ]);
});

test('runtime snapshot rejects an application secret and a read-only worker paper mount', () => {
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

test('production transaction builds, verifies and publishes schema 5 official MCP identities', async () => {
  const source = await readFile(new URL('./production-deploy-transaction.sh', import.meta.url), 'utf8');
  assert.match(source, /compose_scansci_auth_current "build scansci-mcp scansci-auth"/u);
  assert.match(source, /openscience-scansci-mcp:\$RELEASE_SHA/u);
  assert.match(source, /up -d --force-recreate --wait --wait-timeout 300 scansci-mcp/u);
  assert.match(source, /verify-scansci-mcp-runtime\.mjs[^\n]+--require-oa '\$require_oa'/u);
  assert.match(source, /schema=5\\n[\s\S]*scansci_mcp_image_id=%s/u);
});
