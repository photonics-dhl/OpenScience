import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import process from 'node:process';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
require.extensions['.ts'] = (loadedModule, filename) => {
  const source = readFileSync(filename, 'utf8');
  loadedModule._compile(ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText, filename);
};

const { RESEARCH_INTELLIGENCE_CORPUS } = require('./support/research-intelligence-corpus.ts');
const { reproduceAcceptanceLocator } = require('../dist/parser-acceptance-contract.js');
const { createSidecarParserStageProcessor } = require('../dist/parser-job-isolation.js');
const { runDocumentParser } = require('../dist/parsers/base-parser.js');
const { createTextExtractor } = require('../dist/parsers/text-extractor.js');

const NATIVE_PDF_TEXT_ITEM_METADATA = {
  name: 'pdf-parse-pdfjs-text-items',
  version: '2.4.5+pdfjs-dist.5.4.296',
};

test('compiled worker-shared ingestion contract does not load the native PDF provider', () => {
  const ingestionModulePath = require.resolve('../dist/ingestion-parser.js');
  const probe = spawnSync(process.execPath, ['-e', `
    const Module = require('node:module');
    const originalLoad = Module._load;
    Module._load = function(request, ...args) {
      if (request === 'pdf-parse') throw new Error('worker loaded native PDF provider');
      return originalLoad.call(this, request, ...args);
    };
    require(${JSON.stringify(ingestionModulePath)});
  `], { encoding: 'utf8' });
  assert.equal(probe.status, 0, probe.stderr);
});

test('compiled parser child and service composition preserve canonical native-PDF geometry', async () => {
  const { createDefaultIngestionAdapters } = require('../dist/ingestion-parser.js');
  const sidecar = createSidecarParserStageProcessor(createDefaultIngestionAdapters());
  const extractor = createTextExtractor({ pdf: sidecar });
  const caseIds = new Set([
    'dual-column-pdf-en',
    'table-pdf-en',
    'formula-pdf-en',
    'references-pdf-en',
  ]);
  for (const fixture of RESEARCH_INTELLIGENCE_CORPUS.filter(({ id }) => caseIds.has(id))) {
    const artifactId = `compiled-${fixture.id}`;
    const contentHash = createHash('sha256').update(fixture.content).digest('hex');
    const input = {
      artifactId,
      contentHash,
      content: fixture.content,
      mediaType: 'application/pdf',
    };
    const result = await runDocumentParser(input, extractor);
    assert.equal(result.status, 'succeeded');
    const identity = { artifactId, contentHash };
    for (const locator of fixture.expectedLocators) {
      assert.equal(reproduceAcceptanceLocator(result.sourceMap, locator, identity), true, JSON.stringify(locator));
    }
    assert.deepEqual(result.sourceMap.pages.map(({ page }) => page), [1]);
    assert.equal(result.sourceMap.pages[0].width, 612);
    assert.equal(result.sourceMap.pages[0].height, 792);
    for (const block of result.sourceMap.pages[0].blocks) {
      assert.deepEqual(block.parser, NATIVE_PDF_TEXT_ITEM_METADATA);
      assert.deepEqual(block.transformations, [{
        stage: 'extract_text', processor: NATIVE_PDF_TEXT_ITEM_METADATA,
      }]);
      assert.ok(block.boundingBox.x >= 0 && block.boundingBox.y >= 0);
      assert.ok(block.boundingBox.width > 0 && block.boundingBox.height > 0);
      assert.ok(block.boundingBox.x + block.boundingBox.width <= result.sourceMap.pages[0].width);
      assert.ok(block.boundingBox.y + block.boundingBox.height <= result.sourceMap.pages[0].height);
    }
  }
});
