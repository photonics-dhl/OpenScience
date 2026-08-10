import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import { buildSeedPlan, renderProvenanceArtifact } from './seed-demo-research.mjs';

test('seed plan assigns stable public identifiers and only complete entries receive artifacts', () => {
  const plan = buildSeedPlan();
  assert.equal(plan.length, 18);
  assert.deepEqual(plan.slice(0, 2).map((item) => item.publicId), ['OSR-DEMO-000001', 'OSR-DEMO-000002']);
  assert.equal(plan.filter((item) => item.provenanceArtifact).length, 6);
});

test('provenance artifact declares demonstration status, source, license and verification evidence', () => {
  const [record] = buildSeedPlan();
  const markdown = renderProvenanceArtifact(record);
  assert.match(markdown, /OpenScience demonstration metadata/);
  assert.match(markdown, /github\.com\/wright-group\/WrightTools/);
  assert.match(markdown, /MIT/);
  assert.match(markdown, /b326efb13785867b0c4d2d06294c74a030590827/);
});

test('CLI is dry-run by default and does not require database or storage', () => {
  const result = spawnSync(process.execPath, ['scripts/seed-demo-research.mjs'], {
    cwd: process.cwd(), encoding: 'utf8', env: {},
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /DRY_RUN 18 research records/);
  assert.match(result.stdout, /Run with --confirm to write/);
});
