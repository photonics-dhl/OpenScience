#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseReleaseCapability } from './production-release-retention.mjs';

const SHA_PATTERN = /^[a-f0-9]{40}$/u;
const IMAGE_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const LABELS = {
  source: 'org.openscience.source',
  archive: 'org.openscience.scansci.archive-sha256',
  requirements: 'org.openscience.scansci.requirements-sha256',
  buildRequirements: 'org.openscience.scansci.build-requirements-sha256',
};

function fail() {
  throw new Error('ScanSci runtime verification failed');
}

function sha256(source) {
  return createHash('sha256').update(source).digest('hex');
}

function normalize(path) {
  return resolve(path).replaceAll('\\', '/');
}

function parseEnvironment(entries) {
  const values = new Map();
  for (const entry of entries ?? []) {
    const separator = entry.indexOf('=');
    if (separator <= 0 || values.has(entry.slice(0, separator))) fail();
    values.set(entry.slice(0, separator), entry.slice(separator + 1));
  }
  return values;
}

export function verifyRootOwnedSecretMetadata({ isFile, symbolic, nlink, uid, gid, mode }) {
  if (!isFile || symbolic || nlink !== 1 || uid !== 0 || gid !== 0 || mode !== 0o600) fail();
}

async function verifySecret(path, requiredUid) {
  const info = await lstat(path);
  const source = await readFile(path, 'utf8');
  if (requiredUid === 0 && process.platform !== 'win32') verifyRootOwnedSecretMetadata({
    isFile: info.isFile(), symbolic: info.isSymbolicLink(), nlink: info.nlink,
    uid: info.uid, gid: info.gid, mode: info.mode & 0o777,
  });
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || source.trim().length === 0
    || source.trim() !== source.replace(/\r?\n$/u, '') || source.length > 4097
    || requiredUid !== undefined && (info.uid !== requiredUid || process.platform !== 'win32' && info.gid !== 0)
    || process.platform !== 'win32' && (info.mode & 0o777) !== 0o600
    || await realpath(path) !== resolve(path)) fail();
  return sha256(source.replace(/\r?\n$/u, ''));
}

function verifyLabels(labels, expected) {
  if (!labels || labels[LABELS.source] !== expected.source
    || labels[LABELS.archive] !== expected.archive
    || labels[LABELS.requirements] !== expected.requirements
    || labels[LABELS.buildRequirements] !== expected.buildRequirements) fail();
}

export async function verifyScanSciRuntime({
  releaseRoot,
  releaseSha,
  composeFile,
  serviceTokenPath,
  container,
  image,
  authImage,
  authContainerIds,
  authContainers = [],
  allowRunningAuth = false,
  workerContainer,
  workerSecretMetadata,
  workerSecretSha256,
  sourceFileLimitMetadata,
  runtimeSecretMetadata,
  runtimeSecretSha256,
  sessionStatus,
  expectedLegalImageId,
  expectedAuthImageId,
  requiredSecretUid = 0,
}) {
  if (!SHA_PATTERN.test(releaseSha) || !container || !image || !authImage || !Array.isArray(authContainerIds)
    || image.Id !== expectedLegalImageId || authImage.Id !== expectedAuthImageId) fail();
  const app = join(releaseRoot, 'apps', 'scansci-legal');
  const [releaseSource, lockSource, requirementsSource, buildRequirementsSource] = await Promise.all([
    readFile(join(releaseRoot, '.release-source'), 'utf8'),
    readFile(join(app, 'upstream.lock.json'), 'utf8'),
    readFile(join(app, 'requirements.lock'), 'utf8'),
    readFile(join(app, 'build-requirements.lock'), 'utf8'),
  ]);
  let lock;
  try {
    lock = JSON.parse(lockSource);
  } catch {
    fail();
  }
  if (releaseSource !== `${releaseSha}\n` || lock?.strategy !== 'legal_only' || lock?.scihub !== false
    || lock?.tor !== false || !/^[a-f0-9]{40}$/u.test(lock?.commit)
    || !/^[a-f0-9]{64}$/u.test(lock?.archiveSha256)
    || !requirementsSource.includes(`${lock.archiveUrl}#sha256=${lock.archiveSha256}`)
    || !lock.install?.includes('--require-hashes')) fail();
  const expectedLabels = {
    source: releaseSha,
    archive: lock.archiveSha256,
    requirements: sha256(requirementsSource),
    buildRequirements: sha256(buildRequirementsSource),
  };
  verifyLabels(image.Config?.Labels, expectedLabels);
  verifyLabels(authImage.Config?.Labels, expectedLabels);
  verifyLabels(container.Config?.Labels, expectedLabels);
  if (!IMAGE_PATTERN.test(image.Id) || !IMAGE_PATTERN.test(authImage.Id) || container.Image !== image.Id
    || image.Config?.User !== '10001:10001' || authImage.Config?.User !== '10001:10001'
    || image.Config?.Labels?.['org.openscience.scansci.role'] !== 'legal'
    || authImage.Config?.Labels?.['org.openscience.scansci.role'] !== 'auth'
    || JSON.stringify(image.Config?.Entrypoint) !== JSON.stringify(['python', '-m', 'scansci_legal.main'])
    || JSON.stringify(authImage.Config?.Entrypoint) !== JSON.stringify(['/usr/bin/tini', '--', '/usr/local/bin/scansci-auth-entrypoint'])) fail();

  const environment = parseEnvironment(container.Config?.Env);
  if (environment.get('SCANSCI_ENABLED') !== 'true'
    || environment.get('SCANSCI_SERVICE_TOKEN_FILE') !== '/run/secrets/scansci_service_token'
    || environment.get('SCANSCI_STRATEGY') !== 'legal_only'
    || environment.get('SCANSCI_SCIHUB_ENABLED') !== 'false'
    || environment.get('SCANSCI_TOR_ENABLED') !== 'false') fail();
  for (const [key, value] of environment) {
    const forbiddenFlagName = !['SCANSCI_SCIHUB_ENABLED', 'SCANSCI_TOR_ENABLED'].includes(key)
      && /(?:TOR|SCI.?HUB|LIBGEN|SCIBBAN)/iu.test(key);
    if (/^(?:DATABASE|SEARCH_DATABASE|POSTGRES|REDIS|S3_|MINIO|AWS_|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|SCANSCI_PDF_PROXY)/iu.test(key)
      || forbiddenFlagName
      || /(?:sci[.-]?hub|libgen|scibban|socks5:|\.onion)/iu.test(value)) fail();
  }
  const labels = container.Config?.Labels ?? {};
  const tmpfsOptions = new Set((container.HostConfig?.Tmpfs?.['/tmp'] ?? '').split(','));
  if (container.Config?.User !== '10001:10001'
    || labels['com.docker.compose.project.working_dir'] !== normalize(releaseRoot)
    || labels['com.docker.compose.project.config_files'] !== normalize(composeFile)
    || labels['com.docker.compose.service'] !== 'scansci-legal'
    || JSON.stringify(container.Config?.Entrypoint) !== JSON.stringify(['python', '-m', 'scansci_legal.main'])
    || ![null, undefined, '[]'].includes(container.Config?.Cmd == null ? container.Config?.Cmd : JSON.stringify(container.Config.Cmd))
    || container.State?.Running !== true || container.State?.Health?.Status !== 'healthy'
    || container.HostConfig?.ReadonlyRootfs !== true
    || container.HostConfig?.Privileged !== false
    || !container.HostConfig?.CapDrop?.includes('ALL')
    || (container.HostConfig?.CapAdd?.length ?? 0) !== 0
    || !container.HostConfig?.SecurityOpt?.includes('no-new-privileges:true')
    || container.HostConfig?.Memory !== 1024 ** 3
    || container.HostConfig?.NanoCpus !== 1_000_000_000
    || container.HostConfig?.PidsLimit !== 64
    || Object.keys(container.HostConfig?.PortBindings ?? {}).length !== 0
    || !['size=256m', 'noexec', 'nosuid', 'nodev', 'uid=10001', 'gid=10001', 'mode=0700']
      .every((option) => tmpfsOptions.has(option))) fail();
  const networks = Object.keys(container.NetworkSettings?.Networks ?? {});
  if (networks.length !== 1 || !networks[0].endsWith('_retrieval_net')
    || Object.values(container.NetworkSettings?.Ports ?? {}).some((bindings) => bindings !== null)) fail();
  const session = container.Mounts?.find((mount) => mount.Destination === '/session');
  const token = container.Mounts?.find((mount) => mount.Destination === '/run/secrets');
  if (!session || session.Type !== 'volume' || session.RW !== true || !session.Name?.endsWith('_scansci-session')
    || !token || token.Type !== 'volume' || token.RW !== false || !token.Name?.endsWith('_scansci-service-secrets')
    || container.Mounts.some((mount) => !['/session', '/run/secrets'].includes(mount.Destination))
    || runtimeSecretMetadata !== '10001:10001:400') fail();
  const hostSecretSha256 = await verifySecret(serviceTokenPath, requiredSecretUid);
  if (workerContainer) {
    const workerMount = workerContainer.Mounts?.find((mount) => mount.Destination === '/run/scansci-worker-secrets');
    if (!workerMount || workerMount.Type !== 'volume' || workerMount.RW !== false
      || !workerMount.Name?.endsWith('_scansci-worker-secrets')
      || workerSecretMetadata !== '1000:1000:400' || workerSecretSha256 !== hostSecretSha256) fail();
  }
  if (allowRunningAuth) {
    if (authContainerIds.length !== 1 || authContainers.length !== 1 || authContainers.some((candidate) => {
      const sessionMount = candidate.Mounts?.find((mount) => mount.Destination === '/session');
      const secretMount = candidate.Mounts?.find((mount) => mount.Destination === '/run/secrets');
      return candidate.State?.Running !== true || candidate.HostConfig?.NetworkMode !== 'host'
      || candidate.Image !== expectedAuthImageId || candidate.Config?.User !== '10001:10001'
      || candidate.Config?.Labels?.['org.openscience.scansci.role'] !== 'auth'
      || JSON.stringify(candidate.Config?.Entrypoint) !== JSON.stringify(['/usr/bin/tini', '--', '/usr/local/bin/scansci-auth-entrypoint'])
      || ![null, undefined, '[]'].includes(candidate.Config?.Cmd == null ? candidate.Config?.Cmd : JSON.stringify(candidate.Config.Cmd))
      || candidate.Mounts?.length !== 2
      || !sessionMount || sessionMount.Type !== 'volume' || sessionMount.RW !== true || sessionMount.Name !== 'openscience-prod_scansci-session'
      || !secretMount || secretMount.Type !== 'volume' || secretMount.RW !== false || secretMount.Name !== 'openscience-prod_scansci-auth-secrets';
    })) fail();
  }
  if (sourceFileLimitMetadata !== '104857600:104857600'
    || !/^[a-f0-9]{64}$/u.test(runtimeSecretSha256) || runtimeSecretSha256 !== hostSecretSha256
    || authContainerIds.length !== 0 && !allowRunningAuth
    || !['ready', 'auth_required', 'refreshing'].includes(sessionStatus)) fail();
  return {
    source: true,
    topology: true,
    policy: true,
    fileLimit: true,
    token: true,
    session: sessionStatus,
  };
}

export function formatRuntimeStatuses(report) {
  const session = report.session.toUpperCase();
  return [
    'SCANSCI_RUNTIME_SOURCE_OK',
    'SCANSCI_RUNTIME_TOPOLOGY_OK',
    'SCANSCI_RUNTIME_POLICY_OK',
    'SCANSCI_RUNTIME_FILE_LIMIT_OK',
    'SCANSCI_RUNTIME_TOKEN_OK',
    `SCANSCI_RUNTIME_SESSION_${session}`,
  ].join('\n') + '\n';
}

function parseCli(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith('--') || !argv[index + 1] || values.has(argv[index])) fail();
    values.set(argv[index], argv[index + 1]);
  }
  const expected = ['--release-root', '--release-sha', '--compose-file', '--service-token-file', '--capability-file', '--require-worker', '--allow-auth'];
  if (values.size !== expected.length || expected.some((key) => !values.has(key))) fail();
  return Object.fromEntries(expected.map((key) => [key, values.get(key)]));
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (result.status !== 0) fail();
  return result.stdout.trim();
}

function inspectJson(command, args) {
  let value;
  try {
    value = JSON.parse(run(command, args));
  } catch {
    fail();
  }
  if (!Array.isArray(value) || value.length !== 1) fail();
  return value[0];
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  const releaseRoot = options['--release-root'];
  const releaseSha = options['--release-sha'];
  const composeFile = options['--compose-file'];
  const serviceTokenPath = options['--service-token-file'];
  const requireWorker = options['--require-worker'];
  const allowAuth = options['--allow-auth'];
  const capabilityFile = options['--capability-file'];
  if (releaseRoot !== `/opt/openscience-releases/${releaseSha}`
    || composeFile !== `${releaseRoot}/infra/compose/docker-compose.prod.yml`
    || serviceTokenPath !== '/opt/openscience-secrets/scansci/scansci_service_token'
    || capabilityFile !== `/opt/openscience/.release-capabilities/${releaseSha}`
    || !['0', '1'].includes(requireWorker) || !['0', '1'].includes(allowAuth)) fail();
  const composeArgs = ['compose', '--env-file', '/opt/openscience/.env.prod', '-f', composeFile];
  const env = { ...process.env, XGS_RELEASE_ROOT: releaseRoot, XGS_RELEASE_IMAGE_TAG: releaseSha };
  const compose = (args) => {
    const result = spawnSync('docker', [...composeArgs, ...args], { encoding: 'utf8', env, maxBuffer: 1024 * 1024 });
    if (result.status !== 0) fail();
    return result.stdout.trim();
  };
  const containerId = compose(['ps', '-q', 'scansci-legal']);
  if (!/^[a-f0-9]{12,64}$/u.test(containerId)) fail();
  const capability = parseReleaseCapability(await readFile(capabilityFile, 'utf8'));
  if (!capability.scansciDeploy) fail();
  const authIds = compose(['--profile', 'scansci-auth', 'ps', '-aq', 'scansci-auth']).split(/\r?\n/u).filter(Boolean);
  const authContainers = authIds.map((id) => inspectJson('docker', ['inspect', id]));
  const container = inspectJson('docker', ['inspect', containerId]);
  const image = inspectJson('docker', ['image', 'inspect', `openscience-scansci-legal:${releaseSha}`]);
  const authImage = inspectJson('docker', ['image', 'inspect', `openscience-scansci-auth:${releaseSha}`]);
  const probe = [
    'import json,urllib.request',
    "token=open('/run/secrets/scansci_service_token',encoding='utf-8').read().strip()",
    "request=urllib.request.Request('http://127.0.0.1:8080/v1/session/status',headers={'Authorization':'Bearer '+token})",
    "print(json.load(urllib.request.urlopen(request,timeout=5))['status'])",
  ].join(';');
  const sessionStatus = run('docker', ['exec', containerId, 'python', '-c', probe]);
  const fileLimitProbe = [
    'import resource',
    'from scansci_legal.upstream_worker import _install_source_file_limit',
    '_install_source_file_limit()',
    'soft,hard=resource.getrlimit(resource.RLIMIT_FSIZE)',
    "print(f'{soft}:{hard}')",
  ].join(';');
  const sourceFileLimitMetadata = run('docker', ['exec', containerId, 'python', '-c', fileLimitProbe]);
  const runtimeSecretMetadata = run('docker', [
    'exec', containerId, 'stat', '-c', '%u:%g:%a', '/run/secrets/scansci_service_token',
  ]);
  const runtimeSecretSha256 = run('docker', [
    'exec', containerId, 'python', '-c',
    "import hashlib;print(hashlib.sha256(open('/run/secrets/scansci_service_token','rb').read().strip()).hexdigest())",
  ]);
  let workerContainer;
  let workerSecretMetadata;
  let workerSecretSha256;
  if (requireWorker === '1') {
    const workerId = compose(['ps', '-q', 'agent-worker']);
    if (!/^[a-f0-9]{12,64}$/u.test(workerId)) fail();
    workerContainer = inspectJson('docker', ['inspect', workerId]);
    workerSecretMetadata = run('docker', ['exec', workerId, 'stat', '-c', '%u:%g:%a', '/run/scansci-worker-secrets/scansci_service_token']);
    workerSecretSha256 = run('docker', ['exec', workerId, 'node', '-e', "const fs=require('node:fs'),c=require('node:crypto');process.stdout.write(c.createHash('sha256').update(fs.readFileSync('/run/scansci-worker-secrets/scansci_service_token','utf8').trim()).digest('hex'))"]);
  }
  const report = await verifyScanSciRuntime({
    releaseRoot, releaseSha, composeFile, serviceTokenPath, container, image, authImage,
    authContainerIds: authIds, sessionStatus, sourceFileLimitMetadata, runtimeSecretMetadata, runtimeSecretSha256,
    workerContainer, workerSecretMetadata, workerSecretSha256,
    authContainers, allowRunningAuth: allowAuth === '1',
    expectedLegalImageId: capability.legalImageId, expectedAuthImageId: capability.authImageId,
  });
  process.stdout.write(formatRuntimeStatuses(report));
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  void main().catch(() => {
    console.error('ScanSci runtime verification failed');
    process.exitCode = 65;
  });
}
