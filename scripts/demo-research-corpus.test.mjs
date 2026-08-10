import test from 'node:test';
import assert from 'node:assert/strict';

import { DEMO_RESEARCH_CORPUS } from './demo-research-corpus.mjs';

test('launch corpus contains six complete demonstrations and twelve index records', () => {
  assert.equal(DEMO_RESEARCH_CORPUS.length, 18);
  assert.equal(DEMO_RESEARCH_CORPUS.filter((entry) => entry.tier === 'complete').length, 6);
  assert.equal(DEMO_RESEARCH_CORPUS.filter((entry) => entry.tier === 'index').length, 12);
});

test('every record is uniquely identified and carries verifiable source and license evidence', () => {
  assert.equal(new Set(DEMO_RESEARCH_CORPUS.map((entry) => entry.slug)).size, 18);
  for (const entry of DEMO_RESEARCH_CORPUS) {
    assert.match(entry.sourceUrl, /^https:\/\/github\.com\/[^/]+\/[^/]+$/);
    assert.match(entry.licenseUrl, /^https:\/\/github\.com\/[^/]+\/[^/]+\/blob\//);
    assert.match(entry.licenseBlobSha, /^[a-f0-9]{40}$/);
    assert.ok(entry.licenseId.length > 2);
    assert.ok(entry.title.length > 4);
    assert.ok(entry.summary.length > 20);
  }
});

test('complete demonstrations contain all six non-empty SDF fields', () => {
  const fields = ['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'];
  for (const entry of DEMO_RESEARCH_CORPUS.filter((item) => item.tier === 'complete')) {
    for (const field of fields) assert.ok(entry.sdf[field].trim().length > 20, `${entry.slug}.${field}`);
  }
});
