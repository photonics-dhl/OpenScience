import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createReleaseInputManifest,
  createReleaseRuntimeSnapshot,
} from '../../scripts/release-input-manifest.mjs';
import { parseCli, verifyParserAcceptance } from './verify-document-parser-acceptance.mjs';

const sha = 'a'.repeat(40);
const workerImageId = `sha256:${'b'.repeat(64)}`;
const parserImageId = `sha256:${'c'.repeat(64)}`;
const requiredUid = process.getuid?.() ?? 0;

async function fixture() {
  const sandbox = await mkdtemp(join(tmpdir(), 'xgs-parser-deploy-contract-'));
  const releaseRoot = join(sandbox, sha);
  const acceptanceRoot = join(sandbox, 'acceptance', sha);
  const reportPath = join(acceptanceRoot, 'report.json');
  await mkdir(releaseRoot, { recursive: true });
  await mkdir(acceptanceRoot, { recursive: true });
  await mkdir(join(releaseRoot, 'apps', 'agent-worker'), { recursive: true });
  await writeFile(join(releaseRoot, '.release-source'), `${sha}\n`);
  await writeFile(join(releaseRoot, 'package.json'), '{"name":"fixture"}\n');
  await writeFile(join(releaseRoot, 'apps', 'agent-worker', 'package.json'), '{"name":"worker-fixture"}\n');
  await createReleaseInputManifest({ root: releaseRoot, sourceSha: sha });
  await mkdir(join(releaseRoot, 'apps', 'agent-worker', 'dist'), { recursive: true });
  const contractPath = join(releaseRoot, 'apps', 'agent-worker', 'dist', 'parser-acceptance-contract.js');
  await writeFile(contractPath, `
exports.validateAcceptanceDraft = (value) => {
  if (value.sourceSha !== '${sha}' || value.images.worker !== '${workerImageId}'
    || value.images.parser !== '${parserImageId}') throw new Error('draft identity rejected');
  return value;
};
exports.validateRuntimeEvidence = (value, draft) => {
  if (value.build.sourceSha !== draft.sourceSha || value.worker.imageId !== draft.images.worker
    || value.parser.imageId !== draft.images.parser) throw new Error('runtime evidence rejected');
  return value;
};
exports.verifyAcceptanceRuntimeGraphManifest = async (_root, value) => {
  if (value.proof !== 'fixed-runtime-graph') throw new Error('runtime graph rejected');
};
`);
  const contractSha256 = createHash('sha256').update(await readFile(contractPath)).digest('hex');
  const dependencyRoot = join(releaseRoot, 'node_modules', 'runtime-package');
  await mkdir(dependencyRoot, { recursive: true });
  await writeFile(join(dependencyRoot, 'metadata.json'), '{"accepted":true}\n');
  const runtimeInputs = await createReleaseRuntimeSnapshot({ root: releaseRoot, sourceSha: sha });
  const report = {
    schemaVersion: 2,
    sourceSha: sha,
    manifestSha256: 'fixture',
    images: { worker: workerImageId, parser: parserImageId },
    runtimeProcess: { uid: 1000, gid: 1000, effectiveEnvCount: 0 },
    gatewayCalls: { structuredFake: 10, externalProvider: 0, forbidden: {} },
    summary: {},
    cases: [],
    resources: {
      build: {
        sourceSha: sha, contractSha256, runtimeGraph: { proof: 'fixed-runtime-graph' }, runtimeInputs,
      },
      worker: { imageId: workerImageId },
      parser: { imageId: parserImageId },
    },
  };
  await writeFile(reportPath, `${JSON.stringify(report)}\n`, { mode: 0o600 });
  return { sandbox, releaseRoot, reportPath, report };
}

test('formal deploy verifier binds accepted source, runtime graph and exact final image IDs', async () => {
  const state = await fixture();
  try {
    await verifyParserAcceptance({
      releaseRoot: state.releaseRoot,
      reportPath: state.reportPath,
      sourceSha: sha,
      workerImageId,
      parserImageId,
      requiredUid,
    });
  } finally {
    await rm(state.sandbox, { recursive: true, force: true });
  }
});

test('formal deploy verifier rejects missing, tampered, wrong-source and image-mismatched reports', async (t) => {
  const cases = [
    ['missing report', async (state) => rm(state.reportPath)],
    ['tampered JSON', async (state) => writeFile(state.reportPath, '{broken')],
    ['wrong source', async (state) => {
      await writeFile(state.reportPath, `${JSON.stringify({ ...state.report, sourceSha: 'f'.repeat(40) })}\n`);
    }],
    ['worker ID mismatch', async () => {}, { workerImageId: `sha256:${'d'.repeat(64)}` }],
    ['parser ID mismatch', async () => {}, { parserImageId: `sha256:${'e'.repeat(64)}` }],
    ['contract build identity mismatch', async (state) => {
      await writeFile(join(state.releaseRoot, 'apps', 'agent-worker', 'dist', 'parser-acceptance-contract.js'),
        'throw new Error("tampered contract");\n');
    }],
    ['missing generated runtime snapshot', async (state) => {
      const report = structuredClone(state.report);
      delete report.resources.build.runtimeInputs;
      await writeFile(state.reportPath, `${JSON.stringify(report)}\n`);
    }],
    ['tampered generated runtime snapshot', async (state) => {
      const report = structuredClone(state.report);
      report.resources.build.runtimeInputs.sha256 = 'f'.repeat(64);
      await writeFile(state.reportPath, `${JSON.stringify(report)}\n`);
    }],
  ];
  for (const [name, mutate, overrides = {}] of cases) {
    await t.test(name, async () => {
      const state = await fixture();
      try {
        await mutate(state);
        await assert.rejects(verifyParserAcceptance({
          releaseRoot: state.releaseRoot,
          reportPath: state.reportPath,
          sourceSha: sha,
          workerImageId,
          parserImageId,
          requiredUid,
          ...overrides,
        }), /acceptance|report|source|image|JSON|ENOENT|identity/i);
      } finally {
        await rm(state.sandbox, { recursive: true, force: true });
      }
    });
  }
});

test('formal deploy verifier rejects release-source tampering before trusting the report', async () => {
  const state = await fixture();
  try {
    await writeFile(join(state.releaseRoot, 'package.json'), '{"name":"tampered"}\n');
    await assert.rejects(verifyParserAcceptance({
      releaseRoot: state.releaseRoot,
      reportPath: state.reportPath,
      sourceSha: sha,
      workerImageId,
      parserImageId,
      requiredUid,
    }), /manifest|source|hash/i);
    assert.equal(existsSync(state.reportPath), true);
    assert.match(await readFile(state.reportPath, 'utf8'), /fixed-runtime-graph/);
  } finally {
    await rm(state.sandbox, { recursive: true, force: true });
  }
});

test('formal deploy verifier rejects accepted generated runtime dependency tampering', async () => {
  const state = await fixture();
  try {
    await writeFile(
      join(state.releaseRoot, 'node_modules', 'runtime-package', 'metadata.json'),
      '{"accepted":false}\n',
    );
    await assert.rejects(verifyParserAcceptance({
      releaseRoot: state.releaseRoot,
      reportPath: state.reportPath,
      sourceSha: sha,
      workerImageId,
      parserImageId,
      requiredUid,
    }), /runtime|generated|identity|digest/i);
  } finally {
    await rm(state.sandbox, { recursive: true, force: true });
  }
});

test('formal deploy verifier requires the explicitly trusted report owner UID', async () => {
  const state = await fixture();
  try {
    await assert.rejects(verifyParserAcceptance({
      releaseRoot: state.releaseRoot,
      reportPath: state.reportPath,
      sourceSha: sha,
      workerImageId,
      parserImageId,
      requiredUid: requiredUid + 1,
    }), /owner|uid|unsafe/i);
    await assert.rejects(verifyParserAcceptance({
      releaseRoot: state.releaseRoot,
      reportPath: state.reportPath,
      sourceSha: sha,
      workerImageId,
      parserImageId,
    }), /owner|uid|required/i);
  } finally {
    await rm(state.sandbox, { recursive: true, force: true });
  }
});

test('production CLI pins the trusted acceptance report owner to root', () => {
  const parsed = parseCli([
    '--release-root', `/opt/openscience-releases/${sha}`,
    '--report', `/opt/openscience-acceptance/document-parser/${sha}/report.json`,
    '--source-sha', sha,
    '--worker-image-id', workerImageId,
    '--parser-image-id', parserImageId,
  ]);
  assert.equal(parsed.requiredUid, 0);
});
