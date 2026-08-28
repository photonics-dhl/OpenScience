import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { fileURLToPath, URL } from 'node:url';

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
const { parseStructuredPdfResult } = require('../dist/parsers/native-pdf-text-items.js');
const { createTextExtractor } = require('../dist/parsers/text-extractor.js');

const NATIVE_PDF_TEXT_ITEM_METADATA = {
  name: 'pdf-parse-pdfjs-text-items',
  version: '2.4.5+pdfjs-dist.5.4.296',
};

const agentWorkerRoot = fileURLToPath(new URL('..', import.meta.url));
const compiledRoot = resolve(agentWorkerRoot, 'dist');

function parserImageDistAllowlist() {
  const dockerfile = readFileSync(new URL('../Dockerfile.parser', import.meta.url), 'utf8');
  const copied = new Set();
  const copyPattern = /^COPY(?:\s+--\S+)*\s+apps\/agent-worker\/dist\/(\S+)\s+\.\/dist\/(\S+)\s*$/gmu;
  for (const match of dockerfile.matchAll(copyPattern)) {
    assert.equal(match[1], match[2], 'parser image dist COPY must preserve the compiled relative path');
    copied.add(resolve(compiledRoot, match[2]));
  }
  return copied;
}

function compiledParserRuntimeClosure(entry) {
  const pending = [entry];
  const runtimeFiles = new Set();
  let spawnedModuleCount = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (runtimeFiles.has(current)) continue;
    assert.ok(existsSync(current), `compiled parser runtime file is missing: ${relative(agentWorkerRoot, current)}`);
    runtimeFiles.add(current);
    const source = readFileSync(current, 'utf8');
    for (const match of source.matchAll(/require\((['"])(\.[^'"]+)\1\)/gu)) {
      const dependency = resolve(dirname(current), extname(match[2]) ? match[2] : `${match[2]}.js`);
      pending.push(dependency);
    }
    for (const match of source.matchAll(/join\)\(__dirname,\s*['"]([^'"]+)['"],\s*`([^$`]+)\$\{[^`]*extname\)\(__filename\)\}`\)/gu)) {
      spawnedModuleCount += 1;
      pending.push(resolve(dirname(current), match[1], `${match[2]}${extname(current)}`));
    }
  }
  assert.ok(spawnedModuleCount > 0, 'compiled parser runtime closure must include its spawned module child');
  return runtimeFiles;
}

function buildPdf(objects) {
  const chunks = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const offsets = [0];
  let length = chunks[0].length;
  objects.forEach((object, index) => {
    offsets.push(length);
    const chunk = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`, 'ascii'),
      object,
      Buffer.from('\nendobj\n', 'ascii'),
    ]);
    chunks.push(chunk);
    length += chunk.length;
  });
  const xrefOffset = length;
  const xrefRows = offsets.slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  chunks.push(Buffer.from(
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${xrefRows}`
      + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`
      + `startxref\n${xrefOffset}\n%%EOF\n`,
    'ascii',
  ));
  return Buffer.concat(chunks);
}

function pdfStream(content) {
  return Buffer.concat([
    Buffer.from(`<< /Length ${content.length} >>\nstream\n`, 'ascii'),
    content,
    Buffer.from('\nendstream', 'ascii'),
  ]);
}

function positionedCourierPdf({ rotation = 0, textCommands }) {
  const rotationEntry = rotation === 0 ? '' : ` /Rotate ${rotation}`;
  return buildPdf([
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'ascii'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 'ascii'),
    Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300]${rotationEntry} /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`, 'ascii'),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>', 'ascii'),
    pdfStream(Buffer.from(textCommands.join('\n'), 'ascii')),
  ]);
}

function assertBoxApproximately(actual, expected) {
  for (const coordinate of ['x', 'y', 'width', 'height']) {
    assert.ok(
      Math.abs(actual[coordinate] - expected[coordinate]) < 1e-8,
      `${coordinate}: expected ${expected[coordinate]}, received ${actual[coordinate]}`,
    );
  }
}

test('parser image allowlist contains the compiled entrypoint runtime closure and spawned children', () => {
  const allowlist = parserImageDistAllowlist();
  const runtimeFiles = compiledParserRuntimeClosure(resolve(compiledRoot, 'parser-service.js'));
  const missing = [...runtimeFiles]
    .filter((runtimeFile) => !allowlist.has(runtimeFile))
    .map((runtimeFile) => relative(agentWorkerRoot, runtimeFile).split(sep).join('/'))
    .sort();
  assert.deepEqual(missing, []);
});

test('native PDF geometry keeps asymmetric top and bottom text in PDF.js viewport coordinates', async () => {
  const parsed = await parseStructuredPdfResult(positionedCourierPdf({
    textCommands: [
      'BT /F1 10 Tf 1 0 0 1 20 250 Tm (UP) Tj ET',
      'BT /F1 10 Tf 1 0 0 1 40 40 Tm (LOW) Tj ET',
    ],
  }));

  assert.deepEqual(parsed.pages.map(({ width, height }) => ({ width, height })), [{ width: 200, height: 300 }]);
  const boxes = Object.fromEntries(parsed.pages[0].blocks.map(({ text, boundingBox }) => [text, boundingBox]));
  assertBoxApproximately(boxes.UP, { x: 20, y: 40, width: 12, height: 10 });
  assertBoxApproximately(boxes.LOW, { x: 40, y: 250, width: 18, height: 10 });
});

test('native PDF geometry uses transformed corners directly on a 90-degree rotated page', async () => {
  const parsed = await parseStructuredPdfResult(positionedCourierPdf({
    rotation: 90,
    textCommands: ['BT /F1 10 Tf 1 0 0 1 20 250 Tm (TURN) Tj ET'],
  }));

  assert.deepEqual(parsed.pages.map(({ width, height }) => ({ width, height })), [{ width: 300, height: 200 }]);
  assertBoxApproximately(parsed.pages[0].blocks[0].boundingBox, { x: 250, y: 20, width: 10, height: 24 });
});

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
