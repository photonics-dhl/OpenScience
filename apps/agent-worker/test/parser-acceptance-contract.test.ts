import { readFileSync } from 'node:fs';
import { access, lstat, mkdir, mkdtemp, readFile, readdir, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  CANONICAL_CORPUS_MANIFEST_SHA256,
  buildFinalAcceptanceReport,
  cleanupAcceptanceRun,
  classifyAcceptanceHandlerResult,
  createAcceptanceGatewaySeam,
  deriveFixedAcceptancePaths,
  parseCanonicalManifest,
  prepareAcceptancePaths,
  readBoundedAcceptanceJson,
  validateAcceptanceDraft,
  validateRuntimeEvidence,
  writeAtomicAcceptanceReport,
} from '../src/parser-acceptance-contract';

const canonicalManifest = readFileSync(new URL('../../../test/research-intelligence/manifest.json', import.meta.url));
const canonicalIds = [
  'corrupt-pdf-en', 'dual-column-pdf-en', 'formula-pdf-en', 'markdown-mixed',
  'native-docx-en', 'native-pdf-en', 'notebook-en', 'python-code-en',
  'references-markdown-en', 'references-pdf-en', 'scan-pdf-image-only', 'scan-png-empty',
  'table-csv-mixed', 'table-pdf-en', 'table-xlsx-en', 'tex-formula-en',
];

function validDraft() {
  const identities = [
    ['corrupt-pdf-en', 'needs_review', 0, 1],
    ['dual-column-pdf-en', 'succeeded', 5, 5],
    ['formula-pdf-en', 'succeeded', 2, 2],
    ['markdown-mixed', 'succeeded', 2, 2],
    ['native-docx-en', 'succeeded', 1, 1],
    ['native-pdf-en', 'succeeded', 1, 1],
    ['notebook-en', 'needs_review', 0, 1],
    ['python-code-en', 'needs_review', 0, 1],
    ['references-markdown-en', 'succeeded', 1, 1],
    ['references-pdf-en', 'succeeded', 2, 2],
    ['scan-pdf-image-only', 'succeeded', 2, 2],
    ['scan-png-empty', 'needs_review', 0, 1],
    ['table-csv-mixed', 'needs_review', 0, 1],
    ['table-pdf-en', 'succeeded', 3, 3],
    ['table-xlsx-en', 'needs_review', 1, 1],
    ['tex-formula-en', 'succeeded', 1, 1],
  ] as const;
  const manifest = parseCanonicalManifest(canonicalManifest);
  const cases = identities.map(([id, status, locatorMatches, locatorTotal], index) => ({
    id,
    contentHash: manifest.cases[index]!.sha256,
    status,
    handlerStatus: status === 'succeeded' ? 'completed' : 'needs_review',
    locatorMatches,
    locatorTotal,
    falseReady: false,
    elapsedMs: index + 1,
    stages: status === 'succeeded' ? [{
      parser: id === 'scan-pdf-image-only' ? 'tesseract' : 'v1-text-transition',
      version: id === 'scan-pdf-image-only' ? '5.3.0' : '2.0.0',
      confidence: id === 'scan-pdf-image-only' ? 0.97 : null,
      boundingBox: { x: 10, y: 20, width: 30, height: 40 },
      transformations: [{
        stage: id === 'scan-pdf-image-only' ? 'local_ocr' : 'extract_text',
        parser: id === 'scan-pdf-image-only' ? 'tesseract' : 'v1-text-transition',
        version: id === 'scan-pdf-image-only' ? '5.3.0' : '2.0.0',
      }],
    }] : [],
  }));
  return {
    schemaVersion: 2,
    sourceSha: 'a'.repeat(40),
    manifestSha256: CANONICAL_CORPUS_MANIFEST_SHA256,
    images: { worker: `sha256:${'b'.repeat(64)}`, parser: `sha256:${'c'.repeat(64)}` },
    runtimeProcess: { uid: 1000, gid: 1000, effectiveEnvCount: 0 },
    gatewayCalls: {
      structuredFake: 10, externalProvider: 0,
      forbidden: { complete: 0, ocr: 0, stream: 0, unknown: 0 },
    },
    summary: { falseReadyCount: 0, failed: 0, succeeded: 10, needsReview: 6, p50ElapsedMs: 8, p95ElapsedMs: 16 },
    cases,
  };
}

function validResources(draft = validDraft()) {
  const releaseRoot = `/opt/openscience-releases/${draft.sourceSha}`;
  const acceptanceRoot = `/opt/openscience-acceptance/document-parser/${draft.sourceSha}`;
  const runRoot = `${acceptanceRoot}/.run-${draft.sourceSha.slice(0, 12)}-1234`;
  const workerOutputRoot = `${runRoot}/worker-output`;
  const jobVolume = `openscience-parser-accept-jobs-${draft.sourceSha.slice(0, 12)}-1234`;
  const common = {
    user: '1000:1000', effectiveEnvCount: 0, networkMode: 'none', readOnlyRootfs: true,
    capDrop: ['ALL'], noNewPrivileges: true, nanoCpus: 2_000_000_000, pidsLimit: 64,
    tmpfsBytes: 67_108_864, jobVolumeBytes: 67_108_864,
  };
  return {
    build: { sourceSha: draft.sourceSha, runnerSha256: '1'.repeat(64), contractSha256: '2'.repeat(64) },
    worker: {
      ...common, containerId: 'd'.repeat(64), imageId: draft.images.worker,
      running: false, exitCode: 0,
      memoryBytes: 1_073_741_824, memorySwapBytes: 1_073_741_824,
      cpuUsageMicros: 12_345, peakRssBytes: 268_435_456,
      mounts: [
        { type: 'volume', source: jobVolume, destination: '/parser-jobs', readOnly: false },
        { type: 'bind', source: releaseRoot, destination: '/opt/openscience', readOnly: true },
        { type: 'bind', source: `${acceptanceRoot}/corpus`, destination: '/acceptance-corpus', readOnly: true },
        { type: 'bind', source: workerOutputRoot, destination: '/acceptance-output', readOnly: false },
      ],
    },
    parser: {
      ...common, containerId: 'e'.repeat(64), imageId: draft.images.parser,
      running: true, exitCode: 0,
      memoryBytes: 536_870_912, memorySwapBytes: 536_870_912,
      cpuUsageMicros: 23_456, peakRssBytes: 134_217_728,
      mounts: [{ type: 'volume', source: jobVolume, destination: '/parser-jobs', readOnly: false }],
    },
    maxima: { cpuUsageMicros: 23_456, peakRssBytes: 268_435_456 },
  };
}

describe('Task 8 acceptance contract', () => {
  it('provides a dedicated strict contract boundary for the runner and launcher', async () => {
    await expect(import('../src/parser-acceptance-contract')).resolves.toHaveProperty('parseCanonicalManifest');
  });

  it('accepts only the byte-exact canonical schema-v2 corpus identity', () => {
    expect(CANONICAL_CORPUS_MANIFEST_SHA256).toBe('34b46c5405c7d2114183cfb8e3b938a392ddf1e43941fed0818f7a3ab3b7fae6');
    expect(parseCanonicalManifest(canonicalManifest).cases.map(({ id }) => id)).toEqual(canonicalIds);

    const duplicate = JSON.parse(canonicalManifest.toString('utf8'));
    duplicate.cases[1] = duplicate.cases[0];
    expect(() => parseCanonicalManifest(Buffer.from(JSON.stringify(duplicate)))).toThrow(/canonical manifest hash/i);

    const wrongFilename = JSON.parse(canonicalManifest.toString('utf8'));
    wrongFilename.cases[0].filename = '../corrupt.pdf';
    expect(() => parseCanonicalManifest(Buffer.from(JSON.stringify(wrongFilename)))).toThrow(/canonical manifest hash/i);
  });

  it('accepts only a complete hard-gate draft with exact calls, statuses, locators and provenance', () => {
    expect(validateAcceptanceDraft(validDraft())).toMatchObject({
      summary: { failed: 0, falseReadyCount: 0, succeeded: 10, needsReview: 6 },
      gatewayCalls: { structuredFake: 10, externalProvider: 0 },
    });
  });

  it.each([
    ['all handler failures', (draft: ReturnType<typeof validDraft>) => {
      draft.cases = draft.cases.map((item) => ({ ...item, status: 'failed' as const, handlerStatus: 'failed', failureStatus: 'injected' }));
    }, /status|handler failure/i],
    ['wrong fixture content hash', (draft: ReturnType<typeof validDraft>) => { draft.cases[0]!.contentHash = 'f'.repeat(64); }, /content hash/i],
    ['status mismatch', (draft: ReturnType<typeof validDraft>) => { draft.cases[1]!.status = 'needs_review'; }, /status mismatch/i],
    ['locator miss', (draft: ReturnType<typeof validDraft>) => { draft.cases[1]!.locatorMatches = 4; }, /locator/i],
    ['false ready', (draft: ReturnType<typeof validDraft>) => { draft.cases[1]!.falseReady = true; }, /false-ready/i],
    ['missing stage', (draft: ReturnType<typeof validDraft>) => { draft.cases[1]!.stages = []; }, /stage provenance/i],
    ['missing Tesseract provenance', (draft: ReturnType<typeof validDraft>) => { draft.cases[10]!.stages[0]!.parser = 'v1-text-transition'; }, /Tesseract provenance/i],
    ['hidden structured call', (draft: ReturnType<typeof validDraft>) => { draft.gatewayCalls.structuredFake = 11; }, /structured fake/i],
    ['forbidden OCR call', (draft: ReturnType<typeof validDraft>) => { draft.gatewayCalls.forbidden.ocr = 1; }, /forbidden gateway/i],
    ['missing runtime identity', (draft: ReturnType<typeof validDraft>) => { delete (draft as Partial<typeof draft>).runtimeProcess; }, /runtime process identity/i],
  ])('rejects $0', (_name, mutate, expected) => {
    const draft = validDraft();
    mutate(draft);
    expect(() => validateAcceptanceDraft(draft)).toThrow(expected);
  });

  it('requires independent, bounded worker/parser cgroup and effective topology evidence', () => {
    const draft = validDraft();
    const resources = validResources(draft);
    expect(validateRuntimeEvidence(resources, draft)).toMatchObject({
      worker: { cpuUsageMicros: 12_345, peakRssBytes: 268_435_456 },
      parser: { cpuUsageMicros: 23_456, peakRssBytes: 134_217_728 },
      maxima: { cpuUsageMicros: 23_456, peakRssBytes: 268_435_456 },
    });
    expect(buildFinalAcceptanceReport(draft, resources)).toMatchObject({
      schemaVersion: 2, resources: { worker: { user: '1000:1000' }, parser: { effectiveEnvCount: 0 } },
    });
  });

  it('labels deterministic structured fakes separately and counts every forbidden gateway seam', async () => {
    const seam = createAcceptanceGatewaySeam({ schemaVersion: '0.1.0', fields: {} });
    await expect(seam.gateway.completeStructured()).resolves.toMatchObject({ schemaVersion: '0.1.0' });
    await expect(seam.gateway.ocr()).rejects.toThrow(/forbidden gateway seam/i);
    await expect((seam.gateway as Record<string, () => Promise<unknown>>).hiddenProvider()).rejects.toThrow(/forbidden gateway seam/i);
    expect(seam.snapshot()).toEqual({
      structuredFake: 1, externalProvider: 0,
      forbidden: { complete: 0, ocr: 1, stream: 0, unknown: 1 },
    });
  });

  it('accepts only exact sdf.extract success and needs-review handler result shapes', () => {
    const fields = ['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'];
    const completed = {
      core: Object.fromEntries(fields.map((field) => [field, ''])),
      evidence: Object.fromEntries(fields.map((field) => [field, { quote: '', locator: '' }])),
      needsMoreInformation: fields,
    };
    expect(classifyAcceptanceHandlerResult(completed)).toBe('completed');
    expect(classifyAcceptanceHandlerResult({ status: 'needs_review', format: 'pdf', reason: 'corrupt' }))
      .toBe('needs_review');
    expect(() => classifyAcceptanceHandlerResult({ status: 'failed' })).toThrow(/handler result/i);
    expect(() => classifyAcceptanceHandlerResult({ ...completed, evidence: {} })).toThrow(/handler result/i);
    expect(() => classifyAcceptanceHandlerResult('completed')).toThrow(/handler result/i);
  });

  it.each([
    ['missing parser resource', (resources: ReturnType<typeof validResources>) => { delete (resources as Partial<typeof resources>).parser; }, /parser resource/i],
    ['wrong fresh build identity', (resources: ReturnType<typeof validResources>) => { resources.build.sourceSha = 'f'.repeat(40); }, /build identity/i],
    ['invalid worker image', (resources: ReturnType<typeof validResources>) => { resources.worker.imageId = `sha256:${'f'.repeat(64)}`; }, /image identity/i],
    ['parser release bind', (resources: ReturnType<typeof validResources>) => { resources.parser.mounts.push(resources.worker.mounts[1]!); }, /parser mount/i],
    ['worker mounts root evidence directory writable', (resources: ReturnType<typeof validResources>) => {
      resources.worker.mounts[3]!.source = resources.worker.mounts[3]!.source.replace('/worker-output', '');
    }, /worker output mount/i],
    ['hidden environment', (resources: ReturnType<typeof validResources>) => { resources.parser.effectiveEnvCount = 1; }, /effective environment/i],
    ['root user', (resources: ReturnType<typeof validResources>) => { resources.worker.user = '0:0'; }, /numeric non-root/i],
    ['missing RSS', (resources: ReturnType<typeof validResources>) => { resources.parser.peakRssBytes = 0; }, /cgroup resource/i],
    ['failed parser lifecycle', (resources: ReturnType<typeof validResources>) => { resources.parser.running = false; resources.parser.exitCode = 137; }, /lifecycle/i],
    ['unbounded swap', (resources: ReturnType<typeof validResources>) => { resources.worker.memorySwapBytes = -1; }, /runtime limit/i],
  ])('rejects $0 evidence', (_name, mutate, expected) => {
    const draft = validDraft();
    const resources = validResources(draft);
    mutate(resources);
    expect(() => validateRuntimeEvidence(resources, draft)).toThrow(expected);
  });

  it('canonicalizes exact owned release/corpus roots and rejects traversal, symlinks and wrong ownership', async () => {
    const sha = 'a'.repeat(40);
    const sandbox = await mkdtemp(join(tmpdir(), 'task8-acceptance-paths-'));
    const releaseBase = join(sandbox, 'openscience-releases');
    const acceptanceBase = join(sandbox, 'acceptance');
    const releaseRoot = join(releaseBase, sha);
    const acceptanceRoot = join(acceptanceBase, sha);
    await mkdir(releaseRoot, { recursive: true, mode: 0o700 });
    await writeFile(join(releaseRoot, '.env.example'), 'template-only');
    await mkdir(join(acceptanceRoot, 'corpus'), { recursive: true, mode: 0o700 });
    const expectedUid = (await stat(releaseRoot)).uid;
    const paths = await prepareAcceptancePaths({
      sourceSha: sha, runId: `${sha.slice(0, 12)}-1234`, releaseBase, acceptanceBase, expectedUid,
      enforceMode: false,
    });
    expect(paths).toMatchObject({
      releaseRoot, acceptanceRoot, corpusRoot: join(acceptanceRoot, 'corpus'),
      workerOutputRoot: join(paths.runRoot, 'worker-output'),
      draftReportPath: join(paths.runRoot, 'worker-output', 'report.draft.json'),
    });
    expect((await lstat(paths.runRoot)).isSymbolicLink()).toBe(false);
    expect((await lstat(paths.workerOutputRoot)).isSymbolicLink()).toBe(false);

    await writeFile(join(acceptanceRoot, 'report.json'), 'already-published');
    const rejectedRunRoot = join(acceptanceRoot, `.run-${sha.slice(0, 12)}-4321`);
    await expect(prepareAcceptancePaths({
      sourceSha: sha, runId: `${sha.slice(0, 12)}-4321`, releaseBase, acceptanceBase, expectedUid,
      enforceMode: false,
    })).rejects.toThrow(/already exists/i);
    await expect(access(rejectedRunRoot)).rejects.toThrow();

    await expect(prepareAcceptancePaths({
      sourceSha: sha, runId: '../escape', releaseBase, acceptanceBase, expectedUid,
      enforceMode: false,
    })).rejects.toThrow(/run id/i);
    await expect(prepareAcceptancePaths({
      sourceSha: sha, runId: `${sha.slice(0, 12)}-5678`, releaseBase, acceptanceBase, expectedUid: expectedUid + 1,
      enforceMode: false,
    })).rejects.toThrow(/owner/i);

    const symlinkSandbox = await mkdtemp(join(tmpdir(), 'task8-acceptance-symlink-'));
    const symlinkReleaseBase = join(symlinkSandbox, 'releases');
    const realRelease = join(symlinkSandbox, 'real-release');
    await mkdir(realRelease, { recursive: true });
    await mkdir(symlinkReleaseBase, { recursive: true });
    await symlink(realRelease, join(symlinkReleaseBase, sha), 'junction');
    await expect(prepareAcceptancePaths({
      sourceSha: sha, runId: `${sha.slice(0, 12)}-9999`, releaseBase: symlinkReleaseBase,
      acceptanceBase, expectedUid, enforceMode: false,
    })).rejects.toThrow(/symlink|canonical/i);
  });

  it('derives no cleanup/finalization path from unvalidated CLI identity', () => {
    expect(() => deriveFixedAcceptancePaths('../escape', 'aaaaaaaaaaaa-1234')).toThrow(/source SHA/i);
    expect(() => deriveFixedAcceptancePaths('a'.repeat(40), '../escape')).toThrow(/run id/i);
  });

  it('removes the exact adjacent temp report when atomic publication fails', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'task8-acceptance-report-'));
    const finalPath = join(outputRoot, 'report.json');
    await writeFile(finalPath, 'preserve-existing-report');
    await expect(writeAtomicAcceptanceReport(finalPath, buildFinalAcceptanceReport(validDraft(), validResources())))
      .rejects.toThrow();
    expect(await readFile(finalPath, 'utf8')).toBe('preserve-existing-report');
    expect((await readdir(outputRoot)).filter((name) => name.startsWith('report.json.tmp-'))).toEqual([]);
  });

  it('rejects a worker-controlled symlink instead of following it as root during finalization', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'task8-acceptance-draft-'));
    const outside = join(outputRoot, 'outside.json');
    const workerDraft = join(outputRoot, 'report.draft.json');
    await writeFile(outside, JSON.stringify(validDraft()));
    await symlink(outside, workerDraft);
    await expect(readBoundedAcceptanceJson(workerDraft)).rejects.toThrow(/regular|symlink/i);
  });

  it('cleans an injected failed run root without touching the final report or an arbitrary sibling', async () => {
    const acceptanceRoot = await mkdtemp(join(tmpdir(), 'task8-acceptance-cleanup-'));
    const runRoot = join(acceptanceRoot, '.run-aaaaaaaaaaaa-1234');
    const sibling = join(acceptanceRoot, 'operator-evidence');
    const finalReport = join(acceptanceRoot, 'report.json');
    const exactTemporaryReport = join(acceptanceRoot, 'report.json.tmp-aaaaaaaaaaaa-1234');
    const unrelatedTemporaryReport = join(acceptanceRoot, 'report.json.tmp-bbbbbbbbbbbb-5678');
    await mkdir(runRoot);
    await mkdir(sibling);
    await writeFile(join(runRoot, 'report.draft.json.tmp-injected'), 'partial');
    await writeFile(finalReport, 'published');
    await writeFile(exactTemporaryReport, 'partial-publication');
    await writeFile(unrelatedTemporaryReport, 'other-run');

    await cleanupAcceptanceRun(runRoot, acceptanceRoot);
    await expect(access(runRoot)).rejects.toThrow();
    await expect(access(exactTemporaryReport)).rejects.toThrow();
    await expect(access(unrelatedTemporaryReport)).resolves.toBeUndefined();
    expect(await readFile(finalReport, 'utf8')).toBe('published');
    await expect(access(sibling)).resolves.toBeUndefined();
    await expect(cleanupAcceptanceRun(sibling, acceptanceRoot)).rejects.toThrow(/exact run root/i);
    await expect(access(sibling)).resolves.toBeUndefined();
  });
});
