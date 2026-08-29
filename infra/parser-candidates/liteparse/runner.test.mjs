import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { evaluateLiteParseLocators } from './runner.mjs';

test('publishes only the bounded process outcome through attached stdout', () => {
  const source = readFileSync(new URL('./runner.mjs', import.meta.url), 'utf8');

  assert.match(source, /process\.stdout\.write/);
  assert.doesNotMatch(source, /\/out\/result\.json/);
});

test('matches page text from page text and spatial items without returning content', () => {
  const evaluation = evaluateLiteParseLocators({
    pages: [
      { pageNum: 1, text: 'Left claim: reproducible pulse.' },
      { pageNum: 2, textItems: [{ text: 'Right evidence:' }, { text: 'calibrated trace.' }] },
    ],
  }, [
    { kind: 'page-text', page: 1, quote: 'reproducible pulse' },
    { kind: 'page-text', page: 2, quote: 'Right evidence: calibrated trace.' },
  ]);

  assert.deepEqual(evaluation, { status: 'succeeded', locatorMatches: 2 });
  assert.equal(JSON.stringify(evaluation).includes('reproducible pulse'), false);
});

test('marks unsupported or missed locators for review instead of reporting false ready', () => {
  const evaluation = evaluateLiteParseLocators({
    pages: [{ pageNum: 1, text: 'PULSE 42 FS' }],
  }, [
    { kind: 'page-text', page: 1, quote: 'PULSE 42 FS' },
    { kind: 'page-region', page: 1, bbox: [72, 600, 432, 645] },
  ]);

  assert.deepEqual(evaluation, { status: 'needs_review', locatorMatches: 1, errorCode: 'locator_miss' });
});

test('verifies reading order and text-item regions for layout cases', () => {
  const evaluation = evaluateLiteParseLocators({
    pages: [{
      pageNum: 1,
      width: 612,
      height: 792,
      text: 'Left claim Right evidence',
      textItems: [
        { text: 'Left claim', x: 54, y: 60, width: 80, height: 12 },
        { text: 'Right evidence', x: 320, y: 60, width: 90, height: 12 },
      ],
    }],
  }, [
    { kind: 'page-text-order', page: 1, quotes: ['Left claim', 'Right evidence'] },
    { kind: 'page-region-text', page: 1, bbox: [0, 0, 306, 792], quote: 'Left claim' },
    { kind: 'page-region-text', page: 1, bbox: [306, 0, 612, 792], quote: 'Right evidence' },
  ]);

  assert.deepEqual(evaluation, { status: 'succeeded', locatorMatches: 3 });
  assert.deepEqual(evaluateLiteParseLocators({
    pages: [{ pageNum: 1, text: 'Right evidence Left claim', textItems: [] }],
  }, [{ kind: 'page-text-order', page: 1, quotes: ['Left claim', 'Right evidence'] }]), {
    status: 'needs_review', locatorMatches: 0, errorCode: 'locator_miss',
  });
});
