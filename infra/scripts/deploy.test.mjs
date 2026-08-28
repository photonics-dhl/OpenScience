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
const transactionStatePath = fileURLToPath(new URL('./production-deploy-transaction-state.sh', import.meta.url));
const source = `${launcherSource}\n${transactionSource}\n${transactionStateSource}`;
const workerDockerfile = readFileSync(new URL('../../apps/agent-worker/Dockerfile', import.meta.url), 'utf8');
const parserDockerfile = readFileSync(new URL('../../apps/agent-worker/Dockerfile.parser', import.meta.url), 'utf8');
const productionCompose = readFileSync(new URL('../compose/docker-compose.prod.yml', import.meta.url), 'utf8');
const cloudSync = readFileSync(new URL('../../scripts/cloud-sync.mjs', import.meta.url), 'utf8');
const releaseSyncCommand = readFileSync(new URL('../../scripts/release-sync-command.mjs', import.meta.url), 'utf8');
const backup = readFileSync(new URL('./backup.sh', import.meta.url), 'utf8');
const backupRunbook = readFileSync(new URL('../../docs/runbooks/backup-restore.md', import.meta.url), 'utf8');
const embeddingDockerfile = readFileSync(new URL('../../apps/embedding-worker/Dockerfile', import.meta.url), 'utf8');
const embeddingRequirements = readFileSync(new URL('../../apps/embedding-worker/requirements.lock', import.meta.url), 'utf8');
const embeddingEvaluatorDockerfile = readFileSync(new URL('../embedding-candidates/bge-m3/Dockerfile', import.meta.url), 'utf8');
const rootPackage = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const bash = process.platform === 'win32' && existsSync('C:/Program Files/Git/bin/bash.exe')
  ? 'C:/Program Files/Git/bin/bash.exe'
  : '/bin/bash';

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
  const parserServices = productionCompose.split('\n  agent-worker:')[1]?.split('\n  embedding-model-init:')[0] ?? '';
  assert.equal(parserServices.match(/XGS_RELEASE_IMAGE_TAG: \$\{XGS_RELEASE_IMAGE_TAG:\?XGS_RELEASE_IMAGE_TAG required\}/g)?.length, 2);
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
  assert.match(source, /schema=2/);
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
    /XGS_RELEASE_IMAGE_TAG=\$RELEASE_SHA docker compose --env-file \$PROD_ENV -f \$COMPOSE_FILE \$1/,
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

test('clean release builds generate Prisma before compiling any workspace package', () => {
  const candidateBuild = 'cd $RELEASE_ROOT && with-proxy npx pnpm@9.15.0 install && with-proxy npx pnpm@9.15.0 --filter @openscience/database generate && with-proxy npx pnpm@9.15.0 build';
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
    lockFunctions,
    'transaction_assert_lock() { assert_production_deploy_lock; }',
    'transaction_journal_start() { [ ! -e "$DEPLOY_JOURNAL" ] || return 75; printf "phase=prepared\\n" > "$DEPLOY_JOURNAL.next"; chmod 0600 "$DEPLOY_JOURNAL.next"; mv "$DEPLOY_JOURNAL.next" "$DEPLOY_JOURNAL"; }',
    'transaction_journal_update() { [ -f "$DEPLOY_JOURNAL" ] || return 75; printf "phase=%s\\n" "$1" > "$DEPLOY_JOURNAL.next"; chmod 0600 "$DEPLOY_JOURNAL.next"; mv "$DEPLOY_JOURNAL.next" "$DEPLOY_JOURNAL"; }',
    'transaction_journal_clear() { if [ "${XGS_TEST_TERM_DURING_CLEAR:-0}" = 1 ]; then kill -TERM $$; fi; rm -- "$DEPLOY_JOURNAL"; }',
    'transaction_perform_application_rollback() { active="$(cat "$REMOTE_ROOT/.release-id")"; case "$active" in "$ROLLBACK_SHA"|"$RELEASE_SHA") ;; *) echo ROLLBACK_FAILED_STALE_ACTIVE >&2; return 70 ;; esac; printf "ROLLBACK_IN_LOCK\\n" >&2; if [ "${XGS_TEST_ROLLBACK_DELAY:-0}" != 0 ]; then sleep "$XGS_TEST_ROLLBACK_DELAY"; fi; [ "${XGS_TEST_ROLLBACK_FAIL:-0}" != 1 ] || return 70; printf "%s\\n" "$ROLLBACK_SHA" > "$REMOTE_ROOT/.release-id"; }',
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
    '  expect_http_status() { [ "${XGS_TEST_SAME_SHA_FAILURE:-}" != public ]; }',
    '  expect_http_body() { [ "${XGS_TEST_SAME_SHA_FAILURE:-}" != public ]; }',
    '  transaction_verify_already_active_release',
    '  printf "ALREADY_ACTIVE_OK\\n"',
    '  exit 0',
    'fi',
    '[ -e "$REMOTE_ROOT/.release-id" ] || printf "%s\\n" "$ROLLBACK_SHA" > "$REMOTE_ROOT/.release-id"',
    'transaction_begin',
    'case "$TRANSACTION_PHASE_UNDER_TEST" in migrating) transaction_mark_phase migrating ;; switching) transaction_mark_phase switching; printf "%s\\n" "$RELEASE_SHA" > "$REMOTE_ROOT/.release-id" ;; published) transaction_mark_phase switching; printf "%s\\n" "$RELEASE_SHA" > "$REMOTE_ROOT/.release-id"; transaction_mark_phase published ;; esac',
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

    for (const failure of ['', 'source', 'report', 'runtime', 'tag', 'running', 'capability', 'public']) {
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

test('deployment revalidates active source, report and mutable image tags after migrations and checks started container image IDs', () => {
  const migration = transactionSource.indexOf('seed-quota.mjs --confirm');
  const preSwitch = transactionSource.indexOf('verify_candidate_switch_contract', migration);
  const switchBoundary = transactionSource.indexOf('transaction_mark_phase switching', migration);
  const parserUp = transactionSource.indexOf('document-parser"', switchBoundary);
  const parserImage = transactionSource.indexOf('verify_running_container_image document-parser', parserUp);
  const workerUp = transactionSource.indexOf('api web agent-worker"', parserImage);
  const workerImage = transactionSource.indexOf('verify_running_container_image agent-worker', workerUp);
  const publication = transactionSource.indexOf('cas-active', workerImage);
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
  assert.match(backup, /COMPOSE=\(docker compose --env-file/);
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
