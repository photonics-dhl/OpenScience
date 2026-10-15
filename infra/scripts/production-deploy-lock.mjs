#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, fstatSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import {
  chmod, lstat, open, readFile, readdir, realpath, rename, rm,
} from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA_PATTERN = /^[a-f0-9]{40}$/u;
const IMAGE_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const PRODUCTION_LOCK_DIRECTORY = '/run/lock/openscience-production-deploy';
const PRODUCTION_ACTIVE_MARKER = '/opt/openscience/.release-id';
const PRODUCTION_JOURNAL = '/opt/openscience/.deploy-transaction.json';
const JOURNAL_PHASES = new Set(['prepared', 'migrating', 'switching', 'published']);
const NATIVE_ROOT = '/opt/openscience-hermes';
const NATIVE_TIMER = 'openscience-hermes-broker.timer';
const executeFile = promisify(execFile);
const VERIFIER_SOURCE_URL = import.meta.url;
// Analysis is retained only for genuine successful closure collections. It is
// not serialized into, substituted for, or supplied alongside their fingerprints.
const rollbackProofContexts = new WeakMap();

const APPLICATION_ROLLBACK_READERS = [
  ['apps/agent-worker/src/index.ts'],
  ['packages/domain/src/agent/native-agent-execution.ts', 'readNativeAgentExecution', 'nativeAgentTerminalResult', 'requireNativeIllustrationTerminalSource'],
  ['packages/domain/src/assets/native-image-review.ts', 'readNativeImageAgentExecution', 'readNativeImageReviewCheckpoint', 'imageReviewHasNoSubmission'],
  ['packages/domain/src/assets/scene-image.ts', 'readStoredGeneratedImageReview', 'requireAcceptedSceneImageReview'],
  ['apps/agent-worker/src/native-agent/session.ts', 'createNativeAgentSession'],
  ['apps/agent-worker/src/native-agent/task-store.ts', 'createNativeTaskStore'],
  ['apps/agent-worker/src/native-agent/illustration-task.ts', 'nativeIllustrationToolProfile', 'createNativeIllustrationMaterializer'],
  ['apps/agent-worker/src/presentation/handler.ts', 'createPresentationGenerationHandler'],
  ['packages/ai-gateway/src/gateway.ts', 'AiGateway'],
  ['packages/ai-gateway/src/codex-image.ts', 'SpoolImageProvider'],
  ['packages/domain/src/agent/first-image-continuation.ts', 'readFirstImageContinuationAuthority', 'advanceFirstImageContinuation', 'requireFirstImageContinuationTaskAuthority', 'findFirstImageContinuation'],
  ['packages/domain/src/agent/research-run.ts', 'reconcileHermesResearchRuns', 'requireHermesPresentationTaskAuthority', 'retryHermesGeneration', 'recoverCompletedHermesSceneImageResults'],
  ['infra/private-cleanup/runner.mjs', 'main'],
];
const APPLICATION_ROLLBACK_ROOTS = APPLICATION_ROLLBACK_READERS;
const APPLICATION_CALLBACK_POLICY = Object.freeze({
  kind: 'bounded-worker-recovery-ast',
  // These are concrete persisted-reader consumers whose callback use is
  // covered by the Worker/Domain wiring proof below. This list is deliberately
  // finite; every sensitive callback outside these functions must resolve to a
  // supplied implementation instead of being accepted as a typed parameter.
  protectedFunctions: Object.freeze([
    'apps/agent-worker/src/index.ts::main',
    'apps/agent-worker/src/index.ts::createCompletedSceneImageRecoveryScheduler',
    'packages/domain/src/agent/research-run.ts::inspectGenerationRecovery',
    'packages/domain/src/agent/research-run.ts::inspectNarrativePixelReplan',
    'packages/domain/src/agent/research-run.ts::inspectNarrativeTechnicalRecovery',
    'packages/domain/src/agent/research-run.ts::inspectCompletedImageReviewRecovery',
    'packages/domain/src/agent/research-run.ts::recoverCompletedHermesSceneImageResults',
    'packages/domain/src/assets/presentation-asset.ts::readNarrativeTerminalSceneSource',
    'packages/domain/src/assets/presentation-asset.ts::readNarrativeTechnicalReviewFollowupSource',
    'packages/domain/src/assets/presentation-asset.ts::submitExistingSceneImageReview',
  ]),
  sensitiveCallbackTargets: Object.freeze([
    'canResumeImageFromCompletedResult', 'canResumeImageBeforeSubmission', 'canResumeImageReviewFromCompletedResult',
    'canRetryImageReviewBeforeSubmission', 'canRetryImageReviewAfterQuotaRefusal', 'canRetrySourceReviewBeforeSubmission',
    'inspectImageRecoveryState', 'validateImageHistory',
  ]),
});

function rollbackCompatibilityUnknown() {
  throw new Error('ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN: preserve candidate, paired resources and deploy journal; repair forward with compatible readers');
}

function verifyPrismaVendorRuntimeAtPaths({ sourceRoot, runtimeFile, runtimeRoot = dirname(runtimeFile), generatedRoot = dirname(dirname(runtimeFile)),
  upstreamPackageRoot, enginePackageRoot, allowPnpmCore = false }) {
  const relativeRuntime = relative(sourceRoot, runtimeFile).replaceAll('\\', '/');
  const standardRuntime = /^(?:packages\/[a-z-]+\/generated\/client|node_modules\/\.prisma\/client)\/runtime\/library\.js$/u.test(relativeRuntime);
  if (!standardRuntime && !allowPnpmCore) rollbackCompatibilityUnknown();
  const insideSourceRoot = path => {
    const relativePath = relative(sourceRoot, path);
    return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
  };
  if (!insideSourceRoot(runtimeFile) || !insideSourceRoot(runtimeRoot) || !insideSourceRoot(generatedRoot)) rollbackCompatibilityUnknown();
  const boundedFile = path => {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128 * 1024 * 1024) rollbackCompatibilityUnknown();
    return readFileSync(path);
  };
  const client = JSON.parse(boundedFile(join(upstreamPackageRoot, 'package.json')));
  const engines = JSON.parse(boundedFile(join(enginePackageRoot, 'package.json')));
  const generated = JSON.parse(boundedFile(join(generatedRoot, 'package.json')));
  const coreRuntime = allowPnpmCore || /^node_modules\/\.prisma\/client\/runtime\/library\.js$/u.test(relativeRuntime);
  const schema = boundedFile(join(generatedRoot, 'schema.prisma')).toString('utf8');
  const schemaWithoutComments = schema.replace(/\/\/[^\r\n]*|\/\*[\s\S]*?\*\//gu, '');
  const generatorBlocks = [...schemaWithoutComments.matchAll(/\bgenerator\s+[A-Za-z_][A-Za-z0-9_]*\s*\{([^{}]*)\}/gu)].map(match => match[1]);
  const binaryTargets = generatorBlocks.flatMap(block => block.match(/binaryTargets\s*=\s*\[([^\]]*)\]/u)?.[1]
    ?.match(/['"]([^'"]+)['"]/gu)?.map(target => target.slice(1, -1)) ?? []);
  if (client.name !== '@prisma/client' || engines.name !== '@prisma/engines' || typeof client.version !== 'string'
    || engines.version !== client.version || generated.version !== client.version
    || typeof generated.name !== 'string'
    || (!generated.name.startsWith('prisma-client-') && !(coreRuntime && generated.name.length > 0))
    || (!['index.js', './index.js'].includes(generated.main)
      && !(coreRuntime && typeof generated.main === 'string' && /^[A-Za-z0-9._-]+\.js$/u.test(generated.main)))
    || !binaryTargets.includes('linux-musl')) rollbackCompatibilityUnknown();
  const sameFile = (left, right) => {
    if (!boundedFile(left).equals(boundedFile(right))) rollbackCompatibilityUnknown();
  };
  const runtimeFiles = readdirSync(runtimeRoot, { withFileTypes: true });
  for (const entry of runtimeFiles) {
    if (!entry.isFile() || !/^[A-Za-z0-9._-]+$/u.test(entry.name)) rollbackCompatibilityUnknown();
    sameFile(join(runtimeRoot, entry.name), join(upstreamPackageRoot, 'runtime', entry.name));
  }
  const engineFiles = readdirSync(generatedRoot, { withFileTypes: true }).filter(entry => /query.?engine/iu.test(entry.name));
  if (!engineFiles.length || !engineFiles.some(entry => entry.name === 'libquery_engine-linux-musl.so.node')) rollbackCompatibilityUnknown();
  for (const entry of engineFiles) {
    if (!entry.isFile() || !/^libquery_engine-[A-Za-z0-9._-]+\.node$/u.test(entry.name)) rollbackCompatibilityUnknown();
    sameFile(join(generatedRoot, entry.name), join(enginePackageRoot, entry.name));
  }
  return { client: { name: client.name, version: client.version }, engines: { name: engines.name, version: engines.version }, generated,
    runtimeFiles: runtimeFiles.map(entry => entry.name).sort(), engineFiles: engineFiles.map(entry => entry.name).sort(),
    schema, binaryTargets };
}

export function verifyPrismaVendorRuntime(args) {
  return verifyPrismaVendorRuntimeAtPaths(args);
}

export function verifyPrismaCoreClientRuntime({ sourceRoot, upstreamPackageRoot, enginePackageRoot }) {
  const sourceRequire = createRequire(join(sourceRoot, 'package.json'));
  const clientPackageRoot = dirname(sourceRequire.resolve('@prisma/client/package.json'));
  const runtimeFile = sourceRequire.resolve('@prisma/client/runtime/library.js');
  const generatedRoot = resolve(clientPackageRoot, '..', '..', '.prisma', 'client');
  if (!existsSync(runtimeFile) || !existsSync(generatedRoot)) rollbackCompatibilityUnknown();
  return verifyPrismaVendorRuntimeAtPaths({ sourceRoot, runtimeFile, runtimeRoot: dirname(runtimeFile), generatedRoot,
    upstreamPackageRoot, enginePackageRoot, allowPnpmCore: true });
}

function provePrismaSearchConsumer(ts, sourceFile, checker) {
  const declarations = sourceFile.statements.flatMap(statement => ts.isVariableStatement(statement)
    ? [...statement.declarationList.declarations] : []);
  const topConst = declaration => declaration && ts.isVariableDeclarationList(declaration.parent)
    && Boolean(declaration.parent.flags & ts.NodeFlags.Const) && declaration.parent.parent.parent === sourceFile;
  const named = name => {
    const matches = declarations.filter(node => ts.isIdentifier(node.name) && node.name.text === name);
    if (matches.length !== 1 || !topConst(matches[0])) rollbackCompatibilityUnknown();
    return matches[0];
  };
  const config = named('config'), client = named('PrismaClient');
  const configSymbol = checker.getSymbolAtLocation(config.name), clientSymbol = checker.getSymbolAtLocation(client.name);
  if (!configSymbol || !clientSymbol) rollbackCompatibilityUnknown();
  const imported = (identifier, specifier, destructured) => {
    const symbol = checker.getSymbolAtLocation(identifier);
    const binding = symbol?.declarations?.length === 1 ? symbol.declarations[0] : undefined;
    const declaration = destructured && binding && ts.isBindingElement(binding) && ts.isObjectBindingPattern(binding.parent)
      && !binding.propertyName && !binding.initializer && !binding.dotDotDotToken && ts.isIdentifier(binding.name) ? binding.parent.parent : binding;
    const loader = declaration?.initializer;
    if (!topConst(declaration) || !loader || !ts.isCallExpression(loader) || !ts.isIdentifier(loader.expression)
      || loader.expression.text !== 'require' || loader.arguments.length !== 1
      || !ts.isStringLiteral(loader.arguments[0]) || loader.arguments[0].text !== specifier
      || (checker.getSymbolAtLocation(loader.expression)?.declarations ?? []).some(node => !node.getSourceFile().isDeclarationFile)) rollbackCompatibilityUnknown();
    return { symbol, binding, loader };
  };
  const call = client.initializer;
  if (!call || !ts.isCallExpression(call) || !ts.isIdentifier(call.expression) || call.expression.text !== 'getPrismaClient'
    || call.arguments.length !== 1 || !ts.isIdentifier(call.arguments[0])
    || checker.getSymbolAtLocation(call.arguments[0]) !== configSymbol) rollbackCompatibilityUnknown();
  const factory = imported(call.expression, './runtime/library.js', true);
  // Check complete contexts of the finite config uses emitted by Prisma 5.22.
  // A property-name/count allowlist would admit observers using those members.
  const contexts = [
    'config.dirname = __dirname;',
    `if (!fs.existsSync(path.join(__dirname, 'schema.prisma'))) {
      const alternativePaths = ['generated/client', 'client'];
      const alternativePath = alternativePaths.find((altPath) => {
        return fs.existsSync(path.join(process.cwd(), altPath, 'schema.prisma'));
      }) ?? alternativePaths[0];
      config.dirname = path.join(process.cwd(), alternativePath);
      config.isBundled = true;
    }`,
    'config.runtimeDataModel = JSON.parse("__PRISMA_STATIC_MODEL__");',
    'defineDmmfProperty(exports.Prisma, config.runtimeDataModel);',
    'config.engineWasm = undefined;',
    `warnEnvConflicts({
      rootEnvPath: config.relativeEnvPaths.rootEnvPath && path.resolve(config.dirname, config.relativeEnvPaths.rootEnvPath),
      schemaEnvPath: config.relativeEnvPaths.schemaEnvPath && path.resolve(config.dirname, config.relativeEnvPaths.schemaEnvPath)
    });`,
    'const PrismaClient = getPrismaClient(config);',
    'exports.PrismaClient = PrismaClient;',
    'Object.defineProperty(exports, "__esModule", { value: true });',
    'Object.assign(exports, Prisma);',
    'const Prisma = {};',
    'exports.Prisma = Prisma;',
    'exports.$Enums = {};',
  ];
  const children = node => { const result = []; ts.forEachChild(node, child => { result.push(child); }); return result; };
  const sameContext = (actual, expected) => {
    if (!actual || actual.kind !== expected.kind) return false;
    if (ts.isVariableDeclarationList(expected) && (actual.flags & ts.NodeFlags.BlockScoped) !== (expected.flags & ts.NodeFlags.BlockScoped)) return false;
    if (ts.isPrefixUnaryExpression(expected) && actual.operator !== expected.operator) return false;
    if (ts.isStringLiteral(expected) && expected.text === '__PRISMA_STATIC_MODEL__') {
      try { return actual.text.length > 0 && typeof JSON.parse(actual.text) === 'object' && JSON.parse(actual.text) !== null; }
      catch { return false; }
    }
    if ((ts.isIdentifier(expected) || ts.isLiteralExpression(expected)) && actual.text !== expected.text) return false;
    const left = children(actual), right = children(expected);
    return left.length === right.length && left.every((node, index) => sameContext(node, right[index]));
  };
  const allowed = new Set([config.name]);
  const trusted = new Map([['getPrismaClient', factory]]);
  const globalNames = new Set(['require', '__dirname', 'process', 'JSON', 'Object', 'undefined']);
  for (const text of contexts) {
    const expected = ts.createSourceFile('prisma-context.js', text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS).statements[0];
    const matches = sourceFile.statements.filter(statement => sameContext(statement, expected));
    if (matches.length !== 1) rollbackCompatibilityUnknown();
    const collect = node => {
      allowed.add(node);
      if (ts.isIdentifier(node) && ['defineDmmfProperty', 'warnEnvConflicts', 'path', 'fs'].includes(node.text)) {
        const context = imported(node, ['path', 'fs'].includes(node.text) ? node.text : './runtime/library.js', !['path', 'fs'].includes(node.text));
        if (trusted.has(node.text) && trusted.get(node.text).symbol !== context.symbol) rollbackCompatibilityUnknown();
        trusted.set(node.text, context);
      }
      ts.forEachChild(node, collect);
    };
    collect(matches[0]);
  }
  // Prisma's unused bundler annotations vary by generation platform. Keep
  // their literal filenames strict in canonical comparison; allow only the
  // side-effect-free builtin call context, without leaking a builtin alias.
  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) continue;
    const annotation = statement.expression, receiver = annotation.expression, [directory, filename] = annotation.arguments;
    if (!ts.isPropertyAccessExpression(receiver) || !ts.isIdentifier(receiver.expression) || receiver.expression.text !== 'path'
      || receiver.name.text !== 'join' || annotation.arguments.length !== 2 || !ts.isStringLiteral(filename)) continue;
    const cwd = directory && ts.isCallExpression(directory) && directory.arguments.length === 0
      && ts.isPropertyAccessExpression(directory.expression) && ts.isIdentifier(directory.expression.expression)
      && directory.expression.expression.text === 'process' && directory.expression.name.text === 'cwd';
    if (!(ts.isIdentifier(directory ?? {}) && directory.text === '__dirname') && !cwd) continue;
    const collect = node => { allowed.add(node); ts.forEachChild(node, collect); };
    collect(statement);
  }
  // Initializer references alone cannot detect ambient prototype mutation.
  // Admit only the generated module's known imports, contexts and inert
  // namespace assembly; no unrelated execution inherits this allowance.
  const prisma = named('Prisma'), prismaSymbol = checker.getSymbolAtLocation(prisma.name);
  const runtimeBindings = new Set(), importDeclarations = new Set();
  for (const dependency of trusted.values()) {
    const declaration = ts.isBindingElement(dependency.binding) ? dependency.binding.parent.parent : dependency.binding;
    importDeclarations.add(declaration);
    if (ts.isObjectBindingPattern(declaration.name)) {
      for (const element of declaration.name.elements) {
        if (!ts.isIdentifier(element.name) || element.propertyName || element.initializer || element.dotDotDotToken) rollbackCompatibilityUnknown();
        runtimeBindings.add(checker.getSymbolAtLocation(element.name));
      }
    }
  }
  const restrictedFactories = new Set(['getPrismaClient', 'defineDmmfProperty', 'warnEnvConflicts', 'makeStrictEnum']);
  const runtimePaths = new Set(['Public.validator', 'Extensions.getExtensionContext', 'Extensions.defineExtension',
    'objectEnumValues.instances.DbNull', 'objectEnumValues.instances.JsonNull', 'objectEnumValues.instances.AnyNull',
    'objectEnumValues.classes.DbNull', 'objectEnumValues.classes.JsonNull', 'objectEnumValues.classes.AnyNull']);
  const namespaceValue = (node, references = true) => {
    if (!node) rollbackCompatibilityUnknown();
    if (ts.isStringLiteral(node) || [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(node.kind)) return;
    if (ts.isNumericLiteral(node) && Number.isFinite(Number(node.text))) return;
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken
      && ts.isNumericLiteral(node.operand) && Number.isFinite(Number(node.operand.text))) return;
    if (ts.isArrayLiteralExpression(node)) { for (const element of node.elements) namespaceValue(element, references); return; }
    if (ts.isObjectLiteralExpression(node)) {
      const keys = new Set();
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property) || !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
          || property.name.text === '__proto__' || keys.has(property.name.text)) rollbackCompatibilityUnknown();
        keys.add(property.name.text);
        namespaceValue(property.initializer, references);
      }
      return;
    }
    if (references && ts.isIdentifier(node) && runtimeBindings.has(checker.getSymbolAtLocation(node)) && !restrictedFactories.has(node.text)) return;
    if (references && ts.isPropertyAccessExpression(node)) {
      const names = []; let base = node;
      while (ts.isPropertyAccessExpression(base)) { names.unshift(base.name.text); base = base.expression; }
      if (ts.isIdentifier(base) && ((runtimeBindings.has(checker.getSymbolAtLocation(base)) && runtimePaths.has([base.text, ...names].join('.')))
        || checker.getSymbolAtLocation(base) === prismaSymbol && names.length === 1 && ['DbNull', 'JsonNull', 'AnyNull'].includes(names[0]))) return;
    }
    rollbackCompatibilityUnknown();
  };
  const enumCalls = new Set();
  for (const statement of sourceFile.statements) {
    if (allowed.has(statement)) continue;
    if (ts.isVariableStatement(statement) && statement.declarationList.declarations.length === 1) {
      const declaration = statement.declarationList.declarations[0];
      if (declaration === config || importDeclarations.has(declaration)) continue;
    }
    if (!ts.isExpressionStatement(statement) || !ts.isBinaryExpression(statement.expression)
      || statement.expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken) rollbackCompatibilityUnknown();
    const { left, right } = statement.expression;
    if (!ts.isPropertyAccessExpression(left) || ['__proto__', 'constructor', 'prototype', 'PrismaClient'].includes(left.name.text)) rollbackCompatibilityUnknown();
    const namespace = ts.isIdentifier(left.expression) && checker.getSymbolAtLocation(left.expression) === prismaSymbol
      || ts.isPropertyAccessExpression(left.expression) && left.expression.name.text === 'Prisma'
        && ts.isIdentifier(left.expression.expression) && left.expression.expression.text === 'exports';
    if (!namespace) rollbackCompatibilityUnknown();
    if (ts.isCallExpression(right) && ts.isIdentifier(right.expression) && right.expression.text === 'makeStrictEnum'
      && left.name.text === 'TransactionIsolationLevel' && right.arguments.length === 1) {
      const dependency = imported(right.expression, './runtime/library.js', true);
      if (!runtimeBindings.has(dependency.symbol) || enumCalls.size) rollbackCompatibilityUnknown();
      trusted.set('makeStrictEnum', dependency);
      namespaceValue(right.arguments[0], false);
      allowed.add(right.expression);
      enumCalls.add(right);
    } else namespaceValue(right);
  }
  if (enumCalls.size !== 1) rollbackCompatibilityUnknown();
  const isPropertyName = node => ts.isPropertyAssignment(node.parent) && node.parent.name === node
    || ts.isPropertyAccessExpression(node.parent) && node.parent.name === node;
  const visit = node => {
    if (!allowed.has(node) && (ts.isCallExpression(node) && !enumCalls.has(node) && ![...trusted.values()].some(item => item.loader === node)
      || ts.isNewExpression(node) || ts.isTaggedTemplateExpression(node) || ts.isFunctionLike(node)
      || ts.isElementAccessExpression(node) || ts.isPropertyAccessExpression(node) && ['__proto__', 'constructor', 'prototype'].includes(node.name.text))) rollbackCompatibilityUnknown();
    if (ts.isIdentifier(node) && !isPropertyName(node)) {
      const symbol = checker.getSymbolAtLocation(node);
      if (node.text === 'config' && (symbol !== configSymbol || !allowed.has(node))) rollbackCompatibilityUnknown();
      if (symbol === configSymbol && !allowed.has(node)) rollbackCompatibilityUnknown();
      if ((node.text === 'PrismaClient' || symbol === clientSymbol) && !allowed.has(node)) rollbackCompatibilityUnknown();
      if (trusted.has(node.text)) {
        const dependency = trusted.get(node.text);
        if (symbol !== dependency.symbol) rollbackCompatibilityUnknown();
        if (node !== dependency.binding.name && !allowed.has(node)) rollbackCompatibilityUnknown();
      }
      if (globalNames.has(node.text) && (symbol?.declarations ?? []).some(item => !item.getSourceFile().isDeclarationFile)) rollbackCompatibilityUnknown();
      // TypeScript models CJS exports with synthetic assignment declarations.
      // Reject real lexical bindings rather than those namespace assignments.
      if (node.text === 'exports' && (symbol?.declarations ?? []).some(item => ts.isVariableDeclaration(item)
        || ts.isParameter(item) || ts.isBindingElement(item) || ts.isFunctionDeclaration(item)
        || ts.isClassDeclaration(item) || ts.isImportSpecifier(item))) rollbackCompatibilityUnknown();
      if (node.text === 'exports' && !allowed.has(node) && !(ts.isPropertyAccessExpression(node.parent)
        && node.parent.expression === node && ['Prisma', '$Enums'].includes(node.parent.name.text))) rollbackCompatibilityUnknown();
      if (node.text === 'require' && ![...trusted.values()].some(item => item.loader.expression === node)) rollbackCompatibilityUnknown();
      if (['Object', 'JSON', 'process', '__dirname'].includes(node.text) && !allowed.has(node)) rollbackCompatibilityUnknown();
      if (['eval', 'Function', 'module', 'globalThis', 'global'].includes(node.text)) rollbackCompatibilityUnknown();
    }
    if ((ts.isPropertyAccessExpression(node) && node.name.text === 'PrismaClient'
      || ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression ?? {}) && node.argumentExpression.text === 'PrismaClient')
      && ts.isIdentifier(node.expression) && node.expression.text === 'exports' && !allowed.has(node)) rollbackCompatibilityUnknown();
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

function prismaSearchLocationLiterals(ts, sourceFile, sourceRoot) {
  const properties = object => {
    if (!object || !ts.isObjectLiteralExpression(object)) rollbackCompatibilityUnknown();
    const result = new Map();
    for (const property of object.properties) {
      if (!ts.isPropertyAssignment(property) || !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
        || property.name.text === '__proto__' || result.has(property.name.text)) rollbackCompatibilityUnknown();
      result.set(property.name.text, property.initializer);
    }
    return result;
  };
  // A getter inherited through __proto__ can read the mapped fields via this,
  // without referring to the config binding. Require the complete initializer
  // to be inert JSON data, including nested values, before granting relocation.
  const staticData = node => {
    if (!node) rollbackCompatibilityUnknown();
    if (ts.isStringLiteral(node) || [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(node.kind)) return;
    if (ts.isNumericLiteral(node) && Number.isFinite(Number(node.text))) return;
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken
      && ts.isNumericLiteral(node.operand) && Number.isFinite(Number(node.operand.text))) return;
    if (ts.isArrayLiteralExpression(node)) {
      for (const element of node.elements) staticData(element);
      return;
    }
    if (ts.isObjectLiteralExpression(node)) {
      for (const value of properties(node).values()) staticData(value);
      return;
    }
    rollbackCompatibilityUnknown();
  };
  const string = node => ts.isStringLiteral(node ?? {}) ? node.text : rollbackCompatibilityUnknown();
  const configs = sourceFile.statements.flatMap(statement => ts.isVariableStatement(statement)
    ? statement.declarationList.declarations.filter(declaration => ts.isIdentifier(declaration.name) && declaration.name.text === 'config')
      .map(declaration => ({ declaration, statement })) : []);
  if (configs.length !== 1 || !(configs[0].statement.declarationList.flags & ts.NodeFlags.Const)) rollbackCompatibilityUnknown();
  staticData(configs[0].declaration.initializer);
  const config = properties(configs[0].declaration.initializer);
  if (string(config.get('clientVersion')) !== '5.22.0') rollbackCompatibilityUnknown();
  const generator = properties(config.get('generator'));
  const expected = ['name', 'provider', 'output', 'config', 'binaryTargets', 'previewFeatures', 'sourceFilePath', 'isCustomOutput'];
  if (generator.size !== expected.length || expected.some(key => !generator.has(key))
    || string(generator.get('name')) !== 'client' || generator.get('isCustomOutput')?.kind !== ts.SyntaxKind.TrueKeyword) rollbackCompatibilityUnknown();
  const provider = properties(generator.get('provider'));
  const output = properties(generator.get('output'));
  const engine = properties(generator.get('config'));
  if (provider.size !== 2 || string(provider.get('value')) !== 'prisma-client-js'
    || provider.get('fromEnvVar')?.kind !== ts.SyntaxKind.NullKeyword || output.size !== 2
    || output.get('fromEnvVar')?.kind !== ts.SyntaxKind.NullKeyword || engine.size !== 1
    || string(engine.get('engineType')) !== 'library') rollbackCompatibilityUnknown();
  const outputLiteral = output.get('value'), schemaLiteral = generator.get('sourceFilePath');
  if (string(outputLiteral) !== join(resolve(sourceRoot), 'packages/search/generated/client')
    || string(schemaLiteral) !== join(resolve(sourceRoot), 'infra/search/schema.prisma')) rollbackCompatibilityUnknown();
  return new Map([[outputLiteral, 'packages/search/generated/client'], [schemaLiteral, 'infra/search/schema.prisma']]);
}


function rollbackReaderClosure(ts, root, roots, vendorPackages) {
  // Custom fixtures retain the strict supplier proof. The complete release
  // uses the bounded Worker recovery AST proof above for the only callback
  // path that can rearm persisted paid work; arbitrary provider/parser DI
  // callbacks are not treated as a persistence-reader proof.
  const callbackPolicy = roots === APPLICATION_ROLLBACK_READERS ? APPLICATION_CALLBACK_POLICY : { kind: 'strict' };
  const sourcePath = path => resolve(root, path);
  const inside = path => !relative(root, path).startsWith('..') && !relative(root, path).includes('node_modules');
  const functionLike = node => node && (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)
    || ts.isArrowFunction(node) || ts.isMethodDeclaration(node));
  const enclosingFunction = node => {
    for (let current = node; current; current = current.parent) if (functionLike(current)) return current;
    return undefined;
  };
  const functionName = fn => {
    if (!fn) return undefined;
    if (fn.name && ts.isIdentifier(fn.name)) return fn.name.text;
    for (let current = fn.parent; current; current = current.parent) {
      if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) return current.name.text;
    }
    return undefined;
  };
  const isProtectedCallbackScope = node => {
    if (callbackPolicy.kind !== 'bounded-worker-recovery-ast') return false;
    for (let current = enclosingFunction(node); current; current = enclosingFunction(current.parent)) {
      const key = `${relative(root, current.getSourceFile().fileName).replaceAll('\\', '/')}::${functionName(current)}`;
      if (callbackPolicy.protectedFunctions.includes(key)) return true;
    }
    return false;
  };
  const resolveSource = (specifier, containingFile) => {
    let base;
    if (specifier.startsWith('.')) base = resolve(dirname(containingFile), specifier.replace(/\.js$/u, '')).replace(/([\\/])dist([\\/])/u, '$1src$2');
    else if (/^@openscience\/[a-z-]+(?:\/.*)?$/u.test(specifier)) {
      const [, name, ...subpath] = specifier.split('/');
      const packageRoot = sourcePath(`packages/${name}`);
      if (!subpath.length) base = join(packageRoot, 'src/index');
      else {
        const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
        const exported = manifest.exports?.[`./${subpath.join('/')}`]?.types;
        if (typeof exported !== 'string' || !exported.startsWith('./dist/') || !exported.endsWith('.d.ts')) rollbackCompatibilityUnknown();
        base = join(packageRoot, exported.replace('./dist/', 'src/').replace(/\.d\.ts$/u, ''));
      }
    } else return undefined;
    const file = [base, `${base}.ts`, `${base}.mjs`, `${base}.js`, join(base, 'index.ts'), join(base, 'index.js')].find(candidate => inside(candidate)
      && /\.(?:ts|mjs|js)$/u.test(candidate) && !candidate.endsWith('.d.ts') && existsSync(candidate));
    if (!file) rollbackCompatibilityUnknown();
    return { resolvedFileName: file, extension: file.endsWith('.mjs') ? ts.Extension.Mjs : file.endsWith('.js') ? ts.Extension.Js : ts.Extension.Ts };
  };
  const host = ts.createCompilerHost({ allowJs: true });
  host.resolveModuleNames = (names, containingFile) => names.map(name => resolveSource(name, containingFile));
  const sourceFiles = new Set(roots.map(([file]) => sourcePath(file)));
  // TypeScript does not discover dependencies of a createRequire alias. Add
  // only literal calls through locally declared loaders before type checking.
  for (const path of sourceFiles) {
    if (sourceFiles.size > 1024) rollbackCompatibilityUnknown();
    const parsed = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.ES2022, true);
    const factories = new Set(), loaders = new Set();
    for (const statement of parsed.statements) {
      if (ts.isImportDeclaration(statement) && ['module', 'node:module'].includes(statement.moduleSpecifier.text)
        && statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)) {
        for (const element of statement.importClause.namedBindings.elements) if ((element.propertyName ?? element.name).text === 'createRequire') factories.add(element.name.text);
      }
    }
    const discover = node => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isCallExpression(node.initializer)
        && ts.isIdentifier(node.initializer.expression) && factories.has(node.initializer.expression.text)) loaders.add(node.name.text);
      ts.forEachChild(node, discover);
    };
    discover(parsed);
    const collect = node => {
      const specifier = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ? node.moduleSpecifier
        : ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
          || ts.isIdentifier(node.expression) && (node.expression.text === 'require' || loaders.has(node.expression.text))) ? node.arguments[0] : undefined;
      if (specifier && ts.isStringLiteral(specifier)) {
        const dependency = resolveSource(specifier.text, path);
        if (dependency) sourceFiles.add(dependency.resolvedFileName);
      }
      ts.forEachChild(node, collect);
    };
    collect(parsed);
  }
  const program = ts.createProgram([...sourceFiles], {
    allowJs: true, noLib: true, noEmit: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  }, host);
  if (program.getSyntacticDiagnostics().length) rollbackCompatibilityUnknown();
  const checker = program.getTypeChecker(), selected = new Map(), modules = new Map(), verifiedVendorModules = new Set();
  const callbackCalls = [], calledBodies = new Map(), externalLoaderValues = new Set(), literalLoaderCalls = new Set();
  const locationLiterals = new Map();
  const canonical = node => {
    const children = [];
    ts.forEachChild(node, child => { children.push(canonical(child)); });
    return [node.kind, ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node) ? node.operator
      : ts.isIdentifier(node) || ts.isLiteralExpression(node) || ts.isTemplateLiteralToken(node) ? (locationLiterals.get(node) ?? node.text) : null, children];
  };
  const addConfiguration = path => {
    const key = `configuration:${relative(root, path).replaceAll('\\', '/')}`;
    if (selected.has(key)) return;
    const parsed = ts.readConfigFile(path, name => readFileSync(name, 'utf8'));
    if (parsed.error) rollbackCompatibilityUnknown();
    selected.set(key, parsed.config.compilerOptions ?? {});
    if (parsed.config.extends) {
      if (typeof parsed.config.extends !== 'string' || !parsed.config.extends.startsWith('.')) rollbackCompatibilityUnknown();
      const parent = resolve(dirname(path), parsed.config.extends);
      if (!inside(parent)) rollbackCompatibilityUnknown();
      addConfiguration(parent);
    }
  };
  const addExternal = (specifier, containingFile) => {
    const key = `${relative(root, containingFile).replaceAll('\\', '/')}:external:${specifier}`;
    if (builtinModules.includes(specifier) || builtinModules.includes(specifier.replace(/^node:/u, ''))) { selected.set(key, 'node-builtin'); return; }
    const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
    let directory = dirname(containingFile), manifest;
    while (inside(directory)) {
      const path = join(directory, 'node_modules', name, 'package.json');
      if (existsSync(path)) { manifest = JSON.parse(readFileSync(path, 'utf8')); break; }
      if (directory === root) break;
      directory = dirname(directory);
    }
    if (manifest?.name !== name || typeof manifest.version !== 'string') rollbackCompatibilityUnknown();
    selected.set(key, manifest.version);
  };
  const visitModule = path => {
    if (modules.has(path)) return;
    if (modules.size >= 1024 || !inside(path)) rollbackCompatibilityUnknown();
    const parsed = program.getSourceFile(path);
    if (!parsed || parsed.isDeclarationFile) rollbackCompatibilityUnknown();
    modules.set(path, parsed);
    // Full runtime modules include initialization, import bindings, default
    // objects and callback wiring. Named declaration equality omits these.
    const compiled = ts.transpileModule(parsed.text, { fileName: path, reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true } });
    if (compiled.diagnostics?.some(item => item.category === ts.DiagnosticCategory.Error)) rollbackCompatibilityUnknown();
    const emitted = ts.createSourceFile('runtime.js', compiled.outputText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
    if (emitted.parseDiagnostics.length) rollbackCompatibilityUnknown();
    if (relative(root, path).replaceAll('\\', '/') === 'packages/search/generated/client/index.js') {
      prismaSearchLocationLiterals(ts, parsed, root);
      provePrismaSearchConsumer(ts, parsed, checker);
      visitModule(sourcePath('packages/search/generated/client/runtime/library.js'));
      for (const [node, identity] of prismaSearchLocationLiterals(ts, emitted, root)) locationLiterals.set(node, identity);
    }
    selected.set(`module:${relative(root, path).replaceAll('\\', '/')}`, canonical(emitted));
    if (/^(?:packages\/[a-z-]+\/generated\/client|node_modules\/\.prisma\/client)\/runtime\/library\.js$/u.test(relative(root, path).replaceAll('\\', '/'))) {
      if (!vendorPackages) rollbackCompatibilityUnknown();
      selected.set(`prisma-vendor:${relative(root, path).replaceAll('\\', '/')}`, verifyPrismaVendorRuntime({ sourceRoot: root, runtimeFile: path, ...vendorPackages }));
      verifiedVendorModules.add(parsed);
      return;
    }
    const namespaceImports = new Set();
    const factorySymbols = new Set(), loaderSymbols = new Map();
    for (const statement of parsed.statements) {
      if (ts.isImportDeclaration(statement) && ['module', 'node:module'].includes(statement.moduleSpecifier.text)
        && statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)) {
        for (const element of statement.importClause.namedBindings.elements) if ((element.propertyName ?? element.name).text === 'createRequire') factorySymbols.add(checker.getSymbolAtLocation(element.name));
      }
    }
    const inspectLoader = node => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && factorySymbols.has(checker.getSymbolAtLocation(node.expression))) {
        const declaration = node.parent, anchor = node.arguments[0];
        if (!ts.isVariableDeclaration(declaration) || declaration.initializer !== node || !ts.isIdentifier(declaration.name)
          || !ts.isVariableDeclarationList(declaration.parent) || !(declaration.parent.flags & ts.NodeFlags.Const)
          || node.arguments.length !== 1 || !(ts.isIdentifier(anchor) && anchor.text === '__filename'
            && !(checker.getSymbolAtLocation(anchor)?.declarations ?? []).some(item => !item.getSourceFile().isDeclarationFile)
            || ts.isPropertyAccessExpression(anchor) && anchor.name.text === 'url' && ts.isMetaProperty(anchor.expression)
              && anchor.expression.keywordToken === ts.SyntaxKind.ImportKeyword)) rollbackCompatibilityUnknown();
        loaderSymbols.set(checker.getSymbolAtLocation(declaration.name), declaration);
      }
      ts.forEachChild(node, inspectLoader);
    };
    inspectLoader(parsed);
    const validateLoader = node => {
      if (ts.isIdentifier(node)) {
        const symbol = checker.getSymbolAtLocation(node), parent = node.parent;
        if (factorySymbols.has(symbol) && !ts.isImportSpecifier(parent)
          && !(ts.isCallExpression(parent) && parent.expression === node)) rollbackCompatibilityUnknown();
        if (loaderSymbols.has(symbol) && node !== loaderSymbols.get(symbol).name) {
          if (!ts.isCallExpression(parent) || parent.expression !== node || parent.arguments.length !== 1 || !ts.isStringLiteral(parent.arguments[0])) rollbackCompatibilityUnknown();
          literalLoaderCalls.add(parent);
          const dependency = resolveSource(parent.arguments[0].text, path);
          if (dependency) visitModule(dependency.resolvedFileName);
          else { addExternal(parent.arguments[0].text, path); externalLoaderValues.add(parent); }
        }
      }
      ts.forEachChild(node, validateLoader);
    };
    validateLoader(parsed);
    for (const statement of emitted.statements) {
      if ((!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) || !statement.moduleSpecifier) continue;
      if (!ts.isStringLiteral(statement.moduleSpecifier)) rollbackCompatibilityUnknown();
      const specifier = statement.moduleSpecifier.text, resolved = resolveSource(specifier, path);
      if (resolved) visitModule(resolved.resolvedFileName);
      else addExternal(specifier, path);
      if (ts.isImportDeclaration(statement) && statement.importClause?.namedBindings
        && ts.isNamespaceImport(statement.importClause.namedBindings)) namespaceImports.add(statement.importClause.namedBindings.name.text);
    }
    const checkDynamic = node => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        const initializer = node.initializer && ts.isAwaitExpression(node.initializer) ? node.initializer.expression : node.initializer;
        if (initializer && ts.isCallExpression(initializer) && (initializer.expression.kind === ts.SyntaxKind.ImportKeyword
          || ts.isIdentifier(initializer.expression) && initializer.expression.text === 'require')) namespaceImports.add(node.name.text);
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
        if (node.arguments.length !== 1 || !ts.isStringLiteral(node.arguments[0])) rollbackCompatibilityUnknown();
        const specifier = node.arguments[0].text, resolved = resolveSource(specifier, path);
        if (resolved) visitModule(resolved.resolvedFileName);
        else addExternal(specifier, path);
      } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        if (node.arguments.length !== 1 || !ts.isStringLiteral(node.arguments[0])) rollbackCompatibilityUnknown();
        const specifier = node.arguments[0].text, resolved = resolveSource(specifier, path);
        if (resolved) visitModule(resolved.resolvedFileName);
        else addExternal(specifier, path);
      } else if (ts.isCallExpression(node) && (ts.isIdentifier(node.expression) && node.expression.text === 'eval'
        || ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'createRequire')) rollbackCompatibilityUnknown();
      if (ts.isIdentifier(node) && node.text === 'require' && !(ts.isCallExpression(node.parent) && node.parent.expression === node)
        && !(ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node && node.parent.name.text === 'main')) rollbackCompatibilityUnknown();
      if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression) && namespaceImports.has(node.expression.text)) rollbackCompatibilityUnknown();
      ts.forEachChild(node, checkDynamic);
    };
    checkDynamic(emitted);
    const packagePath = /^(apps|packages)\/[a-z-]+\/src\//u.exec(relative(root, path).replaceAll('\\', '/'))?.[0];
    if (packagePath) {
      const packageRoot = sourcePath(packagePath.replace(/src\/$/u, ''));
      const manifestPath = join(packageRoot, 'package.json');
      if (existsSync(manifestPath)) {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        selected.set(`package:${relative(root, packageRoot).replaceAll('\\', '/')}`, {
          type: manifest.type ?? 'commonjs', main: manifest.main ?? null, exports: manifest.exports ?? null,
          engines: manifest.engines ?? null, build: manifest.scripts?.build ?? null,
        });
        addConfiguration(join(packageRoot, 'tsconfig.json'));
      } else if (roots === APPLICATION_ROLLBACK_READERS) rollbackCompatibilityUnknown();
    }
  };
  for (const [file, ...names] of roots) {
    const path = sourcePath(file), parsed = program.getSourceFile(path);
    if (!parsed) rollbackCompatibilityUnknown();
    const symbols = checker.getSymbolsInScope(parsed, ts.SymbolFlags.Value);
    if (names.some(name => !symbols.some(item => item.name === name
      && item.declarations?.some(declaration => declaration.getSourceFile() === parsed)))) rollbackCompatibilityUnknown();
    visitModule(path);
  }
  const runtimeBody = node => node && (ts.isArrowFunction(node) || ts.isFunctionExpression(node)
    || ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && !!node.body;
  for (const parsed of modules.values()) {
    if (verifiedVendorModules.has(parsed)) continue;
    const inspect = node => {
      if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
      if (ts.isCallExpression(node)) {
        const declaration = checker.getResolvedSignature(node)?.declaration;
        if (runtimeBody(declaration)) {
          const calls = calledBodies.get(declaration) ?? [];
          calls.push(node); calledBodies.set(declaration, calls);
        }
        const target = ts.isPropertyAccessExpression(node.expression) ? node.expression.name : node.expression;
        const targetDeclarations = checker.getSymbolAtLocation(target)?.declarations ?? [];
        const abstractTarget = targetDeclarations.some(item => (ts.isParameter(item) || ts.isPropertySignature(item) || ts.isMethodSignature(item)
          || callbackPolicy.kind === 'strict' && ts.isVariableDeclaration(item))
          && inside(item.getSourceFile().fileName) && !item.getSourceFile().isDeclarationFile);
        const receiverIsParameter = ts.isPropertyAccessExpression(node.expression)
          && checker.getSymbolAtLocation(node.expression.expression)?.declarations?.some(item => ts.isParameter(item));
        const sensitiveCallback = callbackPolicy.kind === 'bounded-worker-recovery-ast'
          && callbackPolicy.sensitiveCallbackTargets.includes(target.text);
        const applicationBoundaryCallback = callbackPolicy.kind === 'bounded-worker-recovery-ast'
          && (isProtectedCallbackScope(node) || !sensitiveCallback && (receiverIsParameter || targetDeclarations.some(item => ts.isParameter(item))
            || declaration && (ts.isFunctionTypeNode(declaration) || ts.isMethodSignature(declaration) || ts.isCallSignatureDeclaration(declaration))));
        if (!applicationBoundaryCallback && !literalLoaderCalls.has(node) && (abstractTarget || declaration && (ts.isFunctionTypeNode(declaration) || ts.isMethodSignature(declaration) || ts.isCallSignatureDeclaration(declaration))
          && inside(declaration.getSourceFile().fileName) && !declaration.getSourceFile().isDeclarationFile)) {
          callbackCalls.push(node);
        }
      }
      ts.forEachChild(node, inspect);
    };
    inspect(parsed);
  }
  const supplierSymbols = new Map(), supplierArguments = new Set(), supplierValues = new Set(), supplierFunctions = new Set();
  const canonicalSymbols = node => {
    let symbol = checker.getSymbolAtLocation(node);
    if (symbol?.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    return symbol ? checker.getRootSymbols(symbol) : [];
  };
  const canonicalSymbol = node => {
    const symbols = canonicalSymbols(node);
    return symbols.length === 1 ? symbols[0] : undefined;
  };
  const walkRuntime = (rootNode, visit) => {
    const walk = node => {
      if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
      visit(node); ts.forEachChild(node, walk);
    };
    walk(rootNode);
  };
  const directFunction = node => {
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (ts.isArrowFunction(parent)) continue;
      if (functionLike(parent) || ts.isConstructorDeclaration(parent)) return parent;
    }
    return undefined;
  };
  const isWrite = node => {
    let target = node;
    while (target.parent) {
      const parent = target.parent;
      if (ts.isBinaryExpression(parent)) return parent.left === target
        && parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment;
      if (ts.isDeleteExpression(parent)) return true;
      if (ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent))
        return [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(parent.operator);
      if (ts.isForOfStatement(parent) || ts.isForInStatement(parent)) return parent.initializer === target;
      if (ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent) || ts.isNonNullExpression(parent)
        || ts.isPropertyAccessExpression(parent) && parent.expression === target
        || ts.isElementAccessExpression(parent) && parent.expression === target
        || ts.isPropertyAssignment(parent) && parent.initializer === target
        || ts.isObjectLiteralExpression(parent) || ts.isArrayLiteralExpression(parent)) target = parent;
      else return false;
    }
    return false;
  };
  const closedObject = node => {
    if (!node || !ts.isObjectLiteralExpression(node)) return false;
    const names = new Set();
    for (const property of node.properties) {
      if (ts.isSpreadAssignment(property) || !property.name || ts.isComputedPropertyName(property.name)
        || (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name))
        || property.name.text === '__proto__' || names.has(property.name.text)) return false;
      names.add(property.name.text);
    }
    return true;
  };
  // Keep the existing pinned-vendor boundary used by the callback scanner above.
  const applicationModules = [...modules.values()].filter(parsed => !verifiedVendorModules.has(parsed));
  const memberName = node => ts.isPropertyAccessExpression(node) ? node.name.text
    : ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteralLike(node.argumentExpression) ? node.argumentExpression.text : undefined;
  const valueUse = node => {
    while (node.parent && (ts.isParenthesizedExpression(node.parent) || ts.isAsExpression(node.parent)
      || ts.isNonNullExpression(node.parent) || ts.isSatisfiesExpression(node.parent))) node = node.parent;
    return node;
  };
  const builtinObjectValue = node => {
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node)) return builtinObjectValue(node.expression);
    // The noLib program has no intrinsic declarations; reject value aliases and shadows as well.
    if (ts.isIdentifier(node) && ['Object', 'Reflect'].includes(node.text)
      && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)
      && !(ts.isPropertyAssignment(node.parent) && node.parent.name === node)) return true;
    return (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
      && ts.isIdentifier(node.expression) && node.expression.text === 'globalThis' && ['Object', 'Reflect'].includes(memberName(node));
  };
  const classProofs = new Map();
  const proveThisSupplier = (expression, fields, seen) => {
    const method = directFunction(expression), owner = method?.parent;
    const access = expression.parent;
    if (!method || !ts.isMethodDeclaration(method) || !owner || !ts.isClassDeclaration(owner) || !owner.name
      || owner.heritageClauses?.length || ts.getDecorators(owner)?.length || ts.getDecorators(method)?.length || fields.length < 2
      || !ts.isPropertyAccessExpression(access) || access.expression !== expression) rollbackCompatibilityUnknown();
    const matchingMembers = owner.members.filter(member => member.name && (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name))
      && member.name.text === fields[0]);
    const property = matchingMembers.length === 1 && ts.isPropertyDeclaration(matchingMembers[0]) ? matchingMembers[0] : undefined;
    if (!property || canonicalSymbol(access.name) !== canonicalSymbol(property.name)) rollbackCompatibilityUnknown();
    let proof = classProofs.get(property);
    if (!proof) {
      const hasModifier = (node, kind) => node.modifiers?.some(modifier => modifier.kind === kind);
      const constructors = owner.members.filter(member => ts.isConstructorDeclaration(member));
      const constructor = constructors.length === 1 ? constructors[0] : undefined;
      const parameter = constructor?.parameters.length === 1 ? constructor.parameters[0] : undefined;
      if (!hasModifier(property, ts.SyntaxKind.PrivateKeyword) || !hasModifier(property, ts.SyntaxKind.ReadonlyKeyword)
        || hasModifier(property, ts.SyntaxKind.StaticKeyword) || property.initializer || ts.getDecorators(property)?.length
        || owner.members.some(member => ts.getDecorators(member)?.length || ts.isClassStaticBlockDeclaration(member)
          || ts.isPropertyDeclaration(member) && member.initializer)
        || !constructor?.body || !parameter || !ts.isIdentifier(parameter.name) || parameter.initializer
        || parameter.dotDotDotToken || parameter.modifiers?.length) rollbackCompatibilityUnknown();
      const assignmentStatements = constructor.body.statements.filter(statement => ts.isExpressionStatement(statement)
        && ts.isBinaryExpression(statement.expression) && statement.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
        && ts.isPropertyAccessExpression(statement.expression.left) && statement.expression.left.expression.kind === ts.SyntaxKind.ThisKeyword
        && canonicalSymbol(statement.expression.left.name) === canonicalSymbol(property.name));
      const assignment = assignmentStatements.length === 1 ? assignmentStatements[0].expression : undefined;
      if (!assignment || !ts.isPropertyAccessExpression(assignment.right) || !ts.isIdentifier(assignment.right.expression)
        || canonicalSymbol(assignment.right.expression) !== canonicalSymbol(parameter.name)
        || assignment.right.name.text !== fields[0]) rollbackCompatibilityUnknown();
      // A constructor return can replace the instance even when its field assignment is valid.
      walkRuntime(constructor.body, node => {
        if (!ts.isReturnStatement(node)) return;
        for (let parent = node.parent; parent; parent = parent.parent) {
          if (parent === constructor) rollbackCompatibilityUnknown();
          if (functionLike(parent)) break;
        }
      });
      const constructions = [], classSymbol = canonicalSymbol(owner.name);
      for (const parsed of applicationModules) {
        walkRuntime(parsed, node => {
          if (ts.isIdentifier(node) && canonicalSymbol(node) === classSymbol && node !== owner.name
            && !ts.isImportSpecifier(node.parent) && !ts.isExportSpecifier(node.parent)
            && !(ts.isNewExpression(node.parent) && node.parent.expression === node)) rollbackCompatibilityUnknown();
          if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && canonicalSymbol(node.expression) === classSymbol) {
            if (checker.getResolvedSignature(node)?.declaration !== constructor || node.arguments?.length !== 1
              || !closedObject(node.arguments[0])) rollbackCompatibilityUnknown();
            constructions.push(node);
          }
          if (node.kind === ts.SyntaxKind.ThisKeyword && directFunction(node)?.parent === owner
            && !(ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node)) rollbackCompatibilityUnknown();
          if (ts.isIdentifier(node) && canonicalSymbol(node) === canonicalSymbol(parameter.name) && node !== parameter.name
            && !(ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node && !isWrite(node.parent))) rollbackCompatibilityUnknown();
          const name = memberName(node);
          if (name === fields[0] && isWrite(node) && node !== assignment.left) rollbackCompatibilityUnknown();
          // An omitted option is safe only while the target cannot be injected through a prototype.
          if (ts.isElementAccessExpression(node) && isWrite(node)
            && ['prototype', '__proto__'].includes(memberName(node.expression))) rollbackCompatibilityUnknown();
          if (['prototype', '__proto__'].includes(name)) {
            const parent = valueUse(node).parent;
            const comparison = ts.isBinaryExpression(parent) && [ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken,
              ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(parent.operatorToken.kind);
            const primitiveRead = (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) && parent.expression === valueUse(node)
              && ['hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'toString', 'toLocaleString', 'valueOf'].includes(memberName(parent));
            if (isWrite(node) || name === '__proto__' || !comparison && !primitiveRead) rollbackCompatibilityUnknown();
          }
          if (builtinObjectValue(node)) {
            const use = valueUse(node), parent = use.parent;
            if (!((ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) && parent.expression === use && memberName(parent))
              && !(ts.isCallExpression(parent) && parent.expression === use) && !(ts.isNewExpression(parent) && parent.expression === use)) rollbackCompatibilityUnknown();
          }
          if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) && builtinObjectValue(node.expression) && name === 'getPrototypeOf') {
            const call = valueUse(node).parent, parent = call.parent;
            if (!ts.isCallExpression(call) || call.expression !== node || !ts.isBinaryExpression(parent)
              || ![ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken,
                ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(parent.operatorToken.kind)) rollbackCompatibilityUnknown();
          }
          if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) && builtinObjectValue(node.expression)
            && ['defineProperty', 'defineProperties', 'setPrototypeOf', 'set', 'deleteProperty'].includes(name)) {
            const call = valueUse(node).parent;
            if (!ts.isCallExpression(call) || call.expression !== node || ['defineProperties', 'setPrototypeOf'].includes(name)
              || !call.arguments[1] || !ts.isStringLiteral(call.arguments[1])
              || [fields[0], 'prototype', '__proto__'].includes(call.arguments[1].text)) rollbackCompatibilityUnknown();
          }
          if (ts.isElementAccessExpression(node) && node.expression.kind === ts.SyntaxKind.ThisKeyword
            && directFunction(node)?.parent === owner) rollbackCompatibilityUnknown();
        });
      }
      if (!constructions.length) rollbackCompatibilityUnknown();
      proof = { constructions, owner, parameter, assignment }; classProofs.set(property, proof);
    }
    const proveReceiver = (receiver, visited = new Set()) => {
      if (!receiver || visited.has(receiver) || visited.size >= 64) rollbackCompatibilityUnknown();
      const next = new Set(visited).add(receiver);
      if (ts.isParenthesizedExpression(receiver) || ts.isAsExpression(receiver) || ts.isNonNullExpression(receiver)) return proveReceiver(receiver.expression, next);
      if (ts.isNewExpression(receiver) && proof.constructions.includes(receiver)) return;
      if (ts.isCallExpression(receiver)) {
        const factory = checker.getResolvedSignature(receiver)?.declaration;
        if (!ts.isIdentifier(receiver.expression) || !runtimeBody(factory)
          || !modules.has(resolve(factory.getSourceFile().fileName))) rollbackCompatibilityUnknown();
        const binding = ts.isFunctionDeclaration(factory) ? factory : factory.parent;
        if (!binding.name || !ts.isIdentifier(binding.name)
          || !ts.isFunctionDeclaration(binding) && (!ts.isVariableDeclaration(binding)
            || !ts.isVariableDeclarationList(binding.parent) || !(binding.parent.flags & ts.NodeFlags.Const))) rollbackCompatibilityUnknown();
        const factorySymbol = canonicalSymbol(binding.name);
        if (!factorySymbol || canonicalSymbol(receiver.expression) !== factorySymbol) rollbackCompatibilityUnknown();
        // A resolved signature does not prove a runtime callee that was reassigned or escaped.
        for (const parsed of applicationModules) walkRuntime(parsed, node => {
          if (ts.isIdentifier(node) && canonicalSymbol(node) === factorySymbol && node !== binding.name
            && !ts.isImportSpecifier(node.parent) && !ts.isExportSpecifier(node.parent)
            && !(ts.isCallExpression(node.parent) && node.parent.expression === node)) rollbackCompatibilityUnknown();
        });
        const returns = [];
        walkRuntime(factory, node => { if (ts.isReturnStatement(node) && enclosingFunction(node) === factory) returns.push(node); });
        if (returns.length !== 1 || !ts.isBlock(factory.body) || factory.body.statements.at(-1) !== returns[0]) rollbackCompatibilityUnknown();
        return proveReceiver(returns[0].expression, next);
      }
      if (ts.isIdentifier(receiver)) {
        const declarations = canonicalSymbol(receiver)?.declarations;
        const declaration = declarations?.length === 1 ? declarations[0] : undefined;
        if (!declaration || !ts.isVariableDeclaration(declaration) || !ts.isVariableDeclarationList(declaration.parent)
          || !(declaration.parent.flags & ts.NodeFlags.Const) || !declaration.initializer) rollbackCompatibilityUnknown();
        for (const parsed of applicationModules) walkRuntime(parsed, node => {
          if (ts.isIdentifier(node) && canonicalSymbol(node) === canonicalSymbol(receiver) && node !== declaration.name
            && !(ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node
              && ts.isCallExpression(node.parent.parent) && node.parent.parent.expression === node.parent)) rollbackCompatibilityUnknown();
        });
        return proveReceiver(declaration.initializer, next);
      }
      rollbackCompatibilityUnknown();
    };
    const methodSymbol = canonicalSymbol(method.name);
    if (!methodSymbol) rollbackCompatibilityUnknown();
    for (const parsed of applicationModules) walkRuntime(parsed, node => {
      if (ts.isElementAccessExpression(node) && memberName(node) === method.name.text) rollbackCompatibilityUnknown();
      if (!ts.isIdentifier(node)) return;
      const symbols = canonicalSymbols(node), member = node.parent;
      if (ts.isPropertyAccessExpression(member) && member.name === node && node.text === method.name.text
        && symbols.length !== 1) rollbackCompatibilityUnknown();
      if (symbols.includes(methodSymbol) && node !== method.name) {
        if (symbols.length !== 1 || !ts.isPropertyAccessExpression(member) || member.name !== node || !ts.isCallExpression(member.parent)
          || member.parent.expression !== member) rollbackCompatibilityUnknown();
        proveReceiver(member.expression);
      }
    });
    const optionalField = ts.isPropertyAccessExpression(access.parent) && access.parent.expression === access
      && !!access.parent.questionDotToken;
    for (const construction of proof.constructions) {
      const options = construction.arguments[0];
      const supplied = options.properties.some(member => member.name?.text === fields[0]);
      if (!supplied) {
        if (!optionalField) rollbackCompatibilityUnknown();
      } else {
        // A provided object must not escape through a field alias or an unproved constructor call.
        walkRuntime(proof.owner, node => {
          if (!ts.isPropertyAccessExpression(node) || node.name.text !== fields[0] || node === proof.assignment.left) return;
          const fromThis = node.expression.kind === ts.SyntaxKind.ThisKeyword;
          const fromOptions = ts.isIdentifier(node.expression) && canonicalSymbol(node.expression) === canonicalSymbol(proof.parameter.name);
          if (!fromThis && !fromOptions || node === proof.assignment.right) return;
          if (!ts.isPropertyAccessExpression(node.parent) || node.parent.expression !== node
            || node.parent.name.text !== 'name' && !(ts.isCallExpression(node.parent.parent)
              && node.parent.parent.expression === node.parent && node.parent.name.text === fields[1])) rollbackCompatibilityUnknown();
        });
        proveSupplier(options, fields, seen);
      }
    }
  };
  const proveSupplier = (expression, fields = [], seen = new Set()) => {
    if (!expression || seen.has(expression) || seen.size >= 64) rollbackCompatibilityUnknown();
    supplierValues.add(expression);
    const next = new Set(seen).add(expression);
    if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isNonNullExpression(expression)
      || ts.isSatisfiesExpression(expression)) return proveSupplier(expression.expression, fields, next);
    if (ts.isPropertyAccessExpression(expression)) return proveSupplier(expression.expression, [expression.name.text, ...fields], next);
    if (expression.kind === ts.SyntaxKind.ThisKeyword) return proveThisSupplier(expression, fields, next);
    if (ts.isObjectLiteralExpression(expression)) {
      if (!fields.length || expression.properties.some(property => ts.isSpreadAssignment(property) || property.name && ts.isComputedPropertyName(property.name))) rollbackCompatibilityUnknown();
      const matches = expression.properties.filter(property => property.name?.text === fields[0]);
      if (matches.length !== 1) rollbackCompatibilityUnknown();
      const property = matches[0];
      if (ts.isPropertyAssignment(property)) return proveSupplier(property.initializer, fields.slice(1), next);
      if (ts.isShorthandPropertyAssignment(property)) return proveSupplier(property.name, fields.slice(1), next);
      if (ts.isMethodDeclaration(property) && fields.length === 1 && property.body) return;
      rollbackCompatibilityUnknown();
    }
    if (runtimeBody(expression) && !fields.length && modules.has(resolve(expression.getSourceFile().fileName))) return;
    if (externalLoaderValues.has(expression)) return;
    if (!ts.isIdentifier(expression)) rollbackCompatibilityUnknown();
    let symbol = ts.isShorthandPropertyAssignment(expression.parent)
      ? checker.getShorthandAssignmentValueSymbol(expression.parent) : checker.getSymbolAtLocation(expression);
    if (symbol?.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    const declarations = symbol?.declarations;
    if (!declarations?.length || declarations.length !== 1) rollbackCompatibilityUnknown();
    const declaration = declarations[0];
    if (runtimeBody(declaration) && !fields.length && modules.has(resolve(declaration.getSourceFile().fileName))) {
      supplierSymbols.set(symbol, declaration); supplierFunctions.add(symbol); return;
    }
    if (ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name)
      && ts.isVariableDeclarationList(declaration.parent) && declaration.parent.flags & ts.NodeFlags.Const) {
      if (declaration.parent.parent.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) rollbackCompatibilityUnknown();
      supplierSymbols.set(symbol, declaration);
      return proveSupplier(declaration.initializer, fields, next);
    }
    if (ts.isParameter(declaration) && runtimeBody(declaration.parent)) {
      const owner = declaration.parent, index = owner.parameters.indexOf(declaration), calls = calledBodies.get(owner);
      if (!calls?.length || declaration.dotDotDotToken || declaration.initializer) rollbackCompatibilityUnknown();
      supplierSymbols.set(symbol, declaration);
      for (const call of calls) {
        for (let parent = call; parent; parent = parent.parent) if (parent === owner) rollbackCompatibilityUnknown();
        supplierArguments.add(call.arguments[index]);
        proveSupplier(call.arguments[index], fields, next);
      }
      return;
    }
    rollbackCompatibilityUnknown();
  };
  for (const call of callbackCalls) proveSupplier(call.expression);
  for (const parsed of modules.values()) {
    const checkUse = node => {
      if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
      if (ts.isIdentifier(node)) {
        const symbol = ts.isShorthandPropertyAssignment(node.parent) ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node);
        const declaration = supplierSymbols.get(symbol);
        if (declaration && node !== declaration.name) {
          const parent = node.parent;
          const alias = ts.isVariableDeclaration(parent) && parent.initializer === node
            && ts.isVariableDeclarationList(parent.parent) && parent.parent.flags & ts.NodeFlags.Const
            && supplierSymbols.has(checker.getSymbolAtLocation(parent.name));
          let access = node;
          while (ts.isPropertyAccessExpression(access.parent) && access.parent.expression === access) access = access.parent;
          const invocation = ts.isCallExpression(access.parent) && access.parent.expression === access && callbackCalls.includes(access.parent);
          const concreteInvocation = supplierFunctions.has(symbol) && ts.isCallExpression(parent) && parent.expression === node;
          if (!supplierValues.has(node) && !supplierArguments.has(node) && !alias && !invocation && !concreteInvocation) rollbackCompatibilityUnknown();
        }
      }
      ts.forEachChild(node, checkUse);
    };
    checkUse(parsed);
  }
  const entries = [...selected.entries()].sort(([left], [right]) => left.localeCompare(right));
  rollbackProofContexts.set(entries, { ts, root, roots, program, checker, modules, canonical });
  return entries;
}

function namedRuntimeFunction(ts, sourceFile, name) {
  const found = [];
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) found.push(statement);
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === name && declaration.initializer
          && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))) found.push(declaration.initializer);
      }
    }
  }
  return found.length === 1 ? found[0] : undefined;
}

/** Bounded proof for the persisted completed-image recovery wiring. */
export function verifyWorkerRecoveryWiring({ sourceRoot, compilerRoot = sourceRoot }) {
  const ts = createRequire(join(compilerRoot, 'package.json'))('typescript');
  const indexPath = resolve(sourceRoot, 'apps/agent-worker/src/index.ts');
  const runPath = resolve(sourceRoot, 'packages/domain/src/agent/research-run.ts');
  if (!existsSync(indexPath) || !existsSync(runPath)) rollbackCompatibilityUnknown();
  const compilerOptions = {
    allowJs: true, noEmit: true, noLib: true, skipLibCheck: true,
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Node10, baseUrl: resolve(sourceRoot),
    paths: { '@openscience/*': ['packages/*/src/index.ts'] },
  };
  const compilerHost = ts.createCompilerHost(compilerOptions);
  const program = ts.createProgram([indexPath, runPath], compilerOptions, compilerHost);
  const indexFile = program.getSourceFile(indexPath);
  const runFile = program.getSourceFile(runPath);
  const checker = program.getTypeChecker();
  if (!indexFile || !runFile || program.getSyntacticDiagnostics().length) rollbackCompatibilityUnknown();
  const deps = namedRuntimeFunction(ts, indexFile, 'createWorkerDeps');
  const main = namedRuntimeFunction(ts, indexFile, 'main');
  const scheduler = namedRuntimeFunction(ts, indexFile, 'createCompletedSceneImageRecoveryScheduler');
  const poller = namedRuntimeFunction(ts, indexFile, 'createPollOnce');
  const buildGateway = namedRuntimeFunction(ts, indexFile, 'buildGateway');
  const inspectRecovery = namedRuntimeFunction(ts, runFile, 'inspectGenerationRecovery');
  const recovery = namedRuntimeFunction(ts, runFile, 'recoverCompletedHermesSceneImageResults');
  if (!deps || !main || !scheduler || !poller || !buildGateway || !inspectRecovery || !recovery) rollbackCompatibilityUnknown();
  const nodes = (root, predicate) => {
    const found = [];
    const visit = node => {
      if (predicate(node)) found.push(node);
      ts.forEachChild(node, visit);
    };
    visit(root);
    return found;
  };
  const functionLike = node => node && (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)
    || ts.isArrowFunction(node) || ts.isMethodDeclaration(node));
  const symbolAt = node => {
    let symbol = node ? checker.getSymbolAtLocation(node) : undefined;
    if (symbol?.flags & ts.SymbolFlags.Alias) {
      const aliased = checker.getAliasedSymbol(symbol);
      if (aliased && aliased !== symbol) symbol = aliased;
    }
    return symbol;
  };
  const functionSymbol = fn => {
    if (fn?.name && ts.isIdentifier(fn.name)) return symbolAt(fn.name);
    for (let current = fn?.parent; current; current = current.parent) {
      if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name) && current.initializer === fn) return symbolAt(current.name);
    }
    return undefined;
  };
  const importedFunctionBinding = (identifier, fn) => {
    const symbol = identifier ? checker.getSymbolAtLocation(identifier) : undefined;
    const declarations = symbol?.declarations ?? [];
    if (declarations.length !== 1 || !ts.isImportSpecifier(declarations[0])) return false;
    const importSpecifier = declarations[0];
    const importDeclaration = importSpecifier.parent.parent.parent;
    const importedName = (importSpecifier.propertyName ?? importSpecifier.name).text;
    return ts.isImportDeclaration(importDeclaration) && !importDeclaration.importClause?.isTypeOnly
      && !importSpecifier.isTypeOnly && ts.isStringLiteral(importDeclaration.moduleSpecifier)
      && importedName === fn?.name?.text && importDeclaration.moduleSpecifier.text === '@openscience/domain';
  };
  const boundToFunction = (identifier, fn) => Boolean(symbolAt(identifier) && functionSymbol(fn)
    && symbolAt(identifier) === functionSymbol(fn)) || importedFunctionBinding(identifier, fn);
  const isBoundCall = (node, fn) => ts.isCallExpression(node) && ts.isIdentifier(node.expression)
    && boundToFunction(node.expression, fn);
  const variableSymbol = declaration => declaration && ts.isIdentifier(declaration.name) ? symbolAt(declaration.name) : undefined;
  const boundToVariableDeclaration = (identifier, declaration) => Boolean(variableSymbol(declaration)
    && symbolAt(identifier) === variableSymbol(declaration));
  const runtimeImportBinding = (sourceFile, name, expectedModuleSpecifier) => {
    const matches = [];
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || !statement.importClause || statement.importClause.isTypeOnly
        || !statement.importClause.namedBindings || !ts.isNamedImports(statement.importClause.namedBindings)) continue;
      for (const specifier of statement.importClause.namedBindings.elements) {
        const moduleSpecifier = statement.moduleSpecifier;
        const moduleMatches = expectedModuleSpecifier && ts.isStringLiteral(moduleSpecifier)
          ? resolve(dirname(sourceFile.fileName), moduleSpecifier.text) === resolve(dirname(sourceFile.fileName), expectedModuleSpecifier)
          : !expectedModuleSpecifier;
        if ((specifier.propertyName ?? specifier.name).text === name && !specifier.isTypeOnly && moduleMatches) matches.push(specifier);
      }
    }
    if (matches.length !== 1) return undefined;
    return { specifier: matches[0], symbol: checker.getSymbolAtLocation(matches[0].name) };
  };
  const sameImportedBinding = (identifier, binding) => {
    if (!binding?.symbol || !identifier) return false;
    const direct = checker.getSymbolAtLocation(identifier);
    return direct === binding.symbol || symbolAt(identifier) === symbolAt(binding.specifier.name);
  };
  const enclosingFunction = node => {
    for (let current = node; current; current = current.parent) if (functionLike(current)) return current;
    return undefined;
  };
  const isNestedIn = (node, root) => {
    for (let current = enclosingFunction(node); current; current = enclosingFunction(current.parent)) {
      if (current === root) return true;
    }
    return false;
  };
  const isFirstStatementOfFunctionBody = (node, fn) => ts.isBlock(fn.body)
    && node.parent === fn.body && fn.body.statements[0] === node;
  const boundToVariable = (fn, name) => {
    for (let current = fn.parent; current; current = current.parent) {
      if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name) && current.name.text === name) {
        const initializer = current.initializer;
        const called = ts.isCallExpression(initializer) ? initializer.expression : undefined;
        const callee = ts.isParenthesizedExpression(called) ? called.expression : called;
        if (callee === fn) return true;
      }
    }
    return false;
  };
  const isNamedCall = (node, name) => ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name;
  const isMember = (node, receiver, property) => ts.isPropertyAccessExpression(node)
    && ts.isIdentifier(node.expression) && node.expression.text === receiver && node.name.text === property;
  const isNegatedMember = (node, receiver, property) => ts.isPrefixUnaryExpression(node)
    && node.operator === ts.SyntaxKind.ExclamationToken && isMember(node.operand, receiver, property);
  const flattenOr = expression => ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.BarBarToken
    ? [...flattenOr(expression.left), ...flattenOr(expression.right)] : [expression];
  const hasDirectNegatedMember = (expression, receiver, property) => flattenOr(expression)
    .some(item => isNegatedMember(item, receiver, property));
  const hasBooleanLiteral = root => nodes(root, node => node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword).length > 0;
  const hasConstantFalseAncestor = node => {
    for (let current = node.parent; current; current = current.parent) {
      if (ts.isIfStatement(current) && hasBooleanLiteral(current.expression)) return true;
    }
    return false;
  };
  const propertyName = property => property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
    ? property.name.text : undefined;
  const objectProperties = (object, name) => object && ts.isObjectLiteralExpression(object)
    ? object.properties.filter(property => propertyName(property) === name) : [];
  const objectProperty = (object, name) => {
    const properties = objectProperties(object, name);
    return properties.length === 1 ? properties[0] : undefined;
  };
  const propertyValue = (object, name) => {
    const property = objectProperty(object, name);
    if (!property) return undefined;
    if (ts.isPropertyAssignment(property)) return property.initializer;
    if (ts.isShorthandPropertyAssignment(property)) return property.name;
    return undefined;
  };
  const isNumberLiteral = (node, value) => ts.isNumericLiteral(node) && Number(node.text.replaceAll('_', '')) === value;
  const isStringLiteral = (node, value) => ts.isStringLiteral(node) && node.text === value;
  const isFalseKeyword = node => node?.kind === ts.SyntaxKind.FalseKeyword;
  const hasCall = (root, predicate) => nodes(root, node => ts.isCallExpression(node) && predicate(node));

  // createWorkerDeps must return the single shared object carrying the feature
  // gate and readiness reader. Checking the AST properties prevents comments,
  // dead branches, or an unrelated string from satisfying the proof.
  const dependencyReturns = nodes(deps, node => ts.isReturnStatement(node) && ts.isObjectLiteralExpression(node.expression)
    && enclosingFunction(node) === deps);
  if (dependencyReturns.length !== 1) rollbackCompatibilityUnknown();
  const dependencyObject = dependencyReturns[0].expression;
  if (!dependencyObject.properties.some(property => ts.isSpreadAssignment(property)
    && ts.isIdentifier(property.expression) && property.expression.text === 'input')
    || !propertyValue(dependencyObject, 'nativeSceneImageEnabled')
    || !propertyValue(dependencyObject, 'readVideoReadiness')) rollbackCompatibilityUnknown();
  const nativeEnabledValue = propertyValue(dependencyObject, 'nativeSceneImageEnabled');
  const readinessValue = propertyValue(dependencyObject, 'readVideoReadiness');
  if (!ts.isIdentifier(nativeEnabledValue) || nativeEnabledValue.text !== 'nativeSceneImageEnabled'
    || !isNamedCall(readinessValue, 'createNativeVideoReadinessReader')) rollbackCompatibilityUnknown();

  const mainNodes = nodes(main, node => enclosingFunction(node) === main);
  const variableCall = (name, callee) => mainNodes.find(node => ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name) && node.name.text === name && isBoundCall(node.initializer, callee));
  const depsDeclaration = variableCall('deps', deps);
  const gatewayDeclaration = variableCall('gateway', buildGateway);
  if (!depsDeclaration || !gatewayDeclaration || hasConstantFalseAncestor(depsDeclaration)
    || hasConstantFalseAncestor(gatewayDeclaration) || gatewayDeclaration.getStart() <= depsDeclaration.getStart()) rollbackCompatibilityUnknown();
  const isBoundMember = (node, declaration, property) => ts.isPropertyAccessExpression(node)
    && ts.isIdentifier(node.expression) && node.name.text === property
    && boundToVariableDeclaration(node.expression, declaration);
  const isNegatedBoundMember = (node, declaration, property) => ts.isPrefixUnaryExpression(node)
    && node.operator === ts.SyntaxKind.ExclamationToken && isBoundMember(node.operand, declaration, property);
  const hasDirectNegatedBoundMember = (expression, declaration, property) => flattenOr(expression)
    .some(item => isNegatedBoundMember(item, declaration, property));
  const nativeIf = mainNodes.find(node => ts.isIfStatement(node) && isBoundMember(node.expression, depsDeclaration, 'nativeSceneImageEnabled'));
  if (!nativeIf || hasConstantFalseAncestor(nativeIf) || nativeIf.getStart() <= gatewayDeclaration.getStart()) rollbackCompatibilityUnknown();
  const inspectorAssignments = nodes(nativeIf.thenStatement, node => ts.isBinaryExpression(node)
    && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
    && isBoundMember(node.left, depsDeclaration, 'inspectImageRecoveryState') && enclosingFunction(node) === main);
  if (inspectorAssignments.length !== 1) rollbackCompatibilityUnknown();
  const inspectorValue = inspectorAssignments[0].right;
  const inspectorGatewayCalls = hasCall(inspectorValue, call => isBoundMember(call.expression, gatewayDeclaration, 'canResumeImageFromCompletedResult')
    && call.arguments.length === 1 && ts.isIdentifier(call.arguments[0]) && call.arguments[0].text === 'requestId');
  if (!inspectorGatewayCalls.length || hasConstantFalseAncestor(inspectorAssignments[0])) rollbackCompatibilityUnknown();
  const inspectorResultLiterals = nodes(inspectorValue, node => isStringLiteral(node, 'completed') || isStringLiteral(node, 'unsafe'));
  if (inspectorResultLiterals.length !== 2) rollbackCompatibilityUnknown();
  const schedulerCalls = hasCall(main, call => call.expression && isBoundCall(call, scheduler)
    && boundToVariable(enclosingFunction(call), 'maintenance'));
  const mainStoppingDeclaration = nodes(main, node => ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name) && node.name.text === 'stopping' && enclosingFunction(node) === main);
  const mainStoppingSymbol = mainStoppingDeclaration.length === 1
    ? checker.getSymbolAtLocation(mainStoppingDeclaration[0].name) : undefined;
  const forwardsMainStopping = expression => {
    if (!functionLike(expression) || expression.parameters.length !== 0 || !expression.body) return false;
    const value = ts.isBlock(expression.body) && expression.body.statements.length === 1
      && ts.isReturnStatement(expression.body.statements[0]) ? expression.body.statements[0].expression : expression.body;
    return ts.isIdentifier(value) && value.text === 'stopping'
      && mainStoppingSymbol && checker.getSymbolAtLocation(value) === mainStoppingSymbol;
  };
  if (schedulerCalls.length !== 1 || hasConstantFalseAncestor(schedulerCalls[0])
    || schedulerCalls[0].getStart() <= inspectorAssignments[0].getStart()
    || schedulerCalls[0].arguments.length !== 1 || !ts.isObjectLiteralExpression(schedulerCalls[0].arguments[0])
    || objectProperties(schedulerCalls[0].arguments[0], 'stopping').length !== 1
    || schedulerCalls[0].arguments[0].properties.some(property => ts.isSpreadAssignment(property)
      || propertyName(property) !== 'stopping')
    || !forwardsMainStopping(propertyValue(schedulerCalls[0].arguments[0], 'stopping'))) rollbackCompatibilityUnknown();
  const maintenanceFunction = schedulerCalls.length === 1 ? enclosingFunction(schedulerCalls[0]) : undefined;
  const recoveryBinding = maintenanceFunction ? nodes(maintenanceFunction, node => ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name) && node.name.text === 'recoverSceneImages' && node.initializer === schedulerCalls[0]) : [];
  const recoveryCalls = hasCall(main, call => ts.isCallExpression(call) && ts.isIdentifier(call.expression)
    && recoveryBinding.length === 1 && boundToVariableDeclaration(call.expression, recoveryBinding[0])
    && call.arguments.length === 1 && ts.isIdentifier(call.arguments[0]) && boundToVariableDeclaration(call.arguments[0], depsDeclaration)
    && boundToVariable(enclosingFunction(call), 'maintenance'));
  if (recoveryCalls.length !== 1 || recoveryCalls[0].getStart() <= schedulerCalls[0].getStart()
    || enclosingFunction(recoveryCalls[0]) !== enclosingFunction(schedulerCalls[0]) || recoveryCalls.some(hasConstantFalseAncestor)) rollbackCompatibilityUnknown();
  const pollerCalls = hasCall(main, call => isBoundCall(call, poller) && isNestedIn(call, main));
  if (!pollerCalls.length || pollerCalls.some(call => hasConstantFalseAncestor(call)
    || call.arguments.length !== 2 || !ts.isObjectLiteralExpression(call.arguments[1])
    || objectProperties(call.arguments[1], 'runMaintenance').length !== 1
    || objectProperties(call.arguments[1], 'stopping').length !== 1
    || call.arguments[1].properties.some(property => ts.isSpreadAssignment(property)
      || !['runMaintenance', 'stopping'].includes(propertyName(property)))
    || !isFalseKeyword(propertyValue(call.arguments[1], 'runMaintenance'))
    || !forwardsMainStopping(propertyValue(call.arguments[1], 'stopping')))) rollbackCompatibilityUnknown();

  const schedulerReturnedFunctions = nodes(scheduler, node => ts.isReturnStatement(node)
    && functionLike(node.expression) && enclosingFunction(node) === scheduler).map(node => node.expression);
  if (schedulerReturnedFunctions.length !== 1) rollbackCompatibilityUnknown();
  const schedulerRuntime = schedulerReturnedFunctions[0];
  const schedulerDepsParameter = schedulerRuntime.parameters.length === 1 && ts.isIdentifier(schedulerRuntime.parameters[0].name)
    ? schedulerRuntime.parameters[0] : undefined;
  const schedulerGuards = nodes(schedulerRuntime, node => ts.isIfStatement(node)
    && enclosingFunction(node) === schedulerRuntime
    && hasDirectNegatedBoundMember(node.expression, schedulerDepsParameter, 'nativeSceneImageEnabled')
    && hasDirectNegatedBoundMember(node.expression, schedulerDepsParameter, 'inspectImageRecoveryState'));
  if (schedulerGuards.length !== 1 || hasBooleanLiteral(schedulerGuards[0].expression)
    || hasConstantFalseAncestor(schedulerGuards[0])
    || !isFirstStatementOfFunctionBody(schedulerGuards[0], schedulerRuntime)
    || !ts.isReturnStatement(schedulerGuards[0].thenStatement)
    || !isFalseKeyword(schedulerGuards[0].thenStatement.expression)) rollbackCompatibilityUnknown();
  const recoverBindings = nodes(scheduler, node => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
    && node.name.text === 'recover' && enclosingFunction(node) === scheduler);
  const recoverBinding = recoverBindings[0];
  const recoverInitializer = recoverBinding?.initializer;
  const recoverFallback = ts.isBinaryExpression(recoverInitializer) && recoverInitializer.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
    && isMember(recoverInitializer.left, 'options', 'recover')
    && ts.isIdentifier(recoverInitializer.right) && boundToFunction(recoverInitializer.right, recovery);
  const recoveryInvocation = hasCall(schedulerRuntime, call => ts.isCallExpression(call) && ts.isIdentifier(call.expression)
    && recoverBinding && boundToVariableDeclaration(call.expression, recoverBinding)
    && enclosingFunction(call) === schedulerRuntime
    && call.arguments.length === 2 && schedulerDepsParameter && ts.isIdentifier(call.arguments[0])
    && boundToVariableDeclaration(call.arguments[0], schedulerDepsParameter)
    && isNumberLiteral(propertyValue(call.arguments[1], 'limit'), 20));
  if (recoverBindings.length !== 1 || !recoverFallback || recoveryInvocation.length !== 1 || !recoveryInvocation.every(call => ts.isAwaitExpression(call.parent)
    && ts.isVariableDeclaration(call.parent.parent) && schedulerGuards[0].getStart() < call.getStart()
    && !hasConstantFalseAncestor(call))) rollbackCompatibilityUnknown();

  const recoveryGuards = nodes(recovery, node => ts.isIfStatement(node)
    && enclosingFunction(node) === recovery
    && recovery.parameters.length >= 1 && ts.isIdentifier(recovery.parameters[0].name)
    && hasDirectNegatedBoundMember(node.expression, recovery.parameters[0], 'nativeSceneImageEnabled')
    && hasDirectNegatedBoundMember(node.expression, recovery.parameters[0], 'inspectImageRecoveryState'));
  if (recoveryGuards.length !== 1 || hasBooleanLiteral(recoveryGuards[0].expression)
    || hasConstantFalseAncestor(recoveryGuards[0])
    || !isFirstStatementOfFunctionBody(recoveryGuards[0], recovery)
    || !ts.isReturnStatement(recoveryGuards[0].thenStatement)
    || !ts.isObjectLiteralExpression(recoveryGuards[0].thenStatement.expression)
    || !isNumberLiteral(propertyValue(recoveryGuards[0].thenStatement.expression, 'inspected'), 0)
    || !isNumberLiteral(propertyValue(recoveryGuards[0].thenStatement.expression, 'resumed'), 0)
    || !isNumberLiteral(propertyValue(recoveryGuards[0].thenStatement.expression, 'errors'), 0)) {
    rollbackCompatibilityUnknown();
  }
  const recoveryDepsParameter = recovery.parameters.length >= 1 && ts.isIdentifier(recovery.parameters[0].name)
    ? recovery.parameters[0] : undefined;
  const isDepsTransactionCall = call => ts.isCallExpression(call)
    && ts.isPropertyAccessExpression(call.expression)
    && call.expression.name.text === '$transaction'
    && ts.isPropertyAccessExpression(call.expression.expression)
    && isMember(call.expression.expression, 'deps', 'prisma')
    && recoveryDepsParameter && boundToVariableDeclaration(call.expression.expression.expression, recoveryDepsParameter);
  const transactionCallback = node => {
    for (let current = node.parent; current; current = current.parent) {
      if (isDepsTransactionCall(current)) {
        if (current.arguments.length !== 2 || !ts.isObjectLiteralExpression(current.arguments[1])) return undefined;
        const callback = current.arguments[0];
        if (functionLike(callback) && isNestedIn(node, callback)) return { callback, transaction: current };
      }
    }
    return undefined;
  };
  const transactionOptions = item => item?.transaction && item.transaction.arguments.length === 2
    && ts.isObjectLiteralExpression(item.transaction.arguments[1])
    && objectProperties(item.transaction.arguments[1], 'isolationLevel').length === 1
    && objectProperties(item.transaction.arguments[1], 'maxWait').length === 1
    && objectProperties(item.transaction.arguments[1], 'timeout').length === 1
    && item.transaction.arguments[1].properties.every(property => !ts.isSpreadAssignment(property)
      && ['isolationLevel', 'maxWait', 'timeout'].includes(propertyName(property)))
    && isStringLiteral(propertyValue(item.transaction.arguments[1], 'isolationLevel'), 'Serializable')
    && isNumberLiteral(propertyValue(item.transaction.arguments[1], 'maxWait'), 10_000)
    && isNumberLiteral(propertyValue(item.transaction.arguments[1], 'timeout'), 20_000);
  const transactionParameter = item => item?.callback?.parameters.length === 1
    && ts.isIdentifier(item.callback.parameters[0].name) ? item.callback.parameters[0] : undefined;
  const transactionParameterSymbol = item => {
    const parameter = transactionParameter(item);
    return parameter ? checker.getSymbolAtLocation(parameter.name) : undefined;
  };
  const transactionUsesParameter = (item, identifier) => {
    const symbol = transactionParameterSymbol(item);
    return !!symbol && ts.isIdentifier(identifier) && checker.getSymbolAtLocation(identifier) === symbol;
  };
  const lockBinding = runtimeImportBinding(runFile, 'lockTrashReferences', '../trash/trash');
  const lockCalls = hasCall(recovery, call => ts.isIdentifier(call.expression) && sameImportedBinding(call.expression, lockBinding)
    && call.arguments.length === 1 && ts.isIdentifier(call.arguments[0])
    && ts.isAwaitExpression(call.parent) && transactionCallback(call)
    && transactionUsesParameter(transactionCallback(call), call.arguments[0]) && !hasConstantFalseAncestor(call));
  const runUpdates = hasCall(recovery, call => ts.isPropertyAccessExpression(call.expression)
    && call.expression.name.text === 'updateMany' && ts.isPropertyAccessExpression(call.expression.expression)
    && call.expression.expression.name.text === 'hermesResearchRun'
    && transactionCallback(call) && transactionUsesParameter(transactionCallback(call), call.expression.expression.expression)
    && !hasConstantFalseAncestor(call));
  const taskUpdates = hasCall(recovery, call => ts.isPropertyAccessExpression(call.expression)
    && call.expression.name.text === 'updateMany' && ts.isPropertyAccessExpression(call.expression.expression)
    && call.expression.expression.name.text === 'agentTask'
    && transactionCallback(call) && transactionUsesParameter(transactionCallback(call), call.expression.expression.expression)
    && !hasConstantFalseAncestor(call));
  const stepUpdates = hasCall(recovery, call => ts.isPropertyAccessExpression(call.expression)
    && call.expression.name.text === 'updateMany' && ts.isPropertyAccessExpression(call.expression.expression)
    && call.expression.expression.name.text === 'hermesResearchStep'
    && transactionCallback(call) && transactionUsesParameter(transactionCallback(call), call.expression.expression.expression)
    && !hasConstantFalseAncestor(call));
  const transactionCallbacks = [lockCalls, runUpdates, taskUpdates, stepUpdates].flat().map(transactionCallback);
  const lockStatement = lockCalls[0]?.parent?.parent;
  const lockTransaction = transactionCallbacks[0];
  const propertyAccess = (node, declaration, property) => ts.isPropertyAccessExpression(node)
    && ts.isIdentifier(node.expression) && node.name.text === property
    && boundToVariableDeclaration(node.expression, declaration);
  const runDeclarations = lockTransaction?.callback ? nodes(lockTransaction.callback, node => ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name) && node.name.text === 'run' && enclosingFunction(node) === lockTransaction.callback) : [];
  const pendingDeclarations = lockTransaction?.callback ? nodes(lockTransaction.callback, node => ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name) && node.name.text === 'pending' && enclosingFunction(node) === lockTransaction.callback) : [];
  const candidateDeclarations = nodes(recovery, node => ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name) && node.name.text === 'candidate' && enclosingFunction(node) === recovery);
  const itemDeclarations = lockTransaction?.callback ? nodes(lockTransaction.callback, node => ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name) && node.name.text === 'item' && enclosingFunction(node) === lockTransaction.callback) : [];
  const stepDeclarations = lockTransaction?.callback ? nodes(lockTransaction.callback, node => ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name) && node.name.text === 'step' && enclosingFunction(node) === lockTransaction.callback) : [];
  const runDeclaration = runDeclarations.length === 1 ? runDeclarations[0] : undefined;
  const pendingDeclaration = pendingDeclarations.length === 1 ? pendingDeclarations[0] : undefined;
  const candidateDeclaration = candidateDeclarations.length === 1 ? candidateDeclarations[0] : undefined;
  const itemDeclaration = itemDeclarations.length === 1 ? itemDeclarations[0] : undefined;
  const stepBindings = stepDeclarations.filter(declaration => declaration.initializer);
  const stepDeclaration = stepBindings.length === 1 ? stepBindings[0] : undefined;
  const stepLoopBindings = stepDeclarations.filter(declaration => !declaration.initializer);
  const inspectStepDeclaration = stepLoopBindings.length === 1 ? stepLoopBindings[0] : undefined;
  const planDeclarations = lockTransaction?.callback ? nodes(lockTransaction.callback, node => ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name) && node.name.text === 'plan' && enclosingFunction(node) === lockTransaction.callback) : [];
  const planDeclaration = planDeclarations.length === 1 ? planDeclarations[0] : undefined;
  const itemLoop = itemDeclaration?.parent && ts.isVariableDeclarationList(itemDeclaration.parent)
    && ts.isForOfStatement(itemDeclaration.parent.parent) && itemDeclaration.parent.parent.initializer === itemDeclaration.parent
    ? itemDeclaration.parent.parent : undefined;
  const itemFromPending = Boolean(itemLoop && pendingDeclaration && ts.isIdentifier(itemLoop.expression)
    && ts.isArrayLiteralExpression(pendingDeclaration.initializer)
    && boundToVariableDeclaration(itemLoop.expression, pendingDeclaration));
  const runFetchExpression = runDeclaration?.initializer && ts.isAwaitExpression(runDeclaration.initializer)
    ? runDeclaration.initializer.expression : undefined;
  const runFetchWhere = runFetchExpression && ts.isCallExpression(runFetchExpression) && runFetchExpression.arguments.length === 1
    ? propertyValue(runFetchExpression.arguments[0], 'where') : undefined;
  const runFetchValid = !!runFetchExpression && ts.isCallExpression(runFetchExpression)
    && ts.isPropertyAccessExpression(runFetchExpression.expression)
    && runFetchExpression.expression.name.text === 'findUnique'
    && ts.isPropertyAccessExpression(runFetchExpression.expression.expression)
    && runFetchExpression.expression.expression.name.text === 'hermesResearchRun'
    && lockTransaction && transactionUsesParameter(lockTransaction, runFetchExpression.expression.expression.expression)
    && candidateDeclaration && propertyAccess(propertyValue(runFetchWhere, 'id'), candidateDeclaration, 'id');
  const unwrapExpression = expression => ts.isParenthesizedExpression(expression)
    || ts.isAsExpression(expression) || ts.isNonNullExpression(expression) ? unwrapExpression(expression.expression) : expression;
  const stepFetchExpression = stepDeclaration?.initializer ? unwrapExpression(stepDeclaration.initializer) : undefined;
  const stepPredicate = stepFetchExpression && ts.isCallExpression(stepFetchExpression)
    && ts.isPropertyAccessExpression(stepFetchExpression.expression)
    && stepFetchExpression.expression.name.text === 'find'
    && ts.isPropertyAccessExpression(stepFetchExpression.expression.expression)
    && stepFetchExpression.expression.expression.name.text === 'steps'
    && runDeclaration && boundToVariableDeclaration(stepFetchExpression.expression.expression.expression, runDeclaration)
    && stepFetchExpression.arguments.length === 1 && functionLike(stepFetchExpression.arguments[0]) ? stepFetchExpression.arguments[0] : undefined;
  const stepPredicateValue = stepPredicate?.body && ts.isBlock(stepPredicate.body) && stepPredicate.body.statements.length === 1
    && ts.isReturnStatement(stepPredicate.body.statements[0]) ? stepPredicate.body.statements[0].expression : stepPredicate?.body;
  const stepPredicateParameter = stepPredicate?.parameters.length === 1 && ts.isIdentifier(stepPredicate.parameters[0].name)
    ? stepPredicate.parameters[0] : undefined;
  const stepFetchValid = Boolean(stepPredicate && stepPredicateParameter && itemDeclaration && ts.isBinaryExpression(stepPredicateValue)
    && stepPredicateValue.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
    && propertyAccess(stepPredicateValue.left, stepPredicateParameter, 'id')
    && propertyAccess(stepPredicateValue.right, itemDeclaration, 'stepId'));
  const inspectRecoveryCalls = hasCall(recovery, call => isBoundCall(call, inspectRecovery)
    && lockTransaction && enclosingFunction(call) === lockTransaction.callback
    && planDeclaration?.initializer && ts.isAwaitExpression(planDeclaration.initializer)
    && planDeclaration.initializer.expression === call
    && call.arguments.length === 5
    && transactionUsesParameter(lockTransaction, call.arguments[0])
    && boundToVariableDeclaration(call.arguments[1], runDeclaration)
    && ts.isIdentifier(call.arguments[2]) && call.arguments[2].text === 'undefined'
    && isBoundMember(call.arguments[3], recoveryDepsParameter, 'inspectImageRecoveryState')
    && inspectStepDeclaration && propertyAccess(unwrapExpression(call.arguments[4]), inspectStepDeclaration, 'agentTaskId')
    && !hasConstantFalseAncestor(call));
  const nullLiteral = node => node?.kind === ts.SyntaxKind.NullKeyword;
  const exactObject = (object, expected) => ts.isObjectLiteralExpression(object)
    && object.properties.length === Object.keys(expected).length
    && Object.entries(expected).every(([name, predicate]) => objectProperties(object, name).length === 1
      && predicate(propertyValue(object, name)));
  const runWhere = {
    id: value => propertyAccess(value, runDeclaration, 'id'), actorId: value => propertyAccess(value, runDeclaration, 'actorId'),
    researchObjectId: value => propertyAccess(value, runDeclaration, 'researchObjectId'), versionId: value => propertyAccess(value, runDeclaration, 'versionId'),
    status: value => propertyAccess(value, runDeclaration, 'status'), version: value => propertyAccess(value, runDeclaration, 'version'),
    profile: value => propertyAccess(value, runDeclaration, 'profile'), maxAgentTasks: value => propertyAccess(value, runDeclaration, 'maxAgentTasks'),
  };
  const runData = {
    status: value => isStringLiteral(value, 'generating_scene_images'), error: nullLiteral, lastReconciledAt: nullLiteral,
    version: value => exactObject(value, { increment: item => isNumberLiteral(item, 1) }),
  };
  const taskWhere = {
    id: value => propertyAccess(value, itemDeclaration, 'taskId'), deletedAt: nullLiteral,
    kind: value => isStringLiteral(value, 'presentation.generate'), status: value => isStringLiteral(value, 'failed'),
    retryCount: value => isNumberLiteral(value, 0), executionAttempt: value => propertyAccess(value, itemDeclaration, 'expectedExecutionAttempt'),
    error: value => propertyAccess(value, itemDeclaration, 'expectedError'),
    payload: value => exactObject(value, { equals: item => ts.isAsExpression(item) && propertyAccess(item.expression, itemDeclaration, 'expectedPayload') }),
    result: value => exactObject(value, { equals: item => ts.isBinaryExpression(item) && item.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
      && propertyAccess(item.left, itemDeclaration, 'expectedResult') && ts.isPropertyAccessExpression(item.right)
      && ts.isIdentifier(item.right.expression) && item.right.expression.text === 'Prisma' && item.right.name.text === 'DbNull' }),
  };
  const taskData = {
    status: value => isStringLiteral(value, 'pending'), progress: value => isNumberLiteral(value, 0), retryCount: value => isNumberLiteral(value, 1),
    error: nullLiteral, dispatchedAt: nullLiteral,
  };
  const stepWhere = {
    id: value => propertyAccess(value, itemDeclaration, 'stepId'), runId: value => propertyAccess(value, runDeclaration, 'id'),
    stage: value => isStringLiteral(value, 'scene_image'), ordinal: value => propertyAccess(value, itemDeclaration, 'ordinal'),
    agentTaskId: value => propertyAccess(value, itemDeclaration, 'taskId'), status: value => propertyAccess(value, stepDeclaration, 'status'),
    presentationAssetId: value => propertyAccess(value, stepDeclaration, 'presentationAssetId'),
  };
  const stepData = { status: value => isStringLiteral(value, 'running'), presentationAssetId: nullLiteral, error: nullLiteral };
  const updateShape = (call, where, data) => call?.arguments.length === 1
    && ts.isObjectLiteralExpression(call.arguments[0])
    && exactObject(propertyValue(call.arguments[0], 'where'), where)
    && exactObject(propertyValue(call.arguments[0], 'data'), data);
  if (lockCalls.length !== 1 || runUpdates.length !== 1 || taskUpdates.length !== 1 || stepUpdates.length !== 1
    || transactionCallbacks.some(item => item?.callback !== lockTransaction?.callback || item?.transaction !== lockTransaction?.transaction)
    || !lockTransaction || !ts.isBlock(lockTransaction.callback.body)
    || !transactionOptions(lockTransaction)
    || !transactionParameter(lockTransaction) || !transactionParameterSymbol(lockTransaction)
    || !lockBinding || runDeclarations.length !== 1 || !runFetchValid || candidateDeclarations.length !== 1
    || pendingDeclarations.length !== 1 || itemDeclarations.length !== 1 || !itemFromPending
    || stepBindings.length !== 1 || stepLoopBindings.length !== 1 || !stepFetchValid || planDeclarations.length !== 1
    || inspectRecoveryCalls.length !== 1
    || lockTransaction.callback.body.statements[0] !== lockStatement
    || !ts.isExpressionStatement(lockStatement)
    || !updateShape(runUpdates[0], runWhere, runData)
    || !updateShape(taskUpdates[0], taskWhere, taskData)
    || !updateShape(stepUpdates[0], stepWhere, stepData)
    || [lockCalls, runUpdates, taskUpdates, stepUpdates].flat().some(call => call.getStart() <= recoveryGuards[0].getStart())) rollbackCompatibilityUnknown();
  return true;
}

/** This helper alone never permits rollback. The private finite pair proof
 * may use its specified conditional witnesses only with complete context
 * equality and the directional family proof.
 */
export function proveNativeVideoReceiptIngress(ts, program, sourceRoot) {
  const proven = [], references = [];
  const storeGraph = { status: 'unproven', instances: [], sessions: [], hosts: [], shared: [], factories: [], identityObjects: [], pending: [] };
  const privateStoreChain = { status: 'unproven', nodes: [], equalityPremise: { status: 'unresolved',
    mechanism: 'existing-complete-module-closure-with-dependencies', modules: [] } };
  const fail = (reason, node) => { throw { reason, node }; };
  const need = (value, reason, node) => { if (!value) fail(reason, node); return value; };
  const normalize = value => resolve(value).replaceAll('\\', '/').toLowerCase();
  const root = normalize(sourceRoot) + '/';
  const files = program.getSourceFiles().filter(file => !file.isDeclarationFile
    && normalize(file.fileName).startsWith(root) && /\/(?:apps|packages)\/[^/]+\/src\//u.test(normalize(file.fileName)));
  const location = node => node ? { file: relative(sourceRoot, node.getSourceFile().fileName).replaceAll('\\', '/'),
    line: node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1 } : undefined;
  const walk = (node, predicate) => {
    const result = [];
    const visit = current => {
      if (ts.isTypeNode(current) || ts.isInterfaceDeclaration(current) || ts.isTypeAliasDeclaration(current)) return;
      if (predicate(current)) result.push(current);
      ts.forEachChild(current, visit);
    };
    visit(node); return result;
  };
  const one = (values, reason) => need(values.length === 1, reason, values[0]) && values[0];
  const unwrap = value => {
    while (value && (ts.isParenthesizedExpression(value) || ts.isAsExpression(value) || ts.isNonNullExpression(value)
      || ts.isAwaitExpression(value))) value = value.expression;
    return value;
  };
  try {
    need(program.getSyntacticDiagnostics().length === 0, 'PROGRAM_SYNTAX_UNKNOWN');
    const checker = program.getTypeChecker();
    const symbolCache = new WeakMap();
    const symbol = node => {
      if (!node) return undefined;
      if (symbolCache.has(node)) return symbolCache.get(node);
      let value = ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node
        ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node);
      if (value?.flags & ts.SymbolFlags.Alias) {
        const target = checker.getAliasedSymbol(value);
        if (target?.declarations?.length) value = target;
      }
      symbolCache.set(node, value);
      return value;
    };
    const same = (left, right) => !!symbol(left) && symbol(left) === symbol(right);
    const file = name => one(files.filter(value => normalize(value.fileName) === normalize(join(sourceRoot, name))), 'PROGRAM_SOURCE_MISSING');
    const illustration = file('apps/agent-worker/src/native-agent/illustration-task.ts');
    const host = file('apps/agent-worker/src/native-agent/host-task.ts');
    const sessionFile = file('apps/agent-worker/src/native-agent/session.ts');
    const storeFile = file('apps/agent-worker/src/native-agent/task-store.ts');
    const handler = file('apps/agent-worker/src/presentation/handler.ts');
    const fn = (scope, name) => one(walk(scope, value => ts.isFunctionDeclaration(value) && value.name?.text === name), `FUNCTION_${name}_UNKNOWN`);
    const materializer = fn(illustration, 'createNativeIllustrationMaterializer');
    const live = fn(illustration, 'runNativeIllustrationTask'), replay = fn(illustration, 'replayNativeVideoPlan');
    const hostFactory = fn(host, 'runHostedNativeTask'), sessionFactory = fn(sessionFile, 'createNativeAgentSession');
    const storeFactory = fn(storeFile, 'createNativeTaskStore');
    const enclosing = node => {
      for (let value = node.parent; value; value = value.parent) if (ts.isFunctionLike(value) && value.body) return value;
      return undefined;
    };
    const variable = (scope, name) => one(walk(scope, node => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
      && node.name.text === name && enclosing(node) === scope), `BINDING_${name}_UNKNOWN`);
    const objectProperty = (object, name) => {
      object = unwrap(object);
      need(object && ts.isObjectLiteralExpression(object), 'OBJECT_BINDING_UNKNOWN', object);
      const property = one(object.properties.filter(value => (ts.isPropertyAssignment(value) || ts.isShorthandPropertyAssignment(value))
        && value.name?.text === name), `PROPERTY_${name}_UNKNOWN`);
      const index = object.properties.indexOf(property);
      need(!object.properties.slice(index + 1).some(ts.isSpreadAssignment), 'LATE_SPREAD_OVERRIDES_BINDING', property);
      return ts.isShorthandPropertyAssignment(property) ? property.name : property.initializer;
    };
    const definition = expression => {
      expression = unwrap(expression);
      if (!expression || !ts.isIdentifier(expression)) return expression;
      const declarations = symbol(expression)?.declarations;
      const declaration = one((declarations ?? []).filter(ts.isVariableDeclaration), 'LOCAL_ORIGIN_UNKNOWN');
      need(declaration.initializer && ts.isVariableDeclarationList(declaration.parent)
        && declaration.parent.flags & ts.NodeFlags.Const, 'MUTABLE_ORIGIN_UNKNOWN', declaration);
      return unwrap(declaration.initializer);
    };
    const callOf = (value, target) => {
      value = unwrap(value);
      return !!value && ts.isCallExpression(value) && same(value.expression, target.name);
    };
    const identifiers = new Map(), imports = [];
    for (const source of files) for (const node of walk(source, ts.isIdentifier)) {
      const values = identifiers.get(node.text) ?? []; values.push(node); identifiers.set(node.text, values);
      if (ts.isImportSpecifier(node.parent) && node.parent.name === node) imports.push(node);
    }
    const uses = target => {
      const names = new Set([target.name.text, ...imports.filter(node => same(node, target.name)).map(node => node.text)]);
      const all = [...names].flatMap(name => identifiers.get(name) ?? []).filter(node => node !== target.name && same(node, target.name)
        && !ts.isImportSpecifier(node.parent) && !ts.isExportSpecifier(node.parent));
      return all.map(node => {
        references.push({ target: target.name.text, ...location(node) });
        need(ts.isCallExpression(node.parent) && node.parent.expression === node, 'FACTORY_ALIAS_OR_ESCAPE_UNKNOWN', node);
        return node.parent;
      });
    };
    // Expression skeletons below bind variables to checker symbols. They are
    // finite data/control shapes, not source hashes or whole-function text.
    const match = (actual, text, roles = {}) => {
      const template = ts.createSourceFile('shape.ts', `const value = (${text});`, ts.ScriptTarget.ES2022, true);
      const expected = template.statements[0].declarationList.declarations[0].initializer;
      const compare = (a, b) => {
        a = unwrap(a); b = unwrap(b);
        if (!a || !b || a.kind !== b.kind) return false;
        if (ts.isPropertyAccessExpression(a)) return a.name.text === b.name.text && compare(a.expression, b.expression)
          && !!a.questionDotToken === !!b.questionDotToken;
        if (ts.isIdentifier(b)) return Object.hasOwn(roles, b.text) ? same(a, roles[b.text]) : a.text === b.text;
        if (ts.isLiteralExpression(b) || ts.isTemplateLiteralToken(b)) return a.text === b.text;
        if (ts.isPrefixUnaryExpression(a) || ts.isPostfixUnaryExpression(a)) return a.operator === b.operator && compare(a.operand, b.operand);
        const left = [], right = [];
        ts.forEachChild(a, node => { if (!ts.isTypeNode(node)) left.push(node); });
        ts.forEachChild(b, node => { if (!ts.isTypeNode(node)) right.push(node); });
        return left.length === right.length && left.every((node, index) => compare(node, right[index]));
      };
      return compare(actual, expected);
    };
    const importOf = (source, module, name) => one(source.statements.filter(ts.isImportDeclaration)
      .filter(node => node.moduleSpecifier.text === module && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings))
      .flatMap(node => node.importClause.namedBindings.elements.filter(item => (item.propertyName ?? item.name).text === name).map(item => item.name)), 'IMPORT_BINDING_UNKNOWN');
    const guard = (statement, condition, roles, stop) => {
      if (!statement || !ts.isIfStatement(statement) || statement.elseStatement || !match(statement.expression, condition, roles)) return false;
      const body = ts.isBlock(statement.thenStatement) ? statement.thenStatement.statements : [statement.thenStatement];
      return body.length === 1 && ts.isExpressionStatement(body[0]) && callOf(body[0].expression, stop);
    };
    const hostStop = fn(host, 'blocked'), sessionStop = fn(sessionFile, 'blocked');
    for (const stop of [hostStop, sessionStop]) need(stop.body?.statements.length === 1 && ts.isThrowStatement(stop.body.statements[0]), 'REJECTION_NOT_TERMINAL', stop);

    const materializerUses = uses(materializer), liveUses = uses(live), replayUses = uses(replay);
    need(materializerUses.length === 2 && materializerUses.every(call => [live, replay].includes(enclosing(call))), 'EXTRA_MATERIALIZER_CALLER', materializerUses[2]);
    need(liveUses.length === 1 && liveUses[0].getSourceFile() === handler
      && replayUses.length === 1 && replayUses[0].getSourceFile() === handler, 'EXTRA_LIVE_OR_REPLAY_CALLER');
    const liveStore = variable(live, 'store'), liveSaved = variable(live, 'saved'), liveMaterializer = variable(live, 'materializer');
    need(callOf(liveStore.initializer, storeFactory) && match(liveSaved.initializer, 'store.read()', { store: liveStore.name }), 'SAVED_STATE_ORIGIN_UNKNOWN');
    need(callOf(liveMaterializer.initializer, materializer)
      && same(objectProperty(unwrap(liveMaterializer.initializer).arguments[0], 'savedState'), liveSaved.name), 'CALLER_SELECTED_SAVED_STATE');
    const paper = variable(live, 'paper'), paperCall = unwrap(objectProperty(paper.initializer, 'call'));
    need(ts.isArrowFunction(paperCall) && paperCall.parameters.length === 4, 'PAPER_CALL_NOT_BOUND');
    need(match(paperCall.body, "name.startsWith('paper_illustration_') ? materializer.call(name, args, sequence, callId) : source.call(name, args)",
      { materializer: liveMaterializer.name, name: paperCall.parameters[0].name, args: paperCall.parameters[1].name,
        sequence: paperCall.parameters[2].name, callId: paperCall.parameters[3].name, source: variable(live, 'source').name }), 'PAPER_CALL_NOT_MATERIALIZER');
    const session = variable(live, 'session'), native = variable(live, 'native');
    need(callOf(session.initializer, sessionFactory) && same(objectProperty(unwrap(session.initializer).arguments[0], 'store'), liveStore.name)
      && callOf(native.initializer, hostFactory) && same(objectProperty(unwrap(native.initializer).arguments[0], 'session'), session.name)
      && same(objectProperty(unwrap(native.initializer).arguments[0], 'store'), liveStore.name)
      && same(objectProperty(unwrap(native.initializer).arguments[0], 'paper'), paper.name), 'HOST_STORE_SESSION_ORIGIN_UNKNOWN');
    proven.push('materializer-host');

    const history = fn(hostFactory, 'validateSourceHistory');
    const hostEqual = importOf(host, 'node:util', 'isDeepStrictEqual');
    const hostInput = hostFactory.parameters[0].name, historyInput = history.parameters[0].name;
    const hostParser = importOf(host, '@openscience/ai-gateway', 'nativeAgentSdkRequest');
    const decodedHistory = history.body.statements[0]?.declarationList?.declarations[0];
    need(decodedHistory && ts.isObjectBindingPattern(decodedHistory.name)
      && match(decodedHistory.initializer, 'nativeAgentSdkRequest(value, input.config.model)',
        { nativeAgentSdkRequest: hostParser, value: historyInput, input: hostInput }), 'HOST_HISTORY_NOT_DECODED');
    const historyMessages = one(decodedHistory.name.elements.filter(node => node.name.text === 'messages'), 'HOST_MESSAGES_BINDING_UNKNOWN').name;
    const slots = variable(hostFactory, 'slots').name;
    const loop = one(walk(history, ts.isForOfStatement), 'HOST_SLOT_LOOP_UNKNOWN');
    need(ts.isVariableDeclarationList(loop.initializer) && loop.initializer.flags & ts.NodeFlags.Const
      && loop.initializer.declarations.length === 1 && same(loop.expression, slots), 'HOST_SLOT_ITERABLE_UNKNOWN');
    const slot = loop.initializer.declarations[0].name;
    need(ts.isBlock(loop.statement) && loop.statement.statements.length === 3, 'HOST_SLOT_GUARDS_UNKNOWN');
    const toolResult = loop.statement.statements[0].declarationList?.declarations[0];
    need(toolResult && match(toolResult.initializer,
      "[...messages].reverse().find(m => m.role === 'tool' && m.toolCallId === slot.id)",
      { messages: historyMessages, slot }), 'HOST_TOOL_RESULT_ORIGIN_UNKNOWN');
    const roles = { slot, result: toolResult?.name, isDeepStrictEqual: hostEqual };
    need(guard(loop.statement.statements[1], '!slot.authorized || !result', roles, hostStop)
      && guard(loop.statement.statements[2], "slot.name.startsWith('paper_') && (!slot.called || !isDeepStrictEqual(JSON.parse(result.content), slot.result))", roles, hostStop), 'HOST_TOOL_RESULT_UNBOUND');
    const resultWrites = walk(hostFactory, node => ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isPropertyAccessExpression(node.left) && node.left.name.text === 'result');
    const resultWrite = one(resultWrites, 'HOST_RESULT_ASSIGNMENT_UNKNOWN');
    const execute = enclosing(resultWrite);
    need(ts.isArrowFunction(execute) && ts.isBlock(execute.body) && execute.body.statements.length === 3
      && match(resultWrite.right, 'input.paper.call(slot.name, value.arguments, slot.sequence, slot.id)',
        { input: hostInput, slot: resultWrite.left.expression }), 'MODEL_SELECTED_SLOT_RESULT');
    const callSlot = resultWrite.left.expression;
    const callSlotDecl = symbol(callSlot)?.declarations?.find(ts.isVariableDeclaration);
    need(callSlotDecl && match(callSlotDecl.initializer,
      "slots.find(s => s.authorized && !s.called && s.name.startsWith('paper_') && s.name === value.name && isDeepStrictEqual(s.args, value.arguments))",
      { isDeepStrictEqual: hostEqual, slots }), 'HOST_SLOT_NOT_AUTHENTICATED');
    const slotBlock = callSlotDecl.parent?.parent;
    need(ts.isVariableStatement(slotBlock) && ts.isBlock(slotBlock.parent)
      && slotBlock.parent.statements[0] === slotBlock
      && guard(slotBlock.parent.statements[1], '!slot', { slot: callSlotDecl.name }, hostStop), 'HOST_SLOT_GUARD_BYPASS');
    proven.push('host-slot-result');
    const completeCalls = walk(hostFactory, node => ts.isCallExpression(node) && match(node.expression, 'input.session.complete', { input: hostInput }));
    const completeCall = one(completeCalls, 'HOST_SESSION_CALL_UNKNOWN');
    let completeStatement = completeCall.parent;
    while (completeStatement && !ts.isVariableStatement(completeStatement)) completeStatement = completeStatement.parent;
    need(completeStatement, 'HOST_SESSION_STATEMENT_UNKNOWN', completeCall);
    const completeBlock = completeStatement.parent;
    need(ts.isVariableStatement(completeStatement) && ts.isBlock(completeBlock) && completeBlock.statements.length === 4
      && ts.isExpressionStatement(completeBlock.statements[0]) && ts.isAwaitExpression(completeBlock.statements[0].expression)
      && callOf(completeBlock.statements[0].expression, history)
      && completeBlock.statements[1] === completeStatement, 'HOST_HISTORY_CHECK_BYPASS');
    const checkedHistory = unwrap(completeBlock.statements[0].expression);
    need(checkedHistory.arguments.length === 1 && completeCall.arguments.length === 1
      && same(checkedHistory.arguments[0], completeCall.arguments[0]), 'HOST_HISTORY_ARGUMENT_UNBOUND');
    proven.push('host-before-session');

    const prefix = fn(sessionFactory, 'checkHistory'), prefixStatements = prefix.body.statements;
    const messages = prefix.parameters[0].name, state = prefix.parameters[1].name;
    const sessionEqual = importOf(sessionFile, 'node:util', 'isDeepStrictEqual');
    const cursorDeclaration = variable(sessionFactory, 'cursor'), cursor = cursorDeclaration.name;
    need(match(cursorDeclaration.initializer, '0') && cursorDeclaration.parent.flags & ts.NodeFlags.Let, 'SESSION_CURSOR_ORIGIN_UNKNOWN');
    const prefixRoles = { messages, state, cursor, isDeepStrictEqual: sessionEqual };
    need(prefixStatements.length === 8 && ts.isIfStatement(prefixStatements[0])
      && match(prefixStatements[0].expression, '!state', prefixRoles) && !prefixStatements[0].elseStatement
      && ts.isBlock(prefixStatements[0].thenStatement) && prefixStatements[0].thenStatement.statements.length === 2
      && guard(prefixStatements[0].thenStatement.statements[0], "messages.some(m => m.role === 'assistant' || m.role === 'tool')", prefixRoles, sessionStop)
      && ts.isReturnStatement(prefixStatements[0].thenStatement.statements[1])
      && !prefixStatements[0].thenStatement.statements[1].expression, 'FRESH_HISTORY_NOT_EMPTY');
    need(guard(prefixStatements[1], '!isDeepStrictEqual(messages.slice(0, state.initialMessages.length), state.initialMessages)', prefixRoles, sessionStop), 'INITIAL_PREFIX_UNBOUND');
    const preceding = variable(prefix, 'preceding');
    prefixRoles.preceding = preceding.name;
    need(match(preceding.initializer, 'cursor > 0 ? state.turns[cursor - 1]?.request.messages : undefined', prefixRoles)
      && guard(prefixStatements[3], 'preceding?.length && !isDeepStrictEqual(messages.slice(0, preceding.length), preceding)', prefixRoles, sessionStop)
      && guard(prefixStatements[4], 'cursor === state.turns.length && cursor > 0 && !preceding?.length', prefixRoles, sessionStop), 'PRIOR_PREFIX_UNBOUND');
    const assistant = variable(prefix, 'assistantMessages');
    need(match(assistant.initializer, "messages.filter(m => m.role === 'assistant')", prefixRoles)
      && guard(prefixStatements[6], 'assistantMessages.length !== cursor', { ...prefixRoles, assistantMessages: assistant.name }, sessionStop), 'ASSISTANT_COUNT_UNBOUND');
    const responseLoop = prefixStatements[7];
    need(ts.isForStatement(responseLoop) && ts.isBlock(responseLoop.statement) && responseLoop.statement.statements.length === 4, 'ASSISTANT_HISTORY_LOOP_UNKNOWN');
    const indexDeclaration = responseLoop.initializer?.declarations?.[0];
    need(responseLoop.initializer && ts.isVariableDeclarationList(responseLoop.initializer) && responseLoop.initializer.flags & ts.NodeFlags.Let
      && responseLoop.initializer.declarations.length === 1 && indexDeclaration && match(indexDeclaration.initializer, '0')
      && match(responseLoop.condition, 'i < cursor', { i: indexDeclaration.name, cursor })
      && match(responseLoop.incrementor, 'i++', { i: indexDeclaration.name }), 'ASSISTANT_HISTORY_LOOP_UNKNOWN');
    const turn = responseLoop.statement.statements[0].declarationList?.declarations[0];
    const message = responseLoop.statement.statements[1].declarationList?.declarations[0];
    need(turn && match(turn.initializer, 'state.turns[i]', { state, i: indexDeclaration.name }), 'ASSISTANT_TURN_ORIGIN_UNKNOWN');
    need(message && match(message.initializer, 'assistantMessages[i]', { assistantMessages: assistant.name, i: indexDeclaration.name }), 'ASSISTANT_MESSAGE_ORIGIN_UNKNOWN');
    const semantic = one(walk(sessionFile, node => ts.isVariableDeclaration(node) && node.name.text === 'semanticCalls'), 'SEMANTIC_CALL_BINDING_UNKNOWN');
    const responseRoles = { ...prefixRoles, turn: turn?.name, message: message?.name, semanticCalls: semantic.name };
    need(guard(responseLoop.statement.statements[2], "!turn || turn.state !== 'completed' || !message", responseRoles, sessionStop)
      && guard(responseLoop.statement.statements[3], 'message.content !== turn.response.text || !isDeepStrictEqual(semanticCalls(message.toolCalls), semanticCalls(turn.response.toolCalls)) || !isDeepStrictEqual(message.providerContent, turn.response.providerContent)', responseRoles, sessionStop), 'ASSISTANT_RESPONSE_UNBOUND');
    const completeOnce = fn(sessionFactory, 'completeOnce');
    const parser = fn(file('packages/ai-gateway/src/native-agent-bridge.ts'), 'nativeAgentSdkRequest');
    const parsedRequest = completeOnce.body.statements[1]?.declarationList?.declarations[0];
    need(parsedRequest && callOf(parsedRequest.initializer, parser) && ts.isObjectBindingPattern(parsedRequest.name), 'SESSION_REQUEST_NOT_DECODED');
    const parsedMessages = one(parsedRequest.name.elements.filter(node => node.name.text === 'messages'), 'SESSION_MESSAGES_BINDING_UNKNOWN').name;
    const parsedOptions = one(parsedRequest.name.elements.filter(node => node.name.text === 'options'), 'SESSION_OPTIONS_BINDING_UNKNOWN').name;
    const readState = fn(sessionFactory, 'read'), binding = variable(sessionFactory, 'binding').name;
    need(match(parsedRequest.initializer, 'nativeAgentSdkRequest(raw, binding.model)',
      { nativeAgentSdkRequest: parser.name, raw: completeOnce.parameters[0].name, binding }), 'SESSION_REQUEST_NOT_DECODED');
    const stateDeclaration = variable(completeOnce, 'state'), currentState = stateDeclaration.name;
    need(callOf(stateDeclaration.initializer, readState) && completeOnce.body.statements[2]?.declarationList?.declarations[0] === stateDeclaration,
      'SESSION_STATE_ORIGIN_UNKNOWN');
    const historyCalls = walk(completeOnce, node => ts.isCallExpression(node) && same(node.expression, prefix.name));
    need(historyCalls.length === 2 && completeOnce.body.statements[3]?.expression === historyCalls[0]
      && historyCalls.every(call => same(call.arguments[0], parsedMessages) && same(call.arguments[1], currentState)), 'SESSION_PREFIX_CALL_BYPASS');
    const submitHistory = historyCalls[1].parent?.parent;
    need(ts.isBlock(submitHistory) && submitHistory.statements[2]?.expression === historyCalls[1]
      && match(submitHistory.statements[1]?.expression, 'state = read()', { state: currentState, read: readState.name }), 'SESSION_STATE_ORIGIN_UNKNOWN');
    proven.push('session-prefix');
    const started = one(walk(completeOnce, node => ts.isVariableDeclaration(node) && node.name.text === 'started'), 'STARTED_CHECKPOINT_UNKNOWN');
    const completed = one(walk(completeOnce, node => ts.isVariableDeclaration(node) && node.name.text === 'completed'), 'COMPLETED_CHECKPOINT_UNKNOWN');
    // Inspect the effective last turn, never a matching descendant in a decoy.
    // Unknown computed keys/spreads after a selected property may override it.
    const cannotOverride = (expression, name) => {
      expression = unwrap(expression);
      if (ts.isConditionalExpression(expression)) return cannotOverride(expression.whenTrue, name) && cannotOverride(expression.whenFalse, name);
      return ts.isObjectLiteralExpression(expression) && expression.properties.every(node => ts.isSpreadAssignment(node)
        ? cannotOverride(node.expression, name) : (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node))
          && !ts.isComputedPropertyName(node.name) && node.name.text !== name);
    };
    const checkpointProperty = (object, name) => {
      object = unwrap(object);
      need(object && ts.isObjectLiteralExpression(object), 'LATEST_PREFIX_NOT_RETAINED', object);
      need(object.properties.every(node => ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node) || ts.isSpreadAssignment(node)),
        'LATEST_PREFIX_NOT_RETAINED', object);
      const properties = object.properties.filter(node => (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) && node.name?.text === name);
      need(properties.length === 1, 'LATEST_PREFIX_NOT_RETAINED', object);
      const property = properties[0];
      need(!object.properties.slice(object.properties.indexOf(property) + 1).some(node => ts.isSpreadAssignment(node) && !cannotOverride(node.expression, name)
        || node.name && ts.isComputedPropertyName(node.name)), 'LATEST_PREFIX_NOT_RETAINED', property);
      return ts.isShorthandPropertyAssignment(property) ? property.name : property.initializer;
    };
    const startedInitializer = unwrap(started.initializer);
    need(ts.isBinaryExpression(startedInitializer) && startedInitializer.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken,
      'LATEST_PREFIX_NOT_RETAINED', startedInitializer);
    const retry = variable(completeOnce, 'retry'), attempt = variable(completeOnce, 'attempt');
    need(!retry.initializer && retry.parent.flags & ts.NodeFlags.Let
      && match(startedInitializer.left, 'retry?.started', { retry: retry.name })
      && match(attempt.initializer, '{}') && attempt.parent.flags & ts.NodeFlags.Const, 'RETRY_STARTED_ORIGIN_UNKNOWN');
    const assignmentRoot = expression => {
      expression = unwrap(expression);
      while (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) expression = unwrap(expression.expression);
      return expression;
    };
    const assignments = target => walk(completeOnce, node => ts.isBinaryExpression(node)
      && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
      && same(assignmentRoot(node.left), target));
    const retryWrites = assignments(retry.name), attemptWrites = assignments(attempt.name);
    need(retryWrites.length === 1 && attemptWrites.length === 1, 'RETRY_STARTED_ORIGIN_UNKNOWN');
    const retryWrite = retryWrites[0], rejectionWrite = attemptWrites[0];
    need(retryWrite.operatorToken.kind === ts.SyntaxKind.EqualsToken && same(retryWrite.left, retry.name)
      && match(checkpointProperty(retryWrite.right, 'started'), 'attempt.rejection.started', { attempt: attempt.name })
      && rejectionWrite.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && match(rejectionWrite.left, 'attempt.rejection', { attempt: attempt.name }), 'RETRY_STARTED_ORIGIN_UNKNOWN');
    let rejectionCatch = rejectionWrite.parent;
    while (rejectionCatch && !ts.isCatchClause(rejectionCatch)) rejectionCatch = rejectionCatch.parent;
    need(rejectionCatch?.variableDeclaration
      && match(rejectionWrite.right, '{ started, error }', { started: started.name, error: rejectionCatch.variableDeclaration.name }), 'RETRY_STARTED_ORIGIN_UNKNOWN');
    const publishCalls = walk(completeOnce, node => ts.isCallExpression(node)
      && match(node.expression, 'input.store.publish', { input: sessionFactory.parameters[0].name }));
    need(publishCalls.length === 1 && same(publishCalls[0].arguments[0], started.name)
      && enclosing(rejectionWrite) === publishCalls[0].arguments[1], 'RETRY_STARTED_ORIGIN_UNKNOWN');
    const latestRequest = object => {
      const turns = unwrap(checkpointProperty(object, 'turns'));
      need(ts.isArrayLiteralExpression(turns) && turns.elements.length === 2 && ts.isSpreadElement(turns.elements[0]), 'LATEST_PREFIX_NOT_RETAINED', turns);
      return checkpointProperty(turns.elements[1], 'request');
    };
    for (const object of [startedInitializer.right, completed.initializer]) {
      const request = latestRequest(object);
      need(same(checkpointProperty(request, 'messages'), parsedMessages) && same(checkpointProperty(request, 'options'), parsedOptions), 'LATEST_PREFIX_NOT_RETAINED', request);
    }
    const finalCalls = walk(completeOnce, node => ts.isCallExpression(node) && match(node.expression, 'input.store.complete'));
    need(finalCalls.length === 1 && same(finalCalls[0].arguments[0], started.name) && same(finalCalls[0].arguments[1], completed.name), 'PAID_CHECKPOINT_ORIGIN_UNKNOWN');
    proven.push('session-checkpoint-prefix');

    const verifiedBase = one(walk(handler, node => ts.isVariableDeclaration(node) && node.name.text === 'readVerifiedVideoPlan'), 'BASE_READER_MISSING');
    const baseReader = unwrap(verifiedBase.initializer);
    need(ts.isArrowFunction(baseReader) && replayUses[0].getStart() > baseReader.getStart() && replayUses[0].end < baseReader.end, 'BASE_REPLAY_ORIGIN_UNKNOWN');
    const proof = one(walk(baseReader, node => ts.isVariableDeclaration(node) && node.name.text === 'proof'), 'BASE_PROOF_UNKNOWN');
    const videoModule = file('packages/domain/src/assets/video.ts'), requireBase = fn(videoModule, 'requireNativeVideoStoryboard');
    need(callOf(proof.initializer, requireBase)
      && match(objectProperty(replayUses[0].arguments[0], 'task'), 'proof.task', { proof: proof.name }), 'BASE_TASK_NOT_VERIFIED');
    const base = one(walk(enclosing(liveUses[0]), node => ts.isVariableDeclaration(node) && node.name.text === 'base'
      && node.getStart() < liveUses[0].getStart() && enclosing(node) === enclosing(liveUses[0])), 'LIVE_BASE_UNKNOWN');
    const conditional = unwrap(base.initializer);
    need(ts.isConditionalExpression(conditional) && ts.isIdentifier(conditional.whenFalse) && conditional.whenFalse.text === 'undefined'
      && ts.isCallExpression(unwrap(conditional.whenTrue)) && same(unwrap(conditional.whenTrue).expression, verifiedBase.name)
      && same(objectProperty(liveUses[0].arguments[0], 'base'), base.name), 'LIVE_BASE_NOT_RECONSTRUCTED');
    const replaySaved = variable(replay, 'saved'), replayStore = variable(replay, 'store');
    need(callOf(replayStore.initializer, storeFactory) && match(replaySaved.initializer, 'store.read()', { store: replayStore.name }), 'REPLAY_CP_ORIGIN_UNKNOWN');
    const replayFactory = materializerUses.find(call => enclosing(call) === replay);
    need(same(objectProperty(replayFactory.arguments[0], 'savedState'), replaySaved.name), 'REPLAY_SELECTED_SAVED_STATE');
    const rebuilt = variable(replay, 'rebuilt');
    const finalCall = unwrap(rebuilt.initializer);
    need(ts.isCallExpression(finalCall) && ts.isPropertyAccessExpression(finalCall.expression)
      && finalCall.expression.name.text === 'finish' && finalCall.expression.expression === replayFactory
      && match(finalCall.arguments[0], 'last.request.messages') && match(finalCall.arguments[1], 'last.response.text'), 'REPLAY_NOT_COMPLETED_CP_FINISH');
    const replayEqual = importOf(illustration, 'node:util', 'isDeepStrictEqual');
    const comparison = one(walk(replay, node => ts.isIfStatement(node) && match(node.expression,
      "!isDeepStrictEqual(rebuilt.document, planned.document) || !isDeepStrictEqual(rebuilt.prompts, stored.illustrationPrompts) || !isDeepStrictEqual(rebuilt.designSkills, planned.designSkills) || rebuilt.planToolCallId !== native.planToolCallId || rebuilt.reviewToolCallId !== native.reviewToolCallId || rebuilt.review.decision !== 'accepted'",
      { rebuilt: rebuilt.name, isDeepStrictEqual: replayEqual })), 'REPLAY_WHOLE_ARTIFACT_UNBOUND');
    need(guard(comparison, comparison.expression.getText(), {}, fn(illustration, 'stopped')), 'REPLAY_COMPARISON_NOT_TERMINAL');
    proven.push('verified-base');

    // Conditional capability graph only. Receiver value identity, not the shared
    // structural interface's method symbol, determines which store is used.
    const journalFactory = fn(file('apps/agent-worker/src/native-agent/journal-task-store.ts'), 'createJournalNativeTaskStore');
    const storeCalls = uses(storeFactory), journalCalls = uses(journalFactory);
    const sessionCalls = uses(sessionFactory), hostCalls = uses(hostFactory);
    const identityObjects = new Map(), identityCopies = new Set(), identityPasses = new Set();
    const constResult = call => {
      let expression = call;
      while (expression.parent && (ts.isAwaitExpression(expression.parent) || ts.isParenthesizedExpression(expression.parent)
        || ts.isAsExpression(expression.parent) || ts.isNonNullExpression(expression.parent))) expression = expression.parent;
      const declaration = expression.parent;
      need(ts.isVariableDeclaration(declaration) && declaration.initializer === expression && ts.isIdentifier(declaration.name)
        && declaration.parent.flags & ts.NodeFlags.Const, 'STORE_FACTORY_RESULT_UNKNOWN', call);
      return declaration;
    };
    // Only actual immutable local objects and literal conditional spreads are
    // supported. Unknown late members cannot silently replace a capability.
    const member = (expression, key, seen = new Set()) => {
      expression = unwrap(expression);
      need(expression && !seen.has(expression), 'STORE_EFFECTIVE_MEMBER_UNKNOWN', expression);
      seen = new Set(seen).add(expression);
      if (ts.isIdentifier(expression)) {
        const declarations = symbol(expression)?.declarations ?? [];
        const declaration = declarations.length === 1 && declarations[0];
        need(declaration && ts.isVariableDeclaration(declaration) && declaration.initializer
          && declaration.parent.flags & ts.NodeFlags.Const, 'STORE_EFFECTIVE_MEMBER_UNKNOWN', expression);
        const initial = unwrap(declaration.initializer);
        need(ts.isObjectLiteralExpression(initial) || ts.isConditionalExpression(initial), 'STORE_EFFECTIVE_MEMBER_MUTATION_UNKNOWN', expression);
        identityObjects.set(symbol(declaration.name), declaration);
        return member(declaration.initializer, key, seen);
      }
      if (ts.isConditionalExpression(expression)) {
        const left = member(expression.whenTrue, key, seen), right = member(expression.whenFalse, key, seen);
        need(!left && !right, 'STORE_EFFECTIVE_MEMBER_UNKNOWN', expression);
        return undefined;
      }
      need(ts.isObjectLiteralExpression(expression), 'STORE_EFFECTIVE_MEMBER_UNKNOWN', expression);
      for (const property of [...expression.properties].reverse()) {
        if (ts.isSpreadAssignment(property)) {
          identityCopies.add(unwrap(property.expression));
          const value = member(property.expression, key, seen);
          if (value) return value;
        } else {
          need(property.name && !ts.isComputedPropertyName(property.name)
            && (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)), 'STORE_EFFECTIVE_MEMBER_UNKNOWN', property);
          if (property.name.text === key) return ts.isShorthandPropertyAssignment(property) ? property.name : property.initializer;
        }
      }
      return undefined;
    };
    const resolvedValue = expression => {
      expression = unwrap(expression);
      if (ts.isIdentifier(expression)) {
        const declarations = symbol(expression)?.declarations;
        if (declarations?.length === 1 && ts.isVariableDeclaration(declarations[0]) && declarations[0].initializer
          && declarations[0].parent.flags & ts.NodeFlags.Const) {
          const initial = unwrap(declarations[0].initializer);
          if (ts.isObjectLiteralExpression(initial)) identityObjects.set(symbol(declarations[0].name), declarations[0]);
          return initial;
        }
      } else if (ts.isPropertyAccessExpression(expression)) {
        const base = resolvedValue(expression.expression);
        if (ts.isObjectLiteralExpression(base)) return member(base, expression.name.text) ?? expression;
      }
      return expression;
    };
    const sameValue = (left, right, depth = 0) => {
      left = unwrap(left); right = unwrap(right);
      if (!left || !right || depth > 16) return false;
      if (left === right || ts.isIdentifier(left) && ts.isIdentifier(right) && same(left, right)) return true;
      if (ts.isPropertyAccessExpression(left) && ts.isPropertyAccessExpression(right) && left.name.text === right.name.text
        && sameValue(left.expression, right.expression, depth + 1)) return true;
      const a = resolvedValue(left), b = resolvedValue(right);
      return (a !== left || b !== right) ? sameValue(a, b, depth + 1)
        : ts.isLiteralExpression(left) && ts.isLiteralExpression(right) && left.kind === right.kind && left.text === right.text;
    };
    const executionReader = fn(file('packages/domain/src/agent/native-agent-execution.ts'), 'readNativeAgentExecution');
    const instances = [], byStore = new Map(), bySession = new Map(), allowedValues = new Set();
    for (const [factory, calls] of [[storeFactory, storeCalls], [journalFactory, journalCalls]]) for (const call of calls) {
      const input = unwrap(call.arguments[0]);
      need(input && ts.isObjectLiteralExpression(input), 'EXTRA_UNBOUND_FACTORY_CALLER', call);
      const declaration = constResult(call), execution = member(input, 'execution');
      const taskId = member(input, 'taskId'), attemptId = member(input, 'executionAttempt');
      const markerCall = definition(execution);
      need(taskId && ts.isPropertyAccessExpression(taskId) && taskId.name.text === 'id' && attemptId
        && callOf(markerCall, executionReader) && markerCall.arguments.length === 1
        && ts.isPropertyAccessExpression(markerCall.arguments[0]) && markerCall.arguments[0].name.text === 'result'
        && sameValue(markerCall.arguments[0].expression, taskId.expression), 'STORE_INPUT_IDENTITY_UNKNOWN', call);
      const graph = { id: instances.length, factory: factory.name.text, at: location(call), runner: location(enclosing(call)),
        identity: { taskId: { text: taskId.getText(), ...location(taskId) }, executionAttempt: { text: attemptId.getText(), ...location(attemptId) },
          execution: location(markerCall) }, localReads: [], sessions: [], hosts: [] };
      const instance = { declaration, call, factory, taskId, attemptId, execution, graph };
      instances.push(instance); byStore.set(symbol(declaration.name), instance); storeGraph.instances.push(graph);
      if (!sameValue(attemptId, ts.factory.createPropertyAccessExpression(taskId.expression, 'executionAttempt')))
        storeGraph.pending.push({ reason: 'TASK_ATTEMPT_EQUIVALENCE_UNPROVEN', at: location(attemptId), store: graph.id });
    }
    need(storeCalls.length === 5 && journalCalls.length === 1, 'STORE_FACTORY_INSTANCE_COUNT_UNKNOWN');
    for (const call of sessionCalls) {
      const input = call.arguments[0], store = member(input, 'store');
      const instance = store && ts.isIdentifier(unwrap(store)) && byStore.get(symbol(unwrap(store)));
      need(instance, 'STORE_SUBSTITUTE_INSTANCE_UNKNOWN', store ?? call);
      const declaration = constResult(call), binding = member(input, 'binding');
      identityPasses.add(unwrap(binding));
      need(binding && sameValue(member(binding, 'taskId'), instance.taskId), 'STORE_SESSION_IDENTITY_UNKNOWN', call);
      const source = {};
      for (const key of ['sourceKind', 'artifactId', 'documentSha256', 'sourceMapHash', 'imageReview', 'journalText']) {
        const value = member(binding, key); if (value) source[key] = { text: value.getText(), ...location(value) };
      }
      const row = { instance: instance.graph.id, at: location(call), binding: location(binding), source };
      instance.graph.sessions.push(row.at); storeGraph.sessions.push(row); allowedValues.add(store);
      bySession.set(symbol(declaration.name), { instance, declaration, binding, passed: new Set() });
      for (const key of ['runtimeId', 'skillCatalogueId', 'model']) if (!sameValue(member(binding, key),
        ts.factory.createPropertyAccessExpression(instance.execution, key))) {
        storeGraph.pending.push({ reason: 'BINDING_EXECUTION_EQUIVALENCE_UNPROVEN', field: key, at: location(member(binding, key)), store: instance.graph.id });
      }
    }
    for (const call of hostCalls) {
      const input = call.arguments[0], store = member(input, 'store'), sessionValue = member(input, 'session');
      const instance = store && ts.isIdentifier(unwrap(store)) && byStore.get(symbol(unwrap(store)));
      const linked = sessionValue && ts.isIdentifier(unwrap(sessionValue)) && bySession.get(symbol(unwrap(sessionValue)));
      need(instance && linked?.instance === instance, 'STORE_SUBSTITUTE_INSTANCE_UNKNOWN', store ?? call);
      const config = member(input, 'config');
      identityPasses.add(unwrap(config));
      need(sameValue(member(input, 'executionAttempt'), instance.attemptId)
        && sameValue(member(config, 'taskId'), instance.taskId), 'STORE_HOST_IDENTITY_UNKNOWN', call);
      for (const key of ['runtimeId', 'skillCatalogueId', 'model']) need(sameValue(member(config, key), member(linked.binding, key)), 'STORE_HOST_IDENTITY_UNKNOWN', call);
      const row = { instance: instance.graph.id, at: location(call), session: location(linked.declaration) };
      instance.graph.hosts.push(row.at); storeGraph.hosts.push(row); allowedValues.add(store); linked.passed.add(sessionValue);
    }
    const valueReferences = name => (identifiers.get(name.text) ?? []).filter(node => node !== name && same(node, name));
    // Const protects the local binding, not its object. These are finite actual
    // receiver/value uses, deliberately refusing aliases and opaque mutators.
    const identityUse = (use, allowCopy = false) => {
      const transparent = value => {
        while (value.parent && (ts.isParenthesizedExpression(value.parent) || ts.isAsExpression(value.parent)
          || ts.isNonNullExpression(value.parent)) && value.parent.expression === value) value = value.parent;
        return value;
      };
      let value = transparent(use), propertyRead = false;
      while ((ts.isPropertyAccessExpression(value.parent) || ts.isElementAccessExpression(value.parent)) && value.parent.expression === value) {
        propertyRead = true; value = transparent(value.parent);
      }
      const contains = (outer, inner) => outer.pos <= inner.pos && outer.end >= inner.end;
      for (let node = value; node.parent; node = node.parent) {
        const parent = node.parent;
        const writes = ts.isBinaryExpression(parent) && parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
          && parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment && contains(parent.left, value)
          || ts.isDeleteExpression(parent)
          || (ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent))
            && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(parent.operator)
          || (ts.isForOfStatement(parent) || ts.isForInStatement(parent)) && contains(parent.initializer, value);
        need(!writes, 'STORE_EFFECTIVE_MEMBER_MUTATION_UNKNOWN', parent);
        if (ts.isStatement(parent) || ts.isFunctionLike(parent)) break;
      }
      // A property being read is not permission to invoke it as a mutating method.
      need(!(ts.isCallExpression(value.parent) && value.parent.expression === value), 'STORE_EFFECTIVE_MEMBER_MUTATION_UNKNOWN', value);
      if (propertyRead) return;
      if (identityPasses.has(use) || identityCopies.has(use) || allowCopy && ts.isSpreadAssignment(value.parent)) return;
      const call = value.parent;
      if (ts.isCallExpression(call) && call.arguments.includes(value)) {
        const source = use.getSourceFile();
        const imports = source.statements.filter(ts.isImportDeclaration).filter(node => node.moduleSpecifier.text === 'node:util'
          && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings))
          .flatMap(node => node.importClause.namedBindings.elements.filter(item => (item.propertyName ?? item.name).text === 'isDeepStrictEqual'));
        if (imports.length === 1 && same(call.expression, imports[0].name)) return;
      }
      fail('STORE_EFFECTIVE_MEMBER_MUTATION_UNKNOWN', use);
    };
    const sessionInput = sessionFactory.parameters[0].name;
    const clonedBinding = unwrap(variable(sessionFactory, 'binding').initializer);
    const bindingInputs = walk(sessionFactory, node => ts.isPropertyAccessExpression(node) && node.name.text === 'binding' && same(node.expression, sessionInput));
    need(ts.isCallExpression(clonedBinding) && match(clonedBinding, 'structuredClone(input.binding)', { input: sessionInput })
      && !symbol(clonedBinding.expression)?.declarations?.some(node => files.includes(node.getSourceFile()))
      && bindingInputs.length === 1 && clonedBinding.arguments[0] === bindingInputs[0], 'STORE_EFFECTIVE_MEMBER_MUTATION_UNKNOWN', clonedBinding);
    for (const value of walk(hostFactory, node => ts.isPropertyAccessExpression(node) && node.name.text === 'config' && same(node.expression, hostInput)))
      identityUse(value, true);
    for (const declaration of identityObjects.values()) {
      const uses = valueReferences(declaration.name);
      for (const use of uses) identityUse(use);
      storeGraph.identityObjects.push({ at: location(declaration), uses: uses.map(location), status: 'readonly-local-uses' });
    }
    for (const instance of instances) {
      for (const use of valueReferences(instance.declaration.name)) {
        if (allowedValues.has(use)) continue;
        const access = use.parent;
        need(ts.isPropertyAccessExpression(access) && access.expression === use && !access.questionDotToken, 'STORE_INSTANCE_ESCAPE_UNKNOWN', use);
        const call = access.parent;
        need(ts.isCallExpression(call) && call.expression === access && !call.questionDotToken, 'STORE_METHOD_ESCAPE_UNKNOWN', access);
        need(access.name.text === 'read' && call.arguments.length === 0, 'STORE_UNEXPECTED_WRITER_UNKNOWN', call);
        need(ts.isAwaitExpression(call.parent), 'STORE_METHOD_NOT_AWAITED_UNKNOWN', call);
        need(enclosing(call) === enclosing(instance.call), 'STORE_UNKNOWN_CONSUMER', call);
        instance.graph.localReads.push(location(call));
      }
      need(instance.graph.sessions.length > 0 && instance.graph.hosts.length === instance.graph.sessions.length
        || same(instance.declaration.name, replayStore.name) && instance.graph.localReads.length === 1,
      'STORE_UNKNOWN_CONSUMER', instance.call);
    }
    for (const linked of bySession.values()) {
      need(linked.passed.size === 1, 'STORE_SESSION_ESCAPE_UNKNOWN', linked.declaration);
      for (const use of valueReferences(linked.declaration.name)) need(linked.passed.has(use), 'STORE_SESSION_ESCAPE_UNKNOWN', use);
    }
    for (const [factory, consumer] of [[sessionFactory, 'session'], [hostFactory, 'host']]) {
      const input = factory.parameters[0].name;
      for (const use of valueReferences(input)) need(ts.isPropertyAccessExpression(use.parent) && use.parent.expression === use,
        'STORE_CAPABILITY_INPUT_ESCAPE_UNKNOWN', use);
      const values = walk(factory, node => ts.isPropertyAccessExpression(node) && node.name.text === 'store' && same(node.expression, input));
      const methods = [];
      for (const value of values) {
        const access = value.parent, call = access?.parent;
        need(access && ts.isPropertyAccessExpression(access) && access.expression === value && !access.questionDotToken
          && call && ts.isCallExpression(call) && call.expression === access && !call.questionDotToken, 'STORE_METHOD_ESCAPE_UNKNOWN', value);
        need(ts.isAwaitExpression(call.parent), 'STORE_METHOD_NOT_AWAITED_UNKNOWN', call);
        const method = access.name.text;
        if (consumer === 'host') need(method === 'read' && call.arguments.length === 0, 'STORE_UNEXPECTED_WRITER_UNKNOWN', call);
        else if (method === 'read') need(call.arguments.length === 0 && enclosing(call) === readState, 'STORE_SHARED_SUPPLIER_UNKNOWN', call);
        else if (method === 'compareAndSet') need(call.arguments.length === 2 && same(call.arguments[0], currentState)
          && same(call.arguments[1], started.name), 'STORE_SHARED_SUPPLIER_UNKNOWN', call);
        else if (method === 'publish') need(call === publishCalls[0], 'STORE_SHARED_SUPPLIER_UNKNOWN', call);
        else if (method === 'complete') need(call === finalCalls[0], 'STORE_SHARED_SUPPLIER_UNKNOWN', call);
        else fail('STORE_UNEXPECTED_WRITER_UNKNOWN', call);
        methods.push(method); storeGraph.shared.push({ consumer, method, ...location(call) });
      }
      need(consumer === 'session' ? methods.length === 4 && new Set(methods).size === 4 : methods.length === 2,
        'STORE_UNEXPECTED_WRITER_UNKNOWN', factory);
    }
    for (const factory of [storeFactory, journalFactory]) {
      const returned = one(walk(factory, node => ts.isReturnStatement(node) && enclosing(node) === factory), 'STORE_RETURN_UNKNOWN');
      const object = unwrap(returned.expression), input = factory.parameters[0].name;
      need(ts.isObjectLiteralExpression(object) && object.properties.length === 4, 'STORE_RETURN_UNKNOWN', returned);
      const methods = new Map(object.properties.map(property => [property.name?.text, property]));
      need(methods.size === 4 && ['read', 'compareAndSet', 'complete', 'publish'].every(key => methods.has(key)), 'STORE_RETURN_UNKNOWN', returned);
      const update = fn(factory, factory === storeFactory ? 'update' : 'save'), wrappers = [];
      for (const [key, paid] of [['compareAndSet', false], ['complete', true]]) {
        const arrow = unwrap(methods.get(key).initializer);
        need(ts.isArrowFunction(arrow) && arrow.parameters.length === 2
          && match(arrow.body, `update(previous, state, ${paid})`, { update: update.name, previous: arrow.parameters[0].name, state: arrow.parameters[1].name }),
        'STORE_UPDATE_SUPPLIER_UNKNOWN', methods.get(key));
        wrappers.push(unwrap(arrow.body));
      }
      const updateCalls = uses(update);
      need(updateCalls.length === 2 && updateCalls.every(call => wrappers.includes(call)), 'STORE_UPDATE_SUPPLIER_UNKNOWN', update);
      const marker = fn(factory, factory === storeFactory ? 'marker' : 'current'), task = variable(marker, 'task');
      const taskLookup = unwrap(task.initializer);
      need(ts.isAwaitExpression(task.initializer) && ts.isCallExpression(taskLookup) && match(taskLookup.expression, 'db.agentTask.findUnique', { db: marker.parameters[0].name })
        && match(member(member(taskLookup.arguments[0], 'where'), 'id'), 'input.taskId', { input }), 'STORE_MARKER_IDENTITY_UNKNOWN', marker);
      const execution = variable(marker, factory === storeFactory ? 'execution' : 'marker');
      need(callOf(execution.initializer, executionReader) && match(unwrap(execution.initializer).arguments[0], 'task?.result', { task: task.name }),
        'STORE_MARKER_IDENTITY_UNKNOWN', execution);
      const readMethod = methods.get('read'), publishMethod = methods.get('publish');
      need(ts.isMethodDeclaration(readMethod) && ts.isMethodDeclaration(publishMethod)
        && publishMethod.parameters.length === 2, 'STORE_RETURN_SUPPLIER_UNKNOWN', returned);
      const firstRead = readMethod.body?.statements[0]?.declarationList?.declarations[0];
      const firstPublish = publishMethod.body?.statements[0]?.declarationList?.declarations[0];
      const expected = fn(factory, factory === storeFactory ? 'expected' : 'receipt');
      need(firstPublish && match(firstPublish.initializer, 'expected(started)',
        { expected: expected.name, started: publishMethod.parameters[0].name }), 'STORE_RETURN_SUPPLIER_UNKNOWN', publishMethod);
      if (factory === storeFactory) {
        const checkpoint = unwrap(firstRead?.initializer);
        let receiver = checkpoint && ts.isPropertyAccessExpression(checkpoint) ? checkpoint.expression : undefined;
        while (receiver && ts.isParenthesizedExpression(receiver)) receiver = receiver.expression;
        need(receiver && ts.isAwaitExpression(receiver)
          && match(checkpoint, 'marker(input.prisma).checkpoint', { marker: marker.name, input }), 'STORE_RETURN_SUPPLIER_UNKNOWN', readMethod);
      } else need(firstRead && ts.isAwaitExpression(firstRead.initializer) && callOf(firstRead.initializer, marker)
        && match(unwrap(firstRead.initializer).arguments[0], 'input.prisma', { input }), 'STORE_RETURN_SUPPLIER_UNKNOWN', readMethod);
      const row = { factory: factory.name.text, returned: location(returned), methods: [...methods].map(([method, node]) => ({ method, ...location(node) })),
        update: location(update), marker: location(marker) };
      if (factory === storeFactory) {
        const persist = fn(factory, 'persist'), prepared = variable(update, 'prepared');
        need(ts.isAwaitExpression(prepared.initializer) && callOf(prepared.initializer, persist) && same(unwrap(prepared.initializer).arguments[0], update.parameters[1].name)
          && uses(persist).length === 1, 'STORE_PERSIST_SUPPLIER_UNKNOWN', prepared);
        const compare = fn(file('packages/domain/src/agent/native-agent-execution.ts'), 'compareNativeAgentCheckpoint');
        const calls = walk(update, node => ts.isCallExpression(node) && same(node.expression, compare.name));
        need(calls.length === 1, 'STORE_CAS_SUPPLIER_UNKNOWN', update);
        for (const key of ['taskId', 'executionAttempt', 'expectedExecution']) need(match(member(calls[0].arguments[1], key),
          `input.${key === 'expectedExecution' ? 'execution' : key}`, { input }), 'STORE_CAS_SUPPLIER_UNKNOWN', calls[0]);
        row.persist = location(persist); row.cas = location(calls[0]);

        // Join the real private serializer/read membership to the external CAS.
        // Internal byte/selected-read semantics remain a COMPLETE-module equality
        // premise for the real future pair, never a supplied equality boolean.
        const directVariable = (block, name) => one(block.statements.filter(ts.isVariableStatement)
          .flatMap(statement => statement.declarationList.declarations).filter(node => ts.isIdentifier(node.name) && node.name.text === name), 'PRIVATE_LOCAL_ORIGIN_UNKNOWN');
        const known = variable(factory, 'known'), hashFunction = one(walk(storeFile, node => ts.isVariableDeclaration(node)
          && node.name.text === 'sha'), 'PRIVATE_HASH_ORIGIN_UNKNOWN');
        const hashArrow = unwrap(hashFunction.initializer), createHash = importOf(storeFile, 'node:crypto', 'createHash');
        need(known.parent.flags & ts.NodeFlags.Const && ts.isNewExpression(known.initializer) && known.initializer.expression.text === 'Map'
          && (known.initializer.arguments?.length ?? 0) === 0
          && !symbol(known.initializer.expression)?.declarations?.some(node => files.includes(node.getSourceFile()))
          && hashFunction.parent.flags & ts.NodeFlags.Const && ts.isArrowFunction(hashArrow) && hashArrow.parameters.length === 1 && !hashArrow.modifiers?.length
          && match(hashArrow.body, "createHash('sha256').update(bytes).digest('hex')", { createHash, bytes: hashArrow.parameters[0].name }), 'PRIVATE_HASH_ORIGIN_UNKNOWN', known);
        const mapCalls = valueReferences(known.name).map(use => {
          const access = use.parent, call = access?.parent;
          need(ts.isPropertyAccessExpression(access) && access.expression === use && !access.questionDotToken
            && ts.isCallExpression(call) && call.expression === access && !call.questionDotToken
            && ['get', 'set'].includes(access.name.text), 'PRIVATE_KNOWN_USE_UNKNOWN', use);
          return { method: access.name.text, call };
        });
        const gets = mapCalls.filter(item => item.method === 'get').map(item => item.call);
        const sets = mapCalls.filter(item => item.method === 'set').map(item => item.call);
        need(gets.length === 1 && sets.length === 2, 'PRIVATE_KNOWN_USE_UNKNOWN', known);
        const stop = fn(storeFile, 'blocked'), expectedState = expected.parameters[0].name;
        need(stop.body.statements.length === 1 && ts.isThrowStatement(stop.body.statements[0]), 'PRIVATE_EXPECTED_MEMBERSHIP_UNKNOWN', stop);
        const expectedBody = expected.body.statements, expectedReference = directVariable(expected.body, 'reference');
        need(expectedBody.length === 4 && ts.isIfStatement(expectedBody[0]) && !expectedBody[0].elseStatement
          && match(expectedBody[0].expression, '!state', { state: expectedState })
          && ts.isReturnStatement(expectedBody[0].thenStatement) && match(expectedBody[0].thenStatement.expression, 'undefined')
          && unwrap(expectedReference.initializer) === gets[0]
          && match(expectedReference.initializer, 'known.get(sha(Buffer.from(JSON.stringify(state))))',
            { known: known.name, sha: hashFunction.name, state: expectedState })
          && guard(expectedBody[2], '!reference', { reference: expectedReference.name }, stop)
          && ts.isReturnStatement(expectedBody[3]) && same(expectedBody[3].expression, expectedReference.name), 'PRIVATE_EXPECTED_MEMBERSHIP_UNKNOWN', expected);
        const bytes = directVariable(persist.body, 'bytes'), hash = directVariable(persist.body, 'hash');
        const key = directVariable(persist.body, 'objectKey'), reference = directVariable(persist.body, 'reference');
        const turn = directVariable(persist.body, 'turn'), binding = directVariable(persist.body, 'binding');
        const persistState = persist.parameters[0].name;
        need(match(bytes.initializer, 'Buffer.from(JSON.stringify(state))', { state: persistState })
          && match(hash.initializer, 'sha(bytes)', { sha: hashFunction.name, bytes: bytes.name })
          && match(key.initializer, '`derived/native-agent/${hash}.json`', { hash: hash.name })
          && match(turn.initializer, 'state.turns.at(-1)', { state: persistState })
          && match(binding.initializer, 'state.binding', { state: persistState }), 'PRIVATE_SERIALIZER_ORIGIN_UNKNOWN', persist);
        const referenceRoles = { input, objectKey: key.name, hash: hash.name, bytes: bytes.name, state: persistState, turn: turn.name };
        for (const [name, shape] of [['taskId', 'input.taskId'], ['objectKey', 'objectKey'], ['serializedSha256', 'hash'], ['size', 'bytes.length'],
          ['executionAttempt', 'input.executionAttempt'], ['turnCount', 'state.turns.length'], ['state', 'turn.state'], ['target', 'turn.target']])
          need(match(member(reference.initializer, name), shape, referenceRoles), 'PRIVATE_SERIALIZER_ORIGIN_UNKNOWN', reference);
        const persistReturn = one(walk(persist, node => ts.isReturnStatement(node) && enclosing(node) === persist), 'PRIVATE_SERIALIZER_RETURN_UNKNOWN');
        need(same(member(persistReturn.expression, 'reference'), reference.name) && same(member(persistReturn.expression, 'bytes'), bytes.name), 'PRIVATE_SERIALIZER_RETURN_UNKNOWN', persistReturn);

        const updateBody = update.body.statements, attempt = updateBody[2];
        const old = directVariable(update.body, 'old'), next = directVariable(update.body, 'next');
        const updateSet = one(sets.filter(call => enclosing(call) === update), 'PRIVATE_KNOWN_REGISTRATION_ORDER_UNKNOWN');
        const readSet = one(sets.filter(call => enclosing(call) === readMethod), 'PRIVATE_KNOWN_REGISTRATION_ORDER_UNKNOWN');
        need(updateBody.length === 4 && ts.isTryStatement(attempt) && !attempt.finallyBlock && attempt.catchClause
          && updateBody[3]?.expression === updateSet && !next.initializer && next.parent.flags & ts.NodeFlags.Let,
        'PRIVATE_KNOWN_REGISTRATION_ORDER_UNKNOWN', update);
        need(match(old.initializer, 'expected(previous)', { expected: expected.name, previous: update.parameters[0].name }), 'PRIVATE_EXPECTED_ORIGIN_UNKNOWN', old);
        const tryBody = attempt.tryBlock.statements, catchBody = attempt.catchClause.block.statements;
        const preparedReference = directVariable(attempt.tryBlock, 'preparedReference'), head = directVariable(attempt.tryBlock, 'object');
        need(tryBody.length === 7 && tryBody[0].declarationList?.declarations[0] === prepared
          && match(tryBody[1]?.expression, 'next = prepared.reference', { next: next.name, prepared: prepared.name })
          && ts.isAwaitExpression(head.initializer) && match(head.initializer, 'input.storage.headObject(next.objectKey)', { input, next: next.name })
          && guard(tryBody[3], 'object && object.size !== prepared.bytes.length', { object: head.name, prepared: prepared.name }, stop)
          && same(preparedReference.initializer, next.name), 'PRIVATE_PREPARED_REFERENCE_UNKNOWN', attempt);
        const putIf = tryBody[4], put = putIf?.thenStatement?.expression;
        need(ts.isIfStatement(putIf) && !putIf.elseStatement && match(putIf.expression, '!object', { object: head.name })
          && put && ts.isAwaitExpression(put) && match(put,
            "input.storage.putObject(next.objectKey, prepared.bytes, { contentType: 'application/json', sha256: next.serializedSha256 })",
            { input, next: next.name, prepared: prepared.name }), 'PRIVATE_UPLOAD_ORIGIN_UNKNOWN', putIf);
        const transaction = tryBody[6]?.expression;
        need(transaction && ts.isAwaitExpression(transaction) && ts.isCallExpression(transaction.expression)
          && match(transaction.expression.expression, 'input.prisma.$transaction', { input }), 'PRIVATE_UPDATE_TRANSACTION_UNKNOWN', attempt);
        const txCall = transaction.expression, callback = txCall.arguments[0];
        need(ts.isArrowFunction(callback) && callback.modifiers?.some(node => node.kind === ts.SyntaxKind.AsyncKeyword)
          && callback.parameters.length === 1 && ts.isBlock(callback.body)
          && callback.body.statements.length === 3 && ts.isAwaitExpression(callback.body.statements[0]?.expression)
          && match(callback.body.statements[0].expression, 'lockTrashReferences(tx)',
            { lockTrashReferences: importOf(storeFile, '@openscience/domain', 'lockTrashReferences'), tx: callback.parameters[0].name })
          && ts.isIfStatement(callback.body.statements[1]) && !callback.body.statements[1].elseStatement
          && match(callback.body.statements[1].expression, '!paidCompletion', { paidCompletion: update.parameters[2].name })
          && ts.isAwaitExpression(callback.body.statements[1].thenStatement?.expression)
          && match(callback.body.statements[1].thenStatement.expression, 'input.authorize(tx)', { input, tx: callback.parameters[0].name })
          && callback.body.statements[2]?.expression?.expression === calls[0]
          && ts.isAwaitExpression(callback.body.statements[2].expression), 'PRIVATE_UPDATE_TRANSACTION_UNKNOWN', txCall);
        const casObject = unwrap(calls[0].arguments[1]);
        need(same(calls[0].arguments[0], callback.parameters[0].name) && ts.isObjectLiteralExpression(casObject)
          && casObject.properties.length === 6 && casObject.properties.every(property => (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property))
            && !ts.isComputedPropertyName(property.name)), 'PRIVATE_CAS_REFERENCE_UNKNOWN', calls[0]);
        for (const [name, shape] of [['taskId', 'input.taskId'], ['executionAttempt', 'input.executionAttempt'], ['expected', 'old'],
          ['next', 'preparedReference'], ['paidCompletion', 'paidCompletion'], ['expectedExecution', 'input.execution']])
          need(match(member(casObject, name), shape, { input, old: old.name, preparedReference: preparedReference.name,
            paidCompletion: update.parameters[2].name }), 'PRIVATE_CAS_REFERENCE_UNKNOWN', calls[0]);
        const failedTask = directVariable(attempt.catchClause.block, 'task'), catchError = attempt.catchClause.variableDeclaration?.name;
        const cleanup = catchBody[1], cleanupCall = cleanup?.thenStatement?.expression;
        need(catchBody.length === 3 && catchError && ts.isAwaitExpression(failedTask.initializer)
          && match(failedTask.initializer, 'input.prisma.agentTask.findUnique({ where: { id: input.taskId } })', { input })
          && ts.isIfStatement(cleanup) && !cleanup.elseStatement && match(cleanup.expression, 'next && (!task || task.deletedAt)', { next: next.name, task: failedTask.name })
          && cleanupCall && ts.isAwaitExpression(cleanupCall) && match(cleanupCall,
            'rememberDiscardedTaskResult(input.prisma, input.taskId, { nativeAgentExecution: { checkpoint: next } })',
            { rememberDiscardedTaskResult: importOf(storeFile, '@openscience/domain', 'rememberDiscardedTaskResult'), input, next: next.name })
          && ts.isThrowStatement(catchBody[2]) && same(catchBody[2].expression, catchError), 'PRIVATE_KNOWN_REGISTRATION_ORDER_UNKNOWN', attempt.catchClause);
        need(match(updateSet, 'known.set(next.serializedSha256, next)', { known: known.name, next: next.name }), 'PRIVATE_KNOWN_REGISTRATION_ORDER_UNKNOWN', updateSet);

        const cp = firstRead, readObject = directVariable(readMethod.body, 'object'), readBytes = directVariable(readMethod.body, 'bytes');
        const readState = directVariable(readMethod.body, 'state'), readStatements = readMethod.body.statements;
        need(ts.isAwaitExpression(readObject.initializer) && match(readObject.initializer, 'input.storage.getObject(cp.objectKey)', { input, cp: cp.name })
          && match(readState.initializer, "JSON.parse(bytes.toString('utf8'))", { bytes: readBytes.name })
          && match(readSet, 'known.set(cp.serializedSha256, cp)', { known: known.name, cp: cp.name })
          && readStatements.at(-2)?.expression === readSet && ts.isReturnStatement(readStatements.at(-1))
          && same(readStatements.at(-1).expression, readState.name), 'PRIVATE_READ_REFERENCE_UNKNOWN', readMethod);
        need([expectedReference, bytes, hash, key, reference, turn, binding, old, prepared, preparedReference, cp, readObject, readBytes, readState]
          .every(node => node.parent.flags & ts.NodeFlags.Const), 'PRIVATE_LOCAL_ORIGIN_UNKNOWN', update);
        const referencesOnly = (declaration, allowed) => {
          for (const use of valueReferences(declaration.name)) {
            if (allowed.has(use)) continue;
            need(ts.isPropertyAccessExpression(use.parent) && use.parent.expression === use, 'PRIVATE_REFERENCE_ESCAPE_UNKNOWN', use);
            identityUse(use); // supported top-level receiver reads; nested target/source aliasing remains a premise
          }
        };
        referencesOnly(reference, new Set([member(persistReturn.expression, 'reference')]));
        referencesOnly(preparedReference, new Set([member(casObject, 'next')]));
        referencesOnly(prepared, new Set());
        referencesOnly(next, new Set([tryBody[1].expression.left, preparedReference.initializer, cleanup.expression.left,
          member(member(unwrap(cleanupCall).arguments[2], 'nativeAgentExecution'), 'checkpoint'), updateSet.arguments[1]]));
        need(ts.isIfStatement(readStatements[1]) && match(readStatements[1].expression, '!cp', { cp: cp.name }), 'PRIVATE_READ_REFERENCE_UNKNOWN', readMethod);
        referencesOnly(cp, new Set([readStatements[1].expression.operand, readSet.arguments[1]]));
        const expectedCalls = uses(expected);
        need(expectedCalls.length === 2 && expectedCalls.includes(unwrap(old.initializer)) && expectedCalls.includes(unwrap(firstPublish.initializer)), 'PRIVATE_EXPECTED_ORIGIN_UNKNOWN', expected);
        privateStoreChain.nodes = [['known', known], ['hash', hashFunction], ['expected', expected], ['persist', persist], ['reference', reference],
          ['old', old], ['prepared', prepared], ['next', next], ['preparedReference', preparedReference], ['transaction', transaction], ['cas', calls[0]],
          ['updateRegistration', updateSet], ['read', readMethod], ['parsedState', readState], ['readRegistration', readSet]].map(([role, node]) => ({ role, ...location(node) }));
        privateStoreChain.knownUses = { get: gets.length, set: sets.length };
        privateStoreChain.equalityPremise.modules = [storeFile, sessionFile, file('packages/storage/src/types.ts'),
          file('packages/domain/src/agent/native-agent-execution.ts')].map(source => relative(sourceRoot, source.fileName).replaceAll('\\', '/'));
        privateStoreChain.remaining = ['actual candidate/rollback complete-module equality with dependencies',
          'borrowed state/reference target/source nonescape and concurrent mutation context', 'Domain external identity/source/paid/live/CAS semantics'];
        privateStoreChain.status = 'conditional';
      } else {
        const writes = walk(update, node => ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
          && node.expression.name.text === 'updateMany' && ts.isPropertyAccessExpression(node.expression.expression)
          && node.expression.expression.name.text === 'agentTask');
        const paidWrites = writes.filter(call => {
          const data = member(call.arguments[0], 'data'), result = unwrap(member(data, 'result'));
          return ts.isObjectLiteralExpression(result) && result.properties.some(property => property.name?.text === 'journalNativeCheckpoint');
        });
        need(paidWrites.length === 1, 'STORE_JOURNAL_CAS_SUPPLIER_UNKNOWN', update);
        need(match(member(member(paidWrites[0].arguments[0], 'where'), 'executionAttempt'), 'input.executionAttempt', { input }),
          'STORE_JOURNAL_CAS_SUPPLIER_UNKNOWN', paidWrites[0]);
        row.cas = location(paidWrites[0]);
        storeGraph.pending.push({ reason: 'JOURNAL_OWN_RESULT_CAS_SEMANTICS_UNPROVEN', at: row.cas });
      }
      storeGraph.factories.push(row);
    }
    storeGraph.pending.push({ reason: 'DISPATCH_MARKER_TASK_KIND_PROFILE_SEPARATION_UNPROVEN',
      at: location(fn(file('packages/domain/src/agent/native-agent-execution.ts'), 'compareNativeAgentCheckpoint')) });
    storeGraph.status = 'conditional';
    proven.push('store-capability-use');
    if (privateStoreChain.status === 'conditional') proven.push('generic-private-store-chain');

    const other = [];
    for (const [target, calls] of [[storeFactory, storeCalls], [sessionFactory, sessionCalls], [hostFactory, hostCalls]]) for (const call of calls) {
      const input = unwrap(call.arguments[0]);
      need(input && ts.isObjectLiteralExpression(input), 'EXTRA_UNBOUND_FACTORY_CALLER', call);
      if (target === storeFactory) for (const key of ['taskId', 'executionAttempt', 'execution', 'authorize']) objectProperty(input, key);
      if (![live, replay].includes(enclosing(call))) other.push({ target: target.name.text, ...location(call) });
    }
    // These real paper/source/image/journal origins are inventoried, not blessed
    // by function name. Their store-method/profile separation is still unproved.
    return { status: 'unknown', reason: 'OTHER_PERSISTENCE_ORIGINS_UNPROVEN', releaseCompatible: false,
      proven, references, storeGraph, privateStoreChain, unresolved: other,
      pending: ['non-illustration factory/profile and store-method origin separation',
        'all slot/value escapes and Gateway tool-history/SDK role codec',
        'full private-byte/source and current-lease/late-paid CAS proof',
        'recursive base cache/cycle/source identity and all return-path proof',
        'directional A/B constructors, context projection and release-history premises'] };
  } catch (error) {
    return { status: 'unknown', reason: typeof error?.reason === 'string' ? error.reason : 'SOURCE_ANALYSIS_UNKNOWN',
      releaseCompatible: false, proven, references, storeGraph, privateStoreChain, at: location(error?.node) };
  }
}

// Internal constructor component of the pair proof. This does not grant a
// compatibility result; the caller must still prove selectors, whole receipts,
// all transfer edges, strict remainder/dependencies and the historical domain.
function finiteVideoConstructorTerms(ts, context) {
  const { program, checker, root } = context;
  const fail = node => { throw { reason: 'VIDEO_CONSTRUCTOR_NOT_PURE', node }; };
  const scan = (scope, predicate) => {
    const values = [];
    const visit = node => { if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
      if (predicate(node)) values.push(node); ts.forEachChild(node, visit); };
    visit(scope); return values;
  };
  const unique = (values, node) => { if (values.length !== 1) fail(node ?? values[0]); return values[0]; };
  const sources = program.getSourceFiles().filter(source => !source.isDeclarationFile
    && relative(root, source.fileName).replaceAll('\\', '/').match(/^(apps|packages)\/[^/]+\/src\//u));
  const fn = (source, name) => unique(scan(source, node => ts.isFunctionDeclaration(node) && node.name?.text === name), source);
  const symbol = node => {
    let value = checker.getSymbolAtLocation(node);
    if (value?.flags & ts.SymbolFlags.Alias) { const target = checker.getAliasedSymbol(value); if (target?.declarations?.length) value = target; }
    return value;
  };
  const materializer = unique(sources.flatMap(source => scan(source,
    node => ts.isFunctionDeclaration(node) && node.name?.text === 'createNativeIllustrationMaterializer')));
  const spool = unique(sources.flatMap(source => scan(source, node => ts.isClassDeclaration(node) && node.name?.text === 'SynclipVideoSpool')));
  const source = spool.getSourceFile(), legacy = fn(source, 'compileShotPrompt'), historical = fn(source, 'compileHistoricalNativeVideoShotPrompt');
  const approved = scan(source, node => ts.isFunctionDeclaration(node) && node.name?.text === 'compileApprovedShotPrompt');
  if (approved.length > 1) fail(source);
  const direction = fn(source, 'directionText'), shot = fn(source, 'shotPrompt');
  const modes = scan(legacy, node => ts.isVariableDeclaration(node) && node.name.text === 'mode');
  const mode = unique(modes, legacy), modeCall = mode.initializer;
  if (!modeCall || !ts.isCallExpression(modeCall) || !ts.isIdentifier(modeCall.expression)) fail(mode);
  const classify = unique((symbol(modeCall.expression)?.declarations ?? []).filter(ts.isFunctionDeclaration), modeCall);
  const classifiers = new Set([symbol(classify.name)]), helpers = new Map([direction, shot].map(value => [symbol(value.name), value]));
  const unwrap = node => { while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node))) node = node.expression; return node; };
  const concatenate = values => {
    const flat = values.flatMap(value => value[0] === 'concat' ? value.slice(1) : [value]);
    const result = [];
    for (const value of flat) {
      if (value[0] === 'string' && result.at(-1)?.[0] === 'string') result[result.length - 1][1] += value[1];
      else result.push([...value]);
    }
    return result.length === 1 ? result[0] : ['concat', ...result];
  };
  const evaluate = (functionNode, argumentsTerms, stack = new Set()) => {
    if (stack.has(functionNode) || stack.size > 6 || functionNode.asteriskToken
      || functionNode.modifiers?.some(node => node.kind === ts.SyntaxKind.AsyncKeyword)
      || !functionNode.body || functionNode.parameters.length !== argumentsTerms.length) fail(functionNode);
    stack = new Set(stack).add(functionNode);
    const locals = new Map(), guards = [];
    functionNode.parameters.forEach((parameter, index) => { if (!ts.isIdentifier(parameter.name) || parameter.initializer || parameter.dotDotDotToken) fail(parameter);
      locals.set(symbol(parameter.name), argumentsTerms[index]); });
    const expression = raw => {
      const node = unwrap(raw); if (!node) fail(raw);
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return ['string', node.text];
      if (ts.isNumericLiteral(node)) return ['number', node.text];
      if ([ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(node.kind)) return ['constant', node.kind];
      if (ts.isIdentifier(node)) { const value = locals.get(symbol(node)); if (!value) fail(node); return value; }
      if (ts.isPropertyAccessExpression(node) && !['__proto__', 'prototype', 'constructor'].includes(node.name.text))
        return ['property', expression(node.expression), node.name.text];
      if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) return ['not', expression(node.operand)];
      if (ts.isBinaryExpression(node)) {
        if (node.operatorToken.kind === ts.SyntaxKind.PlusToken) return concatenate([expression(node.left), expression(node.right)]);
        if (![ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.AmpersandAmpersandToken].includes(node.operatorToken.kind)) fail(node);
        return ['binary', node.operatorToken.kind, expression(node.left), expression(node.right)];
      }
      if (ts.isConditionalExpression(node)) {
        const size = guards.length, condition = expression(node.condition), yes = expression(node.whenTrue), no = expression(node.whenFalse);
        if (guards.length !== size) fail(node);
        return ['conditional', condition, yes, no];
      }
      if (ts.isArrayLiteralExpression(node)) return ['array', ...node.elements.map(expression)];
      if (ts.isCallExpression(node) && !node.questionDotToken && !node.typeArguments?.length) {
        if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'join' && node.arguments.length === 1) {
          const receiver = expression(node.expression.expression), separator = expression(node.arguments[0]);
          if (separator[0] !== 'string') fail(node);
          if (receiver[0] === 'array') return concatenate(receiver.slice(1).flatMap((value, index) => index ? [['string', separator[1]], value] : [value]));
          // The original direction helper's parameter-derived string[] is an
          // audited JSON contract, preserved in the pair's strict old context.
          if (functionNode !== direction || receiver[0] !== 'property' || receiver[2] !== 'negativeConstraints') fail(node);
          return ['join', receiver, separator];
        }
        if (!ts.isIdentifier(node.expression)) fail(node);
        const target = symbol(node.expression), args = node.arguments.map(expression);
        if (classifiers.has(target)) return ['retained-context-call', relative(root, classify.getSourceFile().fileName).replaceAll('\\', '/'), classify.name.text, args];
        const helper = helpers.get(target); if (!helper) fail(node);
        const result = evaluate(helper, args, stack); guards.push(...result.guards); return result.value;
      }
      fail(node);
    };
    let value;
    for (const [index, statement] of functionNode.body.statements.entries()) {
      if (ts.isVariableStatement(statement) && statement.declarationList.flags & ts.NodeFlags.Const) {
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name) || !declaration.initializer) fail(declaration);
          locals.set(symbol(declaration.name), expression(declaration.initializer));
        }
      } else if (ts.isIfStatement(statement) && !statement.elseStatement) {
        const body = ts.isBlock(statement.thenStatement) ? statement.thenStatement.statements : [statement.thenStatement];
        const error = body[0]?.expression;
        if (body.length !== 1 || !ts.isThrowStatement(body[0]) || !error || !ts.isNewExpression(error)
          || !ts.isIdentifier(error.expression) || error.expression.text !== 'Error'
          || symbol(error.expression)?.declarations?.some(node => sources.includes(node.getSourceFile()))
          || error.arguments?.length !== 1 || !ts.isStringLiteral(error.arguments[0])) fail(statement);
        guards.push([expression(statement.expression), error.arguments[0].text]);
      } else if (ts.isReturnStatement(statement) && index === functionNode.body.statements.length - 1) value = expression(statement.expression);
      else fail(statement);
    }
    if (!value) fail(functionNode);
    return { value, guards };
  };
  const args = [0, 1, 2].map(index => ['parameter', index]);
  return { materializer, spool, legacy, historical, approved: approved[0], direction, shot, classify,
    terms: { legacy: evaluate(legacy, args), historical: evaluate(historical, args),
      ...(approved.length ? { approved: evaluate(approved[0], args) } : {}) } };
}

// Source component only: consumed nodes are checked against a finite grammar,
// then projected back to the retained original producer. The pair caller still
// owns genuine collector identity, every other entry and history composition.
function finiteVideoSourceModel(ts, context) {
  const constructors = finiteVideoConstructorTerms(ts, context), { checker } = context;
  const unknown = node => { throw { reason: 'VIDEO_TRANSFER_UNKNOWN', node }; };
  const need = (condition, node) => { if (!condition) unknown(node); };
  const nodes = (scope, predicate) => { const found = []; const visit = node => {
    if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
    if (predicate(node)) found.push(node); ts.forEachChild(node, visit);
  }; visit(scope); return found; };
  const one = (values, node) => { need(values.length === 1, node); return values[0]; };
  const symbol = node => { let value = checker.getSymbolAtLocation(node);
    if (value?.flags & ts.SymbolFlags.Alias) value = checker.getAliasedSymbol(value); return value; };
  const scope = node => { for (let parent = node.parent; parent; parent = parent.parent)
    if (ts.isFunctionLike(parent) && parent.body) return parent; return undefined; };
  const variable = (owner, name) => one(nodes(owner, node => ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name) && node.name.text === name && scope(node) === owner), owner);
  const fn = (owner, name) => one(nodes(owner, node => ts.isFunctionDeclaration(node) && node.name?.text === name), owner);
  const isName = node => node && ts.isIdentifier(node);
  const identifier = node => { need(isName(node), node); return node.text; };
  const args = functionNode => functionNode.parameters.map(parameter => { need(!parameter.dotDotDotToken && isName(parameter.name), parameter); return parameter.name.text; });
  const bindReferences = (region, declarations) => {
    const names = new Map();
    for (const declaration of declarations) {
      const identifierNode = declaration?.name ?? declaration;
      need(isName(identifierNode) && symbol(identifierNode), declaration);
      const existing = names.get(identifierNode.text), target = symbol(identifierNode);
      need(!existing || existing === target, identifierNode); names.set(identifierNode.text, target);
    }
    for (const reference of nodes(region, ts.isIdentifier)) {
      const target = names.get(reference.text); if (!target) continue;
      const parent = reference.parent;
      if (ts.isPropertyAccessExpression(parent) && parent.name === reference
        || ts.isPropertyAssignment(parent) && parent.name === reference
        || ts.isMethodDeclaration(parent) && parent.name === reference) continue;
      const actual = ts.isShorthandPropertyAssignment(parent) ? checker.getShorthandAssignmentValueSymbol(parent) : symbol(reference);
      need(actual === target, reference);
    }
  };
  const printer = ts.createPrinter({ removeComments: true });
  const print = node => printer.printNode(ts.EmitHint.Unspecified, node, node.getSourceFile());
  const canonical = node => {
    const children = []; ts.forEachChild(node, child => { children.push(canonical(child)); });
    return [node.kind, ts.isIdentifier(node) || ts.isLiteralExpression(node) || ts.isTemplateLiteralToken(node) ? node.text
      : ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node) ? node.operator
        : ts.isVariableDeclarationList(node) ? node.flags & ts.NodeFlags.BlockScoped : null, children];
  };
  const runtime = code => {
    const compiled = ts.transpileModule(code, { reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true } });
    need(!compiled.diagnostics?.some(item => item.category === ts.DiagnosticCategory.Error));
    const source = ts.createSourceFile('finite.js', compiled.outputText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
    need(source.parseDiagnostics.length === 0); return canonical(source);
  };
  const matches = (actual, expected) => need(JSON.stringify(runtime(actual.map(print).join('\n'))) === JSON.stringify(runtime(expected)), actual[0]);
  const parse = code => {
    const source = ts.createSourceFile('finite.ts', code, ts.ScriptTarget.ES2022, true);
    need(source.parseDiagnostics.length === 0);
    // Replacement nodes belong to this separate finite template, not the
    // captured application's character offsets. Synthesize the complete tree
    // so printing cannot read a number/string from the application's unrelated
    // original source range. Original context nodes remain untouched.
    const cloned = ts.transform(source, [transformation => {
      const visit = node => {
        const result = ts.factory.cloneNode(ts.visitEachChild(node, visit, transformation));
        ts.setTextRange(result, { pos: -1, end: -1 }); ts.setOriginalNode(result, undefined); return result;
      };
      return node => ts.visitNode(node, visit);
    }]);
    try { return cloned.transformed[0].statements; } finally { cloned.dispose(); }
  };
  const replacements = new Map(), removed = new Set(), consumedApproved = new Set();
  const { materializer, spool, legacy, historical, approved } = constructors;
  if (approved) {
    const terms = constructors.terms, L = terms.legacy.value, H = terms.historical.value, A = terms.approved.value;
    const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
    // The admitted new family changes one final fixed drawing-policy string.
    // All scientific/context field reads, audio choice and rejecting guards
    // remain the genuine old constructor's terms. JSON-contract inputs carry
    // no property accessors or operator hooks.
    need(equal(terms.legacy.guards, terms.approved.guards) && L[0] === 'concat' && A[0] === 'concat' && H[0] === 'concat'
      && L.length === A.length && L.at(-2)?.[0] === 'string' && A.at(-2)?.[0] === 'string'
      && L.at(-1)?.[0] === 'conditional' && equal(L.at(-1), A.at(-1))
      && equal(L.slice(0, -2), A.slice(0, -2)) && equal(L.slice(0, -2), H.slice(0, -1))
      && H.at(-1)?.[0] === 'string', approved);
    const audio = L.at(-1).slice(2);
    need(audio.length === 2 && audio.every(value => value[0] === 'string')
      && A.at(-2)[1] !== L.at(-2)[1]
      && audio.every(value => A.at(-2)[1] + value[1] !== H.at(-1)[1]), approved);
  }
  const [input] = args(materializer), evaluate = fn(materializer, 'evaluate'), reconstruct = fn(materializer, 'reconstruct');
  const evaluateArgs = args(evaluate), reconstructArgs = args(reconstruct);
  need(evaluateArgs.length === (approved ? 6 : 5) && reconstructArgs.length === 5, evaluate);
  const [name, value, sequence, callId, historicalExecution, flag] = evaluateArgs;
  const [readName, readArgs, readSequence, readId, recorded] = reconstructArgs;
  const native = variable(materializer, 'nativeVideo').name.text, originalProfile = variable(materializer, 'historicalVideo').name.text;
  const revision = variable(materializer, 'revisionSceneIndex').name.text;
  const prompts = variable(evaluate, 'prompts'), document = variable(evaluate, 'document').name.text, resources = variable(evaluate, 'resources').name.text;
  const map = prompts.initializer;
  need(map && ts.isCallExpression(map) && ts.isPropertyAccessExpression(map.expression) && map.expression.name.text === 'flatMap'
    && map.arguments.length === 1 && ts.isArrowFunction(map.arguments[0]), prompts);
  const callback = map.arguments[0], [scene, index] = args(callback);
  need(callback.parameters.length === 2 && !callback.modifiers?.length, callback);
  const videoContext = variable(materializer, 'videoContext').name.text;
  const deepImport = one(nodes(materializer.getSourceFile(), node => ts.isImportSpecifier(node)
    && (node.propertyName ?? node.name).text === 'isDeepStrictEqual'
    && node.parent.parent.parent.moduleSpecifier?.text === 'node:util'), materializer);
  const deep = deepImport.name.text;
  const image = one(nodes(callback, node => ts.isCallExpression(node) && ts.isIdentifier(node.expression)
    && symbol(node.expression)?.declarations?.some(declaration => ts.isFunctionDeclaration(declaration)
      && declaration.name?.text === 'compileIllustrationImagePrompt')), callback).expression.text;
  const legacyName = legacy.name.text, historicalName = historical.name.text;
  const imported = new Map();
  for (const target of [legacy, historical, approved].filter(Boolean)) {
    const binding = one(nodes(materializer.getSourceFile(), node => ts.isImportSpecifier(node)
      && symbol(node.name) === symbol(target.name)), materializer);
    imported.set(target, binding.name.text);
  }
  const L = imported.get(legacy), H = imported.get(historical), A = imported.get(approved);
  const inputDeclaration = materializer.parameters[0];
  const callbackOuterBindings = [inputDeclaration, variable(materializer, 'nativeVideo'), variable(materializer, 'historicalVideo'),
    variable(materializer, 'videoContext'), variable(materializer, 'revisionSceneIndex'), variable(evaluate, 'document'), variable(evaluate, 'resources'),
    deepImport, ...[legacy, historical, approved].filter(Boolean).map(target => one(nodes(materializer.getSourceFile(),
      node => ts.isImportSpecifier(node) && symbol(node.name) === symbol(target.name)), materializer)),
    one(nodes(materializer.getSourceFile(), node => ts.isImportSpecifier(node) && node.name.text === image), materializer), ...callback.parameters];
  const promptObject = compiler => `{ ${index === 'sceneIndex' ? 'sceneIndex' : `sceneIndex: ${index}`}, prompt: ${image}(${scene}.illustration!, ${resources}[${index}]!.instructions),
    ...(${native} ? { videoPrompt: ${compiler}(${document}, ${scene}, ${input}.settings.locale) } : {}),
    ...(${videoContext} ? { renderResources: ${resources}[${index}]!.usage } : {}) }`;
  const oldCallback = `(${scene}, ${index}) => ${scene}.paperOriginal ? [] : [${promptObject(`(${originalProfile} ? ${H} : ${L})`)}]`;
  let fresh = 'legacy', readers = new Set(['legacy', 'historical']), routes = [];
  if (!approved) {
    bindReferences(callback, callbackOuterBindings);
    need(JSON.stringify(runtime(`const __callback = ${print(callback)};`)) === JSON.stringify(runtime(`const __callback = ${oldCallback};`)), callback);
    routes.push({ kind: 'fresh', family: 'legacy', node: callback },
      { kind: 'inherit-exact', families: ['legacy'], node: callback },
      { kind: 'reconstruct-whole', families: ['legacy'], node: reconstruct });
  } else {
    need(ts.isBlock(callback.body), callback);
    const compiler = variable(callback, 'compiler'), prompt = variable(callback, 'prompt'), alternate = variable(callback, 'alternate');
    bindReferences(callback, [...callbackOuterBindings, evaluate.parameters[5], compiler, prompt, alternate]);
    const choice = compiler.initializer;
    need(choice && ts.isConditionalExpression(choice) && ts.isConditionalExpression(choice.whenFalse), compiler);
    const inner = choice.whenFalse;
    need(ts.isIdentifier(inner.condition) && symbol(inner.condition) === symbol(evaluate.parameters[5].name), inner);
    const family = node => symbol(node) === symbol(legacy.name) ? 'legacy' : symbol(node) === symbol(approved.name) ? 'approved' : undefined;
    const whenTrue = family(inner.whenTrue), whenFalse = family(inner.whenFalse);
    need(whenTrue && whenFalse && whenTrue !== whenFalse && evaluate.parameters[5].initializer?.kind === ts.SyntaxKind.FalseKeyword, inner);
    fresh = whenFalse;
    const yes = whenTrue === 'legacy' ? L : A, no = whenFalse === 'legacy' ? L : A;
    matches([...callback.body.statements], `
      if (${scene}.paperOriginal) return [];
      const ${compiler.name.text} = ${originalProfile} ? ${H} : ${flag} ? ${yes} : ${no};
      const ${prompt.name.text} = ${promptObject(compiler.name.text)};
      if (${revision} !== undefined && ${index} !== ${revision} && ${input}.nativeVideoAudio === true
        && !${deep}(${prompt.name.text}, ${input}.base!.prompts[${index}])) {
        const ${alternate.name.text} = { ...${prompt.name.text}, videoPrompt: (${flag} ? ${no} : ${yes})(${document}, ${scene}, ${input}.settings.locale) };
        if (${deep}(${alternate.name.text}, ${input}.base!.prompts[${index}])) return [${alternate.name.text}];
      }
      return [${prompt.name.text}];`);
    replacements.set(callback, parse(`const __callback = ${oldCallback};`)[0].declarationList.declarations[0].initializer);
    replacements.set(evaluate, { operation: 'drop-finite-parameter', parameters: evaluate.parameters.slice(0, 5) });
    const flagReferences = nodes(evaluate, node => ts.isIdentifier(node) && symbol(node) === symbol(evaluate.parameters[5].name));
    need(flagReferences.length === 3 && flagReferences.includes(evaluate.parameters[5].name)
      && flagReferences.every(node => node === evaluate.parameters[5].name || nodes(callback, value => value === node).length === 1), evaluate);
    const restore = variable(reconstruct, 'restore').name.text;
    const block = one([...reconstruct.body.statements].filter(statement => ts.isIfStatement(statement)
      && nodes(statement, node => ts.isCallExpression(node) && symbol(node.expression) === symbol(evaluate.name) && node.arguments.length === 6).length === 1), reconstruct);
    const rebuilt = one(nodes(block, node => ts.isVariableDeclaration(node) && ts.isCallExpression(node.initializer)), block).name.text;
    bindReferences(block, [inputDeclaration, variable(materializer, 'nativeVideo'), deepImport, evaluate,
      ...reconstruct.parameters, variable(reconstruct, 'restore'),
      one(nodes(block, node => ts.isVariableDeclaration(node) && node.name.text === rebuilt), block)]);
    matches([block], `if (${native} && ${input}.nativeVideoAudio === true && ${readName} === 'paper_illustration_art' && ${recorded}.status === 'art_ready') {
      ${restore}();
      const ${rebuilt} = ${evaluate.name.text}(${readName}, ${readArgs}, ${readSequence}, ${readId}, false, true);
      if (${deep}(${rebuilt}, ${recorded})) return ${rebuilt};
    }`);
    removed.add(block); removed.add(approved);
    readers.add('approved');
    consumedApproved.add(approved.name);
    for (const node of nodes(callback, node => ts.isIdentifier(node) && symbol(node) === symbol(approved.name))) consumedApproved.add(node);
    routes.push({ kind: 'fresh', family: fresh, node: callback }, { kind: 'inherit-exact', families: [whenTrue, whenFalse], node: callback },
      { kind: 'reconstruct-whole', families: [whenFalse, whenTrue], node: block });
  }
  const generate = one(spool.members.filter(member => ts.isMethodDeclaration(member) && member.name?.text === 'generate'), spool);
  const [spoolInput] = args(generate), scenes = variable(generate, 'scenes'), sceneMap = scenes.initializer;
  need(sceneMap && ts.isCallExpression(sceneMap) && sceneMap.arguments.length === 1 && ts.isArrowFunction(sceneMap.arguments[0]), scenes);
  const sceneCallback = sceneMap.arguments[0], [spoolScene, spoolIndex] = args(sceneCallback);
  need(ts.isBlock(sceneCallback.body) && sceneCallback.parameters.length === 2, sceneCallback);
  const prompt = variable(sceneCallback, 'prompt').name.text, nativeSpool = variable(generate, 'nativeVideo').name.text,
    locale = variable(generate, 'locale').name.text;
  const first = [...sceneCallback.body.statements].slice(0, 2);
  const failures = nodes(first[1], node => ts.isCallExpression(node) && ts.isIdentifier(node.expression)
    && node.expression.text === 'fail');
  need(failures.length > 0 && failures.every(call => symbol(call.expression) === symbol(failures[0].expression)), first[1]);
  const failName = failures[0].expression.text;
  const spoolBindings = [generate.parameters[0], ...sceneCallback.parameters, variable(sceneCallback, 'prompt'), variable(generate, 'nativeVideo'),
    variable(generate, 'locale'), legacy, one(symbol(failures[0].expression)?.declarations ?? [], failures[0])];
  const originalChoice = `const ${prompt} = ${legacyName}(${spoolInput}.storyboard, ${spoolScene}, ${locale});
    if (${nativeSpool} && (${spoolInput}.videoPrompts![${spoolIndex}] !== ${prompt} || ![5, 10, 15].includes(${spoolScene}.durationSeconds!))) ${failName}('NATIVE_VIDEO_PLAN_CHANGED');`;
  if (!approved) {
    for (const statement of first) bindReferences(statement, spoolBindings); matches(first, originalChoice);
    routes.push({ kind: 'spool-exact', families: ['legacy'], node: first[1] });
  }
  else {
    const approvedPrompt = variable(sceneCallback, 'approved').name.text;
    for (const statement of first) bindReferences(statement, [...spoolBindings, approved, variable(sceneCallback, 'approved')]);
    matches(first, `let ${prompt} = ${legacyName}(${spoolInput}.storyboard, ${spoolScene}, ${locale});
      if (${nativeSpool}) {
        const ${approvedPrompt} = ${approved.name.text}(${spoolInput}.storyboard, ${spoolScene}, ${locale});
        if (${spoolInput}.videoPrompts![${spoolIndex}] === ${approvedPrompt}) ${prompt} = ${approvedPrompt};
        else if (${spoolInput}.videoPrompts![${spoolIndex}] !== ${prompt}) ${failName}('NATIVE_VIDEO_PLAN_CHANGED');
        if (![5, 10, 15].includes(${spoolScene}.durationSeconds!)) ${failName}('NATIVE_VIDEO_PLAN_CHANGED');
      }`);
    const replacement = parse(originalChoice);
    replacements.set(first[0], replacement[0]); replacements.set(first[1], replacement[1]);
    for (const node of nodes(first[1], node => ts.isIdentifier(node) && symbol(node) === symbol(approved.name))) consumedApproved.add(node);
    routes.push({ kind: 'spool-exact', families: ['legacy', 'approved'], node: first[1] });
  }
  if (approved) for (const source of context.program.getSourceFiles().filter(file => !file.isDeclarationFile)) {
    for (const reference of nodes(source, node => ts.isIdentifier(node) && symbol(node) === symbol(approved.name))) {
      if (ts.isImportSpecifier(reference.parent) && [reference.parent.name, reference.parent.propertyName].includes(reference) && source === materializer.getSourceFile()) {
        removed.add(reference.parent); continue;
      }
      need(consumedApproved.has(reference), reference);
    }
  }
  const transform = source => {
    const result = ts.transform(source, [transformation => {
      const visit = node => {
        if (removed.has(node)) return undefined;
        const replacement = replacements.get(node);
        if (replacement?.operation === 'drop-finite-parameter') return ts.factory.updateFunctionDeclaration(node, node.modifiers, node.asteriskToken,
          node.name, node.typeParameters, replacement.parameters, node.type, ts.visitNode(node.body, visit));
        if (replacement) return replacement;
        return ts.visitEachChild(node, visit, transformation);
      };
      return node => ts.visitNode(node, visit);
    }]);
    try { return printer.printFile(result.transformed[0]); } finally { result.dispose(); }
  };
  return { constructors, fresh, readers, routes, projected: new Map([materializer.getSourceFile(), spool.getSourceFile()]
    .map(source => [relative(context.root, source.fileName).replaceAll('\\', '/'), { source, text: transform(source) }])) };
}

// Finite transfer closure over the exact constructors and whole-value gates
// extracted above. No caller-supplied family/compatibility switch enters here.
// The result remains conditional on the caller preserving every context entry.
function finiteVideoFamilyClosure(candidate, rollback) {
  const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const fail = reason => ({ status: 'unknown', reason });
  for (const family of ['legacy', 'historical']) if (!equal(candidate.constructors.terms[family], rollback.constructors.terms[family]))
    return fail('OLD_CONSTRUCTOR_CHANGED');
  for (const family of rollback.readers) {
    if (!candidate.readers.has(family)) return fail('READER_CAPABILITY_REMOVED');
    if (family === 'approved' && !equal(candidate.constructors.terms.approved, rollback.constructors.terms.approved))
      return fail('RETAINED_CONSTRUCTOR_CHANGED');
  }
  // Old authenticated histories contain only the old producer/retainer
  // families. A capable rollback keeps A in this domain even while fresh=L:
  // a later failed writer can have left genuine A work in that same store.
  const reachable = new Set([...rollback.readers, 'refused']), queue = [...reachable], transitions = [];
  const fresh = candidate.routes.filter(route => route.kind === 'fresh');
  if (fresh.length !== 1 || fresh[0].family !== candidate.fresh) return fail('FRESH_SOURCE_UNKNOWN');
  const add = (from, to, route) => {
    transitions.push({ from, to, kind: route.kind, node: route.node });
    if (!reachable.has(to)) { reachable.add(to); queue.push(to); }
  };
  // A task's fresh tool result has an independently compiled family. Existing
  // source/profile rejection preserves the U outcome under the exact context.
  add('birth', candidate.fresh, fresh[0]);
  while (queue.length) {
    const family = queue.shift();
    for (const route of candidate.routes.filter(value => value.kind !== 'fresh')) {
      if (family === 'refused') { add(family, family, route); continue; }
      if (route.kind === 'inherit-exact' || route.kind === 'reconstruct-whole') {
        // These exact source branches return only an independently constructed
        // WHOLE object equal to the authenticated input. They retain its
        // family; trying the opposite compiler cannot mint a new input value.
        if (route.families.includes(family) || family === 'historical') add(family, family, route);
        add(family, 'refused', route);
      } else if (route.kind === 'spool-exact') {
        // The selected request string is the independently compiled equal
        // value, never the incoming string. Historical-profile behavior and
        // all failed/UNCERTAIN/paid/late request ownership remain strict context.
        // Original-profile H can equal the old L external-narration value.
        // Preserve both that original successful outcome and its refusals;
        // there is no new historical-profile constructor selection here.
        if (route.families.includes(family) || family === 'historical') add(family, family, route);
        add(family, 'refused', route);
      } else return fail('TRANSFER_SOURCE_UNKNOWN');
    }
  }
  for (const family of reachable) if (family !== 'refused' && !rollback.readers.has(family)) return fail('ROLLBACK_FAMILY_NOT_CLOSED');
  return { status: 'conditional', reachable: [...reachable], transitions };
}

function finiteVideoPairCompatibility(ts, current, previous, candidateRoot, rollbackRoot, roots) {
  try {
    const left = rollbackProofContexts.get(current), right = rollbackProofContexts.get(previous);
    // Only the two original successful collections may enter this unequal
    // route. JSON clones/slices/source-only Programs cannot borrow authority.
    if (roots !== APPLICATION_ROLLBACK_READERS || !left || !right || left.ts !== ts || right.ts !== ts
      || left.roots !== roots || right.roots !== roots || left.root !== candidateRoot || right.root !== rollbackRoot
      || left.program.getTypeChecker() !== left.checker || right.program.getTypeChecker() !== right.checker) return false;
    const candidate = finiteVideoSourceModel(ts, left), rollback = finiteVideoSourceModel(ts, right);
    const projectedKeys = [...candidate.projected.keys()].sort();
    if (projectedKeys.length !== 2 || JSON.stringify(projectedKeys) !== JSON.stringify([...rollback.projected.keys()].sort())) return false;
    const affected = new Set(projectedKeys.map(key => `module:${key}`)), a = new Map(current), b = new Map(previous);
    for (const key of new Set([...a.keys(), ...b.keys()])) {
      if (!a.has(key) || !b.has(key)) return false;
      if (!affected.has(key) && JSON.stringify(a.get(key)) !== JSON.stringify(b.get(key))) return false;
    }
    for (const key of projectedKeys) {
      const projected = [];
      for (const [context, model] of [[left, candidate], [right, rollback]]) {
        const { source, text } = model.projected.get(key), path = resolve(context.root, key);
        if (context.modules.get(path) !== source || context.program.getSourceFile(path) !== source
          || !a.has(`module:${key}`) || !b.has(`module:${key}`)) return false;
        // Same captured TS source, same transpile options and original runtime
        // canonical. These two application modules have no Prisma location
        // literals; every generated/vendor entry remains untouched above.
        const compiled = ts.transpileModule(text, { fileName: path, reportDiagnostics: true,
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true } });
        if (compiled.diagnostics?.some(item => item.category === ts.DiagnosticCategory.Error)) return false;
        const emitted = ts.createSourceFile('runtime.js', compiled.outputText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
        if (emitted.parseDiagnostics.length) return false;
        projected.push(context.canonical(emitted));
      }
      if (JSON.stringify(projected[0]) !== JSON.stringify(projected[1])) return false;
    }
    // Reuse the independently reviewed actual bindings only under the complete
    // unchanged runtime/dependency premise just established. No per-Domain or
    // codec gate is introduced, and unrelated origins gain no new A constructor.
    for (const context of [left, right]) {
      const ingress = proveNativeVideoReceiptIngress(ts, context.program, context.root);
      if (ingress.reason !== 'OTHER_PERSISTENCE_ORIGINS_UNPROVEN'
        || ingress.storeGraph.status !== 'conditional' || ingress.privateStoreChain.status !== 'conditional'
        || !['materializer-host', 'host-slot-result', 'host-before-session', 'session-prefix', 'session-checkpoint-prefix',
          'verified-base', 'store-capability-use', 'generic-private-store-chain'].every(edge => ingress.proven.includes(edge))) return false;
    }
    return finiteVideoFamilyClosure(candidate, rollback).status === 'conditional';
  } catch { return false; }
}

function rollbackComparisonDiagnostic(current, previous, candidateRoot, rollbackRoot) {
  const left = new Map(current), right = new Map(previous);
  const keys = [...new Set([...left.keys(), ...right.keys()])].sort();
  const entries = [];
  let differences = 0;
  const safeKey = key => typeof key === 'string' && key.length <= 240 && !key.includes('..')
    && /^(?:module:|configuration:|package:|prisma-vendor:)?(?:apps|packages|infra|node_modules)\/[A-Za-z0-9@_./:+-]+$/u.test(key)
    ? key : '[redacted-key]';
  const rootAt = (value, root, offset) => {
    const encoded = JSON.stringify(resolve(root)).slice(1, -1);
    if (!encoded) return false;
    for (let index = value.indexOf(encoded); index !== -1; index = value.indexOf(encoded, index + encoded.length)) {
      if (offset >= index && offset < index + encoded.length) return true;
    }
    return false;
  };
  for (const key of keys) {
    const hasLeft = left.has(key), hasRight = right.has(key);
    const a = hasLeft ? JSON.stringify(left.get(key)) : undefined;
    const b = hasRight ? JSON.stringify(right.get(key)) : undefined;
    if (hasLeft === hasRight && a === b) continue;
    differences += 1;
    if (entries.length === 4) continue;
    const entry = { key: safeKey(key), candidatePresent: hasLeft, rollbackPresent: hasRight };
    if (typeof a === 'string' && typeof b === 'string') {
      let offset = 0;
      while (offset < a.length && offset < b.length && a[offset] === b[offset]) offset += 1;
      Object.assign(entry, { jsonOffset: offset, candidateLength: a.length, rollbackLength: b.length,
        candidateRootAtDifference: rootAt(a, candidateRoot, offset), rollbackRootAtDifference: rootAt(b, rollbackRoot, offset) });
    }
    entries.push(entry);
  }
  return { entries, truncated: differences > entries.length, differences };
}


export async function verifyApplicationRollbackReaders({ candidateRoot, rollbackRoot, compilerRoot = candidateRoot, roots = APPLICATION_ROLLBACK_READERS, diagnostics = false }) {
  // A healthy release/runtime marker cannot prove that persisted paid work stays
  // readable. Never execute rollback code or grant downgrade from a live empty query.
  let stage = 'worker-candidate';
  try {
    if (roots === APPLICATION_ROLLBACK_ROOTS) {
      verifyWorkerRecoveryWiring({ sourceRoot: resolve(candidateRoot), compilerRoot });
      stage = 'worker-rollback';
      verifyWorkerRecoveryWiring({ sourceRoot: resolve(rollbackRoot), compilerRoot });
    }
    stage = 'compiler';
    const trustedRequire = createRequire(join(compilerRoot, 'package.json')), ts = trustedRequire('typescript');
    let vendorPackages;
    stage = 'vendor-resolution';
    try {
      vendorPackages = { upstreamPackageRoot: dirname(trustedRequire.resolve('@prisma/client/package.json')),
        enginePackageRoot: dirname(createRequire(trustedRequire.resolve('prisma/package.json')).resolve('@prisma/engines/package.json')) };
    } catch { /* Any generated vendor module still fails closed without both installed packages. */ }
    if (roots === APPLICATION_ROLLBACK_ROOTS) {
      if (!vendorPackages) rollbackCompatibilityUnknown();
      stage = 'core-candidate';
      verifyPrismaCoreClientRuntime({ sourceRoot: resolve(candidateRoot), ...vendorPackages });
      stage = 'core-rollback';
      verifyPrismaCoreClientRuntime({ sourceRoot: resolve(rollbackRoot), ...vendorPackages });
    }
    stage = 'closure-candidate';
    const current = rollbackReaderClosure(ts, resolve(candidateRoot), roots, vendorPackages);
    stage = 'closure-rollback';
    const previous = rollbackReaderClosure(ts, resolve(rollbackRoot), roots, vendorPackages);
    stage = 'comparison';
    if (JSON.stringify(current) !== JSON.stringify(previous)
      && !(roots === APPLICATION_ROLLBACK_READERS
        && finiteVideoPairCompatibility(ts, current, previous, resolve(candidateRoot), resolve(rollbackRoot), roots))) {
      if (diagnostics === true) {
        try { console.error(`ROLLBACK_COMPARISON_DIAGNOSTIC ${JSON.stringify(rollbackComparisonDiagnostic(current, previous, candidateRoot, rollbackRoot))}`); }
        catch { /* Diagnostic failure cannot permit rollback or replace the rejection. */ }
      }
      rollbackCompatibilityUnknown();
    }
  } catch (error) {
    if (diagnostics === true) {
      try {
        const knownCodes = ['ENOENT', 'ENOTDIR', 'EACCES', 'ELOOP', 'MODULE_NOT_FOUND', 'ERR_PACKAGE_PATH_NOT_EXPORTED'];
        const errorCode = error?.code;
        const code = knownCodes.includes(errorCode) ? errorCode
          : typeof error?.message === 'string' && error.message.startsWith('ROLLBACK_FAILED_PERSISTENCE_COMPATIBILITY_UNKNOWN:')
            ? 'COMPATIBILITY_UNKNOWN' : 'UNCLASSIFIED';
        const verifierLines = [];
        for (const frame of (typeof error?.stack === 'string' ? error.stack.slice(0, 16384) : '').split(/\r?\n/u)) {
          if (!/^\s+at /u.test(frame)) continue;
          const location = frame.indexOf(`${VERIFIER_SOURCE_URL}:`);
          if (location === -1) continue;
          const match = frame.slice(location + VERIFIER_SOURCE_URL.length + 1).match(/^(\d+):\d+\)?$/u);
          const line = match ? Number(match[1]) : undefined;
          if (Number.isSafeInteger(line) && line > 0 && line <= 1_000_000 && !verifierLines.includes(line)) verifierLines.push(line);
          if (verifierLines.length === 3) break;
        }
        // Never emit the message, raw stack, error.path or process environment.
        console.error(`ROLLBACK_COMPATIBILITY_DIAGNOSTIC ${JSON.stringify({ stage, code, verifierLines })}`);
      } catch { /* Diagnostic output must not replace the fail-closed result. */ }
    }
    rollbackCompatibilityUnknown();
  }
}

async function applicationRollbackPreflight(options) {
  await verifyProductionDeployLockOnHost(options);
  const journal = await readTrustedJournal(options);
  if (journal.candidateSha !== options.candidateSha || journal.rollbackSha !== options.rollbackSha
    || !['switching', 'published'].includes(journal.phase)) rollbackCompatibilityUnknown();
  try {
    const nodeVersion = async sha => {
      const metadata = JSON.parse(await nativeCommand('docker', ['image', 'inspect', '--format', '{{json .}}', `openscience-agent-worker:${sha}`]));
      const values = metadata?.Config?.Env;
      const architecture = { x64: 'amd64', arm64: 'arm64' }[process.arch];
      if (!Array.isArray(values) || metadata.Os !== process.platform || !architecture || metadata.Architecture !== architecture) rollbackCompatibilityUnknown();
      const versions = values.filter(value => typeof value === 'string' && value.startsWith('NODE_VERSION='));
      if (versions.length !== 1 || !/^NODE_VERSION=\d+\.\d+\.\d+$/u.test(versions[0])) rollbackCompatibilityUnknown();
      return JSON.stringify([versions[0], metadata.Os, metadata.Architecture]);
    };
    if (await nodeVersion(options.candidateSha) !== await nodeVersion(options.rollbackSha)) rollbackCompatibilityUnknown();
    await verifyApplicationRollbackReaders({ candidateRoot: `/opt/openscience-releases/${options.candidateSha}`,
      rollbackRoot: `/opt/openscience-releases/${options.rollbackSha}` });
  } catch {
    // Current readers inspect recovery obligations only for bounded diagnostics.
    // Live producers make an empty query insufficient to permit a downgrade.
    try {
      const work = await queryNativeWork(options.candidateSha, null, true);
      console.error(`ROLLBACK_PERSISTENCE: native=${work.persistence.native} paid_unknown=${work.persistence.paidUnknown} first_image=${work.persistence.firstImage}`);
    } catch { console.error('ROLLBACK_PERSISTENCE: unknown; current recovery state retained'); }
    rollbackCompatibilityUnknown();
  }
  return 'APPLICATION_ROLLBACK_READERS_COMPATIBLE';
}

export async function verifyProductionDeployLockOnHost({
  lockDirectory = PRODUCTION_LOCK_DIRECTORY, requiredUid = 0, lockFd,
}) {
  if (!Number.isSafeInteger(lockFd) || lockFd < 3) {
    throw new Error('production deploy inherited lock FD is invalid');
  }
  const directoryInfo = await lstat(lockDirectory);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink() || directoryInfo.uid !== requiredUid
    || (directoryInfo.mode & 0o777) !== 0o700 || await realpath(lockDirectory) !== lockDirectory) {
    throw new Error('production deploy lock directory is unsafe');
  }
  const lockPath = `${lockDirectory}/lock`;
  const inheritedLockInfo = fstatSync(lockFd);
  const lockInfo = await lstat(lockPath);
  if (!lockInfo.isFile() || lockInfo.isSymbolicLink() || lockInfo.nlink !== 1
    || lockInfo.uid !== requiredUid || (lockInfo.mode & 0o777) !== 0o600) {
    throw new Error('production deploy lock file is unsafe');
  }
  if (!inheritedLockInfo.isFile() || inheritedLockInfo.dev !== lockInfo.dev
    || inheritedLockInfo.ino !== lockInfo.ino) {
    throw new Error('production deploy payload did not inherit the held flock FD');
  }
  const probe = spawnSync('flock', ['-n', '-E', '73', lockPath, '-c', ':'], { stdio: 'ignore' });
  if (probe.status !== 73) throw new Error('production deploy flock is not held');
}

export async function compareAndSwapActiveRelease({
  markerPath, expectedSha, nextSha, lockDirectory, requiredUid, lockFd,
}) {
  if (!SHA_PATTERN.test(expectedSha) || !SHA_PATTERN.test(nextSha)) {
    throw new Error('active release compare-and-swap SHA is invalid');
  }
  if (lockFd !== 9) throw new Error('active release mutation requires inherited production lock FD9');
  await verifyProductionDeployLockOnHost({ lockDirectory, requiredUid, lockFd });
  const canonicalMarker = resolve(markerPath);
  const markerInfo = await lstat(canonicalMarker);
  if (!markerInfo.isFile() || markerInfo.isSymbolicLink() || markerInfo.nlink !== 1
    || await realpath(canonicalMarker) !== canonicalMarker) {
    throw new Error('active release marker is unsafe');
  }
  if ((await readFile(canonicalMarker, 'utf8')).trim() !== expectedSha) {
    throw new Error('active release changed before compare-and-swap');
  }
  const temporary = `${canonicalMarker}.${process.pid}.${randomUUID()}.next`;
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(`${nextSha}\n`);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await chmod(temporary, markerInfo.mode & 0o777);
    const currentInfo = await lstat(canonicalMarker);
    if (!currentInfo.isFile() || currentInfo.isSymbolicLink() || currentInfo.nlink !== 1
      || currentInfo.dev !== markerInfo.dev || currentInfo.ino !== markerInfo.ino
      || (await readFile(canonicalMarker, 'utf8')).trim() !== expectedSha) {
      throw new Error('active release changed during compare-and-swap');
    }
    await verifyProductionDeployLockOnHost({ lockDirectory, requiredUid, lockFd });
    await rename(temporary, canonicalMarker);
    await syncParent(canonicalMarker);
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true });
    throw error;
  }
}

async function syncParent(path) {
  const handle = await open(dirname(path), 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function exactObjectKeys(value, expected) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === [...expected].sort().join(',');
}

function invalidNativeState() {
  throw new Error('Native deployment state is invalid or changed');
}

export function validateNativeJournalState(value, candidateSha) {
  const hasInstallation = Object.hasOwn(value ?? {}, 'installation');
  const hasCandidateContainers = Object.hasOwn(value ?? {}, 'candidateContainers');
  if (!SHA_PATTERN.test(candidateSha)
    || !exactObjectKeys(value, ['before', 'quiesceState', 'installState', 'restoreState', 'candidateCheckpoint', ...(hasInstallation ? ['installation'] : []), ...(hasCandidateContainers ? ['candidateContainers'] : [])])
    || !['not_started', 'quiescing', 'quiesced', 'rollback_quiescing', 'rollback_quiesced'].includes(value.quiesceState)
    || !['not_attempted', 'install_attempting', 'installed'].includes(value.installState)
    || !['not_started', 'restore_attempting', 'restored_verified'].includes(value.restoreState)
    || !(value.candidateCheckpoint === null || (typeof value.candidateCheckpoint === 'string'
      && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(value.candidateCheckpoint)
      && Number.isFinite(Date.parse(value.candidateCheckpoint)) && new Date(value.candidateCheckpoint).toISOString() === value.candidateCheckpoint))
    || !exactObjectKeys(value.before, ['runtimeId', 'skillCatalogueId', 'timerEnableState', 'timerWasActive', 'producers', 'containers'])) invalidNativeState();
  const before = value.before;
  const validId = id => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/u.test(id);
  const absent = before.runtimeId === null && before.skillCatalogueId === null;
  if ((!absent && (!validId(before.runtimeId) || !validId(before.skillCatalogueId)))
    || !['enabled', 'enabled-runtime', 'disabled', 'not-found'].includes(before.timerEnableState)
    || typeof before.timerWasActive !== 'boolean'
    || (absent && (before.timerEnableState !== 'not-found' || before.timerWasActive))
    || (!absent && before.timerEnableState === 'not-found')
    || !exactObjectKeys(before.producers, ['api', 'web', 'agentWorker'])
    || Object.values(before.producers).some(running => typeof running !== 'boolean')
    || !exactObjectKeys(before.containers, ['api', 'web', 'agentWorker'])
    || Object.entries(before.containers).some(([service, id]) => !(id === null || /^[a-f0-9]{64}$/u.test(id))
      || (before.producers[service] && id === null))) invalidNativeState();
  const normalized = {
    before: {
      runtimeId: before.runtimeId, skillCatalogueId: before.skillCatalogueId,
      timerEnableState: before.timerEnableState, timerWasActive: before.timerWasActive,
      producers: { api: before.producers.api, web: before.producers.web, agentWorker: before.producers.agentWorker },
      containers: { api: before.containers.api, web: before.containers.web, agentWorker: before.containers.agentWorker },
    },
    quiesceState: value.quiesceState, installState: value.installState,
    restoreState: value.restoreState, candidateCheckpoint: value.candidateCheckpoint,
  };
  if (hasInstallation) {
    const receipt = value.installation;
    if (value.installState !== 'installed' || !exactObjectKeys(receipt, ['releaseSha', 'runtimeId', 'skillCatalogueId', 'timerDeferred'])
      || receipt.releaseSha !== candidateSha || receipt.runtimeId !== `installed-native-continuation-${candidateSha}`
      || receipt.skillCatalogueId !== `project-catalogue-${candidateSha}`
      || receipt.timerDeferred !== true) invalidNativeState();
    normalized.installation = { releaseSha: receipt.releaseSha, runtimeId: receipt.runtimeId,
      skillCatalogueId: receipt.skillCatalogueId, timerDeferred: true };
  }
  if (hasCandidateContainers) {
    const containers = value.candidateContainers;
    if (value.candidateCheckpoint === null || !exactObjectKeys(containers, ['api', 'web', 'agentWorker'])
      || Object.values(containers).some(id => typeof id !== 'string' || !/^[a-f0-9]{64}$/u.test(id))) invalidNativeState();
    normalized.candidateContainers = { api: containers.api, web: containers.web, agentWorker: containers.agentWorker };
  }
  if ((value.installState === 'installed') !== hasInstallation
    || (value.restoreState !== 'not_started' && value.installState !== 'installed')
    || (value.candidateCheckpoint !== null && value.installState !== 'installed')
    || (value.installState !== 'not_attempted' && ['not_started', 'quiescing'].includes(value.quiesceState))
    || (value.restoreState !== 'not_started' && value.quiesceState !== 'rollback_quiesced')) invalidNativeState();
  return normalized;
}

export function preserveNativeJournalState(current, supplied, candidateSha, create) {
  if (create) {
    if (supplied === undefined) return undefined;
    const initial = validateNativeJournalState(supplied, candidateSha);
    if (initial.installState !== 'not_attempted' || initial.quiesceState !== 'not_started'
      || initial.restoreState !== 'not_started' || initial.candidateCheckpoint !== null) invalidNativeState();
    return initial;
  }
  const hadNative = Object.hasOwn(current ?? {}, 'nativeRefresh');
  if (!hadNative) {
    if (supplied !== undefined) invalidNativeState();
    return undefined;
  }
  const previous = validateNativeJournalState(current.nativeRefresh, candidateSha);
  if (supplied === undefined) return previous;
  const next = validateNativeJournalState(supplied, candidateSha);
  const hadCandidateContainers = Object.hasOwn(previous, 'candidateContainers');
  const hasCandidateContainers = Object.hasOwn(next, 'candidateContainers');
  if ((hadCandidateContainers && (!hasCandidateContainers || JSON.stringify(next.candidateContainers) !== JSON.stringify(previous.candidateContainers)))
    || (!hadCandidateContainers && previous.candidateCheckpoint !== null && hasCandidateContainers)
    || (!hadCandidateContainers && previous.candidateCheckpoint === null && (next.candidateCheckpoint !== null) !== hasCandidateContainers)) invalidNativeState();
  if (JSON.stringify(next.before) !== JSON.stringify(previous.before)
    || !validMonotonicTransition(previous.installState, next.installState, ['not_attempted', 'install_attempting', 'installed'])
    || !validMonotonicTransition(previous.restoreState, next.restoreState, ['not_started', 'restore_attempting', 'restored_verified'])
    || !validMonotonicTransition(previous.quiesceState, next.quiesceState, ['not_started', 'quiescing', 'quiesced', 'rollback_quiescing', 'rollback_quiesced'])
    || (previous.candidateCheckpoint !== null && previous.candidateCheckpoint !== next.candidateCheckpoint)
    || (next.installState === 'install_attempting' && next.quiesceState !== 'quiesced')
    || (next.restoreState !== 'not_started' && next.quiesceState !== 'rollback_quiesced')
    || (previous.installation && JSON.stringify(next.installation) !== JSON.stringify(previous.installation))) invalidNativeState();
  return next;
}

function validMonotonicTransition(previous, next, states) {
  const index = states.indexOf(previous);
  return next === previous || next === states[index + 1];
}

export function transitionNativeJournalState(value, candidateSha, action, detail) {
  const next = validateNativeJournalState(value, candidateSha);
  switch (action) {
    case 'quiesce-start':
      if (next.quiesceState !== 'not_started') invalidNativeState();
      next.quiesceState = 'quiescing'; break;
    case 'quiesce-complete':
      if (next.quiesceState !== 'quiescing') invalidNativeState();
      next.quiesceState = 'quiesced'; break;
    case 'install-start':
      if (next.quiesceState !== 'quiesced' || next.installState !== 'not_attempted') invalidNativeState();
      next.installState = 'install_attempting'; break;
    case 'install-complete':
      if (next.installState !== 'install_attempting') invalidNativeState();
      next.installState = 'installed'; next.installation = detail; break;
    case 'candidate-start':
      if (next.installState !== 'installed' || next.candidateCheckpoint !== null
        || Object.hasOwn(next, 'candidateContainers') || next.restoreState !== 'not_started' || next.quiesceState !== 'quiesced'
        || !exactObjectKeys(detail, ['checkpoint', 'containers'])) invalidNativeState();
      next.candidateCheckpoint = detail.checkpoint; next.candidateContainers = detail.containers; break;
    case 'rollback-quiesce-start':
      if (next.quiesceState !== 'quiesced' || next.installState === 'install_attempting') invalidNativeState();
      next.quiesceState = 'rollback_quiescing'; break;
    case 'rollback-quiesce-complete':
      if (next.quiesceState !== 'rollback_quiescing') invalidNativeState();
      next.quiesceState = 'rollback_quiesced'; break;
    case 'restore-start':
      if (next.installState !== 'installed' || next.quiesceState !== 'rollback_quiesced' || next.restoreState !== 'not_started') invalidNativeState();
      next.restoreState = 'restore_attempting'; break;
    case 'restore-complete':
      if (next.restoreState !== 'restore_attempting'
        || !exactObjectKeys(detail, ['releaseSha', 'restored', 'timerDeferred', 'previousRuntimeId', 'previousSkillCatalogueId'])
        || detail.releaseSha !== candidateSha || detail.restored !== true || detail.timerDeferred !== true
        || detail.previousRuntimeId !== next.before.runtimeId || detail.previousSkillCatalogueId !== next.before.skillCatalogueId) invalidNativeState();
      next.restoreState = 'restored_verified'; break;
    default: invalidNativeState();
  }
  return validateNativeJournalState(next, candidateSha);
}

export function classifyNativeWorkSnapshot({ tasks, queue, processing, journals }, checkpoint) {
  const byId = new Map(tasks.map(task => [task.id, task]));
  const unfinished = task => task.status === 'pending' || task.status === 'running' || task.providerUncertain;
  const changed = value => checkpoint !== null && Date.parse(value) >= Date.parse(checkpoint);
  const safe = !tasks.some(task => task.status === 'running'
      || (unfinished(task) && changed(task.updatedAt)))
    && [...queue, ...processing].every(id => {
      const task = byId.get(id);
      return task?.status === 'pending' && !task.deletedAt && !task.providerUncertain;
    })
    && !journals.some(job => !['staging', 'pending', 'succeeded', 'failed', 'cancelled'].includes(job.state) || job.leaseToken !== null
      || job.leaseExpiresAt !== null || (!['succeeded', 'failed', 'cancelled'].includes(job.state) && changed(job.updatedAt)));
  return { safe, nativePending: tasks.some(task => task.status === 'pending' && !task.deletedAt && task.nativePending)
    || journals.some(job => job.state === 'pending' && job.kind !== 'source_parse'),
  nativeBoundPending: tasks.some(task => task.status === 'pending' && !task.deletedAt && task.nativeBound === true) };
}

async function nativeCommand(executable, args, { timeout = 30_000, allowFailure = false, env } = {}) {
  try {
    const result = await executeFile(executable, args, { timeout, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8', env });
    return result.stdout.trim();
  } catch (error) {
    if (allowFailure && Number.isInteger(error?.code)) return String(error.stdout ?? '').trim();
    throw new Error('Native deployment operation failed; journal retained');
  }
}

async function nativeFile(path, { optional = false } = {}) {
  let info;
  try { info = await lstat(path); } catch (error) { if (optional && error.code === 'ENOENT') return null; throw error; }
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== 0 || info.nlink !== 1
    || (info.mode & 0o022) !== 0 || info.size > 256 * 1024 || await realpath(path) !== path) invalidNativeState();
  return readFile(path, 'utf8');
}

async function nativeBinding() {
  const text = await nativeFile(`${NATIVE_ROOT}/runtime.env`, { optional: true });
  if (text === null) return { runtimeId: null, skillCatalogueId: null };
  const pick = key => {
    const values = text.split('\n').filter(line => line.startsWith(`${key}=`)).map(line => line.slice(key.length + 1).trim());
    if (values.length !== 1) invalidNativeState();
    return values[0];
  };
  return { runtimeId: pick('HERMES_NATIVE_RUNTIME_ID'), skillCatalogueId: pick('HERMES_NATIVE_SKILL_CATALOGUE_ID') };
}

function nativeCommandTimeout(deadline) {
  const timeout = deadline === undefined ? 30_000 : Math.min(30_000, Math.floor(deadline - performance.now()));
  if (timeout < 1) invalidNativeState();
  return timeout;
}

async function nativeContainers({ deadline, includeOneOff = false } = {}) {
  const result = {};
  for (const [key, service] of [['api', 'api'], ['web', 'web'], ['agentWorker', 'agent-worker']]) {
    const ids = await nativeCommand('docker', ['ps', '-aq', '--no-trunc', '--filter', 'label=com.docker.compose.project=openscience-prod',
      ...(includeOneOff ? [] : ['--filter', 'label=com.docker.compose.oneoff=False']), '--filter', `label=com.docker.compose.service=${service}`], { timeout: nativeCommandTimeout(deadline) });
    if (ids === '') { result[key] = null; continue; }
    if (!/^[a-f0-9]{64}$/u.test(ids)) invalidNativeState();
    const metadata = JSON.parse(await nativeCommand('docker', ['inspect', '--format', '{{json .}}', ids], { timeout: nativeCommandTimeout(deadline) }));
    if (metadata.Id !== ids || metadata.Config?.Labels?.['com.docker.compose.service'] !== service
      || metadata.Config?.Labels?.['com.docker.compose.project'] !== 'openscience-prod'
      || (includeOneOff && metadata.Config?.Labels?.['com.docker.compose.oneoff'] !== 'False')
      || metadata.HostConfig?.RestartPolicy?.Name !== 'unless-stopped'
      || !['', 'SIGTERM', '15', undefined].includes(metadata.Config?.StopSignal)
      || !['running', 'exited', 'created'].includes(metadata.State?.Status)) invalidNativeState();
    result[key] = metadata;
  }
  return result;
}

async function captureNativeState(rollbackSha) {
  const containers = await nativeContainers();
  const activity = await nativeCommand('systemctl', ['is-active', NATIVE_TIMER], { allowFailure: true });
  if (!['active', 'inactive', 'failed', 'unknown'].includes(activity)) invalidNativeState();
  const before = { ...await nativeBinding(),
    timerEnableState: (await nativeCommand('systemctl', ['show', NATIVE_TIMER, '--property=LoadState', '--value'])) === 'not-found'
      ? 'not-found' : await nativeCommand('systemctl', ['is-enabled', NATIVE_TIMER], { allowFailure: true }),
    timerWasActive: activity === 'active',
    producers: {}, containers: {} };
  for (const key of ['api', 'web', 'agentWorker']) {
    before.producers[key] = containers[key]?.State.Running === true;
    before.containers[key] = containers[key]?.Id ?? null;
    if (containers[key] !== null) {
      verifyNativeContainerBinding(containers[key], { service: key === 'agentWorker' ? 'agent-worker' : key,
        releaseSha: rollbackSha, ...before, running: before.producers[key] });
    }
  }
  return { before, quiesceState: 'not_started', installState: 'not_attempted', restoreState: 'not_started', candidateCheckpoint: null };
}

function verifyNeverStartedCandidate(container, service, installation) {
  const stopped = container?.State;
  const zeroTime = /^0001-01-01T00:00:00(?:\.0+)?Z$/u;
  if (!installation || !stopped || stopped.Running !== false || stopped.Status !== 'created'
    || stopped.ExitCode !== 0 || stopped.OOMKilled !== false || stopped.Error !== '' || container.RestartCount !== 0
    || typeof stopped.StartedAt !== 'string' || !zeroTime.test(stopped.StartedAt)
    || typeof stopped.FinishedAt !== 'string' || !zeroTime.test(stopped.FinishedAt)) invalidNativeState();
  verifyNativeContainerBinding(container, { service, releaseSha: installation.releaseSha, ...installation, running: false });
}

async function pauseNativeProducers(state, original) {
  const inventory = { includeOneOff: !original };
  const containers = await nativeContainers(inventory);
  if (original && Object.keys(containers).some(key => (containers[key]?.Id ?? null) !== state.before.containers[key])) invalidNativeState();
  if (!original) {
    if (state.candidateCheckpoint !== null) {
      if (!state.candidateContainers || Object.keys(containers).some(key => (containers[key]?.Id ?? null) !== state.candidateContainers[key])) invalidNativeState();
    } else {
      for (const [key, container] of Object.entries(containers)) {
        if ((container?.Id ?? null) === state.before.containers[key]) continue;
        verifyNeverStartedCandidate(container, key === 'agentWorker' ? 'agent-worker' : key, state.installState === 'installed' ? state.installation : undefined);
      }
    }
  }
  const running = Object.values(containers).filter(container => container?.State.Running).map(container => container.Id);
  // Docker receives an infinite daemon timeout. Only this client wait is bounded;
  // timeout cannot be interpreted as drain and never triggers docker kill.
  if (running.length) await nativeCommand('docker', ['stop', '--time', '-1', ...running], { timeout: 600_000 });
  for (const [service, container] of Object.entries(containers).filter(([, value]) => value)) {
    const stopped = JSON.parse(await nativeCommand('docker', ['inspect', '--format', '{{json .State}}', container.Id]));
    const command = container.Config?.Cmd;
    const previouslyQuiescedWeb = service === 'web' && container.State.Running === false
      && state.quiesceState === 'rollback_quiescing' && state.installState !== 'install_attempting' && state.restoreState !== 'restore_attempting'
      && state.before.producers.web === true
      && (state.candidateCheckpoint === null ? state.before.containers.web : state.candidateContainers?.web) === container.Id;
    // The legacy Web npm wrapper can report exit1 on SIGTERM; it owns no durable task drain.
    const webNpmStopExit = service === 'web' && (container.State.Running === true || previouslyQuiescedWeb)
      && container.Config?.Labels?.['com.docker.compose.service'] === 'web'
      && Array.isArray(command) && command.length === 3 && command[0] === 'npm' && command[1] === 'run' && command[2] === 'start'
      && container.Config?.WorkingDir === '/opt/openscience/apps/web'
      && stopped.Status === 'exited' && stopped.Running === false && stopped.OOMKilled === false && stopped.Error === '' && stopped.ExitCode === 1;
    if ((container.State.Running && (stopped.Status !== 'exited' || stopped.OOMKilled !== false))
      || (stopped.ExitCode !== 0 && !webNpmStopExit)) invalidNativeState();
    if (stopped.Running) invalidNativeState();
  }
  const after = await nativeContainers(inventory);
  if (Object.keys(containers).some(key => (after[key]?.Id ?? null) !== (containers[key]?.Id ?? null)
    || after[key]?.State.Running)) invalidNativeState();
}

async function holdNativeTimer() {
  const loaded = await nativeCommand('systemctl', ['show', NATIVE_TIMER, '--property=LoadState', '--value']);
  if (loaded === 'not-found') return;
  if (loaded !== 'loaded') invalidNativeState();
  await nativeCommand('systemctl', ['stop', NATIVE_TIMER]);
  await nativeCommand('systemctl', ['disable', NATIVE_TIMER]);
  await nativeCommand('systemctl', ['disable', '--runtime', NATIVE_TIMER]);
  if (!['inactive', 'failed'].includes(await nativeCommand('systemctl', ['is-active', NATIVE_TIMER], { allowFailure: true }))) invalidNativeState();
}

async function verifyNativeIdle() {
  const loaded = await nativeCommand('systemctl', ['show', NATIVE_TIMER, '--property=LoadState', '--value']);
  if (loaded !== 'not-found' && (loaded !== 'loaded'
    || (await nativeCommand('systemctl', ['is-enabled', NATIVE_TIMER], { allowFailure: true })) !== 'disabled'
    || !['inactive', 'failed'].includes(await nativeCommand('systemctl', ['is-active', NATIVE_TIMER], { allowFailure: true })))) invalidNativeState();
  if (!['inactive', 'failed', 'unknown'].includes(await nativeCommand('systemctl', ['is-active', 'openscience-hermes-broker.service'], { allowFailure: true }))) invalidNativeState();
  if (await nativeCommand('systemctl', ['list-units', '--no-legend', '--plain', '--state=active,activating,deactivating', 'openscience-hermes@*.service'])) invalidNativeState();
  try {
    const info = await lstat(`${NATIVE_ROOT}/inbox`);
    if (!info.isDirectory() || info.isSymbolicLink() || (await readdir(`${NATIVE_ROOT}/inbox`)).length) invalidNativeState();
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

async function verifyNativeBinding(expected) {
  const binding = await nativeBinding();
  if (binding.runtimeId !== expected.runtimeId || binding.skillCatalogueId !== expected.skillCatalogueId) invalidNativeState();
  if (binding.runtimeId === null) return;
  const match = /^installed-native-continuation-([a-f0-9]{40})$/u.exec(binding.runtimeId);
  if (!match || binding.skillCatalogueId !== `project-catalogue-${match[1]}`) invalidNativeState();
  const release = `${NATIVE_ROOT}/releases/${match[1]}`;
  if ((await nativeFile(`${release}/runtime/.runtime-id`)).trim() !== binding.runtimeId
    || (await nativeFile(`${release}/catalogue/.catalogue-id`)).trim() !== binding.skillCatalogueId) invalidNativeState();
  const instance = await nativeFile('/etc/systemd/system/openscience-hermes@.service');
  const broker = await nativeFile('/etc/systemd/system/openscience-hermes-broker.service');
  if (!instance.includes(`RootDirectory=${release}/root\n`)
    || !instance.includes(`BindReadOnlyPaths=${release}/runtime:/opt/hermes-agent\n`)
    || !instance.includes(`BindReadOnlyPaths=${release}/catalogue:/catalogue\n`)
    || !instance.includes(`BindReadOnlyPaths=${release}/adapter:/adapter\n`)
    || !broker.includes(`ExecStart=/usr/bin/python3 ${release}/adapter/host_broker.py\n`)) invalidNativeState();
}

export function verifyNativeContainerBinding(container, { service, releaseSha, runtimeId, skillCatalogueId, running, requireHealthy = true }) {
  if (!container || container.Config?.Labels?.['com.docker.compose.service'] !== service
    || container.Config?.Labels?.['com.docker.compose.project.working_dir'] !== `/opt/openscience-releases/${releaseSha}`
    || container.State?.Running !== running || (running && requireHealthy && container.State?.Health?.Status !== 'healthy')
    || !container.Mounts?.some(mount => mount.Type === 'bind' && mount.Source === `/opt/openscience-releases/${releaseSha}`
      && mount.Destination === '/opt/openscience' && mount.RW === false)
    || (service === 'agent-worker' && container.Config.Image !== `openscience-agent-worker:${releaseSha}`)) invalidNativeState();
  if (service === 'web') return;
  const values = (container.Config.Env ?? []).filter(value => /^HERMES_NATIVE_(?:AGENT_ENABLED|RUNTIME_ID|SKILL_CATALOGUE_ID|AGENT_MODEL|AGENT_INBOX)=/u.test(value));
  const env = new Map(values.map(value => { const split = value.indexOf('='); return [value.slice(0, split), value.slice(split + 1)]; }));
  if (values.length !== env.size) invalidNativeState();
  if (runtimeId === null) {
    if (env.get('HERMES_NATIVE_AGENT_ENABLED') === 'true' || env.get('HERMES_NATIVE_RUNTIME_ID') || env.get('HERMES_NATIVE_SKILL_CATALOGUE_ID')) invalidNativeState();
    return;
  }
  if (env.get('HERMES_NATIVE_AGENT_ENABLED') !== 'true' || env.get('HERMES_NATIVE_RUNTIME_ID') !== runtimeId
    || env.get('HERMES_NATIVE_SKILL_CATALOGUE_ID') !== skillCatalogueId || env.get('HERMES_NATIVE_AGENT_MODEL') !== 'MiniMax-M3'
    || env.get('HERMES_NATIVE_AGENT_INBOX') !== '/native-agent/inbox') invalidNativeState();
  if (service === 'agent-worker' && !container.Mounts?.some(mount => mount.Type === 'bind'
    && mount.Source === `${NATIVE_ROOT}/inbox` && mount.Destination === '/native-agent/inbox' && mount.RW === true)) invalidNativeState();
}

async function startNativeApplication(state, options, verifyContainers, restoreTimer) {
  const expected = options.target === 'original' ? state.before : state.installation;
  const releaseSha = options.target === 'original' ? options.rollbackSha : options.candidateSha;
  if (!expected || (options.target === 'candidate' && (state.installState !== 'installed'
    || state.restoreState !== 'not_started' || state.quiesceState !== 'quiesced'
    || state.candidateCheckpoint === null || !state.candidateContainers))
    || (options.target === 'original' && (state.quiesceState !== 'rollback_quiesced'
      || !((state.installState === 'not_attempted' && state.restoreState === 'not_started')
        || (state.installState === 'installed' && state.restoreState === 'restored_verified'))))) invalidNativeState();
  const roles = [['api', 'api'], ['web', 'web'], ['agentWorker', 'agent-worker']];
  const captured = await nativeContainers({ includeOneOff: true, deadline: performance.now() + 300_000 }), ids = {};
  for (const [key, service] of roles) {
    verifyNeverStartedCandidate(captured[key], service, { ...expected, releaseSha });
    ids[key] = captured[key].Id;
    if (options.target === 'candidate' && ids[key] !== state.candidateContainers[key]) invalidNativeState();
  }
  const started = new Set();
  const check = async (deadline = performance.now() + 300_000, waiting) => {
    await verifyNativeBinding(expected);
    const containers = await nativeContainers({ includeOneOff: true, deadline });
    nativeCommandTimeout(deadline);
    for (const [key, service] of roles) {
      const container = containers[key];
      if (container?.Id !== ids[key]) invalidNativeState();
      if (!started.has(key)) verifyNeverStartedCandidate(container, service, { ...expected, releaseSha });
      else {
        verifyNativeContainerBinding(container, { service, releaseSha, ...expected, running: true, requireHealthy: key !== waiting });
        if (container.State.Status !== 'running' || container.State.ExitCode !== 0 || container.State.OOMKilled !== false
          || container.State.Error !== '' || container.RestartCount !== 0
          || !['starting', 'healthy'].includes(container.State.Health?.Status)) invalidNativeState();
      }
    }
    return containers;
  };
  const start = async key => {
    if (!state.before.producers[key]) return;
    const deadline = performance.now() + 300_000;
    await check(deadline);
    await nativeCommand('docker', ['start', ids[key]], { timeout: nativeCommandTimeout(deadline) });
    started.add(key);
    for (;;) {
      const containers = await check(deadline, key);
      if (containers[key].State.Health.Status === 'healthy') return;
      await new Promise(resolve => setTimeout(resolve, Math.min(1_000, nativeCommandTimeout(deadline))));
    }
  };
  await start('api'); await start('web');
  await check(); await verifyContainers(['api', 'web']);
  await restoreTimer(() => check());
  await check(); await start('agentWorker');
  await check(); await verifyContainers(['agent-worker']);
}

const NATIVE_WORK_QUERY = `
import {createPrismaClient,createRedisClient} from '@openscience/database';
import {AGENT_TASK_QUEUE,readNativeAgentExecution} from '@openscience/domain';
import {classifyNativeWorkSnapshot} from '../../infra/scripts/production-deploy-lock.mjs';
if(!process.env.DATABASE_URL||!process.env.REDIS_URL)throw Error('Native work configuration missing');
const prisma=createPrismaClient(),redis=createRedisClient();
try {
 const rollback=process.argv[2]==='rollback';
 const tasks=await prisma.$queryRawUnsafe("SELECT id,status,kind,deleted_at,updated_at,error, CASE WHEN result ? 'nativeAgentExecution' THEN jsonb_build_object('nativeAgentExecution',result->'nativeAgentExecution','nativeImageReview',result->'nativeImageReview') ELSE NULL END AS result FROM agent_tasks WHERE status IN ('pending','running') OR result#>>'{nativeAgentExecution,checkpoint,state}'='started' OR error ~* 'unknown|uncertain'"+(rollback?" OR result ? 'nativeAgentExecution' OR kind='presentation.generate' AND result IS NOT NULL":""));
 const journals=await prisma.journalJob.findMany({select:{state:true,kind:true,leaseToken:true,leaseExpiresAt:true,updatedAt:true}});
 const [queue,processing]=await Promise.all([redis.lrange(AGENT_TASK_QUEUE,0,-1),redis.lrange(AGENT_TASK_QUEUE+':processing',0,-1)]);
 const snapshot={tasks:tasks.map(t=>{const n=readNativeAgentExecution(t.result);return{id:t.id,status:t.status,deletedAt:t.deleted_at,nativeBound:!!n,nativePending:!!n||['sdf.extract','presentation.generate'].includes(t.kind),providerUncertain:n?.checkpoint?.state==='started'||/unknown|uncertain/i.test(t.error??''),updatedAt:t.updated_at.toISOString()};}),journals:journals.map(j=>({...j,updatedAt:j.updatedAt.toISOString()})),queue,processing};
 const checkpoint=process.argv[1]==='none'?null:process.argv[1];
 const classified=classifyNativeWorkSnapshot(snapshot,checkpoint);
 let persistence;
 if(rollback){
  const [first]=await prisma.$queryRawUnsafe("SELECT EXISTS(SELECT 1 FROM hermes_research_runs WHERE idempotency_key LIKE 'hermes-first-image:%' OR profile='visual-narrative-v1' AND max_agent_tasks=2) AS runs, EXISTS(SELECT 1 FROM audit_logs WHERE action='hermes.research_run.first_image' AND target_type='hermes_research_run') AS receipts, EXISTS(SELECT 1 FROM hermes_research_steps s JOIN hermes_research_runs r ON r.id=s.run_id WHERE r.idempotency_key LIKE 'hermes-first-image:%' OR r.profile='visual-narrative-v1' AND r.max_agent_tasks=2) AS steps");
  if(!first||![first.runs,first.receipts,first.steps].every(v=>typeof v==='boolean'))throw Error('Rollback recovery state unknown');
  persistence={native:snapshot.tasks.some(t=>t.nativeBound),paidUnknown:snapshot.tasks.some(t=>t.providerUncertain),firstImage:first.runs||first.receipts||first.steps};
 }
 const [clock]=await prisma.$queryRawUnsafe('SELECT clock_timestamp() AS now');
 process.stdout.write(JSON.stringify({...classified,dbTime:clock.now.toISOString(),...(rollback?{persistence}:{})}));
}finally{await prisma.$disconnect();await redis.quit();}
`;

async function queryNativeWork(candidateSha, checkpoint, rollbackDiagnostics = false) {
  const root = `/opt/openscience-releases/${candidateSha}`;
  const output = await nativeCommand('docker', ['compose', '--project-name', 'openscience-prod', '--project-directory', root,
    '--env-file', '/opt/openscience/.env.prod', '-f', `${root}/infra/compose/docker-compose.prod.yml`,
    'run', '--rm', '--no-deps', '-T', '-w', '/opt/openscience/apps/agent-worker', '--entrypoint', 'node', 'agent-worker',
    '--input-type=module', '-e', NATIVE_WORK_QUERY, checkpoint ?? 'none', ...(rollbackDiagnostics ? ['rollback'] : [])], { timeout: 120_000,
    env: { ...process.env, XGS_RELEASE_ROOT: root, XGS_RELEASE_IMAGE_TAG: candidateSha } });
  const result = JSON.parse(output);
  if (!exactObjectKeys(result, ['safe', 'nativePending', 'nativeBoundPending', 'dbTime', ...(rollbackDiagnostics ? ['persistence'] : [])])
    || (rollbackDiagnostics ? typeof result.safe !== 'boolean' : result.safe !== true)
    || typeof result.nativePending !== 'boolean' || typeof result.nativeBoundPending !== 'boolean'
    || !Number.isFinite(Date.parse(result.dbTime)) || rollbackDiagnostics && (!exactObjectKeys(result.persistence, ['native', 'paidUnknown', 'firstImage'])
      || !Object.values(result.persistence).every(value => typeof value === 'boolean'))) invalidNativeState();
  return result;
}

function parseNativeCli(argv, command) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index + 1] || flags.has(argv[index])) invalidNativeState();
    flags.set(argv[index], argv[index + 1]);
  }
  const targetCommands = ['native-verify-stopped', 'native-api-web-ready', 'native-worker-ready', 'native-restore-timer', 'native-start-application'];
  const allowed = ['--candidate', '--rollback', '--lock-fd',
    ...(targetCommands.includes(command) ? ['--target'] : []), ...(command === 'native-original-running' ? ['--service'] : [])];
  if (flags.size !== allowed.length || [...flags.keys()].some(flag => !allowed.includes(flag))
    || !SHA_PATTERN.test(flags.get('--candidate')) || !SHA_PATTERN.test(flags.get('--rollback')) || flags.get('--lock-fd') !== '9'
    || (targetCommands.includes(command) && !['candidate', 'original'].includes(flags.get('--target')))
    || (command === 'native-original-running' && !['api', 'web', 'agent-worker'].includes(flags.get('--service')))) invalidNativeState();
  return { journalPath: PRODUCTION_JOURNAL, candidateSha: flags.get('--candidate'), rollbackSha: flags.get('--rollback'),
    lockDirectory: PRODUCTION_LOCK_DIRECTORY, lockFd: 9, requiredUid: 0,
    target: flags.get('--target'), service: flags.get('--service') };
}

async function nativeOperation(command, options) {
  await verifyProductionDeployLockOnHost(options);
  if (command === 'native-capture') {
    const state = validateNativeJournalState(await captureNativeState(options.rollbackSha), options.candidateSha);
    await verifyNativeBinding(state.before);
    return JSON.stringify(state);
  }
  const journal = await readTrustedJournal(options);
  if (journal.candidateSha !== options.candidateSha || journal.rollbackSha !== options.rollbackSha || !journal.nativeRefresh) invalidNativeState();
  let state = journal.nativeRefresh;
  const update = async (action, detail) => {
    const next = transitionNativeJournalState(state, options.candidateSha, action, detail);
    await writeProductionDeployJournal({ ...options, phase: journal.phase, create: false, native: next });
    state = next;
  };
  const expected = options.target === 'original' ? state.before : state.installation;
  if (options.target === 'original' && state.installState === 'installed' && state.restoreState !== 'restored_verified') invalidNativeState();
  const verifyContainers = async services => {
    if (!expected) invalidNativeState();
    await verifyNativeBinding(expected);
    const containers = await nativeContainers();
    for (const service of services) {
      const key = service === 'agent-worker' ? 'agentWorker' : service;
      verifyNativeContainerBinding(containers[key], { service,
        releaseSha: options.target === 'original' ? options.rollbackSha : options.candidateSha,
        ...expected, running: command === 'native-verify-stopped' ? false : state.before.producers[key] });
    }
  };
  const restoreTimer = async checkIds => {
    if (!expected) invalidNativeState();
    await verifyContainers(['api', 'web']);
    const work = await queryNativeWork(options.candidateSha, null);
    if (state.before.producers.agentWorker && work.nativePending && !state.before.timerWasActive) invalidNativeState();
    if (checkIds) await checkIds();
    if (state.before.timerEnableState !== 'not-found') {
      await holdNativeTimer();
      if (checkIds) await checkIds();
      if (state.before.timerEnableState === 'enabled') await nativeCommand('systemctl', ['enable', NATIVE_TIMER]);
      else if (state.before.timerEnableState === 'enabled-runtime') await nativeCommand('systemctl', ['enable', '--runtime', NATIVE_TIMER]);
      if (state.before.timerWasActive) await nativeCommand('systemctl', ['start', NATIVE_TIMER]);
      if ((await nativeCommand('systemctl', ['is-enabled', NATIVE_TIMER], { allowFailure: true })) !== state.before.timerEnableState
        || ((await nativeCommand('systemctl', ['is-active', NATIVE_TIMER], { allowFailure: true })) === 'active') !== state.before.timerWasActive) invalidNativeState();
    }
    if (checkIds) await checkIds();
  };
  if (command === 'native-original-running') return state.before.producers[options.service === 'agent-worker' ? 'agentWorker' : options.service] ? '1' : '0';
  if (command === 'native-pause-original') {
    if (!['migrating', 'switching'].includes(journal.phase)) invalidNativeState();
    await update('quiesce-start');
    await pauseNativeProducers(state, true);
    await holdNativeTimer(); await verifyNativeIdle();
    await update('quiesce-complete');
  } else if (command === 'native-install') {
    if (journal.phase !== 'switching') invalidNativeState();
    if (Object.values(await nativeContainers()).some(container => container?.State.Running)) invalidNativeState();
    await verifyNativeIdle();
    // The candidate schema is available only after the outer migration completes.
    // Existing Native markers pin pending tasks to their original immutable host.
    const work = await queryNativeWork(options.candidateSha, null);
    if (work.nativeBoundPending) invalidNativeState();
    const root = `/opt/openscience-releases/${options.candidateSha}`;
    const snapshot = `/opt/openscience/.native-runtime-${options.candidateSha}-${randomUUID()}.json`;
    let file, created = false;
    try {
      file = await open(snapshot, 'wx', 0o600);
      created = true;
      const receipt = await nativeCommand('/usr/bin/node', [`${root}/scripts/release-input-manifest.mjs`, 'runtime-snapshot', '--root', root, '--sha', options.candidateSha], { timeout: 900_000 });
      await file.writeFile(`${receipt}\n`); await file.sync(); await file.close(); file = undefined;
      await update('install-start');
      const installed = JSON.parse(await nativeCommand('/usr/bin/python3', ['-B', `${root}/infra/hermes-agent/install.py`, '--source', root, '--runtime-snapshot', snapshot, '--defer-timer'], { timeout: 2700_000 }));
      await update('install-complete', installed);
      await verifyNativeBinding(state.installation); await verifyNativeIdle();
    } finally { await file?.close().catch(() => {}); if (created) await rm(snapshot, { force: true }); }
  } else if (command === 'native-before-start') {
    if (state.installState !== 'installed' || state.candidateCheckpoint !== null || Object.hasOwn(state, 'candidateContainers')
      || state.restoreState !== 'not_started' || state.quiesceState !== 'quiesced') invalidNativeState();
    const work = await queryNativeWork(options.candidateSha, null);
    const containers = await nativeContainers({ includeOneOff: true }), ids = {};
    for (const [key, service] of [['api', 'api'], ['web', 'web'], ['agentWorker', 'agent-worker']]) {
      verifyNeverStartedCandidate(containers[key], service, state.installation);
      ids[key] = containers[key].Id;
    }
    await update('candidate-start', { checkpoint: work.dbTime, containers: ids });
  } else if (command === 'native-hold-producers') {
    if (state.quiesceState === 'not_started') await update('quiesce-start');
    else if (state.quiesceState === 'quiesced') await update('rollback-quiesce-start');
    await pauseNativeProducers(state, false); await holdNativeTimer();
  } else if (command === 'native-prepare-rollback') {
    if (state.installState === 'install_attempting' || state.restoreState === 'restore_attempting'
      || !['not_started', 'quiesced', 'rollback_quiescing'].includes(state.quiesceState)) invalidNativeState();
    if (state.quiesceState === 'not_started') {
      await update('quiesce-start'); await pauseNativeProducers(state, true);
      await holdNativeTimer(); await verifyNativeIdle(); await update('quiesce-complete');
    }
    if (state.quiesceState === 'quiesced') await update('rollback-quiesce-start');
    await pauseNativeProducers(state, false); await holdNativeTimer(); await verifyNativeIdle();
    await queryNativeWork(options.candidateSha, state.candidateCheckpoint);
    await update('rollback-quiesce-complete');
    if (state.installState === 'installed') {
      await update('restore-start');
      const restored = JSON.parse(await nativeCommand('/usr/bin/python3', ['-B', `/opt/openscience-releases/${options.candidateSha}/infra/hermes-agent/install.py`, '--restore-previous', options.candidateSha], { timeout: 900_000 }));
      await verifyNativeBinding(state.before); await verifyNativeIdle();
      await update('restore-complete', restored);
    } else await verifyNativeBinding(state.before);
  } else if (command === 'native-verify-stopped') await verifyContainers(['api', 'web', 'agent-worker']);
  else if (command === 'native-api-web-ready') await verifyContainers(['api', 'web']);
  else if (command === 'native-worker-ready') await verifyContainers(['agent-worker']);
  else if (command === 'native-restore-timer') await restoreTimer();
  else if (command === 'native-start-application') await startNativeApplication(state, options, verifyContainers, restoreTimer);
  else invalidNativeState();
  return 'NATIVE_OPERATION_OK';
}

async function readTrustedJournal({ journalPath, requiredUid }) {
  const info = await lstat(journalPath);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.uid !== requiredUid
    || (info.mode & 0o777) !== 0o600 || await realpath(journalPath) !== journalPath) {
    throw new Error('production deploy journal is unsafe');
  }
  let journal;
  try { journal = JSON.parse(await readFile(journalPath, 'utf8')); }
  catch { throw new Error('production deploy journal identity is invalid'); }
  const hasNative = Object.hasOwn(journal ?? {}, 'nativeRefresh');
  if (!journal || typeof journal !== 'object' || Array.isArray(journal)
    || !exactObjectKeys(journal, ['candidateSha', 'phase', 'rollbackSha', 'schemaVersion', 'updatedAt', ...(hasNative ? ['nativeRefresh'] : [])])
    || journal.schemaVersion !== 1 || !SHA_PATTERN.test(journal.candidateSha)
    || !SHA_PATTERN.test(journal.rollbackSha) || !JOURNAL_PHASES.has(journal.phase)
    || typeof journal.updatedAt !== 'string') {
    throw new Error('production deploy journal identity is invalid');
  }
  if (hasNative) journal.nativeRefresh = validateNativeJournalState(journal.nativeRefresh, journal.candidateSha);
  return journal;
}

export async function writeProductionDeployJournal({
  journalPath,
  candidateSha,
  rollbackSha,
  phase,
  create,
  lockDirectory,
  requiredUid = 0,
  lockFd,
  native,
}) {
  if (!SHA_PATTERN.test(candidateSha) || !SHA_PATTERN.test(rollbackSha)
    || !JOURNAL_PHASES.has(phase) || typeof create !== 'boolean') {
    throw new Error('production deploy journal arguments are invalid');
  }
  await verifyProductionDeployLockOnHost({ lockDirectory, requiredUid, lockFd });
  let current;
  if (create) {
    try {
      await lstat(journalPath);
      throw new Error('unfinished production deploy journal already exists');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  } else {
    current = await readTrustedJournal({ journalPath, requiredUid });
    if (current.candidateSha !== candidateSha || current.rollbackSha !== rollbackSha) {
      throw new Error('production deploy journal belongs to another transaction');
    }
  }
  const nativeState = preserveNativeJournalState(current, native, candidateSha, create);
  const temporary = `${journalPath}.${process.pid}.${randomUUID()}.next`;
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify({
      schemaVersion: 1,
      candidateSha,
      rollbackSha,
      phase,
      updatedAt: new Date().toISOString(),
      ...(nativeState === undefined ? {} : { nativeRefresh: nativeState }),
    })}\n`);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await verifyProductionDeployLockOnHost({ lockDirectory, requiredUid, lockFd });
    if (create) {
      try {
        await lstat(journalPath);
        throw new Error('unfinished production deploy journal appeared during publication');
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
    await rename(temporary, journalPath);
    await syncParent(journalPath);
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function clearProductionDeployJournal({
  journalPath,
  candidateSha,
  rollbackSha,
  lockDirectory,
  requiredUid = 0,
  lockFd,
}) {
  await verifyProductionDeployLockOnHost({ lockDirectory, requiredUid, lockFd });
  const current = await readTrustedJournal({ journalPath, requiredUid });
  if (current.candidateSha !== candidateSha || current.rollbackSha !== rollbackSha) {
    throw new Error('production deploy journal belongs to another transaction');
  }
  const native = current.nativeRefresh;
  if (native && (['quiescing', 'rollback_quiescing'].includes(native.quiesceState)
    || native.installState === 'install_attempting' || native.restoreState === 'restore_attempting'
    || (native.installState === 'not_attempted' && !['not_started', 'rollback_quiesced'].includes(native.quiesceState))
    || (native.installState === 'installed' && native.candidateCheckpoint === null && native.restoreState !== 'restored_verified'))) {
    throw new Error('Native deployment state is uncertain; journal retained');
  }
  await rm(journalPath);
  await syncParent(journalPath);
}

export function validateProductionSwitchState({
  activeSha,
  rollbackSha,
  acceptedWorkerImageId,
  acceptedParserImageId,
  currentWorkerImageId,
  currentParserImageId,
  runningWorkerImageId,
  runningParserImageId,
}) {
  if (!SHA_PATTERN.test(activeSha) || !SHA_PATTERN.test(rollbackSha)
    || ![acceptedWorkerImageId, acceptedParserImageId, currentWorkerImageId, currentParserImageId]
      .every((value) => IMAGE_PATTERN.test(value))) {
    throw new Error('production switch identity is malformed');
  }
  if (activeSha !== rollbackSha) throw new Error('active release changed after deploy preflight');
  if (currentWorkerImageId !== acceptedWorkerImageId
    || currentParserImageId !== acceptedParserImageId) {
    throw new Error('release SHA image tag changed after formal acceptance');
  }
  const running = [runningWorkerImageId, runningParserImageId];
  if (running.some((value) => value !== undefined)) {
    if (!running.every((value) => IMAGE_PATTERN.test(value))) {
      throw new Error('running production image identity is malformed');
    }
    if (runningWorkerImageId !== acceptedWorkerImageId
      || runningParserImageId !== acceptedParserImageId) {
      throw new Error('running production container image differs from formal acceptance');
    }
  }
}

function parseActiveCasCli(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || !value || values.has(flag)) {
      throw new Error('invalid active release compare-and-swap arguments');
    }
    values.set(flag, value);
  }
  if (values.size !== 4 || values.get('--marker') !== PRODUCTION_ACTIVE_MARKER
    || !values.has('--expected') || !values.has('--next')
    || values.get('--lock-fd') !== '9') {
    throw new Error('active release compare-and-swap requires the fixed production marker');
  }
  return {
    markerPath: values.get('--marker'), expectedSha: values.get('--expected'), nextSha: values.get('--next'),
    lockDirectory: PRODUCTION_LOCK_DIRECTORY, requiredUid: 0, lockFd: 9,
  };
}

function parseSwitchCli(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || !value || values.has(flag)) {
      throw new Error('invalid production switch verifier arguments');
    }
    values.set(flag, value);
  }
  const required = [
    '--active-sha', '--rollback-sha', '--accepted-worker-image-id', '--accepted-parser-image-id',
    '--current-worker-image-id', '--current-parser-image-id',
  ];
  if (required.some((flag) => !values.has(flag))) throw new Error('production switch verifier arguments are incomplete');
  const optional = ['--running-worker-image-id', '--running-parser-image-id'];
  if ([...values.keys()].some((flag) => !required.includes(flag) && !optional.includes(flag))
    || optional.filter((flag) => values.has(flag)).length === 1) {
    throw new Error('production switch verifier arguments are invalid');
  }
  return {
    activeSha: values.get('--active-sha'),
    rollbackSha: values.get('--rollback-sha'),
    acceptedWorkerImageId: values.get('--accepted-worker-image-id'),
    acceptedParserImageId: values.get('--accepted-parser-image-id'),
    currentWorkerImageId: values.get('--current-worker-image-id'),
    currentParserImageId: values.get('--current-parser-image-id'),
    runningWorkerImageId: values.get('--running-worker-image-id'),
    runningParserImageId: values.get('--running-parser-image-id'),
  };
}

function parseJournalCli(argv, command) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || !value || values.has(flag)) {
      throw new Error('invalid production deploy journal arguments');
    }
    values.set(flag, value);
  }
  const hasNative = values.has('--native-state');
  const allowed = ['--journal', '--candidate', '--rollback', '--lock-fd',
    ...(command === 'journal-clear' ? [] : ['--phase', '--native-state'])];
  const expectedSize = command === 'journal-clear' ? 4 : 5 + Number(hasNative);
  if (values.size !== expectedSize || values.get('--journal') !== PRODUCTION_JOURNAL
    || [...values.keys()].some(flag => !allowed.includes(flag))
    || !values.has('--candidate') || !values.has('--rollback') || values.get('--lock-fd') !== '9'
    || (command !== 'journal-clear' && !JOURNAL_PHASES.has(values.get('--phase')))) {
    throw new Error('production deploy journal requires fixed production paths and FD9');
  }
  let native;
  if (hasNative) {
    const input = values.get('--native-state');
    if (Buffer.byteLength(input, 'utf8') > 4096) invalidNativeState();
    try { native = JSON.parse(input); } catch { invalidNativeState(); }
    native = validateNativeJournalState(native, values.get('--candidate'));
  }
  return {
    journalPath: values.get('--journal'),
    candidateSha: values.get('--candidate'),
    rollbackSha: values.get('--rollback'),
    phase: values.get('--phase'),
    create: command === 'journal-start',
    lockDirectory: PRODUCTION_LOCK_DIRECTORY,
    requiredUid: 0,
    lockFd: 9,
    ...(hasNative ? { native } : {}),
  };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === 'application-rollback-preflight') {
    process.stdout.write(`${await applicationRollbackPreflight(parseNativeCli(argv.slice(1), argv[0]))}\n`);
  } else if (['native-capture', 'native-pause-original', 'native-install', 'native-before-start', 'native-prepare-rollback',
    'native-hold-producers', 'native-verify-stopped', 'native-api-web-ready', 'native-worker-ready', 'native-restore-timer', 'native-original-running', 'native-start-application'].includes(argv[0])) {
    process.stdout.write(`${await nativeOperation(argv[0], parseNativeCli(argv.slice(1), argv[0]))}\n`);
  } else if (argv[0] === 'verify-state') {
    validateProductionSwitchState(parseSwitchCli(argv.slice(1)));
    process.stdout.write('PRODUCTION_SWITCH_STATE_OK\n');
  } else if (argv[0] === 'cas-active') {
    await compareAndSwapActiveRelease(parseActiveCasCli(argv.slice(1)));
    process.stdout.write('ACTIVE_RELEASE_CAS_OK\n');
  } else if (['journal-start', 'journal-update'].includes(argv[0])) {
    await writeProductionDeployJournal(parseJournalCli(argv.slice(1), argv[0]));
    process.stdout.write('PRODUCTION_DEPLOY_JOURNAL_OK\n');
  } else if (argv[0] === 'journal-clear') {
    await clearProductionDeployJournal(parseJournalCli(argv.slice(1), argv[0]));
    process.stdout.write('PRODUCTION_DEPLOY_JOURNAL_CLEARED\n');
  } else {
    throw new Error(`usage: ${basename(process.argv[1] ?? 'production-deploy-lock.mjs')} <verify-state|cas-active|journal-start|journal-update|journal-clear>`);
  }
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(process.argv[2]?.startsWith('native-') ? 'Native deployment operation failed; durable journal retained'
      : error instanceof Error ? error.message : 'production deploy contract command failed');
    process.exitCode = 64;
  });
}
