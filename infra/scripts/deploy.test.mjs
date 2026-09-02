import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const launcherSource = readFileSync(new URL('./deploy.sh', import.meta.url), 'utf8');
const transactionSource = readFileSync(new URL('./production-deploy-transaction.sh', import.meta.url), 'utf8');
const transactionStateSource = readFileSync(new URL('./production-deploy-transaction-state.sh', import.meta.url), 'utf8');
const scansciRuntimeVerifierSource = readFileSync(new URL('./verify-scansci-runtime.mjs', import.meta.url), 'utf8');
const retentionSource = readFileSync(new URL('./production-release-retention.mjs', import.meta.url), 'utf8');
const transactionStatePath = fileURLToPath(new URL('./production-deploy-transaction-state.sh', import.meta.url));
const source = `${launcherSource}\n${transactionSource}\n${transactionStateSource}`;

function deploymentFunction(name) {
  const body = transactionSource.match(new RegExp(`${name}\\(\\) \\{[\\s\\S]*?\\n\\}`, 'u'))?.[0];
  assert.ok(body, `${name} production function is missing`);
  return body;
}

test('production commit publishes durable rollback identity before exact retention', () => {
  const preflight = transactionSource.indexOf('production-release-retention.mjs" preflight');
  const sameSha = transactionSource.indexOf('if [ "$ACTIVE_RELEASE_SHA" = "$RELEASE_SHA" ]');
  const backupRefresh = transactionSource.indexOf('backup.sh.next');
  const prepare = transactionSource.indexOf('production-release-retention.mjs" prepare');
  const commit = transactionSource.lastIndexOf('transaction_commit');
  const complete = transactionSource.indexOf('production-release-retention.mjs" complete');
  const unlock = transactionSource.indexOf('exec 9>&-');
  assert.ok(preflight > 0 && preflight < sameSha, 'rollback identity must be checked before same-SHA exit');
  assert.ok(prepare > backupRefresh && prepare < commit, 'pending intent must follow acceptance and precede commit');
  assert.ok(complete > commit && complete < unlock, 'post-commit retention must finish under inherited FD9');
  assert.match(transactionStateSource, /transaction_abort_rollback_intent[\s\S]*transaction_journal_clear/u);
  assert.doesNotMatch(retentionSource, /docker\s+(?:system|image|volume|builder)\s+prune/u);
});
const workerDockerfile = readFileSync(new URL('../../apps/agent-worker/Dockerfile', import.meta.url), 'utf8');
const parserDockerfile = readFileSync(new URL('../../apps/agent-worker/Dockerfile.parser', import.meta.url), 'utf8');
const productionCompose = readFileSync(new URL('../compose/docker-compose.prod.yml', import.meta.url), 'utf8');
const developmentCompose = readFileSync(new URL('../compose/docker-compose.dev.yml', import.meta.url), 'utf8');
const cloudSync = readFileSync(new URL('../../scripts/cloud-sync.mjs', import.meta.url), 'utf8');
const releaseSyncCommand = readFileSync(new URL('../../scripts/release-sync-command.mjs', import.meta.url), 'utf8');
const backup = readFileSync(new URL('./backup.sh', import.meta.url), 'utf8');
const sshRun = readFileSync(new URL('./ssh-run.sh', import.meta.url), 'utf8');
const backupRunbook = readFileSync(new URL('../../docs/runbooks/backup-restore.md', import.meta.url), 'utf8');
const embeddingDockerfile = readFileSync(new URL('../../apps/embedding-worker/Dockerfile', import.meta.url), 'utf8');
const embeddingRequirements = readFileSync(new URL('../../apps/embedding-worker/requirements.lock', import.meta.url), 'utf8');
const embeddingEvaluatorDockerfile = readFileSync(new URL('../embedding-candidates/bge-m3/Dockerfile', import.meta.url), 'utf8');
const squidConfig = readFileSync(new URL('../squid/openscience-egress.conf', import.meta.url), 'utf8');
const authNetworkPreparation = readFileSync(new URL('./prepare-scansci-auth-network.sh', import.meta.url), 'utf8');
const browserNetworkPreparation = readFileSync(new URL('./prepare-scansci-browser-network.sh', import.meta.url), 'utf8');
const browserFirewall = readFileSync(new URL('./scansci-browser-firewall.sh', import.meta.url), 'utf8');
const browserFirewallService = readFileSync(new URL('../systemd/openscience-scansci-browser-firewall.service', import.meta.url), 'utf8');
const browserFirewallDockerDropIn = readFileSync(new URL('../systemd/docker.service.d/openscience-scansci-browser-firewall.conf', import.meta.url), 'utf8');
const browserNetworkSquidDropIn = readFileSync(new URL('../systemd/squid.service.d/openscience-scansci-browser-network.conf', import.meta.url), 'utf8');
const atomicSquidConfig = readFileSync(new URL('./atomic-squid-config.mjs', import.meta.url), 'utf8');
const rootPackage = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const bash = process.platform === 'win32' && existsSync('C:/Program Files/Git/bin/bash.exe')
  ? 'C:/Program Files/Git/bin/bash.exe'
  : '/bin/bash';

function composeService(name, nextName, compose = productionCompose) {
  const start = compose.indexOf(`\n  ${name}:`);
  assert.ok(start >= 0, `${name} service is missing`);
  const end = nextName ? compose.indexOf(`\n  ${nextName}:`, start + 1) : compose.indexOf('\nnetworks:', start + 1);
  assert.ok(end > start, `${name} service boundary is missing`);
  return compose.slice(start, end);
}

test('ScanSci production topology separates legal, browser and stopped bridge-only auth roles', () => {
  const mcp = composeService('scansci-mcp', 'scansci-secret-init');
  const legal = composeService('scansci-legal', 'scansci-browser');
  const browser = composeService('scansci-browser', 'scansci-auth');
  const auth = composeService('scansci-auth', 'document-parser');
  const worker = composeService('agent-worker', 'scansci-mcp');
  const secretInit = composeService('scansci-secret-init', 'scansci-legal');
  const developmentLegal = composeService('scansci-legal', 'scansci-browser', developmentCompose);
  const developmentBrowser = composeService('scansci-browser', 'scansci-auth', developmentCompose);
  const developmentAuth = composeService('scansci-auth', undefined, developmentCompose);

  assert.match(legal, /context: \$\{XGS_RELEASE_ROOT:\?XGS_RELEASE_ROOT required\}\/apps\/scansci-legal/u);
  assert.match(legal, /dockerfile: Dockerfile/u);
  assert.match(legal, /image: openscience-scansci-legal:\$\{XGS_RELEASE_IMAGE_TAG:\?XGS_RELEASE_IMAGE_TAG required\}/u);
  assert.match(legal, /user: "10001:10001"/u);
  assert.match(legal, /group_add:\r?\n\s+- "11000"/u);
  assert.match(legal, /read_only: true/u);
  assert.match(legal, /cap_drop:\r?\n\s+- ALL/u);
  assert.match(legal, /security_opt:\r?\n\s+- no-new-privileges:true/u);
  assert.match(legal, /mem_limit: 1g/u);
  assert.match(legal, /cpus: 1/u);
  assert.match(legal, /pids_limit: 64/u);
  assert.match(legal, /\/tmp:size=256m,noexec,nosuid,nodev,uid=10001,gid=10001,mode=0700/u);
  assert.match(developmentLegal, /\/tmp:size=256m,noexec,nosuid,nodev,uid=10001,gid=10001,mode=0700/u);
  assert.match(legal, /scansci-session:\/session/u);
  assert.match(legal, /scansci-service-secrets:\/run\/secrets:ro/u);
  assert.match(legal, /scansci-browser-inputs:\/browser-inputs(?:\r?\n|\s*$)/u);
  assert.match(legal, /scansci-browser-outputs:\/browser-outputs:ro/u);
  assert.doesNotMatch(legal, /scansci-browser:\r?\n\s+condition: service_healthy/u);
  assert.match(legal, /networks:\r?\n\s+- retrieval_net/u);
  assert.match(legal, /SCANSCI_EGRESS_PROXY: http:\/\/openscience-egress:7891/u);
  assert.match(legal, /extra_hosts:\r?\n\s+- "openscience-egress:172\.24\.0\.1"/u);
  assert.doesNotMatch(legal, /\bports:|data_net|DATABASE|POSTGRES|REDIS|S3_|MINIO|env_file|docker\.sock/iu);

  assert.match(browser, /dockerfile: Dockerfile\.browser/u);
  assert.match(browser, /image: openscience-scansci-browser:\$\{XGS_RELEASE_IMAGE_TAG:\?XGS_RELEASE_IMAGE_TAG required\}/u);
  assert.match(browser, /SCANSCI_BROWSER_REQUIREMENTS_SHA256: \$\{SCANSCI_BROWSER_REQUIREMENTS_SHA256:\?SCANSCI_BROWSER_REQUIREMENTS_SHA256 required\}/u);
  assert.match(browser, /user: "10002:11000"/u);
  assert.match(browser, /group_add:\r?\n\s+- "11000"/u);
  assert.match(browser, /read_only: true/u);
  assert.match(browser, /cap_drop:\r?\n\s+- ALL/u);
  assert.match(browser, /security_opt:\r?\n\s+- no-new-privileges:true/u);
  assert.match(browser, /mem_limit: 1g/u);
  assert.match(browser, /cpus: 1/u);
  assert.match(browser, /pids_limit: 256/u);
  assert.match(browser, /SCANSCI_BROWSER_PROXY: http:\/\/openscience-egress:7891/u);
  assert.match(browser, /extra_hosts:\r?\n\s+- "openscience-egress:172\.26\.0\.1"/u);
  assert.match(browser, /scansci-browser-inputs:\/browser-inputs:ro/u);
  assert.match(browser, /scansci-browser-outputs:\/browser-outputs(?:\r?\n|\s*$)/u);
  assert.match(browser, /scansci-browser-profiles:\/browser-profile-jobs/u);
  assert.match(browser, /\/tmp:size=256m,noexec,nosuid,nodev,uid=10002,gid=11000,mode=0700/u);
  assert.match(browser, /\/dev\/shm:size=256m,nosuid,nodev,uid=10002,gid=11000,mode=0700/u);
  assert.match(browser, /test: \["CMD", "python", "-m", "scansci_legal\.browser_worker", "--healthcheck"\]/u);
  assert.match(browser, /networks:\r?\n\s+browser_net:\r?\n\s+ipv4_address: 172\.26\.0\.2/u);
  assert.doesNotMatch(browser, /\bports:|service.token|\/run\/secrets|\/session|data_net|app_net|auth_net|env_file|docker\.sock/iu);

  assert.match(worker, /- retrieval_net/u);
  assert.match(worker, /SCANSCI_ENABLED: "true"/u);
  assert.match(worker, /SCANSCI_MCP_URL: http:\/\/scansci-mcp:8000\/mcp/u);
  assert.match(worker, /SCANSCI_PAPERS_DIR: \/data\/papers/u);
  assert.match(worker, /scansci-papers:\/data\/papers(?:\r?\n|\s*$)/u);
  assert.match(worker, /group_add:\r?\n\s+- "11000"/u);
  assert.doesNotMatch(worker, /scansci-(?:service|worker|auth)-secrets/u);
  assert.equal(worker.match(/^    volumes:/gmu)?.length, 1, 'agent-worker must have one unambiguous volumes mapping');
  assert.match(worker, /\$\{XGS_RELEASE_ROOT:\?XGS_RELEASE_ROOT required\}:\/opt\/openscience:ro/u);
  assert.match(worker, /parser-jobs:\/parser-jobs/u);
  assert.match(mcp, /context: \$\{XGS_RELEASE_ROOT:\?XGS_RELEASE_ROOT required\}\/apps\/scansci-mcp/u);
  assert.match(mcp, /target: mcp/u);
  assert.match(mcp, /image: openscience-scansci-mcp:/u);
  assert.match(mcp, /SCANSCI_PDF_PROXY: http:\/\/openscience-egress:7891/u);
  assert.match(mcp, /scansci-data:\/data\/scansci/u);
  assert.match(mcp, /scansci-papers:\/data\/papers/u);
  assert.doesNotMatch(mcp, /env_file|DATABASE|POSTGRES|REDIS|S3_|MINIO|docker\.sock/iu);
  assert.match(auth, /profiles: \["scansci-auth"\]/u);
  assert.match(auth, /SCANSCI_PDF_PROXY: http:\/\/openscience-egress:7891/u);
  assert.match(auth, /extra_hosts:\r?\n\s+- "openscience-egress:172\.25\.0\.1"/u);
  assert.doesNotMatch(auth, /\bports:/u);
  assert.match(auth, /networks:\r?\n\s+auth_net:\r?\n\s+ipv4_address: 172\.25\.0\.2/u);
  assert.match(auth, /scansci-data:\/data\/scansci/u);
  assert.match(auth, /pids_limit: 256/u);
  assert.doesNotMatch(auth, /scansci-(?:service|auth)-secrets|\/run\/secrets/u);
  assert.match(auth, /restart: "no"/u);
  assert.doesNotMatch(auth, /network_mode: host|data_net|env_file|docker\.sock/iu);
  assert.match(auth, /context: \$\{XGS_RELEASE_ROOT:\?XGS_RELEASE_ROOT required\}\/apps\/scansci-mcp/u);
  assert.match(auth, /dockerfile: Dockerfile/u);
  assert.match(auth, /target: auth/u);
  assert.match(developmentLegal, /context: \.\.\/\.\.\/apps\/scansci-legal/u);
  assert.match(developmentLegal, /dockerfile: Dockerfile/u);
  assert.doesNotMatch(developmentLegal, /scansci-browser:\r?\n\s+condition: service_healthy/u);
  assert.match(developmentBrowser, /dockerfile: Dockerfile\.browser/u);
  assert.match(developmentBrowser, /user: "10002:11000"/u);
  assert.match(developmentBrowser, /scansci-browser-inputs:\/browser-inputs:ro/u);
  assert.match(developmentBrowser, /scansci-browser-outputs:\/browser-outputs(?:\r?\n|\s*$)/u);
  assert.match(developmentBrowser, /scansci-browser-profiles:\/browser-profile-jobs/u);
  assert.match(developmentBrowser, /networks:\r?\n\s+browser_net:\r?\n\s+ipv4_address: 172\.26\.0\.2/u);
  assert.doesNotMatch(developmentBrowser, /\bports:|\/run\/secrets|\/session|data_net|app_net|auth_net|docker\.sock/iu);
  assert.match(developmentAuth, /context: \.\.\/\.\.\/apps\/scansci-legal/u);
  assert.match(developmentAuth, /dockerfile: Dockerfile\.auth/u);
  assert.doesNotMatch(developmentAuth, /\bports:/u);
  assert.match(developmentAuth, /SCANSCI_BROWSER_PROXY: http:\/\/openscience-egress:7891/u);
  assert.match(developmentAuth, /extra_hosts:\r?\n\s+- "openscience-egress:172\.25\.0\.1"/u);
  assert.match(developmentAuth, /networks:\r?\n\s+auth_net:\r?\n\s+ipv4_address: 172\.25\.0\.2/u);
  assert.match(developmentAuth, /pids_limit: 256/u);
  assert.doesNotMatch(developmentAuth, /network_mode: host|scansci-auth-secrets|\/run\/secrets/u);
  assert.match(readFileSync(new URL('../../apps/scansci-legal/auth-entrypoint.sh', import.meta.url), 'utf8'), /0\.0\.0\.0:6080 127\.0\.0\.1:5900/u);

  assert.match(secretInit, /\/opt\/openscience-secrets\/scansci:\/host-secrets:ro/u);
  assert.match(secretInit, /install -o 10001 -g 10001 -m 0400 \/host-secrets\/scansci_service_token \/service-secrets\/\.scansci_service_token\.next/u);
  assert.match(secretInit, /install -o 1000 -g 1000 -m 0400 \/host-secrets\/scansci_service_token \/worker-secrets\/\.scansci_service_token\.next/u);
  assert.doesNotMatch(secretInit, /scansci_(?:username|password)|auth-secrets/u);
  assert.match(secretInit, /network_mode: none/u);
  assert.match(secretInit, /read_only: true/u);
  assert.match(productionCompose, /scansci-session:\r?\n/u);
  const volumeSection = productionCompose.split('\nvolumes:')[1] ?? '';
  assert.match(volumeSection, /scansci-service-secrets:\r?\n/u);
  for (const [name, options] of [
    ['scansci-browser-inputs', 'size=128m,uid=10001,gid=11000,mode=0750'],
    ['scansci-browser-outputs', 'size=128m,uid=10002,gid=11000,mode=0750'],
    ['scansci-browser-profiles', 'size=256m,uid=10002,gid=11000,mode=0700'],
  ]) {
    assert.match(volumeSection, new RegExp(`${name}:\\r?\\n    driver: local\\r?\\n    driver_opts:\\r?\\n      type: tmpfs\\r?\\n      device: tmpfs\\r?\\n      o: ${options}`, 'u'));
  }
  assert.doesNotMatch(volumeSection, /scansci-auth-secrets:\r?\n/u);
  assert.match(volumeSection, /scansci-service-secrets:\r?\n  scansci-worker-secrets:\r?\n/u);
  assert.match(productionCompose, /^  retrieval_net:\r?\n    driver: bridge\r?\n    internal: true\r?\n    ipam:\r?\n      config:\r?\n        - subnet: 172\.24\.0\.0\/24\r?\n          gateway: 172\.24\.0\.1$/mu);
  assert.match(productionCompose, /^  auth_net:\r?\n    driver: bridge\r?\n    internal: true\r?\n    driver_opts:\r?\n      com\.docker\.network\.bridge\.name: xgs-auth0\r?\n    ipam:\r?\n      config:\r?\n        - subnet: 172\.25\.0\.0\/29\r?\n          gateway: 172\.25\.0\.1$/mu);
  assert.equal((productionCompose.match(/\n\s+ipv4_address: 172\.25\.0\.2\s*$/gmu) ?? []).length, 1,
    'official auth must be the sole fixed peer on the host-reachable internal bridge');
});

test('ScanSci browser has a boot-persistent proxy-only bridge before it can start', () => {
  for (const compose of [productionCompose, developmentCompose]) {
    assert.match(compose, /browser_net:\r?\n\s+driver: bridge\r?\n\s+internal: true\r?\n\s+driver_opts:\r?\n\s+com\.docker\.network\.bridge\.name: xgs-browser0\r?\n\s+ipam:\r?\n\s+config:\r?\n\s+- subnet: 172\.26\.0\.0\/24\r?\n\s+gateway: 172\.26\.0\.1/u);
    assert.match(
      composeService('scansci-browser', 'scansci-auth', compose),
      /networks:\r?\n\s+browser_net:\r?\n\s+ipv4_address: 172\.26\.0\.2/u,
    );
  }
  assert.match(squidConfig, /^http_port 172\.26\.0\.1:7891 name=scansci_browser_listener$/mu);
  assert.match(squidConfig, /^acl scansci_browser src 172\.26\.0\.2\/32$/mu);
  assert.match(squidConfig, /^http_access allow scansci_browser scansci_browser_listener CONNECT SSL_ports$/mu);
  assert.match(squidConfig, /^always_direct allow scansci_browser$/mu);
  assert.match(browserFirewall, /browser_ip='172\.26\.0\.2'/u);
  assert.match(browserFirewall, /INPUT -i "\$bridge_name" -s "\$browser_ip\/32" -d "\$gateway" -p tcp --dport 7891/u);
  assert.match(browserFirewall, /legacy_accept=\(INPUT -i "\$bridge_name" -s "\$subnet" -d "\$gateway" -p tcp --dport 7891/u);
  assert.match(browserFirewall, /INPUT -i "\$bridge_name" -s "\$subnet" -m comment --comment "\$comment" -j REJECT/u);
  assert.match(browserFirewall, /iptables_real="\$\(readlink -f -- "\$iptables_bin"\)"/u);
  assert.doesNotMatch(browserFirewall, /\[ ! -L "\$iptables_bin" \]/u);
  assert.match(browserFirewall, /if \[ "\$action" = remove \]/u);
  assert.match(browserNetworkPreparation, /openscience-prod_browser_net/u);
  assert.match(browserNetworkPreparation, /unauthorized peer/u);
  assert.match(browserNetworkPreparation, /\[ "\$\{#peers\[@\]\}" -eq 0 \]/u);
  assert.match(browserNetworkPreparation, /com\.docker\.compose\.service.*scansci-browser/u);
  assert.match(browserNetworkPreparation, /NetworkMode.*\$network_name/u);
  assert.match(browserNetworkPreparation, /len \.NetworkSettings\.Networks/u);
  assert.match(browserNetworkPreparation, /IPAMConfig\.IPv4Address.*172\.26\.0\.2/u);
  assert.match(browserNetworkPreparation, /"\$atomic_config" activate/u);
  assert.match(browserNetworkPreparation, /172\.26\.0\.1:7891/u);
  assert.match(browserNetworkPreparation, /if \[ "\$activated" -eq 1 \][\s\S]*"\$atomic_config" restore/u);
  assert.match(browserFirewallService, /^Before=docker\.service$/mu);
  assert.match(browserFirewallService, /^ExecStart=\/usr\/local\/bin\/openscience-scansci-browser-firewall$/mu);
  assert.match(browserFirewallService, /^ExecStop=\/usr\/local\/bin\/openscience-scansci-browser-firewall remove$/mu);
  assert.match(browserFirewallDockerDropIn, /^Requires=openscience-scansci-browser-firewall\.service$/mu);
  assert.match(browserFirewallDockerDropIn, /^After=openscience-scansci-browser-firewall\.service$/mu);
  assert.match(browserNetworkSquidDropIn, /^Requires=docker\.service$/mu);
  assert.match(browserNetworkSquidDropIn, /^After=docker\.service$/mu);
  assert.match(composeService('scansci-browser', 'scansci-auth'), /restart: unless-stopped/u);
  assert.match(transactionSource, /\/etc\/systemd\/system\/docker\.service\.d\/openscience-scansci-browser-firewall\.conf/u);
  const switchAnchor = transactionSource.indexOf('log "[5c] ScanSci 先行');
  const precreate = transactionSource.indexOf('up --no-start --force-recreate scansci-browser scansci-legal', switchAnchor);
  const legacySwitch = transactionSource.indexOf('else\n  SCANSCI_BROWSER_BOOT_POLICY_DIRTY=1', switchAnchor);
  const bootPolicyPublish = transactionSource.indexOf('\n  publish_scansci_boot_policy\n', legacySwitch);
  const bootPolicyDirty = transactionSource.lastIndexOf('SCANSCI_BROWSER_BOOT_POLICY_DIRTY=1', bootPolicyPublish);
  const squidPreimage = transactionSource.indexOf('transaction_prepare_scansci_squid_preimage', bootPolicyPublish);
  assert.ok(
    bootPolicyPublish > transactionSource.indexOf('transaction_mark_phase switching')
      && bootPolicyPublish < precreate,
    'boot policy must be durable before the browser gains restart eligibility',
  );
  assert.ok(
    bootPolicyDirty > transactionSource.indexOf('transaction_mark_phase switching')
      && bootPolicyDirty < bootPolicyPublish,
    'rollback ownership must be recorded before boot-policy publication starts',
  );
  assert.ok(
    squidPreimage > bootPolicyPublish && squidPreimage < precreate,
    'an exact Squid preimage must exist before browser or host-policy mutation',
  );
  const prepareSquidPreimage = deploymentFunction('transaction_prepare_scansci_squid_preimage');
  assert.match(
    prepareSquidPreimage,
    /atomic-squid-config\.mjs' snapshot \/etc\/squid\/squid\.conf '\$SCANSCI_BROWSER_SQUID_PREIMAGE'/u,
  );
  assert.doesNotMatch(prepareSquidPreimage, /install [^\n]+SCANSCI_BROWSER_SQUID_PREIMAGE\.next/u);
  const publishBootPolicy = deploymentFunction('publish_scansci_boot_policy');
  const dockerFailClosedGuard = publishBootPolicy.indexOf('openscience-scansci-browser-firewall.conf.next');
  const firewallBinary = publishBootPolicy.indexOf('openscience-scansci-browser-firewall.next');
  const firewallUnit = publishBootPolicy.indexOf('openscience-scansci-browser-firewall.service.next');
  assert.ok(
    dockerFailClosedGuard >= 0
      && dockerFailClosedGuard < firewallBinary
      && dockerFailClosedGuard < firewallUnit,
    'the Docker fail-closed dependency must be the first persistent boot-policy mutation',
  );
  assert.match(deploymentFunction('publish_scansci_boot_policy'), /systemctl show squid\.service[\s\S]*grep -qx docker\.service/u);
  assert.match(
    deploymentFunction('transaction_perform_application_rollback'),
    /transaction_restore_pre_browser_boot_policy/u,
  );
  const restoreHostPolicy = deploymentFunction('transaction_restore_pre_browser_host_policy');
  assert.match(restoreHostPolicy, /transaction_restore_exact_scansci_squid_preimage/u);
  assert.doesNotMatch(restoreHostPolicy, /atomic-squid-config\.mjs' restore/u);
  const restoreSquidPreimage = deploymentFunction('transaction_restore_exact_scansci_squid_preimage');
  assert.match(restoreSquidPreimage, /SCANSCI_BROWSER_SQUID_PREIMAGE/u);
  assert.match(restoreSquidPreimage, /atomic-squid-config\.mjs' activate/u);
  assert.match(restoreSquidPreimage, /cmp -- '\$SCANSCI_BROWSER_SQUID_PREIMAGE' \/etc\/squid\/squid\.conf/u);
  const restoreBootPolicy = deploymentFunction('transaction_restore_pre_browser_boot_policy');
  assert.match(restoreBootPolicy, /PREVIOUS_HAS_SCANSCI_BROWSER/u);
  assert.match(restoreBootPolicy, /publish_scansci_boot_policy "\$PREVIOUS_RELEASE_ROOT"/u);
  assert.match(restoreBootPolicy, /rm -f -- \/etc\/systemd\/system\/docker\.service\.d\/openscience-scansci-browser-firewall\.conf/u);
  assert.doesNotMatch(restoreBootPolicy, /disable --now openscience-scansci-browser-firewall\.service/u);
  assert.match(
    restoreBootPolicy,
    /systemctl disable openscience-scansci-browser-firewall\.service[\s\S]*rm -f -- \/etc\/systemd\/system\/docker\.service\.d\/openscience-scansci-browser-firewall\.conf[\s\S]*systemctl stop openscience-scansci-browser-firewall\.service[\s\S]*systemctl is-active --quiet docker\.service/u,
  );
  assert.match(transactionSource, /if \[ "\$ACTIVE_RELEASE_SHA" = "\$RELEASE_SHA" \]; then[\s\S]*transaction_verify_already_active_release[\s\S]*if \[ "\$UPSTREAM_SCANSCI" -ne 1 \]; then\r?\n\s+publish_scansci_boot_policy/u);
  const prepare = transactionSource.indexOf('prepare-scansci-browser-network.sh', precreate);
  const start = transactionSource.indexOf('up -d --no-recreate --wait --wait-timeout 300 scansci-browser scansci-legal', prepare);
  assert.ok(precreate > 0 && prepare > precreate && start > prepare, 'browser network firewall must exist before start');
  assert.match(transactionSource.slice(precreate, start), /SCANSCI_PREPARED_BROWSER_ID=.*ps -a -q scansci-browser/u);
  assert.match(transactionSource.slice(start), /verify_prepared_browser_container_id "\$SCANSCI_PREPARED_BROWSER_ID"/u);
  assert.ok(
    transactionSource.indexOf('SCANSCI_BROWSER_HOST_POLICY_DIRTY=1', precreate) < prepare,
    'the outer transaction must record dirty host policy before preparation can mutate it',
  );
  assert.doesNotMatch(
    transactionSource,
    /if ! run_remote "\/bin\/bash '\$RELEASE_ROOT\/infra\/scripts\/prepare-scansci-browser-network\.sh'/u,
    'the transaction must retain the real preparation exit status for compensation routing',
  );
  assert.doesNotMatch(
    transactionSource.slice(precreate, start),
    /SCANSCI_BROWSER_HOST_POLICY_DIRTY=0/u,
    'no helper exit status may discard exact outer rollback ownership',
  );
  const preparationCleanupTrap = browserNetworkPreparation.indexOf('trap cleanup EXIT');
  const preparationFirewall = browserNetworkPreparation.lastIndexOf('/bin/bash "$firewall"');
  const preparationTempFile = browserNetworkPreparation.indexOf('mktemp /etc/squid/.openscience-next.XXXXXX');
  assert.ok(
    preparationCleanupTrap >= 0
      && preparationCleanupTrap < preparationFirewall
      && preparationCleanupTrap < preparationTempFile,
    'network preparation must register compensation before firewall or temporary-file mutations',
  );
  assert.match(browserNetworkPreparation, /no_mutation_exit=78/u);
  assert.match(browserNetworkPreparation, /clean_compensated_exit=79/u);
  assert.match(browserNetworkPreparation, /cleanup_failed=1[\s\S]*exit 70/u);
  assert.match(
    browserNetworkPreparation,
    /if \[ "\$mutation_started" -eq 0 \]; then[\s\S]*exit "\$no_mutation_exit"/u,
  );
  assert.match(browserNetworkPreparation, /exit "\$clean_compensated_exit"/u);
});

test('ScanSci browser supply-chain hash is release-derived for deploy and rollback Compose', () => {
  assert.match(
    transactionSource,
    /SCANSCI_BROWSER_REQUIREMENTS_SHA256_VALUE="\$\(sha256sum "\$RELEASE_ROOT\/apps\/scansci-legal\/browser-requirements\.lock" \| awk '\{print \$1\}'\)"/u,
  );
  for (const functionName of ['compose_current', 'compose_embedding_current', 'compose_scansci_auth_current']) {
    assert.match(
      deploymentFunction(functionName),
      /SCANSCI_BROWSER_REQUIREMENTS_SHA256=\$SCANSCI_BROWSER_REQUIREMENTS_SHA256_VALUE docker compose/u,
    );
  }
  assert.match(
    transactionSource,
    /PREVIOUS_SCANSCI_BROWSER_REQUIREMENTS_SHA256="\$\(run_remote "sha256sum '\$PREVIOUS_RELEASE_ROOT\/apps\/scansci-legal\/browser-requirements\.lock' \| awk '\{print \\\$1\}'"\)"/u,
  );
  assert.match(
    transactionSource,
    /PREVIOUS_RUNTIME_ENV="\$PREVIOUS_RUNTIME_ENV SCANSCI_BROWSER_REQUIREMENTS_SHA256=\$PREVIOUS_SCANSCI_BROWSER_REQUIREMENTS_SHA256"/u,
  );
  assert.match(
    transactionStateSource,
    /SCANSCI_BROWSER_REQUIREMENTS_SHA256='\$SCANSCI_BROWSER_REQUIREMENTS_SHA256_VALUE' docker compose/u,
  );
});

function runBootPolicyFailureHarness(publishFunction, failAt) {
  const script = [
    'set -euo pipefail',
    `RELEASE_ROOT='/opt/openscience-releases/${'a'.repeat(40)}'`,
    `FAIL_AT=${failAt}`,
    'calls=0',
    'guard_installed=0',
    'run_remote() {',
    '  calls=$((calls + 1))',
    '  printf "attempt=%s\\n" "$calls"',
    '  if [ "$calls" -eq "$FAIL_AT" ]; then return 90; fi',
    '  if [[ "$1" == *"docker.service.d/openscience-scansci-browser-firewall.conf.next"* ]]; then guard_installed=1; fi',
    '}',
    'report() { status=$?; trap - EXIT; printf "status=%s guard=%s calls=%s\\n" "$status" "$guard_installed" "$calls"; exit "$status"; }',
    'trap report EXIT',
    publishFunction,
    'publish_scansci_boot_policy',
  ].join('\n');
  return spawnSync(bash, ['-c', script], { encoding: 'utf8' });
}

test('every boot-policy publication failure is either mutation-free or Docker fail-closed', () => {
  const publish = deploymentFunction('publish_scansci_boot_policy');
  for (let failAt = 1; failAt <= 5; failAt += 1) {
    const result = runBootPolicyFailureHarness(publish, failAt);
    assert.equal(result.status, 90, result.stderr);
    assert.match(result.stdout, new RegExp(`status=90 guard=${failAt === 1 ? 0 : 1} calls=${failAt}`, 'u'));
  }

  const commandLines = publish.match(/^  run_remote .*$/gmu) ?? [];
  assert.ok(commandLines.length >= 2, 'boot-policy publisher needs independently injectable steps');
  const unsafeMutation = publish
    .replace(commandLines[0], '__SECOND__')
    .replace(commandLines[1], commandLines[0])
    .replace('__SECOND__', commandLines[1]);
  const mutationResult = runBootPolicyFailureHarness(unsafeMutation, 2);
  assert.equal(mutationResult.status, 90, mutationResult.stderr);
  assert.match(mutationResult.stdout, /status=90 guard=0 calls=2/u);
});

test('ScanSci controlled egress is private to the fixed retrieval subnet', () => {
  assert.match(squidConfig, /^http_port 127\.0\.0\.1:7891 name=loopback_listener$/mu);
  assert.match(squidConfig, /^http_port 172\.24\.0\.1:7891 name=scansci_listener$/mu);
  assert.match(squidConfig, /^http_port 172\.25\.0\.1:7891 name=scansci_auth_listener$/mu);
  assert.match(squidConfig, /^acl scansci_retrieval src 172\.24\.0\.0\/24$/mu);
  assert.match(squidConfig, /^acl scansci_auth src 172\.25\.0\.0\/29$/mu);
  assert.match(squidConfig, /^acl scansci_parent_domains dstdomain \.arxiv\.org$/mu);
  assert.match(squidConfig, /^http_access deny scansci_retrieval !CONNECT$/mu);
  assert.match(squidConfig, /^http_access deny scansci_retrieval !SSL_ports$/mu);
  assert.match(squidConfig, /^http_access deny scansci_retrieval blocked_ipv4$/mu);
  assert.match(squidConfig, /^http_access deny scansci_retrieval blocked_ipv6$/mu);
  assert.match(squidConfig, /^http_access allow scansci_retrieval scansci_listener CONNECT SSL_ports$/mu);
  assert.match(squidConfig, /^http_access allow scansci_auth scansci_auth_listener CONNECT SSL_ports$/mu);
  assert.match(squidConfig, /^cache_peer_access home_tunnel allow loopback$/mu);
  assert.match(squidConfig, /^cache_peer_access home_tunnel allow scansci_retrieval scansci_parent_domains$/mu);
  assert.match(squidConfig, /^cache_peer_access home_tunnel deny scansci_retrieval$/mu);
  assert.match(squidConfig, /^cache_peer_access home_tunnel deny scansci_auth$/mu);
  assert.match(squidConfig, /^cache_peer_access home_tunnel deny all$/mu);
  assert.match(squidConfig, /^always_direct allow scansci_retrieval !scansci_parent_domains$/mu);
  assert.match(squidConfig, /^always_direct allow scansci_auth$/mu);
  assert.doesNotMatch(squidConfig, /^cache_peer_access home_tunnel allow all$/mu);
  assert.doesNotMatch(squidConfig, /^http_port (?:0\.0\.0\.0|\[::\]):7891$/mu);
  assert.ok(squidConfig.indexOf('http_access allow scansci_retrieval scansci_listener CONNECT SSL_ports') < squidConfig.indexOf('http_access deny all'));
});

test('ScanSci auth preparation installs an isolated host policy before browser start', () => {
  assert.match(authNetworkPreparation, /network_name='openscience-prod_auth_net'/u);
  assert.match(authNetworkPreparation, /bridge_name='xgs-auth0'/u);
  assert.match(authNetworkPreparation, /subnet='172\.25\.0\.0\/29'/u);
  assert.match(authNetworkPreparation, /gateway='172\.25\.0\.1'/u);
  assert.match(authNetworkPreparation, /unauthorized peer/u);
  assert.match(authNetworkPreparation, /squid -k parse/u);
  assert.match(authNetworkPreparation, /"\$atomic_config" activate/u);
  assert.doesNotMatch(authNetworkPreparation, /install .*"\$target_config"/u);
  assert.match(atomicSquidConfig, /spawnSync\('\/usr\/sbin\/squid', \['-k', 'reconfigure', '-f', target\]/u);
  assert.match(atomicSquidConfig, /await recoverConfig\(\{ target, rollback \}\)/u);
  assert.match(atomicSquidConfig, /await clearPendingMarker\(target\)/u);
  assert.match(authNetworkPreparation, /--dport 7891 .* -j ACCEPT/u);
  assert.match(authNetworkPreparation, /return_rule=\(INPUT -i "\$bridge_name" -s "\$auth_ip\/32" -d "\$gateway\/32" -p tcp --sport 6080 -m conntrack --ctstate ESTABLISHED .* -j ACCEPT\)/u);
  assert.match(authNetworkPreparation, /reject=\(INPUT -i "\$bridge_name" -s "\$subnet" .* -j REJECT/u);
  assert.ok(authNetworkPreparation.indexOf('return_rule=(INPUT') < authNetworkPreparation.indexOf('accept=(INPUT'));
  assert.ok(authNetworkPreparation.indexOf('accept=(INPUT') < authNetworkPreparation.indexOf('reject=(INPUT'));
  assert.doesNotMatch(authNetworkPreparation, /reject=.*-d "\$gateway"/u);
  assert.match(authNetworkPreparation, /ss_bin='\/usr\/sbin\/ss'/u);
  assert.doesNotMatch(authNetworkPreparation, /\/usr\/bin\/ss -lntH/u);
  assert.match(authNetworkPreparation, /"\$ss_bin" -lntH/u);
  assert.match(authNetworkPreparation, /172\.25\.0\.1:7891/u);
});

test('ScanSci deploy dispatches exact rollback identity when the previous release has or lacks the service', () => {
  const previous = 'a'.repeat(40);
  const candidate = 'b'.repeat(40);
  const harness = (hasPrevious) => [
    'set -euo pipefail',
    `source '${transactionStatePath.replaceAll('\\', '/')}'`,
    'transaction_restore_previous_scansci(){ printf "restore:%s\\n" "$1"; }',
    'transaction_stop_candidate_scansci(){ printf "stop:%s\\n" "$1"; }',
    `transaction_restore_scansci_rollback '${hasPrevious}' '${previous}' '${candidate}'`,
  ].join('; ');
  const restored = spawnSync(bash, ['-c', harness(1)], { encoding: 'utf8' });
  const stopped = spawnSync(bash, ['-c', harness(0)], { encoding: 'utf8' });
  assert.equal(restored.status, 0, restored.stderr);
  assert.equal(stopped.status, 0, stopped.stderr);
  assert.equal(restored.stdout, `restore:${previous}\n`);
  assert.equal(stopped.stdout, `stop:${candidate}\n`);

  const scansciBuild = transactionSource.indexOf('build scansci-browser scansci-legal scansci-auth');
  const workerBuild = transactionSource.indexOf('agent-worker document-parser');
  const switchAnchor = transactionSource.indexOf('log "[5c] ScanSci 先行');
  const scansciStart = transactionSource.indexOf('up -d --no-recreate --wait --wait-timeout 300 scansci-browser scansci-legal', switchAnchor);
  const workerStart = transactionSource.indexOf('up -d --force-recreate --wait --wait-timeout 300 api web agent-worker');
  const runtimeVerify = transactionSource.indexOf('verify_scansci_candidate', scansciStart);
  const postWorkerVerify = transactionSource.indexOf('verify_scansci_candidate', workerStart);
  assert.ok(scansciBuild > 0 && scansciBuild < workerBuild, 'ScanSci images must build before Worker/Parser');
  assert.ok(scansciStart > 0 && scansciStart < workerStart, 'ScanSci must start before Agent Worker');
  assert.ok(runtimeVerify > scansciStart && runtimeVerify < workerStart, 'ScanSci runtime must verify before Agent Worker');
  assert.ok(postWorkerVerify > workerStart, 'ScanSci runtime must be reverified after Agent Worker convergence');
  assert.match(transactionSource, /verify_scansci_candidate 0 0/u);
  assert.match(transactionSource, /verify_scansci_candidate 1 1/u);
  assert.match(deploymentFunction('verify_scansci_candidate'), /--require-oa-canary '\$require_oa_canary'/u);
  assert.match(transactionSource, /docker ps -aq --filter 'label=com\.docker\.compose\.project=openscience-prod' --filter 'label=com\.docker\.compose\.service=scansci-auth'/u);

  const restore = deploymentFunction('transaction_restore_previous_scansci');
  assert.match(restore, /PREVIOUS_HAS_SCANSCI_BROWSER" -eq 1/u);
  assert.match(restore, /openscience-scansci-browser:\$exact_previous_sha[\s\S]*PREVIOUS_SCANSCI_BROWSER_IMAGE_ID/u);
  assert.match(restore, /transaction_restore_pre_browser_host_policy[\s\S]*scansci-browser-firewall\.sh[\s\S]*up -d --no-recreate --wait --wait-timeout 300 scansci-browser scansci-legal/u);
  assert.doesNotMatch(restore, /PREVIOUS_RELEASE_ROOT\/infra\/scripts\/prepare-scansci-browser-network\.sh/u);
  assert.match(restore, /previous_browser_id=.*ps -a -q scansci-browser[\s\S]*verify_prepared_browser_container_id "\$previous_browser_id"/u);
  assert.ok(
    restore.indexOf('up --no-start --force-recreate scansci-browser scansci-legal')
      < restore.indexOf('transaction_restore_pre_browser_host_policy'),
    'rollback must stop the candidate browser before removing its host firewall',
  );
  assert.ok(
    restore.indexOf('verify_browser_network_has_no_peers')
      < restore.indexOf('transaction_restore_pre_browser_host_policy'),
    'rollback must prove zero network peers before restoring the previous host policy',
  );
  assert.match(restore, /compose_current "rm -f -s scansci-browser"/u);
  assert.match(restore, /compose_current 'ps -a -q scansci-browser'/u);
  assert.match(restore, /transaction_restore_pre_browser_host_policy/u);
  assert.match(
    deploymentFunction('transaction_restore_pre_browser_host_policy'),
    /scansci-browser-firewall\.sh' remove[\s\S]*transaction_restore_exact_scansci_squid_preimage/u,
  );
  assert.ok(
    restore.indexOf('rm -f -s scansci-browser') < restore.indexOf('up -d --force-recreate --wait --wait-timeout 300 scansci-legal'),
    'schema 4 to schema 3 rollback must remove the candidate browser before restoring legal',
  );
});

test('ScanSci rollback restores a previous schema 5 official MCP release', () => {
  assert.match(transactionSource, /PREVIOUS_SCANSCI_MCP_IMAGE_ID=""/u);
  assert.match(transactionSource, /3\|4\|5\)/u);
  assert.match(
    transactionSource,
    /PREVIOUS_CAPABILITY_SCHEMA" = 5[\s\S]*read_capability_value "\$PREVIOUS_CAPABILITIES_FILE" scansci_mcp_image_id/u,
  );
  const restore = deploymentFunction('transaction_restore_previous_scansci');
  assert.match(
    restore,
    /PREVIOUS_CAPABILITY_SCHEMA" = 5[\s\S]*openscience-scansci-mcp:\$exact_previous_sha[\s\S]*up -d --force-recreate --wait --wait-timeout 300 scansci-mcp/u,
  );
  assert.match(
    restore,
    /verify-scansci-mcp-runtime\.mjs[\s\S]*--require-worker 0[\s\S]*--require-oa 0/u,
  );
  assert.match(
    transactionSource,
    /if \[ "\$PREVIOUS_CAPABILITY_SCHEMA" = 4 \]; then[\s\S]*elif \[ "\$PREVIOUS_CAPABILITY_SCHEMA" = 3 \] && run_remote "grep -q '\^  scansci-browser:'/u,
  );
});

test('candidate capability stays absent through prepublication and is exact-cleaned on either publish failure boundary', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-candidate-capability-'));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const oldSha = 'a'.repeat(40);
  const candidateSha = 'b'.repeat(40);
  const statePath = transactionStatePath.replaceAll('\\', '/');
  const run = async (name, mode) => {
    const fixture = join(root, name);
    const remote = join(fixture, 'remote');
    const capabilities = join(remote, '.release-capabilities');
    await mkdir(capabilities, { recursive: true });
    await writeFile(join(remote, '.release-id'), `${oldSha}\n`);
    const shell = [
      'set -eEuo pipefail',
      `source '${statePath}'`,
      `REMOTE_ROOT='${remote.replaceAll('\\', '/')}'`,
      `RELEASE_CAPABILITIES_DIR='${capabilities.replaceAll('\\', '/')}'`,
      `RELEASE_SHA='${candidateSha}'`, `PREVIOUS_RELEASE_SHA='${oldSha}'`,
      `DEPLOY_JOURNAL='${join(remote, '.deploy-transaction').replaceAll('\\', '/')}'`,
      `XGS_TEST_PUBLISH_MODE='${mode}'`,
      'CANDIDATE_CAPABILITY="$RELEASE_CAPABILITIES_DIR/$RELEASE_SHA"',
      'transaction_assert_lock(){ :; }',
      'transaction_journal_start(){ : > "$DEPLOY_JOURNAL"; }',
      'transaction_journal_update(){ printf "%s\\n" "$1" > "$DEPLOY_JOURNAL"; }',
      'transaction_journal_clear(){ rm -- "$DEPLOY_JOURNAL"; }',
      'transaction_journal_clear_after_rollback(){ [ ! -e "$DEPLOY_JOURNAL" ] || rm -- "$DEPLOY_JOURNAL"; }',
      'transaction_abort_rollback_intent(){ :; }',
      'transaction_perform_application_rollback(){ printf "%s\\n" "$PREVIOUS_RELEASE_SHA" > "$REMOTE_ROOT/.release-id"; }',
      'transaction_cleanup_candidate_capability(){ [ "$(cat "$REMOTE_ROOT/.release-id")" = "$PREVIOUS_RELEASE_SHA" ]; rm -f -- "$CANDIDATE_CAPABILITY" "$CANDIDATE_CAPABILITY.next"; }',
      'transaction_publish_capability_and_cas(){ [ ! -e "$CANDIDATE_CAPABILITY" ]; printf "schema=3\\n" > "$CANDIDATE_CAPABILITY.next"; mv "$CANDIDATE_CAPABILITY.next" "$CANDIDATE_CAPABILITY"; [ "$XGS_TEST_PUBLISH_MODE" != before-cas ] || return 65; [ "$(cat "$REMOTE_ROOT/.release-id")" = "$PREVIOUS_RELEASE_SHA" ]; printf "%s\\n" "$RELEASE_SHA" > "$REMOTE_ROOT/.release-id"; }',
      'transaction_initialize_state', 'transaction_install_traps', 'transaction_begin',
      'transaction_mark_phase switching', '[ ! -e "$CANDIDATE_CAPABILITY" ]',
      'transaction_publish_candidate',
      '[ "$XGS_TEST_PUBLISH_MODE" != after-publish ] || false',
      'transaction_commit',
    ].join('\n');
    const result = spawnSync(bash, ['-c', shell], { encoding: 'utf8' });
    return { result, remote, capability: join(capabilities, candidateSha) };
  };

  const success = await run('success', 'success');
  assert.equal(success.result.status, 0, success.result.stderr);
  assert.equal((await readFile(join(success.remote, '.release-id'), 'utf8')).trim(), candidateSha);
  assert.equal(await readFile(success.capability, 'utf8'), 'schema=3\n');

  for (const mode of ['before-cas', 'after-publish']) {
    const failed = await run(mode, mode);
    assert.notEqual(failed.result.status, 0, `${mode} unexpectedly succeeded`);
    assert.equal((await readFile(join(failed.remote, '.release-id'), 'utf8')).trim(), oldSha);
    assert.equal(existsSync(failed.capability), false, `${mode} left a candidate capability sidecar`);
    assert.equal(existsSync(`${failed.capability}.next`), false, `${mode} left a candidate capability staging file`);
  }
});

test('protected rollback sidecar survives candidate rejection and cleanup byte-for-byte', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-protected-capability-'));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const activeSha = 'a'.repeat(40);
  const protectedSha = 'b'.repeat(40);
  const remote = join(root, 'remote');
  const capabilities = join(remote, '.release-capabilities');
  const activeMarker = join(remote, '.release-id');
  const rollbackMarker = join(remote, '.rollback-id');
  const protectedSidecar = join(capabilities, protectedSha);
  await mkdir(capabilities, { recursive: true });
  await writeFile(activeMarker, `${activeSha}\n`);
  await writeFile(rollbackMarker, `${protectedSha}\n`);
  await writeFile(protectedSidecar, 'schema=3\nprotected=rollback\n');

  const shell = [
    'set -eEuo pipefail',
    `REMOTE_ROOT='${remote.replaceAll('\\', '/')}'`,
    `RELEASE_CAPABILITIES_DIR='${capabilities.replaceAll('\\', '/')}'`,
    `RELEASE_SHA='${protectedSha}'`,
    `PREVIOUS_RELEASE_SHA='${activeSha}'`,
    'run_remote(){ bash -c "$1"; }',
    deploymentFunction('transaction_prepare_candidate_capability'),
    deploymentFunction('transaction_cleanup_candidate_capability'),
    'if transaction_prepare_candidate_capability; then exit 99; fi',
    'transaction_cleanup_candidate_capability',
  ].join('\n');
  const result = spawnSync(bash, ['-c', shell], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(activeMarker, 'utf8'), `${activeSha}\n`);
  assert.equal(await readFile(rollbackMarker, 'utf8'), `${protectedSha}\n`);
  assert.equal(await readFile(protectedSidecar, 'utf8'), 'schema=3\nprotected=rollback\n');
});

test('failed candidate CAS cleans only the sidecar created by the real publish path', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-owned-capability-'));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const activeSha = 'a'.repeat(40);
  const candidateSha = 'b'.repeat(40);
  const remote = join(root, 'remote');
  const releaseRoot = join(root, 'release');
  const capabilities = join(remote, '.release-capabilities');
  const helper = join(releaseRoot, 'infra', 'scripts', 'production-deploy-lock.mjs');
  await mkdir(capabilities, { recursive: true });
  await mkdir(join(releaseRoot, 'infra', 'scripts'), { recursive: true });
  await writeFile(join(remote, '.release-id'), `${activeSha}\n`);
  await writeFile(helper, 'process.exitCode = 65;\n');

  const publish = deploymentFunction('transaction_publish_capability_and_cas')
    .replaceAll('/usr/bin/node', 'node');
  const shell = [
    'set -eEuo pipefail',
    `REMOTE_ROOT='${remote.replaceAll('\\', '/')}'`,
    `RELEASE_ROOT='${releaseRoot.replaceAll('\\', '/')}'`,
    `RELEASE_CAPABILITIES_DIR='${capabilities.replaceAll('\\', '/')}'`,
    `RELEASE_SHA='${candidateSha}'`, `ROLLBACK_SHA='${activeSha}'`,
    `PREVIOUS_RELEASE_SHA='${activeSha}'`,
    `BGE_M3_DEPLOY_VALUE='false'`, `BGE_M3_ENABLED_VALUE='false'`,
    `BGE_M3_MODEL_VERSION_ID=''`, `BGE_M3_MODEL_REVISION=''`,
    `BGE_M3_SOURCE_SHA256=''`, `BGE_M3_PACKAGE_FREEZE_SHA256=''`, `BGE_M3_MODEL_MANIFEST_SHA256=''`,
    `FINAL_SCANSCI_IMAGE_ID='sha256:${'c'.repeat(64)}'`,
    `FINAL_SCANSCI_BROWSER_IMAGE_ID='sha256:${'d'.repeat(64)}'`,
    `FINAL_SCANSCI_MCP_IMAGE_ID='sha256:${'f'.repeat(64)}'`,
    `FINAL_SCANSCI_AUTH_IMAGE_ID='sha256:${'e'.repeat(64)}'`,
    'UPSTREAM_SCANSCI=1',
    'run_remote(){ bash -c "$1"; }',
    deploymentFunction('transaction_prepare_candidate_capability'),
    publish,
    deploymentFunction('transaction_cleanup_candidate_capability'),
    'transaction_prepare_candidate_capability',
    'if transaction_publish_capability_and_cas; then exit 99; fi',
    '[ "$CANDIDATE_CAPABILITY_CREATED" -eq 1 ]',
    'transaction_cleanup_candidate_capability',
    '[ ! -e "$RELEASE_CAPABILITIES_DIR/$RELEASE_SHA" ]',
    '[ ! -e "$CANDIDATE_CAPABILITY_STAGING" ]',
  ].join('\n');
  const result = spawnSync(bash, ['-c', shell], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('SSH runner does not misclassify a remote permission error as key authentication failure', () => {
  assert.match(sshRun, /\[ \$rc -eq 255 \]/u);
  assert.match(sshRun, /permission denied \\?\([^)]*(?:publickey|password|keyboard-interactive)[^)]*\\?\)/iu);
  assert.doesNotMatch(sshRun, /permission denied\|host key verification/iu);
});

function waitForStreamMatch(stream, pattern, label, timeoutMs = 5000) {
  return new Promise((resolvePromise, rejectPromise) => {
    let output = '';
    const finish = (error) => {
      clearTimeout(timeout);
      stream.off('data', onData);
      stream.off('end', onEnd);
      stream.off('error', onError);
      if (error) rejectPromise(error);
      else resolvePromise(output);
    };
    const onData = (chunk) => {
      output += chunk.toString();
      if (pattern.test(output)) finish();
    };
    const onEnd = () => finish(new Error(`${label} stream ended before ${pattern}; output=${JSON.stringify(output)}`));
    const onError = (error) => finish(error);
    const timeout = setTimeout(
      () => finish(new Error(`${label} timed out before ${pattern}; output=${JSON.stringify(output)}`)),
      timeoutMs,
    );
    stream.on('data', onData);
    stream.once('end', onEnd);
    stream.once('error', onError);
  });
}

test('Tesseract is packaged only in the isolated document parser image', () => {
  assert.doesNotMatch(workerDockerfile, /tesseract(?:-ocr)?/i);
  assert.match(parserDockerfile, /tesseract-ocr/);
  assert.match(parserDockerfile, /USER node/);
  assert.match(workerDockerfile, /LABEL org\.openscience\.source=\$XGS_RELEASE_IMAGE_TAG/);
  assert.match(parserDockerfile, /LABEL org\.openscience\.source=\$XGS_RELEASE_IMAGE_TAG/);
  const releaseImages = `${composeService('agent-worker', 'scansci-mcp')}\n${composeService('document-parser', 'embedding-model-init')}`;
  assert.equal(releaseImages.match(/XGS_RELEASE_IMAGE_TAG: \$\{XGS_RELEASE_IMAGE_TAG:\?XGS_RELEASE_IMAGE_TAG required\}/g)?.length, 2);
});

test('production search runtime is isolated, bounded and source locked', () => {
  const api = productionCompose.split('\n  api:')[1]?.split('\n  malware-scanner:')[0] ?? '';
  const agentWorker = productionCompose.split('\n  agent-worker:')[1]?.split('\n  document-parser:')[0] ?? '';
  const embeddingInit = productionCompose.split('\n  embedding-model-init:')[1]?.split('\n  embedding-worker:')[0] ?? '';
  const embeddingWorker = productionCompose.split('\n  embedding-worker:')[1]?.split('\n  web:')[0] ?? '';
  assert.match(productionCompose, /embedding-model-init:/);
  assert.match(embeddingInit, /profiles:\s*\["embedding"\]/);
  assert.match(embeddingWorker, /profiles:\s*\["embedding"\]/);
  assert.match(embeddingWorker, /read_only: true/);
  assert.match(embeddingWorker, /user: "10001:10001"/);
  assert.match(embeddingWorker, /pids_limit: 128/);
  assert.match(embeddingWorker, /mem_limit: 6g/);
  assert.match(embeddingWorker, /cpus: 2/);
  assert.match(embeddingWorker, /cap_drop:[\s\S]*- ALL/);
  assert.match(embeddingWorker, /no-new-privileges:true/);
  assert.doesNotMatch(embeddingWorker, /env_file:|ports:|data_net/);
  assert.match(embeddingInit + embeddingWorker, /network: host/);
  assert.match(embeddingInit + embeddingWorker, /http:\/\/127\.0\.0\.1:7891/);
  assert.match(
    embeddingInit + embeddingWorker,
    /bge-m3-5617a9f61b028005a4858fdac845db406aefb181-08cc5a668e89:\/models\/bge-m3/,
  );
  assert.doesNotMatch(api, /embedding_net/);
  assert.doesNotMatch(agentWorker, /embedding-worker:\s*\n\s*condition:/);
  assert.match(productionCompose, /embedding_net:[\s\S]*internal: true/);
  assert.match(source, /build agent-worker document-parser/);
  assert.match(source, /EMBEDDING_DEPLOY=/);
  assert.match(source, /--profile embedding/);
  assert.match(source, /if \[ "\$EMBEDDING_DEPLOY" -eq 1 \]/);
  assert.match(source, /search migration status=2\/2/);
  assert.match(source, /embedding model manifest and runtime identity verified/);
});

test('embedding Python supply chain is complete, immutable and hash enforced', () => {
  const requirementLines = embeddingRequirements
    .split(/\r?\n/)
    .filter((line) => line !== '' && !line.startsWith('#') && !line.startsWith('--'));
  assert.ok(requirementLines.length >= 60, 'the complete resolved package set must be locked');
  assert.ok(requirementLines.every((line) => /--hash=sha256:[0-9a-f]{64}|#sha256=[0-9a-f]{64}/.test(line)));
  assert.match(embeddingDockerfile, /--require-hashes/);
  assert.match(embeddingDockerfile, /--no-deps/);
  assert.match(embeddingDockerfile, /--only-binary=:all:/);
  assert.doesNotMatch(embeddingEvaluatorDockerfile, /COPY --chmod/);
  assert.match(embeddingEvaluatorDockerfile, /RUN chmod 0555 \/app\/runner\.py/);
  assert.match(embeddingEvaluatorDockerfile, /ARG RUNTIME_IMAGE/);
  assert.match(embeddingEvaluatorDockerfile, /FROM \$\{RUNTIME_IMAGE\}/);
  assert.match(readFileSync(new URL('./evaluate-embedding-models.sh', import.meta.url), 'utf8'), /apps\/embedding-worker\/Dockerfile/);
});

test('database backup atomically publishes a private, single-flight dual-database set', () => {
  assert.match(backup, /umask 077/);
  assert.match(backup, /flock -n/);
  assert.match(backup, /install -d -m 0700/);
  assert.match(backup, /\.db-set-\$DATE\.[^\n]*\.staging/);
  assert.match(backup, /trap .*cleanup_db_stage/);
  assert.match(backup, /core\.sql/);
  assert.match(backup, /search\.sql/);
  assert.match(backup, /sha256sum/);
  assert.match(backup, /if ! RETAINED_SET_COUNT="\$\(count_retained_db_sets\)"/);
  assert.match(backup, /sets=\$\{RETAINED_SET_COUNT\}/);
  assert.doesNotMatch(backup, /sets=\$\{#DB_SETS\[@\]\}/);
  assert.ok(
    backup.indexOf('if ! RETAINED_SET_COUNT="$(count_retained_db_sets)"')
      > backup.indexOf('for set_name in "${DB_SETS[@]:$KEEP}"'),
    'retained backup sets must be enumerated after rotation',
  );
  assert.match(backup, /mv -- "\$STAGING_DIR" "\$FINAL_SET_DIR"/);
  assert.doesNotMatch(backup, /> "\$DUMP_DIR\/core-/);
  assert.doesNotMatch(backup, /> "\$DUMP_DIR\/search-/);
  assert.match(backup, /SEARCH_DATABASE_URL/);
  assert.doesNotMatch(backup, /echo[^\n]*(?:DATABASE_URL|POSTGRES_PASSWORD)/i);
  assert.match(backupRunbook, /db-set-<UTC>/);
  assert.match(backupRunbook, /sha256sum -c core\.sql\.sha256/);
  assert.match(backupRunbook, /sha256sum -c search\.sql\.sha256/);
  assert.match(backupRunbook, /核心库.*搜索库|core.*search/i);
  assert.match(backupRunbook, /DB_ADMIN_ROLE/);
  assert.doesNotMatch(backupRunbook, /-U openscience/);
  assert.match(backupRunbook, /set -euo pipefail/);
  assert.match(backupRunbook, /\^openscience_core_restore_\[a-z0-9\]\{8,40\}\$/);
  assert.match(backupRunbook, /\^openscience_search_restore_\[a-z0-9\]\{8,40\}\$/);
  assert.match(backupRunbook, /PROD_DATABASES/);
  assert.match(backupRunbook, /CORE_PROD_DB/);
  assert.match(backupRunbook, /SEARCH_PROD_DB/);
  assert.match(backupRunbook, /createdb --username="\$DB_ADMIN_ROLE" --/);
  assert.match(backupRunbook, /--dbname="\$CORE_RESTORE"/);
  assert.match(backupRunbook, /--dbname="\$SEARCH_RESTORE"/);
});

test('database backup retention inventory fails closed when its producer fails', () => {
  const inventoryFunction = backup.match(/count_retained_db_sets\(\) \{[\s\S]*?^\}/m)?.[0];
  assert.ok(inventoryFunction, 'backup must expose the exact retention inventory function under test');
  const result = spawnSync(bash, ['-c', `
set -euo pipefail
${inventoryFunction}
DUMP_DIR=/tmp
find() { printf '.\\n'; return 42; }
if count_retained_db_sets >/dev/null; then
  echo BACKUP_OK
else
  echo BACKUP_FAIL >&2
  exit 42
fi
`], { encoding: 'utf8' });
  assert.equal(result.status, 42, result.stderr);
  assert.doesNotMatch(result.stdout, /BACKUP_OK/);
  assert.match(result.stderr, /BACKUP_FAIL/);
});

test('embedding capability is strict, release-versioned and rollback-safe', () => {
  assert.match(source, /count=\\\$\(grep -c '\^\$\{key\}='/);
  assert.match(source, /read_prod_value BGE_M3_DEPLOY/);
  assert.match(source, /case "\$BGE_M3_DEPLOY_VALUE" in[\s\S]*true\)[\s\S]*false\)[\s\S]*\*\)/);
  assert.doesNotMatch(source, /BGE_M3_DEPLOY=\(true\|1\)/);
  assert.match(source, /schema=4/);
  for (const key of [
    'embedding_deploy',
    'bge_m3_enabled',
    'model_version_id',
    'model_revision',
    'source_sha256',
    'package_freeze_sha256',
    'model_manifest_sha256',
  ]) {
    assert.match(source, new RegExp(`${key}=`));
  }
  assert.match(source, /PREVIOUS_BGE_M3_MODEL_VERSION_ID/);
  assert.match(source, /PREVIOUS_BGE_M3_MODEL_REVISION/);
  assert.match(source, /PREVIOUS_BGE_M3_SOURCE_SHA256/);
  assert.match(source, /PREVIOUS_BGE_M3_PACKAGE_FREEZE_SHA256/);
  assert.match(source, /PREVIOUS_BGE_M3_MODEL_MANIFEST_SHA256/);
  assert.match(source, /PREVIOUS_RUNTIME_ENV[^\n]*BGE_M3_ENABLED/);
  assert.match(source, /PREVIOUS_RUNTIME_ENV[\s\S]*verify-embedding-runtime\.mjs/);
  assert.match(source, /capability sidecar 缺失/);
  assert.match(source, /grep -q '\^  embedding-worker:'/);
  assert.match(source, /PREVIOUS_CAPABILITY_STATE="\$\(run_remote "set -euo pipefail/);
  assert.match(source, /probe_status=\\\$\?/);
  assert.match(source, /\[ \\"\\\$probe_status\\" -eq 1 \]/);
  assert.match(source, /旧 release capability 探测失败/);
  assert.doesNotMatch(source, /elif run_remote "grep -q '\^  embedding-worker:'/);
  assert.match(source, /停止上一 release 的 embedding-worker/);
  assert.ok(
    source.indexOf('公网与精确 release 验收') < source.indexOf('停止上一 release 的 embedding-worker'),
    'disabled cleanup must only happen after public acceptance',
  );
  assert.match(source, /same_sha_verification_failed\(\)/);
  assert.match(source, /model_version_id="\$\(read_capability_value[^\n]+" \|\| return/);
  assert.match(source, /reason=same-sha-verification/);
  assert.match(source, /same-SHA disabled：收敛残留 embedding-worker/);
  assert.match(source, /services=\\\$\(XGS_RELEASE_ROOT=[^\n]+ps --status running --services\)/);
  assert.doesNotMatch(source, /ps --status running --services \| if grep -qx embedding-worker/);
  assert.ok(
    source.indexOf('expect_http_body https://OpenScience.428312321.xyz/__release "$RELEASE_SHA"')
      < source.indexOf('same-SHA disabled：收敛残留 embedding-worker'),
    'same-SHA cleanup must only happen after public identity verification',
  );
});

test('production compose up receives the same env file used by migrate and validation', () => {
  assert.match(
    source,
    /XGS_RELEASE_IMAGE_TAG=\$RELEASE_SHA SCANSCI_BROWSER_REQUIREMENTS_SHA256=\$SCANSCI_BROWSER_REQUIREMENTS_SHA256_VALUE docker compose --project-directory \$RELEASE_ROOT --env-file \$PROD_ENV -f \$COMPOSE_FILE \$1/,
  );
  assert.match(source, /compose_current "up -d --wait --wait-timeout 300 \$\{services\[\*\]\}"/);
  assert.match(source, /compose_current "run --rm --no-deps[^"]+verify-database-isolation\.mjs"/);
  assert.match(source, /compose_current "run --rm --no-deps[^"]+migrate-cli\.js deploy"/);
  assert.match(
    source,
    /compose_current "run --rm --no-deps[^"]+node_modules\/prisma\/build\/index\.js migrate deploy --schema \/opt\/openscience\/infra\/search\/schema\.prisma"/,
  );
  assert.match(source, /grep -q '\^SEARCH_DATABASE_URL=\.' \$PROD_ENV/);
  assert.match(source, /拒绝把搜索索引写入核心数据库/);
  assert.doesNotMatch(source, /-e (?:SEARCH_)?DATABASE_URL=/);
  assert.ok(
    source.indexOf('verify-database-isolation.mjs') < source.indexOf('migrate-cli.js deploy'),
    'database identity must be checked before the first migration',
  );
});

test('parser starts first and must become healthy before the worker is converged', () => {
  assert.match(source, /compose_current "build agent-worker document-parser"/);
  assert.match(
    source,
    /compose_current "up -d --force-recreate --wait --wait-timeout 300 document-parser"/,
  );
  assert.doesNotMatch(source, /restart api web agent-worker document-parser/);
  assert.match(source, /up -d --force-recreate --wait --wait-timeout 300 api web agent-worker/);
  assert.doesNotMatch(source, /wait_for_healthy\s*\n/);
});

test('deployment fails unless application health and public status checks pass', () => {
  assert.match(source, /wait_for_healthy api web agent-worker/);
  assert.match(source, /verify-embedding-runtime\.mjs/);
  assert.match(source, /expect_http_status .*auth\/me 401/);
  assert.doesNotMatch(source, /curl[^\n]+\|\| true/);
});

test('clean release uses the frozen lockfile and generates Prisma before compiling any workspace package', () => {
  const candidateBuild = 'cd $RELEASE_ROOT && with-proxy npx pnpm@9.15.0 install --ignore-scripts --frozen-lockfile && with-proxy npx pnpm@9.15.0 --filter @openscience/database generate && with-proxy npx pnpm@9.15.0 build';
  assert.ok(source.includes(candidateBuild));
  assert.doesNotMatch(source, /首次版本化发布|first-transition-adapter/);
});

test('deployment publishes and verifies the exact immutable release identity', () => {
  assert.match(source, /verify-release-source\.mjs" --root "\$PROJECT_ROOT" --ref "\$RELEASE_REF"/);
  assert.match(source, /cas-active --marker '\$REMOTE_ROOT\/\.release-id' --expected '\$ROLLBACK_SHA' --next '\$RELEASE_SHA' --lock-fd 9/);
  assert.match(source, /expect_http_body .*\/__release "\$RELEASE_SHA"/);
});

test('release source guard rejects dirty trees and refs other than HEAD', async () => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-release-guard-'));
  const guard = fileURLToPath(new URL('../../scripts/verify-release-source.mjs', import.meta.url));
  try {
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'gate@example.invalid'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'Release Gate'], { cwd: root });
    await writeFile(join(root, 'tracked.txt'), 'one\n');
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['commit', '-m', 'one'], { cwd: root, stdio: 'ignore' });
    const first = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    await writeFile(join(root, 'tracked.txt'), 'two\n');
    expectNonzero(spawnSync(process.execPath, [guard, '--root', root, '--ref', 'HEAD']));
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['commit', '-m', 'two'], { cwd: root, stdio: 'ignore' });
    const clean = spawnSync(process.execPath, [guard, '--root', root, '--ref', 'HEAD'], { encoding: 'utf8' });
    assert.equal(clean.status, 0, clean.stderr);
    assert.match(clean.stdout.trim(), /^[0-9a-f]{40}$/);
    expectNonzero(spawnSync(process.execPath, [guard, '--root', root, '--ref', first]));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('cloud sync materializes the complete commit in an immutable release directory', () => {
  assert.match(
    cloudSync,
    /\['-c', 'core\.autocrlf=false', 'archive', '--format=tar\.gz', releaseSha\]/,
  );
  assert.doesNotMatch(cloudSync, /\['archive', '--format=tar\.gz', releaseSha\]/);
  assert.match(cloudSync, /const releaseRoot = `\/opt\/openscience-releases\/\$\{releaseSha\}`/);
  assert.doesNotMatch(cloudSync, /process\.env\.XGS_RELEASE_ROOT/);
  assert.doesNotMatch(cloudSync, /ENTRIES|MANAGED_DIRS|MANAGED_FILES|--', \.\.\./);
  assert.match(source, /RELEASE_ROOT="\/opt\/openscience-releases\/\$RELEASE_SHA"/);
  assert.match(source, /XGS_RELEASE_ROOT=\$RELEASE_ROOT/);
  assert.doesNotMatch(source, /XGS_RELEASE_SHA="\$PREVIOUS_RELEASE_SHA" XGS_RELEASE_ROOT=/);
  assert.doesNotMatch(source, /XGS_RELEASE_SHA="\$RELEASE_SHA" XGS_RELEASE_ROOT=/);
  assert.match(productionCompose, /context: \$\{XGS_RELEASE_ROOT:\?XGS_RELEASE_ROOT required\}/);
  assert.match(productionCompose, /\$\{XGS_RELEASE_ROOT:\?XGS_RELEASE_ROOT required\}:\/opt\/openscience/);
  assert.match(productionCompose, /\$\{XGS_RELEASE_ROOT:\?XGS_RELEASE_ROOT required\}:\/opt\/openscience:ro/);
});

test('release materialization is write-once and cleans only a failed stage', async () => {
  const { buildReleaseMaterializeCommand } = await import('../../scripts/release-sync-command.mjs');
  const releaseRoot = `/opt/openscience-releases/${'a'.repeat(40)}`;
  const command = buildReleaseMaterializeCommand(releaseRoot, 'a'.repeat(40));
  assert.match(command, /\.release-source/);
  assert.match(command, /trap .*stage/);
  assert.match(command, /tar -tzf -/);
  assert.doesNotMatch(command, /active_release/);
  assert.match(command, /if \[ -d '[^']+' \]; then tar -tzf - >\/dev\/null; test[^\n]+release-input-manifest\.mjs' verify[^\n]+exit 0; fi/);
  assert.doesNotMatch(command, new RegExp(`rm -rf -- '${releaseRoot.replaceAll('/', '\\/')}'`));
  const parsed = spawnSync('bash', ['-n', '-c', command], { encoding: 'utf8' });
  assert.equal(parsed.status, 0, parsed.stderr);
  assert.throws(() => buildReleaseMaterializeCommand('/tmp/not-production', 'a'.repeat(40)));
});

test('deployment keeps an application rollback trap until public health succeeds', () => {
  assert.match(source, /--rollback-ref/);
  assert.match(source, /ROLLBACK_SHA=/);
  assert.match(source, /ACTIVE_RELEASE_SHA=.*\.release-id/);
  assert.match(source, /PREVIOUS_RELEASE_SHA="\$ACTIVE_RELEASE_SHA"/);
  assert.match(source, /transaction_rollback_application\(\)/);
  assert.match(source, /trap 'transaction_rollback_application \$\?' ERR/);
  assert.match(transactionStateSource, /trap - ERR EXIT HUP INT TERM/);
  assert.ok(
    transactionSource.lastIndexOf('transaction_commit') < transactionSource.lastIndexOf('部署完成'),
    'rollback traps remain installed until the final locked commit point',
  );
  assert.match(source, /ROLLBACK_FAILED/);
  assert.match(source, /ROLLBACK_COMPOSE_FILE="\$PREVIOUS_RELEASE_ROOT\/infra\/compose\/docker-compose\.prod\.yml"/);
  assert.match(source, /ROLLBACK_COMPOSE_MODE="previous-release"/);
  assert.doesNotMatch(source, /ROLLBACK_COMPOSE_MODE="first-transition-adapter"/);
  assert.match(source, /PREVIOUS_HAS_EMBEDDING=/);
  assert.match(source, /\.release-capabilities/);
  assert.match(source, /embedding_deploy=%s/);
  assert.match(source, /openscience-embedding-worker:\$PREVIOUS_RELEASE_SHA/);
  assert.match(source, /--profile embedding[^\n]+embedding-worker/);
  assert.match(source, /-f \$ROLLBACK_COMPOSE_FILE up -d --force-recreate/);
  assert.match(source, /rm -f \$REMOTE_ROOT\/\.release-id/);
  assert.match(source, /\.release-failed/);
  assert.match(source, /! -e "\$REMOTE_ROOT\/\.release-failed"/);
  assert.match(source, /云上缺少 active release identity，拒绝猜测 rollback/);
  assert.doesNotMatch(source, /systemctl reload nginx" \|\| exit 1/);
});

test('confirmed deployment materializes only an immutable candidate before the lock-in active check', () => {
  assert.match(source, /--require-parser-acceptance/);
  assert.match(source, /REQUIRE_PARSER_ACCEPTANCE=1/);
  assert.match(source, /--confirm[^\n]+--require-parser-acceptance|--require-parser-acceptance[^\n]+--confirm/);
  assert.match(source, /\[ "\$ROLLBACK_SHA" = "\$ACTIVE_RELEASE_SHA" \]/);
  const materialize = launcherSource.indexOf('node "$PROJECT_ROOT/scripts/cloud-sync.mjs"');
  const transactionSsh = launcherSource.indexOf("exec /bin/bash '$REMOTE_TRANSACTION_RUNNER'", materialize);
  const activeRead = transactionSource.indexOf('ACTIVE_RELEASE_SHA=');
  const rollbackMatch = transactionSource.indexOf('[ "$ROLLBACK_SHA" = "$ACTIVE_RELEASE_SHA" ]');
  const build = transactionSource.indexOf('npx pnpm@9.15.0 install', rollbackMatch);
  assert.ok(materialize >= 0 && transactionSsh > materialize, 'immutable materialization precedes the one transaction SSH');
  assert.ok(activeRead >= 0 && rollbackMatch > activeRead, 'active identity must be read before rollback comparison');
  assert.ok(build > rollbackMatch, 'wrong rollback must block before package/image build');
  assert.doesNotMatch(
    transactionSource,
    /\$SCRIPT_DIR\/release-input-manifest\.mjs/,
    'the source verifier lives under the immutable release root scripts directory',
  );
});

test('one foreground SSH runs the complete transaction under its own inherited FD9', () => {
  const runRemote = transactionSource.match(/run_remote\(\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.equal((launcherSource.match(/^ssh /gm) ?? []).length, 1);
  assert.match(launcherSource, /exec \/bin\/bash '\$REMOTE_TRANSACTION_RUNNER'[^\n]+<\/dev\/null/);
  assert.doesNotMatch(launcherSource, /\| ssh |bash -s/);
  assert.match(transactionSource, /exec 9<>/);
  assert.match(transactionSource, /flock -n -E 73 9/);
  assert.match(runRemote, /bash -c/);
  assert.doesNotMatch(runRemote, /\bssh\b/);
  assert.doesNotMatch(source, /coproc|DEPLOY_LOCK_ASSERT_COMMAND|lock-command|assert-command/);
  assert.doesNotMatch(transactionSource, /release-contract-test|TRANSACTION_TEST|XGS_TEST/);
  assert.match(transactionSource, /\[ "\$#" -eq 3 \]/);
  assert.doesNotMatch(transactionStateSource, /release-contract-test|TRANSACTION_TEST|XGS_TEST|^\s*\[ "\$#"/m);
  const manifestVerify = transactionSource.indexOf('release-input-manifest.mjs" verify');
  const stateSource = transactionSource.indexOf('source "$SCRIPT_DIR/production-deploy-transaction-state.sh"');
  assert.ok(manifestVerify >= 0 && stateSource > manifestVerify, 'state module loads only after locked source verification');
  assert.match(transactionSource, /cas-active[^\n]+--lock-fd 9/);
  assert.match(transactionSource, /journal-start[\s\S]*journal-update[\s\S]*journal-clear/);
});

function transactionLockHarness(lockDirectory, requiredUid, body) {
  const acquire = transactionSource.match(/acquire_production_deploy_lock\(\) \{[\s\S]*?\n\}/)?.[0] ?? '';
  const assertion = transactionSource.match(/assert_production_deploy_lock\(\) \{[\s\S]*?\n\}/)?.[0] ?? '';
  const functions = `${acquire}\n${assertion}`.replaceAll('[ "$1" = 0 ]', `[ "$1" = ${requiredUid} ]`);
  return [
    'set -eEuo pipefail',
    `DEPLOY_LOCK_DIRECTORY='${lockDirectory}'`,
    `DEPLOY_LOCK_PATH='${lockDirectory}/lock'`,
    functions,
    'acquire_production_deploy_lock',
    'assert_production_deploy_lock',
    body,
  ].join('\n');
}

function transactionStateHarness(root, requiredUid, phase, event) {
  const acquire = transactionSource.match(/acquire_production_deploy_lock\(\) \{[\s\S]*?\n\}/)?.[0] ?? '';
  const assertion = transactionSource.match(/assert_production_deploy_lock\(\) \{[\s\S]*?\n\}/)?.[0] ?? '';
  const lockFunctions = `${acquire}\n${assertion}`.replaceAll('[ "$1" = 0 ]', `[ "$1" = ${requiredUid} ]`);
  const quote = (value) => `'${value.replaceAll("'", "'\"'\"'")}'`;
  return [
    'set -eEuo pipefail',
    `TEST_ROOT=${quote(root)}`,
    'REMOTE_ROOT="$TEST_ROOT/remote"',
    'RELEASE_ROOT="$TEST_ROOT/release"',
    'PROD_ENV="$TEST_ROOT/prod.env"',
    'COMPOSE_FILE="$TEST_ROOT/compose.yml"',
    'DEPLOY_LOCK_DIRECTORY="$TEST_ROOT/lock-private"',
    'DEPLOY_LOCK_PATH="$DEPLOY_LOCK_DIRECTORY/lock"',
    'DEPLOY_JOURNAL="$REMOTE_ROOT/.deploy-transaction.json"',
    `TRANSACTION_PHASE_UNDER_TEST=${quote(phase)}`,
    `TRANSACTION_EVENT_UNDER_TEST=${quote(event)}`,
    `RELEASE_SHA=${quote('b'.repeat(40))}`,
    `ROLLBACK_SHA=${quote('a'.repeat(40))}`,
    'PREVIOUS_RELEASE_SHA="$ROLLBACK_SHA"',
    'ACTIVE_RELEASE_SHA="$RELEASE_SHA"',
    'EMBEDDING_DEPLOY=0',
    `SCANSCI_BROWSER_REQUIREMENTS_SHA256_VALUE=${quote('0'.repeat(64))}`,
    lockFunctions,
    'transaction_assert_lock() { assert_production_deploy_lock; }',
    'transaction_journal_start() { [ ! -e "$DEPLOY_JOURNAL" ] || return 75; printf "phase=prepared\\n" > "$DEPLOY_JOURNAL.next"; chmod 0600 "$DEPLOY_JOURNAL.next"; mv "$DEPLOY_JOURNAL.next" "$DEPLOY_JOURNAL"; }',
    'transaction_journal_update() { [ -f "$DEPLOY_JOURNAL" ] || return 75; printf "phase=%s\\n" "$1" > "$DEPLOY_JOURNAL.next"; chmod 0600 "$DEPLOY_JOURNAL.next"; mv "$DEPLOY_JOURNAL.next" "$DEPLOY_JOURNAL"; }',
    'transaction_journal_clear() { if [ "${XGS_TEST_TERM_DURING_CLEAR:-0}" = 1 ]; then kill -TERM $$; fi; rm -- "$DEPLOY_JOURNAL"; [ "${XGS_TEST_CLEAR_AFTER_UNLINK_FAIL:-0}" != 1 ] || return 70; }',
    'transaction_journal_clear_after_rollback() { [ ! -e "$DEPLOY_JOURNAL" ] || transaction_journal_clear; }',
    'transaction_perform_application_rollback() { active="$(cat "$REMOTE_ROOT/.release-id")"; case "$active" in "$ROLLBACK_SHA"|"$RELEASE_SHA") ;; *) echo ROLLBACK_FAILED_STALE_ACTIVE >&2; return 70 ;; esac; printf "ROLLBACK_IN_LOCK\\n" >&2; if [ "${XGS_TEST_ROLLBACK_DELAY:-0}" != 0 ]; then sleep "$XGS_TEST_ROLLBACK_DELAY"; fi; [ "${XGS_TEST_ROLLBACK_FAIL:-0}" != 1 ] || return 70; printf "%s\\n" "$ROLLBACK_SHA" > "$REMOTE_ROOT/.release-id"; }',
    'transaction_cleanup_candidate_capability() { :; }',
    'transaction_abort_rollback_intent() { [ ! -e "$REMOTE_ROOT/.rollback-id.pending" ] || { [ "${XGS_TEST_PENDING_ABORT_FAIL:-0}" != 1 ] || return 70; rm -- "$REMOTE_ROOT/.rollback-id.pending"; }; }',
    `source ${quote(transactionStatePath.replaceAll('\\', '/'))}`,
    'mkdir -p "$REMOTE_ROOT" "$RELEASE_ROOT"',
    'acquire_production_deploy_lock',
    'assert_production_deploy_lock',
    'transaction_initialize_state',
    'transaction_install_traps',
    '[ ! -e "$DEPLOY_JOURNAL" ] || exit 75',
    'if [ "$TRANSACTION_EVENT_UNDER_TEST" = already-active ]; then',
    '  require_match() { [[ "$2" =~ $3 ]]; }',
    '  log() { printf "%s\\n" "$*"; }',
    '  run_remote() { case "$1" in *"cat \'$RELEASE_ROOT/.release-source\'"*) [ "${XGS_TEST_SAME_SHA_FAILURE:-}" != source ] ;; *"docker image inspect --format=\'{{.Id}}\' openscience-agent-worker"*) if [ "${XGS_TEST_SAME_SHA_FAILURE:-}" = tag ]; then printf "sha256:bad\\n"; else printf "sha256:%064d\\n" 0; fi ;; *"docker image inspect --format=\'{{.Id}}\' openscience-document-parser"*) printf "sha256:%064d\\n" 1 ;; *verify-document-parser-acceptance.mjs*) printf called > "$TEST_ROOT/formal-verifier-called"; case "${XGS_TEST_SAME_SHA_FAILURE:-}" in report|runtime) return 65 ;; esac ;; *"docker inspect --format=\'{{.Image}}\'"*111111111111*) if [ "${XGS_TEST_SAME_SHA_FAILURE:-}" = running ]; then printf "sha256:%064d\\n" 9; else printf "sha256:%064d\\n" 0; fi ;; *"docker inspect --format=\'{{.Image}}\'"*222222222222*) printf "sha256:%064d\\n" 1 ;; *production-deploy-lock.mjs*verify-state*) [ "${XGS_TEST_SAME_SHA_FAILURE:-}" != running ] ;; *"ps --status running --services"*) printf "\\n" ;; *) return 0 ;; esac; }',
    '  compose_current() { case "$1" in "ps -q agent-worker") printf "111111111111\\n" ;; "ps -q document-parser") printf "222222222222\\n" ;; *) return 0 ;; esac; }',
    '  compose_embedding_current() { return 0; }',
    '  verify_release_capability() { [ "${XGS_TEST_SAME_SHA_FAILURE:-}" != capability ]; }',
    '  verify_scansci_current() { [ "${XGS_TEST_SAME_SHA_FAILURE:-}" != scansci ]; }',
    '  expect_http_status() { [ "${XGS_TEST_SAME_SHA_FAILURE:-}" != public ]; }',
    '  expect_http_body() { [ "${XGS_TEST_SAME_SHA_FAILURE:-}" != public ]; }',
    '  transaction_verify_already_active_release',
    '  printf "ALREADY_ACTIVE_OK\\n"',
    '  exit 0',
    'fi',
    '[ -e "$REMOTE_ROOT/.release-id" ] || printf "%s\\n" "$ROLLBACK_SHA" > "$REMOTE_ROOT/.release-id"',
    'transaction_begin',
    'case "$TRANSACTION_PHASE_UNDER_TEST" in migrating) transaction_mark_phase migrating ;; switching) transaction_mark_phase switching; printf "%s\\n" "$RELEASE_SHA" > "$REMOTE_ROOT/.release-id" ;; published) transaction_mark_phase switching; printf "%s\\n" "$RELEASE_SHA" > "$REMOTE_ROOT/.release-id"; transaction_mark_phase published ;; esac',
    'if [ "${XGS_TEST_PENDING_INTENT:-0}" = 1 ]; then printf "pending\\n" > "$REMOTE_ROOT/.rollback-id.pending"; fi',
    'if [ -n "${XGS_TEST_FORCE_ACTIVE_SHA:-}" ]; then printf "%s\\n" "$XGS_TEST_FORCE_ACTIVE_SHA" > "$REMOTE_ROOT/.release-id"; fi',
    'case "$TRANSACTION_EVENT_UNDER_TEST" in stdin) bash -c "cat >/dev/null"; printf "AFTER_STDIN\\n"; transaction_commit ;; err) false ;; term) kill -TERM $$ ;; hup) kill -HUP $$ ;; exit) exit 42 ;; sigkill) printf "READY_FOR_SIGKILL\\n" >&2; sleep 30 ;; commit-term) XGS_TEST_TERM_DURING_CLEAR=1; transaction_commit; printf "COMMIT_SURVIVED_TERM\\n" ;; esac',
  ].join('\n');
}

test('production transaction lock is nonblocking and remains held throughout its payload', async (t) => {
  if (spawnSync(bash, ['-c', 'command -v flock >/dev/null 2>&1']).status !== 0) {
    t.skip('flock is unavailable in the local Git Bash; Linux CI executes this behavior gate');
    return;
  }
  const sandbox = await mkdtemp(join(tmpdir(), 'xgs-production-lock-'));
  const lockDirectory = join(sandbox, 'private').replaceAll('\\', '/');
  const requiredUid = process.getuid?.() ?? 0;
  const start = async () => {
    const child = spawn(bash, ['-c', transactionLockHarness(
      lockDirectory, requiredUid, 'printf "LOCKED\\n"; cat >/dev/null',
    )], { stdio: ['pipe', 'pipe', 'pipe'] });
    const [chunk] = await once(child.stdout, 'data');
    assert.equal(chunk.toString().trim(), 'LOCKED');
    return child;
  };
  try {
    const missingFlock = spawnSync(bash, ['-c', transactionLockHarness(
      lockDirectory, requiredUid, ':',
    )], { encoding: 'utf8', env: { ...process.env, PATH: sandbox } });
    assert.equal(missingFlock.error, undefined, 'absolute Bash path must survive the missing-flock PATH fixture');
    assert.equal(missingFlock.status, 69, missingFlock.stderr);
    const first = await start();
    for (const attempt of [1, 2]) {
      const blocked = spawnSync(bash, ['-c', transactionLockHarness(
        lockDirectory, requiredUid, `printf 'unexpected-${attempt}\\n'`,
      )], { encoding: 'utf8' });
      assert.equal(blocked.status, 73, blocked.stderr);
    }
    first.stdin.end();
    const [status] = await once(first, 'exit');
    assert.equal(status, 0);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test('production transaction lock rejects pre-positioned directory and lock symlinks without truncating targets', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Linux ownership and no-follow semantics are enforced by this gate');
    return;
  }
  const sandbox = await mkdtemp(join(tmpdir(), 'xgs-production-lock-symlink-'));
  const requiredUid = process.getuid();
  const target = join(sandbox, 'sentinel');
  const privatePath = join(sandbox, 'private');
  try {
    await mkdir(target);
    await writeFile(join(target, 'unchanged'), 'sentinel\n');
    await symlink(target, privatePath, 'dir');
    let rejected = spawnSync(bash, ['-c', transactionLockHarness(privatePath, requiredUid, ':')], { encoding: 'utf8' });
    assert.equal(rejected.status, 71, rejected.stderr);
    assert.equal(await readFile(join(target, 'unchanged'), 'utf8'), 'sentinel\n');

    await rm(privatePath);
    await mkdir(privatePath, { mode: 0o700 });
    await chmod(privatePath, 0o700);
    const outsideOwner = join(sandbox, 'outside-lock');
    await writeFile(outsideOwner, 'do-not-truncate\n');
    await symlink(outsideOwner, join(privatePath, 'lock'));
    rejected = spawnSync(bash, ['-c', transactionLockHarness(privatePath, requiredUid, ':')], { encoding: 'utf8' });
    assert.equal(rejected.status, 71, rejected.stderr);
    assert.equal(await readFile(outsideOwner, 'utf8'), 'do-not-truncate\n');
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test('terminating the transaction connection process group stops its in-lock payload', async (t) => {
  if (spawnSync(bash, ['-c', 'command -v flock >/dev/null 2>&1']).status !== 0) {
    t.skip('flock is unavailable in the local Git Bash; Linux CI executes this behavior gate');
    return;
  }
  const sandbox = await mkdtemp(join(tmpdir(), 'xgs-production-lock-death-'));
  const lockDirectory = join(sandbox, 'private').replaceAll('\\', '/');
  const requiredUid = process.getuid?.() ?? 0;
  const unsafeMarker = join(sandbox, 'unsafe').replaceAll('\\', '/');
  const child = spawn(bash, ['-c', transactionLockHarness(
    lockDirectory,
    requiredUid,
    `printf 'PAYLOAD_STARTED\\n' >&2; sleep 2; printf unsafe > '${unsafeMarker}'`,
  )], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  try {
    const [chunk] = await once(child.stderr, 'data');
    assert.match(chunk.toString(), /PAYLOAD_STARTED/);
    const childExit = once(child, 'exit');
    process.kill(-child.pid, 'SIGTERM');
    await childExit;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2200));
    assert.equal(existsSync(unsafeMarker), false);
    const replacement = spawnSync(bash, ['-c', transactionLockHarness(
      lockDirectory, requiredUid, ':',
    )], { encoding: 'utf8' });
    assert.equal(replacement.status, 0, replacement.stderr);
  } finally {
    try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    await rm(sandbox, { recursive: true, force: true });
  }
});

test('durable journal and active CAS stay on inherited FD9 across crash and TERM recovery', async (t) => {
  if (process.platform === 'win32'
    || spawnSync(bash, ['-c', 'command -v flock >/dev/null 2>&1']).status !== 0) {
    t.skip('Linux CI executes the real inherited-FD, signal and durable-journal gate');
    return;
  }
  const sandbox = await mkdtemp(join(tmpdir(), 'xgs-production-journal-'));
  const lockDirectory = join(sandbox, 'private').replaceAll('\\', '/');
  const journalPath = join(sandbox, 'journal.json').replaceAll('\\', '/');
  const markerPath = join(sandbox, '.release-id').replaceAll('\\', '/');
  const helperPath = join(sandbox, 'journal-helper.mjs').replaceAll('\\', '/');
  const utilityUrl = new URL('./production-deploy-lock.mjs', import.meta.url).href;
  const requiredUid = process.getuid();
  const oldSha = 'a'.repeat(40);
  const newSha = 'b'.repeat(40);
  const helper = `
import {
  clearProductionDeployJournal,
  compareAndSwapActiveRelease,
  writeProductionDeployJournal,
} from ${JSON.stringify(utilityUrl)};
const [operation, lockDirectory, journalPath, markerPath, requiredUidText, candidateSha, rollbackSha] = process.argv.slice(2);
const common = { lockDirectory, requiredUid: Number(requiredUidText), lockFd: 9 };
try {
  if (operation === 'start') await writeProductionDeployJournal({ ...common, journalPath, candidateSha, rollbackSha, phase: 'prepared', create: true });
  else if (operation === 'clear') await clearProductionDeployJournal({ ...common, journalPath, candidateSha, rollbackSha });
  else if (operation === 'cas') await compareAndSwapActiveRelease({ ...common, markerPath, expectedSha: rollbackSha, nextSha: candidateSha });
  else throw new Error('unknown helper operation');
} catch (error) {
  console.error(error.message);
  process.exitCode = 65;
}
`;
  const invoke = (operation, candidate = newSha, rollback = oldSha) => (
    `node '${helperPath}' '${operation}' '${lockDirectory}' '${journalPath}' '${markerPath}' '${requiredUid}' '${candidate}' '${rollback}'`
  );
  try {
    await writeFile(helperPath, helper);
    await writeFile(markerPath, `${oldSha}\n`);

    let result = spawnSync(bash, ['-c', transactionLockHarness(
      lockDirectory, requiredUid, invoke('cas', newSha, 'c'.repeat(40)),
    )], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.equal((await readFile(markerPath, 'utf8')).trim(), oldSha);

    result = spawnSync(bash, ['-c', transactionLockHarness(
      lockDirectory,
      requiredUid,
      `${invoke('start')}; ${invoke('cas')}; ${invoke('clear')}`,
    )], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal((await readFile(markerPath, 'utf8')).trim(), newSha);
    assert.equal(existsSync(journalPath), false);

    result = spawnSync(process.execPath, [helperPath, 'cas', lockDirectory, journalPath,
      markerPath, String(requiredUid), oldSha, newSha], { encoding: 'utf8' });
    assert.notEqual(result.status, 0, 'CAS without inherited FD9 must fail closed');
    assert.equal((await readFile(markerPath, 'utf8')).trim(), newSha);

    const crash = spawn(bash, ['-c', transactionLockHarness(
      lockDirectory,
      requiredUid,
      `${invoke('start')}; printf 'JOURNAL_DURABLE\\n' >&2; sleep 30`,
    )], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let [chunk] = await once(crash.stderr, 'data');
    assert.match(chunk.toString(), /JOURNAL_DURABLE/);
    const crashExit = once(crash, 'exit');
    process.kill(-crash.pid, 'SIGKILL');
    await crashExit;
    assert.equal(existsSync(journalPath), true);
    result = spawnSync(bash, ['-c', transactionLockHarness(
      lockDirectory, requiredUid, `[ ! -e '${journalPath}' ] || exit 75`,
    )], { encoding: 'utf8' });
    assert.equal(result.status, 75, result.stderr);
    await rm(journalPath);

    await writeFile(markerPath, `${oldSha}\n`);
    const rollbackTrap = [
      `rollback_handler() { ${invoke('cas', oldSha, newSha)}; printf "ROLLBACK_IN_LOCK\\n" >&2; sleep 1; ${invoke('clear')}; exit 143; }`,
      'trap rollback_handler TERM',
      invoke('start'),
      invoke('cas'),
      'printf "SWITCHED\\n" >&2',
      'sleep 30',
    ].join('; ');
    const interrupted = spawn(bash, ['-c', transactionLockHarness(
      lockDirectory, requiredUid, rollbackTrap,
    )], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    [chunk] = await once(interrupted.stderr, 'data');
    assert.match(chunk.toString(), /SWITCHED/);
    const interruptedExit = once(interrupted, 'exit');
    const rollbackOutput = waitForStreamMatch(interrupted.stderr, /ROLLBACK_IN_LOCK/, 'TERM rollback');
    process.kill(-interrupted.pid, 'SIGTERM');
    assert.match(await rollbackOutput, /ROLLBACK_IN_LOCK/);
    const competitor = spawnSync(bash, ['-c', transactionLockHarness(
      lockDirectory, requiredUid, ':',
    )], { encoding: 'utf8' });
    assert.equal(competitor.status, 73, competitor.stderr);
    await interruptedExit;
    assert.equal((await readFile(markerPath, 'utf8')).trim(), oldSha);
    assert.equal(existsSync(journalPath), false);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test('shared production state machine traps every durable phase and commits without stdin or signal ambiguity', async (t) => {
  if (process.platform === 'win32'
    || spawnSync(bash, ['-c', 'command -v flock >/dev/null 2>&1']).status !== 0) {
    t.skip('Ubuntu CI executes the production state module with isolated test adapters');
    return;
  }
  const oldSha = 'a'.repeat(40);
  const candidateSha = 'b'.repeat(40);
  const staleSha = 'c'.repeat(40);
  const createFixture = async () => {
    const root = await mkdtemp('/tmp/xgs-production-transaction-test-');
    await chmod(root, 0o700);
    return {
      root,
      journal: join(root, 'remote', '.deploy-transaction.json'),
      marker: join(root, 'remote', '.release-id'),
    };
  };
  const requiredUid = process.getuid();
  const run = (fixture, phase, event, env = {}) => spawnSync(
    bash,
    ['-c', transactionStateHarness(fixture.root, requiredUid, phase, event)],
    { encoding: 'utf8', input: 'CONSUME_ME\n', env: { ...process.env, ...env } },
  );

  const fixtures = [];
  try {
    for (const phase of ['prepared', 'migrating', 'switching', 'published']) {
      for (const event of ['err', 'term', 'hup', 'exit']) {
        const fixture = await createFixture();
        fixtures.push(fixture.root);
        const result = run(fixture, phase, event);
        assert.notEqual(result.status, 0, `${phase}/${event} unexpectedly succeeded`);
        if (phase === 'migrating') {
          assert.equal(result.status, 70, result.stderr);
          assert.equal(existsSync(fixture.journal), true, `${phase}/${event} must retain its journal`);
        } else {
          assert.equal(existsSync(fixture.journal), false, `${phase}/${event} must close its journal`);
        }
        assert.equal((await readFile(fixture.marker, 'utf8')).trim(), oldSha);
      }
    }

    let fixture = await createFixture();
    fixtures.push(fixture.root);
    let result = run(fixture, 'switching', 'term', { XGS_TEST_ROLLBACK_FAIL: '1' });
    assert.equal(result.status, 70, result.stderr);
    assert.equal(existsSync(fixture.journal), true);
    assert.equal((await readFile(fixture.marker, 'utf8')).trim(), candidateSha);

    fixture = await createFixture();
    fixtures.push(fixture.root);
    result = run(fixture, 'switching', 'term', { XGS_TEST_FORCE_ACTIVE_SHA: staleSha });
    assert.equal(result.status, 70, result.stderr);
    assert.match(result.stderr, /ROLLBACK_FAILED_STALE_ACTIVE/);
    assert.equal(existsSync(fixture.journal), true);
    assert.equal((await readFile(fixture.marker, 'utf8')).trim(), staleSha);

    fixture = await createFixture();
    fixtures.push(fixture.root);
    result = run(fixture, 'published', 'term', { XGS_TEST_PENDING_INTENT: '1' });
    assert.notEqual(result.status, 0, result.stderr);
    assert.equal(existsSync(fixture.journal), false);
    assert.equal(existsSync(join(fixture.root, 'remote', '.rollback-id.pending')), false);
    assert.equal((await readFile(fixture.marker, 'utf8')).trim(), oldSha);

    fixture = await createFixture();
    fixtures.push(fixture.root);
    result = run(fixture, 'published', 'term', {
      XGS_TEST_PENDING_INTENT: '1',
      XGS_TEST_PENDING_ABORT_FAIL: '1',
    });
    assert.equal(result.status, 70, result.stderr);
    assert.equal(existsSync(fixture.journal), true);
    assert.equal(existsSync(join(fixture.root, 'remote', '.rollback-id.pending')), true);
    assert.equal((await readFile(fixture.marker, 'utf8')).trim(), oldSha);

    fixture = await createFixture();
    fixtures.push(fixture.root);
    result = run(fixture, 'published', 'stdin', {
      XGS_TEST_PENDING_INTENT: '1',
      XGS_TEST_CLEAR_AFTER_UNLINK_FAIL: '1',
    });
    assert.equal(result.status, 70, result.stderr);
    assert.equal(existsSync(fixture.journal), false);
    assert.equal(existsSync(join(fixture.root, 'remote', '.rollback-id.pending')), false);
    assert.equal((await readFile(fixture.marker, 'utf8')).trim(), oldSha);

    fixture = await createFixture();
    fixtures.push(fixture.root);
    await mkdir(join(fixture.root, 'remote'), { recursive: true });
    await writeFile(fixture.journal, 'unfinished\n');
    result = run(fixture, 'prepared', 'err');
    assert.equal(result.status, 75, result.stderr);
    assert.equal(await readFile(fixture.journal, 'utf8'), 'unfinished\n');

    fixture = await createFixture();
    fixtures.push(fixture.root);
    result = run(fixture, 'prepared', 'stdin');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /AFTER_STDIN/);
    assert.equal(existsSync(fixture.journal), false);

    for (const failure of ['', 'source', 'report', 'runtime', 'tag', 'running', 'capability', 'scansci', 'public']) {
      fixture = await createFixture();
      fixtures.push(fixture.root);
      result = run(fixture, 'prepared', 'already-active', failure ? { XGS_TEST_SAME_SHA_FAILURE: failure } : {});
      if (failure) {
        assert.notEqual(result.status, 0, `same-SHA ${failure} mismatch must fail closed`);
      } else {
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /ALREADY_ACTIVE_OK/);
      }
      assert.equal(
        existsSync(join(fixture.root, 'formal-verifier-called')),
        !['source', 'tag'].includes(failure),
        `same-SHA ${failure || 'success'} formal verifier reachability differs`,
      );
      assert.equal(existsSync(fixture.journal), false);
    }

    fixture = await createFixture();
    fixtures.push(fixture.root);
    result = run(fixture, 'published', 'commit-term');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /COMMIT_SURVIVED_TERM/);
    assert.equal(existsSync(fixture.journal), false);
    assert.equal((await readFile(fixture.marker, 'utf8')).trim(), candidateSha);

    fixture = await createFixture();
    fixtures.push(fixture.root);
    const interrupted = spawn(
      bash,
      ['-c', transactionStateHarness(fixture.root, requiredUid, 'switching', 'term')],
      { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, XGS_TEST_ROLLBACK_DELAY: '1' } },
    );
    const [rollbackChunk] = await once(interrupted.stderr, 'data');
    assert.match(rollbackChunk.toString(), /ROLLBACK_IN_LOCK/);
    const competitor = run(fixture, 'prepared', 'err');
    assert.equal(competitor.status, 73, competitor.stderr);
    await once(interrupted, 'exit');
    assert.equal(existsSync(fixture.journal), false);

    fixture = await createFixture();
    fixtures.push(fixture.root);
    const crashed = spawn(
      bash,
      ['-c', transactionStateHarness(fixture.root, requiredUid, 'switching', 'sigkill')],
      { stdio: ['ignore', 'pipe', 'pipe'], detached: true },
    );
    const [readyChunk] = await once(crashed.stderr, 'data');
    assert.match(readyChunk.toString(), /READY_FOR_SIGKILL/);
    const crashedExit = once(crashed, 'exit');
    process.kill(-crashed.pid, 'SIGKILL');
    await crashedExit;
    assert.equal(existsSync(fixture.journal), true);
    result = run(fixture, 'prepared', 'err');
    assert.equal(result.status, 75, result.stderr);
  } finally {
    for (const root of fixtures) await rm(root, { recursive: true, force: true });
  }
});

test('active release mutator rejects every call without the inherited production FD9', async () => {
  const { compareAndSwapActiveRelease } = await import('./production-deploy-lock.mjs');
  const sandbox = await mkdtemp(join(tmpdir(), 'xgs-active-cas-'));
  const markerPath = join(sandbox, '.release-id');
  const oldSha = 'a'.repeat(40);
  const newSha = 'b'.repeat(40);
  try {
    await writeFile(markerPath, `${oldSha}\n`);
    await assert.rejects(compareAndSwapActiveRelease({
      markerPath, expectedSha: 'c'.repeat(40), nextSha: newSha,
    }), /inherited production lock FD9/i);
    assert.equal((await readFile(markerPath, 'utf8')).trim(), oldSha);
    await assert.rejects(compareAndSwapActiveRelease({
      markerPath, expectedSha: oldSha, nextSha: newSha, lockFd: 8,
    }), /inherited production lock FD9/i);
    assert.equal((await readFile(markerPath, 'utf8')).trim(), oldSha);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test('confirmed deployment acquires the remote flock before reading active state and retains it through publication', () => {
  const execution = transactionSource.indexOf('=== 执行单一 SSH/flock');
  const acquire = transactionSource.indexOf('acquire_production_deploy_lock', execution);
  const activeRead = transactionSource.indexOf('ACTIVE_RELEASE_SHA=', acquire);
  const releasePublish = transactionSource.lastIndexOf('cas-active');
  const journalClear = transactionSource.lastIndexOf('transaction_commit');
  const releaseLock = transactionSource.lastIndexOf('exec 9>&-');
  assert.ok(execution >= 0 && acquire > execution && activeRead > acquire);
  assert.ok(releasePublish > activeRead && journalClear > releasePublish && releaseLock > journalClear);
  assert.match(transactionSource, /flock|production-deploy-lock\.mjs/);
  assert.match(transactionStateSource, /ROLLBACK_FAILED_LOCK_UNAVAILABLE/);
  assert.match(transactionStateSource, /trap 'transaction_rollback_application 129' HUP/);
  assert.match(transactionStateSource, /trap 'transaction_rollback_application 143' TERM/);
  assert.match(transactionStateSource, /trap 'transaction_on_exit' EXIT/);
  assert.match(transactionStateSource, /trap - ERR EXIT HUP INT TERM/);
});

test('production Compose operations pin the immutable release as project directory', () => {
  const transactionComposeCalls = transactionSource.match(/docker compose[^\n]*/gu) ?? [];
  assert.ok(transactionComposeCalls.length > 0, 'production transaction must contain Compose operations');
  for (const call of transactionComposeCalls) {
    assert.match(call, /--project-directory (?:\$RELEASE_ROOT|'\$RELEASE_ROOT'|\$PREVIOUS_RELEASE_ROOT)/u);
  }
  assert.match(
    transactionStateSource,
    /docker compose --project-directory '\$RELEASE_ROOT' --profile embedding/u,
  );
  assert.match(
    scansciRuntimeVerifierSource,
    /const composeArgs = \[\s*'compose', '--project-directory', releaseRoot,\s*'--env-file'/u,
  );
});

test('final parser acceptance report and exact image IDs are verified after build and before switch', () => {
  const imageBuild = source.indexOf('compose_current "build agent-worker document-parser"');
  const workerImage = source.indexOf('openscience-agent-worker:$RELEASE_SHA', imageBuild);
  const parserImage = source.indexOf('openscience-document-parser:$RELEASE_SHA', imageBuild);
  const report = source.indexOf('/opt/openscience-acceptance/document-parser/$RELEASE_SHA/report.json', imageBuild);
  const verifier = source.indexOf('verify-document-parser-acceptance.mjs', imageBuild);
  const switchBoundary = transactionSource.indexOf('transaction_mark_phase switching', imageBuild);
  assert.ok(imageBuild >= 0, 'exact worker/parser images must be built');
  assert.ok(workerImage > imageBuild && parserImage > imageBuild, 'final exact image IDs must be inspected after build');
  assert.ok(report > imageBuild && verifier > report, 'fixed acceptance report must be passed to the formal verifier');
  assert.ok(verifier < switchBoundary, 'acceptance mismatch must block before SWITCH_STARTED');
});

test('production rebuild restores the accepted runtime permissions before image and report verification', () => {
  const workspaceBuild = transactionSource.indexOf('npx pnpm@9.15.0 build');
  const normalize = transactionSource.indexOf(
    'runtime-normalize --root "$RELEASE_ROOT" --sha "$RELEASE_SHA"',
    workspaceBuild,
  );
  const imageBuild = transactionSource.indexOf('compose_current "build agent-worker document-parser"', workspaceBuild);
  const verifier = transactionSource.indexOf('verify-document-parser-acceptance.mjs', imageBuild);
  assert.ok(workspaceBuild >= 0, 'production transaction must perform a fresh workspace build');
  assert.ok(normalize > workspaceBuild, 'fresh build outputs must be permission-normalized');
  assert.ok(imageBuild > normalize, 'images must use the normalized runtime closure');
  assert.ok(verifier > imageBuild, 'formal acceptance verification must follow normalization and image build');
});

test('deployment revalidates active source, report and mutable image tags after migrations and checks started container image IDs', () => {
  const migration = transactionSource.indexOf('seed-quota.mjs --confirm');
  const preSwitch = transactionSource.indexOf('verify_candidate_switch_contract', migration);
  const switchBoundary = transactionSource.indexOf('transaction_mark_phase switching', migration);
  const parserUp = transactionSource.indexOf('document-parser"', switchBoundary);
  const parserImage = transactionSource.indexOf('verify_running_container_image document-parser', parserUp);
  const workerUp = transactionSource.indexOf('api web agent-worker"', parserImage);
  const workerImage = transactionSource.indexOf('verify_running_container_image agent-worker', workerUp);
  const publication = transactionSource.indexOf('transaction_publish_candidate', workerImage);
  assert.ok(migration >= 0 && preSwitch > migration && switchBoundary > preSwitch);
  assert.ok(parserUp > switchBoundary && parserImage > parserUp);
  assert.ok(workerUp > parserImage && workerImage > workerUp && publication > workerImage);
  assert.match(source, /current_active[\s\S]*ROLLBACK_SHA/);
  assert.match(source, /FINAL_WORKER_IMAGE_ID[\s\S]*FINAL_PARSER_IMAGE_ID/);
});

test('switch identity validator rejects active drift, post-acceptance retags and wrong running images', async () => {
  const { validateProductionSwitchState } = await import('./production-deploy-lock.mjs');
  const activeSha = 'a'.repeat(40);
  const acceptedWorkerImageId = `sha256:${'b'.repeat(64)}`;
  const acceptedParserImageId = `sha256:${'c'.repeat(64)}`;
  const valid = {
    activeSha,
    rollbackSha: activeSha,
    acceptedWorkerImageId,
    acceptedParserImageId,
    currentWorkerImageId: acceptedWorkerImageId,
    currentParserImageId: acceptedParserImageId,
    runningWorkerImageId: acceptedWorkerImageId,
    runningParserImageId: acceptedParserImageId,
  };
  assert.doesNotThrow(() => validateProductionSwitchState(valid));
  assert.throws(() => validateProductionSwitchState({
    ...valid, activeSha: 'd'.repeat(40),
  }), /active release changed/i);
  assert.throws(() => validateProductionSwitchState({
    ...valid, currentWorkerImageId: `sha256:${'e'.repeat(64)}`,
  }), /tag changed/i);
  assert.throws(() => validateProductionSwitchState({
    ...valid, runningParserImageId: `sha256:${'f'.repeat(64)}`,
  }), /container image differs/i);
});

test('root unit-test command includes the release-contract gate exactly once', () => {
  const focused = [
    'scripts/release-input-manifest.test.mjs',
    'infra/scripts/accept-document-parser-release.test.mjs',
    'infra/scripts/verify-document-parser-acceptance.test.mjs',
    'infra/scripts/deploy.test.mjs',
  ];
  assert.equal(typeof rootPackage.scripts['test:release-contract'], 'string');
  for (const path of focused) {
    assert.equal(rootPackage.scripts['test:release-contract'].split(path).length - 1, 1);
  }
  assert.match(rootPackage.scripts.test, /test:release-contract/);
  assert.equal(rootPackage.scripts.test.split('test:release-contract').length - 1, 1);
});

test('worker and parser images are immutable per release and rollback uses exact previous tags', () => {
  assert.match(productionCompose, /image: openscience-agent-worker:\$\{XGS_RELEASE_IMAGE_TAG:\?XGS_RELEASE_IMAGE_TAG required\}/);
  assert.match(productionCompose, /image: openscience-document-parser:\$\{XGS_RELEASE_IMAGE_TAG:\?XGS_RELEASE_IMAGE_TAG required\}/);
  assert.match(source, /docker image inspect openscience-agent-worker:\$PREVIOUS_RELEASE_SHA openscience-document-parser:\$PREVIOUS_RELEASE_SHA/);
  assert.doesNotMatch(source, /docker tag "\$worker_image"|docker tag "\$parser_image"/);
  assert.doesNotMatch(source, /cd \$PREVIOUS_RELEASE_ROOT && with-proxy npx pnpm@9\.15\.0 install/);
  assert.match(source, /XGS_RELEASE_IMAGE_TAG=\$RELEASE_SHA/);
  assert.match(source, /XGS_RELEASE_IMAGE_TAG=\$PREVIOUS_RELEASE_SHA/);
});

test('application containers run non-root with read-only release mounts', () => {
  for (const serviceName of ['api', 'agent-worker', 'web']) {
    const section = productionCompose.split(`\n  ${serviceName}:`)[1]?.split(/\n  [a-z]/)[0] ?? '';
    assert.match(section, /user: node/);
    assert.match(section, /:\/opt\/openscience:ro/);
  }
  const web = productionCompose.split('\n  web:')[1]?.split(/\n  [a-z]/)[0] ?? '';
  assert.match(web, /tmpfs:[\s\S]*\/opt\/openscience\/apps\/web\/\.next\/cache:[^\n]*uid=1000[^\n]*gid=1000/);
});

test('an already-active SHA exits before install or build', () => {
  assert.match(source, /ACTIVE_RELEASE_SHA/);
  assert.match(source, /already active/);
  assert.ok(source.indexOf('already active') < source.indexOf('npx pnpm@9.15.0 install'));
});

test('scheduled backup resolves the active immutable release and is refreshed by deployment', () => {
  assert.match(backup, /RELEASE_SHA=.*\.release-id/);
  assert.match(backup, /export XGS_RELEASE_ROOT="\$RELEASE_ROOT" XGS_RELEASE_IMAGE_TAG="\$RELEASE_SHA"/);
  assert.match(backup, /read -r SCANSCI_BROWSER_REQUIREMENTS_SHA256 _ < <\(sha256sum "\$RELEASE_ROOT\/apps\/scansci-legal\/browser-requirements\.lock"\)/u);
  assert.match(backup, /export SCANSCI_BROWSER_REQUIREMENTS_SHA256/u);
  assert.match(backup, /COMPOSE=\(docker compose --project-directory "\$RELEASE_ROOT" --env-file/);
  assert.match(backup, /"\$\{COMPOSE\[@\]\}" exec -T postgres/);
  assert.match(source, /backup\.sh\.next/);
  assert.match(source, /bash -n .*backup\.sh\.next/);
  assert.match(source, /mv .*backup\.sh\.next \/usr\/local\/bin\/backup\.sh/);
  assert.ok(source.indexOf('expect_http_body') < source.lastIndexOf('backup.sh.next'));
});

function expectNonzero(result) {
  assert.notEqual(result.status, 0, result.stderr?.toString());
}

test('parser reuses the production worker base that is available on ECS', () => {
  const workerBase = workerDockerfile.match(/^FROM (\S+)/m)?.[1];
  const parserBase = parserDockerfile.match(/^FROM (\S+)/m)?.[1];
  assert.equal(parserBase, workerBase);
});

test('parser build reaches registries through the ECS egress proxy without changing runtime isolation', () => {
  const parserService = productionCompose.split('\n  document-parser:')[1]?.split('\n  web:')[0] ?? '';
  const workerService = productionCompose.split('\n  agent-worker:')[1]?.split('\n  document-parser:')[0] ?? '';
  assert.match(parserService, /build:\r?\n[\s\S]*network: host/);
  assert.match(parserService, /HTTPS_PROXY: http:\/\/127\.0\.0\.1:7891/);
  assert.match(workerService, /build:\r?\n[\s\S]*network: host/);
  assert.match(workerService, /HTTPS_PROXY: http:\/\/127\.0\.0\.1:7891/);
  assert.match(parserService, /network_mode: none/);
  assert.match(parserService, /cpus: 2/);
});
