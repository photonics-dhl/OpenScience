import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as currentRunner from './runner.mjs';

const { evaluateOcrLocators, evaluateTextLocators } = currentRunner;

test('execution source rejects a production release checkout', async () => {
  let validator;
  try {
    ({ assertDedicatedEvaluationSource: validator } = await import('./execution-path.mjs'));
  } catch {
    assert.fail('execution path validator is missing');
  }

  assert.throws(
    () => validator(
      '/opt/openscience-releases/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '/opt/openscience-evals/document-parser/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/source',
    ),
    /dedicated evaluation checkout/,
  );
  assert.equal(
    validator(
      '/opt/openscience-evals/document-parser/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/source',
      '/opt/openscience-evals/document-parser/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/source',
    ),
    '/opt/openscience-evals/document-parser/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/source',
  );
});

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

test('Tesseract adapter flips non-symmetric image Y into PDF coordinates', () => {
  assert.equal(typeof currentRunner.parseTesseractTsv, 'function');
  const tsv = [
    'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
    '5\t1\t1\t1\t1\t1\t72\t147\t360\t45\t95\tPULSE 42 FS',
  ].join('\n');

  const page = currentRunner.parseTesseractTsv(tsv, {
    pageNumber: 1,
    width: 612,
    height: 792,
  });

  assert.deepEqual(page.items, [{ text: 'PULSE 42 FS', bbox: [72, 600, 432, 645] }]);
});

test('candidate RSS takes the container peak so the Tesseract child is included', () => {
  assert.equal(typeof currentRunner.candidatePeakRssBytes, 'function');
  assert.equal(currentRunner.candidatePeakRssBytes(64_000_000, '123000000\n', true), 123_000_000);
  assert.throws(
    () => currentRunner.candidatePeakRssBytes(64_000_000, undefined, true),
    /container peak RSS/,
  );
});
