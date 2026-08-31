import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { formatRuntimeStatuses, verifyRootOwnedSecretMetadata, verifyScanSciRuntime } from './verify-scansci-runtime.mjs';
import * as runtimeVerifier from './verify-scansci-runtime.mjs';

const releaseSha = 'a'.repeat(40);
const archiveSha = 'b'.repeat(64);
const tokenValue = 'fixture-service-token-must-never-print';

async function fixture() {
  const releaseRoot = await mkdtemp(join(tmpdir(), 'scansci-runtime-'));
  const app = join(releaseRoot, 'apps', 'scansci-legal');
  await mkdir(app, { recursive: true });
  const requirements = `scansci-pdf @ https://example.invalid/archive.tar.gz#sha256=${archiveSha}\n`;
  const buildRequirements = 'setuptools==75.0.0 --hash=sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc\n';
  await Promise.all([
    writeFile(join(releaseRoot, '.release-source'), `${releaseSha}\n`),
    writeFile(join(app, 'requirements.lock'), requirements),
    writeFile(join(app, 'build-requirements.lock'), buildRequirements),
    writeFile(join(app, 'upstream.lock.json'), `${JSON.stringify({
      name: 'scansci-pdf', version: '1.11.0', commit: '7017814758f826ea21470a609890a7d3ca374b8e',
      archiveUrl: 'https://example.invalid/archive.tar.gz', archiveSha256: archiveSha,
      strategy: 'legal_only', scihub: false, tor: false,
      install: 'python -m pip install --require-hashes -r build-requirements.lock && python -m pip install --require-hashes --no-build-isolation -r requirements.lock',
    }, null, 2)}\n`),
  ]);
  const serviceTokenPath = join(releaseRoot, 'scansci_service_token');
  await writeFile(serviceTokenPath, `${tokenValue}\n`, { mode: 0o600 });
  await chmod(serviceTokenPath, 0o600);
  const digest = (source) => createHash('sha256').update(source).digest('hex');
  const labels = {
    'org.openscience.source': releaseSha,
    'org.openscience.scansci.archive-sha256': archiveSha,
    'org.openscience.scansci.requirements-sha256': digest(requirements),
    'org.openscience.scansci.build-requirements-sha256': digest(buildRequirements),
    'org.openscience.scansci.role': 'legal',
  };
  const composeFile = join(releaseRoot, 'infra', 'compose', 'docker-compose.prod.yml').replaceAll('\\', '/');
  const container = {
    Config: {
      User: '10001:10001',
      Env: [
        'SCANSCI_ENABLED=true', 'SCANSCI_SERVICE_TOKEN_FILE=/run/secrets/scansci_service_token',
        'SCANSCI_STRATEGY=legal_only', 'SCANSCI_SCIHUB_ENABLED=false', 'SCANSCI_TOR_ENABLED=false',
        'SCANSCI_EGRESS_PROXY=http://openscience-egress:7891',
      ],
      Labels: {
        ...labels,
        'com.docker.compose.project.working_dir': releaseRoot.replaceAll('\\', '/'),
        'com.docker.compose.project.config_files': composeFile,
        'com.docker.compose.service': 'scansci-legal',
      },
      Entrypoint: ['python', '-m', 'scansci_legal.main'],
      Cmd: [],
    },
    HostConfig: {
      ReadonlyRootfs: true, CapDrop: ['ALL'], PortBindings: {}, Memory: 1024 ** 3,
      Privileged: false, CapAdd: [],
      NanoCpus: 1_000_000_000, PidsLimit: 64, SecurityOpt: ['no-new-privileges:true'],
      ExtraHosts: ['openscience-egress:172.24.0.1'],
      Tmpfs: { '/tmp': 'size=256m,noexec,nosuid,nodev,uid=10001,gid=10001,mode=0700' },
    },
    Mounts: [
      { Type: 'volume', Name: 'openscience-prod_scansci-session', Source: '/var/lib/docker/volumes/session/_data', Destination: '/session', RW: true },
      { Type: 'volume', Name: 'openscience-prod_scansci-service-secrets', Source: '/var/lib/docker/volumes/secrets/_data', Destination: '/run/secrets', RW: false },
    ],
    NetworkSettings: { Networks: {
      'openscience-prod_retrieval_net': {
        IPAddress: '172.24.0.2', Gateway: '172.24.0.1',
      },
    }, Ports: { '8080/tcp': null } },
    State: { Running: true, Health: { Status: 'healthy' } },
    Image: `sha256:${'d'.repeat(64)}`,
  };
  const image = {
    Id: container.Image,
    Config: { User: '10001:10001', Labels: labels, Entrypoint: ['python', '-m', 'scansci_legal.main'] },
  };
  const authImage = {
    Id: `sha256:${'e'.repeat(64)}`,
    Config: {
      User: '10001:10001',
      Labels: { ...labels, 'org.openscience.scansci.role': 'auth' },
      Entrypoint: ['/usr/bin/tini', '--', '/usr/local/bin/scansci-auth-entrypoint'],
    },
  };
  const workerContainer = {
    Image: `sha256:${'c'.repeat(64)}`,
    Config: {
      User: 'node', WorkingDir: '/opt/openscience/apps/agent-worker', Cmd: ['node', 'dist/index.js'],
      Env: [
        'SCANSCI_ENABLED=true', 'SCANSCI_BASE_URL=http://scansci-legal:8080',
        'SCANSCI_SERVICE_TOKEN_FILE=/run/scansci-worker-secrets/scansci_service_token',
      ],
      Labels: {
        'com.docker.compose.project.working_dir': releaseRoot.replaceAll('\\', '/'),
        'com.docker.compose.project.config_files': composeFile,
        'com.docker.compose.service': 'agent-worker',
      },
    },
    Mounts: [
      { Type: 'bind', Source: releaseRoot, Destination: '/opt/openscience', RW: false },
      { Type: 'volume', Name: 'openscience-prod_parser-jobs', Destination: '/parser-jobs', RW: true },
      { Type: 'volume', Name: 'openscience-prod_scansci-worker-secrets', Destination: '/run/scansci-worker-secrets', RW: false },
    ],
    NetworkSettings: { Networks: {
      'openscience-prod_app_net': {}, 'openscience-prod_data_net': {},
      'openscience-prod_embedding_net': {}, 'openscience-prod_retrieval_net': {},
    } },
    State: { Running: true, Health: { Status: 'healthy' } },
  };
  const workerImage = {
    Id: workerContainer.Image,
    Config: { Labels: { 'org.openscience.source': releaseSha } },
  };
  return {
    releaseRoot, serviceTokenPath, composeFile, container, image, authImage, workerContainer, workerImage,
    retrievalNetwork: {
      Name: 'openscience-prod_retrieval_net', Internal: true,
      IPAM: { Config: [{ Subnet: '172.24.0.0/24', Gateway: '172.24.0.1' }] },
    },
    controlledEgressProbe: {
      proxyAddress: '172.24.0.1', proxyPeer: '172.24.0.1:7891',
      allowStatus: 204, privateStatus: 403, httpStatus: 403, non443Status: 403,
      rawDirect: 'blocked',
    },
  };
}

test('runtime verifier validates immutable source, bounded topology, Secret and persistent session without exposing values', async (t) => {
  const f = await fixture();
  t.after(async () => rm(f.releaseRoot, { recursive: true, force: true }));

  const report = await verifyScanSciRuntime({
    ...f,
    releaseSha,
    sessionStatus: 'ready',
    authContainerIds: [],
    sourceFileLimitMetadata: '104857600:104857600',
    runtimeSecretMetadata: '10001:10001:400',
    runtimeSecretSha256: createHash('sha256').update(tokenValue).digest('hex'),
    workerSecretMetadata: '1000:1000:400',
    workerSecretSha256: createHash('sha256').update(tokenValue).digest('hex'),
    requiredSecretUid: process.getuid?.(),
    expectedLegalImageId: f.image.Id,
    expectedAuthImageId: f.authImage.Id,
  });
  const output = formatRuntimeStatuses(report);

  assert.match(output, /SCANSCI_RUNTIME_SOURCE_OK/u);
  assert.match(output, /SCANSCI_RUNTIME_TOPOLOGY_OK/u);
  assert.match(output, /SCANSCI_RUNTIME_POLICY_OK/u);
  assert.match(output, /SCANSCI_RUNTIME_FILE_LIMIT_OK/u);
  assert.match(output, /SCANSCI_RUNTIME_TOKEN_OK/u);
  assert.match(output, /SCANSCI_RUNTIME_SESSION_READY/u);
  assert.doesNotMatch(output, new RegExp(tokenValue, 'u'));
  assert.doesNotMatch(output, /sciencedirect\.json|cookie|password/iu);
});

test('runtime verifier requires a bounded real worker-entry arXiv OA PDF canary when requested', async (t) => {
  const f = await fixture();
  t.after(async () => rm(f.releaseRoot, { recursive: true, force: true }));
  const base = {
    ...f,
    releaseSha,
    sessionStatus: 'ready',
    authContainerIds: [],
    sourceFileLimitMetadata: '104857600:104857600',
    runtimeSecretMetadata: '10001:10001:400',
    runtimeSecretSha256: createHash('sha256').update(tokenValue).digest('hex'),
    workerSecretMetadata: '1000:1000:400',
    workerSecretSha256: createHash('sha256').update(tokenValue).digest('hex'),
    requiredSecretUid: process.getuid?.(),
    expectedLegalImageId: f.image.Id,
    expectedAuthImageId: f.authImage.Id,
    requireOaCanary: true,
    oaCanaryResult: {
      identifier: 'arXiv:2009.06045v1', route: 'open_access', contentType: 'application/pdf',
      magic: '%PDF-', bytes: 4096,
    },
  };
  const report = await verifyScanSciRuntime(base);
  assert.match(formatRuntimeStatuses(report), /SCANSCI_RUNTIME_OA_CANARY_OK/u);

  for (const mutate of [
    (input) => { input.oaCanaryResult = undefined; },
    (input) => { input.oaCanaryResult.identifier = 'arXiv:1706.03762'; },
    (input) => { input.oaCanaryResult.route = 'institutional'; },
    (input) => { input.oaCanaryResult.contentType = 'text/html'; },
    (input) => { input.oaCanaryResult.magic = '<html'; },
    (input) => { input.oaCanaryResult.bytes = 0; },
    (input) => { input.oaCanaryResult.bytes = 104857601; },
  ]) {
    const input = structuredClone(base);
    mutate(input);
    await assert.rejects(verifyScanSciRuntime(input), /ScanSci runtime verification failed/u);
  }
});

test('runtime verifier fails closed on forbidden network, grey-source flags, auth helper, or disabled session', async (t) => {
  const f = await fixture();
  t.after(async () => rm(f.releaseRoot, { recursive: true, force: true }));
  for (const mutate of [
    (input) => { input.container.NetworkSettings.Networks['openscience-prod_data_net'] = {}; },
    (input) => { input.container.Config.Env.push('TOR_PROXY='); },
    (input) => { input.container.Config.Env = input.container.Config.Env.filter((entry) => !entry.startsWith('SCANSCI_EGRESS_PROXY=')); },
    (input) => { input.container.Config.Env = input.container.Config.Env.map((entry) => entry.startsWith('SCANSCI_EGRESS_PROXY=') ? 'SCANSCI_EGRESS_PROXY=http://wrong.invalid:7891' : entry); },
    (input) => { input.container.HostConfig.ExtraHosts = ['openscience-egress:203.0.113.1']; },
    (input) => { input.retrievalNetwork.Internal = false; },
    (input) => { input.retrievalNetwork.IPAM.Config[0].Subnet = '172.25.0.0/24'; },
    (input) => { input.retrievalNetwork.IPAM.Config[0].Gateway = '172.24.0.254'; },
    (input) => { input.container.NetworkSettings.Networks['openscience-prod_retrieval_net'].Gateway = '172.24.0.254'; },
    (input) => { input.container.NetworkSettings.Networks['openscience-prod_retrieval_net'].IPAddress = '172.25.0.2'; },
    (input) => { input.controlledEgressProbe.proxyAddress = '172.24.0.2'; },
    (input) => { input.controlledEgressProbe.proxyPeer = '172.24.0.1:7890'; },
    (input) => { input.controlledEgressProbe.allowStatus = 200; },
    (input) => { input.controlledEgressProbe.privateStatus = 200; },
    (input) => { input.controlledEgressProbe.httpStatus = 200; },
    (input) => { input.controlledEgressProbe.non443Status = 200; },
    (input) => { input.controlledEgressProbe.rawDirect = 'connected'; },
    (input) => { input.container.HostConfig.Privileged = true; },
    (input) => { input.container.HostConfig.CapAdd = ['SYS_ADMIN']; },
    (input) => { input.container.HostConfig.Tmpfs['/tmp'] = 'size=64m'; },
    (input) => { input.sourceFileLimitMetadata = '104857600:-1'; },
    (input) => { input.authContainerIds = ['abc123']; },
    (input) => { input.runtimeSecretSha256 = 'f'.repeat(64); },
    (input) => { input.authImage.Config.Labels['org.openscience.scansci.role'] = 'legal'; },
    (input) => { input.authImage.Config.Entrypoint = ['python', '-m', 'scansci_legal.main']; },
    (input) => { input.expectedLegalImageId = `sha256:${'f'.repeat(64)}`; },
    (input) => { input.expectedAuthImageId = `sha256:${'f'.repeat(64)}`; },
    (input) => { input.container.Config.Entrypoint = ['/bin/sh']; },
    (input) => { input.container.Config.Cmd = ['fake-healthy']; },
    (input) => { input.workerContainer.Mounts[2].Name = 'wrong-worker-secret'; },
    (input) => { input.workerContainer.Mounts[0].RW = true; },
    (input) => { input.workerContainer.Config.Labels['com.docker.compose.service'] = 'api'; },
    (input) => { input.workerContainer.NetworkSettings.Networks = { 'openscience-prod_app_net': {} }; },
    (input) => { input.workerContainer.State.Running = false; },
    (input) => { input.workerContainer.Config.Env = input.workerContainer.Config.Env.filter((entry) => !entry.startsWith('SCANSCI_ENABLED=')); },
    (input) => { input.workerContainer.Config.Env = input.workerContainer.Config.Env.filter((entry) => !entry.startsWith('SCANSCI_BASE_URL=')); },
    (input) => { input.workerContainer.Config.Env = input.workerContainer.Config.Env.map((entry) => entry === 'SCANSCI_ENABLED=true' ? 'SCANSCI_ENABLED=false' : entry); },
    (input) => { input.workerContainer.Config.Env = input.workerContainer.Config.Env.map((entry) => entry.startsWith('SCANSCI_BASE_URL=') ? 'SCANSCI_BASE_URL=http://wrong:8080' : entry); },
    (input) => { input.sessionStatus = 'disabled'; },
  ]) {
    const fresh = await fixture();
    const input = {
      ...fresh,
      releaseSha,
      sessionStatus: 'ready',
      authContainerIds: [],
      sourceFileLimitMetadata: '104857600:104857600',
      runtimeSecretMetadata: '10001:10001:400',
      runtimeSecretSha256: createHash('sha256').update(tokenValue).digest('hex'),
      workerSecretMetadata: '1000:1000:400',
      workerSecretSha256: createHash('sha256').update(tokenValue).digest('hex'),
      requiredSecretUid: process.getuid?.(),
      expectedLegalImageId: fresh.image.Id,
      expectedAuthImageId: fresh.authImage.Id,
    };
    mutate(input);
    await assert.rejects(verifyScanSciRuntime(input), /ScanSci runtime verification failed/u);
    await rm(fresh.releaseRoot, { recursive: true, force: true });
  }
});

test('canonical Worker verification rejects a running container from a different image', async (t) => {
  const f = await fixture();
  t.after(async () => rm(f.releaseRoot, { recursive: true, force: true }));
  f.workerContainer.Image = `sha256:${'9'.repeat(64)}`;

  await assert.rejects(verifyScanSciRuntime({
    ...f,
    releaseSha,
    sessionStatus: 'ready',
    authContainerIds: [],
    sourceFileLimitMetadata: '104857600:104857600',
    runtimeSecretMetadata: '10001:10001:400',
    runtimeSecretSha256: createHash('sha256').update(tokenValue).digest('hex'),
    workerSecretMetadata: '1000:1000:400',
    workerSecretSha256: createHash('sha256').update(tokenValue).digest('hex'),
    requiredSecretUid: process.getuid?.(),
    expectedLegalImageId: f.image.Id,
    expectedAuthImageId: f.authImage.Id,
  }), /ScanSci runtime verification failed/u);
});

test('canonical Worker verification rejects an image with the wrong source label', async (t) => {
  const f = await fixture();
  t.after(async () => rm(f.releaseRoot, { recursive: true, force: true }));
  f.workerImage.Config.Labels['org.openscience.source'] = '9'.repeat(40);

  await assert.rejects(verifyScanSciRuntime({
    ...f,
    releaseSha,
    sessionStatus: 'ready',
    authContainerIds: [],
    sourceFileLimitMetadata: '104857600:104857600',
    runtimeSecretMetadata: '10001:10001:400',
    runtimeSecretSha256: createHash('sha256').update(tokenValue).digest('hex'),
    workerSecretMetadata: '1000:1000:400',
    workerSecretSha256: createHash('sha256').update(tokenValue).digest('hex'),
    requiredSecretUid: process.getuid?.(),
    expectedLegalImageId: f.image.Id,
    expectedAuthImageId: f.authImage.Id,
  }), /ScanSci runtime verification failed/u);
});

test('Worker verification rejects an arbitrary extra mount', async (t) => {
  const f = await fixture();
  t.after(async () => rm(f.releaseRoot, { recursive: true, force: true }));
  f.workerContainer.Mounts.push({
    Type: 'bind', Source: '/var/run/docker.sock', Destination: '/var/run/docker.sock', RW: true,
  });

  await assert.rejects(verifyScanSciRuntime({
    ...f,
    releaseSha,
    sessionStatus: 'ready',
    authContainerIds: [],
    sourceFileLimitMetadata: '104857600:104857600',
    runtimeSecretMetadata: '10001:10001:400',
    runtimeSecretSha256: createHash('sha256').update(tokenValue).digest('hex'),
    workerSecretMetadata: '1000:1000:400',
    workerSecretSha256: createHash('sha256').update(tokenValue).digest('hex'),
    requiredSecretUid: process.getuid?.(),
    expectedLegalImageId: f.image.Id,
    expectedAuthImageId: f.authImage.Id,
  }), /ScanSci runtime verification failed/u);
});

test('runtime identity modes keep prepublication explicit and canonical sidecar-only', async () => {
  assert.equal(typeof runtimeVerifier.parseRuntimeCli, 'function');
  assert.equal(typeof runtimeVerifier.resolveRuntimeImageIdentity, 'function');
  const legalImageId = `sha256:${'d'.repeat(64)}`;
  const authImageId = `sha256:${'e'.repeat(64)}`;
  const releaseRoot = `/opt/openscience-releases/${releaseSha}`;
  const base = [
    '--release-root', releaseRoot, '--release-sha', releaseSha,
    '--compose-file', `${releaseRoot}/infra/compose/docker-compose.prod.yml`,
    '--service-token-file', '/opt/openscience-secrets/scansci/scansci_service_token',
    '--require-worker', '1', '--require-oa-canary', '0', '--allow-auth', '0',
  ];
  const prepublication = runtimeVerifier.parseRuntimeCli([
    ...base, '--mode', 'prepublication',
    '--expected-legal-image-id', legalImageId, '--expected-auth-image-id', authImageId,
  ]);
  assert.equal(prepublication['--mode'], 'prepublication');
  const legacyBase = base.filter((value, index) => !['--require-oa-canary', '0'].includes(value)
    || base[index - 1] !== '--require-oa-canary' && value !== '--require-oa-canary');
  const legacyPrepublication = runtimeVerifier.parseRuntimeCli([
    ...legacyBase, '--mode', 'prepublication',
    '--expected-legal-image-id', legalImageId, '--expected-auth-image-id', authImageId,
  ]);
  assert.equal(legacyPrepublication['--require-oa-canary'], undefined);
  const prepublicationIdentity = await runtimeVerifier.resolveRuntimeImageIdentity(prepublication, {
    readCapability: async () => assert.fail('prepublication read a canonical capability sidecar'),
    capabilityExists: async () => false,
  });
  assert.deepEqual(prepublicationIdentity, { legalImageId, authImageId });

  for (const args of [
    [...base, '--mode', 'prepublication', '--expected-legal-image-id', legalImageId],
    [...base, '--mode', 'prepublication', '--expected-legal-image-id', legalImageId, '--expected-auth-image-id', authImageId,
      '--capability-file', `/opt/openscience/.release-capabilities/${releaseSha}`],
    [...base, '--expected-legal-image-id', legalImageId, '--expected-auth-image-id', authImageId],
    [...base, '--mode', 'canonical', '--capability-file', `/opt/openscience/.release-capabilities/${releaseSha}`],
  ]) assert.throws(() => runtimeVerifier.parseRuntimeCli(args), /failed/u);
  await assert.rejects(runtimeVerifier.resolveRuntimeImageIdentity(prepublication, {
    readCapability: async () => assert.fail('prepublication read a canonical capability sidecar'),
    capabilityExists: async () => true,
  }), /failed/u);

  const capabilityFile = `/opt/openscience/.release-capabilities/${releaseSha}`;
  const canonical = runtimeVerifier.parseRuntimeCli([
    ...base, '--capability-file', capabilityFile,
  ]);
  const capabilitySource = [
    'schema=3', 'embedding_deploy=false', 'bge_m3_enabled=false', 'model_version_id=',
    'model_revision=', 'source_sha256=', 'package_freeze_sha256=', 'model_manifest_sha256=',
    'scansci_deploy=true', `scansci_legal_image_id=${legalImageId}`, `scansci_auth_image_id=${authImageId}`,
  ].join('\n');
  let canonicalReads = 0;
  assert.deepEqual(await runtimeVerifier.resolveRuntimeImageIdentity(canonical, {
    readCapability: async (path) => { canonicalReads += 1; assert.equal(path, capabilityFile); return capabilitySource; },
    capabilityExists: async () => assert.fail('canonical mode used the prepublication absence probe'),
  }), { legalImageId, authImageId });
  assert.equal(canonicalReads, 1);
});

test('runtime verifier rejects wrong-group host metadata and validates an explicitly running auth role', async (t) => {
  assert.throws(() => verifyRootOwnedSecretMetadata({ isFile: true, symbolic: false, nlink: 1, uid: 0, gid: 1, mode: 0o600 }), /failed/u);
  const f = await fixture();
  t.after(async () => rm(f.releaseRoot, { recursive: true, force: true }));
  const authContainer = {
    Id: 'abc123def456',
    Image: f.authImage.Id,
    State: { Running: true },
    HostConfig: {
      NetworkMode: 'openscience-prod_auth_net', ReadonlyRootfs: true, Privileged: false,
      CapDrop: ['ALL'], CapAdd: [], SecurityOpt: ['no-new-privileges:true'],
      Memory: 1024 ** 3, NanoCpus: 1_000_000_000, PidsLimit: 256,
      ExtraHosts: ['openscience-egress:172.25.0.1'],
      PortBindings: { '6080/tcp': [{ HostIp: '127.0.0.1', HostPort: '6080' }] },
      Tmpfs: {
        '/tmp': 'size=256m,noexec,nosuid,nodev,uid=10001,gid=10001,mode=0700',
        '/dev/shm': 'size=256m,nosuid,nodev,uid=10001,gid=10001,mode=0700',
      },
    },
    Mounts: [
      { Type: 'volume', Name: 'openscience-prod_scansci-session', Destination: '/session', RW: true },
    ],
    Config: {
      User: '10001:10001',
      Env: ['SCANSCI_BROWSER_PROXY=http://openscience-egress:7891'],
      Labels: { 'org.openscience.scansci.role': 'auth' },
      Entrypoint: ['/usr/bin/tini', '--', '/usr/local/bin/scansci-auth-entrypoint'],
      Cmd: [],
    },
    NetworkSettings: {
      Networks: { 'openscience-prod_auth_net': { IPAddress: '172.25.0.2', Gateway: '172.25.0.1' } },
      Ports: { '6080/tcp': [{ HostIp: '127.0.0.1', HostPort: '6080' }] },
    },
  };
  const authNetwork = {
    Name: 'openscience-prod_auth_net', Internal: true,
    Options: { 'com.docker.network.bridge.name': 'xgs-auth0' },
    IPAM: { Config: [{ Subnet: '172.25.0.0/29', Gateway: '172.25.0.1' }] },
    Containers: { abc123def456: { Name: 'openscience-prod-scansci-auth-1' } },
  };
  const authIsolationProbe = {
    proxyAddress: '172.25.0.1', proxyPeer: '172.25.0.1:7891', allowStatus: 204,
    hostSsh: 'blocked', hostPrimary: 'blocked', rawDirect: 'blocked', legalPeer: 'blocked', firewall: 'isolated',
  };
  const authProcessList = [
    'COMMAND',
    'Xvfb :99 -screen 0 1280x800x24 -nolisten tcp',
    'x11vnc -display :99 -rfbport 5900 -listen 127.0.0.1 -forever -shared -nopw -no6',
    'websockify --web=/usr/share/novnc 0.0.0.0:6080 127.0.0.1:5900',
    'python -m scansci_legal.auth_login --operator-start',
    '/usr/lib/chromium/chromium --no-sandbox --proxy-server=http://openscience-egress:7891 --disable-quic --force-webrtc-ip-handling-policy=disable_non_proxied_udp',
  ].join('\n');
  await verifyScanSciRuntime({
    ...f, releaseSha, sessionStatus: 'ready', authContainerIds: ['abc123def456'], authContainers: [authContainer],
    authNetwork, authIsolationProbe,
    authProcessList, authPids: 24,
    allowRunningAuth: true, sourceFileLimitMetadata: '104857600:104857600', runtimeSecretMetadata: '10001:10001:400',
    runtimeSecretSha256: createHash('sha256').update(tokenValue).digest('hex'),
    workerSecretMetadata: '1000:1000:400', workerSecretSha256: createHash('sha256').update(tokenValue).digest('hex'),
    requiredSecretUid: process.getuid?.(), expectedLegalImageId: f.image.Id, expectedAuthImageId: f.authImage.Id,
  });
  for (const mutate of [
    (candidate) => { candidate.State.Running = false; },
    (candidate) => { candidate.Image = `sha256:${'f'.repeat(64)}`; },
    (candidate) => { candidate.Config.Entrypoint = ['/bin/sh']; },
    (candidate) => { candidate.Config.Cmd = ['fake-ready']; },
    (candidate) => { candidate.HostConfig.NetworkMode = 'host'; },
    (candidate) => { candidate.HostConfig.PortBindings['6080/tcp'][0].HostIp = '0.0.0.0'; },
    (candidate) => { candidate.Config.Env = ['SCANSCI_BROWSER_PROXY=http://hostile.invalid:3128']; },
    (candidate) => { candidate.HostConfig.SecurityOpt = []; },
    (candidate) => { candidate.NetworkSettings.Networks = { bridge: {} }; },
    (candidate) => { candidate.Mounts.push({ Type: 'volume', Name: 'auth-secrets', Destination: '/run/secrets', RW: false }); },
    (candidate) => { candidate.Mounts.push({ Type: 'bind', Source: '/var/run/docker.sock', Destination: '/var/run/docker.sock', RW: true }); },
    (candidate) => { candidate.Mounts.push({ Type: 'bind', Source: '/srv/host-data', Destination: '/host-data', RW: false }); },
  ]) {
    const candidate = structuredClone(authContainer);
    mutate(candidate);
    await assert.rejects(verifyScanSciRuntime({
      ...f, releaseSha, sessionStatus: 'ready', authContainerIds: ['abc123def456'], authContainers: [candidate],
      authNetwork, authIsolationProbe,
      authProcessList, authPids: 24,
      allowRunningAuth: true, sourceFileLimitMetadata: '104857600:104857600', runtimeSecretMetadata: '10001:10001:400',
      runtimeSecretSha256: createHash('sha256').update(tokenValue).digest('hex'),
      workerSecretMetadata: '1000:1000:400', workerSecretSha256: createHash('sha256').update(tokenValue).digest('hex'),
      requiredSecretUid: process.getuid?.(), expectedLegalImageId: f.image.Id, expectedAuthImageId: f.authImage.Id,
    }), /failed/u);
  }
  for (const invalid of [
    { authProcessList: authProcessList.replace(' --no-sandbox', ''), authPids: 24 },
    { authProcessList: authProcessList.replace(' --proxy-server=http://openscience-egress:7891', ''), authPids: 24 },
    { authProcessList, authPids: 97 },
  ]) {
    await assert.rejects(verifyScanSciRuntime({
      ...f, releaseSha, sessionStatus: 'ready', authContainerIds: ['abc123def456'], authContainers: [authContainer],
      authNetwork, authIsolationProbe,
      ...invalid,
      allowRunningAuth: true, sourceFileLimitMetadata: '104857600:104857600', runtimeSecretMetadata: '10001:10001:400',
      runtimeSecretSha256: createHash('sha256').update(tokenValue).digest('hex'),
      workerSecretMetadata: '1000:1000:400', workerSecretSha256: createHash('sha256').update(tokenValue).digest('hex'),
      requiredSecretUid: process.getuid?.(), expectedLegalImageId: f.image.Id, expectedAuthImageId: f.authImage.Id,
    }), /failed/u);
  }
  for (const mutate of [
    (network, isolation) => { network.Internal = false; },
    (network, isolation) => { network.Containers.extra = { Name: 'openscience-prod-agent-worker-1' }; },
    (network, isolation) => { network.Options['com.docker.network.bridge.name'] = 'bridge0'; },
    (network, isolation) => { isolation.hostSsh = 'connected'; },
    (network, isolation) => { isolation.hostPrimary = 'connected'; },
    (network, isolation) => { isolation.legalPeer = 'connected'; },
    (network, isolation) => { isolation.firewall = 'missing'; },
  ]) {
    const candidateNetwork = structuredClone(authNetwork);
    const candidateIsolation = structuredClone(authIsolationProbe);
    mutate(candidateNetwork, candidateIsolation);
    await assert.rejects(verifyScanSciRuntime({
      ...f, releaseSha, sessionStatus: 'ready', authContainerIds: ['abc123def456'], authContainers: [authContainer],
      authNetwork: candidateNetwork, authIsolationProbe: candidateIsolation,
      authProcessList, authPids: 24,
      allowRunningAuth: true, sourceFileLimitMetadata: '104857600:104857600', runtimeSecretMetadata: '10001:10001:400',
      runtimeSecretSha256: createHash('sha256').update(tokenValue).digest('hex'),
      workerSecretMetadata: '1000:1000:400', workerSecretSha256: createHash('sha256').update(tokenValue).digest('hex'),
      requiredSecretUid: process.getuid?.(), expectedLegalImageId: f.image.Id, expectedAuthImageId: f.authImage.Id,
    }), /failed/u);
  }
});

test('runtime CLI discovers exited and created auth containers for allow-auth zero', () => {
  const source = readFileSync(new URL('./verify-scansci-runtime.mjs', import.meta.url), 'utf8');
  assert.match(source, /ps', '-aq', 'scansci-auth'/u);
});

test('file-limit probe invokes the real worker entry with stable no-Secret stdin', () => {
  assert.equal(typeof runtimeVerifier.probeSourceFileLimit, 'function');
  const calls = [];
  const runner = (command, args, options) => {
    calls.push({ command, args, options });
    return '{"file_limit":"104857600:104857600"}';
  };

  assert.equal(runtimeVerifier.probeSourceFileLimit('abc123', runner), '104857600:104857600');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'docker');
  assert.deepEqual(calls[0].args, [
    'exec', '-i', 'abc123', 'python', '/opt/scansci/src/scansci_legal/upstream_worker.py',
  ]);
  assert.deepEqual(JSON.parse(calls[0].options.input), {
    probe: 'file-limit', output_dir: '/tmp',
  });
  assert.doesNotMatch(`${calls[0].args.join(' ')} ${calls[0].options.input}`, /secret|token|cookie|scansci_pdf|_install_source_file_limit/iu);

  for (const output of [
    '{"file_limit":"-1:-1"}',
    '{"success":false,"error_type":"upstream_unavailable"}',
    'not-json',
  ]) {
    assert.throws(() => runtimeVerifier.probeSourceFileLimit('abc123', () => output), /failed/u);
  }
});
