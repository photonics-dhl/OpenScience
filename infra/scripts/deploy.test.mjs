import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { getHeapStatistics } from 'node:v8';
import {
  chmod, copyFile, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { builtinModules } from 'node:module';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { runInNewContext, Script } from 'node:vm';
import * as deployLock from './production-deploy-lock.mjs';

let videoTimeoutObservationDisabled = false;
const videoTimeoutCounts = { programRequested: 0, programReturned: 0, vmCreated: 0, cacheEntries: 0, cacheCharacters: 0 };
function videoTimeoutCount(name, amount = 1) {
  try { videoTimeoutCounts[name] += amount; return videoTimeoutCounts[name]; } catch { return 0; }
}
function videoTimeoutObservation(phase, ordinal = 0, metrics = {}) {
  try {
    if (videoTimeoutObservationDisabled) return;
    const target = process.env.XGS_VIDEO_TIMEOUT_TRACE;
    if (!target) return;
    const memory = process.memoryUsage(), cpu = process.cpuUsage();
    appendFileSync(target, JSON.stringify({ phase, ordinal, pid: process.pid, elapsedMs: performance.now(),
      cpuUserUs: cpu.user, cpuSystemUs: cpu.system, rss: memory.rss, heapUsed: memory.heapUsed,
      external: memory.external, heapLimit: getHeapStatistics().heap_size_limit, ...videoTimeoutCounts, ...metrics }) + '\n');
  } catch {
    videoTimeoutObservationDisabled = true;
  }
}


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

test('private rollback rejection diagnostics preserve refusal and opt in only for boolean true', () => {
  const video = deployLockSource.match(/function finiteVideoPairCompatibility\([^\n]+\) \{[\s\S]*?\n\}/u)[0];
  const helper = deployLockSource.match(/function emitPrivateRollbackDiagnostic\([^\n]+\) \{[\s\S]*?\n\}/u)?.[0] ?? '';
  const events = [], roots = [];
  const functions = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 1), runInNewContext(`${helper}; ${video}; finiteVideoPairCompatibility`, {
    rollbackProofContexts: new WeakMap(), APPLICATION_ROLLBACK_READERS: roots,
    console: { error: value => events.push(value) }, nodeUtilTypes: createRequire(import.meta.url)('node:util').types,
  }));
  for (const value of [undefined, false, 'true', 1, true]) {
    events.length = 0;
    assert.equal(functions({}, [], [], '/candidate', '/previous', roots, value), false);
    assert.equal(events.length, value === true ? 1 : 0);
    if (value === true) assert.deepEqual(JSON.parse(events[0].split(' ', 2)[1]),
      { stage: 'video', code: 'COMPATIBILITY_UNKNOWN', site: 'context' });
  }
  const selected = deployLockSource.match(/function finiteSelectedGuidePairCompatibility\([^\n]+\) \{[\s\S]*?\n\}/u)?.[0];
  if (selected) {
    const invoke = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 2), runInNewContext(`${helper}; ${selected}; finiteSelectedGuidePairCompatibility`, {
      rollbackProofContexts:new WeakMap(), APPLICATION_ROLLBACK_READERS:roots,
      console:{error:value=>events.push(value)}, nodeUtilTypes:createRequire(import.meta.url)('node:util').types,
    }));
    events.length=0; assert.equal(invoke({},[],[],'/candidate','/previous',roots,true),false);
    assert.equal(events.length,1); assert.equal(JSON.parse(events[0].slice(events[0].indexOf(' ')+1)).stage,'selected-guide');
  }
});

test('private video ingress diagnostics identify the original side and first failed obligation without exposing returned data', async t => {
  const ts = createRequire(import.meta.url)('typescript'), contexts = new WeakMap(), events = [];
  const collector = deployLockSource.match(/function rollbackReaderClosure\(ts, root, roots, vendorPackages\) \{[\s\S]*?\n\}/u)[0];
  const helper = deployLockSource.match(/function emitPrivateRollbackDiagnostic\([^\n]+\) \{[\s\S]*?\n\}/u)[0];
  const video = deployLockSource.match(/function finiteVideoPairCompatibility\([^\n]+\) \{[\s\S]*?\n\}/u)[0];
  const directory = await mkdtemp(join(fileURLToPath(new URL('../../tmp/', import.meta.url)), 'video-ingress-diagnostic-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const candidate = join(directory, 'candidate'), previous = join(directory, 'previous'), roots = [['apps/reader.ts']];
  for (const root of [candidate, previous]) {
    await mkdir(join(root, 'apps'), { recursive: true }); await writeFile(join(root, 'tsconfig.json'), '{}');
    await writeFile(join(root, 'apps/reader.ts'), 'export function read() { return 1; }');
  }
  let sinkFailure = false, proofs, calls;
  const environment = { resolve, relative, dirname, join, existsSync, readFileSync, builtinModules,
    rollbackProofContexts: contexts, APPLICATION_ROLLBACK_READERS: [],
    nodeUtilTypes: createRequire(import.meta.url)('node:util').types,
    console: { error(value) { if (sinkFailure) throw Error('SECRET-sink'); events.push(value); } },
    rollbackCompatibilityUnknown() { throw Error('ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN'); },
    proveNativeVideoReceiptIngress(_ts, program, root) {
      const index = root === candidate ? 0 : 1; calls.push(index);
      assert.equal(program, contexts.get(index === 0 ? current : old).program);
      if (proofs[index] instanceof Error) throw proofs[index];
      return proofs[index];
    } };
  const collect = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 3), runInNewContext(`${collector}; rollbackReaderClosure`, environment));
  const current = collect(ts, candidate, roots), old = collect(ts, previous, roots);
  // Real original collector contexts, but only the actual ingress wrapper is
  // exercised here: this is no DEFAULT or finite source-model acceptance proof.
  const head = video.slice(0, video.indexOf('  try {'));
  const body = video.slice(video.indexOf("    site = 'ingress'"), video.indexOf("    site = 'family'"));
  const invoke = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 4), runInNewContext(`${helper}; ${head} try {
    const left = rollbackProofContexts.get(current), right = rollbackProofContexts.get(previous);
    ${body} return true;
  } catch (error) { return reject(error); } }; finiteVideoPairCompatibility`, environment));
  const edges = ['materializer-host', 'host-slot-result', 'host-before-session', 'session-prefix',
    'session-checkpoint-prefix', 'verified-base', 'store-capability-use', 'generic-private-store-chain'];
  const healthy = () => ({ reason: 'OTHER_PERSISTENCE_ORIGINS_UNPROVEN', storeGraph: { status: 'conditional' },
    privateStoreChain: { status: 'conditional' }, proven: [...edges] });
  const run = (result, side = 0, diagnostics = true, entries = current) => {
    proofs = [healthy(), healthy()]; proofs[side] = result; calls = []; events.length = 0;
    const accepted = invoke(ts, entries, old, candidate, previous, roots, diagnostics);
    return { accepted, lines: events.map(value => JSON.parse(value.slice(value.indexOf(' ') + 1))) };
  };
  const cases = [
    ['reason', () => ({ reason: 'PROGRAM_SYNTAX_UNKNOWN' })],
    ['store-graph', () => ({ reason: healthy().reason, storeGraph: { status: 'unproven' } })],
    ['private-store-chain', () => ({ reason: healthy().reason, storeGraph: { status: 'conditional' },
      privateStoreChain: { status: 'unproven' } })],
    ...edges.map(edge => [edge, () => ({ ...healthy(), proven: edges.filter(value => value !== edge) })]),
  ];
  for (const side of [0, 1]) for (const [site, make] of cases) {
    const result = run(make(), side);
    assert.equal(result.accepted, false);
    assert.deepEqual(calls, side === 0 ? [0] : [0, 1], 'original proof evaluation stops at the first refusal');
    assert.deepEqual(result.lines, [{ stage: 'video', code: site === 'reason' ? 'PROGRAM_SYNTAX_UNKNOWN' : 'COMPATIBILITY_UNKNOWN',
      site: `ingress-${site}`, side: side === 0 ? 'candidate' : 'rollback' }]);
  }
  let reads = 0;
  const secret = { reason: 'SECRET', get at() { reads++; throw Error('SECRET'); }, toJSON() { reads++; throw Error('SECRET'); } };
  assert.equal(run(secret).lines[0].code, 'COMPATIBILITY_UNKNOWN');
  assert.equal(reads, 0);
  assert.doesNotMatch(events.join(''), /SECRET/u);
  const proxyReason = new Proxy({}, { get() { reads++; throw Error('SECRET'); },
    getOwnPropertyDescriptor() { reads++; throw Error('SECRET'); } });
  assert.equal(run({ reason: proxyReason }).lines[0].code, 'COMPATIBILITY_UNKNOWN'); assert.equal(reads, 0);
  for (const side of [0, 1]) assert.deepEqual(run(Error('SECRET'), side).lines,
    [{ stage: 'video', code: 'COMPATIBILITY_UNKNOWN', site: 'ingress', side: side === 0 ? 'candidate' : 'rollback' }]);
  for (const value of [false, 'true', 1]) assert.equal(run(secret, 0, value).lines.length, 0);
  const unbound = run(secret, 0, true, [...current]);
  assert.equal(unbound.accepted, false); assert.equal(unbound.lines[0].code, 'COMPATIBILITY_UNKNOWN');
  assert.equal(unbound.lines[0].side, undefined);
  sinkFailure = true; assert.equal(run(secret).accepted, false); assert.equal(events.length, 0); sinkFailure = false;
  assert.equal(run(healthy()).accepted, true); assert.deepEqual(calls, [0, 1]); assert.equal(events.length, 0);
});

test('private rollback diagnostic privacy uses only natural captured AST identity and fixed refusal sites', async t => {
  const ts = createRequire(import.meta.url)('typescript'), contexts = new WeakMap(), events = [];
  const collector = deployLockSource.match(/function rollbackReaderClosure\(ts, root, roots, vendorPackages\) \{[\s\S]*?\n\}/u)[0];
  const helper = deployLockSource.match(/function emitPrivateRollbackDiagnostic\([^\n]+\) \{[\s\S]*?\n\}/u)[0];
  let sinkFailure = false;
  const environment = { resolve, relative, dirname, join, existsSync, readFileSync, builtinModules,
    rollbackProofContexts: contexts, APPLICATION_ROLLBACK_READERS: [],
    nodeUtilTypes: createRequire(import.meta.url)('node:util').types,
    console: { error(value) { if (sinkFailure) throw Error('SECRET-sink'); events.push(value); } },
    rollbackCompatibilityUnknown() { throw Error('ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN'); } };
  const functions = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 5), runInNewContext(`${collector}; ${helper}; ({collect:rollbackReaderClosure, emit:emitPrivateRollbackDiagnostic})`, environment));
  const parent = fileURLToPath(new URL('../../tmp/first-image/', import.meta.url)); await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, 'diagnostic-context-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const candidate = join(directory, 'candidate'), previous = join(directory, 'previous'), roots = [['apps/reader.ts']];
  for (const [index, root] of [candidate, previous].entries()) {
    await mkdir(join(root, 'apps'), { recursive: true }); await writeFile(join(root, 'tsconfig.json'), '{}');
    await writeFile(join(root, 'apps/reader.ts'), `export function read() { return ${index + 1}; }`);
  }
  const current = functions.collect(ts, candidate, roots), old = functions.collect(ts, previous, roots);
  const left = contexts.get(current), source = left.program.getSourceFile(join(candidate, 'apps/reader.ts'));
  // Custom-root component evidence only: no test writes a WeakMap entry or
  // turns this fixture into original full DEFAULT compatibility acceptance.
  const run = (error, key, overrides = {}, familyCode) => {
    events.length = 0;
    functions.emit(ts, overrides.current ?? current, overrides.previous ?? old, overrides.candidate ?? candidate,
      previous, roots, overrides.branch ?? 'selected-guide', overrides.site ?? 'model', error, key, familyCode);
    assert.ok(events.length <= 1);
    return events.length ? JSON.parse(events[0].slice(events[0].indexOf(' ') + 1)) : undefined;
  };
  const known = 'SELECTED_GUIDE_EAGER_INITIALIZATION_UNKNOWN', key = 'module:apps/reader.ts';
  assert.equal(run({ reason: known, node: source.statements[0] }).module, key);
  assert.equal(run({ reason: known, initializationSite: 'SECRET' }).initializationSite, undefined);
  assert.equal(run({ reason: known, initializationSite: 'moved-initializer' }).initializationSite, 'moved-initializer');
  assert.equal(run({ reason: 'SELECTED_GUIDE_HTTP_LIBRARY_IDENTITY_UNKNOWN', initializationSite: 'moved-initializer' }).initializationSite, undefined);
  assert.equal(run({ reason: 'SELECTED_GUIDE_HTTP_LIBRARY_IDENTITY_UNKNOWN' }).code, 'SELECTED_GUIDE_HTTP_LIBRARY_IDENTITY_UNKNOWN');
  let invoked = 0;
  const bad = { get reason() { invoked++; return 'SECRET'; }, get node() { invoked++; return source; },
    getSourceFile() { invoked++; return source; }, toJSON() { invoked++; return 'SECRET'; } };
  assert.equal(run(bad).code, 'COMPATIBILITY_UNKNOWN');
  assert.equal(run({ reason: known, node: { parent: source, getSourceFile() { invoked++; return source; } } }).module, undefined);
  const proxy = new Proxy({}, { getOwnPropertyDescriptor() { invoked++; throw Error('SECRET-proxy'); }, get() { invoked++; throw Error('SECRET-proxy'); } });
  assert.equal(run(proxy).code, 'COMPATIBILITY_UNKNOWN');
  assert.equal(run({ reason: known, get initializationSite() { invoked++; return 'moved-initializer'; } }).initializationSite, undefined);
  assert.equal(invoked, 0);
  const unknown = run({ reason: 'SECRET', message: 'SECRET', stack: 'SECRET', path: 'SECRET', stage: 'SECRET' });
  assert.equal(JSON.stringify(unknown).includes('SECRET'), false);
  for (const invalid of ['/SECRET', 'module:../SECRET', `module:apps/${'x'.repeat(241)}`, 'module:apps/unbound.ts'])
    assert.equal(run({ reason: known }, invalid).module, undefined);
  for (const override of [{current:[...current]}, {previous:[...old]}, {previous:current}, {candidate:previous}]) {
    const result = run({reason:known,node:source}, key, override);
    assert.equal(result.code, 'COMPATIBILITY_UNKNOWN'); assert.equal(result.module, undefined);
  }
  const originalChecker=left.checker;
  try { left.checker={}; const result=run({reason:known,node:source},key);
    assert.equal(result.code,'COMPATIBILITY_UNKNOWN'); assert.equal(result.module,undefined);
  } finally { left.checker=originalChecker; }
  sinkFailure = true; assert.doesNotThrow(() => run({reason:known,node:source})); sinkFailure = false;
  const descriptorFailure = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 6), runInNewContext(`${helper}; (error=>{emitPrivateRollbackDiagnostic(ts,current,old,candidate,previous,roots,'selected-guide','model',error);return false;})`, {
    ...environment, ts,current,old,candidate,previous,roots,
    Object:{getOwnPropertyDescriptor(){throw Error('SECRET-descriptor');}},
  }));
  events.length=0; assert.equal(descriptorFailure({reason:known,node:source}),false); assert.equal(events.length,0);
  const video = deployLockSource.match(/function finiteVideoPairCompatibility\([^\n]+\) \{[\s\S]*?\n\}/u)[0];
  const segments = [
    [video.slice(video.indexOf('    for (const key of new Set'), video.indexOf('    for (const key of projectedKeys)')), 'remaining-entry'],
    [video.match(/      site = 'projected-equality';\r?\n      if [^\n]+/u)[0], 'projected-equality'],
    [video.slice(video.indexOf("      let ingressReason;"), video.indexOf("    site = 'family'")), 'ingress-reason'],
    [video.slice(video.indexOf("    site = 'family'"), video.indexOf('  } catch')), 'family'],
  ];
  for (let [body, expected] of segments) {
    // The ingress snippet includes its original enclosing loop's closing brace.
    if (expected === 'ingress-reason') body = body.slice(0, body.lastIndexOf('    }'));
    events.length = 0;
    const reject = (error, reason) => { functions.emit(ts,current,old,candidate,previous,roots,'video',expected,error,key,reason); return false; };
    const family = deployLockSource.match(/function finiteVideoFamilyClosure\([^\n]+\) \{[\s\S]*?\n\}/u)[0];
    const execute = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 7), runInNewContext(`${family}; (()=>{let site,moduleKey; ${body}; return true;})`, {
      a:new Map(current), b:new Map(old), affected:new Set(), projected:[new Map(current).get(key),new Map(old).get(key)],
      ingress:{reason:'unproven'}, candidate:{constructors:{terms:{legacy:1}}}, rollback:{constructors:{terms:{legacy:2}}}, reject,
    }));
    assert.equal(execute(), false); assert.equal(events.length,1);
    assert.equal(JSON.parse(events[0].slice(events[0].indexOf(' ')+1)).site,expected);
  }
  const verifier = deployLockSource.match(/export async function verifyApplicationRollbackReaders\([^\n]+\) \{[\s\S]*?\n\}/u)[0];
  const order = ['finiteVideoPairCompatibility','finiteImageCapablePairCompatibility','finiteImageFirstPairCompatibility','finiteVoicePairCompatibility'];
  assert.ok(order.every((name,index)=> index===0 || verifier.indexOf(order[index-1])<verifier.indexOf(name)));
  if (verifier.includes('finiteSelectedGuidePairCompatibility')) assert.ok(verifier.indexOf(order.at(-1))<verifier.indexOf('finiteSelectedGuidePairCompatibility'));
});

test('private eager diagnostics identify the original initialization phase and shallow captured nodes without executing inputs', async t => {
  const ts = createRequire(import.meta.url)('typescript'), contexts = new WeakMap(), events = [];
  const collector = deployLockSource.match(/function rollbackReaderClosure\(ts, root, roots, vendorPackages\) \{[\s\S]*?\n\}/u)[0];
  const helper = deployLockSource.match(/function emitPrivateRollbackDiagnostic\([^\n]+\) \{[\s\S]*?\n\}/u)[0];
  const initialization = deployLockSource.slice(deployLockSource.indexOf('function finiteSelectedGuideInitializationTerms('),
    deployLockSource.indexOf('\nfunction finiteSelectedGuideDeclarationTerms('));
  const functions = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 8), runInNewContext(`${collector}; ${helper}; ${initialization};
    ({collect:rollbackReaderClosure, initialize:finiteSelectedGuideInitializationTerms, emit:emitPrivateRollbackDiagnostic})`, {
    resolve, relative, dirname, join, existsSync, readFileSync, builtinModules,
    rollbackProofContexts: contexts, APPLICATION_ROLLBACK_READERS: [],
    nodeUtilTypes: createRequire(import.meta.url)('node:util').types,
    console: { error: value => events.push(value) },
    rollbackCompatibilityUnknown() { throw Error('ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN'); },
  }));
  const parent = fileURLToPath(new URL('../../tmp/first-image/', import.meta.url)); await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, 'eager-diagnostic-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const candidate = join(directory, 'candidate'), previous = join(directory, 'previous'), roots = [['apps/reader.ts']];
  const collectPair = async (a, b, extra = {}, selectedRoots = roots) => {
    for (const [root, text] of [[candidate, a], [previous, b]]) {
      await mkdir(join(root, 'apps'), { recursive: true }); await writeFile(join(root, 'tsconfig.json'), '{}');
      await writeFile(join(root, 'apps/reader.ts'), text);
      for (const [file, body] of Object.entries(extra)) await writeFile(join(root, file), body);
    }
    const current = functions.collect(ts, candidate, selectedRoots), old = functions.collect(ts, previous, selectedRoots);
    return { current, old, left: contexts.get(current), right: contexts.get(old), roots: selectedRoots };
  };
  const refuse = (pair, phase, expectedModule) => {
    let failure;
    assert.throws(() => functions.initialize(ts, pair.left, pair.right, { current: pair.current, previous: pair.old }), error => {
      failure = error; return error.reason === 'SELECTED_GUIDE_EAGER_INITIALIZATION_UNKNOWN';
    });
    events.length = 0;
    functions.emit(ts, pair.current, pair.old, candidate, previous, pair.roots, 'selected-guide', 'model', failure);
    assert.equal(events.length, 1);
    const output = JSON.parse(events[0].slice(events[0].indexOf(' ') + 1));
    if (expectedModule) assert.equal(output.module, expectedModule);
    assert.equal(output.initializationSite, phase);
    return { failure, output };
  };
  // Original collector is the only context writer; custom roots do not prove
  // installed DEFAULT compatibility. Candidate initializer bodies never run.
  await t.test('retained and added pure declarations keep their original acceptance', async () => {
    const pair = await collectPair('export const retained = 1; export const added = [2, 3];', 'export const retained = 1;');
    events.length = 0;
    assert.equal(functions.initialize(ts, pair.left, pair.right, { current: pair.current, previous: pair.old }).status, 'conditional');
    assert.equal(events.length, 0);
  });
  await t.test('retained declaration refusal', async () => {
    const pair = await collectPair('export const value = 2;', 'export const value = 1;');
    assert.equal(refuse(pair, 'retained-declaration').output.module, 'module:apps/reader.ts');
  });
  await t.test('added initializer refusal', async () => {
    const pair = await collectPair('export const value = globalThis.SECRET_probe();', '');
    assert.equal(refuse(pair, 'added-declaration').output.module, 'module:apps/reader.ts');
  });
  await t.test('equal modules still refuse changed eager order with unknown effects', async () => {
    const imports = ["import './a.js';", "import './b.js';"];
    const pair = await collectPair(imports.join('\n'), [...imports].reverse().join('\n'), {
      'apps/a.ts': 'export const a = globalThis.SECRET_probe();',
      'apps/b.ts': 'export const b = globalThis.SECRET_probe();',
    });
    for (const key of ['module:apps/a.ts', 'module:apps/b.ts'])
      assert.equal(JSON.stringify(new Map(pair.current).get(key)), JSON.stringify(new Map(pair.old).get(key)));
    const moved = refuse(pair, 'moved-initializer');
    assert.match(moved.output.module, /^module:apps\/[ab]\.ts$/u);
    assert.equal(JSON.stringify(moved.output).includes('SECRET'), false);
  });
  await t.test('shallow captured node is not starved by a large later function', async () => {
    // The old depth-first walk exhausts its unchanged 100000-node budget in
    // this later function before reaching the earlier failing declaration.
    const ballast = `export function ballast() { return [${'0,'.repeat(100010)}0]; }`;
    const pair = await collectPair(`export const value = 2;\n${ballast}`, `export const value = 1;\n${ballast}`);
    const node = pair.left.modules.get(resolve(candidate, 'apps/reader.ts')).statements[0].declarationList.declarations[0];
    events.length = 0;
    functions.emit(ts, pair.current, pair.old, candidate, previous, roots, 'selected-guide', 'model', {
      reason: 'SELECTED_GUIDE_EAGER_INITIALIZATION_UNKNOWN', node,
    });
    assert.equal(JSON.parse(events[0].slice(events[0].indexOf(' ') + 1)).module, 'module:apps/reader.ts');
  });
  await t.test('large first module cannot hide a second module while deep targets still obey the original budget', async () => {
    const ballast = `export function ballast() { return [${'0,'.repeat(100010)}0]; }`;
    const pair = await collectPair('export const value = 2;', 'export const value = 1;',
      { 'apps/ballast.ts': ballast }, [['apps/ballast.ts'], ['apps/reader.ts']]);
    assert.equal([...pair.left.modules.keys()][0], resolve(candidate, 'apps/ballast.ts'));
    refuse(pair, 'retained-declaration', 'module:apps/reader.ts');
    const parsed = pair.left.modules.get(resolve(candidate, 'apps/ballast.ts'));
    const node = parsed.statements[0].body.statements[0].expression.elements.at(-1);
    events.length = 0;
    functions.emit(ts, pair.current, pair.old, candidate, previous, pair.roots, 'selected-guide', 'model', {
      reason: 'SELECTED_GUIDE_EAGER_INITIALIZATION_UNKNOWN', node,
    });
    const output = JSON.parse(events[0].slice(events[0].indexOf(' ') + 1));
    assert.equal(output.module, undefined, 'budget exhaustion must omit attribution, never guess it');
    assert.equal(JSON.stringify(output).includes('ballast'), false);
  });
});

test('selected entry may reach an old captured pure module without borrowing an old entry loading premise', async t => {
  const ts = createRequire(import.meta.url)('typescript'), contexts = new WeakMap(), events = [];
  const collector = deployLockSource.match(/function rollbackReaderClosure\(ts, root, roots, vendorPackages\) \{[\s\S]*?\n\}/u)[0];
  const diagnostic = deployLockSource.match(/function emitPrivateRollbackDiagnostic\([^\n]+\) \{[\s\S]*?\n\}/u)[0];
  const initialization = deployLockSource.slice(deployLockSource.indexOf('function finiteSelectedGuideInitializationTerms('),
    deployLockSource.indexOf('\nfunction finiteSelectedGuideDeclarationTerms('));
  const functions = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 9), runInNewContext(`${collector}; ${initialization}; ${diagnostic};
    ({collect:rollbackReaderClosure, initialize:finiteSelectedGuideInitializationTerms, emit:emitPrivateRollbackDiagnostic})`, {
    resolve, relative, dirname, join, existsSync, readFileSync, builtinModules,
    rollbackProofContexts: contexts, APPLICATION_ROLLBACK_READERS: [], Script,
    nodeUtilTypes: createRequire(import.meta.url)('node:util').types, console: { error: value => events.push(value) },
    rollbackCompatibilityUnknown() { throw Error('ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN'); },
  }));
  const parent = fileURLToPath(new URL('../../tmp/first-image/', import.meta.url)); await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, 'entry-reachability-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const candidate = join(directory, 'candidate'), previous = join(directory, 'previous');
  const roots = [['apps/reader.ts'], ['apps/extra.ts'], ['apps/old-a.ts'], ['apps/old-b.ts']];
  const pair = async (moduleText, a = "import './extra.js';", b = '') => {
    for (const [root, entry] of [[candidate, a], [previous, b]]) {
      await mkdir(join(root, 'apps'), { recursive: true }); await writeFile(join(root, 'tsconfig.json'), '{}');
      await writeFile(join(root, 'apps/reader.ts'), entry);
      await writeFile(join(root, 'apps/extra.ts'), typeof moduleText === 'string' ? moduleText : moduleText[root === candidate ? 0 : 1]);
      for (const file of ['old-a', 'old-b']) await writeFile(join(root, `apps/${file}.ts`), 'export const old = globalThis.NEVER_EXECUTE();');
    }
    const current = functions.collect(ts, candidate, roots), old = functions.collect(ts, previous, roots);
    return { current, old, left: contexts.get(current), right: contexts.get(old) };
  };
  const check = value => functions.initialize(ts, value.left, value.right, { current: value.current, previous: value.old });
  await t.test('natural collector original independent entry gains only an existing pure module', async () => {
    const value = await pair('const object = () => ({}); export function helper() { return object(); }');
    const key = 'module:apps/extra.ts';
    assert.equal(JSON.stringify(new Map(value.current).get(key)), JSON.stringify(new Map(value.old).get(key)));
    const result = check(value);
    assert.equal(result.status, 'conditional');
    assert.ok(result.moved.has('apps/extra.ts'));
    for (const [context, root] of [[value.left, candidate], [value.right, previous]])
      assert.ok(result.cycleInitializers.some(item => item.source === context.modules.get(resolve(root, 'apps/extra.ts'))));
  });
  await t.test('valid deferred literals include the actual review literal and never execute their body', async () => {
    const actual = ts.createSourceFile('generated-image-review.ts',
      readFileSync(new URL('../../apps/agent-worker/src/presentation/generated-image-review.ts', import.meta.url), 'utf8'), ts.ScriptTarget.ES2022, true);
    let token;
    const visit = node => {
      if (ts.isRegularExpressionLiteral(node) && node.text === '/^[a-f0-9]{64}$/u') token = node.getText(actual);
      ts.forEachChild(node, visit);
    }; visit(actual); assert.ok(token, 'the actual paired review source must supply this token');
    for (const text of [`export function helper() { globalThis.NEVER_EXECUTE(); return ${token}; }`,
      'export const unused = () => /[a-z]+/iu;',
      'export class Value { unused() { return /[a-z]+/iu; } }',
      "export function unused() { return new RegExp('[', 'u'); }",
      'export const text = "/a/z is text, not a literal";']) {
      const value = await pair(text);
      assert.equal(check(value).status, 'conditional');
    }
  });
  for (const [name, text] of [
    ['unknown eager call', 'export const value = globalThis.NEVER_EXECUTE();'],
    ['getter', 'export const value = { get hidden() { return globalThis.NEVER_EXECUTE(); } };'],
    ['class static block', 'export class Value { static { globalThis.NEVER_EXECUTE(); } }'],
    ['retained invalid RegExp constructor', "export const value = new RegExp('[', 'u');"],
    ['retained constructor nested inside data', "export const value = { pattern: new RegExp('[', 'u') };"],
    ['retained regex nested inside data', 'export const value = [/a/u];'],
    ['retained invalid regex literal', 'export const value = /[z-a]/u;'],
    ['invalid regex in an uncalled function', 'export function unused() { return /[z-a]/u; }'],
    ['invalid regex in an uncalled arrow', 'export const unused = () => /[z-a]/u;'],
    ['invalid regex in an uncalled class method', 'export class Value { unused() { return /[z-a]/u; } }'],
    ['duplicate flags in a deferred literal', 'export function unused() { return /a/gg; }'],
    ['unknown flag in a deferred literal', 'export function unused() { return /a/z; }'],
  ]) await t.test(`newly reachable ${name} still refuses even if both module fingerprints match`, async () => {
    const value = await pair(text), key = 'module:apps/extra.ts';
    assert.equal(JSON.stringify(new Map(value.current).get(key)), JSON.stringify(new Map(value.old).get(key)));
    assert.throws(() => check(value), error => error.reason === 'SELECTED_GUIDE_EAGER_INITIALIZATION_UNKNOWN');
  });
  await t.test('old entry cannot lose a module even when it is pure', async () => {
    const value = await pair('export const value = 1;', '', "import './extra.js';");
    assert.throws(() => check(value), error => error.reason === 'SELECTED_GUIDE_EAGER_INITIALIZATION_UNKNOWN'
      && error.initializationSite === 'graph-order');
  });
  await t.test('new pure reachability cannot hide reordered old unknown effects', async () => {
    const value = await pair('export const value = 1;', "import './old-b.js'; import './extra.js'; import './old-a.js';",
      "import './old-a.js'; import './old-b.js';");
    assert.throws(() => check(value), error => error.reason === 'SELECTED_GUIDE_EAGER_INITIALIZATION_UNKNOWN'
      && error.initializationSite === 'moved-initializer');
  });
  await t.test('the rollback emitted source is independently syntax checked', async () => {
    const value = await pair(['export function helper() { return /ok/u; }', 'export function helper() { return /[z-a]/u; }']);
    assert.throws(() => check(value), error => error.reason === 'SELECTED_GUIDE_EAGER_INITIALIZATION_UNKNOWN'
      && error.node === value.right.modules.get(resolve(previous, 'apps/extra.ts')));
  });
  await t.test('parser failure reports only the original captured module and fixed reason', async () => {
    const value = await pair('export function unused() { return /[z-a]SECRET/u; }');
    let failure;
    assert.throws(() => check(value), error => {
      failure = error; return error.reason === 'SELECTED_GUIDE_EAGER_INITIALIZATION_UNKNOWN'
        && error.node === value.left.modules.get(resolve(candidate, 'apps/extra.ts'));
    });
    events.length = 0;
    functions.emit(ts, value.current, value.old, candidate, previous, roots, 'selected-guide', 'model', failure);
    assert.equal(events.length, 1);
    assert.equal(JSON.parse(events[0].slice(events[0].indexOf(' ') + 1)).module, 'module:apps/extra.ts');
    assert.doesNotMatch(events[0], /SECRET|\[z-a\]|SyntaxError|regular expression|candidate|previous/u);
  });
  await t.test('already reachable moved initializers retain the original loading premise', async () => {
    const value = await pair('export const retained = /a/u;', "import './old-a.js'; import './extra.js';",
      "import './extra.js'; import './old-a.js';");
    const result = check(value);
    assert.equal(result.status, 'conditional'); assert.ok(result.moved.has('apps/extra.ts'));
  });
  await t.test('new reachability never waives external loading order', async () => {
    // Synthetic metadata only, no installed/copied/executed external runtime.
    // The original collector reads these exact manifests itself.
    for (const root of [candidate, previous]) for (const name of ['fixture-alpha', 'fixture-beta']) {
      const directory = join(root, 'apps/node_modules', name); await mkdir(directory, { recursive: true });
      await writeFile(join(directory, 'package.json'), JSON.stringify({ name, version: '0.0.0' }));
    }
    const extraExternal = await pair("import 'fixture-alpha'; export const value = 1;");
    assert.throws(() => check(extraExternal), error => error.reason === 'SELECTED_GUIDE_EAGER_INITIALIZATION_UNKNOWN'
      && error.initializationSite === 'graph-order');
    const reordered = await pair('export const value = 1;',
      "import 'fixture-beta'; import './extra.js'; import 'fixture-alpha';",
      "import 'fixture-alpha'; import 'fixture-beta';");
    assert.throws(() => check(reordered), error => error.reason === 'SELECTED_GUIDE_EAGER_INITIALIZATION_UNKNOWN'
      && error.initializationSite === 'graph-order');
  });
});

test('rollback verifier diagnostics are opt-in, bounded and preserve rejection', async () => {
  const verifierSource = deployLockSource.match(/export async function verifyApplicationRollbackReaders\([^\n]+\) \{[\s\S]*?\n\}/u)?.[0];
  assert.ok(verifierSource);
  const events = [], failure = new Error('private-connection-and-paper-content');
  let rejectDiagnosticOutput = false;
  failure.code = 'MODULE_NOT_FOUND';
  failure.stack = `Error: ${failure.message}\n    at unrelated (/private-user/secret-path:900:2)`;
  const verify = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 10), runInNewContext(`${verifierSource.replace('export ', '')}; verifyApplicationRollbackReaders`, {
    APPLICATION_ROLLBACK_READERS: [], APPLICATION_ROLLBACK_ROOTS: {}, resolve, join,
    VERIFIER_SOURCE_URL: new URL('./production-deploy-lock.mjs', import.meta.url).href,
    createRequire() { throw failure; },
    console: { error(value) { if (rejectDiagnosticOutput) throw Error('private-log-sink-failure'); events.push(value); } },
    rollbackCompatibilityUnknown() { throw Error('ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN'); },
  }));
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
  const verify=(videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 11), runInNewContext(`${verifierSource.replace('export ','')}; verifyApplicationRollbackReaders`,{
    APPLICATION_ROLLBACK_READERS:roots,APPLICATION_ROLLBACK_ROOTS:{},resolve,join,dirname,
    createRequire(){return ()=>({});},
    rollbackReaderClosure(_ts,root,selected){events.push(['collect',root,selected]);return root===resolve('/candidate')?current:equal?current:previous;},
    finiteVideoPairCompatibility(...args){events.push(['video',...args]);return accept==='video';},
    finiteImageCapablePairCompatibility(...args){events.push(['capable',...args]);return accept==='capable';},
    finiteImageFirstPairCompatibility(...args){events.push(['first',...args]);return accept==='first';},
    finiteVoicePairCompatibility(...args){events.push(['voice',...args]);return accept==='voice';},
    finiteSdfReadablePairCompatibility(...args){events.push(['sdf',...args]);return accept==='sdf';},
    finiteSelectedGuidePairCompatibility(...args){events.push(['selected',...args]);return accept==='selected';},
    rollbackCompatibilityUnknown(){throw Error('ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN');},
  }));
  for(const allowed of ['video','capable','first','voice','sdf','selected']){
    accept=allowed;events.length=0;
    await verify({candidateRoot:'/candidate',rollbackRoot:'/previous',roots});
    assert.deepEqual(events.slice(0,2).map(row=>row[0]),['collect','collect']);
    const attempted=events.slice(2);
    assert.deepEqual(attempted.map(row=>row[0]),['video','capable','first','voice','sdf','selected'].slice(0,['video','capable','first','voice','sdf','selected'].indexOf(allowed)+1));
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
  const describe = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 12), runInNewContext(`${helperSource}; rollbackComparisonDiagnostic`, { resolve }));
  const current = [['PRIVATE_KEY', 'PRIVATE_VALUE'], ...Array.from({ length: 16 }, (_, i) => [`module:packages/domain/src/reader${i}.ts`, 'PRIVATE_VALUE'])];
  const report = describe(current, [], '/candidate', '/rollback');
  assert.equal(report.differences, 17);
  assert.equal(report.entries.length, 16);
  assert.equal(report.truncated, true);
  assert.equal(report.entries[0].key, '[redacted-key]');
  assert.equal(report.entries[0].candidatePresent, true);
  assert.equal(report.entries[0].rollbackPresent, false);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE_KEY|PRIVATE_VALUE|candidateLength|jsonOffset/);
  const complete = describe(current.slice(1, 13), [], '/candidate', '/rollback');
  assert.equal(complete.differences, 12);
  assert.equal(complete.entries.length, 12);
  assert.equal(complete.truncated, false);
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
  const normalize = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 13), runInNewContext(`${helper}; const locationLiterals = new Map(); ${canonical}
    (file, root) => { locationLiterals.clear(); for (const [node, identity] of prismaSearchLocationLiterals(ts, file, root))
      locationLiterals.set(node, identity); return JSON.stringify(canonical(file)); }`, {
    ts, join, resolve, rollbackCompatibilityUnknown() { throw new Error('ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN'); },
  }));
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
  const prove = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 14), runInNewContext(`${proofSource}; provePrismaSearchConsumer`, {
    rollbackCompatibilityUnknown() { throw new Error('ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN'); },
  }));
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
    (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 15), runInNewContext(source, context));
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
  const functions = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 16), runInNewContext(`${proofSource}; ${metadataSource}; const locationLiterals = new Map(); ${canonicalSource};
    ({ prove: provePrismaSearchConsumer, metadata: prismaSearchLocationLiterals,
      normalized(file, literals) { locationLiterals.clear(); for (const [node, identity] of literals) locationLiterals.set(node, identity);
        return JSON.stringify(canonical(file)); } })`, {
    ts, join, resolve, rollbackCompatibilityUnknown() { throw new Error('ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN'); },
  }));
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
  const observed = pair.map(({ initializer }) => (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 17), runInNewContext(`(${initializer}).isBundled`)));
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
  const functions = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 18), runInNewContext(`${proofSource}; ${metadataSource}; const locationLiterals = new Map(); ${canonicalSource};
    ({ prove: provePrismaSearchConsumer, metadata: prismaSearchLocationLiterals,
      normalized(file, literals) { locationLiterals.clear(); for (const [node, identity] of literals) locationLiterals.set(node, identity);
        return JSON.stringify(canonical(file)); } })`, {
    ts, join, resolve, rollbackCompatibilityUnknown() { throw new Error('ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN'); },
  }));
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
  const observed = pair.map(({ initializer }) => (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 19), runInNewContext(`const config=${initializer}; ${extra} config.isBundled;`)));
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
  const prove = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 20), runInNewContext(`${proofSource}; provePrismaSearchConsumer`, {
    rollbackCompatibilityUnknown() { throw new Error('ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN'); },
  }));
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
  videoTimeoutObservation('history-request', 0);
  if (historicalVideoSources.has(sourceRef)) { videoTimeoutObservation('history-hit', 0); } else { videoTimeoutObservation('history-load-begin', 0); }
  if (historicalVideoSources.has(sourceRef)) return historicalVideoSources.get(sourceRef);
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', '-z', sourceRef, '--', 'apps', 'packages'],
    { cwd: projectRoot, encoding: 'utf8' }).split('\0').filter(file =>
    /\/src\/.*\.(?:[cm]?[jt]sx?)$/u.test(file) || /\/package\.json$/u.test(file)
      || /^apps\/web\//u.test(file) && /\.(?:[cm]?[jt]sx?|json|css)$/u.test(file));
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
  videoTimeoutCount('cacheEntries');
  videoTimeoutCount('cacheCharacters', [...sources.values()].reduce((sum, text) => sum + text.length, 0));
  videoTimeoutObservation('history-load-end', 0, { inventoryCount: files.length, sourceCount: sources.size });
  return result;
}

async function videoIngressProgram(changes = new Map(), { sourceRef, trackedSourceOnly = false, ambientSources = new Map() } = {}) {
  const observedRequest = videoTimeoutCount('programRequested');
  videoTimeoutObservation('program-request', observedRequest, { mutationCount: changes.size, historicalInput: sourceRef ? 1 : 0 });
  try {

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
  videoTimeoutObservation('host-ready', observedRequest, { rootCount: tracked.length, mutationCount: changedFiles.length });
  videoTimeoutObservation('createProgram-begin', observedRequest);
  const program = ts.createProgram([...new Set([...tracked, ...changedFiles.map(item => item.filename)])], options, host);
  videoTimeoutObservation('createProgram-end', observedRequest, { sourceCount: program.getSourceFiles().length });
  videoTimeoutObservation('validation-begin', observedRequest);

  assert.equal(program.getSyntacticDiagnostics().length, 0, 'actual Program must parse before a source-proof result');
  if (historical) for (const file of program.getSourceFiles().filter(file => ownsSource(file.fileName)))
    assert.equal(file.text, overlays.get(key(file.fileName)) ?? historical.sources.get(key(file.fileName))
      ?? (!trackedSourceOnly ? ambient.get(key(file.fileName)) : undefined),
      'historical Program must contain only selected baseline bytes plus exact mutations or declared ambient inputs');
  for (const item of changedFiles) assert.equal(program.getSourceFiles().find(file => key(file.fileName) === key(item.filename))?.text,
    item.updated, 'the real Program must contain the exact mutation before testing its rejection');
  videoTimeoutObservation('validation-end', observedRequest);
  videoTimeoutCount('programReturned');
  videoTimeoutObservation('program-return', observedRequest);
  return { ts, program, projectRoot, sourceHost: host,
    resolveSource: (specifier, containingFile) => host.resolveModuleNames([specifier], containingFile)[0] };

  } catch (error) { videoTimeoutObservation('program-throw', observedRequest); throw error; }
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
  return (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 21), runInNewContext(`${component}; ({ constructors: finiteVideoConstructorTerms, model: finiteVideoSourceModel, closure: finiteVideoFamilyClosure,
    pair: finiteVideoPairCompatibility, roots: APPLICATION_ROLLBACK_READERS })`, { relative, resolve, rollbackProofContexts: new WeakMap(), APPLICATION_ROLLBACK_READERS: [] }));
}

function videoPairContext({ ts, program, projectRoot }) { videoTimeoutObservation('checker-begin', 0);  const observedContext = { ts, program, checker: (videoTimeoutObservation('checker-call-begin'), program.getTypeChecker()), root: projectRoot }; videoTimeoutObservation('checker-end', 0); return observedContext;  }

function videoPairRuntime(ts, text) {
  // Extract the one actual collector canonical, including its reviewed unary
  // correction. This source-component comparison never fabricates a successful
  // production collector or a complete installed root.
  const canonicalText = deployLockSource.slice(deployLockSource.indexOf('  const canonical = node => {'),
    deployLockSource.indexOf('\n  const addConfiguration =', deployLockSource.indexOf('  const canonical = node => {')));
  const canonical = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 22), runInNewContext(`${canonicalText}; canonical`, { ts, locationLiterals: new Map() }));
  const compiled = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true } });
  return JSON.parse(JSON.stringify(canonical(ts.createSourceFile('runtime.js', compiled.outputText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS))));
}

function sdfReadableSourceComponents() {
  const component = deployLockSource.slice(deployLockSource.indexOf('function finiteVideoConstructorTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  return (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 23), runInNewContext(`${component}; ({ model: typeof finiteSdfReadableSourceModel === 'function' ? finiteSdfReadableSourceModel : undefined,
    pair: typeof finiteSdfReadablePairCompatibility === 'function' ? finiteSdfReadablePairCompatibility : undefined, defaultRoots: APPLICATION_ROLLBACK_READERS })`,
    { resolve, relative, builtinModules, rollbackProofContexts: new WeakMap(), APPLICATION_ROLLBACK_READERS: [] }));
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
  return (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 24), runInNewContext(`${component}; ({ model: finiteVoiceSourceModel, writer: finiteVoiceWriterSourceModel, formatReader: typeof finiteVoiceFormatReaderSourceModel === 'function' ? finiteVoiceFormatReaderSourceModel : undefined, formatWriter: typeof finiteVoiceFormatWriterSourceModel === 'function' ? finiteVoiceFormatWriterSourceModel : undefined, pair: finiteVoicePairCompatibility, defaultRoots: APPLICATION_ROLLBACK_READERS })`,
    { resolve, relative, builtinModules, rollbackProofContexts: new WeakMap(), APPLICATION_ROLLBACK_READERS: [] }));
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

const releasedVoiceWavWriterSource = { sourceRef: 'a9ff2332ff1b8646467edfa09628f625d6c27a1c', trackedSourceOnly: true };

test('voice WAV writer source projects actual W to the published WAV reader without collector authority', async () => {
  const methods = voicePairSourceComponents(), actual = await videoIngressProgram(new Map(), releasedVoiceWavWriterSource);
  const previous = await videoIngressProgram(new Map(), releasedVoiceFormatReaderSource);
  const context = { ...videoPairContext(actual), canonical: node => videoPairRuntime(actual.ts, node.getText()) };
  let model;
  try { model = (methods.formatWriter ?? methods.formatReader)(actual.ts, context, videoPairContext(previous), voiceSourceEntries(actual), voiceSourceEntries(previous)); }
  catch (error) { assert.fail(`${error.reason ?? error.message} ${error.node?.getText?.().slice(0, 120) ?? ''}`); }
  assert.equal(model.phase, 'format-writer');
  assert.equal(model.projected.size, 1);
  for (const [path, value] of model.projected) assert.deepEqual(videoPairRuntime(actual.ts, value.text),
    videoPairRuntime(previous.ts, previous.program.getSourceFile(resolve(previous.projectRoot, path)).text), path);
  for (const roots of [[], methods.defaultRoots]) assert.equal(methods.pair(actual.ts, voiceSourceEntries(actual), voiceSourceEntries(previous), actual.projectRoot, previous.projectRoot, roots), false);
});

test('voice WAV writer rejects invalid format flows and retains strict adjacent reader entries', async t => {
  const methods = voicePairSourceComponents(), worker = 'apps/agent-worker/src/voice.ts';
  const gateway = 'packages/ai-gateway/src/synclip-audio-api.ts', voice = 'packages/domain/src/agent/voice.ts';
  const previous = await videoIngressProgram(new Map(), releasedVoiceFormatReaderSource);
  const cases = [
    ['shared decoder bypass', gateway, text => text.replace('const audio = validateHermesVoiceAudioBytes(bytes);', "const audio = { bytes, format: 'wav', contentType: 'audio/wav' } as const;"), true],
    ['shared incomplete bytes', gateway, text => text.replace('format.decode(Buffer.concat(chunks, size), contentType)', 'format.decode(Buffer.concat(chunks.slice(0, 1)), contentType)'), true],
    ['wrong put MIME', worker, text => text.replace('{ contentType: audio.contentType, sha256 }', "{ contentType: 'audio/mpeg', sha256 }")],
    ['wrong receipt MIME', worker, text => text.replace('bytes: audio.bytes.length, contentType: audio.contentType', "bytes: audio.bytes.length, contentType: 'audio/mpeg'")],
    ['wrong suffix', worker, text => text.replace('${sha256}.${audio.format}', '${sha256}.mp3')],
    ['wrong digest bytes', worker, text => text.replace('sha256HexBuffer(audio.bytes)', 'sha256HexBuffer(Buffer.alloc(2))')],
    ['wrong receipt bytes', worker, text => text.replace('bytes: audio.bytes.length, contentType: audio.contentType', 'bytes: audio.bytes.length - 1, contentType: audio.contentType')],
    ['wrong owner key', worker, text => text.replace('${originalIdentity.userId}/${originalIdentity.taskId}', '${originalIdentity.taskId}/${originalIdentity.taskId}')],
    ['lost storage await', worker, text => text.replace('await deps.storage.putObject(objectKey, audio.bytes', 'void deps.storage.putObject(objectKey, audio.bytes')],
    ['receipt rewrite', worker, text => text.replace('          try {', "          storedAudio.contentType = 'audio/mpeg' as never;\n          try {")],
    ['saved receipt shadow', worker, text => text.replace('          try {', '          await (async (storedAudio) => {\n          try {').replace(/            throw error;\r?\n          \}/u,
      "$&\n          })({ objectKey: `derived/hermes-voice/${originalIdentity.userId}/${originalIdentity.taskId}/${'b'.repeat(64)}.wav`, sha256: 'b'.repeat(64), bytes: 48, contentType: 'audio/wav' as const });")],
    ['lost late discard', worker, text => text.replace('await rememberDiscardedTaskResult(deps.prisma, originalIdentity.taskId, { hermesVoice: { audio: storedAudio } });', 'void storedAudio;')],
    ['current identity replaces original', worker, text => text.replaceAll('saveHermesVoiceCheckpoint(deps, originalIdentity,', 'saveHermesVoiceCheckpoint(deps, execution.identity,')],
    ['shared fresh injection', worker, text => text.replace('    if (!checkpoint) {', "    if (!checkpoint) { options.downloadAudio = async () => ({ bytes: Buffer.alloc(48), format: 'mp3', contentType: 'audio/mpeg' });"), true],
    ['shared extra saved caller', voice, text => `${text}\nexport async function extraWavCaller(deps, prepared, received) { return saveHermesVoiceCheckpoint(deps, prepared.identity, { phase: 'submitted', ...received }); }\n`, true],
    ['shared production injection', 'apps/agent-worker/src/index.ts', text => text.replace('createHermesVoiceHandlers(options.voiceRuntime)', 'createHermesVoiceHandlers(options.voiceRuntime, { downloadAudio: undefined })'), true],
  ];
  for (const [name, path, mutate, both] of cases) await t.test(name, async () => {
    const actual = await videoIngressProgram(new Map([[path, mutate]]), releasedVoiceWavWriterSource);
    const old = both ? await videoIngressProgram(new Map([[path, mutate]]), releasedVoiceFormatReaderSource) : previous;
    const context = { ...videoPairContext(actual), canonical: node => videoPairRuntime(actual.ts, node.getText()) };
    assert.throws(() => methods.formatWriter(actual.ts, context, videoPairContext(old), voiceSourceEntries(actual), voiceSourceEntries(old)),
      error => typeof error.reason === 'string' && error.reason.startsWith('VOICE_WAV_'), name);
  });
  const actual = await videoIngressProgram(new Map(), releasedVoiceWavWriterSource);
  const context = { ...videoPairContext(actual), canonical: node => videoPairRuntime(actual.ts, node.getText()) };
  const mp3 = await videoIngressProgram(new Map(), { sourceRef: '676650c78313ac8cfe39eaf029a6eeebe71824de' });
  assert.throws(() => methods.formatWriter(actual.ts, context, videoPairContext(mp3), voiceSourceEntries(actual), voiceSourceEntries(mp3)),
    error => typeof error.reason === 'string' && error.reason.startsWith('VOICE_WAV_'), 'actual old MP3 rollback cannot receive W');
  assert.throws(() => methods.formatWriter(actual.ts, context, videoPairContext(previous),
    [...voiceSourceEntries(actual), ['module:packages/new/src/runtime.ts', []]], voiceSourceEntries(previous)),
  error => error.reason === 'VOICE_WAV_RESIDUAL_ENTRY_CHANGED');
});

test('voice WAV writer rejects shared reader default evaluation', async () => {
  const methods = voicePairSourceComponents(), path = 'packages/domain/src/agent/voice.ts';
  const mutation = new Map([[path, text => text.replace('function validAudio(audio: unknown)', 'function validAudio(audio: unknown = globalThis)')]]);
  const actual = await videoIngressProgram(mutation, releasedVoiceWavWriterSource);
  const previous = await videoIngressProgram(mutation, releasedVoiceFormatReaderSource);
  const context = { ...videoPairContext(actual), canonical: node => videoPairRuntime(actual.ts, node.getText()) };
  assert.throws(() => methods.formatWriter(actual.ts, context, videoPairContext(previous), voiceSourceEntries(actual), voiceSourceEntries(previous)),
    error => error.reason === 'VOICE_WAV_WAV_READER_SIGNATURE_CHANGED');
});

test('voice WAV writer rejects both High transport boundary counterexamples', async t => {
  const methods = voicePairSourceComponents(), path = 'packages/ai-gateway/src/synclip-audio-api.ts';
  const cases = [
    ['shared transport kernel rebinding', text => `${text}\ndownloadAudio = (async () => ({ bytes: Buffer.alloc(48), format: 'wav', contentType: 'audio/wav' })) as typeof downloadAudio;\n`, 'VOICE_WAV_KERNEL_CAPABILITY_ESCAPE'],
    ['shared output options default removal', text => text.replace('export async function downloadHermesVoiceAudio(task: SynclipAudioTask, options: SynclipAudioDownloadOptions = {})',
      'export async function downloadHermesVoiceAudio(task: SynclipAudioTask, options: SynclipAudioDownloadOptions)'), 'VOICE_WAV_DECODER_SIGNATURE_CHANGED'],
  ];
  for (const [name, mutate, reason] of cases) await t.test(name, async () => {
    const mutation = new Map([[path, text => { const changed = mutate(text); assert.notEqual(changed, text, name); return changed; }]]);
    const actual = await videoIngressProgram(mutation, releasedVoiceWavWriterSource);
    const previous = await videoIngressProgram(mutation, releasedVoiceFormatReaderSource);
    const context = { ...videoPairContext(actual), canonical: node => videoPairRuntime(actual.ts, node.getText()) };
    let model, rejection;
    try { model = methods.formatWriter(actual.ts, context, videoPairContext(previous), voiceSourceEntries(actual), voiceSourceEntries(previous)); }
    catch (error) { rejection = error; }
    assert.ok(rejection, `${name}: actual both-root mutation was accepted as ${model?.phase}`);
    assert.equal(rejection.reason, reason);
  });
});

test('voice WAV writer rejects shared MP3 validator rebinding', async () => {
  const methods = voicePairSourceComponents(), path = 'packages/ai-gateway/src/synclip-audio-api.ts';
  const mutation = new Map([[path, text => `${text}\nvalidateSynclipAudioBytes = ((bytes: Buffer) => ({ bytes, format: 'mp3', contentType: 'audio/mpeg' })) as typeof validateSynclipAudioBytes;\n`]]);
  const actual = await videoIngressProgram(mutation, releasedVoiceWavWriterSource);
  const previous = await videoIngressProgram(mutation, releasedVoiceFormatReaderSource);
  const context = { ...videoPairContext(actual), canonical: node => videoPairRuntime(actual.ts, node.getText()) };
  let model, rejection;
  try { model = methods.formatWriter(actual.ts, context, videoPairContext(previous), voiceSourceEntries(actual), voiceSourceEntries(previous)); }
  catch (error) { rejection = error; }
  assert.ok(rejection, `actual both-root MP3 validator mutation was accepted as ${model?.phase}`);
  assert.equal(rejection.reason, 'VOICE_WAV_MP3_CAPABILITY_ESCAPE');
});

// The pure selector theorem compares complete adjacent MP3 source families.
// CURRENT-format/selected-image additions belong to separate live regressions.
function retainedPureVoiceWriterProgram(changes = new Map(), options = {}) {
  return videoIngressProgram(changes, { ...options, sourceRef: '1c88ff813db128fd1933096a2f102c1c1c667b25' });
}

// These component regressions retain the complete approved format-reader source
// family; CURRENT and the independent combined/voice direction remain separate.
function retainedVoiceFormatProgram(changes = new Map(), options = {}) {
  return videoIngressProgram(changes, { sourceRef: 'ba276d8edccf163a8fb4e5a44655dd8ccf718eff', ...options });
}

test('voice format reader source reconstructs the actual previous MP3 runtime without granting collector authority', async () => {
  const methods = voicePairSourceComponents();
  const current = await retainedVoiceFormatProgram(new Map(), { trackedSourceOnly: true });
  const previous = await retainedVoiceFormatProgram(new Map(), { sourceRef: '1c88ff813db128fd1933096a2f102c1c1c667b25' });
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
  const previous = await retainedVoiceFormatProgram(new Map(), rollback);
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
    const candidate = await retainedVoiceFormatProgram(new Map([[path, mutate]]), { trackedSourceOnly: true });
    const old = both ? await retainedVoiceFormatProgram(new Map([[path, mutate]]), rollback) : previous;
    const context = { ...videoPairContext(candidate), canonical: node => videoPairRuntime(candidate.ts, node.getText()) };
    assert.throws(() => methods.formatReader(candidate.ts, context, videoPairContext(old), voiceSourceEntries(candidate), voiceSourceEntries(old)),
      error => typeof error.reason === 'string' && error.reason.startsWith('VOICE_MP3_'), name);
  });
  const actual = await retainedVoiceFormatProgram(new Map(), { trackedSourceOnly: true });
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
    const current = await retainedVoiceFormatProgram(new Map([[path, mutate]]), { trackedSourceOnly: true });
    const old = await retainedVoiceFormatProgram(new Map([[path, mutate]]), rollback);
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
  const previous = await retainedVoiceFormatProgram(new Map(), rollback);
  for (const [name, path, mutate, both] of cases) await t.test(name, async () => {
    const current = await retainedVoiceFormatProgram(new Map([[path, mutate]]), { trackedSourceOnly: true });
    const old = both ? await retainedVoiceFormatProgram(new Map([[path, mutate]]), rollback) : previous;
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
    const current = await retainedVoiceFormatProgram(new Map([[path, mutate]]), { trackedSourceOnly: true });
    const old = await retainedVoiceFormatProgram(new Map([[path, mutate]]), rollback);
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
  const current = await retainedVoiceFormatProgram(new Map([[path, shadow]]), { trackedSourceOnly: true });
  const previous = await retainedVoiceFormatProgram(new Map([[path, shadow]]), { sourceRef: '1c88ff813db128fd1933096a2f102c1c1c667b25' });
  const context = { ...videoPairContext(current), canonical: node => videoPairRuntime(current.ts, node.getText()) };
  assert.throws(() => methods.formatReader(current.ts, context, videoPairContext(previous), voiceSourceEntries(current), voiceSourceEntries(previous)),
    error => error.reason === 'VOICE_MP3_LOCAL_BINDING_CHANGED');
});

test('voice format reader closes module factory escapes without erasing decoder evaluation', async t => {
  const methods = voicePairSourceComponents(), rollback = { sourceRef: '1c88ff813db128fd1933096a2f102c1c1c667b25' };
  const previous = await retainedVoiceFormatProgram(new Map(), rollback);
  const cases = [
    ['module factory alias', 'apps/agent-worker/src/ingestion-parser.ts', text => text.replace('const loadRuntimeModule = createRequire(__filename);', 'const factoryAlias = createRequire; const loadRuntimeModule = factoryAlias(__filename);'), true],
    ['module namespace factory', 'apps/agent-worker/src/ingestion-parser.ts', text => text.replace("import { createRequire } from 'node:module';", "import * as nativeModule from 'node:module';").replace('createRequire(__filename)', 'nativeModule.createRequire(__filename)'), true],
    ['decoder extra evaluation', 'packages/ai-gateway/src/synclip-audio-api.ts', text => text.replace('format.decode(Buffer.concat(chunks, size), contentType)', 'format.decode(Buffer.concat(chunks, size), (Date.now(), contentType))')],
  ];
  for (const [name, path, mutate, both] of cases) await t.test(name, async () => {
    const current = await retainedVoiceFormatProgram(new Map([[path, mutate]]), { trackedSourceOnly: true });
    const old = both ? await retainedVoiceFormatProgram(new Map([[path, mutate]]), rollback) : previous;
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
  const writer = await retainedPureVoiceWriterProgram(new Map(), { trackedSourceOnly: true });
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
  const unsafeWriter = await retainedPureVoiceWriterProgram(new Map([['packages/domain/src/agent/agent.ts', privateGate]]), { trackedSourceOnly: true });
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
  const raw = await retainedPureVoiceWriterProgram(changes, { ambientSources });
  const get = value => value.program.getSourceFile(resolve(value.projectRoot, extra));
  assert.equal(get(raw)?.text, text, 'the explicitly declared ambient input must resolve in this complete historical writer');
  const file = raw.program.getSourceFile(resolve(raw.projectRoot, client));
  const imported = file.statements.find(node => raw.ts.isImportDeclaration(node)
    && node.moduleSpecifier.text === '../generated/voice-source-boundary.js');
  assert.ok(raw.program.getTypeChecker().getSymbolAtLocation(imported.moduleSpecifier)?.declarations
    ?.some(node => node.getSourceFile() === get(raw)), 'the real import must bind the extra JS before comparison');
  assert.throws(() => methods.writer(raw.ts, videoPairContext(raw), videoPairContext(reader), voiceSourceEntries(raw), voiceSourceEntries(reader)),
    error => error.reason === 'VOICE_WRITER_READER_CONTEXT_CHANGED');
  const scoped = await retainedPureVoiceWriterProgram(changes, { ambientSources, trackedSourceOnly: true });
  assert.equal(Boolean(get(scoped)), false, 'the source inventory must exclude ambient JS during resolution, not after comparison');
  assert.equal(get(reader), undefined);
  assert.equal(methods.writer(scoped.ts, videoPairContext(scoped), videoPairContext(reader), voiceSourceEntries(scoped), voiceSourceEntries(reader)).phase, 'writer');
  const explicit = await retainedPureVoiceWriterProgram(new Map([...changes, [extra, text]]), { ambientSources, trackedSourceOnly: true });
  assert.equal(get(explicit)?.text, text, 'an explicit source mutation must remain visible even outside the tracked inventory');
  const explicitClient = explicit.program.getSourceFile(resolve(explicit.projectRoot, client));
  const explicitImport = explicitClient.statements.find(node => explicit.ts.isImportDeclaration(node)
    && node.moduleSpecifier.text === '../generated/voice-source-boundary.js');
  assert.ok(explicit.program.getTypeChecker().getSymbolAtLocation(explicitImport.moduleSpecifier)?.declarations
    ?.some(node => node.getSourceFile() === get(explicit)), 'the explicit new JS must bind the real import even in a scoped historical Program');
  assert.throws(() => methods.writer(explicit.ts, videoPairContext(explicit), videoPairContext(reader), voiceSourceEntries(explicit), voiceSourceEntries(reader)),
    error => error.reason === 'VOICE_WRITER_READER_CONTEXT_CHANGED');
  await assert.rejects(() => retainedPureVoiceWriterProgram(new Map([[extra, value => `${value}\nexport const another = 1;`]])),
    /mutation must target historical source/u);
  await assert.rejects(() => retainedPureVoiceWriterProgram(new Map(), { ambientSources: new Map([[client, text]]) }),
    /ambient input cannot replace tracked source/u);
  const history = historicalVideoSource(scoped.projectRoot, '1c88ff813db128fd1933096a2f102c1c1c667b25');
  assert.equal(file.text, changes.get(client)(history.sources.get(resolve(scoped.projectRoot, client).replaceAll('\\', '/').toLowerCase())));
  const filesystemOnly = execFileSync('git', ['ls-files', '-z', '--', 'packages'], { cwd: scoped.projectRoot, encoding: 'utf8' }).split('\0')
    .find(path => /^packages\/[^/]+\/test\/.*\.ts$/u.test(path) && existsSync(resolve(scoped.projectRoot, path))
      && !history.sources.has(resolve(scoped.projectRoot, path).replaceAll('\\', '/').toLowerCase()));
  assert.ok(filesystemOnly, 'use a real file outside the declared historical source inventory, without inventing a missing CURRENT source');
  assert.equal(scoped.sourceHost.fileExists(resolve(scoped.projectRoot, filesystemOnly)), false, 'historical host cannot fall through to a real undeclared file');
  assert.equal(scoped.sourceHost.readFile(resolve(scoped.projectRoot, filesystemOnly)), undefined);
  const agent = resolve(scoped.projectRoot, 'packages/domain/src/agent/agent.ts');
  assert.equal(scoped.sourceHost.readFile(agent), history.sources.get(agent.replaceAll('\\', '/').toLowerCase()));
  assert.notEqual(scoped.sourceHost.readFile(agent), readFileSync(agent, 'utf8'), 'changed CURRENT source bytes cannot replace the retained historical module');
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

function selectedGuideSourceComponents(sourceText = deployLockSource, { includeIllustrationWitness = true } = {}) {
  const start = sourceText.indexOf('function finiteSelectedGuideSupplementaryTerms(');
  assert.ok(start !== -1, 'the selected decoder proof must be implemented');
  const component = sourceText.slice(start, sourceText.indexOf('\nfunction rollbackComparisonDiagnostic(', start));
  const witnessExport = includeIllustrationWitness ? 'illustrationWitness: finiteSelectedGuideIllustrationWitness,' : '';
  return (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 25), runInNewContext(`${component}; ({ supplemental: finiteSelectedGuideSupplementaryTerms, decoder: finiteSelectedGuideDecoderTerms, fresh: finiteSelectedGuideFreshTerms,
    relocation: finiteSelectedGuideRelocationTerms, relocationResidual: finiteSelectedGuideRelocationResidualTerms,
    workspace: finiteSelectedGuideWorkspaceTerms, native: finiteSelectedGuideNativeTerms, handlers: finiteSelectedGuideHandlerTerms,
    illustration: finiteSelectedGuideIllustrationTerms, illustrationResidual: finiteSelectedGuideIllustrationResidualTerms,
    ${witnessExport}
    dormant: finiteSelectedGuideDormantModuleTerms, ingestion: finiteSelectedGuideIngestionReaderTerms, publicReader: finiteSelectedGuidePublicReaderTerms,
    agent: finiteSelectedGuideAgentResidualTerms,
    maintenanceWorker: finiteSelectedGuideMaintenanceWorkerTerms,
    maintenanceView: finiteSelectedGuideMaintenanceViewTerms,
    maintenanceQualification: finiteSelectedGuideMaintenanceQualificationTerms,
    maintenanceRemainder: finiteSelectedGuideMaintenanceRemainderTerms,
    maintenanceBooking: finiteSelectedGuideMaintenanceBookingTerms,
    sourceModel: finiteSelectedGuideSourceModel,
    sourceResidual: finiteSelectedGuideSourceResidual,
    resultOrigin: finiteSelectedGuideResultOriginTerms,
    pair: finiteSelectedGuidePairCompatibility,
    httpLibrary: finiteSelectedGuideApiLibraryTerms,
    initialization: finiteSelectedGuideInitializationTerms })`, { relative, resolve, isAbsolute, builtinModules,
      APPLICATION_ROLLBACK_READERS: [], rollbackProofContexts: new WeakMap(), Script }));
}

function selectedGuideSourceContext(actual) {
  const canonicalText = deployLockSource.slice(deployLockSource.indexOf('  const canonical = node => {'),
    deployLockSource.indexOf('\n  const addConfiguration =', deployLockSource.indexOf('  const canonical = node => {')));
  const canonical = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 26), runInNewContext(`${canonicalText}; canonical`, { ts: actual.ts, locationLiterals: new Map() }));
  return { ...videoPairContext(actual), canonical, sourceHost: actual.sourceHost, resolveSource: actual.resolveSource };
}

// Original selected-component positives and mutations use the same complete
// image4cc inventory and source host; they are not the live combined candidate.
function retainedSelectedGuideProgram(changes = new Map()) {
  return videoIngressProgram(changes, { sourceRef: '4cc78008f86da811aeb695b5d3639a5b52891d57' });
}

// Complete composed R2 source with the frozen ordinary-view correction.
// This is an actual-Program oracle, never a successful installed collector.
function capableSelectedGuideProgram(changes = new Map()) {
  const agent = 'packages/domain/src/agent/agent.ts';
  const overlay = new Map([[agent, readFileSync(new URL(`../../${agent}`, import.meta.url), 'utf8')]]);
  for (const [file, change] of changes) overlay.set(file, file === agent && typeof change === 'function' ? change(overlay.get(agent)) : change);
  return videoIngressProgram(overlay, { sourceRef: '852c6eaef9df6acbded36ff8194ff4e8392e65ea', trackedSourceOnly: true });
}

test('selected guide capable fresh closure binds the real changed booking callback and rejects rebound transaction effects', async () => {
  const components = selectedGuideSourceComponents();
  const previous = await videoIngressProgram(new Map(), { sourceRef: '5979840b31d6aa02e5350b0e63c8c2c8b049b133', trackedSourceOnly: true });
  const baseline = selectedGuideSourceContext(previous);
  const modelFor = actual => {
    const context = components.supplemental(actual.ts, selectedGuideSourceContext(actual), { ui: false });
    const old = components.supplemental(actual.ts, baseline, { ui: false });
    const decoder = components.decoder(actual.ts, context, old);
    return components.fresh(actual.ts, context, decoder, old);
  };
  const actual = await capableSelectedGuideProgram();
  let model;
  try { model = modelFor(actual); }
  catch (error) { assert.fail(`${error.reason}: ${error.node?.getText().slice(0, 100)}`); }
  assert.equal(model.status, 'conditional');
  assert.equal(model.fresh, 'legacy');
  for (const [file, change] of [
    ['packages/domain/src/assets/presentation-asset.ts', text => text.replace('const parentOwner = await tx.agentTask.findUnique(', 'const parentOwner = await tx.agentTask.deleteMany(')],
    ['packages/domain/src/assets/presentation-asset.ts', text => text.replace('const parentOwner = await tx.agentTask.findUnique(', 'const parentOwner = await deps.prisma.agentTask.findUnique(')],
    ['packages/domain/src/agent/agent.ts', text => text.replace('await beforePersist?.(tx);', 'await beforePersist?.(deps.prisma);')],
    ['packages/domain/src/agent/agent.ts', text => text.replace("if ((code === 'P2034' || idempotencyConflict) && attempt < 2)", "if ((code === 'P2034' || idempotencyConflict) && attempt < 3)")],
  ]) {
    const changed = await capableSelectedGuideProgram(new Map([[file, change]]));
    assert.throws(() => modelFor(changed), error => ['SELECTED_GUIDE_FRESH_WRITER_UNKNOWN', 'SELECTED_GUIDE_MAINTENANCE_BOOKING_UNKNOWN'].includes(error.reason));
  }
});

test('selected guide capable Worker effects bind actual claimed prefix and original failure CAS and reject early completed recovery', async () => {
  const components = selectedGuideSourceComponents();
  const previous = await videoIngressProgram(new Map(), { sourceRef: '5979840b31d6aa02e5350b0e63c8c2c8b049b133', trackedSourceOnly: true });
  const modelFor = actual => components.maintenanceWorker(actual.ts, selectedGuideSourceContext(actual), selectedGuideSourceContext(previous));
  const actual = await capableSelectedGuideProgram();
  let model;
  try { model = modelFor(actual); }
  catch (error) { assert.fail(`${error.reason}: ${error.node?.getText().slice(0, 100)}`); }
  assert.equal(model.status, 'conditional');
  assert.deepEqual(videoPairRuntime(actual.ts, model.ordinaryText), videoPairRuntime(previous.ts, model.previous.getText()));
  for (const [file, change] of [
    ['apps/agent-worker/src/presentation/handler.ts', text => text.replace('const parentRow = await deps.prisma.presentationAsset.findUnique(', 'const parentRow = await deps.prisma.presentationAsset.updateMany(')],
    ['apps/agent-worker/src/index.ts', text => text.replace('if (handlerCompleted && (e as', 'if (!handlerCompleted && (e as')],
    ['packages/domain/src/agent/agent.ts', text => text.replace('status: currentStatus,', "status: 'running',")],
  ]) {
    const changed = await capableSelectedGuideProgram(new Map([[file, change]]));
    assert.throws(() => modelFor(changed), error => error.reason === 'SELECTED_GUIDE_MAINTENANCE_WORKER_UNKNOWN');
  }
});

test('selected guide capable live view retains ordinary opaque rows and rejects lost selection or guessed children', async () => {
  const components = selectedGuideSourceComponents();
  const previous = await videoIngressProgram(new Map(), { sourceRef: '5979840b31d6aa02e5350b0e63c8c2c8b049b133', trackedSourceOnly: true });
  const modelFor = actual => components.maintenanceView(actual.ts, selectedGuideSourceContext(actual), selectedGuideSourceContext(previous));
  const actual = await capableSelectedGuideProgram();
  let model;
  try { model = modelFor(actual); }
  catch (error) { assert.fail(`${error.reason}: ${error.node?.getText().slice(0, 100)}`); }
  assert.equal(model.status, 'conditional');
  assert.equal(model.calls.length, 2);
  assert.deepEqual(videoPairRuntime(actual.ts, model.text), videoPairRuntime(previous.ts, model.previous.text));
  const file = 'packages/domain/src/agent/agent.ts';
  for (const change of [
    text => text.replace("if (!isJsonRecord(presentation) || !Object.hasOwn(presentation, 'selectedImageAssetId')) return view;", ''),
    text => text.replace('guideTaskId: task.id }), { isolationLevel:', 'guideTaskId: task.sessionId }), { isolationLevel:'),
    text => text.replace("nextSteps: [{ intent: 'open-task', targetId: child.id,", "nextSteps: [{ intent: 'open-task', targetId: task.id,"),
  ]) {
    const changed = await capableSelectedGuideProgram(new Map([[file, change]]));
    assert.throws(() => modelFor(changed), error => error.reason === 'SELECTED_GUIDE_MAINTENANCE_VIEW_UNKNOWN');
  }
});

test('selected guide capable qualifications bind actor paid checkpoint source and exact child body', async () => {
  const components = selectedGuideSourceComponents();
  const previous = await videoIngressProgram(new Map(), { sourceRef: '5979840b31d6aa02e5350b0e63c8c2c8b049b133', trackedSourceOnly: true });
  const modelFor = actual => components.maintenanceQualification(actual.ts, selectedGuideSourceContext(actual), selectedGuideSourceContext(previous));
  const actual = await capableSelectedGuideProgram();
  let model;
  try { model = modelFor(actual); }
  catch (error) { assert.fail(`${error.reason}: ${error.node?.getText().slice(0, 100)}`); }
  assert.equal(model.status, 'conditional');
  assert.equal(model.roles.length, 3);
  const file = 'packages/domain/src/assets/presentation-asset.ts';
  for (const change of [
    text => text.replace('session.userId !== input.userId', 'session.userId === input.userId'),
    text => text.replace("cp.state !== 'completed'", "cp.state !== 'started'"),
    text => text.replace('storyboardAssetId: input.guideTaskId, sceneIndex: 0', 'storyboardAssetId: child.id, sceneIndex: 0'),
    text => text.replace('nativeAgentTerminalResult, requireNativeIllustrationTerminalSource, requireNativeAgentExecutionAuthority',
      'nativeAgentTerminalResult, requireNativeIllustrationTerminalSource')
      + "\nimport { isDirectNativeVideoStoryboard as requireNativeAgentExecutionAuthority } from './presentation-asset';\n",
  ]) {
    const changed = await capableSelectedGuideProgram(new Map([[file, change]]));
    assert.throws(() => modelFor(changed), error => error.reason === 'SELECTED_GUIDE_MAINTENANCE_QUALIFICATION_UNKNOWN');
  }
});

test('selected guide capable full remainder retains readers and closes dormant aliases namespaces and activation', async () => {
  const components = selectedGuideSourceComponents();
  const previous = await videoIngressProgram(new Map(), { sourceRef: '5979840b31d6aa02e5350b0e63c8c2c8b049b133', trackedSourceOnly: true });
  const old = selectedGuideSourceContext(previous);
  const modelFor = actual => {
    const current = selectedGuideSourceContext(actual);
    const models = { booking: components.maintenanceBooking(actual.ts, current, old), worker: components.maintenanceWorker(actual.ts, current, old),
      view: components.maintenanceView(actual.ts, current, old), qualification: components.maintenanceQualification(actual.ts, current, old) };
    return components.maintenanceRemainder(actual.ts, current, old, models);
  };
  const actual = await capableSelectedGuideProgram();
  let model;
  try { model = modelFor(actual); }
  catch (error) { assert.fail(`${error.reason}: ${error.node?.getText().slice(0, 150)}`); }
  assert.equal(model.status, 'conditional');
  assert.equal(model.projected.size, 6);
  for (const value of model.projected.values()) assert.deepEqual(videoPairRuntime(actual.ts, value.text), videoPairRuntime(previous.ts, value.previous.text));
  for (const [file, change] of [
    ['apps/agent-worker/src/workspace-guide.ts', text => text + '\nprepareSelectedImageGeneration({} as never, {} as never);\n'],
    ['packages/domain/src/agent/workspace-guide-contract.ts', text => text.replace("'selectedImageAssetId'", "'lostSelectedImageAssetId'")],
    ['apps/agent-worker/src/workspace-guide.ts', text => text + "\nimport * as escapedGuide from './workspace-guide'; export const leakedNamespace = escapedGuide;\n"],
    ['packages/domain/src/agent/workspace-guide-contract.ts', text => text.replace('const text = masked.trim()', "globalThis.stolenGoal = goal; const text = masked.trim()")],
    ['packages/domain/src/agent/workspace-guide-contract.ts', text => "import { isExplicitFirstImageRequest as Boolean } from './workspace-guide-contract';\n" + text],
    ['packages/domain/src/agent/workspace-guide-contract.ts', text => text.replace('export function selectedImageProductionIntent(', 'export async function selectedImageProductionIntent(')],
    ['packages/domain/src/agent/workspace-guide-contract.ts', text => text.replace('const quotePairs:', "import Boolean = require('effectful-module'); const quotePairs:")],
  ]) {
    const changed = await capableSelectedGuideProgram(new Map([[file, change]]));
    assert.throws(() => modelFor(changed), error => ['SELECTED_GUIDE_MAINTENANCE_REMAINDER_UNKNOWN',
      'SELECTED_GUIDE_MAINTENANCE_QUALIFICATION_UNKNOWN'].includes(error.reason));
  }
});

test('selected guide actual capable maintenance composes the complete retained-state source without minting an installed permit', async () => {
  const components = selectedGuideSourceComponents();
  const previous = await videoIngressProgram(new Map(), { sourceRef: '5979840b31d6aa02e5350b0e63c8c2c8b049b133', trackedSourceOnly: true });
  const actual = await capableSelectedGuideProgram();
  // These two real source entries are analysis inputs, never DEFAULT collector
  // membership. The historical helper does not supply the infra reader corpus.
  const roots = [['apps/agent-worker/src/index.ts'], ['packages/domain/src/agent/first-image-continuation.ts']];
  const contextFor = owner => {
    const context = selectedGuideSourceContext(owner);
    for (const [entry] of roots) {
      const source = owner.program.getSourceFile(resolve(owner.projectRoot, entry));
      assert.ok(source && !source.isDeclarationFile, `the full actual Program must supply ${entry}`);
      assert.equal(source.text, owner.sourceHost.readFile(source.fileName));
    }
    return { ...context, roots };
  };
  const baseline = contextFor(previous);
  let model;
  try { model = components.sourceModel(actual.ts, contextFor(actual), baseline); }
  catch (error) { assert.fail(`${error.reason}/${error.initializationSite ?? ''}: ${relative(actual.projectRoot, error.node?.getSourceFile().fileName ?? '')}`); }
  assert.equal(model.status, 'conditional');
  assert.equal(model.projected.size, 6);
  assert.equal(model.fresh.fresh, 'legacy');
  assert.equal(model.origin.domain, 'authenticated-ordinary-opaque-and-capable-selected-retained');
  assert.deepEqual(Array.from(model.initialization.ordering, value => value.entry), roots.map(([entry]) => entry));
  for (const value of model.initialization.ordering) assert.equal(JSON.stringify(value.before.external), JSON.stringify(value.after.external), value.entry);
  for (const [key, value] of model.projected) {
    assert.equal(value.source, actual.program.getSourceFile(resolve(actual.projectRoot, key)));
    assert.deepEqual(videoPairRuntime(actual.ts, value.text), videoPairRuntime(previous.ts, value.previous.text));
  }
  assert.equal(components.pair(actual.ts, [], [], actual.projectRoot, previous.projectRoot, []), false);
  const agent = 'packages/domain/src/agent/agent.ts';
  const originalImport = "import { isDirectNativeVideoStoryboard, isOrdinaryNativeVideoStoryboardRevision, parsePresentationGenerationPayload, requireStoryboardBase } from '../assets/presentation-asset';";
  const mergedImport = originalImport.replace('requireStoryboardBase }', 'requireStoryboardBase, readSelectedImageGenerationChild }');
  const early = await capableSelectedGuideProgram(new Map([[agent, text => {
    assert.equal(text.split(mergedImport).length, 2);
    const retained = text.replace(mergedImport, originalImport);
    const anchor = "import { isDeepStrictEqual } from 'node:util';";
    assert.equal(retained.split(anchor).length, 2);
    const newline = retained.includes('\r\n') ? '\r\n' : '\n';
    return retained.replace(anchor, `${anchor}${newline}import { readSelectedImageGenerationChild } from '../assets/presentation-asset';`);
  }]]));
  assert.throws(() => components.sourceModel(early.ts, contextFor(early), baseline), error =>
    error.reason === 'SELECTED_GUIDE_EAGER_INITIALIZATION_UNKNOWN' && error.initializationSite === 'graph-order'
      && error.node === early.program.getSourceFile(resolve(early.projectRoot, roots[1][0])));
  const api = 'apps/api/src/routes/agent.ts';
  const activated = await capableSelectedGuideProgram(new Map([[api, text => text.replace('parseWorkspaceGuidePayload, requireSelectedImageSource',
    'parseWorkspaceGuidePayload, readWorkspaceGuidePayloadWithSelectedImage, requireSelectedImageSource')
    .replace('return parseWorkspaceGuidePayload(payload);', 'return readWorkspaceGuidePayloadWithSelectedImage(payload);')]]));
  assert.throws(() => components.sourceModel(activated.ts, contextFor(activated), baseline), error =>
    ['SELECTED_GUIDE_MAINTENANCE_ACTIVATION_UNKNOWN', 'SELECTED_GUIDE_FRESH_WRITER_UNKNOWN',
      'SELECTED_GUIDE_EAGER_INITIALIZATION_UNKNOWN'].includes(error.reason)
      && error.node?.getSourceFile().fileName.replaceAll('\\', '/').endsWith(api));
  const loss = await capableSelectedGuideProgram(new Map([['packages/domain/src/agent/workspace-guide-contract.ts', text =>
    text.replace('export function readWorkspaceGuidePayloadWithSelectedImage(', 'export function lostWorkspaceGuidePayloadWithSelectedImage(')]]));
  assert.throws(() => components.sourceModel(loss.ts, contextFor(loss), baseline), error => error.reason === 'SELECTED_GUIDE_LEGACY_DECODER_CHANGED');
});

// Complete selected+voice transition, independent of later SDF additions.
function retainedSelectedVoiceProgram(changes = new Map()) {
  return videoIngressProgram(changes, { sourceRef: '2ad0aa1b103797dd9f86a005ff3c33050b33ff54', trackedSourceOnly: true });
}

test('Chinese reader actual 291 Program keeps the unmodelled booking frontier closed', async () => {
  assert.equal(typeof selectedGuideSourceComponents().illustrationWitness, 'function', 'the current default source must keep its real wrapper witness');
  const components = selectedGuideSourceComponents(execFileSync('git', ['show',
    '291d934f1d58f8ee2309ee7b4e5dcfd3b0d2c063:infra/scripts/production-deploy-lock.mjs'], { cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8' }), { includeIllustrationWitness: false });
  const ref = '291d934f1d58f8ee2309ee7b4e5dcfd3b0d2c063';
  const path = 'packages/domain/src/assets/presentation-asset.ts';
  const previous = await videoIngressProgram(new Map(), { sourceRef: ref, trackedSourceOnly: true });
  const actual = await videoIngressProgram(new Map([[path, readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')]]),
    { sourceRef: ref, trackedSourceOnly: true });
  const roots = [['apps/agent-worker/src/index.ts'], ['packages/domain/src/agent/first-image-continuation.ts']];
  const contextFor = owner => {
    for (const [entry] of roots) assert.equal(owner.program.getSourceFile(resolve(owner.projectRoot, entry)).text,
      owner.sourceHost.readFile(resolve(owner.projectRoot, entry)));
    return { ...selectedGuideSourceContext(owner), roots };
  };
  let frontier;
  try { components.sourceModel(actual.ts, contextFor(actual), contextFor(previous)); }
  catch (error) { frontier = error; }
  assert.equal(frontier?.reason, 'SELECTED_GUIDE_MAINTENANCE_BOOKING_UNKNOWN');
  const source = actual.program.getSourceFile(resolve(actual.projectRoot, path));
  assert.equal(frontier.node.getSourceFile(), source);
  assert.match(frontier.node.getText(), /Selected-image production intent is required for a new child/u);
  let qualification;
  try { components.maintenanceQualification(actual.ts,
    components.supplemental(actual.ts, contextFor(actual), { ui: false }),
    components.supplemental(previous.ts, contextFor(previous), { ui: false })); }
  catch (error) { qualification = error; }
  assert.equal(qualification?.reason, 'SELECTED_GUIDE_MAINTENANCE_QUALIFICATION_UNKNOWN');
  assert.equal(qualification.node.getSourceFile(), source);
  assert.equal(qualification.node.name.text, 'requireSelectedImageGuideProduction');
  assert.equal(components.pair(actual.ts, [], [], actual.projectRoot, previous.projectRoot, []), false);
  const point = source.getLineAndCharacterOfPosition(frontier.node.getStart());
  console.log(JSON.stringify({ readerStage: ref, sourceOnly: true, permit: false,
    reason: frontier.reason, qualification: qualification.reason, path, line: point.line + 1,
    frontier: 'existing locked selected-child guard now contains the separately preserved production-intent refusal' }));
});

test('Chinese reader whole separation reconstructs the existing 291 guard and retained state', async () => {
  const components = selectedGuideSourceComponents();
  const options = { sourceRef: '291d934f1d58f8ee2309ee7b4e5dcfd3b0d2c063', trackedSourceOnly: true };
  const path = 'packages/domain/src/assets/presentation-asset.ts';
  const previous = await videoIngressProgram(new Map(), options);
  const actual = await videoIngressProgram(new Map([[path, readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')]]), options);
  const roots = [['apps/agent-worker/src/index.ts'], ['packages/domain/src/agent/first-image-continuation.ts']];
  const contextFor = owner => ({ ...selectedGuideSourceContext(owner), roots });
  let model;
  try { model = components.sourceModel(actual.ts, contextFor(actual), contextFor(previous)); }
  catch (error) {
    const node = error.node, parsed = node?.getSourceFile();
    console.log(JSON.stringify({ reason: error.reason, site: error.separationSite, error: error.message, effectSites: error.effectSites, originFacts: error.originFacts, originEvaluation: error.originEvaluation, unresolvedOrigins: error.unresolvedOrigins,
      path: parsed && relative(actual.projectRoot, parsed.fileName), line: node && parsed.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      term: node?.getText().slice(0, 250) }));
    assert.fail(JSON.stringify({ reason: error.reason ?? 'UNKNOWN', site: error.separationSite,
      path: parsed && relative(actual.projectRoot, parsed.fileName),
      line: node && parsed.getLineAndCharacterOfPosition(node.getStart()).line + 1 }));
  }
  assert.equal(model.status, 'conditional');
  assert.equal(model.projected.size, 1);
  const projected = model.projected.get(path);
  assert.equal(projected.source, actual.program.getSourceFile(resolve(actual.projectRoot, path)));
  assert.equal(projected.previous, previous.program.getSourceFile(resolve(previous.projectRoot, path)));
  assert.deepEqual(videoPairRuntime(actual.ts, projected.text), videoPairRuntime(previous.ts, projected.previous.text));
  assert.equal(model.fresh.fresh, 'legacy');
  assert.ok([...model.separation.effectFunctions].some(node => node.name?.text === 'requireSelectedImageSource'));
  assert.ok(model.separation.effectReads.length >= 10);
  assert.equal(model.origin.domain, 'old-admission-retained-plus-authentic-selected-read-extension');
  assert.equal(components.pair(actual.ts, [], [], actual.projectRoot, previous.projectRoot, []), false);
  assert.equal(components.pair(actual.ts, [], [], actual.projectRoot, previous.projectRoot, roots), false);
  console.log(JSON.stringify({ separation: 'whole-module-reconstruction', projected: model.projected.size,
    readonlyFunctions: model.separation.effectFunctions.size, databaseReads: model.separation.effectReads.length,
    referenceSites: model.separation.publicReferences.length, sourceOnlyPermit: false }));
});

test('Chinese reader separation refuses actual authority, effect and retained-state mutations', async t => {
  const components = selectedGuideSourceComponents();
  const ref = '291d934f1d58f8ee2309ee7b4e5dcfd3b0d2c063';
  const options = { sourceRef: ref, trackedSourceOnly: true };
  const path = 'packages/domain/src/assets/presentation-asset.ts', agent = 'packages/domain/src/agent/agent.ts';
  const native = 'packages/domain/src/agent/native-agent-execution.ts', worker = 'apps/agent-worker/src/index.ts';
  const current = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
  const previous = await videoIngressProgram(new Map(), options);
  const contextFor = owner => ({ ...selectedGuideSourceContext(owner),
    roots: [['apps/agent-worker/src/index.ts'], ['packages/domain/src/agent/first-image-continuation.ts']] });
  const oldContext = contextFor(previous);
  const once = (text, from, to) => { assert.equal(text.split(from).length, 2, `mutation target: ${from}`); return text.replace(from, to); };
  const check = "if (!selectedImageProductionIntent(selected.payload.goal))\n          throw new PresentationAssetError('VALIDATION_ERROR', 'Selected-image production intent is required for a new child');";
  const cases = [
    { id: 'remove intent', file: path, site: 'booking-insertion', change: text => once(text, check, '') },
    { id: 'invert intent', file: path, site: 'booking-insertion', change: text => once(text, '!selectedImageProductionIntent(selected.payload.goal)', 'selectedImageProductionIntent(selected.payload.goal)') },
    { id: 'wrong goal', file: path, site: 'booking-insertion', change: text => once(text, 'selectedImageProductionIntent(selected.payload.goal)', 'selectedImageProductionIntent(input.idempotencyKey)') },
    { id: 'callback bypass', file: path, site: 'booking-insertion', change: text => once(text, check, `if (false) { ${check} }`) },
    { id: 'wrong transaction', file: path, site: 'booking-insertion', change: text => once(text,
      'requireSelectedImageGuideParent(tx, { userId: input.userId, guideTaskId: parentOwner.id, executionAttempt: parentOwner.executionAttempt })',
      'requireSelectedImageGuideParent(deps.prisma, { userId: input.userId, guideTaskId: parentOwner.id, executionAttempt: parentOwner.executionAttempt })') },
    { id: 'weaken source checkpoint', file: path, site: 'reader-frame', change: text => once(text, "|| cp.state !== 'completed'", "|| false") },
    { id: 'wrong wrapper input', file: path, site: 'production-wrapper', change: text => once(text,
      'const authority = await readSelectedImageGuideProposal(tx, input);\n  return authority &&',
      'const authority = await readSelectedImageGuideProposal(tx, {} as never);\n  return authority &&') },
    { id: 'parent bypass', file: path, site: 'production-wrapper', change: text => once(text,
      'const authority = await readSelectedImageGuideProposal(tx, input);\n  if (!authority)',
      'const authority = await requireSelectedImageGuideProduction(tx, input);\n  if (!authority)') },
    { id: 'private shorthand escape', file: path, site: 'private-reference', change: text => `${text}\nexport const escaped = { readSelectedImageGuideProposal };\n` },
    { id: 'private namespace escape', file: path, site: 'private-reference', change: text => `${text}\nexport { readSelectedImageGuideProposal as leaked };\n` },
    { id: 'private default initializer', file: path, site: 'reader-frame', change: text => once(text,
      'readSelectedImageGuideProposal(tx: Prisma.TransactionClient, input:', 'readSelectedImageGuideProposal(tx: Prisma.TransactionClient = undefined as never, input:') },
    { id: 'private rest parameter', file: path, site: 'reader-frame', change: text => once(text,
      'readSelectedImageGuideProposal(tx: Prisma.TransactionClient, input: { userId: string; guideTaskId: string; executionAttempt?: number })',
      'readSelectedImageGuideProposal(...args: unknown[])') },
    { id: 'duplicate private declaration', file: path, site: 'source', change: text => `${text}\nasync function readSelectedImageGuideProposal() { globalThis.fetch(); }\n` },
    { id: 'late beforePersist charge', file: agent, reason: 'SELECTED_GUIDE_WRITER_ACTIVATION_UNKNOWN', change: text => {
      const pattern = /await beforePersist\?\.\(tx\);\s*return persistAgentTaskInTransaction\(deps, tx, persistenceInput, ctx\);/gu;
      assert.equal([...text.matchAll(pattern)].length, 1);
      return text.replace(pattern, 'const persisted = await persistAgentTaskInTransaction(deps, tx, persistenceInput, ctx);\n          await beforePersist?.(tx); return persisted;'); } },
    { id: 'lost failure attempt', file: worker, reason: 'SELECTED_GUIDE_WRITER_ACTIVATION_UNKNOWN', change: text => once(text,
      'expectedExecutionAttempt: claimed?.executionAttempt,', 'expectedExecutionAttempt: undefined,') },
    { id: 'claim epoch lost', file: agent, reason: 'SELECTED_GUIDE_WRITER_ACTIVATION_UNKNOWN', change: text => once(text,
      "data: { status: 'running', progress: 10, error: null, executionAttempt: { increment: 1 } }",
      "data: { status: 'running', progress: 10, error: null, executionAttempt: { increment: 0 } }") },
    { id: 'old admission widened', file: 'packages/domain/src/agent/workspace-guide-contract.ts', reason: 'SELECTED_GUIDE_WRITER_ACTIVATION_UNKNOWN',
      change: () => execFileSync('git', ['show', '2493c3d02a82beb8c0a01891ea5c7ceff08cc5a3:packages/domain/src/agent/workspace-guide-contract.ts'], { cwd: previous.projectRoot, encoding: 'utf8' }) },
    { id: 'writer activation hitchhike', file: 'apps/agent-worker/src/workspace-guide.ts', reason: 'SELECTED_GUIDE_WRITER_ACTIVATION_UNKNOWN',
      change: () => execFileSync('git', ['show', '2493c3d02a82beb8c0a01891ea5c7ceff08cc5a3:apps/agent-worker/src/workspace-guide.ts'], { cwd: previous.projectRoot, encoding: 'utf8' }) },
    { id: 'unrelated effect', file: path, site: 'whole-presentation', change: text => `${text}\nexport const unexpectedRuntime = Date.now();\n` },
    { id: 'paired retained CP omission', file: native, site: 'retained-rejection-transfer', paired: true,
      change: text => once(text, "'selectedImageReply', 'selectedImageDraft', 'sourceMapRef'", "'selectedImageReply', 'sourceMapRef'") },
    { id: 'paired failure discards result', file: agent, site: 'retained-rejection-transfer', paired: true,
      change: text => once(text, '...(result !== undefined ? { result: result as never } : {}),', 'result: null,') },
    { id: 'paired query write', file: 'packages/domain/src/assets/scene-image.ts', site: 'new-validation-effects', paired: true,
      change: text => once(text, 'const image = await tx.presentationAsset.findUnique({ where: { id: input.assetId }, include: { sourceClaims: true } });',
        'const image = await tx.presentationAsset.update({ where: { id: input.assetId }, data: {}, include: { sourceClaims: true } });') },
  ];
  for (const value of cases) await t.test(value.id, async () => {
    const base = value.file === path ? current : previous.program.getSourceFile(resolve(previous.projectRoot, value.file)).text;
    const changed = value.change(base); assert.notEqual(changed, base);
    const actual = await videoIngressProgram(new Map([[path, current], [value.file, changed]]), options);
    assert.equal(actual.program.getSourceFile(resolve(actual.projectRoot, value.file)).text, changed);
    const old = value.paired ? await videoIngressProgram(new Map([[value.file, changed]]), options) : previous;
    let refused;
    try { components.sourceModel(actual.ts, contextFor(actual), value.paired ? contextFor(old) : oldContext); }
    catch (error) { refused = error; }
    assert.ok(refused, 'an actual mutation cannot receive a successful whole model');
    assert.equal(refused.reason, value.reason ?? 'SELECTED_GUIDE_SAVED_READER_UNKNOWN');
    if (value.site) assert.equal(refused.separationSite, value.site);
    assert.ok(refused.node.getSourceFile() === actual.program.getSourceFile(resolve(actual.projectRoot, value.file)),
      `the refusal must bind the exact mutated SourceFile: ${value.file}`);
    console.log(JSON.stringify({ mutation: value.id, reason: refused.reason, site: refused.separationSite, actualSource: value.file }));
  });
});

test('Chinese reader newly evaluated effects cannot borrow a method name as purity', async t => {
  const components = selectedGuideSourceComponents();
  const options = { sourceRef: '291d934f1d58f8ee2309ee7b4e5dcfd3b0d2c063', trackedSourceOnly: true };
  const asset = 'packages/domain/src/assets/presentation-asset.ts', file = 'packages/domain/src/assets/scene-image.ts';
  const current = readFileSync(new URL(`../../${asset}`, import.meta.url), 'utf8');
  const original = await videoIngressProgram(new Map(), options);
  const base = original.program.getSourceFile(resolve(original.projectRoot, file)).text;
  const anchor = '  const version = await requirePresentationWriteScope(tx, input);';
  assert.equal(base.split(anchor).length, 2);
  const cases = [
    ['hidden get I/O', "  const remote = { get: globalThis.fetch }; await remote.get('https://example.invalid/never-called');\n", ''],
    ['named callback I/O', "  const remote = globalThis.fetch; [input.assetId].map(remote);\n", ''],
    ['global Set write', "  EXTRA_SET.add(input.assetId);\n", '\nconst EXTRA_SET = new Set<string>();\n'],
    ['global counter write', "  EXTRA_COUNTER++;\n", '\nlet EXTRA_COUNTER = 0;\n'],
    ['ambient method alias', "  const remote = globalThis as any; remote.get('never-called');\n", ''],
    ['getter returns I/O', "  const remote = { get get() { return globalThis.fetch; } }; remote.get('https://example.invalid/never-called');\n", ''],
  ];
  for (const [name, prefix, suffix] of cases) await t.test(name, async () => {
    const changed = base.replace(anchor, prefix + anchor) + suffix;
    const previous = await videoIngressProgram(new Map([[file, changed]]), options);
    const actual = await videoIngressProgram(new Map([[asset, current], [file, changed]]), options);
    const contextFor = owner => ({ ...selectedGuideSourceContext(owner),
      roots: [['apps/agent-worker/src/index.ts'], ['packages/domain/src/agent/first-image-continuation.ts']] });
    assert.equal(actual.program.getSourceFile(resolve(actual.projectRoot, file)).text, changed);
    let error;
    try { components.sourceModel(actual.ts, contextFor(actual), contextFor(previous)); }
    catch (caught) { error = caught; }
    assert.equal(error?.reason, 'SELECTED_GUIDE_SAVED_READER_UNKNOWN');
    assert.equal(error.separationSite, 'new-validation-effects');
    assert.ok(error.node.getSourceFile() === actual.program.getSourceFile(resolve(actual.projectRoot, file)),
      'the effect refusal must bind the exact mutated SourceFile');
  });
});

test('Chinese reader effect root and callee parameter execution cannot skip real writes', async t => {
  const components = selectedGuideSourceComponents();
  const options = { sourceRef: '291d934f1d58f8ee2309ee7b4e5dcfd3b0d2c063', trackedSourceOnly: true };
  const asset = 'packages/domain/src/assets/presentation-asset.ts', scene = 'packages/domain/src/assets/scene-image.ts';
  const current = readFileSync(new URL(`../../${asset}`, import.meta.url), 'utf8');
  const original = await videoIngressProgram(new Map(), options);
  const oldAsset = original.program.getSourceFile(resolve(original.projectRoot, asset)).text;
  const oldScene = original.program.getSourceFile(resolve(original.projectRoot, scene)).text;
  const cut = "if (reply.kind !== 'proposal') return undefined;";
  const oldCut = "if (reply.kind !== 'proposal' || !selectedImageProductionIntent(payload.goal)) return undefined;";
  const write = "await tx.agentTask.updateMany({ where: { id: task.id }, data: { error: 'reader-probe' } });";
  const sceneSignature = 'userId: string; researchObjectId: string; versionId: string; assetId: string;\n}) {';
  assert.equal(oldScene.split(sceneSignature).length, 2);
  const sceneWithDefault = oldScene.replace(sceneSignature,
    "userId: string; researchObjectId: string; versionId: string; assetId: string;\n}, unused = globalThis.fetch('https://example.invalid/never-called')) {");
  const cases = [
    { name: 'direct post-cut database write', file: asset,
      current: current.replace(cut, `${cut}\n  ${write}`), old: oldAsset.replace(oldCut, `${oldCut}\n  ${write}`), term: write.slice('await '.length, -1) },
    { name: 'omitted callee default performs I/O', file: scene,
      current: sceneWithDefault, old: sceneWithDefault, term: "globalThis.fetch('https://example.invalid/never-called')" },
    { name: 'post-cut ambient accessor cannot borrow plain data', file: asset,
      current: current.replace(cut, `${cut}\n  const ambient = globalThis as any; const unknownValue = ambient.value;`),
      old: oldAsset.replace(oldCut, `${oldCut}\n  const ambient = globalThis as any; const unknownValue = ambient.value;`), term: 'ambient.value' },
  ];
  const contextFor = owner => ({ ...selectedGuideSourceContext(owner),
    roots: [['apps/agent-worker/src/index.ts'], ['packages/domain/src/agent/first-image-continuation.ts']] });
  for (const value of cases) await t.test(value.name, async () => {
    const previous = await videoIngressProgram(new Map([[value.file, value.old]]), options);
    const actual = await videoIngressProgram(new Map([[asset, current], [value.file, value.current]]), options);
    assert.equal(actual.program.getSourceFile(resolve(actual.projectRoot, value.file)).text, value.current);
    assert.equal(previous.program.getSourceFile(resolve(previous.projectRoot, value.file)).text, value.old);
    let error;
    try { components.sourceModel(actual.ts, contextFor(actual), contextFor(previous)); }
    catch (caught) { error = caught; }
    assert.equal(error?.reason, 'SELECTED_GUIDE_SAVED_READER_UNKNOWN');
    assert.equal(error.separationSite, 'new-validation-effects');
    assert.ok(error.node.getSourceFile() === actual.program.getSourceFile(resolve(actual.projectRoot, value.file)), 'the actual offending source must bind');
    assert.equal(error.node.getText(), value.term);
  });
});

test('Chinese reader receiver origins survive owned return and supplied argument wrapping', async t => {
  const components = selectedGuideSourceComponents();
  const options = { sourceRef: '291d934f1d58f8ee2309ee7b4e5dcfd3b0d2c063', trackedSourceOnly: true };
  const asset = 'packages/domain/src/assets/presentation-asset.ts', file = 'packages/domain/src/assets/scene-image.ts';
  const current = readFileSync(new URL(`../../${asset}`, import.meta.url), 'utf8');
  const original = await videoIngressProgram(new Map(), options);
  const base = original.program.getSourceFile(resolve(original.projectRoot, file)).text;
  const anchor = '  const version = await requirePresentationWriteScope(tx, input);';
  assert.equal(base.split(anchor).length, 2);
  const cases = [
    ['owned return keeps ambient origin', "  const borrowed = () => globalThis as any; const remote = borrowed(); remote.get('never-called');\n", "remote.get('never-called')"],
    ['supplied parameter keeps ambient origin', "  const borrowed = (remote: any) => remote.get('never-called'); borrowed(globalThis);\n", "remote.get('never-called')"],
    ['Array.from retains ambient elements', "  Array.from([globalThis], remote => remote.get('never-called'));\n", "remote.get('never-called')"],
    ['Array.from preserves finite plain elements', "  const rendered = Array.from(['ink'], text => text.trim());\n", null],
    ['supplied unknown does not select omitted default', "  const borrowed = (remote: any = 'ink') => remote.trim(); borrowed(globalThis);\n", 'remote.trim()'],
    ['omission and guarded unknown keep primitive origin', "  const borrowed = (text = 'ink') => text.trim(); borrowed(); const length = (value: unknown) => typeof value === 'string' && value.length > 0; length(globalThis);\n", null],
  ];
  for (const [name, prefix, offending] of cases) await t.test(name, async () => {
    const changed = base.replace(anchor, prefix + anchor);
    const previous = await videoIngressProgram(new Map([[file, changed]]), options);
    const actual = await videoIngressProgram(new Map([[asset, current], [file, changed]]), options);
    assert.equal(actual.program.getSourceFile(resolve(actual.projectRoot, file)).text, changed);
    assert.equal(previous.program.getSourceFile(resolve(previous.projectRoot, file)).text, changed);
    const contextFor = owner => ({ ...selectedGuideSourceContext(owner),
      roots: [['apps/agent-worker/src/index.ts'], ['packages/domain/src/agent/first-image-continuation.ts']] });
    let error, model;
    try { model = components.sourceModel(actual.ts, contextFor(actual), contextFor(previous)); }
    catch (caught) { error = caught; }
    if (offending === null) {
      if (error) assert.fail(JSON.stringify({ reason: error.reason, site: error.separationSite,
        path: error.node?.getSourceFile().fileName, term: error.node?.getText().slice(0, 120) }));
      assert.equal(model.status, 'conditional');
      assert.equal(model.projected.size, 1);
      assert.equal(components.pair(actual.ts, [], [], actual.projectRoot, previous.projectRoot, []), false);
      return;
    }
    assert.equal(error?.reason, 'SELECTED_GUIDE_SAVED_READER_UNKNOWN');
    assert.equal(error.separationSite, 'new-validation-effects');
    assert.ok(error.node.getSourceFile() === actual.program.getSourceFile(resolve(actual.projectRoot, file)), 'origin refusal must bind actual mutation');
    assert.equal(error.node.getText(), offending);
  });
});

test('Chinese reader mutable allocations and implicit coercion retain actual effects', async t => {
  const components = selectedGuideSourceComponents();
  const options = { sourceRef: '291d934f1d58f8ee2309ee7b4e5dcfd3b0d2c063', trackedSourceOnly: true };
  const asset = 'packages/domain/src/assets/presentation-asset.ts', file = 'packages/domain/src/assets/scene-image.ts';
  const current = readFileSync(new URL(`../../${asset}`, import.meta.url), 'utf8');
  const original = await videoIngressProgram(new Map(), options);
  const base = original.program.getSourceFile(resolve(original.projectRoot, file)).text;
  const anchor = '  const version = await requirePresentationWriteScope(tx, input);';
  assert.equal(base.split(anchor).length, 2);
  const cases = [
    ['alias field mutation', "const holder: any = { value: new Map() }; const alias = holder; alias.value = globalThis; holder.value.get('never-called');", 'alias.value = globalThis'],
    ['supplied writer mutation', "const holder: any = { value: new Map() }; const write = (supplied: any) => { supplied.value = globalThis; }; write(holder); holder.value.get('never-called');", 'supplied.value = globalThis'],
    ['join implicit coercion', "const rendered = [{ toString: () => { (globalThis as any).readerProbe = 1; return 'ink'; } }]; rendered.join('');", "rendered.join('')"],
    ['default sort implicit coercion', "const rendered = [{ toString: () => { (globalThis as any).readerProbe = 1; return 'ink'; } }]; rendered.sort();", 'rendered.sort()'],
    ['separate harmless allocation and plain join', "const original = { value: new Map() }; const independent = { value: new Map() }; independent.value = new Map(); original.value.get('ink'); const rendered = ['ink', 'paper']; rendered.sort(); rendered.join(' ');", null],
  ];
  for (const [name, prefix, offending] of cases) await t.test(name, async () => {
    const changed = base.replace(anchor, `  ${prefix}\n${anchor}`);
    const previous = await videoIngressProgram(new Map([[file, changed]]), options);
    const actual = await videoIngressProgram(new Map([[asset, current], [file, changed]]), options);
    assert.equal(actual.program.getSourceFile(resolve(actual.projectRoot, file)).text, changed);
    assert.equal(previous.program.getSourceFile(resolve(previous.projectRoot, file)).text, changed);
    const contextFor = owner => ({ ...selectedGuideSourceContext(owner),
      roots: [['apps/agent-worker/src/index.ts'], ['packages/domain/src/agent/first-image-continuation.ts']] });
    let error, model;
    try { model = components.sourceModel(actual.ts, contextFor(actual), contextFor(previous)); } catch (caught) { error = caught; }
    if (offending === null) {
      if (error) assert.fail(JSON.stringify({ reason: error.reason, site: error.separationSite,
        path: error.node?.getSourceFile().fileName, term: error.node?.getText().slice(0, 140) }));
      assert.equal(model.status, 'conditional');
      assert.equal(components.pair(actual.ts, [], [], actual.projectRoot, previous.projectRoot, []), false);
    } else {
      assert.equal(error?.reason, 'SELECTED_GUIDE_SAVED_READER_UNKNOWN');
      assert.equal(error.separationSite, 'new-validation-effects');
      assert.ok(error.node.getSourceFile() === actual.program.getSourceFile(resolve(actual.projectRoot, file)), 'refusal binds actual mutated source');
      assert.equal(error.node.getText(), offending);
    }
  });
});

test('Chinese reader guarded task specialization retains actual object authority', async t => {
  const components = selectedGuideSourceComponents();
  const options = { sourceRef: '291d934f1d58f8ee2309ee7b4e5dcfd3b0d2c063', trackedSourceOnly: true };
  const asset = 'packages/domain/src/assets/presentation-asset.ts', file = 'packages/domain/src/assets/video.ts';
  const original = await videoIngressProgram(new Map(), options);
  const base = original.program.getSourceFile(resolve(original.projectRoot, file)).text;
  const current = readFileSync(new URL(`../../${asset}`, import.meta.url), 'utf8');
  const kind = "task.kind !== 'presentation.generate'";
  const call = 'await requireNativeIllustrationTerminalSource(prisma as Prisma.TransactionClient, task, async';
  assert.equal(base.split(kind).length, 2); assert.equal(base.split(call).length, 2);
  const cases = [
    ['missing kind guard', base.replace(` || ${kind}`, '')],
    ['inverted kind guard', base.replace(kind, "task.kind === 'presentation.generate'")],
    ['nonterminal kind guard', base.replace("throw new PresentationAssetError('VALIDATION_ERROR', 'Native video storyboard owner is not completed');", "new PresentationAssetError('VALIDATION_ERROR', 'Native video storyboard owner is not completed');")],
    ['wrong task argument', base.replace(call, 'await requireNativeIllustrationTerminalSource(prisma as Prisma.TransactionClient, { ...task, kind: undefined }, async')],
    ['aliased computed kind mutation', base.replace(call, "const escapedTask = task; escapedTask['kind'] = 'workspace.guide';\n    " + call)],
    ['opaque task escape', base.replace(call, '(globalThis as any).inspectTask(task);\n    ' + call)],
  ];
  for (const [name, changed] of cases) await t.test(name, async () => {
    assert.notEqual(changed, base);
    const previous = await videoIngressProgram(new Map([[file, changed]]), options);
    const actual = await videoIngressProgram(new Map([[asset, current], [file, changed]]), options);
    assert.equal(actual.program.getSourceFile(resolve(actual.projectRoot, file)).text, changed);
    assert.equal(previous.program.getSourceFile(resolve(previous.projectRoot, file)).text, changed);
    const contextFor = owner => ({ ...selectedGuideSourceContext(owner),
      roots: [['apps/agent-worker/src/index.ts'], ['packages/domain/src/agent/first-image-continuation.ts']] });
    let error;
    try { components.sourceModel(actual.ts, contextFor(actual), contextFor(previous)); } catch (caught) { error = caught; }
    assert.equal(error?.reason, 'SELECTED_GUIDE_SAVED_READER_UNKNOWN');
    assert.equal(error.separationSite, 'new-validation-effects');
    const errorSource = error.node.getSourceFile();
    const inVideo = errorSource === actual.program.getSourceFile(resolve(actual.projectRoot, file));
    const atUnprovedSource = errorSource === actual.program.getSourceFile(resolve(actual.projectRoot, 'packages/domain/src/agent/native-agent-execution.ts'))
      && error.node.getText().startsWith('requireSelectedImageSource(tx,');
    assert.ok(inVideo || atUnprovedSource, 'refusal must bind the actual changed guard/effect or its exact unproved recursive consumer');
  });
});

test('Chinese reader captured writes and genuine guide stay source bound', async t => {
  const components = selectedGuideSourceComponents();
  const options = { sourceRef: '291d934f1d58f8ee2309ee7b4e5dcfd3b0d2c063', trackedSourceOnly: true };
  const asset = 'packages/domain/src/assets/presentation-asset.ts', scene = 'packages/domain/src/assets/scene-image.ts', video = 'packages/domain/src/assets/video.ts';
  const original = await videoIngressProgram(new Map(), options);
  const base = original.program.getSourceFile(resolve(original.projectRoot, scene)).text;
  const oldVideo = original.program.getSourceFile(resolve(original.projectRoot, video)).text;
  const current = readFileSync(new URL(`../../${asset}`, import.meta.url), 'utf8');
  const anchor = '  const version = await requirePresentationWriteScope(tx, input);';
  const call = 'await requireNativeIllustrationTerminalSource(prisma as Prisma.TransactionClient, task, async';
  assert.equal(base.split(anchor).length, 2); assert.equal(oldVideo.split(call).length, 2);
  const cases = [
    ['captured container writer', scene, base.replace(anchor, "  const holder: any = [new Map(), new Map()]; holder.sort(() => { holder[0] = globalThis; return 0; }); holder[0].get('never-called');\n" + anchor), 'holder[0] = globalThis'],
    ['module intrinsic allocation is shared', scene, base.replace(anchor, '  EXTRA_MAPPED.sort();\n' + anchor) + "\nconst EXTRA_MAPPED = ['ink'].map(value => value);\n", 'EXTRA_MAPPED.sort()'],
    ['actual workspace guide retains selected source', video, oldVideo.replace(call, "await requireNativeIllustrationTerminalSource(prisma as Prisma.TransactionClient, { ...task, kind: 'workspace.guide' }, async"), null],
  ];
  for (const [name, file, changed, offending] of cases) await t.test(name, async () => {
    const previous = await videoIngressProgram(new Map([[file, changed]]), options);
    const actual = await videoIngressProgram(new Map([[asset, current], [file, changed]]), options);
    assert.equal(actual.program.getSourceFile(resolve(actual.projectRoot, file)).text, changed);
    assert.equal(previous.program.getSourceFile(resolve(previous.projectRoot, file)).text, changed);
    const contextFor = owner => ({ ...selectedGuideSourceContext(owner), roots: [['apps/agent-worker/src/index.ts'], ['packages/domain/src/agent/first-image-continuation.ts']] });
    let error, model;
    try { model = components.sourceModel(actual.ts, contextFor(actual), contextFor(previous)); } catch (caught) { error = caught; }
    console.log(JSON.stringify({ control: name, sourceRelation: model?.status, reason: error?.reason,
      site: error?.separationSite, term: error?.node?.getText().slice(0, 150) }));
    assert.equal(error?.reason, 'SELECTED_GUIDE_SAVED_READER_UNKNOWN');
    assert.equal(error.separationSite, 'new-validation-effects');
    if (offending) {
      assert.ok(error.node.getSourceFile() === actual.program.getSourceFile(resolve(actual.projectRoot, file)));
      assert.equal(error.node.getText(), offending);
    } else {
      assert.ok(error.node.getSourceFile() === actual.program.getSourceFile(resolve(actual.projectRoot, 'packages/domain/src/agent/native-agent-execution.ts')));
      assert.ok(error.node.getText().startsWith('requireSelectedImageSource(tx,'));
    }
  });
});

test('Chinese reader permutations preserve nested ownership and post-read origins', async t => {
  const components = selectedGuideSourceComponents();
  const options = { sourceRef: '291d934f1d58f8ee2309ee7b4e5dcfd3b0d2c063', trackedSourceOnly: true };
  const asset = 'packages/domain/src/assets/presentation-asset.ts', file = 'packages/domain/src/assets/scene-image.ts';
  const original = await videoIngressProgram(new Map(), options);
  const base = original.program.getSourceFile(resolve(original.projectRoot, file)).text;
  const current = readFileSync(new URL(`../../${asset}`, import.meta.url), 'utf8');
  const anchor = '  const version = await requirePresentationWriteScope(tx, input);';
  assert.equal(base.split(anchor).length, 2);
  const cases = [
    ['module nested permutation', 'SHARED[0].reverse();', "\nconst SHARED = ['ink'].map(() => [2, 1]);\n", 'SHARED[0].reverse()'],
    ['capability permutation', "const holder: any = [new Map(), globalThis]; holder.reverse(); holder[0].get('never-called');", '', 'holder.reverse()'],
    ['intrinsic method replacement', "const holder: any = ['ink']; holder.reverse = () => { (globalThis as any).probe = 1; return holder; }; holder.reverse();", '', 'holder.reverse = () => { (globalThis as any).probe = 1; return holder; }'],
    ['plain local permutation post-read', "const holder = [2, 1]; holder.reverse(); holder[0].toString(); const independent = [3, 4]; independent.sort(); holder.pop(); holder[0]?.toString();", '', null],
  ];
  for (const [name, prefix, suffix, offending] of cases) await t.test(name, async () => {
    const changed = base.replace(anchor, `  ${prefix}\n${anchor}`) + suffix;
    const previous = await videoIngressProgram(new Map([[file, changed]]), options);
    const actual = await videoIngressProgram(new Map([[asset, current], [file, changed]]), options);
    assert.equal(actual.program.getSourceFile(resolve(actual.projectRoot, file)).text, changed);
    assert.equal(previous.program.getSourceFile(resolve(previous.projectRoot, file)).text, changed);
    const contextFor = owner => ({ ...selectedGuideSourceContext(owner), roots: [['apps/agent-worker/src/index.ts'], ['packages/domain/src/agent/first-image-continuation.ts']] });
    let error, model;
    try { model = components.sourceModel(actual.ts, contextFor(actual), contextFor(previous)); } catch (caught) { error = caught; }
    console.log(JSON.stringify({ permutation: name, relation: model?.status, reason: error?.reason, site: error?.separationSite, term: error?.node?.getText().slice(0, 130) }));
    if (offending) {
      assert.equal(error?.reason, 'SELECTED_GUIDE_SAVED_READER_UNKNOWN');
      assert.equal(error.separationSite, 'new-validation-effects');
      assert.ok(error.node.getSourceFile() === actual.program.getSourceFile(resolve(actual.projectRoot, file)));
      assert.equal(error.node.getText(), offending);
    } else {
      if (error) assert.fail(JSON.stringify({ reason: error.reason, site: error.separationSite, term: error.node?.getText().slice(0, 130) }));
      assert.equal(model.status, 'conditional');
      assert.equal(components.pair(actual.ts, [], [], actual.projectRoot, previous.projectRoot, []), false);
    }
  });
});

test('Chinese reader module closure cannot retain unproved mutable lifetime', async () => {
  const components = selectedGuideSourceComponents();
  const options = { sourceRef: '291d934f1d58f8ee2309ee7b4e5dcfd3b0d2c063', trackedSourceOnly: true };
  const asset = 'packages/domain/src/assets/presentation-asset.ts', file = 'packages/domain/src/assets/scene-image.ts';
  const original = await videoIngressProgram(new Map(), options);
  const base = original.program.getSourceFile(resolve(original.projectRoot, file)).text;
  const current = readFileSync(new URL(`../../${asset}`, import.meta.url), 'utf8');
  const factory = '(() => { const held: number[][] = []; const read = () => held[0].reverse(); held.push([2, 1]); return read; })()';
  const changed = base.replace('  const version = await requirePresentationWriteScope(tx, input);',
    '  SHARED_FN();\n  const version = await requirePresentationWriteScope(tx, input);') + `\nconst SHARED_FN = ${factory};\n`;
  const previous = await videoIngressProgram(new Map([[file, changed]]), options);
  const actual = await videoIngressProgram(new Map([[asset, current], [file, changed]]), options);
  assert.equal(actual.program.getSourceFile(resolve(actual.projectRoot, file)).text, changed);
  assert.equal(previous.program.getSourceFile(resolve(previous.projectRoot, file)).text, changed);
  const contextFor = owner => ({ ...selectedGuideSourceContext(owner), roots: [['apps/agent-worker/src/index.ts'], ['packages/domain/src/agent/first-image-continuation.ts']] });
  let error, model;
  try { model = components.sourceModel(actual.ts, contextFor(actual), contextFor(previous)); } catch (caught) { error = caught; }
  console.log(JSON.stringify({ closure: 'late captured child allocation', relation: model?.status, reason: error?.reason, site: error?.separationSite, term: error?.node?.getText().slice(0, 220) }));
  assert.equal(error?.reason, 'SELECTED_GUIDE_SAVED_READER_UNKNOWN');
  assert.equal(error.separationSite, 'new-validation-effects');
  assert.ok(error.node.getSourceFile() === actual.program.getSourceFile(resolve(actual.projectRoot, file)));
  assert.equal(error.node.getText(), factory);
});

test('Chinese reader captured data escape retains actual mutation lifetime', async t => {
  const components = selectedGuideSourceComponents();
  const options = { sourceRef: '291d934f1d58f8ee2309ee7b4e5dcfd3b0d2c063', trackedSourceOnly: true };
  const asset = 'packages/domain/src/assets/presentation-asset.ts', file = 'packages/domain/src/assets/scene-image.ts';
  const original = await videoIngressProgram(new Map(), options);
  const base = original.program.getSourceFile(resolve(original.projectRoot, file)).text;
  const current = readFileSync(new URL(`../../${asset}`, import.meta.url), 'utf8');
  const anchor = '  const version = await requirePresentationWriteScope(tx, input);';
  assert.equal(base.split(anchor).length, 2);
  const factory = '(() => { const held: number[][] = []; const insert = () => { held.push([2, 1]); }; insert(); return held; })()';
  const cases = [
    ['captured child insertion', 'SHARED_DATA[0].reverse();', factory, factory],
    ['plain read-only data factory', 'SHARED_DATA[0].toString();', '(() => { const held = [2, 1]; return held; })()', null],
  ];
  for (const [name, prefix, initializer, offending] of cases) await t.test(name, async () => {
    const changed = base.replace(anchor, `  ${prefix}\n${anchor}`) + `\nconst SHARED_DATA = ${initializer};\n`;
    const previous = await videoIngressProgram(new Map([[file, changed]]), options);
    const actual = await videoIngressProgram(new Map([[asset, current], [file, changed]]), options);
    assert.equal(actual.program.getSourceFile(resolve(actual.projectRoot, file)).text, changed);
    assert.equal(previous.program.getSourceFile(resolve(previous.projectRoot, file)).text, changed);
    const contextFor = owner => ({ ...selectedGuideSourceContext(owner), roots: [['apps/agent-worker/src/index.ts'], ['packages/domain/src/agent/first-image-continuation.ts']] });
    let error, model;
    try { model = components.sourceModel(actual.ts, contextFor(actual), contextFor(previous)); } catch (caught) { error = caught; }
    console.log(JSON.stringify({ capturedData: name, relation: model?.status, reason: error?.reason,
      site: error?.separationSite, term: error?.node?.getText().slice(0, 220) }));
    if (offending) {
      assert.equal(error?.reason, 'SELECTED_GUIDE_SAVED_READER_UNKNOWN');
      assert.equal(error.separationSite, 'new-validation-effects');
      assert.ok(error.node.getSourceFile() === actual.program.getSourceFile(resolve(actual.projectRoot, file)));
      assert.equal(error.node.getText(), offending);
    } else {
      if (error) assert.fail(JSON.stringify({ reason: error.reason, site: error.separationSite, term: error.node?.getText().slice(0, 130) }));
      assert.equal(model.status, 'conditional');
      assert.equal(components.pair(actual.ts, [], [], actual.projectRoot, previous.projectRoot, []), false);
    }
  });
});

test('Chinese reader derived captured data cannot erase unresolved lifetime', async () => {
  const components = selectedGuideSourceComponents();
  const options = { sourceRef: '291d934f1d58f8ee2309ee7b4e5dcfd3b0d2c063', trackedSourceOnly: true };
  const asset = 'packages/domain/src/assets/presentation-asset.ts', file = 'packages/domain/src/assets/scene-image.ts';
  const original = await videoIngressProgram(new Map(), options);
  const base = original.program.getSourceFile(resolve(original.projectRoot, file)).text;
  const current = readFileSync(new URL(`../../${asset}`, import.meta.url), 'utf8');
  const factory = '(() => { const held: number[][] = []; const insert = () => { held.push([2, 1]); }; insert(); return held[0]; })()';
  const changed = base.replace('  const version = await requirePresentationWriteScope(tx, input);',
    '  SHARED_CHILD.reverse();\n  const version = await requirePresentationWriteScope(tx, input);') + `\nconst SHARED_CHILD = ${factory};\n`;
  const previous = await videoIngressProgram(new Map([[file, changed]]), options);
  const actual = await videoIngressProgram(new Map([[asset, current], [file, changed]]), options);
  assert.equal(actual.program.getSourceFile(resolve(actual.projectRoot, file)).text, changed);
  assert.equal(previous.program.getSourceFile(resolve(previous.projectRoot, file)).text, changed);
  const contextFor = owner => ({ ...selectedGuideSourceContext(owner), roots: [['apps/agent-worker/src/index.ts'], ['packages/domain/src/agent/first-image-continuation.ts']] });
  let error, model;
  try { model = components.sourceModel(actual.ts, contextFor(actual), contextFor(previous)); } catch (caught) { error = caught; }
  console.log(JSON.stringify({ capturedData: 'derived child escape', relation: model?.status, reason: error?.reason,
    site: error?.separationSite, term: error?.node?.getText().slice(0, 220) }));
  assert.equal(error?.reason, 'SELECTED_GUIDE_SAVED_READER_UNKNOWN');
  assert.equal(error.separationSite, 'new-validation-effects');
  assert.ok(error.node.getSourceFile() === actual.program.getSourceFile(resolve(actual.projectRoot, file)));
  assert.equal(error.node.getText(), factory);
});

test('selected guide supplementary writer input retains captured nodes and actual API and Drawer sources', async () => {
  const components = selectedGuideSourceComponents(), actual = await retainedSelectedGuideProgram();
  const narrow = actual.ts.createProgram([resolve(actual.projectRoot, 'apps/agent-worker/src/index.ts')],
    actual.program.getCompilerOptions(), actual.sourceHost);
  const captured = selectedGuideSourceContext({ ...actual, program: narrow });
  assert.equal(narrow.getSourceFile(resolve(actual.projectRoot, 'apps/api/src/routes/agent.ts')), undefined);
  assert.equal(narrow.getSourceFile(resolve(actual.projectRoot, 'apps/web/components/hermes/HermesAssistantDrawer.tsx')), undefined);
  let extra;
  try { extra = components.supplemental(actual.ts, captured); }
  catch (error) { assert.fail(`${error.reason}: ${error.node?.getSourceFile().fileName ?? ''}:${error.node?.getText().slice(0, 80) ?? ''}`); }
  assert.equal(extra.status, 'conditional');
  assert.equal(extra.originalContext, captured);
  assert.ok(extra.api.fileName.endsWith('apps/api/src/routes/agent.ts'));
  assert.ok(extra.drawer.fileName.endsWith('apps/web/components/hermes/HermesAssistantDrawer.tsx'));
  for (const source of narrow.getSourceFiles()) assert.equal(extra.program.getSourceFile(source.fileName), source);
  assert.equal(extra.api.text, actual.sourceHost.readFile(extra.api.fileName));
  assert.equal(extra.drawer.text, actual.sourceHost.readFile(extra.drawer.fileName));
  assert.ok(extra.apiEntry.fileName.endsWith('apps/api/src/index.ts'));
  assert.ok(extra.parserEntry.fileName.endsWith('apps/agent-worker/src/parser-acceptance-runner.ts'));
  assert.ok(extra.outstanding.length > 0, 'supplemental input alone is never a production permit');
  const previous = await historicalVideoIngressProgram(new Map(), '39fcaa4b957dc5a672ae7c485b6310e3f1e6aa0d');
  const baseline = selectedGuideSourceContext(previous), decoder = components.decoder(actual.ts, extra, baseline);
  assert.equal(components.fresh(actual.ts, extra, decoder, baseline).fresh, 'legacy');
  assert.equal(components.handlers(actual.ts, extra, baseline).status, 'conditional');
  for (const changed of [
    { ...captured, checker: {} }, { ...captured, sourceHost: undefined },
    { ...captured, sourceHost: { ...captured.sourceHost, fileExists: file => !file.endsWith('HermesAssistantDrawer.tsx') && captured.sourceHost.fileExists(file) } },
  ]) assert.throws(() => components.supplemental(actual.ts, changed), error => error.reason === 'SELECTED_GUIDE_SUPPLEMENTARY_SOURCE_UNKNOWN');
});

test('selected guide decoder proves own-member absence without accepting null or a changed legacy parser', async () => {
  const components = selectedGuideSourceComponents();
  const actual = await retainedSelectedGuideProgram(), previous = await historicalVideoIngressProgram(new Map(), '39fcaa4b957dc5a672ae7c485b6310e3f1e6aa0d');
  const model = components.decoder(actual.ts, selectedGuideSourceContext(actual), selectedGuideSourceContext(previous));
  assert.equal(model.status, 'conditional');
  assert.equal(model.capable, true);
  assert.equal(model.legacyParser.name.text, 'parseWorkspaceGuidePayload');
  assert.equal(model.reader.name.text, 'readWorkspaceGuidePayloadWithSelectedImage');
  const path = 'packages/domain/src/agent/workspace-guide-contract.ts';
  for (const change of [
    text => text.replace("!Object.hasOwn(presentation, 'selectedImageAssetId')", "!presentation.selectedImageAssetId"),
    text => text.replace('return parseWorkspaceGuidePayload(value);', 'return parseWorkspaceGuidePayload({});'),
    text => text.replace("['researchObjectId', 'versionId'])", "['researchObjectId', 'versionId', 'selectedImageAssetId'])"),
  ]) {
    const changed = await retainedSelectedGuideProgram(new Map([[path, change]]));
    assert.throws(() => components.decoder(changed.ts, selectedGuideSourceContext(changed), selectedGuideSourceContext(previous)),
      error => error.reason === 'SELECTED_GUIDE_LEGACY_DECODER_CHANGED');
  }
});

test('selected guide fresh source follows actual HTTP and transitive task persistence callers', async () => {
  const components = selectedGuideSourceComponents();
  const actual = await retainedSelectedGuideProgram(), previous = await historicalVideoIngressProgram(new Map(), '39fcaa4b957dc5a672ae7c485b6310e3f1e6aa0d');
  const context = selectedGuideSourceContext(actual), decoder = components.decoder(actual.ts, context, selectedGuideSourceContext(previous));
  let model;
  try { model = components.fresh(actual.ts, context, decoder, selectedGuideSourceContext(previous)); }
  catch (error) { assert.fail(`${error.reason}: ${relative(actual.projectRoot, error.node?.getSourceFile().fileName ?? '')}:${error.node?.getText().slice(0, 120)}`); }
  assert.equal(model.status, 'conditional');
  assert.equal(model.fresh, 'legacy');
  assert.ok(model.origins.length > 0);
  assert.ok(model.nonGuide.some(value => value.kind === 'presentation.generate'));
  const path = 'apps/api/src/routes/agent.ts';
  const writer = await retainedSelectedGuideProgram(new Map([[path, text => text
    .replace('listAgentTasks, parseWorkspaceGuidePayload,', 'listAgentTasks, readWorkspaceGuidePayloadWithSelectedImage,')
    .replace('return parseWorkspaceGuidePayload(payload);', 'return readWorkspaceGuidePayloadWithSelectedImage(payload);')]]));
  const changedContext = selectedGuideSourceContext(writer);
  const changedDecoder = components.decoder(writer.ts, changedContext, selectedGuideSourceContext(previous));
  assert.equal(components.fresh(writer.ts, changedContext, changedDecoder, selectedGuideSourceContext(previous)).fresh, 'selected',
    'The genuine writer overlay changes the birth family, never the legacy-absence premise');
  for (const addition of [
    "body.payload.context.presentation!.selectedImageAssetId = '00000000-0000-4000-8000-000000000001';",
    "const afterValidation = body.payload.context.presentation!; Object.assign(afterValidation, { selectedImageAssetId: '00000000-0000-4000-8000-000000000001' });",
    'const afterValidation = body.payload; unknownWriter(afterValidation);',
  ]) {
    const changed = await retainedSelectedGuideProgram(new Map([[path, text => text.replace('const body = agentTaskBodySchema.parse(req.body);',
      `const body = agentTaskBodySchema.parse(req.body); ${addition}`)]]));
    const scope = selectedGuideSourceContext(changed);
    const read = components.decoder(changed.ts, scope, selectedGuideSourceContext(previous));
    assert.throws(() => components.fresh(changed.ts, scope, read, selectedGuideSourceContext(previous)),
      error => error.reason === 'SELECTED_GUIDE_FRESH_WRITER_UNKNOWN');
  }
});

test('selected guide schema proof rejects a replaced or escaped actual Zod binding', async () => {
  const components = selectedGuideSourceComponents();
  const previous = await historicalVideoIngressProgram(new Map(), '39fcaa4b957dc5a672ae7c485b6310e3f1e6aa0d');
  const baseline = selectedGuideSourceContext(previous);
  const file = 'apps/api/src/routes/agent.ts';
  for (const change of [
    text => text.replace("import { z } from 'zod';", "import { z } from './unowned-schema';"),
    text => text.replace("import { z } from 'zod';", "import { z } from 'zod'; Object.assign(z, { object: unownedObject });"),
    text => text.replace("import { z } from 'zod';", "import { z } from 'zod'; const escapedSchema = z; unowned(escapedSchema);"),
  ]) {
    const actual = await retainedSelectedGuideProgram(new Map([[file, change]]));
    const context = selectedGuideSourceContext(actual), decoder = components.decoder(actual.ts, context, baseline);
    assert.throws(() => components.fresh(actual.ts, context, decoder, baseline),
      error => error.reason === 'SELECTED_GUIDE_FRESH_WRITER_UNKNOWN');
  }
});

test('selected guide fresh proof refuses changed actual persistence forwarders and rest-alias mutation', async () => {
  const components = selectedGuideSourceComponents();
  const previous = await historicalVideoIngressProgram(new Map(), '39fcaa4b957dc5a672ae7c485b6310e3f1e6aa0d');
  const baseline = selectedGuideSourceContext(previous), file = 'packages/domain/src/agent/agent.ts';
  for (const change of [
    text => text.replace('return persistAgentTaskCoreInTransaction(deps, tx, input, ctx);',
      "input.kind = 'workspace.guide'; return persistAgentTaskCoreInTransaction(deps, tx, input, ctx);"),
    text => text.replace('return persistAgentTaskCoreInTransaction(deps, tx, input, ctx);',
      "Object.assign(input, { kind: 'workspace.guide' }); return persistAgentTaskCoreInTransaction(deps, tx, input, ctx);"),
    text => text.replace('const { dispatch, beforePersist, ...persistenceInput } = input;',
      "const { dispatch, beforePersist, ...persistenceInput } = input; persistenceInput.kind = 'workspace.guide';"),
  ]) {
    const actual = await retainedSelectedGuideProgram(new Map([[file, change]]));
    const context = selectedGuideSourceContext(actual), decoder = components.decoder(actual.ts, context, baseline);
    assert.throws(() => components.fresh(actual.ts, context, decoder, baseline),
      error => error.reason === 'SELECTED_GUIDE_FRESH_WRITER_UNKNOWN');
  }
});

test('selected guide relocated byte reader retains actual bounds hash finally and all ordinary call arguments', async () => {
  const components = selectedGuideSourceComponents();
  const actual = await retainedSelectedGuideProgram(), previous = await historicalVideoIngressProgram(new Map(), '39fcaa4b957dc5a672ae7c485b6310e3f1e6aa0d');
  const baseline = selectedGuideSourceContext(previous);
  const model = components.relocation(actual.ts, selectedGuideSourceContext(actual), baseline);
  assert.equal(model.status, 'conditional');
  assert.ok(model.retained.length > 0);
  assert.ok(model.additionalCalls.every(call => call.getSourceFile().fileName.endsWith('workspace-guide.ts')));
  const path = 'apps/agent-worker/src/presentation/generated-image-review.ts';
  for (const change of [
    text => text.replace('maxBytes = 10 * 1024 * 1024', 'maxBytes = 100 * 1024 * 1024'),
    text => text.replace(".digest('hex') !== expectedHash", ".digest('hex') === expectedHash"),
    text => text.replace('object.body.destroy();', 'void object.body;'),
  ]) {
    const changed = await retainedSelectedGuideProgram(new Map([[path, change]]));
    assert.throws(() => components.relocation(changed.ts, selectedGuideSourceContext(changed), baseline),
      error => error.reason === 'SELECTED_GUIDE_BYTE_READER_CHANGED');
  }
  const escaped = await retainedSelectedGuideProgram(new Map([['apps/agent-worker/src/presentation/handler.ts',
    text => `${text}\nconst escapedByteReader = readPresentationInput;\n`]]));
  assert.throws(() => components.relocation(escaped.ts, selectedGuideSourceContext(escaped), baseline),
    error => error.reason === 'SELECTED_GUIDE_BYTE_READER_CHANGED');
});

test('selected guide workspace branch reduces to the complete old module without ordinary or builtin escape changes', async () => {
  const components = selectedGuideSourceComponents(), actual = await retainedSelectedGuideProgram();
  const previous = await historicalVideoIngressProgram(new Map(), '39fcaa4b957dc5a672ae7c485b6310e3f1e6aa0d');
  const context = selectedGuideSourceContext(actual), baseline = selectedGuideSourceContext(previous);
  const decoder = components.decoder(actual.ts, context, baseline);
  let model;
  try { model = components.workspace(actual.ts, context, baseline, decoder); }
  catch (error) { assert.fail(`${error.reason}: ${error.node?.getText().slice(0, 130)}`); }
  assert.equal(model.status, 'conditional');
  assert.ok(model.handlerCalls.length > 0);
  assert.equal(model.builtinOmissions.length, 1);
  assert.equal(model.builtinOmissions[0].specifier, 'node:util');
  assert.deepEqual(videoPairRuntime(actual.ts, model.text), videoPairRuntime(previous.ts, model.previous.text));
  const file = 'apps/agent-worker/src/workspace-guide.ts';
  for (const change of [
    text => text.replace('if (payload.context.presentation?.selectedImageAssetId) {', 'if (payload.context.presentation?.versionId) {'),
    text => text.replace('const INTENTS = new Set', 'const escaped = isDeepStrictEqual; unowned(escaped); const INTENTS = new Set'),
    text => text.replace('workspace.guide 服务端任务上下文无效', 'changed ordinary task guard'),
  ]) {
    const changed = await retainedSelectedGuideProgram(new Map([[file, change]])), scope = selectedGuideSourceContext(changed);
    const read = components.decoder(changed.ts, scope, baseline);
    assert.throws(() => components.workspace(changed.ts, scope, baseline, read),
      error => error.reason === 'SELECTED_GUIDE_WORKSPACE_RESIDUAL_UNKNOWN');
  }
});

test('selected guide Native ordinary projection preserves complete actual CAS terminal authority and parser runtime', async () => {
  const components = selectedGuideSourceComponents(), actual = await retainedSelectedGuideProgram();
  const previous = await historicalVideoIngressProgram(new Map(), '39fcaa4b957dc5a672ae7c485b6310e3f1e6aa0d');
  const context = selectedGuideSourceContext(actual), baseline = selectedGuideSourceContext(previous);
  const decoder = components.decoder(actual.ts, context, baseline);
  let model;
  try { model = components.native(actual.ts, context, baseline, decoder); }
  catch (error) { assert.fail(`${error.reason}: ${error.node?.getText().slice(0, 130)}`); }
  assert.equal(model.status, 'conditional');
  assert.equal(model.selectedRegions.length, 4); assert.equal(model.absent.size, 2);
  assert.deepEqual(videoPairRuntime(actual.ts, model.text), videoPairRuntime(previous.ts, model.previous.text));
  const file = 'packages/domain/src/agent/native-agent-execution.ts';
  for (const change of [
    text => text.replace('return payload.context.presentation?.selectedImageAssetId ? payload : undefined;', 'return payload.context.presentation ? payload : undefined;'),
    text => text.replace('kind: task.kind, status: task.status,', 'kind: task.kind,'),
    text => text.replace('function selectedGuide(', 'function escaped(task: unknown) { return selectedGuide(task); } function selectedGuide('),
    text => text.replace("marker?.profile === 'paper-illustration' && task?.kind === 'workspace.guide') {", "marker?.profile === 'paper-illustration') {"),
  ]) {
    const changed = await retainedSelectedGuideProgram(new Map([[file, change]])), scope = selectedGuideSourceContext(changed);
    const read = components.decoder(changed.ts, scope, baseline);
    assert.throws(() => components.native(changed.ts, scope, baseline, read),
      error => error.reason === 'SELECTED_GUIDE_NATIVE_RESIDUAL_UNKNOWN');
  }
});

test('selected guide byte relocation restores both entire modules and checks free bindings and selected-only extra callers', async () => {
  const components = selectedGuideSourceComponents(), actual = await retainedSelectedGuideProgram();
  const previous = await historicalVideoIngressProgram(new Map(), '39fcaa4b957dc5a672ae7c485b6310e3f1e6aa0d');
  const baseline = selectedGuideSourceContext(previous);
  const modelFor = input => {
    const context = selectedGuideSourceContext(input), decoder = components.decoder(input.ts, context, baseline);
    const workspace = components.workspace(input.ts, context, baseline, decoder);
    const relocation = components.relocation(input.ts, context, baseline);
    return components.relocationResidual(input.ts, context, baseline, relocation, workspace);
  };
  let model;
  try { model = modelFor(actual); }
  catch (error) { assert.fail(`${error.reason}/${error.stage ?? ''}: ${error.node?.getText().slice(0, 100)}`); }
  assert.equal(model.status, 'conditional');
  assert.deepEqual(videoPairRuntime(actual.ts, model.text), videoPairRuntime(previous.ts,
    previous.program.getSourceFile(resolve(previous.projectRoot, 'apps/agent-worker/src/presentation/generated-image-review.ts')).text));
  assert.deepEqual(videoPairRuntime(actual.ts, model.handlerText), videoPairRuntime(previous.ts, model.relocation.oldSource.text));
  for (const [file, change] of [
    ['apps/agent-worker/src/presentation/generated-image-review.ts', text => text.replace('Saved image review does not match the persisted image', 'changed ordinary saved review error')],
    ['apps/agent-worker/src/presentation/handler.ts', text => text.replace('Storyboard art correction checkpoint is invalid', 'changed ordinary art checkpoint error')],
    ['apps/agent-worker/src/presentation/generated-image-review.ts', text => text.replace('export async function readPresentationInput(', 'const Buffer = unownedBuffer; export async function readPresentationInput(')],
  ]) {
    const changed = await retainedSelectedGuideProgram(new Map([[file, change]]));
    assert.throws(() => modelFor(changed), error => error.reason === 'SELECTED_GUIDE_RELOCATION_RESIDUAL_UNKNOWN');
  }
});

test('selected guide Native config projection binds both actual uses suppliers and legacy callback ordering', async () => {
  const components = selectedGuideSourceComponents();
  const actual = await retainedSelectedGuideProgram(), previous = await historicalVideoIngressProgram(new Map(), '39fcaa4b957dc5a672ae7c485b6310e3f1e6aa0d');
  const baseline = selectedGuideSourceContext(previous);
  let model;
  try { model = components.handlers(actual.ts, selectedGuideSourceContext(actual), baseline); }
  catch (error) { assert.fail(`${error.reason}: ${error.node?.getText().slice(0, 100)}`); }
  assert.equal(model.status, 'conditional');
  assert.ok(model.suppliers.length >= 2);
  assert.deepEqual(videoPairRuntime(actual.ts, model.text), videoPairRuntime(actual.ts, model.rollback.text));
  const file = 'apps/agent-worker/src/index.ts';
  for (const change of [
    text => text.replace('const nativeAgent: NonNullable', 'let nativeAgent: NonNullable'),
    text => text.replace('runtime: nativeAgentRuntimeFromEnv(process.env), semanticSearchFor:', 'runtime: nativeAgentRuntimeFromEnv({ ...process.env }), semanticSearchFor:'),
    text => text.replace('const handlers = createHandlers(gateway, {', 'const handlers = createHandlers(gateway, { get videoSpool() { throw new Error("observable options read"); },'),
    text => text + '\nconst escapedFactory = createHandlers;\n',
  ]) {
    const changed = await retainedSelectedGuideProgram(new Map([[file, change]]));
    assert.throws(() => components.handlers(changed.ts, selectedGuideSourceContext(changed), baseline),
      error => error.reason === 'SELECTED_GUIDE_HANDLER_INITIALIZATION_CHANGED');
  }
});

test('selected guide illustration binds closed ordinary and video constructors and exact paper images delegation', async () => {
  const components = selectedGuideSourceComponents();
  const actual = await retainedSelectedGuideProgram(), previous = await historicalVideoIngressProgram(new Map(), '39fcaa4b957dc5a672ae7c485b6310e3f1e6aa0d');
  const baseline = selectedGuideSourceContext(previous);
  let model;
  try { model = components.illustration(actual.ts, selectedGuideSourceContext(actual), baseline); }
  catch (error) { assert.fail(`${error.reason}: ${error.node?.getText().slice(0, 120)}`); }
  assert.equal(model.status, 'conditional');
  assert.equal(model.ordinaryCalls.length, 1);
  assert.equal(model.replayCalls.length, 1);
  assert.equal(model.constructors.length, 2);
  for (const [file, change] of [
    ['apps/agent-worker/src/presentation/handler.ts', text => text.replace('task: { id: task.id, executionAttempt: task.executionAttempt, result: latest.result }, sourceMap:',
      '...payload, task: { id: task.id, executionAttempt: task.executionAttempt, result: latest.result }, sourceMap:')],
    ['apps/agent-worker/src/native-agent/illustration-task.ts', text => text.replace('return source.images(args, result);', 'return source.images(result, args);')],
    ['apps/agent-worker/src/native-agent/illustration-task.ts', text => text.replace(
      'async function runNativeIllustrationTaskCore(input: NativeIllustrationTaskInput & { selectedImageAttachment?: ScienceReviewAttachment }) {',
      'async function runNativeIllustrationTaskCore(input: NativeIllustrationTaskInput & { selectedImageAttachment?: ScienceReviewAttachment }) { opaqueInputWriter(input);')],
    ['apps/agent-worker/src/native-agent/paper-tools.ts', text => text.replace('async images(args: unknown, result: unknown) {', 'async images(args: unknown, result: unknown) { observe(this);')],
    ['apps/agent-worker/src/native-agent/host-task.ts', text => text.replace('const images = await input.paper.images(value.arguments, value.result);',
      'observeFunctionIdentity(input.paper.images.name); const images = await input.paper.images(value.arguments, value.result);')],
  ]) {
    const changed = await retainedSelectedGuideProgram(new Map([[file, change]]));
    assert.throws(() => components.illustration(changed.ts, selectedGuideSourceContext(changed), baseline),
      error => error.reason === 'SELECTED_GUIDE_ILLUSTRATION_INPUT_OR_DELEGATION_CHANGED');
  }
});

test('selected guide illustration restores the entire old module with no schema export or materializer remainder', async () => {
  const components = selectedGuideSourceComponents(), actual = await retainedSelectedGuideProgram();
  const previous = await historicalVideoIngressProgram(new Map(), '39fcaa4b957dc5a672ae7c485b6310e3f1e6aa0d');
  const baseline = selectedGuideSourceContext(previous);
  const modelFor = input => {
    const context = selectedGuideSourceContext(input);
    const initialization = components.initialization(input.ts, context, baseline);
    const illustration = components.illustration(input.ts, context, baseline);
    return components.illustrationResidual(input.ts, context, baseline, illustration, initialization);
  };
  let model;
  try { model = modelFor(actual); }
  catch (error) { assert.fail(`${error.reason}: ${error.node?.getText().slice(0, 130)}`); }
  assert.equal(model.status, 'conditional');
  assert.deepEqual(videoPairRuntime(actual.ts, model.text), videoPairRuntime(previous.ts, model.rollback.text));
  const file = 'apps/agent-worker/src/native-agent/illustration-task.ts';
  for (const change of [
    text => text.replace('type SelectedImageAuthorContext =', 'export { SELECTED_IMAGE_TOOLS }; type SelectedImageAuthorContext ='),
    text => text.replace("return { status: 'illustration_context', settings: input.settings,", "return { status: 'changed_illustration_context', settings: input.settings,"),
  ]) {
    const changed = await retainedSelectedGuideProgram(new Map([[file, change]]));
    assert.throws(() => modelFor(changed), error => error.reason === 'SELECTED_GUIDE_ILLUSTRATION_RESIDUAL_UNKNOWN');
  }
});

test('selected guide dormant declarations leave all three actual legacy modules and exports exact', async () => {
  const components = selectedGuideSourceComponents(), actual = await retainedSelectedGuideProgram();
  const previous = await historicalVideoIngressProgram(new Map(), '39fcaa4b957dc5a672ae7c485b6310e3f1e6aa0d');
  const baseline = selectedGuideSourceContext(previous);
  const modelFor = input => {
    const context = selectedGuideSourceContext(input), decoder = components.decoder(input.ts, context, baseline);
    return components.dormant(input.ts, context, baseline, decoder);
  };
  let model;
  try { model = modelFor(actual); }
  catch (error) { assert.fail(`${error.reason}: ${error.node?.getText().slice(0, 100)}`); }
  assert.equal(model.status, 'conditional');
  assert.equal(model.removed.size, 5); assert.equal(model.projections.size, 3);
  for (const value of model.projections.values()) assert.deepEqual(videoPairRuntime(actual.ts, value.text), videoPairRuntime(previous.ts, value.previous.text));
  for (const [file, change] of [
    ['packages/domain/src/assets/scene-image.ts', text => text.replace('Saved image review does not match the persisted image', 'changed ordinary saved image error')],
    ['packages/domain/src/assets/scene-image.ts', text => text.replace('export async function requireSelectedImageSource(', 'const escapedWriteScope = requirePresentationWriteScope; export async function requireSelectedImageSource(')],
    ['packages/domain/src/index.ts', text => text + '\nexport const untrackedSelectedValue = 1;\n'],
  ]) {
    const changed = await retainedSelectedGuideProgram(new Map([[file, change]]));
    assert.throws(() => modelFor(changed), error => error.reason === 'SELECTED_GUIDE_DORMANT_MODULE_UNKNOWN');
  }
});

test('selected guide public reader preserves ordinary opaque data and quarantines unknown provenance on the same row', async () => {
  const components = selectedGuideSourceComponents(), actual = await retainedSelectedGuideProgram();
  const previous = await historicalVideoIngressProgram(new Map(), '39fcaa4b957dc5a672ae7c485b6310e3f1e6aa0d');
  const baseline = selectedGuideSourceContext(previous);
  const model = components.publicReader(actual.ts, selectedGuideSourceContext(actual), baseline);
  assert.equal(model.status, 'conditional');
  assert.deepEqual(videoPairRuntime(actual.ts, model.text), videoPairRuntime(previous.ts, model.previous.getText()));
  assert.deepEqual(videoPairRuntime(actual.ts, model.taskViewText), videoPairRuntime(previous.ts, model.previousTaskView.getText()));
  const file = 'packages/domain/src/agent/agent.ts';
  for (const change of [
    text => text.replace('ordinary = true;', "if (Object.hasOwn(rawResult.selectedImageContext ?? {}, 'assetId')) throw new Error('ordinary extension denied'); ordinary = true;"),
    text => text.replace('selectedReference = undefined; selectedDraft = undefined;', 'ordinary = true; selectedReference = undefined; selectedDraft = undefined;'),
    text => text.replace('projectAgentTaskResult(task.result, task.kind, task)', 'projectAgentTaskResult(task.result, task.kind, otherTask)'),
    text => text.replace('task.result !== rawResult', 'task.result === rawResult'),
    text => text.replace('delete publicResult.audioAuditionGrant;', 'delete publicResult.ordinaryExtension;'),
  ]) {
    const changed = await retainedSelectedGuideProgram(new Map([[file, change]]));
    assert.throws(() => components.publicReader(changed.ts, selectedGuideSourceContext(changed), baseline),
      error => error.reason === 'SELECTED_GUIDE_PUBLIC_READER_UNKNOWN');
  }
});

test('selected guide whole agent residual retains ordinary constructors retry and all original private filters', async () => {
  const components = selectedGuideSourceComponents(), actual = await retainedSelectedGuideProgram();
  const previous = await historicalVideoIngressProgram(new Map(), '39fcaa4b957dc5a672ae7c485b6310e3f1e6aa0d');
  const baseline = selectedGuideSourceContext(previous);
  const context = selectedGuideSourceContext(actual);
  const decoder = components.decoder(actual.ts, context, baseline), reader = components.publicReader(actual.ts, context, baseline);
  let model;
  try { model = components.agent(actual.ts, context, baseline, decoder, reader); }
  catch (error) { assert.fail(`${error.reason}: ${error.node?.getText().slice(0, 180)}`); }
  assert.equal(model.status, 'conditional');
  assert.deepEqual(videoPairRuntime(actual.ts, model.text), videoPairRuntime(previous.ts, model.previous.text));
  const file = 'packages/domain/src/agent/agent.ts';
  for (const change of [
    text => text.replace('tx ?? deps.prisma', 'deps.prisma'),
    text => text.replace('AI Credit 不足（§2.4-7），请补充后再试', 'changed ordinary billing behavior'),
    text => {
      const field = /kind: input.kind,\r?\n        payload:/gu;
      assert.equal([...text.matchAll(field)].length, 1, 'the persisted kind mutant must bind exactly one original field');
      return text.replace(field, match => match.replace('kind: input.kind,', "kind: 'workspace.guide',"));
    },
  ]) {
    const changed = await retainedSelectedGuideProgram(new Map([[file, change]])), scope = selectedGuideSourceContext(changed);
    const changedDecoder = components.decoder(changed.ts, scope, baseline), changedReader = components.publicReader(changed.ts, scope, baseline);
    assert.throws(() => components.agent(changed.ts, scope, baseline, changedDecoder, changedReader),
      error => error.reason === 'SELECTED_GUIDE_AGENT_RESIDUAL_UNKNOWN');
  }
});

test('selected guide ingestion projection supplies its exact persisted row without changing the original reader', async () => {
  const components = selectedGuideSourceComponents(), actual = await retainedSelectedGuideProgram();
  const previous = await historicalVideoIngressProgram(new Map(), '39fcaa4b957dc5a672ae7c485b6310e3f1e6aa0d');
  const baseline = selectedGuideSourceContext(previous);
  const model = components.ingestion(actual.ts, selectedGuideSourceContext(actual), baseline);
  assert.equal(model.status, 'conditional');
  assert.deepEqual(videoPairRuntime(actual.ts, model.text), videoPairRuntime(previous.ts, model.previous.text));
  const file = 'packages/domain/src/ingestion/ingestion-service.ts';
  for (const change of [
    text => text.replace('task.agentTask ?? undefined);', 'otherTask ?? undefined);'),
    text => text.replace("task.agentTask?.kind ?? ''", "task.agentTask?.kind ?? 'workspace.guide'"),
    text => text.replace('artifact: true, agentTask: true, batch:', 'artifact: true, agentTask: false, batch:'),
  ]) {
    const changed = await retainedSelectedGuideProgram(new Map([[file, change]]));
    assert.throws(() => components.ingestion(changed.ts, selectedGuideSourceContext(changed), baseline),
      error => error.reason === 'SELECTED_GUIDE_INGESTION_READER_UNKNOWN');
  }
});

test('selected guide new schema initializer is owned plain data and never an effect or cyclic value read', async () => {
  const components = selectedGuideSourceComponents();
  const actual = await retainedSelectedGuideProgram(), previous = await historicalVideoIngressProgram(new Map(), '39fcaa4b957dc5a672ae7c485b6310e3f1e6aa0d');
  const baseline = selectedGuideSourceContext(previous);
  let model;
  try { model = components.initialization(actual.ts, selectedGuideSourceContext(actual), baseline); }
  catch (error) { assert.fail(`${error.reason}/${error.stage ?? ''}: ${relative(actual.projectRoot, error.node?.getSourceFile().fileName ?? '')}:${error.node?.getText().slice(0, 100)}`); }
  assert.equal(model.status, 'conditional');
  assert.ok(model.pureInitializers.some(node => node.name.text === 'SELECTED_IMAGE_TOOLS'));
  for (const path of ['apps/agent-worker/src/skills/media-direction.ts',
    'apps/agent-worker/src/native-agent/illustration-task.ts', 'apps/agent-worker/src/presentation/chart-generator.ts'])
    assert.ok(model.moved.has(path), `the actual eager-order frontier must include ${path}`);
  assert.ok(model.ordering.some(value => value.entry === 'apps/agent-worker/src/index.ts'));
  const file = 'apps/agent-worker/src/native-agent/illustration-task.ts';
  for (const change of [
    text => text.replace('const SELECTED_IMAGE_TOOLS = [', 'const effect = globalThis.initializeSelected(); const SELECTED_IMAGE_TOOLS = ['),
    text => text.replace('const SELECTED_IMAGE_TOOLS = [', "const unsafeRegex = new RegExp('(', 'u'); const SELECTED_IMAGE_TOOLS = ["),
    text => text.replace(/(const SELECTED_IMAGE_TOOLS = )(\[[\s\S]*?\]);(\r?\ntype SelectedImageAuthorContext)/u, '$1$2.map(tool => unknown(tool));$3'),
    text => text.replace(/(const SELECTED_IMAGE_TOOLS = )(\[[\s\S]*?\]);(\r?\ntype SelectedImageAuthorContext)/u, '$1initializeSelected($2);$3'),
    text => text.replace("parameters: object({ kind: { type: 'string', enum: ['explanation', 'question'] }", "parameters: object({ __proto__: unownedPrototype, kind: { type: 'string', enum: ['explanation', 'question'] }"),
  ]) {
    const changed = await retainedSelectedGuideProgram(new Map([[file, change]]));
    assert.throws(() => components.initialization(changed.ts, selectedGuideSourceContext(changed), baseline),
      error => error.reason === 'SELECTED_GUIDE_EAGER_INITIALIZATION_UNKNOWN');
  }
});

test('selected guide High exact RegExp literal witness cannot obtain an initializer or full source proof', async () => {
  const components = selectedGuideSourceComponents();
  const file = 'apps/agent-worker/src/native-agent/illustration-task.ts';
  const needle = "description: 'Read the actual selected saved image. This exact image is the revision target, not a style example. No other image can be selected here.'";
  const actual = await retainedSelectedGuideProgram(new Map([[file, text => {
    assert.equal(text.split(needle).length, 2);
    return text.replace(needle, 'description: /(/');
  }]]));
  const previous = await historicalVideoIngressProgram(new Map(), '39fcaa4b957dc5a672ae7c485b6310e3f1e6aa0d');
  assert.equal(actual.program.getSyntacticDiagnostics().length, 0, 'This exact spelling escapes TS5.5 syntactic diagnostics');
  assert.throws(() => components.sourceModel(actual.ts, selectedGuideSourceContext(actual), selectedGuideSourceContext(previous)),
    error => error.reason === 'SELECTED_GUIDE_EAGER_INITIALIZATION_UNKNOWN');
});

test('selected guide High ordinary constructor witness has equal old and current public outputs after the restoration', async () => {
  const components = selectedGuideSourceComponents(), file = 'apps/agent-worker/src/index.ts';
  const change = text => {
    const needle = 'return { echoed: true };';
    assert.equal(text.split(needle).length, 2);
    return text.replace(needle, "return { echoed: true, selectedImageReference: { note: 'ordinary legacy opaque field' } };");
  };
  const actual = await retainedSelectedGuideProgram(new Map([[file, change]]));
  const previous = await historicalVideoIngressProgram(new Map([[file, change]]), '39fcaa4b957dc5a672ae7c485b6310e3f1e6aa0d');
  const model = components.sourceModel(actual.ts, selectedGuideSourceContext(actual), selectedGuideSourceContext(previous));
  assert.equal(model.status, 'conditional');
  const load = (input, names, globals = {}) => {
    const source = input.program.getSourceFile(resolve(input.projectRoot, 'packages/domain/src/agent/agent.ts'));
    const text = names.map(name => source.statements.find(node => node.name?.text === name).getText()).join('\n');
    const exports = {};
    (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 27), runInNewContext(input.ts.transpileModule(text, { compilerOptions: { target: input.ts.ScriptTarget.ES2022, module: input.ts.ModuleKind.CommonJS } }).outputText,
      { exports, ...globals }));
    return exports;
  };
  const nativeSource = actual.program.getSourceFile(resolve(actual.projectRoot, 'packages/domain/src/agent/native-agent-execution.ts'));
  const nativeText = ['record', 'readNativeAgentExecution'].map(name => nativeSource.statements.find(node => node.name?.text === name
    || actual.ts.isVariableStatement(node) && node.declarationList.declarations.some(value => value.name.text === name)).getText()).join('\n');
  const native = {};
  (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 28), runInNewContext(actual.ts.transpileModule(nativeText, { compilerOptions: { target: actual.ts.ScriptTarget.ES2022, module: actual.ts.ModuleKind.CommonJS } }).outputText,
    { exports: native }));
  const oldReader = load(previous, ['isJsonRecord', 'projectAgentTaskResult']);
  const currentReader = load(actual, ['isJsonRecord', 'projectAgentTaskResult'], native);
  const raw = { echoed: true, selectedImageReference: { note: 'ordinary legacy opaque field' } };
  const row = { id: 'ordinary-task', sessionId: 'ordinary-session', kind: 'demo.echo', payload: {}, executionAttempt: 0, result: raw };
  const before = oldReader.projectAgentTaskResult(raw, row.kind), after = currentReader.projectAgentTaskResult(raw, row.kind, row);
  assert.equal(Object.hasOwn(before, 'selectedImageReference'), true);
  assert.deepEqual(JSON.parse(JSON.stringify(after)), JSON.parse(JSON.stringify(before)));
});

test('selected guide whole model preserves an arbitrary ordinary historical root through its actual retainers', async () => {
  const components = selectedGuideSourceComponents(), actual = await retainedSelectedGuideProgram();
  const previous = await historicalVideoIngressProgram(new Map(), '39fcaa4b957dc5a672ae7c485b6310e3f1e6aa0d');
  const baseline = selectedGuideSourceContext(previous);
  let model;
  try { model = components.sourceModel(actual.ts, selectedGuideSourceContext(actual), baseline); }
  catch (error) { assert.fail(`${error.reason ?? error.message}/${error.stage ?? ''}: ${relative(actual.projectRoot, error.node?.getSourceFile().fileName ?? '')}:${error.node?.getText().slice(0, 130)}`); }
  assert.equal(model.status, 'conditional');
  assert.equal(model.fresh.fresh, 'legacy');
  assert.equal(model.projected.size, 11);
  assert.ok(model.closure.declarations.size > 0);
  const origin = model.origin;
  assert.equal(origin.status, 'conditional');
  assert.equal(origin.domain, 'authenticated-ordinary-opaque-json-root');
  assert.equal(origin.node.getText(), 'task.result');
  assert.ok(origin.transfers.some(value => value.current.name.text === 'markTaskProgressOnce'));
  assert.ok(origin.transfers.some(value => value.current.name.text === 'compareNativeAgentCheckpoint'));
  for (const [key, value] of model.projected)
    assert.deepEqual(videoPairRuntime(actual.ts, value.text), videoPairRuntime(previous.ts, value.previous.text), key);
  const file = 'apps/api/src/routes/agent.ts';
  const writer = await retainedSelectedGuideProgram(new Map([[file, text => text
    .replace('listAgentTasks, parseWorkspaceGuidePayload,', 'listAgentTasks, readWorkspaceGuidePayloadWithSelectedImage,')
    .replace('return parseWorkspaceGuidePayload(payload);', 'return readWorkspaceGuidePayloadWithSelectedImage(payload);')]]));
  assert.throws(() => components.sourceModel(writer.ts, selectedGuideSourceContext(writer), baseline),
    error => error.reason === 'SELECTED_GUIDE_FAMILY_NOT_CLOSED');
  // These are conditional source observations, not fabricated successful
  // collector arrays. W changes HTTP emission while its actual retained
  // backend (including all selected CP/CAS/paid-final consumers) stays exact R.
  const backend = input => input.program.getSourceFiles().filter(source => !source.isDeclarationFile
    && /^(?:packages|apps\/agent-worker)\//u.test(relative(input.projectRoot, source.fileName).replaceAll('\\', '/')))
    .map(source => [relative(input.projectRoot, source.fileName), source.text]);
  assert.deepEqual(backend(writer), backend(actual), 'W/R retains the complete real capable backend');
  assert.throws(() => components.sourceModel(previous.ts, baseline, selectedGuideSourceContext(actual)),
    error => error.reason === 'SELECTED_GUIDE_LEGACY_DECODER_CHANGED');
  assert.throws(() => components.sourceModel(actual.ts, selectedGuideSourceContext(actual), selectedGuideSourceContext(actual)),
    error => error.reason === 'SELECTED_GUIDE_READER_CAPABILITY_REMOVED_OR_NONIDENTICAL');
  for (const supplied of [[], [['module:one', 'copied']]])
    assert.equal(components.pair(actual.ts, supplied, [...supplied], actual.projectRoot, previous.projectRoot, []), false,
      'No source-only/copy/custom-root result can acquire a production permit');
});

test('selected guide whole source closure rejects namespace observation and a selected function escaping its bound region', async () => {
  const components = selectedGuideSourceComponents();
  const previous = await historicalVideoIngressProgram(new Map(), '39fcaa4b957dc5a672ae7c485b6310e3f1e6aa0d');
  const baseline = selectedGuideSourceContext(previous), file = 'apps/api/src/routes/agent.ts';
  for (const change of [
    text => "import * as selectedDomain from '@openscience/domain';\n" + text.replace('return { requestId: String(req.id),',
      'void Object.keys(selectedDomain); return { requestId: String(req.id),'),
    text => text.replace('return { requestId: String(req.id),', 'void requireSelectedImageSource; return { requestId: String(req.id),'),
  ]) {
    const changed = await retainedSelectedGuideProgram(new Map([[file, change]]));
    assert.throws(() => components.sourceModel(changed.ts, selectedGuideSourceContext(changed), baseline),
      error => error.reason === 'SELECTED_GUIDE_DECLARATION_OR_ESCAPE_UNKNOWN',
      'Both mutations must reach the actual bound-reference/namespace closure');
  }
});

test('selected guide legacy retry cannot execute an added effect before its absence refusal', async () => {
  const components = selectedGuideSourceComponents(), path = 'packages/domain/src/agent/agent.ts';
  const previous = await historicalVideoIngressProgram(new Map(), '39fcaa4b957dc5a672ae7c485b6310e3f1e6aa0d');
  const changed = await retainedSelectedGuideProgram(new Map([[path, text => text.replace(
    /(function canRecoverSelectedGuideFinal\(task: AgentTaskRetrySnapshot\): boolean \{\r?\n  try \{)/u,
    '$1\n    globalThis.observeLegacyRetry();')]]));
  assert.throws(() => components.sourceModel(changed.ts, selectedGuideSourceContext(changed), selectedGuideSourceContext(previous)),
    error => error.reason === 'SELECTED_GUIDE_LEGACY_GUIDE_RETRY_UNKNOWN');
});

test('selected guide current combination closes the whole source over the exact voice reader', async () => {
  videoTimeoutObservation('66-parent-begin');
  try {
  const components = selectedGuideSourceComponents(), actual = await retainedSelectedVoiceProgram();
  const previous = await historicalVideoIngressProgram(new Map(), 'ba276d8edccf163a8fb4e5a44655dd8ccf718eff');
  const model = components.sourceModel(actual.ts, selectedGuideSourceContext(actual), selectedGuideSourceContext(previous));
  assert.equal(model.status, 'conditional');
  assert.equal(model.fresh.fresh, 'legacy');
  assert.equal(model.projected.size, 11);
  assert.equal(model.origin.domain, 'authenticated-ordinary-opaque-json-root');
  assert.ok(model.handlers.voicePredecessor);
  assert.equal(relative(actual.projectRoot, model.handlers.voicePredecessor.factory.getSourceFile().fileName).replaceAll('\\', '/'), 'apps/agent-worker/src/voice.ts');
  for (const [key, value] of model.projected)
    assert.deepEqual(videoPairRuntime(actual.ts, value.text), videoPairRuntime(previous.ts, value.previous.text), key);
  } finally { videoTimeoutObservation('66-parent-exit'); }
});

test('selected guide initialization consumes original collected module equality without reclassifying root metadata', async t => {
  videoTimeoutObservation('67-parent-begin');
  try {
  const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
  const fixtureClientRequire = createRequire(import.meta.url), ts = fixtureClientRequire('typescript');
  videoTimeoutObservation('67-data-begin');
  const localClient = join(projectRoot, 'packages/search/generated/client/index.js');
  // A source-only worktree may use the already installed workspace dependency
  // as fixture DATA. CI prefers its own generated file. No client is installed
  // or substituted in either original collector's release-root input.
  const client = existsSync(localClient) ? localClient
    : join(dirname(fixtureClientRequire.resolve('@openscience/search/package.json')), 'generated/client/index.js');
  const genuine = readFileSync(client, 'utf8');
  const parsed = ts.createSourceFile('index.js', genuine, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  const declaration = parsed.statements.flatMap(statement => ts.isVariableStatement(statement)
    ? [...statement.declarationList.declarations] : []).find(node => node.name?.text === 'config');
  assert.ok(declaration && ts.isObjectLiteralExpression(declaration.initializer));
  const original = JSON.parse(declaration.initializer.getText(parsed));
  videoTimeoutObservation('67-data-parsed');
  const collector = deployLockSource.match(/function rollbackReaderClosure\(ts, root, roots, vendorPackages\) \{[\s\S]*?\n\}/u)?.[0];
  const metadata = deployLockSource.match(/function prismaSearchLocationLiterals\([^\n]+\) \{[\s\S]*?\n\}/u)?.[0];
  const consumer = deployLockSource.match(/function provePrismaSearchConsumer\([^\n]+\) \{[\s\S]*?\n\}/u)?.[0];
  const initialization = deployLockSource.slice(deployLockSource.indexOf('function finiteSelectedGuideInitializationTerms('),
    deployLockSource.indexOf('\nfunction finiteSelectedGuideDeclarationTerms('));
  assert.ok(collector && metadata && consumer && initialization);
  const writerRemainder = deployLockSource.slice(deployLockSource.indexOf('function finiteSelectedGuideWriterRemainderTerms('),
    deployLockSource.indexOf('\nfunction finiteSelectedGuideSavedReaderSeparation('));
  assert.ok(writerRemainder.startsWith('function finiteSelectedGuideWriterRemainderTerms('));
  const contexts = new WeakMap(), defaultRoots = [], vendorCalls = [];
  const functions = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 29), runInNewContext(`${metadata}; ${consumer}; ${collector}; ${initialization}; ${writerRemainder};
    ({ collect: rollbackReaderClosure, initialize: finiteSelectedGuideInitializationTerms, remainder: finiteSelectedGuideWriterRemainderTerms })`, {
    resolve, relative, dirname, join, existsSync, readFileSync, builtinModules,
    rollbackProofContexts: contexts, APPLICATION_ROLLBACK_READERS: defaultRoots,
    // This custom-root component fixture isolates the existing vendor boundary;
    // it is not installed DEFAULT/vendor-byte or release acceptance. Only the
    // unmodified original collector writes its private contexts below.
    verifyPrismaVendorRuntime(args) { vendorCalls.push(args.runtimeFile); return { controlledVendorFixture: true }; },
    rollbackCompatibilityUnknown() { throw Error('ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN'); },
  }));
  const parent = join(projectRoot, 'tmp/first-image'); await mkdir(parent, { recursive: true });
  const fixture = await mkdtemp(join(parent, 'selected-collected-runtime-'));
  t.after(() => {
    videoTimeoutObservation('67-cleanup-begin');
    return rm(fixture, { recursive: true, force: true }).then(value => {
      videoTimeoutObservation('67-cleanup-end'); return value;
    }, error => { videoTimeoutObservation('67-cleanup-throw'); throw error; });
  });
  const candidate = join(fixture, 'candidate'), previous = join(fixture, 'previous');
  const modulePath = 'packages/search/generated/client/index.js', ordinaryPath = 'apps/ordinary.ts', roots = [[modulePath], [ordinaryPath]];
  const input = directory => {
    const config = structuredClone(original);
    config.generator.output.value = join(directory, 'packages/search/generated/client');
    config.generator.sourceFilePath = join(directory, 'infra/search/schema.prisma');
    return genuine.slice(0, declaration.initializer.getStart(parsed)) + JSON.stringify(config) + genuine.slice(declaration.initializer.end);
  };
  for (const directory of [candidate, previous]) {
    await mkdir(join(directory, 'packages/search/generated/client/runtime'), { recursive: true });
    await writeFile(join(directory, 'tsconfig.json'), '{}');
    await writeFile(join(directory, modulePath), input(directory));
    await writeFile(join(directory, 'packages/search/generated/client/runtime/library.js'), 'module.exports = {};');
    await mkdir(join(directory, 'apps'), { recursive: true });
    await writeFile(join(directory, ordinaryPath), 'export function readOrdinary() { return { value: 1 }; }');
  }
  videoTimeoutObservation('67-fixture-written');
  const collect = directory => {
    videoTimeoutObservation('67-collect-begin');
    try { const value = functions.collect(ts, directory, roots, {}); videoTimeoutObservation('67-collect-end'); return value; }
    catch (error) { videoTimeoutObservation('67-collect-throw'); throw error; }
  };
  const current = collect(candidate), old = collect(previous);
  const left = contexts.get(current), right = contexts.get(old), key = `module:${modulePath}`;
  assert.notEqual(roots, defaultRoots);
  assert.equal(JSON.stringify(new Map(current).get(key)), JSON.stringify(new Map(old).get(key)));
  assert.notEqual(left.modules.get(resolve(candidate, modulePath)).text, right.modules.get(resolve(previous, modulePath)).text);
  videoTimeoutObservation('67-initialize-begin');
  assert.equal(functions.initialize(ts, left, right, { current, previous: old }).status, 'conditional');
  videoTimeoutObservation('67-initialize-end');
  assert.equal(functions.remainder(ts, left, right, new Set(), { current, previous: old }).status, 'conditional',
    'the actual W remainder must retain the original two-location equality');
  const pair = deployLockSource.match(/function finiteSelectedGuidePairCompatibility\([^\n]+\) \{[\s\S]*?\n\}/u)?.[0];
  assert.ok(pair);
  const remaining = pair.slice(pair.indexOf('    for (const key of new Set'), pair.indexOf('    // Existing production callers'));
  assert.ok(remaining.startsWith('    for (const key of new Set'));
  const strictRemaining = runInNewContext(`(current, previous) => {
    const a = new Map(current), b = new Map(previous), affected = new Set(), runtime = new Map();
    const model = { projected: new Map() }, reject = () => false; let site, moduleKey;
    ${remaining}
    return true;
  }`, { ts, builtinModules });
  assert.equal(strictRemaining(current, old), true, 'original remaining-entry equality accepts lawful relocation');
  const refuses = action => { videoTimeoutObservation('67-refusal-begin');
    assert.throws(action, error => error.reason === 'SELECTED_GUIDE_EAGER_INITIALIZATION_UNKNOWN');
    videoTimeoutObservation('67-refusal-end'); };
  const refusesRemainder = (a = left, b = right, collected) => assert.throws(
    () => functions.remainder(ts, a, b, new Set(), collected),
    error => ['SELECTED_GUIDE_EAGER_INITIALIZATION_UNKNOWN', 'SELECTED_GUIDE_WRITER_ACTIVATION_UNKNOWN'].includes(error.reason));
  refusesRemainder(); // No collected arrays means no captured-equality premise.
  refusesRemainder({ ...left, modules: new Map(left.modules) }, right);
  refuses(() => functions.initialize(ts, left, right)); // Source-only equality cannot mint the captured proof.
  for (const collected of [{ current: [...current], previous: old }, { current, previous: [...old] }, { current, previous: current }]) {
    refuses(() => functions.initialize(ts, left, right, collected));
    refusesRemainder(left, right, collected);
  }
  refuses(() => functions.initialize(ts, { ...left }, right, { current, previous: old }));
  refusesRemainder({ ...left }, right, { current, previous: old });
  const capturedPath = resolve(candidate, modulePath), capturedSource = left.modules.get(capturedPath);
  left.modules.set(capturedPath, ts.createSourceFile(capturedPath, capturedSource.text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS));
  refuses(() => functions.initialize(ts, left, right, { current, previous: old }));
  refusesRemainder(left, right, { current, previous: old });
  left.modules.set(capturedPath, capturedSource);
  const position = current.findIndex(([name]) => name === key), [missing] = current.splice(position, 1);
  refuses(() => functions.initialize(ts, left, right, { current, previous: old }));
  refusesRemainder(left, right, { current, previous: old });
  current.splice(position, 0, missing);
  left.modules.delete(capturedPath);
  refusesRemainder(left, right, { current, previous: old });
  left.modules.set(capturedPath, capturedSource);
  await writeFile(join(candidate, ordinaryPath), 'export function readOrdinary() { return { value: 2 }; }');
  const ordinaryChange = collect(candidate);
  assert.equal(functions.remainder(ts, contexts.get(ordinaryChange), right, new Set(), { current: ordinaryChange, previous: old }).status, 'conditional');
  assert.equal(strictRemaining(ordinaryChange, old), false, 'deferred captured runtime change is still refused by the ORIGINAL remaining loop');
  await writeFile(join(candidate, ordinaryPath), 'export function readOrdinary() { return { value: 1 }; }');
  const changedRuntime = input(candidate).replace(JSON.stringify(original.inlineSchemaHash), JSON.stringify(`${original.inlineSchemaHash}-changed`));
  assert.notEqual(changedRuntime, input(candidate));
  await writeFile(join(candidate, modulePath), changedRuntime);
  const changed = collect(candidate);
  assert.notEqual(JSON.stringify(new Map(changed).get(key)), JSON.stringify(new Map(old).get(key)));
  assert.equal(strictRemaining(changed, old), false, 'nonlocation generated metadata must remain unequal');
  refuses(() => functions.initialize(ts, contexts.get(changed), right, { current: changed, previous: old }));
  refusesRemainder(contexts.get(changed), right, { current: changed, previous: old });
  for (const bad of [input(candidate).replace(JSON.stringify(join(candidate, 'infra/search/schema.prisma')), JSON.stringify(join(candidate, 'wrong/schema.prisma'))),
    `${input(candidate)}\nexports.configObserver = config;`]) {
    await writeFile(join(candidate, modulePath), bad);
    assert.throws(() => collect(candidate), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
  }
  assert.ok(vendorCalls.length >= 2);
  } finally { videoTimeoutObservation('67-parent-exit'); }
});

test('selected guide current voice predecessor refuses eager effects keys and non-data suppliers at their actual nodes', async t => {
  videoTimeoutObservation('68-parent-begin');
  try {
  const components = selectedGuideSourceComponents(), voice = 'apps/agent-worker/src/voice.ts', worker = 'apps/agent-worker/src/index.ts';
  let observedMutant = 0;
  const check = async (changes, both, evidence) => {
    const ordinal = ++observedMutant; videoTimeoutObservation('68-mutant-begin', ordinal);
    try {
    const actual = await retainedSelectedVoiceProgram(changes);
    const previous = await historicalVideoIngressProgram(both ? changes : new Map(), 'ba276d8edccf163a8fb4e5a44655dd8ccf718eff');
    assert.throws(() => components.handlers(actual.ts, selectedGuideSourceContext(actual), selectedGuideSourceContext(previous)),
      error => error.reason === 'SELECTED_GUIDE_HANDLER_INITIALIZATION_CHANGED' && evidence(error.node, actual),
      'The named boundary must refuse at its supplying node, not an unrelated earlier frontier');
    } finally { videoTimeoutObservation('68-mutant-exit', ordinal); }
  };
  await t.test('same factory eager effect on both source sides', () => check(new Map([[voice,
    text => text.replace('  const wait = options.wait ??', '  globalThis.eagerVoiceFactory();\n  const wait = options.wait ??')]]), true,
  node => node.getSourceFile().fileName.replaceAll('\\', '/').endsWith('/voice.ts')));
  await t.test('same changed returned key on both source sides', () => check(new Map([[voice,
    text => text.replace("'voice.reply': handle", "'voice.changed': handle")]]), true,
  node => node.getSourceFile().fileName.replaceAll('\\', '/').endsWith('/voice.ts')));
  await t.test('actual caller accessor', () => check(new Map([[worker,
    text => text.replace(/(const handlers = createHandlers\(gateway, \{\r?\n)      voiceRuntime,/u,
      '$1      get voiceRuntime() { return undefined; },')]]), false,
  node => node.getText().includes('get voiceRuntime()')));
  await t.test('actual caller opaque options', () => check(new Map([[worker,
    text => text.replace('const handlers = createHandlers(gateway, {', 'const handlers = createHandlers(gateway, opaqueOptions || {')]]), false,
  node => node.getText().startsWith('opaqueOptions')));
  await t.test('actual caller opaque spread', () => check(new Map([[worker,
    text => text.replace('const handlers = createHandlers(gateway, {', 'const handlers = createHandlers(gateway, { ...opaqueOptions,')]]), false,
  node => node.getText().includes('...opaqueOptions')));
  await t.test('actual caller accessor inside conditional spread', () => check(new Map([[worker,
    text => text.replace('const handlers = createHandlers(gateway, {', 'const handlers = createHandlers(gateway, { ...(true ? { get voiceRuntime() { return undefined; } } : {}),')]]), false,
  node => node.getText().includes('get voiceRuntime()')));
  await t.test('actual factory second argument', () => check(new Map([[worker,
    text => text.replace('...createHermesVoiceHandlers(options.voiceRuntime),', '...createHermesVoiceHandlers(options.voiceRuntime, {}),')]]), false,
  node => node.getText().includes('createHermesVoiceHandlers(options.voiceRuntime, {})')));
  await t.test('actual factory shorthand escape', () => check(new Map([[worker,
    text => text + '\nconst leakedVoiceFactory = { createHermesVoiceHandlers };\n']]), false,
  (node, input) => input.ts.isShorthandPropertyAssignment(node.parent)));
  } finally { videoTimeoutObservation('68-parent-exit'); }
});

test('selected guide supplemental HTTP library identity requires the actual locked importer and same installed package', () => {
  videoTimeoutObservation('p69-begin', 0);
  try {

  const components = selectedGuideSourceComponents();
  const importer = readFileSync(new URL('../../apps/api/package.json', import.meta.url), 'utf8');
  const lock = readFileSync(new URL('../../pnpm-lock.yaml', import.meta.url), 'utf8');
  const pinned = JSON.parse(importer).dependencies.zod;
  const make = (root, { packageVersion = pinned, lockText = lock, missing = false, dependency = pinned, nearVersion, cachePath } = {}) => {
    const files = new Map([[resolve(root, 'apps/api/package.json'), JSON.stringify({ ...JSON.parse(importer), dependencies: { zod: dependency } })],
      [resolve(root, 'pnpm-lock.yaml'), lockText]]);
    if (!missing) files.set(resolve(root, 'apps/api/node_modules/zod/package.json'), JSON.stringify({ name: 'zod', version: packageVersion, main: './index.cjs' }));
    if (nearVersion) files.set(resolve(root, 'apps/api/src/routes/node_modules/zod/package.json'), JSON.stringify({ name: 'zod', version: nearVersion }));
    return { root: resolve(root), sourceHost: { fileExists: path => files.has(path), readFile: path => files.get(path),
      realpath: path => cachePath ?? path } };
  };
  // These controlled filesystem records test the boundary, never provide a
  // successful DEFAULT collection, execute Zod, or mint deployment authority.
  const actual = make('/candidate'), previous = make('/previous');
  assert.equal((videoTimeoutObservation('p69-proof-begin', 1), components.httpLibrary(actual, previous)).status, 'conditional');
  videoTimeoutObservation('p69-proof-statement-end', 1);
  for (const bad of [{ packageVersion: '0.0.0' }, { missing: true }, { lockText: `${lock}\nchanged` }, { dependency: `^${pinned}` },
    { nearVersion: '0.0.0' }, { cachePath: '/unrelated-donor/zod/package.json' }])
    assert.throws(() => (videoTimeoutObservation('p69-proof-begin', 2), components.httpLibrary(actual, make('/previous', bad))),
      error => error.reason === 'SELECTED_GUIDE_HTTP_LIBRARY_IDENTITY_UNKNOWN');

  } catch (error) { videoTimeoutObservation('p69-throw', 0); throw error; }
  finally { videoTimeoutObservation('p69-exit', 0); }
});

test('image producer partition uses the real initializer and preserves all consumer runtime', async () => {
  videoTimeoutObservation('p70-begin', 0);
  try {

  const component = deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  assert.ok(component.startsWith('function finiteImageProducerTerms('));
  const terms = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 30), runInNewContext(`${component}; finiteImageProducerTerms`, { resolve, relative }));
  const actual = await videoIngressProgram();
  const original = (videoTimeoutObservation('p70-proof-begin', 1), terms(actual.ts, videoPairContext(actual)));
  videoTimeoutObservation('p70-proof-statement-end', 1);
  assert.equal(original.kind, 'absent');
  const path = 'packages/domain/src/agent/agent.ts';
  const writer = await videoIngressProgram(new Map([[path, text => text.replace(
    "nativeReviewResult ? initialNativeAgentExecution(deps.nativeAgentRuntime, 'image-review')",
    "nativeReviewResult ? initialNativeAgentExecution(deps.nativeAgentRuntime, 'image-review', 'image-review-tool-final-v1')")]]));
  const tagged = (videoTimeoutObservation('p70-proof-begin', 2), terms(writer.ts, videoPairContext(writer)));
  videoTimeoutObservation('p70-proof-statement-end', 2);
  assert.equal(tagged.kind, 'tagged');
  assert.deepEqual(videoPairRuntime(actual.ts, original.text), videoPairRuntime(writer.ts, tagged.text));
  for (const argument of ['undefined', 'input.payload.policy']) {
    const unknown = await videoIngressProgram(new Map([[path, text => text.replace(
      "nativeReviewResult ? initialNativeAgentExecution(deps.nativeAgentRuntime, 'image-review')",
      `nativeReviewResult ? initialNativeAgentExecution(deps.nativeAgentRuntime, 'image-review', ${argument})`)]]));
    assert.throws(() => (videoTimeoutObservation('p70-proof-begin', 3), terms(unknown.ts, videoPairContext(unknown))), error => error.reason === 'IMAGE_PRODUCER_BINDING_UNKNOWN');
  videoTimeoutObservation('p70-proof-statement-end', 3);
  }

  } catch (error) { videoTimeoutObservation('p70-throw', 0); throw error; }
  finally { videoTimeoutObservation('p70-exit', 0); }
});

test('image constructor partition refuses untagged raw-turn emission at the actual Session writer', async () => {
  videoTimeoutObservation('p71-begin', 0);
  try {

  const component = deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const partition = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 31), runInNewContext(`${component}; finiteImageProtocolPartition`, { resolve, relative }));
  const actual = await videoIngressProgram();
  const model = (videoTimeoutObservation('p71-proof-begin', 1), partition(actual.ts, videoPairContext(actual)));
  videoTimeoutObservation('p71-proof-statement-end', 1);
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
    assert.throws(() => (videoTimeoutObservation('p71-proof-begin', 2), partition(unsafe.ts, videoPairContext(unsafe))), error => error.reason === 'IMAGE_PROTOCOL_PARTITION_UNKNOWN');
  videoTimeoutObservation('p71-proof-statement-end', 2);
  }

  } catch (error) { videoTimeoutObservation('p71-throw', 0); throw error; }
  finally { videoTimeoutObservation('p71-exit', 0); }
});

test('image cyclic imports inspect the actual owned freezer and eager initializer effects', async () => {
  videoTimeoutObservation('p72-begin', 0);
  try {

  const component = deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const initialization = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 32), runInNewContext(`${component}; finiteImageInitializationTerms`, { resolve, relative }));
  const actual = await videoIngressProgram();
  const model = (videoTimeoutObservation('p72-proof-begin', 1), initialization(actual.ts, videoPairContext(actual)));
  videoTimeoutObservation('p72-proof-statement-end', 1);
  assert.equal(model.status, 'conditional');
  assert.equal(model.sources.length, 3);
  assert.ok(model.freezer);
  for (const change of [
    text => text.replace("Object.values(value).forEach(freeze);", "Object.values(value).forEach(freeze); globalThis.imageProtocolChanged = true;"),
    text => text.replace("const resultTool: ChatToolDefinition = freeze({", "const resultTool: ChatToolDefinition = (globalThis.imageProtocolChanged = true, freeze)({"),
  ]) {
    const unsafe = await videoIngressProgram(new Map([['packages/ai-gateway/src/native-image-review.ts',change]]));
    assert.throws(() => (videoTimeoutObservation('p72-proof-begin', 2), initialization(unsafe.ts, videoPairContext(unsafe))), error => error.reason === 'IMAGE_INITIALIZATION_UNKNOWN');
  videoTimeoutObservation('p72-proof-statement-end', 2);
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
    assert.throws(()=>(videoTimeoutObservation('p72-proof-begin', 3), initialization(unsafe.ts,videoPairContext(unsafe))),
      error=>error.reason==='IMAGE_INITIALIZATION_UNKNOWN',`must not erase potentially throwing initializer ${expression}`);
  videoTimeoutObservation('p72-proof-statement-end', 3);
  }
  const numeric=await videoIngressProgram(new Map([['packages/ai-gateway/src/native-image-review.ts',text=>
    `${text}\nconst imageInitializationNumeric = -(2 * 1024) + 4 / 0 + 2 ** 3;\n`]]));
  assert.equal((videoTimeoutObservation('p72-proof-begin', 4), initialization(numeric.ts,videoPairContext(numeric))).status,'conditional',
    'number-literal arithmetic remains nonthrowing even when its result is nonfinite');
  videoTimeoutObservation('p72-proof-statement-end', 4);

  } catch (error) { videoTimeoutObservation('p72-throw', 0); throw error; }
  finally { videoTimeoutObservation('p72-exit', 0); }
});

test('image store binds its three modes to the original captured image attempt', async () => {
  videoTimeoutObservation('p73-begin', 0);
  try {

  const component = deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const analyze = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 33), runInNewContext(`${component}; finiteImageStoreFlowTerms`,{ resolve,relative }));
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

  } catch (error) { videoTimeoutObservation('p73-throw', 0); throw error; }
  finally { videoTimeoutObservation('p73-exit', 0); }
});

test('image initializer projection preserves the retained real legacy function on every supported caller', async () => {
  videoTimeoutObservation('p74-begin', 0);
  try {

  const component = deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const project = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 34), runInNewContext(`${component}; finiteImageInitializerProjection`,{ resolve,relative }));
  const path = 'packages/domain/src/agent/native-agent-execution.ts';
  // This unchanged file is already in the workflow's retained source fixture;
  // the accepting deployment pair still uses its actual installed rollback.
  const legacyText = execFileSync('git',['show',`ca0a5b1ce6b7228e04d0212a8a96b07d8adbf4a6:${path}`],{ encoding:'utf8' });
  const actual = await videoIngressProgram(), legacy = await videoIngressProgram(new Map([[path,legacyText]]));
  const model = project(actual.ts,videoPairContext(actual),videoPairContext(legacy));
  assert.equal(model.status,'conditional');
  assert.deepEqual(videoPairRuntime(actual.ts,model.text),videoPairRuntime(legacy.ts,model.rollback.getText()));

  } catch (error) { videoTimeoutObservation('p74-throw', 0); throw error; }
  finally { videoTimeoutObservation('p74-exit', 0); }
});

test('image Session projection retains the complete original untagged runtime and read order', async () => {
  videoTimeoutObservation('p75-begin', 0);
  try {

  const component = deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const project = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 35), runInNewContext(`${component}; finiteImageSessionProjection`,{ resolve,relative }));
  const path = 'apps/agent-worker/src/native-agent/session.ts';
  const text = execFileSync('git',['show',`ca0a5b1ce6b7228e04d0212a8a96b07d8adbf4a6:${path}`],{ encoding:'utf8' });
  const actual = await videoIngressProgram(), legacy = await videoIngressProgram(new Map([[path,text]]));
  const model = project(actual.ts,videoPairContext(actual),videoPairContext(legacy));
  assert.equal(model.status,'conditional');
  assert.deepEqual(videoPairRuntime(actual.ts,model.text),videoPairRuntime(legacy.ts,text));

  } catch (error) { videoTimeoutObservation('p75-throw', 0); throw error; }
  finally { videoTimeoutObservation('p75-exit', 0); }
});

test('image decoder projection preserves the actual old private checkpoint decoder', async () => {
  videoTimeoutObservation('p76-begin', 0);
  try {

  const component = deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const project = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 36), runInNewContext(`${component}; finiteImageDecoderProjection`,{ resolve,relative }));
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

  } catch (error) { videoTimeoutObservation('p76-throw', 0); throw error; }
  finally { videoTimeoutObservation('p76-exit', 0); }
});

test('image store projection retains actual private bytes, known references and paid/live CAS', async () => {
  videoTimeoutObservation('p77-begin', 0);
  try {

  const component=deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const project=(videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 37), runInNewContext(`${component}; finiteImageStoreProjection`,{resolve,relative}));
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

  } catch (error) { videoTimeoutObservation('p77-throw', 0); throw error; }
  finally { videoTimeoutObservation('p77-exit', 0); }
});

test('image Domain projection preserves the entire original execution and compare-and-set module', async () => {
  videoTimeoutObservation('p78-begin', 0);
  try {

  const component=deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const project=(videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 38), runInNewContext(`${component}; finiteImageExecutionProjection`,{resolve,relative}));
  const path='packages/domain/src/agent/native-agent-execution.ts';
  const text=execFileSync('git',['show',`ca0a5b1ce6b7228e04d0212a8a96b07d8adbf4a6:${path}`],{encoding:'utf8'});
  const sourceRef='3a93eb49137a67b2c12ef0ca89d7327c68c8e1b5';
  const actual=await videoIngressProgram(new Map(),{sourceRef}),legacy=await videoIngressProgram(new Map([[path,text]]),{sourceRef});
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
    const unsafe=await videoIngressProgram(new Map([[path,change]]),{sourceRef});
    assert.throws(()=>{
      const projected=project(unsafe.ts,videoPairContext(unsafe),videoPairContext(legacy));
      assert.deepEqual(videoPairRuntime(unsafe.ts,projected.text),videoPairRuntime(legacy.ts,text));
    },'original attempt, fetched-result equality and exactly-one CAS must remain in the actual Domain function');
  }

  } catch (error) { videoTimeoutObservation('p78-throw', 0); throw error; }
  finally { videoTimeoutObservation('p78-exit', 0); }
});

test('image illustration projection preserves the original complete image-role entry', async () => {
  videoTimeoutObservation('p79-begin', 0);
  try {

  const component=deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const project=(videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 39), runInNewContext(`${component}; finiteImageIllustrationProjection`,{resolve,relative}));
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

  } catch (error) { videoTimeoutObservation('p79-throw', 0); throw error; }
  finally { videoTimeoutObservation('p79-exit', 0); }
});

test('image Host projection keeps the original SDK response and finish guards', async () => {
  videoTimeoutObservation('p80-begin', 0);
  try {

  const component=deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const project=(videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 40), runInNewContext(`${component}; finiteImageHostProjection`,{resolve,relative}));
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

  } catch (error) { videoTimeoutObservation('p80-throw', 0); throw error; }
  finally { videoTimeoutObservation('p80-exit', 0); }
});

test('image SDK option domain follows actual request and all Session binding constructors', async () => {
  videoTimeoutObservation('p81-begin', 0);
  try {

  const component=deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const analyze=(videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 41), runInNewContext(`${component}; finiteImageSdkOptionTerms`,{resolve,relative}));
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

  } catch (error) { videoTimeoutObservation('p81-throw', 0); throw error; }
  finally { videoTimeoutObservation('p81-exit', 0); }
});

test('image recovery projection retains both original task and run recovery modules', async () => {
  videoTimeoutObservation('p82-begin', 0);
  try {

  const component=deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const project=(videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 42), runInNewContext(`${component}; finiteImageRecoveryProjections`,{resolve,relative}));
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

  } catch (error) { videoTimeoutObservation('p82-throw', 0); throw error; }
  finally { videoTimeoutObservation('p82-exit', 0); }
});

test('image allowed-tool domain derives all fresh names and explicit saved-name recurrences', async () => {
  videoTimeoutObservation('p83-begin', 0);
  try {

  const component=deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const analyze=(videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 43), runInNewContext(`${component}; finiteImageAllowedToolTerms`,{resolve,relative}));
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

  } catch (error) { videoTimeoutObservation('p83-throw', 0); throw error; }
  finally { videoTimeoutObservation('p83-exit', 0); }
});

test('image transport projection retains the original native and provider request methods', async () => {
  videoTimeoutObservation('p84-begin', 0);
  try {

  const component=deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const project=(videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 44), runInNewContext(`${component}; finiteImageTransportProjections`,{resolve,relative}));
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

  } catch (error) { videoTimeoutObservation('p84-throw', 0); throw error; }
  finally { videoTimeoutObservation('p84-exit', 0); }
});

test('image consumer projection retains original decision parsing and journal turn checks', async () => {
  videoTimeoutObservation('p85-begin', 0);
  try {

  const component=deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const project=(videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 45), runInNewContext(`${component}; finiteImageConsumerProjections`,{resolve,relative}));
  const files=['apps/agent-worker/src/presentation/generated-image-review.ts','apps/agent-worker/src/native-agent/journal-task-store.ts'];
  const originals=new Map(files.map(path=>[path,execFileSync('git',['show',`ca0a5b1ce6b7228e04d0212a8a96b07d8adbf4a6:${path}`],{encoding:'utf8'})]));
  const sourceRef='3a93eb49137a67b2c12ef0ca89d7327c68c8e1b5';
  const actual=await videoIngressProgram(new Map(),{sourceRef}),legacy=await videoIngressProgram(originals,{sourceRef});
  const model=project(actual.ts,videoPairContext(actual),videoPairContext(legacy));assert.equal(model.status,'conditional');
  for(const[key,value]of model.projected)assert.deepEqual(videoPairRuntime(actual.ts,value.text),videoPairRuntime(legacy.ts,originals.get(key)),key);
  for(const[path,change]of[
    [files[0],value=>value.replace('else decision = parseDecision(parseStructuredJson(result.text));','else decision = JSON.parse(result.text);')],
    [files[1],value=>value.replace("paidCompletion ? turn.state !== 'completed' : turn.state !== 'started'","paidCompletion ? turn.state === 'completed' : turn.state !== 'started'")],
  ]){
    const unsafe=await videoIngressProgram(new Map([[path,change]]),{sourceRef});
    assert.throws(()=>{
      const projected=project(unsafe.ts,videoPairContext(unsafe),videoPairContext(legacy));
      for(const[key,value]of projected.projected)assert.deepEqual(videoPairRuntime(unsafe.ts,value.text),videoPairRuntime(legacy.ts,originals.get(key)),key);
    },'legacy JSON validation and paid/live journal completion checks must be retained');
  }

  } catch (error) { videoTimeoutObservation('p85-throw', 0); throw error; }
  finally { videoTimeoutObservation('p85-exit', 0); }
});

test('image legacy source model composes historical projections and refuses current voice and live prepared-method escapes', async () => {
  videoTimeoutObservation('p86-begin', 0);
  try {

  const component=deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const project=(videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 46), runInNewContext(`${component}; finiteImageLegacySourceModel`,{resolve,relative}));
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
  const illustrationSource=current.program.getSourceFile(resolve(current.projectRoot,'apps/agent-worker/src/native-agent/illustration-task.ts'));
  const selectedTools=illustrationSource.statements.filter(current.ts.isVariableStatement).flatMap(node=>[...node.declarationList.declarations])
    .find(node=>current.ts.isIdentifier(node.name)&&node.name.text==='SELECTED_IMAGE_TOOLS');
  assert.ok(selectedTools&&current.ts.isArrayLiteralExpression(selectedTools.initializer));
  assert.throws(()=>project(current.ts,videoPairContext(current),videoPairContext(legacy)),error=>{
    assert.equal(error.reason,'IMAGE_DECLARATION_CONTEXT_UNKNOWN');
    assert.equal(error.node,selectedTools,'CURRENT must stop at its actual selected-tool declaration rather than grant an older image-only projection');
    assert.equal(error.node.getSourceFile(),illustrationSource);
    return true;
  });
  const voice=await videoIngressProgram(new Map(),{sourceRef:'1c88ff813db128fd1933096a2f102c1c1c667b25'});
  assert.throws(()=>project(voice.ts,videoPairContext(voice),videoPairContext(legacy)),error=>{
    assert.equal(error.reason,'IMAGE_DECLARATION_CONTEXT_UNKNOWN');
    assert.ok(voice.ts.isIdentifier(error.node),'the retained voice family must still identify its actual unclassified caller');
    assert.equal(error.node.text,'persistHermesVoiceTaskInTransaction');
    assert.equal(resolve(error.node.getSourceFile().fileName),resolve(voice.projectRoot,'packages/domain/src/agent/voice.ts'));
    assert.ok(voice.ts.isCallExpression(error.node.parent)&&error.node.parent.expression===error.node,
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

  } catch (error) { videoTimeoutObservation('p86-throw', 0); throw error; }
  finally { videoTimeoutObservation('p86-exit', 0); }
});

test('image capable source pair retains raw/final readers despite an absent fresh producer', async () => {
  videoTimeoutObservation('p87-begin', 0);
  try {

  const component=deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const roots=[],weak=new WeakMap();
  const methods=(videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 47), runInNewContext(`${component}; ({model:finiteImageCapableSourceModel,capable:finiteImageCapablePairCompatibility,first:finiteImageFirstPairCompatibility})`,
    {resolve,relative,rollbackProofContexts:weak,APPLICATION_ROLLBACK_READERS:roots,builtinModules}));
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

  } catch (error) { videoTimeoutObservation('p87-throw', 0); throw error; }
  finally { videoTimeoutObservation('p87-exit', 0); }
});

test('actual current host message alias preserves the video history-before-session boundary', async () => {
  videoTimeoutObservation('p88-begin', 0);
  try {

  for (const sourceRef of ['ae6cb77e45ffc3e8f1ab0e93af2008898088ae5e', '764020c76b25af571e8b88e80338406d70bdb37a']) {
    const { ts, program, projectRoot } = await videoIngressProgram(new Map(), { sourceRef });
    const host = program.getSourceFiles().find(file => file.fileName.replaceAll('\\', '/').endsWith('/native-agent/host-task.ts'));
    assert.equal(host.text, execFileSync('git', ['show', `${sourceRef}:apps/agent-worker/src/native-agent/host-task.ts`],
      { cwd: projectRoot, encoding: 'utf8' }));
    const result = deployLock.proveNativeVideoReceiptIngress(ts, program, projectRoot);
    assert.equal(result.status, 'unknown');
    assert.ok(result.proven.includes('host-before-session'), `${sourceRef}: ${result.reason}`);
    assert.equal(result.releaseCompatible, false);
  }

  } catch (error) { videoTimeoutObservation('p88-throw', 0); throw error; }
  finally { videoTimeoutObservation('p88-exit', 0); }
});

test('actual current video session preserves decoded history and checkpoints across disjoint image branches', async t => {
  videoTimeoutObservation('p89-begin', 0);
  try {

  for (const sourceRef of ['ae6cb77e45ffc3e8f1ab0e93af2008898088ae5e', '764020c76b25af571e8b88e80338406d70bdb37a']) {
    const input = await videoIngressProgram(new Map(), { sourceRef });
    const result = deployLock.proveNativeVideoReceiptIngress(input.ts, input.program, input.projectRoot);
    t.diagnostic(JSON.stringify({ sourceRef, boundary: 'source-only', reason: result.reason, proven: result.proven,
      storeGraph: result.storeGraph.status, privateStoreChain: result.privateStoreChain.status }));
    assert.ok(result.proven.includes('session-prefix'), result.reason);
    assert.ok(result.proven.includes('session-checkpoint-prefix'), result.reason);
    assert.equal(result.releaseCompatible, false);
  }

  } catch (error) { videoTimeoutObservation('p89-throw', 0); throw error; }
  finally { videoTimeoutObservation('p89-exit', 0); }
});

test('current video Session clone rejects opaque mutations and unproved containing copies before history proof', async t => {
  videoTimeoutObservation('p90-begin', 0);
  try {

  const policy = "{ sourceKind: 'illustration-image', imageReview: { ['imageResult' + 'Policy']: 'image-review-tool-final-v1' } }";
  const cases = [
    ['exact-High-Object-assign', `Object.assign(binding, ${policy});`],
    ['computed-direct-clone-write', "binding['sourceKind'] = 'illustration-image'; binding['imageReview'] = { ['imageResult' + 'Policy']: 'image-review-tool-final-v1' };"],
    ['opaque-containing-copy', `const opaque = value => Object.assign(value.holder, ${policy}); opaque({ holder: binding });`],
    ['checkpoint-binding-mutation', `Object.assign(started.binding, ${policy});`, 'if (!retry) await input.store.compareAndSet(state, started);'],
    ['checkpoint-containing-copy', `const opaque = value => Object.assign(value.checkpoint.binding, ${policy}); opaque({ checkpoint: started });`,
      'if (!retry) await input.store.compareAndSet(state, started);'],
    ['retry-binding-mutation', `if (retry) Object.assign(retry.started.binding, ${policy});`, 'const started: NativeAgentSessionState = retry?.started ??'],
    ['rejection-containing-copy', `const opaque = value => Object.assign(value.started.binding, ${policy}); if (attempt.rejection) opaque(attempt.rejection);`,
      'attempt.rejection = { started, error };', true],
  ];
  for (const [name, inserted, point, append] of cases) await t.test(name, async () => {
  videoTimeoutObservation('p90-n1-begin', 0);
  try {

    const input = await videoIngressProgram(new Map([['apps/agent-worker/src/native-agent/session.ts', value => {
      const before = point ?? 'const binding = structuredClone(input.binding);';
      assert.equal(value.split(before).length, 2);
      return value.replace(before, !point || append ? before + '\n  ' + inserted : inserted + '\n  ' + before);
    }]]),
    { sourceRef: 'ae6cb77e45ffc3e8f1ab0e93af2008898088ae5e' });
    const result = deployLock.proveNativeVideoReceiptIngress(input.ts, input.program, input.projectRoot);
    assert.ok(result.proven.includes('host-before-session'), result.reason);
    assert.ok(!result.proven.includes('session-prefix'), `${name}: ${result.reason}`);
    assert.ok(!result.proven.includes('session-checkpoint-prefix'), `${name}: ${result.reason}`);

  } catch (error) { videoTimeoutObservation('p90-n1-throw', 0); throw error; }
  finally { videoTimeoutObservation('p90-n1-exit', 0); }
});

  } catch (error) { videoTimeoutObservation('p90-throw', 0); throw error; }
  finally { videoTimeoutObservation('p90-exit', 0); }
});

test('current video Session snapshot input refuses mutations before the intrinsic clone', async t => {
  videoTimeoutObservation('p91-begin', 0);
  try {

  const policy = "{ sourceKind: 'illustration-image', imageReview: { ['imageResult' + 'Policy']: 'image-review-tool-final-v1' } }";
  for (const [name, receiver] of [['original-input', 'input.binding'], ['implicit-argument-input', 'arguments[0].binding']]) await t.test(name, async () => {
  videoTimeoutObservation('p91-n1-begin', 0);
  try {

    const input = await videoIngressProgram(new Map([['apps/agent-worker/src/native-agent/session.ts', value =>
      value.replace('const binding = structuredClone(input.binding);', `Object.assign(${receiver}, ${policy});\n  const binding = structuredClone(input.binding);`)]]),
    { sourceRef: 'ae6cb77e45ffc3e8f1ab0e93af2008898088ae5e' });
    const result = deployLock.proveNativeVideoReceiptIngress(input.ts, input.program, input.projectRoot);
    assert.ok(result.proven.includes('host-before-session'), result.reason);
    assert.ok(!result.proven.includes('session-prefix'), `${name}: ${result.reason}`);

  } catch (error) { videoTimeoutObservation('p91-n1-throw', 0); throw error; }
  finally { videoTimeoutObservation('p91-n1-exit', 0); }
});

  } catch (error) { videoTimeoutObservation('p91-throw', 0); throw error; }
  finally { videoTimeoutObservation('p91-exit', 0); }
});

test('current video Session clone refuses replacement of a checkpoint store consumer before history proof', async () => {
  videoTimeoutObservation('p92-begin', 0);
  try {

  const input = await videoIngressProgram(new Map([['apps/agent-worker/src/native-agent/session.ts', value =>
    value.replace('const binding = structuredClone(input.binding);', "const binding = structuredClone(input.binding);\n  input.store.compareAndSet = async (_state, checkpoint) => { Object.assign(checkpoint.binding, { sourceKind: 'illustration-image', imageReview: { ['imageResult' + 'Policy']: 'image-review-tool-final-v1' } }); };")]]),
  { sourceRef: 'ae6cb77e45ffc3e8f1ab0e93af2008898088ae5e' });
  const result = deployLock.proveNativeVideoReceiptIngress(input.ts, input.program, input.projectRoot);
  assert.ok(result.proven.includes('host-before-session'), result.reason);
  assert.ok(!result.proven.includes('session-prefix'), result.reason);

  } catch (error) { videoTimeoutObservation('p92-throw', 0); throw error; }
  finally { videoTimeoutObservation('p92-exit', 0); }
});

test('current video session rejects unproven profile guards and changed decoder submission suppliers', async t => {
  videoTimeoutObservation('p93-begin', 0);
  try {

  const illustration = 'apps/agent-worker/src/native-agent/illustration-task.ts', session = 'apps/agent-worker/src/native-agent/session.ts';
  const binding = 'const binding = { taskId: input.task.id, artifactId:';
  const sessionCall = 'const session = createNativeAgentSession({ gateway: input.gateway, binding, store, authorize });';
  const terminal = "if (binding.sourceKind === 'illustration-image' && binding.imageReview.imageResultPolicy === 'image-review-tool-final-v1') {";
  const rawPrefix = "if (binding.sourceKind === 'illustration-image' && binding.imageReview.imageResultPolicy === 'image-review-tool-final-v1'\n        && messages.some";
  const last = (value, before, after) => {
    const index = value.lastIndexOf(before); assert.ok(index >= 0);
    return value.slice(0, index) + after + value.slice(index + before.length);
  };
  const cases = [
    ['direct-image-kind', illustration, value => value.replace(binding, "const binding = { sourceKind: 'illustration-image', taskId: input.task.id, artifactId:")],
    ['computed-kind', illustration, value => value.replace(binding, "const binding = { ['source' + 'Kind']: 'illustration-image', taskId: input.task.id, artifactId:")],
    ['literal-kind-spread', illustration, value => value.replace(binding, "const binding = { ...{ sourceKind: 'illustration-image' }, taskId: input.task.id, artifactId:")],
    ['conditional-kind-spread', illustration, value => value.replace(binding, "const binding = { ...(nativeVideo ? { sourceKind: 'illustration-image' } : {}), taskId: input.task.id, artifactId:")],
    ['opaque-binding-spread', illustration, value => value.replace(binding, 'const binding = { ...input.opaqueBinding, taskId: input.task.id, artifactId:')],
    ['mutable-binding', illustration, value => value.replace(binding, 'let binding = { taskId: input.task.id, artifactId:')],
    ['mutated-kind', illustration, value => value.replace(sessionCall, "binding['sourceKind'] = 'illustration-image';\n  " + sessionCall)],
    ['escaped-binding', illustration, value => value.replace(sessionCall, "Object.assign(binding, { sourceKind: 'illustration-image' });\n  " + sessionCall)],
    ['binding-alias', illustration, value => value.replace(sessionCall, 'const escapedBinding = binding;\n  ' + sessionCall)],
    ['unawaited-entry-authorization', session, value => value.replace('async function completeOnce(raw: unknown) {\n      await authorize();',
      'async function completeOnce(raw: unknown) {\n      authorize();')],
    ['unknown-entry-effect', session, value => value.replace('async function completeOnce(raw: unknown) {\n      await authorize();',
      'async function completeOnce(raw: unknown) {\n      await authorize(); opaque();')],
    ['terminal-profile-guard', session, value => value.replace(terminal, terminal.replace("'illustration-image'", "'paper'"))],
    ['terminal-effect-before-guard', session, value => value.replace(terminal, terminal.replace('if (', 'if (opaque() && '))],
    ['raw-effect-before-guard', session, value => value.replace(rawPrefix, rawPrefix.replace('if (', 'if (opaque() && '))],
    ['wrong-parser', session, value => value.replace('nativeAgentSdkRequest(raw, binding.model)', 'otherSdkRequest(raw, binding.model)')],
    ['wrong-raw-request', session, value => value.replace('nativeAgentSdkRequest(raw, binding.model)', 'nativeAgentSdkRequest({}, binding.model)')],
    ['wrong-decoder-model', session, value => value.replace('nativeAgentSdkRequest(raw, binding.model)', 'nativeAgentSdkRequest(raw, input.otherModel)')],
    ['state-before-decoder', session, value => value.replace('const { messages, options } = nativeAgentSdkRequest(raw, binding.model);\n      let state = await read();',
      'let state = await read();\n      const { messages, options } = nativeAgentSdkRequest(raw, binding.model);')],
    ['wrong-state-supplier', session, value => value.replace('let state = await read();', 'let state = await input.store.read();')],
    ['different-common-history', session, value => value.replace('checkHistory(messages, state);', 'checkHistory([], state);')],
    ['unawaited-text-submit-authorization', session, value => last(value,
      'await authorize(); state = await read(); checkHistory(messages, state);', 'authorize(); state = await read(); checkHistory(messages, state);')],
    ['different-text-submit-history', session, value => last(value, 'checkHistory(messages, state);', 'checkHistory([], state);')],
    ['different-text-submit-read', session, value => last(value, 'state = await read(); checkHistory(messages, state);',
      'state = await otherRead(); checkHistory(messages, state);')],
    ['different-text-supplier', session, value => value.replace('input.gateway.nativeAgentComplete(messages, boundedOptions,',
      'input.gateway.otherComplete(messages, boundedOptions,')],
    ['different-text-request', session, value => value.replace('input.gateway.nativeAgentComplete(messages, boundedOptions,',
      'input.gateway.nativeAgentComplete([], boundedOptions,')],
    ['unbound-text-submit-callback', session, value => last(value, 'submitProvider: async (target, submit) =>', 'unusedProvider: async (target, submit) =>')],
    ['different-retry-checkpoint', session, value => value.replace('retry?.started ??', 'state ??'), 'session-checkpoint-prefix'],
  ];
  for (const [name, file, change, cutoff = 'session-prefix'] of cases) await t.test(name, async () => {
  videoTimeoutObservation('p93-n1-begin', 0);
  try {

    const input = await videoIngressProgram(new Map([[file, change]]), { sourceRef: 'ae6cb77e45ffc3e8f1ab0e93af2008898088ae5e' });
    const result = deployLock.proveNativeVideoReceiptIngress(input.ts, input.program, input.projectRoot);
    assert.ok(result.proven.includes('host-before-session'), `${name} must reach this actual Session boundary: ${result.reason}`);
    assert.ok(!result.proven.includes(cutoff), `${name}: ${result.reason}`);
    assert.equal(result.releaseCompatible, false);

  } catch (error) { videoTimeoutObservation('p93-n1-throw', 0); throw error; }
  finally { videoTimeoutObservation('p93-n1-exit', 0); }
});

  } catch (error) { videoTimeoutObservation('p93-throw', 0); throw error; }
  finally { videoTimeoutObservation('p93-exit', 0); }
});

test('actual image Host attempt is bound to its guarded fresh task snapshot', async t => {
  videoTimeoutObservation('p94-begin', 0);
  try {

  for (const sourceRef of ['ae6cb77e45ffc3e8f1ab0e93af2008898088ae5e', '764020c76b25af571e8b88e80338406d70bdb37a']) {
    const input = await videoIngressProgram(new Map(), { sourceRef });
    const result = deployLock.proveNativeVideoReceiptIngress(input.ts, input.program, input.projectRoot);
    t.diagnostic(JSON.stringify({ sourceRef, boundary: 'source-only', reason: result.reason, proven: result.proven, at: result.at }));
    assert.ok(result.storeGraph.hosts.some(host => host.at.file.endsWith('/native-agent/illustration-task.ts') && host.at.line === 141), result.reason);
    assert.equal(result.releaseCompatible, false);
  }

  } catch (error) { videoTimeoutObservation('p94-throw', 0); throw error; }
  finally { videoTimeoutObservation('p94-exit', 0); }
});

test('actual image finalizer consumers preserve the bounded store and completed state', async t => {
  videoTimeoutObservation('p95-begin', 0);
  try {

  for (const sourceRef of ['ae6cb77e45ffc3e8f1ab0e93af2008898088ae5e', '764020c76b25af571e8b88e80338406d70bdb37a']) {
    const input = await videoIngressProgram(new Map(), { sourceRef });
    const result = deployLock.proveNativeVideoReceiptIngress(input.ts, input.program, input.projectRoot);
    t.diagnostic(JSON.stringify({ sourceRef, reason: result.reason, at: result.at, proven: result.proven }));
    assert.equal(result.storeGraph.finalizations?.length, 2, result.reason);
    assert.ok(result.storeGraph.finalizations.some(row => row.file.endsWith('/native-agent/illustration-task.ts') && row.line === 126));
    assert.ok(result.storeGraph.finalizations.some(row => row.file.endsWith('/native-agent/session.ts') && row.line === 215));
    assert.ok(result.proven.includes('session-checkpoint-prefix'), result.reason);
    assert.equal(result.privateStoreChain.status, 'conditional', 'the joined serializer retains the private-chain obligations');
    assert.equal(result.reason, 'OTHER_PERSISTENCE_ORIGINS_UNPROVEN', 'report the original remaining origins after the joined store proof');
    assert.ok(result.proven.includes('store-capability-use'));
    assert.equal(result.releaseCompatible, false);
  }

  } catch (error) { videoTimeoutObservation('p95-throw', 0); throw error; }
  finally { videoTimeoutObservation('p95-exit', 0); }
});

test('actual image checkpoint normalization keeps captured attempt and raw receipt identity', async t => {
  videoTimeoutObservation('p96-begin', 0);
  try {

  for (const sourceRef of ['ae6cb77e45ffc3e8f1ab0e93af2008898088ae5e', '764020c76b25af571e8b88e80338406d70bdb37a']) {
    const input = await videoIngressProgram(new Map(), { sourceRef });
    const result = deployLock.proveNativeVideoReceiptIngress(input.ts, input.program, input.projectRoot);
    t.diagnostic(JSON.stringify({ sourceRef, reason: result.reason, at: result.at, proven: result.proven }));
    assert.equal(result.storeGraph.finalizations?.length, 2, result.reason);
    assert.ok(result.privateStoreChain.normalization, result.reason);
    assert.equal(result.privateStoreChain.normalization.reference.file, 'apps/agent-worker/src/native-agent/task-store.ts');
    assert.ok(result.proven.includes('session-checkpoint-prefix'), result.reason);
    assert.equal(result.privateStoreChain.status, 'conditional');
    assert.equal(result.reason, 'OTHER_PERSISTENCE_ORIGINS_UNPROVEN');
    assert.ok(result.proven.includes('generic-private-store-chain'));
    assert.equal(result.releaseCompatible, false);
  }

  } catch (error) { videoTimeoutObservation('p96-throw', 0); throw error; }
  finally { videoTimeoutObservation('p96-exit', 0); }
});

test('image checkpoint normalization rejects lost source policy and private reference order', async t => {
  videoTimeoutObservation('p97-begin', 0);
  try {

  const store = 'apps/agent-worker/src/native-agent/task-store.ts';
  const replace = (from, to) => value => { assert.ok(value.includes(from), from); return value.replace(from, to); };
  const persist = change => value => {
    const a = value.indexOf('  async function persist('), b = value.indexOf('  async function update(', a);
    assert.ok(a >= 0 && b > a); const before = value.slice(a, b), after = change(before); assert.notEqual(after, before);
    return value.slice(0, a) + after + value.slice(b);
  };
  const serializer = ['PRIVATE_SERIALIZER_ORIGIN_UNKNOWN'];
  const cases = [
    ['swapped-source-attempt-arms', replace("binding.sourceKind === 'illustration-image' ? binding.imageReview.executionAttempt : input.executionAttempt",
      "binding.sourceKind === 'illustration-image' ? input.executionAttempt : binding.imageReview.executionAttempt"), ['STORE_HOST_IDENTITY_UNKNOWN']],
    ['wrong-image-attempt-receiver', replace("binding.sourceKind === 'illustration-image' ? binding.imageReview.executionAttempt : input.executionAttempt",
      "binding.sourceKind === 'illustration-image' ? input.taskId : input.executionAttempt"), ['STORE_HOST_IDENTITY_UNKNOWN']],
    ['wrong-raw-only-supplier', replace("const rawOnly = turn.state === 'received';", "const rawOnly = turn.state === 'started';"), serializer],
    ['wrong-raw-reference-state', replace("state: rawOnly ? 'completed' : turn.state", "state: rawOnly ? 'received' : turn.state"), serializer],
    ['missing-persist-policy', replace('imageResultPolicy: binding.imageReview.imageResultPolicy,', 'imageResultPolicy: undefined,'), ['IMAGE_PROTOCOL_PARTITION_UNKNOWN']],
    ['raw-marked-decoded', replace("received: rawOnly ? 'raw-only' as const : 'decoded' as const", "received: rawOnly ? 'decoded' as const : 'decoded' as const"), serializer],
    ['missing-read-policy', replace('|| cp.imageResultPolicy !== input.execution.imageResultPolicy', '|| false'), serializer],
    ['missing-response-absence', replace("Object.hasOwn(turn, 'response')", 'false'), serializer],
    ['wrong-received-policy', replace('turn.received.policy !== cp.imageResultPolicy', 'turn.received.policy !== binding.model'), serializer],
    ['wrong-image-source-identity', persist(replace('sourceEvidenceIdentity: binding.imageReview.sourceEvidenceIdentity', 'sourceEvidenceIdentity: binding.imageReview.parentIdentity')), serializer],
    ['wrong-inverse-source-identity', replace('isDeepStrictEqual(cp.imageIdentity,', 'isDeepStrictEqual(cp.unprovedIdentity,'), serializer],
    ['ordinary-source-contamination', replace(': { artifactId: binding.artifactId, documentSha256: binding.documentSha256, sourceMapHash: binding.sourceMapHash }',
      ": { artifactId: binding.artifactId, documentSha256: binding.documentSha256, sourceMapHash: binding.sourceMapHash, received: 'decoded' }"), serializer],
    ['wrong-serialized-bytes', persist(replace('Buffer.from(JSON.stringify(state))', 'Buffer.from(JSON.stringify({}))')), serializer],
    ['wrong-serialized-hash', persist(replace('const hash = sha(bytes);', "const hash = sha(Buffer.from('wrong'));")), serializer],
    ['late-source-override', replace('...source, executionAttempt:', "...source, serializedSha256: 'wrong', executionAttempt:"), serializer],
    ['wrong-private-cas-expected', replace('expected: old,', 'expected: input.execution.checkpoint,'), ['PRIVATE_CAS_REFERENCE_UNKNOWN']],
    ['premature-known-registration', value => {
      assert.ok(value.includes('    known.set(next.serializedSha256, next);'));
      return value.replace('    known.set(next.serializedSha256, next);', '')
        .replace('const prepared = await persist(state); next = prepared.reference;',
          'const prepared = await persist(state); next = prepared.reference; known.set(next.serializedSha256, next);');
    }, ['PRIVATE_KNOWN_REGISTRATION_ORDER_UNKNOWN']],
  ];
  const component = deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const flow = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 48), runInNewContext(`${component}; finiteImageStoreFlowTerms`, { resolve, relative }));
  for (const [name, change, reasons] of cases) await t.test(name, async () => {
  videoTimeoutObservation('p97-n1-begin', 0);
  try {

    const input = await videoIngressProgram(new Map([[store, change]]), { sourceRef: 'ae6cb77e45ffc3e8f1ab0e93af2008898088ae5e' });
    const result = deployLock.proveNativeVideoReceiptIngress(input.ts, input.program, input.projectRoot);
    assert.equal(result.status, 'unknown', name);
    assert.ok(reasons.includes(result.reason), `${name}: ${result.reason}`);
    assert.equal(result.proven.includes('generic-private-store-chain'), false, 'changed metadata/order cannot be hidden by the later remaining origins');
    if (result.reason === 'STORE_HOST_IDENTITY_UNKNOWN') {
      assert.equal(result.at.file, 'apps/agent-worker/src/native-agent/illustration-task.ts'); assert.equal(result.at.line, 141);
      assert.throws(() => flow(input.ts, videoPairContext(input)), error => error.reason === 'IMAGE_STORE_FLOW_UNKNOWN');
    }
    if (result.reason === 'IMAGE_PROTOCOL_PARTITION_UNKNOWN') {
      assert.equal(result.proven.includes('session-prefix'), false, 'the original protocol partition refuses before either consumer proof');
      assert.equal(result.privateStoreChain.normalization, undefined);
      assert.throws(() => flow(input.ts, videoPairContext(input)), error => error.reason === 'IMAGE_PROTOCOL_PARTITION_UNKNOWN');
    }
    assert.equal(result.releaseCompatible, false);

  } catch (error) { videoTimeoutObservation('p97-n1-throw', 0); throw error; }
  finally { videoTimeoutObservation('p97-n1-exit', 0); }
});

  } catch (error) { videoTimeoutObservation('p97-throw', 0); throw error; }
  finally { videoTimeoutObservation('p97-exit', 0); }
});

test('image finalizer rejects changed validation state consumers and final-mode suppliers', async t => {
  videoTimeoutObservation('p98-begin', 0);
  try {

  const session = 'apps/agent-worker/src/native-agent/session.ts', route = 'apps/agent-worker/src/native-agent/illustration-task.ts';
  const store = 'apps/agent-worker/src/native-agent/task-store.ts';
  const finalizer = change => value => {
    const start = value.indexOf('export async function finalizeNativeImageReviewState('), end = value.indexOf('/** Owns SDK', start);
    assert.ok(start >= 0 && end > start); const before = value.slice(start, end), after = change(before); assert.notEqual(after, before);
    return value.slice(0, start) + after + value.slice(end);
  };
  const replace = (from, to) => value => { assert.ok(from instanceof RegExp ? from.test(value) : value.includes(from), String(from)); return value.replace(from, to); };
  const finalReason = ['STORE_FINALIZER_CONSUMER_UNKNOWN'];
  const modeReason = ['IMAGE_STORE_FLOW_UNKNOWN', 'STORE_UPDATE_SUPPLIER_UNKNOWN', 'STORE_RETURN_UNKNOWN', 'STORE_HOST_IDENTITY_UNKNOWN'];
  const component = deployLockSource.slice(deployLockSource.indexOf('function finiteImageProducerTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const flow = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 49), runInNewContext(`${component}; finiteImageStoreFlowTerms`, { resolve, relative }));
  const cases = [
    ['late-validator', session, finalizer(replace(/const final = nativeImageReviewFinal\(state\);\r?\n  if \(state.validatedFinal\) return state;/u,
      'if (state.validatedFinal) return state;\n  const final = nativeImageReviewFinal(state);')), finalReason],
    ['removed-validator', session, finalizer(replace('nativeImageReviewFinal(state)', 'state.validatedFinal')), finalReason],
    ['awaited-validator', session, finalizer(replace('nativeImageReviewFinal(state)', 'await nativeImageReviewFinal(state)')), finalReason],
    ['final-declaration-effect', session, finalizer(replace('const final = nativeImageReviewFinal(state);',
      'const final = nativeImageReviewFinal(state), leaked = opaque(state);')), finalReason],
    ['next-declaration-effect', session, finalizer(replace('const next = { ...state, validatedFinal: final };',
      'const next = { ...state, validatedFinal: final }, leaked = opaque(state);')), finalReason],
    ['rest-state-receiver', session, finalizer(replace('state: NativeAgentSessionState)', '...state: any)')), finalReason, true],
    ['rest-final-wrapper-receiver', store, replace("finalize: (previous, state) => update(previous, state, 'final')",
      "finalize: (previous, ...state) => update(previous, state, 'final')"), finalReason, true],
    ['wrong-validator-symbol', session, finalizer(replace('nativeImageReviewFinal(state)', 'deriveNativeImageReviewFinal(state)')), finalReason],
    ['already-final-bypass', session, finalizer(replace('if (state.validatedFinal) return state;', 'if (state.validatedFinal) return { ...state };')), finalReason],
    ['missing-finalize-guard', session, finalizer(replace("if (!store.finalize) blocked('pure image finalization is unavailable');", '')), finalReason],
    ['unawaited-finalize', session, finalizer(replace('await store.finalize(state, next)', 'store.finalize(state, next)')), finalReason],
    ['different-finalize-receiver', session, finalizer(replace('await store.finalize(state, next)', 'await opaque.finalize(state, next)')), finalReason],
    ['swapped-state', session, finalizer(replace('store.finalize(state, next)', 'store.finalize(next, state)')), finalReason],
    ['wrong-next', session, finalizer(replace('store.finalize(state, next)', 'store.finalize(state, state)')), finalReason],
    ['next-turn-override', session, finalizer(replace('{ ...state, validatedFinal: final }', '{ ...state, validatedFinal: final, turns: [] }')), finalReason],
    ['next-binding-override', session, finalizer(replace('{ ...state, validatedFinal: final }', '{ ...state, validatedFinal: final, binding: opaque }')), finalReason],
    ['wrong-return-value', session, finalizer(replace('return next;', 'return state;')), finalReason],
    ['async-rejection', session, replace('function blocked(reason: string): never', 'async function blocked(reason: string): Promise<never>'), finalReason],
    ['state-escape', session, finalizer(replace('const final = nativeImageReviewFinal(state);', 'opaque(state); const final = nativeImageReviewFinal(state);')), finalReason],
    ['whole-store-escape', session, finalizer(replace('const final = nativeImageReviewFinal(state);', 'opaque(store); const final = nativeImageReviewFinal(state);')), finalReason],
    ['route-state-mutation', route, replace('const prior = saved?.turns.at(-1);', 'opaque(saved); const prior = saved?.turns.at(-1);'), finalReason],
    ['route-wrong-state', route, replace('finalizeNativeImageReviewState(store, saved)', 'finalizeNativeImageReviewState(store, structuredClone(saved))'), finalReason],
    ['route-wrong-store', route, replace('finalizeNativeImageReviewState(store, saved)', 'finalizeNativeImageReviewState({ ...store }, saved)'), finalReason],
    ['additional-helper-caller', route, value => value + '\nexport async function unprovedFinal(store: any,state: any) { return await finalizeNativeImageReviewState(store,state); }\n', finalReason],
    ['helper-alias', route, replace('const saved = await store.read();', 'const saved = await store.read(); const hiddenFinalizer = finalizeNativeImageReviewState;'), ['FACTORY_ALIAS_OR_ESCAPE_UNKNOWN']],
    ['received-state-mutation', session, replace('if (!receivedState) blocked', 'opaque(receivedState); if (!receivedState) blocked'), finalReason],
    ['received-state-alias', session, replace('if (!receivedState) blocked', 'const leaked = receivedState; if (!receivedState) blocked'), finalReason],
    ['received-wrong-completion', session, replace('await input.store.complete(started, receivedState);', 'await input.store.complete(started, started);'), finalReason],
    ['raw-wrong-cas-previous', session, replace('await input.store.compareAndSet(state, started);', 'await input.store.compareAndSet(null, started);'), finalReason],
    ['raw-store-escape', session, replace('if (!receivedState) blocked', 'opaque(input.store); if (!receivedState) blocked'), finalReason],
    ['raw-store-replacement', session, replace('if (!receivedState) blocked', 'input.store.complete = opaque; if (!receivedState) blocked'), finalReason],
    ['raw-reflection', session, replace('if (!receivedState) blocked', 'eval("receivedState.binding = opaque"); if (!receivedState) blocked'), finalReason],
    ['unproved-live-consumer', session, replace('let retry: { started:', 'opaque(input.store); let retry: { started:'), ['SESSION_REQUEST_NOT_DECODED']],
    ['changed-profile-partition', session, replace(/if \(binding.sourceKind === 'illustration-image' && binding.imageReview.imageResultPolicy === 'image-review-tool-final-v1'\r?\n        && messages.some/u, "if (binding.sourceKind === 'paper' && binding.imageReview.imageResultPolicy === 'image-review-tool-final-v1'\n        && messages.some"), ['IMAGE_PROTOCOL_PARTITION_UNKNOWN']],
    ['extra-factory-method', store, replace('compareAndSet: (previous, state)', 'opaqueWriter() {}, compareAndSet: (previous, state)'), modeReason],
    ['duplicate-factory-member', store, replace('compareAndSet: (previous, state)', 'read: () => null, compareAndSet: (previous, state)'), modeReason],
    ['computed-factory-member', store, replace('compareAndSet: (previous, state)', "['compareAndSet']: (previous, state)"), modeReason],
    ['getter-factory-member', store, replace("finalize: (previous, state) => update(previous, state, 'final')", "get finalize() { return (previous, state) => update(previous, state, 'final'); }"), modeReason],
    ['wrong-final-wrapper', store, replace("finalize: (previous, state) => update(previous, state, 'final')", "finalize: (previous, state) => opaque(previous, state, 'final')"), modeReason],
    ['swapped-wrapper-state', store, replace("finalize: (previous, state) => update(previous, state, 'final')", "finalize: (previous, state) => update(state, previous, 'final')"), modeReason],
    ['paid-substitutes-final', store, replace("finalize: (previous, state) => update(previous, state, 'final')", "finalize: (previous, state) => update(previous, state, 'paid')"), modeReason],
    ['start-substitutes-paid', store, replace("complete: (previous, state) => update(previous, state, 'paid')", "complete: (previous, state) => update(previous, state, 'start')"), modeReason],
    ['missing-final-cas-flag', store, replace('validatedFinalization: true', 'validatedFinalization: false'), modeReason],
    ['paid-final-cas-flag', store, replace("...(mode === 'final' ? { validatedFinalization: true }", "...(mode === 'paid' ? { validatedFinalization: true }"), modeReason],
    ['missing-final-authority-guard', store, replace('previous.validatedFinal || !input.authorizeFinal', 'previous.validatedFinal || false'), modeReason],
    ['missing-final-authorization', store, replace('await input.authorizeFinal!(tx)', 'await input.authorize(tx)'), modeReason],
    ['wrong-final-authority-supplier', route, replace('authorizeFinal: tx => authorize(tx)', 'authorizeFinal: tx => authorize(tx, true)'), modeReason],
  ];
  for (const [name, file, change, reasons, noFinalizations] of cases) await t.test(name, async () => {
  videoTimeoutObservation('p98-n1-begin', 0);
  try {

    const input = await videoIngressProgram(new Map([[file, change]]), { sourceRef: 'ae6cb77e45ffc3e8f1ab0e93af2008898088ae5e' });
    const result = deployLock.proveNativeVideoReceiptIngress(input.ts, input.program, input.projectRoot);
    assert.equal(result.status, 'unknown', name);
    assert.ok(reasons.includes(result.reason), `${name}: ${result.reason}`);
    if (noFinalizations) assert.equal(result.storeGraph.finalizations, undefined, 'unsupported receiver semantics cannot prove either finalizer call');
    if (result.reason === 'STORE_HOST_IDENTITY_UNKNOWN') {
      assert.equal(result.at.file, route); assert.equal(result.at.line, 141);
      assert.throws(() => flow(input.ts, videoPairContext(input)), error => error.reason === 'IMAGE_STORE_FLOW_UNKNOWN',
        'the earlier Host refusal must be caused by this original mode supplier, not another guard');
    }
    assert.equal(result.releaseCompatible, false, name);
    assert.notEqual(result.reason, 'PRIVATE_SERIALIZER_ORIGIN_UNKNOWN', 'the honest next refusal must not conceal this changed obligation');

  } catch (error) { videoTimeoutObservation('p98-n1-throw', 0); throw error; }
  finally { videoTimeoutObservation('p98-n1-exit', 0); }
});

  } catch (error) { videoTimeoutObservation('p98-throw', 0); throw error; }
  finally { videoTimeoutObservation('p98-exit', 0); }
});

test('image Host guarded attempt rejects unproved dominance snapshots and changed consumers', async t => {
  videoTimeoutObservation('p99-begin', 0);
  try {

  const illustration = 'apps/agent-worker/src/native-agent/illustration-task.ts', session = 'apps/agent-worker/src/native-agent/session.ts';
  const editRoute = change => value => {
    const start = value.indexOf('export async function runNativeImageReviewTask('), end = value.indexOf('\nfunction stopped(', start);
    assert.ok(start >= 0 && end > start);
    const before = value.slice(start, end), after = change(before); assert.notEqual(after, before);
    return value.slice(0, start) + after + value.slice(end);
  };
  const editGuard = change => editRoute(value => {
    const start = value.indexOf('  if (!input.gateway || !input.inboxRoot || !input.runtime');
    const end = value.indexOf('stopped();', start) + 'stopped();'.length;
    assert.ok(start >= 0 && end > start);
    return value.slice(0, start) + change(value.slice(start, end)) + value.slice(end);
  });
  const afterRead = text => editRoute(value => value.replace('const saved = await store.read();', 'const saved = await store.read();\n  ' + text));
  const afterGuard = text => editGuard(value => value + '\n  ' + text);
  const cases = [
    ['missing-guard', illustration, editGuard(value => value.replace(' || input.task.executionAttempt !== envelope.executionAttempt', ''))],
    ['inverted-guard', illustration, editGuard(value => value.replace('input.task.executionAttempt !== envelope.executionAttempt', 'input.task.executionAttempt === envelope.executionAttempt'))],
    ['nonterminal-stop', illustration, value => value.replace('function stopped(): never { throw', 'function stopped(): never { return; throw')],
    ['async-stop', illustration, value => value.replace('function stopped(): never', 'async function stopped(): never')],
    ['swallowed-stop', illustration, editGuard(value => 'try { ' + value + ' } catch {}')],
    ['wrong-task-guard', illustration, editGuard(value => value.replace('input.task.executionAttempt', 'input.otherTask.executionAttempt'))],
    ['wrong-envelope-field', illustration, editGuard(value => value.replace('!== envelope.executionAttempt', '!== envelope.requestId'))],
    ['nested-guard', illustration, editGuard(value => 'if (input.gateway) { ' + value + ' }')],
    ['capture-before-guard-mutation', illustration, afterRead('input.task.executionAttempt += 1; envelope.executionAttempt = input.task.executionAttempt;')],
    ['after-guard-mutation', illustration, afterGuard('envelope.executionAttempt += 1;')],
    ['task-alias', illustration, afterRead('const escaped = input.task;')],
    ['opaque-input', illustration, afterRead('opaque(input);')],
    ['envelope-alias', illustration, afterRead('const escaped = envelope;')],
    ['opaque-envelope-copy', illustration, afterGuard('opaque({ envelope });')],
    ['reflective-local-mutation', illustration, afterRead('eval("input.task.executionAttempt += 1; envelope.executionAttempt = input.task.executionAttempt");')],
    ['arguments-task-mutation', illustration, afterRead('arguments[0].task.executionAttempt += 1;')],
    ['wrong-store', illustration, editRoute(value => value.replace('session, store, authorize: callAuthority,', 'session, store: input.otherStore, authorize: callAuthority,'))],
    ['wrong-session', illustration, editRoute(value => value.replace('session, store, authorize: callAuthority,', 'session: input.otherSession, store, authorize: callAuthority,'))],
    ['wrong-Host', illustration, editRoute(value => value.replace('await runHostedNativeTask(', 'await otherHostedTask('))],
    ...['taskId', 'runtimeId', 'model'].map(key => [`changed-${key}`, illustration,
      editRoute(value => value.replace('config: { ...binding, goal:', `config: { ...binding, ${key}: 'wrong', goal:`))]),
    ['Session-original-binding-mutation', session, value => value.replace('const binding = structuredClone(input.binding);',
      "input.binding.imageReview.executionAttempt += 1;\n  const binding = structuredClone(input.binding);")],
  ];
  for (const [name, file, change] of cases) await t.test(name, async () => {
  videoTimeoutObservation('p99-n1-begin', 0);
  try {

    const input = await videoIngressProgram(new Map([[file, change]]), { sourceRef: 'ae6cb77e45ffc3e8f1ab0e93af2008898088ae5e' });
    const source = input.program.getSourceFiles().find(value => value.fileName.replaceAll('\\', '/').endsWith('/native-agent/illustration-task.ts'));
    const owner = source.statements.find(node => input.ts.isFunctionDeclaration(node) && node.name?.text === 'runNativeImageReviewTask');
    const statement = owner.body.statements.find(node => input.ts.isVariableStatement(node)
      && node.declarationList.declarations.some(value => value.name.text === 'native'));
    const line = source.getLineAndCharacterOfPosition(statement.declarationList.declarations[0].initializer.getStart()).line + 1;
    const result = deployLock.proveNativeVideoReceiptIngress(input.ts, input.program, input.projectRoot);
    assert.ok(!result.storeGraph.hosts.some(host => host.at.file.endsWith('/native-agent/illustration-task.ts') && host.at.line === line), `${name}: ${result.reason}`);
    assert.equal(result.releaseCompatible, false);

  } catch (error) { videoTimeoutObservation('p99-n1-throw', 0); throw error; }
  finally { videoTimeoutObservation('p99-n1-exit', 0); }
});

  } catch (error) { videoTimeoutObservation('p99-throw', 0); throw error; }
  finally { videoTimeoutObservation('p99-exit', 0); }
});

test('current host message alias rejects changed history and suppliers using actual source symbols', async t => {
  videoTimeoutObservation('p100-begin', 0);
  try {

  const sourceRef = 'ae6cb77e45ffc3e8f1ab0e93af2008898088ae5e';
  const host = 'apps/agent-worker/src/native-agent/host-task.ts';
  const cases = [
    ['unawaited-history', value => value.replace('await validateSourceHistory(value);', 'validateSourceHistory(value);')],
    ['late-history', value => value.replace('await validateSourceHistory(value);\n        const response = await input.session.complete(value);',
      'const response = await input.session.complete(value);\n        await validateSourceHistory(value);')],
    ['different-request', value => value.replace('validateSourceHistory(value);', 'validateSourceHistory({ ...value });'), 'HOST_HISTORY_ARGUMENT_UNBOUND'],
    ['wrong-alias-supplier', value => value.replace('const message = response.choices[0]!.message;', 'const message = value;')],
    ['mutable-alias', value => value.replace('const message =', 'let message =')],
    ['alias-call', value => value.replace('const message = response.choices[0]!.message;', 'const message = escape(response.choices[0]!.message);')],
    ['alias-getter', value => value.replace('const message = response.choices[0]!.message;',
      'const message = { get tool_calls() { return response.choices[0]!.message.tool_calls; } };')],
    ['alias-escape', value => value.replace('sequence: toolSequence++,', 'sequence: (escape(message), toolSequence++),')],
    ['different-slot-source', value => value.replace('message.tool_calls ?? [] : []', 'value.tool_calls ?? [] : []')],
    ['preauthorized-slots', value => value.replace('authorized: false, called: false', 'authorized: true, called: false')],
    ['different-response-return', value => value.replace('return respond(res, 200, response);', 'return respond(res, 200, message);')],
    ['extra-effect', value => value.replace('const message = response.choices[0]!.message;', 'const message = response.choices[0]!.message; escape(message);')],
  ];
  const chatOnly = change => value => {
    const start = value.indexOf("      if (req.url === '/v1/chat/completions') {");
    const end = value.indexOf('      if (!record(value)) blocked();', start);
    assert.ok(start >= 0 && end > start);
    const before = value.slice(start, end), after = change(before);
    assert.notEqual(after, before);
    return value.slice(0, start) + after + value.slice(end);
  };
  for (const [name, change, reason = 'HOST_HISTORY_CHECK_BYPASS'] of cases) await t.test(name, async () => {
  videoTimeoutObservation('p100-n1-begin', 0);
  try {

    const input = await videoIngressProgram(new Map([[host, chatOnly(change)]]), { sourceRef });
    const result = deployLock.proveNativeVideoReceiptIngress(input.ts, input.program, input.projectRoot);
    assert.equal(result.reason, reason);
    assert.ok(!result.proven.includes('host-before-session'));
    assert.equal(result.releaseCompatible, false);

  } catch (error) { videoTimeoutObservation('p100-n1-throw', 0); throw error; }
  finally { videoTimeoutObservation('p100-n1-exit', 0); }
});
  await t.test('renamed-local-response-and-message-remain-bound', async () => {
  videoTimeoutObservation('p100-n2-begin', 0);
  try {

    const input = await videoIngressProgram(new Map([[host, chatOnly(value => value.replace(/\bresponse\b/gu, 'completion')
      .replace('const message =', 'const reply =').replace("'tool_calls' in message", "'tool_calls' in reply")
      .replace('message.tool_calls', 'reply.tool_calls'))]]), { sourceRef });
    const result = deployLock.proveNativeVideoReceiptIngress(input.ts, input.program, input.projectRoot);
    assert.ok(result.proven.includes('host-before-session'), result.reason);
    assert.equal(result.releaseCompatible, false);

  } catch (error) { videoTimeoutObservation('p100-n2-throw', 0); throw error; }
  finally { videoTimeoutObservation('p100-n2-exit', 0); }
});

  } catch (error) { videoTimeoutObservation('p100-throw', 0); throw error; }
  finally { videoTimeoutObservation('p100-exit', 0); }
});

test('current and exact capable video ingress compose hybrid whole receipts through the original conditional chain', async () => {
  videoTimeoutObservation('p101-begin', 0);
  try {

  // Actual597's original prover/fixture established EXTRA_MATERIALIZER_CALLER.
  // Each ACTUAL Program/checker must supply the full wrapper/selected/receipt
  // trace before entering the original conditional store chain. This fixture
  // is neither an installed collector context nor release permission.
  const components = selectedGuideSourceComponents();
  for (const sourceRef of [undefined, '5979840b31d6aa02e5350b0e63c8c2c8b049b133']) {
    const input = await videoIngressProgram(new Map(), { sourceRef });
    const entry = components.illustrationWitness(input.ts, videoPairContext(input));
    const file = input.program.getSourceFile(resolve(input.projectRoot, 'apps/agent-worker/src/native-agent/illustration-task.ts'));
    assert.ok(entry.source === file, 'witness source must be the exact actual SourceFile');
    assert.ok(entry.core.getSourceFile() === file, 'core must belong to the exact actual SourceFile');
    assert.ok(entry.wrapper.getSourceFile() === file, 'wrapper must belong to the exact actual SourceFile');
    assert.deepEqual([...entry.constructors].map(call => {
      let owner = call.parent; while (owner && !(input.ts.isFunctionLike(owner) && owner.body)) owner = owner.parent;
      return owner?.name?.text;
    }).sort(), ['replayNativeVideoPlan', 'runNativeIllustrationTaskCore']);
    assert.equal(entry.coreCalls.length, 2);
    assert.equal(entry.ordinaryCalls.length, 1);
    assert.equal(entry.selectedCalls.length, 1);
    assert.ok(entry.selectedCoreCall.arguments[0].getSourceFile() === file, 'selected argument must belong to the exact actual SourceFile');
    const result = deployLock.proveNativeVideoReceiptIngress(input.ts, input.program, input.projectRoot);
    assert.equal(result.status, 'unknown');
    assert.equal(result.reason, 'OTHER_PERSISTENCE_ORIGINS_UNPROVEN', JSON.stringify({ reason: result.reason, at: result.at }));
    assert.equal(result.proven.length, 8, JSON.stringify({ reason: result.reason, at: result.at, proven: result.proven }));
    assert.ok(result.proven.includes('materializer-host'));
    assert.ok(result.proven.includes('host-before-session'));
    assert.ok(result.proven.includes('verified-base'));
    assert.equal(result.privateStoreChain.status, 'conditional');
    assert.equal(result.storeGraph.status, 'conditional');
    assert.equal(result.releaseCompatible, false);
  }

  } catch (error) { videoTimeoutObservation('p101-throw', 0); throw error; }
  finally { videoTimeoutObservation('p101-exit', 0); }
});

test('hybrid receipt composition refuses changed whole values ordering images adoption and paid history', async t => {
  videoTimeoutObservation('p102-begin', 0);
  try {

  const illustration = 'apps/agent-worker/src/native-agent/illustration-task.ts';
  const host = 'apps/agent-worker/src/native-agent/host-task.ts', workspace = 'apps/agent-worker/src/workspace-guide.ts';
  const session = 'apps/agent-worker/src/native-agent/session.ts';
  const cases = [
    ['video-settings-guard', illustration, "if (nativeVideo !== (input.settings.output === 'video' && input.settings.narrative === true))", 'if (false)'],
    ['audio-flag-supplier', illustration, "const nativeVideoAudio = 'nativeVideoAudio' in profile && profile.nativeVideoAudio;", 'const nativeVideoAudio = true;'],
    ['partial-whole-receipt', illustration, 'if (!isDeepStrictEqual(rebuilt, recorded)) stopped();', 'if (!isDeepStrictEqual(rebuilt.prompts, recorded.prompts)) stopped();'],
    ['lost-prior-state', illustration, 'const before = { science, art, review, pendingScience, contextStyles };', 'const before = { science, art, review, pendingScience: undefined, contextStyles };'],
    ['restore-noop', illustration, 'const restore = () => { ({ science, art, review, pendingScience, contextStyles } = before); };', 'const restore = () => {};'],
    ['filtered-global-sequence', illustration, 'for (const [sequence, tool] of calls.entries())', "for (const [sequence, tool] of calls.filter(call => call.function.name.startsWith('paper_illustration_')).entries())"],
    ['last-review-bypass', illustration, 'lastReview?.id !== currentReview.id', 'false'],
    ['saved-arguments-bypass', illustration, 'if (saved && (name !== saved.name || !isDeepStrictEqual(args, saved.args))) stopped();', 'if (false) stopped();'],
    ['receipt-map-escape', illustration, 'const savedIds = new Set<string>();', 'const savedIds = new Set<string>();\n  exposePrivateMap(savedIllustrationReceipts);'],
    ['receipt-map-mutable', illustration, 'const savedIllustrationReceipts = new Map<string,', 'let savedIllustrationReceipts = new Map<string,'],
    ['image-receipt-identity', illustration, "{ status: 'image_view_ready', selectedImage: input.selectedImage.binding } : undefined;", "{ status: 'image_view_ready', selectedImage: otherBinding } : undefined;"],
    ['image-argument-bypass', illustration, 'Object.keys(args).length || !isDeepStrictEqual(result, imageReceipt)', 'false || !isDeepStrictEqual(result, imageReceipt)'],
    ['wrong-stored-image-hash', illustration, "createHash('sha256').update(Buffer.from(message.images[0]!.data, 'base64')).digest('hex')", "createHash('sha256').update(Buffer.from('other', 'base64')).digest('hex')"],
    ['context-order-bypass', illustration, 'calls.indexOf(contextCall) >= calls.indexOf(views[0]!)', 'false'],
    ['reply-before-image', illustration, 'calls.indexOf(questions[0]!) <= calls.indexOf(views[0]!)', 'false'],
    ['final-text-unbound', illustration, 'last.response.text !== native.finalResponse', 'false'],
    ['foreign-completed-store', illustration, 'const completed = await store.read(); const last = completed?.turns.at(-1);', 'const completed = await otherStore.read(); const last = completed?.turns.at(-1);'],
    ['lost-latest-image', host, 'const latest = value.messages.at(-1);', 'const latest = value.messages.at(0);'],
    ['image-slot-argument', host, '!isDeepStrictEqual(slot.args, value.arguments) || !isDeepStrictEqual(slot.result, value.result)', '!isDeepStrictEqual(slot.args, otherArguments) || !isDeepStrictEqual(slot.result, value.result)'],
    ['lost-image-prefix', host, 'slot.images = images.content; respond(res, 200, images);', 'respond(res, 200, images);'],
    ['paid-response-adoption', workspace, 'cp.responseHash !== paid.responseHash', 'false'],
    ['result-cas-adoption', workspace, 'result: { equals: current.result! }', 'result: { equals: otherResult }'],
    ['paid-late-prefix-loss', session, 'await input.store.complete(started, completed);', 'await input.store.compareAndSet(started, completed);'],
    ['global-host-sequence', host, 'sequence: toolSequence++,', 'sequence: 0,', 'host-before-session'],
  ];
  for (const [name, file, before, after, target = 'materializer-host'] of cases) await t.test(name, async () => {
  videoTimeoutObservation('p102-n1-begin', 0);
  try {

    const input = await videoIngressProgram(new Map([[file, value => {
      value = value.replaceAll('\r\n', '\n'); assert.ok(value.includes(before), name);
      const changed = value.replace(before, after); assert.notEqual(changed, value); return changed;
    }]]));
    const result = deployLock.proveNativeVideoReceiptIngress(input.ts, input.program, input.projectRoot);
    assert.equal(result.status, 'unknown', name);
    assert.equal(result.releaseCompatible, false, name);
    assert.ok(!result.proven.includes(target), JSON.stringify({ name, reason: result.reason, at: result.at, proven: result.proven }));
    assert.notEqual(result.reason, 'OTHER_PERSISTENCE_ORIGINS_UNPROVEN', name);
    assert.notEqual(result.reason, 'SOURCE_ANALYSIS_UNKNOWN', 'a programming exception is not the requested source refusal');

  } catch (error) { videoTimeoutObservation('p102-n1-throw', 0); throw error; }
  finally { videoTimeoutObservation('p102-n1-exit', 0); }
});

  } catch (error) { videoTimeoutObservation('p102-throw', 0); throw error; }
  finally { videoTimeoutObservation('p102-exit', 0); }
});

test('hybrid receipt signatures reject mutable flags and image default effects', async t => {
  videoTimeoutObservation('p103-begin', 0);
  try {

  const file = 'apps/agent-worker/src/native-agent/illustration-task.ts';
  const cases = [
    ['mutable-video-flag', 'const nativeVideo = input.nativeVideo === true;', 'let nativeVideo = input.nativeVideo === true;'],
    ['evaluate-default-effect', 'historicalExecution = false, approvedVideoPrompts = false)', 'historicalExecution = opaqueEffect(), approvedVideoPrompts = false)'],
    ['image-default-effect', 'images: async (args: unknown, result: unknown) => {', 'images: async (args: unknown = opaqueEffect(), result: unknown) => {'],
    ['sync-image-supplier', 'images: async (args: unknown, result: unknown) => {', 'images: (args: unknown, result: unknown) => {'],
  ];
  for (const [name, before, after] of cases) await t.test(name, async () => {
  videoTimeoutObservation('p103-n1-begin', 0);
  try {

    const input = await videoIngressProgram(new Map([[file, value => {
      assert.ok(value.includes(before), name); return value.replace(before, after);
    }]]));
    const result = deployLock.proveNativeVideoReceiptIngress(input.ts, input.program, input.projectRoot);
    assert.equal(result.status, 'unknown'); assert.equal(result.releaseCompatible, false);
    assert.ok(!result.proven.includes('materializer-host'), JSON.stringify({ name, reason: result.reason }));
    assert.notEqual(result.reason, 'SOURCE_ANALYSIS_UNKNOWN', name);

  } catch (error) { videoTimeoutObservation('p103-n1-throw', 0); throw error; }
  finally { videoTimeoutObservation('p103-n1-exit', 0); }
});

  } catch (error) { videoTimeoutObservation('p103-throw', 0); throw error; }
  finally { videoTimeoutObservation('p103-exit', 0); }
});

test('selected video source data producers refuse foreign paper claims style and pixels', async t => {
  videoTimeoutObservation('p104-begin', 0);
  try {

  const file = 'apps/agent-worker/src/workspace-guide.ts', code = 'SELECTED_VIDEO_SOURCE_DATA_UNKNOWN';
  const cases = [
    ['scope-version', 'versionId: selected.binding.versionId, sourceClaimIds: selected.binding.sourceClaimIds', 'versionId: otherVersion, sourceClaimIds: selected.binding.sourceClaimIds'],
    ['narrative-evidence', '}, scope, selected.evidence);', '}, scope, otherEvidence);'],
    ['narrative-identity', 'if (narrative.identity !== selected.binding.narrativeSourceIdentity)', 'if (false)'],
    ['attachment-mime', 'generatedImageReviewAttachment(pixels, selected.binding.contentHash, selected.binding.mimeType)', 'generatedImageReviewAttachment(pixels, selected.binding.contentHash, otherMime)'],
    ['pixel-hash', 'const pixels = await readPresentationInput(storage, selected.binding.objectKey, selected.binding.contentHash,', 'const pixels = await readPresentationInput(storage, selected.binding.objectKey, otherHash,'],
    ['claim-source', 'selected.claims.filter(claim => selected.binding.sceneSourceClaimIds.includes(claim.id))', 'selected.claims.filter(claim => selected.binding.sourceClaimIds.includes(claim.id))'],
    ['style-source', 'style: selected.settings.style, output:', 'style: otherStyle, output:'],
    ['reauthorize-pixel-hash', 'const bytes = await readPresentationInput(storage, selected.binding.objectKey, selected.binding.contentHash,', 'const bytes = await readPresentationInput(storage, selected.binding.objectKey, otherHash,'],
  ];
  for (const [name, before, after] of cases) await t.test(name, async () => {
  videoTimeoutObservation('p104-n1-begin', 0);
  try {

    const actual = await videoIngressProgram(new Map([[file, text => {
      text = text.replaceAll('\r\n', '\n'); assert.ok(text.includes(before), name); return text.replace(before, after);
    }]]));
    const result = deployLock.proveNativeVideoReceiptIngress(actual.ts, actual.program, actual.projectRoot);
    assert.equal(result.reason, code, name);
    assert.ok(!result.proven.includes('materializer-host'), name);
    assert.equal(result.releaseCompatible, false, name);

  } catch (error) { videoTimeoutObservation('p104-n1-throw', 0); throw error; }
  finally { videoTimeoutObservation('p104-n1-exit', 0); }
});

  } catch (error) { videoTimeoutObservation('p104-throw', 0); throw error; }
  finally { videoTimeoutObservation('p104-exit', 0); }
});

test('selected video saved supplier and retained tools refuse substituted state authority and history', async t => {
  videoTimeoutObservation('p105-begin', 0);
  try {

  const illustration = 'apps/agent-worker/src/native-agent/illustration-task.ts', workspace = 'apps/agent-worker/src/workspace-guide.ts';
  const session = 'apps/agent-worker/src/native-agent/session.ts', store = 'apps/agent-worker/src/native-agent/task-store.ts';
  const saved = 'const saved = await store.read();';
  // Actual source supplier mutations use the real existing tool definitions.
  // They are not assertions that such a checkpoint exists online, nor APP runs.
  const injected = tools => "const saved = { turns: [{ request: { options: { tools: " + tools
    + ".map(tool => ({ type: 'function', function: tool })) } } }] } as NativeAgentSessionState;";
  const taskCode = 'SELECTED_VIDEO_TASK_SUPPLIER_UNKNOWN', coreCode = 'SELECTED_VIDEO_CORE_STATE_UNKNOWN';
  const firstCode = 'SELECTED_VIDEO_FIRST_TOOLS_UNKNOWN', refCode = 'SELECTED_VIDEO_SAVED_REFERENCE_UNKNOWN';
  const retainedCode = 'SELECTED_VIDEO_RETAINED_STATE_UNKNOWN';
  const cases = [
    ['owner-row-task', workspace, 'all', 'where: { id: task.id },\n    include: { session: true }', 'where: { id: otherTask.id },\n    include: { session: true }', taskCode],
    ['owner-payload', workspace, 'all', '!isDeepStrictEqual(ownerTask.payload, task.payload)', 'false', taskCode],
    ['authority-attempt', workspace, 'all', '{ taskId: task.id, executionAttempt: task.executionAttempt! }),', '{ taskId: task.id, executionAttempt: otherTask.executionAttempt! }),', taskCode],
    ['supplied-result', workspace, 'all', 'result: ownerTask.result },', 'result: task.payload },', taskCode],
    ['authorizer-source', workspace, 'all', '!isDeepStrictEqual(current.selectedImageSource.binding, selected.binding)', '!isDeepStrictEqual(current.selectedImageSource.binding, otherBinding)', taskCode],
    ['core-task-scope', illustration, 'core', 'taskId: input.task.id, executionAttempt: input.task.executionAttempt, execution, authorize: input.authorize', 'taskId: input.otherTask.id, executionAttempt: input.task.executionAttempt, execution, authorize: input.authorize', coreCode],
    ['saved-opaque-supplier', illustration, 'core', saved, 'const saved = await otherStore.read();', coreCode],
    ['saved-video-tools-image-label', illustration, 'core', saved, injected('OPTIONAL_AUDIO_NATIVE_VIDEO_TOOLS'), coreCode],
    ['saved-mixed-tools-image-label', illustration, 'core', saved, injected('[...OPTIONAL_AUDIO_NATIVE_VIDEO_TOOLS, ...SELECTED_IMAGE_TOOLS]'), coreCode],
    ['saved-profile-reset', illustration, 'core', 'nativeIllustrationToolProfile(saved, input.settings.output, execution.planningContract)', 'nativeIllustrationToolProfile(null, input.settings.output, execution.planningContract)', coreCode],
    ['materializer-saved', illustration, 'core', 'savedState: saved, nativeVideo,', 'savedState: null, nativeVideo,', coreCode],
    ['materializer-flag', illustration, 'core', 'savedState: saved, nativeVideo,', 'savedState: saved, nativeVideo: false,', coreCode],
    ['different-session-store', illustration, 'core', 'binding, store, authorize });', 'binding, store: otherStore, authorize });', 'SELECTED_VIDEO_STORE_SUPPLIER_UNKNOWN'],
    ['output-only-video-flag', illustration, 'profile', 'const nativeVideo = videoContext || Boolean(saved && scienceDescription === VIDEO_SCIENCE_DESCRIPTION\n    && contextDescription === CONTEXT_DESCRIPTION && isDeepStrictEqual(originalScience?.parameters, ORIGINAL_VIDEO_SCIENCE_SCHEMA));', "const nativeVideo = output === 'video';", firstCode],
    ['selected-output-bypass', illustration, 'core', 'if (input.selectedImage && (!input.selectedImageAttachment || SELECTED_IMAGE_TOOLS.some(expected =>', "if (input.settings.output === 'video' && (!input.selectedImageAttachment || SELECTED_IMAGE_TOOLS.some(expected =>", firstCode],
    ['lost-retained-tools', illustration, 'core', "allowedTools: saved ? [...saved.binding.allowedTools] : ['skills_list'", "allowedTools: false ? [...saved.binding.allowedTools] : ['skills_list'", firstCode],
    ['different-first-tools', session, 'all', 'options.tools, state.turns[0]?.request.options.tools', 'options.tools, state.turns.at(-1)?.request.options.tools', firstCode],
    ['missing-first-tools-guard', session, 'all', "if (state && !isDeepStrictEqual(options.tools, state.turns[0]?.request.options.tools)) blocked('tool definitions changed');", "if (false) blocked('tool definitions changed');", firstCode],
    ['lost-prior-paid-turns', session, 'ordinary', '(state?.turns ?? []).map(turn =>', '(state?.turns ?? []).slice(-1).map(turn =>', retainedCode],
    ['late-paid-live-authorization', session, 'ordinary', 'await input.store.complete(started, completed);', 'await input.store.compareAndSet(started, completed);', retainedCode],
    ['cross-task-checkpoint', store, 'all', 'if (cp.taskId !== input.taskId) blocked();', 'if (cp.taskId !== cp.taskId) blocked();', refCode],
    ['changed-SHA-validation', store, 'all', 'size !== cp.size || sha(bytes) !== cp.serializedSha256', 'size !== cp.size || false', refCode],
    ['lost-known-membership', store, 'all', 'known.set(cp.serializedSha256, cp); return state;', 'return state;', refCode],
  ];
  const region = (text, scope) => {
    if (scope === 'core') return [text.indexOf('async function runNativeIllustrationTaskCore('), text.length];
    if (scope === 'profile') return [text.indexOf('export function nativeIllustrationToolProfile('), text.indexOf('export async function replayNativeVideoPlan(')];
    if (scope === 'ordinary') return [text.indexOf('const started: NativeAgentSessionState = retry?.started'), text.indexOf('\n          break;', text.indexOf('const started: NativeAgentSessionState = retry?.started'))];
    return [0, text.length];
  };
  for (const [name, file, scope, before, after, code] of cases) await t.test(name, async () => {
  videoTimeoutObservation('p105-n1-begin', 0);
  try {

    const actual = await videoIngressProgram(new Map([[file, text => {
      text = text.replaceAll('\r\n', '\n'); const [start, end] = region(text, scope);
      assert.ok(start >= 0 && end > start, name); const selected = text.slice(start, end);
      assert.ok(selected.includes(before), name); return text.slice(0, start) + selected.replace(before, after) + text.slice(end);
    }]]));
    const result = deployLock.proveNativeVideoReceiptIngress(actual.ts, actual.program, actual.projectRoot);
    assert.equal(result.reason, code, name);
    assert.ok(!result.proven.includes('materializer-host'), name);
    assert.equal(result.releaseCompatible, false, name);

  } catch (error) { videoTimeoutObservation('p105-n1-throw', 0); throw error; }
  finally { videoTimeoutObservation('p105-n1-exit', 0); }
});

  } catch (error) { videoTimeoutObservation('p105-throw', 0); throw error; }
  finally { videoTimeoutObservation('p105-exit', 0); }
});

test('actual video wrapper witness refuses changed ownership input and paper delegation', async t => {
  videoTimeoutObservation('p106-begin', 0);
  try {

  const file = 'apps/agent-worker/src/native-agent/illustration-task.ts';
  const ordinary = "export async function runNativeIllustrationTask(input: NativeIllustrationTaskInput) {\n  if (input.selectedImage) stopped();\n  const result = await runNativeIllustrationTaskCore(input);\n  if ('reply' in result) stopped();\n  return result;\n}";
  const selectedPrefix = "if (input.settings.output !== 'image' || input.settings.narrativeSceneLimit !== 1) stopped();";
  const cases = [
    ['missing-wrapper-guard', ordinary, ordinary.replace('if (input.selectedImage) stopped();', '')],
    ['inverted-wrapper-guard', ordinary, ordinary.replace('if (input.selectedImage)', 'if (!input.selectedImage)')],
    ['nonterminal-wrapper-guard', ordinary, ordinary.replace('if (input.selectedImage) stopped();', 'if (input.selectedImage) observe();')],
    ['unawaited-wrapper-core', ordinary, ordinary.replace('await runNativeIllustrationTaskCore(input)', 'runNativeIllustrationTaskCore(input)')],
    ['substituted-wrapper-result', ordinary, ordinary.replace('return result;', 'return otherResult;')],
    ['extra-core-caller', ordinary, ordinary + '\nasync function extra(input: NativeIllustrationTaskInput) { return runNativeIllustrationTaskCore(input); }'],
    ['opaque-core-alias', ordinary, ordinary + '\nconst escapedCore = runNativeIllustrationTaskCore;'],
    ['selected-input-escape', selectedPrefix, selectedPrefix + '\n  opaqueInputWriter(input);'],
    ['selected-input-mutation', selectedPrefix, selectedPrefix + '\n  input.selectedImage = otherSelected;'],
    ['rest-core-input', 'async function runNativeIllustrationTaskCore(input:', 'async function runNativeIllustrationTaskCore(...input:'],
    ['second-source-initializer', 'const source = createNativePaperTools(input.sourceMap, input.renderPages, sourceTools, input.semanticSearch);',
      'const source = createNativePaperTools(input.sourceMap, input.renderPages, sourceTools, input.semanticSearch), leaked = opaque(input);'],
    ['substituted-materializer', 'const materializer = createNativeIllustrationMaterializer({ ...input, savedState:',
      'const materializer = otherMaterializer({ ...input, savedState:'],
    ['substituted-paper-materializer', 'materializer.call(name, args, sequence!, callId!)', 'otherMaterializer.call(name, args, sequence!, callId!)'],
    ['substituted-paper-source', ': source.call(name, args);', ': source.images(name, args);'],
    ['substituted-paper-images', 'return source.images(args, result);', 'return source.images(result, args);'],
  ];
  const components = selectedGuideSourceComponents();
  for (const [name, before, after] of cases) await t.test(name, async () => {
  videoTimeoutObservation('p106-n1-begin', 0);
  try {

    const input = await videoIngressProgram(new Map([[file, text => {
      text = text.replaceAll('\r\n', '\n'); assert.ok(text.includes(before), name); return text.replace(before, after);
    }]]));
    let refusal;
    try { components.illustrationWitness(input.ts, videoPairContext(input)); }
    catch (error) { refusal = { reason: error.reason, at: error.node?.getSourceFile?.().fileName }; }
    assert.equal(refusal?.reason, 'SELECTED_GUIDE_ILLUSTRATION_INPUT_OR_DELEGATION_CHANGED', name);
    const result = deployLock.proveNativeVideoReceiptIngress(input.ts, input.program, input.projectRoot);
    assert.equal(result.reason, 'SELECTED_GUIDE_ILLUSTRATION_INPUT_OR_DELEGATION_CHANGED', name);
    assert.ok(!result.proven.includes('materializer-host'), name);
    assert.equal(result.releaseCompatible, false, name);

  } catch (error) { videoTimeoutObservation('p106-n1-throw', 0); throw error; }
  finally { videoTimeoutObservation('p106-n1-exit', 0); }
});

  } catch (error) { videoTimeoutObservation('p106-throw', 0); throw error; }
  finally { videoTimeoutObservation('p106-exit', 0); }
});

test('video pair source projection preserves actual old runtime context and finite L/U closure', async () => {
  videoTimeoutObservation('p107-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p107-throw', 0); throw error; }
  finally { videoTimeoutObservation('p107-exit', 0); }
});

test('video pair source closure distinguishes a capable writer from dropping its readers', async () => {
  videoTimeoutObservation('p108-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p108-throw', 0); throw error; }
  finally { videoTimeoutObservation('p108-exit', 0); }
});

test('video pair source projection consumes genuine imported aliases but not arbitrary A uses', async () => {
  videoTimeoutObservation('p109-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p109-throw', 0); throw error; }
  finally { videoTimeoutObservation('p109-exit', 0); }
});

test('video pair source refuses the real earlier A writer whose legacy constructor was refactored', async () => {
  videoTimeoutObservation('p110-begin', 0);
  try {

  const components = videoPairSourceComponents();
  const earlier = await historicalVideoIngressProgram(new Map(), '36e8ce5228bc8d3109de171cc86f17eab3fe7f64');
  assert.throws(() => components.model(earlier.ts, videoPairContext(earlier)), error => error.reason === 'VIDEO_CONSTRUCTOR_NOT_PURE');

  } catch (error) { videoTimeoutObservation('p110-throw', 0); throw error; }
  finally { videoTimeoutObservation('p110-exit', 0); }
});

test('video pair source grammar refuses saved-field adoption, foreign base indices and unbound spool values', async () => {
  videoTimeoutObservation('p111-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p111-throw', 0); throw error; }
  finally { videoTimeoutObservation('p111-exit', 0); }
});

test('video pair projection retains changed non-video and request-identity context', async () => {
  videoTimeoutObservation('p112-begin', 0);
  try {

  const components = videoPairSourceComponents(), actual = await historicalVideoIngressProgram(), baseline = components.model(actual.ts, videoPairContext(actual));
  for (const [file, before, after] of [
    ['apps/agent-worker/src/native-agent/illustration-task.ts', "if (!record(args)) throw new Error('object_required');", "if (!record(args)) throw new Error('different_context');"],
    ['apps/agent-worker/src/presentation/synclip-video-spool.ts', 'existing.inputHash !== inputHash', 'existing.inputHash === inputHash'],
  ]) {
    const changed = await historicalVideoIngressProgram(new Map([[file, source => source.replace(before, after)]]));
    const model = components.model(changed.ts, videoPairContext(changed));
    assert.notDeepEqual(videoPairRuntime(changed.ts, model.projected.get(file).text), videoPairRuntime(actual.ts, baseline.projected.get(file).text));
  }

  } catch (error) { videoTimeoutObservation('p112-throw', 0); throw error; }
  finally { videoTimeoutObservation('p112-exit', 0); }
});

test('video pair source family bound rejects a pure constructor that changes scientific or audio context', async () => {
  videoTimeoutObservation('p113-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p113-throw', 0); throw error; }
  finally { videoTimeoutObservation('p113-exit', 0); }
});

test('video pair constructor component extracts actual legacy families without granting compatibility', async () => {
  videoTimeoutObservation('p114-begin', 0);
  try {

  const component = deployLockSource.slice(deployLockSource.indexOf('function finiteVideoConstructorTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  assert.ok(component.startsWith('function finiteVideoConstructorTerms('));
  const analyze = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 50), runInNewContext(`${component}; finiteVideoConstructorTerms`, { relative }));
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

  } catch (error) { videoTimeoutObservation('p114-throw', 0); throw error; }
  finally { videoTimeoutObservation('p114-exit', 0); }
});

test('video pair constructor component refuses effects and unsupported bindings in actual source', async () => {
  videoTimeoutObservation('p115-begin', 0);
  try {

  const component = deployLockSource.slice(deployLockSource.indexOf('function finiteVideoConstructorTerms('),
    deployLockSource.indexOf('\nfunction rollbackComparisonDiagnostic('));
  const analyze = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 51), runInNewContext(`${component}; finiteVideoConstructorTerms`, { relative }));
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

  } catch (error) { videoTimeoutObservation('p115-throw', 0); throw error; }
  finally { videoTimeoutObservation('p115-exit', 0); }
});

test('video constructor ingress prototype reports genuine bindings and unresolved other consumers without permitting rollback', async () => {
  videoTimeoutObservation('p116-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p116-throw', 0); throw error; }
  finally { videoTimeoutObservation('p116-exit', 0); }
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
  videoTimeoutObservation('p117-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p117-throw', 0); throw error; }
  finally { videoTimeoutObservation('p117-exit', 0); }
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
  videoTimeoutObservation('p118-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p118-throw', 0); throw error; }
  finally { videoTimeoutObservation('p118-exit', 0); }
});

test('class supplier proof rejects unknown, escaped, rebound or mutable Gateway origins', async t => {
  videoTimeoutObservation('p119-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p119-throw', 0); throw error; }
  finally { videoTimeoutObservation('p119-exit', 0); }
});

test('rollback rejects the five unsafe runtime closure variants reproduced by independent High review', async t => {
  videoTimeoutObservation('p120-begin', 0);
  try {

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
  videoTimeoutObservation('p120-n1-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p120-n1-throw', 0); throw error; }
  finally { videoTimeoutObservation('p120-n1-exit', 0); }
});

  } catch (error) { videoTimeoutObservation('p120-throw', 0); throw error; }
  finally { videoTimeoutObservation('p120-exit', 0); }
});

test('rollback fails closed for missing generated modules and unresolved dynamic loading without executing source', async t => {
  videoTimeoutObservation('p121-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p121-throw', 0); throw error; }
  finally { videoTimeoutObservation('p121-exit', 0); }
});

test('an unused callback implementation cannot stand in for the missing reader consumer', async t => {
  videoTimeoutObservation('p122-begin', 0);
  try {

  const root = await mkdtemp(join(tmpdir(), 'xgs-rollback-unused-callback-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const candidate = join(root, 'candidate'), previous = join(root, 'previous');
  for (const directory of [candidate, previous]) {
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'reader.ts'), 'type Deps={accepts:(v:string)=>boolean}; export function readPersisted(deps:Deps,v:string){return deps.accepts(v);} const unused:Deps={accepts:()=>true};');
  }
  await assert.rejects(deployLock.verifyApplicationRollbackReaders({ candidateRoot: candidate, rollbackRoot: previous,
    compilerRoot: fileURLToPath(new URL('../../', import.meta.url)), roots: [['reader.ts', 'readPersisted']] }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);

  } catch (error) { videoTimeoutObservation('p122-throw', 0); throw error; }
  finally { videoTimeoutObservation('p122-exit', 0); }
});

test('callback compatibility follows the actual supplier argument rather than an unrelated typed object', async t => {
  videoTimeoutObservation('p123-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p123-throw', 0); throw error; }
  finally { videoTimeoutObservation('p123-exit', 0); }
});

test('static createRequire loaders retain module provenance and follow their literal dependencies', async t => {
  videoTimeoutObservation('p124-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p124-throw', 0); throw error; }
  finally { videoTimeoutObservation('p124-exit', 0); }
});

test('generated Prisma runtime requires exact installed vendor and engine bytes while model readers remain compared', async t => {
  videoTimeoutObservation('p125-begin', 0);
  try {

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
  const collect = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 52), runInNewContext(`${collectorSource}; rollbackReaderClosure`, { resolve, relative, dirname, join, existsSync, readFileSync,
    builtinModules, rollbackProofContexts: closureContexts, APPLICATION_ROLLBACK_READERS: [], verifyPrismaVendorRuntime: deployLock.verifyPrismaVendorRuntime,
    rollbackCompatibilityUnknown() { throw Error('ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN'); } }));
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

  } catch (error) { videoTimeoutObservation('p125-throw', 0); throw error; }
  finally { videoTimeoutObservation('p125-exit', 0); }
});

test('core Prisma verifier resolves the pnpm virtual-store client layout', async t => {
  videoTimeoutObservation('p126-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p126-throw', 0); throw error; }
  finally { videoTimeoutObservation('p126-exit', 0); }
});

test('ordinary rollback never permits an unknown reader because persisted-state diagnostics are empty', async t => {
  videoTimeoutObservation('p127-begin', 0);
  try {

  const root = await mkdtemp(join(tmpdir(), 'xgs-rollback-reader-hold-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const candidate = join(root, 'candidate'), previous = join(root, 'previous');
  for (const directory of [candidate, previous]) await mkdir(directory, { recursive: true });
  await assert.rejects(deployLock.verifyApplicationRollbackReaders({ candidateRoot: candidate, rollbackRoot: previous,
    compilerRoot: fileURLToPath(new URL('../../', import.meta.url)), roots: [['missing-reader.ts', 'readPersisted']] }),
  /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);

  } catch (error) { videoTimeoutObservation('p127-throw', 0); throw error; }
  finally { videoTimeoutObservation('p127-exit', 0); }
});

test('rollback cannot downgrade the private-cleanup reader after the protected archive was added', async t => {
  videoTimeoutObservation('p128-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p128-throw', 0); throw error; }
  finally { videoTimeoutObservation('p128-exit', 0); }
});

test('ordinary rollback compatibility failure preserves the candidate and journal and never stops producers', async t => {
  videoTimeoutObservation('p129-begin', 0);
  try {

  const operationSource = deployLockSource.match(/async function applicationRollbackPreflight\(options\) \{[\s\S]*?\n\}/u)?.[0];
  assert.ok(operationSource);
  for (const persistence of [
    { native: true, paidUnknown: false, firstImage: false },
    { native: false, paidUnknown: true, firstImage: false },
    { native: false, paidUnknown: false, firstImage: true },
    { native: false, paidUnknown: false, firstImage: false },
  ]) await t.test(JSON.stringify(persistence), async () => {
  videoTimeoutObservation('p129-n1-begin', 0);
  try {

    const journal = { candidateSha: 'b'.repeat(40), rollbackSha: 'a'.repeat(40), phase: 'published' };
    const before = structuredClone(journal), calls = [], diagnostics = [];
    const operation = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 53), runInNewContext(`${operationSource}; applicationRollbackPreflight`, { process: {platform: 'linux', arch: 'x64'},
      async verifyProductionDeployLockOnHost() { calls.push('lock'); },
      async readTrustedJournal() { calls.push('journal-read'); return journal; },
      async nativeCommand(command, args) { calls.push(`${command}:${args.slice(0, 2).join(':')}`); assert.equal(command, 'docker'); assert.deepEqual(Array.from(args.slice(0, 2)), ['image', 'inspect']); return rollbackImageMetadataFixture(); },
      async verifyApplicationRollbackReaders() { calls.push('reader-comparison'); throw Error('new persisted contract'); },
      async queryNativeWork(candidate, checkpoint, rollback) { assert.equal(candidate, journal.candidateSha); assert.equal(checkpoint, null); assert.equal(rollback, true); calls.push('current-reader-diagnostics'); return { persistence }; },
      rollbackCompatibilityUnknown() { throw Error('ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN'); },
      console: { error(value) { diagnostics.push(value); } },
    }));
    await assert.rejects(operation({ candidateSha: journal.candidateSha, rollbackSha: journal.rollbackSha }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
    assert.deepEqual(journal, before);
    assert.deepEqual(calls, ['lock', 'journal-read', 'docker:image:inspect', 'docker:image:inspect', 'reader-comparison', 'current-reader-diagnostics']);
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0].includes(journal.candidateSha), false);

  } catch (error) { videoTimeoutObservation('p129-n1-throw', 0); throw error; }
  finally { videoTimeoutObservation('p129-n1-exit', 0); }
});

  } catch (error) { videoTimeoutObservation('p129-throw', 0); throw error; }
  finally { videoTimeoutObservation('p129-exit', 0); }
});

test('compatible ordinary rollback verifies both image Node runtimes and skips live-state diagnostics', async () => {
  videoTimeoutObservation('p130-begin', 0);
  try {

  const operationSource = deployLockSource.match(/async function applicationRollbackPreflight\(options\) \{[\s\S]*?\n\}/u)?.[0];
  const calls = [];
  const journal = { candidateSha: 'b'.repeat(40), rollbackSha: 'a'.repeat(40), phase: 'switching' };
  const operation = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 54), runInNewContext(`${operationSource}; applicationRollbackPreflight`, { process: {platform: 'linux', arch: 'x64'},
    async verifyProductionDeployLockOnHost() { calls.push('lock'); }, async readTrustedJournal() { return journal; },
    async nativeCommand(command, args) { calls.push(args.at(-1)); return rollbackImageMetadataFixture(); },
    async verifyApplicationRollbackReaders() { calls.push('reader-comparison'); },
    async queryNativeWork() { throw Error('compatible rollback must not query/drain producers'); },
    rollbackCompatibilityUnknown() { throw Error('unknown'); }, console: { error() {} },
  }));
  assert.equal(await operation({ candidateSha: journal.candidateSha, rollbackSha: journal.rollbackSha }), 'APPLICATION_ROLLBACK_READERS_COMPATIBLE');
  assert.deepEqual(calls, ['lock', `openscience-agent-worker:${journal.candidateSha}`, `openscience-agent-worker:${journal.rollbackSha}`, 'reader-comparison']);

  } catch (error) { videoTimeoutObservation('p130-throw', 0); throw error; }
  finally { videoTimeoutObservation('p130-exit', 0); }
});

test('selected history cannot reuse a W over R journal as the earlier R over legacy transaction', async () => {
  videoTimeoutObservation('p131-begin', 0);
  try {

  const extract = name => {
    const body = deployLockSource.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}`, 'u'))?.[0];
    assert.ok(body, name); return body;
  };
  const legacy = 'a'.repeat(40), reader = 'b'.repeat(40), writer = 'c'.repeat(40);
  for (const fixture of [
    { journal: [reader, legacy, 'switching'], requested: [reader, legacy], accepted: true },
    { journal: [writer, reader, 'published'], requested: [writer, reader], accepted: true },
    { journal: [writer, reader, 'published'], requested: [reader, legacy], accepted: false },
    { journal: [writer, reader, 'published'], requested: [legacy, reader], accepted: false },
    { journal: [writer, reader, 'prepared'], requested: [writer, reader], accepted: false },
    { journal: [writer, reader, 'migrating'], requested: [writer, reader], accepted: false },
    { journal: [writer, reader, 'published'], requested: [writer, reader], mode: 0o644, accepted: false },
    { journal: [writer, reader, 'published'], requested: [writer, reader], uid: 1234, accepted: false },
    { journal: [writer, reader, 'published'], requested: [writer, reader], missing: true, accepted: false },
  ]) {
    const journal = { schemaVersion: 1, candidateSha: fixture.journal[0], rollbackSha: fixture.journal[1], phase: fixture.journal[2], updatedAt: '2026-10-16T00:00:00.000Z' };
    const original = JSON.stringify(journal), calls = [], journalPath = '/production/.deploy-transaction.json';
    const operation = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 55), runInNewContext(`${extract('exactObjectKeys')}\n${extract('readTrustedJournal')}\n${extract('applicationRollbackPreflight')}; applicationRollbackPreflight`, {
      SHA_PATTERN: /^[a-f0-9]{40}$/u, JOURNAL_PHASES: new Set(['prepared', 'migrating', 'switching', 'published']),
      process: { platform: 'linux', arch: 'x64' },
      async verifyProductionDeployLockOnHost() { calls.push('lock'); },
      async lstat(path) { assert.equal(path, journalPath); if (fixture.missing) throw Object.assign(Error('missing'), { code: 'ENOENT' });
        return { isFile: () => true, isSymbolicLink: () => false, nlink: 1, uid: fixture.uid ?? 0, mode: fixture.mode ?? 0o600 }; },
      async realpath(path) { return path; }, async readFile(path) { assert.equal(path, journalPath); return original; },
      async nativeCommand() { calls.push('image-inspect'); return rollbackImageMetadataFixture(); },
      async verifyApplicationRollbackReaders(options) { calls.push('source-comparison');
        assert.equal(options.candidateRoot, `/opt/openscience-releases/${fixture.requested[0]}`);
        assert.equal(options.rollbackRoot, `/opt/openscience-releases/${fixture.requested[1]}`); },
      async queryNativeWork() { assert.fail('journal refusal does not consult queue emptiness or discard history'); },
      rollbackCompatibilityUnknown() { throw Error('ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN'); }, console: { error() {} },
    }));
    const request = { candidateSha: fixture.requested[0], rollbackSha: fixture.requested[1], journalPath, requiredUid: 0 };
    if (fixture.accepted) {
      assert.equal(await operation(request), 'APPLICATION_ROLLBACK_READERS_COMPATIBLE');
      assert.deepEqual(calls, ['lock', 'image-inspect', 'image-inspect', 'source-comparison']);
    } else {
      await assert.rejects(operation(request), error => fixture.missing ? error.code === 'ENOENT'
        : fixture.mode || fixture.uid ? error.message === 'production deploy journal is unsafe'
          : error.message === 'ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN');
      assert.deepEqual(calls, ['lock']);
    }
    assert.equal(JSON.stringify(journal), original);
  }

  } catch (error) { videoTimeoutObservation('p131-throw', 0); throw error; }
  finally { videoTimeoutObservation('p131-exit', 0); }
});

test('different or missing image Node runtime is unknown even when reader source would match', async () => {
  videoTimeoutObservation('p132-begin', 0);
  try {

  const operationSource = deployLockSource.match(/async function applicationRollbackPreflight\(options\) \{[\s\S]*?\n\}/u)?.[0];
  for (const previousRuntime of [rollbackImageMetadataFixture(['NODE_VERSION=20.14.0']), rollbackImageMetadataFixture([]),
    rollbackImageMetadataFixture(['NODE_VERSION=22.20.0', 'NODE_VERSION=20.14.0']), rollbackImageMetadataFixture(undefined, 'windows'),
    rollbackImageMetadataFixture(undefined, 'linux', 'arm64')]) {
    let reads = 0, comparisons = 0;
    const journal = { candidateSha: 'b'.repeat(40), rollbackSha: 'a'.repeat(40), phase: 'switching' };
    const operation = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 56), runInNewContext(`${operationSource}; applicationRollbackPreflight`, { process: {platform: 'linux', arch: 'x64'},
      async verifyProductionDeployLockOnHost() {}, async readTrustedJournal() { return journal; },
      async nativeCommand() { return reads++ === 0 ? rollbackImageMetadataFixture() : previousRuntime; },
      async verifyApplicationRollbackReaders() { comparisons += 1; }, async queryNativeWork() { throw Error('unknown current query'); },
      rollbackCompatibilityUnknown() { throw Error('ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN'); }, console: { error() {} },
    }));
    await assert.rejects(operation({ candidateSha: journal.candidateSha, rollbackSha: journal.rollbackSha }), /ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN/u);
    assert.equal(comparisons, 0);
  }

  } catch (error) { videoTimeoutObservation('p132-throw', 0); throw error; }
  finally { videoTimeoutObservation('p132-exit', 0); }
});

test('rollback diagnostics retain terminal Native, paid-unknown and first-image run/receipt/step obligations', async t => {
  videoTimeoutObservation('p133-begin', 0);
  try {

  const declaration = deployLockSource.match(/const NATIVE_WORK_QUERY = `[\s\S]*?`;/u)?.[0];
  assert.ok(declaration);
  const code = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 57), runInNewContext(`${declaration}; NATIVE_WORK_QUERY`, {}));
  for (const fixture of [
    { status: 'succeeded', native: true, error: null, first: { runs: false, receipts: false, steps: false }, expected: { native: true, paidUnknown: false, firstImage: false } },
    { status: 'failed', native: false, error: '[blocked] Previous paid image outcome unknown', first: { runs: false, receipts: false, steps: false }, expected: { native: false, paidUnknown: true, firstImage: false } },
    ...['runs', 'receipts', 'steps'].map(key => ({ status: 'succeeded', native: false, error: null,
      first: { runs: key === 'runs', receipts: key === 'receipts', steps: key === 'steps' }, expected: { native: false, paidUnknown: false, firstImage: true } })),
  ]) await t.test(JSON.stringify(fixture.expected), async () => {
  videoTimeoutObservation('p133-n1-begin', 0);
  try {

    let output = ''; const queries = [];
    await (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 58), runInNewContext(`(async()=>{${code.replace(/^import[^\n]+\n/gmu, '')}})()`, {
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
    }));
    assert.deepEqual(JSON.parse(output).persistence, fixture.expected);
    assert.equal(output.includes('private-task-identifier'), false);
    assert.match(queries[1], /hermes_research_runs/u);
    assert.match(queries[1], /audit_logs/u);
    assert.match(queries[1], /hermes_research_steps/u);

  } catch (error) { videoTimeoutObservation('p133-n1-throw', 0); throw error; }
  finally { videoTimeoutObservation('p133-n1-exit', 0); }
});

  } catch (error) { videoTimeoutObservation('p133-throw', 0); throw error; }
  finally { videoTimeoutObservation('p133-exit', 0); }
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
  videoTimeoutObservation('p134-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p134-throw', 0); throw error; }
  finally { videoTimeoutObservation('p134-exit', 0); }
});

test('Native journal preserves the original capture and rejects reset, late mode and receipt replacement', () => {
  videoTimeoutObservation('p135-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p135-throw', 0); throw error; }
  finally { videoTimeoutObservation('p135-exit', 0); }
});

test('Native candidate identities are atomic and immutable without backfilling legacy checkpoints', () => {
  videoTimeoutObservation('p136-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p136-throw', 0); throw error; }
  finally { videoTimeoutObservation('p136-exit', 0); }
});

test('Native refresh flag defaults off and forwards only the explicit sixth argument', () => {
  videoTimeoutObservation('p137-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p137-throw', 0); throw error; }
  finally { videoTimeoutObservation('p137-exit', 0); }
});

test('Native refresh rejects invalid or excess transaction arguments before host operations', () => {
  videoTimeoutObservation('p138-begin', 0);
  try {

  const runner = fileURLToPath(new URL('./production-deploy-transaction.sh', import.meta.url)).replaceAll('\\', '/');
  const args = ['b'.repeat(40), 'a'.repeat(40), '0', '0', '0'];
  const invalid = spawnSync(bash, [runner, ...args, '2'], { encoding: 'utf8' });
  assert.equal(invalid.status, 64);
  assert.match(invalid.stderr, /Native/u);
  const excess = spawnSync(bash, [runner, ...args, '0', 'extra'], { encoding: 'utf8' });
  assert.equal(excess.status, 64);
  assert.match(excess.stderr, /runner/u);

  } catch (error) { videoTimeoutObservation('p138-throw', 0); throw error; }
  finally { videoTimeoutObservation('p138-exit', 0); }
});

test('Native transitions persist install and restore intent before accepting exact receipts', () => {
  videoTimeoutObservation('p139-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p139-throw', 0); throw error; }
  finally { videoTimeoutObservation('p139-exit', 0); }
});

test('Native work classification preserves pending queues and holds unknown, live and candidate-bound work', () => {
  videoTimeoutObservation('p140-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p140-throw', 0); throw error; }
  finally { videoTimeoutObservation('p140-exit', 0); }
});

test('Native producer pause uses exact identities and infinite daemon stop; timeout, OOM and replacement remain held', async () => {
  videoTimeoutObservation('p141-begin', 0);
  try {

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
    const pause = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 59), runInNewContext(`${body}; pauseNativeProducers`, context));
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

  } catch (error) { videoTimeoutObservation('p141-throw', 0); throw error; }
  finally { videoTimeoutObservation('p141-exit', 0); }
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
  const operation = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 60), runInNewContext(`${extract('exactObjectKeys')}\n${queryDeclaration}\n${createdVerifier}\n${extract('pauseNativeProducers')}\n${extract('queryNativeWork')}\n${extract('nativeOperation')}; nativeOperation`, context));
  context.NATIVE_WORK_QUERY = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 61), runInNewContext(`${queryDeclaration}; NATIVE_WORK_QUERY`, {}));
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
  videoTimeoutObservation('p142-begin', 0);
  try {

  await t.test('pre-install failure then direct recovery rechecks stopped Web1 without a second stop', async () => {
  videoTimeoutObservation('p142-n1-begin', 0);
  try {

    const fixture = nativeRecoverySequenceFixture();
    await fixture.quiesce(); await fixture.failBeforeInstall();
    await assert.doesNotReject(fixture.run('native-prepare-rollback'), 'certified original Web1 must remain recoverable');
    assert.equal(fixture.journal.nativeRefresh.quiesceState, 'rollback_quiesced');
    assert.equal(fixture.journal.nativeRefresh.installState, 'not_attempted');
    assert.equal(fixture.calls.at(-1), 'old-binding');
    assert.equal(fixture.calls.filter(value => value === 'stop').length, 1);
    assert.equal(fixture.calls.includes('restore'), false);

  } catch (error) { videoTimeoutObservation('p142-n1-throw', 0); throw error; }
  finally { videoTimeoutObservation('p142-n1-exit', 0); }
});
  await t.test('unsafe queries preserve a candidate checkpoint until a safe reentry', async () => {
  videoTimeoutObservation('p142-n2-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p142-n2-throw', 0); throw error; }
  finally { videoTimeoutObservation('p142-n2-exit', 0); }
});
  await t.test('repeated hold then prepare completes the already-started rollback transition', async () => {
  videoTimeoutObservation('p142-n3-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p142-n3-throw', 0); throw error; }
  finally { videoTimeoutObservation('p142-n3-exit', 0); }
});
  await t.test('candidate hold preserves captured identities through unsafe and safe prepare', async () => {
  videoTimeoutObservation('p142-n4-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p142-n4-throw', 0); throw error; }
  finally { videoTimeoutObservation('p142-n4-exit', 0); }
});

  } catch (error) { videoTimeoutObservation('p142-throw', 0); throw error; }
  finally { videoTimeoutObservation('p142-exit', 0); }
});

test('Native before-start captures only complete never-started candidate bindings', async () => {
  videoTimeoutObservation('p143-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p143-throw', 0); throw error; }
  finally { videoTimeoutObservation('p143-exit', 0); }
});

test('Native recovery handles full and partial candidate create before a checkpoint without admitting unknown starts', async () => {
  videoTimeoutObservation('p144-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p144-throw', 0); throw error; }
  finally { videoTimeoutObservation('p144-exit', 0); }
});

test('Native saved candidate identities reject every replacement and legacy records cannot infer live identities', async () => {
  videoTimeoutObservation('p145-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p145-throw', 0); throw error; }
  finally { videoTimeoutObservation('p145-exit', 0); }
});

test('Native recovery refuses unproven Web exits, foreign identities and interrupted resource transitions', async () => {
  videoTimeoutObservation('p146-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p146-throw', 0); throw error; }
  finally { videoTimeoutObservation('p146-exit', 0); }
});

test('Native binding rejects stale source, mount, runtime and unhealthy API before producers are permitted', () => {
  videoTimeoutObservation('p147-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p147-throw', 0); throw error; }
  finally { videoTimeoutObservation('p147-exit', 0); }
});

test('Native actual old-pair capture accepts enabled video flags and rejects cached environment and mounts before journal creation or producer stop', async t => {
  videoTimeoutObservation('p148-begin', 0);
  try {

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
    const run = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 62), runInNewContext(`${timeout}\n${inventory}\n${capture}\n${operation}; nativeOperation`, context));
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

  } catch (error) { videoTimeoutObservation('p148-throw', 0); throw error; }
  finally { videoTimeoutObservation('p148-exit', 0); }
});

test('Native Compose 2.26 startup adapter creates without starting before the pinned startup operation', async t => {
  videoTimeoutObservation('p149-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p149-throw', 0); throw error; }
  finally { videoTimeoutObservation('p149-exit', 0); }
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
  Object.assign(ctx, (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 63), runInNewContext(`${helpers}; ({nativeCommandTimeout,nativeContainers,startNativeApplication})`, ctx)));
  return { ...f, extra, startup, reads, startupFaults: faults, now: () => clock,
    start: () => f.run('native-start-application') };
}

test('Native exact-ID startup preserves producer order, original identities and stopped roles', async t => {
  videoTimeoutObservation('p150-begin', 0);
  try {

  for (const [target, stopped] of [['candidate', []], ['original', []], ['candidate', ['api']], ['candidate', ['web']], ['candidate', ['agentWorker']]]) {
    await t.test(`${target} / stopped ${stopped.join(',') || 'none'}`, async () => {
  videoTimeoutObservation('p150-n1-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p150-n1-throw', 0); throw error; }
  finally { videoTimeoutObservation('p150-n1-exit', 0); }
});
  }

  } catch (error) { videoTimeoutObservation('p150-throw', 0); throw error; }
  finally { videoTimeoutObservation('p150-exit', 0); }
});

test('Native exact-ID startup rejects replacements, extra oneoffs, failed health and bounded timeouts', async t => {
  videoTimeoutObservation('p151-begin', 0);
  try {

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
  videoTimeoutObservation('p151-n1-begin', 0);
  try {

    const f = await nativeStartupFixture(); change(f);
    await assert.rejects(f.start(), /held|Native deployment|start|timer/u);
    assert.equal(f.startup.includes('agentWorker'), false);
    if (!label.includes('timer')) assert.equal(f.calls.includes('timer-enable'), false);
    if (label.includes('deadline')) { assert.equal(f.now(), 300_000); assert.ok(f.reads.some(read => read.timeout < 30_000)); }
    assert.equal(f.calls.some(value => /kill|recreate/u.test(value)), false);

  } catch (error) { videoTimeoutObservation('p151-n1-throw', 0); throw error; }
  finally { videoTimeoutObservation('p151-n1-exit', 0); }
});

  } catch (error) { videoTimeoutObservation('p151-throw', 0); throw error; }
  finally { videoTimeoutObservation('p151-exit', 0); }
});

test('Native before-start capture rejects extra producer inventory without persisting a checkpoint', async t => {
  videoTimeoutObservation('p152-begin', 0);
  try {

  for (const role of ['api', 'web', 'agentWorker']) for (const oneoff of ['False', 'True']) await t.test(`${role}/${oneoff}`, async () => {
  videoTimeoutObservation('p152-n1-begin', 0);
  try {

    const f = await nativeStartupFixture();
    f.journal.nativeRefresh.candidateCheckpoint = null; delete f.journal.nativeRefresh.candidateContainers;
    const extra = structuredClone(f.containers[role]); extra.Id = 'e'.repeat(64); extra.Config.Labels['com.docker.compose.oneoff'] = oneoff; f.extra.push(extra);
    if (oneoff === 'True') assert.equal((await f.context.nativeContainers())[role].Id, f.containers[role].Id, 'default inventory behavior remains unchanged');
    await assert.rejects(f.run('native-before-start'), /held|Native deployment/u);
    assert.equal(f.journal.nativeRefresh.candidateCheckpoint, null);
    assert.equal(Object.hasOwn(f.journal.nativeRefresh, 'candidateContainers'), false);
    assert.deepEqual(f.startup, []);

  } catch (error) { videoTimeoutObservation('p152-n1-throw', 0); throw error; }
  finally { videoTimeoutObservation('p152-n1-exit', 0); }
});

  } catch (error) { videoTimeoutObservation('p152-throw', 0); throw error; }
  finally { videoTimeoutObservation('p152-exit', 0); }
});

test('Native pinned startup CLI requires only exact target and existing transaction identity', () => {
  videoTimeoutObservation('p153-begin', 0);
  try {

  const body = deployLockSource.match(/function parseNativeCli\([^)]*\) \{[\s\S]*?\n\}/u)?.[0];
  assert.ok(body);
  const parse = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 64), runInNewContext(`${body}; parseNativeCli`, { SHA_PATTERN: /^[a-f0-9]{40}$/u,
    PRODUCTION_JOURNAL: '/journal', PRODUCTION_LOCK_DIRECTORY: '/lock', invalidNativeState() { throw Error('held'); } }));
  const base = ['--candidate', 'b'.repeat(40), '--rollback', 'a'.repeat(40), '--lock-fd', '9', '--target', 'candidate'];
  assert.equal(parse(base, 'native-start-application').target, 'candidate');
  assert.equal(parse([...base.slice(0, -1), 'original'], 'native-start-application').target, 'original');
  for (const args of [base.slice(0, -2), [...base, '--service', 'api'], [...base, '--target', 'candidate'], [...base.slice(0, -1), 'foreign']])
    assert.throws(() => parse(args, 'native-start-application'), /held/u);

  } catch (error) { videoTimeoutObservation('p153-throw', 0); throw error; }
  finally { videoTimeoutObservation('p153-exit', 0); }
});

test('Native partial startup rollback retains saved identities and never starts later producers', async t => {
  videoTimeoutObservation('p154-begin', 0);
  try {

  for (const failure of ['startFail', 'startTimeout', 'unhealthy']) await t.test(failure, async () => {
  videoTimeoutObservation('p154-n1-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p154-n1-throw', 0); throw error; }
  finally { videoTimeoutObservation('p154-n1-exit', 0); }
});

  } catch (error) { videoTimeoutObservation('p154-throw', 0); throw error; }
  finally { videoTimeoutObservation('p154-exit', 0); }
});

test('Native create-only failure hands full or mixed-created containers to checkpoint-null rollback without retry', async t => {
  videoTimeoutObservation('p155-begin', 0);
  try {

  const root = await mkdtemp(join(tmpdir(), 'xgs-native-create-fail-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [status, services] of [[16, ['api', 'web', 'agentWorker']], [124, ['api', 'web', 'agentWorker']], [16, ['web']], [124, ['api', 'agentWorker']]]) await t.test(`${status}/${services.join(',')}`, async () => {
  videoTimeoutObservation('p155-n1-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p155-n1-throw', 0); throw error; }
  finally { videoTimeoutObservation('p155-n1-exit', 0); }
});

  } catch (error) { videoTimeoutObservation('p155-throw', 0); throw error; }
  finally { videoTimeoutObservation('p155-exit', 0); }
});

test('Native startup oneoff rejection remains held through candidate rollback before stop or restore', async () => {
  videoTimeoutObservation('p156-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p156-throw', 0); throw error; }
  finally { videoTimeoutObservation('p156-exit', 0); }
});

test('Native original startup holds wrong recovery stages before any producer or timer write', async t => {
  videoTimeoutObservation('p157-begin', 0);
  try {

  const stages = [
    ['not_started', 'not_attempted', 'not_started'], ['quiescing', 'not_attempted', 'not_started'],
    ['quiesced', 'not_attempted', 'not_started'], ['rollback_quiescing', 'not_attempted', 'not_started'],
    ['rollback_quiesced', 'install_attempting', 'not_started'], ['quiesced', 'install_attempting', 'not_started'],
    ['quiesced', 'installed', 'restored_verified'], ['rollback_quiescing', 'installed', 'restored_verified'],
    ['rollback_quiesced', 'installed', 'restore_attempting'], ['rollback_quiesced', 'installed', 'not_started'],
  ];
  for (const [quiesceState, installState, restoreState] of stages) await t.test(`${quiesceState}/${installState}/${restoreState}`, async () => {
  videoTimeoutObservation('p157-n1-begin', 0);
  try {

    const f = await nativeStartupFixture({ target: 'original' }), state = f.journal.nativeRefresh;
    Object.assign(state, { quiesceState, installState, restoreState });
    if (installState !== 'installed') delete state.installation;
    const before = f.calls.length;
    await assert.rejects(f.start(), /Native deployment|held/u);
    assert.deepEqual(f.startup, []);
    assert.equal(f.calls.slice(before).some(call => call.startsWith('start:') || call.startsWith('timer-') || call.startsWith('query:')), false);

  } catch (error) { videoTimeoutObservation('p157-n1-throw', 0); throw error; }
  finally { videoTimeoutObservation('p157-n1-exit', 0); }
});

  } catch (error) { videoTimeoutObservation('p157-throw', 0); throw error; }
  finally { videoTimeoutObservation('p157-exit', 0); }
});

test('Native original startup accepts rollback-quiesced after a held work gate with no install attempt', async () => {
  videoTimeoutObservation('p158-begin', 0);
  try {

  const f = await nativeStartupFixture({ target: 'original', notAttempted: true });
  assert.equal(f.journal.nativeRefresh.quiesceState, 'rollback_quiesced');
  assert.equal(f.journal.nativeRefresh.installState, 'not_attempted');
  assert.equal(f.journal.nativeRefresh.restoreState, 'not_started');
  await f.start();
  assert.deepEqual(f.startup, ['api', 'web', 'agentWorker']);
  assert.equal(f.calls.includes('resource-write'), false);

  } catch (error) { videoTimeoutObservation('p158-throw', 0); throw error; }
  finally { videoTimeoutObservation('p158-exit', 0); }
});

test('Native checkpoint-null candidate rollback rejects running oneoffs before stop, query or restore', async t => {
  videoTimeoutObservation('p159-begin', 0);
  try {

  for (const role of ['api', 'web', 'agentWorker']) await t.test(role, async () => {
  videoTimeoutObservation('p159-n1-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p159-n1-throw', 0); throw error; }
  finally { videoTimeoutObservation('p159-n1-exit', 0); }
});

  } catch (error) { videoTimeoutObservation('p159-throw', 0); throw error; }
  finally { videoTimeoutObservation('p159-exit', 0); }
});

test('Native real rollback adapter checks feasibility before restore and never starts old pair on held recovery', async t => {
  videoTimeoutObservation('p160-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p160-throw', 0); throw error; }
  finally { videoTimeoutObservation('p160-exit', 0); }
});

test('Native actual rollback feasibility preflight is read-only and refuses reader, stale source and image incompatibility', async t => {
  videoTimeoutObservation('p161-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p161-throw', 0); throw error; }
  finally { videoTimeoutObservation('p161-exit', 0); }
});

test('Native journal CLI rejects unknown fields and malformed JSON without echoing their contents', () => {
  videoTimeoutObservation('p162-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p162-throw', 0); throw error; }
  finally { videoTimeoutObservation('p162-exit', 0); }
});

test('Native work-query loader executes complete imports from Worker without root dependency links', async t => {
  videoTimeoutObservation('p163-begin', 0);
  try {

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
  const completeQuery = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 65), runInNewContext(`${declaration}; NATIVE_WORK_QUERY`, {}));
  const loaded = spawnSync(process.execPath, ['--input-type=module', '-e', completeQuery, 'none'], { cwd: worker, env, encoding: 'utf8', timeout: 10_000 });
  assert.equal(loaded.status, 0, loaded.stderr);
  assert.deepEqual(JSON.parse(loaded.stdout), { safe: true, nativePending: false, nativeBoundPending: false, dbTime: '2026-10-09T08:00:00.000Z' });
  assert.deepEqual((await readFile(trace, 'utf8')).trim().split('\n').sort(), [
    'load.database', 'load.domain', 'db.open', 'redis.open', 'db.tasks', 'db.journals',
    'redis.lrange:fixture:queue', 'redis.lrange:fixture:queue:processing', 'db.clock', 'db.close', 'redis.close',
  ].sort());

  } catch (error) { videoTimeoutObservation('p163-throw', 0); throw error; }
  finally { videoTimeoutObservation('p163-exit', 0); }
});

test('Native query command selects Worker import origin and its real classifier path', async () => {
  videoTimeoutObservation('p164-begin', 0);
  try {

  const extract = name => {
    const body = deployLockSource.match(new RegExp(`(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`, 'u'))?.[0];
    assert.ok(body); return body;
  };
  const declaration = deployLockSource.match(/const NATIVE_WORK_QUERY = `[\s\S]*?`;/u)?.[0];
  assert.ok(declaration);
  const candidate = 'b'.repeat(40), checkpoint = '2026-10-09T07:00:00.000Z';
  const result = { safe: true, nativePending: false, nativeBoundPending: false, dbTime: '2026-10-09T08:00:00.000Z' };
  let calls = 0;
  const query = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 66), runInNewContext(`${extract('exactObjectKeys')}\n${declaration}\n${extract('queryNativeWork')}; queryNativeWork`, {
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
  }));
  assert.deepEqual(JSON.parse(JSON.stringify(await query(candidate, checkpoint))), result);
  assert.equal(calls, 1);

  } catch (error) { videoTimeoutObservation('p164-throw', 0); throw error; }
  finally { videoTimeoutObservation('p164-exit', 0); }
});

test('Native actual work-query code only reads queues and task markers and returns bounded nonsecret status', async () => {
  videoTimeoutObservation('p165-begin', 0);
  try {

  const declaration = deployLockSource.match(/const NATIVE_WORK_QUERY = `[\s\S]*?`;/u)?.[0];
  assert.ok(declaration);
  const code = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 67), runInNewContext(`${declaration}; NATIVE_WORK_QUERY`, {}));
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
  await (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 68), runInNewContext(`(async()=>{${code.replace(/^import[^\n]+\n/gmu, '')}})()`, context));
  assert.deepEqual(JSON.parse(output), { safe: true, nativePending: true, nativeBoundPending: bound, dbTime: '2026-10-09T08:00:00.000Z' });
  assert.equal(calls.at(-2), 'db-close'); assert.equal(calls.at(-1), 'redis-close');
  assert.equal(output.includes('t1'), false);
  assert.equal(output.includes(oldMarker.runtimeId), false);
  }

  } catch (error) { videoTimeoutObservation('p165-throw', 0); throw error; }
  finally { videoTimeoutObservation('p165-exit', 0); }
});

test('Native SQL work projection uses actual image readers and keeps malformed bindings closed', async t => {
  videoTimeoutObservation('p166-begin', 0);
  try {

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
    (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 69), runInNewContext(compiled.outputText, { module, exports: module.exports, structuredClone,
      require(name) { assert.ok(Object.hasOwn(dependencies, name), `Unexpected reader dependency ${name}`); return dependencies[name]; },
    }, { filename: file, timeout: 1_000 }));
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
  const code = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 70), runInNewContext(`${declaration}; NATIVE_WORK_QUERY`, {}));
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
    try { await (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 71), runInNewContext(`(async()=>{${code.replace(/^import[^\n]+\n/gmu, '')}})()`, context)); }
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
  videoTimeoutObservation('p166-n1-begin', 0);
  try {

      const observed = await run(result);
      accepted(observed);
      assert.deepEqual(Object.keys(observed.projected).sort(), ['nativeAgentExecution', 'nativeImageReview']);
      assert.deepEqual(observed.projected.nativeImageReview, result.nativeImageReview);

  } catch (error) { videoTimeoutObservation('p166-n1-throw', 0); throw error; }
  finally { videoTimeoutObservation('p166-n1-exit', 0); }
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
  videoTimeoutObservation('p166-n2-begin', 0);
  try {

      const result = prepared(true); change(result);
      const observed = await run(result);
      assert.equal(observed.failure?.name, 'PresentationAssetError');
      assert.equal(observed.failure?.code, 'VALIDATION_ERROR');
      assert.equal(observed.output, '');
      assert.equal(observed.calls.includes('clock'), false);

  } catch (error) { videoTimeoutObservation('p166-n2-throw', 0); throw error; }
  finally { videoTimeoutObservation('p166-n2-exit', 0); }
});
  }
  await t.test('retains the original paper pending classification without an image envelope', async () => {
  videoTimeoutObservation('p166-n3-begin', 0);
  try {

    const observed = await run({ nativeAgentExecution: { ...marker, profile: 'paper-understanding' } }, 'sdf.extract');
    accepted(observed);

  } catch (error) { videoTimeoutObservation('p166-n3-throw', 0); throw error; }
  finally { videoTimeoutObservation('p166-n3-exit', 0); }
});
  await t.test('retains unbound presentation pending without a Native Agent marker', async () => {
  videoTimeoutObservation('p166-n4-begin', 0);
  try {

    const observed = await run({ nativeImageReview: { mode: 'model-native', state: 'not_started' } });
    accepted(observed, { safe: true, nativePending: true, nativeBoundPending: false });
    assert.equal(observed.projected, null);

  } catch (error) { videoTimeoutObservation('p166-n4-throw', 0); throw error; }
  finally { videoTimeoutObservation('p166-n4-exit', 0); }
});
  await t.test('keeps queued started or unknown provider work unsafe', async () => {
  videoTimeoutObservation('p166-n5-begin', 0);
  try {

    const result = prepared(true), cp = result.nativeAgentExecution.checkpoint;
    cp.state = 'started'; delete cp.responseHash; delete cp.finishReason; delete cp.hasToolCalls;
    accepted(await run(result), { safe: false, nativePending: true, nativeBoundPending: true });
    accepted(await run(fresh(), 'presentation.generate', 'provider outcome unknown'), { safe: false, nativePending: true, nativeBoundPending: true });

  } catch (error) { videoTimeoutObservation('p166-n5-throw', 0); throw error; }
  finally { videoTimeoutObservation('p166-n5-exit', 0); }
});

  } catch (error) { videoTimeoutObservation('p166-throw', 0); throw error; }
  finally { videoTimeoutObservation('p166-exit', 0); }
});

test('Native actual pause defers candidate-schema reads until migration and install rejects old-bound pending before resource writes', async () => {
  videoTimeoutObservation('p167-begin', 0);
  try {

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
    const operation = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 72), runInNewContext(`${body}; nativeOperation`, context)), options = { candidateSha: candidate, rollbackSha: 'a'.repeat(40) };
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

  } catch (error) { videoTimeoutObservation('p167-throw', 0); throw error; }
  finally { videoTimeoutObservation('p167-exit', 0); }
});

test('Native actual installer operation holds interrupted and unpersisted success instead of invoking restore', async () => {
  videoTimeoutObservation('p168-begin', 0);
  try {

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
    const operation = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 73), runInNewContext(`${body}; nativeOperation`, context));
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

  } catch (error) { videoTimeoutObservation('p168-throw', 0); throw error; }
  finally { videoTimeoutObservation('p168-exit', 0); }
});

test('Native actual restore operation records intent and holds partial or unverified restoration', async () => {
  videoTimeoutObservation('p169-begin', 0);
  try {

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
    const operation = (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 74), runInNewContext(`${body}; nativeOperation`, context)), options = { candidateSha: candidate, rollbackSha: 'a'.repeat(40) };
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

  } catch (error) { videoTimeoutObservation('p169-throw', 0); throw error; }
  finally { videoTimeoutObservation('p169-exit', 0); }
});

test('Native quiesce persists switching before stopping producers and prepared uncertainty retains its journal', async t => {
  videoTimeoutObservation('p170-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p170-throw', 0); throw error; }
  finally { videoTimeoutObservation('p170-exit', 0); }
});

test('Native real journal preserves metadata on phase updates and refuses clearing interrupted installation under FD9', async t => {
  videoTimeoutObservation('p171-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p171-throw', 0); throw error; }
  finally { videoTimeoutObservation('p171-exit', 0); }
});

function deploymentFunction(name) {
  const body = transactionSource.match(new RegExp(`${name}\\(\\) \\{[\\s\\S]*?\\n\\}`, 'u'))?.[0];
  assert.ok(body, `${name} production function is missing`);
  return body;
}

test('production commit publishes durable rollback identity before exact retention', () => {
  videoTimeoutObservation('p172-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p172-throw', 0); throw error; }
  finally { videoTimeoutObservation('p172-exit', 0); }
});

test('normal publication prunes inactive releases only after acceptance and keeps committed cleanup failure visible', async t => {
  videoTimeoutObservation('p173-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p173-throw', 0); throw error; }
  finally { videoTimeoutObservation('p173-exit', 0); }
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
  videoTimeoutObservation('p174-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p174-throw', 0); throw error; }
  finally { videoTimeoutObservation('p174-exit', 0); }
});

test('exact public release acceptance reports only an observed SHA or length, never the response body', () => {
  videoTimeoutObservation('p175-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p175-throw', 0); throw error; }
  finally { videoTimeoutObservation('p175-exit', 0); }
});

async function runWebReadiness(origin, options = {}) {
  const calls = [];
  const outcome = new Promise(resolve => {
    (videoTimeoutCount('vmCreated'), videoTimeoutObservation('vm-create', 75), runInNewContext(webReadinessCode(), {
      fetch: (url, init) => {
        const requested = new URL(url);
        assert.equal(requested.origin, 'http://127.0.0.1:3000');
        assert.equal(requested.pathname, '/');
        calls.push({ url, init });
        return fetch(origin + requested.pathname, init);
      },
      AbortSignal: options.signal ?? AbortSignal,
      process: { exit: resolve },
    }));
  });
  return { exit: await outcome, calls };
}

test('Web readiness rejects an HTTP server that is running but not ready, then accepts its actual homepage', async t => {
  videoTimeoutObservation('p176-begin', 0);
  try {

  let status = 503;
  const server = createServer((_request, response) => { response.writeHead(status); response.end(); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await runWebReadiness(origin)).exit, 1);
  status = 200;
  assert.equal((await runWebReadiness(origin)).exit, 0);

  } catch (error) { videoTimeoutObservation('p176-throw', 0); throw error; }
  finally { videoTimeoutObservation('p176-exit', 0); }
});

test('Web readiness does not hide a redirect behind a successful destination', async t => {
  videoTimeoutObservation('p177-begin', 0);
  try {

  const routes = [];
  const server = createServer((request, response) => {
    routes.push(request.url);
    response.writeHead(request.url === '/' ? 302 : 200, request.url === '/' ? { location: '/ready' } : {}); response.end();
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  assert.equal((await runWebReadiness(`http://127.0.0.1:${server.address().port}`)).exit, 1);
  assert.deepEqual(routes, ['/']);

  } catch (error) { videoTimeoutObservation('p177-throw', 0); throw error; }
  finally { videoTimeoutObservation('p177-exit', 0); }
});

test('Web readiness bounds an unresponsive HTTP request and denies connection failure', async t => {
  videoTimeoutObservation('p178-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p178-throw', 0); throw error; }
  finally { videoTimeoutObservation('p178-exit', 0); }
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
  videoTimeoutObservation('p179-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p179-throw', 0); throw error; }
  finally { videoTimeoutObservation('p179-exit', 0); }
});

test('candidate capability stays absent through prepublication and is exact-cleaned on either publish failure boundary', async (t) => {
  videoTimeoutObservation('p180-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p180-throw', 0); throw error; }
  finally { videoTimeoutObservation('p180-exit', 0); }
});

test('ordinary rollback preserves paid video plans created after candidate exposure before commit', async t => {
  videoTimeoutObservation('p181-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p181-throw', 0); throw error; }
  finally { videoTimeoutObservation('p181-exit', 0); }
});

test('protected rollback sidecar survives candidate rejection and cleanup byte-for-byte', async (t) => {
  videoTimeoutObservation('p182-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p182-throw', 0); throw error; }
  finally { videoTimeoutObservation('p182-exit', 0); }
});

test('failed candidate CAS cleans only the sidecar created by the real publish path', async (t) => {
  videoTimeoutObservation('p183-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p183-throw', 0); throw error; }
  finally { videoTimeoutObservation('p183-exit', 0); }
});

test('SSH runner does not misclassify a remote permission error as key authentication failure', () => {
  videoTimeoutObservation('p184-begin', 0);
  try {

  assert.match(sshRun, /\[ \$rc -eq 255 \]/u);
  assert.match(sshRun, /permission denied \\?\([^)]*(?:publickey|password|keyboard-interactive)[^)]*\\?\)/iu);
  assert.doesNotMatch(sshRun, /permission denied\|host key verification/iu);

  } catch (error) { videoTimeoutObservation('p184-throw', 0); throw error; }
  finally { videoTimeoutObservation('p184-exit', 0); }
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
  videoTimeoutObservation('p185-begin', 0);
  try {

  assert.doesNotMatch(workerDockerfile, /tesseract(?:-ocr)?/i);
  assert.match(parserDockerfile, /tesseract-ocr/);
  assert.match(parserDockerfile, /USER node/);
  assert.match(workerDockerfile, /LABEL org\.openscience\.source=\$XGS_RELEASE_IMAGE_TAG/);
  assert.match(parserDockerfile, /LABEL org\.openscience\.source=\$XGS_RELEASE_IMAGE_TAG/);
  const releaseImages = `${composeService('agent-worker', 'scansci-mcp')}\n${composeService('document-parser', 'embedding-model-init')}`;
  assert.equal(releaseImages.match(/XGS_RELEASE_IMAGE_TAG: \$\{XGS_RELEASE_IMAGE_TAG:\?XGS_RELEASE_IMAGE_TAG required\}/g)?.length, 2);

  } catch (error) { videoTimeoutObservation('p185-throw', 0); throw error; }
  finally { videoTimeoutObservation('p185-exit', 0); }
});

test('production search runtime is isolated, bounded and source locked', () => {
  videoTimeoutObservation('p186-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p186-throw', 0); throw error; }
  finally { videoTimeoutObservation('p186-exit', 0); }
});

test('embedding Python supply chain is complete, immutable and hash enforced', () => {
  videoTimeoutObservation('p187-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p187-throw', 0); throw error; }
  finally { videoTimeoutObservation('p187-exit', 0); }
});

test('database backup atomically publishes a private, single-flight dual-database set', () => {
  videoTimeoutObservation('p188-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p188-throw', 0); throw error; }
  finally { videoTimeoutObservation('p188-exit', 0); }
});

test('database backup retention inventory fails closed when its producer fails', () => {
  videoTimeoutObservation('p189-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p189-throw', 0); throw error; }
  finally { videoTimeoutObservation('p189-exit', 0); }
});

test('embedding capability is strict, release-versioned and rollback-safe', () => {
  videoTimeoutObservation('p190-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p190-throw', 0); throw error; }
  finally { videoTimeoutObservation('p190-exit', 0); }
});

test('production compose up receives the same env file used by migrate and validation', () => {
  videoTimeoutObservation('p191-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p191-throw', 0); throw error; }
  finally { videoTimeoutObservation('p191-exit', 0); }
});

test('parser starts first and must become healthy before the worker is converged', () => {
  videoTimeoutObservation('p192-begin', 0);
  try {

  assert.match(source, /compose_current "build agent-worker document-parser"/);
  assert.match(
    source,
    /compose_current "up -d --force-recreate --wait --wait-timeout 300 document-parser"/,
  );
  assert.doesNotMatch(source, /restart api web agent-worker document-parser/);
  assert.match(source, /up -d --force-recreate --wait --wait-timeout 300 api web agent-worker/);
  assert.doesNotMatch(source, /wait_for_healthy\s*\n/);

  } catch (error) { videoTimeoutObservation('p192-throw', 0); throw error; }
  finally { videoTimeoutObservation('p192-exit', 0); }
});

test('deployment fails unless application health and public status checks pass', () => {
  videoTimeoutObservation('p193-begin', 0);
  try {

  assert.match(source, /wait_for_healthy api web agent-worker/);
  assert.match(source, /verify-embedding-runtime\.mjs/);
  assert.match(source, /expect_http_status .*auth\/me 401/);
  assert.doesNotMatch(source, /curl[^\n]+\|\| true/);

  } catch (error) { videoTimeoutObservation('p193-throw', 0); throw error; }
  finally { videoTimeoutObservation('p193-exit', 0); }
});

test('clean release uses the frozen lockfile and generates Prisma before compiling any workspace package', () => {
  videoTimeoutObservation('p194-begin', 0);
  try {

  const candidateBuild = 'cd $RELEASE_ROOT && with-proxy npx pnpm@9.15.0 install --ignore-scripts --frozen-lockfile && with-proxy npx pnpm@9.15.0 --filter @openscience/database generate && with-proxy npx pnpm@9.15.0 build';
  assert.ok(source.includes(candidateBuild));
  assert.doesNotMatch(source, /首次版本化发布|first-transition-adapter/);

  } catch (error) { videoTimeoutObservation('p194-throw', 0); throw error; }
  finally { videoTimeoutObservation('p194-exit', 0); }
});

test('deployment publishes and verifies the exact immutable release identity', () => {
  videoTimeoutObservation('p195-begin', 0);
  try {

  assert.match(source, /verify-release-source\.mjs" --root "\$PROJECT_ROOT" --ref "\$RELEASE_REF"/);
  assert.match(source, /cas-active --marker '\$REMOTE_ROOT\/\.release-id' --expected '\$ROLLBACK_SHA' --next '\$RELEASE_SHA' --lock-fd 9/);
  assert.match(source, /expect_http_body .*\/__release "\$RELEASE_SHA"/);
  assert.match(launcherSource, /ANCESTRY_ARGS=\(--ancestor "\$ROLLBACK_SHA"\)/);
  assert.ok(launcherSource.indexOf('"${ANCESTRY_ARGS[@]}"') < launcherSource.indexOf('scripts/cloud-sync.mjs'));

  } catch (error) { videoTimeoutObservation('p195-throw', 0); throw error; }
  finally { videoTimeoutObservation('p195-exit', 0); }
});

test('release source guard accepts forward history and rejects missing, backward or sibling releases', async t => {
  videoTimeoutObservation('p196-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p196-throw', 0); throw error; }
  finally { videoTimeoutObservation('p196-exit', 0); }
});

test('release source guard rejects dirty trees and refs other than HEAD', async () => {
  videoTimeoutObservation('p197-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p197-throw', 0); throw error; }
  finally { videoTimeoutObservation('p197-exit', 0); }
});

test('cloud sync materializes the complete commit in an immutable release directory', () => {
  videoTimeoutObservation('p198-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p198-throw', 0); throw error; }
  finally { videoTimeoutObservation('p198-exit', 0); }
});

test('release materialization is write-once and cleans only a failed stage', async () => {
  videoTimeoutObservation('p199-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p199-throw', 0); throw error; }
  finally { videoTimeoutObservation('p199-exit', 0); }
});

test('deployment keeps an application rollback trap until public health succeeds', () => {
  videoTimeoutObservation('p200-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p200-throw', 0); throw error; }
  finally { videoTimeoutObservation('p200-exit', 0); }
});

test('confirmed deployment materializes only an immutable candidate before the lock-in active check', () => {
  videoTimeoutObservation('p201-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p201-throw', 0); throw error; }
  finally { videoTimeoutObservation('p201-exit', 0); }
});

test('one foreground SSH runs the complete transaction under its own inherited FD9', () => {
  videoTimeoutObservation('p202-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p202-throw', 0); throw error; }
  finally { videoTimeoutObservation('p202-exit', 0); }
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
  videoTimeoutObservation('p203-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p203-throw', 0); throw error; }
  finally { videoTimeoutObservation('p203-exit', 0); }
});

test('production transaction lock rejects pre-positioned directory and lock symlinks without truncating targets', async (t) => {
  videoTimeoutObservation('p204-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p204-throw', 0); throw error; }
  finally { videoTimeoutObservation('p204-exit', 0); }
});

test('terminating the transaction connection process group stops its in-lock payload', async (t) => {
  videoTimeoutObservation('p205-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p205-throw', 0); throw error; }
  finally { videoTimeoutObservation('p205-exit', 0); }
});

test('durable journal and active CAS stay on inherited FD9 across crash and TERM recovery', async (t) => {
  videoTimeoutObservation('p206-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p206-throw', 0); throw error; }
  finally { videoTimeoutObservation('p206-exit', 0); }
});

test('shared production state machine traps every durable phase and commits without stdin or signal ambiguity', async (t) => {
  videoTimeoutObservation('p207-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p207-throw', 0); throw error; }
  finally { videoTimeoutObservation('p207-exit', 0); }
});

test('active release mutator rejects every call without the inherited production FD9', async () => {
  videoTimeoutObservation('p208-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p208-throw', 0); throw error; }
  finally { videoTimeoutObservation('p208-exit', 0); }
});

test('confirmed deployment acquires the remote flock before reading active state and retains it through publication', () => {
  videoTimeoutObservation('p209-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p209-throw', 0); throw error; }
  finally { videoTimeoutObservation('p209-exit', 0); }
});

test('production Compose operations pin the immutable release as project directory', () => {
  videoTimeoutObservation('p210-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p210-throw', 0); throw error; }
  finally { videoTimeoutObservation('p210-exit', 0); }
});

test('official-only rollback verifies the legacy schema-5 MCP with the candidate verifier', () => {
  videoTimeoutObservation('p211-begin', 0);
  try {

  assert.match(
    source,
    /\/usr\/bin\/node '\$RELEASE_ROOT\/infra\/scripts\/verify-scansci-mcp-runtime\.mjs' --release-root '\$PREVIOUS_RELEASE_ROOT'/u,
  );
  assert.doesNotMatch(
    source,
    /\/usr\/bin\/node '\$PREVIOUS_RELEASE_ROOT\/infra\/scripts\/verify-scansci-mcp-runtime\.mjs'/u,
  );
  assert.ok(source.includes('test -z \\"\\$containers\\"'));

  } catch (error) { videoTimeoutObservation('p211-throw', 0); throw error; }
  finally { videoTimeoutObservation('p211-exit', 0); }
});

test('final parser acceptance report and exact image IDs are verified after build and before switch', () => {
  videoTimeoutObservation('p212-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p212-throw', 0); throw error; }
  finally { videoTimeoutObservation('p212-exit', 0); }
});

test('production rebuild restores the accepted runtime permissions before image and report verification', () => {
  videoTimeoutObservation('p213-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p213-throw', 0); throw error; }
  finally { videoTimeoutObservation('p213-exit', 0); }
});

test('deployment revalidates active source, report and mutable image tags after migrations and checks started container image IDs', () => {
  videoTimeoutObservation('p214-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p214-throw', 0); throw error; }
  finally { videoTimeoutObservation('p214-exit', 0); }
});

test('switch identity validator rejects active drift, post-acceptance retags and wrong running images', async () => {
  videoTimeoutObservation('p215-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p215-throw', 0); throw error; }
  finally { videoTimeoutObservation('p215-exit', 0); }
});

test('root unit-test command includes the release-contract gate exactly once', () => {
  videoTimeoutObservation('p216-begin', 0);
  try {

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

  } catch (error) { videoTimeoutObservation('p216-throw', 0); throw error; }
  finally { videoTimeoutObservation('p216-exit', 0); }
});

test('worker and parser images are immutable per release and rollback uses exact previous tags', () => {
  videoTimeoutObservation('p217-begin', 0);
  try {

  assert.match(productionCompose, /image: openscience-agent-worker:\$\{XGS_RELEASE_IMAGE_TAG:\?XGS_RELEASE_IMAGE_TAG required\}/);
  assert.match(productionCompose, /image: openscience-document-parser:\$\{XGS_RELEASE_IMAGE_TAG:\?XGS_RELEASE_IMAGE_TAG required\}/);
  assert.match(source, /docker image inspect openscience-agent-worker:\$PREVIOUS_RELEASE_SHA openscience-document-parser:\$PREVIOUS_RELEASE_SHA/);
  assert.doesNotMatch(source, /docker tag "\$worker_image"|docker tag "\$parser_image"/);
  assert.doesNotMatch(source, /cd \$PREVIOUS_RELEASE_ROOT && with-proxy npx pnpm@9\.15\.0 install/);
  assert.match(source, /XGS_RELEASE_IMAGE_TAG=\$RELEASE_SHA/);
  assert.match(source, /XGS_RELEASE_IMAGE_TAG=\$PREVIOUS_RELEASE_SHA/);

  } catch (error) { videoTimeoutObservation('p217-throw', 0); throw error; }
  finally { videoTimeoutObservation('p217-exit', 0); }
});

test('application containers run non-root with read-only release mounts', () => {
  videoTimeoutObservation('p218-begin', 0);
  try {

  for (const serviceName of ['api', 'agent-worker', 'web']) {
    const section = productionCompose.split(`\n  ${serviceName}:`)[1]?.split(/\n  [a-z]/)[0] ?? '';
    assert.match(section, /user: node/);
    assert.match(section, /:\/opt\/openscience:ro/);
  }
  const web = productionCompose.split('\n  web:')[1]?.split(/\n  [a-z]/)[0] ?? '';
  assert.match(web, /tmpfs:[\s\S]*\/opt\/openscience\/apps\/web\/\.next\/cache:[^\n]*uid=1000[^\n]*gid=1000/);

  } catch (error) { videoTimeoutObservation('p218-throw', 0); throw error; }
  finally { videoTimeoutObservation('p218-exit', 0); }
});

test('an already-active SHA exits before install or build', () => {
  videoTimeoutObservation('p219-begin', 0);
  try {

  assert.match(source, /ACTIVE_RELEASE_SHA/);
  assert.match(source, /already active/);
  assert.ok(source.indexOf('already active') < source.indexOf('npx pnpm@9.15.0 install'));

  } catch (error) { videoTimeoutObservation('p219-throw', 0); throw error; }
  finally { videoTimeoutObservation('p219-exit', 0); }
});

test('scheduled backup resolves the active immutable release and is refreshed by deployment', () => {
  videoTimeoutObservation('p220-begin', 0);
  try {

  assert.match(backup, /RELEASE_SHA=.*\.release-id/);
  assert.match(backup, /export XGS_RELEASE_ROOT="\$RELEASE_ROOT" XGS_RELEASE_IMAGE_TAG="\$RELEASE_SHA"/);
  assert.doesNotMatch(backup, /SCANSCI_BROWSER|scansci-legal/u);
  assert.match(backup, /COMPOSE=\(docker compose --project-directory "\$RELEASE_ROOT" --env-file/);
  assert.match(backup, /"\$\{COMPOSE\[@\]\}" exec -T postgres/);
  assert.match(source, /backup\.sh\.next/);
  assert.match(source, /bash -n .*backup\.sh\.next/);
  assert.match(source, /mv .*backup\.sh\.next \/usr\/local\/bin\/backup\.sh/);
  assert.ok(source.indexOf('expect_http_body') < source.lastIndexOf('backup.sh.next'));

  } catch (error) { videoTimeoutObservation('p220-throw', 0); throw error; }
  finally { videoTimeoutObservation('p220-exit', 0); }
});

function expectNonzero(result) {
  assert.notEqual(result.status, 0, result.stderr?.toString());
}

test('parser reuses the production worker base that is available on ECS', () => {
  videoTimeoutObservation('p221-begin', 0);
  try {

  const workerBase = workerDockerfile.match(/^FROM (\S+)/m)?.[1];
  const parserBase = parserDockerfile.match(/^FROM (\S+)/m)?.[1];
  assert.equal(parserBase, workerBase);

  } catch (error) { videoTimeoutObservation('p221-throw', 0); throw error; }
  finally { videoTimeoutObservation('p221-exit', 0); }
});

test('parser build reaches registries through the ECS egress proxy without changing runtime isolation', () => {
  videoTimeoutObservation('p222-begin', 0);
  try {

  const parserService = productionCompose.split('\n  document-parser:')[1]?.split('\n  web:')[0] ?? '';
  const workerService = productionCompose.split('\n  agent-worker:')[1]?.split('\n  document-parser:')[0] ?? '';
  assert.match(parserService, /build:\r?\n[\s\S]*network: host/);
  assert.match(parserService, /HTTPS_PROXY: http:\/\/127\.0\.0\.1:7891/);
  assert.match(workerService, /build:\r?\n[\s\S]*network: host/);
  assert.match(workerService, /HTTPS_PROXY: http:\/\/127\.0\.0\.1:7891/);
  assert.match(parserService, /network_mode: none/);
  assert.match(parserService, /cpus: 2/);

  } catch (error) { videoTimeoutObservation('p222-throw', 0); throw error; }
  finally { videoTimeoutObservation('p222-exit', 0); }
});
