import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { formatRuntimeStatuses, verifyRootOwnedSecretMetadata, verifyScanSciRuntime } from './verify-scansci-runtime.mjs';

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
      Tmpfs: { '/tmp': 'size=64m,noexec,nosuid,nodev,uid=10001,gid=10001,mode=0700' },
    },
    Mounts: [
      { Type: 'volume', Name: 'openscience-prod_scansci-session', Source: '/var/lib/docker/volumes/session/_data', Destination: '/session', RW: true },
      { Type: 'volume', Name: 'openscience-prod_scansci-service-secrets', Source: '/var/lib/docker/volumes/secrets/_data', Destination: '/run/secrets', RW: false },
    ],
    NetworkSettings: { Networks: { 'openscience-prod_retrieval_net': {} }, Ports: { '8080/tcp': null } },
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
    Config: { User: 'node' },
    Mounts: [{ Type: 'volume', Name: 'openscience-prod_scansci-worker-secrets', Destination: '/run/scansci-worker-secrets', RW: false }],
  };
  return { releaseRoot, serviceTokenPath, composeFile, container, image, authImage, workerContainer };
}

test('runtime verifier validates immutable source, bounded topology, Secret and persistent session without exposing values', async (t) => {
  const f = await fixture();
  t.after(async () => rm(f.releaseRoot, { recursive: true, force: true }));

  const report = await verifyScanSciRuntime({
    ...f,
    releaseSha,
    sessionStatus: 'ready',
    authContainerIds: [],
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
  assert.match(output, /SCANSCI_RUNTIME_TOKEN_OK/u);
  assert.match(output, /SCANSCI_RUNTIME_SESSION_READY/u);
  assert.doesNotMatch(output, new RegExp(tokenValue, 'u'));
  assert.doesNotMatch(output, /sciencedirect\.json|cookie|password/iu);
});

test('runtime verifier fails closed on forbidden network, grey-source flags, auth helper, or disabled session', async (t) => {
  const f = await fixture();
  t.after(async () => rm(f.releaseRoot, { recursive: true, force: true }));
  for (const mutate of [
    (input) => { input.container.NetworkSettings.Networks['openscience-prod_data_net'] = {}; },
    (input) => { input.container.Config.Env.push('TOR_PROXY='); },
    (input) => { input.container.HostConfig.Privileged = true; },
    (input) => { input.container.HostConfig.CapAdd = ['SYS_ADMIN']; },
    (input) => { input.container.HostConfig.Tmpfs['/tmp'] = 'size=64m'; },
    (input) => { input.authContainerIds = ['abc123']; },
    (input) => { input.runtimeSecretSha256 = 'f'.repeat(64); },
    (input) => { input.authImage.Config.Labels['org.openscience.scansci.role'] = 'legal'; },
    (input) => { input.authImage.Config.Entrypoint = ['python', '-m', 'scansci_legal.main']; },
    (input) => { input.container.Config.Entrypoint = ['/bin/sh']; },
    (input) => { input.container.Config.Cmd = ['fake-healthy']; },
    (input) => { input.workerContainer.Mounts[0].Name = 'wrong-worker-secret'; },
    (input) => { input.sessionStatus = 'disabled'; },
  ]) {
    const fresh = await fixture();
    const input = {
      ...fresh,
      releaseSha,
      sessionStatus: 'ready',
      authContainerIds: [],
      runtimeSecretMetadata: '10001:10001:400',
      runtimeSecretSha256: createHash('sha256').update(tokenValue).digest('hex'),
      workerSecretMetadata: '1000:1000:400',
      workerSecretSha256: createHash('sha256').update(tokenValue).digest('hex'),
      requiredSecretUid: process.getuid?.(),
    };
    mutate(input);
    await assert.rejects(verifyScanSciRuntime(input), /ScanSci runtime verification failed/u);
    await rm(fresh.releaseRoot, { recursive: true, force: true });
  }
});

test('runtime verifier rejects wrong-group host metadata and validates an explicitly running auth role', async (t) => {
  assert.throws(() => verifyRootOwnedSecretMetadata({ isFile: true, symbolic: false, nlink: 1, uid: 0, gid: 1, mode: 0o600 }), /failed/u);
  const f = await fixture();
  t.after(async () => rm(f.releaseRoot, { recursive: true, force: true }));
  const authContainer = {
    Image: f.authImage.Id,
    State: { Running: true },
    HostConfig: { NetworkMode: 'host' },
    Mounts: [
      { Type: 'volume', Name: 'openscience-prod_scansci-session', Destination: '/session', RW: true },
      { Type: 'volume', Name: 'openscience-prod_scansci-auth-secrets', Destination: '/run/secrets', RW: false },
    ],
    Config: {
      User: '10001:10001',
      Labels: { 'org.openscience.scansci.role': 'auth' },
      Entrypoint: ['/usr/bin/tini', '--', '/usr/local/bin/scansci-auth-entrypoint'],
      Cmd: [],
    },
  };
  await verifyScanSciRuntime({
    ...f, releaseSha, sessionStatus: 'ready', authContainerIds: ['abc123'], authContainers: [authContainer],
    allowRunningAuth: true, runtimeSecretMetadata: '10001:10001:400',
    runtimeSecretSha256: createHash('sha256').update(tokenValue).digest('hex'),
    workerSecretMetadata: '1000:1000:400', workerSecretSha256: createHash('sha256').update(tokenValue).digest('hex'),
    requiredSecretUid: process.getuid?.(), expectedLegalImageId: f.image.Id, expectedAuthImageId: f.authImage.Id,
  });
  for (const mutate of [
    (candidate) => { candidate.State.Running = false; },
    (candidate) => { candidate.Image = `sha256:${'f'.repeat(64)}`; },
    (candidate) => { candidate.Config.Entrypoint = ['/bin/sh']; },
    (candidate) => { candidate.Config.Cmd = ['fake-ready']; },
    (candidate) => { candidate.HostConfig.NetworkMode = 'bridge'; },
    (candidate) => { candidate.Mounts[1].Name = 'wrong-auth-secrets'; },
  ]) {
    const candidate = structuredClone(authContainer);
    mutate(candidate);
    await assert.rejects(verifyScanSciRuntime({
      ...f, releaseSha, sessionStatus: 'ready', authContainerIds: ['abc123'], authContainers: [candidate],
      allowRunningAuth: true, runtimeSecretMetadata: '10001:10001:400',
      runtimeSecretSha256: createHash('sha256').update(tokenValue).digest('hex'),
      workerSecretMetadata: '1000:1000:400', workerSecretSha256: createHash('sha256').update(tokenValue).digest('hex'),
      requiredSecretUid: process.getuid?.(), expectedLegalImageId: f.image.Id, expectedAuthImageId: f.authImage.Id,
    }), /failed/u);
  }
});
