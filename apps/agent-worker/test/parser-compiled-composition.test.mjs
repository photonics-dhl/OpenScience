import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { tmpdir } from 'node:os';
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
const workspaceRoot = resolve(agentWorkerRoot, '../..');
const parserImageDeferredModuleEdges = new Set([
  'ingestion-parser.js\0dynamic import\0./parsers/base-parser.js',
]);

function parserImageCopies() {
  const dockerfile = readFileSync(new URL('../Dockerfile.parser', import.meta.url), 'utf8');
  const copies = new Map();
  const copyPattern = /^COPY(?:\s+--\S+)*\s+(\S+)\s+(\S+)\s*$/gmu;
  for (const match of dockerfile.matchAll(copyPattern)) {
    copies.set(match[2].replace(/^\.\//u, ''), match[1]);
  }
  return copies;
}

function parserImageDomainCopies(dockerfile) {
  const copies = [];
  const logicalDockerfile = dockerfile.replace(/\\\r?\n[ \t]*/gu, ' ');
  for (const rawLine of logicalDockerfile.split(/\r?\n/u)) {
    const line = rawLine.trimStart();
    if (!/^COPY\b/iu.test(line)) continue;
    let instruction = line.replace(/^COPY\b/iu, '').trimStart();
    while (/^--\S+\s+/u.test(instruction)) instruction = instruction.replace(/^--\S+\s+/u, '');
    const jsonSyntax = instruction.startsWith('[');
    let sources;
    let target;
    if (jsonSyntax) {
      let entries;
      try {
        entries = JSON.parse(instruction);
      } catch {
        assert.fail('Docker COPY must use static one-source exact COPY syntax');
      }
      assert.ok(Array.isArray(entries) && entries.length >= 2 && entries.every((entry) => typeof entry === 'string'),
        'Docker COPY must use static one-source exact COPY syntax');
      sources = entries.slice(0, -1);
      target = entries.at(-1);
    } else {
      const entries = instruction.split(/\s+/u);
      assert.ok(entries.length >= 2, 'Docker COPY must use static one-source exact COPY syntax');
      sources = entries.slice(0, -1);
      target = entries.at(-1);
    }
    for (const rawSource of sources) {
      assert.doesNotMatch(rawSource, /[$*?[\]{}]/u, 'Docker COPY must use static one-source exact COPY syntax');
      const sourceSegments = rawSource.split('/');
      assert.ok(
        !rawSource.includes('\\')
          && sourceSegments.every((segment) => segment !== '' && segment !== '.' && segment !== '..'),
        'Docker COPY source path aliases are forbidden',
      );
    }
    const domainRoot = 'packages/domain';
    for (const rawSource of sources) {
      const source = rawSource.replace(/^\.?\/+|\/+$/gu, '');
      const includesDomain = source === '' || source === '.' || source === domainRoot
        || domainRoot.startsWith(`${source}/`) || source.startsWith(`${domainRoot}/`);
      if (!includesDomain) continue;
      assert.ok(!jsonSyntax && sources.length === 1, 'packages/domain must use one-source exact COPY syntax');
      assert.notEqual(source, '', 'broad source includes packages/domain');
      assert.notEqual(source, '.', 'broad source includes packages/domain');
      assert.notEqual(source, 'packages', 'broad source includes packages/domain');
      assert.notEqual(source, domainRoot, 'broad source includes packages/domain');
      copies.push({ source, target: target.replace(/^\.\//u, '') });
    }
  }
  return copies;
}

function parserImageDistAllowlist() {
  const copies = parserImageCopies();
  const copied = new Set();
  for (const [target, source] of copies) {
    if (!source.startsWith('apps/agent-worker/dist/')) continue;
    const sourceRelative = source.slice('apps/agent-worker/dist/'.length);
    const targetRelative = target.startsWith('dist/') ? target.slice('dist/'.length) : undefined;
    assert.equal(sourceRelative, targetRelative, 'parser image dist COPY must preserve the compiled relative path');
    copied.add(resolve(compiledRoot, sourceRelative));
  }
  return copied;
}

function unwrapExpression(expression) {
  if (ts.isParenthesizedExpression(expression)) return unwrapExpression(expression.expression);
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.CommaToken) {
    return unwrapExpression(expression.right);
  }
  return expression;
}

function isCreateRequireReference(expression, createRequireFactories) {
  const candidate = unwrapExpression(expression);
  return (ts.isIdentifier(candidate) && createRequireFactories.has(candidate.text))
    || (ts.isPropertyAccessExpression(candidate) && candidate.name.text === 'createRequire');
}

function isNodeModuleRequire(expression) {
  const candidate = unwrapExpression(expression);
  return ts.isCallExpression(candidate)
    && ts.isIdentifier(unwrapExpression(candidate.expression))
    && unwrapExpression(candidate.expression).text === 'require'
    && candidate.arguments.length === 1
    && ts.isStringLiteralLike(candidate.arguments[0])
    && candidate.arguments[0].text === 'node:module';
}

function literalModuleRequest(call, current, edgeKind) {
  assert.equal(call.arguments.length, 1, `${edgeKind} must have exactly one module request in ${relative(agentWorkerRoot, current)}`);
  const request = call.arguments[0];
  assert.ok(
    request && ts.isStringLiteralLike(request),
    `computed module request is forbidden for ${edgeKind} in ${relative(agentWorkerRoot, current)}`,
  );
  return request.text;
}

function compiledModuleEdges(source, current) {
  const sourceFile = ts.createSourceFile(current, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
  const createRequireFactories = new Set(['createRequire']);
  function collectFactories(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)
      && node.moduleSpecifier.text === 'node:module') {
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          if ((element.propertyName?.text ?? element.name.text) === 'createRequire') {
            createRequireFactories.add(element.name.text);
          }
        }
      }
    } else if (ts.isVariableDeclaration(node) && node.initializer) {
      if (ts.isObjectBindingPattern(node.name) && isNodeModuleRequire(node.initializer)) {
        for (const element of node.name.elements) {
          if ((element.propertyName?.getText(sourceFile) ?? element.name.getText(sourceFile)) === 'createRequire'
            && ts.isIdentifier(element.name)) createRequireFactories.add(element.name.text);
        }
      } else if (ts.isIdentifier(node.name) && ts.isPropertyAccessExpression(node.initializer)
        && node.initializer.name.text === 'createRequire'
        && isNodeModuleRequire(node.initializer.expression)) {
        createRequireFactories.add(node.name.text);
      }
    }
    ts.forEachChild(node, collectFactories);
  }
  collectFactories(sourceFile);
  const createRequireLoaders = new Set();
  function collectLoaders(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer
      && ts.isCallExpression(node.initializer)
      && isCreateRequireReference(node.initializer.expression, createRequireFactories)) {
      assert.equal(node.initializer.arguments.length, 1, `createRequire must have one base in ${relative(agentWorkerRoot, current)}`);
      createRequireLoaders.add(node.name.text);
    }
    ts.forEachChild(node, collectLoaders);
  }
  collectLoaders(sourceFile);

  const edges = [];
  function visit(node) {
    if (ts.isImportDeclaration(node) || (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined)) {
      assert.ok(ts.isStringLiteralLike(node.moduleSpecifier), `computed static module request in ${relative(agentWorkerRoot, current)}`);
      edges.push({ kind: 'static import', request: node.moduleSpecifier.text });
    } else if (ts.isCallExpression(node)) {
      const expression = unwrapExpression(node.expression);
      if (expression.kind === ts.SyntaxKind.ImportKeyword) {
        edges.push({ kind: 'dynamic import', request: literalModuleRequest(node, current, 'dynamic import') });
      } else if (ts.isCallExpression(expression)
        && isCreateRequireReference(expression.expression, createRequireFactories)) {
        assert.equal(expression.arguments.length, 1, `createRequire must have one base in ${relative(agentWorkerRoot, current)}`);
        edges.push({ kind: 'createRequire loader', request: literalModuleRequest(node, current, 'createRequire loader') });
      } else if (ts.isIdentifier(expression)
        && (expression.text === 'require' || createRequireLoaders.has(expression.text))) {
        edges.push({
          kind: createRequireLoaders.has(expression.text) ? 'createRequire loader' : 'require',
          request: literalModuleRequest(node, current, expression.text),
        });
      } else if (ts.isPropertyAccessExpression(expression) && expression.name.text === 'resolve'
        && ((ts.isIdentifier(expression.expression)
          && (expression.expression.text === 'require' || createRequireLoaders.has(expression.expression.text)))
          || (ts.isCallExpression(expression.expression)
            && isCreateRequireReference(expression.expression.expression, createRequireFactories)))) {
        edges.push({ kind: 'require.resolve', request: literalModuleRequest(node, current, 'require.resolve') });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return edges;
}

function compiledParserRuntimeClosure(entry) {
  const pending = [entry];
  const runtimeFiles = new Set();
  const workspaceImports = new Set();
  const deferredModuleEdges = new Set();
  let spawnedModuleCount = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (runtimeFiles.has(current)) continue;
    assert.ok(existsSync(current), `compiled parser runtime file is missing: ${relative(agentWorkerRoot, current)}`);
    runtimeFiles.add(current);
    const source = readFileSync(current, 'utf8');
    for (const edge of compiledModuleEdges(source, current)) {
      const currentRelative = relative(compiledRoot, current).split(sep).join('/');
      const deferredKey = `${currentRelative}\0${edge.kind}\0${edge.request}`;
      if (parserImageDeferredModuleEdges.has(deferredKey)) {
        deferredModuleEdges.add(deferredKey);
      } else if (edge.request.startsWith('.')) {
        const dependency = resolve(dirname(current), extname(edge.request) ? edge.request : `${edge.request}.js`);
        pending.push(dependency);
      } else if (edge.request.startsWith('@openscience/')) {
        workspaceImports.add(edge.request);
      }
    }
    for (const match of source.matchAll(/join\)\(__dirname,\s*['"]([^'"]+)['"],\s*`([^$`]+)\$\{[^`]*extname\)\(__filename\)\}`\)/gu)) {
      spawnedModuleCount += 1;
      pending.push(resolve(dirname(current), match[1], `${match[2]}${extname(current)}`));
    }
  }
  assert.ok(spawnedModuleCount > 0, 'compiled parser runtime closure must include its spawned module child');
  return { runtimeFiles, workspaceImports, deferredModuleEdges };
}

function compiledLeafRuntimeDependencySyntax(source, filename) {
  const sourceFile = ts.createSourceFile(filename, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
  const findings = new Set();
  function visit(node) {
    if (ts.isImportDeclaration(node) || (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined)) {
      findings.add('static module edge');
    }
    if (node.kind === ts.SyntaxKind.ImportKeyword) findings.add('dynamic import');
    if (ts.isIdentifier(node) && (node.text === 'require' || node.text === 'createRequire')) {
      findings.add(node.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return [...findings].sort();
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
  const { runtimeFiles, deferredModuleEdges } = compiledParserRuntimeClosure(resolve(compiledRoot, 'parser-service.js'));
  assert.deepEqual(deferredModuleEdges, parserImageDeferredModuleEdges);
  const missing = [...runtimeFiles]
    .filter((runtimeFile) => !allowlist.has(runtimeFile))
    .map((runtimeFile) => relative(agentWorkerRoot, runtimeFile).split(sep).join('/'))
    .sort();
  assert.deepEqual(missing, []);
});

test('parser image explicitly packages every workspace import as an isolated zero-dependency leaf', () => {
  const copies = parserImageCopies();
  const { workspaceImports } = compiledParserRuntimeClosure(resolve(compiledRoot, 'parser-service.js'));
  assert.ok(workspaceImports.size > 0, 'parser runtime must exercise its workspace leaf packaging contract');

  const sandbox = mkdtempSync(join(tmpdir(), 'openscience-parser-runtime-'));
  try {
    for (const request of workspaceImports) {
      const segments = request.split('/');
      const packageName = segments.slice(0, 2).join('/');
      const exportName = segments.length === 2 ? '.' : `./${segments.slice(2).join('/')}`;
      const packageTarget = `node_modules/${packageName}/package.json`;
      const packageSource = copies.get(packageTarget);
      assert.ok(packageSource, `${request} requires an explicit parser-image package.json COPY`);

      const packageJson = JSON.parse(readFileSync(resolve(workspaceRoot, packageSource), 'utf8'));
      const exportEntry = packageJson.exports?.[exportName];
      const exportTarget = typeof exportEntry === 'string' ? exportEntry : exportEntry?.default;
      assert.equal(typeof exportTarget, 'string', `${request} must be a declared runtime package export`);
      const moduleTarget = `node_modules/${packageName}/${exportTarget.replace(/^\.\//u, '')}`;
      const moduleSource = copies.get(moduleTarget);
      assert.ok(moduleSource, `${request} requires an explicit parser-image compiled leaf COPY`);

      const compiledLeaf = readFileSync(resolve(workspaceRoot, moduleSource), 'utf8');
      assert.deepEqual(
        compiledLeafRuntimeDependencySyntax(compiledLeaf, moduleSource),
        [],
        `${request} parser-image leaf must have zero runtime dependencies`,
      );

      for (const [target, source] of [[packageTarget, packageSource], [moduleTarget, moduleSource]]) {
        const isolatedTarget = resolve(sandbox, target);
        mkdirSync(dirname(isolatedTarget), { recursive: true });
        copyFileSync(resolve(workspaceRoot, source), isolatedTarget);
      }
      const probe = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(request)})`], {
        cwd: sandbox,
        encoding: 'utf8',
        env: { ...process.env, NODE_PATH: '' },
      });
      assert.equal(probe.status, 0, `${request} must load without monorepo node_modules:\n${probe.stderr}`);
    }
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test('compiled closure discovers every supported module edge syntax and rejects computed requests', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'openscience-parser-closure-'));
  try {
    const child = join(sandbox, 'child.js');
    const dependency = join(sandbox, 'dependency.js');
    const entry = join(sandbox, 'entry.js');
    mkdirSync(join(sandbox, 'parsers'), { recursive: true });
    writeFileSync(dependency, 'module.exports = {};');
    writeFileSync(child, 'module.exports = {};');
    copyFileSync(child, join(sandbox, 'parsers', 'spawned.js'));
    const spawnedEdge = "(0, node_path_1.join)(__dirname, 'parsers', `spawned${(0, node_path_1.extname)(__filename)}`);";
    const cases = [
      { source: `${spawnedEdge}\nimport '@openscience/domain/virtual-page';`, workspace: '@openscience/domain/virtual-page' },
      { source: `${spawnedEdge}\nimport('./dependency.js');`, runtime: dependency },
      { source: `${spawnedEdge}\nrequire.resolve('@openscience/domain/virtual-page');`, workspace: '@openscience/domain/virtual-page' },
      { source: `${spawnedEdge}\nconst load = createRequire(import.meta.url); load('@openscience/domain/virtual-page');`, workspace: '@openscience/domain/virtual-page' },
      { source: `${spawnedEdge}\ncreateRequire(import.meta.url)('@openscience/domain/virtual-page');`, workspace: '@openscience/domain/virtual-page' },
      { source: `${spawnedEdge}\nimport { createRequire as makeRequire } from 'node:module'; const load = makeRequire(import.meta.url); load('@openscience/domain/virtual-page');`, workspace: '@openscience/domain/virtual-page' },
      { source: `${spawnedEdge}\nconst { createRequire: makeRequire } = require('node:module'); const load = makeRequire(__filename); load('@openscience/domain/virtual-page');`, workspace: '@openscience/domain/virtual-page' },
    ];
    for (const [index, fixture] of cases.entries()) {
      const fixtureEntry = `${entry}.${index}.js`;
      writeFileSync(fixtureEntry, fixture.source);
      const closure = compiledParserRuntimeClosure(fixtureEntry);
      if (fixture.workspace) assert.ok(closure.workspaceImports.has(fixture.workspace));
      if (fixture.runtime) assert.ok(closure.runtimeFiles.has(fixture.runtime));
    }

    const computedCases = [
      `const leaf = 'virtual-page'; require('@openscience/domain/' + leaf);`,
      `const request = '@openscience/domain/virtual-page'; import(request);`,
      `const request = '@openscience/domain/virtual-page'; require.resolve(request);`,
      `const request = '@openscience/domain/virtual-page'; createRequire(import.meta.url)(request);`,
      `const { createRequire: makeRequire } = require('node:module'); const request = '@openscience/domain/virtual-page'; makeRequire(__filename)(request);`,
    ];
    for (const computedCase of computedCases) {
      writeFileSync(entry, `${spawnedEdge}\n${computedCase}`);
      assert.throws(() => compiledParserRuntimeClosure(entry), /computed module request/);
    }
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test('parser image Domain COPY instructions are an exact runtime-leaf allowlist', () => {
  const dockerfile = readFileSync(new URL('../Dockerfile.parser', import.meta.url), 'utf8');
  assert.deepEqual(parserImageDomainCopies(dockerfile), [
    {
      source: 'packages/domain/package.json',
      target: 'node_modules/@openscience/domain/package.json',
    },
    {
      source: 'packages/domain/dist/research-intelligence/virtual-page.js',
      target: 'node_modules/@openscience/domain/dist/research-intelligence/virtual-page.js',
    },
  ]);
  assert.throws(
    () => parserImageDomainCopies(`${dockerfile}\nCOPY ["packages/domain/package.json", "/tmp/domain.json"]\n`),
    /one-source exact COPY syntax/,
  );
  assert.throws(
    () => parserImageDomainCopies(`${dockerfile}\n  copy packages/domain /tmp/domain\n`),
    /broad source includes packages\/domain/,
  );
  assert.throws(
    () => parserImageDomainCopies(`${dockerfile}\nCOPY \\\n  packages/domain /tmp/domain\n`),
    /broad source includes packages\/domain/,
  );
  for (const broadCopy of [
    'COPY packages /tmp/packages',
    'COPY . /app',
    'COPY packages/. /app/packages',
    'COPY packages/domain/../domain/package.json /tmp/domain.json',
    'COPY packages//domain/package.json /tmp/domain.json',
    'COPY packages\\domain\\package.json /tmp/domain.json',
    'COPY packages/domain\\dist/research-intelligence/virtual-page.js /tmp/domain.js',
    'COPY ${SOURCE_PATH} /app',
  ]) {
    assert.throws(
      () => parserImageDomainCopies(`${dockerfile}\n${broadCopy}\n`),
      /static one-source exact COPY syntax|broad source includes packages\/domain|path aliases are forbidden/,
    );
  }
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

test('compiled acceptance locator requires the formal structured-table block contract', () => {
  const contentHash = 'e71f6e5c40db4f3e257ee99961e81b899c817a7b00ed2e03b9c055d537aefa20';
  const tableCell = (kind) => ({
    artifactId: 'compiled-table',
    contentHash,
    parser: { name: 'openscience-text-extractor', version: '1.0.0' },
    pages: [{
      page: 1, width: 1000, height: 48,
      blocks: [{
        id: 'csv-r2-c2', kind, text: '42',
        boundingBox: { x: 500, y: 24, width: 500, height: 24 },
        parser: { name: 'openscience-text-extractor', version: '1.0.0' },
        transformations: [{
          stage: 'normalize',
          processor: { name: 'openscience-virtual-page', version: 'openscience-virtual-page-v1' },
        }],
      }],
    }],
  });
  const locator = { kind: 'table-cell', row: 2, column: 2, quote: '42' };
  assert.equal(reproduceAcceptanceLocator(tableCell('table'), locator), true);
  assert.equal(reproduceAcceptanceLocator(tableCell('paragraph'), locator), false);
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
