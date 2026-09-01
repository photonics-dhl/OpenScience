#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseReleaseCapability } from './production-release-retention.mjs';

const SHA_PATTERN = /^[a-f0-9]{40}$/u;
const IMAGE_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const AUTH_PID_LIMIT = 256;
const AUTH_PID_HEADROOM = 32;
const BROWSER_PID_LIMIT = 256;
const BROWSER_PID_HEADROOM = 32;
const LABELS = {
  source: 'org.openscience.source',
  archive: 'org.openscience.scansci.archive-sha256',
  requirements: 'org.openscience.scansci.requirements-sha256',
  buildRequirements: 'org.openscience.scansci.build-requirements-sha256',
  browserRequirements: 'org.openscience.scansci.browser-requirements-sha256',
};

function fail() {
  throw new Error('ScanSci runtime verification failed');
}

export function verifyBrowserFirewallRules(inputRules) {
  if (!Array.isArray(inputRules) || inputRules.some((line) => typeof line !== 'string')) fail();
  const parsed = inputRules.map((line) => ({
    line,
    tokens: line.replaceAll('"', '').trim().split(/\s+/u),
  }));
  const browserRules = parsed.filter(({ tokens }) => {
    const index = tokens.indexOf('--comment');
    return index >= 0 && tokens[index + 1] === 'openscience-scansci-browser';
  });
  const value = (tokens, flag) => {
    const indexes = tokens.flatMap((token, index) => token === flag ? [index] : []);
    return indexes.length === 1 ? tokens[indexes[0] + 1] : undefined;
  };
  const acceptIndex = parsed.findIndex(({ tokens }) => (
    value(tokens, '--comment') === 'openscience-scansci-browser'
      && value(tokens, '-i') === 'xgs-browser0'
      && value(tokens, '-s') === '172.26.0.2/32'
      && value(tokens, '-d') === '172.26.0.1/32'
      && value(tokens, '-p') === 'tcp'
      && value(tokens, '--dport') === '7891'
      && value(tokens, '-j') === 'ACCEPT'
  ));
  const rejectIndex = parsed.findIndex(({ tokens }) => (
    value(tokens, '--comment') === 'openscience-scansci-browser'
      && value(tokens, '-i') === 'xgs-browser0'
      && value(tokens, '-s') === '172.26.0.0/24'
      && !tokens.includes('-d')
      && value(tokens, '-j') === 'REJECT'
      && value(tokens, '--reject-with') === 'icmp-port-unreachable'
  ));
  if (browserRules.length !== 2 || acceptIndex < 0 || rejectIndex <= acceptIndex) fail();
  return true;
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

function verifyLabels(labels, expected, { browserRuntime = false } = {}) {
  if (!labels || labels[LABELS.source] !== expected.source
    || labels[LABELS.archive] !== expected.archive
    || labels[LABELS.requirements] !== expected.requirements
    || labels[LABELS.buildRequirements] !== expected.buildRequirements
    || browserRuntime && labels[LABELS.browserRequirements] !== expected.browserRequirements) fail();
}

export async function verifyScanSciRuntime({
  releaseRoot,
  releaseSha,
  composeFile,
  serviceTokenPath,
  container,
  image,
  browserContainer,
  browserImage,
  browserVolumes,
  browserNetwork,
  browserProcessList,
  browserPids,
  browserEgressProbe,
  authImage,
  authContainerIds,
  authContainers = [],
  allowRunningAuth = false,
  authProcessList = '',
  authPids = 0,
  authNetwork,
  authIsolationProbe,
  workerContainer,
  workerImage,
  workerSecretMetadata,
  workerSecretSha256,
  sourceFileLimitMetadata,
  runtimeSecretMetadata,
  runtimeSecretSha256,
  retrievalNetwork,
  controlledEgressProbe,
  requireOaCanary = false,
  oaCanaryResult,
  sessionStatus,
  expectedLegalImageId,
  expectedBrowserImageId,
  expectedAuthImageId,
  requiredSecretUid = 0,
}) {
  if (!SHA_PATTERN.test(releaseSha) || !container || !image || !browserContainer || !browserImage
    || !authImage || !Array.isArray(browserVolumes) || !Array.isArray(authContainerIds)
    || image.Id !== expectedLegalImageId || browserImage.Id !== expectedBrowserImageId
    || authImage.Id !== expectedAuthImageId) fail();
  const app = join(releaseRoot, 'apps', 'scansci-legal');
  const [releaseSource, lockSource, requirementsSource, buildRequirementsSource, browserRequirementsSource] = await Promise.all([
    readFile(join(releaseRoot, '.release-source'), 'utf8'),
    readFile(join(app, 'upstream.lock.json'), 'utf8'),
    readFile(join(app, 'requirements.lock'), 'utf8'),
    readFile(join(app, 'build-requirements.lock'), 'utf8'),
    readFile(join(app, 'browser-requirements.lock'), 'utf8'),
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
    browserRequirements: sha256(browserRequirementsSource),
  };
  verifyLabels(image.Config?.Labels, expectedLabels);
  verifyLabels(browserImage.Config?.Labels, expectedLabels, { browserRuntime: true });
  verifyLabels(authImage.Config?.Labels, expectedLabels, { browserRuntime: true });
  verifyLabels(container.Config?.Labels, expectedLabels);
  if (!IMAGE_PATTERN.test(image.Id) || !IMAGE_PATTERN.test(browserImage.Id) || !IMAGE_PATTERN.test(authImage.Id)
    || container.Image !== image.Id || browserContainer.Image !== browserImage.Id
    || image.Config?.User !== '10001:10001' || browserImage.Config?.User !== '10002:11000'
    || authImage.Config?.User !== '10001:10001'
    || image.Config?.Labels?.['org.openscience.scansci.role'] !== 'legal'
    || browserImage.Config?.Labels?.['org.openscience.scansci.role'] !== 'browser'
    || authImage.Config?.Labels?.['org.openscience.scansci.role'] !== 'auth'
    || JSON.stringify(image.Config?.Entrypoint) !== JSON.stringify(['python', '-m', 'scansci_legal.main'])
    || JSON.stringify(browserImage.Config?.Entrypoint) !== JSON.stringify(['/usr/bin/tini', '-g', '--', '/usr/local/bin/scansci-browser-entrypoint'])
    || JSON.stringify(authImage.Config?.Entrypoint) !== JSON.stringify(['/usr/bin/tini', '--', '/usr/local/bin/scansci-auth-entrypoint'])) fail();

  const environment = parseEnvironment(container.Config?.Env);
  if (environment.get('SCANSCI_ENABLED') !== 'true'
    || environment.get('SCANSCI_SERVICE_TOKEN_FILE') !== '/run/secrets/scansci_service_token'
    || environment.get('SCANSCI_STRATEGY') !== 'legal_only'
    || environment.get('SCANSCI_SCIHUB_ENABLED') !== 'false'
    || environment.get('SCANSCI_TOR_ENABLED') !== 'false'
    || environment.get('SCANSCI_EGRESS_PROXY') !== 'http://openscience-egress:7891') fail();
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
    || JSON.stringify(container.HostConfig?.GroupAdd) !== JSON.stringify(['11000'])
    || JSON.stringify(container.HostConfig?.ExtraHosts) !== JSON.stringify(['openscience-egress:172.24.0.1'])
    || Object.keys(container.HostConfig?.PortBindings ?? {}).length !== 0
    || !['size=256m', 'noexec', 'nosuid', 'nodev', 'uid=10001', 'gid=10001', 'mode=0700']
      .every((option) => tmpfsOptions.has(option))) fail();
  const networks = Object.keys(container.NetworkSettings?.Networks ?? {});
  if (networks.length !== 1 || !networks[0].endsWith('_retrieval_net')
    || Object.values(container.NetworkSettings?.Ports ?? {}).some((bindings) => bindings !== null)) fail();
  const retrievalEndpoint = container.NetworkSettings.Networks[networks[0]];
  const retrievalIp = retrievalEndpoint?.IPAddress;
  if (retrievalNetwork?.Name !== networks[0] || retrievalNetwork?.Internal !== true
    || JSON.stringify(retrievalNetwork?.IPAM?.Config) !== JSON.stringify([{
      Subnet: '172.24.0.0/24', Gateway: '172.24.0.1',
    }])
    || retrievalEndpoint?.Gateway !== '172.24.0.1'
    || !/^172\.24\.0\.(?:[2-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-4])$/u.test(retrievalIp)
    || JSON.stringify(controlledEgressProbe) !== JSON.stringify({
      proxyAddress: '172.24.0.1', proxyPeer: '172.24.0.1:7891',
      allowStatus: 204, privateStatus: 403, httpStatus: 403, non443Status: 403,
      rawDirect: 'blocked',
    })) fail();
  const session = container.Mounts?.find((mount) => mount.Destination === '/session');
  const token = container.Mounts?.find((mount) => mount.Destination === '/run/secrets');
  const browserInputForLegal = container.Mounts?.find((mount) => mount.Destination === '/browser-inputs');
  const browserOutputForLegal = container.Mounts?.find((mount) => mount.Destination === '/browser-outputs');
  if (!session || session.Type !== 'volume' || session.RW !== true || !session.Name?.endsWith('_scansci-session')
    || !token || token.Type !== 'volume' || token.RW !== false || !token.Name?.endsWith('_scansci-service-secrets')
    || !browserInputForLegal || browserInputForLegal.Type !== 'volume' || browserInputForLegal.RW !== true
    || !browserInputForLegal.Name?.endsWith('_scansci-browser-inputs')
    || !browserOutputForLegal || browserOutputForLegal.Type !== 'volume' || browserOutputForLegal.RW !== false
    || !browserOutputForLegal.Name?.endsWith('_scansci-browser-outputs')
    || container.Mounts?.length !== 4
    || runtimeSecretMetadata !== '10001:10001:400') fail();

  const browserEnvironment = parseEnvironment(browserContainer.Config?.Env);
  const browserLabels = browserContainer.Config?.Labels ?? {};
  const browserNetworks = Object.keys(browserContainer.NetworkSettings?.Networks ?? {});
  const browserNetworkPeers = Object.values(browserNetwork?.Containers ?? {});
  const browserTmpOptions = new Set((browserContainer.HostConfig?.Tmpfs?.['/tmp'] ?? '').split(','));
  const browserShmOptions = new Set((browserContainer.HostConfig?.Tmpfs?.['/dev/shm'] ?? '').split(','));
  const browserInput = browserContainer.Mounts?.find((mount) => mount.Destination === '/browser-inputs');
  const browserOutput = browserContainer.Mounts?.find((mount) => mount.Destination === '/browser-outputs');
  const browserProfiles = browserContainer.Mounts?.find((mount) => mount.Destination === '/browser-profile-jobs');
  if (browserContainer.Config?.User !== '10002:11000'
    || browserLabels['com.docker.compose.project.working_dir'] !== normalize(releaseRoot)
    || browserLabels['com.docker.compose.project.config_files'] !== normalize(composeFile)
    || browserLabels['com.docker.compose.service'] !== 'scansci-browser'
    || browserLabels['org.openscience.scansci.role'] !== 'browser'
    || JSON.stringify(browserContainer.Config?.Entrypoint) !== JSON.stringify(['/usr/bin/tini', '-g', '--', '/usr/local/bin/scansci-browser-entrypoint'])
    || ![null, undefined, '[]'].includes(browserContainer.Config?.Cmd == null
      ? browserContainer.Config?.Cmd : JSON.stringify(browserContainer.Config.Cmd))
    || browserEnvironment.get('SCANSCI_BROWSER_PROXY') !== 'http://openscience-egress:7891'
    || browserContainer.State?.Running !== true || browserContainer.State?.Health?.Status !== 'healthy'
    || browserContainer.HostConfig?.ReadonlyRootfs !== true
    || browserContainer.HostConfig?.Privileged !== false
    || !browserContainer.HostConfig?.CapDrop?.includes('ALL')
    || (browserContainer.HostConfig?.CapAdd?.length ?? 0) !== 0
    || !browserContainer.HostConfig?.SecurityOpt?.includes('no-new-privileges:true')
    || browserContainer.HostConfig?.Memory !== 1024 ** 3
    || browserContainer.HostConfig?.NanoCpus !== 1_000_000_000
    || browserContainer.HostConfig?.PidsLimit !== BROWSER_PID_LIMIT
    || JSON.stringify(browserContainer.HostConfig?.GroupAdd) !== JSON.stringify(['11000'])
    || JSON.stringify(browserContainer.HostConfig?.ExtraHosts) !== JSON.stringify(['openscience-egress:172.26.0.1'])
    || Object.keys(browserContainer.HostConfig?.PortBindings ?? {}).length !== 0
    || !['size=256m', 'noexec', 'nosuid', 'nodev', 'uid=10002', 'gid=11000', 'mode=0700']
      .every((option) => browserTmpOptions.has(option))
    || !['size=256m', 'nosuid', 'nodev', 'uid=10002', 'gid=11000', 'mode=0700']
      .every((option) => browserShmOptions.has(option))
    || browserNetworks.length !== 1 || !browserNetworks[0].endsWith('_browser_net')
    || browserNetwork?.Name !== browserNetworks[0] || browserNetwork?.Driver !== 'bridge'
    || browserNetwork?.Internal !== true
    || browserNetwork?.Options?.['com.docker.network.bridge.name'] !== 'xgs-browser0'
    || JSON.stringify(browserNetwork?.IPAM?.Config) !== JSON.stringify([{
      Subnet: '172.26.0.0/24', Gateway: '172.26.0.1',
    }])
    || browserContainer.NetworkSettings?.Networks?.[browserNetworks[0]]?.Gateway !== '172.26.0.1'
    || browserContainer.NetworkSettings?.Networks?.[browserNetworks[0]]?.IPAddress !== '172.26.0.2'
    || browserNetworkPeers.length !== 1
    || !browserNetworkPeers[0]?.Name?.endsWith('-scansci-browser-1')
    || browserNetworkPeers[0]?.IPv4Address
      !== `${browserContainer.NetworkSettings?.Networks?.[browserNetworks[0]]?.IPAddress}/24`
    || Object.keys(browserContainer.NetworkSettings?.Ports ?? {}).length !== 0
    || !browserInput || browserInput.Type !== 'volume' || browserInput.RW !== false
    || browserInput.Name !== browserInputForLegal.Name
    || !browserOutput || browserOutput.Type !== 'volume' || browserOutput.RW !== true
    || browserOutput.Name !== browserOutputForLegal.Name
    || !browserProfiles || browserProfiles.Type !== 'volume' || browserProfiles.RW !== true
    || !browserProfiles.Name?.endsWith('_scansci-browser-profiles')
    || browserContainer.Mounts?.length !== 3) fail();
  for (const [key, value] of browserEnvironment) {
    if (/(?:SERVICE_TOKEN|DATABASE|POSTGRES|REDIS|S3_|MINIO|AWS_|TOR|SCI.?HUB|LIBGEN|SCIBBAN)/iu.test(key)
      || /(?:sci[.-]?hub|libgen|scibban|socks5:|\.onion)/iu.test(value)) fail();
  }
  const expectedBrowserVolumes = new Map([
    [browserInput.Name, 'size=128m,uid=10001,gid=11000,mode=0750'],
    [browserOutput.Name, 'size=128m,uid=10002,gid=11000,mode=0750'],
    [browserProfiles.Name, 'size=256m,uid=10002,gid=11000,mode=0700'],
  ]);
  if (browserVolumes.length !== 3 || browserVolumes.some((volume) => (
    volume?.Driver !== 'local'
    || volume?.Options?.type !== 'tmpfs'
    || volume?.Options?.device !== 'tmpfs'
    || volume?.Options?.o !== expectedBrowserVolumes.get(volume?.Name)
  )) || new Set(browserVolumes.map((volume) => volume.Name)).size !== 3) fail();
  if (!Number.isSafeInteger(browserPids) || browserPids < 3
    || browserPids > BROWSER_PID_LIMIT - BROWSER_PID_HEADROOM
    || !/tini -g -- \/usr\/local\/bin\/scansci-browser-entrypoint/u.test(browserProcessList)
    || !/Xvfb :99 .* -nolisten tcp/u.test(browserProcessList)
    || !/python -m scansci_legal\.browser_worker/u.test(browserProcessList)
    || /(?:novnc|x11vnc|websockify|auth_login|:6080|:5900)/iu.test(browserProcessList)
    || JSON.stringify(browserEgressProbe) !== JSON.stringify({
      proxyAddress: '172.26.0.1', proxyPeer: '172.26.0.1:7891',
      allowStatus: 204, privateStatus: 403, httpStatus: 403, non443Status: 403,
      hostSsh: 'blocked', hostHttp: 'blocked', hostHttps: 'blocked', hostApi: 'blocked',
      hostDocker: 'blocked', hostDockerTls: 'blocked', legalPeer: 'blocked',
      rawDirect: 'blocked', firewall: 'isolated',
    })) fail();
  const hostSecretSha256 = await verifySecret(serviceTokenPath, requiredSecretUid);
  if (workerContainer) {
    const workerEnvironment = parseEnvironment(workerContainer.Config?.Env);
    const workerLabels = workerContainer.Config?.Labels ?? {};
    const workerReleaseMount = workerContainer.Mounts?.find((mount) => mount.Destination === '/opt/openscience');
    const workerParserMount = workerContainer.Mounts?.find((mount) => mount.Destination === '/parser-jobs');
    const workerMount = workerContainer.Mounts?.find((mount) => mount.Destination === '/run/scansci-worker-secrets');
    const workerNetworks = Object.keys(workerContainer.NetworkSettings?.Networks ?? {});
    if (!workerImage || !IMAGE_PATTERN.test(workerImage.Id)
      || workerImage.Config?.Labels?.[LABELS.source] !== releaseSha
      || workerContainer.Image !== workerImage.Id
      || workerContainer.Config?.User !== 'node'
      || workerContainer.Config?.WorkingDir !== '/opt/openscience/apps/agent-worker'
      || JSON.stringify(workerContainer.Config?.Cmd) !== JSON.stringify(['node', 'dist/index.js'])
      || workerLabels['com.docker.compose.project.working_dir'] !== normalize(releaseRoot)
      || workerLabels['com.docker.compose.project.config_files'] !== normalize(composeFile)
      || workerLabels['com.docker.compose.service'] !== 'agent-worker'
      || workerContainer.State?.Running !== true || workerContainer.State?.Health?.Status !== 'healthy'
      || workerEnvironment.get('SCANSCI_ENABLED') !== 'true'
      || workerEnvironment.get('SCANSCI_BASE_URL') !== 'http://scansci-legal:8080'
      || workerEnvironment.get('SCANSCI_SERVICE_TOKEN_FILE') !== '/run/scansci-worker-secrets/scansci_service_token'
      || workerNetworks.length !== 4
      || !['_app_net', '_data_net', '_embedding_net', '_retrieval_net']
        .every((suffix) => workerNetworks.some((network) => network.endsWith(suffix)))
      || !workerReleaseMount || workerReleaseMount.Type !== 'bind' || workerReleaseMount.RW !== false
      || normalize(workerReleaseMount.Source) !== normalize(releaseRoot)
      || !workerParserMount || workerParserMount.Type !== 'volume' || workerParserMount.RW !== true
      || !workerParserMount.Name?.endsWith('_parser-jobs')
      || !workerMount || workerMount.Type !== 'volume' || workerMount.RW !== false
      || !workerMount.Name?.endsWith('_scansci-worker-secrets')
      || workerContainer.Mounts?.length !== 3
      || workerSecretMetadata !== '1000:1000:400' || workerSecretSha256 !== hostSecretSha256) fail();
  }
  if (allowRunningAuth) {
    const authContainerId = authContainerIds[0];
    const authNetworkContainers = Object.keys(authNetwork?.Containers ?? {});
    if (authNetwork?.Name == null || !authNetwork.Name.endsWith('_auth_net')
      || authNetwork.Internal !== true
      || authNetwork.EnableIPv6 !== false
      || authNetwork.Options?.['com.docker.network.bridge.name'] !== 'xgs-auth0'
      || JSON.stringify(authNetwork.IPAM?.Config) !== JSON.stringify([{
        Subnet: '172.25.0.0/29', Gateway: '172.25.0.1',
      }])
      || authNetworkContainers.length !== 1
      || !authNetworkContainers[0].startsWith(authContainerId)
      || JSON.stringify(authIsolationProbe) !== JSON.stringify({
        proxyAddress: '172.25.0.1', proxyPeer: '172.25.0.1:7891', allowStatus: 204,
        hostSsh: 'blocked', hostHttp: 'blocked', hostHttps: 'blocked', hostApi: 'blocked',
        hostDocker: 'blocked', hostDockerTls: 'blocked', hostPrimary: 'blocked',
        rawDirect: 'blocked', awsMetadata: 'blocked', aliyunMetadata: 'blocked',
        legalPeer: 'blocked', workerPeer: 'blocked', hostNoVncHttp: 200,
        hostListener6080: 'absent', firewall: 'isolated',
      })) fail();
    if (authContainerIds.length !== 1 || authContainers.length !== 1 || authContainers.some((candidate) => {
      const sessionMount = candidate.Mounts?.find((mount) => mount.Destination === '/session');
      const authEnvironment = parseEnvironment(candidate.Config?.Env);
      const authNetworks = Object.keys(candidate.NetworkSettings?.Networks ?? {});
      const authUlimits = candidate.HostConfig?.Ulimits ?? [];
      const authNofileUlimits = authUlimits.filter((limit) => limit.Name === 'nofile');
      const tmpOptions = new Set((candidate.HostConfig?.Tmpfs?.['/tmp'] ?? '').split(','));
      const shmOptions = new Set((candidate.HostConfig?.Tmpfs?.['/dev/shm'] ?? '').split(','));
      return candidate.State?.Running !== true
      || candidate.Image !== expectedAuthImageId || candidate.Config?.User !== '10001:10001'
      || candidate.Config?.Labels?.['org.openscience.scansci.role'] !== 'auth'
      || JSON.stringify(candidate.Config?.Entrypoint) !== JSON.stringify(['/usr/bin/tini', '--', '/usr/local/bin/scansci-auth-entrypoint'])
      || ![null, undefined, '[]'].includes(candidate.Config?.Cmd == null ? candidate.Config?.Cmd : JSON.stringify(candidate.Config.Cmd))
      || authEnvironment.get('SCANSCI_BROWSER_PROXY') !== 'http://openscience-egress:7891'
      || candidate.HostConfig?.ReadonlyRootfs !== true || candidate.HostConfig?.Privileged !== false
      || !candidate.HostConfig?.CapDrop?.includes('ALL') || (candidate.HostConfig?.CapAdd?.length ?? 0) !== 0
      || !candidate.HostConfig?.SecurityOpt?.includes('no-new-privileges:true')
      || candidate.HostConfig?.Memory !== 1024 ** 3 || candidate.HostConfig?.NanoCpus !== 1_000_000_000
      || candidate.HostConfig?.PidsLimit !== 256
      || authUlimits.length !== 1 || authNofileUlimits.length !== 1
      || authNofileUlimits[0].Soft !== 4096 || authNofileUlimits[0].Hard !== 4096
      || JSON.stringify(candidate.HostConfig?.ExtraHosts) !== JSON.stringify(['openscience-egress:172.25.0.1'])
      || Object.keys(candidate.HostConfig?.PortBindings ?? {}).length !== 0
      || !candidate.HostConfig?.NetworkMode?.endsWith('_auth_net')
      || !['size=256m', 'noexec', 'nosuid', 'nodev', 'uid=10001', 'gid=10001', 'mode=0700']
        .every((option) => tmpOptions.has(option))
      || !['size=256m', 'nosuid', 'nodev', 'uid=10001', 'gid=10001', 'mode=0700']
        .every((option) => shmOptions.has(option))
      || authNetworks.length !== 1 || !authNetworks[0].endsWith('_auth_net')
      || candidate.NetworkSettings?.Networks?.[authNetworks[0]]?.Gateway !== '172.25.0.1'
      || candidate.NetworkSettings?.Networks?.[authNetworks[0]]?.IPAddress !== '172.25.0.2'
      || Object.keys(candidate.NetworkSettings?.Ports ?? {}).length !== 0
      || candidate.Mounts?.length !== 1
      || !sessionMount || sessionMount.Type !== 'volume' || sessionMount.RW !== true || sessionMount.Name !== 'openscience-prod_scansci-session'
      || candidate.Mounts.some((mount) => mount.Destination === '/run/secrets');
    })
      || !Number.isSafeInteger(authPids) || authPids < 6
      || authPids > AUTH_PID_LIMIT - AUTH_PID_HEADROOM
      || !/Xvfb :99 .* -nolisten tcp/u.test(authProcessList)
      || !/x11vnc .* -listen 127\.0\.0\.1 .* -no6(?: |$)/mu.test(authProcessList)
      || !/websockify .*0\.0\.0\.0:6080 127\.0\.0\.1:5900/u.test(authProcessList)
      || !/python -m scansci_legal\.auth_login --operator-start/u.test(authProcessList)
      || !/chromium .*--no-sandbox/u.test(authProcessList)
      || !/chromium .*--proxy-server=http:\/\/openscience-egress:7891/u.test(authProcessList)
      || !/chromium .*--disable-quic/u.test(authProcessList)
      || !/chromium .*--force-webrtc-ip-handling-policy=disable_non_proxied_udp/u.test(authProcessList)
      || /chromium .*--no-proxy-server/u.test(authProcessList)) fail();
  }
  if (sourceFileLimitMetadata !== '104857600:104857600'
    || !/^[a-f0-9]{64}$/u.test(runtimeSecretSha256) || runtimeSecretSha256 !== hostSecretSha256
    || authContainerIds.length !== 0 && !allowRunningAuth
    || !['ready', 'auth_required', 'refreshing'].includes(sessionStatus)) fail();
  if (typeof requireOaCanary !== 'boolean'
    || requireOaCanary && (!oaCanaryResult || Array.isArray(oaCanaryResult)
      || JSON.stringify(Object.keys(oaCanaryResult)) !== JSON.stringify([
        'identifier', 'route', 'contentType', 'magic', 'bytes',
      ])
      || oaCanaryResult.identifier !== 'arXiv:2009.06045v1'
      || oaCanaryResult.route !== 'open_access'
      || oaCanaryResult.contentType !== 'application/pdf'
      || oaCanaryResult.magic !== '%PDF-'
      || !Number.isSafeInteger(oaCanaryResult.bytes)
      || oaCanaryResult.bytes < 6 || oaCanaryResult.bytes > 100 * 1024 * 1024)
    || !requireOaCanary && oaCanaryResult !== undefined) fail();
  return {
    source: true,
    topology: true,
    policy: true,
    fileLimit: true,
    token: true,
    session: sessionStatus,
    oaCanary: requireOaCanary,
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
    ...(report.oaCanary ? ['SCANSCI_RUNTIME_OA_CANARY_OK'] : []),
  ].join('\n') + '\n';
}

export function parseRuntimeCli(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith('--') || !argv[index + 1] || values.has(argv[index])) fail();
    values.set(argv[index], argv[index + 1]);
  }
  const common = [
    '--release-root', '--release-sha', '--compose-file', '--service-token-file',
    '--require-worker', '--allow-auth',
  ];
  const optional = values.has('--require-oa-canary') ? ['--require-oa-canary'] : [];
  const mode = values.get('--mode');
  const expected = mode === undefined
    ? [...common, ...optional, '--capability-file']
    : mode === 'prepublication'
      ? [...common, ...optional, '--mode', '--expected-legal-image-id', '--expected-browser-image-id', '--expected-auth-image-id']
      : [];
  if (values.size !== expected.length || expected.some((key) => !values.has(key))) fail();
  return Object.fromEntries(expected.map((key) => [key, values.get(key)]));
}

async function canonicalCapabilityExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return false;
    fail();
  }
}

export async function resolveRuntimeImageIdentity(options, {
  readCapability = (path) => readFile(path, 'utf8'),
  capabilityExists = canonicalCapabilityExists,
} = {}) {
  const releaseSha = options['--release-sha'];
  if (!SHA_PATTERN.test(releaseSha)) fail();
  const canonicalFile = `/opt/openscience/.release-capabilities/${releaseSha}`;
  let legalImageId;
  let browserImageId;
  let authImageId;
  if (options['--mode'] === undefined) {
    if (options['--capability-file'] !== canonicalFile
      || options['--expected-legal-image-id'] !== undefined
      || options['--expected-auth-image-id'] !== undefined) fail();
    const capability = parseReleaseCapability(await readCapability(canonicalFile));
    if (!capability.scansciDeploy) fail();
    ({ legalImageId, browserImageId, authImageId } = capability);
  } else if (options['--mode'] === 'prepublication') {
    if (options['--capability-file'] !== undefined || await capabilityExists(canonicalFile)) fail();
    legalImageId = options['--expected-legal-image-id'];
    browserImageId = options['--expected-browser-image-id'];
    authImageId = options['--expected-auth-image-id'];
  } else {
    fail();
  }
  if (!IMAGE_PATTERN.test(legalImageId) || !IMAGE_PATTERN.test(browserImageId)
    || !IMAGE_PATTERN.test(authImageId)) fail();
  return { legalImageId, browserImageId, authImageId };
}

function run(command, args, { input, maxBuffer = 1024 * 1024, timeout } = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer, input, timeout });
  if (result.status !== 0) fail();
  return result.stdout.trim();
}

const AUTH_PROCESS_LIST_SOURCE = [
  'import glob',
  "for path in sorted(glob.glob('/proc/[0-9]*/cmdline')):",
  ' try:',
  "  with open(path,'rb') as stream:",
  '   raw=stream.read()',
  ' except (FileNotFoundError,PermissionError,ProcessLookupError):',
  '  continue',
  " args=[part.decode('utf-8','replace').replace('\\n',' ').replace('\\r',' ') for part in raw.split(b'\\0') if part]",
  " if args: print(' '.join(args))",
].join('\n');

export function probeAuthRuntimeProcesses(containerId, runner = run) {
  if (!/^[a-f0-9]{6,64}$/u.test(containerId)) fail();
  const authProcessList = runner('docker', [
    'exec', containerId, 'python', '-c', AUTH_PROCESS_LIST_SOURCE,
  ], { maxBuffer: 64 * 1024 });
  const authPids = Number(runner('docker', [
    'stats', '--no-stream', '--format', '{{.PIDs}}', containerId,
  ], { timeout: 5_000 }));
  if (!Number.isSafeInteger(authPids)) fail();
  return { authProcessList, authPids };
}

export function probeBrowserRuntimeProcesses(containerId, runner = run) {
  if (!/^[a-f0-9]{6,64}$/u.test(containerId)) fail();
  const browserProcessList = runner('docker', [
    'exec', containerId, 'python', '-c', AUTH_PROCESS_LIST_SOURCE,
  ], { maxBuffer: 64 * 1024 });
  const browserPids = Number(runner('docker', [
    'stats', '--no-stream', '--format', '{{.PIDs}}', containerId,
  ], { timeout: 5_000 }));
  if (!Number.isSafeInteger(browserPids)) fail();
  return { browserProcessList, browserPids };
}

export function probeSourceFileLimit(containerId, runner = run) {
  if (!/^[a-f0-9]{6,64}$/u.test(containerId)) fail();
  const input = JSON.stringify({ probe: 'file-limit', output_dir: '/tmp' });
  const output = runner('docker', [
    'exec', '-i', containerId, 'python', '/opt/scansci/src/scansci_legal/upstream_worker.py',
  ], { input, maxBuffer: 4096 });
  let result;
  try {
    result = JSON.parse(output);
  } catch {
    fail();
  }
  if (!result || typeof result !== 'object' || Array.isArray(result)
    || Object.keys(result).join(',') !== 'file_limit'
    || result.file_limit !== '104857600:104857600') fail();
  return result.file_limit;
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
  const options = parseRuntimeCli(process.argv.slice(2));
  const releaseRoot = options['--release-root'];
  const releaseSha = options['--release-sha'];
  const composeFile = options['--compose-file'];
  const serviceTokenPath = options['--service-token-file'];
  const requireWorker = options['--require-worker'];
  const requireOaCanary = options['--require-oa-canary'] ?? '0';
  const allowAuth = options['--allow-auth'];
  if (releaseRoot !== `/opt/openscience-releases/${releaseSha}`
    || composeFile !== `${releaseRoot}/infra/compose/docker-compose.prod.yml`
    || serviceTokenPath !== '/opt/openscience-secrets/scansci/scansci_service_token'
    || !['0', '1'].includes(requireWorker) || !['0', '1'].includes(requireOaCanary)
    || !['0', '1'].includes(allowAuth) || requireOaCanary === '1' && requireWorker !== '1') fail();
  const composeArgs = [
    'compose', '--project-directory', releaseRoot,
    '--env-file', '/opt/openscience/.env.prod', '-f', composeFile,
  ];
  const browserRequirementsSha256 = sha256(await readFile(join(
    releaseRoot, 'apps', 'scansci-legal', 'browser-requirements.lock',
  )));
  const env = {
    ...process.env,
    XGS_RELEASE_ROOT: releaseRoot,
    XGS_RELEASE_IMAGE_TAG: releaseSha,
    SCANSCI_BROWSER_REQUIREMENTS_SHA256: browserRequirementsSha256,
  };
  const compose = (args) => {
    const result = spawnSync('docker', [...composeArgs, ...args], { encoding: 'utf8', env, maxBuffer: 1024 * 1024 });
    if (result.status !== 0) fail();
    return result.stdout.trim();
  };
  const containerId = compose(['ps', '-q', 'scansci-legal']);
  const browserId = compose(['ps', '-q', 'scansci-browser']);
  if (!/^[a-f0-9]{12,64}$/u.test(containerId) || !/^[a-f0-9]{12,64}$/u.test(browserId)) fail();
  const expectedIdentity = await resolveRuntimeImageIdentity(options);
  const { browserProcessList, browserPids } = probeBrowserRuntimeProcesses(browserId);
  const authIds = compose(['--profile', 'scansci-auth', 'ps', '-aq', 'scansci-auth']).split(/\r?\n/u).filter(Boolean);
  const workerId = requireWorker === '1' ? compose(['ps', '-q', 'agent-worker']) : '';
  if (requireWorker === '1' && !/^[a-f0-9]{12,64}$/u.test(workerId)) fail();
  const authContainers = authIds.map((id) => inspectJson('docker', ['inspect', id]));
  let authProcessList = '';
  let authPids = 0;
  let authNetwork;
  let authIsolationProbe;
  if (allowAuth === '1' && authIds.length === 1) {
    ({ authProcessList, authPids } = probeAuthRuntimeProcesses(authIds[0]));
    const authNetworkNames = Object.keys(authContainers[0].NetworkSettings?.Networks ?? {})
      .filter((name) => name.endsWith('_auth_net'));
    if (authNetworkNames.length !== 1) fail();
    authNetwork = inspectJson('docker', ['network', 'inspect', authNetworkNames[0]]);
    const primaryRoute = run('ip', ['-4', 'route', 'get', '1.1.1.1']);
    const primaryHost = /\bsrc (\d{1,3}(?:\.\d{1,3}){3})\b/u.exec(primaryRoute)?.[1];
    if (!primaryHost || primaryHost === '172.25.0.1') fail();
    const authIsolationProbeSource = [
      'import json,socket,urllib.request',
      "proxy='http://openscience-egress:7891'",
      "addresses=sorted({item[4][0] for item in socket.getaddrinfo('openscience-egress',7891,type=socket.SOCK_STREAM)})",
      "connection=socket.create_connection(('openscience-egress',7891),timeout=3)",
      "peer='%s:%s'%connection.getpeername()",
      'connection.close()',
      "opener=urllib.request.build_opener(urllib.request.ProxyHandler({'http':proxy,'https':proxy}))",
      "allow=opener.open('https://www.gstatic.com/generate_204',timeout=8).status",
      "def blocked(host,port):\n try:\n  probe=socket.create_connection((host,port),timeout=2)\n  probe.close()\n  return 'connected'\n except OSError:\n  return 'blocked'",
      `print(json.dumps({'proxyAddress':','.join(addresses),'proxyPeer':peer,'allowStatus':allow,'hostSsh':blocked('172.25.0.1',22),'hostHttp':blocked('172.25.0.1',80),'hostHttps':blocked('172.25.0.1',443),'hostApi':blocked('172.25.0.1',3001),'hostDocker':blocked('172.25.0.1',2375),'hostDockerTls':blocked('172.25.0.1',2376),'hostPrimary':blocked('${primaryHost}',22),'rawDirect':blocked('1.1.1.1',443),'awsMetadata':blocked('169.254.169.254',80),'aliyunMetadata':blocked('100.100.100.200',80)},separators=(',',':')))`,
    ].join('\n');
    const authProbe = JSON.parse(run('docker', [
      'exec', authIds[0], 'python', '-c', authIsolationProbeSource,
    ], { maxBuffer: 4096 }));
    const legalPeerProbe = run('docker', [
      'exec', containerId, 'python', '-c',
      "import socket;\ntry:\n socket.create_connection(('172.25.0.2',6080),timeout=2);print('connected')\nexcept OSError:\n print('blocked')",
    ]);
    const workerPeerProbe = run('docker', [
      'exec', workerId, 'node', '-e',
      "const net=require('node:net');let done=false;const finish=(value)=>{if(done)return;done=true;console.log(value);socket.destroy()};const socket=net.createConnection({host:'172.25.0.2',port:6080});socket.setTimeout(2000,()=>finish('blocked'));socket.on('connect',()=>finish('connected'));socket.on('error',()=>finish('blocked'));",
    ]);
    const returnRule = ['INPUT', '-i', 'xgs-auth0', '-s', '172.25.0.2/32', '-d', '172.25.0.1/32',
      '-p', 'tcp', '--sport', '6080', '-m', 'conntrack', '--ctstate', 'ESTABLISHED',
      '-m', 'comment', '--comment', 'openscience-scansci-auth-return', '-j', 'ACCEPT'];
    run('iptables', ['-w', '-C', ...returnRule]);
    run('iptables', ['-w', '-C', 'INPUT', '-i', 'xgs-auth0', '-s', '172.25.0.0/29', '-d', '172.25.0.1',
      '-p', 'tcp', '--dport', '7891', '-m', 'comment', '--comment', 'openscience-scansci-auth', '-j', 'ACCEPT']);
    run('iptables', ['-w', '-C', 'INPUT', '-i', 'xgs-auth0', '-s', '172.25.0.0/29',
      '-m', 'comment', '--comment', 'openscience-scansci-auth', '-j', 'REJECT', '--reject-with', 'icmp-port-unreachable']);
    const inputRules = run('iptables', ['-w', '-S', 'INPUT']).split(/\r?\n/u);
    const returnRules = inputRules.filter((line) => /--comment "?openscience-scansci-auth-return"?(?: |$)/u.test(line));
    const authRules = inputRules.filter((line) => /--comment "?openscience-scansci-auth"?(?: |$)/u.test(line));
    const returnIndex = inputRules.indexOf(returnRules[0]);
    const acceptIndex = inputRules.findIndex((line) => authRules.includes(line) && /--dport 7891 .* -j ACCEPT$/u.test(line));
    const rejectIndex = inputRules.findIndex((line) => authRules.includes(line) && /-j REJECT /u.test(line));
    if (returnRules.length !== 1 || authRules.length !== 2
      || returnIndex < 0 || acceptIndex <= returnIndex || rejectIndex <= acceptIndex) fail();
    const hostNoVncHttp = Number(run('curl', [
      '--noproxy', '*', '--fail', '--silent', '--show-error', '--output', '/dev/null',
      '--write-out', '%{http_code}', '--connect-timeout', '2', '--max-time', '3',
      'http://172.25.0.2:6080/vnc.html?autoconnect=true',
    ]));
    const hostListener6080 = run('/usr/sbin/ss', ['-H', '-ltn', 'sport = :6080']) === '' ? 'absent' : 'present';
    authIsolationProbe = {
      ...authProbe, legalPeer: legalPeerProbe, workerPeer: workerPeerProbe,
      hostNoVncHttp, hostListener6080, firewall: 'isolated',
    };
  }
  const container = inspectJson('docker', ['inspect', containerId]);
  const browserContainer = inspectJson('docker', ['inspect', browserId]);
  const retrievalNetworkNames = Object.keys(container.NetworkSettings?.Networks ?? {})
    .filter((name) => name.endsWith('_retrieval_net'));
  const browserNetworkNames = Object.keys(browserContainer.NetworkSettings?.Networks ?? {})
    .filter((name) => name.endsWith('_browser_net'));
  if (retrievalNetworkNames.length !== 1 || browserNetworkNames.length !== 1) fail();
  const retrievalNetwork = inspectJson('docker', ['network', 'inspect', retrievalNetworkNames[0]]);
  const browserNetwork = inspectJson('docker', ['network', 'inspect', browserNetworkNames[0]]);
  const image = inspectJson('docker', ['image', 'inspect', `openscience-scansci-legal:${releaseSha}`]);
  const browserImage = inspectJson('docker', ['image', 'inspect', `openscience-scansci-browser:${releaseSha}`]);
  const authImage = inspectJson('docker', ['image', 'inspect', `openscience-scansci-auth:${releaseSha}`]);
  const browserVolumes = browserContainer.Mounts.map((mount) => {
    if (mount.Type !== 'volume' || !mount.Name) fail();
    return inspectJson('docker', ['volume', 'inspect', mount.Name]);
  });
  const probe = [
    'import json,urllib.request',
    "token=open('/run/secrets/scansci_service_token',encoding='utf-8').read().strip()",
    "request=urllib.request.Request('http://127.0.0.1:8080/v1/session/status',headers={'Authorization':'Bearer '+token})",
    "print(json.load(urllib.request.urlopen(request,timeout=5))['status'])",
  ].join(';');
  const sessionStatus = run('docker', ['exec', containerId, 'python', '-c', probe]);
  const sourceFileLimitMetadata = probeSourceFileLimit(containerId);
  const controlledEgressProbeSource = [
    'import json,socket,urllib.error,urllib.request',
    "proxy='http://openscience-egress:7891'",
    "addresses=sorted({item[4][0] for item in socket.getaddrinfo('openscience-egress',7891,type=socket.SOCK_STREAM)})",
    "connection=socket.create_connection(('openscience-egress',7891),timeout=3)",
    "peer='%s:%s'%connection.getpeername()",
    'connection.close()',
    "opener=urllib.request.build_opener(urllib.request.ProxyHandler({'http':proxy,'https':proxy}))",
    "allow=opener.open('https://www.gstatic.com/generate_204',timeout=8).status",
    "def proxy_status(request):\n probe=socket.create_connection(('openscience-egress',7891),timeout=3)\n probe.sendall(request.encode('ascii'))\n line=probe.makefile('rb').readline(256).decode('ascii','strict')\n probe.close()\n return int(line.split(' ',2)[1])",
    "private=proxy_status('CONNECT 169.254.169.254:443 HTTP/1.1\\r\\nHost: 169.254.169.254:443\\r\\n\\r\\n')",
    "http=proxy_status('GET http://example.com/ HTTP/1.1\\r\\nHost: example.com\\r\\nConnection: close\\r\\n\\r\\n')",
    "non443=proxy_status('CONNECT example.com:444 HTTP/1.1\\r\\nHost: example.com:444\\r\\n\\r\\n')",
    "raw='connected'",
    "try:\n direct=socket.create_connection(('1.1.1.1',443),timeout=2)\n direct.close()\nexcept OSError:\n raw='blocked'",
    "print(json.dumps({'proxyAddress':','.join(addresses),'proxyPeer':peer,'allowStatus':allow,'privateStatus':private,'httpStatus':http,'non443Status':non443,'rawDirect':raw},separators=(',',':')))",
  ].join('\n');
  const legalRuntimeIp = container.NetworkSettings?.Networks?.[retrievalNetworkNames[0]]?.IPAddress;
  if (!/^172\.24\.0\.(?:[2-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-4])$/u.test(legalRuntimeIp)) fail();
  const browserEgressProbeSource = [
    'import json,socket,urllib.request',
    "proxy='http://openscience-egress:7891'",
    "addresses=sorted({item[4][0] for item in socket.getaddrinfo('openscience-egress',7891,type=socket.SOCK_STREAM)})",
    "connection=socket.create_connection(('openscience-egress',7891),timeout=3)",
    "peer='%s:%s'%connection.getpeername()",
    'connection.close()',
    "opener=urllib.request.build_opener(urllib.request.ProxyHandler({'http':proxy,'https':proxy}))",
    "allow=opener.open('https://www.gstatic.com/generate_204',timeout=8).status",
    "def proxy_status(request):\n probe=socket.create_connection(('openscience-egress',7891),timeout=3)\n probe.sendall(request.encode('ascii'))\n line=probe.makefile('rb').readline(256).decode('ascii','strict')\n probe.close()\n return int(line.split(' ',2)[1])",
    "private=proxy_status('CONNECT 169.254.169.254:443 HTTP/1.1\\r\\nHost: 169.254.169.254:443\\r\\n\\r\\n')",
    "http=proxy_status('GET http://example.com/ HTTP/1.1\\r\\nHost: example.com\\r\\nConnection: close\\r\\n\\r\\n')",
    "non443=proxy_status('CONNECT example.com:444 HTTP/1.1\\r\\nHost: example.com:444\\r\\n\\r\\n')",
    "def blocked(host,port):\n try:\n  candidate=socket.create_connection((host,port),timeout=2)\n  candidate.close()\n  return 'connected'\n except OSError:\n  return 'blocked'",
    `print(json.dumps({'proxyAddress':','.join(addresses),'proxyPeer':peer,'allowStatus':allow,'privateStatus':private,'httpStatus':http,'non443Status':non443,'hostSsh':blocked('172.26.0.1',22),'hostHttp':blocked('172.26.0.1',80),'hostHttps':blocked('172.26.0.1',443),'hostApi':blocked('172.26.0.1',3001),'hostDocker':blocked('172.26.0.1',2375),'hostDockerTls':blocked('172.26.0.1',2376),'legalPeer':blocked('${legalRuntimeIp}',8080),'rawDirect':blocked('1.1.1.1',443)},separators=(',',':')))`,
  ].join('\n');
  let controlledEgressProbe;
  let browserEgressProbe;
  try {
    controlledEgressProbe = JSON.parse(run('docker', [
      'exec', containerId, 'python', '-c', controlledEgressProbeSource,
    ], { maxBuffer: 4096 }));
    browserEgressProbe = JSON.parse(run('docker', [
      'exec', browserId, 'python', '-c', browserEgressProbeSource,
    ], { maxBuffer: 4096 }));
  } catch {
    fail();
  }
  const browserInputRules = run('iptables', ['-w', '-S', 'INPUT']).split(/\r?\n/u);
  run('iptables', ['-w', '-C', 'INPUT', '-i', 'xgs-browser0', '-s', '172.26.0.2/32',
    '-d', '172.26.0.1/32', '-p', 'tcp', '--dport', '7891', '-m', 'comment',
    '--comment', 'openscience-scansci-browser', '-j', 'ACCEPT']);
  run('iptables', ['-w', '-C', 'INPUT', '-i', 'xgs-browser0', '-s', '172.26.0.0/24',
    '-m', 'comment', '--comment', 'openscience-scansci-browser', '-j', 'REJECT',
    '--reject-with', 'icmp-port-unreachable']);
  verifyBrowserFirewallRules(browserInputRules);
  browserEgressProbe.firewall = 'isolated';
  let oaCanaryResult;
  if (requireOaCanary === '1') {
    try {
      oaCanaryResult = JSON.parse(run('docker', [
        'exec', containerId, 'python', '-m', 'scansci_legal.oa_canary',
      ], { maxBuffer: 4096, timeout: 90_000 }));
    } catch {
      fail();
    }
  }
  const runtimeSecretMetadata = run('docker', [
    'exec', containerId, 'stat', '-c', '%u:%g:%a', '/run/secrets/scansci_service_token',
  ]);
  const runtimeSecretSha256 = run('docker', [
    'exec', containerId, 'python', '-c',
    "import hashlib;print(hashlib.sha256(open('/run/secrets/scansci_service_token','rb').read().strip()).hexdigest())",
  ]);
  let workerContainer;
  let workerImage;
  let workerSecretMetadata;
  let workerSecretSha256;
  if (requireWorker === '1') {
    workerContainer = inspectJson('docker', ['inspect', workerId]);
    workerImage = inspectJson('docker', ['image', 'inspect', `openscience-agent-worker:${releaseSha}`]);
    workerSecretMetadata = run('docker', ['exec', workerId, 'stat', '-c', '%u:%g:%a', '/run/scansci-worker-secrets/scansci_service_token']);
    workerSecretSha256 = run('docker', ['exec', workerId, 'node', '-e', "const fs=require('node:fs'),c=require('node:crypto');process.stdout.write(c.createHash('sha256').update(fs.readFileSync('/run/scansci-worker-secrets/scansci_service_token','utf8').trim()).digest('hex'))"]);
  }
  const report = await verifyScanSciRuntime({
    releaseRoot, releaseSha, composeFile, serviceTokenPath, container, image,
    browserContainer, browserImage, browserVolumes, browserNetwork, browserProcessList, browserPids,
    browserEgressProbe, authImage,
    authContainerIds: authIds, sessionStatus, sourceFileLimitMetadata, retrievalNetwork, controlledEgressProbe,
    requireOaCanary: requireOaCanary === '1', oaCanaryResult,
    runtimeSecretMetadata, runtimeSecretSha256,
    workerContainer, workerImage, workerSecretMetadata, workerSecretSha256,
    authContainers, allowRunningAuth: allowAuth === '1', authProcessList, authPids,
    authNetwork, authIsolationProbe,
    expectedLegalImageId: expectedIdentity.legalImageId,
    expectedBrowserImageId: expectedIdentity.browserImageId,
    expectedAuthImageId: expectedIdentity.authImageId,
  });
  process.stdout.write(formatRuntimeStatuses(report));
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  void main().catch(() => {
    console.error('ScanSci runtime verification failed');
    process.exitCode = 65;
  });
}
