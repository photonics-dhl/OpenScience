import assert from 'node:assert/strict';
import { test } from 'node:test';

import { evaluateOcrLocators, evaluateTextLocators } from './runner.mjs';

test('current parser keeps unsupported geometry locators in review', () => {
  const outcome = evaluateTextLocators(
    [{ num: 1, text: 'Left claim Right evidence' }],
    [
      { kind: 'page-text-order', page: 1, quotes: ['Left claim', 'Right evidence'] },
      { kind: 'page-region-text', page: 1, bbox: [0, 0, 306, 792], quote: 'Left claim' },
    ],
  );

  assert.deepEqual(outcome, { status: 'needs_review', locatorMatches: 1, errorCode: 'locator_miss' });
});

test('Tesseract scan locators reproduce text and geometry without returning content', () => {
  const outcome = evaluateOcrLocators(
    [{ page: 1, width: 612, height: 792, items: [{ text: 'PULSE 42 FS', bbox: [72, 600, 432, 645] }] }],
    [
      { kind: 'page-text', page: 1, quote: 'PULSE 42 FS' },
      { kind: 'page-region', page: 1, bbox: [72, 600, 432, 645] },
    ],
  );

  assert.deepEqual(outcome, { status: 'succeeded', locatorMatches: 2 });
  assert.equal(JSON.stringify(outcome).includes('PULSE 42 FS'), false);
});
