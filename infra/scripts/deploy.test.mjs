import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  chmod, copyFile, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { builtinModules } from 'node:module';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as deployLock from './production-deploy-lock.mjs';

const launcherSource = readFileSync(new URL('./deploy.sh', import.meta.url), 'utf8');
const transactionSource = readFileSync(new URL('./production-deploy-transaction.sh', import.meta.url), 'utf8');
const transactionStateSource = readFileSync(new URL('./production-deploy-transaction-state.sh', import.meta.url), 'utf8');
const retentionSource = readFileSync(new URL('./production-release-retention.mjs', import.meta.url), 'utf8');
const transactionStatePath = fileURLToPath(new URL('./production-deploy-transaction-state.sh', import.meta.url));
const deployLockSource = readFileSync(new URL('./production-deploy-lock.mjs', import.meta.url), 'utf8');
const source = `${launcherSource}\n${transactionSource}\n${transactionStateSource}`;
const rollbackImageMetadataFixture = (env = ['NODE_VERSION=22.20.0'], os = 'linux', architecture = 'amd64') => JSON.stringify({ Config: { Env: env }, Os: os, Architecture: architecture });

test('skill-path keeps official Prisma targets and runs the complete rollback self-check', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/hermes-media-skills.yml', import.meta.url), 'utf8');
  assert.match(workflow, /PRISMA_CLI_BINARY_TARGETS:\s*debian-openssl-3\.0\.x,linux-musl/u);
  assert.match(workflow, /--filter @openscience\/database generate/u);
  assert.match(workflow, /--filter @openscience\/search generate/u);
  assert.match(workflow, /require\.resolve\('@prisma\/client\/package\.json'\)/u);
  assert.match(workflow, /path\.join\(root, '\.\.', '\.\.', '\.prisma', 'client'\)/u);
  assert.match(workflow, /packages\/search\/generated\/client\/libquery_engine-linux-musl\.so\.node/u);
  assert.match(workflow, /verifyApplicationRollbackReaders\(\{ candidateRoot: process\.env\.GITHUB_WORKSPACE, rollbackRoot: process\.env\.GITHUB_WORKSPACE, diagnostics: true \}\)/u);
});

test('rollback verifier diagnostics are opt-in, bounded and preserve rejection', async () => {
  const verifierSource = deployLockSource.match(/export async function verifyApplicationRollbackReaders\([^\n]+\) \{[\s\S]*?\n\}/u)?.[0];
  assert.ok(verifierSource);
  const events = [], failure = new Error('private-connection-and-paper-content');
  let rejectDiagnosticOutput = false;
  failure.code = 'MODULE_NOT_FOUND';
  failure.stack = `Error: ${failure.message}\n    at unrelated (/private-user/secret-path:900:2)`;
  const verify = runInNewContext(`${verifierSource.replace('export ', '')}; verifyApplicationRollbackReaders`, {
    APPLICATION_ROLLBACK_READERS: [], APPLICATION_ROLLBACK_ROOTS: {}, resolve, join,
    VERIFIER_SOURCE_URL: new URL('./production-deploy-lock.mjs', import.meta.url).href,
    createRequire() { throw failure; },
    console: { error(value) { if (rejectDiagnosticOutput) throw Error('private-log-sink-failure'); events.push(value); } },
    rollbackCompatibilityUnknown() { throw Error('ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN'); },
  });
  for (const diagnostics of [undefined, false, 'true']) {
    await assert.rejects(verify({ candidateRoot: '/candidate', rollbackRoot: '/rollback', diagnostics }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
    assert.equal(events.length, 0);
  }
  await assert.rejects(verify({ candidateRoot: '/candidate', rollbackRoot: '/rollback', diagnostics: true }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  assert.equal(events.length, 1);
  const diagnostic = JSON.parse(events[0].replace(/^ROLLBACK_COMPATIBILITY_DIAGNOSTIC /u, ''));
  assert.deepEqual(diagnostic, { stage: 'compiler', code: 'MODULE_NOT_FOUND', verifierLines: [] });
  assert.doesNotMatch(events[0], /private|connection|paper|secret-path|candidate|rollback/u);
  failure.code = 'private-error-code';
  failure.path = '/private-user/secret-path';
  const verifierUrl = new URL('./production-deploy-lock.mjs', import.meta.url).href;
  failure.stack += [123, 456, 789, 900].map(line => `\n    at check (${verifierUrl}:${line}:2)`).join('');
  await assert.rejects(verify({ candidateRoot: '/candidate', rollbackRoot: '/rollback', diagnostics: true }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  assert.deepEqual(JSON.parse(events[1].replace(/^ROLLBACK_COMPATIBILITY_DIAGNOSTIC /u, '')),
    { stage: 'compiler', code: 'UNCLASSIFIED', verifierLines: [123, 456, 789] });
  assert.doesNotMatch(events[1], /private|connection|paper|secret-path|file:|production-deploy-lock/u);
  rejectDiagnosticOutput = true;
  await assert.rejects(verify({ candidateRoot: '/candidate', rollbackRoot: '/rollback', diagnostics: true }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  assert.equal(events.length, 2);
  rejectDiagnosticOutput = false;
  let codeReads = 0;
  Object.defineProperty(failure, 'code', { get() { codeReads += 1; return codeReads === 1 ? 'ENOENT' : 'private-error-code'; } });
  await assert.rejects(verify({ candidateRoot: '/candidate', rollbackRoot: '/rollback', diagnostics: true }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  assert.equal(codeReads, 1);
  assert.equal(JSON.parse(events[2].replace(/^ROLLBACK_COMPATIBILITY_DIAGNOSTIC /u, '')).code, 'ENOENT');
});

test('rollback verifier dispatches guarded finite proofs only after original default collections differ', async () => {
  // This is dispatch coverage, not a positive compatibility proof. The real
  // image helpers separately refuse copied arrays and source-only Programs.
  const verifierSource=deployLockSource.match(/export async function verifyApplicationRollbackReaders\([^\n]+\) \{[\s\S]*?\n\}/u)?.[0];
  assert.ok(verifierSource);
  const roots=[],events=[],current=[['module:one','new']],previous=[['module:one','old']];
  let accept='',equal=false;
  const verify=runInNewContext(`${verifierSource.replace('export ','')}; verifyApplicationRollbackReaders`,{
    APPLICATION_ROLLBACK_READERS:roots,APPLICATION_ROLLBACK_ROOTS:{},resolve,join,dirname,
    createRequire(){return ()=>({});},
    rollbackReaderClosure(_ts,root,selected){events.push(['collect',root,selected]);return root===resolve('/candidate')?current:equal?current:previous;},
    finiteVideoPairCompatibility(...args){events.push(['video',...args]);return accept==='video';},
    finiteImageCapablePairCompatibility(...args){events.push(['capable',...args]);return accept==='capable';},
    finiteImageFirstPairCompatibility(...args){events.push(['first',...args]);return accept==='first';},
    finiteVoicePairCompatibility(...args){events.push(['voice',...args]);return accept==='voice';},
    finiteSdfReadablePairCompatibility(...args){events.push(['sdf',...args]);return accept==='sdf';},
    rollbackCompatibilityUnknown(){throw Error('ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN');},
  });
  for(const allowed of ['video','capable','first','voice','sdf']){
    accept=allowed;events.length=0;
    await verify({candidateRoot:'/candidate',rollbackRoot:'/previous',roots});
    assert.deepEqual(events.slice(0,2).map(row=>row[0]),['collect','collect']);
    const attempted=events.slice(2);
    assert.deepEqual(attempted.map(row=>row[0]),['video','capable','first','voice','sdf'].slice(0,['video','capable','first','voice','sdf'].indexOf(allowed)+1));
    for(const row of attempted){assert.equal(row[2],current);assert.equal(row[3],previous);assert.equal(row[6],roots);}
  }
  accept='';events.length=0;
  await assert.rejects(verify({candidateRoot:'/candidate',rollbackRoot:'/previous',roots}),/ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  accept='first';events.length=0;
  await assert.rejects(verify({candidateRoot:'/candidate',rollbackRoot:'/previous',roots:[]}),/ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  assert.equal(events.length,2,'custom roots never enter an image compatibility route');
  equal=true;events.length=0;
  await verify({candidateRoot:'/candidate',rollbackRoot:'/previous',roots});
  assert.equal(events.length,2,'exact equality retains the original fast path');
});

test('comparison diagnostics locate real two-root differences without printing values or permitting rollback', async () => {
  const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
  await mkdir(join(projectRoot, 'tmp'), { recursive: true });
  const root = await mkdtemp(join(projectRoot, 'tmp/r04-comparison-'));
  const candidate = join(root, 'candidate'), previous = join(root, 'previous');
  for (const directory of [candidate, previous]) {
    await mkdir(join(directory, 'packages/domain/src'), { recursive: true });
    await writeFile(join(directory, 'packages/domain/src/reader.ts'), `export function readPersisted() { return ${JSON.stringify(directory + '/PRIVATE_MARKER')}; }`);
  }
  const options = { candidateRoot: candidate, rollbackRoot: previous, compilerRoot: projectRoot,
    roots: [['packages/domain/src/reader.ts', 'readPersisted']] };
  const events = [], originalError = console.error;
  try {
    console.error = value => events.push(value);
    await assert.rejects(deployLock.verifyApplicationRollbackReaders(options), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
    assert.equal(events.length, 0);
    await assert.rejects(deployLock.verifyApplicationRollbackReaders({ ...options, diagnostics: true }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
    const report = JSON.parse(events.find(value => value.startsWith('ROLLBACK_COMPARISON_DIAGNOSTIC ')).slice('ROLLBACK_COMPARISON_DIAGNOSTIC '.length));
    assert.equal(report.differences, 1);
    assert.equal(report.entries[0].key, 'module:packages/domain/src/reader.ts');
    assert.equal(report.entries[0].candidateRootAtDifference, true);
    assert.equal(report.entries[0].rollbackRootAtDifference, true);
    assert.ok(report.entries[0].jsonOffset > 0);
    assert.doesNotMatch(events.join('\n'), /PRIVATE_MARKER|r04-comparison-|private-paper|runtime\.js/);
    console.error = () => { throw new Error('private-paper'); };
    await assert.rejects(deployLock.verifyApplicationRollbackReaders({ ...options, diagnostics: true }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
    for (const directory of [candidate, previous]) await writeFile(join(directory, 'packages/domain/src/reader.ts'), 'export function readPersisted() { return "same"; }');
    events.length = 0;
    console.error = value => events.push(value);
    await deployLock.verifyApplicationRollbackReaders({ ...options, diagnostics: true });
    assert.equal(events.length, 0);
  } finally { console.error = originalError; }
});

test('comparison diagnostics bound missing keys and multiple differences without exposing arbitrary keys or values', async () => {
  const helperSource = deployLockSource.match(/function rollbackComparisonDiagnostic\([^\n]+\) \{[\s\S]*?\n\}/u)?.[0];
  assert.ok(helperSource);
  const describe = runInNewContext(`${helperSource}; rollbackComparisonDiagnostic`, { resolve });
  const current = [['PRIVATE_KEY', 'PRIVATE_VALUE'], ...Array.from({ length: 5 }, (_, i) => [`module:packages/domain/src/reader${i}.ts`, 'PRIVATE_VALUE'])];
  const report = describe(current, [], '/candidate', '/rollback');
  assert.equal(report.differences, 6);
  assert.equal(report.entries.length, 4);
  assert.equal(report.truncated, true);
  assert.equal(report.entries[0].key, '[redacted-key]');
  assert.equal(report.entries[0].candidatePresent, true);
  assert.equal(report.entries[0].rollbackPresent, false);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE_KEY|PRIVATE_VALUE|candidateLength|jsonOffset/);
});

test('bounded Worker recovery wiring proof accepts the current construction path', () => {
  assert.equal(deployLock.verifyWorkerRecoveryWiring({ sourceRoot: fileURLToPath(new URL('../../', import.meta.url)) }), true);
});

test('bounded Worker recovery wiring proof rejects unsafe condition or duplicate maintenance changes', async t => {
  const sourceRoot = await mkdtemp(join(tmpdir(), 'xgs-worker-wiring-'));
  t.after(() => rm(sourceRoot, { recursive: true, force: true }));
  const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
  const indexPath = join(sourceRoot, 'apps/agent-worker/src/index.ts');
  const runPath = join(sourceRoot, 'packages/domain/src/agent/research-run.ts');
  await mkdir(dirname(indexPath), { recursive: true });
  await mkdir(dirname(runPath), { recursive: true });
  await copyFile(join(projectRoot, 'apps/agent-worker/src/index.ts'), indexPath);
  await copyFile(join(projectRoot, 'packages/domain/src/agent/research-run.ts'), runPath);
  const original = await readFile(indexPath, 'utf8');
  await writeFile(indexPath, original.replace('if (deps.nativeSceneImageEnabled)', 'if (true)'));
  assert.throws(() => deployLock.verifyWorkerRecoveryWiring({ sourceRoot, compilerRoot: projectRoot }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  await writeFile(indexPath, original.replace('runMaintenance: false', 'runMaintenance: true'));
  assert.throws(() => deployLock.verifyWorkerRecoveryWiring({ sourceRoot, compilerRoot: projectRoot }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  await writeFile(indexPath, original.replace('!deps.nativeSceneImageEnabled || !deps.inspectImageRecoveryState', '(!deps.nativeSceneImageEnabled && false) || !deps.inspectImageRecoveryState'));
  assert.throws(() => deployLock.verifyWorkerRecoveryWiring({ sourceRoot, compilerRoot: projectRoot }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  await writeFile(indexPath, original.replace('if (stopping() || inFlight || !deps.nativeSceneImageEnabled || !deps.inspectImageRecoveryState) return false;', 'if (false) { if (stopping() || inFlight || !deps.nativeSceneImageEnabled || !deps.inspectImageRecoveryState) return false; }'));
  assert.throws(() => deployLock.verifyWorkerRecoveryWiring({ sourceRoot, compilerRoot: projectRoot }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  await writeFile(indexPath, original.replace('nativeAgentRuntime, nativeSceneImageEnabled, sceneImageEnabled', 'nativeAgentRuntime, nativeSceneImageEnabled: true, nativeSceneImageEnabled, sceneImageEnabled'));
  assert.throws(() => deployLock.verifyWorkerRecoveryWiring({ sourceRoot, compilerRoot: projectRoot }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  const recoveryLine = original.match(/      const page = await recover\(deps, \{ limit: 20,[^\r\n]+\);\r?\n/u)?.[0];
  assert.ok(recoveryLine);
  const guardLine = original.match(/    if \(stopping\(\) \|\| inFlight \|\| !deps\.nativeSceneImageEnabled \|\| !deps\.inspectImageRecoveryState\) return false;\r?\n/u)?.[0];
  assert.ok(guardLine);
  const movedRecovery = original.replace(recoveryLine, '').replace(guardLine, recoveryLine + guardLine);
  await writeFile(indexPath, movedRecovery);
  assert.throws(() => deployLock.verifyWorkerRecoveryWiring({ sourceRoot, compilerRoot: projectRoot }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  await writeFile(indexPath, original.replace('const maintenance = (async () => {', 'const maintenance = () => {'));
  assert.throws(() => deployLock.verifyWorkerRecoveryWiring({ sourceRoot, compilerRoot: projectRoot }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  const runOriginal = await readFile(runPath, 'utf8');
  await writeFile(indexPath, original);
  const runGuard = runOriginal.match(/  if \(!deps\.nativeSceneImageEnabled \|\| !deps\.inspectImageRecoveryState\) return \{ inspected: 0, resumed: 0, errors: 0 \};\r?\n/u)?.[0];
  assert.ok(runGuard);
  await writeFile(runPath, runOriginal.replace(runGuard, `  if (process.env.UNSAFE_BYPASS) {\n${runGuard}  }\n`));
  assert.throws(() => deployLock.verifyWorkerRecoveryWiring({ sourceRoot, compilerRoot: projectRoot }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  const workerGuard = original.match(/    if \(stopping\(\) \|\| inFlight \|\| !deps\.nativeSceneImageEnabled \|\| !deps\.inspectImageRecoveryState\) return false;\r?\n/u)?.[0];
  assert.ok(workerGuard);
  await writeFile(runPath, runOriginal);
  await writeFile(indexPath, original.replace(workerGuard, `    if (process.env.UNSAFE_BYPASS) {\n${workerGuard}    }\n`));
  assert.throws(() => deployLock.verifyWorkerRecoveryWiring({ sourceRoot, compilerRoot: projectRoot }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  const nestedFake = `function __fakeHolder() { function createWorkerDeps(input) { return { ...input, nativeSceneImageEnabled: false, readVideoReadiness: createNativeVideoReadinessReader() }; } }\n${original.replace('nativeAgentRuntime, nativeSceneImageEnabled, sceneImageEnabled', 'nativeAgentRuntime, nativeSceneImageEnabled: true, sceneImageEnabled')}`;
  await writeFile(indexPath, nestedFake);
  assert.throws(() => deployLock.verifyWorkerRecoveryWiring({ sourceRoot, compilerRoot: projectRoot }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  await writeFile(indexPath, original.replace('createPollOnce(handlers, { runMaintenance: false, stopping: () => stopping })',
    'createPollOnce(handlers, { runMaintenance: false, stopping: () => false })'));
  assert.throws(() => deployLock.verifyWorkerRecoveryWiring({ sourceRoot, compilerRoot: projectRoot }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  await writeFile(indexPath, original.replace('createCompletedSceneImageRecoveryScheduler({ stopping: () => stopping })',
    'createCompletedSceneImageRecoveryScheduler({ stopping: () => stopping, recover: async () => ({ inspected: 0, resumed: 0, errors: 0 }) })'));
  assert.throws(() => deployLock.verifyWorkerRecoveryWiring({ sourceRoot, compilerRoot: projectRoot }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  await writeFile(indexPath, original.replace('const recoverSceneImages = createCompletedSceneImageRecoveryScheduler({ stopping: () => stopping });',
    'const createCompletedSceneImageRecoveryScheduler = () => async () => false;\n      const recoverSceneImages = createCompletedSceneImageRecoveryScheduler({ stopping: () => stopping });'));
  assert.throws(() => deployLock.verifyWorkerRecoveryWiring({ sourceRoot, compilerRoot: projectRoot }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  await writeFile(indexPath, original);
  await writeFile(indexPath, original.replace('  const recover = options.recover ?? recoverCompletedHermesSceneImageResults;',
    '  const recoverCompletedHermesSceneImageResults = async () => ({ inspected: 0, resumed: 0, errors: 0 });\n  const recover = options.recover ?? recoverCompletedHermesSceneImageResults;'));
  assert.throws(() => deployLock.verifyWorkerRecoveryWiring({ sourceRoot, compilerRoot: projectRoot }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  await writeFile(indexPath, original);
  await writeFile(runPath, runOriginal.replace('const run = await tx.hermesResearchRun.findUnique',
    'const actualRun = await tx.hermesResearchRun.findUnique').replace('        if (!run || run.version',
    '        const run = {} as any;\n        if (!run || run.version'));
  assert.throws(() => deployLock.verifyWorkerRecoveryWiring({ sourceRoot, compilerRoot: projectRoot }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  await writeFile(runPath, runOriginal.replace('const step = run.steps.find(row => row.id === item.stepId)!;', 'const step = {} as any;'));
  assert.throws(() => deployLock.verifyWorkerRecoveryWiring({ sourceRoot, compilerRoot: projectRoot }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  await writeFile(runPath, runOriginal.replace('for (const item of pending) {', 'for (const item of ({} as any)) {'));
  assert.throws(() => deployLock.verifyWorkerRecoveryWiring({ sourceRoot, compilerRoot: projectRoot }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  await writeFile(runPath, runOriginal.replace('where: { id: candidate.id }', 'where: { id: candidate.version }'));
  assert.throws(() => deployLock.verifyWorkerRecoveryWiring({ sourceRoot, compilerRoot: projectRoot }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  await writeFile(runPath, runOriginal.replace('const plan = await inspectGenerationRecovery(tx, run, undefined, deps.inspectImageRecoveryState, step.agentTaskId!);',
    'const inspectGenerationRecovery = async () => null;\n          const plan = await inspectGenerationRecovery(tx, run, undefined, deps.inspectImageRecoveryState, step.agentTaskId!);'));
  assert.throws(() => deployLock.verifyWorkerRecoveryWiring({ sourceRoot, compilerRoot: projectRoot }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  await writeFile(runPath, runOriginal.replace('        await lockTrashReferences(tx);',
    '        const lockTrashReferences = async () => undefined;\n        await lockTrashReferences(tx);'));
  assert.throws(() => deployLock.verifyWorkerRecoveryWiring({ sourceRoot, compilerRoot: projectRoot }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  const lockImport = "import { lockTrashReferences } from '../trash/trash';";
  assert.ok(runOriginal.includes(lockImport));
  const typeOnlyLockSource = runOriginal.replace(lockImport, "import { type lockTrashReferences } from '../trash/trash';");
  assert.notEqual(typeOnlyLockSource, runOriginal);
  await writeFile(runPath, typeOnlyLockSource);
  assert.throws(() => deployLock.verifyWorkerRecoveryWiring({ sourceRoot, compilerRoot: projectRoot }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  await mkdir(join(sourceRoot, 'packages/domain/src/trash'), { recursive: true });
  await writeFile(join(sourceRoot, 'packages/domain/src/trash/fake-trash.ts'), 'export async function lockTrashReferences(_tx: any) {}\n');
  await writeFile(runPath, runOriginal.replace('../trash/trash', '../trash/fake-trash'));
  assert.throws(() => deployLock.verifyWorkerRecoveryWiring({ sourceRoot, compilerRoot: projectRoot }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  const planLine = '          const plan = await inspectGenerationRecovery(tx, run, undefined, deps.inspectImageRecoveryState, step.agentTaskId!);';
  await writeFile(runPath, runOriginal.replace(planLine,
    '          const plan = { chargeable: [], rearm: [], resume: [] } as any;\n'
      + '          if (false) await inspectGenerationRecovery(tx, run, undefined, deps.inspectImageRecoveryState, step.agentTaskId!);'));
  assert.throws(() => deployLock.verifyWorkerRecoveryWiring({ sourceRoot, compilerRoot: projectRoot }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  await writeFile(runPath, runOriginal.replace(planLine,
    '          if (false) {\n'
      + '            const plan = await inspectGenerationRecovery(tx, run, undefined, deps.inspectImageRecoveryState, step.agentTaskId!);\n'
      + '            if (plan && plan.chargeable.length === 0 && plan.rearm.length === 0 && plan.resume.length === 1) pending.push(plan.resume[0]!);\n'
      + '          }'));
  assert.throws(() => deployLock.verifyWorkerRecoveryWiring({ sourceRoot, compilerRoot: projectRoot }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  await writeFile(runPath, runOriginal.replace('deps.prisma.$transaction(async tx => {',
    'const tx = deps.prisma;\n      counts.resumed += await deps.prisma.$transaction(async inner => {'));
  assert.throws(() => deployLock.verifyWorkerRecoveryWiring({ sourceRoot, compilerRoot: projectRoot }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  await writeFile(runPath, runOriginal.replace('deps.prisma.$transaction(async tx => {', 'other.prisma.$transaction(async tx => {'));
  assert.throws(() => deployLock.verifyWorkerRecoveryWiring({ sourceRoot, compilerRoot: projectRoot }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  await writeFile(runPath, runOriginal.replace("}, { isolationLevel: 'Serializable', maxWait: 10_000, timeout: 20_000 });",
    "}, { isolationLevel: 'ReadCommitted', maxWait: 10_000, timeout: 20_000 });"));
  assert.throws(() => deployLock.verifyWorkerRecoveryWiring({ sourceRoot, compilerRoot: projectRoot }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  await writeFile(runPath, runOriginal.replace('id: run.id, actorId: run.actorId, researchObjectId: run.researchObjectId, versionId: run.versionId,',
    'id: run.id, researchObjectId: run.researchObjectId, versionId: run.versionId,'));
  assert.throws(() => deployLock.verifyWorkerRecoveryWiring({ sourceRoot, compilerRoot: projectRoot }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  await writeFile(runPath, runOriginal.replace('status: \'generating_scene_images\', error: null, lastReconciledAt: null, version: { increment: 1 }',
    'status: \'generating_scene_images\', error: null, lastReconciledAt: null'));
  assert.throws(() => deployLock.verifyWorkerRecoveryWiring({ sourceRoot, compilerRoot: projectRoot }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  await writeFile(runPath, runOriginal);
});

test('Prisma location mapping keeps the original 22 metadata and unrelated-source negative cases strict', async () => {
  const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
  const ts = createRequire(import.meta.url)('typescript');
  const genuine = readFileSync(join(projectRoot, 'packages/search/generated/client/index.js'), 'utf8');
  const parsed = ts.createSourceFile('index.js', genuine, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  const declaration = parsed.statements.flatMap(statement => ts.isVariableStatement(statement)
    ? [...statement.declarationList.declarations] : []).find(node => node.name?.text === 'config');
  assert.ok(declaration && ts.isObjectLiteralExpression(declaration.initializer));
  const original = JSON.parse(declaration.initializer.getText(parsed));
  const helper = deployLockSource.match(/function prismaSearchLocationLiterals\([^\n]+\) \{[\s\S]*?\n\}/u)?.[0];
  const canonical = deployLockSource.match(/  const canonical = node => \{[\s\S]*?\n  \};/u)?.[0];
  assert.ok(helper && canonical);
  // Exercise the actual helper and closure canonicalizer without substituting
  // this AST unit control for complete vendor/default-root pair acceptance.
  const normalize = runInNewContext(`${helper}; const locationLiterals = new Map(); ${canonical}
    (file, root) => { locationLiterals.clear(); for (const [node, identity] of prismaSearchLocationLiterals(ts, file, root))
      locationLiterals.set(node, identity); return JSON.stringify(canonical(file)); }`, {
    ts, join, resolve, rollbackCompatibilityUnknown() { throw new Error('ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN'); },
  });
  const candidate = join(projectRoot, 'tmp/prisma-candidate'), previous = join(projectRoot, 'tmp/prisma-previous');
  const fixture = (directory, change = () => {}) => {
    const config = structuredClone(original);
    config.generator.output.value = join(directory, 'packages/search/generated/client');
    config.generator.sourceFilePath = join(directory, 'infra/search/schema.prisma');
    change(config);
    return genuine.slice(0, declaration.initializer.getStart(parsed)) + JSON.stringify(config)
      + genuine.slice(declaration.initializer.end);
  };
  const compare = (code, root) => normalize(ts.createSourceFile('index.js', code, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS), root);
  const valid = fixture(previous), expected = compare(fixture(candidate), candidate);
  assert.equal(compare(valid, previous), expected);
  for (const change of [
    config => { config.generator.output.value = join(candidate, 'packages/search/generated/client'); },
    config => { config.generator.output.value = join(previous, 'other'); },
    config => { config.generator.sourceFilePath = join(previous, 'infra/schema.prisma'); },
    config => { config.generator.sourceFilePath = join(previous, '..', 'outside/schema.prisma'); },
    config => { config.generator.output.fromEnvVar = 'PRIVATE_ENV'; },
    config => { config.generator.output.extra = true; },
    config => { config.generator.provider.value = 'other'; },
    config => { config.generator.extra = true; },
    config => { config.generator.config.engineType = 'binary'; },
    config => { config.clientVersion = 'unknown'; },
  ]) assert.throws(() => compare(fixture(previous, change), previous), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  for (const change of [
    config => { config.relativePath = '../different'; },
    config => { config.inlineSchema += '\n// changed'; },
    config => { config.inlineDatasources.search.url.fromEnvVar = 'OTHER_DATABASE_URL'; },
    config => { config.generator.binaryTargets[0].value = 'other'; },
  ]) assert.notEqual(compare(fixture(previous, change), previous), expected);
  for (const changed of [
    valid.replace('const config =', 'let config ='),
    valid.replace('"sourceFilePath":', '"sourceFilePath":"duplicate","sourceFilePath":'),
    valid.replace('"generator":', '"generator":{},"generator":'),
    valid.replace('"output":', '"output":{},"output":'),
  ]) assert.throws(() => compare(changed, previous), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  for (const extra of ['\nexports.unrelated = () => "changed-runtime-literal";', '\nconfig.dirname = "/external";'])
    assert.notEqual(compare(valid + extra, previous), expected);
  assert.notEqual(compare(fixture(candidate) + `\nexports.otherLocation = ${JSON.stringify(candidate + '/unrelated')};`, candidate),
    compare(valid + `\nexports.otherLocation = ${JSON.stringify(previous + '/unrelated')};`, previous));
  // A different module cannot inherit the generated-config relocation allowance.
  await mkdir(join(projectRoot, 'tmp/ui-r04-prisma-location'), { recursive: true });
  const root = await mkdtemp(join(projectRoot, 'tmp/ui-r04-prisma-location/other-module-'));
  const directories = [join(root, 'candidate'), join(root, 'previous')];
  for (const directory of directories) {
    const file = join(directory, 'packages/search/generated/client/other.js');
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `export const unrelated = ${JSON.stringify(directory)};`);
  }
  await assert.rejects(deployLock.verifyApplicationRollbackReaders({ candidateRoot: directories[0], rollbackRoot: directories[1],
    compilerRoot: projectRoot, roots: [['packages/search/generated/client/other.js']] }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
});

test('Prisma location allowance proves the actual generated config consumer and rejects observers or escapes', () => {
  const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
  const ts = createRequire(import.meta.url)('typescript');
  const genuine = readFileSync(join(projectRoot, 'packages/search/generated/client/index.js'), 'utf8');
  const proofSource = deployLockSource.match(/function provePrismaSearchConsumer\([^\n]+\) \{[\s\S]*?\n\}/u)?.[0];
  assert.ok(proofSource);
  const prove = runInNewContext(`${proofSource}; provePrismaSearchConsumer`, {
    rollbackCompatibilityUnknown() { throw new Error('ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN'); },
  });
  const check = code => {
    const filename = join(projectRoot, 'tmp/prisma-consumer-memory.js').replaceAll('\\', '/');
    const options = { allowJs: true, noLib: true, noEmit: true };
    const host = ts.createCompilerHost(options), original = host.getSourceFile.bind(host);
    host.getSourceFile = (file, languageVersion, ...args) => file === filename
      ? ts.createSourceFile(file, code, languageVersion, true, ts.ScriptKind.JS) : original(file, languageVersion, ...args);
    const program = ts.createProgram([filename], options, host);
    prove(ts, program.getSourceFile(filename), program.getTypeChecker());
  };
  check(genuine);
  check(genuine.replaceAll('query_engine-windows.dll.node', 'libquery_engine-debian-openssl-3.0.x.so.node'));
  const observer = 'exports.readPersisted = () => config.generator.output.value === "/fixed-candidate";';
  for (const code of [
    genuine + observer,
    genuine + '\nexports.config = config;',
    genuine + '\nconst alias = config; exports.readPersisted = () => alias;',
    genuine + '\nexports.readPersisted = () => config["generator"].sourceFilePath;',
    genuine + '\nfunction shadow(config) { return config.generator.output.value; }',
    genuine + '\nfunction shadowFactory() { function getPrismaClient(x) { return x; } return getPrismaClient(config); }',
    genuine + '\nconst other = PrismaClient;',
    genuine + '\nexports.readPersisted = () => exports.PrismaClient;',
    genuine + '\nexports.readPersisted = () => config.dirname;',
    genuine.replace("} = require('./runtime/library.js')", '} = require("./fake-runtime.js")'),
    genuine.replace('const PrismaClient = getPrismaClient(config)', 'const PrismaClient = (() => config)()'),
    genuine + '\nconst { generator } = config;',
    genuine + '\nexports.readPersisted = () => Reflect.get(config, "generator");',
    genuine + '\nconfig.generator.output.value = "/changed";',
    genuine + '\nconfig.generator.sourceFilePath = "/changed";',
    genuine + '\nObject.assign(config, { generator: {} });',
    genuine + '\nexports.readPersisted = () => eval("config.generator.output.value");',
    genuine + '\nexports.readPersisted = () => exports["Prisma" + "Client"];',
    genuine + '\nconst aliasExports = exports;',
    genuine + '\nconst aliasFactory = getPrismaClient;',
    genuine + '\nfunction scope(require) { return require("./runtime/library.js"); }',
    genuine + '\nfunction scope(exports) { return exports; }',
    genuine.replace('config.dirname = __dirname', 'exports.readPersisted = () => config.dirname'),
    genuine.replace('config.engineWasm = undefined', 'config.engineWasm = config.generator'),
    genuine.replace('config.runtimeDataModel = JSON.parse(', 'config.runtimeDataModel = observe('),
    genuine.replace('const { warnEnvConflicts }', 'const { warnEnvConflicts: fake }'),
    genuine.replace('defineDmmfProperty(exports.Prisma, config.runtimeDataModel)', 'defineDmmfProperty(exports.Prisma, config)'),
    genuine.replace('exports.PrismaClient = PrismaClient', 'exports.PrismaClient = getPrismaClient(config)'),
    genuine.replace('const PrismaClient = getPrismaClient(config)', 'const PrismaClient = getPrismaClient({ ...config })'),
    genuine + '\nconst ExtraClient = getPrismaClient(config);',
    genuine.replace('const PrismaClient = getPrismaClient(config)', 'function decoy() { return getPrismaClient(config); }'),
    genuine.replace("} = require('./runtime/library.js')", '} = require("./index.js")'),
    genuine + '\nconst moduleAlias = module;',
    genuine + '\nconst repeat = require("./index.js");',
    genuine + '\nconfig["generator"].output.value = "/changed";',
    genuine + '\nconst builtinAlias = path;',
    genuine + '\npath.join = () => "/changed";',
    genuine + '\nfs.existsSync = () => true;',
    genuine + '\nObject.assign = (...args) => args;',
    genuine + '\nJSON.parse = x => x;',
    genuine + '\nconst Object = { assign() {} };',
    genuine.replace('config.engineWasm = undefined', 'if (false) { config.engineWasm = undefined; }'),
    genuine.replace('const PrismaClient = getPrismaClient(config)', 'const PrismaClient = fake(config)'),
    genuine.replace('const alternativePaths =', 'let alternativePaths ='),
    genuine.replace('if (!fs.existsSync(', 'if (+fs.existsSync('),
    genuine.replace('  getPrismaClient,\n', '').replace('  getRuntime\n', '  getRuntime,\n  ...getPrismaClient\n'),
    genuine.replace('  getPrismaClient,', '  getPrismaClient = () => {},'),
    genuine.replace('  getPrismaClient,', '  getPrismaClient: getPrismaClient,'),
  ]) assert.throws(() => check(code), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
});

test('Prisma observer refusal occurs at consumer proof in the exported verifier, before vendor comparison', async () => {
  const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
  await mkdir(join(projectRoot, 'tmp/ui-r04-prisma-location'), { recursive: true });
  const root = await mkdtemp(join(projectRoot, 'tmp/ui-r04-prisma-location/observer-refusal-'));
  const candidate = join(root, 'candidate'), previous = join(root, 'previous');
  const ts = createRequire(import.meta.url)('typescript');
  const genuine = readFileSync(join(projectRoot, 'packages/search/generated/client/index.js'), 'utf8');
  const parsed = ts.createSourceFile('index.js', genuine, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  const declaration = parsed.statements.flatMap(statement => ts.isVariableStatement(statement)
    ? [...statement.declarationList.declarations] : []).find(node => node.name?.text === 'config');
  const original = JSON.parse(declaration.initializer.getText(parsed));
  const observed = [];
  for (const directory of [candidate, previous]) {
    const file = join(directory, 'packages/search/generated/client/index.js');
    await mkdir(dirname(file), { recursive: true });
    const config = structuredClone(original);
    config.generator.output.value = join(directory, 'packages/search/generated/client');
    config.generator.sourceFilePath = join(directory, 'infra/search/schema.prisma');
    const source = `const config=${JSON.stringify(config)}; exports.readPersisted=()=>config.generator.output.value===${JSON.stringify(join(candidate, 'packages/search/generated/client'))};`;
    await writeFile(file, source);
    const context = { exports: {} };
    runInNewContext(source, context);
    observed.push(context.exports.readPersisted());
  }
  assert.deepEqual(observed, [true, false]);
  const events = [], originalError = console.error;
  try {
    console.error = value => events.push(value);
    await assert.rejects(deployLock.verifyApplicationRollbackReaders({ candidateRoot: candidate, rollbackRoot: previous,
      compilerRoot: projectRoot, roots: [['packages/search/generated/client/index.js']], diagnostics: true }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
    const report = JSON.parse(events.find(value => value.startsWith('ROLLBACK_COMPATIBILITY_DIAGNOSTIC ')).slice('ROLLBACK_COMPATIBILITY_DIAGNOSTIC '.length));
    assert.equal(report.stage, 'closure-candidate');
    assert.equal(events.some(value => value.startsWith('ROLLBACK_COMPARISON_DIAGNOSTIC ')), false);
  } finally { console.error = originalError; }
});

test('Prisma initial config rejects the identical prototype/this observer before location mapping', () => {
  const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
  const ts = createRequire(import.meta.url)('typescript');
  const genuine = readFileSync(join(projectRoot, 'packages/search/generated/client/index.js'), 'utf8');
  const parsed = ts.createSourceFile('index.js', genuine, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  const declaration = parsed.statements.flatMap(statement => ts.isVariableStatement(statement)
    ? [...statement.declarationList.declarations] : []).find(node => node.name?.text === 'config');
  const original = JSON.parse(declaration.initializer.getText(parsed));
  const proofSource = deployLockSource.match(/function provePrismaSearchConsumer\([^\n]+\) \{[\s\S]*?\n\}/u)?.[0];
  const metadataSource = deployLockSource.match(/function prismaSearchLocationLiterals\([^\n]+\) \{[\s\S]*?\n\}/u)?.[0];
  const canonicalSource = deployLockSource.match(/  const canonical = node => \{[\s\S]*?\n  \};/u)?.[0];
  assert.ok(proofSource && metadataSource && canonicalSource);
  const functions = runInNewContext(`${proofSource}; ${metadataSource}; const locationLiterals = new Map(); ${canonicalSource};
    ({ prove: provePrismaSearchConsumer, metadata: prismaSearchLocationLiterals,
      normalized(file, literals) { locationLiterals.clear(); for (const [node, identity] of literals) locationLiterals.set(node, identity);
        return JSON.stringify(canonical(file)); } })`, {
    ts, join, resolve, rollbackCompatibilityUnknown() { throw new Error('ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN'); },
  });
  const candidate = join(projectRoot, 'tmp/ui-r04-prisma-location/prototype-candidate');
  const previous = join(projectRoot, 'tmp/ui-r04-prisma-location/prototype-previous');
  const fixed = JSON.stringify(join(candidate, 'packages/search/generated/client'));
  const fixture = (directory, extra) => {
    const config = structuredClone(original);
    config.generator.output.value = join(directory, 'packages/search/generated/client');
    config.generator.sourceFilePath = join(directory, 'infra/search/schema.prisma');
    const initializer = JSON.stringify(config).slice(0, -1) + ',' + extra + '}';
    return { initializer, source: genuine.slice(0, declaration.initializer.getStart(parsed)) + initializer + genuine.slice(declaration.initializer.end) };
  };
  const check = ({ source }, directory) => {
    const filename = join(projectRoot, 'tmp/prisma-prototype-memory.js').replaceAll('\\', '/');
    const options = { allowJs: true, noLib: true, noEmit: true };
    const host = ts.createCompilerHost(options), read = host.getSourceFile.bind(host);
    host.getSourceFile = (file, languageVersion, ...args) => file === filename
      ? ts.createSourceFile(file, source, languageVersion, true, ts.ScriptKind.JS) : read(file, languageVersion, ...args);
    const program = ts.createProgram([filename], options, host), file = program.getSourceFile(filename);
    functions.prove(ts, file, program.getTypeChecker());
    const literals = functions.metadata(ts, file, directory);
    return { mapped: literals.size, canonical: functions.normalized(file, literals) };
  };
  const extra = `"__proto__": { get isBundled() { return this.generator.output.value === ${fixed}; } }`;
  const metadataOnly = ({ source }, directory) => functions.metadata(ts,
    ts.createSourceFile('index.js', source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS), directory);
  assert.equal(metadataOnly(fixture(candidate, '"nested": { "text": "__proto__", "constructor": { "prototype": 3 }, "values": [1, -2, 0, 1.5, true, false, null] }'), candidate).size, 2);
  const pair = [fixture(candidate, extra), fixture(previous, extra)];
  const observed = pair.map(({ initializer }) => runInNewContext(`(${initializer}).isBundled`));
  assert.deepEqual(observed, [true, false]);
  const accepted = pair.map((value, index) => { try { return check(value, [candidate, previous][index]); } catch { return null; } });
  console.log(JSON.stringify({ prototypeRegression: true, helperAccepted: accepted.map(Boolean), mappedLiteralCounts: accepted.map(value => value?.mapped ?? 0),
    canonicalEqual: accepted.every(Boolean) && accepted[0].canonical === accepted[1].canonical, observed }));
  for (let index = 0; index < pair.length; index += 1) {
    assert.throws(() => metadataOnly(pair[index], [candidate, previous][index]), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
    assert.throws(() => check(pair[index], [candidate, previous][index]), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  }
  for (const addition of [
    '"__proto__": {}',
    '"nested": { "__proto__": {} }',
    '"nested": [{ "__proto__": {} }]',
    '"nested": { get value() { return this; } }',
    '"nested": { set value(x) {} }',
    '"nested": { method() { return this; } }',
    '"nested": { "value": function () { return this; } }',
    '"nested": { "value": () => 1 }',
    '"nested": { "value": (() => 1)() }',
    '"nested": { ["value"]: 1 }',
    '"nested": { ...{} }',
    '"nested": { config }',
    '"nested": { "value": this }',
    '"nested": { "value": undefined }',
    '"nested": { "value": new Date() }',
    '"nested": { "value": /x/ }',
    '"nested": { "value": `template` }',
    '"nested": { "value": 1 + 1 }',
    '"nested": [, 1]',
    '"nested": [...[]]',
    '"nested": { "value": 1, "value": 2 }',
    '"nested": { "__\\u0070roto__": {} }',
    '"nested": { __proto__: {} }',
  ]) {
    assert.throws(() => metadataOnly(fixture(candidate, addition), candidate), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
    assert.throws(() => check(fixture(candidate, addition), candidate), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  }
});

test('Prisma consumer rejects alias-based ambient prototype observers and unknown execution', () => {
  const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
  const ts = createRequire(import.meta.url)('typescript');
  const genuine = readFileSync(join(projectRoot, 'packages/search/generated/client/index.js'), 'utf8');
  const parsed = ts.createSourceFile('index.js', genuine, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  const declaration = parsed.statements.flatMap(statement => ts.isVariableStatement(statement)
    ? [...statement.declarationList.declarations] : []).find(node => node.name?.text === 'config');
  const original = JSON.parse(declaration.initializer.getText(parsed));
  const proofSource = deployLockSource.match(/function provePrismaSearchConsumer\([^\n]+\) \{[\s\S]*?\n\}/u)?.[0];
  const metadataSource = deployLockSource.match(/function prismaSearchLocationLiterals\([^\n]+\) \{[\s\S]*?\n\}/u)?.[0];
  const canonicalSource = deployLockSource.match(/  const canonical = node => \{[\s\S]*?\n  \};/u)?.[0];
  assert.ok(proofSource && metadataSource && canonicalSource);
  const functions = runInNewContext(`${proofSource}; ${metadataSource}; const locationLiterals = new Map(); ${canonicalSource};
    ({ prove: provePrismaSearchConsumer, metadata: prismaSearchLocationLiterals,
      normalized(file, literals) { locationLiterals.clear(); for (const [node, identity] of literals) locationLiterals.set(node, identity);
        return JSON.stringify(canonical(file)); } })`, {
    ts, join, resolve, rollbackCompatibilityUnknown() { throw new Error('ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN'); },
  });
  const candidate = join(projectRoot, 'tmp/ui-r04-prisma-location/ambient-candidate');
  const previous = join(projectRoot, 'tmp/ui-r04-prisma-location/ambient-previous');
  const fixed = JSON.stringify(join(candidate, 'packages/search/generated/client'));
  const extra = `const O = ({}).constructor; O.defineProperty(O.prototype, 'isBundled', { get() { return this.generator.output.value === ${fixed}; } });`;
  const pair = [candidate, previous].map(directory => {
    const config = structuredClone(original);
    config.generator.output.value = join(directory, 'packages/search/generated/client');
    config.generator.sourceFilePath = join(directory, 'infra/search/schema.prisma');
    const initializer = JSON.stringify(config);
    return { directory, initializer, source: genuine.slice(0, declaration.initializer.getStart(parsed)) + initializer
      + genuine.slice(declaration.initializer.end) + '\n' + extra };
  });
  const check = source => {
    const filename = join(projectRoot, 'tmp/prisma-ambient-memory.js').replaceAll('\\', '/');
    const options = { allowJs: true, noLib: true, noEmit: true };
    const host = ts.createCompilerHost(options), read = host.getSourceFile.bind(host);
    host.getSourceFile = (file, languageVersion, ...args) => file === filename
      ? ts.createSourceFile(file, source, languageVersion, true, ts.ScriptKind.JS) : read(file, languageVersion, ...args);
    const program = ts.createProgram([filename], options, host), file = program.getSourceFile(filename);
    functions.prove(ts, file, program.getTypeChecker());
    return file;
  };
  const observed = pair.map(({ initializer }) => runInNewContext(`const config=${initializer}; ${extra} config.isBundled;`));
  assert.deepEqual(observed, [true, false]);
  const accepted = pair.map(({ source, directory }) => {
    try { const file = check(source), literals = functions.metadata(ts, file, directory);
      return { mapped: literals.size, canonical: functions.normalized(file, literals) }; } catch { return null; }
  });
  console.log(JSON.stringify({ ambientPrototypeRegression: true, helperAccepted: accepted.map(Boolean), mappedLiteralCounts: accepted.map(value => value?.mapped ?? 0),
    canonicalEqual: accepted.every(Boolean) && accepted[0].canonical === accepted[1].canonical, observed }));
  for (const { source } of pair) assert.throws(() => check(source), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  for (const source of [
    genuine + '\nconst O = Reflect.getPrototypeOf({}).constructor;',
    genuine + '\nconst { constructor: C } = {};',
    genuine + '\nconst O = ({}).constructor; const D = O.defineProperty; D(O.prototype, "isBundled", { value: true });',
    genuine + '\nconst O = ({}).constructor; const { defineProperty: D } = O;',
    genuine + '\n(() => {})();',
    genuine + '\nnew Proxy({}, {});',
    genuine + '\nconst extra = String.raw`unknown`;',
    genuine + '\nexports.Prisma.Extra = { get hidden() { return 1; } };',
    genuine + '\nexports.Prisma.Extra = { method() { return 1; } };',
    genuine + '\nexports.Prisma.Extra = { value: () => 1 };',
    genuine + '\nexports.Prisma.Extra = (() => ({}))();',
    genuine.replace("ReadUncommitted: 'ReadUncommitted'", 'get ReadUncommitted() { return "ReadUncommitted"; }'),
    genuine.replace("ReadUncommitted: 'ReadUncommitted'", "__proto__: {}"),
    genuine.replace('const Prisma = {}', 'const Prisma = {}, Other = (() => ({}))()'),
    genuine + '\nPrisma.__proto__ = {};',
    genuine + '\nPrisma.constructor = {};',
    genuine + '\nPrisma.prototype = {};',
    genuine + '\nPrisma.PrismaClient = null;',
    genuine + '\nPrisma["extra"] = {};',
    genuine + '\nfunction extra() {}',
  ]) assert.throws(() => check(source), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
});

test('Prisma consumer requires plain runtime destructuring, not a rest object or default binding', () => {
  const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
  const ts = createRequire(import.meta.url)('typescript');
  const genuine = readFileSync(join(projectRoot, 'packages/search/generated/client/index.js'), 'utf8');
  const proofSource = deployLockSource.match(/function provePrismaSearchConsumer\([^\n]+\) \{[\s\S]*?\n\}/u)?.[0];
  assert.ok(proofSource);
  const prove = runInNewContext(`${proofSource}; provePrismaSearchConsumer`, {
    rollbackCompatibilityUnknown() { throw new Error('ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN'); },
  });
  const check = code => {
    const filename = join(projectRoot, 'tmp/prisma-binding-memory.js').replaceAll('\\', '/');
    const options = { allowJs: true, noLib: true, noEmit: true };
    const host = ts.createCompilerHost(options), read = host.getSourceFile.bind(host);
    host.getSourceFile = (file, languageVersion, ...args) => file === filename
      ? ts.createSourceFile(file, code, languageVersion, true, ts.ScriptKind.JS) : read(file, languageVersion, ...args);
    const program = ts.createProgram([filename], options, host);
    assert.equal(program.getSyntacticDiagnostics().length, 0);
    prove(ts, program.getSourceFile(filename), program.getTypeChecker());
  };
  check(genuine);
  const rest = genuine.replace(/  getPrismaClient,\r?\n/u, '').replace(/  getRuntime\r?\n/u, '  getRuntime,\n  ...getPrismaClient\n');
  assert.notEqual(rest, genuine);
  let accepted = true; try { check(rest); } catch { accepted = false; }
  console.log(JSON.stringify({ runtimeRestRegression: true, restAccepted: accepted }));
  assert.throws(() => check(rest), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  for (const code of [genuine.replace('  getPrismaClient,', '  getPrismaClient = () => {},'),
    genuine.replace('  getPrismaClient,', '  getPrismaClient: getPrismaClient,')])
    assert.throws(() => check(code), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
});

for (const [name, candidateBody, rollbackBody] of [
  ['prefix', 'return !value;', 'return +value;'],
  ['postfix', 'value++; return value;', 'value--; return value;'],
  ['same-operator', 'value++; return !value;', 'value++; return !value;'],
]) test(`rollback actual exact canonical preserves ${name} operator`, async t => {
  const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
  const temporaryRoot = join(projectRoot, 'tmp'); await mkdir(temporaryRoot, { recursive: true });
  const root = await mkdtemp(join(temporaryRoot, 'r04-operator-'));
  assert.equal(dirname(root), temporaryRoot);
  t.after(() => rm(root, { recursive: true, force: true }));
  const candidate = join(root, 'candidate'), previous = join(root, 'rollback');
  await mkdir(candidate); await mkdir(previous);
  await writeFile(join(candidate, 'reader.ts'), `export function readPersisted(value: number) { ${candidateBody} }`);
  await writeFile(join(previous, 'reader.ts'), `export function readPersisted(value: number) { ${rollbackBody} }`);
  const input = { candidateRoot: candidate, rollbackRoot: previous, compilerRoot: projectRoot, roots: [['reader.ts', 'readPersisted']] };
  if (name === 'same-operator') await deployLock.verifyApplicationRollbackReaders(input);
  else await assert.rejects(deployLock.verifyApplicationRollbackReaders(input), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
});

test('ordinary rollback compares persisted readers and their runtime helpers without executing old source', async t => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-rollback-readers-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const candidate = join(root, 'candidate'), previous = join(root, 'previous');
  const fixture = async (directory, helper = 'return value === "new-profile";', reader = '') => {
    await mkdir(join(directory, 'packages/domain/src'), { recursive: true });
    await writeFile(join(directory, 'packages/domain/src/reader.ts'), `import { accepts } from './helper';\nexport function readPersisted(value: string) { ${reader} return accepts(value); }\nexport function unrelated() { return 1; }\n`);
    await writeFile(join(directory, 'packages/domain/src/helper.ts'), `export function accepts(value: string) { ${helper} }\n`);
  };
  await fixture(candidate); await fixture(previous, '/* old formatting */ return value === "new-profile";', '// retained historical reader\n');
  const options = { candidateRoot: candidate, rollbackRoot: previous,
    compilerRoot: fileURLToPath(new URL('../../', import.meta.url)), roots: [['packages/domain/src/reader.ts', 'readPersisted']] };
  assert.equal(typeof deployLock.verifyApplicationRollbackReaders, 'function');
  await deployLock.verifyApplicationRollbackReaders(options);
  await writeFile(join(previous, 'packages/domain/src/reader.ts'), 'import { accepts } from "./helper"; export function readPersisted(value: string) { return accepts(value); } export function unrelated() { throw Error("must not execute"); }');
  await assert.rejects(deployLock.verifyApplicationRollbackReaders(options), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  await fixture(previous, 'return value === "old-profile";');
  await assert.rejects(deployLock.verifyApplicationRollbackReaders(options), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  await rm(join(previous, 'packages/domain/src/helper.ts'));
  await assert.rejects(deployLock.verifyApplicationRollbackReaders(options), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
});

// These controls exercise source bindings in the actual production Program.
// They do not replace genuine successful collectors or installed-root checks.
const historicalVideoSources = new Map();
function historicalVideoSource(projectRoot, sourceRef) {
  if (historicalVideoSources.has(sourceRef)) return historicalVideoSources.get(sourceRef);
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', '-z', sourceRef, '--', 'apps', 'packages'],
    { cwd: projectRoot, encoding: 'utf8' }).split('\0').filter(file =>
    /\/src\/.*\.(?:[cm]?[jt]sx?)$/u.test(file) || /\/package\.json$/u.test(file));
  const blobs = execFileSync('git', ['cat-file', '--batch'], { cwd: projectRoot,
    input: files.map(file => `${sourceRef}:${file}\n`).join(''), maxBuffer: 64 * 1024 * 1024 });
  const sources = new Map();
  let offset = 0;
  for (const file of files) {
    const end = blobs.indexOf(10, offset), header = blobs.subarray(offset, end).toString('utf8');
    assert.match(header, /^[a-f0-9]+ blob \d+$/u, `historical source blob must exist: ${file}`);
    const size = Number(header.split(' ')[2]);
    sources.set(resolve(projectRoot, file).replaceAll('\\', '/').toLowerCase(),
      blobs.subarray(end + 1, end + 1 + size).toString('utf8'));
    offset = end + 1 + size;
    assert.equal(blobs[offset++], 10, 'historical blob framing must be exact');
  }
  assert.equal(offset, blobs.length);
  const result = { files, sources };
  historicalVideoSources.set(sourceRef, result);
  return result;
}

async function videoIngressProgram(changes = new Map(), { sourceRef, trackedSourceOnly = false, ambientSources = new Map() } = {}) {
  const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
  const ts = createRequire(import.meta.url)('typescript');
  // Retained fixtures are source-only historical oracles, never installed roots.
  // Their inventory, manifests and module bytes all come from the same commit.
  const historical = sourceRef ? historicalVideoSource(projectRoot, sourceRef) : undefined;
  const files = historical?.files ?? execFileSync('git', ['ls-files', '-z', '--', 'apps', 'packages'],
    { cwd: projectRoot, encoding: 'utf8' }).split('\0');
  const tracked = files.filter(file => /\/src\/.*\.ts$/u.test(file) && !file.endsWith('.d.ts')).map(file => join(projectRoot, file));
  const key = filename => resolve(filename).replaceAll('\\', '/').toLowerCase();
  const ownsSource = filename => ['apps', 'packages'].some(directory => key(filename).startsWith(`${key(join(projectRoot, directory))}/`));
  const sourceInventory = new Set(files.filter(Boolean).map(file => key(join(projectRoot, file))));
  const changedFiles = [...changes].map(([file, change]) => {
    const filename = join(projectRoot, file);
    if (historical && typeof change === 'function') assert.ok(historical.sources.has(key(filename)), `mutation must target historical source: ${file}`);
    const original = historical ? historical.sources.get(key(filename)) ?? '' : existsSync(filename) ? readFileSync(filename, 'utf8') : '';
    const updated = typeof change === 'function' ? change(original) : change;
    assert.notEqual(updated, original, `mutation must change ${file}`);
    return { filename, updated };
  });
  const overlays = new Map(changedFiles.map(item => [key(item.filename), item.updated]));
  // Filesystem-visible test inputs are separate from explicit source mutations.
  const ambient = new Map([...ambientSources].map(([file, text]) => [key(join(projectRoot, file)), text]));
  // An ambient output must not replace current tracked bytes; tracked changes
  // already have the explicit, exact-byte-checked mutation path above.
  for (const filename of ambient.keys()) assert.ok(!sourceInventory.has(filename), 'ambient input cannot replace tracked source');
  // Source fixtures compare selected inventories, not installed roots. Historical
  // roots admit only their own bytes and explicit inputs, never live app fallback.
  const readable = filename => !trackedSourceOnly || !ownsSource(filename)
    || sourceInventory.has(key(filename)) || overlays.has(key(filename));
  // Same source-only analysis boundary as rollbackReaderClosure: this is not a
  // package typecheck, and never substitutes third-party declarations for code.
  const options = { allowJs: true, noLib: true, types: [], noEmit: true,
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext };
  const host = ts.createCompilerHost(options);
  const originalRead = host.readFile.bind(host), originalExists = host.fileExists.bind(host);
  host.readFile = filename => overlays.has(key(filename)) ? overlays.get(key(filename))
    : historical && ownsSource(filename) ? historical.sources.get(key(filename)) ?? (!trackedSourceOnly ? ambient.get(key(filename)) : undefined)
      : !readable(filename) ? undefined : ambient.has(key(filename)) ? ambient.get(key(filename)) : originalRead(filename);
  host.fileExists = filename => overlays.has(key(filename))
    || (historical && ownsSource(filename) ? historical.sources.has(key(filename)) || (!trackedSourceOnly && ambient.has(key(filename)))
      : readable(filename) && (ambient.has(key(filename)) || originalExists(filename)));
  const source = host.getSourceFile.bind(host);
  host.getSourceFile = (filename, languageVersion, ...args) => overlays.has(key(filename))
    ? ts.createSourceFile(filename, overlays.get(key(filename)), languageVersion, true)
    : historical && ownsSource(filename) ? (host.fileExists(filename)
      ? ts.createSourceFile(filename, host.readFile(filename), languageVersion, true) : undefined)
      : !readable(filename) ? undefined : ambient.has(key(filename)) ? ts.createSourceFile(filename, ambient.get(key(filename)), languageVersion, true)
        : source(filename, languageVersion, ...args);
  host.resolveModuleNames = (names, containingFile) => names.map(specifier => {
    let base;
    if (specifier.startsWith('.')) base = resolve(dirname(containingFile), specifier.replace(/\.js$/u, '')).replace(/([\\/])dist([\\/])/u, '$1src$2');
    else if (/^@openscience\/[a-z-]+(?:\/.*)?$/u.test(specifier)) {
      const [, name, ...subpath] = specifier.split('/');
      const packageRoot = join(projectRoot, 'packages', name);
      if (!subpath.length) base = join(packageRoot, 'src/index');
      else {
        const manifest = JSON.parse(host.readFile(join(packageRoot, 'package.json')));
        const entry = manifest.exports?.[`./${subpath.join('/')}`]?.types;
        if (typeof entry !== 'string' || !entry.startsWith('./dist/') || !entry.endsWith('.d.ts')) return undefined;
        base = join(packageRoot, entry.replace('./dist/', 'src/').replace(/\.d\.ts$/u, ''));
      }
    } else return undefined;
    const filename = [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, `${base}.js`, join(base, 'index.ts'), join(base, 'index.js')]
      .find(value => host.fileExists(value));
    return filename ? { resolvedFileName: filename,
      extension: filename.endsWith('.mjs') ? ts.Extension.Mjs : filename.endsWith('.js') ? ts.Extension.Js
        : filename.endsWith('.tsx') ? ts.Extension.Tsx : ts.Extension.Ts } : undefined;
  });
  const program = ts.createProgram([...new Set([...tracked, ...changedFiles.map(item => item.filename)])], options, host);
  assert.equal(program.getSyntacticDiagnostics().length, 0, 'actual Program must parse before a source-proof result');
  if (historical) for (const file of program.getSourceFiles().filter(file => ownsSource(file.fileName)))
    assert.equal(file.text, overlays.get(key(file.fileName)) ?? historical.sources.get(key(file.fileName))
      ?? (!trackedSourceOnly ? ambient.get(key(file.fileName)) : undefined),
      'historical Program must contain only selected baseline bytes, exact mutations and explicitly visible ambient inputs');
  for (const item of changedFiles) assert.equal(program.getSourceFiles().find(file => key(file.fileName) === key(item.filename))?.text,
    item.updated, 'the real Program must contain the exact mutation before testing its rejection');
  return { ts, program, projectRoot };
}

// Legacy video controls opt into the released V1 oracle. The two historical
// image recovery/legacy component controls explicitly use the released 3a
// inventory; all other image controls retain the current candidate by default.
function historicalVideoIngressProgram(changes = new Map(), sourceRef = 'e75f2764ded1074f4d307d34dca833517f0d3696') {
  return videoIngressProgram(changes, { sourceRef });
}

function videoPairSourceComponents() {
  const component = deployLockSource.slice(deployLockSource.indexOf('function finiteVideoConstructorTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  assert.ok(component.startsWith('function finiteVideoConstructorTerms('));
  return runInNewContext(`${component}; ({ constructors: finiteVideoConstructorTerms, model: finiteVideoSourceModel, closure: finiteVideoFamilyClosure,
    pair: finiteVideoPairCompatibility, roots: APPLICATION_ROLLBACK_READERS })`, { relative, resolve, rollbackProofContexts: new WeakMap(), APPLICATION_ROLLBACK_READERS: [] });
}

function videoPairContext({ ts, program, projectRoot }) { return { ts, program, checker: program.getTypeChecker(), root: projectRoot }; }

function videoPairRuntime(ts, text) {
  // Extract the one actual collector canonical, including its reviewed unary
  // correction. This source-component comparison never fabricates a successful
  // production collector or a complete installed root.
  const canonicalText = deployLockSource.slice(deployLockSource.indexOf('  const canonical = node => {'),
    deployLockSource.indexOf('\n  const addConfiguration =', deployLockSource.indexOf('  const canonical = node => {')));
  const canonical = runInNewContext(`${canonicalText}; canonical`, { ts, locationLiterals: new Map() });
  const compiled = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true } });
  return JSON.parse(JSON.stringify(canonical(ts.createSourceFile('runtime.js', compiled.outputText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS))));
}

function sdfReadableSourceComponents() {
  const component = deployLockSource.slice(deployLockSource.indexOf('function finiteVideoConstructorTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  return runInNewContext(`${component}; ({ model: typeof finiteSdfReadableSourceModel === 'function' ? finiteSdfReadableSourceModel : undefined,
    pair: typeof finiteSdfReadablePairCompatibility === 'function' ? finiteSdfReadablePairCompatibility : undefined, defaultRoots: APPLICATION_ROLLBACK_READERS })`,
    { resolve, relative, builtinModules, rollbackProofContexts: new WeakMap(), APPLICATION_ROLLBACK_READERS: [] });
}

test('SDF readable R source proof preserves the actual 764 runtime and old opaque domain', async () => {
  const actual = await videoIngressProgram(new Map(), { trackedSourceOnly: true });
  const old = await videoIngressProgram(new Map(), { sourceRef: '764020c76b25af571e8b88e80338406d70bdb37a' });
  const methods = sdfReadableSourceComponents();
  assert.equal(typeof methods.model, 'function', 'the original finite verifier must cover readable R');
  let model;
  try { model = methods.model(actual.ts, videoPairContext(actual), videoPairContext(old)); }
  catch (error) { assert.fail(`${error.reason ?? error.message} ${error.node?.getText?.().slice(0, 180) ?? ''}`); }
  assert.equal(model.domain, 'stored-snapshot-copy-and-legacy-fresh');
  assert.equal(model.projected.size, 6);
  assert.equal(model.capsules.size, 1);
  for (const [path, value] of model.projected) assert.deepEqual(videoPairRuntime(actual.ts, value.text),
    videoPairRuntime(old.ts, old.program.getSourceFile(resolve(old.projectRoot, path)).text), path);
  assert.equal(methods.pair(actual.ts, [], [], actual.projectRoot, old.projectRoot, []), false,
    'source-only Programs must never acquire genuine DEFAULT collector authority');
  for (const values of [[], [['module:reader', 'opaque']], JSON.parse(JSON.stringify([['module:reader', 'opaque']]))])
    assert.equal(methods.pair(actual.ts, values, values.slice(), actual.projectRoot, old.projectRoot, methods.defaultRoots), false,
      'uncollected and cloned arrays cannot borrow the actual Program proof');
});

test('SDF readable R rejects changes to source, permission, revision, fresh admission and opaque semantics', async t => {
  const methods = sdfReadableSourceComponents();
  const old = await videoIngressProgram(new Map(), { sourceRef: '764020c76b25af571e8b88e80338406d70bdb37a' });
  const commits = 'packages/domain/src/commit/commits.ts', readable = 'packages/sdf-schema/src/readable-core.ts';
  const cases = [
    ['fresh readable validator', commits, text => text.replace('storedCore === undefined ? validateSdfDraftCore(finalCore)', 'storedCore === undefined ? validateReadableSdfDraftCore(finalCore)')],
    ['raw caller core', commits, text => text.replace('core = source.manifest.coreJson as Record<string, unknown>;', 'core = (input as any).sdfCore;')],
    ['cross RO version', commits, text => text.replace('where: { id: input.source.versionId, researchObjectId: ro.id }', 'where: { id: input.source.versionId }')],
    ['stored optimistic conflict', commits, text => text.replace('if (ro.version !== input.version) throw', 'if (false) throw')],
    ['stored transaction lock', commits, text => text.replace('FOR UPDATE`;', '`;')],
    ['missing artifact retention', commits, text => text.replace('deletedAt: null } }) !== new Set(artifactIds).size', 'deletedAt: null } }) !== -1')],
    ['ordinary authority residual', commits, text => text.replace("if (!['owner', 'maintainer', 'author', 'contributor'].includes(membership.role) || (isDefault && membership.role === 'contributor'))", 'if (false)')],
    ['commit persistence residual', commits, text => text.replace('data: { version: input.version + 1 }', 'data: { version: input.version + 2 }')],
    ['old opaque map reinterpreted', readable, text => text.replace("(doc as { schemaVersion?: unknown }).schemaVersion === SDF_READABLE_CORE_VERSION", "'fieldFormats' in doc")],
    ['full reader uses draft validation', readable, text => text.replace('return validateSdfCore(doc);', 'return validateSdfDraftCore(doc);')],
    ['unsupported identity coerced', readable, text => text.replace('return validateSdfDraftCore(doc);', "return validateSdfDraftCore({ ...doc as object, schemaVersion: '0.1.0' });")],
    ['unsafe Ajv mutation option', readable, text => text.replace('new Ajv({ allErrors: true })', 'new Ajv({ allErrors: true, removeAdditional: true })')],
    ['extra eager initialization', readable, text => `${text}\nconst eager = Date.now();\n`],
    ['unsupported format accepted', readable, text => text.replace("enum: ['plain', 'markdown']", "enum: ['plain', 'markdown', 'html']")],
    ['fresh createRO version reopened', 'packages/domain/src/research-object/research-objects.ts', text => text.replace('core.schemaVersion !== undefined && core.schemaVersion !== SDF_CORE_VERSION', 'false')],
    ['journal version reopened', 'packages/domain/src/journal/publishing.ts', text => text.replace('explicitCoreVersion !== undefined && explicitCoreVersion !== SDF_CORE_VERSION', 'false')],
    ['journal strips opaque history', 'packages/domain/src/journal/publishing.ts', text => text.replace('const core = { ...draft.core, schemaVersion:', 'const core = { schemaVersion:')],
    ['unchanged digest exposes spread order', 'packages/domain/src/journal/content.ts', text => text.replace('JSON.stringify(canonical(value))', 'JSON.stringify(value)'), true],
    ['restore caller source substitution', 'packages/domain/src/commit/restore-draft.ts', text => text.replace("source: { kind: 'version', versionId: source.id }", "source: { kind: 'version', versionId: input.versionId + '-other' }")],
    ['extra stored source caller', commits, text => `${text}\nexport const unsafeStoredAlias = createStoredSnapshotCommit;\n`],
    ['internal source escape', commits, text => `${text}\nexport const unsafeInternalAlias = createCommitInternal;\n`],
    ['unchanged namespace acquires new helper', 'packages/domain/src/commit/research-record.ts', text => `import * as snapshots from './commits';\n${text}\nexport const escape = () => snapshots;\n`, true],
    ['unchanged dynamic import acquires new helper', 'packages/domain/src/commit/research-record.ts', text => `${text}\nexport async function escape() { return import('./commits'); }\n`, true],
    ['changed old opaque domain', 'packages/sdf-schema/src/core.ts', text => text.replace("title: 'OpenScience SDF Draft Core',", "title: 'OpenScience SDF Draft Core', additionalProperties: false,")],
  ];
  for (const [name, path, mutate, both] of cases) await t.test(name, async () => {
    const current = await videoIngressProgram(new Map([[path, mutate]]), { trackedSourceOnly: true });
    const previous = both ? await videoIngressProgram(new Map([[path, mutate]]), { sourceRef: '764020c76b25af571e8b88e80338406d70bdb37a' }) : old;
    assert.throws(() => methods.model(current.ts, videoPairContext(current), videoPairContext(previous)),
      error => typeof error.reason === 'string' && error.reason.startsWith('SDF_R_'), name);
  });
});

function voicePairSourceComponents() {
  const component = deployLockSource.slice(deployLockSource.indexOf('function finiteVoiceSourceModel('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  assert.ok(component.startsWith('function finiteVoiceSourceModel('), 'finite voice proof must exist inside the original verifier');
  return runInNewContext(`${component}; ({ model: finiteVoiceSourceModel, writer: finiteVoiceWriterSourceModel, formatReader: typeof finiteVoiceFormatReaderSourceModel === 'function' ? finiteVoiceFormatReaderSourceModel : undefined, pair: finiteVoicePairCompatibility, defaultRoots: APPLICATION_ROLLBACK_READERS })`,
    { resolve, relative, builtinModules, rollbackProofContexts: new WeakMap(), APPLICATION_ROLLBACK_READERS: [] });
}

// Preserve the actually released reader and all its mutations independently of
// the current writer phase. These historical source Programs grant no authority.
const releasedVoiceReaderSource = { sourceRef: '70e81398903db9cfd6f46cbab51db18ba5f7cb05' };

// Pin each complete historical transition independently of later candidate work.
// Inventories, manifests and runtime bytes must belong to the same source ref.
const releasedVoiceFormatReaderSource = { sourceRef: '764020c76b25af571e8b88e80338406d70bdb37a', trackedSourceOnly: true };
const releasedVoiceWriterSource = { sourceRef: '1c88ff813db128fd1933096a2f102c1c1c667b25' };
async function retainedVoiceWriterProgram(changes = new Map(), options = {}) {
  return videoIngressProgram(changes, { ...options, ...releasedVoiceWriterSource });
}

test('voice format reader source reconstructs the actual previous MP3 runtime without granting collector authority', async () => {
  const methods = voicePairSourceComponents();
  const current = await videoIngressProgram(new Map(), releasedVoiceFormatReaderSource);
  const previous = await videoIngressProgram(new Map(), { sourceRef: '1c88ff813db128fd1933096a2f102c1c1c667b25' });
  let model;
  const context = { ...videoPairContext(current), canonical: node => videoPairRuntime(current.ts, node.getText()) };
  try { model = methods.formatReader(current.ts, context, videoPairContext(previous), voiceSourceEntries(current), voiceSourceEntries(previous)); }
  catch (error) { assert.fail(`${error.reason ?? error.message} ${error.node?.getText?.().slice(0, 120) ?? ''}`); }
  assert.equal(model.phase, 'format-reader');
  assert.equal(model.projected.size, 2);
  for (const [path, value] of model.projected) assert.deepEqual(videoPairRuntime(current.ts, value.text),
    videoPairRuntime(previous.ts, previous.program.getSourceFile(resolve(previous.projectRoot, path)).text), path);
  assert.equal(methods.pair(current.ts, voiceSourceEntries(current), voiceSourceEntries(previous), current.projectRoot, previous.projectRoot, []), false);
  assert.equal(methods.pair(current.ts, voiceSourceEntries(current), voiceSourceEntries(previous), current.projectRoot, previous.projectRoot, methods.defaultRoots), false,
    'even the matching roots token cannot replace the private successful collector provenance');
  const terms = voiceSourceEntries(current), oldTerms = voiceSourceEntries(previous);
  const corrupt = values => values.map(([key, value]) => [key, key === 'module:packages/ai-gateway/src/synclip-audio-api.ts' ? ['forged-runtime'] : value]);
  assert.throws(() => methods.formatReader(current.ts, context, videoPairContext(previous), corrupt(terms), oldTerms),
    error => error.reason === 'VOICE_MP3_SOURCE_ENTRY_UNBOUND');
  assert.throws(() => methods.formatReader(current.ts, context, videoPairContext(previous), terms, corrupt(oldTerms)),
    error => error.reason === 'VOICE_MP3_SOURCE_ENTRY_UNBOUND');
});

test('voice format reader source rejects changed producers, late receipts, security and unclassified entries', async t => {
  const methods = voicePairSourceComponents(), rollback = { sourceRef: '1c88ff813db128fd1933096a2f102c1c1c667b25' };
  const gateway = 'packages/ai-gateway/src/synclip-audio-api.ts', voice = 'packages/domain/src/agent/voice.ts';
  const worker = 'apps/agent-worker/src/voice.ts', index = 'apps/agent-worker/src/index.ts';
  const previous = await videoIngressProgram(new Map(), rollback);
  const cases = [
    ['fresh download injection', worker, text => text.replace("    if (!checkpoint) {", "    if (!checkpoint) { options.downloadAudio = async () => ({ bytes: Buffer.alloc(48), format: 'mp3', contentType: 'audio/mpeg' });"), true],
    ['saved-ID download injection', worker, text => text.replace('    if (!checkpoint.providerId)', "    if (checkpoint) options.downloadAudio = async () => ({ bytes: Buffer.alloc(48), format: 'mp3', contentType: 'audio/mpeg' });\n    if (!checkpoint.providerId)"), true],
    ['production factory injection', index, text => text.replace('createHermesVoiceHandlers(options.voiceRuntime)', 'createHermesVoiceHandlers(options.voiceRuntime, { downloadAudio: undefined })'), true],
    ['extra audio receipt caller', voice, text => `${text}\nexport async function extraAudioCaller(deps, prepared, received) { return saveHermesVoiceCheckpoint(deps, prepared.identity, { phase: 'submitted', ...received }); }\n`, true],
    ['late receipt status write', voice, text => text.replace('data: { result: result as unknown as Prisma.InputJsonObject }', "data: { status: 'pending', result: result as unknown as Prisma.InputJsonObject }")],
    ['owner path weakening', voice, text => text.replace('!audio.objectKey.split', 'audio.objectKey.split')],
    ['source authority weakening', voice, text => text.replace("source.status !== 'succeeded'", "source.status !== 'succeeded' && false")],
    ['default MIME change', gateway, text => text.replace("types: ['audio/mpeg', 'application/octet-stream']", "types: ['audio/mpeg', 'audio/wav', 'application/octet-stream']")],
    ['old byte limit change', gateway, text => text.replace('SYNCLIP_AUDIO_MAX_DOWNLOAD_BYTES = 32', 'SYNCLIP_AUDIO_MAX_DOWNLOAD_BYTES = 64')],
    ['TLS change', gateway, text => text.replace('rejectUnauthorized: true', 'rejectUnauthorized: false')],
    ['credential change', gateway, text => text.replace("headers: { Accept: format.accept,", "headers: { Authorization: 'forbidden-fixture', Accept: format.accept,")],
    ['new constant eager effect', gateway, text => text.replace('hermesVoiceAudioMaxBytes = 16 * 1024 * 1024', 'hermesVoiceAudioMaxBytes = Number(16 * 1024 * 1024)')],
    ['dynamic capability escape', gateway, text => `${text}\nexport async function escapedOutput() { return import('@openscience/ai-gateway'); }\n`],
  ];
  for (const [name, path, mutate, both] of cases) await t.test(name, async () => {
    const candidate = await videoIngressProgram(new Map([[path, mutate]]), releasedVoiceFormatReaderSource);
    const old = both ? await videoIngressProgram(new Map([[path, mutate]]), rollback) : previous;
    const context = { ...videoPairContext(candidate), canonical: node => videoPairRuntime(candidate.ts, node.getText()) };
    assert.throws(() => methods.formatReader(candidate.ts, context, videoPairContext(old), voiceSourceEntries(candidate), voiceSourceEntries(old)),
      error => typeof error.reason === 'string' && error.reason.startsWith('VOICE_MP3_'), name);
  });
  const actual = await videoIngressProgram(new Map(), releasedVoiceFormatReaderSource);
  const context = { ...videoPairContext(actual), canonical: node => videoPairRuntime(actual.ts, node.getText()) };
  assert.throws(() => methods.formatReader(actual.ts, context, videoPairContext(previous),
    [...voiceSourceEntries(actual), ['module:packages/new/src/unclassified.ts', []]], voiceSourceEntries(previous)),
  error => error.reason === 'VOICE_MP3_RESIDUAL_ENTRY_CHANGED');
});

test('voice format reader rejects both actual High P1 counterexamples', async t => {
  const methods = voicePairSourceComponents(), rollback = { sourceRef: '1c88ff813db128fd1933096a2f102c1c1c667b25' };
  const worker = 'apps/agent-worker/src/voice.ts', gateway = 'packages/ai-gateway/src/synclip-audio-api.ts';
  const cases = [
    ['MP3 put retained but saved receipt comes from an additional WAV write', worker, text => text.replace(
      "const storedAudio = { objectKey, sha256, bytes: audio.bytes.length, contentType: 'audio/mpeg' as const };",
      "const wavKey = objectKey.replace(/\\.mp3$/u, '.wav'); await deps.storage.putObject(wavKey, audio.bytes, { contentType: 'audio/wav', sha256 }); const storedAudio = { objectKey: wavKey, sha256, bytes: audio.bytes.length, contentType: 'audio/wav' as const };")],
    ['both callbacks replace split before the candidate-only second normalization', gateway, text => text
      .replace('format.decode(Buffer.concat(chunks, size), contentType)', "format.decode(Buffer.concat(chunks, size), contentType.split(';')[0]!.trim().toLowerCase())")
      .replace('const result = ', "String.prototype.split = function () { throw new Error('second normalization'); }; const result = ")],
  ];
  for (const [name, path, mutate] of cases) await t.test(name, async () => {
    const current = await videoIngressProgram(new Map([[path, mutate]]), releasedVoiceFormatReaderSource);
    const old = await videoIngressProgram(new Map([[path, mutate]]), rollback);
    const context = { ...videoPairContext(current), canonical: node => videoPairRuntime(current.ts, node.getText()) };
    assert.throws(() => methods.formatReader(current.ts, context, videoPairContext(old), voiceSourceEntries(current), voiceSourceEntries(old)),
      error => typeof error.reason === 'string' && error.reason.startsWith('VOICE_MP3_'), name);
  });
});

test('voice format reader guards signatures and new output recovery references', async t => {
  const methods = voicePairSourceComponents(), rollback = { sourceRef: '1c88ff813db128fd1933096a2f102c1c1c667b25' };
  const cases = [
    ['reader default evaluation', 'packages/domain/src/agent/voice.ts', text => text.replace('function validAudio(audio: unknown)', 'function validAudio(audio: unknown = globalThis)'), true],
    ['kernel default evaluation', 'packages/ai-gateway/src/synclip-audio-api.ts', text => text.replace('decode: (bytes: Buffer, mime: string) => T }): Promise<T>', 'decode: (bytes: Buffer, mime: string) => T } = {} as never): Promise<T>')],
    ['fresh and submitted new output', 'apps/agent-worker/src/voice.ts', text => text.replaceAll('downloadSynclipAudio', 'downloadHermesVoiceAudio'), true],
    ['namespace output capability', 'apps/agent-worker/src/voice.ts', text => `import * as outputGateway from '@openscience/ai-gateway';\n${text}\nconst exposedOutput = () => outputGateway;\n`, true],
    ['existing runtime loader capability', 'apps/agent-worker/src/ingestion-parser.ts', text => text.replace("loadRuntimeModule('yauzl')", "loadRuntimeModule('@openscience/ai-gateway')"), true],
  ];
  const previous = await videoIngressProgram(new Map(), rollback);
  for (const [name, path, mutate, both] of cases) await t.test(name, async () => {
    const current = await videoIngressProgram(new Map([[path, mutate]]), releasedVoiceFormatReaderSource);
    const old = both ? await videoIngressProgram(new Map([[path, mutate]]), rollback) : previous;
    const context = { ...videoPairContext(current), canonical: node => videoPairRuntime(current.ts, node.getText()) };
    assert.throws(() => methods.formatReader(current.ts, context, videoPairContext(old), voiceSourceEntries(current), voiceSourceEntries(old)),
      error => typeof error.reason === 'string' && error.reason.startsWith('VOICE_MP3_'), name);
  });
});

test('voice format reader binds immutable saved audio and the unique storage write', async t => {
  const methods = voicePairSourceComponents(), path = 'apps/agent-worker/src/voice.ts';
  const rollback = { sourceRef: '1c88ff813db128fd1933096a2f102c1c1c667b25' };
  const cases = [
    ['middle receipt field rewrite', text => text.replace('          try {', "          storedAudio.contentType = 'audio/wav' as never;\n          try {")],
    ['receipt spread override', text => text.replaceAll('audio: storedAudio', "audio: { ...storedAudio, contentType: 'audio/wav' }")],
    ['unclassified computed storage write', text => text.replace('          try {', "          await workerDeps.storage!['putObject']('unclassified.wav', Buffer.alloc(2), { contentType: 'audio/wav' });\n          try {")],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const current = await videoIngressProgram(new Map([[path, mutate]]), releasedVoiceFormatReaderSource);
    const old = await videoIngressProgram(new Map([[path, mutate]]), rollback);
    const context = { ...videoPairContext(current), canonical: node => videoPairRuntime(current.ts, node.getText()) };
    assert.throws(() => methods.formatReader(current.ts, context, videoPairContext(old), voiceSourceEntries(current), voiceSourceEntries(old)),
      error => typeof error.reason === 'string' && error.reason.startsWith('VOICE_MP3_'), name);
  });
});

test('voice format reader rejects shadowed save and late-discard receipt symbols', async () => {
  const methods = voicePairSourceComponents(), path = 'apps/agent-worker/src/voice.ts';
  const shadow = text => text.replace('          try {', '          await (async (storedAudio) => {\n          try {')
    .replace(/            throw error;\r?\n          \}/u,
      "$&\n          })({ objectKey: `derived/hermes-voice/${originalIdentity.userId}/${originalIdentity.taskId}/${'b'.repeat(64)}.wav`, sha256: 'b'.repeat(64), bytes: 48, contentType: 'audio/wav' as const });");
  const current = await videoIngressProgram(new Map([[path, shadow]]), releasedVoiceFormatReaderSource);
  const previous = await videoIngressProgram(new Map([[path, shadow]]), { sourceRef: '1c88ff813db128fd1933096a2f102c1c1c667b25' });
  const context = { ...videoPairContext(current), canonical: node => videoPairRuntime(current.ts, node.getText()) };
  assert.throws(() => methods.formatReader(current.ts, context, videoPairContext(previous), voiceSourceEntries(current), voiceSourceEntries(previous)),
    error => error.reason === 'VOICE_MP3_LOCAL_BINDING_CHANGED');
});

test('voice format reader closes module factory escapes without erasing decoder evaluation', async t => {
  const methods = voicePairSourceComponents(), rollback = { sourceRef: '1c88ff813db128fd1933096a2f102c1c1c667b25' };
  const previous = await videoIngressProgram(new Map(), rollback);
  const cases = [
    ['module factory alias', 'apps/agent-worker/src/ingestion-parser.ts', text => text.replace('const loadRuntimeModule = createRequire(__filename);', 'const factoryAlias = createRequire; const loadRuntimeModule = factoryAlias(__filename);'), true],
    ['module namespace factory', 'apps/agent-worker/src/ingestion-parser.ts', text => text.replace("import { createRequire } from 'node:module';", "import * as nativeModule from 'node:module';").replace('createRequire(__filename)', 'nativeModule.createRequire(__filename)'), true],
    ['decoder extra evaluation', 'packages/ai-gateway/src/synclip-audio-api.ts', text => text.replace('format.decode(Buffer.concat(chunks, size), contentType)', 'format.decode(Buffer.concat(chunks, size), (Date.now(), contentType))')],
  ];
  for (const [name, path, mutate, both] of cases) await t.test(name, async () => {
    const current = await videoIngressProgram(new Map([[path, mutate]]), releasedVoiceFormatReaderSource);
    const old = both ? await videoIngressProgram(new Map([[path, mutate]]), rollback) : previous;
    const context = { ...videoPairContext(current), canonical: node => videoPairRuntime(current.ts, node.getText()) };
    assert.throws(() => methods.formatReader(current.ts, context, videoPairContext(old), voiceSourceEntries(current), voiceSourceEntries(old)),
      error => typeof error.reason === 'string' && error.reason.startsWith('VOICE_MP3_'), name);
  });
});

test('voice reader source proof preserves the actual old runtime and source-only Programs grant no deployment authority', async () => {
  const methods = voicePairSourceComponents(), actual = await videoIngressProgram(new Map(), releasedVoiceReaderSource);
  const old = await videoIngressProgram(new Map(), { sourceRef: '3a93eb49137a67b2c12ef0ca89d7327c68c8e1b5' });
  let model;
  try { model = methods.model(actual.ts, videoPairContext(actual), videoPairContext(old)); }
  catch (error) { assert.fail(`${error.reason ?? error.message} ${error.node?.getText?.().slice(0, 160) ?? ''}`); }
  assert.equal(model.phase, 'reader');
  assert.equal(model.domain, 'rollback-produced-state');
  assert.ok(model.capsules.size >= 4, 'actual new initialization/call closure is analyzed');
  for (const [key, value] of model.projected) assert.deepEqual(videoPairRuntime(actual.ts, value.text),
    videoPairRuntime(old.ts, old.program.getSourceFile(resolve(old.projectRoot, key)).text), key);
  assert.equal(methods.pair(actual.ts, [], [], actual.projectRoot, old.projectRoot, []), false,
    'source proof never fabricates a genuine DEFAULT collector');
});

test('voice reader proof rejects opened admission, leaked private results, rearmed retry, lost late receipts and changed legacy audio', async () => {
  const methods = voicePairSourceComponents();
  const old = await videoIngressProgram(new Map(), { sourceRef: '3a93eb49137a67b2c12ef0ca89d7327c68c8e1b5' });
  for (const [path, change] of [
    ['packages/domain/src/agent/voice-contract.ts', value => value.replace('return false;', 'return true;')],
    ['packages/domain/src/agent/voice-contract.ts', value => value.replace('export function isHermesVoiceWriterEnabled', 'export async function isHermesVoiceWriterEnabled')],
    ['packages/domain/src/agent/voice.ts', value => value.replace('if (!isHermesVoiceWriterEnabled())', 'if (false)')],
    ['packages/domain/src/agent/voice.ts', value => value.replace('function blocked(', 'async function blocked(')],
    ['apps/agent-worker/src/voice.ts', value => value.replace('if (!checkpoint && !isHermesVoiceWriterEnabled())', 'if (false)')],
    ['packages/domain/src/agent/agent.ts', value => value.replace('if (isHermesVoiceTaskKind(kind)) return null;', 'if (isHermesVoiceTaskKind(kind)) return rawResult as Record<string, unknown>;')],
    ['packages/domain/src/agent/agent.ts', value => value.replace('canRetry: !isHermesVoiceTaskKind(task.kind) && canRetry', 'canRetry: canRetry')],
    ['packages/domain/src/agent/agent.ts', value => value.replace("throw new AgentError('VALIDATION_ERROR', 'Voice tasks require the dedicated Hermes voice submission');", 'return persistAgentTaskCoreInTransaction(deps, tx, input, ctx);')],
    ['packages/domain/src/agent/voice.ts', value => value.replace('data: { result: result as unknown as Prisma.InputJsonObject }', "data: { result: result as unknown as Prisma.InputJsonObject, status: 'pending' }")],
    ['packages/domain/src/agent/voice.ts', value => value.replace('result: voiceResultEquals(task.result) }, data:', 'result: undefined }, data:')],
    ['packages/domain/src/agent/voice.ts', value => value.replace('const next: HermesVoiceCheckpoint =', 'if (task.deletedAt) return prior; const next: HermesVoiceCheckpoint =')],
    ['packages/domain/src/agent/voice-contract.ts', value => value.replace('if (stopped) return { operation };', 'if (stopped) return { ...checkpoint } as any;')],
    ['packages/domain/src/agent/voice.ts', value => value.replace('if (!hasHermesVoiceCheckpoint(result))', 'fetch("https://example.invalid"); if (!hasHermesVoiceCheckpoint(result))')],
    ['packages/ai-gateway/src/synclip-voice.ts', value => value.replace('const path = env.', 'fetch("https://example.invalid"); const path = env.')],
    ['apps/agent-worker/src/voice.ts', value => value.replace('const originalIdentity = checkpoint.identity;', "await runtime.client.create({ text: 'unsafe', voice: 'unsafe' }); const originalIdentity = checkpoint.identity;")],
    ['packages/ai-gateway/src/synclip-audio-api.ts', value => value.replace("...(typeof body === 'string' ? { 'Content-Type': 'application/json' } : {})", "...(typeof body === 'string' ? {} : {})")],
    ['packages/ai-gateway/src/synclip-audio-api.ts', value => value.replace('return transcriptionTask(await this.#request', "await this.#request('POST', '/asr'); return transcriptionTask(await this.#request")],
    ['packages/domain/src/agent/voice-contract.ts', value => value + '\nfetch("https://example.invalid");\n'],
    ['packages/domain/src/agent/voice-contract.ts', value => 'import "./agent";\n' + value],
  ]) {
    const changed = await videoIngressProgram(new Map([[path, change]]), releasedVoiceReaderSource);
    assert.throws(() => methods.model(changed.ts, videoPairContext(changed), videoPairContext(old)),
      error => typeof error.reason === 'string' && error.reason.startsWith('VOICE_'), path);
  }
});

test('voice reader High boundaries reject discarded operand effects and dispatch before authority', async () => {
  const methods = voicePairSourceComponents();
  const old = await videoIngressProgram(new Map(), { sourceRef: '3a93eb49137a67b2c12ef0ca89d7327c68c8e1b5' });
  const prematureDispatch = (value, name, taskId) => {
    const file = old.ts.createSourceFile('voice.ts', value, old.ts.ScriptTarget.ES2022, true);
    const fn = file.statements.find(node => old.ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.ok(fn?.body, name);
    const position = fn.body.getStart(file) + 1;
    return value.slice(0, position) + ` await dispatchAgentTask(deps, ${taskId});` + value.slice(position);
  };
  const accepted = [];
  for (const [label, path, change] of [
    ['P1a retryCount increment', 'packages/domain/src/agent/agent.ts', value => value.replace(
      "if (isHermesVoiceTaskKind(task.kind)) return { authorityValid: true, canRetry: false };",
      "if (task.retryCount++ >= 0 && isHermesVoiceTaskKind(task.kind)) return { authorityValid: true, canRetry: false };")],
    ['P1b unauthorised GET dispatch', 'packages/domain/src/agent/voice.ts', value => value.replace(
      'export async function getHermesVoiceTask(deps: HermesVoiceDeps, input: { userId: string; taskId: string }): Promise<AgentTaskView> {',
      'export async function getHermesVoiceTask(deps: HermesVoiceDeps, input: { userId: string; taskId: string }): Promise<AgentTaskView> { await dispatchAgentTask(deps, input.taskId);')],
    ...[
      ['findHermesVoiceSubmission', 'input.idempotencyKey'], ['loadHermesVoiceExecution', 'input.taskId'],
      ['resumeHermesVoiceTask', 'input.taskId'], ['getHermesVoiceAudio', 'input.taskId'],
      ['finalizeHermesVoiceTask', 'execution.identity.taskId'], ['saveHermesVoiceCheckpoint', 'identity.taskId'],
    ].map(([name, taskId]) => [`P1b ${name} entry`, 'packages/domain/src/agent/voice.ts', value => prematureDispatch(value, name, taskId)]),
  ]) {
    const changed = await videoIngressProgram(new Map([[path, change]]), releasedVoiceReaderSource);
    try { methods.model(changed.ts, videoPairContext(changed), videoPairContext(old)); accepted.push(label); }
    catch (error) { assert.match(error.reason ?? '', /^VOICE_/u, label); }
  }
  assert.deepEqual(accepted, [], 'both exact High counterexamples must fail closed');
});

function voiceSourceEntries(value) {
  // Conditional source terms, never successful collector arrays. Each source
  // module in these Programs participates; the pair still refuses this data.
  return value.program.getSourceFiles().filter(file => file.fileName.replaceAll('\\', '/').startsWith(value.projectRoot.replaceAll('\\', '/'))
    && !/^apps\/(?:api|web)\//u.test(relative(value.projectRoot, file.fileName).replaceAll('\\', '/')))
    .map(file => [`module:${relative(value.projectRoot, file.fileName).replaceAll('\\', '/')}`, videoPairRuntime(value.ts, file.text)]);
}

test('voice writer source transition permits only the pure selector while retaining reader and every remaining entry', async () => {
  const methods = voicePairSourceComponents(), reader = await videoIngressProgram(new Map(), releasedVoiceReaderSource);
  const key = 'packages/domain/src/agent/voice-contract.ts';
  const writer = await retainedVoiceWriterProgram(new Map(), { trackedSourceOnly: true });
  const entries = voiceSourceEntries;
  const a = entries(writer), b = entries(reader);
  const model = methods.writer(writer.ts, videoPairContext(writer), videoPairContext(reader), a, b);
  assert.equal(model.phase, 'writer');
  assert.deepEqual(videoPairRuntime(writer.ts, model.text), videoPairRuntime(reader.ts, reader.program.getSourceFile(resolve(reader.projectRoot, key)).text));
  const old = await videoIngressProgram(new Map(), { sourceRef: '3a93eb49137a67b2c12ef0ca89d7327c68c8e1b5' });
  assert.throws(() => methods.model(writer.ts, videoPairContext(writer), videoPairContext(old)),
    error => error.reason === 'VOICE_FRESH_PHASE_NOT_READER', 'writer-origin state cannot use the reader-to-old proof');
  assert.throws(() => methods.writer(writer.ts, videoPairContext(writer), videoPairContext(old), a, entries(old)),
    error => error.reason === 'VOICE_WRITER_READER_CONTEXT_CHANGED', 'the old release is not the compatible voice reader');
  for (const path of ['packages/domain/src/agent/voice.ts', 'packages/ai-gateway/src/synclip-audio-api.ts',
    'packages/domain/src/agent/first-image-continuation.ts']) {
    const changed = a.map(row => row[0] === `module:${path}` ? [row[0], 'changed actual source-runtime term'] : row);
    assert.notDeepEqual(changed, a, path);
    assert.throws(() => methods.writer(writer.ts, videoPairContext(writer), videoPairContext(reader), changed, b),
      error => error.reason === 'VOICE_WRITER_READER_CONTEXT_CHANGED');
  }
  assert.throws(() => methods.writer(writer.ts, videoPairContext(writer), videoPairContext(reader), [...a, ['module:packages/new/src/runtime.ts', []]], b));
  assert.equal(methods.pair(writer.ts, a, b, writer.projectRoot, reader.projectRoot, []), false);
  const privateGate = value => value.replace('if (isHermesVoiceTaskKind(kind)) return null;',
    'if (isHermesVoiceTaskKind(kind)) return isHermesVoiceWriterEnabled() ? rawResult as Record<string, unknown> : null;');
  const unsafeReader = await videoIngressProgram(new Map([['packages/domain/src/agent/agent.ts', privateGate]]), releasedVoiceReaderSource);
  const unsafeWriter = await retainedVoiceWriterProgram(new Map([['packages/domain/src/agent/agent.ts', privateGate]]), { trackedSourceOnly: true });
  assert.throws(() => methods.writer(unsafeWriter.ts, videoPairContext(unsafeWriter), videoPairContext(unsafeReader), entries(unsafeWriter), entries(unsafeReader)),
    error => error.reason === 'VOICE_WRITER_READER_CONTEXT_CHANGED', 'the same new private phase-dependent behavior in both roots must reject');
});

test('voice writer source inventory bounds ambient JavaScript resolution without hiding explicit mutations', async () => {
  const methods = voicePairSourceComponents();
  const client = 'packages/search/src/client.ts', extra = 'packages/search/generated/voice-source-boundary.js';
  // A neutral output-module sentinel exercises filesystem visibility; it does
  // not substitute a generated Prisma client or execute application code.
  const text = 'export const sourceBoundarySentinel = 1;\n';
  const changes = new Map([[client, value => `import '../generated/voice-source-boundary.js';\n${value}`]]);
  const ambientSources = new Map([[extra, text]]);
  const reader = await videoIngressProgram(changes, { ...releasedVoiceReaderSource, ambientSources, trackedSourceOnly: true });
  const raw = await retainedVoiceWriterProgram(changes, { ambientSources });
  const get = value => value.program.getSourceFile(resolve(value.projectRoot, extra));
  assert.equal(get(raw)?.text, text, 'the default filesystem view must resolve the ambient module');
  const file = raw.program.getSourceFile(resolve(raw.projectRoot, client));
  const imported = file.statements.find(node => raw.ts.isImportDeclaration(node)
    && node.moduleSpecifier.text === '../generated/voice-source-boundary.js');
  assert.ok(raw.program.getTypeChecker().getSymbolAtLocation(imported.moduleSpecifier)?.declarations
    ?.some(node => node.getSourceFile() === get(raw)), 'the real import must bind the extra JS before comparison');
  assert.throws(() => methods.writer(raw.ts, videoPairContext(raw), videoPairContext(reader), voiceSourceEntries(raw), voiceSourceEntries(reader)),
    error => error.reason === 'VOICE_WRITER_READER_CONTEXT_CHANGED');
  const scoped = await retainedVoiceWriterProgram(changes, { ambientSources, trackedSourceOnly: true });
  assert.equal(Boolean(get(scoped)), false, 'the source inventory must exclude ambient JS during resolution, not after comparison');
  assert.equal(get(reader), undefined);
  assert.equal(methods.writer(scoped.ts, videoPairContext(scoped), videoPairContext(reader), voiceSourceEntries(scoped), voiceSourceEntries(reader)).phase, 'writer');
  const explicit = await retainedVoiceWriterProgram(new Map([...changes, [extra, text]]), { ambientSources, trackedSourceOnly: true });
  assert.equal(get(explicit)?.text, text, 'an explicit source mutation must remain visible even outside the tracked inventory');
  const explicitClient = explicit.program.getSourceFile(resolve(explicit.projectRoot, client));
  const explicitImport = explicitClient.statements.find(node => explicit.ts.isImportDeclaration(node)
    && node.moduleSpecifier.text === '../generated/voice-source-boundary.js');
  assert.ok(explicit.program.getTypeChecker().getSymbolAtLocation(explicitImport.moduleSpecifier)?.declarations
    ?.some(node => node.getSourceFile() === get(explicit)), 'the explicit new JS must bind the real import even in a scoped historical Program');
  assert.throws(() => methods.writer(explicit.ts, videoPairContext(explicit), videoPairContext(reader), voiceSourceEntries(explicit), voiceSourceEntries(reader)),
    error => error.reason === 'VOICE_WRITER_READER_CONTEXT_CHANGED');
  await assert.rejects(retainedVoiceWriterProgram(new Map([[extra, value => value + text]])),
    /mutation must target historical source/u, 'function mutations cannot invent missing historical bytes');
});

test('voice writer tracked runtime mutations retain exact current bytes and strict residual rejection', async () => {
  const methods = voicePairSourceComponents(), reader = await videoIngressProgram(new Map(), releasedVoiceReaderSource);
  const path = 'packages/ai-gateway/src/synclip-audio-api.ts';
  const text = reader.program.getSourceFile(resolve(reader.projectRoot, path)).text + '\nexport const voiceSourceMutationSentinel = true;\n';
  const writer = await retainedVoiceWriterProgram(new Map([[path, text]]), { trackedSourceOnly: true });
  assert.equal(writer.program.getSourceFile(resolve(writer.projectRoot, path)).text, text,
    'tracked-source inventory must preserve the exact current mutation, not read a HEAD blob');
  assert.throws(() => methods.writer(writer.ts, videoPairContext(writer), videoPairContext(reader), voiceSourceEntries(writer), voiceSourceEntries(reader)),
    error => error.reason === 'VOICE_WRITER_READER_CONTEXT_CHANGED');
});

test('image producer partition uses the real initializer and preserves all consumer runtime', async () => {
  const component = deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  assert.ok(component.startsWith('function finiteImageProducerTerms('));
  const terms = runInNewContext(`${component}; finiteImageProducerTerms`, { resolve, relative });
  const actual = await videoIngressProgram();
  const original = terms(actual.ts, videoPairContext(actual));
  assert.equal(original.kind, 'absent');
  const path = 'packages/domain/src/agent/agent.ts';
  const writer = await videoIngressProgram(new Map([[path, text => text.replace(
    "nativeReviewResult ? initialNativeAgentExecution(deps.nativeAgentRuntime, 'image-review')",
    "nativeReviewResult ? initialNativeAgentExecution(deps.nativeAgentRuntime, 'image-review', 'image-review-tool-final-v1')")]]));
  const tagged = terms(writer.ts, videoPairContext(writer));
  assert.equal(tagged.kind, 'tagged');
  assert.deepEqual(videoPairRuntime(actual.ts, original.text), videoPairRuntime(writer.ts, tagged.text));
  for (const argument of ['undefined', 'input.payload.policy']) {
    const unknown = await videoIngressProgram(new Map([[path, text => text.replace(
      "nativeReviewResult ? initialNativeAgentExecution(deps.nativeAgentRuntime, 'image-review')",
      `nativeReviewResult ? initialNativeAgentExecution(deps.nativeAgentRuntime, 'image-review', ${argument})`)]]));
    assert.throws(() => terms(unknown.ts, videoPairContext(unknown)), error => error.reason === 'IMAGE_PRODUCER_BINDING_UNKNOWN');
  }
});

test('image constructor partition refuses untagged raw-turn emission at the actual Session writer', async () => {
  const component = deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const partition = runInNewContext(`${component}; finiteImageProtocolPartition`, { resolve, relative });
  const actual = await videoIngressProgram();
  const model = partition(actual.ts, videoPairContext(actual));
  assert.equal(model.status, 'conditional');
  assert.equal(model.producer.kind, 'absent');
  assert.equal(model.writers.length, 5);
  assert.equal(model.outstanding.length, 4);
  const path = 'apps/agent-worker/src/native-agent/session.ts';
  for (const change of [
    text => text.replace(/ && binding\.imageReview\.imageResultPolicy === 'image-review-tool-final-v1'(\r?\n\s*&& messages\.some)/u, '$1'),
    text => text.replace("{ state: 'started', target, request: { messages, options }, effectiveOptions: boundedOptions }",
      "{ state: 'started', target, request: { messages, options }, effectiveOptions: boundedOptions, imageResultPolicy: 'image-review-tool-final-v1' }"),
  ]) {
    const unsafe = await videoIngressProgram(new Map([[path,change]]));
    assert.throws(() => partition(unsafe.ts, videoPairContext(unsafe)), error => error.reason === 'IMAGE_PROTOCOL_PARTITION_UNKNOWN');
  }
});

test('image cyclic imports inspect the actual owned freezer and eager initializer effects', async () => {
  const component = deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const initialization = runInNewContext(`${component}; finiteImageInitializationTerms`, { resolve, relative });
  const actual = await videoIngressProgram();
  const model = initialization(actual.ts, videoPairContext(actual));
  assert.equal(model.status, 'conditional');
  assert.equal(model.sources.length, 3);
  assert.ok(model.freezer);
  for (const change of [
    text => text.replace("Object.values(value).forEach(freeze);", "Object.values(value).forEach(freeze); globalThis.imageProtocolChanged = true;"),
    text => text.replace("const resultTool: ChatToolDefinition = freeze({", "const resultTool: ChatToolDefinition = (globalThis.imageProtocolChanged = true, freeze)({"),
  ]) {
    const unsafe = await videoIngressProgram(new Map([['packages/ai-gateway/src/native-image-review.ts',change]]));
    assert.throws(() => initialization(unsafe.ts, videoPairContext(unsafe)), error => error.reason === 'IMAGE_INITIALIZATION_UNKNOWN');
  }
  // Pure operands alone do not make arithmetic nonthrowing. These are actual
  // eager initializer nodes in the SCC, including the independently observed
  // BigInt zero-division counterexample; no application module is executed.
  const path='packages/ai-gateway/src/native-image-review.ts';
  const original=actual.program.getSourceFile(resolve(actual.projectRoot,path)).text;
  for (const expression of ['1n / 0n',
    "({ valueOf: () => { throw new Error('coercion'); } }) + 1"]){
    const mutated=`${original}\nconst imageInitializationCrash = ${expression};\n`;
    const unsafe=await videoIngressProgram(new Map([[path,mutated]]));
    assert.equal(unsafe.program.getSourceFile(resolve(unsafe.projectRoot,path)).text,mutated);
    assert.throws(()=>initialization(unsafe.ts,videoPairContext(unsafe)),
      error=>error.reason==='IMAGE_INITIALIZATION_UNKNOWN',`must not erase potentially throwing initializer ${expression}`);
  }
  const numeric=await videoIngressProgram(new Map([['packages/ai-gateway/src/native-image-review.ts',text=>
    `${text}\nconst imageInitializationNumeric = -(2 * 1024) + 4 / 0 + 2 ** 3;\n`]]));
  assert.equal(initialization(numeric.ts,videoPairContext(numeric)).status,'conditional',
    'number-literal arithmetic remains nonthrowing even when its result is nonfinite');
});

test('image store binds its three modes to the original captured image attempt', async () => {
  const component = deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const analyze = runInNewContext(`${component}; finiteImageStoreFlowTerms`,{ resolve,relative });
  const actual = await videoIngressProgram(), model = analyze(actual.ts,videoPairContext(actual));
  assert.equal(model.status,'conditional');
  assert.deepEqual(Array.from(model.modes,([name,value]) => [name,value.mode]),[
    ['compareAndSet','start'],['complete','paid'],['finalize','final'],
  ]);
  for (const [file,change] of [
    ['apps/agent-worker/src/presentation/handler.ts',text => text.replace(
      'task: { id: task.id, executionAttempt: task.executionAttempt, result: currentTask.result },','task,')],
    ['apps/agent-worker/src/native-agent/task-store.ts',text => text.replace(
      "complete: (previous, state) => update(previous, state, 'paid')","complete: (previous, state) => update(previous, state, 'start')")],
  ]) {
    const unsafe = await videoIngressProgram(new Map([[file,change]]));
    assert.throws(() => analyze(unsafe.ts,videoPairContext(unsafe)),error => error.reason === 'IMAGE_STORE_FLOW_UNKNOWN');
  }
});

test('image initializer projection preserves the retained real legacy function on every supported caller', async () => {
  const component = deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const project = runInNewContext(`${component}; finiteImageInitializerProjection`,{ resolve,relative });
  const path = 'packages/domain/src/agent/native-agent-execution.ts';
  // This unchanged file is already in the workflow's retained source fixture;
  // the accepting deployment pair still uses its actual installed rollback.
  const legacyText = execFileSync('git',['show',`ca0a5b1ce6b7228e04d0212a8a96b07d8adbf4a6:${path}`],{ encoding:'utf8' });
  const actual = await videoIngressProgram(), legacy = await videoIngressProgram(new Map([[path,legacyText]]));
  const model = project(actual.ts,videoPairContext(actual),videoPairContext(legacy));
  assert.equal(model.status,'conditional');
  assert.deepEqual(videoPairRuntime(actual.ts,model.text),videoPairRuntime(legacy.ts,model.rollback.getText()));
});

test('image Session projection retains the complete original untagged runtime and read order', async () => {
  const component = deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const project = runInNewContext(`${component}; finiteImageSessionProjection`,{ resolve,relative });
  const path = 'apps/agent-worker/src/native-agent/session.ts';
  const text = execFileSync('git',['show',`ca0a5b1ce6b7228e04d0212a8a96b07d8adbf4a6:${path}`],{ encoding:'utf8' });
  const actual = await videoIngressProgram(), legacy = await videoIngressProgram(new Map([[path,text]]));
  const model = project(actual.ts,videoPairContext(actual),videoPairContext(legacy));
  assert.equal(model.status,'conditional');
  assert.deepEqual(videoPairRuntime(actual.ts,model.text),videoPairRuntime(legacy.ts,text));
});

test('image decoder projection preserves the actual old private checkpoint decoder', async () => {
  const component = deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const project = runInNewContext(`${component}; finiteImageDecoderProjection`,{ resolve,relative });
  const path = 'packages/domain/src/assets/native-image-review.ts';
  const text = execFileSync('git',['show',`ca0a5b1ce6b7228e04d0212a8a96b07d8adbf4a6:${path}`],{ encoding:'utf8' });
  const actual = await videoIngressProgram(), legacy = await videoIngressProgram(new Map([[path,text]]));
  const model = project(actual.ts,videoPairContext(actual),videoPairContext(legacy));
  assert.equal(model.status,'conditional');
  assert.deepEqual(videoPairRuntime(actual.ts,model.text),videoPairRuntime(legacy.ts,text));
  for (const change of [
    value => value.replace("Boolean(value && typeof value === 'object' && !Array.isArray(value))",
      "Boolean(value && typeof value === 'object' && !Array.isArray(value) && globalThis.imageDecoderSideEffect())"),
    value => value.replace("const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)",
      "const hash = (value: unknown) => typeof value === 'string'"),
    value => value.replace("export function readNativeImageAgentExecution(result: unknown): NativeAgentExecution | undefined {",
      "export function readNativeImageAgentExecution(result: unknown): NativeAgentExecution | undefined { void (result as any).nativeAgentExecution.imageResultPolicy;"),
    value => value.replace("!hash(cp.responseHash) || typeof cp.hasToolCalls", "typeof cp.hasToolCalls"),
  ]) {
    const unsafe = await videoIngressProgram(new Map([[path,change]]));
    assert.throws(() => {
      const projected=project(unsafe.ts,videoPairContext(unsafe),videoPairContext(legacy));
      assert.deepEqual(videoPairRuntime(unsafe.ts,projected.text),videoPairRuntime(legacy.ts,text));
    },'a changed decoder/predicate or an unsafe pre-record read must not erase into the original runtime');
  }
});

test('image store projection retains actual private bytes, known references and paid/live CAS', async () => {
  const component=deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const project=runInNewContext(`${component}; finiteImageStoreProjection`,{resolve,relative});
  const path='apps/agent-worker/src/native-agent/task-store.ts';
  const text=execFileSync('git',['show',`ca0a5b1ce6b7228e04d0212a8a96b07d8adbf4a6:${path}`],{encoding:'utf8'});
  const actual=await videoIngressProgram(),legacy=await videoIngressProgram(new Map([[path,text]]));
  const model=project(actual.ts,videoPairContext(actual),videoPairContext(legacy));
  assert.equal(model.status,'conditional');
  assert.deepEqual(videoPairRuntime(actual.ts,model.text),videoPairRuntime(legacy.ts,text));
  for(const change of [
    value=>value.replace('expected: old,','expected: preparedReference,'),
    value=>value.replace('expectedExecution: input.execution','expectedExecution: undefined'),
    value=>value.replace('JSON.stringify(state)','JSON.stringify({ ...state, added: true })'),
    value=>value.replace('if (changed.count !== 1) blocked();','if (changed.count < 0) blocked();'),
    value=>value.replace("if (binding.sourceKind === 'journal-text') blocked();",
      "if (turn.imageResultPolicy) throw new Error('unsafe pre-turn read'); if (binding.sourceKind === 'journal-text') blocked();"),
  ]){
    const unsafe=await videoIngressProgram(new Map([[path,change]]));
    assert.throws(()=>{
      const projected=project(unsafe.ts,videoPairContext(unsafe),videoPairContext(legacy));
      assert.deepEqual(videoPairRuntime(unsafe.ts,projected.text),videoPairRuntime(legacy.ts,text));
    },'changed old/new reference, full execution fence, bytes or CAS count must not project to the retained store');
  }
});

test('image Domain projection preserves the entire original execution and compare-and-set module', async () => {
  const component=deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const project=runInNewContext(`${component}; finiteImageExecutionProjection`,{resolve,relative});
  const path='packages/domain/src/agent/native-agent-execution.ts';
  const text=execFileSync('git',['show',`ca0a5b1ce6b7228e04d0212a8a96b07d8adbf4a6:${path}`],{encoding:'utf8'});
  const actual=await videoIngressProgram(),legacy=await videoIngressProgram(new Map([[path,text]]));
  const model=project(actual.ts,videoPairContext(actual),videoPairContext(legacy));
  assert.equal(model.status,'conditional');
  assert.deepEqual(videoPairRuntime(actual.ts,model.text),videoPairRuntime(legacy.ts,text));
  for(const change of [
    value=>value.replace('old.executionAttempt !== input.executionAttempt','old.executionAttempt === input.executionAttempt'),
    value=>value.replace('result: { equals: task.result as Prisma.InputJsonValue }','result: { equals: result as Prisma.InputJsonValue }'),
    value=>value.replace('if (changed.count !== 1) blocked();','if (changed.count > 1) blocked();'),
    value=>value.replace('const marker = readNativeAgentExecution(task.result);',
      "const marker = readNativeAgentExecution(task.result); if (marker.imageResultPolicy) blocked();"),
  ]){
    const unsafe=await videoIngressProgram(new Map([[path,change]]));
    assert.throws(()=>{
      const projected=project(unsafe.ts,videoPairContext(unsafe),videoPairContext(legacy));
      assert.deepEqual(videoPairRuntime(unsafe.ts,projected.text),videoPairRuntime(legacy.ts,text));
    },'original attempt, fetched-result equality and exactly-one CAS must remain in the actual Domain function');
  }
});

test('image illustration projection preserves the original complete image-role entry', async () => {
  const component=deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const project=runInNewContext(`${component}; finiteImageIllustrationProjection`,{resolve,relative});
  const path='apps/agent-worker/src/native-agent/illustration-task.ts';
  const text=execFileSync('git',['show',`ca0a5b1ce6b7228e04d0212a8a96b07d8adbf4a6:${path}`],{encoding:'utf8'});
  const actual=await videoIngressProgram(),legacy=await videoIngressProgram(new Map([[path,text]]));
  const entry=(ts,text)=>{
    const source=ts.createSourceFile(path,text,ts.ScriptTarget.ES2022,true);
    const entries=source.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='runNativeImageReviewTask');
    assert.equal(entries.length,1);return entries[0].getText(source);
  };
  const model=project(actual.ts,videoPairContext(actual),videoPairContext(legacy));
  assert.equal(model.status,'conditional');
  // Only this image function is equal in the retained ca0a source fixture;
  // the full installed pair must separately preserve e75's video A reader.
  assert.deepEqual(videoPairRuntime(actual.ts,entry(actual.ts,model.text)),videoPairRuntime(legacy.ts,entry(legacy.ts,text)));
  for(const change of [
    value=>value.replace('await input.authorize(tx);','void input.authorize;'),
    value=>value.replace("checkpoint?.mode !== 'agent-native' || !isDeepStrictEqual(agentNativeImageReviewEnvelope(checkpoint), envelope)","checkpoint?.mode !== 'agent-native'"),
  ]){
    const unsafe=await videoIngressProgram(new Map([[path,change]]));
    assert.throws(()=>{
      const projected=project(unsafe.ts,videoPairContext(unsafe),videoPairContext(legacy));
      assert.deepEqual(videoPairRuntime(unsafe.ts,entry(unsafe.ts,projected.text)),videoPairRuntime(legacy.ts,entry(legacy.ts,text)));
    },'common source authority and whole exact current envelope must remain before every new branch');
  }
});

test('image Host projection keeps the original SDK response and finish guards', async () => {
  const component=deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const project=runInNewContext(`${component}; finiteImageHostProjection`,{resolve,relative});
  const path='apps/agent-worker/src/native-agent/host-task.ts';
  const text=execFileSync('git',['show',`ca0a5b1ce6b7228e04d0212a8a96b07d8adbf4a6:${path}`],{encoding:'utf8'});
  const actual=await videoIngressProgram(),legacy=await videoIngressProgram(new Map([[path,text]]));
  const model=project(actual.ts,videoPairContext(actual),videoPairContext(legacy));
  assert.equal(model.status,'conditional');
  assert.deepEqual(videoPairRuntime(actual.ts,model.text),videoPairRuntime(legacy.ts,text));
  for(const [file,change] of [
    [path,value=>value.replace('last.response.text.trim() !== value.finalResponse','last.response.text.trim() === value.finalResponse')],
    ['packages/ai-gateway/src/native-agent-bridge.ts',value=>value.replace("message: { role: 'assistant', content: completion.text,",
      "message: { role: 'assistant', content: completion.text, get tool_calls() { throw new Error('not an owned data property'); },")],
  ]){
    const unsafe=await videoIngressProgram(new Map([[file,change]]));
    assert.throws(()=>{
      const projected=project(unsafe.ts,videoPairContext(unsafe),videoPairContext(legacy));
      assert.deepEqual(videoPairRuntime(unsafe.ts,projected.text),videoPairRuntime(legacy.ts,text));
    },'Host final equality and plain owned message shape cannot be waived');
  }
});

test('image SDK option domain follows actual request and all Session binding constructors', async () => {
  const component=deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const analyze=runInNewContext(`${component}; finiteImageSdkOptionTerms`,{resolve,relative});
  const actual=await videoIngressProgram(),model=analyze(actual.ts,videoPairContext(actual));
  assert.equal(model.status,'conditional');assert.ok(model.sites.length>0);
  assert.deepEqual([...model.assignments].sort(),['maxTokens','temperature','topP']);
  assert.ok(!model.keys.some(key=>['toolChoice','tool_choice','imageResultPolicy','policy'].includes(key)));
  for(const [path,change] of [
    ['packages/ai-gateway/src/native-agent-bridge.ts',value=>value.replace('const snapshot = snapshotChatMessages(messages);',
      "options.policy = 'image-review-tool-final-v1'; const snapshot = snapshotChatMessages(messages);")],
    ['apps/agent-worker/src/native-agent/illustration-task.ts',value=>value.replace("generation: { thinking: 'adaptive' as const, temperature: 0.1 }",
      "generation: { thinking: 'adaptive' as const, temperature: 0.1, policy: undefined }")],
  ]){
    const unsafe=await videoIngressProgram(new Map([[path,change]]));
    assert.throws(()=>analyze(unsafe.ts,videoPairContext(unsafe)),error=>error.reason==='IMAGE_SDK_OPTION_DOMAIN_UNKNOWN');
  }
});

test('image recovery projection retains both original task and run recovery modules', async () => {
  const component=deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const project=runInNewContext(`${component}; finiteImageRecoveryProjections`,{resolve,relative});
  const files=['packages/domain/src/agent/agent.ts','packages/domain/src/agent/research-run.ts'];
  const originals=new Map(files.map(path=>[path,execFileSync('git',['show',`ca0a5b1ce6b7228e04d0212a8a96b07d8adbf4a6:${path}`],{encoding:'utf8'})]));
  // This historical image component proof is not current whole-candidate compatibility.
  const sourceRef='3a93eb49137a67b2c12ef0ca89d7327c68c8e1b5';
  const actual=await videoIngressProgram(new Map(),{sourceRef}),legacy=await videoIngressProgram(originals,{sourceRef});
  const model=project(actual.ts,videoPairContext(actual),videoPairContext(legacy));
  assert.equal(model.status,'conditional');
  for(const [key,value]of model.projected)assert.deepEqual(videoPairRuntime(actual.ts,value.text),videoPairRuntime(legacy.ts,originals.get(key)),key);
  for(const [path,change]of[
    [files[1],value=>value.replace('const rawMarker = jsonRecord(jsonRecord(task.result).nativeAgentExecution);',
      'const rawMarker = jsonRecord(jsonRecord(task.result).nativeAgentExecution); await tx.extraOperation();')],
    [files[0],value=>value.replace('task.retryCount === 0','task.retryCount >= 0')],
  ]){
    const unsafe=await videoIngressProgram(new Map([[path,change]]),{sourceRef});
    assert.throws(()=>{
      const projected=project(unsafe.ts,videoPairContext(unsafe),videoPairContext(legacy));
      for(const [key,value]of projected.projected)assert.deepEqual(videoPairRuntime(unsafe.ts,value.text),videoPairRuntime(legacy.ts,originals.get(key)),key);
    },'new pre-refusal effects or expanded old retry authority cannot be erased');
  }
});

test('image allowed-tool domain derives all fresh names and explicit saved-name recurrences', async () => {
  const component=deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const analyze=runInNewContext(`${component}; finiteImageAllowedToolTerms`,{resolve,relative});
  const actual=await videoIngressProgram(),model=analyze(actual.ts,videoPairContext(actual));
  assert.equal(model.status,'conditional');assert.equal(model.results.length,model.options.sites.length);
  assert.ok(model.history.length>0);
  assert.ok(model.results.every(row=>!row.result.values.has('image_review_result')));
  const unsafe=await videoIngressProgram(new Map([['apps/agent-worker/src/native-agent/illustration-task.ts',value=>value.replace(
    "allowedTools: ['skills_list', 'skill_view', 'paper_image_view']","allowedTools: ['skills_list', 'skill_view', 'paper_image_view', 'image_review_result']")]]));
  assert.throws(()=>analyze(unsafe.ts,videoPairContext(unsafe)),error=>error.reason==='IMAGE_ALLOWED_TOOL_DOMAIN_UNKNOWN');
  const mutated=await videoIngressProgram(new Map([['apps/agent-worker/src/native-agent/paper-task.ts',value=>value.replace(
    "tool.function.name.startsWith('paper_')).map(tool => {","tool.function.name.startsWith('paper_')).map(tool => { tool.function.name = 'image_review_result';")]]));
  assert.throws(()=>analyze(mutated.ts,videoPairContext(mutated)),error=>error.reason==='IMAGE_ALLOWED_TOOL_DOMAIN_UNKNOWN');
});

test('image transport projection retains the original native and provider request methods', async () => {
  const component=deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const project=runInNewContext(`${component}; finiteImageTransportProjections`,{resolve,relative});
  const files=['packages/ai-gateway/src/gateway.ts','packages/ai-gateway/src/provider.ts'];
  const originals=new Map(files.map(path=>[path,execFileSync('git',['show',`ca0a5b1ce6b7228e04d0212a8a96b07d8adbf4a6:${path}`],{encoding:'utf8'})]));
  const actual=await videoIngressProgram(),legacy=await videoIngressProgram(originals);
  const method=(ts,text,owner,name)=>{
    const source=ts.createSourceFile('source.ts',text,ts.ScriptTarget.ES2022,true);
    const declaration=source.statements.find(node=>ts.isClassDeclaration(node)&&node.name?.text===owner);
    const methods=declaration.members.filter(node=>ts.isMethodDeclaration(node)&&node.name.text===name);
    assert.equal(methods.length,1);return `class Comparison { ${methods[0].getText(source)} }`;
  };
  const model=project(actual.ts,videoPairContext(actual),videoPairContext(legacy));assert.equal(model.status,'conditional');
  for(const [key,owner,name]of[[files[0],'AiGateway','nativeAgentComplete'],[files[1],'AnthropicCompatProvider','requestBody']]){
    assert.deepEqual(videoPairRuntime(actual.ts,method(actual.ts,model.projected.get(key).text,owner,name)),
      videoPairRuntime(legacy.ts,method(legacy.ts,originals.get(key),owner,name)),key);
  }
  const unsafe=await videoIngressProgram(new Map([[files[0],value=>value.replace('maxTokens: 32768, timeoutMs: 300_000 }, {',
    'maxTokens: 32768, timeoutMs: 300_000, tools: input.unknownTools }, {')]]));
  assert.throws(()=>project(unsafe.ts,videoPairContext(unsafe),videoPairContext(legacy)),error=>error.reason==='IMAGE_TRANSPORT_RESIDUAL_UNKNOWN');
  for(const observation of ['void this.requestBody.length;','const observed = this.requestBody; void observed;']){
    const observed=await videoIngressProgram(new Map([[files[1],value=>value.replace(
      'preflightNativeImages(opts: CompleteOptions): void { this.requestBody(opts); }',
      `preflightNativeImages(opts: CompleteOptions): void { ${observation} this.requestBody(opts); }`)]]));
    assert.throws(()=>project(observed.ts,videoPairContext(observed),videoPairContext(legacy)),
      error=>error.reason==='IMAGE_TRANSPORT_RESIDUAL_UNKNOWN','method arity or escaped function identity cannot be specialized away');
  }
});

test('image consumer projection retains original decision parsing and journal turn checks', async () => {
  const component=deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const project=runInNewContext(`${component}; finiteImageConsumerProjections`,{resolve,relative});
  const files=['apps/agent-worker/src/presentation/generated-image-review.ts','apps/agent-worker/src/native-agent/journal-task-store.ts'];
  const originals=new Map(files.map(path=>[path,execFileSync('git',['show',`ca0a5b1ce6b7228e04d0212a8a96b07d8adbf4a6:${path}`],{encoding:'utf8'})]));
  const actual=await videoIngressProgram(),legacy=await videoIngressProgram(originals);
  const model=project(actual.ts,videoPairContext(actual),videoPairContext(legacy));assert.equal(model.status,'conditional');
  for(const[key,value]of model.projected)assert.deepEqual(videoPairRuntime(actual.ts,value.text),videoPairRuntime(legacy.ts,originals.get(key)),key);
  for(const[path,change]of[
    [files[0],value=>value.replace('else decision = parseDecision(parseStructuredJson(result.text));','else decision = JSON.parse(result.text);')],
    [files[1],value=>value.replace("paidCompletion ? turn.state !== 'completed' : turn.state !== 'started'","paidCompletion ? turn.state === 'completed' : turn.state !== 'started'")],
  ]){
    const unsafe=await videoIngressProgram(new Map([[path,change]]));
    assert.throws(()=>{
      const projected=project(unsafe.ts,videoPairContext(unsafe),videoPairContext(legacy));
      for(const[key,value]of projected.projected)assert.deepEqual(videoPairRuntime(unsafe.ts,value.text),videoPairRuntime(legacy.ts,originals.get(key)),key);
    },'legacy JSON validation and paid/live journal completion checks must be retained');
  }
});

test('image legacy source model composes historical projections and refuses current voice and live prepared-method escapes', async () => {
  const component=deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const project=runInNewContext(`${component}; finiteImageLegacySourceModel`,{resolve,relative});
  const files=[
    'apps/agent-worker/src/native-agent/session.ts','apps/agent-worker/src/native-agent/task-store.ts',
    'apps/agent-worker/src/native-agent/host-task.ts','apps/agent-worker/src/native-agent/illustration-task.ts',
    'apps/agent-worker/src/native-agent/journal-task-store.ts','apps/agent-worker/src/presentation/generated-image-review.ts',
    'packages/domain/src/agent/agent.ts','packages/domain/src/agent/native-agent-execution.ts',
    'packages/domain/src/agent/research-run.ts','packages/domain/src/assets/native-image-review.ts',
    'packages/ai-gateway/src/gateway.ts','packages/ai-gateway/src/provider.ts','packages/ai-gateway/src/native-agent-bridge.ts',
    'packages/ai-gateway/src/native-image-review.ts','packages/ai-gateway/src/index.ts',
  ];
  const originals=new Map(files.map(path=>[path,execFileSync('git',['show',`ca0a5b1ce6b7228e04d0212a8a96b07d8adbf4a6:${path}`],{encoding:'utf8'})]));
  // Only this historical image component is compared with the retained ca0a bytes.
  const sourceRef='3a93eb49137a67b2c12ef0ca89d7327c68c8e1b5';
  const actual=await videoIngressProgram(new Map(),{sourceRef}),legacy=await videoIngressProgram(originals,{sourceRef});
  const current=await videoIngressProgram();
  assert.throws(()=>project(current.ts,videoPairContext(current),videoPairContext(legacy)),error=>{
    assert.equal(error.reason,'IMAGE_DECLARATION_CONTEXT_UNKNOWN');
    assert.ok(current.ts.isIdentifier(error.node),'the current image-only proof must identify its unclassified voice caller');
    assert.equal(error.node.text,'persistHermesVoiceTaskInTransaction');
    assert.equal(resolve(error.node.getSourceFile().fileName),resolve(current.projectRoot,'packages/domain/src/agent/voice.ts'));
    assert.ok(current.ts.isCallExpression(error.node.parent)&&error.node.parent.expression===error.node,
      'the rejected identifier must be the actual voice call expression');
    return true;
  });
  const model=project(actual.ts,videoPairContext(actual),videoPairContext(legacy));assert.equal(model.status,'conditional');
  assert.ok(model.closure.declarations.size>0);
  for(const[key,value]of model.projected){
    if(key==='apps/agent-worker/src/native-agent/illustration-task.ts'){
      // The saved fixture predates e75 video A; only its image-role function
      // is the old image oracle. Actual installed e75 must compare the WHOLE
      // module and all default entries before any admission can be granted.
      const entry=(ts,text)=>{const source=ts.createSourceFile(key,text,ts.ScriptTarget.ES2022,true);
        return source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='runNativeImageReviewTask').getText(source);};
      assert.deepEqual(videoPairRuntime(actual.ts,entry(actual.ts,value.text)),videoPairRuntime(legacy.ts,entry(legacy.ts,originals.get(key))),key);
    }else assert.deepEqual(videoPairRuntime(actual.ts,value.text),videoPairRuntime(legacy.ts,originals.get(key)),key);
  }
  const unsafe=await videoIngressProgram(new Map([['packages/ai-gateway/src/gateway.ts',value=>value.replace(
    '    messages = snapshotChatMessages(messages);','    void this.prepareNativeImageReviewTurn; messages = snapshotChatMessages(messages);')]]),{sourceRef});
  assert.throws(()=>project(unsafe.ts,videoPairContext(unsafe),videoPairContext(legacy)),error=>error.reason==='IMAGE_DECLARATION_CONTEXT_UNKNOWN');
});

test('image capable source pair retains raw/final readers despite an absent fresh producer', async () => {
  const component=deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const roots=[],weak=new WeakMap();
  const methods=runInNewContext(`${component}; ({model:finiteImageCapableSourceModel,capable:finiteImageCapablePairCompatibility,first:finiteImageFirstPairCompatibility})`,
    {resolve,relative,rollbackProofContexts:weak,APPLICATION_ROLLBACK_READERS:roots,builtinModules});
  const file='packages/domain/src/agent/agent.ts',decoder='packages/domain/src/assets/native-image-review.ts';
  const current=await videoIngressProgram();
  const writer=await videoIngressProgram(new Map([[file,value=>value.replace(
    "nativeReviewResult ? initialNativeAgentExecution(deps.nativeAgentRuntime, 'image-review')",
    "nativeReviewResult ? initialNativeAgentExecution(deps.nativeAgentRuntime, 'image-review', 'image-review-tool-final-v1')")]]));
  // These are two real source runtime records, not successful collector arrays.
  // Their conditional model must never acquire default deployment authority.
  const entries=value=>[file,decoder].map(path=>[`module:${path}`,videoPairRuntime(value.ts,value.program.getSourceFile(resolve(value.projectRoot,path)).text)]);
  const left=entries(writer),right=entries(current);
  const model=methods.model(writer.ts,videoPairContext(writer),videoPairContext(current),left,right);
  assert.equal(model.status,'conditional');assert.equal(model.candidate.producer.kind,'tagged');assert.equal(model.rollback.producer.kind,'absent');
  assert.deepEqual(videoPairRuntime(writer.ts,model.candidate.producer.text),videoPairRuntime(current.ts,model.rollback.producer.text));
  for(const change of[
    value=>value.replace("const rawOnly = record(cp) && cp.received === 'raw-only';","const rawOnly = false;"),
    value=>value.replace("if (Object.hasOwn(cp, 'validatedFinal')) {","if (false) {"),
  ]){
    const weakened=await videoIngressProgram(new Map([[decoder,change]]));
    assert.throws(()=>methods.model(weakened.ts,videoPairContext(weakened),videoPairContext(current),entries(weakened),right),
      error=>error.reason==='IMAGE_READER_CAPABILITY_OR_CONTEXT_CHANGED');
  }
  for(const proof of[methods.capable,methods.first])for(const arrays of[[left,right],[structuredClone(left),structuredClone(right)]])
    assert.equal(proof(writer.ts,...arrays,writer.projectRoot,current.projectRoot,roots),false,'source-only/copied arrays have no successful collector provenance');
});

test('current candidate source keeps the legacy video helper conservative', async () => {
  const { ts, program, projectRoot } = await videoIngressProgram();
  const host = program.getSourceFiles().find(file => file.fileName.replaceAll('\\', '/').endsWith('/native-agent/host-task.ts'));
  assert.equal(host.text, readFileSync(host.fileName, 'utf8'));
  const result = deployLock.proveNativeVideoReceiptIngress(ts, program, projectRoot);
  assert.equal(result.status, 'unknown');
  assert.equal(result.reason, 'HOST_HISTORY_CHECK_BYPASS');
  assert.ok(!result.proven.includes('host-before-session'));
  assert.equal(result.releaseCompatible, false);
});

test('video pair source projection preserves actual old runtime context and finite L/U closure', async () => {
  const components = videoPairSourceComponents(), actual = await historicalVideoIngressProgram(), left = videoPairContext(actual);
  const original = await historicalVideoIngressProgram(new Map(), 'ca0a5b1ce6b7228e04d0212a8a96b07d8adbf4a6');
  const candidate = components.model(actual.ts, left), rollback = components.model(original.ts, videoPairContext(original));
  for (const [key, { text }] of candidate.projected)
    assert.deepEqual(videoPairRuntime(actual.ts, text), videoPairRuntime(original.ts, rollback.projected.get(key).text), key);
  const closure = components.closure(candidate, rollback);
  assert.equal(closure.status, 'conditional');
  assert.deepEqual([...closure.reachable].sort(), ['historical', 'legacy', 'refused']);
  assert.ok(closure.transitions.length > 0 && closure.transitions.every(row => row.node.getSourceFile().text));
  // A copied JSON entry array and a source-only Program have no production
  // WeakMap context. Neither can enter the unequal acceptance path.
  assert.equal(components.pair(actual.ts, [], [], actual.projectRoot, actual.projectRoot, components.roots), false);
  assert.equal(components.pair(actual.ts, JSON.parse(JSON.stringify([['module:example', 'same']])), [],
    actual.projectRoot, actual.projectRoot, components.roots), false);
});

test('video pair source closure distinguishes a capable writer from dropping its readers', async () => {
  const components = videoPairSourceComponents(), actual = await historicalVideoIngressProgram();
  const file = 'apps/agent-worker/src/native-agent/illustration-task.ts';
  const writer = await historicalVideoIngressProgram(new Map([[file, source => source
    .replace('approvedVideoPrompts ? compileApprovedShotPrompt : compileShotPrompt', 'approvedVideoPrompts ? compileShotPrompt : compileApprovedShotPrompt')
    .replace('(approvedVideoPrompts ? compileShotPrompt : compileApprovedShotPrompt)', '(approvedVideoPrompts ? compileApprovedShotPrompt : compileShotPrompt)')]]));
  const candidate = components.model(writer.ts, videoPairContext(writer)), rollback = components.model(actual.ts, videoPairContext(actual));
  assert.equal(candidate.fresh, 'approved');
  assert.equal(components.closure(candidate, rollback).status, 'conditional');
  for (const [key, { text }] of candidate.projected)
    assert.deepEqual(videoPairRuntime(writer.ts, text), videoPairRuntime(actual.ts, rollback.projected.get(key).text), key);
  const old = await historicalVideoIngressProgram(new Map(), 'ca0a5b1ce6b7228e04d0212a8a96b07d8adbf4a6');
  const original = components.model(old.ts, videoPairContext(old));
  assert.equal(components.closure(candidate, original).reason, 'ROLLBACK_FAMILY_NOT_CLOSED');
  assert.equal(components.closure(original, rollback).reason, 'READER_CAPABILITY_REMOVED');
});

test('video pair source projection consumes genuine imported aliases but not arbitrary A uses', async () => {
  const components = videoPairSourceComponents(), file = 'apps/agent-worker/src/native-agent/illustration-task.ts';
  const actual = await historicalVideoIngressProgram(), original = components.model(actual.ts, videoPairContext(actual));
  const aliased = await historicalVideoIngressProgram(new Map([[file, source => source.replaceAll('compileApprovedShotPrompt', 'approvedCompiler')
    .replace('compileShotPrompt, approvedCompiler, compileHistorical', 'compileShotPrompt, compileApprovedShotPrompt as approvedCompiler, compileHistorical')]]));
  const model = components.model(aliased.ts, videoPairContext(aliased));
  assert.equal(model.fresh, 'legacy');
  for (const [key, { text }] of model.projected)
    assert.deepEqual(videoPairRuntime(aliased.ts, text), videoPairRuntime(actual.ts, original.projected.get(key).text), key);
  const escaped = await historicalVideoIngressProgram(new Map([[file, source => source.replace('  const nativeVideo = input.nativeVideo === true;',
    '  const escapedCompiler = compileApprovedShotPrompt;\n  const nativeVideo = input.nativeVideo === true;')]]));
  assert.throws(() => components.model(escaped.ts, videoPairContext(escaped)), error => error.reason === 'VIDEO_TRANSFER_UNKNOWN');
});

test('video pair source refuses the real earlier A writer whose legacy constructor was refactored', async () => {
  const components = videoPairSourceComponents();
  const earlier = await historicalVideoIngressProgram(new Map(), '36e8ce5228bc8d3109de171cc86f17eab3fe7f64');
  assert.throws(() => components.model(earlier.ts, videoPairContext(earlier)), error => error.reason === 'VIDEO_CONSTRUCTOR_NOT_PURE');
});

test('video pair source grammar refuses saved-field adoption, foreign base indices and unbound spool values', async () => {
  const components = videoPairSourceComponents();
  for (const [file, before, after] of [
    ['apps/agent-worker/src/native-agent/illustration-task.ts', 'if (isDeepStrictEqual(approved, recorded)) return approved;', 'if (isDeepStrictEqual(approved, recorded)) return recorded;'],
    ['apps/agent-worker/src/native-agent/illustration-task.ts', 'isDeepStrictEqual(alternate, input.base!.prompts[sceneIndex])', 'isDeepStrictEqual(alternate, input.base!.prompts[0])'],
    ['apps/agent-worker/src/native-agent/illustration-task.ts', 'restore();\n      const approved = evaluate', 'const approved = evaluate'],
    ['apps/agent-worker/src/presentation/synclip-video-spool.ts', 'prompt = approved;', 'prompt = input.videoPrompts![index]!;'],
    ['apps/agent-worker/src/presentation/synclip-video-spool.ts', 'compileApprovedShotPrompt(input.storyboard, scene, locale)', 'compileApprovedShotPrompt(input.storyboard, scene, input.locale!)'],
  ]) {
    const actual = await historicalVideoIngressProgram(new Map([[file, source => source.replaceAll('\r\n', '\n').replace(before, after)]]));
    assert.throws(() => components.model(actual.ts, videoPairContext(actual)), error => error.reason === 'VIDEO_TRANSFER_UNKNOWN', before);
  }
});

test('video pair projection retains changed non-video and request-identity context', async () => {
  const components = videoPairSourceComponents(), actual = await historicalVideoIngressProgram(), baseline = components.model(actual.ts, videoPairContext(actual));
  for (const [file, before, after] of [
    ['apps/agent-worker/src/native-agent/illustration-task.ts', "if (!record(args)) throw new Error('object_required');", "if (!record(args)) throw new Error('different_context');"],
    ['apps/agent-worker/src/presentation/synclip-video-spool.ts', 'existing.inputHash !== inputHash', 'existing.inputHash === inputHash'],
  ]) {
    const changed = await historicalVideoIngressProgram(new Map([[file, source => source.replace(before, after)]]));
    const model = components.model(changed.ts, videoPairContext(changed));
    assert.notDeepEqual(videoPairRuntime(changed.ts, model.projected.get(file).text), videoPairRuntime(actual.ts, baseline.projected.get(file).text));
  }
});

test('video pair source family bound rejects a pure constructor that changes scientific or audio context', async () => {
  const components = videoPairSourceComponents(), file = 'apps/agent-worker/src/presentation/synclip-video-spool.ts';
  for (const [before, after] of [
    ['storyboard.videoProduction!.visualContinuity', 'scene.visualAction'],
    ["if (!mode) throw new Error('VIDEO_PLAN_UNSUPPORTED');", "if (!mode) throw new Error('different_guard');"],
  ]) {
    const changed = await historicalVideoIngressProgram(new Map([[file, source => {
      const start = source.indexOf('export function compileApprovedShotPrompt('), end = source.indexOf('\nexport class SynclipVideoSpool', start);
      assert.ok(start >= 0 && end > start);
      return source.slice(0, start) + source.slice(start, end).replace(before, after) + source.slice(end);
    }]]));
    assert.throws(() => components.model(changed.ts, videoPairContext(changed)), error => error.reason === 'VIDEO_TRANSFER_UNKNOWN', before);
  }
});

test('video pair constructor component extracts actual legacy families without granting compatibility', async () => {
  const component = deployLockSource.slice(deployLockSource.indexOf('function finiteVideoConstructorTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  assert.ok(component.startsWith('function finiteVideoConstructorTerms('));
  const analyze = runInNewContext(`${component}; finiteVideoConstructorTerms`, { relative });
  const actual = await historicalVideoIngressProgram();
  const original = await historicalVideoIngressProgram(new Map(), 'ca0a5b1ce6b7228e04d0212a8a96b07d8adbf4a6');
  const inspect = ({ ts, program, projectRoot }) => analyze(ts, { program, checker: program.getTypeChecker(), root: projectRoot });
  const candidate = inspect(actual), previous = inspect(original);
  const json = value => JSON.parse(JSON.stringify(value));
  assert.deepEqual(json(candidate.terms.legacy), json(previous.terms.legacy));
  assert.deepEqual(json(candidate.terms.historical), json(previous.terms.historical));
  assert.notDeepEqual(json(candidate.terms.approved), json(candidate.terms.legacy));
  assert.equal(previous.approved, undefined);
  assert.equal(candidate.classify.getSourceFile().fileName.replaceAll('\\', '/').endsWith('/packages/domain/src/assets/storyboard.ts'), true);
  // This component returns actual nodes and symbolic constructor values only;
  // source-only Programs never acquire successful production-collector context.
  assert.equal(Object.hasOwn(candidate, 'releaseCompatible'), false);
});

test('video pair constructor component refuses effects and unsupported bindings in actual source', async () => {
  const component = deployLockSource.slice(deployLockSource.indexOf('function finiteVideoConstructorTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const analyze = runInNewContext(`${component}; finiteVideoConstructorTerms`, { relative });
  const file = 'apps/agent-worker/src/presentation/synclip-video-spool.ts';
  const mutateApproved = mutate => source => {
    const start = source.indexOf('export function compileApprovedShotPrompt('), end = source.indexOf('\nexport class SynclipVideoSpool', start);
    assert.ok(start >= 0 && end > start);
    return source.slice(0, start) + mutate(source.slice(start, end)) + source.slice(end);
  };
  for (const [name, mutate] of [
    ['effectful call', source => source.replace('  const mode =', '  Date.now();\n  const mode =')],
    ['async constructor', source => source.replace('export function ', 'export async function ')],
    ['default parameter', source => source.replace('locale: string)', "locale: string = 'en')")],
    ['assignment', source => source.replace('  const mode =', '  storyboard.videoProduction = undefined;\n  const mode =')],
    ['unbound helper', source => source.replace("return ['Scientific explainer shot.", "return [String('Scientific explainer shot.') , 'Scientific explainer shot.")],
  ]) {
    const { ts, program, projectRoot } = await historicalVideoIngressProgram(new Map([[file, mutateApproved(mutate)]]));
    assert.throws(() => analyze(ts, { program, checker: program.getTypeChecker(), root: projectRoot }),
      error => error.reason === 'VIDEO_CONSTRUCTOR_NOT_PURE', name);
  }
});

test('video constructor ingress prototype reports genuine bindings and unresolved other consumers without permitting rollback', async () => {
  assert.equal(typeof deployLock.proveNativeVideoReceiptIngress, 'function');
  const { ts, program, projectRoot } = await historicalVideoIngressProgram();
  const result = deployLock.proveNativeVideoReceiptIngress(ts, program, projectRoot);
  assert.equal(result.status, 'unknown');
  assert.equal(result.reason, 'OTHER_PERSISTENCE_ORIGINS_UNPROVEN', JSON.stringify(result));
  for (const edge of ['materializer-host', 'host-slot-result', 'host-before-session', 'session-prefix', 'session-checkpoint-prefix', 'verified-base'])
    assert.ok(result.proven.includes(edge), `${edge} must be an actual proved edge, not a supplied trust bit`);
  assert.ok(result.references.some(item => item.file.endsWith('/paper-task.ts')));
  assert.ok(result.references.some(item => item.file.endsWith('/source-review-task.ts')));
  assert.ok(result.references.some(item => item.file.endsWith('/journal-task.ts')));
  assert.equal(result.releaseCompatible, false);
});

const videoIngressHighMutations = [
  ['host-unawaited-history', 'host-task.ts', value => value.replace('await validateSourceHistory(value);', 'validateSourceHistory(value);'),
    'HOST_HISTORY_CHECK_BYPASS', 'host-before-session'],
  ['checkpoint-alternate-state', 'session.ts', value => value.replace('retry?.started ??', 'state ??'),
    'RETRY_STARTED_ORIGIN_UNKNOWN', 'session-checkpoint-prefix'],
  ['checkpoint-retry-computed-started-override', 'session.ts', value => value.replace(
    'retry = { started: attempt.rejection.started, receipt: { httpStatus: 529, maxOutputTokens: boundedOptions.maxTokens } };',
    "retry = { started: attempt.rejection.started, receipt: { httpStatus: 529, maxOutputTokens: boundedOptions.maxTokens }, ['sta' + 'rted']: state };"),
    'LATEST_PREFIX_NOT_RETAINED', 'session-checkpoint-prefix'],
  ['checkpoint-retry-wrong-supplier', 'session.ts', value => value.replace('retry = { started: attempt.rejection.started,', 'retry = { started: state,'),
    'RETRY_STARTED_ORIGIN_UNKNOWN', 'session-checkpoint-prefix'],
  ['checkpoint-rejection-wrong-started', 'session.ts', value => value.replace('attempt.rejection = { started, error };', 'attempt.rejection = { started: state, error };'),
    'RETRY_STARTED_ORIGIN_UNKNOWN', 'session-checkpoint-prefix'],
  ['checkpoint-retry-late-member-write', 'session.ts', value => value.replace('retry = { started: attempt.rejection.started, receipt: { httpStatus: 529, maxOutputTokens: boundedOptions.maxTokens } };',
    'retry = { started: attempt.rejection.started, receipt: { httpStatus: 529, maxOutputTokens: boundedOptions.maxTokens } }; retry.started = state;'),
    'RETRY_STARTED_ORIGIN_UNKNOWN', 'session-checkpoint-prefix'],
  ['host-self-comparison', 'host-task.ts', value => value.replace(
    "const result = [...messages].reverse().find(m => m.role === 'tool' && m.toolCallId === slot.id);",
    'const result = { content: JSON.stringify(slot.result) };'), 'HOST_TOOL_RESULT_ORIGIN_UNKNOWN', 'host-slot-result'],
  ['host-empty-slots', 'host-task.ts', value => value.replace('for (const slot of slots)', 'for (const slot of [])'),
    'HOST_SLOT_ITERABLE_UNKNOWN', 'host-slot-result'],
  ['session-skipped-loop', 'session.ts', value => value.replace('i < cursor; i++', 'i < 0; i++'),
    'ASSISTANT_HISTORY_LOOP_UNKNOWN', 'session-prefix'],
  ['checkpoint-decoy', 'session.ts', value => value.replace(
    "{ state: 'started', target, request: { messages, options }, effectiveOptions: boundedOptions }",
    "{ state: 'started', target, request: { messages: [], options }, proofDecoy: { request: { messages, options } }, effectiveOptions: boundedOptions }"),
    'LATEST_PREFIX_NOT_RETAINED', 'session-checkpoint-prefix'],
  ['host-different-history-argument', 'host-task.ts', value => value.replace('await validateSourceHistory(value);', 'await validateSourceHistory({});'),
    'HOST_HISTORY_ARGUMENT_UNBOUND', 'host-before-session'],
  ['session-substituted-turn', 'session.ts', value => value.replace('const turn = state.turns[i];', 'const turn = state.turns[0];'),
    'ASSISTANT_TURN_ORIGIN_UNKNOWN', 'session-prefix'],
  ['session-substituted-message', 'session.ts', value => value.replace('const message = assistantMessages[i];', 'const message = assistantMessages[0];'),
    'ASSISTANT_MESSAGE_ORIGIN_UNKNOWN', 'session-prefix'],
  ['session-substituted-preceding', 'session.ts', value => value.replace(
    'cursor > 0 ? state.turns[cursor - 1]?.request.messages : undefined', 'undefined'),
    'PRIOR_PREFIX_UNBOUND', 'session-prefix'],
  ['checkpoint-late-request-override', 'session.ts', value => value.replace(
    "{ state: 'started', target, request: { messages, options }, effectiveOptions: boundedOptions }",
    "{ state: 'started', target, request: { messages, options }, effectiveOptions: boundedOptions, request: { messages: [], options } }"),
    'LATEST_PREFIX_NOT_RETAINED', 'session-checkpoint-prefix'],
  ['checkpoint-completed-decoy', 'session.ts', value => value.replace(
    "{ state: 'completed', target, request: { messages, options }, effectiveOptions: boundedOptions,",
    "{ state: 'completed', target, request: { messages: [], options }, proofDecoy: { request: { messages, options } }, effectiveOptions: boundedOptions,"),
    'LATEST_PREFIX_NOT_RETAINED', 'session-checkpoint-prefix'],
  ['checkpoint-late-spread-override', 'session.ts', value => value.replace(
    "{ state: 'started', target, request: { messages, options }, effectiveOptions: boundedOptions }",
    "{ state: 'started', target, request: { messages, options }, effectiveOptions: boundedOptions, ...{ request: { messages: [], options } } }"),
    'LATEST_PREFIX_NOT_RETAINED', 'session-checkpoint-prefix'],
  ['checkpoint-late-computed-override', 'session.ts', value => value.replace(
    "{ state: 'started', target, request: { messages, options }, effectiveOptions: boundedOptions }",
    "{ state: 'started', target, request: { messages, options }, effectiveOptions: boundedOptions, ['request']: { messages: [], options } }"),
    'LATEST_PREFIX_NOT_RETAINED', 'session-checkpoint-prefix'],
  ['session-skipped-initial-index', 'session.ts', value => value.replace('for (let i = 0; i < cursor; i++)', 'for (let i = cursor; i < cursor; i++)'),
    'ASSISTANT_HISTORY_LOOP_UNKNOWN', 'session-prefix'],
  ['session-wrong-increment', 'session.ts', value => value.replace('for (let i = 0; i < cursor; i++)', 'for (let i = 0; i < cursor; i--)'),
    'ASSISTANT_HISTORY_LOOP_UNKNOWN', 'session-prefix'],
  ['session-substituted-initial-state', 'session.ts', value => value.replace('let state = await read();', 'let state = null;'),
    'SESSION_STATE_ORIGIN_UNKNOWN', 'session-prefix'],
  ['session-substituted-publication-state', 'session.ts', value => value.replace('await authorize(); state = await read(); checkHistory(messages, state);',
    'await authorize(); state = null; checkHistory(messages, state);'), 'SESSION_STATE_ORIGIN_UNKNOWN', 'session-prefix'],
  ['checkpoint-late-method-override', 'session.ts', value => value.replace(
    "{ state: 'started', target, request: { messages, options }, effectiveOptions: boundedOptions }",
    "{ state: 'started', target, request: { messages, options }, effectiveOptions: boundedOptions, request() { return {}; } }"),
    'LATEST_PREFIX_NOT_RETAINED', 'session-checkpoint-prefix'],
];

for (const [name, file, mutate, reason, edge] of videoIngressHighMutations) test(`video constructor ingress High regression ${name}`, async () => {
  const { ts, program, projectRoot } = await historicalVideoIngressProgram(new Map([[`apps/agent-worker/src/native-agent/${file}`, mutate]]));
  const result = deployLock.proveNativeVideoReceiptIngress(ts, program, projectRoot);
  assert.equal(result.status, 'unknown');
  assert.equal(result.reason, reason, 'the exact binding must reject, not an unrelated analysis exception');
  assert.ok(!result.proven.includes(edge), `${edge} must not be proved for the counterexample`);
  assert.equal(result.releaseCompatible, false);
});

const videoStoreCapabilityMutations = [
  ['binding-task-id-write', value => value.replace('const session = createNativeAgentSession(',
    "binding.taskId = '00000000-0000-4000-8000-000000000001'; const session = createNativeAgentSession("), 'STORE_EFFECTIVE_MEMBER_MUTATION_UNKNOWN'],
  ['binding-object-assign', value => value.replace('const session = createNativeAgentSession(',
    "Object.assign(binding, { taskId: '00000000-0000-4000-8000-000000000001' }); const session = createNativeAgentSession("), 'STORE_EFFECTIVE_MEMBER_MUTATION_UNKNOWN'],
  ['extra-writer', value => value.replace('const saved = await store.read();',
    'const saved = await store.read(); await store.complete(saved, saved!);'), 'STORE_UNEXPECTED_WRITER_UNKNOWN'],
  ['substitute-instance', value => value.replace('const saved = await store.read();',
    'const saved = await store.read(); const substitute: typeof store = { ...store };')
    .replace('binding, store, authorize });', 'binding, store: substitute, authorize });'), 'STORE_SUBSTITUTE_INSTANCE_UNKNOWN'],
  ['method-escape', value => value.replace('const saved = await store.read();',
    'const saved = await store.read(); const escapedWrite = store.complete;'), 'STORE_METHOD_ESCAPE_UNKNOWN'],
];

for (const [name, mutate, reason] of videoStoreCapabilityMutations) test(`video store capability rejects ${name}`, async () => {
  const { ts, program, projectRoot } = await historicalVideoIngressProgram(new Map([['apps/agent-worker/src/native-agent/paper-task.ts', mutate]]));
  const result = deployLock.proveNativeVideoReceiptIngress(ts, program, projectRoot);
  assert.equal(result.status, 'unknown');
  assert.equal(result.reason, reason, 'reject the actual receiver/use edge, not an unrelated exception');
  assert.ok(!result.proven.includes('store-capability-use'));
  assert.equal(result.storeGraph.status, 'unproven');
  assert.equal(result.releaseCompatible, false);
});

for (const alias of [false, true]) test(`video store capability maps actual instances${alias ? ' with genuine import alias' : ''}`, async () => {
  const changes = alias ? new Map([['apps/agent-worker/src/native-agent/paper-task.ts', value => value.replace(
    "import { createNativeTaskStore } from './task-store';", "import { createNativeTaskStore as genuineStoreFactory } from './task-store';")
    .replace('const store = createNativeTaskStore(', 'const store = genuineStoreFactory(')]]) : new Map();
  const { ts, program, projectRoot } = await historicalVideoIngressProgram(changes);
  const result = deployLock.proveNativeVideoReceiptIngress(ts, program, projectRoot);
  assert.equal(result.reason, 'OTHER_PERSISTENCE_ORIGINS_UNPROVEN', JSON.stringify(result));
  for (const edge of ['materializer-host', 'host-slot-result', 'host-before-session', 'session-prefix', 'session-checkpoint-prefix', 'verified-base', 'store-capability-use'])
    assert.ok(result.proven.includes(edge), edge);
  assert.equal(result.storeGraph.instances.filter(instance => instance.factory === 'createNativeTaskStore').length, 5);
  assert.equal(result.storeGraph.status, 'conditional');
  assert.equal(result.storeGraph.instances.filter(instance => instance.factory === 'createJournalNativeTaskStore').length, 1);
  assert.equal(result.storeGraph.sessions.length, 6);
  assert.equal(result.storeGraph.hosts.length, 6);
  assert.equal(result.storeGraph.shared.filter(use => use.consumer === 'session').length, 4);
  assert.equal(result.storeGraph.shared.filter(use => use.consumer === 'host').length, 2);
  assert.ok(result.storeGraph.pending.length > 0, 'the graph does not prove cross-profile or full private checkpoint isolation');
  assert.equal(result.unresolved.length, 13);
  assert.equal(result.status, 'unknown');
  assert.equal(result.releaseCompatible, false);
});

const privateStoreChainMutations = [
  ['foreign-expected', value => value.replace('expected: old, next: preparedReference, paidCompletion,',
    'expected: input.execution.checkpoint, next: preparedReference, paidCompletion,'), 'PRIVATE_CAS_REFERENCE_UNKNOWN'],
  ['premature-known-registration', value => value.replace('    known.set(next.serializedSha256, next);', '')
    .replace('const prepared = await persist(state); next = prepared.reference;',
      'const prepared = await persist(state); next = prepared.reference; known.set(next.serializedSha256, next);'), 'PRIVATE_KNOWN_REGISTRATION_ORDER_UNKNOWN'],
];

for (const [name, mutate, reason] of privateStoreChainMutations) test(`generic private store chain rejects ${name}`, async () => {
  const { ts, program, projectRoot } = await historicalVideoIngressProgram(new Map([['apps/agent-worker/src/native-agent/task-store.ts', mutate]]));
  const result = deployLock.proveNativeVideoReceiptIngress(ts, program, projectRoot);
  assert.equal(result.reason, reason, 'the new reference/origin/order boundary must reject the actual injected source');
  assert.ok(!result.proven.includes('generic-private-store-chain'));
  assert.equal(result.status, 'unknown');
  assert.equal(result.releaseCompatible, false);
});

test('generic private store chain binds actual private references with unresolved complete-module premise', async () => {
  const { ts, program, projectRoot } = await historicalVideoIngressProgram();
  const result = deployLock.proveNativeVideoReceiptIngress(ts, program, projectRoot);
  assert.equal(result.reason, 'OTHER_PERSISTENCE_ORIGINS_UNPROVEN', JSON.stringify(result));
  assert.ok(result.proven.includes('generic-private-store-chain'));
  assert.equal(result.privateStoreChain.status, 'conditional');
  assert.equal(result.privateStoreChain.knownUses.get, 1);
  assert.equal(result.privateStoreChain.knownUses.set, 2);
  assert.equal(result.privateStoreChain.equalityPremise.status, 'unresolved');
  assert.ok(result.privateStoreChain.equalityPremise.modules.includes('apps/agent-worker/src/native-agent/task-store.ts'));
  assert.equal(result.unresolved.length, 13);
  assert.equal(result.status, 'unknown');
  assert.equal(result.releaseCompatible, false);
});

const videoIngressMutations = [
  ['model-selected-slot-result', 'apps/agent-worker/src/native-agent/host-task.ts', value => value.replace(
    'slot.result = await input.paper.call(slot.name, value.arguments, slot.sequence, slot.id);', 'slot.result = value.result;')],
  ['history-check-bypass', 'apps/agent-worker/src/native-agent/host-task.ts', value => value.replace('await validateSourceHistory(value);', 'void value;')],
  ['tool-result-equality-bypass', 'apps/agent-worker/src/native-agent/host-task.ts', value => value.replace(
    '!isDeepStrictEqual(JSON.parse(result.content), slot.result)', 'false')],
  ['session-fresh-history-bypass', 'apps/agent-worker/src/native-agent/session.ts', value => value.replace(
    "messages.some(m => m.role === 'assistant' || m.role === 'tool')", 'false')],
  ['session-prefix-bypass', 'apps/agent-worker/src/native-agent/session.ts', value => value.replace(
    '!isDeepStrictEqual(messages.slice(0, preceding.length), preceding)', 'false')],
  ['assistant-response-bypass', 'apps/agent-worker/src/native-agent/session.ts', value => value.replace(
    'message.content !== turn.response.text', 'false')],
  ['latest-checkpoint-prefix-erased', 'apps/agent-worker/src/native-agent/session.ts', value => value.replace(
    "{ state: 'started', target, request: { messages, options }, effectiveOptions: boundedOptions }",
    "{ state: 'started', target, request: { messages: [], options }, effectiveOptions: boundedOptions }")],
  ['unchecked-base-object', 'apps/agent-worker/src/presentation/handler.ts', value => value.replace(
    'await readVerifiedVideoPlan(payload.storyboard.baseAssetId)', '({ prompts: [] } as never)')],
  ['caller-supplied-saved-state', 'apps/agent-worker/src/native-agent/illustration-task.ts', value => value.replace(
    '{ ...input, savedState: saved, nativeVideo,', '{ ...input, savedState: input.savedState, nativeVideo,')],
  ['additional-materializer-caller', 'apps/agent-worker/src/native-agent/illustration-task.ts', value => value +
    '\nexport function uncheckedVideoIngress(input: any) { return createNativeIllustrationMaterializer(input); }\n'],
  ['escaped-materializer-alias', 'apps/agent-worker/src/native-agent/illustration-task.ts', value => value +
    '\nconst escapedVideoMaterializer = createNativeIllustrationMaterializer;\n'],
  ['slot-object-mutation', 'apps/agent-worker/src/native-agent/host-task.ts', value => value.replace(
    'slot.called = true;', 'slot.called = true; Object.assign(slot, { result: value.result });')],
  ['additional-store-caller', 'apps/agent-worker/src/native-agent/task-store.ts', value => value +
    '\nexport function uncheckedStoreIngress(input: any) { return createNativeTaskStore(input); }\n'],
];

const videoIngressRejections = {
  'model-selected-slot-result': ['MODEL_SELECTED_SLOT_RESULT', 'host-slot-result'],
  'history-check-bypass': ['HOST_HISTORY_CHECK_BYPASS', 'host-before-session'],
  'tool-result-equality-bypass': ['HOST_TOOL_RESULT_UNBOUND', 'host-slot-result'],
  'session-fresh-history-bypass': ['FRESH_HISTORY_NOT_EMPTY', 'session-prefix'],
  'session-prefix-bypass': ['PRIOR_PREFIX_UNBOUND', 'session-prefix'],
  'assistant-response-bypass': ['ASSISTANT_RESPONSE_UNBOUND', 'session-prefix'],
  'latest-checkpoint-prefix-erased': ['LATEST_PREFIX_NOT_RETAINED', 'session-checkpoint-prefix'],
  'unchecked-base-object': ['LIVE_BASE_NOT_RECONSTRUCTED', 'verified-base'],
  'caller-supplied-saved-state': ['CALLER_SELECTED_SAVED_STATE', 'materializer-host'],
  'additional-materializer-caller': ['EXTRA_MATERIALIZER_CALLER', 'materializer-host'],
  'escaped-materializer-alias': ['FACTORY_ALIAS_OR_ESCAPE_UNKNOWN', 'materializer-host'],
  'slot-object-mutation': ['MODEL_SELECTED_SLOT_RESULT', 'host-slot-result'],
  'additional-store-caller': ['EXTRA_UNBOUND_FACTORY_CALLER'],
};

for (const [name, file, mutate] of videoIngressMutations) test(`video constructor ingress rejects ${name} from actual source`, async () => {
  assert.equal(typeof deployLock.proveNativeVideoReceiptIngress, 'function');
  const { ts, program, projectRoot } = await historicalVideoIngressProgram(new Map([[file, mutate]]));
  const result = deployLock.proveNativeVideoReceiptIngress(ts, program, projectRoot);
  assert.equal(result.status, 'unknown');
  const [reason, edge] = videoIngressRejections[name];
  assert.equal(result.reason, reason, 'mutated claimed edge must fail at the intended binding');
  if (edge) assert.ok(!result.proven.includes(edge), `${edge} must not be proved for the counterexample`);
  assert.equal(result.releaseCompatible, false);
});

async function gatewaySupplierFixtureSource() {
  const ts = createRequire(import.meta.url)('typescript');
  const path = fileURLToPath(new URL('../../packages/ai-gateway/src/gateway.ts', import.meta.url));
  const file = ts.createSourceFile(path, await readFile(path, 'utf8'), ts.ScriptTarget.ES2022, true);
  const gateway = file.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'AiGateway');
  const property = gateway.members.find(node => ts.isPropertyDeclaration(node) && node.name?.text === 'scientificReviewProvider');
  const constructor = gateway.members.find(node => ts.isConstructorDeclaration(node));
  const assignment = constructor.body.statements.find(node => ts.isExpressionStatement(node)
    && ts.isBinaryExpression(node.expression) && ts.isPropertyAccessExpression(node.expression.left)
    && node.expression.left.name.text === 'scientificReviewProvider');
  const method = gateway.members.find(node => ts.isMethodDeclaration(node) && node.name?.text === 'canRetrySourceReviewBeforeSubmission');
  assert.ok(property && assignment && method);
  // Use the actual consumer/member/assignment without importing or executing a Provider.
  return `interface SourceReviewNotSubmittedProof { requestId: string }
interface ScienceReviewProvider { name: string; canRetrySourceReviewBeforeSubmission?(input: SourceReviewNotSubmittedProof): Promise<boolean> }
interface AiGatewayOptions { scientificReviewProvider?: ScienceReviewProvider }
class AiGateway {
${property.getText(file)}
constructor(opts: AiGatewayOptions) { ${assignment.getText(file)} }
${method.getText(file)}
}
function createFixtureGateway() { return new AiGateway({ scientificReviewProvider: { name: 'native', async canRetrySourceReviewBeforeSubmission() { return true; } } }); }
export function readPersisted(input: SourceReviewNotSubmittedProof) { return createFixtureGateway().canRetrySourceReviewBeforeSubmission(input); }
`;
}

test('class supplier proof traces the real Gateway member through constructor and factory', async t => {
  const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
  await mkdir(join(projectRoot, 'tmp'), { recursive: true });
  const root = await mkdtemp(join(projectRoot, 'tmp/r04-class-supplier-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const candidate = join(root, 'candidate'), previous = join(root, 'previous');
  for (const directory of [candidate, previous]) await mkdir(directory);
  const source = await gatewaySupplierFixtureSource();
  const options = { candidateRoot: candidate, rollbackRoot: previous, compilerRoot: projectRoot, roots: [['consumer.ts', 'readPersisted']] };
  for (const directory of [candidate, previous]) await writeFile(join(directory, 'consumer.ts'), source);
  await deployLock.verifyApplicationRollbackReaders(options);
  await writeFile(join(previous, 'consumer.ts'), source.replace('return true;', 'return false;'));
  await assert.rejects(deployLock.verifyApplicationRollbackReaders(options), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  const noProvider = source.replace("scientificReviewProvider: { name: 'native', async canRetrySourceReviewBeforeSubmission() { return true; } }", '');
  for (const directory of [candidate, previous]) await writeFile(join(directory, 'consumer.ts'), noProvider);
  await deployLock.verifyApplicationRollbackReaders(options);
  const factoryVariants = [
    source.replace(': Promise<boolean> {', ' {'),
    source.replace('return createFixtureGateway().canRetrySourceReviewBeforeSubmission(input);',
      'const gateway = createFixtureGateway(); return gateway.canRetrySourceReviewBeforeSubmission(input);'),
    source.replace('export function readPersisted(', 'function outerFactory() { return createFixtureGateway(); } export function readPersisted(')
      .replace('return createFixtureGateway().canRetrySourceReviewBeforeSubmission(input);', 'return outerFactory().canRetrySourceReviewBeforeSubmission(input);'),
    source.replace('function createFixtureGateway()', 'const createFixtureGateway = () =>'),
    noProvider.replace('this.scientificReviewProvider = opts.scientificReviewProvider;',
      'const local = () => { return false; }; local(); this.scientificReviewProvider = opts.scientificReviewProvider;'),
  ];
  for (const variant of factoryVariants) {
    for (const directory of [candidate, previous]) await writeFile(join(directory, 'consumer.ts'), variant);
    await deployLock.verifyApplicationRollbackReaders(options);
  }
});

test('class supplier proof rejects unknown, escaped, rebound or mutable Gateway origins', async t => {
  const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
  await mkdir(join(projectRoot, 'tmp'), { recursive: true });
  const root = await mkdtemp(join(projectRoot, 'tmp/r04-class-supplier-negative-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const candidate = join(root, 'candidate'), previous = join(root, 'previous');
  for (const directory of [candidate, previous]) await mkdir(directory);
  const source = await gatewaySupplierFixtureSource();
  const options = { candidateRoot: candidate, rollbackRoot: previous, compilerRoot: projectRoot, roots: [['consumer.ts', 'readPersisted']] };
  const cases = [
    source.replace('private readonly scientificReviewProvider', 'private scientificReviewProvider'),
    source.replace('this.scientificReviewProvider = opts.scientificReviewProvider;', 'if (flag) this.scientificReviewProvider = opts.scientificReviewProvider;'),
    source.replace('this.scientificReviewProvider = opts.scientificReviewProvider;', 'this.scientificReviewProvider = opts.scientificReviewProvider; this.scientificReviewProvider = replacement;'),
    source.replace('this.scientificReviewProvider = opts.scientificReviewProvider;', 'this.scientificReviewProvider = opts.scientificReviewProvider; (this.scientificReviewProvider) = replacement;'),
    source.replace('this.scientificReviewProvider = opts.scientificReviewProvider;', 'this.scientificReviewProvider = opts.scientificReviewProvider; ({ value: this.scientificReviewProvider } = replacement);'),
    source.replace('this.scientificReviewProvider = opts.scientificReviewProvider;', 'this.scientificReviewProvider = opts.scientificReviewProvider; return dynamicObject;'),
    source.replace('this.scientificReviewProvider = opts.scientificReviewProvider;', '({ scientificReviewProvider: opts.scientificReviewProvider } = dynamicOptions); this.scientificReviewProvider = opts.scientificReviewProvider;'),
    source.replace('this.scientificReviewProvider = opts.scientificReviewProvider;', 'this.scientificReviewProvider = opts.scientificReviewProvider; for (this.scientificReviewProvider of unknownProviders) {}'),
    source.replace('this.scientificReviewProvider = opts.scientificReviewProvider;', 'this.scientificReviewProvider = opts.scientificReviewProvider; for (this.scientificReviewProvider in unknownProviders) {}'),
    source.replace('this.scientificReviewProvider = opts.scientificReviewProvider;', 'opts.scientificReviewProvider.canRetrySourceReviewBeforeSubmission = unknownCallback; this.scientificReviewProvider = opts.scientificReviewProvider;'),
    source.replace('this.scientificReviewProvider = opts.scientificReviewProvider;', 'this.scientificReviewProvider = opts.scientificReviewProvider; this.scientificReviewProvider.canRetrySourceReviewBeforeSubmission = unknownCallback;'),
    source.replace('this.scientificReviewProvider = opts.scientificReviewProvider;', 'this.scientificReviewProvider = opts.scientificReviewProvider; const alias = this.scientificReviewProvider; alias.canRetrySourceReviewBeforeSubmission = unknownCallback;'),
    source.replace('this.scientificReviewProvider = opts.scientificReviewProvider;', 'mutate(opts.scientificReviewProvider); this.scientificReviewProvider = opts.scientificReviewProvider;'),
    source.replace('this.scientificReviewProvider = opts.scientificReviewProvider;', 'const alias = opts; this.scientificReviewProvider = alias.scientificReviewProvider;'),
    source.replace('this.scientificReviewProvider = opts.scientificReviewProvider;', 'mutate(opts); this.scientificReviewProvider = opts.scientificReviewProvider;'),
    source.replace('this.scientificReviewProvider = opts.scientificReviewProvider;', 'opts.scientificReviewProvider = replacement; this.scientificReviewProvider = opts.scientificReviewProvider;'),
    source.replace('constructor(opts: AiGatewayOptions)', 'constructor(opts: AiGatewayOptions = {})'),
    source.replace('class AiGateway {', 'class AiGateway extends UnknownBase {'),
    source.replace('class AiGateway {', 'class AiGateway { injected = mutate(this);'),
    source.replace('class AiGateway {', 'class AiGateway { static { injectPrototype(); }'),
    source.replace('async canRetrySourceReviewBeforeSubmission(input:', '@replaceMethod async canRetrySourceReviewBeforeSubmission(input:'),
    source.replace('return new AiGateway({ scientificReviewProvider:', 'const Ctor = AiGateway; return new Ctor({ scientificReviewProvider:'),
    source.replace("scientificReviewProvider: { name: 'native', async canRetrySourceReviewBeforeSubmission() { return true; } }", 'scientificReviewProvider: dynamicProvider()'),
    source.replace('return new AiGateway({ scientificReviewProvider:', 'return new AiGateway({ ...unknown, scientificReviewProvider:'),
    source.replace('return new AiGateway({ scientificReviewProvider:', 'return new AiGateway({ __proto__: unknown, scientificReviewProvider:'),
    source.replace('return new AiGateway({ scientificReviewProvider:', 'return new AiGateway({ scientificReviewProvider: unknown, scientificReviewProvider:'),
    source.replace('function createFixtureGateway()', 'const extra = new AiGateway(dynamicOptions()); function createFixtureGateway()'),
    source.replace('export function readPersisted(', 'createFixtureGateway = dynamicFactory; export function readPersisted('),
    `interface Proof { requestId: string }
interface Provider { name: string; canRetrySourceReviewBeforeSubmission?(p: Proof): Promise<boolean> }
interface Opts { scientificReviewProvider?: Provider }
class Gateway {
  private readonly scientificReviewProvider?: Provider;
  constructor(opts: Opts) { this.scientificReviewProvider = opts.scientificReviewProvider; }
  async canRetrySourceReviewBeforeSubmission(input: Proof) {
    if (this.scientificReviewProvider?.name === 'chatgpt-web-science-review') return false;
    return this.scientificReviewProvider?.canRetrySourceReviewBeforeSubmission?.(input) ?? false;
  }
}
function factory() { return new Gateway({}); }
factory = dynamicFactory;
export function readPersisted(input: Proof) { return factory().canRetrySourceReviewBeforeSubmission(input); }`,
    source.replace('export function readPersisted(', 'const boundFactory = createFixtureGateway.bind(other); export function readPersisted('),
    source.replace('return createFixtureGateway().canRetrySourceReviewBeforeSubmission(input);',
      'return (createFixtureGateway() as any).canRetrySourceReviewBeforeSubmission(input);'),
    source.replace('return createFixtureGateway().canRetrySourceReviewBeforeSubmission(input);',
      'return createFixtureGateway()["canRetrySourceReviewBeforeSubmission"](input);'),
    source.replace("scientificReviewProvider: { name: 'native', async canRetrySourceReviewBeforeSubmission() { return true; } }", '')
      .replace('this.scientificReviewProvider?.canRetrySourceReviewBeforeSubmission?.(input)', 'this.scientificReviewProvider.canRetrySourceReviewBeforeSubmission(input)'),
    source.replace('return this.scientificReviewProvider?.canRetrySourceReviewBeforeSubmission?.(input) ?? false;',
      'const detached = function(this: AiGateway) { return this.scientificReviewProvider?.canRetrySourceReviewBeforeSubmission?.(input) ?? false; }; return detached.call(this);'),
    source.replace('return createFixtureGateway().canRetrySourceReviewBeforeSubmission(input);',
      'const gateway = createFixtureGateway(); const detached = gateway.canRetrySourceReviewBeforeSubmission; return detached.call(other, input);'),
    ...[
      "Object.prototype['scientificReviewProvider'] = unknownProvider;",
      'Object.prototype[dynamicKey] = unknownProvider;',
      "Object.defineProperty(Object.prototype, 'scientificReviewProvider', { value: unknownProvider });",
      "Reflect.set(Object.prototype, 'scientificReviewProvider', unknownProvider);",
      'const prototypeAlias = Object.prototype; prototypeAlias[dynamicKey] = unknownProvider;',
      'const prototypeAlias = Object.getPrototypeOf({}); prototypeAlias[dynamicKey] = unknownProvider;',
      "const prototypeAlias = Object['prototype']; prototypeAlias[dynamicKey] = unknownProvider;",
      'const O = Object; const prototypeAlias = O.getPrototypeOf({}); prototypeAlias[dynamicKey] = unknownProvider;',
      "const prototypeAlias = Object['getPrototypeOf']({}); prototypeAlias[dynamicKey] = unknownProvider;",
    ].map(mutation => source.replace("scientificReviewProvider: { name: 'native', async canRetrySourceReviewBeforeSubmission() { return true; } }", '')
      .replace('export function readPersisted(', `${mutation} export function readPersisted(`)),
  ];
  for (const [index, unsafe] of cases.entries()) {
    for (const directory of [candidate, previous]) await writeFile(join(directory, 'consumer.ts'), unsafe);
    await assert.rejects(deployLock.verifyApplicationRollbackReaders(options), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u, `unsafe class origin ${index}`);
  }
});

test('rollback rejects the five unsafe runtime closure variants reproduced by independent High review', async t => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-rollback-runtime-closure-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cases = [
    { name: 'module-side-effect', reader: 'import { accepts } from "./helper"; export function readPersisted(v: string) { return accepts(v); }',
      helper: flag => `let enabled = false; enabled = ${flag}; export function accepts(v: string) { return enabled && v === "new-profile"; }` },
    { name: 'side-effect-import', reader: 'import "./helper"; export function readPersisted(v: string) { return globalThis.accepts(v); }',
      helper: flag => `globalThis.accepts = (v: string) => ${flag} && v === "new-profile";` },
    { name: 'default-object-export', reader: 'import api from "./helper"; export function readPersisted(v: string) { return api.accepts(v); }',
      helper: flag => `function accepts(v: string) { return ${flag} && v === "new-profile"; } export default { accepts };` },
    { name: 'callback-consumer', reader: 'export function readPersisted(deps: { accepts: (v: string) => boolean }, v: string) { return deps.accepts(v); }',
      helper: flag => `import { readPersisted } from "./reader"; export function consume(v: string) { return readPersisted({ accepts: (x: string) => ${flag} && x === "new-profile" }, v); }` },
    { name: 'builtin-import-alias', reader: 'export function readPersisted(v: string) { return !!accepts(v, "new-profile"); }',
      prefix: flag => `import { ${flag === 'true' ? 'isDeepStrictEqual' : 'format'} as accepts } from "node:util";`, helper: () => '' },
  ];
  for (const item of cases) await t.test(item.name, async () => {
    const candidate = join(root, item.name, 'candidate'), previous = join(root, item.name, 'previous');
    for (const [directory, flag] of [[candidate, 'true'], [previous, 'false']]) {
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, 'reader.ts'), (item.prefix?.(flag) ?? '') + item.reader);
      await writeFile(join(directory, 'helper.ts'), item.helper(flag));
    }
    const options = { candidateRoot: candidate, rollbackRoot: previous,
      compilerRoot: fileURLToPath(new URL('../../', import.meta.url)), roots: [['reader.ts', 'readPersisted']] };
    await assert.rejects(deployLock.verifyApplicationRollbackReaders(options), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
    await writeFile(join(previous, 'reader.ts'), (item.prefix?.('true') ?? '') + item.reader);
    await writeFile(join(previous, 'helper.ts'), item.helper('true'));
    // Callback recovery is provable only with its actual source supplier rooted.
    if (item.name === 'callback-consumer') options.roots.push(['helper.ts', 'consume']);
    await deployLock.verifyApplicationRollbackReaders(options);
    if (item.name === 'callback-consumer') {
      await writeFile(join(previous, 'helper.ts'), item.helper('false'));
      await assert.rejects(deployLock.verifyApplicationRollbackReaders(options), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
    }
  });
});

test('rollback fails closed for missing generated modules and unresolved dynamic loading without executing source', async t => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-rollback-unknown-runtime-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const body of [
    'import { client } from "./generated/client"; export function readPersisted(v: string) { return client(v); }',
    'export async function readPersisted(v: string) { return (await import(v)).read(v); }',
    'import * as util from "node:util"; export function readPersisted(v: string) { return util[v](v); }',
    'const util = await import("node:util"); export function readPersisted(v: string) { return util[v](v); }',
    'import {createRequire as localLoader} from "node:module"; const load = localLoader(import.meta.url); export function readPersisted(v: string) { return load(v).read(v); }',
  ]) {
    const candidate = join(root, 'candidate'), previous = join(root, 'previous');
    for (const directory of [candidate, previous]) {
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, 'reader.ts'), body);
    }
    await assert.rejects(deployLock.verifyApplicationRollbackReaders({ candidateRoot: candidate, rollbackRoot: previous,
      compilerRoot: fileURLToPath(new URL('../../', import.meta.url)), roots: [['reader.ts', 'readPersisted']] }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  }
});

test('an unused callback implementation cannot stand in for the missing reader consumer', async t => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-rollback-unused-callback-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const candidate = join(root, 'candidate'), previous = join(root, 'previous');
  for (const directory of [candidate, previous]) {
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'reader.ts'), 'type Deps={accepts:(v:string)=>boolean}; export function readPersisted(deps:Deps,v:string){return deps.accepts(v);} const unused:Deps={accepts:()=>true};');
  }
  await assert.rejects(deployLock.verifyApplicationRollbackReaders({ candidateRoot: candidate, rollbackRoot: previous,
    compilerRoot: fileURLToPath(new URL('../../', import.meta.url)), roots: [['reader.ts', 'readPersisted']] }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
});

test('callback compatibility follows the actual supplier argument rather than an unrelated typed object', async t => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-rollback-actual-callback-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const candidate = join(root, 'candidate'), previous = join(root, 'previous');
  const prefix = 'type Deps={accepts:(v:string)=>boolean}; export function readPersisted(deps:Deps,v:string){return deps.accepts(v);} const unused:Deps={accepts:()=>true};';
  const options = { candidateRoot: candidate, rollbackRoot: previous,
    compilerRoot: fileURLToPath(new URL('../../', import.meta.url)), roots: [['reader.ts', 'readPersisted']] };
  for (const body of [
    'export function consume(unknown:Deps,v:string){return readPersisted(unknown,v);}',
    'export function consume(unknown:Deps,v:string){const alias=unknown; return readPersisted(alias,v);}',
    'export function consume(unknown:Deps,v:string){return readPersisted({...unused,...unknown},v);}',
    'const actual:Deps={accepts:()=>true}; actual.accepts=unknownPredicate; export function consume(v:string){return readPersisted(actual,v);}',
    'const actual:Deps={accepts:()=>true}; export const escaped=actual; export function consume(v:string){return readPersisted(actual,v);}',
    'export const actual:Deps={accepts:()=>true}; export function consume(v:string){return readPersisted(actual,v);}',
    'function accepts(v:string){return true;} accepts=unknownPredicate; const actual:Deps={accepts}; export function consume(v:string){return readPersisted(actual,v);}',
    'function mutate(deps:Deps){deps.accepts=unknownPredicate;} const actual:Deps={accepts:()=>true}; mutate(actual); export function consume(v:string){return readPersisted(actual,v);}',
    'function forward(deps:Deps,v:string):boolean{return readPersisted(deps,v)||forward(deps,v);} export function consume(v:string){return forward({accepts:()=>true},v);}',
    'function concrete(v:string){return true;} export function consume(unknown:typeof concrete,v:string){return readPersisted({accepts:unknown},v);}',
  ]) {
    for (const directory of [candidate, previous]) {
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, 'reader.ts'), prefix + body);
    }
    await assert.rejects(deployLock.verifyApplicationRollbackReaders(options), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  }
  const concrete = 'const actual:Deps={accepts:(v:string)=>v==="new-profile"}; const alias=actual; export function consume(v:string){return readPersisted(alias,v);}';
  for (const directory of [candidate, previous]) await writeFile(join(directory, 'reader.ts'), prefix + concrete);
  await deployLock.verifyApplicationRollbackReaders(options);
  for (const directory of [candidate, previous]) await writeFile(join(directory, 'reader.ts'), 'function concrete(v:string){return true;} export function readPersisted(unknown:typeof concrete,v:string){return unknown(v);}');
  await assert.rejects(deployLock.verifyApplicationRollbackReaders(options), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  for (const directory of [candidate, previous]) await writeFile(join(directory, 'reader.ts'), 'function concrete(v:string){return true;} export function readPersisted(unknown:typeof concrete,v:string){const alias=unknown;return alias(v);}');
  await assert.rejects(deployLock.verifyApplicationRollbackReaders(options), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  for (const directory of [candidate, previous]) await writeFile(join(directory, 'reader.ts'), prefix + 'function accepts(v:string){return v==="new-profile";} const actual:Deps={accepts}; export function consume(v:string){return readPersisted(actual,v);}');
  await deployLock.verifyApplicationRollbackReaders(options);
  await writeFile(join(candidate, 'reader.ts'), prefix + concrete);
  await writeFile(join(previous, 'reader.ts'), prefix + concrete.replace('v==="new-profile"', 'false'));
  await assert.rejects(deployLock.verifyApplicationRollbackReaders(options), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
});

test('static createRequire loaders retain module provenance and follow their literal dependencies', async t => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-rollback-static-loader-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const candidate = join(root, 'candidate'), previous = join(root, 'previous');
  const options = { candidateRoot: candidate, rollbackRoot: previous,
    compilerRoot: fileURLToPath(new URL('../../', import.meta.url)), roots: [['reader.ts', 'readPersisted']] };
  const fixture = async body => {
    for (const directory of [candidate, previous]) {
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, 'reader.ts'), body);
      await writeFile(join(directory, 'helper.ts'), 'export function accepts(v:string){return v==="new-profile";}');
    }
  };
  for (const anchor of ['__filename', 'import.meta.url']) {
    await fixture(`import {createRequire as factory} from "node:module"; const load=factory(${anchor}); export function readPersisted(v:string){return load("node:util").isDeepStrictEqual(v,"new-profile");}`);
    await deployLock.verifyApplicationRollbackReaders(options);
  }
  await fixture('import {createRequire} from "node:module"; const load=createRequire(__filename); export function readPersisted(v:string){return load("./helper").accepts(v);}');
  await deployLock.verifyApplicationRollbackReaders(options);
  await writeFile(join(previous, 'helper.ts'), 'export function accepts(v:string){return false;}');
  await assert.rejects(deployLock.verifyApplicationRollbackReaders(options), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  for (const body of [
    'import {createRequire as factory} from "node:module"; export function readPersisted(v:string){const load=factory(v); return load("node:util").format(v);}',
    'import {createRequire} from "node:module"; const load=createRequire(__filename); const escaped=load; export function readPersisted(v:string){return escaped("node:util").format(v);}',
    'import {createRequire} from "node:module"; const load=createRequire(__filename); export function readPersisted(v:string){return load(v).read(v);}',
    'import {createRequire} from "node:module"; let load=createRequire(__filename); export function readPersisted(v:string){return load("node:util").format(v);}',
    'import {createRequire} from "node:module"; const load=createRequire(__filename); export function readPersisted(v:string){return load.resolve("node:util");}',
    'import {createRequire} from "node:module"; const __filename="/different/module.js"; const load=createRequire(__filename); export function readPersisted(v:string){return load("node:util").format(v);}',
  ]) {
    await fixture(body);
    await assert.rejects(deployLock.verifyApplicationRollbackReaders(options), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  }
});

test('generated Prisma runtime requires exact installed vendor and engine bytes while model readers remain compared', async t => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-rollback-prisma-vendor-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const trusted = createRequire(import.meta.url), upstreamPackageRoot = dirname(trusted.resolve('@prisma/client/package.json'));
  const version = JSON.parse(await readFile(join(upstreamPackageRoot, 'package.json'), 'utf8')).version;
  // Engine package files are the external artifact boundary. This fixture does
  // not download/install an engine or treat an absent real artifact as verified.
  const enginePackageRoot = join(root, 'installed-engines'), engine = 'libquery_engine-linux-musl.so.node';
  await mkdir(enginePackageRoot);
  await writeFile(join(enginePackageRoot, 'package.json'), JSON.stringify({ name: '@prisma/engines', version }));
  await writeFile(join(enginePackageRoot, engine), Buffer.from('trusted-engine-fixture'));
  const candidate = join(root, 'candidate'), previous = join(root, 'previous');
  for (const directory of [candidate, previous]) {
    const generated = join(directory, 'packages/prisma-fixture/generated/client');
    await mkdir(join(generated, 'runtime'), { recursive: true });
    await writeFile(join(generated, 'runtime/library.js'), await readFile(join(upstreamPackageRoot, 'runtime/library.js')));
    await writeFile(join(generated, engine), await readFile(join(enginePackageRoot, engine)));
    await writeFile(join(generated, 'package.json'), JSON.stringify({ name: 'prisma-client-fixture', version, main: 'index.js' }));
    await writeFile(join(generated, 'schema.prisma'), 'generator client { provider = "prisma-client-js" binaryTargets = ["native", "linux-musl"] }\nmodel SavedProfile { id String @id }\n');
    await writeFile(join(generated, 'index.js'), 'const runtime = require("./runtime/library.js"); exports.readPersisted = value => ({model:"new-profile",value,runtime});');
  }
  const collectorSource = deployLockSource.match(/function rollbackReaderClosure\(ts, root, roots, vendorPackages\) \{[\s\S]*?\n\}/u)?.[0];
  assert.ok(collectorSource);
  const closureContexts = new WeakMap();
  const collect = runInNewContext(`${collectorSource}; rollbackReaderClosure`, { resolve, relative, dirname, join, existsSync, readFileSync,
    builtinModules, rollbackProofContexts: closureContexts, APPLICATION_ROLLBACK_READERS: [], verifyPrismaVendorRuntime: deployLock.verifyPrismaVendorRuntime,
    rollbackCompatibilityUnknown() { throw Error('ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN'); } });
  const ts = trusted('typescript'), roots = [['packages/prisma-fixture/generated/client/index.js']], vendorPackages = { upstreamPackageRoot, enginePackageRoot };
  const currentEntries = collect(ts, candidate, roots, vendorPackages);
  const current = JSON.stringify(currentEntries);
  assert.equal(closureContexts.get(currentEntries).program.getTypeChecker(), closureContexts.get(currentEntries).checker);
  assert.equal(closureContexts.get(currentEntries).root, candidate);
  assert.equal(JSON.stringify(collect(ts, previous, roots, vendorPackages)), current);
  const core = join(candidate, 'node_modules/.prisma/client');
  await mkdir(join(core, 'runtime'), { recursive: true });
  await writeFile(join(core, 'runtime/library.js'), await readFile(join(upstreamPackageRoot, 'runtime/library.js')));
  await writeFile(join(core, engine), await readFile(join(enginePackageRoot, engine)));
  await writeFile(join(core, 'package.json'), JSON.stringify({ name: 'prisma-client-core-fixture', version, main: 'index.js' }));
  await writeFile(join(core, 'schema.prisma'), 'generator client { provider = "prisma-client-js" binaryTargets = ["native", "linux-musl"] }\nmodel SavedProfile { id String @id }\n');
  assert.deepEqual(deployLock.verifyPrismaVendorRuntime({ sourceRoot: candidate, runtimeFile: join(core, 'runtime/library.js'), ...vendorPackages }).binaryTargets,
    ['native', 'linux-musl']);
  await rm(join(core, engine));
  assert.throws(() => deployLock.verifyPrismaVendorRuntime({ sourceRoot: candidate, runtimeFile: join(core, 'runtime/library.js'), ...vendorPackages }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  const generated = join(previous, 'packages/prisma-fixture/generated/client');
  await writeFile(join(generated, 'runtime/library.js'), 'module.exports = {forged:true};');
  assert.throws(() => collect(ts, previous, roots, vendorPackages), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  await writeFile(join(generated, 'runtime/library.js'), await readFile(join(upstreamPackageRoot, 'runtime/library.js')));
  await writeFile(join(generated, engine), Buffer.from('changed-query-engine'));
  assert.throws(() => collect(ts, previous, roots, vendorPackages), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  await writeFile(join(generated, engine), await readFile(join(enginePackageRoot, engine)));
  await writeFile(join(enginePackageRoot, 'package.json'), JSON.stringify({ name: '@prisma/engines', version: '0.0.0' }));
  assert.throws(() => collect(ts, previous, roots, vendorPackages), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  await writeFile(join(enginePackageRoot, 'package.json'), JSON.stringify({ name: '@prisma/engines', version }));
  await rm(join(generated, engine));
  assert.throws(() => collect(ts, previous, roots, vendorPackages), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  await writeFile(join(generated, engine), await readFile(join(enginePackageRoot, engine)));
  await writeFile(join(generated, 'schema.prisma'), 'generator client { provider = "prisma-client-js" binaryTargets = ["native"] }\nmodel SavedProfile { id String @id }\n');
  assert.throws(() => collect(ts, previous, roots, vendorPackages), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  await writeFile(join(generated, 'schema.prisma'), '// binaryTargets = ["native", "linux-musl"]\nmodel SavedProfile { id String @id }\n');
  assert.throws(() => collect(ts, previous, roots, vendorPackages), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  await writeFile(join(generated, 'schema.prisma'), 'generator client { provider = "prisma-client-js" binaryTargets = ["native", "linux-musl"] }\nmodel SavedProfile { id String @id }\n');
  await writeFile(join(generated, 'runtime/custom-loader.js'), 'module.exports = {};');
  assert.throws(() => collect(ts, previous, roots, vendorPackages), error => error.code === 'ENOENT');
  await rm(join(generated, 'runtime/custom-loader.js'));
  await writeFile(join(generated, 'schema.prisma'), 'generator client { provider = "prisma-client-js" binaryTargets = ["native", "linux-musl"] }\nmodel SavedProfile { id String @id oldOnly String }\n');
  assert.notEqual(JSON.stringify(collect(ts, previous, roots, vendorPackages)), current);
  await writeFile(join(generated, 'schema.prisma'), 'generator client { provider = "prisma-client-js" binaryTargets = ["native", "linux-musl"] }\nmodel SavedProfile { id String @id }\n');
  await writeFile(join(generated, 'index.js'), 'const runtime = require("./runtime/library.js"); exports.readPersisted = value => ({model:"old-profile",value,runtime});');
  assert.notEqual(JSON.stringify(collect(ts, previous, roots, vendorPackages)), current);
});

test('core Prisma verifier resolves the pnpm virtual-store client layout', async t => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-prisma-core-layout-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const trusted = createRequire(import.meta.url), upstreamPackageRoot = dirname(trusted.resolve('@prisma/client/package.json'));
  const version = JSON.parse(await readFile(join(upstreamPackageRoot, 'package.json'), 'utf8')).version;
  const enginePackageRoot = join(root, 'installed-engines'), engine = 'libquery_engine-linux-musl.so.node';
  await mkdir(enginePackageRoot, { recursive: true });
  await writeFile(join(enginePackageRoot, 'package.json'), JSON.stringify({ name: '@prisma/engines', version }));
  await writeFile(join(enginePackageRoot, engine), Buffer.from('trusted-engine-fixture'));
  await writeFile(join(root, 'package.json'), '{}');
  const clientRoot = join(root, 'node_modules', '@prisma', 'client');
  await mkdir(join(clientRoot, 'runtime'), { recursive: true });
  await writeFile(join(clientRoot, 'package.json'), JSON.stringify({ name: '@prisma/client', version }));
  await copyFile(join(upstreamPackageRoot, 'runtime', 'library.js'), join(clientRoot, 'runtime', 'library.js'));
  const generatedRoot = join(root, 'node_modules', '.prisma', 'client');
  await mkdir(generatedRoot, { recursive: true });
  await writeFile(join(generatedRoot, 'package.json'), JSON.stringify({ name: 'prisma-client-fixture', version, main: 'index.js' }));
  await writeFile(join(generatedRoot, 'schema.prisma'), 'generator client { provider = "prisma-client-js" binaryTargets = ["native", "linux-musl"] }\nmodel SavedProfile { id String @id }\n');
  await copyFile(join(enginePackageRoot, engine), join(generatedRoot, engine));
  assert.deepEqual(deployLock.verifyPrismaCoreClientRuntime({ sourceRoot: root, upstreamPackageRoot, enginePackageRoot }).binaryTargets,
    ['native', 'linux-musl']);
});

test('ordinary rollback never permits an unknown reader because persisted-state diagnostics are empty', async t => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-rollback-reader-hold-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const candidate = join(root, 'candidate'), previous = join(root, 'previous');
  for (const directory of [candidate, previous]) await mkdir(directory, { recursive: true });
  await assert.rejects(deployLock.verifyApplicationRollbackReaders({ candidateRoot: candidate, rollbackRoot: previous,
    compilerRoot: fileURLToPath(new URL('../../', import.meta.url)), roots: [['missing-reader.ts', 'readPersisted']] }),
  /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
});

test('rollback cannot downgrade the private-cleanup reader after the protected archive was added', async t => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-rollback-cleaner-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const candidate = join(root, 'candidate'), previous = join(root, 'previous');
  const body = readFileSync(new URL('../private-cleanup/runner.mjs', import.meta.url), 'utf8');
  const archive = '/var/backups/openscience/retired-chatgpt-web/20261013/runtime';
  assert.ok(body.includes(archive));
  for (const directory of [candidate, previous]) {
    await mkdir(join(directory, 'infra/private-cleanup'), { recursive: true });
    await writeFile(join(directory, 'infra/private-cleanup/runner.mjs'), body);
  }
  const options = { candidateRoot: candidate, rollbackRoot: previous,
    compilerRoot: fileURLToPath(new URL('../../', import.meta.url)), roots: [['infra/private-cleanup/runner.mjs', 'main']] };
  await deployLock.verifyApplicationRollbackReaders(options);
  await writeFile(join(previous, 'infra/private-cleanup/runner.mjs'), body.replace(`, '${archive}'`, ''));
  await assert.rejects(deployLock.verifyApplicationRollbackReaders(options), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  assert.equal(await readFile(join(candidate, 'infra/private-cleanup/runner.mjs'), 'utf8'), body);
});

test('ordinary rollback compatibility failure preserves the candidate and journal and never stops producers', async t => {
  const operationSource = deployLockSource.match(/async function applicationRollbackPreflight\(options\) \{[\s\S]*?\n\}/u)?.[0];
  assert.ok(operationSource);
  for (const persistence of [
    { native: true, paidUnknown: false, firstImage: false },
    { native: false, paidUnknown: true, firstImage: false },
    { native: false, paidUnknown: false, firstImage: true },
    { native: false, paidUnknown: false, firstImage: false },
  ]) await t.test(JSON.stringify(persistence), async () => {
    const journal = { candidateSha: 'b'.repeat(40), rollbackSha: 'a'.repeat(40), phase: 'published' };
    const before = structuredClone(journal), calls = [], diagnostics = [];
    const operation = runInNewContext(`${operationSource}; applicationRollbackPreflight`, { process: {platform: 'linux', arch: 'x64'},
      async verifyProductionDeployLockOnHost() { calls.push('lock'); },
      async readTrustedJournal() { calls.push('journal-read'); return journal; },
      async nativeCommand(command, args) { calls.push(`${command}:${args.slice(0, 2).join(':')}`); assert.equal(command, 'docker'); assert.deepEqual(Array.from(args.slice(0, 2)), ['image', 'inspect']); return rollbackImageMetadataFixture(); },
      async verifyApplicationRollbackReaders() { calls.push('reader-comparison'); throw Error('new persisted contract'); },
      async queryNativeWork(candidate, checkpoint, rollback) { assert.equal(candidate, journal.candidateSha); assert.equal(checkpoint, null); assert.equal(rollback, true); calls.push('current-reader-diagnostics'); return { persistence }; },
      rollbackCompatibilityUnknown() { throw Error('ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN'); },
      console: { error(value) { diagnostics.push(value); } },
    });
    await assert.rejects(operation({ candidateSha: journal.candidateSha, rollbackSha: journal.rollbackSha }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
    assert.deepEqual(journal, before);
    assert.deepEqual(calls, ['lock', 'journal-read', 'docker:image:inspect', 'docker:image:inspect', 'reader-comparison', 'current-reader-diagnostics']);
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0].includes(journal.candidateSha), false);
  });
});

test('compatible ordinary rollback verifies both image Node runtimes and skips live-state diagnostics', async () => {
  const operationSource = deployLockSource.match(/async function applicationRollbackPreflight\(options\) \{[\s\S]*?\n\}/u)?.[0];
  const calls = [];
  const journal = { candidateSha: 'b'.repeat(40), rollbackSha: 'a'.repeat(40), phase: 'switching' };
  const operation = runInNewContext(`${operationSource}; applicationRollbackPreflight`, { process: {platform: 'linux', arch: 'x64'},
    async verifyProductionDeployLockOnHost() { calls.push('lock'); }, async readTrustedJournal() { return journal; },
    async nativeCommand(command, args) { calls.push(args.at(-1)); return rollbackImageMetadataFixture(); },
    async verifyApplicationRollbackReaders() { calls.push('reader-comparison'); },
    async queryNativeWork() { throw Error('compatible rollback must not query/drain producers'); },
    rollbackCompatibilityUnknown() { throw Error('unknown'); }, console: { error() {} },
  });
  assert.equal(await operation({ candidateSha: journal.candidateSha, rollbackSha: journal.rollbackSha }), 'APPLICATION_ROLLBACK_READERS_COMPATIBLE');
  assert.deepEqual(calls, ['lock', `openscience-agent-worker:${journal.candidateSha}`, `openscience-agent-worker:${journal.rollbackSha}`, 'reader-comparison']);
});

test('different or missing image Node runtime is unknown even when reader source would match', async () => {
  const operationSource = deployLockSource.match(/async function applicationRollbackPreflight\(options\) \{[\s\S]*?\n\}/u)?.[0];
  for (const previousRuntime of [rollbackImageMetadataFixture(['NODE_VERSION=20.14.0']), rollbackImageMetadataFixture([]),
    rollbackImageMetadataFixture(['NODE_VERSION=22.20.0', 'NODE_VERSION=20.14.0']), rollbackImageMetadataFixture(undefined, 'windows'),
    rollbackImageMetadataFixture(undefined, 'linux', 'arm64')]) {
    let reads = 0, comparisons = 0;
    const journal = { candidateSha: 'b'.repeat(40), rollbackSha: 'a'.repeat(40), phase: 'switching' };
    const operation = runInNewContext(`${operationSource}; applicationRollbackPreflight`, { process: {platform: 'linux', arch: 'x64'},
      async verifyProductionDeployLockOnHost() {}, async readTrustedJournal() { return journal; },
      async nativeCommand() { return reads++ === 0 ? rollbackImageMetadataFixture() : previousRuntime; },
      async verifyApplicationRollbackReaders() { comparisons += 1; }, async queryNativeWork() { throw Error('unknown current query'); },
      rollbackCompatibilityUnknown() { throw Error('ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN'); }, console: { error() {} },
    });
    await assert.rejects(operation({ candidateSha: journal.candidateSha, rollbackSha: journal.rollbackSha }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
    assert.equal(comparisons, 0);
  }
});

test('rollback diagnostics retain terminal Native, paid-unknown and first-image run/receipt/step obligations', async t => {
  const declaration = deployLockSource.match(/const NATIVE_WORK_QUERY = `[\s\S]*?`;/u)?.[0];
  assert.ok(declaration);
  const code = runInNewContext(`${declaration}; NATIVE_WORK_QUERY`, {});
  for (const fixture of [
    { status: 'succeeded', native: true, error: null, first: { runs: false, receipts: false, steps: false }, expected: { native: true, paidUnknown: false, firstImage: false } },
    { status: 'failed', native: false, error: '[blocked] Previous paid image outcome unknown', first: { runs: false, receipts: false, steps: false }, expected: { native: false, paidUnknown: true, firstImage: false } },
    ...['runs', 'receipts', 'steps'].map(key => ({ status: 'succeeded', native: false, error: null,
      first: { runs: key === 'runs', receipts: key === 'receipts', steps: key === 'steps' }, expected: { native: false, paidUnknown: false, firstImage: true } })),
  ]) await t.test(JSON.stringify(fixture.expected), async () => {
    let output = ''; const queries = [];
    await runInNewContext(`(async()=>{${code.replace(/^import[^\n]+\n/gmu, '')}})()`, {
      process: { env: { DATABASE_URL: 'fixture-only', REDIS_URL: 'fixture-only' }, argv: ['node', 'none', 'rollback'], stdout: { write(text) { output += text; } } },
      AGENT_TASK_QUEUE: 'agent:queue', classifyNativeWorkSnapshot: deployLock.classifyNativeWorkSnapshot,
      readNativeAgentExecution(result) { return result?.nativeAgentExecution; },
      createPrismaClient() { return {
        async $queryRawUnsafe(sql) {
          queries.push(sql);
          if (sql.startsWith('SELECT EXISTS')) return [fixture.first];
          if (sql.includes('clock_timestamp')) return [{ now: new Date('2026-10-14T00:00:00.000Z') }];
          assert.match(sql, /OR result \? 'nativeAgentExecution' OR kind='presentation.generate' AND result IS NOT NULL$/u);
          return [{ id: 'private-task-identifier', status: fixture.status, kind: 'presentation.generate', deleted_at: null,
            updated_at: new Date('2026-10-14T00:00:00.000Z'), error: fixture.error,
            result: fixture.native ? { nativeAgentExecution: { profile: 'paper-illustration' } } : null }];
        },
        journalJob: { async findMany() { return []; } }, async $disconnect() {},
      }; },
      createRedisClient() { return { async lrange() { return []; }, async quit() {} }; },
    });
    assert.deepEqual(JSON.parse(output).persistence, fixture.expected);
    assert.equal(output.includes('private-task-identifier'), false);
    assert.match(queries[1], /hermes_research_runs/u);
    assert.match(queries[1], /audit_logs/u);
    assert.match(queries[1], /hermes_research_steps/u);
  });
});

function nativeJournalFixture() {
  return {
    before: {
      runtimeId: `installed-native-continuation-${'c'.repeat(40)}`,
      skillCatalogueId: `project-catalogue-${'c'.repeat(40)}`,
      timerEnableState: 'enabled-runtime', timerWasActive: true,
      producers: { api: true, web: true, agentWorker: true },
      containers: { api: '1'.repeat(64), web: '2'.repeat(64), agentWorker: '3'.repeat(64) },
    },
    quiesceState: 'not_started', installState: 'not_attempted', restoreState: 'not_started', candidateCheckpoint: null,
  };
}

test('Native journal validates original state and rejects malformed or foreign receipts', () => {
  const candidate = 'b'.repeat(40), original = nativeJournalFixture();
  assert.equal(typeof deployLock.validateNativeJournalState, 'function');
  const validated = deployLock.validateNativeJournalState(original, candidate);
  assert.deepEqual(validated, original);
  validated.before.producers.api = false;
  assert.equal(original.before.producers.api, true);
  const installation = { releaseSha: candidate, runtimeId: `installed-native-continuation-${candidate}`,
    skillCatalogueId: `project-catalogue-${candidate}`, timerDeferred: true };
  assert.deepEqual(deployLock.validateNativeJournalState({ ...original, quiesceState: 'quiesced', installState: 'installed', installation }, candidate).installation, installation);
  const absent = nativeJournalFixture();
  absent.before.runtimeId = null; absent.before.skillCatalogueId = null;
  absent.before.timerEnableState = 'not-found'; absent.before.timerWasActive = false;
  assert.deepEqual(deployLock.validateNativeJournalState(absent, candidate), absent);
  for (const invalid of [
    { ...original, apiKey: 'must-not-persist' },
    { ...original, before: { ...original.before, timerEnableState: 'static' } },
    { ...original, before: { ...original.before, runtimeId: null } },
    { ...original, before: { ...original.before, producers: { ...original.before.producers, api: 'true' } } },
    { ...original, installation },
    { ...original, installState: 'installed', installation: { ...installation, releaseSha: 'd'.repeat(40) } },
    { ...original, installState: 'installed', installation: { ...installation, timerDeferred: false } },
    { ...original, candidateCheckpoint: 'not-db-time' },
  ]) assert.throws(() => deployLock.validateNativeJournalState(invalid, candidate), /Native deployment state/u);
});

test('Native journal preserves the original capture and rejects reset, late mode and receipt replacement', () => {
  const candidate = 'b'.repeat(40), before = nativeJournalFixture();
  assert.equal(typeof deployLock.preserveNativeJournalState, 'function');
  assert.equal(deployLock.preserveNativeJournalState(null, undefined, candidate, true), undefined);
  assert.deepEqual(deployLock.preserveNativeJournalState(null, before, candidate, true), before);
  assert.deepEqual(deployLock.preserveNativeJournalState({ nativeRefresh: before }, undefined, candidate, false), before);
  const quiesced = { ...before, quiesceState: 'quiesced' };
  const attempted = { ...quiesced, installState: 'install_attempting' };
  assert.deepEqual(deployLock.preserveNativeJournalState({ nativeRefresh: quiesced }, attempted, candidate, false), attempted);
  const installation = { releaseSha: candidate, runtimeId: `installed-native-continuation-${candidate}`,
    skillCatalogueId: `project-catalogue-${candidate}`, timerDeferred: true };
  const completed = { ...attempted, installState: 'installed', installation };
  assert.deepEqual(deployLock.preserveNativeJournalState({ nativeRefresh: attempted }, completed, candidate, false), completed);
  assert.deepEqual(deployLock.preserveNativeJournalState({ nativeRefresh: completed }, undefined, candidate, false), completed);
  for (const [previous, incoming] of [
    [{}, before],
    [{ nativeRefresh: before }, { ...before, before: { ...before.before, timerWasActive: false } }],
    [{ nativeRefresh: attempted }, quiesced],
    [{ nativeRefresh: quiesced }, completed],
    [{ nativeRefresh: completed }, attempted],
    [{ nativeRefresh: completed }, { ...completed, installation: { ...installation, runtimeId: 'foreign-runtime' } }],
  ]) assert.throws(() => deployLock.preserveNativeJournalState(previous, incoming, candidate, false), /Native deployment state/u);
});

test('Native candidate identities are atomic and immutable without backfilling legacy checkpoints', () => {
  const candidate = 'b'.repeat(40), checkpoint = '2026-10-09T08:00:00.000Z';
  const installation = { releaseSha: candidate, runtimeId: `installed-native-continuation-${candidate}`,
    skillCatalogueId: `project-catalogue-${candidate}`, timerDeferred: true };
  const installed = { ...nativeJournalFixture(), quiesceState: 'quiesced', installState: 'installed', installation };
  const containers = { api: '4'.repeat(64), web: '5'.repeat(64), agentWorker: '6'.repeat(64) };
  const started = deployLock.transitionNativeJournalState(installed, candidate, 'candidate-start', { checkpoint, containers });
  assert.equal(started.candidateCheckpoint, checkpoint);
  assert.deepEqual(started.candidateContainers, containers);
  assert.deepEqual(deployLock.preserveNativeJournalState({ nativeRefresh: installed }, started, candidate, false), started);
  const legacy = { ...installed, candidateCheckpoint: checkpoint };
  assert.deepEqual(deployLock.validateNativeJournalState(legacy, candidate), legacy);
  const legacyPhase = deployLock.transitionNativeJournalState(legacy, candidate, 'rollback-quiesce-start');
  assert.deepEqual(deployLock.preserveNativeJournalState({ nativeRefresh: legacy }, legacyPhase, candidate, false), legacyPhase);
  assert.equal(Object.hasOwn(legacyPhase, 'candidateContainers'), false);
  for (const bad of [null, { api: containers.api, web: containers.web }, { ...containers, extra: containers.api },
    { ...containers, web: 'bad' }, { ...containers, web: null }]) {
    assert.throws(() => deployLock.validateNativeJournalState({ ...started, candidateContainers: bad }, candidate), /Native deployment state/u);
  }
  for (const detail of [checkpoint, { checkpoint }, { containers }, { checkpoint, containers, extra: true }]) {
    assert.throws(() => deployLock.transitionNativeJournalState(installed, candidate, 'candidate-start', detail), /Native deployment state/u);
  }
  const withoutIds = structuredClone(started); delete withoutIds.candidateContainers;
  for (const [previous, next] of [
    [installed, { ...installed, candidateCheckpoint: checkpoint }],
    [installed, { ...installed, candidateContainers: containers }],
    [legacy, { ...legacy, candidateContainers: containers }],
    [started, withoutIds],
    [started, { ...started, candidateContainers: { ...containers, web: '7'.repeat(64) } }],
  ]) assert.throws(() => deployLock.preserveNativeJournalState({ nativeRefresh: previous }, next, candidate, false), /Native deployment state/u);
  assert.throws(() => deployLock.preserveNativeJournalState(null, started, candidate, true), /Native deployment state/u);
});

test('Native refresh flag defaults off and forwards only the explicit sixth argument', () => {
  assert.match(launcherSource, /^REFRESH_NATIVE_RESOURCES=0$/mu);
  assert.match(launcherSource, /--refresh-native-resources\) REFRESH_NATIVE_RESOURCES=1; shift/u);
  const tail = launcherSource.match(/^NATIVE_REFRESH_ARG=""[\s\S]*$/mu)?.[0];
  assert.ok(tail, 'use the real narrow forwarding code without source/config/SSH preparation');
  const candidate = 'b'.repeat(40), rollback = 'a'.repeat(40);
  for (const selected of [0, 1]) {
    const setup = [
      'fixture_ssh(){ printf "%s\\n" "$@"; }',
      'SSH_EXECUTABLE=fixture_ssh; SSH_OPTS=(); SSH_USER=fixture; SSH_HOST=example.invalid',
      `REMOTE_TRANSACTION_RUNNER='/opt/openscience-releases/${candidate}/infra/scripts/production-deploy-transaction.sh'`,
      `RELEASE_SHA='${candidate}'; ROLLBACK_SHA='${rollback}'; SKIP_MIGRATE=0; NO_TESTS=0; REUSE_UNCHANGED_CAPABILITY_IMAGES=0; REFRESH_NATIVE_RESOURCES=${selected}`,
    ].join('\n');
    const result = spawnSync(bash, ['-c', `${setup}\n${tail}`], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const expected = `exec /bin/bash '/opt/openscience-releases/${candidate}/infra/scripts/production-deploy-transaction.sh' '${candidate}' '${rollback}' '0' '0' '0'${selected ? " '1'" : ''} </dev/null`;
    assert.equal(result.stdout.trim(), `fixture@example.invalid\n${expected}`);
  }
});

test('Native refresh rejects invalid or excess transaction arguments before host operations', () => {
  const runner = fileURLToPath(new URL('./production-deploy-transaction.sh', import.meta.url)).replaceAll('\\', '/');
  const args = ['b'.repeat(40), 'a'.repeat(40), '0', '0', '0'];
  const invalid = spawnSync(bash, [runner, ...args, '2'], { encoding: 'utf8' });
  assert.equal(invalid.status, 64);
  assert.match(invalid.stderr, /Native/u);
  const excess = spawnSync(bash, [runner, ...args, '0', 'extra'], { encoding: 'utf8' });
  assert.equal(excess.status, 64);
  assert.match(excess.stderr, /runner/u);
});

test('Native transitions persist install and restore intent before accepting exact receipts', () => {
  const candidate = 'b'.repeat(40);
  let state = nativeJournalFixture();
  assert.equal(typeof deployLock.transitionNativeJournalState, 'function');
  const transition = (action, detail) => {
    const next = deployLock.transitionNativeJournalState(state, candidate, action, detail);
    state = deployLock.preserveNativeJournalState({ nativeRefresh: state }, next, candidate, false);
  };
  assert.throws(() => transition('install-start'), /Native deployment state/u);
  transition('quiesce-start'); transition('quiesce-complete'); transition('install-start');
  const installation = { releaseSha: candidate, runtimeId: `installed-native-continuation-${candidate}`,
    skillCatalogueId: `project-catalogue-${candidate}`, timerDeferred: true };
  assert.throws(() => transition('install-complete', { ...installation, releaseSha: 'd'.repeat(40) }), /Native deployment state/u);
  transition('install-complete', installation);
  transition('candidate-start', { checkpoint: '2026-10-09T08:00:00.000Z', containers: { api: '4'.repeat(64), web: '5'.repeat(64), agentWorker: '6'.repeat(64) } });
  transition('rollback-quiesce-start'); transition('rollback-quiesce-complete');
  assert.throws(() => transition('restore-complete', {}), /Native deployment state/u);
  transition('restore-start');
  const restored = { releaseSha: candidate, restored: true, timerDeferred: true,
    previousRuntimeId: state.before.runtimeId, previousSkillCatalogueId: state.before.skillCatalogueId };
  assert.throws(() => transition('restore-complete', { ...restored, previousRuntimeId: 'foreign' }), /Native deployment state/u);
  transition('restore-complete', restored);
  assert.equal(state.restoreState, 'restored_verified');
  assert.equal(state.candidateCheckpoint, '2026-10-09T08:00:00.000Z');
});

test('Native work classification preserves pending queues and holds unknown, live and candidate-bound work', () => {
  assert.equal(typeof deployLock.classifyNativeWorkSnapshot, 'function');
  const task = { id: 't1', status: 'pending', deletedAt: null, nativePending: true,
    providerUncertain: false, updatedAt: '2026-10-09T07:00:00.000Z' };
  const snapshot = { tasks: [task], queue: ['t1'], processing: ['t1'], journals: [] };
  assert.deepEqual(deployLock.classifyNativeWorkSnapshot(snapshot, null), { safe: true, nativePending: true, nativeBoundPending: false });
  assert.equal(deployLock.classifyNativeWorkSnapshot({ ...snapshot, tasks: [{ ...task, status: 'running' }] }, null).safe, false);
  assert.equal(deployLock.classifyNativeWorkSnapshot({ ...snapshot, processing: ['missing'] }, null).safe, false);
  assert.equal(deployLock.classifyNativeWorkSnapshot({ ...snapshot, tasks: [{ ...task, providerUncertain: true }] }, null).safe, false);
  assert.equal(deployLock.classifyNativeWorkSnapshot({ tasks: [{ ...task, status: 'failed', providerUncertain: true }], queue: [], processing: [], journals: [] }, null).safe, true);
  assert.equal(deployLock.classifyNativeWorkSnapshot({ ...snapshot, journals: [{ state: 'pending', leaseToken: 'live', leaseExpiresAt: null, updatedAt: task.updatedAt }] }, null).safe, false);
  assert.equal(deployLock.classifyNativeWorkSnapshot(snapshot, '2026-10-09T06:00:00.000Z').safe, false);
  assert.equal(deployLock.classifyNativeWorkSnapshot(snapshot, '2026-10-09T08:00:00.000Z').safe, true);
  assert.equal(deployLock.classifyNativeWorkSnapshot({ ...snapshot, tasks: [{ ...task, status: 'succeeded' }], queue: [], processing: [] }, '2026-10-09T06:00:00.000Z').safe, true);
});

test('Native producer pause uses exact identities and infinite daemon stop; timeout, OOM and replacement remain held', async () => {
  const body = deployLockSource.match(/async function pauseNativeProducers\([^)]*\) \{[\s\S]*?\n\}/u)?.[0];
  assert.ok(body);
  const id = '1'.repeat(64);
  const modes = [
    { name: 'graceful', accepted: true },
    { name: 'client-timeout', clientTimeout: true },
    { name: 'oom', stopped: { OOMKilled: true } },
    { name: 'nonzero', exitCode: 137 },
    { name: 'replacement', replacement: true },
    { name: 'original-identity-changed', originalIdentityChanged: true },
    { name: 'web-graceful', service: 'web', accepted: true },
    { name: 'worker-graceful', service: 'agentWorker', accepted: true },
    { name: 'web-npm-exit1', service: 'web', exitCode: 1, accepted: true },
    { name: 'api-exit1', exitCode: 1 },
    { name: 'worker-exit1', service: 'agentWorker', exitCode: 1 },
    { name: 'web-wrong-command', service: 'web', exitCode: 1, config: { Cmd: ['npm', 'run', 'dev'] } },
    { name: 'web-extra-command', service: 'web', exitCode: 1, config: { Cmd: ['npm', 'run', 'start', '--'] } },
    { name: 'web-command-string', service: 'web', exitCode: 1, config: { Cmd: 'npm run start' } },
    { name: 'web-wrong-directory', service: 'web', exitCode: 1, config: { WorkingDir: '/opt/openscience' } },
    { name: 'web-wrong-service', service: 'web', exitCode: 1, config: { Labels: { 'com.docker.compose.service': 'api' } } },
    { name: 'web-oom', service: 'web', exitCode: 1, stopped: { OOMKilled: true } },
    { name: 'web-error', service: 'web', exitCode: 1, stopped: { Error: 'stop failed' } },
    { name: 'web-missing-error', service: 'web', exitCode: 1, stopped: { Error: undefined } },
    { name: 'web-null-error', service: 'web', exitCode: 1, stopped: { Error: null } },
    { name: 'web-exit137', service: 'web', exitCode: 137 },
    { name: 'web-exit143', service: 'web', exitCode: 143 },
    { name: 'web-client-timeout', service: 'web', exitCode: 1, clientTimeout: true },
    { name: 'web-replacement', service: 'web', exitCode: 1, replacement: true },
    { name: 'web-still-running', service: 'web', exitCode: 1, stopped: { Running: true } },
    { name: 'web-after-running', service: 'web', exitCode: 1, afterRunning: true },
    { name: 'web-wrong-status', service: 'web', exitCode: 1, stopped: { Status: 'dead' } },
    { name: 'web-original-stopped', service: 'web', exitCode: 1, originalRunning: false },
    { name: 'web-original-running-string', service: 'web', exitCode: 1, originalRunning: 'true' },
  ];
  for (const mode of modes) {
    const calls = []; let inventory = 0;
    const service = mode.service ?? 'api';
    const originalRunning = mode.originalRunning ?? true;
    const config = {
      Labels: { 'com.docker.compose.service': service === 'agentWorker' ? 'agent-worker' : service },
      Cmd: service === 'web' ? ['npm', 'run', 'start'] : ['node', 'dist/index.js'],
      WorkingDir: service === 'web' ? '/opt/openscience/apps/web' : '/opt/openscience',
      ...mode.config,
    };
    const context = {
      invalidNativeState() { throw new Error('held'); },
      async nativeContainers() {
        inventory += 1;
        return { api: null, web: null, agentWorker: null,
          [service]: { Id: mode.replacement && inventory > 1 ? '2'.repeat(64) : id, Config: config,
            State: { Running: inventory === 1 ? originalRunning : Boolean(mode.afterRunning) } } };
      },
      async nativeCommand(command, args, options) {
        calls.push({ command, args, options });
        if (args[0] === 'stop') {
          if (mode.clientTimeout) throw new Error('held');
          return id;
        }
        return JSON.stringify({ Status: 'exited', Running: false, ExitCode: mode.exitCode ?? 0, OOMKilled: false, Error: '', ...mode.stopped });
      },
    };
    const pause = runInNewContext(`${body}; pauseNativeProducers`, context);
    const state = { before: { containers: { api: null, web: null, agentWorker: null,
      [service]: mode.originalIdentityChanged ? '4'.repeat(64) : id } } };
    if (mode.accepted) await assert.doesNotReject(pause(state, true), mode.name);
    else await assert.rejects(pause(state, true), /held/u, mode.name);
    if (mode.originalIdentityChanged) assert.equal(calls.length, 0);
    else if (originalRunning) {
      assert.equal(calls[0].command, 'docker');
      assert.deepEqual(Array.from(calls[0].args), ['stop', '--time', '-1', id]);
      assert.equal(calls[0].options.timeout, 600_000);
    } else assert.equal(calls.some(call => call.args[0] === 'stop'), false);
    assert.equal(calls.some(call => call.args.includes('kill') || call.args.includes('restart')), false);
  }
});

function nativeRecoverySequenceFixture({ webProducer = true } = {}) {
  const candidate = 'b'.repeat(40), before = nativeJournalFixture().before;
  before.producers.web = webProducer;
  const journal = { phase: 'migrating', candidateSha: candidate, rollbackSha: 'a'.repeat(40), nativeRefresh: { ...nativeJournalFixture(), before } };
  const containers = Object.fromEntries(['api', 'web', 'agentWorker'].map(service => [service, {
    Id: before.containers[service],
    Config: { Image: service === 'agentWorker' ? `openscience-agent-worker:${journal.rollbackSha}` : 'node:22',
      StopSignal: 'SIGTERM', Labels: { 'com.docker.compose.project': 'openscience-prod', 'com.docker.compose.oneoff': 'False', 'com.docker.compose.service': service === 'agentWorker' ? 'agent-worker' : service,
        'com.docker.compose.project.working_dir': `/opt/openscience-releases/${journal.rollbackSha}` },
      Cmd: service === 'web' ? ['npm', 'run', 'start'] : ['node', 'dist/index.js'],
      WorkingDir: `/opt/openscience/apps/${service === 'agentWorker' ? 'agent-worker' : service}`,
      Env: service === 'web' ? [] : ['HERMES_NATIVE_AGENT_ENABLED=true', `HERMES_NATIVE_RUNTIME_ID=${before.runtimeId}`,
        `HERMES_NATIVE_SKILL_CATALOGUE_ID=${before.skillCatalogueId}`, 'HERMES_NATIVE_AGENT_MODEL=MiniMax-M3', 'HERMES_NATIVE_AGENT_INBOX=/native-agent/inbox'] },
    State: { Running: service !== 'web' || webProducer, Status: service === 'web' && !webProducer ? 'exited' : 'running', ExitCode: 0, OOMKilled: false, Error: '', StartedAt: '2026-10-09T07:00:00.000Z', FinishedAt: '0001-01-01T00:00:00Z' }, RestartCount: 0,
    HostConfig: { RestartPolicy: { Name: 'unless-stopped' } },
    Mounts: [{ Type: 'bind', Source: `/opt/openscience-releases/${journal.rollbackSha}`, Destination: '/opt/openscience', RW: false },
      ...(service === 'agentWorker' ? [{ Type: 'bind', Source: '/opt/openscience-hermes/inbox', Destination: '/native-agent/inbox', RW: true }] : [])],
  }]));
  const calls = [], answers = [], faults = { keepWebRunning: false };
  let imageBuilt = false, migrated = false, timerHeld = false;
  const options = { candidateSha: candidate, rollbackSha: journal.rollbackSha };
  const extract = name => {
    const body = deployLockSource.match(new RegExp(`(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`, 'u'))?.[0];
    assert.ok(body, name); return body;
  };
  const queryDeclaration = deployLockSource.match(/const NATIVE_WORK_QUERY = `[\s\S]*?`;/u)?.[0];
  assert.ok(queryDeclaration);
  const context = {
    process: { env: {} }, NATIVE_ROOT: '/opt/openscience-hermes',
    verifyNativeContainerBinding: deployLock.verifyNativeContainerBinding,
    validateNativeJournalState: deployLock.validateNativeJournalState, transitionNativeJournalState: deployLock.transitionNativeJournalState,
    invalidNativeState() { throw new Error('held'); },
    async verifyProductionDeployLockOnHost() {}, async readTrustedJournal() { return structuredClone(journal); },
    async writeProductionDeployJournal(value) {
      journal.nativeRefresh = deployLock.preserveNativeJournalState(journal, value.native, candidate, false);
      calls.push(`journal:${journal.nativeRefresh.quiesceState}`);
    },
    async nativeContainers() { return structuredClone(containers); },
    async holdNativeTimer() { timerHeld = true; calls.push('timer-held'); },
    async verifyNativeIdle() { assert.equal(timerHeld, true); calls.push('idle'); },
    async verifyNativeBinding(value) { assert.deepEqual(value, before); calls.push('old-binding'); },
    async open() { calls.push('resource-write'); throw new Error('unexpected resource write'); }, async rm() {}, randomUUID() { return 'fixture'; },
    async nativeCommand(command, args, commandOptions) {
      if (command === 'docker' && args[0] === 'stop') {
        assert.deepEqual(Array.from(args.slice(0, 3)), ['stop', '--time', '-1']);
        assert.equal(commandOptions.timeout, 600_000);
        calls.push('stop');
        for (const container of Object.values(containers).filter(value => value && args.slice(3).includes(value.Id))) {
          if (faults.keepWebRunning && container === containers.web) continue;
          container.State = { Status: 'exited', Running: false, ExitCode: container === containers.web ? 1 : 0, OOMKilled: false, Error: '' };
        }
        return args.slice(3).join('\n');
      }
      if (command === 'docker' && args[0] === 'inspect') return JSON.stringify(Object.values(containers).find(value => value.Id === args.at(-1)).State);
      if (command === 'docker' && args[0] === 'compose') {
        assert.equal(imageBuilt, true); assert.equal(migrated, true);
        assert.equal(commandOptions.env.XGS_RELEASE_IMAGE_TAG, candidate);
        assert.equal(commandOptions.env.XGS_RELEASE_ROOT, `/opt/openscience-releases/${candidate}`);
        assert.equal(args.at(-2), context.NATIVE_WORK_QUERY);
        calls.push(`query:${args.at(-1)}`);
        return JSON.stringify({ safe: answers.shift() ?? true, nativePending: false, nativeBoundPending: false, dbTime: '2026-10-09T08:00:00.000Z' });
      }
      if (command === '/usr/bin/python3' && args.includes('--restore-previous')) {
        calls.push('restore');
        return JSON.stringify({ releaseSha: candidate, restored: true, timerDeferred: true, previousRuntimeId: before.runtimeId, previousSkillCatalogueId: before.skillCatalogueId });
      }
      throw new Error(`unexpected command ${command}:${args[0]}`);
    },
  };
  const createdVerifier = deployLockSource.match(/function verifyNeverStartedCandidate\([^)]*\) \{[\s\S]*?\n\}/u)?.[0] ?? '';
  const operation = runInNewContext(`${extract('exactObjectKeys')}\n${queryDeclaration}\n${createdVerifier}\n${extract('pauseNativeProducers')}\n${extract('queryNativeWork')}\n${extract('nativeOperation')}; nativeOperation`, context);
  context.NATIVE_WORK_QUERY = runInNewContext(`${queryDeclaration}; NATIVE_WORK_QUERY`, {});
  const run = command => operation(command, options);
  return {
    journal, containers, calls, answers, faults, run, context, options,
    async quiesce() {
      imageBuilt = true; calls.push('image-built');
      await run('native-pause-original');
      assert.equal(journal.nativeRefresh.quiesceState, 'quiesced');
      migrated = true; journal.phase = 'switching'; calls.push('migration-complete');
    },
    async failBeforeInstall() {
      answers.push(false);
      await assert.rejects(run('native-install'), /held/u);
      assert.equal(journal.nativeRefresh.installState, 'not_attempted');
      assert.equal(calls.includes('resource-write'), false);
      assert.ok(calls.indexOf('image-built') < calls.indexOf('stop'));
      assert.ok(calls.indexOf('migration-complete') < calls.findIndex(value => value.startsWith('query:')));
    },
    async installed(checkpoint = null) {
      let state = deployLock.transitionNativeJournalState(journal.nativeRefresh, candidate, 'install-start');
      state = deployLock.transitionNativeJournalState(state, candidate, 'install-complete', { releaseSha: candidate,
        runtimeId: `installed-native-continuation-${candidate}`, skillCatalogueId: `project-catalogue-${candidate}`, timerDeferred: true });
      journal.nativeRefresh = state;
      if (checkpoint) {
        this.createCandidate();
        await run('native-before-start');
        assert.equal(journal.nativeRefresh.candidateCheckpoint, checkpoint);
        this.startCandidate();
      }
    },
    createCandidate(services = ['api', 'web', 'agentWorker']) {
        for (const [index, [service, container]] of Object.entries(containers).entries()) {
          if (!services.includes(service)) continue;
          container.Id = String(index + 4).repeat(64);
          container.Config.Image = service === 'agentWorker' ? `openscience-agent-worker:${candidate}` : 'node:22';
          container.Config.Labels['com.docker.compose.project.working_dir'] = `/opt/openscience-releases/${candidate}`;
          container.Config.Env = service === 'web' ? [] : ['HERMES_NATIVE_AGENT_ENABLED=true', `HERMES_NATIVE_RUNTIME_ID=${journal.nativeRefresh.installation.runtimeId}`,
            `HERMES_NATIVE_SKILL_CATALOGUE_ID=${journal.nativeRefresh.installation.skillCatalogueId}`, 'HERMES_NATIVE_AGENT_MODEL=MiniMax-M3', 'HERMES_NATIVE_AGENT_INBOX=/native-agent/inbox'];
          container.Mounts[0].Source = `/opt/openscience-releases/${candidate}`;
          container.State = { Running: false, Status: 'created', ExitCode: 0, OOMKilled: false, Error: '', StartedAt: '0001-01-01T00:00:00Z', FinishedAt: '0001-01-01T00:00:00Z' };
          container.RestartCount = 0;
          assert.notEqual(container.Id, before.containers[service]);
          deployLock.verifyNativeContainerBinding(container, { service: service === 'agentWorker' ? 'agent-worker' : service,
            releaseSha: candidate, ...journal.nativeRefresh.installation, running: false });
        }
    },
    startCandidate() {
      timerHeld = false;
      for (const container of Object.values(containers)) container.State = {
        Running: true, Status: 'running', ExitCode: 0, OOMKilled: false, Error: '',
        StartedAt: journal.nativeRefresh.candidateCheckpoint, FinishedAt: '0001-01-01T00:00:00Z', Health: { Status: 'healthy' },
      };
    },
    transition(action) { journal.nativeRefresh = deployLock.transitionNativeJournalState(journal.nativeRefresh, candidate, action); },
  };
}

test('Native recovery repeats certified original Web pause after pre-install failure and held rollback', async t => {
  await t.test('pre-install failure then direct recovery rechecks stopped Web1 without a second stop', async () => {
    const fixture = nativeRecoverySequenceFixture();
    await fixture.quiesce(); await fixture.failBeforeInstall();
    await assert.doesNotReject(fixture.run('native-prepare-rollback'), 'certified original Web1 must remain recoverable');
    assert.equal(fixture.journal.nativeRefresh.quiesceState, 'rollback_quiesced');
    assert.equal(fixture.journal.nativeRefresh.installState, 'not_attempted');
    assert.equal(fixture.calls.at(-1), 'old-binding');
    assert.equal(fixture.calls.filter(value => value === 'stop').length, 1);
    assert.equal(fixture.calls.includes('restore'), false);
  });
  await t.test('unsafe queries preserve a candidate checkpoint until a safe reentry', async () => {
    const fixture = nativeRecoverySequenceFixture(), checkpoint = '2026-10-09T08:00:00.000Z';
    await fixture.quiesce(); await fixture.installed(checkpoint); fixture.answers.push(false, false, true);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await assert.rejects(fixture.run('native-prepare-rollback'), /held/u);
      assert.equal(fixture.journal.nativeRefresh.quiesceState, 'rollback_quiescing');
      assert.equal(fixture.journal.nativeRefresh.candidateCheckpoint, checkpoint);
      assert.equal(fixture.journal.nativeRefresh.restoreState, 'not_started');
      assert.equal(fixture.calls.filter(value => value === `query:${checkpoint}`).length, attempt + 1,
        'same stopped candidate Web must reach each readonly work check before eventual recovery');
    }
    await fixture.run('native-prepare-rollback');
    assert.equal(fixture.journal.nativeRefresh.quiesceState, 'rollback_quiesced');
    assert.equal(fixture.journal.nativeRefresh.candidateCheckpoint, checkpoint);
    assert.equal(fixture.journal.nativeRefresh.restoreState, 'restored_verified');
    assert.equal(fixture.calls.filter(value => value === 'restore').length, 1);
    const callsBefore = fixture.calls.length;
    await assert.rejects(fixture.run('native-prepare-rollback'), /held/u);
    assert.equal(fixture.calls.length, callsBefore, 'completed rollback has no new resume contract');
  });
  await t.test('repeated hold then prepare completes the already-started rollback transition', async () => {
    const fixture = nativeRecoverySequenceFixture();
    await fixture.quiesce(); await fixture.failBeforeInstall();
    await fixture.run('native-hold-producers');
    const held = JSON.stringify(fixture.journal.nativeRefresh);
    await fixture.run('native-hold-producers');
    assert.equal(JSON.stringify(fixture.journal.nativeRefresh), held);
    assert.equal(fixture.journal.nativeRefresh.quiesceState, 'rollback_quiescing');
    await fixture.run('native-prepare-rollback');
    assert.equal(fixture.journal.nativeRefresh.quiesceState, 'rollback_quiesced');
    assert.equal(fixture.calls.filter(value => value === 'journal:rollback_quiescing').length, 1);
    assert.equal(fixture.calls.filter(value => value === 'stop').length, 1);
    assert.equal(fixture.calls.at(-1), 'old-binding');
  });
  await t.test('candidate hold preserves captured identities through unsafe and safe prepare', async () => {
    const fixture = nativeRecoverySequenceFixture();
    await fixture.quiesce(); await fixture.installed('2026-10-09T08:00:00.000Z');
    const ids = structuredClone(fixture.journal.nativeRefresh.candidateContainers);
    await fixture.run('native-hold-producers'); await fixture.run('native-hold-producers');
    fixture.answers.push(false, true);
    await assert.rejects(fixture.run('native-prepare-rollback'), /held/u);
    assert.equal(fixture.journal.nativeRefresh.quiesceState, 'rollback_quiescing');
    assert.deepEqual(fixture.journal.nativeRefresh.candidateContainers, ids);
    await fixture.run('native-prepare-rollback');
    assert.equal(fixture.journal.nativeRefresh.restoreState, 'restored_verified');
    assert.deepEqual(fixture.journal.nativeRefresh.candidateContainers, ids);
    assert.equal(fixture.calls.filter(value => value === 'stop').length, 2);
  });
});

test('Native before-start captures only complete never-started candidate bindings', async () => {
  const fixture = nativeRecoverySequenceFixture();
  await fixture.quiesce(); await fixture.installed(); fixture.createCandidate();
  const ids = Object.fromEntries(Object.entries(fixture.containers).map(([key, container]) => [key, container.Id]));
  await fixture.run('native-before-start');
  assert.deepEqual(fixture.journal.nativeRefresh.candidateContainers, ids);
  assert.equal(fixture.journal.nativeRefresh.candidateCheckpoint, '2026-10-09T08:00:00.000Z');
  assert.equal(Object.values(fixture.containers).some(container => container.State.Running), false);
  for (const damage of [
    f => { f.containers.agentWorker = null; },
    f => { f.containers.web.State.Running = true; f.containers.web.State.Status = 'running'; },
    f => { f.containers.api.Config.Env[1] = 'HERMES_NATIVE_RUNTIME_ID=foreign'; },
    f => { f.containers.agentWorker.Config.Image = `openscience-agent-worker:${'a'.repeat(40)}`; },
    f => { f.containers.web.Mounts[0].Source = '/foreign'; },
  ]) {
    const bad = nativeRecoverySequenceFixture();
    await bad.quiesce(); await bad.installed(); bad.createCandidate(); damage(bad);
    await assert.rejects(bad.run('native-before-start'), /held|Native deployment state/u);
    assert.equal(bad.journal.nativeRefresh.candidateCheckpoint, null);
    assert.equal(Object.hasOwn(bad.journal.nativeRefresh, 'candidateContainers'), false);
  }
});

test('Native recovery handles full and partial candidate create before a checkpoint without admitting unknown starts', async () => {
  for (const created of [['api', 'web', 'agentWorker'], ['web'], ['api', 'agentWorker']]) {
    const fixture = nativeRecoverySequenceFixture();
    await fixture.quiesce(); await fixture.installed(); fixture.createCandidate(created); fixture.answers.push(false);
    await assert.rejects(fixture.run('native-before-start'), /held/u);
    assert.equal(fixture.journal.nativeRefresh.candidateCheckpoint, null);
    assert.equal(Object.hasOwn(fixture.journal.nativeRefresh, 'candidateContainers'), false);
    await fixture.run('native-prepare-rollback');
    assert.equal(fixture.journal.nativeRefresh.quiesceState, 'rollback_quiesced');
    assert.equal(fixture.journal.nativeRefresh.restoreState, 'restored_verified');
    assert.equal(fixture.calls.filter(value => value === 'stop').length, 1, 'created containers must never be stopped as running workloads');
  }
  for (const damage of [
    f => { f.containers.web.State.Status = 'exited'; },
    f => { f.containers.web.State.StartedAt = '2026-10-09T08:00:00.000Z'; },
    f => { f.containers.web.State.FinishedAt = '2026-10-09T08:00:01.000Z'; },
    f => { f.containers.web.RestartCount = 1; },
    f => { f.containers.web.State.Running = true; f.containers.web.State.Status = 'running'; },
    f => { f.containers.web.State.Error = 'failed'; },
    f => { f.containers.web.State.OOMKilled = true; },
    f => { f.containers.web.Config.Labels['com.docker.compose.project.working_dir'] = '/foreign'; },
    f => { f.containers.agentWorker.Config.Image = `openscience-agent-worker:${'a'.repeat(40)}`; },
  ]) {
    const fixture = nativeRecoverySequenceFixture();
    await fixture.quiesce(); await fixture.installed(); fixture.createCandidate(); damage(fixture);
    const callsBefore = fixture.calls.length;
    await assert.rejects(fixture.run('native-prepare-rollback'), /held|Native deployment state/u);
    assert.equal(fixture.calls.slice(callsBefore).some(value => value === 'stop' || value.startsWith('query:')), false);
  }
});

test('Native saved candidate identities reject every replacement and legacy records cannot infer live identities', async () => {
  for (const role of ['api', 'web', 'agentWorker']) {
    const fixture = nativeRecoverySequenceFixture();
    await fixture.quiesce(); await fixture.installed('2026-10-09T08:00:00.000Z'); fixture.answers.push(false);
    await assert.rejects(fixture.run('native-prepare-rollback'), /held/u);
    fixture.containers[role].Id = '9'.repeat(64);
    const callsBefore = fixture.calls.length;
    await assert.rejects(fixture.run('native-prepare-rollback'), /held/u, role);
    assert.equal(fixture.calls.slice(callsBefore).some(value => value === 'stop' || value.startsWith('query:')), false, role);
  }
  const legacy = nativeRecoverySequenceFixture();
  await legacy.quiesce(); await legacy.installed(); legacy.createCandidate();
  legacy.journal.nativeRefresh.candidateCheckpoint = '2026-10-09T08:00:00.000Z'; legacy.startCandidate();
  assert.equal(Object.hasOwn(legacy.journal.nativeRefresh, 'candidateContainers'), false);
  assert.doesNotThrow(() => deployLock.validateNativeJournalState(legacy.journal.nativeRefresh, 'b'.repeat(40)));
  const callsBefore = legacy.calls.length;
  await assert.rejects(legacy.run('native-prepare-rollback'), /held/u);
  assert.equal(legacy.calls.slice(callsBefore).some(value => value === 'stop' || value.startsWith('query:')), false);
});

test('Native recovery refuses unproven Web exits, foreign identities and interrupted resource transitions', async () => {
  const changes = [
    ['before producer false', fixture => { fixture.containers.web.State.ExitCode = 1; }, { webProducer: false }],
    ['old ID replaced', fixture => { fixture.containers.web.Id = '9'.repeat(64); }],
    ['candidate ID', fixture => { fixture.containers.web.Id = '8'.repeat(64); fixture.containers.web.Config.Labels['com.docker.compose.project.working_dir'] = `/opt/openscience-releases/${'b'.repeat(40)}`; }],
    ['API exit1', fixture => { fixture.containers.api.State.ExitCode = 1; }],
    ['Worker exit1', fixture => { fixture.containers.agentWorker.State.ExitCode = 1; }],
    ['Web exit137', fixture => { fixture.containers.web.State.ExitCode = 137; }],
    ['Web exit143', fixture => { fixture.containers.web.State.ExitCode = 143; }],
    ['Web command', fixture => { fixture.containers.web.Config.Cmd = ['npm', 'run', 'dev']; }],
    ['Web directory', fixture => { fixture.containers.web.Config.WorkingDir = '/foreign'; }],
    ['Web service', fixture => { fixture.containers.web.Config.Labels['com.docker.compose.service'] = 'api'; }],
    ['Web error', fixture => { fixture.containers.web.State.Error = 'failed'; }],
    ['Web OOM', fixture => { fixture.containers.web.State.OOMKilled = true; }],
    ['Web still running after stop', fixture => { fixture.containers.web.State.Running = true; fixture.containers.web.State.Status = 'running'; fixture.faults.keepWebRunning = true; }],
    ['install interrupted', fixture => { fixture.transition('install-start'); }],
    ['restore interrupted', async fixture => { await fixture.installed(); fixture.transition('rollback-quiesce-start'); fixture.transition('rollback-quiesce-complete'); fixture.transition('restore-start'); }],
  ];
  for (const [name, change, options] of changes) {
    const fixture = nativeRecoverySequenceFixture(options);
    await fixture.quiesce(); await fixture.failBeforeInstall(); await change(fixture);
    const queriesBefore = fixture.calls.filter(value => value.startsWith('query:')).length;
    await assert.rejects(fixture.run('native-prepare-rollback'), /held|Native deployment state/u, name);
    assert.equal(fixture.calls.filter(value => value.startsWith('query:')).length, queriesBefore, name);
    assert.equal(fixture.calls.includes('restore'), false, name);
  }
  for (const phase of ['not_started', 'quiescing']) {
    const fixture = nativeRecoverySequenceFixture();
    if (phase === 'quiescing') fixture.transition('quiesce-start');
    for (const [service, container] of Object.entries(fixture.containers)) container.State = {
      Status: 'exited', Running: false, ExitCode: service === 'web' ? 1 : 0, OOMKilled: false, Error: '',
    };
    await assert.rejects(fixture.run('native-prepare-rollback'), /held/u, phase);
    assert.equal(fixture.calls.some(value => value.startsWith('query:')), false);
    assert.equal(fixture.calls.includes('restore'), false);
  }
});

test('Native binding rejects stale source, mount, runtime and unhealthy API before producers are permitted', () => {
  const candidate = 'b'.repeat(40), runtimeId = `installed-native-continuation-${candidate}`, skillCatalogueId = `project-catalogue-${candidate}`;
  const expected = { service: 'api', releaseSha: candidate, runtimeId, skillCatalogueId, running: true };
  const container = {
    Config: { Labels: { 'com.docker.compose.service': 'api', 'com.docker.compose.project.working_dir': `/opt/openscience-releases/${candidate}` },
      Env: ['HERMES_NATIVE_AGENT_ENABLED=true', `HERMES_NATIVE_RUNTIME_ID=${runtimeId}`, `HERMES_NATIVE_SKILL_CATALOGUE_ID=${skillCatalogueId}`, 'HERMES_NATIVE_AGENT_MODEL=MiniMax-M3', 'HERMES_NATIVE_AGENT_INBOX=/native-agent/inbox'] },
    State: { Running: true, Health: { Status: 'healthy' } },
    Mounts: [{ Type: 'bind', Source: `/opt/openscience-releases/${candidate}`, Destination: '/opt/openscience', RW: false }],
  };
  deployLock.verifyNativeContainerBinding(container, expected);
  for (const change of [
    c => { c.Config.Labels['com.docker.compose.project.working_dir'] = '/opt/openscience'; },
    c => { c.Mounts[0].Source = '/opt/openscience'; },
    c => { c.State.Health.Status = 'unhealthy'; },
    c => { c.Config.Env[1] = 'HERMES_NATIVE_RUNTIME_ID=foreign'; },
    c => { c.Config.Env.push('HERMES_NATIVE_RUNTIME_ID=foreign'); },
  ]) { const changed = structuredClone(container); change(changed); assert.throws(() => deployLock.verifyNativeContainerBinding(changed, expected), /Native deployment state/u); }
});

test('Native actual old-pair capture accepts enabled video flags and rejects cached environment and mounts before journal creation or producer stop', async t => {
  const timeout = deployLockSource.match(/function nativeCommandTimeout\([^)]*\) \{[\s\S]*?\n\}/u)?.[0];
  const capture = deployLockSource.match(/async function captureNativeState\([^)]*\) \{[\s\S]*?\n\}/u)?.[0];
  const inventory = deployLockSource.match(/async function nativeContainers\([^)]*\) \{[\s\S]*?\n\}/u)?.[0];
  const operation = deployLockSource.match(/async function nativeOperation\([^)]*\) \{[\s\S]*?\n\}/u)?.[0];
  assert.ok(timeout && capture && inventory && operation);
  const root = await mkdtemp(join(tmpdir(), 'xgs-native-old-pair-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const rollback = 'a'.repeat(40), candidate = 'b'.repeat(40), nativeSha = 'c'.repeat(40);
  const binding = { runtimeId: `installed-native-continuation-${nativeSha}`, skillCatalogueId: `project-catalogue-${nativeSha}` };
  for (const mode of ['matching', 'api-runtime', 'worker-runtime', 'api-catalogue', 'web-mount', 'worker-image', 'worker-inbox', 'working-directory', 'stopped-worker-runtime', 'absent-worker', 'stopped-worker']) {
    const containers = Object.fromEntries(['api', 'web', 'agent-worker'].map((service, index) => [service, {
      Id: String(index + 1).repeat(64),
      Config: { Image: service === 'agent-worker' ? `openscience-agent-worker:${rollback}` : 'node:22', StopSignal: 'SIGTERM',
        Labels: { 'com.docker.compose.project': 'openscience-prod', 'com.docker.compose.service': service, 'com.docker.compose.project.working_dir': `/opt/openscience-releases/${rollback}` },
        Env: service === 'web' ? [] : ['HERMES_NATIVE_AGENT_ENABLED=true', `HERMES_NATIVE_RUNTIME_ID=${binding.runtimeId}`, `HERMES_NATIVE_SKILL_CATALOGUE_ID=${binding.skillCatalogueId}`, 'HERMES_NATIVE_AGENT_MODEL=MiniMax-M3', 'HERMES_NATIVE_AGENT_INBOX=/native-agent/inbox'] },
      HostConfig: { RestartPolicy: { Name: 'unless-stopped' } },
      State: { Running: true, Status: 'running', Health: { Status: 'healthy' } },
      Mounts: [{ Type: 'bind', Source: `/opt/openscience-releases/${rollback}`, Destination: '/opt/openscience', RW: false },
        ...(service === 'agent-worker' ? [{ Type: 'bind', Source: '/opt/openscience-hermes/inbox', Destination: '/native-agent/inbox', RW: true }] : [])],
    }]));
    containers['agent-worker'].Config.Env.push('HERMES_VIDEO_ENABLED=true', 'SYNCLIP_VIDEO_ENABLED=true');
    if (mode === 'api-runtime') containers.api.Config.Env[1] = 'HERMES_NATIVE_RUNTIME_ID=foreign';
    if (['worker-runtime', 'stopped-worker-runtime'].includes(mode)) containers['agent-worker'].Config.Env[1] = 'HERMES_NATIVE_RUNTIME_ID=foreign';
    if (mode === 'api-catalogue') containers.api.Config.Env[2] = 'HERMES_NATIVE_SKILL_CATALOGUE_ID=foreign';
    if (mode === 'web-mount') containers.web.Mounts[0].Source = '/foreign';
    if (mode === 'worker-image') containers['agent-worker'].Config.Image = `openscience-agent-worker:${candidate}`;
    if (mode === 'worker-inbox') containers['agent-worker'].Mounts[1].Source = '/foreign/inbox';
    if (mode === 'working-directory') containers.api.Config.Labels['com.docker.compose.project.working_dir'] = `/opt/openscience-releases/${candidate}`;
    if (['stopped-worker', 'stopped-worker-runtime'].includes(mode)) containers['agent-worker'].State = { Running: false, Status: 'exited' };
    if (mode === 'absent-worker') containers['agent-worker'] = null;
    const reads = [];
    const context = {
      NATIVE_ROOT: '/opt/openscience-hermes', NATIVE_TIMER: 'openscience-hermes-broker.timer',
      validateNativeJournalState: deployLock.validateNativeJournalState,
      verifyNativeContainerBinding: deployLock.verifyNativeContainerBinding,
      invalidNativeState() { throw new Error('Native deployment state is invalid'); },
      async verifyProductionDeployLockOnHost() {}, async nativeBinding() { return binding; }, async verifyNativeBinding(actual) { assert.equal(actual.runtimeId, binding.runtimeId); },
      async nativeCommand(command, args) {
        reads.push(`${command}:${args[0]}`);
        if (command === 'systemctl') {
          if (args[0] === 'show') return 'loaded';
          if (args[0] === 'is-active') return 'active';
          if (args[0] === 'is-enabled') return 'enabled';
        } else if (command === 'docker') {
          if (args[0] === 'ps') return containers[args.at(-1).split('=').at(-1)]?.Id ?? '';
          if (args[0] === 'inspect') return JSON.stringify(Object.values(containers).find(container => container?.Id === args.at(-1)));
        }
        throw new Error('unexpected mutation');
      },
    };
    const run = runInNewContext(`${timeout}\n${inventory}\n${capture}\n${operation}; nativeOperation`, context);
    let captured, status = 0;
    const valid = ['matching', 'absent-worker', 'stopped-worker'].includes(mode);
    if (valid) captured = await run('native-capture', { candidateSha: candidate, rollbackSha: rollback });
    else { await assert.rejects(run('native-capture', { candidateSha: candidate, rollbackSha: rollback }), /Native deployment state/u); status = 64; }
    if (valid) {
      const state = JSON.parse(captured);
      assert.deepEqual({ runtimeId: state.before.runtimeId, skillCatalogueId: state.before.skillCatalogueId }, binding);
      assert.equal(state.before.producers.agentWorker, mode === 'matching');
      assert.equal(state.before.containers.agentWorker, mode === 'absent-worker' ? null : '3'.repeat(64));
    }
    assert.equal(reads.some(read => !['docker:ps', 'docker:inspect', 'systemctl:show', 'systemctl:is-active', 'systemctl:is-enabled'].includes(read)), false);
    const trace = join(root, mode).replaceAll('\\', '/');
    const script = ['set -eEuo pipefail', `TRACE='${trace}'; REFRESH_NATIVE_RESOURCES=1; SCRIPT_DIR=/candidate/infra/scripts; DEPLOY_JOURNAL=/unused; RELEASE_SHA=${candidate}; ROLLBACK_SHA=${rollback}`,
      `transaction_native_command(){ printf '%s\\n' '${captured ?? ''}'; return ${status}; }`,
      'node(){ printf "journal\\n" >> "$TRACE"; }; transaction_pause_native_producers(){ printf "stop\\n" >> "$TRACE"; }',
      deploymentFunction('journal_start'), 'journal_start && transaction_pause_native_producers'].join('\n');
    const result = spawnSync(bash, ['-c', script], { encoding: 'utf8' });
    assert.equal(result.status, status, result.stderr);
    assert.equal(existsSync(trace), valid);
    if (valid) assert.deepEqual((await readFile(trace, 'utf8')).trim().split('\n'), ['journal', 'stop']);
  }
});

test('Native Compose 2.26 startup adapter creates without starting before the pinned startup operation', async t => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-native-start-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [target, failure] of [['candidate', ''], ['original', ''], ['candidate', 'native-verify-stopped'], ['candidate', 'native-before-start'], ['candidate', 'native-start-application']]) {
    const trace = join(root, `${target}-${failure}.log`).replaceAll('\\', '/');
    const script = [
      'set -eEuo pipefail', `TRACE='${trace}'; FAIL='${failure}'`,
      'RELEASE_ROOT=/candidate; RELEASE_SHA=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; COMPOSE_FILE=/candidate/compose; PROD_ENV=/private',
      'PREVIOUS_RELEASE_ROOT=/original; PREVIOUS_RELEASE_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; ROLLBACK_COMPOSE_FILE=/original/compose; PREVIOUS_RUNTIME_ENV=HERMES_NATIVE_AGENT_ENABLED=true',
      // Installed 2.26.1 help evidence is separate; this boundary must not accept its known-invalid flags.
      'run_remote(){ if [[ "$1" = *" create --no-deps "* || "$1" = *" start --wait "* ]]; then printf "unknown flag\\n" >&2; return 16; fi; [[ "$1" = *" up --no-start --no-deps --force-recreate --no-build --pull never api web agent-worker" ]] || return 17; printf "create-only\\n" >> "$TRACE"; }',
      'transaction_native_command(){ printf "%s\\n" "$1" >> "$TRACE"; [ "$1" != "$FAIL" ] || return 65; }',
      deploymentFunction('transaction_start_native_application'),
      `transaction_start_native_application ${target}`,
    ].join('\n');
    const result = spawnSync(bash, ['-c', script], { encoding: 'utf8' });
    assert.equal(result.status, failure ? 65 : 0, result.stderr);
    const calls = (await readFile(trace, 'utf8')).trim().split('\n');
    const expected = ['create-only', 'native-verify-stopped', ...(target === 'candidate' ? ['native-before-start'] : []), 'native-start-application'];
    assert.deepEqual(calls, failure ? expected.slice(0, expected.indexOf(failure) + 1) : expected);
  }
});

async function nativeStartupFixture({ target = 'candidate', stopped = [], notAttempted = false } = {}) {
  const f = nativeRecoverySequenceFixture();
  await f.quiesce();
  if (notAttempted) await f.failBeforeInstall();
  else { await f.installed(); f.createCandidate(); }
  if (target === 'candidate') await f.run('native-before-start');
  else {
    await f.run('native-prepare-rollback');
    for (const [index, [key, container]] of Object.entries(f.containers).entries()) {
      container.Id = String(index + 7).repeat(64);
      container.Config.Image = key === 'agentWorker' ? `openscience-agent-worker:${f.options.rollbackSha}` : 'node:22';
      container.Config.Labels['com.docker.compose.project.working_dir'] = `/opt/openscience-releases/${f.options.rollbackSha}`;
      container.Config.Env = key === 'web' ? [] : ['HERMES_NATIVE_AGENT_ENABLED=true', `HERMES_NATIVE_RUNTIME_ID=${f.journal.nativeRefresh.before.runtimeId}`,
        `HERMES_NATIVE_SKILL_CATALOGUE_ID=${f.journal.nativeRefresh.before.skillCatalogueId}`, 'HERMES_NATIVE_AGENT_MODEL=MiniMax-M3', 'HERMES_NATIVE_AGENT_INBOX=/native-agent/inbox'];
      container.Mounts[0].Source = `/opt/openscience-releases/${f.options.rollbackSha}`;
      container.State = { Running: false, Status: 'created', ExitCode: 0, OOMKilled: false, Error: '',
        StartedAt: '0001-01-01T00:00:00Z', FinishedAt: '0001-01-01T00:00:00Z' };
    }
  }
  for (const key of stopped) f.journal.nativeRefresh.before.producers[key] = false;
  f.options.target = target;
  const ctx = f.context, baseCommand = ctx.nativeCommand, extra = [], startup = [], reads = [], healthReads = {};
  let clock = 0, enabled = 'disabled', active = 'inactive';
  let host = target === 'candidate' ? f.journal.nativeRefresh.installation : f.journal.nativeRefresh.before;
  const faults = { startFail: '', startTimeout: '', unhealthy: '', neverHealthy: '', timerFail: false, pending: false, inventoryCost: 0, hook() {} };
  ctx.performance = { now: () => clock };
  ctx.NATIVE_TIMER = 'openscience-hermes-broker.timer';
  ctx.setTimeout = (callback, ms) => { clock += ms; callback(); };
  ctx.verifyNativeBinding = async expected => {
    assert.equal(expected.runtimeId, host.runtimeId); assert.equal(expected.skillCatalogueId, host.skillCatalogueId);
  };
  ctx.nativeCommand = async (command, args, options) => {
    if (command === 'docker' && args[0] === 'ps') {
      assert.ok(args.includes('label=com.docker.compose.project=openscience-prod'));
      const service = args.find(value => value.startsWith('label=com.docker.compose.service='))?.split('=').at(-1);
      assert.ok(service);
      const key = service === 'agent-worker' ? 'agentWorker' : service;
      assert.ok(options.timeout > 0 && options.timeout <= 30_000);
      reads.push({ clock, timeout: options.timeout });
      if (startup.length) clock += Math.min(faults.inventoryCost, options.timeout);
      faults.hook('inventory', key);
      const matches = [f.containers[key], ...extra.filter(value => value.Config.Labels['com.docker.compose.service'] === service)]
        .filter(value => value && (!args.includes('label=com.docker.compose.oneoff=False') || value.Config.Labels['com.docker.compose.oneoff'] === 'False'));
      return matches.map(value => value.Id).join('\n');
    }
    if (command === 'docker' && args[0] === 'inspect' && args[2] === '{{json .}}') {
      assert.ok(options.timeout > 0 && options.timeout <= 30_000);
      reads.push({ clock, timeout: options.timeout });
      if (startup.length) clock += Math.min(faults.inventoryCost, options.timeout);
      const entry = [...Object.values(f.containers), ...extra].find(value => value?.Id === args.at(-1));
      assert.ok(entry);
      const key = Object.entries(f.containers).find(([, value]) => value === entry)?.[0];
      if (entry.State.Running && entry.State.Health?.Status === 'starting' && faults.neverHealthy !== key) {
        healthReads[key] = (healthReads[key] ?? 0) + 1;
        if (faults.unhealthy === key || healthReads[key] > 1) entry.State.Health.Status = faults.unhealthy === key ? 'unhealthy' : 'healthy';
      }
      return JSON.stringify(entry);
    }
    if (command === 'docker' && args[0] === 'start') {
      assert.equal(args.length, 2);
      const key = Object.keys(f.containers).find(role => f.containers[role]?.Id === args[1]);
      assert.ok(key); assert.ok(options.timeout > 0 && options.timeout <= 30_000);
      startup.push(key); f.calls.push(`start:${key}`);
      if (faults.startFail === key) throw new Error('start failed');
      Object.assign(f.containers[key].State, { Running: true, Status: 'running', StartedAt: '2026-10-09T08:00:00.000Z', Health: { Status: 'starting' } });
      if (faults.startTimeout === key) throw new Error('start client timeout; daemon outcome unknown');
      return args[1];
    }
    if (command === 'systemctl') {
      if (args[0] === 'enable') { f.calls.push('timer-enable'); if (faults.timerFail) throw new Error('timer failed'); enabled = args.includes('--runtime') ? 'enabled-runtime' : 'enabled'; }
      else if (args[0] === 'start') { f.calls.push('timer-start'); active = 'active'; }
      else if (args[0] === 'is-enabled') return enabled;
      else if (args[0] === 'is-active') return active;
      else throw new Error(`unexpected systemctl ${args[0]}`);
      faults.hook('timer', args[0]); return '';
    }
    const output = await baseCommand(command, args, options);
    if (command === '/usr/bin/python3' && args.includes('--restore-previous')) host = f.journal.nativeRefresh.before;
    if (command === 'docker' && args[0] === 'compose' && faults.pending) return JSON.stringify({ ...JSON.parse(output), nativePending: true });
    return output;
  };
  const helpers = ['nativeCommandTimeout', 'nativeContainers', 'startNativeApplication'].map(name => {
    const body = deployLockSource.match(new RegExp(`(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`, 'u'))?.[0];
    assert.ok(body, name); return body;
  }).join('\n');
  Object.assign(ctx, runInNewContext(`${helpers}; ({nativeCommandTimeout,nativeContainers,startNativeApplication})`, ctx));
  return { ...f, extra, startup, reads, startupFaults: faults, now: () => clock,
    start: () => f.run('native-start-application') };
}

test('Native exact-ID startup preserves producer order, original identities and stopped roles', async t => {
  for (const [target, stopped] of [['candidate', []], ['original', []], ['candidate', ['api']], ['candidate', ['web']], ['candidate', ['agentWorker']]]) {
    await t.test(`${target} / stopped ${stopped.join(',') || 'none'}`, async () => {
      const f = await nativeStartupFixture({ target, stopped }), ids = Object.fromEntries(Object.entries(f.containers).map(([key, value]) => [key, value.Id]));
      const startIndex = f.calls.length;
      const unrelated = structuredClone(f.containers.api); unrelated.Id = 'f'.repeat(64);
      unrelated.Config.Labels['com.docker.compose.service'] = 'embedding-worker'; f.extra.push(unrelated);
      await f.start();
      assert.deepEqual(f.startup, ['api', 'web', 'agentWorker'].filter(key => !stopped.includes(key)));
      const calls = f.calls.slice(startIndex);
      for (const key of ['api', 'web']) if (!stopped.includes(key)) assert.ok(calls.indexOf(`start:${key}`) < calls.indexOf('timer-enable'));
      if (!stopped.includes('agentWorker')) assert.ok(calls.indexOf('timer-start') < calls.indexOf('start:agentWorker'));
      assert.deepEqual(Object.fromEntries(Object.entries(f.containers).map(([key, value]) => [key, value.Id])), ids);
      for (const key of stopped) assert.equal(f.containers[key].State.Running, false);
      await assert.rejects(f.start(), /Native deployment state|held/u, 'reentry must not replay starts');
      assert.equal(f.startup.length, 3 - stopped.length);
    });
  }
});

test('Native exact-ID startup rejects replacements, extra oneoffs, failed health and bounded timeouts', async t => {
  const scenarios = {
    'legacy missing saved IDs': f => { delete f.journal.nativeRefresh.candidateContainers; },
    'missing checkpoint': f => { f.journal.nativeRefresh.candidateCheckpoint = null; delete f.journal.nativeRefresh.candidateContainers; },
    'foreign source': f => { f.containers.api.Config.Labels['com.docker.compose.project.working_dir'] = '/foreign'; },
    'foreign worker image': f => { f.containers.agentWorker.Config.Image = 'foreign'; },
    'foreign runtime': f => { f.containers.api.Config.Env[1] = 'HERMES_NATIVE_RUNTIME_ID=foreign'; },
    'foreign mount': f => { f.containers.web.Mounts[0].RW = true; },
    'already started': f => { f.containers.api.State.Running = true; f.containers.api.State.Status = 'running'; },
    'unhealthy API': f => { f.startupFaults.unhealthy = 'api'; },
    'start failure API': f => { f.startupFaults.startFail = 'api'; },
    'start timeout API': f => { f.startupFaults.startTimeout = 'api'; },
    'health deadline API': f => { f.startupFaults.neverHealthy = 'api'; },
    'inventory consumes deadline': f => { f.startupFaults.inventoryCost = 30_000; f.startupFaults.neverHealthy = 'api'; },
    'timer failure': f => { f.startupFaults.timerFail = true; },
    'pending work holds stopped timer': f => { f.journal.nativeRefresh.before.timerWasActive = false; f.startupFaults.pending = true; },
  };
  for (const key of ['api', 'web', 'agentWorker']) {
    scenarios[`${key} replaced before start`] = f => { f.containers[key].Id = '9'.repeat(64); };
    scenarios[`${key} missing before start`] = f => { f.containers[key] = null; };
    scenarios[`${key} duplicate regular`] = f => { const entry = structuredClone(f.containers[key]); entry.Id = 'e'.repeat(64); f.extra.push(entry); };
    scenarios[`${key} extra oneoff`] = f => { const entry = structuredClone(f.containers[key]); entry.Id = 'e'.repeat(64); entry.Config.Labels['com.docker.compose.oneoff'] = 'True'; f.extra.push(entry); };
    scenarios[`${key} replaced during wait`] = f => { f.startupFaults.hook = phase => { if (phase === 'inventory' && f.startup.length) f.containers[key].Id = '9'.repeat(64); }; };
    scenarios[`${key} replaced during timer`] = f => { f.startupFaults.hook = phase => { if (phase === 'timer') f.containers[key].Id = '9'.repeat(64); }; };
  }
  for (const [label, change] of Object.entries({
    'missing health': entry => { delete entry.State.Health; },
    'exited': entry => { entry.State.Running = false; entry.State.Status = 'exited'; },
    'OOM': entry => { entry.State.OOMKilled = true; },
    'engine error': entry => { entry.State.Error = 'failed'; },
    'restart': entry => { entry.RestartCount = 1; },
  })) scenarios[label] = f => { f.startupFaults.hook = phase => { if (phase === 'inventory' && f.startup.length) change(f.containers.api); }; };
  for (const phase of ['inventory', 'timer']) scenarios[`extra oneoff during ${phase}`] = f => {
    f.startupFaults.hook = current => {
      if (current !== phase || !f.startup.length || f.extra.length) return;
      const entry = structuredClone(f.containers.web); entry.Id = 'e'.repeat(64); entry.Config.Labels['com.docker.compose.oneoff'] = 'True'; f.extra.push(entry);
    };
  };
  for (const [label, change] of Object.entries(scenarios)) await t.test(label, async () => {
    const f = await nativeStartupFixture(); change(f);
    await assert.rejects(f.start(), /held|Native deployment|start|timer/u);
    assert.equal(f.startup.includes('agentWorker'), false);
    if (!label.includes('timer')) assert.equal(f.calls.includes('timer-enable'), false);
    if (label.includes('deadline')) { assert.equal(f.now(), 300_000); assert.ok(f.reads.some(read => read.timeout < 30_000)); }
    assert.equal(f.calls.some(value => /kill|recreate/u.test(value)), false);
  });
});

test('Native before-start capture rejects extra producer inventory without persisting a checkpoint', async t => {
  for (const role of ['api', 'web', 'agentWorker']) for (const oneoff of ['False', 'True']) await t.test(`${role}/${oneoff}`, async () => {
    const f = await nativeStartupFixture();
    f.journal.nativeRefresh.candidateCheckpoint = null; delete f.journal.nativeRefresh.candidateContainers;
    const extra = structuredClone(f.containers[role]); extra.Id = 'e'.repeat(64); extra.Config.Labels['com.docker.compose.oneoff'] = oneoff; f.extra.push(extra);
    if (oneoff === 'True') assert.equal((await f.context.nativeContainers())[role].Id, f.containers[role].Id, 'default inventory behavior remains unchanged');
    await assert.rejects(f.run('native-before-start'), /held|Native deployment/u);
    assert.equal(f.journal.nativeRefresh.candidateCheckpoint, null);
    assert.equal(Object.hasOwn(f.journal.nativeRefresh, 'candidateContainers'), false);
    assert.deepEqual(f.startup, []);
  });
});

test('Native pinned startup CLI requires only exact target and existing transaction identity', () => {
  const body = deployLockSource.match(/function parseNativeCli\([^)]*\) \{[\s\S]*?\n\}/u)?.[0];
  assert.ok(body);
  const parse = runInNewContext(`${body}; parseNativeCli`, { SHA_PATTERN: /^[a-f0-9]{40}$/u,
    PRODUCTION_JOURNAL: '/journal', PRODUCTION_LOCK_DIRECTORY: '/lock', invalidNativeState() { throw Error('held'); } });
  const base = ['--candidate', 'b'.repeat(40), '--rollback', 'a'.repeat(40), '--lock-fd', '9', '--target', 'candidate'];
  assert.equal(parse(base, 'native-start-application').target, 'candidate');
  assert.equal(parse([...base.slice(0, -1), 'original'], 'native-start-application').target, 'original');
  for (const args of [base.slice(0, -2), [...base, '--service', 'api'], [...base, '--target', 'candidate'], [...base.slice(0, -1), 'foreign']])
    assert.throws(() => parse(args, 'native-start-application'), /held/u);
});

test('Native partial startup rollback retains saved identities and never starts later producers', async t => {
  for (const failure of ['startFail', 'startTimeout', 'unhealthy']) await t.test(failure, async () => {
    const f = await nativeStartupFixture(), saved = structuredClone(f.journal.nativeRefresh.candidateContainers);
    f.startupFaults[failure] = 'web';
    await assert.rejects(f.start(), /start|Native deployment|held/u);
    assert.deepEqual(f.startup, ['api', 'web']); assert.equal(f.calls.includes('timer-enable'), false);
    f.answers.push(false);
    await assert.rejects(f.run('native-prepare-rollback'), /held|Native deployment/u);
    assert.deepEqual(f.journal.nativeRefresh.candidateContainers, saved);
    assert.equal(f.journal.nativeRefresh.quiesceState, 'rollback_quiescing');
    assert.deepEqual(f.startup, ['api', 'web']);
    await f.run('native-prepare-rollback');
    assert.deepEqual(f.journal.nativeRefresh.candidateContainers, saved);
    assert.equal(f.journal.nativeRefresh.restoreState, 'restored_verified');
    assert.deepEqual(f.startup, ['api', 'web']);
  });
});

test('Native create-only failure hands full or mixed-created containers to checkpoint-null rollback without retry', async t => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-native-create-fail-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [status, services] of [[16, ['api', 'web', 'agentWorker']], [124, ['api', 'web', 'agentWorker']], [16, ['web']], [124, ['api', 'agentWorker']]]) await t.test(`${status}/${services.join(',')}`, async () => {
    const trace = join(root, `${status}-${services.join('-')}.log`).replaceAll('\\', '/');
    const script = ['set -eEuo pipefail', `TRACE='${trace}'`,
      'RELEASE_ROOT=/candidate; RELEASE_SHA=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; COMPOSE_FILE=/candidate/compose; PROD_ENV=/private',
      `run_remote(){ [[ "$1" = *" up --no-start --no-deps --force-recreate --no-build --pull never api web agent-worker" ]] || return 17; printf '%s\\n' '${services.join(',')}' >> "$TRACE"; return ${status}; }`,
      'transaction_native_command(){ printf "unexpected-native-call\\n" >> "$TRACE"; return 65; }',
      deploymentFunction('transaction_start_native_application'), 'transaction_start_native_application candidate'].join('\n');
    const result = spawnSync(bash, ['-c', script], { encoding: 'utf8' });
    assert.equal(result.status, status, result.stderr);
    const recorded = (await readFile(trace, 'utf8')).trim().split('\n');
    assert.deepEqual(recorded, [services.join(',')], 'failed create is issued once and permits no startup/checkpoint operation');
    const f = nativeRecoverySequenceFixture(); await f.quiesce(); await f.installed(); f.createCandidate(recorded[0].split(','));
    await f.run('native-prepare-rollback');
    assert.equal(f.journal.nativeRefresh.candidateCheckpoint, null);
    assert.equal(Object.hasOwn(f.journal.nativeRefresh, 'candidateContainers'), false);
    assert.equal(f.journal.nativeRefresh.restoreState, 'restored_verified');
    assert.equal(f.calls.filter(value => value === 'stop').length, 1, 'never-started new containers are not running producers');
  });
});

test('Native startup oneoff rejection remains held through candidate rollback before stop or restore', async () => {
  const f = await nativeStartupFixture(), saved = structuredClone(f.journal.nativeRefresh.candidateContainers);
  f.startupFaults.hook = phase => {
    if (phase !== 'inventory' || !f.startup.length || f.extra.length) return;
    const entry = structuredClone(f.containers.web); entry.Id = 'e'.repeat(64); entry.Config.Labels['com.docker.compose.oneoff'] = 'True'; f.extra.push(entry);
  };
  await assert.rejects(f.start(), /Native deployment|held/u);
  const before = f.calls.length;
  await assert.rejects(f.run('native-prepare-rollback'), /Native deployment|held/u);
  assert.deepEqual(f.journal.nativeRefresh.candidateContainers, saved);
  assert.equal(f.calls.slice(before).some(call => call === 'stop' || call === 'restore' || call.startsWith('query:')), false);
});

test('Native original startup holds wrong recovery stages before any producer or timer write', async t => {
  const stages = [
    ['not_started', 'not_attempted', 'not_started'], ['quiescing', 'not_attempted', 'not_started'],
    ['quiesced', 'not_attempted', 'not_started'], ['rollback_quiescing', 'not_attempted', 'not_started'],
    ['rollback_quiesced', 'install_attempting', 'not_started'], ['quiesced', 'install_attempting', 'not_started'],
    ['quiesced', 'installed', 'restored_verified'], ['rollback_quiescing', 'installed', 'restored_verified'],
    ['rollback_quiesced', 'installed', 'restore_attempting'], ['rollback_quiesced', 'installed', 'not_started'],
  ];
  for (const [quiesceState, installState, restoreState] of stages) await t.test(`${quiesceState}/${installState}/${restoreState}`, async () => {
    const f = await nativeStartupFixture({ target: 'original' }), state = f.journal.nativeRefresh;
    Object.assign(state, { quiesceState, installState, restoreState });
    if (installState !== 'installed') delete state.installation;
    const before = f.calls.length;
    await assert.rejects(f.start(), /Native deployment|held/u);
    assert.deepEqual(f.startup, []);
    assert.equal(f.calls.slice(before).some(call => call.startsWith('start:') || call.startsWith('timer-') || call.startsWith('query:')), false);
  });
});

test('Native original startup accepts rollback-quiesced after a held work gate with no install attempt', async () => {
  const f = await nativeStartupFixture({ target: 'original', notAttempted: true });
  assert.equal(f.journal.nativeRefresh.quiesceState, 'rollback_quiesced');
  assert.equal(f.journal.nativeRefresh.installState, 'not_attempted');
  assert.equal(f.journal.nativeRefresh.restoreState, 'not_started');
  await f.start();
  assert.deepEqual(f.startup, ['api', 'web', 'agentWorker']);
  assert.equal(f.calls.includes('resource-write'), false);
});

test('Native checkpoint-null candidate rollback rejects running oneoffs before stop, query or restore', async t => {
  for (const role of ['api', 'web', 'agentWorker']) await t.test(role, async () => {
    const f = await nativeStartupFixture();
    f.journal.nativeRefresh.candidateCheckpoint = null; delete f.journal.nativeRefresh.candidateContainers;
    const extra = structuredClone(f.containers[role]); extra.Id = 'e'.repeat(64);
    extra.Config.Labels['com.docker.compose.oneoff'] = 'True';
    Object.assign(extra.State, { Running: true, Status: 'running', StartedAt: '2026-10-09T08:00:00.000Z', Health: { Status: 'healthy' } });
    f.extra.push(extra);
    const before = f.calls.length;
    await assert.rejects(f.run('native-prepare-rollback'), /Native deployment|held/u);
    assert.equal(f.calls.slice(before).some(call => call === 'stop' || call === 'restore' || call.startsWith('query:')), false);
    assert.equal(f.journal.nativeRefresh.candidateCheckpoint, null);
    assert.equal(Object.hasOwn(f.journal.nativeRefresh, 'candidateContainers'), false);
    assert.deepEqual(f.startup, []);
  });
});

test('Native real rollback adapter checks feasibility before restore and never starts old pair on held recovery', async t => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-native-rollback-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const failure of ['', 'preflight', 'restore']) {
    const trace = join(root, `${failure || 'success'}.log`).replaceAll('\\', '/');
    const script = [
      'set -eEuo pipefail', `TRACE='${trace}'; FAIL='${failure}'`,
      'REFRESH_NATIVE_RESOURCES=1; EMBEDDING_DEPLOY=0; PREVIOUS_HAS_EMBEDDING=0; PREVIOUS_HAS_SCANSCI=1; NO_TESTS=1',
      'PREVIOUS_RELEASE_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; RELEASE_SHA=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      'PREVIOUS_RELEASE_ROOT=/previous; PREVIOUS_RUNTIME_ENV=; ROLLBACK_COMPOSE_FILE=/previous/compose; PROD_ENV=/private; NGINX_CONF=/nginx; REMOTE_ROOT=/production; RELEASE_ROOT=/candidate',
      'log(){ :; }; run_remote(){ printf "application-command\\n" >> "$TRACE"; }',
      'transaction_preflight_application_rollback(){ printf "preflight\\n" >> "$TRACE"; ROLLBACK_ACTIVE_SHA="$RELEASE_SHA"; [ "$FAIL" != preflight ] || return 70; }',
      'transaction_native_command(){ printf "%s\\n" "$1" >> "$TRACE"; [ "$FAIL" != restore ] || [ "$1" != native-prepare-rollback ] || return 70; }',
      'transaction_restore_scansci_rollback(){ printf "scansci\\n" >> "$TRACE"; }',
      'transaction_start_native_application(){ printf "old-pair-start\\n" >> "$TRACE"; }',
      deploymentFunction('transaction_perform_application_rollback'),
      'transaction_perform_application_rollback',
    ].join('\n');
    const result = spawnSync(bash, ['-c', script], { encoding: 'utf8' });
    const calls = (await readFile(trace, 'utf8')).trim().split('\n');
    assert.equal(result.status, failure ? 70 : 0, result.stderr);
    assert.equal(calls[0], 'preflight');
    if (failure === 'preflight') assert.deepEqual(calls, ['preflight', 'native-hold-producers']);
    else if (failure === 'restore') assert.deepEqual(calls, ['preflight', 'native-prepare-rollback']);
    else assert.ok(calls.indexOf('native-prepare-rollback') < calls.indexOf('old-pair-start'));
  }
});

test('Native actual rollback feasibility preflight is read-only and refuses reader, stale source and image incompatibility', async t => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-native-preflight-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const mode of ['healthy', 'reader', 'active', 'source', 'image', 'persisted-first-image', 'terminal-native', 'paid-unknown', 'unknown-empty']) {
    const candidate = join(root, mode, 'candidate'), previous = join(root, mode, 'previous'), trace = join(root, `${mode}.log`).replaceAll('\\', '/');
    await mkdir(candidate, { recursive: true }); await mkdir(previous, { recursive: true });
    if (mode === 'reader') await mkdir(join(candidate, 'infra/migrations/20260913010000_publication_identity'), { recursive: true });
    const script = [
      'set -eEuo pipefail', `TRACE='${trace}'; MODE='${mode}'; RELEASE_ROOT='${candidate.replaceAll('\\', '/')}'; PREVIOUS_RELEASE_ROOT='${previous.replaceAll('\\', '/')}'`,
      'PREVIOUS_RELEASE_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; RELEASE_SHA=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; REMOTE_ROOT=/production',
      'run_remote(){ case "$1" in "cat "*) printf "active\\n" >> "$TRACE"; if [ "$MODE" = active ]; then printf "cccccccccccccccccccccccccccccccccccccccc\\n"; else printf "%s\\n" "$RELEASE_SHA"; fi ;; "test "*) printf "source\\n" >> "$TRACE"; [ "$MODE" != source ] ;; "docker image inspect "*) printf "image\\n" >> "$TRACE"; [ "$MODE" != image ] ;; *" application-rollback-preflight "*) printf "readers\\n" >> "$TRACE"; [ "$MODE" = healthy ] ;; *) printf "unexpected-mutation\\n" >> "$TRACE"; return 90 ;; esac; }',
      deploymentFunction('transaction_preflight_application_rollback'),
      'transaction_preflight_application_rollback',
    ].join('\n');
    const result = spawnSync(bash, ['-c', script], { encoding: 'utf8' });
    const calls = existsSync(trace) ? (await readFile(trace, 'utf8')).trim().split('\n') : [];
    assert.equal(result.status, mode === 'healthy' ? 0 : ['source', 'image'].includes(mode) ? 71 : 70, result.stderr);
    assert.equal(calls.includes('unexpected-mutation'), false);
    if (mode === 'reader') assert.deepEqual(calls, []);
    if (mode === 'active') assert.deepEqual(calls, ['active']);
    if (mode === 'source') assert.deepEqual(calls, ['active', 'source']);
    if (mode === 'healthy' || ['persisted-first-image', 'terminal-native', 'paid-unknown', 'unknown-empty'].includes(mode)) assert.deepEqual(calls, ['active', 'source', 'image', 'readers']);
  }
});

test('Native journal CLI rejects unknown fields and malformed JSON without echoing their contents', () => {
  const utility = fileURLToPath(new URL('./production-deploy-lock.mjs', import.meta.url));
  const common = ['journal-start', '--journal', '/opt/openscience/.deploy-transaction.json', '--candidate', 'b'.repeat(40), '--rollback', 'a'.repeat(40), '--phase', 'prepared', '--lock-fd', '9'];
  const sentinel = 'private-content-must-not-appear';
  for (const value of [`{"secret":"${sentinel}"}`, `{"secret":"${sentinel}`, 'x'.repeat(4097)]) {
    const result = spawnSync(process.execPath, [utility, ...common, '--native-state', value], { encoding: 'utf8' });
    assert.equal(result.status, 64);
    assert.match(result.stderr, /Native deployment state/u);
    assert.equal(`${result.stdout}${result.stderr}`.includes(sentinel), false);
  }
  const result = spawnSync(process.execPath, [utility, 'native-restore-timer', '--candidate', 'b'.repeat(40), '--rollback', 'a'.repeat(40), '--lock-fd', '9', '--target', '/arbitrary'], { encoding: 'utf8' });
  assert.equal(result.status, 64);
  assert.match(result.stderr, /Native deployment operation failed/u);
});

test('Native work-query loader executes complete imports from Worker without root dependency links', async t => {
  const tempBase = await realpath(tmpdir()), root = await mkdtemp(join(tempBase, 'xgs-native-query-loader-'));
  t.after(async () => {
    const target = await realpath(root);
    assert.equal(dirname(target), tempBase);
    assert.ok(target.startsWith(join(tempBase, 'xgs-native-query-loader-')));
    await rm(target, { recursive: true, force: true });
  });
  const worker = join(root, 'apps/agent-worker'), trace = join(root, 'readonly-calls.log');
  await mkdir(join(root, 'infra/scripts'), { recursive: true });
  await mkdir(worker, { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  await writeFile(join(worker, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies: { '@openscience/database': 'workspace:*', '@openscience/domain': 'workspace:*' } }));
  await writeFile(join(root, 'infra/scripts/production-deploy-lock.mjs'), deployLockSource);
  const modules = {
    database: `
import assert from 'node:assert/strict';
import {appendFileSync} from 'node:fs';
const record=value=>appendFileSync(process.env.XGS_NATIVE_QUERY_TEST_TRACE,value+'\\n');
record('load.database');
export function createPrismaClient(){
 record('db.open');
 return {
  async $queryRawUnsafe(sql){
   assert.match(sql,/^SELECT /);
   if(sql==='SELECT clock_timestamp() AS now'){record('db.clock');return [{now:new Date('2026-10-09T08:00:00.000Z')}];}
   assert.match(sql,/FROM agent_tasks/);record('db.tasks');return [];
  },
  journalJob:{async findMany(options){
   assert.deepEqual(options,{select:{state:true,kind:true,leaseToken:true,leaseExpiresAt:true,updatedAt:true}});
   record('db.journals');return [];
  }},
  async $disconnect(){record('db.close');}
 };
}
export function createRedisClient(){
 record('redis.open');
 return {
  async lrange(key,start,end){
   assert.ok(['fixture:queue','fixture:queue:processing'].includes(key));assert.equal(start,0);assert.equal(end,-1);
   record('redis.lrange:'+key);return [];
  },
  async quit(){record('redis.close');}
 };
}
`,
    domain: `
import {appendFileSync} from 'node:fs';
appendFileSync(process.env.XGS_NATIVE_QUERY_TEST_TRACE,'load.domain\\n');
export const AGENT_TASK_QUEUE='fixture:queue';
export function readNativeAgentExecution(){throw Error('unexpected task in empty readonly fixture');}
`,
  };
  for (const [name, body] of Object.entries(modules)) {
    const directory = join(worker, 'node_modules/@openscience', name);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name: `@openscience/${name}`, type: 'module', exports: './index.js' }));
    await writeFile(join(directory, 'index.js'), body);
  }
  assert.equal(existsSync(join(root, 'node_modules')), false);
  const env = { ...process.env, NODE_OPTIONS: '', NODE_PATH: '', DATABASE_URL: 'fixture-only', REDIS_URL: 'fixture-only', XGS_NATIVE_QUERY_TEST_TRACE: trace };
  const oldEntry = spawnSync(process.execPath, ['--input-type=module', '-e', "import '@openscience/database'; import '@openscience/domain';"], { cwd: root, env, encoding: 'utf8', timeout: 10_000 });
  assert.equal(oldEntry.status, 1);
  assert.match(oldEntry.stderr, /ERR_MODULE_NOT_FOUND/u);
  assert.equal(existsSync(trace), false, 'failed root imports must invoke no mock clients');
  const declaration = deployLockSource.match(/const NATIVE_WORK_QUERY = `[\s\S]*?`;/u)?.[0];
  assert.ok(declaration);
  const completeQuery = runInNewContext(`${declaration}; NATIVE_WORK_QUERY`, {});
  const loaded = spawnSync(process.execPath, ['--input-type=module', '-e', completeQuery, 'none'], { cwd: worker, env, encoding: 'utf8', timeout: 10_000 });
  assert.equal(loaded.status, 0, loaded.stderr);
  assert.deepEqual(JSON.parse(loaded.stdout), { safe: true, nativePending: false, nativeBoundPending: false, dbTime: '2026-10-09T08:00:00.000Z' });
  assert.deepEqual((await readFile(trace, 'utf8')).trim().split('\n').sort(), [
    'load.database', 'load.domain', 'db.open', 'redis.open', 'db.tasks', 'db.journals',
    'redis.lrange:fixture:queue', 'redis.lrange:fixture:queue:processing', 'db.clock', 'db.close', 'redis.close',
  ].sort());
});

test('Native query command selects Worker import origin and its real classifier path', async () => {
  const extract = name => {
    const body = deployLockSource.match(new RegExp(`(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`, 'u'))?.[0];
    assert.ok(body); return body;
  };
  const declaration = deployLockSource.match(/const NATIVE_WORK_QUERY = `[\s\S]*?`;/u)?.[0];
  assert.ok(declaration);
  const candidate = 'b'.repeat(40), checkpoint = '2026-10-09T07:00:00.000Z';
  const result = { safe: true, nativePending: false, nativeBoundPending: false, dbTime: '2026-10-09T08:00:00.000Z' };
  let calls = 0;
  const query = runInNewContext(`${extract('exactObjectKeys')}\n${declaration}\n${extract('queryNativeWork')}; queryNativeWork`, {
    process: { env: {} }, invalidNativeState() { throw new Error('held'); },
    async nativeCommand(command, args, options) {
      calls += 1;
      assert.equal(command, 'docker');
      assert.equal(args[args.indexOf('-w') + 1], '/opt/openscience/apps/agent-worker');
      assert.equal(args[args.indexOf('--entrypoint') + 1], 'node');
      assert.equal(args[args.indexOf('--entrypoint') + 2], 'agent-worker');
      assert.match(args.at(-2), /import \{classifyNativeWorkSnapshot\} from '\.\.\/\.\.\/infra\/scripts\/production-deploy-lock\.mjs'/u);
      assert.equal(args.at(-1), checkpoint);
      assert.equal(options.env.XGS_RELEASE_ROOT, `/opt/openscience-releases/${candidate}`);
      assert.equal(options.env.XGS_RELEASE_IMAGE_TAG, candidate);
      assert.equal(options.timeout, 120_000);
      return JSON.stringify(result);
    },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(await query(candidate, checkpoint))), result);
  assert.equal(calls, 1);
});

test('Native actual work-query code only reads queues and task markers and returns bounded nonsecret status', async () => {
  const declaration = deployLockSource.match(/const NATIVE_WORK_QUERY = `[\s\S]*?`;/u)?.[0];
  assert.ok(declaration);
  const code = runInNewContext(`${declaration}; NATIVE_WORK_QUERY`, {});
  const syntax = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: code, encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);
  for (const [kind, queued, bound] of [['sdf.extract', true, false], ['sdf.extract', true, true], ['sdf.extract', false, true], ['presentation.generate', true, true], ['presentation.generate', false, true]]) {
  const calls = []; let output = '';
  const oldMarker = { kind: 'hermes-agent', profile: 'paper-understanding', runtimeId: `installed-native-continuation-${'c'.repeat(40)}`, skillCatalogueId: `project-catalogue-${'c'.repeat(40)}`, model: 'MiniMax-M3' };
  const context = {
    process: { env: { DATABASE_URL: 'fixture', REDIS_URL: 'fixture' }, argv: ['node', 'none'], stdout: { write(value) { output += value; } } },
    AGENT_TASK_QUEUE: 'agent:queue', classifyNativeWorkSnapshot: deployLock.classifyNativeWorkSnapshot,
    readNativeAgentExecution(result) { return result?.nativeAgentExecution; },
    createPrismaClient() { return {
      async $queryRawUnsafe(sql) {
        calls.push(sql); assert.match(sql, /^SELECT /u);
        if (sql.includes('clock_timestamp')) return [{ now: new Date('2026-10-09T08:00:00.000Z') }];
        assert.ok(sql.includes("jsonb_build_object('nativeAgentExecution',result->'nativeAgentExecution','nativeImageReview',result->'nativeImageReview')"));
        return [{ id: 't1', status: 'pending', kind, deleted_at: null, updated_at: new Date('2026-10-09T07:00:00.000Z'), error: null, result: bound ? { nativeAgentExecution: oldMarker } : null }];
      },
      journalJob: { async findMany() { calls.push('journal-read'); return []; } },
      async $disconnect() { calls.push('db-close'); },
    }; },
    createRedisClient() { return { async lrange(key) { calls.push(key); return key.endsWith(':processing') || !queued ? [] : ['t1']; }, async quit() { calls.push('redis-close'); } }; },
  };
  await runInNewContext(`(async()=>{${code.replace(/^import[^\n]+\n/gmu, '')}})()`, context);
  assert.deepEqual(JSON.parse(output), { safe: true, nativePending: true, nativeBoundPending: bound, dbTime: '2026-10-09T08:00:00.000Z' });
  assert.equal(calls.at(-2), 'db-close'); assert.equal(calls.at(-1), 'redis-close');
  assert.equal(output.includes('t1'), false);
  assert.equal(output.includes(oldMarker.runtimeId), false);
  }
});

test('Native SQL work projection uses actual image readers and keeps malformed bindings closed', async t => {
  const require = createRequire(import.meta.url), ts = require('typescript');
  const load = (file, dependencies = {}, names) => {
    let body = readFileSync(new URL(`../../packages/domain/src/${file}`, import.meta.url), 'utf8');
    if (names) {
      const parsed = ts.createSourceFile(file, body, ts.ScriptTarget.Latest, true);
      const declared = node => ts.isFunctionDeclaration(node) ? [node.name?.text]
        : ts.isVariableStatement(node) ? node.declarationList.declarations.map(item => item.name.getText(parsed)) : [];
      const selected = parsed.statements.filter(node => declared(node).some(name => names.includes(name)));
      assert.deepEqual(selected.flatMap(declared).sort(), [...names].sort());
      body = `import {AgentError} from './errors';\nimport {readNativeImageAgentExecution} from '../assets/native-image-review';\n${selected.map(node => node.getText(parsed)).join('\n')}`;
    }
    const compiled = ts.transpileModule(body, { fileName: file, reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
    assert.deepEqual(compiled.diagnostics.filter(item => item.category === ts.DiagnosticCategory.Error), []);
    const module = { exports: {} };
    runInNewContext(compiled.outputText, { module, exports: module.exports, structuredClone,
      require(name) { assert.ok(Object.hasOwn(dependencies, name), `Unexpected reader dependency ${name}`); return dependencies[name]; },
    }, { filename: file, timeout: 1_000 });
    return module.exports;
  };
  const imageReader = load('assets/native-image-review.ts', {
    'node:util': require('node:util'), './errors': load('assets/errors.ts'),
  });
  const { readNativeAgentExecution } = load('agent/native-agent-execution.ts', {
    './errors': load('agent/errors.ts'), '../assets/native-image-review': imageReader,
  }, ['record', 'hash', 'text', 'exact', 'blocked', 'nativeAgentMaxTurns', 'readNativeAgentExecution']);
  const declaration = deployLockSource.match(/const NATIVE_WORK_QUERY = `[\s\S]*?`;/u)?.[0];
  assert.ok(declaration);
  const code = runInNewContext(`${declaration}; NATIVE_WORK_QUERY`, {});
  const id = 'image-query-task', dbTime = '2026-10-09T08:00:00.000Z';
  const marker = { kind: 'hermes-agent', profile: 'image-review', runtimeId: 'installed-native-query-fixture',
    skillCatalogueId: 'query-catalogue-fixture', model: 'MiniMax-M3' };
  const fresh = () => ({ nativeAgentExecution: structuredClone(marker), nativeImageReview: { mode: 'model-native', state: 'not_started' },
    privateUnrelatedResult: 'must-not-enter-projection-or-stdout' });
  const prepared = (checkpoint = false) => {
    const identity = { requestId: id, contentHash: 'a'.repeat(64), sourceEvidenceIdentity: 'b'.repeat(64), parentIdentity: 'storyboard-fixture-scene0' };
    const envelope = { ...identity, mode: 'agent-native', state: 'prepared', preparedAt: 1_000, deadlineAt: 301_000,
      executionAttempt: 2, runtimeId: marker.runtimeId, skillCatalogueId: marker.skillCatalogueId, provider: 'minimax-key-1-model-1',
      model: marker.model, reservationLedgerId: 'image-query-original-ledger', maxTurns: 4, maxOutputTokens: 32768,
      maxTotalOutputTokens: 32768, maxInputBytes: 8_000_000 };
    const result = { ...fresh(), nativeImageReview: envelope };
    if (checkpoint) result.nativeAgentExecution.checkpoint = {
      taskId: id, sourceKind: 'illustration-image', imageIdentity: identity, serializedSha256: 'c'.repeat(64),
      objectKey: `derived/native-agent/${'c'.repeat(64)}.json`, size: 500, executionAttempt: 2, turnCount: 2,
      state: 'completed', target: { provider: envelope.provider, model: envelope.model, promptHash: 'd'.repeat(64) },
      responseHash: 'e'.repeat(64), finishReason: 'stop', hasToolCalls: false,
    };
    return result;
  };
  const run = async (storedResult, kind = 'presentation.generate', error = null) => {
    const before = structuredClone(storedResult), calls = [];
    let output = '', projected, failure;
    const context = {
      process: { env: { DATABASE_URL: 'fixture-only', REDIS_URL: 'fixture-only' }, argv: ['node', 'none'],
        stdout: { write(value) { output += value; } } },
      AGENT_TASK_QUEUE: 'agent:queue', readNativeAgentExecution, classifyNativeWorkSnapshot: deployLock.classifyNativeWorkSnapshot,
      createPrismaClient() { return {
        async $queryRawUnsafe(sql) {
          assert.match(sql, /^SELECT /u);
          if (sql === 'SELECT clock_timestamp() AS now') { calls.push('clock'); return [{ now: new Date(dbTime) }]; }
          calls.push('tasks');
          const args = sql.match(/CASE WHEN result \? 'nativeAgentExecution' THEN jsonb_build_object\(([^)]*)\) ELSE NULL END AS result FROM agent_tasks/u)?.[1];
          assert.ok(args, 'fixture executes the received bounded SQL projection, not a pre-projected result');
          const pairs = [...args.matchAll(/'([a-zA-Z]+)',result->'([a-zA-Z]+)'/gu)];
          assert.equal(pairs.map(pair => pair[0]).join(','), args.replace(/\s/gu, ''));
          projected = storedResult && Object.hasOwn(storedResult, 'nativeAgentExecution')
            ? Object.fromEntries(pairs.map(([, key, source]) => [key, structuredClone(storedResult[source] ?? null)])) : null;
          return [{ id, status: 'pending', kind, deleted_at: null, updated_at: new Date('2026-10-09T07:00:00.000Z'), error, result: projected }];
        },
        journalJob: { async findMany() { calls.push('journals'); return []; } },
        async $disconnect() { calls.push('db-close'); },
      }; },
      createRedisClient() { return {
        async lrange(key) { calls.push(key); return key.endsWith(':processing') ? [] : [id]; },
        async quit() { calls.push('redis-close'); },
      }; },
    };
    try { await runInNewContext(`(async()=>{${code.replace(/^import[^\n]+\n/gmu, '')}})()`, context); }
    catch (caught) { failure = caught; }
    assert.deepEqual(storedResult, before, 'read-only query must leave stored evidence untouched');
    assert.deepEqual(calls.slice(-2), ['db-close', 'redis-close']);
    return { output, projected, failure, calls };
  };
  const accepted = (observed, expected = { safe: true, nativePending: true, nativeBoundPending: true }) => {
    assert.ifError(observed.failure);
    assert.deepEqual(JSON.parse(observed.output), { ...expected, dbTime });
    for (const privateValue of ['nativeImageReview', 'nativeAgentExecution', id, marker.runtimeId, 'must-not-enter-projection-or-stdout'])
      assert.equal(observed.output.includes(privateValue), false);
  };
  for (const [label, result] of [['fresh', fresh()], ['prepared', prepared()], ['completed checkpoint', prepared(true)]]) {
    await t.test(`recognizes legitimate ${label} image pending while retaining the Native replacement hold`, async () => {
      const observed = await run(result);
      accepted(observed);
      assert.deepEqual(Object.keys(observed.projected).sort(), ['nativeAgentExecution', 'nativeImageReview']);
      assert.deepEqual(observed.projected.nativeImageReview, result.nativeImageReview);
    });
  }
  const invalid = {
    'missing envelope': result => { delete result.nativeImageReview; },
    'null envelope': result => { result.nativeImageReview = null; },
    'malformed envelope budget': result => { result.nativeImageReview.maxTurns = 5; },
    'runtime binding': result => { result.nativeImageReview.runtimeId = 'foreign-native'; },
    'catalogue binding': result => { result.nativeImageReview.skillCatalogueId = 'foreign-catalogue'; },
    'executionAttempt binding': result => { result.nativeImageReview.executionAttempt += 1; },
    'provider binding': result => { result.nativeImageReview.provider = 'minimax-key-2-model-1'; },
    'model binding': result => { result.nativeImageReview.model = 'MiniMax-M3.1-Flash-Preview'; },
    'target provider binding': result => { result.nativeAgentExecution.checkpoint.target.provider = 'minimax-key-2-model-1'; },
    'target model binding': result => { result.nativeAgentExecution.checkpoint.target.model = 'MiniMax-M3.1-Flash-Preview'; },
    'malformed target': result => { result.nativeAgentExecution.checkpoint.target.promptHash = 'invalid'; },
    'requestId binding': result => { result.nativeImageReview.requestId = 'foreign-image-request'; },
    'contentHash binding': result => { result.nativeImageReview.contentHash = 'f'.repeat(64); },
    'sourceEvidenceIdentity binding': result => { result.nativeImageReview.sourceEvidenceIdentity = 'f'.repeat(64); },
    'parentIdentity binding': result => { result.nativeImageReview.parentIdentity = 'foreign-parent'; },
  };
  for (const [label, change] of Object.entries(invalid)) {
    await t.test(`rejects ${label} without downgrading to unbound`, async () => {
      const result = prepared(true); change(result);
      const observed = await run(result);
      assert.equal(observed.failure?.name, 'PresentationAssetError');
      assert.equal(observed.failure?.code, 'VALIDATION_ERROR');
      assert.equal(observed.output, '');
      assert.equal(observed.calls.includes('clock'), false);
    });
  }
  await t.test('retains the original paper pending classification without an image envelope', async () => {
    const observed = await run({ nativeAgentExecution: { ...marker, profile: 'paper-understanding' } }, 'sdf.extract');
    accepted(observed);
  });
  await t.test('retains unbound presentation pending without a Native Agent marker', async () => {
    const observed = await run({ nativeImageReview: { mode: 'model-native', state: 'not_started' } });
    accepted(observed, { safe: true, nativePending: true, nativeBoundPending: false });
    assert.equal(observed.projected, null);
  });
  await t.test('keeps queued started or unknown provider work unsafe', async () => {
    const result = prepared(true), cp = result.nativeAgentExecution.checkpoint;
    cp.state = 'started'; delete cp.responseHash; delete cp.finishReason; delete cp.hasToolCalls;
    accepted(await run(result), { safe: false, nativePending: true, nativeBoundPending: true });
    accepted(await run(fresh(), 'presentation.generate', 'provider outcome unknown'), { safe: false, nativePending: true, nativeBoundPending: true });
  });
});

test('Native actual pause defers candidate-schema reads until migration and install rejects old-bound pending before resource writes', async () => {
  const body = deployLockSource.match(/async function nativeOperation\([^)]*\) \{[\s\S]*?\n\}/u)?.[0];
  assert.ok(body);
  const candidate = 'b'.repeat(40), installation = { releaseSha: candidate, runtimeId: `installed-native-continuation-${candidate}`, skillCatalogueId: `project-catalogue-${candidate}`, timerDeferred: true };
  for (const [kind, location, bound] of [['sdf.extract', 'queue', true], ['sdf.extract', 'outbox', true], ['presentation.generate', 'queue', true], ['presentation.generate', 'outbox', true], ['search.index', 'queue', false], ['journal.generate', 'outbox', false]]) {
    let journal = { phase: 'migrating', candidateSha: candidate, rollbackSha: 'a'.repeat(40), nativeRefresh: nativeJournalFixture() }, migrated = false;
    const calls = [], task = { id: 't1', kind, status: 'pending', deletedAt: null, nativeBound: bound, nativePending: bound, providerUncertain: false, updatedAt: '2026-10-09T07:00:00.000Z' };
    const snapshot = { tasks: kind === 'journal.generate' ? [] : [task], queue: kind !== 'journal.generate' && location === 'queue' ? ['t1'] : [], processing: [], journals: kind === 'journal.generate' ? [{ state: 'pending', kind: 'generate', leaseToken: null, leaseExpiresAt: null, updatedAt: task.updatedAt }] : [] };
    const preserved = JSON.stringify(snapshot);
    const context = {
      validateNativeJournalState: deployLock.validateNativeJournalState, transitionNativeJournalState: deployLock.transitionNativeJournalState,
      invalidNativeState() { throw new Error('Native deployment state held'); },
      async verifyProductionDeployLockOnHost() {}, async readTrustedJournal() { return structuredClone(journal); },
      async writeProductionDeployJournal(options) { calls.push(`journal:${options.native.installState}:${options.native.quiesceState}`); journal.nativeRefresh = deployLock.preserveNativeJournalState(journal, options.native, candidate, false); },
      async pauseNativeProducers() { calls.push('pause'); }, async holdNativeTimer() { calls.push('timer-hold'); }, async verifyNativeIdle() { calls.push('idle'); },
      async nativeContainers() { return {}; }, async verifyNativeBinding() {},
      async queryNativeWork() {
        calls.push('candidate-db-read'); assert.equal(migrated, true, 'new Prisma must not query the pre-migration database');
        return { ...deployLock.classifyNativeWorkSnapshot(snapshot, null), dbTime: '2026-10-09T08:00:00.000Z' };
      },
      async open() { calls.push('resource-write'); return { async writeFile() {}, async sync() {}, async close() {} }; },
      async rm() {}, randomUUID() { return 'fixture'; },
      async nativeCommand(command) { if (command === '/usr/bin/node') return '{}'; calls.push('installer'); return JSON.stringify(installation); },
    };
    const operation = runInNewContext(`${body}; nativeOperation`, context), options = { candidateSha: candidate, rollbackSha: 'a'.repeat(40) };
    assert.equal(await operation('native-pause-original', options), 'NATIVE_OPERATION_OK');
    assert.equal(calls.includes('candidate-db-read'), false);
    await assert.rejects(operation('native-install', options), /Native deployment state/u);
    assert.equal(calls.includes('candidate-db-read'), false);
    migrated = true; journal.phase = 'switching'; calls.push('migration-complete');
    if (bound) {
      await assert.rejects(operation('native-install', options), /Native deployment state/u);
      assert.equal(journal.nativeRefresh.installState, 'not_attempted');
      assert.equal(calls.includes('resource-write'), false); assert.equal(calls.includes('installer'), false);
      assert.equal(calls.some(call => call.startsWith('journal:install_attempting')), false);
    } else {
      assert.equal(await operation('native-install', options), 'NATIVE_OPERATION_OK');
      assert.ok(calls.indexOf('candidate-db-read') < calls.indexOf('resource-write'));
      assert.ok(calls.indexOf('candidate-db-read') < calls.findIndex(call => call.startsWith('journal:install_attempting')));
    }
    assert.ok(calls.indexOf('migration-complete') < calls.indexOf('candidate-db-read'));
    assert.equal(JSON.stringify(snapshot), preserved, 'pending rows/outbox and queues remain unchanged');
  }
});

test('Native actual installer operation holds interrupted and unpersisted success instead of invoking restore', async () => {
  const body = deployLockSource.match(/async function nativeOperation\([^)]*\) \{[\s\S]*?\n\}/u)?.[0];
  assert.ok(body);
  const candidate = 'b'.repeat(40), installation = { releaseSha: candidate, runtimeId: `installed-native-continuation-${candidate}`, skillCatalogueId: `project-catalogue-${candidate}`, timerDeferred: true };
  for (const mode of ['success', 'installer-interrupted', 'receipt-persistence-failed', 'foreign-receipt']) {
    const initial = { ...nativeJournalFixture(), quiesceState: 'quiesced' };
    let journal = { phase: 'switching', candidateSha: candidate, rollbackSha: 'a'.repeat(40), nativeRefresh: initial };
    const calls = [];
    const context = {
      validateNativeJournalState: deployLock.validateNativeJournalState,
      transitionNativeJournalState: deployLock.transitionNativeJournalState,
      invalidNativeState() { throw new Error('held'); },
      async verifyProductionDeployLockOnHost() {}, async readTrustedJournal() { return structuredClone(journal); },
      async writeProductionDeployJournal(options) {
        calls.push(options.native.installState);
        if (mode === 'receipt-persistence-failed' && options.native.installState === 'installed') throw new Error('held');
        journal.nativeRefresh = deployLock.preserveNativeJournalState(journal, options.native, candidate, false);
      },
      async nativeContainers() { return {}; }, async verifyNativeIdle() { calls.push('idle'); }, async verifyNativeBinding() { calls.push('binding'); },
      async queryNativeWork() { calls.push('work-check'); return { safe: true, nativePending: false, nativeBoundPending: false }; },
      async open() { return { async writeFile() {}, async sync() {}, async close() {} }; },
      async rm() { calls.push('snapshot-cleanup'); }, randomUUID() { return 'fixture'; },
      async nativeCommand(command, args) {
        if (command === '/usr/bin/node') return '{}';
        calls.push('installer');
        assert.ok(args.includes('--defer-timer'));
        if (mode === 'installer-interrupted') throw new Error('held');
        return JSON.stringify(mode === 'foreign-receipt' ? { ...installation, releaseSha: 'd'.repeat(40) } : installation);
      },
    };
    const operation = runInNewContext(`${body}; nativeOperation`, context);
    const options = { candidateSha: candidate, rollbackSha: 'a'.repeat(40) };
    if (mode === 'success') {
      assert.equal(await operation('native-install', options), 'NATIVE_OPERATION_OK');
      assert.equal(journal.nativeRefresh.installState, 'installed');
    } else {
      await assert.rejects(operation('native-install', options), /held|Native deployment state/u);
      assert.equal(journal.nativeRefresh.installState, 'install_attempting');
      await assert.rejects(operation('native-prepare-rollback', options), /held/u);
      assert.equal(calls.filter(call => call === 'installer').length, 1);
    }
    assert.ok(calls.indexOf('install_attempting') < calls.indexOf('installer'));
    assert.ok(calls.includes('snapshot-cleanup'));
  }
});

test('Native actual restore operation records intent and holds partial or unverified restoration', async () => {
  const body = deployLockSource.match(/async function nativeOperation\([^)]*\) \{[\s\S]*?\n\}/u)?.[0];
  assert.ok(body);
  const candidate = 'b'.repeat(40), installation = { releaseSha: candidate, runtimeId: `installed-native-continuation-${candidate}`, skillCatalogueId: `project-catalogue-${candidate}`, timerDeferred: true };
  for (const mode of ['success', 'restore-interrupted', 'binding-failed', 'restored-receipt-persistence-failed']) {
    let journal = { phase: 'switching', candidateSha: candidate, rollbackSha: 'a'.repeat(40), nativeRefresh: {
      ...nativeJournalFixture(), quiesceState: 'quiesced', installState: 'installed', installation,
      candidateCheckpoint: '2026-10-09T08:00:00.000Z',
    } };
    const calls = [], old = journal.nativeRefresh.before;
    const context = {
      transitionNativeJournalState: deployLock.transitionNativeJournalState,
      invalidNativeState() { throw new Error('held'); }, async verifyProductionDeployLockOnHost() {},
      async readTrustedJournal() { return structuredClone(journal); },
      async writeProductionDeployJournal(options) {
        calls.push(options.native.restoreState);
        if (mode === 'restored-receipt-persistence-failed' && options.native.restoreState === 'restored_verified') throw new Error('held');
        journal.nativeRefresh = deployLock.preserveNativeJournalState(journal, options.native, candidate, false);
      },
      async pauseNativeProducers() { calls.push('pause'); }, async holdNativeTimer() { calls.push('timer-hold'); },
      async verifyNativeIdle() { calls.push('idle'); },
      async queryNativeWork(sha, checkpoint) { assert.equal(checkpoint, journal.nativeRefresh.candidateCheckpoint); calls.push('work-check'); return { safe: true }; },
      async nativeCommand(command, args) {
        assert.ok(args.includes('--restore-previous')); calls.push('restore');
        if (mode === 'restore-interrupted') throw new Error('held');
        return JSON.stringify({ releaseSha: candidate, restored: true, timerDeferred: true, previousRuntimeId: old.runtimeId, previousSkillCatalogueId: old.skillCatalogueId });
      },
      async verifyNativeBinding(binding) {
        assert.equal(binding.runtimeId, old.runtimeId); calls.push('old-binding');
        if (mode === 'binding-failed') throw new Error('held');
      },
    };
    const operation = runInNewContext(`${body}; nativeOperation`, context), options = { candidateSha: candidate, rollbackSha: 'a'.repeat(40) };
    if (mode === 'success') {
      assert.equal(await operation('native-prepare-rollback', options), 'NATIVE_OPERATION_OK');
      assert.equal(journal.nativeRefresh.restoreState, 'restored_verified');
    } else {
      await assert.rejects(operation('native-prepare-rollback', options), /held/u);
      assert.equal(journal.nativeRefresh.restoreState, 'restore_attempting');
      await assert.rejects(operation('native-prepare-rollback', options), /held/u);
    }
    assert.ok(calls.indexOf('pause') < calls.indexOf('restore'));
    assert.ok(calls.indexOf('work-check') < calls.indexOf('restore'));
    assert.ok(calls.indexOf('restore_attempting') < calls.indexOf('restore'));
    assert.equal(calls.filter(call => call === 'restore').length, 1);
  }
});

test('Native quiesce persists switching before stopping producers and prepared uncertainty retains its journal', async t => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-native-phase-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const trace = join(root, 'trace').replaceAll('\\', '/');
  const setup = ['set -eEuo pipefail', `TRACE='${trace}'`, transactionStateSource,
    'transaction_initialize_state; REFRESH_NATIVE_RESOURCES=1; TRANSACTION_PHASE=prepared',
    'transaction_journal_update(){ printf "phase:%s\\n" "$1" >> "$TRACE"; }',
    'transaction_pause_native_producers(){ printf "pause:%s\\n" "$TRANSACTION_PHASE" >> "$TRACE"; }',
  ];
  let result = spawnSync(bash, ['-c', [...setup, 'transaction_quiesce_native_refresh', 'trap - HUP INT TERM'].join('\n')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual((await readFile(trace, 'utf8')).trim().split('\n'), ['phase:switching', 'pause:switching']);
  result = spawnSync(bash, ['-c', [...setup,
    'TRANSACTION_NATIVE_STARTED=1; TRANSACTION_JOURNAL_ACTIVE=1',
    'transaction_assert_lock(){ return 0; }; transaction_journal_clear(){ printf "cleared\\n" >> "$TRACE"; }',
    'transaction_rollback_application 143',
  ].join('\n')], { encoding: 'utf8' });
  assert.equal(result.status, 70);
  assert.match(result.stderr, /ROLLBACK_FAILED_NATIVE_UNCERTAIN/u);
  assert.equal((await readFile(trace, 'utf8')).includes('cleared'), false);
});

test('Native real journal preserves metadata on phase updates and refuses clearing interrupted installation under FD9', async t => {
  if (process.platform === 'win32' || spawnSync(bash, ['-c', 'command -v flock >/dev/null 2>&1']).status !== 0) {
    t.skip('Linux CI executes the real Native inherited-FD atomic-journal behavior'); return;
  }
  const root = await mkdtemp(join(tmpdir(), 'xgs-native-journal-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const lockDirectory = join(root, 'private'), journalPath = join(root, 'journal.json'), helperPath = join(root, 'helper.mjs');
  const fixture = nativeJournalFixture(), candidateSha = 'b'.repeat(40), rollbackSha = 'a'.repeat(40);
  const helper = `
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {writeProductionDeployJournal,clearProductionDeployJournal} from ${JSON.stringify(new URL('./production-deploy-lock.mjs', import.meta.url).href)};
const original=${JSON.stringify(fixture)};
const common=${JSON.stringify({ lockDirectory, journalPath, candidateSha, rollbackSha, requiredUid: process.getuid(), lockFd: 9 })};
await writeProductionDeployJournal({...common,phase:'prepared',create:true,native:original});
await writeProductionDeployJournal({...common,phase:'switching',create:false});
assert.deepEqual(JSON.parse(await readFile(common.journalPath,'utf8')).nativeRefresh,original);
await assert.rejects(writeProductionDeployJournal({...common,candidateSha:'c'.repeat(40),phase:'switching',create:false}),/another transaction/);
const quiescing={...original,quiesceState:'quiescing'};
await writeProductionDeployJournal({...common,phase:'switching',create:false,native:quiescing});
const quiesced={...quiescing,quiesceState:'quiesced'};
await writeProductionDeployJournal({...common,phase:'switching',create:false,native:quiesced});
const attempted={...quiesced,installState:'install_attempting'};
await writeProductionDeployJournal({...common,phase:'switching',create:false,native:attempted});
await writeProductionDeployJournal({...common,phase:'published',create:false});
assert.deepEqual(JSON.parse(await readFile(common.journalPath,'utf8')).nativeRefresh,attempted);
await assert.rejects(clearProductionDeployJournal(common),/uncertain; journal retained/);
assert.equal((await stat(common.journalPath)).mode & 0o777,0o600);
process.stdout.write('NATIVE_JOURNAL_PRESERVED\\n');
`;
  await writeFile(helperPath, helper);
  const result = spawnSync(bash, ['-c', transactionLockHarness(lockDirectory, process.getuid(), `node '${helperPath}'`)], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'NATIVE_JOURNAL_PRESERVED');
  assert.deepEqual(JSON.parse(await readFile(journalPath, 'utf8')).nativeRefresh.before, fixture.before);
});

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

test('normal publication prunes inactive releases only after acceptance and keeps committed cleanup failure visible', async t => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-retention-publication-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const begin = transactionSource.indexOf('node "$SCRIPT_DIR/production-release-retention.mjs" prepare');
  const end = transactionSource.indexOf('exec 9>&-', begin);
  assert.ok(begin > 0 && end > begin);
  const finish = transactionSource.slice(begin, end);
  for (const mode of ['success', 'prepare-failed', 'complete-failed']) {
    const trace = join(root, `${mode}.txt`).replaceAll('\\', '/');
    const script = [
      'set -eEuo pipefail', `TRACE='${trace}'`, `MODE='${mode}'`,
      'SCRIPT_DIR=/unused; RELEASE_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; PREVIOUS_RELEASE_SHA=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      'node() {',
      '  local phase="$2"; shift 2',
      '  if [ "$phase" = prepare ]; then',
      '    local prune=0; while [ "$#" -gt 0 ]; do [ "$1" != --prune-unused ] || prune="$2"; shift 2; done',
      '    [ "$prune" = 1 ] || return 65',
      '    printf "%s\\n" prepare >> "$TRACE"',
      '    [ "$MODE" != prepare-failed ] || return 66',
      '  else',
      '    printf "%s\\n" complete >> "$TRACE"',
      '    [ "$MODE" != complete-failed ] || return 78',
      '  fi',
      '}',
      'transaction_commit() { printf "%s\\n" commit >> "$TRACE"; }',
      finish,
    ].join('\n');
    const result = spawnSync(bash, ['-c', script], { encoding: 'utf8' });
    const observed = existsSync(trace) ? (await readFile(trace, 'utf8')).trim().split('\n') : [];
    if (mode === 'success') {
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(observed, ['prepare', 'commit', 'complete']);
    } else if (mode === 'prepare-failed') {
      assert.equal(result.status, 66, result.stderr);
      assert.deepEqual(observed, ['prepare']);
    } else {
      assert.equal(result.status, 78, result.stderr);
      assert.deepEqual(observed, ['prepare', 'commit', 'complete']);
      assert.match(result.stderr, /DEPLOY_COMMITTED_RETENTION_PENDING/u);
    }
  }
});
const workerDockerfile = readFileSync(new URL('../../apps/agent-worker/Dockerfile', import.meta.url), 'utf8');
const parserDockerfile = readFileSync(new URL('../../apps/agent-worker/Dockerfile.parser', import.meta.url), 'utf8');
const productionCompose = readFileSync(new URL('../compose/docker-compose.prod.yml', import.meta.url), 'utf8');
const developmentCompose = readFileSync(new URL('../compose/docker-compose.dev.yml', import.meta.url), 'utf8');

function webReadinessCode() {
  const web = productionCompose.split('\n  web:')[1]?.split('\nnetworks:')[0] ?? '';
  const check = web.match(/test:\s*(\[.*\])/u)?.[1];
  assert.ok(check, 'Compose wait must check actual Web HTTP readiness');
  const [kind, executable, option, code] = JSON.parse(check);
  assert.deepEqual([kind, executable, option], ['CMD', 'node', '-e']);
  return code;
}

test('public status acceptance reports the observed status and transport outcome while still denying failure', () => {
  const run = (status, curlExit) => spawnSync(bash, ['-c', [
    `curl() { printf '%s' '${status}'; return ${curlExit}; }; export -f curl`,
    deploymentFunction('run_remote'), deploymentFunction('expect_http_status'),
    "expect_http_status 'https://public.invalid/' '200'",
  ].join('\n')], { encoding: 'utf8' });
  assert.equal(run(200, 0).status, 0);
  const mismatch = run(502, 0); assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /url=https:\/\/public\.invalid\/ observed=502 expected=200 curl_exit=0/u);
  const unavailable = run('000', 28); assert.notEqual(unavailable.status, 0);
  assert.match(unavailable.stderr, /observed=000 expected=200 curl_exit=28/u);
});

test('exact public release acceptance reports only an observed SHA or length, never the response body', () => {
  const expected = 'a'.repeat(40);
  const run = body => spawnSync(bash, ['-c', [
    `curl() { printf '%s' '${body}'; }; export -f curl`,
    deploymentFunction('run_remote'), deploymentFunction('expect_http_body'),
    `expect_http_body 'https://public.invalid/__release' '${expected}'`,
  ].join('\n')], { encoding: 'utf8' });
  assert.equal(run(expected).status, 0);
  const different = run('b'.repeat(40)); assert.notEqual(different.status, 0);
  assert.match(different.stderr, new RegExp(`observed=${'b'.repeat(40)} expected=${expected}`, 'u'));
  const unexpected = run('UNEXPECTED_RESPONSE_CONTENT'); assert.notEqual(unexpected.status, 0);
  assert.match(unexpected.stderr, /observed=not-sha/u);
  assert.doesNotMatch(unexpected.stderr, /UNEXPECTED_RESPONSE_CONTENT/u);
});

async function runWebReadiness(origin, options = {}) {
  const calls = [];
  const outcome = new Promise(resolve => {
    runInNewContext(webReadinessCode(), {
      fetch: (url, init) => {
        const requested = new URL(url);
        assert.equal(requested.origin, 'http://127.0.0.1:3000');
        assert.equal(requested.pathname, '/');
        calls.push({ url, init });
        return fetch(origin + requested.pathname, init);
      },
      AbortSignal: options.signal ?? AbortSignal,
      process: { exit: resolve },
    });
  });
  return { exit: await outcome, calls };
}

test('Web readiness rejects an HTTP server that is running but not ready, then accepts its actual homepage', async t => {
  let status = 503;
  const server = createServer((_request, response) => { response.writeHead(status); response.end(); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await runWebReadiness(origin)).exit, 1);
  status = 200;
  assert.equal((await runWebReadiness(origin)).exit, 0);
});

test('Web readiness does not hide a redirect behind a successful destination', async t => {
  const routes = [];
  const server = createServer((request, response) => {
    routes.push(request.url);
    response.writeHead(request.url === '/' ? 302 : 200, request.url === '/' ? { location: '/ready' } : {}); response.end();
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  assert.equal((await runWebReadiness(`http://127.0.0.1:${server.address().port}`)).exit, 1);
  assert.deepEqual(routes, ['/']);
});

test('Web readiness bounds an unresponsive HTTP request and denies connection failure', async t => {
  const server = createServer(() => {}); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(() => { server.closeAllConnections(); server.close(); });
  const result = await runWebReadiness(origin, { signal: { timeout: ms => {
    assert.ok(ms > 0 && ms < 5000, 'native request deadline must fit the healthcheck timeout');
    return AbortSignal.timeout(10);
  } } });
  assert.equal(result.exit, 1);
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  assert.equal((await runWebReadiness(origin)).exit, 1);
});
const cloudSync = readFileSync(new URL('../../scripts/cloud-sync.mjs', import.meta.url), 'utf8');
const releaseSyncCommand = readFileSync(new URL('../../scripts/release-sync-command.mjs', import.meta.url), 'utf8');
const backup = readFileSync(new URL('./backup.sh', import.meta.url), 'utf8');
const sshRun = readFileSync(new URL('./ssh-run.sh', import.meta.url), 'utf8');
const backupRunbook = readFileSync(new URL('../../docs/runbooks/backup-restore.md', import.meta.url), 'utf8');
const embeddingDockerfile = readFileSync(new URL('../../apps/embedding-worker/Dockerfile', import.meta.url), 'utf8');
const embeddingRequirements = readFileSync(new URL('../../apps/embedding-worker/requirements.lock', import.meta.url), 'utf8');
const embeddingEvaluatorDockerfile = readFileSync(new URL('../embedding-candidates/bge-m3/Dockerfile', import.meta.url), 'utf8');
const squidConfig = readFileSync(new URL('../squid/openscience-egress.conf', import.meta.url), 'utf8');
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

test('ScanSci controlled egress is private to the fixed retrieval subnet', () => {
  assert.match(squidConfig, /^http_port 127\.0\.0\.1:7891 name=loopback_listener$/mu);
  assert.match(squidConfig, /^http_port 172\.24\.0\.1:7891 name=scansci_listener$/mu);
  assert.match(squidConfig, /^acl scansci_retrieval src 172\.24\.0\.0\/24$/mu);
  assert.match(
    squidConfig,
    /^acl scansci_parent_domains dstdomain \.arxiv\.org \.elsevier\.com \.sciencedirect\.com \.sciencedirectassets\.com \.carsi\.edu\.cn \.zju\.edu\.cn$/mu,
  );
  assert.equal([...squidConfig.matchAll(/^acl scansci_parent_domains\b.*$/gmu)].length, 1);
  assert.match(squidConfig, /^http_access deny scansci_retrieval !CONNECT$/mu);
  assert.match(squidConfig, /^http_access deny scansci_retrieval !SSL_ports$/mu);
  assert.match(squidConfig, /^http_access deny scansci_retrieval blocked_ipv4$/mu);
  assert.match(squidConfig, /^http_access deny scansci_retrieval blocked_ipv6$/mu);
  assert.match(squidConfig, /^http_access allow scansci_retrieval scansci_listener CONNECT SSL_ports$/mu);
  assert.match(squidConfig, /^cache_peer_access home_tunnel allow loopback$/mu);
  assert.match(squidConfig, /^cache_peer_access home_tunnel allow scansci_retrieval scansci_parent_domains$/mu);
  assert.match(squidConfig, /^cache_peer_access home_tunnel deny scansci_retrieval$/mu);
  assert.match(squidConfig, /^cache_peer_access home_tunnel deny all$/mu);
  assert.match(squidConfig, /^always_direct allow scansci_retrieval !scansci_parent_domains$/mu);
  assert.doesNotMatch(squidConfig, /^cache_peer_access home_tunnel allow all$/mu);
  assert.doesNotMatch(squidConfig, /^http_port (?:0\.0\.0\.0|\[::\]):7891$/mu);
  assert.doesNotMatch(squidConfig, /172\.26\.0\.|scansci_browser|browser_listener/u);
  assert.doesNotMatch(`${productionCompose}\n${developmentCompose}`, /browser_net|auth_net|scansci-(?:auth|legal|browser|secret-init)/u);
  assert.ok(squidConfig.indexOf('http_access allow scansci_retrieval scansci_listener CONNECT SSL_ports') < squidConfig.indexOf('http_access deny all'));
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

test('ordinary rollback preserves paid video plans created after candidate exposure before commit', async t => {
  const base = fileURLToPath(new URL('../../tmp/synclip-optional-narration/r1/', import.meta.url));
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'rollback-window-'));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
  for (const mode of ['historical', 'optional-null-cp']) {
    const compatibleReader = mode === 'historical' ? 'ad99' : 'R1';
    const directory = join(root, mode); await mkdir(directory);
    const pending = { id: 'same-paid-plan', status: 'pending', executionAttempt: 0, retryCount: 0,
      idempotencyKey: 'same-once-key', payload: { storyboard: { output: 'video', narrative: true,
        instruction: 'Use native-first provider audio grounded in the source narration.' } },
      result: { nativeAgentExecution: { kind: 'hermes-agent', profile: 'paper-illustration',
        runtimeId: 'original-native393', skillCatalogueId: 'original-catalogue393', model: 'MiniMax-M3',
        ...(mode === 'optional-null-cp' ? { planningContract: 'video-optional-audio-v1' } : {}) } },
      ledger: [{ idempotencyKey: 'agent-task-reserve:same-paid-plan', aiCreditDelta: -1 }] };
    const original = JSON.stringify(pending);
    const seed = join(directory, 'seed.json'), row = join(directory, 'paid-row.json'), trace = join(directory, 'trace');
    await writeFile(seed, original);
    const shell = [
      'set -eEuo pipefail', `source '${transactionStatePath.replaceAll('\\', '/')}'`,
      `FIXTURE='${directory.replaceAll('\\', '/')}'`,
      'transaction_assert_lock(){ :; }',
      'transaction_journal_start(){ printf "prepared\\n" > "$FIXTURE/journal"; }',
      'transaction_journal_update(){ printf "%s\\n" "$1" > "$FIXTURE/journal"; }',
      'transaction_journal_clear(){ rm -f -- "$FIXTURE/journal"; }',
      'transaction_journal_clear_after_rollback(){ rm -- "$FIXTURE/journal"; }',
      'transaction_abort_rollback_intent(){ :; }',
      'transaction_cleanup_candidate_capability(){ printf "cleanup\\n" >> "$FIXTURE/trace"; }',
      `transaction_perform_application_rollback(){ test -f "$FIXTURE/paid-row.json"; printf "${compatibleReader}\\n" > "$FIXTURE/active"; printf "rollback\\n" >> "$FIXTURE/trace"; }`,
      'transaction_initialize_state', 'transaction_install_traps', 'transaction_begin',
      'transaction_mark_phase switching',
      'printf "candidate-online\\n" >> "$FIXTURE/trace"',
      // The row and its single debit appear after the candidate is exposed, while rollback is still armed.
      'cp -- "$FIXTURE/seed.json" "$FIXTURE/paid-row.json"',
      'printf "task-and-credit-committed-no-cp\\n" >> "$FIXTURE/trace"',
      'false', 'transaction_commit',
    ].join('\n');
    const outcome = spawnSync(bash, ['-c', shell], { encoding: 'utf8' });
    assert.notEqual(outcome.status, 0, outcome.stderr);
    assert.deepEqual((await readFile(trace, 'utf8')).trim().split('\n'),
      ['candidate-online', 'task-and-credit-committed-no-cp', 'rollback', 'cleanup']);
    assert.equal(await readFile(row, 'utf8'), original, 'rollback must not replace the paid row, contract, key or ledger');
    assert.equal((await readFile(join(directory, 'active'), 'utf8')).trim(), compatibleReader);
    assert.equal(existsSync(join(directory, 'journal')), false);
  }
  // Reader/admission behavior is covered by the actual ad99/a0f2 cross-version driver and Worker fixtures.
  // This exercises the real ordinary error/rollback state machine, with no Docker, DB, provider or model call.
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
    `FINAL_SCANSCI_MCP_IMAGE_ID='sha256:${'f'.repeat(64)}'`,
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

function observeSignalFixture(child) {
  const state = { output: '', closed: false, error: null, exit: { code: null, signal: null } };
  const checks = new Set();
  const notify = () => { for (const check of checks) check(); };
  const onError = (error) => { state.error = error.message; notify(); };
  child.stderr.on('data', (chunk) => { state.output += chunk.toString(); notify(); });
  child.stderr.on('error', onError);
  child.stdin?.on('error', onError);
  child.on('error', onError);
  child.once('close', (code, signal) => { state.closed = true; state.exit = { code, signal }; notify(); });
  const wait = (ready, label, failEarly = true) => new Promise((resolvePromise, rejectPromise) => {
    let timeout;
    const finish = (reason) => {
      clearTimeout(timeout);
      checks.delete(check);
      if (reason) rejectPromise(new Error(`${label} ${reason}; output=${JSON.stringify(state.output)}; exit=${JSON.stringify(state.exit)}; spawnError=${JSON.stringify(state.error)}`));
      else resolvePromise(state.output);
    };
    const check = () => {
      if (ready()) finish();
      else if (failEarly && (state.closed || state.error)) finish('closed or failed before readiness');
    };
    timeout = setTimeout(() => finish('timed out'), 5000);
    checks.add(check);
    check();
  });
  const waitForExit = async (label = 'fixture exit') => {
    await wait(() => state.closed, label, false);
    return state.exit;
  };
  return {
    child,
    waitFor: (pattern, label) => wait(() => pattern.test(state.output), label),
    waitForExit,
    stop: async () => {
      if (!state.closed && child.pid) {
        try { process.kill(-child.pid, 'SIGKILL'); }
        catch (error) { if (error.code !== 'ESRCH') throw error; }
      }
      child.stdin?.destroy();
      await waitForExit('fixture cleanup');
    },
  };
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
  assert.match(api, /EMBEDDING_WORKER_URL: http:\/\/embedding-worker:8080/u);
  assert.match(api, /networks:[\s\S]*- embedding_net/u);
  assert.doesNotMatch(agentWorker, /embedding-worker:\s*\n\s*condition:/);
  assert.match(productionCompose, /embedding_net:[\s\S]*internal: true/);
  assert.match(source, /build agent-worker document-parser/);
  assert.match(source, /EMBEDDING_DEPLOY=/);
  assert.match(source, /--profile embedding/);
  assert.match(source, /if \[ "\$EMBEDDING_DEPLOY" -eq 1 \]/);
  assert.match(transactionSource, /migrate status --schema \/opt\/openscience\/infra\/search\/schema\.prisma/u);
  assert.match(source, /scripts\/register-search-model\.mjs/);
  assert.ok(
    source.indexOf('scripts/register-search-model.mjs') < source.indexOf('初始化并验证 BGE-M3 模型卷'),
    'the exact search model identity must be registered before the embedding worker switch',
  );
  assert.match(transactionSource, /node scripts\/verify-embedding-runtime\.mjs/u);
  assert.match(transactionSource, /model-init\.py --validate --seed \/opt\/bge-m3-seed --target \/models\/bge-m3/u);
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
  assert.match(source, /schema=6/);
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
  assert.match(source, /grep -q '\^  embedding-worker:'/);
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
    /XGS_RELEASE_IMAGE_TAG=\$RELEASE_SHA docker compose --project-directory \$RELEASE_ROOT --env-file \$PROD_ENV -f \$COMPOSE_FILE \$1/,
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
  assert.match(launcherSource, /ANCESTRY_ARGS=\(--ancestor "\$ROLLBACK_SHA"\)/);
  assert.ok(launcherSource.indexOf('"${ANCESTRY_ARGS[@]}"') < launcherSource.indexOf('scripts/cloud-sync.mjs'));
});

test('release source guard accepts forward history and rejects missing, backward or sibling releases', async t => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-release-ancestry-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const guard = fileURLToPath(new URL('../../scripts/verify-release-source.mjs', import.meta.url));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init'); git('config', 'user.email', 'gate@example.invalid'); git('config', 'user.name', 'Release Gate');
  git('commit', '--allow-empty', '-m', 'base');
  const base = git('rev-parse', 'HEAD');
  git('commit', '--allow-empty', '-m', 'active');
  const active = git('rev-parse', 'HEAD');
  git('commit', '--allow-empty', '-m', 'forward');
  const forward = git('rev-parse', 'HEAD');
  const check = ancestor => spawnSync(process.execPath, [guard, '--root', root, '--ref', 'HEAD', '--ancestor', ancestor], { encoding: 'utf8' });
  assert.equal(check(active).status, 0);
  assert.equal(check(forward).status, 0, 'same-SHA verification remains available');
  git('checkout', '--detach', base);
  assert.notEqual(check(active).status, 0, 'normal deployment cannot silently roll back');
  git('commit', '--allow-empty', '-m', 'sibling');
  const sibling = check(active);
  assert.notEqual(sibling.status, 0);
  assert.match(sibling.stderr, /integrate the current release/);
  const missing = check('f'.repeat(40));
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /fetch its history/);
  git('merge', '--no-ff', active, '-m', 'integrate active');
  assert.equal(check(active).status, 0, 'integrating both branches restores forward deployment');
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
  const parsed = spawnSync(bash, ['-n', '-c', command], { encoding: 'utf8' });
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
  assert.equal((launcherSource.match(/^"\$SSH_EXECUTABLE" /gm) ?? []).length, 1);
  assert.match(launcherSource, /System32\/OpenSSH\/ssh\.exe/u);
  assert.match(launcherSource, /exec \/bin\/bash '\$REMOTE_TRANSACTION_RUNNER'[^\n]+<\/dev\/null/);
  assert.doesNotMatch(launcherSource, /\| ssh |bash -s/);
  assert.match(transactionSource, /exec 9<>/);
  assert.match(transactionSource, /flock -n -E 73 9/);
  assert.match(runRemote, /bash -c/);
  assert.doesNotMatch(runRemote, /\bssh\b/);
  assert.doesNotMatch(source, /coproc|DEPLOY_LOCK_ASSERT_COMMAND|lock-command|assert-command/);
  assert.doesNotMatch(transactionSource, /release-contract-test|TRANSACTION_TEST|XGS_TEST/);
  assert.match(transactionSource, /\[ "\$#" -ge 3 \] && \[ "\$#" -le 6 \]/u);
  assert.match(transactionSource, /NO_TESTS="\$\{4:-0\}"/u);
  assert.match(transactionSource, /REUSE_UNCHANGED_CAPABILITY_IMAGES="\$\{5:-0\}"/u);
  assert.match(transactionSource, /\[\[ "\$NO_TESTS" =~ \^\[01\]\$ \]\]/u);
  assert.match(transactionSource, /\[\[ "\$REUSE_UNCHANGED_CAPABILITY_IMAGES" =~ \^\[01\]\$ \]\]/u);
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
  const children = [];
  const startFixture = (body) => {
    const fixture = observeSignalFixture(spawn(bash, ['-c', transactionLockHarness(
      lockDirectory, requiredUid, body,
    )], { stdio: ['pipe', 'pipe', 'pipe'], detached: true }));
    children.push(fixture);
    return fixture;
  };
  let primaryError;
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

    const crash = startFixture(`${invoke('start')}; printf 'JOURNAL_DURABLE\\n' >&2; IFS= read -r crashRelease`);
    assert.match(await crash.waitFor(/JOURNAL_DURABLE/, 'crash readiness'), /JOURNAL_DURABLE/);
    process.kill(-crash.child.pid, 'SIGKILL');
    assert.deepEqual(await crash.waitForExit(), { code: null, signal: 'SIGKILL' });
    assert.equal(existsSync(journalPath), true);
    result = spawnSync(bash, ['-c', transactionLockHarness(
      lockDirectory, requiredUid, `[ ! -e '${journalPath}' ] || exit 75`,
    )], { encoding: 'utf8' });
    assert.equal(result.status, 75, result.stderr);
    await rm(journalPath);

    await writeFile(markerPath, `${oldSha}\n`);
    const rollbackTrap = [
      `rollback_handler() { printf "TRAP_ENTERED\\n" >&2; ${invoke('cas', oldSha, newSha)}; printf "ROLLBACK_IN_LOCK\\n" >&2; local rollbackRelease; IFS= read -r rollbackRelease; [ "$rollbackRelease" = release-rollback ]; ${invoke('clear')}; exit 143; }`,
      'trap rollback_handler TERM',
      invoke('start'),
      invoke('cas'),
      'printf "SWITCHED\\n" >&2',
      // A builtin pause has no foreground-child fork window after the readiness marker.
      'IFS= read -r interruptedRelease',
    ].join('; ');
    const interrupted = startFixture(rollbackTrap);
    assert.match(await interrupted.waitFor(/SWITCHED/, 'TERM readiness'), /SWITCHED/);
    const rollbackOutput = interrupted.waitFor(/ROLLBACK_IN_LOCK/, 'TERM rollback');
    process.kill(-interrupted.child.pid, 'SIGTERM');
    assert.match(await rollbackOutput, /TRAP_ENTERED[\s\S]*ROLLBACK_IN_LOCK/);
    assert.equal((await readFile(markerPath, 'utf8')).trim(), oldSha);
    assert.equal(existsSync(journalPath), true);
    const competitor = spawnSync(bash, ['-c', transactionLockHarness(
      lockDirectory, requiredUid, ':',
    )], { encoding: 'utf8' });
    assert.equal(competitor.status, 73, competitor.stderr);
    interrupted.child.stdin.end('release-rollback\n');
    assert.deepEqual(await interrupted.waitForExit(), { code: 143, signal: null });
    assert.equal((await readFile(markerPath, 'utf8')).trim(), oldSha);
    assert.equal(existsSync(journalPath), false);
    const replacement = spawnSync(bash, ['-c', transactionLockHarness(
      lockDirectory, requiredUid, ':',
    )], { encoding: 'utf8' });
    assert.equal(replacement.status, 0, replacement.stderr);
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    const cleanup = await Promise.allSettled(children.map((fixture) => fixture.stop()));
    const errors = cleanup.filter((result) => result.status === 'rejected').map((result) => result.reason);
    if (errors.length) throw new AggregateError(primaryError ? [primaryError, ...errors] : errors, 'signal fixture cleanup failed; sandbox retained');
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
    assert.match(call, /--project-directory (?:\$RELEASE_ROOT|'\$RELEASE_ROOT'|\$PREVIOUS_RELEASE_ROOT|'\$root')/u);
  }
  const native = deploymentFunction('transaction_start_native_application');
  assert.match(native, /candidate\) root="\$RELEASE_ROOT"; sha="\$RELEASE_SHA"/u);
  assert.match(native, /original\) root="\$PREVIOUS_RELEASE_ROOT"; sha="\$PREVIOUS_RELEASE_SHA"/u);
  assert.match(native, /\*\) return 64/u);
  assert.match(
    transactionStateSource,
    /docker compose --project-directory '\$RELEASE_ROOT' --profile embedding/u,
  );
});

test('official-only rollback verifies the legacy schema-5 MCP with the candidate verifier', () => {
  assert.match(
    source,
    /\/usr\/bin\/node '\$RELEASE_ROOT\/infra\/scripts\/verify-scansci-mcp-runtime\.mjs' --release-root '\$PREVIOUS_RELEASE_ROOT'/u,
  );
  assert.doesNotMatch(
    source,
    /\/usr\/bin\/node '\$PREVIOUS_RELEASE_ROOT\/infra\/scripts\/verify-scansci-mcp-runtime\.mjs'/u,
  );
  assert.ok(source.includes('test -z \\"\\$containers\\"'));
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
  const preSwitch = transactionSource.indexOf('verify_candidate_switch_contract pre-switch', migration);
  const switchBoundary = transactionSource.indexOf('transaction_mark_phase switching', preSwitch);
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
  assert.doesNotMatch(backup, /SCANSCI_BROWSER|scansci-legal/u);
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
