#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { execFile, spawnSync } from 'node:child_process';
import { promisify, types as nodeUtilTypes } from 'node:util';
import { existsSync, fstatSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import {
  chmod, lstat, open, readFile, readdir, realpath, rename, rm,
} from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

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
  rollbackProofContexts.set(entries, { ts, root, roots, program, checker, modules, canonical,
    sourceHost: host, resolveSource });
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
    let live = fn(illustration, 'runNativeIllustrationTask');
    const replay = fn(illustration, 'replayNativeVideoPlan');
    let composedEntry;
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

    if (illustration.statements.some(node => ts.isFunctionDeclaration(node) && node.name?.text === 'runNativeIllustrationTaskCore')) {
      const entry = finiteSelectedGuideIllustrationWitness(ts, { program, checker, root: sourceRoot });
      const core = entry.core, coreInput = core.parameters[0].name;
      const workspace = entry.selectedCalls[0].getSourceFile(), owner = enclosing(entry.selectedCalls[0]);
      need(owner?.name?.text === 'workspaceGuideHandler' && owner.parameters.length === 4,
        'SELECTED_VIDEO_TASK_SUPPLIER_UNKNOWN', owner);
      const task = owner.parameters[2].name, deps = owner.parameters[1].name;
      const ownerTask = variable(owner, 'ownerTask'), payload = variable(owner, 'payload');
      const authority = variable(owner, 'authority'), selected = variable(owner, 'selected');
      const authorityFn = fn(file('packages/domain/src/agent/native-agent-execution.ts'), 'requireNativeAgentExecutionAuthority');
      const equal = importOf(workspace, 'node:util', 'isDeepStrictEqual');
      const ownerRoles = { task, deps, ownerTask: ownerTask.name, payload: payload.name,
        authority: authority.name, selected: selected.name, requireNativeAgentExecutionAuthority: authorityFn.name, isDeepStrictEqual: equal };
      need(ts.isAwaitExpression(ownerTask.initializer)
        && match(ownerTask.initializer, 'deps.prisma.agentTask.findUnique({ where: { id: task.id }, include: { session: true } })', ownerRoles)
        && ts.isAwaitExpression(authority.initializer)
        && match(authority.initializer, "deps.prisma.$transaction(tx => requireNativeAgentExecutionAuthority(tx, { taskId: task.id, executionAttempt: task.executionAttempt }), { isolationLevel: 'Serializable' })", ownerRoles)
        && match(selected.initializer, 'authority.selectedImageSource', ownerRoles), 'SELECTED_VIDEO_TASK_SUPPLIER_UNKNOWN', authority);
      const selectedCall = entry.selectedCalls[0], supplied = selectedCall.arguments[0], suppliedTask = objectProperty(supplied, 'task');
      need(match(suppliedTask, '{ id: task.id, executionAttempt: task.executionAttempt, result: ownerTask.result }', ownerRoles)
        && match(objectProperty(supplied, 'selectedImage'), '{ binding: selected.binding, illustration: selected.illustration, userRequest: payload.goal }', ownerRoles),
      'SELECTED_VIDEO_TASK_SUPPLIER_UNKNOWN', suppliedTask);
      const throwingGuard = (statement, expression, roles) => ts.isIfStatement(statement) && !statement.elseStatement
        && match(statement.expression, expression, roles) && ts.isThrowStatement(statement.thenStatement);
      need(owner.body.statements.some(statement => throwingGuard(statement, "!ownerTask || ownerTask.kind !== 'workspace.guide'", ownerRoles)),
        'SELECTED_VIDEO_TASK_SUPPLIER_UNKNOWN', ownerTask);
      let selectedBranch = selectedCall.parent;
      while (selectedBranch && !ts.isIfStatement(selectedBranch)) selectedBranch = selectedBranch.parent;
      need(selectedBranch && ts.isBlock(selectedBranch.thenStatement)
        && match(selectedBranch.expression, 'payload.context.presentation?.selectedImageAssetId', ownerRoles)
        && selectedBranch.thenStatement.statements.some(statement => throwingGuard(statement,
          "!('selectedImageSource' in authority) || !authority.selectedImageSource || !isDeepStrictEqual(ownerTask.payload, task.payload)", ownerRoles)),
      'SELECTED_VIDEO_TASK_SUPPLIER_UNKNOWN', selectedBranch);
      const authorizer = variable(owner, 'authorize'), attachment = variable(owner, 'attachment'), narrative = variable(owner, 'narrative');
      need(same(objectProperty(supplied, 'authorize'), authorizer.name)
        && same(objectProperty(supplied, 'selectedImageAttachment'), attachment.name)
        && match(objectProperty(supplied, 'sourceMap'), 'narrative.sourceMap', { narrative: narrative.name })
        && match(objectProperty(supplied, 'sourceMapRef'), 'narrative.reference', { narrative: narrative.name })
        && match(objectProperty(supplied, 'sourceEvidenceIdentity'), 'selected.binding.sourceEvidenceIdentity', ownerRoles)
        && ts.isArrowFunction(authorizer.initializer) && authorizer.initializer.parameters.length === 1,
      'SELECTED_VIDEO_TASK_SUPPLIER_UNKNOWN', authorizer);
      const currentAuthority = variable(authorizer.initializer, 'current');
      need(ts.isAwaitExpression(currentAuthority.initializer)
        && match(currentAuthority.initializer, 'requireNativeAgentExecutionAuthority(tx, { taskId: task.id, executionAttempt: task.executionAttempt })',
          { ...ownerRoles, tx: authorizer.initializer.parameters[0].name })
        && authorizer.initializer.body.statements.some(statement => throwingGuard(statement,
          "!('selectedImageSource' in current) || !current.selectedImageSource || !isDeepStrictEqual(current.selectedImageSource.binding, selected.binding) || !isDeepStrictEqual(current.task.payload, ownerTask.payload)",
          { ...ownerRoles, current: currentAuthority.name })), 'SELECTED_VIDEO_TASK_SUPPLIER_UNKNOWN', currentAuthority);

      const storage = variable(owner, 'storage'), scope = variable(owner, 'scope'), userId = variable(owner, 'userId');
      const pixels = variable(owner, 'pixels'), evidence = variable(owner, 'evidence'), claims = variable(owner, 'claims');
      const dataRoles = { ...ownerRoles, storage: storage.name, scope: scope.name, userId: userId.name, pixels: pixels.name,
        narrative: narrative.name, evidence: evidence.name, claims: claims.name,
        resolveVisualNarrativeSource: importOf(workspace, './scientific-writing-source', 'resolveVisualNarrativeSource'),
        readPresentationInput: importOf(workspace, './presentation/generated-image-review', 'readPresentationInput'),
        generatedImageReviewAttachment: importOf(workspace, './presentation/generated-image-review', 'generatedImageReviewAttachment'),
        canonicalPresentationClaims: importOf(workspace, './presentation/chart-generator', 'canonicalPresentationClaims'),
        projectIllustrationEvidence: importOf(workspace, '@openscience/domain', 'projectIllustrationEvidence') };
      need(match(storage.initializer, 'deps.storage', dataRoles) && match(userId.initializer, 'ownerTask.session.userId', dataRoles)
        && match(scope.initializer, '{ userId, workspaceId: authority.researchObject.workspaceId, researchObjectId: selected.binding.researchObjectId, versionId: selected.binding.versionId, sourceClaimIds: selected.binding.sourceClaimIds }', dataRoles)
        && ts.isAwaitExpression(narrative.initializer)
        && match(narrative.initializer, 'resolveVisualNarrativeSource({ prisma: deps.prisma, storage }, scope, selected.evidence)', dataRoles)
        && selectedBranch.thenStatement.statements.some(statement => throwingGuard(statement, 'narrative.identity !== selected.binding.narrativeSourceIdentity', dataRoles))
        && ts.isAwaitExpression(evidence.initializer) && match(evidence.initializer, 'projectIllustrationEvidence(storage, selected.evidence)', dataRoles)
        && match(claims.initializer, 'canonicalPresentationClaims(selected.claims.filter(claim => selected.binding.sceneSourceClaimIds.includes(claim.id)).map(claim => ({ ...claim, sourcePassages: evidence.filter(row => row.claimId === claim.id).map(row => ({ evidenceId: row.id, text: row.exactQuote, relation: row.relation })) })))', dataRoles)
        && same(objectProperty(supplied, 'claims'), claims.name)
        && match(objectProperty(supplied, 'settings'), "{ locale: payload.locale, style: selected.settings.style, output: 'image', narrative: true, narrativeSceneLimit: 1, instruction: 'Revise only the selected image. Read the complete userRequest and original scientific brief in context.selectedImage.' }", { payload: payload.name, selected: selected.name })
        && ts.isAwaitExpression(pixels.initializer)
        && match(pixels.initializer, 'readPresentationInput(storage, selected.binding.objectKey, selected.binding.contentHash, ILLUSTRATION_IMAGE_REVIEW_MAX_ATTACHMENT_BYTES)', dataRoles)
        && match(attachment.initializer, 'generatedImageReviewAttachment(pixels, selected.binding.contentHash, selected.binding.mimeType)', dataRoles),
      'SELECTED_VIDEO_SOURCE_DATA_UNKNOWN', narrative);
      const authorizedBytes = variable(authorizer.initializer, 'bytes');
      need(ts.isAwaitExpression(authorizedBytes.initializer)
        && match(authorizedBytes.initializer, 'readPresentationInput(storage, selected.binding.objectKey, selected.binding.contentHash, ILLUSTRATION_IMAGE_REVIEW_MAX_ATTACHMENT_BYTES)', dataRoles)
        && authorizer.initializer.body.statements.some(statement => ts.isExpressionStatement(statement)
          && match(statement.expression, 'generatedImageReviewAttachment(authorizedBytes, selected.binding.contentHash, selected.binding.mimeType)',
            { ...dataRoles, authorizedBytes: authorizedBytes.name })), 'SELECTED_VIDEO_SOURCE_DATA_UNKNOWN', authorizedBytes);

      // Reuse the same actual factory/CAS/mode witnesses; do not replace the
      // private serializer, its paid/late domains or original inverse contracts.
      const flow = finiteImageStoreFlowTerms(ts, { program, checker, root: sourceRoot });
      need(same(flow.factory.name, storeFactory.name), 'SELECTED_VIDEO_STORE_SUPPLIER_UNKNOWN', flow.factory);
      const execution = variable(core, 'execution'), store = variable(core, 'store'), saved = variable(core, 'saved');
      const profile = variable(core, 'profile'), session = variable(core, 'session'), native = variable(core, 'native');
      const coreMaterializer = variable(core, 'materializer'), paper = variable(core, 'paper');
      const executionReader = importOf(illustration, '@openscience/domain', 'readNativeAgentExecution');
      const coreRoles = { input: coreInput, execution: execution.name, store: store.name, saved: saved.name, profile: profile.name,
        readNativeAgentExecution: executionReader, createNativeTaskStore: storeFactory.name, nativeIllustrationToolProfile: entry.profile.name };
      need(match(execution.initializer, 'readNativeAgentExecution(input.task.result)', coreRoles)
        && match(store.initializer, 'createNativeTaskStore({ ...input.deps, taskId: input.task.id, executionAttempt: input.task.executionAttempt, execution, authorize: input.authorize })', coreRoles)
        && ts.isAwaitExpression(saved.initializer) && match(saved.initializer, 'store.read()', coreRoles)
        && match(profile.initializer, 'nativeIllustrationToolProfile(saved, input.settings.output, execution.planningContract)', coreRoles)
        && same(objectProperty(unwrap(coreMaterializer.initializer).arguments[0], 'savedState'), saved.name),
      'SELECTED_VIDEO_CORE_STATE_UNKNOWN', saved);
      const flags = entry.profileBinding.name.elements;
      for (const name of ['nativeVideo', 'videoContext']) {
        const flag = one(flags.filter(element => element.name.text === name), 'SELECTED_VIDEO_CORE_STATE_UNKNOWN');
        need(same(objectProperty(unwrap(coreMaterializer.initializer).arguments[0], name), flag.name), 'SELECTED_VIDEO_CORE_STATE_UNKNOWN', flag);
      }
      need(callOf(session.initializer, sessionFactory) && same(objectProperty(unwrap(session.initializer).arguments[0], 'store'), store.name)
        && callOf(native.initializer, hostFactory) && same(objectProperty(unwrap(native.initializer).arguments[0], 'session'), session.name)
        && same(objectProperty(unwrap(native.initializer).arguments[0], 'store'), store.name)
        && same(objectProperty(unwrap(native.initializer).arguments[0], 'paper'), paper.name), 'SELECTED_VIDEO_STORE_SUPPLIER_UNKNOWN', native);
      const selectedGuard = core.body.statements.find(statement => ts.isIfStatement(statement)
        && match(statement.expression, "input.selectedImage && (!input.selectedImageAttachment || SELECTED_IMAGE_TOOLS.some(expected => sourceTools.filter(tool => isDeepStrictEqual(tool, expected)).length !== 1))",
          { input: coreInput, sourceTools: entry.sourceTools.name, isDeepStrictEqual: importOf(illustration, 'node:util', 'isDeepStrictEqual') }));
      need(selectedGuard && callOf(selectedGuard.thenStatement.expression, fn(illustration, 'stopped')),
        'SELECTED_VIDEO_FIRST_TOOLS_UNKNOWN', core);
      const originalTools = variable(entry.profile, 'originalTools'), profileInput = entry.profile.parameters[0].name;
      need(match(originalTools.initializer, "saved?.turns[0]?.request.options.tools?.filter(tool => tool.function.name.startsWith('paper_')).map(tool => { if (typeof tool.function.description !== 'string') stopped(); return { ...structuredClone(tool.function), description: tool.function.description }; })",
        { saved: profileInput, stopped: fn(illustration, 'stopped').name }), 'SELECTED_VIDEO_FIRST_TOOLS_UNKNOWN', originalTools);
      const originalScience = variable(entry.profile, 'originalScience'), scienceDescription = variable(entry.profile, 'scienceDescription');
      const contextDescription = variable(entry.profile, 'contextDescription');
      const audioFlag = variable(entry.profile, 'nativeVideoAudio'), contextFlag = variable(entry.profile, 'videoContext'), videoFlag = variable(entry.profile, 'nativeVideo');
      const flagRoles = { saved: profileInput, output: entry.profile.parameters[1].name, planningContract: entry.profile.parameters[2].name,
        originalTools: originalTools.name, originalScience: originalScience.name, scienceDescription: scienceDescription.name,
        contextDescription: contextDescription.name, nativeVideoAudio: audioFlag.name, videoContext: contextFlag.name,
        isDeepStrictEqual: importOf(illustration, 'node:util', 'isDeepStrictEqual') };
      need(match(originalScience.initializer, "originalTools?.find(tool => tool.name === 'paper_illustration_science')", flagRoles)
        && match(scienceDescription.initializer, 'originalScience?.description', flagRoles)
        && match(contextDescription.initializer, "originalTools?.find(tool => tool.name === 'paper_illustration_context')?.description", flagRoles)
        && match(audioFlag.initializer, "!saved ? output === 'video' && planningContract === 'video-optional-audio-v1' : scienceDescription === OPTIONAL_AUDIO_VIDEO_SCIENCE_DESCRIPTION && contextDescription === OPTIONAL_AUDIO_VIDEO_CONTEXT_DESCRIPTION && isDeepStrictEqual(originalScience?.parameters, OPTIONAL_AUDIO_VIDEO_SCIENCE_SCHEMA)", flagRoles)
        && match(contextFlag.initializer, "(!saved && output === 'video') || nativeVideoAudio || Boolean(saved && scienceDescription === VIDEO_SCIENCE_DESCRIPTION && contextDescription === VIDEO_CONTEXT_DESCRIPTION && isDeepStrictEqual(originalScience?.parameters, VIDEO_SCIENCE_SCHEMA))", flagRoles)
        && match(videoFlag.initializer, "videoContext || Boolean(saved && scienceDescription === VIDEO_SCIENCE_DESCRIPTION && contextDescription === CONTEXT_DESCRIPTION && isDeepStrictEqual(originalScience?.parameters, ORIGINAL_VIDEO_SCIENCE_SCHEMA))", flagRoles)
        && match(entry.sourceTools.initializer, 'input.selectedImage && !saved ? [...profile.sourceTools, ...SELECTED_IMAGE_TOOLS] : profile.sourceTools', coreRoles),
      'SELECTED_VIDEO_FIRST_TOOLS_UNKNOWN', videoFlag);
      const complete = fn(sessionFactory, 'completeOnce'), state = variable(complete, 'state'), names = variable(complete, 'names');
      const stateReads = complete.body.statements.filter(statement => ts.isVariableStatement(statement)
        && statement.declarationList.declarations.includes(state));
      need(stateReads.length === 1 && ts.isAwaitExpression(state.initializer)
        && match(state.initializer, 'read()', { read: fn(sessionFactory, 'read').name })
        && match(names.initializer, 'options.tools?.map(t => t.function.name).sort()')
        && complete.body.statements.some(statement => guard(statement, "!isDeepStrictEqual(names, [...binding.allowedTools].sort())",
          { isDeepStrictEqual: importOf(sessionFile, 'node:util', 'isDeepStrictEqual'), names: names.name, binding: variable(sessionFactory, 'binding').name }, sessionStop))
        && complete.body.statements.some(statement => guard(statement, "state && !isDeepStrictEqual(options.tools, state.turns[0]?.request.options.tools)",
          { isDeepStrictEqual: importOf(sessionFile, 'node:util', 'isDeepStrictEqual'), state: state.name }, sessionStop)),
      'SELECTED_VIDEO_FIRST_TOOLS_UNKNOWN', state);
      const binding = variable(core, 'binding'), sourceTools = entry.sourceTools;
      const allowed = one(binding.initializer.properties.filter(property => ts.isPropertyAssignment(property) && property.name?.text === 'allowedTools'), 'SELECTED_VIDEO_FIRST_TOOLS_UNKNOWN');
      // The actual later context-window literal cannot overwrite allowedTools.
      // Keep the generic objectProperty late-spread rejection unchanged.
      for (const property of binding.initializer.properties.slice(binding.initializer.properties.indexOf(allowed) + 1)) {
        if (ts.isSpreadAssignment(property)) need(match(property.expression, "execution.model === 'MiniMax-M3' ? { contextWindowTokens: 512_000 } : {}", { execution: execution.name }),
          'SELECTED_VIDEO_FIRST_TOOLS_UNKNOWN', property);
        else need((ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) && entry.key(property.name)
          && entry.key(property.name) !== 'allowedTools', 'SELECTED_VIDEO_FIRST_TOOLS_UNKNOWN', property);
      }
      need(match(allowed.initializer, "saved ? [...saved.binding.allowedTools] : ['skills_list', 'skill_view', ...sourceTools.map(tool => tool.name)]",
        { saved: saved.name, sourceTools: sourceTools.name }), 'SELECTED_VIDEO_FIRST_TOOLS_UNKNOWN', binding);
      const started = one(walk(complete, node => ts.isVariableDeclaration(node) && node.name?.text === 'started'
        && ts.isBinaryExpression(node.initializer) && node.initializer.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken),
      'SELECTED_VIDEO_RETAINED_STATE_UNKNOWN');
      const retainedRoles = { priorState: state.name, binding: variable(sessionFactory, 'binding').name,
        retry: variable(complete, 'retry').name, input: sessionFactory.parameters[0].name, started: started.name };
      need(match(started.initializer, "retry?.started ?? { kind: 'hermes-native-agent', binding, initialMessages: priorState?.initialMessages ?? structuredClone(messages), turns: [...(priorState?.turns ?? []).map(turn => ({ ...turn, request: { ...turn.request, messages: [] } })), { state: 'started', target, request: { messages, options }, effectiveOptions: boundedOptions }] }", retainedRoles),
      'SELECTED_VIDEO_RETAINED_STATE_UNKNOWN', started);
      const paid = one(walk(complete, node => ts.isCallExpression(node) && match(node.expression, 'input.store.complete', retainedRoles)
        && node.arguments.length === 2 && same(node.arguments[0], started.name)), 'SELECTED_VIDEO_RETAINED_STATE_UNKNOWN');
      const completed = symbol(paid.arguments[1])?.valueDeclaration;
      need(completed && ts.isVariableDeclaration(completed)
        && match(completed.initializer, "{ ...started, turns: [...started.turns.slice(0, -1), { state: 'completed', target, request: { messages, options }, effectiveOptions: boundedOptions, ...(retry ? { rejectedAttempt: retry.receipt } : {}), response: { ...response, provider: target.provider, promptHash: target.promptHash } }] }", retainedRoles)
        && ts.isAwaitExpression(paid.parent), 'SELECTED_VIDEO_RETAINED_STATE_UNKNOWN', completed);
      const storeReturn = one(storeFactory.body.statements.filter(ts.isReturnStatement), 'SELECTED_VIDEO_SAVED_REFERENCE_UNKNOWN');
      const readMethod = one(storeReturn.expression.properties.filter(node => ts.isMethodDeclaration(node) && node.name?.text === 'read'), 'SELECTED_VIDEO_SAVED_REFERENCE_UNKNOWN');
      const cp = variable(readMethod, 'cp'), loaded = variable(readMethod, 'state');
      const bytes = one(readMethod.body.statements.filter(ts.isVariableStatement).flatMap(statement => [...statement.declarationList.declarations])
        .filter(declaration => ts.isIdentifier(declaration.name) && declaration.name.text === 'bytes'), 'SELECTED_VIDEO_SAVED_REFERENCE_UNKNOWN');
      const marker = fn(storeFactory, 'marker'), markerTask = variable(marker, 'task'), markerExecution = variable(marker, 'execution');
      const storeInput = storeFactory.parameters[0].name, markerDb = marker.parameters[0].name;
      const storeRoles = { input: storeInput, marker: marker.name, cp: cp.name, bytes: bytes.name,
        sha: one(walk(storeFile, node => ts.isVariableDeclaration(node) && node.name?.text === 'sha'), 'SELECTED_VIDEO_SAVED_REFERENCE_UNKNOWN').name, blocked: fn(storeFile, 'blocked').name };
      need(ts.isAwaitExpression(markerTask.initializer)
        && match(markerTask.initializer, 'db.agentTask.findUnique({ where: { id: input.taskId } })', { db: markerDb, input: storeInput })
        && match(markerExecution.initializer, 'readNativeAgentExecution(task?.result)', { task: markerTask.name, readNativeAgentExecution: importOf(storeFile, '@openscience/domain', 'readNativeAgentExecution') })
        && ts.isPropertyAccessExpression(cp.initializer) && ts.isAwaitExpression(entry.unwrap(cp.initializer.expression))
        && match(cp.initializer, '(await marker(input.prisma)).checkpoint', storeRoles)
        && readMethod.body.statements.some(statement => guard(statement, 'cp.taskId !== input.taskId', storeRoles, fn(storeFile, 'blocked')))
        && readMethod.body.statements.some(statement => guard(statement, 'size !== cp.size || sha(bytes) !== cp.serializedSha256',
          { ...storeRoles, size: variable(readMethod, 'size').name }, fn(storeFile, 'blocked')))
        && match(loaded.initializer, "JSON.parse(bytes.toString('utf8'))", storeRoles), 'SELECTED_VIDEO_SAVED_REFERENCE_UNKNOWN', cp);
      const known = variable(storeFactory, 'known'), tail = readMethod.body.statements.slice(-2);
      need(tail.length === 2 && ts.isExpressionStatement(tail[0]) && ts.isReturnStatement(tail[1])
        && match(tail[0].expression, 'known.set(cp.serializedSha256, cp)', { known: known.name, cp: cp.name })
        && same(tail[1].expression, loaded.name), 'SELECTED_VIDEO_SAVED_REFERENCE_UNKNOWN', readMethod);
      // Admit the actual opaque/hybrid seed. A selected caller's image setting
      // alone says nothing about its saved profile. The *real* materializer
      // rejects a video profile before Host/Session can run; successful selected
      // calls instead retain the common image/reply branches below.
      const stop = fn(illustration, 'stopped'), materializerInput = materializer.parameters[0].name;
      need(stop.body.statements.length === 1 && ts.isThrowStatement(stop.body.statements[0])
        && !stop.modifiers?.some(node => node.kind === ts.SyntaxKind.AsyncKeyword), 'REJECTION_NOT_TERMINAL', stop);
      const materializerVideo = variable(materializer, 'nativeVideo'), revision = variable(materializer, 'revisionSceneIndex');
      need(materializer.body.statements[0].declarationList?.declarations[0] === materializerVideo
        && materializerVideo.parent.flags & ts.NodeFlags.Const && revision.parent.flags & ts.NodeFlags.Const
        && match(materializerVideo.initializer, 'input.nativeVideo === true', { input: materializerInput })
        && guard(materializer.body.statements[3], "nativeVideo !== (input.settings.output === 'video' && input.settings.narrative === true)",
          { input: materializerInput, nativeVideo: materializerVideo.name }, stop)
        && match(revision.initializer, 'nativeVideo ? input.settings.revisionSceneIndex : undefined',
          { input: materializerInput, nativeVideo: materializerVideo.name })
        && guard(entry.selected.body.statements[0], "input.settings.output !== 'image' || input.settings.narrativeSceneLimit !== 1",
          { input: entry.selected.parameters[0].name }, stop), 'SELECTED_VIDEO_PROFILE_REJECTION_UNPROVEN', materializerVideo);
      // Existing pure constructor/selector proof applies to EVERY art receipt,
      // not just the final art or an assumed homogeneous task. On the successful
      // selected image branch nativeVideo=false and revision=undefined; the
      // selector references are pure and neither videoPrompt nor alternate
      // inherited video construction can execute. Do not erase that caller.
      const model = finiteVideoSourceModel(ts, { program, checker, root: sourceRoot });
      need(model.routes.some(route => route.kind === 'reconstruct-whole') && model.readers.has('legacy'),
        'SELECTED_VIDEO_CONSTRUCTOR_TRACE_UNPROVEN', materializer);
      // Finite statement grammars only: no execution, source hash, transformed
      // Program or collector grant. The actual original nodes stay in their
      // checker; free variables resolve to the already bound real suppliers.
      const shape = (actual, text, bindings, reason) => {
        const parsed = ts.createSourceFile('receipt-shape.ts', `async function expected() { ${text}\n}`, ts.ScriptTarget.ES2022, true);
        need(parsed.parseDiagnostics.length === 0, reason, actual);
        const compare = (a, b) => {
          const strip = node => { while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)
            || ts.isNonNullExpression(node))) node = node.expression; return node; };
          a = strip(a); b = strip(b);
          if (!a || !b || a.kind !== b.kind) return false;
          if (ts.isPropertyAccessExpression(a)) return a.name.text === b.name.text && compare(a.expression, b.expression)
            && !!a.questionDotToken === !!b.questionDotToken;
          if (ts.isIdentifier(b)) {
            if (ts.isPropertyAssignment(b.parent) && b.parent.name === b) return a.text === b.text;
            return Object.hasOwn(bindings, b.text) ? same(a, bindings[b.text]) : a.text === b.text;
          }
          if (ts.isLiteralExpression(b) || ts.isTemplateLiteralToken(b)) return a.text === b.text;
          if (ts.isVariableDeclarationList(a) && (a.flags & ts.NodeFlags.BlockScoped) !== (b.flags & ts.NodeFlags.BlockScoped)) return false;
          if ((ts.isPrefixUnaryExpression(a) || ts.isPostfixUnaryExpression(a)) && a.operator !== b.operator) return false;
          const left = [], right = [];
          ts.forEachChild(a, node => { if (!ts.isTypeNode(node)) left.push(node); });
          ts.forEachChild(b, node => { if (!ts.isTypeNode(node)) right.push(node); });
          return left.length === right.length && left.every((node, index) => compare(node, right[index]));
        };
        const expected = parsed.statements[0].body;
        need(Array.isArray(actual) ? actual.length === expected.statements.length
          && actual.every((statement, index) => compare(statement, expected.statements[index])) : compare(actual, expected),
        reason, Array.isArray(actual) ? actual[0] : actual);
      };
      const states = Object.fromEntries(['science', 'art', 'review', 'pendingScience', 'contextStyles', 'styles']
        .map(name => [name, variable(materializer, name).name]));
      const evaluate = fn(materializer, 'evaluate'), reconstruct = fn(materializer, 'reconstruct');
      need(evaluate.parameters.length === 6 && evaluate.parameters.every(parameter => ts.isIdentifier(parameter.name)
        && !parameter.dotDotDotToken && !parameter.questionToken)
        && evaluate.parameters.slice(0, 4).every(parameter => !parameter.initializer)
        && evaluate.parameters.slice(4).every(parameter => parameter.initializer?.kind === ts.SyntaxKind.FalseKeyword),
      'SELECTED_VIDEO_RECEIPT_SIGNATURE_UNPROVEN', evaluate);
      const savedResult = fn(materializer, 'savedResult'), materializerCall = fn(materializer, 'call'), finish = fn(materializer, 'finish');
      const traceEqual = importOf(illustration, 'node:util', 'isDeepStrictEqual');
      const traceRoles = { ...states, input: materializerInput, nativeVideo: materializerVideo.name,
        stopped: stop.name, evaluate: evaluate.name, reconstruct: reconstruct.name, savedResult: savedResult.name,
        isDeepStrictEqual: traceEqual, parseStructuredJson: importOf(illustration, '@openscience/ai-gateway', 'parseStructuredJson'),
        record: one(illustration.statements.filter(ts.isVariableStatement).flatMap(statement => [...statement.declarationList.declarations])
          .filter(declaration => ts.isIdentifier(declaration.name) && declaration.name.text === 'record'), 'SELECTED_VIDEO_RECEIPT_BINDINGS_UNPROVEN').name };
      for (const [declaration, names] of [[reconstruct, ['name', 'args', 'sequence', 'callId', 'recorded']],
        [materializerCall, ['name', 'args', 'sequence', 'callId']], [finish, ['messages', 'finalResponse']]]) {
        need(!declaration.asteriskToken && !declaration.modifiers?.some(node => node.kind === ts.SyntaxKind.AsyncKeyword)
          && declaration.parameters.length === names.length && declaration.parameters.every((parameter, index) =>
            ts.isIdentifier(parameter.name) && parameter.name.text === names[index] && !parameter.initializer && !parameter.dotDotDotToken),
        'SELECTED_VIDEO_RECEIPT_SIGNATURE_UNPROVEN', declaration);
      }
      shape(reconstruct.body, `
        const before = { science, art, review, pendingScience, contextStyles };
        const restore = () => { ({ science, art, review, pendingScience, contextStyles } = before); };
        const rebuilt = evaluate(name, args, sequence, callId);
        if (!recorded || isDeepStrictEqual(rebuilt, recorded)) return rebuilt;
        if (nativeVideo && input.nativeVideoAudio === true && name === 'paper_illustration_art' && recorded.status === 'art_ready') {
          restore(); const approved = evaluate(name, args, sequence, callId, false, true);
          if (isDeepStrictEqual(approved, recorded)) return approved;
        }
        const hasDesignGuidance = name === 'paper_illustration_context' && recorded.status === 'illustration_context'
          || (name === 'paper_illustration_science' || name === 'paper_illustration_science_repair') && recorded.status === 'science_ready'
          || name === 'paper_illustration_art' && recorded.status === 'art_ready';
        if (hasDesignGuidance && !nativeVideo) {
          restore(); const historical = evaluate(name, args, sequence, callId, true);
          if (isDeepStrictEqual(historical, recorded)) return historical;
        }
        restore(); stopped();`, traceRoles, 'SELECTED_VIDEO_WHOLE_RECONSTRUCTION_UNPROVEN');
      shape(materializerCall.body, 'return reconstruct(name, args, sequence, callId, savedResult(name, args, callId));',
        traceRoles, 'SELECTED_VIDEO_RECEIPT_CALL_UNPROVEN');
      shape(finish.body, `
        science = undefined; art = undefined; review = undefined; pendingScience = undefined; contextStyles = styles;
        const calls = messages.flatMap(message => message.role === 'assistant' ? message.toolCalls ?? [] : []);
        for (const [sequence, tool] of calls.entries()) {
          if (!tool.function.name.startsWith('paper_illustration_')) continue;
          if (calls.filter(item => item.id === tool.id).length !== 1) stopped();
          const receipts = messages.filter(message => message.role === 'tool' && message.toolCallId === tool.id);
          if (receipts.length !== 1) stopped();
          const recorded = JSON.parse(receipts[0]!.content) as unknown;
          if (!record(recorded)) stopped();
          const args: unknown = JSON.parse(tool.function.arguments);
          const saved = savedResult(tool.function.name, args, tool.id);
          if (saved && !isDeepStrictEqual(saved, recorded)) stopped();
          const rebuilt = reconstruct(tool.function.name, args, sequence, tool.id, recorded);
          if (!isDeepStrictEqual(rebuilt, recorded)) stopped();
        }
        const selected: unknown = parseStructuredJson(finalResponse);
        const currentScience = science as unknown, currentArt = art as unknown, currentReview = review as unknown;
        const lastReview = [...calls].reverse().find(tool => tool.function.name === 'paper_illustration_review');
        if (!record(selected) || Object.keys(selected).join(',') !== 'reviewToolCallId' || !currentScience || !currentArt || !currentReview
          || selected.reviewToolCallId !== currentReview.id || lastReview?.id !== currentReview.id
          || currentReview.artId !== currentArt.id || currentArt.scienceId !== currentScience.id) stopped();
        return { document: currentArt.document, review: currentReview.review, prompts: currentArt.prompts,
          designSkills: currentArt.designSkills, planToolCallId: currentArt.id, reviewToolCallId: currentReview.id };`,
      traceRoles, 'SELECTED_VIDEO_FINISH_TRACE_UNPROVEN');
      need(uses(reconstruct).length === 2 && uses(reconstruct).every(call => [materializerCall, finish].includes(enclosing(call)))
        && uses(evaluate).length === 3 && uses(evaluate).every(call => enclosing(call) === reconstruct),
      'SELECTED_VIDEO_RECEIPT_ESCAPE_UNPROVEN', reconstruct);
      // Saved-result lookup must not splice prompts or change arguments; each
      // retained receipt is recompiled from the same pre-call state above.
      shape(savedResult.body, `const saved = savedIllustrationReceipts.get(callId);
        if (saved && (name !== saved.name || !isDeepStrictEqual(args, saved.args))) stopped();
        return saved?.result;`, { ...traceRoles, savedIllustrationReceipts: variable(materializer, 'savedIllustrationReceipts').name },
      'SELECTED_VIDEO_SAVED_RESULT_UNPROVEN');
      const dispatch = unwrap(objectProperty(paper.initializer, 'call'));
      need(entry.images.initializer.modifiers?.length === 1 && entry.images.initializer.modifiers[0].kind === ts.SyntaxKind.AsyncKeyword
        && entry.images.initializer.parameters.every((parameter, index) => ts.isIdentifier(parameter.name)
          && parameter.name.text === ['args', 'result'][index] && !parameter.initializer && !parameter.dotDotDotToken && !parameter.questionToken),
      'SELECTED_VIDEO_RECEIPT_SIGNATURE_UNPROVEN', entry.images.initializer);
      need(match(variable(core, 'imageReceipt').initializer,
        "input.selectedImage ? { status: 'image_view_ready', selectedImage: input.selectedImage.binding } : undefined", { input: coreInput })
        && match(variable(core, 'selectedImageCaption').initializer,
          "input.selectedImage ? 'Actual selected image ' + JSON.stringify(input.selectedImage.binding) : undefined", { input: coreInput })
        && match(variable(core, 'nativeVideoAudio').initializer, "'nativeVideoAudio' in profile && profile.nativeVideoAudio", { profile: profile.name })
        && same(objectProperty(unwrap(coreMaterializer.initializer).arguments[0], 'nativeVideoAudio'), variable(core, 'nativeVideoAudio').name),
      'SELECTED_VIDEO_IMAGE_VALUE_SUPPLIER_UNPROVEN', dispatch);
      shape(dispatch.body, `
        if (input.selectedImage && name === 'paper_image_view') {
          if (!record(args) || Object.keys(args).length) stopped(); return imageReceipt!;
        }
        if (input.selectedImage && name === 'paper_selected_image_reply') {
          if (!record(args) || Object.keys(args).sort().join(',') !== 'kind,text' || !['explanation', 'question'].includes(String(args.kind))
            || typeof args.text !== 'string' || !args.text.trim() || args.text.length > (args.kind === 'question' ? 400 : 1200)) stopped();
          return { status: 'selected_image_reply', selectedImage: input.selectedImage.binding, kind: args.kind, text: args.text };
        }
        return name.startsWith('paper_illustration_') ? materializer.call(name, args, sequence!, callId!) : source.call(name, args);`,
      { input: coreInput, record: traceRoles.record, stopped: stop.name, imageReceipt: variable(core, 'imageReceipt').name,
        materializer: coreMaterializer.name, source: entry.sourceVariable.name }, 'SELECTED_VIDEO_DISPATCH_TRACE_UNPROVEN');
      shape(entry.images.initializer.body, `
        if (input.selectedImage && record(result) && result.status === 'image_view_ready') {
          if (!record(args) || Object.keys(args).length || !isDeepStrictEqual(result, imageReceipt)) stopped();
          await authorize();
          const image = input.selectedImageAttachment!;
          return { content: [{ type: 'text' as const, text: selectedImageCaption! },
            { type: 'image_url' as const, image_url: { url: \`data:\${image.mediaType};base64,\${Buffer.from(image.bytes).toString('base64')}\` } }] };
        }
        return source.images(args, result);`,
      { input: coreInput, record: traceRoles.record, isDeepStrictEqual: traceEqual, stopped: stop.name,
        authorize: variable(core, 'authorize').name, imageReceipt: variable(core, 'imageReceipt').name,
        selectedImageCaption: variable(core, 'selectedImageCaption').name, source: entry.sourceVariable.name },
      'SELECTED_VIDEO_IMAGES_TRACE_UNPROVEN');
      // These statements bind the real image/reply outcome to the same stored
      // paid completion. The original Host/Session/store chain is still below.
      const last = variable(core, 'last'), completedState = variable(core, 'completed');
      need(ts.isAwaitExpression(completedState.initializer) && match(completedState.initializer, 'store.read()', { store: store.name })
        && match(last.initializer, 'completed?.turns.at(-1)', { completed: completedState.name }),
      'SELECTED_VIDEO_COMPLETED_RECEIVER_UNPROVEN', last);
      const terminal = core.body.statements.find(statement => ts.isIfStatement(statement)
        && match(statement.expression, "!last || last.state !== 'completed' || last.response.finishReason !== 'stop' || last.response.toolCalls?.length || last.response.model !== execution.model || last.target.model !== execution.model || last.response.text !== native.finalResponse",
          { last: last.name, execution: execution.name, native: native.name }));
      need(terminal && guard(terminal, terminal.expression.getText(), {}, stop), 'SELECTED_VIDEO_COMPLETED_RECEIPT_UNPROVEN', last);
      const selectedFinal = core.body.statements.find(statement => ts.isIfStatement(statement)
        && match(statement.expression, 'input.selectedImage', { input: coreInput }) && statement.getStart() > terminal.getStart());
      need(selectedFinal, 'SELECTED_VIDEO_COMPLETED_RECEIVER_UNPROVEN', core);
      const coreStatements = [...core.body.statements], nativeAt = coreStatements.indexOf(native.parent.parent);
      need(ts.isAwaitExpression(native.initializer) && coreStatements[nativeAt + 1]?.expression
        && ts.isAwaitExpression(coreStatements[nativeAt + 1].expression)
        && match(coreStatements[nativeAt + 1].expression, 'authorize()', { authorize: variable(core, 'authorize').name })
        && coreStatements[nativeAt + 2] === completedState.parent.parent && coreStatements[nativeAt + 3] === last.parent.parent
        && coreStatements[nativeAt + 4] === terminal && coreStatements[nativeAt + 5] === selectedFinal,
      'SELECTED_VIDEO_COMPLETED_DOMINANCE_UNPROVEN', native);
      shape(selectedFinal.thenStatement, `
        const messages = last.request.messages;
        const calls = messages.flatMap(message => message.role === 'assistant' ? message.toolCalls ?? [] : []);
        const views = calls.filter(call => call.function.name === 'paper_image_view');
        const shownImages = messages.filter(message => message.role === 'user' && message.content === selectedImageCaption);
        if (!views.length || views.some(call => {
          const receipts = messages.filter(message => message.role === 'tool' && message.toolCallId === call.id);
          return receipts.length !== 1 || !isDeepStrictEqual(parseStructuredJson(receipts[0]!.content), imageReceipt);
        }) || !shownImages.length || shownImages.some(message => message.images?.length !== 1
          || message.images[0]!.mediaType !== input.selectedImageAttachment!.mediaType
          || createHash('sha256').update(Buffer.from(message.images[0]!.data, 'base64')).digest('hex') !== input.selectedImage!.binding.contentHash)) stopped();
        const contextCall = calls.find(call => call.function.name === 'paper_illustration_context');
        const contextReceipts = contextCall ? messages.filter(message => message.role === 'tool' && message.toolCallId === contextCall.id) : [];
        const context = contextReceipts.length === 1 ? parseStructuredJson(contextReceipts[0]!.content) : undefined;
        if (!contextCall || calls.indexOf(contextCall) >= calls.indexOf(views[0]!) || !record(context)
          || !isDeepStrictEqual(context.selectedImage, input.selectedImage)) stopped();
        const selected = parseStructuredJson(native.finalResponse);
        if (record(selected) && Object.keys(selected).join(',') === 'replyToolCallId') {
          const questions = calls.filter(call => call.function.name === 'paper_selected_image_reply');
          if (questions.length !== 1 || questions[0]!.id !== selected.replyToolCallId
            || calls.indexOf(questions[0]!) <= calls.indexOf(views[0]!)) stopped();
          const receipts = messages.filter(message => message.role === 'tool' && message.toolCallId === questions[0]!.id);
          if (receipts.length !== 1) stopped();
          const args = parseStructuredJson(questions[0]!.function.arguments), receipt = parseStructuredJson(receipts[0]!.content);
          if (!record(args) || Object.keys(args).sort().join(',') !== 'kind,text' || !['explanation', 'question'].includes(String(args.kind))
            || typeof args.text !== 'string' || !args.text.trim() || args.text.length > (args.kind === 'question' ? 400 : 1200)
            || !isDeepStrictEqual(receipt, { status: 'selected_image_reply', selectedImage: input.selectedImage.binding, kind: args.kind, text: args.text })) stopped();
          return { reply: { kind: args.kind, text: args.text, toolCallId: questions[0]!.id }, promptHash: last.target.promptHash,
            responseHash: createHash('sha256').update(last.response.text).digest('hex'), provider: last.target.provider, model: last.target.model };
        }
        const firstScience = calls.findIndex(call => call.function.name === 'paper_illustration_science');
        if (firstScience < 0 || firstScience <= calls.indexOf(views[0]!)) stopped();`,
      { input: coreInput, last: last.name, native: native.name, selectedImageCaption: variable(core, 'selectedImageCaption').name,
        imageReceipt: variable(core, 'imageReceipt').name, record: traceRoles.record, stopped: stop.name,
        parseStructuredJson: traceRoles.parseStructuredJson, isDeepStrictEqual: traceEqual,
        createHash: importOf(illustration, 'node:crypto', 'createHash') }, 'SELECTED_VIDEO_SELECTED_FINAL_RECEIVER_UNPROVEN');
      // Close the private receipt-map lifetime instead of trusting a label.
      // Its only writer parses the original authenticated prefix, its only
      // reader is savedResult, and that result is used only by the two whole
      // reconstruction sites above. The trace neither returns recorded bytes
      // to Host nor lends this map to evaluate/an opaque mutator.
      const receiptMap = variable(materializer, 'savedIllustrationReceipts'), savedMessages = variable(materializer, 'savedMessages');
      const mapReferences = (identifiers.get(receiptMap.name.text) ?? []).filter(node => node !== receiptMap.name && same(node, receiptMap.name));
      const lookup = variable(savedResult, 'saved');
      const writer = one(mapReferences.filter(node => ts.isPropertyAccessExpression(node.parent) && node.parent.name.text === 'set'),
        'SELECTED_VIDEO_RECEIPT_VALUE_LIFETIME_UNPROVEN');
      need(mapReferences.length === 2 && mapReferences.some(node => ts.isPropertyAccessExpression(node.parent)
        && node.parent.name.text === 'get' && node.parent.parent === unwrap(lookup.initializer))
        && ts.isCallExpression(writer.parent.parent) && enclosing(writer) === materializer
        && match(savedMessages.initializer, 'input.savedState?.turns.at(-1)?.request.messages ?? []', { input: materializerInput })
        && uses(savedResult).length === 2 && uses(savedResult).every(call => [materializerCall, finish].includes(enclosing(call))),
      'SELECTED_VIDEO_RECEIPT_VALUE_LIFETIME_UNPROVEN', writer);
      const receiptLoop = writer.parent.parent.parent.parent;
      need(ts.isBlock(receiptLoop) && ts.isForOfStatement(receiptLoop.parent) && ts.isForOfStatement(receiptLoop.parent.parent),
        'SELECTED_VIDEO_RECEIPT_VALUE_LIFETIME_UNPROVEN', writer);
      const outerLoop = receiptLoop.parent.parent, innerLoop = receiptLoop.parent;
      const outerBinding = outerLoop.initializer?.declarations?.[0], innerBinding = innerLoop.initializer?.declarations?.[0];
      need(outerBinding && innerBinding && ts.isVariableDeclarationList(outerLoop.initializer)
        && ts.isVariableDeclarationList(innerLoop.initializer) && outerLoop.initializer.flags & ts.NodeFlags.Const
        && innerLoop.initializer.flags & ts.NodeFlags.Const && outerLoop.initializer.declarations.length === 1
        && innerLoop.initializer.declarations.length === 1 && same(outerLoop.expression, savedMessages.name)
        && match(innerLoop.expression, "message.role === 'assistant' ? message.toolCalls ?? [] : []", { message: outerBinding.name })
        && outerBinding.name.text === 'message' && innerBinding.name.text === 'tool'
        && match(receiptMap.initializer, 'new Map()') && receiptMap.parent.flags & ts.NodeFlags.Const,
      'SELECTED_VIDEO_RECEIPT_VALUE_LIFETIME_UNPROVEN', outerLoop);
      shape(receiptLoop, `
        if (!tool.function.name.startsWith('paper_illustration_')) continue;
        if (!tool.id || savedIds.has(tool.id)) stopped();
        savedIds.add(tool.id);
        const receipts = savedMessages.filter(item => item.role === 'tool' && item.toolCallId === tool.id);
        if (receipts.length > 1) stopped();
        if (!receipts.length) continue;
        const result: unknown = JSON.parse(receipts[0]!.content);
        if (!record(result)) stopped();
        savedIllustrationReceipts.set(tool.id, { name: tool.function.name, args: JSON.parse(tool.function.arguments), result });`,
      { savedMessages: savedMessages.name, savedIllustrationReceipts: receiptMap.name, savedIds: variable(materializer, 'savedIds').name,
        record: traceRoles.record, stopped: stop.name }, 'SELECTED_VIDEO_RECEIPT_VALUE_LIFETIME_UNPROVEN');
      // Preserve actual selected image delivery and the next SDK request's
      // exact image content. Slot ordering/count remains the original Host's
      // global toolSequence, which the unchanged chain below proves.
      const history = fn(hostFactory, 'validateSourceHistory'), hostRoles = { input: hostFactory.parameters[0].name,
        slots: variable(hostFactory, 'slots').name, blocked: hostStop.name,
        record: one(host.statements.filter(ts.isVariableStatement).flatMap(statement => [...statement.declarationList.declarations])
          .filter(declaration => declaration.name?.text === 'record'), 'SELECTED_VIDEO_HOST_IMAGES_UNPROVEN').name,
        isDeepStrictEqual: importOf(host, 'node:util', 'isDeepStrictEqual') };
      shape([...history.body.statements].slice(2), `const expected = slots.flatMap(s => s.images ?? []);
        if (expected.length) {
          if (!record(value) || !Array.isArray(value.messages)) blocked();
          const latest = value.messages.at(-1);
          if (!record(latest) || latest.role !== 'user' || !isDeepStrictEqual(latest.content, expected)) blocked();
        }`, hostRoles, 'SELECTED_VIDEO_HOST_IMAGES_UNPROVEN');
      const imageRoute = one(walk(hostFactory, node => ts.isIfStatement(node)
        && match(node.expression, "req.url === '/task/tools/images'")), 'SELECTED_VIDEO_HOST_IMAGES_UNPROVEN');
      shape(imageRoute.thenStatement, `
        const slot = slots.find(s => s.id === value.callId && (s.name === 'paper_view' || s.name === 'paper_image_view') && s.authorized && s.called);
        if (!slot || !isDeepStrictEqual(slot.args, value.arguments) || !isDeepStrictEqual(slot.result, value.result)) blocked();
        const images = await input.paper.images(value.arguments, value.result);
        const deliver = async () => {
          if (settled || Date.now() >= input.deadlineAt) blocked();
          slot.images = images.content; respond(res, 200, images);
        };
        return await (input.paper.withAuthorizedToolCall ? input.paper.withAuthorizedToolCall(deliver) : deliver());`,
      { ...hostRoles, settled: variable(hostFactory, 'settled').name, respond: fn(host, 'respond').name }, 'SELECTED_VIDEO_HOST_IMAGES_UNPROVEN');
      // Actual workspace consumer: a reply is not a proposal, and neither may
      // adopt a paid result without live reauthorization and exact CP target /
      // response hash plus task-result CAS. Retain all private prior evidence.
      const actual = entry.selectedCalls[0].parent.parent;
      need(ts.isVariableDeclaration(actual) && ts.isIdentifier(actual.name) && ts.isAwaitExpression(actual.initializer)
        && actual.parent.flags & ts.NodeFlags.Const, 'SELECTED_VIDEO_WORKSPACE_ADOPTION_UNPROVEN', actual);
      const selectedStatements = [...selectedBranch.thenStatement.statements], actualAt = selectedStatements.indexOf(actual.parent.parent);
      need(actualAt >= 0, 'SELECTED_VIDEO_WORKSPACE_ADOPTION_UNPROVEN', actual);
      shape(selectedStatements.slice(actualAt + 1), `
        const question = actual.kind === 'reply';
        const accepted = !question && actual.review.decision === 'accepted';
        const selectedImageDraft = accepted ? readWorkspaceSelectedImageDraft({ status: 'private-proposal',
          source: workspaceSelectedImageDraftSource(selected.binding), document: actual.document }) : undefined;
        const summary = question ? actual.reply.text : accepted
          ? payload.locale === 'zh' ? '已查看原图并保存私有修改提案；尚未生成新图，原图保持保留。' : 'The original image was read and a private revision proposal saved. No new image has been generated; the original is retained.'
          : actual.review.summary.slice(0, 1200);
        const paid = question ? actual : actual.review;
        const selectedImageReply = { kind: question ? actual.reply.kind : accepted ? 'proposal' : 'blocked', sourceBinding: selected.binding,
          target: { provider: paid.provider, model: paid.model, promptHash: paid.promptHash }, responseHash: paid.responseHash, summary,
          ...(question ? { replyToolCallId: actual.reply.toolCallId } : { reviewToolCallId: actual.nativeAgent.reviewToolCallId }) };
        await deps.prisma.$transaction(async tx => {
          await authorize(tx);
          const current = await tx.agentTask.findUniqueOrThrow({ where: { id: task.id } });
          const cp = readNativeAgentExecution(current.result)?.checkpoint;
          if (!cp || cp.state !== 'completed' || cp.finishReason !== 'stop' || cp.hasToolCalls
            || cp.responseHash !== paid.responseHash || !isDeepStrictEqual(cp.target, selectedImageReply.target)) throw new Error('[blocked] Selected-image paid completion changed');
          const stored = current.result as unknown;
          const update = await tx.agentTask.updateMany({ where: { id: task.id, status: 'running', deletedAt: null, executionAttempt: task.executionAttempt,
            result: { equals: current.result } }, data: { result: { ...stored, selectedImageReply,
              ...(selectedImageDraft ? { selectedImageDraft } : {}),
              ...(!question ? { storyboardReview: actual.review, nativeIllustration: actual.nativeAgent } : {}) } } });
          if (update.count !== 1) throw new Error('[blocked] Selected-image result changed');
        }, { isolationLevel: 'Serializable' });
        return { summary, nextSteps: [], needsMoreInformation: question ? actual.reply.kind === 'question' : !accepted,
          selectedImageReference: workspaceSelectedImageDraftSource(selected.binding), ...(selectedImageDraft ? { selectedImageDraft } : {}),
          sourceMapRef: narrative.reference, selectedImageReply, ...(!question ? { storyboardReview: actual.review } : {}) };`,
      { actual: actual.name, selected: selected.name, deps, task, payload: payload.name, narrative: narrative.name, authorize: authorizer.name,
        readNativeAgentExecution: importOf(workspace, '@openscience/domain', 'readNativeAgentExecution'),
        readWorkspaceSelectedImageDraft: importOf(workspace, '@openscience/domain', 'readWorkspaceSelectedImageDraft'),
        workspaceSelectedImageDraftSource: importOf(workspace, '@openscience/domain', 'workspaceSelectedImageDraftSource'),
        isDeepStrictEqual: equal }, 'SELECTED_VIDEO_WORKSPACE_ADOPTION_UNPROVEN');
      // The retained prefix's full decoder/store and paid/late contracts remain
      // necessary below. This bridge changes only the live receiver to the
      // actual Core; the original wrapper/caller and selected branch stay real.
      composedEntry = entry;
      live = core;
    }

    const materializerUses = uses(materializer), liveUses = composedEntry ? composedEntry.ordinaryCalls : uses(live), replayUses = uses(replay);
    need(materializerUses.length === 2 && materializerUses.every(call => [live, replay].includes(enclosing(call))), 'EXTRA_MATERIALIZER_CALLER', materializerUses[2]);
    need(liveUses.length === 1 && liveUses[0].getSourceFile() === handler
      && replayUses.length === 1 && replayUses[0].getSourceFile() === handler, 'EXTRA_LIVE_OR_REPLAY_CALLER');
    const liveStore = variable(live, 'store'), liveSaved = variable(live, 'saved'), liveMaterializer = variable(live, 'materializer');
    need(callOf(liveStore.initializer, storeFactory) && match(liveSaved.initializer, 'store.read()', { store: liveStore.name }), 'SAVED_STATE_ORIGIN_UNKNOWN');
    need(callOf(liveMaterializer.initializer, materializer)
      && same(objectProperty(unwrap(liveMaterializer.initializer).arguments[0], 'savedState'), liveSaved.name), 'CALLER_SELECTED_SAVED_STATE');
    const paper = variable(live, 'paper'), paperCall = unwrap(objectProperty(paper.initializer, 'call'));
    need(ts.isArrowFunction(paperCall) && paperCall.parameters.length === 4, 'PAPER_CALL_NOT_BOUND');
    const ordinaryDispatch = composedEntry ? paperCall.body.statements.at(-1)?.expression : paperCall.body;
    need(match(ordinaryDispatch, "name.startsWith('paper_illustration_') ? materializer.call(name, args, sequence, callId) : source.call(name, args)",
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
    const boundHostMessageAlias = () => {
      const singleConst = statement => {
        if (!ts.isVariableStatement(statement) || !(statement.declarationList.flags & ts.NodeFlags.Const)
          || statement.declarationList.declarations.length !== 1) return undefined;
        const declaration = statement.declarationList.declarations[0];
        return ts.isIdentifier(declaration.name) ? declaration : undefined;
      };
      const response = singleConst(completeStatement), message = singleConst(completeBlock.statements[2]);
      if (!response?.initializer || !ts.isAwaitExpression(response.initializer)
        || response.initializer.expression !== completeCall || !message?.initializer
        || !match(message.initializer, 'response.choices[0]!.message', { response: response.name })) return false;
      const assignment = completeBlock.statements[3], returned = completeBlock.statements[4];
      if (!ts.isExpressionStatement(assignment) || !ts.isBinaryExpression(assignment.expression)
        || assignment.expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken
        || !same(assignment.expression.left, slots) || !ts.isReturnStatement(returned) || !returned.expression) return false;
      const mapping = unwrap(assignment.expression.right);
      if (!ts.isCallExpression(mapping) || mapping.arguments.length !== 1 || !ts.isArrowFunction(mapping.arguments[0])
        || mapping.arguments[0].parameters.length !== 1 || !ts.isIdentifier(mapping.arguments[0].parameters[0].name)) return false;
      const call = mapping.arguments[0].parameters[0].name;
      if (!match(mapping,
        "('tool_calls' in message ? message.tool_calls ?? [] : []).map(call => ({ id: call.id, name: call.function.name, sequence: toolSequence++, args: JSON.parse(call.function.arguments), authorized: false, called: false }))",
        { message: message.name, call, toolSequence: variable(hostFactory, 'toolSequence').name })) return false;
      const callback = enclosing(completeCall), responder = fn(host, 'respond');
      if (!callback || callback.parameters.length !== 2 || !ts.isIdentifier(callback.parameters[1].name)
        || !match(returned.expression, 'respond(res, 200, response)',
          { respond: responder.name, res: callback.parameters[1].name, response: response.name })) return false;
      // The exact five statements may only read these two const values at
      // their matched suppliers. Shadowed/captured/written/escaped uses fail.
      for (const declaration of [response, message]) {
        const references = (identifiers.get(declaration.name.text) ?? []).filter(node => same(node, declaration.name));
        if (references.length !== 3) return false;
      }
      const parsed = walk(mapping, node => ts.isIdentifier(node) && node.text === 'JSON');
      const originalJson = walk(loop.statement.statements[2], node => ts.isIdentifier(node) && node.text === 'JSON');
      return parsed.length === 1 && originalJson.length === 1 && symbol(parsed[0]) === symbol(originalJson[0]);
    };
    need(ts.isVariableStatement(completeStatement) && ts.isBlock(completeBlock)
      && [4, 5].includes(completeBlock.statements.length)
      && ts.isExpressionStatement(completeBlock.statements[0]) && ts.isAwaitExpression(completeBlock.statements[0].expression)
      && callOf(completeBlock.statements[0].expression, history)
      && completeBlock.statements[1] === completeStatement
      && (completeBlock.statements.length === 4 || boundHostMessageAlias()), 'HOST_HISTORY_CHECK_BYPASS');
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
    const identityObjects = new Map(), identityCopies = new Set(), identityPasses = new Set();
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
    const readonlyCopyReferences = (capabilities, readonlyUses, copiedUses, writes) => {
      const booleanUse = expression => {
        let value = expression;
        while (value.parent) {
          const parent = value.parent;
          if ((ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent) || ts.isNonNullExpression(parent)) && parent.expression === value) value = parent;
          else if (ts.isBinaryExpression(parent) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken].includes(parent.operatorToken.kind)) value = parent;
          else return ts.isIfStatement(parent) && parent.expression === value
            || ts.isConditionalExpression(parent) && parent.condition === value
            || ts.isPrefixUnaryExpression(parent) && parent.operator === ts.SyntaxKind.ExclamationToken && parent.operand === value;
        }
        return false;
      };
      // Finite copies already bound by the original retry/checkpoint proof.
      // Check whole containers AND each path that can still contain the clone;
      // a property read is not permission to pass that value to an opaque call.
      for (const [declaration, path] of capabilities) {
        for (const use of valueReferences(declaration.name)) {
          if (readonlyUses.has(use) || copiedUses.has(use) || writes.has(use) || booleanUse(use)) continue;
          identityUse(use);
          let value = use, depth = 0;
          while (value.parent && (ts.isPropertyAccessExpression(value.parent) || ts.isElementAccessExpression(value.parent))
            && value.parent.expression === value) {
            const parent = value.parent;
            const key = ts.isPropertyAccessExpression(parent) ? parent.name.text
              : ts.isStringLiteral(parent.argumentExpression) ? parent.argumentExpression.text : undefined;
            need(key !== undefined, 'SESSION_REQUEST_NOT_DECODED');
            if (key !== path[depth]) { depth = path.length + 1; break; }
            depth++; value = parent;
          }
          if (depth <= path.length && value !== use && !readonlyUses.has(value) && !copiedUses.has(value) && !booleanUse(value)) identityUse(value);
        }
      }
    };
    const verifySessionSnapshotInput = () => {
      const sessionParameter = sessionFactory.parameters[0].name;
      const inputs = walk(sessionFactory, node => ts.isPropertyAccessExpression(node)
        && same(node.expression, sessionParameter) && node.name.text === 'binding');
      const clone = unwrap(variable(sessionFactory, 'binding').initializer);
      need(inputs.length === 1 && match(clone, 'structuredClone(input.binding)', { input: sessionParameter })
        && clone.arguments[0] === inputs[0]
        && !symbol(clone.expression)?.declarations?.some(node => !node.getSourceFile().isDeclarationFile), 'SESSION_REQUEST_NOT_DECODED');
      for (const use of valueReferences(sessionParameter)) need(ts.isPropertyAccessExpression(use.parent)
        && use.parent.expression === use, 'SESSION_REQUEST_NOT_DECODED');
      const construction = node => {
        if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
        if (node !== sessionFactory && ts.isFunctionLike(node)) {
          if (node.name && ts.isComputedPropertyName(node.name)) construction(node.name.expression);
          return;
        }
        need(node.kind !== ts.SyntaxKind.ThisKeyword && !(ts.isIdentifier(node) && node.text === 'arguments')
          && !ts.isNewExpression(node) && !ts.isClassDeclaration(node) && !ts.isClassExpression(node)
          && !(ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment)
          && !ts.isDeleteExpression(node) && !((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
            && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)), 'SESSION_REQUEST_NOT_DECODED');
        if (ts.isCallExpression(node)) need(node === clone || callOf(node, sessionStop), 'SESSION_REQUEST_NOT_DECODED');
        ts.forEachChild(node, child => { construction(child); });
      };
      construction(sessionFactory);
    };
    const completeOnce = fn(sessionFactory, 'completeOnce');
    const parser = fn(file('packages/ai-gateway/src/native-agent-bridge.ts'), 'nativeAgentSdkRequest');
    const readState = fn(sessionFactory, 'read'), binding = variable(sessionFactory, 'binding').name;
    let imagePartition, cloneCopies, sessionStatements = completeOnce.body.statements;
    if (ts.isIfStatement(sessionStatements[1])) {
      imagePartition = finiteImageProtocolPartition(ts, { program, checker, root: resolve(sourceRoot) });
      need(imagePartition.status === 'conditional' && imagePartition.session === sessionFactory
        && same(imagePartition.binding.name, binding)
        && imagePartition.terminalGuard === sessionStatements[1]
        && imagePartition.rawGuard.parent === completeOnce.body, 'SESSION_REQUEST_NOT_DECODED');
      verifySessionSnapshotInput();
      const sessionArguments = unwrap(session.initializer).arguments[0];
      const origin = member(sessionArguments, 'binding');
      need(origin && ts.isIdentifier(unwrap(origin)) && member(origin, 'sourceKind') === undefined,
        'SESSION_REQUEST_NOT_DECODED');
      const declaration = symbol(unwrap(origin))?.declarations?.find(ts.isVariableDeclaration);
      need(declaration && ts.isIdentifier(declaration.name), 'SESSION_REQUEST_NOT_DECODED');
      const config = member(unwrap(native.initializer).arguments[0], 'config');
      need(config && member(config, 'sourceKind') === undefined, 'SESSION_REQUEST_NOT_DECODED');
      identityPasses.add(unwrap(origin));
      for (const use of valueReferences(declaration.name)) identityUse(use);
      need(match(imagePartition.terminalGuard.expression,
        "binding.sourceKind === 'illustration-image' && binding.imageReview.imageResultPolicy === 'image-review-tool-final-v1'",
        { binding }), 'SESSION_REQUEST_NOT_DECODED');
      // These are candidates for the two real checkpoint copies, not a tag or
      // shorthand permission. The text copy's constructor/consumers are checked
      // below before any current Session proof edge is reported.
      cloneCopies = walk(completeOnce, node => ts.isVariableDeclaration(node) && node.name.text === 'started').map(declaration => {
        const initial = unwrap(declaration.initializer);
        const object = ts.isObjectLiteralExpression(initial) ? initial
          : ts.isBinaryExpression(initial) && initial.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ? unwrap(initial.right) : undefined;
        need(object && ts.isObjectLiteralExpression(object) && declaration.parent.flags & ts.NodeFlags.Const
          && object.properties.length === 4 && object.properties.every(property =>
            (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) && property.name && !ts.isComputedPropertyName(property.name)),
        'SESSION_REQUEST_NOT_DECODED');
        const field = name => one(object.properties.filter(property => property.name.text === name), 'SESSION_REQUEST_NOT_DECODED');
        for (const name of ['kind', 'initialMessages', 'turns']) field(name);
        const kind = field('kind'), copy = field('binding');
        const use = ts.isShorthandPropertyAssignment(copy) ? copy.name : copy.initializer;
        need(ts.isPropertyAssignment(kind) && match(kind.initializer, "'hermes-native-agent'") && same(use, binding), 'SESSION_REQUEST_NOT_DECODED');
        return { declaration, object, use };
      });
      need(cloneCopies.length === 2 && cloneCopies.filter(copy => {
        for (let node = copy.declaration; node; node = node.parent) if (node === imagePartition.rawGuard) return true;
        return false;
      }).length === 1, 'SESSION_REQUEST_NOT_DECODED');
      for (const use of valueReferences(binding)) {
        if (cloneCopies.some(copy => copy.use === use)) continue;
        identityUse(use);
      }
      // The existing partition proves the real clone/guard/read suppliers.
      // Only this actual immutable paper binding makes both image branches false.
      sessionStatements = sessionStatements.filter(statement => statement !== imagePartition.terminalGuard);
      const authorization = sessionStatements[0];
      need(ts.isExpressionStatement(authorization) && ts.isAwaitExpression(authorization.expression)
        && callOf(authorization.expression, fn(sessionFactory, 'authorize'))
        && unwrap(authorization.expression).arguments.length === 0, 'SESSION_REQUEST_NOT_DECODED');
    }
    const sessionWalk = (scope, predicate) => walk(scope, node => {
      if (imagePartition) for (let at = node; at; at = at.parent)
        if (at === imagePartition.terminalGuard || at === imagePartition.rawGuard) return false;
      return predicate(node);
    });
    const parsedRequest = sessionStatements[1]?.declarationList?.declarations[0];
    need(parsedRequest && callOf(parsedRequest.initializer, parser) && ts.isObjectBindingPattern(parsedRequest.name), 'SESSION_REQUEST_NOT_DECODED');
    const parsedMessages = one(parsedRequest.name.elements.filter(node => node.name.text === 'messages'), 'SESSION_MESSAGES_BINDING_UNKNOWN').name;
    const parsedOptions = one(parsedRequest.name.elements.filter(node => node.name.text === 'options'), 'SESSION_OPTIONS_BINDING_UNKNOWN').name;
    need(match(parsedRequest.initializer, 'nativeAgentSdkRequest(raw, binding.model)',
      { nativeAgentSdkRequest: parser.name, raw: completeOnce.parameters[0].name, binding }), 'SESSION_REQUEST_NOT_DECODED');
    if (imagePartition) {
      const condition = unwrap(imagePartition.rawGuard.expression), filter = unwrap(condition.right);
      need(ts.isBinaryExpression(condition) && ts.isCallExpression(filter) && filter.arguments.length === 1
        && ts.isArrowFunction(filter.arguments[0]) && filter.arguments[0].parameters.length === 1
        && ts.isIdentifier(filter.arguments[0].parameters[0].name)
        && match(condition,
          "binding.sourceKind === 'illustration-image' && binding.imageReview.imageResultPolicy === 'image-review-tool-final-v1' && messages.some(message => message.images?.length)",
          { binding, messages: parsedMessages, message: filter.arguments[0].parameters[0].name }), 'SESSION_REQUEST_NOT_DECODED');
    }
    const stateDeclaration = variable(completeOnce, 'state'), currentState = stateDeclaration.name;
    need(callOf(stateDeclaration.initializer, readState) && sessionStatements[2]?.declarationList?.declarations[0] === stateDeclaration,
      'SESSION_STATE_ORIGIN_UNKNOWN');
    const historyCalls = sessionWalk(completeOnce, node => ts.isCallExpression(node) && same(node.expression, prefix.name));
    need(historyCalls.length === 2 && sessionStatements[3]?.expression === historyCalls[0]
      && historyCalls.every(call => same(call.arguments[0], parsedMessages) && same(call.arguments[1], currentState)), 'SESSION_PREFIX_CALL_BYPASS');
    const submitHistory = historyCalls[1].parent?.parent;
    need(ts.isBlock(submitHistory) && submitHistory.statements[2]?.expression === historyCalls[1]
      && match(submitHistory.statements[1]?.expression, 'state = read()', { state: currentState, read: readState.name }), 'SESSION_STATE_ORIGIN_UNKNOWN');
    if (imagePartition) {
      const authorization = submitHistory.statements[0];
      const supplier = one(sessionWalk(completeOnce, node => ts.isCallExpression(node)
        && match(node.expression, 'input.gateway.nativeAgentComplete', { input: sessionFactory.parameters[0].name })), 'SESSION_PREFIX_CALL_BYPASS');
      need(ts.isExpressionStatement(authorization) && ts.isAwaitExpression(authorization.expression)
        && callOf(authorization.expression, fn(sessionFactory, 'authorize'))
        && unwrap(authorization.expression).arguments.length === 0
        && supplier.arguments.length === 3 && same(supplier.arguments[0], parsedMessages)
        && same(supplier.arguments[1], variable(completeOnce, 'boundedOptions').name)
        && member(supplier.arguments[2], 'submitProvider') === submitHistory.parent, 'SESSION_PREFIX_CALL_BYPASS');
    }
    if (!imagePartition) proven.push('session-prefix');
    const started = one(sessionWalk(completeOnce, node => ts.isVariableDeclaration(node) && node.name.text === 'started'), 'STARTED_CHECKPOINT_UNKNOWN');
    const completed = one(sessionWalk(completeOnce, node => ts.isVariableDeclaration(node) && node.name.text === 'completed'), 'COMPLETED_CHECKPOINT_UNKNOWN');
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
    const assignments = target => sessionWalk(completeOnce, node => ts.isBinaryExpression(node)
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
    const publishCalls = sessionWalk(completeOnce, node => ts.isCallExpression(node)
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
    const finalCalls = sessionWalk(completeOnce, node => ts.isCallExpression(node) && match(node.expression, 'input.store.complete'));
    need(finalCalls.length === 1 && same(finalCalls[0].arguments[0], started.name) && same(finalCalls[0].arguments[1], completed.name), 'PAID_CHECKPOINT_ORIGIN_UNKNOWN');
    if (imagePartition) {
      const copy = cloneCopies.find(value => value.declaration === started);
      need(copy && copy.object === startedInitializer.right, 'SESSION_REQUEST_NOT_DECODED');
      const compareAndSet = one(sessionWalk(completeOnce, node => ts.isCallExpression(node)
        && match(node.expression, 'input.store.compareAndSet', { input: sessionFactory.parameters[0].name })), 'SESSION_REQUEST_NOT_DECODED');
      need(compareAndSet.arguments.length === 2 && same(compareAndSet.arguments[0], currentState)
        && same(compareAndSet.arguments[1], started.name), 'SESSION_REQUEST_NOT_DECODED');
      const parameter = sessionFactory.parameters[0].name;
      const storeRead = one(sessionWalk(readState, node => ts.isCallExpression(node)
        && match(node.expression, 'input.store.read', { input: parameter })), 'SESSION_REQUEST_NOT_DECODED');
      need(storeRead.arguments.length === 0, 'SESSION_REQUEST_NOT_DECODED');
      const storeConsumers = new Set([storeRead, compareAndSet, publishCalls[0], finalCalls[0]]);
      for (const use of sessionWalk(sessionFactory, node => ts.isIdentifier(node) && node !== parameter && same(node, parameter))) {
        const access = use.parent;
        need(ts.isPropertyAccessExpression(access) && access.expression === use, 'SESSION_REQUEST_NOT_DECODED');
        if (access.name.text !== 'store') continue;
        const method = access.parent, call = method?.parent;
        need(ts.isPropertyAccessExpression(method) && method.expression === access
          && ts.isCallExpression(call) && call.expression === method && storeConsumers.has(call), 'SESSION_REQUEST_NOT_DECODED');
      }
      const completedObject = unwrap(completed.initializer);
      need(ts.isObjectLiteralExpression(completedObject) && completedObject.properties.length === 2
        && ts.isSpreadAssignment(completedObject.properties[0]) && same(completedObject.properties[0].expression, started.name), 'SESSION_REQUEST_NOT_DECODED');
      const turns = unwrap(checkpointProperty(completedObject, 'turns')), slice = turns.elements[0].expression;
      need(match(slice, 'started.turns.slice(0, -1)', { started: started.name }), 'SESSION_REQUEST_NOT_DECODED');
      const sliceReceiver = one(walk(slice, node => ts.isIdentifier(node) && same(node, started.name)), 'SESSION_REQUEST_NOT_DECODED');
      const readonlyUses = new Set([compareAndSet.arguments[1], publishCalls[0].arguments[0],
        finalCalls[0].arguments[0], finalCalls[0].arguments[1], sliceReceiver]);
      const copiedUses = new Set([startedInitializer.left, checkpointProperty(retryWrite.right, 'started'),
        checkpointProperty(rejectionWrite.right, 'started'), completedObject.properties[0].expression]);
      const writes = new Set([assignmentRoot(retryWrite.left), assignmentRoot(rejectionWrite.left)]);
      readonlyCopyReferences([[started, ['binding']], [completed, ['binding']],
        [retry, ['started', 'binding']], [attempt, ['rejection', 'started', 'binding']]], readonlyUses, copiedUses, writes);
      proven.push('session-prefix');
    }
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
    const constResult = call => {
      let expression = call;
      while (expression.parent && (ts.isAwaitExpression(expression.parent) || ts.isParenthesizedExpression(expression.parent)
        || ts.isAsExpression(expression.parent) || ts.isNonNullExpression(expression.parent))) expression = expression.parent;
      const declaration = expression.parent;
      need(ts.isVariableDeclaration(declaration) && declaration.initializer === expression && ts.isIdentifier(declaration.name)
        && declaration.parent.flags & ts.NodeFlags.Const, 'STORE_FACTORY_RESULT_UNKNOWN', call);
      return declaration;
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
    const guardedImageAttempt = (call, instance, linked, attempt) => {
      try {
        const flow = finiteImageStoreFlowTerms(ts, { program, checker, root: resolve(sourceRoot) });
        const owner = enclosing(call), body = owner?.body;
        need(flow.status === 'conditional' && owner === flow.route && flow.factory === instance.factory
          && flow.create === instance.call && flow.session === linked.declaration && body && ts.isBlock(body), 'STORE_HOST_IDENTITY_UNKNOWN');
        const statement = node => { while (node?.parent && node.parent !== body) node = node.parent; return node; };
        const storeStatement = statement(instance.declaration), sessionStatement = statement(linked.declaration), hostStatement = statement(call);
        const order = [storeStatement, flow.guard, sessionStatement, hostStatement].map(node => body.statements.indexOf(node));
        need(order.every((value, index) => value >= 0 && (!index || order[index - 1] < value))
          && flow.guard.parent === body && !flow.guard.elseStatement, 'STORE_HOST_IDENTITY_UNKNOWN');
        const stop = fn(owner.getSourceFile(), 'stopped'), action = flow.guard.thenStatement;
        need(!stop.asteriskToken && !stop.modifiers?.some(node => node.kind === ts.SyntaxKind.AsyncKeyword)
          && stop.body?.statements.length === 1 && ts.isThrowStatement(stop.body.statements[0])
          && ts.isExpressionStatement(action) && callOf(action.expression, stop)
          && unwrap(action.expression).arguments.length === 0, 'STORE_HOST_IDENTITY_UNKNOWN');
        const disjuncts = node => { node = unwrap(node); return ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.BarBarToken
          ? [...disjuncts(node.left), ...disjuncts(node.right)] : [node]; };
        need(disjuncts(flow.guard.expression).filter(node => ts.isBinaryExpression(node)
          && node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken
          && (sameValue(node.left, instance.attemptId) && sameValue(node.right, attempt)
            || sameValue(node.right, instance.attemptId) && sameValue(node.left, attempt))).length === 1, 'STORE_HOST_IDENTITY_UNKNOWN');
        const envelope = variable(owner, 'envelope'), snapshot = unwrap(envelope.initializer), parameter = owner.parameters[0].name;
        need(ts.isIdentifier(parameter) && envelope.parent.flags & ts.NodeFlags.Const
          && body.statements.indexOf(statement(envelope)) < order[0]
          && match(snapshot, 'structuredClone(input.envelope)', { input: parameter })
          && !symbol(snapshot.expression)?.declarations?.some(node => !node.getSourceFile().isDeclarationFile)
          && match(attempt, 'envelope.executionAttempt', { envelope: envelope.name }), 'STORE_HOST_IDENTITY_UNKNOWN');
        const entry = flow.entry.arguments[0];
        need(entry.properties.every(property => (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property))
          && property.name && !ts.isComputedPropertyName(property.name)), 'STORE_HOST_IDENTITY_UNKNOWN');
        const authorizer = definition(member(entry, 'authorize'));
        need(ts.isArrowFunction(authorizer), 'STORE_HOST_IDENTITY_UNKNOWN');
        // Reflection could reach the fresh private receivers without a symbol
        // reference; it is outside this finite owned-snapshot witness.
        need(!walk(owner, node => node.kind === ts.SyntaxKind.ThisKeyword
          || ts.isIdentifier(node) && node.text === 'arguments'
          || ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'eval').length, 'STORE_HOST_IDENTITY_UNKNOWN');
        for (const use of valueReferences(parameter)) {
          const access = use.parent;
          need(ts.isPropertyAccessExpression(access) && access.expression === use, 'STORE_HOST_IDENTITY_UNKNOWN');
          if (access.name.text === 'task') identityUse(access);
          const invocation = access.parent;
          if (ts.isCallExpression(invocation) && invocation.expression === access)
            need(access.name.text === 'authorize', 'STORE_HOST_IDENTITY_UNKNOWN');
        }
        const sessionInput = unwrap(linked.declaration.initializer).arguments[0], bindingValue = member(sessionInput, 'binding');
        const declaration = symbol(unwrap(bindingValue))?.declarations?.find(ts.isVariableDeclaration);
        need(declaration && ts.isIdentifier(declaration.name) && declaration.parent.flags & ts.NodeFlags.Const
          && ts.isObjectLiteralExpression(unwrap(declaration.initializer))
          && same(member(bindingValue, 'imageReview'), envelope.name), 'STORE_HOST_IDENTITY_UNKNOWN');
        for (const property of unwrap(declaration.initializer).properties) {
          if (ts.isSpreadAssignment(property)) need(member(property.expression, 'imageReview') === undefined, 'STORE_HOST_IDENTITY_UNKNOWN');
          else need((ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property))
            && property.name && !ts.isComputedPropertyName(property.name), 'STORE_HOST_IDENTITY_UNKNOWN');
        }
        const hostConfig = member(unwrap(call.arguments[0]), 'config');
        need(ts.isObjectLiteralExpression(hostConfig), 'STORE_HOST_IDENTITY_UNKNOWN');
        const configCopies = hostConfig.properties.filter(ts.isSpreadAssignment);
        need(configCopies.length === 1 && same(configCopies[0].expression, declaration.name)
          && hostConfig.properties.every(property => ts.isSpreadAssignment(property)
            || ts.isPropertyAssignment(property) && property.name && !ts.isComputedPropertyName(property.name)), 'STORE_HOST_IDENTITY_UNKNOWN');
        verifySessionSnapshotInput();
        readonlyCopyReferences([[envelope, []], [declaration, ['imageReview']]],
          new Set([unwrap(bindingValue)]), new Set([member(bindingValue, 'imageReview'), configCopies[0].expression]), new Set());
        return true;
      } catch { return false; }
    };
    for (const call of hostCalls) {
      const input = call.arguments[0], store = member(input, 'store'), sessionValue = member(input, 'session');
      const instance = store && ts.isIdentifier(unwrap(store)) && byStore.get(symbol(unwrap(store)));
      const linked = sessionValue && ts.isIdentifier(unwrap(sessionValue)) && bySession.get(symbol(unwrap(sessionValue)));
      need(instance && linked?.instance === instance, 'STORE_SUBSTITUTE_INSTANCE_UNKNOWN', store ?? call);
      const config = member(input, 'config');
      identityPasses.add(unwrap(config));
      const hostAttempt = member(input, 'executionAttempt');
      need((sameValue(hostAttempt, instance.attemptId) || guardedImageAttempt(call, instance, linked, hostAttempt))
        && sameValue(member(config, 'taskId'), instance.taskId), 'STORE_HOST_IDENTITY_UNKNOWN', call);
      for (const key of ['runtimeId', 'skillCatalogueId', 'model']) need(sameValue(member(config, key), member(linked.binding, key)), 'STORE_HOST_IDENTITY_UNKNOWN', call);
      const row = { instance: instance.graph.id, at: location(call), session: location(linked.declaration) };
      instance.graph.hosts.push(row.at); storeGraph.hosts.push(row); allowedValues.add(store); linked.passed.add(sessionValue);
    }
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
    let imageStoreFlow;
    const imageFinalizerStoreArguments = new Set();
    if (imagePartition) {
      const reason = 'STORE_FINALIZER_CONSUMER_UNKNOWN';
      // Same-symbol argument positions imply the same received value only for
      // these plain, required parameters. Rest/default/optional signatures are
      // outside this bounded consumer summary.
      const parameters = (callee, count) => callee.parameters.length === count
        && callee.parameters.every(parameter => ts.isIdentifier(parameter.name)
          && !parameter.dotDotDotToken && !parameter.initializer && !parameter.questionToken);
      imageStoreFlow = finiteImageStoreFlowTerms(ts, { program, checker, root: resolve(sourceRoot) });
      need(imageStoreFlow.status === 'conditional' && imageStoreFlow.factory === storeFactory
        && imageStoreFlow.partition.session === sessionFactory, reason);
      need(parameters(imageStoreFlow.update, 3)
        && [...imageStoreFlow.modes.values()].every(mode => parameters(mode.node, 2)), reason, imageStoreFlow.update);
      const finalizer = fn(sessionFile, 'finalizeNativeImageReviewState'), validate = fn(sessionFile, 'nativeImageReviewFinal');
      const derive = fn(sessionFile, 'deriveNativeImageReviewFinal'), stop = fn(sessionFile, 'blocked');
      const store = finalizer.parameters[0]?.name, state = finalizer.parameters[1]?.name;
      need(parameters(finalizer, 2) && ts.isIdentifier(store) && ts.isIdentifier(state)
        && finalizer.modifiers?.some(node => node.kind === ts.SyntaxKind.AsyncKeyword) && !finalizer.asteriskToken, reason, finalizer);
      const statements = finalizer.body.statements, final = variable(finalizer, 'final'), next = variable(finalizer, 'next');
      need(statements.length === 6 && statements[0] === final.parent.parent && final.parent.flags & ts.NodeFlags.Const
        && final.parent.declarations.length === 1
        && !stop.asteriskToken && !stop.modifiers?.some(node => node.kind === ts.SyntaxKind.AsyncKeyword)
        && ts.isCallExpression(final.initializer) && callOf(final.initializer, validate) && unwrap(final.initializer).arguments.length === 1
        && same(unwrap(final.initializer).arguments[0], state)
        && ts.isIfStatement(statements[1]) && !statements[1].elseStatement
        && match(statements[1].expression, 'state.validatedFinal', { state })
        && ts.isReturnStatement(statements[1].thenStatement) && same(statements[1].thenStatement.expression, state)
        && guard(statements[2], '!store.finalize', { store }, stop)
        && statements[3] === next.parent.parent && next.parent.flags & ts.NodeFlags.Const && next.parent.declarations.length === 1
        && ts.isObjectLiteralExpression(next.initializer)
        && match(next.initializer, '{ ...state, validatedFinal: final }', { state, final: final.name })
        && ts.isExpressionStatement(statements[4]) && ts.isAwaitExpression(statements[4].expression) && ts.isCallExpression(statements[4].expression.expression)
        && match(statements[4].expression, 'store.finalize(state, next)', { store, state, next: next.name })
        && ts.isReturnStatement(statements[5]) && same(statements[5].expression, next.name), reason, finalizer);
      // The actual validator/derivation remains in the original complete-module
      // equality premise. Bind its real chain, not another same-named callee.
      const validationTry = validate.body.statements[0];
      need(validate.body.statements.length === 1 && ts.isTryStatement(validationTry)
        && parameters(validate, 1) && !validate.asteriskToken && !validate.modifiers?.some(node => node.kind === ts.SyntaxKind.AsyncKeyword)
        && validationTry.tryBlock.statements.length === 1 && ts.isReturnStatement(validationTry.tryBlock.statements[0])
        && ts.isCallExpression(validationTry.tryBlock.statements[0].expression) && callOf(validationTry.tryBlock.statements[0].expression, derive)
        && unwrap(validationTry.tryBlock.statements[0].expression).arguments.length === 1
        && same(unwrap(validationTry.tryBlock.statements[0].expression).arguments[0], validate.parameters[0].name)
        && validationTry.catchClause && !validationTry.finallyBlock, reason, validate);
      const caught = validationTry.catchClause.variableDeclaration?.name, catchBody = validationTry.catchClause.block.statements;
      const errorClass = one(walk(sessionFile, node => ts.isClassDeclaration(node) && node.name?.text === 'NativeAgentSessionError'), reason);
      need(caught && catchBody.length === 2 && ts.isIfStatement(catchBody[0]) && !catchBody[0].elseStatement
        && match(catchBody[0].expression, 'error instanceof ErrorClass', { error: caught, ErrorClass: errorClass.name })
        && ts.isThrowStatement(catchBody[0].thenStatement) && same(catchBody[0].thenStatement.expression, caught)
        && ts.isExpressionStatement(catchBody[1]) && callOf(catchBody[1].expression, stop), reason, validate);
      const derived = variable(derive, 'result'), validateFinal = importOf(sessionFile, '@openscience/ai-gateway', 'validateNativeImageReviewFinal');
      need(parameters(derive, 1) && !derive.asteriskToken && !derive.modifiers?.some(node => node.kind === ts.SyntaxKind.AsyncKeyword)
        && ts.isCallExpression(derived.initializer) && same(unwrap(derived.initializer).expression, validateFinal)
        && ts.isReturnStatement(derive.body.statements.at(-1)) && same(derive.body.statements.at(-1).expression, derived.name), reason, derive);
      const calls = uses(finalizer);
      need(calls.length === 2 && calls.every(call => call.arguments.length === 2 && ts.isAwaitExpression(call.parent)), reason, finalizer);
      const routeCall = one(calls.filter(call => enclosing(call) === imageStoreFlow.route), reason);
      const sessionCall = one(calls.filter(call => enclosing(call) === completeOnce), reason);
      const route = imageStoreFlow.route, saved = variable(route, 'saved'), prior = variable(route, 'prior');
      const routeStore = symbol(unwrap(routeCall.arguments[0]))?.declarations?.find(ts.isVariableDeclaration);
      need(routeStore && routeStore.initializer === imageStoreFlow.create && routeStore.parent.flags & ts.NodeFlags.Const
        && saved.parent.flags & ts.NodeFlags.Const && ts.isAwaitExpression(saved.initializer)
        && match(saved.initializer, 'store.read()', { store: routeStore.name })
        && same(routeCall.arguments[1], saved.name)
        && prior.parent.flags & ts.NodeFlags.Const && match(prior.initializer, 'saved?.turns.at(-1)', { saved: saved.name }), reason, routeCall);
      const materialize = variable(route, 'materialize'), materialized = routeCall.parent.parent, recovered = materialized?.parent;
      need(ts.isArrowFunction(materialize.initializer) && ts.isCallExpression(materialized)
        && same(materialized.expression, materialize.name) && materialized.arguments.length === 1
        && materialized.arguments[0] === routeCall.parent && ts.isReturnStatement(recovered), reason, routeCall);
      const early = recovered.parent, envelope = variable(route, 'envelope');
      need(ts.isIfStatement(early) && early.parent === route.body && early.thenStatement === recovered && !early.elseStatement
        && match(early.expression, "saved && envelope.imageResultPolicy === 'image-review-tool-final-v1' && (saved.validatedFinal || prior?.state === 'received' || (prior?.state === 'completed' && prior.received))",
          { saved: saved.name, envelope: envelope.name, prior: prior.name }), reason, early);
      const legacy = one(route.body.statements.filter(node => ts.isIfStatement(node)
        && match(node.expression, "saved && prior?.state === 'completed' && prior.response.finishReason === 'stop' && !prior.response.toolCalls?.length",
          { saved: saved.name, prior: prior.name })), reason);
      need(ts.isReturnStatement(legacy.thenStatement) && match(legacy.thenStatement.expression, 'materialize(saved)',
        { materialize: materialize.name, saved: saved.name }), reason, legacy);
      const startedGuard = one(route.body.statements.filter(node => ts.isIfStatement(node)
        && match(node.expression, "saved?.turns.at(-1)?.state === 'started'", { saved: saved.name })), reason);
      const inside = (node, scope) => node.getSourceFile() === scope.getSourceFile() && node.pos >= scope.pos && node.end <= scope.end;
      const savedReads = new Set([routeCall.arguments[1], legacy.thenStatement.expression.arguments[0]]);
      for (const use of valueReferences(saved.name)) need(savedReads.has(use) || inside(use, prior.initializer)
        || inside(use, early.expression) || inside(use, legacy.expression) || inside(use, startedGuard.expression), reason, use);
      for (const use of valueReferences(prior.name)) need(inside(use, early.expression) || inside(use, legacy.expression), reason, use);
      need(saved.end < early.pos && early.end < imageStoreFlow.guard.pos, reason, early);

      const parameter = sessionFactory.parameters[0].name, raw = imagePartition.rawGuard;
      const receivedState = variable(completeOnce, 'receivedState');
      need(!receivedState.initializer && inside(receivedState, raw) && inside(sessionCall, raw)
        && match(sessionCall.arguments[0], 'input.store', { input: parameter }) && same(sessionCall.arguments[1], receivedState.name), reason, sessionCall);
      const writes = walk(raw, node => ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
        && same(node.left, receivedState.name));
      const write = one(writes, reason), submit = enclosing(write), rawStarted = cloneCopies.find(copy => copy.declaration !== started)?.declaration;
      need(rawStarted && enclosing(rawStarted) === submit && ts.isArrowFunction(submit) && parameters(submit, 2), reason, write);
      const received = variable(submit, 'received'), common = variable(submit, 'common'), target = submit.parameters[0].name;
      need(ts.isIdentifier(target) && received.parent.flags & ts.NodeFlags.Const && ts.isAwaitExpression(received.initializer)
        && match(received.initializer.expression.expression, 'input.store.publish', { input: parameter })
        && unwrap(received.initializer).arguments.length === 2 && same(unwrap(received.initializer).arguments[0], rawStarted.name)
        && match(write.right, "{ ...started, turns: [...started.turns.slice(0, -1), received.decoded ? { ...common, state: 'completed', received, response: { ...received.decoded, provider: target.provider, promptHash: target.promptHash } } : { ...common, state: 'received', received }] }",
          { started: rawStarted.name, common: common.name, received: received.name, target }), reason, write);
      const rawComplete = one(walk(submit, node => ts.isCallExpression(node)
        && match(node.expression, 'input.store.complete', { input: parameter })), reason);
      const suffix = submit.body.statements.slice(submit.body.statements.indexOf(write.parent));
      need(suffix.length === 3 && suffix[1].expression === rawComplete.parent && ts.isAwaitExpression(rawComplete.parent)
        && rawComplete.arguments.length === 2 && same(rawComplete.arguments[0], rawStarted.name) && same(rawComplete.arguments[1], receivedState.name)
        && ts.isReturnStatement(suffix[2]) && same(suffix[2].expression, received.name), reason, rawComplete);
      const missing = one(raw.thenStatement.statements.filter(node => guard(node, '!receivedState', { receivedState: receivedState.name }, stop)), reason);
      need(write.end < rawComplete.pos && missing.end < sessionCall.pos, reason, sessionCall);
      const allowedState = new Set([write.left, rawComplete.arguments[1], missing.expression.operand, sessionCall.arguments[1]]);
      for (const use of valueReferences(receivedState.name)) need(allowedState.has(use), reason, use);
      const cas = one(walk(submit, node => ts.isCallExpression(node)
        && match(node.expression, 'input.store.compareAndSet', { input: parameter })), reason);
      need(cas.arguments.length === 2 && same(cas.arguments[0], currentState) && same(cas.arguments[1], rawStarted.name) && cas.end < received.pos, reason, cas);
      const execute = one(walk(raw, node => ts.isCallExpression(node)
        && match(node.expression, 'input.gateway.executeNativeImageReviewTurn', { input: parameter })), reason);
      need(ts.isAwaitExpression(execute.parent) && execute.arguments.length === 2
        && member(execute.arguments[1], 'submitProvider') === submit
        && execute.end < missing.pos && raw.thenStatement.statements.indexOf(missing)
          === raw.thenStatement.statements.indexOf(execute.parent.parent) + 1, reason, execute);
      const rawStores = new Set([cas.expression.expression, unwrap(received.initializer).expression.expression,
        rawComplete.expression.expression, sessionCall.arguments[0]]);
      for (const value of walk(raw, node => ts.isPropertyAccessExpression(node) && match(node, 'input.store', { input: parameter })))
        need(rawStores.has(value), reason, value);
      need(!walk(raw, node => node.kind === ts.SyntaxKind.ThisKeyword || ts.isIdentifier(node) && node.text === 'arguments'
        || ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'eval').length, reason, raw);
      const copy = unwrap(write.right).properties[0].expression, slice = unwrap(member(write.right, 'turns')).elements[0].expression;
      const sliceUse = one(walk(slice, node => ts.isIdentifier(node) && same(node, rawStarted.name)), reason);
      readonlyCopyReferences([[rawStarted, ['binding']]], new Set([cas.arguments[1], unwrap(received.initializer).arguments[0], rawComplete.arguments[0], sliceUse]),
        new Set([copy]), new Set());
      const allowedCommon = new Set(walk(rawStarted.initializer, node => ts.isIdentifier(node) && same(node, common.name))
        .concat(walk(write.right, node => ts.isIdentifier(node) && same(node, common.name))));
      for (const use of valueReferences(common.name)) need(allowedCommon.has(use), reason, use);
      const receivedReads = new Set(walk(write.right, node => ts.isIdentifier(node) && same(node, received.name)));
      receivedReads.add(suffix[2].expression);
      for (const use of valueReferences(received.name)) need(receivedReads.has(use), reason, use);
      imageFinalizerStoreArguments.add(routeCall.arguments[0]); imageFinalizerStoreArguments.add(sessionCall.arguments[0]);
      storeGraph.finalizations = calls.map(location);
    }
    for (const instance of instances) {
      for (const use of valueReferences(instance.declaration.name)) {
        if (allowedValues.has(use) || imageFinalizerStoreArguments.has(use)) continue;
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
      const values = (consumer === 'session' ? sessionWalk : walk)(factory,
        node => ts.isPropertyAccessExpression(node) && node.name.text === 'store' && same(node.expression, input));
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
      const finalModes = factory === storeFactory && imageStoreFlow?.factory === factory;
      const methodNames = finalModes ? ['read', 'compareAndSet', 'complete', 'finalize', 'publish'] : ['read', 'compareAndSet', 'complete', 'publish'];
      need(ts.isObjectLiteralExpression(object) && object.properties.length === methodNames.length
        && object.properties.every(property => (ts.isPropertyAssignment(property) || ts.isMethodDeclaration(property))
          && property.name && !ts.isComputedPropertyName(property.name)), 'STORE_RETURN_UNKNOWN', returned);
      const methods = new Map(object.properties.map(property => [property.name?.text, property]));
      need(methods.size === methodNames.length && methodNames.every(key => methods.has(key)), 'STORE_RETURN_UNKNOWN', returned);
      const update = fn(factory, factory === storeFactory ? 'update' : 'save'), wrappers = [];
      if (finalModes) need(imageStoreFlow.update === update && imageStoreFlow.cas
        && imageStoreFlow.modes.size === 3, 'STORE_UPDATE_SUPPLIER_UNKNOWN', update);
      for (const [key, paid] of finalModes ? [['compareAndSet', 'start'], ['complete', 'paid'], ['finalize', 'final']]
        : [['compareAndSet', false], ['complete', true]]) {
        const arrow = unwrap(methods.get(key).initializer);
        need(ts.isArrowFunction(arrow) && arrow.parameters.length === 2
          && (!finalModes || imageStoreFlow.modes.get(key)?.node === arrow)
          && match(arrow.body, `update(previous, state, ${finalModes ? JSON.stringify(paid) : paid})`,
            { update: update.name, previous: arrow.parameters[0].name, state: arrow.parameters[1].name }),
        'STORE_UPDATE_SUPPLIER_UNKNOWN', methods.get(key));
        wrappers.push(unwrap(arrow.body));
      }
      const updateCalls = uses(update);
      need(updateCalls.length === wrappers.length && updateCalls.every(call => wrappers.includes(call)), 'STORE_UPDATE_SUPPLIER_UNKNOWN', update);
      if (finalModes) {
        const previous = update.parameters[0].name, state = update.parameters[1].name, mode = update.parameters[2].name;
        const modeStop = fn(storeFile, 'blocked');
        need(!modeStop.asteriskToken && !modeStop.modifiers?.some(node => node.kind === ts.SyntaxKind.AsyncKeyword)
          && modeStop.body.statements.length === 1 && ts.isThrowStatement(modeStop.body.statements[0]), 'STORE_UPDATE_SUPPLIER_UNKNOWN', modeStop);
        need(guard(update.body.statements[0], "mode === 'final' && (!previous || previous.validatedFinal || !input.authorizeFinal || !equal(state, { ...previous, validatedFinal: validate(previous) }))",
          { mode, previous, state, input, equal: importOf(storeFile, 'node:util', 'isDeepStrictEqual'),
            validate: fn(sessionFile, 'nativeImageReviewFinal').name }, modeStop), 'STORE_UPDATE_SUPPLIER_UNKNOWN', update);
        const cas = imageStoreFlow.cas, transaction = enclosing(cas), tx = transaction?.parameters[0]?.name;
        need(same(cas.expression, fn(file('packages/domain/src/agent/native-agent-execution.ts'), 'compareNativeAgentCheckpoint').name)
          && ts.isArrowFunction(transaction) && transaction.parameters.length === 1 && ts.isIdentifier(tx)
          && transaction.body.statements.length === 3 && ts.isAwaitExpression(transaction.body.statements[0]?.expression)
          && match(transaction.body.statements[0].expression, 'lockTrashReferences(tx)',
            { lockTrashReferences: importOf(storeFile, '@openscience/domain', 'lockTrashReferences'), tx }), 'STORE_UPDATE_SUPPLIER_UNKNOWN', cas);
        const authority = transaction.body.statements[1];
        need(ts.isIfStatement(authority) && match(authority.expression, "mode === 'final'", { mode })
          && ts.isAwaitExpression(authority.thenStatement?.expression)
          && match(authority.thenStatement.expression, 'input.authorizeFinal!(tx)', { input, tx })
          && ts.isIfStatement(authority.elseStatement) && !authority.elseStatement.elseStatement
          && match(authority.elseStatement.expression, "mode === 'start'", { mode })
          && ts.isAwaitExpression(authority.elseStatement.thenStatement?.expression)
          && match(authority.elseStatement.thenStatement.expression, 'input.authorize(tx)', { input, tx })
          && transaction.body.statements[2]?.expression === cas.parent && ts.isAwaitExpression(cas.parent), 'STORE_UPDATE_SUPPLIER_UNKNOWN', authority);
        const authorityInput = member(imageStoreFlow.create.arguments[0], 'authorizeFinal'), authorize = variable(imageStoreFlow.route, 'authorize');
        need(ts.isArrowFunction(authorize.initializer) && ts.isArrowFunction(authorityInput) && authorityInput.parameters.length === 1
          && match(authorityInput.body, 'authorize(tx)', { authorize: authorize.name, tx: authorityInput.parameters[0].name }),
        'STORE_UPDATE_SUPPLIER_UNKNOWN', authorityInput);
      }
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
        let normalization;
        if (finalModes) {
          const reason = 'PRIVATE_SERIALIZER_ORIGIN_UNKNOWN';
          const rawOnly = directVariable(persist.body, 'rawOnly'), source = directVariable(persist.body, 'source');
          const roles = { ...referenceRoles, binding: binding.name, rawOnly: rawOnly.name, sha: hashFunction.name };
          need(imageStoreFlow.persist === persist && imageStoreFlow.reference === reference
            && rawOnly.parent.flags & ts.NodeFlags.Const && source.parent.flags & ts.NodeFlags.Const
            && match(rawOnly.initializer, "turn.state === 'received'", roles), reason, reference);
          // This is the existing constructor's finite metadata tuple. A raw
          // receipt is represented as completed CP metadata, never as a final
          // response; its distinct policy/discriminator must survive the read.
          need(match(source.initializer, `binding.sourceKind === 'illustration-image' ? {
            sourceKind: 'illustration-image', imageIdentity: {
              requestId: binding.imageReview.requestId, contentHash: binding.imageReview.contentHash,
              sourceEvidenceIdentity: binding.imageReview.sourceEvidenceIdentity, parentIdentity: binding.imageReview.parentIdentity
            }, ...(binding.imageReview.imageResultPolicy ? {
              imageResultPolicy: binding.imageReview.imageResultPolicy,
              ...((turn.state === 'completed' && turn.received) || rawOnly ? { received: rawOnly ? 'raw-only' : 'decoded' } : {}),
              ...(state.validatedFinal ? { validatedFinal: { policy: state.validatedFinal.policy,
                rawCheckpoint: state.validatedFinal.rawCheckpoint, turnOrdinal: state.validatedFinal.turnOrdinal,
                resultToolCallId: state.validatedFinal.resultToolCallId, responseHash: state.validatedFinal.responseHash } } : {})
            } : {})
          } : { artifactId: binding.artifactId, documentSha256: binding.documentSha256, sourceMapHash: binding.sourceMapHash }`, roles), reason, source);
          const sourceUses = valueReferences(source.name), spreads = reference.initializer.properties.filter(ts.isSpreadAssignment);
          need(sourceUses.length === 1 && ts.isSpreadAssignment(sourceUses[0].parent)
            && sourceUses[0].parent.parent === reference.initializer && spreads.length === 2
            && spreads.includes(sourceUses[0].parent), reason, reference);
          const responseSpread = spreads.find(node => node !== sourceUses[0].parent);
          need(match(responseSpread.expression, "turn.state === 'completed' ? { responseHash: sha(turn.response.text), finishReason: turn.response.finishReason, hasToolCalls: Boolean(turn.response.toolCalls?.length) } : {}", roles), reason, responseSpread);
          const decoded = directVariable(readMethod.body, 'state'), decodedBinding = directVariable(readMethod.body, 'binding');
          const decodedTurn = directVariable(readMethod.body, 'turn'), sameSource = directVariable(readMethod.body, 'sameSource');
          const readRoles = { input, cp: firstRead.name, state: decoded.name, binding: decodedBinding.name, turn: decodedTurn.name,
            equal: importOf(storeFile, 'node:util', 'isDeepStrictEqual'), sha: hashFunction.name };
          need(match(decodedBinding.initializer, 'state.binding', readRoles) && match(decodedTurn.initializer, 'state.turns?.at(-1)', readRoles)
            && match(sameSource.initializer, `binding?.sourceKind === 'illustration-image' ? cp.sourceKind === 'illustration-image'
              && equal(cp.imageIdentity, { requestId: binding.imageReview.requestId, contentHash: binding.imageReview.contentHash,
                sourceEvidenceIdentity: binding.imageReview.sourceEvidenceIdentity, parentIdentity: binding.imageReview.parentIdentity })
              : cp.sourceKind === undefined && binding.artifactId === cp.artifactId
                && binding.documentSha256 === cp.documentSha256 && binding.sourceMapHash === cp.sourceMapHash`, readRoles), reason, sameSource);
          const identityGuard = one(readMethod.body.statements.filter(node => guard(node,
            `state.kind !== 'hermes-native-agent' || state.binding?.taskId !== cp.taskId || !sameSource
              || state.binding.runtimeId !== input.execution.runtimeId || state.binding.skillCatalogueId !== input.execution.skillCatalogueId
              || state.binding.model !== input.execution.model || state.turns.length !== cp.turnCount || !turn
              || (turn.state === 'received' ? 'completed' : turn.state) !== cp.state || !equal(turn.target, cp.target)
              || (turn.state === 'completed' && (sha(turn.response.text) !== cp.responseHash || turn.response.finishReason !== cp.finishReason
                || Boolean(turn.response.toolCalls?.length) !== cp.hasToolCalls))`, { ...readRoles, sameSource: sameSource.name }, stop)), reason);
          const imageRead = one(readMethod.body.statements.filter(node => ts.isIfStatement(node)
            && match(node.expression, "binding.sourceKind === 'illustration-image'", readRoles)), reason);
          need(ts.isBlock(imageRead.thenStatement) && imageRead.thenStatement.statements.length === 5
            && decoded.end < sameSource.pos && sameSource.end < identityGuard.pos && identityGuard.end <= imageRead.pos, reason, imageRead);
          const checks = imageRead.thenStatement.statements, final = directVariable(imageRead.thenStatement, 'final');
          need(guard(checks[0], `cp.sourceKind !== 'illustration-image' || cp.imageResultPolicy !== binding.imageReview.imageResultPolicy
              || cp.imageResultPolicy !== input.execution.imageResultPolicy
              || cp.received !== (turn.state === 'received' ? 'raw-only' : turn.state === 'completed' && turn.received ? 'decoded' : undefined)
              || (turn.state === 'received' && (cp.responseHash !== undefined || cp.finishReason !== undefined || cp.hasToolCalls !== undefined
                || Object.hasOwn(turn, 'response')))`, readRoles, stop)
            && guard(checks[1], `cp.received !== undefined && (cp.imageResultPolicy !== 'image-review-tool-final-v1'
              || turn.imageResultPolicy !== cp.imageResultPolicy || !turn.effectiveRequest
              || turn.request.messages.flatMap(message => message.images ?? []).length !== 1
              || turn.state === 'started' || !turn.received || turn.received.policy !== cp.imageResultPolicy
              || turn.received.provider !== cp.target.provider
              || (turn.state === 'received' ? turn.received.decoded !== undefined : !turn.received.decoded))`, readRoles, stop)
            && checks[2] === final.parent.parent && final.parent.flags & ts.NodeFlags.Const && final.parent.declarations.length === 1
            && match(final.initializer, 'state.validatedFinal', readRoles)
            && guard(checks[3], `!equal(cp.validatedFinal, final ? { policy: final.policy, rawCheckpoint: final.rawCheckpoint,
              turnOrdinal: final.turnOrdinal, resultToolCallId: final.resultToolCallId, responseHash: final.responseHash } : undefined)`,
              { ...readRoles, final: final.name }, stop)
            && ts.isIfStatement(checks[4]) && !checks[4].elseStatement && same(checks[4].expression, final.name)
            && match(checks[4].thenStatement?.expression, 'validate(state)', { ...readRoles, validate: fn(sessionFile, 'nativeImageReviewFinal').name })
            && guard(imageRead.elseStatement, "state.validatedFinal || turn.imageResultPolicy || turn.effectiveRequest || turn.state === 'received' || (turn.state === 'completed' && turn.received)", readRoles, stop), reason, imageRead);
          normalization = { reference: location(reference), rawOnly: location(rawOnly), source: location(source), inverseRead: location(imageRead) };
        }
        for (const [name, shape] of [['taskId', 'input.taskId'], ['objectKey', 'objectKey'], ['serializedSha256', 'hash'], ['size', 'bytes.length'],
          ['executionAttempt', 'input.executionAttempt'], ['turnCount', 'state.turns.length'], ['state', 'turn.state'], ['target', 'turn.target']])
          need(match(member(reference.initializer, name), finalModes && name === 'executionAttempt'
            ? "binding.sourceKind === 'illustration-image' ? binding.imageReview.executionAttempt : input.executionAttempt"
            : finalModes && name === 'state' ? "rawOnly ? 'completed' : turn.state" : shape,
          { ...referenceRoles, binding: binding.name, rawOnly: finalModes ? directVariable(persist.body, 'rawOnly').name : undefined }), 'PRIVATE_SERIALIZER_ORIGIN_UNKNOWN', reference);
        if (normalization) privateStoreChain.normalization = normalization;
        const persistReturn = one(walk(persist, node => ts.isReturnStatement(node) && enclosing(node) === persist), 'PRIVATE_SERIALIZER_RETURN_UNKNOWN');
        need(same(member(persistReturn.expression, 'reference'), reference.name) && same(member(persistReturn.expression, 'bytes'), bytes.name), 'PRIVATE_SERIALIZER_RETURN_UNKNOWN', persistReturn);

        // The actual final-only guard and its authority/CAS mode were bound
        // above. Retain it there while checking the same remaining transaction
        // and known-reference order used by the ordinary boolean route.
        const updateBody = finalModes ? update.body.statements.slice(1) : update.body.statements, attempt = updateBody[2];
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
          && (finalModes ? callback === enclosing(imageStoreFlow.cas)
            : ts.isIfStatement(callback.body.statements[1]) && !callback.body.statements[1].elseStatement
              && match(callback.body.statements[1].expression, '!paidCompletion', { paidCompletion: update.parameters[2].name })
              && ts.isAwaitExpression(callback.body.statements[1].thenStatement?.expression)
              && match(callback.body.statements[1].thenStatement.expression, 'input.authorize(tx)', { input, tx: callback.parameters[0].name }))
          && callback.body.statements[2]?.expression?.expression === calls[0]
          && ts.isAwaitExpression(callback.body.statements[2].expression), 'PRIVATE_UPDATE_TRANSACTION_UNKNOWN', txCall);
        const casObject = unwrap(calls[0].arguments[1]);
        const finalFlag = finalModes && imageStoreFlow.cas.arguments[1].properties.find(ts.isSpreadAssignment);
        need(same(calls[0].arguments[0], callback.parameters[0].name) && ts.isObjectLiteralExpression(casObject)
          && (!finalModes || calls[0] === imageStoreFlow.cas && finalFlag)
          && casObject.properties.length === (finalModes ? 7 : 6)
          && casObject.properties.every(property => finalModes && property === finalFlag
            || (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property))
              && !ts.isComputedPropertyName(property.name)), 'PRIVATE_CAS_REFERENCE_UNKNOWN', calls[0]);
        for (const [name, shape] of [['taskId', 'input.taskId'], ['executionAttempt', 'input.executionAttempt'], ['expected', 'old'],
          ['next', 'preparedReference'], ['paidCompletion', 'paidCompletion'], ['expectedExecution', 'input.execution']])
          need(match(member(casObject, name), finalModes && name === 'paidCompletion' ? "mode === 'paid'" : shape,
            { input, old: old.name, preparedReference: preparedReference.name,
              paidCompletion: update.parameters[2].name, mode: update.parameters[2].name }), 'PRIVATE_CAS_REFERENCE_UNKNOWN', calls[0]);
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

function emitPrivateRollbackDiagnostic(ts, current, previous, candidateRoot, rollbackRoot, roots, branch, site, error, moduleKey, familyCode, ingressSide) {
  try {
    let code = 'COMPATIBILITY_UNKNOWN', module, initializationSite, side;
    const stages = ['video', 'selected-guide'];
    const sites = ['context', 'model', 'library', 'projected-keys', 'remaining-entry', 'captured-source',
      'projected-runtime', 'transpile', 'projected-equality', 'ingress', 'family', 'builtin',
      'ingress-reason', 'ingress-store-graph', 'ingress-private-store-chain',
      'ingress-materializer-host', 'ingress-host-slot-result', 'ingress-host-before-session',
      'ingress-session-prefix', 'ingress-session-checkpoint-prefix', 'ingress-verified-base',
      'ingress-store-capability-use', 'ingress-generic-private-store-chain'];
    if (!stages.includes(branch) || !sites.includes(site)) return;
    const left = rollbackProofContexts.get(current), right = rollbackProofContexts.get(previous);
    const bound = [left, right].every((owner, index) => owner && owner.ts === ts && owner.roots === roots
      && owner.root === [candidateRoot, rollbackRoot][index] && owner.program.getTypeChecker() === owner.checker);
    const entries = bound ? [new Map(current), new Map(previous)] : undefined;
    const captured = bound && entries[0].size === current.length && entries[1].size === previous.length
      && [left, right].every((owner, index) => [...owner.modules].every(([path, source]) =>
        owner.program.getSourceFile(path) === source && !source.isDeclarationFile
        && entries[index].has(`module:${relative(owner.root, path).replaceAll('\\', '/')}`)));
    if (captured && !nodeUtilTypes.isProxy(error)) {
      const data = (object, name) => object && (typeof object === 'object' || typeof object === 'function')
        && !nodeUtilTypes.isProxy(object) ? Object.getOwnPropertyDescriptor(object, name)?.value : undefined;
      const selected = new Set(['SELECTED_GUIDE_AGENT_RESIDUAL_UNKNOWN', 'SELECTED_GUIDE_AUXILIARY_RUNTIME_CHANGED',
        'SELECTED_GUIDE_BYTE_READER_CHANGED', 'SELECTED_GUIDE_DECLARATION_OR_ESCAPE_UNKNOWN', 'SELECTED_GUIDE_DORMANT_MODULE_UNKNOWN',
        'SELECTED_GUIDE_EAGER_INITIALIZATION_UNKNOWN', 'SELECTED_GUIDE_FAMILY_NOT_CLOSED', 'SELECTED_GUIDE_FRESH_WRITER_UNKNOWN',
        'SELECTED_GUIDE_HANDLER_INITIALIZATION_CHANGED', 'SELECTED_GUIDE_HTTP_LIBRARY_IDENTITY_UNKNOWN',
        'SELECTED_GUIDE_ILLUSTRATION_INPUT_OR_DELEGATION_CHANGED', 'SELECTED_GUIDE_ILLUSTRATION_RESIDUAL_UNKNOWN',
        'SELECTED_GUIDE_INGESTION_READER_UNKNOWN', 'SELECTED_GUIDE_LEGACY_DECODER_CHANGED', 'SELECTED_GUIDE_LEGACY_GUIDE_RETRY_UNKNOWN',
        'SELECTED_GUIDE_NATIVE_RESIDUAL_UNKNOWN', 'SELECTED_GUIDE_OVERLAPPING_PROJECTION', 'SELECTED_GUIDE_PUBLIC_READER_UNKNOWN',
        'SELECTED_GUIDE_READER_CAPABILITY_REMOVED_OR_NONIDENTICAL', 'SELECTED_GUIDE_RELOCATION_RESIDUAL_UNKNOWN',
        'SELECTED_GUIDE_RESIDUAL_MISSING', 'SELECTED_GUIDE_RESULT_ORIGIN_UNKNOWN', 'SELECTED_GUIDE_SUPPLEMENTARY_SOURCE_UNKNOWN',
        'SELECTED_GUIDE_WORKSPACE_RESIDUAL_UNKNOWN', 'IMAGE_CAPTURED_SOURCE_IDENTITY_CHANGED', 'IMAGE_PROJECTED_RUNTIME_INVALID']);
      const ingressCodes = new Set([
        'ASSISTANT_COUNT_UNBOUND', 'ASSISTANT_HISTORY_LOOP_UNKNOWN', 'ASSISTANT_MESSAGE_ORIGIN_UNKNOWN',
        'ASSISTANT_RESPONSE_UNBOUND', 'ASSISTANT_TURN_ORIGIN_UNKNOWN', 'BASE_PROOF_UNKNOWN', 'BASE_READER_MISSING',
        'BASE_REPLAY_ORIGIN_UNKNOWN', 'BASE_TASK_NOT_VERIFIED', 'BINDING_assistantMessages_UNKNOWN',
        'BINDING_attempt_UNKNOWN', 'BINDING_binding_UNKNOWN', 'BINDING_cursor_UNKNOWN', 'BINDING_known_UNKNOWN',
        'BINDING_materializer_UNKNOWN', 'BINDING_native_UNKNOWN', 'BINDING_paper_UNKNOWN', 'BINDING_preceding_UNKNOWN',
        'BINDING_prepared_UNKNOWN', 'BINDING_rebuilt_UNKNOWN', 'BINDING_retry_UNKNOWN', 'BINDING_saved_UNKNOWN',
        'BINDING_session_UNKNOWN', 'BINDING_slots_UNKNOWN', 'BINDING_source_UNKNOWN', 'BINDING_state_UNKNOWN',
        'BINDING_store_UNKNOWN', 'BINDING_task_UNKNOWN', 'CALLER_SELECTED_SAVED_STATE', 'COMPLETED_CHECKPOINT_UNKNOWN',
        'EXTRA_LIVE_OR_REPLAY_CALLER', 'EXTRA_MATERIALIZER_CALLER', 'EXTRA_UNBOUND_FACTORY_CALLER',
        'FACTORY_ALIAS_OR_ESCAPE_UNKNOWN', 'FRESH_HISTORY_NOT_EMPTY', 'FUNCTION_blocked_UNKNOWN',
        'FUNCTION_checkHistory_UNKNOWN', 'FUNCTION_compareNativeAgentCheckpoint_UNKNOWN', 'FUNCTION_completeOnce_UNKNOWN',
        'FUNCTION_createJournalNativeTaskStore_UNKNOWN', 'FUNCTION_createNativeAgentSession_UNKNOWN',
        'FUNCTION_createNativeIllustrationMaterializer_UNKNOWN', 'FUNCTION_createNativeTaskStore_UNKNOWN',
        'FUNCTION_nativeAgentSdkRequest_UNKNOWN', 'FUNCTION_persist_UNKNOWN', 'FUNCTION_readNativeAgentExecution_UNKNOWN',
        'FUNCTION_read_UNKNOWN', 'FUNCTION_replayNativeVideoPlan_UNKNOWN', 'FUNCTION_requireNativeVideoStoryboard_UNKNOWN',
        'FUNCTION_runHostedNativeTask_UNKNOWN', 'FUNCTION_runNativeIllustrationTask_UNKNOWN', 'FUNCTION_stopped_UNKNOWN',
        'FUNCTION_validateSourceHistory_UNKNOWN', 'HOST_HISTORY_ARGUMENT_UNBOUND', 'HOST_HISTORY_CHECK_BYPASS',
        'HOST_HISTORY_NOT_DECODED', 'HOST_MESSAGES_BINDING_UNKNOWN', 'HOST_RESULT_ASSIGNMENT_UNKNOWN',
        'HOST_SESSION_CALL_UNKNOWN', 'HOST_SESSION_STATEMENT_UNKNOWN', 'HOST_SLOT_GUARDS_UNKNOWN',
        'HOST_SLOT_GUARD_BYPASS', 'HOST_SLOT_ITERABLE_UNKNOWN', 'HOST_SLOT_LOOP_UNKNOWN', 'HOST_SLOT_NOT_AUTHENTICATED',
        'HOST_STORE_SESSION_ORIGIN_UNKNOWN', 'HOST_TOOL_RESULT_ORIGIN_UNKNOWN', 'HOST_TOOL_RESULT_UNBOUND',
        'IMPORT_BINDING_UNKNOWN', 'INITIAL_PREFIX_UNBOUND', 'LATEST_PREFIX_NOT_RETAINED', 'LATE_SPREAD_OVERRIDES_BINDING',
        'LIVE_BASE_NOT_RECONSTRUCTED', 'LIVE_BASE_UNKNOWN', 'LOCAL_ORIGIN_UNKNOWN', 'MODEL_SELECTED_SLOT_RESULT',
        'MUTABLE_ORIGIN_UNKNOWN', 'OBJECT_BINDING_UNKNOWN', 'PAID_CHECKPOINT_ORIGIN_UNKNOWN', 'PAPER_CALL_NOT_BOUND',
        'PAPER_CALL_NOT_MATERIALIZER', 'PRIOR_PREFIX_UNBOUND', 'PRIVATE_CAS_REFERENCE_UNKNOWN',
        'PRIVATE_EXPECTED_MEMBERSHIP_UNKNOWN', 'PRIVATE_EXPECTED_ORIGIN_UNKNOWN', 'PRIVATE_HASH_ORIGIN_UNKNOWN',
        'PRIVATE_KNOWN_REGISTRATION_ORDER_UNKNOWN', 'PRIVATE_KNOWN_USE_UNKNOWN', 'PRIVATE_LOCAL_ORIGIN_UNKNOWN',
        'PRIVATE_PREPARED_REFERENCE_UNKNOWN', 'PRIVATE_READ_REFERENCE_UNKNOWN', 'PRIVATE_REFERENCE_ESCAPE_UNKNOWN',
        'PRIVATE_SERIALIZER_ORIGIN_UNKNOWN', 'PRIVATE_SERIALIZER_RETURN_UNKNOWN', 'PRIVATE_UPDATE_TRANSACTION_UNKNOWN',
        'PRIVATE_UPLOAD_ORIGIN_UNKNOWN', 'PROGRAM_SOURCE_MISSING', 'PROGRAM_SYNTAX_UNKNOWN', 'REJECTION_NOT_TERMINAL',
        'REPLAY_COMPARISON_NOT_TERMINAL', 'REPLAY_CP_ORIGIN_UNKNOWN', 'REPLAY_NOT_COMPLETED_CP_FINISH',
        'REPLAY_SELECTED_SAVED_STATE', 'REPLAY_WHOLE_ARTIFACT_UNBOUND', 'RETRY_STARTED_ORIGIN_UNKNOWN',
        'SAVED_STATE_ORIGIN_UNKNOWN', 'SEMANTIC_CALL_BINDING_UNKNOWN', 'SESSION_CURSOR_ORIGIN_UNKNOWN',
        'SESSION_MESSAGES_BINDING_UNKNOWN', 'SESSION_OPTIONS_BINDING_UNKNOWN', 'SESSION_PREFIX_CALL_BYPASS',
        'SESSION_REQUEST_NOT_DECODED', 'SESSION_STATE_ORIGIN_UNKNOWN', 'SOURCE_ANALYSIS_UNKNOWN',
        'STARTED_CHECKPOINT_UNKNOWN', 'STORE_CAPABILITY_INPUT_ESCAPE_UNKNOWN', 'STORE_CAS_SUPPLIER_UNKNOWN',
        'STORE_EFFECTIVE_MEMBER_MUTATION_UNKNOWN', 'STORE_EFFECTIVE_MEMBER_UNKNOWN',
        'STORE_FACTORY_INSTANCE_COUNT_UNKNOWN', 'STORE_FACTORY_RESULT_UNKNOWN', 'STORE_HOST_IDENTITY_UNKNOWN',
        'STORE_INPUT_IDENTITY_UNKNOWN', 'STORE_INSTANCE_ESCAPE_UNKNOWN', 'STORE_JOURNAL_CAS_SUPPLIER_UNKNOWN',
        'STORE_MARKER_IDENTITY_UNKNOWN', 'STORE_METHOD_ESCAPE_UNKNOWN', 'STORE_METHOD_NOT_AWAITED_UNKNOWN',
        'STORE_PERSIST_SUPPLIER_UNKNOWN', 'STORE_RETURN_SUPPLIER_UNKNOWN', 'STORE_RETURN_UNKNOWN',
        'STORE_SESSION_ESCAPE_UNKNOWN', 'STORE_SESSION_IDENTITY_UNKNOWN', 'STORE_SHARED_SUPPLIER_UNKNOWN',
        'STORE_SUBSTITUTE_INSTANCE_UNKNOWN', 'STORE_UNEXPECTED_WRITER_UNKNOWN', 'STORE_UNKNOWN_CONSUMER',
        'STORE_UPDATE_SUPPLIER_UNKNOWN',
      ]);
      if (branch === 'video' && site.startsWith('ingress') && ['candidate', 'rollback'].includes(ingressSide)) side = ingressSide;
      const thrown = data(error, 'reason');
      if (branch === 'video' && site === 'ingress-reason' && ingressCodes.has(thrown)) code = thrown;
      if ((branch === 'selected-guide' ? selected : new Set(['VIDEO_CONSTRUCTOR_NOT_PURE', 'VIDEO_TRANSFER_UNKNOWN'])).has(thrown)) code = thrown;
      if (code === 'SELECTED_GUIDE_EAGER_INITIALIZATION_UNKNOWN') {
        const value = data(error, 'initializationSite');
        if (['capture-context', 'module-identity', 'retained-function', 'declaration-binding', 'retained-declaration',
          'added-declaration', 'retained-statement', 'graph-source', 'graph-transpile', 'graph-import', 'graph-existing',
          'graph-edge', 'graph-order', 'moved-source', 'moved-initializer', 'moved-class', 'moved-statement'].includes(value)) initializationSite = value;
      }
      if (branch === 'video' && site === 'family' && ['OLD_CONSTRUCTOR_CHANGED', 'READER_CAPABILITY_REMOVED',
        'RETAINED_CONSTRUCTOR_CHANGED', 'FRESH_SOURCE_UNKNOWN', 'TRANSFER_SOURCE_UNKNOWN', 'ROLLBACK_FAMILY_NOT_CLOSED'].includes(familyCode)) code = familyCode;
      const node = data(error, 'node');
      const pending = [];
      for (const [index, owner] of [left, right].entries()) {
        for (const [path, source] of owner.modules) {
          const key = `module:${relative(owner.root, path).replaceAll('\\', '/')}`;
          if (!entries[index].has(key) || key.length > 240 || key.includes('..')
            || !/^module:(?:apps|packages|infra)\/[A-Za-z0-9@_./:+-]+$/u.test(key)) continue;
          if (moduleKey === key) { module = key; break; }
          pending.push({ actual: source, key });
        }
        if (module) break;
      }
      // Search the captured forest breadth first with the original node budget.
      // One deep function must not hide later modules' shallow failing nodes.
      // Only actual captured nodes are traversed; error node methods/parents are
      // never read. Missing identity remains unreported, never assumed valid.
      if (!module && node && !nodeUtilTypes.isProxy(node)) {
        let cursor = 0, budget = 100000;
        while (cursor < pending.length && budget-- > 0) {
          const { actual, key } = pending[cursor++];
          if (actual === node) { module = key; break; }
          ts.forEachChild(actual, child => { pending.push({ actual: child, key }); });
        }
      }
    }
    console.error(`ROLLBACK_COMPATIBILITY_DIAGNOSTIC ${JSON.stringify({ stage: branch, code, site,
      ...(initializationSite ? { initializationSite } : {}), ...(module ? { module } : {}), ...(side ? { side } : {}) })}`);
  } catch { /* Diagnostics never replace the original refusal. */ }
}

function finiteVideoPairCompatibility(ts, current, previous, candidateRoot, rollbackRoot, roots, diagnostics = false) {
  let site = 'context', moduleKey, ingressSide;
  const reject = (error, familyCode) => {
    if (diagnostics === true) emitPrivateRollbackDiagnostic(ts, current, previous, candidateRoot, rollbackRoot, roots,
      'video', site, error, moduleKey, familyCode, ingressSide);
    return false;
  };
  try {
    const left = rollbackProofContexts.get(current), right = rollbackProofContexts.get(previous);
    // Only the two original successful collections may enter this unequal
    // route. JSON clones/slices/source-only Programs cannot borrow authority.
    if (roots !== APPLICATION_ROLLBACK_READERS || !left || !right || left.ts !== ts || right.ts !== ts
      || left.roots !== roots || right.roots !== roots || left.root !== candidateRoot || right.root !== rollbackRoot
      || left.program.getTypeChecker() !== left.checker || right.program.getTypeChecker() !== right.checker) return reject();
    site = 'model';
    const candidate = finiteVideoSourceModel(ts, left), rollback = finiteVideoSourceModel(ts, right);
    const projectedKeys = [...candidate.projected.keys()].sort();
    site = 'projected-keys';
    if (projectedKeys.length !== 2 || JSON.stringify(projectedKeys) !== JSON.stringify([...rollback.projected.keys()].sort())) return reject();
    const affected = new Set(projectedKeys.map(key => `module:${key}`)), a = new Map(current), b = new Map(previous);
    for (const key of new Set([...a.keys(), ...b.keys()])) {
      site = 'remaining-entry'; moduleKey = key;
      if (!a.has(key) || !b.has(key)) return reject();
      if (!affected.has(key) && JSON.stringify(a.get(key)) !== JSON.stringify(b.get(key))) return reject();
    }
    for (const key of projectedKeys) {
      site = 'captured-source'; moduleKey = `module:${key}`;
      const projected = [];
      for (const [context, model] of [[left, candidate], [right, rollback]]) {
        site = 'captured-source';
        const { source, text } = model.projected.get(key), path = resolve(context.root, key);
        if (context.modules.get(path) !== source || context.program.getSourceFile(path) !== source
          || !a.has(`module:${key}`) || !b.has(`module:${key}`)) return reject();
        // Same captured TS source, same transpile options and original runtime
        // canonical. These two application modules have no Prisma location
        // literals; every generated/vendor entry remains untouched above.
        site = 'transpile';
        const compiled = ts.transpileModule(text, { fileName: path, reportDiagnostics: true,
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true } });
        if (compiled.diagnostics?.some(item => item.category === ts.DiagnosticCategory.Error)) return reject();
        const emitted = ts.createSourceFile('runtime.js', compiled.outputText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
        if (emitted.parseDiagnostics.length) return reject();
        projected.push(context.canonical(emitted));
      }
      site = 'projected-equality';
      if (JSON.stringify(projected[0]) !== JSON.stringify(projected[1])) return reject();
    }
    // Reuse the independently reviewed actual bindings only under the complete
    // unchanged runtime/dependency premise just established. No per-Domain or
    // codec gate is introduced, and unrelated origins gain no new A constructor.
    site = 'ingress'; moduleKey = undefined;
    for (const context of [left, right]) {
      site = 'ingress';
      ingressSide = context === left ? 'candidate' : 'rollback';
      const ingress = proveNativeVideoReceiptIngress(ts, context.program, context.root);
      let ingressReason;
      if ((site = 'ingress-reason', ingressReason = ingress.reason, ingressReason !== 'OTHER_PERSISTENCE_ORIGINS_UNPROVEN')
        || (site = 'ingress-store-graph', ingress.storeGraph.status !== 'conditional')
        || (site = 'ingress-private-store-chain', ingress.privateStoreChain.status !== 'conditional')
        || !['materializer-host', 'host-slot-result', 'host-before-session', 'session-prefix', 'session-checkpoint-prefix',
          'verified-base', 'store-capability-use', 'generic-private-store-chain']
          .every(edge => (site = `ingress-${edge}`, ingress.proven.includes(edge))))
        return reject(site === 'ingress-reason' ? { reason: ingressReason } : undefined);
    }
    site = 'family';
    const family = finiteVideoFamilyClosure(candidate, rollback);
    if (family.status !== 'conditional') return reject(undefined, family.reason);
    return true;
  } catch (error) { return reject(error); }
}

// The image discriminator belongs to the persisted server initializer. A
// producer-only transition is safe only when every byte-consuming runtime and
// dependency entry is unchanged. This component also supplies the real bound
// call for the legacy-domain extension proof; it grants no source-only release.
function finiteImageProducerTerms(ts, context) {
  const { program, checker, root } = context;
  const fail = node => { throw { reason: 'IMAGE_PRODUCER_BINDING_UNKNOWN', node }; };
  const need = (condition, node) => { if (!condition) fail(node); };
  const nodes = (scope, predicate) => {
    const found = []; const visit = node => {
      if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
      if (predicate(node)) found.push(node);
      ts.forEachChild(node, visit);
    }; visit(scope); return found;
  };
  const one = (values, node) => { need(values.length === 1, node); return values[0]; };
  const symbol = node => { let value = checker.getSymbolAtLocation(node);
    if (value?.flags & ts.SymbolFlags.Alias) value = checker.getAliasedSymbol(value); return value; };
  const source = name => { const parsed = program.getSourceFile(resolve(root, name)); need(parsed && !parsed.isDeclarationFile, parsed); return parsed; };
  const domain = source('packages/domain/src/agent/native-agent-execution.ts');
  const initializer = one(domain.statements.filter(node => ts.isFunctionDeclaration(node)
    && node.name?.text === 'initialNativeAgentExecution'), domain);
  const target = symbol(initializer.name);
  need(target && initializer.body && initializer.parameters.length === 3, initializer);
  const producerSource = source('packages/domain/src/agent/agent.ts');
  const producer = one(producerSource.statements.filter(node => ts.isFunctionDeclaration(node)
    && node.name?.text === 'persistAgentTaskCoreInTransaction'), producerSource);
  const calls = [];
  // Resolve all runtime references, including imports/re-exports and aliases.
  // An opaque forwarding callback or computed profile is not another trusted
  // image writer and cannot borrow this opt-in proof.
  for (const parsed of program.getSourceFiles()) {
    if (parsed.isDeclarationFile || !/^(?:apps|packages)\//u.test(relative(root, parsed.fileName).replaceAll('\\', '/'))) continue;
    for (const node of nodes(parsed, ts.isIdentifier)) {
      if (symbol(node) !== target) continue;
      const parent = node.parent;
      if (node === initializer.name || ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) continue;
      need(ts.isCallExpression(parent) && parent.expression === node && !parent.questionDotToken
        && !parent.arguments.some(ts.isSpreadElement), node);
      need(parent.arguments.length >= 1 && parent.arguments.length <= 3, parent);
      const profile = parent.arguments[1];
      need(!profile || ts.isStringLiteral(profile), parent);
      if (profile?.text === 'image-review') calls.push(parent);
    }
  }
  const call = one(calls, producer);
  need(nodes(producer, node => node === call).length === 1, call);
  const conditional = call.parent;
  need(ts.isConditionalExpression(conditional) && conditional.whenTrue === call
    && ts.isIdentifier(conditional.condition) && conditional.condition.text === 'nativeReviewResult'
    && ts.isIdentifier(conditional.whenFalse) && conditional.whenFalse.text === 'undefined', call);
  const reviewSymbol = symbol(conditional.condition);
  const review = one(reviewSymbol?.declarations?.filter(ts.isVariableDeclaration) ?? [], conditional);
  need(review.initializer && ts.isCallExpression(review.initializer)
    && ts.isIdentifier(review.initializer.expression) && review.initializer.expression.text === 'initialNativeImageReviewResult', review);
  const reviewFunction = one(symbol(review.initializer.expression)?.declarations?.filter(ts.isFunctionDeclaration) ?? [], review);
  need(reviewFunction.getSourceFile() === source('packages/domain/src/assets/scene-image.ts')
    && review.initializer.arguments.length === 2, review);
  const replay = one(nodes(producer, node => ts.isIfStatement(node) && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === 'idempotencyKey'), producer);
  const replayReturn = one(nodes(replay, node => ts.isReturnStatement(node) && node.expression
    && ts.isObjectLiteralExpression(node.expression) && node.expression.properties.some(property => ts.isPropertyAssignment(property)
      && property.name.getText() === 'replayed' && property.initializer.kind === ts.SyntaxKind.TrueKeyword)), replay);
  need(replay.end < review.pos && replayReturn.pos < call.pos, replay);
  need(call.arguments.length === 2 || call.arguments.length === 3 && ts.isStringLiteral(call.arguments[2])
    && call.arguments[2].text === 'image-review-tool-final-v1', call);
  need(ts.isPropertyAccessExpression(call.arguments[0]) && call.arguments[0].name.text === 'nativeAgentRuntime'
    && ts.isIdentifier(call.arguments[0].expression) && symbol(call.arguments[0].expression) === symbol(producer.parameters[0].name), call);
  // No guessed string replacements: preserve this actual Program's original
  // nodes and omit only the one trusted optional argument.
  const transformed = ts.transform(producerSource, [transformation => {
    const visit = node => node === call ? ts.factory.updateCallExpression(node, node.expression, node.typeArguments, node.arguments.slice(0, 2))
      : ts.visitEachChild(node, visit, transformation);
    return node => ts.visitNode(node, visit);
  }]);
  let text;
  try { text = ts.createPrinter({ removeComments: true }).printFile(transformed.transformed[0]); }
  finally { transformed.dispose(); }
  return { kind: call.arguments.length === 3 ? 'tagged' : 'absent', initializer, producer, call, replay, reviewFunction,
    source: producerSource, text, nodes, symbol };
}

// A conditional constructor lemma, not a persistence/context compatibility
// grant. It follows the actual bound discriminator at every marker writer and
// the Session's new raw-turn constructors before legacy erasure is considered.
function finiteImageProtocolPartition(ts, context) {
  const producer = finiteImageProducerTerms(ts, context), { program, checker, root } = context;
  const { nodes, symbol } = producer;
  const fail = node => { throw { reason: 'IMAGE_PROTOCOL_PARTITION_UNKNOWN', node }; };
  const need = (condition, node) => { if (!condition) fail(node); };
  const one = (values, node) => { need(values.length === 1, node); return values[0]; };
  const file = name => { const source = program.getSourceFile(resolve(root, name)); need(source && !source.isDeclarationFile, source); return source; };
  const fn = (source, name) => one(nodes(source, node => ts.isFunctionDeclaration(node) && node.name?.text === name), source);
  const variable = (scope, name) => one(nodes(scope, node => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name), scope);
  const unwrap = raw => { let node = raw; while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)
    || ts.isNonNullExpression(node))) node = node.expression; return node; };
  const path = node => {
    node = unwrap(node);
    if (ts.isIdentifier(node)) return { base:symbol(node), parts:[] };
    if (ts.isPropertyAccessExpression(node) && !node.questionDotToken) { const parent = path(node.expression);
      return parent ? { base:parent.base, parts:[...parent.parts,node.name.text] } : undefined; }
    return undefined;
  };
  const receiver = (node, base, parts) => { const value = path(node);
    return value && value.base === base && JSON.stringify(value.parts) === JSON.stringify(parts); };
  const eq = (node, base, parts, literal, operator = ts.SyntaxKind.EqualsEqualsEqualsToken) => {
    node = unwrap(node); return ts.isBinaryExpression(node) && node.operatorToken.kind === operator
      && receiver(node.left, base, parts) && ts.isStringLiteral(unwrap(node.right)) && unwrap(node.right).text === literal;
  };
  const conjuncts = node => { node = unwrap(node); return ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
    ? [...conjuncts(node.left), ...conjuncts(node.right)] : [node]; };
  const guarded = (node, accepts) => {
    for (let current = node.parent; current; current = current.parent) {
      if (ts.isIfStatement(current) && node.pos >= current.thenStatement.pos && node.end <= current.thenStatement.end && accepts(current.expression)) return current;
      if (ts.isConditionalExpression(current) && node.pos >= current.whenTrue.pos && node.end <= current.whenTrue.end && accepts(current.condition)) return current;
    }
    return undefined;
  };
  const property = node => (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node))
    && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) ? node.name.text : undefined;
  const marked = variable(producer.initializer,'marked');
  need(Boolean(marked.parent.flags & ts.NodeFlags.Const) && ts.isBinaryExpression(marked.initializer)
    && marked.initializer.operatorToken.kind === ts.SyntaxKind.GreaterThanEqualsToken
    && ts.isPropertyAccessExpression(marked.initializer.left)
    && ts.isIdentifier(marked.initializer.left.expression) && marked.initializer.left.expression.text === 'arguments'
    && marked.initializer.left.name.text === 'length'
    && ts.isNumericLiteral(marked.initializer.right) && marked.initializer.right.text === '3'
    && !(symbol(marked.initializer.left.expression)?.declarations ?? []).length,marked);
  const sessionSource = file('apps/agent-worker/src/native-agent/session.ts'), session = fn(sessionSource,'createNativeAgentSession');
  const binding = variable(session,'binding'), bindingSymbol = symbol(binding.name);
  need(ts.isCallExpression(binding.initializer) && ts.isIdentifier(binding.initializer.expression)
    && binding.initializer.expression.text === 'structuredClone' && binding.initializer.arguments.length === 1
    && !(symbol(binding.initializer.expression)?.declarations ?? []).some(node => !node.getSourceFile().isDeclarationFile)
    && receiver(binding.initializer.arguments[0], symbol(session.parameters[0].name), ['binding']), binding);
  const tagged = condition => {
    const clauses = conjuncts(condition);
    return clauses.some(node => eq(node,bindingSymbol,['sourceKind'],'illustration-image'))
      && clauses.some(node => eq(node,bindingSymbol,['imageReview','imageResultPolicy'],'image-review-tool-final-v1'));
  };
  const complete = fn(session,'completeOnce');
  const terminal = variable(complete,'terminal');
  const terminalGuard = guarded(terminal,tagged);
  need(terminalGuard && ts.isAwaitExpression(terminal.initializer) && ts.isCallExpression(terminal.initializer.expression), terminal);
  const read = fn(session,'read');
  need(symbol(terminal.initializer.expression.expression) === symbol(read.name), terminal);
  const sdk = one(nodes(complete,node => ts.isCallExpression(node) && ts.isIdentifier(node.expression)
    && node.expression.text === 'nativeAgentSdkRequest'),complete);
  need(terminalGuard.end < sdk.pos,terminal);
  const common = variable(complete,'common'), rawGuard = guarded(common,tagged);
  need(rawGuard && ts.isObjectLiteralExpression(common.initializer),common);
  const rawWriters = nodes(session,node => ['imageResultPolicy','effectiveRequest','received'].includes(property(node))
    || property(node) === 'state' && ts.isPropertyAssignment(node) && ts.isStringLiteral(unwrap(node.initializer)) && unwrap(node.initializer).text === 'received');
  need(rawWriters.length >= 5,common);
  for (const writer of rawWriters) need(guarded(writer,tagged) === rawGuard,writer);
  // New raw constructors may not be reached via a mutated/aliased snapshot.
  for (const node of nodes(session,ts.isIdentifier)) {
    if (symbol(node) !== bindingSymbol || node === binding.name) continue;
    const parent = node.parent;
    need(!(ts.isVariableDeclaration(parent) && parent.initializer === node),node);
    let access = node;
    while (ts.isPropertyAccessExpression(access.parent) && access.parent.expression === access) access = access.parent;
    const operation = access.parent;
    need(!(ts.isBinaryExpression(operation) && operation.left === access
      && operation.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && operation.operatorToken.kind <= ts.SyntaxKind.LastAssignment)
      && !ts.isDeleteExpression(operation),operation);
  }
  const imageSource = file('packages/domain/src/assets/native-image-review.ts');
  const prepare = fn(imageSource,'prepareAgentNativeImageReview'), marker = variable(prepare,'marker');
  need(ts.isCallExpression(marker.initializer)
    && symbol(marker.initializer.expression) === symbol(fn(imageSource,'readNativeImageAgentExecution').name),marker);
  const persist = fn(file('apps/agent-worker/src/native-agent/task-store.ts'),'persist');
  const illustration = fn(file('apps/agent-worker/src/native-agent/illustration-task.ts'),'runNativeImageReviewTask');
  const materialize = variable(illustration,'materialize');
  need(ts.isArrowFunction(materialize.initializer),materialize);
  const final = variable(materialize.initializer,'final'), tag = variable(materialize.initializer,'tagged');
  const envelope = variable(illustration,'envelope');
  need(eq(tag.initializer,symbol(envelope.name),['imageResultPolicy'],'image-review-tool-final-v1'),tag);
  need(ts.isConditionalExpression(final.initializer) && ts.isIdentifier(final.initializer.condition)
    && symbol(final.initializer.condition) === symbol(tag.name)
    && ts.isIdentifier(final.initializer.whenFalse) && final.initializer.whenFalse.text === 'undefined',final);
  const writers = [];
  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile || !/^(?:apps|packages)\//u.test(relative(root,source.fileName).replaceAll('\\','/'))) continue;
    writers.push(...nodes(source,node => property(node) === 'imageResultPolicy'));
  }
  // Exactly the five actual protocol transfers are supported. A new spread or
  // override is still retained by the complete residual comparison, never
  // inferred harmless from its property name or file.
  need(writers.length === 5,producer.initializer);
  for (const writer of writers) {
    if (nodes(producer.initializer,node => node === writer).length) {
      const contract = symbol(producer.initializer.parameters[2].name);
      need(receiver(writer.initializer,contract,[]) && guarded(writer,condition => {
        const terms = conjuncts(condition);
        return terms.some(node => receiver(node,symbol(marked.name),[]))
          && terms.some(node => eq(node,symbol(producer.initializer.parameters[1].name),[],'image-review'));
      }),writer);
    } else if (nodes(prepare,node => node === writer).length) {
      need(receiver(writer.initializer,symbol(marker.name),['imageResultPolicy'])
        && guarded(writer,node => receiver(node,symbol(marker.name),['imageResultPolicy'])),writer);
    } else if (nodes(persist,node => node === writer).length) {
      const storeBinding = variable(persist,'binding');
      need(receiver(writer.initializer,symbol(storeBinding.name),['imageReview','imageResultPolicy'])
        && guarded(writer,node => receiver(node,symbol(storeBinding.name),['imageReview','imageResultPolicy'])),writer);
    } else if (nodes(common,node => node === writer).length) {
      need(ts.isStringLiteral(unwrap(writer.initializer)) && unwrap(writer.initializer).text === 'image-review-tool-final-v1',writer);
    } else if (nodes(materialize.initializer,node => node === writer).length) {
      need(ts.isStringLiteral(unwrap(writer.initializer)) && unwrap(writer.initializer).text === 'image-review-tool-final-v1'
        && guarded(writer,node => receiver(node,symbol(final.name),[])),writer);
    } else fail(writer);
  }
  return { status:'conditional', producer, session, binding, terminalGuard, rawGuard, writers,
    outstanding:['persisted decoder/source binding','shared modes/attempt/paid CAS','legacy runtime residual/import initialization','tagged reader retention'] };
}

// The new provider -> protocol -> provider edge changes initialization order.
// Inspect the actual SCC's eager statements, not only its method declarations.
// This is another conditional lemma; legacy consumer erasure is still separate.
function finiteImageInitializationTerms(ts, context) {
  const { program, checker, root } = context;
  const fail = node => { throw { reason: 'IMAGE_INITIALIZATION_UNKNOWN', node }; };
  const need = (condition, node) => { if (!condition) fail(node); };
  const symbol = node => { let value = checker.getSymbolAtLocation(node);
    if (value?.flags & ts.SymbolFlags.Alias) value = checker.getAliasedSymbol(value); return value; };
  const provider = program.getSourceFile(resolve(root,'packages/ai-gateway/src/provider.ts'));
  const protocol = program.getSourceFile(resolve(root,'packages/ai-gateway/src/native-image-review.ts'));
  need(provider && protocol,provider);
  const graph = new Map();
  const collect = source => {
    if (graph.has(source)) return;
    need(graph.size < 128,source);
    const imports = []; graph.set(source,imports);
    for (const statement of source.statements) {
      if (!(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) || !statement.moduleSpecifier
        || statement.isTypeOnly || statement.importClause?.isTypeOnly) continue;
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings) && bindings.elements.length && bindings.elements.every(node => node.isTypeOnly)) continue;
      const dependency = (symbol(statement.moduleSpecifier)?.declarations ?? []).find(ts.isSourceFile);
      if (dependency && !dependency.isDeclarationFile) { imports.push(dependency); collect(dependency); }
      else need(!statement.moduleSpecifier.text.startsWith('.'),statement);
    }
  }; collect(provider);
  const reaches = (from,target,seen = new Set()) => {
    if (from === target) return true;
    if (seen.has(from)) return false; seen.add(from);
    return (graph.get(from) ?? []).some(dependency => reaches(dependency,target,seen));
  };
  const sources = [...graph.keys()].filter(source => reaches(source,provider));
  need(sources.includes(protocol) && (graph.get(provider) ?? []).includes(protocol),provider);
  const members = new Set(sources), freezerProofs = [];
  const unwrap = raw => { let node = raw;
    while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node))) node = node.expression;
    return node;
  };
  const intrinsic = (node,name) => ts.isIdentifier(node) && node.text === name
    && !(symbol(node)?.declarations ?? []).some(declaration => !declaration.getSourceFile().isDeclarationFile);
  const key = node => (ts.isIdentifier(node) || ts.isStringLiteral(node)) && !['__proto__','prototype','constructor'].includes(node.text);
  const exactShape = (actual,expected) => {
    const canonical = node => { const children = []; ts.forEachChild(node,child => { children.push(canonical(child)); });
      return [node.kind,ts.isIdentifier(node) || ts.isLiteralExpression(node) ? node.text
        : ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node) ? node.operator : null,children]; };
    const source = ts.createSourceFile('owned-freezer.ts',expected,ts.ScriptTarget.ES2022,true);
    need(source.parseDiagnostics.length === 0 && source.statements.length === 1,actual);
    need(JSON.stringify(canonical(actual)) === JSON.stringify(canonical(source.statements[0])),actual);
  };
  const freezer = declaration => {
    need(ts.isFunctionDeclaration(declaration) && declaration.name && declaration.parameters.length === 1 && declaration.body,declaration);
    // The grammar has no imported/user callback, accessor, spread, mutation of
    // another receiver or ambient allocation. All recursion is on values of
    // the one owned literal supplied below.
    const name = declaration.name.text, parameter = declaration.parameters[0];
    need(ts.isIdentifier(parameter.name) && !parameter.initializer && !parameter.dotDotDotToken,declaration);
    const argument = parameter.name.text;
    exactShape(declaration.body, `{ if (${argument} && typeof ${argument} === 'object') {
      Object.values(${argument}).forEach(${name}); Object.freeze(${argument}); } return ${argument}; }`);
    const inspect = node => {
      if (ts.isIdentifier(node) && node.text === 'Object') need(intrinsic(node,'Object'),node);
      if (ts.isIdentifier(node) && node.text === name && node !== declaration.name
        && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node))
        need(symbol(node) === symbol(declaration.name),node);
      ts.forEachChild(node,inspect);
    }; inspect(declaration.body); freezerProofs.push(declaration);
  };
  const visiting = new Set();
  // Allocating an operand without effects does not make its coercion safe.
  // Keep arithmetic in the Number-literal grammar actually used by these
  // constants: BigInt operations can throw, and objects/functions can invoke
  // arbitrary conversion bodies. Never evaluate candidate code for this proof.
  const numericConstant = raw => {
    const node = unwrap(raw);
    if (ts.isNumericLiteral(node)) return true;
    if (ts.isPrefixUnaryExpression(node) && [ts.SyntaxKind.PlusToken,ts.SyntaxKind.MinusToken].includes(node.operator))
      return numericConstant(node.operand);
    return ts.isBinaryExpression(node) && [ts.SyntaxKind.PlusToken,ts.SyntaxKind.MinusToken,ts.SyntaxKind.AsteriskToken,
      ts.SyntaxKind.SlashToken,ts.SyntaxKind.AsteriskAsteriskToken].includes(node.operatorToken.kind)
      && numericConstant(node.left) && numericConstant(node.right);
  };
  const pure = raw => {
    const node = unwrap(raw); need(node,node);
    if (ts.isLiteralExpression(node) || ts.isNoSubstitutionTemplateLiteral(node)
      || [ts.SyntaxKind.TrueKeyword,ts.SyntaxKind.FalseKeyword,ts.SyntaxKind.NullKeyword].includes(node.kind)) return;
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return;
    if (ts.isNewExpression(node) && intrinsic(node.expression,'Set') && node.arguments?.length === 1
      && ts.isArrayLiteralExpression(node.arguments[0])) { pure(node.arguments[0]); return; }
    if (ts.isArrayLiteralExpression(node)) { for (const element of node.elements) pure(element); return; }
    if (ts.isObjectLiteralExpression(node)) {
      for (const property of node.properties) {
        need(ts.isPropertyAssignment(property) && key(property.name),property); pure(property.initializer);
      } return;
    }
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.PlusToken,ts.SyntaxKind.MinusToken,ts.SyntaxKind.AsteriskToken,
      ts.SyntaxKind.SlashToken,ts.SyntaxKind.AsteriskAsteriskToken].includes(node.operatorToken.kind)) { need(numericConstant(node),node); return; }
    if (ts.isPrefixUnaryExpression(node) && [ts.SyntaxKind.PlusToken,ts.SyntaxKind.MinusToken].includes(node.operator)) { need(numericConstant(node),node); return; }
    if (ts.isIdentifier(node)) {
      const declaration = symbol(node)?.valueDeclaration;
      // Hoisted function references are safe; imported cyclic values/classes
      // are not read speculatively while the provider is still initializing.
      if (declaration && ts.isFunctionDeclaration(declaration)) return;
      need(declaration && ts.isVariableDeclaration(declaration) && declaration.initializer
        && !members.has(declaration.getSourceFile()) && !visiting.has(declaration),node);
      visiting.add(declaration); pure(declaration.initializer); visiting.delete(declaration); return;
    }
    if (ts.isCallExpression(node) && node.arguments.length === 1 && !node.questionDotToken && !node.typeArguments?.length) {
      pure(node.arguments[0]);
      if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'freeze'
        && intrinsic(node.expression.expression,'Object')) return;
      if (ts.isIdentifier(node.expression)) {
        const declaration = symbol(node.expression)?.valueDeclaration;
        need(declaration && declaration.getSourceFile() === node.getSourceFile(),node);
        freezer(declaration); return;
      }
    }
    fail(node);
  };
  for (const source of sources) for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement) || ts.isTypeAliasDeclaration(statement)
      || ts.isInterfaceDeclaration(statement) || ts.isFunctionDeclaration(statement) || ts.isEmptyStatement(statement)) continue;
    if (ts.isVariableStatement(statement)) {
      need(Boolean(statement.declarationList.flags & ts.NodeFlags.Const),statement);
      for (const declaration of statement.declarationList.declarations) { need(declaration.initializer,declaration); pure(declaration.initializer); }
    } else if (ts.isClassDeclaration(statement)) {
      for (const clause of statement.heritageClauses ?? []) if (clause.token === ts.SyntaxKind.ExtendsKeyword)
        for (const base of clause.types) need(intrinsic(base.expression,'Error'),base);
      for (const member of statement.members) {
        need(!member.name || !ts.isComputedPropertyName(member.name),member);
        need(!ts.isClassStaticBlockDeclaration(member) && !member.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.StaticKeyword),member);
      }
    } else fail(statement);
  }
  need(freezerProofs.length === 1,protocol);
  return { status:'conditional', sources, freezer:freezerProofs[0],
    outstanding:['actual import/dependency closure and legacy reachability','unchanged caller/runtime residual'] };
}

// Actual store modes and the captured image attempt. A rearmed task may read
// an old final, but the only Host/Session entry still requires its original
// envelope attempt. Paid completion retains that captured attempt after loss
// of live authority; finalization is a distinct mode, never a paid bypass.
function finiteImageStoreFlowTerms(ts, context) {
  const partition = finiteImageProtocolPartition(ts,context), { program,root } = context;
  const { nodes,symbol } = partition.producer;
  const fail = node => { throw { reason:'IMAGE_STORE_FLOW_UNKNOWN',node }; };
  const need = (condition,node) => { if (!condition) fail(node); };
  const one = (values,node) => { need(values.length === 1,node); return values[0]; };
  const fn = (source,name) => one(nodes(source,node => ts.isFunctionDeclaration(node) && node.name?.text === name),source);
  const variable = (scope,name) => one(nodes(scope,node => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name),scope);
  const property = (object,name) => one(object.properties.filter(node => ts.isPropertyAssignment(node)
    && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) && node.name.text === name),object).initializer;
  const routeSource = program.getSourceFile(resolve(root,'apps/agent-worker/src/native-agent/illustration-task.ts'));
  const storeSource = program.getSourceFile(resolve(root,'apps/agent-worker/src/native-agent/task-store.ts'));
  const route = fn(routeSource,'runNativeImageReviewTask'), factory = fn(storeSource,'createNativeTaskStore');
  const readPath = node => {
    while (ts.isAsExpression(node) || ts.isNonNullExpression(node) || ts.isParenthesizedExpression(node)) node = node.expression;
    if (ts.isIdentifier(node)) return [symbol(node),[]];
    if (ts.isPropertyAccessExpression(node) && !node.questionDotToken) {
      const parent = readPath(node.expression); return parent && [parent[0],[...parent[1],node.name.text]];
    }
    return undefined;
  };
  const path = (node,base,parts) => { const value = readPath(node);
    return value && value[0] === base && JSON.stringify(value[1]) === JSON.stringify(parts); };
  const routeInput = symbol(route.parameters[0].name), storeInput = symbol(factory.parameters[0].name);
  const envelope = variable(route,'envelope'), execution = variable(route,'execution');
  const storeVariable = variable(route,'store'); const create = storeVariable.initializer;
  need(ts.isCallExpression(create) && symbol(create.expression) === symbol(factory.name)
    && create.arguments.length === 1 && ts.isObjectLiteralExpression(create.arguments[0]),create);
  need(path(property(create.arguments[0],'executionAttempt'),routeInput,['task','executionAttempt'])
    && path(property(create.arguments[0],'taskId'),routeInput,['task','id']),create);
  const executionProperty = create.arguments[0].properties.filter(ts.isShorthandPropertyAssignment);
  need(executionProperty.length === 1 && context.checker.getShorthandAssignmentValueSymbol(executionProperty[0]) === symbol(execution.name),create);
  const session = variable(route,'session'), sessionCall = session.initializer;
  need(ts.isCallExpression(sessionCall) && sessionCall.arguments.length === 1 && ts.isObjectLiteralExpression(sessionCall.arguments[0])
    && symbol(sessionCall.expression) === symbol(partition.session.name),session);
  const alternatives = node => ts.isParenthesizedExpression(node) ? alternatives(node.expression)
    : ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.BarBarToken
      ? [...alternatives(node.left),...alternatives(node.right)] : [node];
  const guards = route.body.statements.filter(node => ts.isIfStatement(node)
    && alternatives(node.expression).filter(item => ts.isBinaryExpression(item) && item.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken
      && path(item.left,routeInput,['task','executionAttempt']) && path(item.right,symbol(envelope.name),['executionAttempt'])).length === 1
    && ts.isExpressionStatement(node.thenStatement) && ts.isCallExpression(node.thenStatement.expression)
    && symbol(node.thenStatement.expression.expression) === symbol(fn(routeSource,'stopped').name));
  const guard = one(guards,route);
  need(guard.end < session.pos && storeVariable.end < guard.pos && !guard.elseStatement,guard);
  const guardBody = ts.isBlock(guard.thenStatement) ? guard.thenStatement.statements : [guard.thenStatement];
  need(guardBody.length === 1 && ts.isExpressionStatement(guardBody[0]) && ts.isCallExpression(guardBody[0].expression)
    && symbol(guardBody[0].expression.expression) === symbol(fn(routeSource,'stopped').name),guard);
  // The task is a fresh literal passed only to this call, not the queue's
  // mutable task object. Its scalar attempt cannot be changed by an awaited
  // Prisma/storage callback holding the original outer task.
  const entryCalls = [];
  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile || !/^(?:apps|packages)\//u.test(relative(root,source.fileName).replaceAll('\\','/'))) continue;
    for (const node of nodes(source,ts.isIdentifier)) if (symbol(node) === symbol(route.name)) {
      const parent = node.parent;
      if (node === route.name || ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) continue;
      need(ts.isCallExpression(parent) && parent.expression === node, node); entryCalls.push(parent);
    }
  }
  const entry = one(entryCalls,route);
  need(entry.arguments.length === 1 && ts.isObjectLiteralExpression(entry.arguments[0]),entry);
  const task = property(entry.arguments[0],'task');
  need(ts.isObjectLiteralExpression(task) && task.properties.length === 3
    && ['id','executionAttempt','result'].every(name => property(task,name)),task);
  for (const node of nodes(route,item => ts.isPropertyAccessExpression(item) && path(item,routeInput,['task']))) {
    need(ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node
      && ['id','executionAttempt','result'].includes(node.parent.name.text),node);
    const value = node.parent, operation = value.parent;
    need(!(ts.isBinaryExpression(operation) && operation.left === value && operation.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && operation.operatorToken.kind <= ts.SyntaxKind.LastAssignment) && !ts.isDeleteExpression(operation),operation);
  }
  const update = fn(factory,'update'), persist = fn(factory,'persist'), reference = variable(persist,'reference');
  need(update.parameters.length === 3 && ts.isIdentifier(update.parameters[2].name),update);
  const modes = new Map(), modeSymbol = symbol(update.parameters[2].name);
  const returned = one(factory.body.statements.filter(ts.isReturnStatement),factory);
  need(ts.isObjectLiteralExpression(returned.expression) && !returned.expression.properties.some(ts.isSpreadAssignment),returned);
  for (const [member,mode] of [['compareAndSet','start'],['complete','paid'],['finalize','final']]) {
    const value = property(returned.expression,member);
    need(ts.isArrowFunction(value) && value.parameters.length === 2 && ts.isCallExpression(value.body)
      && symbol(value.body.expression) === symbol(update.name) && value.body.arguments.length === 3,value);
    need(value.body.arguments.slice(0,2).every((argument,index) => path(argument,symbol(value.parameters[index].name),[]))
      && ts.isStringLiteral(value.body.arguments[2]) && value.body.arguments[2].text === mode,value);
    modes.set(member,{ mode,node:value });
  }
  need(nodes(factory,node => ts.isCallExpression(node) && symbol(node.expression) === symbol(update.name)).length === 3,update);
  for (const node of nodes(factory,ts.isIdentifier)) if (symbol(node) === symbol(update.name) && node !== update.name)
    need(ts.isCallExpression(node.parent) && node.parent.expression === node,node);
  const cas = one(nodes(update,node => ts.isCallExpression(node) && ts.isIdentifier(node.expression)
    && node.expression.text === 'compareNativeAgentCheckpoint'),update);
  need(cas.arguments.length === 2 && ts.isObjectLiteralExpression(cas.arguments[1]),cas);
  need(path(property(cas.arguments[1],'executionAttempt'),storeInput,['executionAttempt'])
    && path(property(cas.arguments[1],'expectedExecution'),storeInput,['execution']),cas);
  const paid = property(cas.arguments[1],'paidCompletion');
  need(ts.isBinaryExpression(paid) && paid.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
    && path(paid.left,modeSymbol,[]) && ts.isStringLiteral(paid.right) && paid.right.text === 'paid',paid);
  const finalFlags = cas.arguments[1].properties.filter(ts.isSpreadAssignment);
  need(finalFlags.length === 1,cas);
  let flag = finalFlags[0].expression;
  while (ts.isParenthesizedExpression(flag)) flag = flag.expression;
  need(ts.isConditionalExpression(flag),flag);
  const when = flag.condition;
  need(ts.isBinaryExpression(when) && when.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
    && path(when.left,modeSymbol,[]) && ts.isStringLiteral(when.right) && when.right.text === 'final'
    && ts.isObjectLiteralExpression(flag.whenTrue) && flag.whenTrue.properties.length === 1
    && property(flag.whenTrue,'validatedFinalization').kind === ts.SyntaxKind.TrueKeyword
    && ts.isObjectLiteralExpression(flag.whenFalse) && flag.whenFalse.properties.length === 0,flag);
  const attempt = property(reference.initializer,'executionAttempt'), binding = variable(persist,'binding');
  need(ts.isConditionalExpression(attempt) && ts.isBinaryExpression(attempt.condition)
    && attempt.condition.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
    && path(attempt.condition.left,symbol(binding.name),['sourceKind'])
    && ts.isStringLiteral(attempt.condition.right) && attempt.condition.right.text === 'illustration-image'
    && path(attempt.whenTrue,symbol(binding.name),['imageReview','executionAttempt'])
    && path(attempt.whenFalse,storeInput,['executionAttempt']),attempt);
  return { status:'conditional',partition,route,factory,entry,guard,create,session,update,persist,reference,cas,modes,
    outstanding:['all private constructors and decoder binding','exact CAS/byte runtime residual','tagged capability retention'] };
}

// Specialize the one initializer over its actual retained call domain. No
// image caller supplies a third argument in I1; the new image alternative is
// therefore unreachable when marked, while all other profiles preserve the
// original planning-contract rejection and result. Compare the remainder to
// the actual rollback function rather than a frozen application template.
function finiteImageInitializerProjection(ts,context,rollbackContext) {
  const model = finiteImageProducerTerms(ts,context), previous = finiteImageProducerTerms(ts,rollbackContext);
  const { nodes,symbol } = model;
  const fail = node => { throw { reason:'IMAGE_INITIALIZER_RESIDUAL_UNKNOWN',node }; };
  const need = (condition,node) => { if (!condition) fail(node); };
  need(model.kind === 'absent' && previous.kind === 'absent',model.call);
  const fn = model.initializer, old = previous.initializer;
  const profile = symbol(fn.parameters[1].name), contract = symbol(fn.parameters[2].name);
  need(ts.isIdentifier(old.parameters[2].name),old);
  const oldName = old.parameters[2].name.text;
  need(!nodes(fn,node => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === oldName).length,fn);
  const unwrap = raw => { let node = raw; while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node))) node = node.expression; return node; };
  const same = (node,value) => ts.isIdentifier(unwrap(node)) && symbol(unwrap(node)) === value;
  const equal = (node,value,literal) => { node = unwrap(node);
    return ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
      && same(node.left,value) && ts.isStringLiteral(unwrap(node.right)) && unwrap(node.right).text === literal;
  };
  const marked = nodes(fn,node => ts.isVariableDeclaration(node) && node.name.text === 'marked');
  need(marked.length === 1,fn); const markedSymbol = symbol(marked[0].name);
  const guard = fn.body.statements[1];
  need(ts.isIfStatement(guard) && ts.isBinaryExpression(guard.expression)
    && guard.expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
    && same(guard.expression.left,markedSymbol),guard);
  const rejected = unwrap(guard.expression.right);
  need(ts.isPrefixUnaryExpression(rejected) && rejected.operator === ts.SyntaxKind.ExclamationToken,rejected);
  const alternatives = unwrap(rejected.operand);
  need(ts.isBinaryExpression(alternatives) && alternatives.operatorToken.kind === ts.SyntaxKind.BarBarToken,alternatives);
  const newChoice = unwrap(alternatives.right);
  need(ts.isBinaryExpression(newChoice) && newChoice.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
    && equal(newChoice.left,profile,'image-review') && equal(newChoice.right,contract,'image-review-tool-final-v1'),newChoice);
  const oldChoice = unwrap(alternatives.left);
  need(ts.isBinaryExpression(oldChoice) && oldChoice.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
    && equal(oldChoice.left,profile,'paper-illustration'),oldChoice);
  const spreads = nodes(fn,node => ts.isSpreadAssignment(node) && ts.isConditionalExpression(unwrap(node.expression)));
  const replacements = new Map();
  for (const spread of spreads) {
    const expression = unwrap(spread.expression), condition = unwrap(expression.condition), yes = unwrap(expression.whenTrue), no = unwrap(expression.whenFalse);
    if (!ts.isBinaryExpression(condition) || condition.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken
      || !same(condition.left,markedSymbol)) continue;
    need(ts.isObjectLiteralExpression(yes) && yes.properties.length === 1 && ts.isObjectLiteralExpression(no) && !no.properties.length,spread);
    const property = yes.properties[0];
    need(ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && same(property.initializer,contract),property);
    if (equal(condition.right,profile,'image-review')) {
      need(property.name.text === 'imageResultPolicy',property); replacements.set(spread,null);
    } else if (equal(condition.right,profile,'paper-illustration')) {
      need(property.name.text === 'planningContract',property); replacements.set(spread,marked[0].name);
    } else fail(spread);
  }
  need(replacements.size === 2,fn);
  const factory = ts.factory;
  const transformed = ts.transform(fn,[transformation => {
    const visit = node => {
      if (node === newChoice) return factory.createFalse();
      if (replacements.has(node)) {
        const condition = replacements.get(node); if (!condition) return undefined;
        const expression = unwrap(node.expression);
        let value = factory.updateConditionalExpression(expression,condition,expression.questionToken,
          ts.visitNode(expression.whenTrue,visit),expression.colonToken,expression.whenFalse);
        if (ts.isParenthesizedExpression(node.expression)) value = factory.updateParenthesizedExpression(node.expression,value);
        return factory.updateSpreadAssignment(node,value);
      }
      if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === oldName && same(node.initializer,contract))
        return factory.createShorthandPropertyAssignment(oldName);
      if (ts.isIdentifier(node) && symbol(node) === contract) return factory.createIdentifier(oldName);
      let result = ts.visitEachChild(node,visit,transformation);
      if (ts.isBinaryExpression(result) && result.operatorToken.kind === ts.SyntaxKind.BarBarToken
        && unwrap(result.right).kind === ts.SyntaxKind.FalseKeyword) return result.left;
      if (ts.isPrefixUnaryExpression(result) && result.operator === ts.SyntaxKind.ExclamationToken) {
        const operand = unwrap(result.operand);
        if (ts.isBinaryExpression(operand) && operand.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)
          return factory.createBinaryExpression(ts.visitNode(factory.createPrefixUnaryExpression(ts.SyntaxKind.ExclamationToken,operand.left),visit),
            ts.SyntaxKind.BarBarToken,ts.visitNode(factory.createPrefixUnaryExpression(ts.SyntaxKind.ExclamationToken,operand.right),visit));
        if (ts.isBinaryExpression(operand) && operand.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken)
          return factory.updateBinaryExpression(operand,operand.left,factory.createToken(ts.SyntaxKind.ExclamationEqualsEqualsToken),operand.right);
      }
      return result;
    };
    return node => ts.visitNode(node,visit);
  }]);
  let text, projected;
  try { projected=transformed.transformed[0]; text = ts.createPrinter({ removeComments:true }).printNode(ts.EmitHint.Unspecified,projected,fn.getSourceFile()); }
  finally { transformed.dispose(); }
  return { status:'conditional',source:fn.getSourceFile(),node:fn,projected,text,rollback:old,
    outstanding:['strict reader/context residual and actual complete collection'] };
}

// Session specialization is inductive over owned old private turns: the old
// constructors/replay prefix emit only started/completed turns and never the
// new top-level fields. The actual tagged constructor partition is checked
// first; an unknown receiver/call/effect is not a false predicate.
function finiteImageSessionProjection(ts,context,rollbackContext) {
  const partition = finiteImageProtocolPartition(ts,context), { nodes,symbol } = partition.producer;
  const fail = node => { throw { reason:'IMAGE_SESSION_RESIDUAL_UNKNOWN',node }; };
  const need = (condition,node) => { if (!condition) fail(node); };
  const source = partition.session.getSourceFile();
  const old = rollbackContext.program.getSourceFile(resolve(rollbackContext.root,'apps/agent-worker/src/native-agent/session.ts'));
  need(old && !old.isDeclarationFile,source);
  const read = nodes(partition.session,node => ts.isFunctionDeclaration(node) && node.name?.text === 'read');
  need(read.length === 1,partition.session);
  const state = nodes(read[0],node => ts.isVariableDeclaration(node) && node.name.text === 'state');
  need(state.length === 1 && ts.isAwaitExpression(state[0].initializer) && ts.isCallExpression(state[0].initializer.expression),read[0]);
  const invocation = state[0].initializer.expression;
  const parts = node => ts.isIdentifier(node) ? [symbol(node),[]]
    : ts.isPropertyAccessExpression(node) ? ((parent) => parent && [parent[0],[...parent[1],node.name.text]])(parts(node.expression)) : undefined;
  const at = (node,base,path) => { const value = parts(node); return value && value[0] === base && JSON.stringify(value[1]) === JSON.stringify(path); };
  need(at(invocation.expression,symbol(partition.session.parameters[0].name),['store','read']) && !invocation.arguments.length,invocation);
  const absent = new Set(['imageResultPolicy','effectiveRequest','received','validatedFinal']);
  const UNKNOWN = { known:false,pure:false };
  const constant = value => ({ known:true,pure:true,value });
  const evaluate = (raw,turn) => {
    let node = raw; while (ts.isParenthesizedExpression(node)) node = node.expression;
    if (node.kind === ts.SyntaxKind.TrueKeyword) return constant(true);
    if (node.kind === ts.SyntaxKind.FalseKeyword) return constant(false);
    if (ts.isStringLiteral(node)) return constant(node.text);
    if (ts.isIdentifier(node) && node.text === 'undefined' && !(symbol(node)?.declarations ?? []).length) return constant(undefined);
    if (ts.isPropertyAccessExpression(node) && at(node.expression,turn,[])) {
      if (absent.has(node.name.text)) return constant(undefined);
      return { known:false,pure:true,oldState:node.name.text === 'state' };
    }
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) {
      const value = evaluate(node.operand,turn); return value.known ? constant(!value.value) : { known:false,pure:value.pure };
    }
    if (!ts.isBinaryExpression(node)) return UNKNOWN;
    const left = evaluate(node.left,turn), operator = node.operatorToken.kind;
    if (operator === ts.SyntaxKind.AmpersandAmpersandToken && left.known && !left.value
      || operator === ts.SyntaxKind.BarBarToken && left.known && left.value) return left;
    const right = evaluate(node.right,turn);
    if (operator === ts.SyntaxKind.AmpersandAmpersandToken) {
      if (left.known) return right;
      if (right.known && !right.value && left.pure) return constant(false);
    }
    if (operator === ts.SyntaxKind.BarBarToken && left.known && !left.value) return right;
    if ([ts.SyntaxKind.EqualsEqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(operator)) {
      let equal;
      if (left.known && right.known) equal = left.value === right.value;
      else if (left.oldState && right.known && right.value === 'received') equal = false;
      if (equal !== undefined) return constant(operator === ts.SyntaxKind.EqualsEqualsEqualsToken ? equal : !equal);
    }
    return { known:false,pure:left.pure && right.pure };
  };
  const erased = new Set([partition.terminalGuard,partition.rawGuard]);
  for (const statement of read[0].body.statements) {
    if (!ts.isIfStatement(statement) || !ts.isCallExpression(statement.expression)) continue;
    const call = statement.expression;
    if (!ts.isPropertyAccessExpression(call.expression) || call.expression.name.text !== 'some'
      || !at(call.expression.expression,symbol(state[0].name),['turns']) || call.arguments.length !== 1
      || !ts.isArrowFunction(call.arguments[0]) || call.arguments[0].parameters.length !== 1) continue;
    const callback = call.arguments[0], subject = symbol(callback.parameters[0].name), value = evaluate(callback.body,subject);
    if (value.known && !value.value && value.pure) erased.add(statement);
  }
  need(erased.size === 3,read[0]);
  const topNames = statement => ts.isFunctionDeclaration(statement) ? [statement.name?.text]
    : ts.isVariableStatement(statement) ? statement.declarationList.declarations.map(node => node.name.text) : [];
  const oldNames = new Set(old.statements.flatMap(topNames)), removed = new Map();
  for (const statement of source.statements) {
    const names = topNames(statement); if (!names.length || names.some(name => oldNames.has(name))) continue;
    if (ts.isVariableStatement(statement)) need(statement.declarationList.declarations.every(node => ts.isIdentifier(node.name)
      && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))),statement);
    else need(ts.isFunctionDeclaration(statement),statement);
    erased.add(statement);
    if (ts.isFunctionDeclaration(statement)) removed.set(symbol(statement.name),statement);
    else for (const declaration of statement.declarationList.declarations) removed.set(symbol(declaration.name),statement);
  }
  const insideErasure = node => { for (let current = node;current;current = current.parent) if (erased.has(current)) return true; return false; };
  for (const node of nodes(source,ts.isIdentifier)) if (!insideErasure(node) && removed.has(symbol(node))) {
    need(ts.isImportSpecifier(node.parent) || ts.isExportSpecifier(node.parent),node);
  }
  const transformed = ts.transform(source,[transformation => {
    const visit = node => erased.has(node) ? undefined : ts.visitEachChild(node,visit,transformation);
    return node => ts.visitNode(node,visit);
  }]);
  let text;
  try { text = ts.createPrinter({ removeComments:true }).printFile(transformed.transformed[0]); }
  finally { transformed.dispose(); }
  return { status:'conditional',source,text,ast:transformed.transformed[0],rollback:old,erased,removed,
    outstanding:['whole private constructor/store context','external helper references and import effects','complete original canonical comparison'] };
}

// Finite persisted-JSON decoder specialization. Only bound marker/envelope/CP
// receivers carry ABSENT facts; a property with the same spelling on another
// object is not a protocol field. Reads must remain behind the real JSON/null
// guards. The resulting whole functions still need original canonical equality.
function finiteImageDecoderProjection(ts,context,rollbackContext) {
  const partition = finiteImageProtocolPartition(ts,context), { nodes,symbol } = partition.producer;
  const fail = node => { throw { reason:'IMAGE_DECODER_RESIDUAL_UNKNOWN',node }; };
  const need = (condition,node) => { if (!condition) fail(node); };
  const source = context.program.getSourceFile(resolve(context.root,'packages/domain/src/assets/native-image-review.ts'));
  const old = rollbackContext.program.getSourceFile(resolve(rollbackContext.root,'packages/domain/src/assets/native-image-review.ts'));
  need(source && old,source);
  const named = (name) => { const values = source.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    need(values.length === 1,source); return values[0]; };
  const unwrap = raw => { let node = raw; while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node))) node = node.expression; return node; };
  const recordDeclaration = nodes(source,node => ts.isVariableDeclaration(node) && node.name.text === 'record');
  need(recordDeclaration.length === 1,source);
  const recordSymbol = symbol(recordDeclaration[0].name);
  const reader = named('readNativeImageAgentExecution'), envelopeReader = named('readNativeImageReviewCheckpoint');
  const rootKinds = new Map([[symbol(reader.parameters[0].name),'result'],[symbol(envelopeReader.parameters[0].name),'result']]);
  const kindCache = new Map(), resolving = new Set();
  const infer = raw => {
    const node = unwrap(raw); if (!node) return undefined;
    if (ts.isIdentifier(node)) {
      const value = symbol(node); if (rootKinds.has(value)) return rootKinds.get(value);
      if (kindCache.has(value)) return kindCache.get(value);
      const declaration = value?.valueDeclaration;
      if (!declaration || !ts.isVariableDeclaration(declaration) || !declaration.initializer || resolving.has(declaration)) return undefined;
      resolving.add(declaration); const result = infer(declaration.initializer); resolving.delete(declaration);
      kindCache.set(value,result); return result;
    }
    if (ts.isCallExpression(node)) {
      if (symbol(node.expression) === symbol(reader.name)) return 'marker';
      if (symbol(node.expression) === symbol(envelopeReader.name)) return 'envelope';
    }
    if (ts.isPropertyAccessExpression(node)) {
      const base = infer(node.expression);
      if (base === 'result' && node.name.text === 'nativeAgentExecution') return 'marker';
      if (base === 'result' && node.name.text === 'nativeImageReview') return 'envelope';
      if (base === 'marker' && node.name.text === 'checkpoint') return 'cp';
    }
    return undefined;
  };
  const path = (raw,seen = new Set()) => {
    const node = unwrap(raw);
    if (ts.isIdentifier(node)) {
      const value = symbol(node), declaration = value?.valueDeclaration;
      if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer && !seen.has(declaration)
        && ts.isPropertyAccessExpression(unwrap(declaration.initializer))) return path(declaration.initializer,new Set(seen).add(declaration));
      return value && [value,[]];
    }
    if (ts.isPropertyAccessExpression(node)) { const parent = path(node.expression,seen); return parent && [parent[0],[...parent[1],node.name.text]]; }
    return undefined;
  };
  const same = (a,b) => { const left = path(a), right = path(b);
    return left && right && left[0] === right[0] && JSON.stringify(left[1]) === JSON.stringify(right[1]); };
  const flatten = (node,operator) => { node = unwrap(node); return ts.isBinaryExpression(node) && node.operatorToken.kind === operator
    ? [...flatten(node.left,operator),...flatten(node.right,operator)] : [node]; };
  const recordTest = (node,value) => ts.isCallExpression(unwrap(node)) && symbol(unwrap(node).expression) === recordSymbol
    && unwrap(node).arguments.length === 1 && same(unwrap(node).arguments[0],value);
  const positive = (condition,value) => flatten(condition,ts.SyntaxKind.AmpersandAmpersandToken)
    .some(node => recordTest(node,value) || same(node,value) && infer(value) !== 'result');
  const negative = (condition,value) => flatten(condition,ts.SyntaxKind.BarBarToken).some(raw => {
    const node = unwrap(raw); return ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken
      && (recordTest(node.operand,value) || same(node.operand,value) && infer(value) !== 'result');
  });
  const aborts = node => {
    if (ts.isReturnStatement(node) || ts.isThrowStatement(node)) return true;
    return ts.isBlock(node) && node.statements.length > 0 && aborts(node.statements.at(-1));
  };
  const assured = (value,at) => {
    for (let current = at;current?.parent;current = current.parent) {
      const parent = current.parent;
      if (ts.isBinaryExpression(parent) && parent.right === current) {
        if (parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && positive(parent.left,value)
          || parent.operatorToken.kind === ts.SyntaxKind.BarBarToken && negative(parent.left,value)) return true;
      }
      if (ts.isConditionalExpression(parent) && (parent.whenTrue === current && positive(parent.condition,value)
        || parent.whenFalse === current && negative(parent.condition,value))) return true;
      if (ts.isIfStatement(parent) && parent.thenStatement === current && positive(parent.expression,value)) return true;
      if (ts.isBlock(parent)) {
        for (const statement of parent.statements) {
          if (statement === current || statement.pos >= current.pos) break;
          if (ts.isIfStatement(statement) && !statement.elseStatement && negative(statement.expression,value) && aborts(statement.thenStatement)) return true;
        }
      }
    }
    return false;
  };
  const fields = { marker:new Set(['imageResultPolicy']),envelope:new Set(['imageResultPolicy']),
    cp:new Set(['imageResultPolicy','received','validatedFinal']) };
  const facts = new Map(), erased = new Set(), factory = ts.factory;
  const intrinsic = (node,name) => ts.isIdentifier(node) && node.text === name
    && (symbol(node)?.declarations ?? []).every(declaration => declaration.getSourceFile().isDeclarationFile);
  const valueOf = node => {
    node = unwrap(node);
    if (ts.isIdentifier(node) && node.text === 'undefined' && !(symbol(node)?.declarations ?? []).length) return [true,undefined];
    if (node.kind === ts.SyntaxKind.TrueKeyword) return [true,true];
    if (node.kind === ts.SyntaxKind.FalseKeyword) return [true,false];
    if (ts.isStringLiteral(node)) return [true,node.text];
    return [false];
  };
  const literal = value => value === undefined ? factory.createIdentifier('undefined')
    : typeof value === 'string' ? factory.createStringLiteral(value) : value ? factory.createTrue() : factory.createFalse();
  const boolean = raw => {
    const node = unwrap(raw);
    return node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword
      || ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken
      || ts.isCallExpression(node) && symbol(node.expression) === recordSymbol
      || ts.isBinaryExpression(node) && ([ts.SyntaxKind.EqualsEqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(node.operatorToken.kind)
        || [ts.SyntaxKind.AmpersandAmpersandToken,ts.SyntaxKind.BarBarToken].includes(node.operatorToken.kind) && boolean(node.left) && boolean(node.right));
  };
  const truthContext = node => {
    const parent = node.parent;
    if (!parent) return false;
    if (ts.isIfStatement(parent) && parent.expression === node || ts.isConditionalExpression(parent) && parent.condition === node
      || ts.isPrefixUnaryExpression(parent) && parent.operator === ts.SyntaxKind.ExclamationToken) return true;
    return ts.isParenthesizedExpression(parent) || ts.isBinaryExpression(parent)
      && [ts.SyntaxKind.AmpersandAmpersandToken,ts.SyntaxKind.BarBarToken].includes(parent.operatorToken.kind)
      ? truthContext(parent) : false;
  };
  const pure = raw => {
    const node = unwrap(raw);
    if (ts.isIdentifier(node) || ts.isLiteralExpression(node) || [ts.SyntaxKind.TrueKeyword,ts.SyntaxKind.FalseKeyword].includes(node.kind)) return true;
    if (ts.isPropertyAccessExpression(node)) return Boolean(infer(node.expression)) && (node.questionDotToken || assured(node.expression,node));
    if (ts.isCallExpression(node) && symbol(node.expression) === recordSymbol && node.arguments.length === 1) return pure(node.arguments[0]);
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.EqualsEqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsEqualsToken,
      ts.SyntaxKind.AmpersandAmpersandToken,ts.SyntaxKind.BarBarToken].includes(node.operatorToken.kind)) return pure(node.left) && pure(node.right);
    if (ts.isPrefixUnaryExpression(node)) return node.operator === ts.SyntaxKind.ExclamationToken && pure(node.operand);
    return false;
  };
  const pureRecord = recordDeclaration[0].initializer;
  need(ts.isArrowFunction(pureRecord) && pureRecord.parameters.length === 1,pureRecord);
  // Check the actual predicate's bound parameter and intrinsic calls; its name
  // alone cannot authorize erasing a call with getters or ambient effects.
  const parameter = symbol(pureRecord.parameters[0].name), body = unwrap(pureRecord.body);
  need(ts.isCallExpression(body) && intrinsic(body.expression,'Boolean') && body.arguments.length === 1,body);
  const terms = flatten(body.arguments[0],ts.SyntaxKind.AmpersandAmpersandToken);
  need(terms.length === 3 && ts.isIdentifier(terms[0]) && symbol(terms[0]) === parameter,body);
  const type = terms[1], array = terms[2];
  need(ts.isBinaryExpression(type) && type.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
    && ts.isTypeOfExpression(type.left) && symbol(type.left.expression) === parameter
    && ts.isStringLiteral(type.right) && type.right.text === 'object',type);
  need(ts.isPrefixUnaryExpression(array) && array.operator === ts.SyntaxKind.ExclamationToken
    && ts.isCallExpression(array.operand) && ts.isPropertyAccessExpression(array.operand.expression)
    && intrinsic(array.operand.expression.expression,'Array') && array.operand.expression.name.text === 'isArray'
    && array.operand.arguments.length === 1 && symbol(array.operand.arguments[0]) === parameter,array);
  const hashDeclaration = nodes(source,node => ts.isVariableDeclaration(node) && node.name.text === 'hash');
  need(hashDeclaration.length === 1,source);
  const hashPredicate = hashDeclaration[0].initializer;
  need(ts.isArrowFunction(hashPredicate) && hashPredicate.parameters.length === 1,hashPredicate);
  const hashTerms = flatten(hashPredicate.body,ts.SyntaxKind.AmpersandAmpersandToken);
  const hashParameter = symbol(hashPredicate.parameters[0].name);
  need(hashTerms.length === 2 && ts.isBinaryExpression(hashTerms[0])
    && hashTerms[0].operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
    && ts.isTypeOfExpression(hashTerms[0].left) && symbol(hashTerms[0].left.expression) === hashParameter
    && ts.isStringLiteral(hashTerms[0].right) && hashTerms[0].right.text === 'string'
    && ts.isCallExpression(hashTerms[1]) && ts.isPropertyAccessExpression(hashTerms[1].expression)
    && ts.isRegularExpressionLiteral(hashTerms[1].expression.expression)
    && hashTerms[1].expression.expression.text === '/^[a-f0-9]{64}$/u'
    && hashTerms[1].expression.name.text === 'test' && hashTerms[1].arguments.length === 1
    && symbol(hashTerms[1].arguments[0]) === hashParameter,hashPredicate);
  const completedHash = nodes(reader,node => ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken
    && ts.isCallExpression(node.operand) && symbol(node.operand.expression) === symbol(hashDeclaration[0].name)
    && node.operand.arguments.length === 1 && ts.isPropertyAccessExpression(node.operand.arguments[0])
    && infer(node.operand.arguments[0].expression) === 'cp' && node.operand.arguments[0].name.text === 'responseHash');
  need(completedHash.length === 1,reader);
  const hashCheck = completedHash[0];
  const completedCondition = hashCheck.parent?.parent;
  need(completedCondition,hashCheck);
  // The complete decoder runtime is compared below/by the enclosing pair. This
  // local refinement additionally ties the nonempty-hash fact to its actual
  // completed branch, never to a similarly named unchecked object.
  let hashDominated = false;
  for (let node=hashCheck;node?.parent && node !== reader;node=node.parent) {
    const parent=node.parent;
    if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && parent.right === node) {
      hashDominated ||= flatten(parent.left,ts.SyntaxKind.AmpersandAmpersandToken).some(term => ts.isBinaryExpression(term)
        && term.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken && ts.isPropertyAccessExpression(term.left)
        && infer(term.left.expression) === 'cp' && term.left.name.text === 'state' && ts.isStringLiteral(term.right) && term.right.text === 'completed');
    }
  }
  need(hashDominated,hashCheck);
  const aliases = new Map(), aliasGuards = new Set(), hashGuards = new Map();
  for (const declaration of nodes(source,node => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'responseHash')) {
    const init=unwrap(declaration.initializer);
    need(ts.isConditionalExpression(init) && ts.isPropertyAccessExpression(unwrap(init.condition))
      && infer(unwrap(init.condition).expression) === 'marker' && unwrap(init.condition).name.text === 'imageResultPolicy',declaration);
    const raw=unwrap(init.whenFalse);
    need(ts.isPropertyAccessExpression(raw) && raw.questionDotToken && infer(raw.expression) === 'cp' && raw.name.text === 'responseHash',raw);
    const references=nodes(source,node => ts.isIdentifier(node) && symbol(node) === symbol(declaration.name) && node !== declaration.name);
    need(references.length === 2,declaration);
    const guard=references.find(node => ts.isPrefixUnaryExpression(node.parent) && node.parent.operator === ts.SyntaxKind.ExclamationToken)?.parent;
    need(guard, declaration);
    let condition=guard;
    while (ts.isBinaryExpression(condition.parent) && condition.parent.operatorToken.kind === ts.SyntaxKind.BarBarToken
      || ts.isParenthesizedExpression(condition.parent)) condition=condition.parent;
    const clauses=flatten(condition,ts.SyntaxKind.BarBarToken), index=clauses.indexOf(guard);
    need(index > 1 && clauses.slice(0,index).some(term => ts.isPrefixUnaryExpression(term) && same(term.operand,raw.expression))
      && clauses.slice(0,index).some(term => ts.isBinaryExpression(term) && term.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken
        && ts.isPropertyAccessExpression(term.left) && same(term.left.expression,raw.expression) && term.left.name.text === 'state'
        && ts.isStringLiteral(term.right) && term.right.text === 'completed'),guard);
    need(ts.isIfStatement(condition.parent) && condition.parent.expression === condition,condition);
    hashGuards.set(condition.parent,raw.expression);
    aliases.set(symbol(declaration.name),raw); aliasGuards.add(guard);
  }
  need(aliases.size === 2,source);
  const transformed = ts.transform(source,[transformation => {
    const visit = node => {
      if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return node;
      if (aliasGuards.has(node)) return literal(false);
      if (ts.isVariableDeclaration(node) && aliases.has(symbol(node.name))) return undefined;
      if (ts.isIdentifier(node) && aliases.has(symbol(node))) {
        const raw=aliases.get(symbol(node));
        need(assured(raw.expression,node),node);
        return factory.createPropertyAccessExpression(raw.expression,'responseHash');
      }
      if (ts.isIdentifier(node) && facts.has(symbol(node))) {
        const parent = node.parent;
        if (!(ts.isVariableDeclaration(parent) && parent.name === node || ts.isPropertyAccessExpression(parent) && parent.name === node
          || ts.isPropertyAssignment(parent) && parent.name === node)) return literal(facts.get(symbol(node)));
      }
      if (ts.isPropertyAccessExpression(node) && fields[infer(node.expression)]?.has(node.name.text)
        && (node.questionDotToken || assured(node.expression,node))) { erased.add(node); return literal(undefined); }
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)
        && intrinsic(node.expression.expression,'Object') && node.expression.name.text === 'hasOwn' && node.arguments.length === 2
        && ts.isStringLiteral(node.arguments[1]) && fields[infer(node.arguments[0])]?.has(node.arguments[1].text)
        && assured(node.arguments[0],node)) { erased.add(node); return literal(false); }
      if (ts.isBinaryExpression(node) && [ts.SyntaxKind.AmpersandAmpersandToken,ts.SyntaxKind.BarBarToken].includes(node.operatorToken.kind)) {
        const left = ts.visitNode(node.left,visit), known = valueOf(left);
        if (known[0] && (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ? !known[1] : known[1])) return left;
        const right = ts.visitNode(node.right,visit), other = valueOf(right);
        if (known[0]) return right;
        if (other[0] && !other[1] && (truthContext(node) || boolean(node.left))) {
          if (node.operatorToken.kind === ts.SyntaxKind.BarBarToken) return left;
          if (pure(node.left)) return literal(false);
        }
        if (other[0] && other[1] === true && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
          && (truthContext(node) || boolean(node.left))) return left;
        return factory.updateBinaryExpression(node,left,node.operatorToken,right);
      }
      if (ts.isConditionalExpression(node)) {
        const condition = ts.visitNode(node.condition,visit), known = valueOf(condition);
        if (known[0]) return ts.visitNode(known[1] ? node.whenTrue : node.whenFalse,visit);
        const yes = ts.visitNode(node.whenTrue,visit), no = ts.visitNode(node.whenFalse,visit);
        const a = valueOf(yes), b = valueOf(no);
        if (a[0] && b[0] && a[1] === b[1] && pure(node.condition)) return yes;
        return factory.updateConditionalExpression(node,condition,node.questionToken,yes,node.colonToken,no);
      }
      if (ts.isIfStatement(node)) {
        const condition = ts.visitNode(node.expression,visit), known = valueOf(condition);
        if (known[0]) return known[1] ? ts.visitNode(node.thenStatement,visit) : node.elseStatement && ts.visitNode(node.elseStatement,visit);
        let normalized=condition;
        if (hashGuards.has(node)) {
          const clauses=flatten(condition,ts.SyntaxKind.BarBarToken), cp=hashGuards.get(node);
          const finish=clauses.findIndex(term => ts.isBinaryExpression(term) && ts.isPropertyAccessExpression(term.left)
            && same(term.left.expression,cp) && term.left.name.text === 'finishReason');
          need(finish >= 0 && ts.isPropertyAccessExpression(clauses[finish+1])
            && same(clauses[finish+1].expression,cp) && clauses[finish+1].name.text === 'hasToolCalls',node);
          // The only reordered operand is a local primitive (!answer), whose
          // initializer and lack of writes are checked below. The two cloned
          // checkpoint property reads retain their original relative order.
          if (finish > 0 && ts.isPrefixUnaryExpression(clauses[finish-1]) && ts.isIdentifier(clauses[finish-1].operand)) {
            const answer=clauses[finish-1].operand, declaration=symbol(answer)?.valueDeclaration;
            need(declaration && ts.isVariableDeclaration(declaration) && ts.isConditionalExpression(declaration.initializer)
              && ts.isCallExpression(declaration.initializer.condition)
              && symbol(declaration.initializer.condition.expression) === recordSymbol
              && declaration.initializer.condition.arguments.length === 1
              && same(declaration.initializer.condition.arguments[0],declaration.initializer.whenTrue)
              && valueOf(declaration.initializer.whenFalse)[0] && valueOf(declaration.initializer.whenFalse)[1] === undefined,declaration);
            need((declaration.parent.flags & ts.NodeFlags.Const) !== 0,declaration);
            const [test]=clauses.splice(finish-1,1); clauses.splice(finish+1,0,test);
          }
          normalized=clauses.reduce((left,right) => factory.createBinaryExpression(left,ts.SyntaxKind.BarBarToken,right));
        }
        return factory.updateIfStatement(node,normalized,ts.visitNode(node.thenStatement,visit),node.elseStatement && ts.visitNode(node.elseStatement,visit));
      }
      let result = ts.visitEachChild(node,visit,transformation);
      if (ts.isParenthesizedExpression(result) && valueOf(result.expression)[0]) return result.expression;
      if (ts.isPrefixUnaryExpression(result) && result.operator === ts.SyntaxKind.ExclamationToken) {
        const value = valueOf(result.operand); if (value[0]) return literal(!value[1]);
      }
      if (ts.isBinaryExpression(result) && [ts.SyntaxKind.EqualsEqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(result.operatorToken.kind)) {
        const left = valueOf(result.left), right = valueOf(result.right);
        if (left[0] && right[0]) return literal(result.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ? left[1] === right[1] : left[1] !== right[1]);
      }
      if (ts.isVariableDeclaration(result) && ts.isIdentifier(result.name) && result.initializer) {
        const value = valueOf(result.initializer);
        if (value[0] && typeof value[1] !== 'string' && nodes(node.initializer,child => erased.has(child)).length) {
          facts.set(symbol(node.name),value[1]); return undefined;
        }
      }
      if (ts.isVariableStatement(result) && !result.declarationList.declarations.length) return undefined;
      if (ts.isArrayLiteralExpression(result)) return factory.updateArrayLiteralExpression(result,result.elements.filter(element =>
        !(ts.isSpreadElement(element) && ts.isArrayLiteralExpression(unwrap(element.expression)) && !unwrap(element.expression).elements.length)));
      if (ts.isObjectLiteralExpression(result)) return factory.updateObjectLiteralExpression(result,result.properties.filter(property =>
        !(ts.isSpreadAssignment(property) && ts.isObjectLiteralExpression(unwrap(property.expression)) && !unwrap(property.expression).properties.length)));
      return result;
    };
    return node => ts.visitNode(node,visit);
  }]);
  let text;
  try { text = ts.createPrinter({ removeComments:true }).printFile(transformed.transformed[0]); }
  finally { transformed.dispose(); }
  return { status:'conditional',source,text,ast:transformed.transformed[0],rollback:old,
    outstanding:['completed-CP hash alias refinement','strict full module runtime comparison','all caller/private constructor context'] };
}

function finiteImageStoreProjection(ts,context,rollbackContext) {
  const flow=finiteImageStoreFlowTerms(ts,context), { nodes,symbol }=flow.partition.producer;
  const source=flow.factory.getSourceFile();
  const old=rollbackContext.program.getSourceFile(resolve(rollbackContext.root,'apps/agent-worker/src/native-agent/task-store.ts'));
  const fail=node=>{throw {reason:'IMAGE_STORE_RESIDUAL_UNKNOWN',node};};
  const need=(condition,node)=>{if(!condition)fail(node);};
  need(old,source);
  const one=(values,node)=>{need(values.length===1,node);return values[0];};
  const variable=(scope,name)=>one(nodes(scope,node=>ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.name.text===name),scope);
  const oldFactory=one(old.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='createNativeTaskStore'),old);
  const oldUpdate=one(nodes(oldFactory,node=>ts.isFunctionDeclaration(node)&&node.name?.text==='update'),oldFactory);
  need(oldUpdate.parameters.length===3 && ts.isIdentifier(oldUpdate.parameters[2].name),oldUpdate);
  const paidName=oldUpdate.parameters[2].name.text, mode=symbol(flow.update.parameters[2].name);
  const returned=one(flow.factory.body.statements.filter(ts.isReturnStatement),flow.factory);
  const read=one(returned.expression.properties.filter(node=>ts.isMethodDeclaration(node)&&node.name.text==='read'),returned);
  const rootKinds=new Map([[symbol(flow.factory.parameters[0].name),'input'],
    [symbol(flow.persist.parameters[0].name),'state'],[symbol(flow.update.parameters[1].name),'state'],
    [symbol(variable(read,'state').name),'state'],[symbol(variable(read,'cp').name),'cp'],
    [symbol(variable(read,'turn').name),'turn'],[symbol(variable(flow.persist,'turn').name),'turn']]);
  const unwrap=raw=>{let node=raw;while(node&&(ts.isParenthesizedExpression(node)||ts.isAsExpression(node)||ts.isNonNullExpression(node)))node=node.expression;return node;};
  const cache=new Map(),active=new Set();
  const infer=raw=>{
    const node=unwrap(raw);if(!node)return undefined;
    if(ts.isIdentifier(node)){
      const value=symbol(node);if(rootKinds.has(value))return rootKinds.get(value);
      if(cache.has(value))return cache.get(value);
      const declaration=value?.valueDeclaration;
      if(!declaration||!ts.isVariableDeclaration(declaration)||!declaration.initializer||active.has(declaration))return undefined;
      active.add(declaration);const kind=infer(declaration.initializer);active.delete(declaration);cache.set(value,kind);return kind;
    }
    if(ts.isPropertyAccessExpression(node)){
      const parent=infer(node.expression);
      if(parent==='input'&&node.name.text==='execution')return 'marker';
      if(parent==='state'&&node.name.text==='binding')return 'binding';
      if(parent==='binding'&&node.name.text==='imageReview')return 'envelope';
    }
    if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='readNativeAgentExecution')return 'marker';
    return undefined;
  };
  const absence={state:new Set(['validatedFinal']),turn:new Set(['imageResultPolicy','effectiveRequest','received']),
    envelope:new Set(['imageResultPolicy']),marker:new Set(['imageResultPolicy']),cp:new Set(['imageResultPolicy','received','validatedFinal'])};
  const some=one(nodes(read,node=>ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)
    &&node.expression.name.text==='some'&&ts.isPropertyAccessExpression(node.expression.expression)
    &&infer(node.expression.expression.expression)==='state'&&node.expression.expression.name.text==='turns'),read);
  need(some.arguments.length===1&&ts.isArrowFunction(some.arguments[0])&&some.arguments[0].parameters.length===1,some);
  rootKinds.set(symbol(some.arguments[0].parameters[0].name),'turn');
  const sourceVariable=variable(flow.persist,'source'), sourceSymbol=symbol(sourceVariable.name);
  const sourceUses=nodes(flow.factory,node=>ts.isIdentifier(node)&&symbol(node)===sourceSymbol&&node!==sourceVariable.name);
  need(sourceUses.length===1&&ts.isSpreadAssignment(sourceUses[0].parent),sourceVariable);
  const referenceAttempt=one(flow.reference.initializer.properties.filter(node=>ts.isPropertyAssignment(node)&&node.name.text==='executionAttempt'),flow.reference);
  const facts=new Map(), factory=ts.factory;
  const deepImport=one(nodes(source,node=>ts.isImportSpecifier(node)&&node.name.text==='isDeepStrictEqual'),source);
  need(ts.isImportDeclaration(deepImport.parent.parent.parent)&&deepImport.parent.parent.parent.moduleSpecifier.text==='node:util',deepImport);
  const known=raw=>{
    const node=unwrap(raw);
    if(node?.kind===ts.SyntaxKind.TrueKeyword)return [true,true];
    if(node?.kind===ts.SyntaxKind.FalseKeyword)return [true,false];
    if(ts.isIdentifier(node)&&node.text==='undefined'&&!(symbol(node)?.declarations??[]).length)return [true,undefined];
    if(ts.isStringLiteral(node))return [true,node.text];
    return [false];
  };
  const literal=value=>value===undefined?factory.createIdentifier('undefined'):value?factory.createTrue():factory.createFalse();
  const pure=raw=>{
    const node=unwrap(raw);
    if(ts.isIdentifier(node)||ts.isStringLiteral(node)||[ts.SyntaxKind.TrueKeyword,ts.SyntaxKind.FalseKeyword].includes(node.kind))return true;
    if(ts.isPropertyAccessExpression(node))return Boolean(infer(node.expression));
    if(ts.isPrefixUnaryExpression(node))return node.operator===ts.SyntaxKind.ExclamationToken&&pure(node.operand);
    if(ts.isBinaryExpression(node)&&[ts.SyntaxKind.EqualsEqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsEqualsToken,
      ts.SyntaxKind.AmpersandAmpersandToken,ts.SyntaxKind.BarBarToken].includes(node.operatorToken.kind))return pure(node.left)&&pure(node.right);
    return false;
  };
  const boolean=raw=>{const node=unwrap(raw);return [ts.SyntaxKind.TrueKeyword,ts.SyntaxKind.FalseKeyword].includes(node.kind)
    ||ts.isPrefixUnaryExpression(node)&&node.operator===ts.SyntaxKind.ExclamationToken
    ||ts.isBinaryExpression(node)&&([ts.SyntaxKind.EqualsEqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(node.operatorToken.kind)
      ||[ts.SyntaxKind.AmpersandAmpersandToken,ts.SyntaxKind.BarBarToken].includes(node.operatorToken.kind)&&boolean(node.left)&&boolean(node.right));};
  const flatten=raw=>{const node=unwrap(raw);return ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.BarBarToken
    ?[...flatten(node.left),...flatten(node.right)]:[raw];};
  const turnGuard=one(read.body.statements.filter(node=>ts.isIfStatement(node)&&flatten(node.expression).some(term=>
    ts.isPrefixUnaryExpression(term)&&infer(term.operand)==='turn')),read);
  const persistGuard=one(flow.persist.body.statements.filter(node=>ts.isIfStatement(node)&&flatten(node.expression).some(term=>
    ts.isPrefixUnaryExpression(term)&&infer(term.operand)==='turn')),flow.persist);
  const turnMissing=one(flatten(turnGuard.expression).filter(node=>ts.isPrefixUnaryExpression(node)&&infer(node.operand)==='turn'),turnGuard);
  const within=(node,scope)=>node.pos>=scope.pos&&node.end<=scope.end;
  const admitted=node=>within(node,flow.persist)&&node.pos>=persistGuard.end
    ||within(node,read)&&(node.pos>=turnGuard.end||within(node,some.arguments[0])
      ||within(node,turnGuard.expression)&&node.pos>=turnMissing.end);
  const sameSource=variable(read,'sameSource');
  need(flatten(turnGuard.expression).some(term=>ts.isPrefixUnaryExpression(term)&&symbol(term.operand)===symbol(sameSource.name)),turnGuard);
  const projectedSource=new Map();
  const transformed=ts.transform(source,[transformation=>{
    const visit=node=>{
      if(ts.isTypeNode(node)||ts.isInterfaceDeclaration(node)||ts.isTypeAliasDeclaration(node))return node;
      if(node===flow.modes.get('finalize').node.parent)return undefined;
      if(ts.isIdentifier(node)&&symbol(node)===mode)return factory.createIdentifier(paidName);
      if(ts.isIdentifier(node)&&facts.has(symbol(node))&&!(ts.isVariableDeclaration(node.parent)&&node.parent.name===node))return facts.get(symbol(node));
      if(node===referenceAttempt)return factory.updatePropertyAssignment(node,node.name,unwrap(node.initializer).whenFalse);
      if(ts.isPropertyAccessExpression(node)&&absence[infer(node.expression)]?.has(node.name.text)&&admitted(node))return literal(undefined);
      if(ts.isStringLiteral(node)&&node.text==='imageResultPolicy'&&ts.isArrayLiteralExpression(node.parent)
        &&node.parent.parent&&ts.isPropertyAccessExpression(node.parent.parent)&&node.parent.parent.name.text==='some')return undefined;
      if(ts.isBinaryExpression(node)&&ts.isIdentifier(node.left)&&symbol(node.left)===mode){
        need(node.operatorToken.kind===ts.SyntaxKind.EqualsEqualsEqualsToken&&ts.isStringLiteral(node.right),node);
        if(node.right.text==='final')return literal(false);
        if(node.right.text==='paid')return factory.createIdentifier(paidName);
        if(node.right.text==='start')return factory.createPrefixUnaryExpression(ts.SyntaxKind.ExclamationToken,factory.createIdentifier(paidName));
        fail(node);
      }
      if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.EqualsEqualsEqualsToken
        &&ts.isPropertyAccessExpression(node.left)&&infer(node.left.expression)==='turn'&&node.left.name.text==='state'
        &&ts.isStringLiteral(node.right)&&node.right.text==='received'&&admitted(node))return literal(false);
      if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&symbol(node.expression)===symbol(flow.update.name)){
        const mode=node.arguments[2];need(ts.isStringLiteral(mode)&&['start','paid'].includes(mode.text),node);
        return factory.updateCallExpression(node,node.expression,node.typeArguments,[...node.arguments.slice(0,2),literal(mode.text==='paid')]);
      }
      if(ts.isCallExpression(node)&&symbol(node.expression)===symbol(deepImport.name)){
        const args=node.arguments.map(argument=>ts.visitNode(argument,visit));
        if(args.length===2&&args.every(argument=>known(argument)[0]&&known(argument)[1]===undefined))return literal(true);
        return factory.updateCallExpression(node,node.expression,node.typeArguments,args);
      }
      if(ts.isSpreadAssignment(node)&&ts.isIdentifier(node.expression)&&symbol(node.expression)===sourceSymbol){
        need(projectedSource.has(sourceSymbol),node);return factory.updateSpreadAssignment(node,factory.createParenthesizedExpression(projectedSource.get(sourceSymbol)));
      }
      if(ts.isBinaryExpression(node)&&[ts.SyntaxKind.AmpersandAmpersandToken,ts.SyntaxKind.BarBarToken].includes(node.operatorToken.kind)){
        const left=ts.visitNode(node.left,visit),a=known(left);
        if(a[0])return (node.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken?Boolean(a[1]):!a[1])?ts.visitNode(node.right,visit):left;
        const right=ts.visitNode(node.right,visit),b=known(right);
        if(b[0]&&boolean(node.left)){
          if(node.operatorToken.kind===ts.SyntaxKind.BarBarToken&&!b[1]||node.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken&&b[1])return left;
          if(pure(node.left))return literal(Boolean(b[1]));
        }
        return factory.updateBinaryExpression(node,left,node.operatorToken,right);
      }
      if(ts.isConditionalExpression(node)){
        const condition=ts.visitNode(node.condition,visit),value=known(condition);
        if(value[0])return ts.visitNode(value[1]?node.whenTrue:node.whenFalse,visit);
        return factory.updateConditionalExpression(node,condition,node.questionToken,ts.visitNode(node.whenTrue,visit),node.colonToken,ts.visitNode(node.whenFalse,visit));
      }
      if(ts.isIfStatement(node)){
        const condition=ts.visitNode(node.expression,visit),value=known(condition);
        if(value[0])return value[1]?ts.visitNode(node.thenStatement,visit):node.elseStatement&&ts.visitNode(node.elseStatement,visit);
        let residual=condition;
        if(node===turnGuard){
          const clauses=flatten(condition),missing=clauses.findIndex(term=>ts.isPrefixUnaryExpression(term)&&infer(term.operand)==='turn');
          need(missing>=0,condition);
          const next=clauses[missing+1];
          need(ts.isBinaryExpression(next)&&next.operatorToken.kind===ts.SyntaxKind.ExclamationEqualsEqualsToken
            &&ts.isPropertyAccessExpression(unwrap(next.left))&&infer(unwrap(next.left).expression)==='turn'&&unwrap(next.left).name.text==='state'
            &&ts.isPropertyAccessExpression(next.right)&&infer(next.right.expression)==='cp'&&next.right.name.text==='state',next);
          const optional=factory.createPropertyAccessChain(unwrap(next.left).expression,factory.createToken(ts.SyntaxKind.QuestionDotToken),'state');
          clauses.splice(missing,2,factory.updateBinaryExpression(next,optional,next.operatorToken,next.right));
          residual=clauses.reduce((left,right)=>factory.createBinaryExpression(left,ts.SyntaxKind.BarBarToken,right));
        }
        const then=ts.visitNode(node.thenStatement,visit),otherwise=node.elseStatement&&ts.visitNode(node.elseStatement,visit);
        if(ts.isBinaryExpression(condition)&&condition.operatorToken.kind===ts.SyntaxKind.EqualsEqualsEqualsToken
          &&ts.isPropertyAccessExpression(condition.left)&&infer(condition.left.expression)==='binding'&&condition.left.name.text==='sourceKind'
          &&ts.isStringLiteral(condition.right)&&condition.right.text==='illustration-image'&&ts.isBlock(then)&&then.statements.length===1){
          const guard=then.statements[0];
          if(ts.isIfStatement(guard)&&ts.isBinaryExpression(guard.expression)&&guard.expression.operatorToken.kind===ts.SyntaxKind.ExclamationEqualsEqualsToken
            &&ts.isPropertyAccessExpression(guard.expression.left)&&infer(guard.expression.left.expression)==='cp'&&guard.expression.left.name.text==='sourceKind'
            &&ts.isStringLiteral(guard.expression.right)&&guard.expression.right.text==='illustration-image'){
            need(node.parent===read.body&&node.pos>=turnGuard.end&&!otherwise,node);
            need(ts.isExpressionStatement(guard.thenStatement)&&ts.isCallExpression(guard.thenStatement.expression)
              &&ts.isIdentifier(guard.thenStatement.expression.expression)&&guard.thenStatement.expression.expression.text==='blocked'&&!guard.elseStatement,guard);
            return undefined;
          }
        }
        return factory.updateIfStatement(node,residual,then,otherwise);
      }
      let result=ts.visitEachChild(node,visit,transformation);
      if(ts.isParenthesizedExpression(result)&&known(result.expression)[0])return result.expression;
      if(ts.isPrefixUnaryExpression(result)&&result.operator===ts.SyntaxKind.ExclamationToken){const value=known(result.operand);if(value[0])return literal(!value[1]);}
      if(ts.isBinaryExpression(result)&&[ts.SyntaxKind.EqualsEqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(result.operatorToken.kind)){
        const a=known(result.left),b=known(result.right);if(a[0]&&b[0])return literal(result.operatorToken.kind===ts.SyntaxKind.EqualsEqualsEqualsToken?a[1]===b[1]:a[1]!==b[1]);
      }
      if(ts.isVariableDeclaration(result)&&ts.isIdentifier(result.name)&&result.initializer){
        if(symbol(node.name)===sourceSymbol){projectedSource.set(sourceSymbol,result.initializer);return undefined;}
        const value=known(result.initializer);if(value[0]&&typeof value[1]!=='string') {facts.set(symbol(node.name),result.initializer);return undefined;}
      }
      if(ts.isVariableStatement(result)&&!result.declarationList.declarations.length)return undefined;
      if(ts.isPropertyAssignment(result)&&result.name.text==='paidCompletion'&&ts.isIdentifier(result.initializer)&&result.initializer.text===paidName)
        return factory.createShorthandPropertyAssignment(result.name);
      if(ts.isCallExpression(result)&&node===some&&known(unwrap(result.arguments[0].body))[0]){
        need(known(unwrap(result.arguments[0].body))[1]===false,node);return literal(false);
      }
      if(ts.isObjectLiteralExpression(result))return factory.updateObjectLiteralExpression(result,result.properties.filter(property=>
        !(ts.isSpreadAssignment(property)&&ts.isObjectLiteralExpression(unwrap(property.expression))&&!unwrap(property.expression).properties.length)));
      return result;
    };
    return node=>ts.visitNode(node,visit);
  }]);
  let text;
  try{text=ts.createPrinter({removeComments:true}).printFile(transformed.transformed[0]);}finally{transformed.dispose();}
  return {status:'conditional',source,text,ast:transformed.transformed[0],rollback:old,flow,
    outstanding:['private state producer/loader partition','old optional-turn equivalence','read same-source implication','full store/runtime and CAS comparison']};
}

function finiteImageExecutionProjection(ts,context,rollbackContext) {
  const initial=finiteImageInitializerProjection(ts,context,rollbackContext);
  const flow=finiteImageStoreFlowTerms(ts,context),{nodes,symbol}=flow.partition.producer;
  const source=initial.source,old=initial.rollback.getSourceFile();
  const fail=node=>{throw {reason:'IMAGE_EXECUTION_RESIDUAL_UNKNOWN',node};};
  const need=(condition,node)=>{if(!condition)fail(node);};
  const one=(values,node)=>{need(values.length===1,node);return values[0];};
  const named=name=>one(source.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name),source);
  const read=named('readNativeAgentExecution'),cas=named('compareNativeAgentCheckpoint'),terminal=named('nativeAgentTerminalResult');
  const roots=new Map([[symbol(cas.parameters[1].name),'input'],[symbol(terminal.parameters[0].name),'task']]);
  const unwrap=raw=>{let node=raw;while(node&&(ts.isParenthesizedExpression(node)||ts.isAsExpression(node)||ts.isNonNullExpression(node)))node=node.expression;return node;};
  const cache=new Map(),active=new Set();
  const infer=raw=>{
    const node=unwrap(raw);if(!node)return undefined;
    if(ts.isIdentifier(node)){
      const value=symbol(node);if(roots.has(value))return roots.get(value);if(cache.has(value))return cache.get(value);
      const declaration=value?.valueDeclaration;
      if(!declaration||!ts.isVariableDeclaration(declaration)||!declaration.initializer||active.has(declaration))return undefined;
      active.add(declaration);const kind=infer(declaration.initializer);active.delete(declaration);cache.set(value,kind);return kind;
    }
    if(ts.isCallExpression(node)&&symbol(node.expression)===symbol(read.name))return 'marker';
    if(ts.isPropertyAccessExpression(node)){
      const parent=infer(node.expression);
      if(parent==='task'&&node.name.text==='result')return 'result';
      if(parent==='result'&&node.name.text==='nativeImageReview')return 'envelope';
      if(parent==='input'&&node.name.text==='next')return 'cp';
    }
    return undefined;
  };
  const calls=[];
  for(const parsed of context.program.getSourceFiles()){
    if(parsed.isDeclarationFile||!/^(?:apps|packages)\//u.test(relative(context.root,parsed.fileName).replaceAll('\\','/')))continue;
    for(const node of nodes(parsed,ts.isIdentifier))if(symbol(node)===symbol(cas.name)){
      if(node===cas.name||ts.isImportSpecifier(node.parent)||ts.isExportSpecifier(node.parent))continue;
      need(ts.isCallExpression(node.parent)&&node.parent.expression===node,node);calls.push(node.parent);
    }
  }
  need(calls.length===1&&calls[0]===flow.cas,cas);
  const blocked=named('blocked');
  need(blocked.body.statements.length===1&&ts.isThrowStatement(blocked.body.statements[0]),blocked);
  const aborts=node=>ts.isReturnStatement(node)||ts.isThrowStatement(node)
    ||ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)&&symbol(node.expression.expression)===symbol(blocked.name)
    ||ts.isBlock(node)&&node.statements.length>0&&aborts(node.statements.at(-1));
  const same=(left,right)=>ts.isIdentifier(unwrap(left))&&ts.isIdentifier(unwrap(right))&&symbol(unwrap(left))===symbol(unwrap(right));
  const terms=(raw,operator)=>{const node=unwrap(raw);return ts.isBinaryExpression(node)&&node.operatorToken.kind===operator
    ?[...terms(node.left,operator),...terms(node.right,operator)]:[node];};
  const negative=(condition,value)=>terms(condition,ts.SyntaxKind.BarBarToken).some(term=>ts.isPrefixUnaryExpression(term)
    &&term.operator===ts.SyntaxKind.ExclamationToken&&same(term.operand,value));
  const positive=(condition,value)=>terms(condition,ts.SyntaxKind.AmpersandAmpersandToken).some(term=>same(term,value)
    ||ts.isBinaryExpression(term)&&ts.isPropertyAccessExpression(term.left)&&same(term.left.expression,value)
      &&term.left.name.text==='profile'&&term.operatorToken.kind===ts.SyntaxKind.EqualsEqualsEqualsToken);
  const nonnull=(value,at)=>{
    for(let current=at;current?.parent;current=current.parent){
      const parent=current.parent;
      if(ts.isBinaryExpression(parent)&&parent.right===current&&parent.operatorToken.kind===ts.SyntaxKind.BarBarToken&&negative(parent.left,value))return true;
      if(ts.isIfStatement(parent)&&parent.thenStatement===current&&positive(parent.expression,value))return true;
      if(ts.isBlock(parent))for(const statement of parent.statements){
        if(statement===current||statement.pos>=current.pos)break;
        if(ts.isIfStatement(statement)&&!statement.elseStatement&&negative(statement.expression,value)&&aborts(statement.thenStatement))return true;
      }
    }
    return false;
  };
  const factory=ts.factory;
  const literal=value=>value===undefined?factory.createIdentifier('undefined'):typeof value==='string'?factory.createStringLiteral(value):value?factory.createTrue():factory.createFalse();
  const known=raw=>{const node=unwrap(raw);if(node.kind===ts.SyntaxKind.TrueKeyword)return [true,true];if(node.kind===ts.SyntaxKind.FalseKeyword)return [true,false];
    if(ts.isIdentifier(node)&&node.text==='undefined'&&!(symbol(node)?.declarations??[]).length)return [true,undefined];
    if(ts.isStringLiteral(node))return [true,node.text];return [false];};
  const pure=raw=>{
    const node=unwrap(raw);if(ts.isIdentifier(node)||ts.isStringLiteral(node))return true;
    if(ts.isPropertyAccessExpression(node))return Boolean(infer(node.expression));
    if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='record'&&node.arguments.length===1)return pure(node.arguments[0]);
    if(ts.isPrefixUnaryExpression(node)&&node.operator===ts.SyntaxKind.ExclamationToken)return pure(node.operand);
    if(ts.isBinaryExpression(node)&&[ts.SyntaxKind.AmpersandAmpersandToken,ts.SyntaxKind.BarBarToken,ts.SyntaxKind.EqualsEqualsEqualsToken,
      ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(node.operatorToken.kind))return pure(node.left)&&pure(node.right);
    return false;
  };
  const truth=node=>{const parent=node.parent;if(!parent)return false;
    if(ts.isIfStatement(parent)&&parent.expression===node||ts.isConditionalExpression(parent)&&parent.condition===node
      ||ts.isPrefixUnaryExpression(parent)&&parent.operator===ts.SyntaxKind.ExclamationToken)return true;
    return ts.isParenthesizedExpression(parent)||ts.isBinaryExpression(parent)&&[ts.SyntaxKind.AmpersandAmpersandToken,ts.SyntaxKind.BarBarToken].includes(parent.operatorToken.kind)?truth(parent):false;};
  const transformed=ts.transform(source,[transformation=>{
    const visit=node=>{
      if(node===initial.node)return initial.projected;
      if(ts.isTypeNode(node)||ts.isInterfaceDeclaration(node)||ts.isTypeAliasDeclaration(node))return node;
      if(ts.isPropertyAccessExpression(node)&&((infer(node.expression)==='marker'&&(node.questionDotToken||nonnull(node.expression,node))
        ||infer(node.expression)==='envelope')&&node.name.text==='imageResultPolicy'
        ||infer(node.expression)==='input'&&node.name.text==='validatedFinalization'||infer(node.expression)==='cp'&&node.name.text==='validatedFinal'))return literal(undefined);
      if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&ts.isIdentifier(node.expression.expression)
        &&node.expression.expression.text==='Object'&&node.expression.name.text==='hasOwn'&&node.arguments.length===2
        &&infer(node.arguments[0])==='envelope'&&ts.isStringLiteral(node.arguments[1])&&node.arguments[1].text==='imageResultPolicy')return literal(false);
      if(ts.isBinaryExpression(node)&&[ts.SyntaxKind.AmpersandAmpersandToken,ts.SyntaxKind.BarBarToken].includes(node.operatorToken.kind)){
        const left=ts.visitNode(node.left,visit),a=known(left);
        if(a[0])return (node.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken?Boolean(a[1]):!a[1])?ts.visitNode(node.right,visit):left;
        const right=ts.visitNode(node.right,visit),b=known(right);
        if(b[0]&&truth(node)){
          if(node.operatorToken.kind===ts.SyntaxKind.BarBarToken&&!b[1])return left;
          if(node.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken&&!b[1]&&pure(node.left))return literal(false);
        }
        const choice=unwrap(node.right);
        if(node.operatorToken.kind===ts.SyntaxKind.BarBarToken&&ts.isConditionalExpression(choice)
          &&ts.isPropertyAccessExpression(choice.condition)&&infer(choice.condition.expression)==='marker'
          &&choice.condition.name.text==='imageResultPolicy'){
          const clauses=raw=>{const value=unwrap(raw);return ts.isBinaryExpression(value)&&value.operatorToken.kind===ts.SyntaxKind.BarBarToken
            ?[...clauses(value.left),...clauses(value.right)]:[raw];};
          return [...clauses(left),...clauses(right)].reduce((a,b)=>factory.createBinaryExpression(a,ts.SyntaxKind.BarBarToken,b));
        }
        return factory.updateBinaryExpression(node,left,node.operatorToken,right);
      }
      if(ts.isConditionalExpression(node)){
        const condition=ts.visitNode(node.condition,visit),value=known(condition);
        if(value[0])return ts.visitNode(value[1]?node.whenTrue:node.whenFalse,visit);
        return factory.updateConditionalExpression(node,condition,node.questionToken,ts.visitNode(node.whenTrue,visit),node.colonToken,ts.visitNode(node.whenFalse,visit));
      }
      if(ts.isIfStatement(node)){
        const condition=ts.visitNode(node.expression,visit),value=known(condition);
        if(value[0])return value[1]?ts.visitNode(node.thenStatement,visit):node.elseStatement&&ts.visitNode(node.elseStatement,visit);
        return factory.updateIfStatement(node,condition,ts.visitNode(node.thenStatement,visit),node.elseStatement&&ts.visitNode(node.elseStatement,visit));
      }
      let result=ts.visitEachChild(node,visit,transformation);
      if(ts.isParenthesizedExpression(result)&&known(result.expression)[0])return result.expression;
      if(ts.isParenthesizedExpression(result)&&ts.isBinaryExpression(result.expression)
        &&result.expression.operatorToken.kind===ts.SyntaxKind.BarBarToken&&ts.isBinaryExpression(node.parent)
        &&node.parent.operatorToken.kind===ts.SyntaxKind.BarBarToken){
        // Regrouping OR preserves both evaluation order and returned value.
        // It only removes the grouping introduced by the erased tag choice.
        return result.expression;
      }
      if(ts.isPrefixUnaryExpression(result)&&result.operator===ts.SyntaxKind.ExclamationToken){const value=known(result.operand);if(value[0])return literal(!value[1]);}
      if(ts.isBinaryExpression(result)&&[ts.SyntaxKind.EqualsEqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(result.operatorToken.kind)){
        const a=known(result.left),b=known(result.right);if(a[0]&&b[0])return literal(result.operatorToken.kind===ts.SyntaxKind.EqualsEqualsEqualsToken?a[1]===b[1]:a[1]!==b[1]);
      }
      return result;
    };
    return node=>ts.visitNode(node,visit);
  }]);
  let text;try{text=ts.createPrinter({removeComments:true}).printFile(transformed.transformed[0]);}finally{transformed.dispose();}
  return {status:'conditional',source,text,ast:transformed.transformed[0],rollback:old,
    outstanding:['bound old marker/envelope/CP partition','private-store final mode unreachable','whole runtime/dependency comparison and tagged retention']};
}

function finiteImageIllustrationProjection(ts,context,rollbackContext) {
  const flow=finiteImageStoreFlowTerms(ts,context),{nodes,symbol}=flow.partition.producer;
  const source=flow.route.getSourceFile(),old=rollbackContext.program.getSourceFile(resolve(rollbackContext.root,'apps/agent-worker/src/native-agent/illustration-task.ts'));
  const fail=node=>{throw {reason:'IMAGE_ILLUSTRATION_RESIDUAL_UNKNOWN',node};};
  const need=(condition,node)=>{if(!condition)fail(node);};
  const one=(values,node)=>{need(values.length===1,node);return values[0];};
  const variable=(scope,name)=>one(nodes(scope,node=>ts.isVariableDeclaration(node)&&node.name.text===name),scope);
  need(old,source);
  const envelope=variable(flow.route,'envelope'),execution=variable(flow.route,'execution'),materialize=variable(flow.route,'materialize').initializer;
  const roots=new Map([[symbol(envelope.name),'envelope'],[symbol(execution.name),'marker'],
    [symbol(materialize.parameters[0].name),'state'],[symbol(variable(flow.route,'saved').name),'state'],[symbol(variable(flow.route,'completed').name),'state']]);
  const factory=ts.factory,facts=new Map();
  const unwrap=raw=>{let node=raw;while(node&&(ts.isParenthesizedExpression(node)||ts.isAsExpression(node)||ts.isNonNullExpression(node)))node=node.expression;return node;};
  const property=(node,name)=>ts.isPropertyAccessExpression(unwrap(node))&&unwrap(node).name.text===name;
  const literal=value=>value===undefined?factory.createIdentifier('undefined'):typeof value==='string'?factory.createStringLiteral(value):value?factory.createTrue():factory.createFalse();
  const known=raw=>{const node=unwrap(raw);if(node.kind===ts.SyntaxKind.TrueKeyword)return [true,true];if(node.kind===ts.SyntaxKind.FalseKeyword)return [true,false];
    if(ts.isIdentifier(node)&&node.text==='undefined'&&!(symbol(node)?.declarations??[]).length)return [true,undefined];
    if(ts.isStringLiteral(node))return [true,node.text];return [false];};
  const root=node=>ts.isIdentifier(unwrap(node))?roots.get(symbol(unwrap(node))):undefined;
  const truth=node=>{const parent=node.parent;if(!parent)return false;
    if(ts.isIfStatement(parent)&&parent.expression===node||ts.isConditionalExpression(parent)&&parent.condition===node
      ||ts.isPrefixUnaryExpression(parent)&&parent.operator===ts.SyntaxKind.ExclamationToken)return true;
    return ts.isParenthesizedExpression(parent)||ts.isBinaryExpression(parent)&&[ts.SyntaxKind.AmpersandAmpersandToken,ts.SyntaxKind.BarBarToken].includes(parent.operatorToken.kind)?truth(parent):false;};
  const foldOr=raw=>{const node=unwrap(raw);return ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.BarBarToken
    ?[...foldOr(node.left),...foldOr(node.right)]:[raw];};
  const transformed=ts.transform(source,[transformation=>{
    const visit=node=>{
      if(ts.isTypeNode(node)||ts.isInterfaceDeclaration(node)||ts.isTypeAliasDeclaration(node))return node;
      if(node.pos<flow.route.pos||node.end>flow.route.end){return ts.visitEachChild(node,visit,transformation);}
      if(ts.isIdentifier(node)&&facts.has(symbol(node))&&!(ts.isVariableDeclaration(node.parent)&&node.parent.name===node)
        &&!(ts.isPropertyAccessExpression(node.parent)&&node.parent.name===node))return literal(facts.get(symbol(node)));
      if(ts.isPropertyAccessExpression(node)&&((['envelope','marker'].includes(root(node.expression))&&node.name.text==='imageResultPolicy')
        ||root(node.expression)==='state'&&node.name.text==='validatedFinal'))return literal(undefined);
      if(ts.isPropertyAccessExpression(node)&&known(node.expression)[0]&&known(node.expression)[1]===undefined&&node.questionDotToken)return literal(undefined);
      if(ts.isPropertyAssignment(node)&&node.parent===flow.create.arguments[0]){
        if(node.name.text==='authorizeFinal'){
          need(ts.isArrowFunction(node.initializer),node);return undefined;
        }
        if(node.name.text==='executionAttempt')return factory.updatePropertyAssignment(node,node.name,factory.createPropertyAccessExpression(envelope.name,'executionAttempt'));
      }
      if(ts.isBinaryExpression(node)&&[ts.SyntaxKind.AmpersandAmpersandToken,ts.SyntaxKind.BarBarToken,ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)){
        const left=ts.visitNode(node.left,visit),a=known(left);
        if(a[0]){
          if(node.operatorToken.kind===ts.SyntaxKind.QuestionQuestionToken)return a[1]===undefined?ts.visitNode(node.right,visit):left;
          return (node.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken?Boolean(a[1]):!a[1])?ts.visitNode(node.right,visit):left;
        }
        const right=ts.visitNode(node.right,visit),b=known(right);
        if(b[0]&&truth(node)&&node.operatorToken.kind===ts.SyntaxKind.BarBarToken&&!b[1])return left;
        if(b[0]&&truth(node)&&node.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken&&!b[1]&&ts.isIdentifier(unwrap(node.left)))return literal(false);
        return factory.updateBinaryExpression(node,left,node.operatorToken,right);
      }
      if(ts.isConditionalExpression(node)){
        const condition=ts.visitNode(node.condition,visit),value=known(condition);
        if(value[0])return ts.visitNode(value[1]?node.whenTrue:node.whenFalse,visit);
        return factory.updateConditionalExpression(node,condition,node.questionToken,ts.visitNode(node.whenTrue,visit),node.colonToken,ts.visitNode(node.whenFalse,visit));
      }
      if(ts.isIfStatement(node)){
        const condition=ts.visitNode(node.expression,visit),value=known(condition);
        if(value[0])return value[1]?ts.visitNode(node.thenStatement,visit):node.elseStatement&&ts.visitNode(node.elseStatement,visit);
        let result=condition;
        if(nodes(node.expression,child=>ts.isIdentifier(child)&&facts.has(symbol(child))).length){
          const clauses=foldOr(condition);result=clauses.reduce((left,right)=>factory.createBinaryExpression(left,ts.SyntaxKind.BarBarToken,right));
        }
        return factory.updateIfStatement(node,result,ts.visitNode(node.thenStatement,visit),node.elseStatement&&ts.visitNode(node.elseStatement,visit));
      }
      let result=ts.visitEachChild(node,visit,transformation);
      if(ts.isParenthesizedExpression(result)&&known(result.expression)[0])return result.expression;
      if(ts.isParenthesizedExpression(result)&&ts.isBinaryExpression(node.expression)
        &&node.expression.operatorToken.kind===ts.SyntaxKind.QuestionQuestionToken&&property(node.expression.left,'text')
        &&property(unwrap(node.expression.left).expression,'validatedFinal')
        &&root(unwrap(unwrap(node.expression.left).expression).expression)==='state')return result.expression;
      if(ts.isPropertyAccessExpression(result)&&result.questionDotToken&&known(result.expression)[0]&&known(result.expression)[1]===undefined)return literal(undefined);
      if(ts.isPrefixUnaryExpression(result)&&result.operator===ts.SyntaxKind.ExclamationToken){const value=known(result.operand);if(value[0])return literal(!value[1]);}
      if(ts.isBinaryExpression(result)&&[ts.SyntaxKind.EqualsEqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(result.operatorToken.kind)){
        const a=known(result.left),b=known(result.right);if(a[0]&&b[0])return literal(result.operatorToken.kind===ts.SyntaxKind.EqualsEqualsEqualsToken?a[1]===b[1]:a[1]!==b[1]);
      }
      if(ts.isVariableDeclaration(result)&&ts.isIdentifier(result.name)&&result.initializer){
        const value=known(result.initializer);if(value[0]&&typeof value[1]!=='string'){facts.set(symbol(node.name),value[1]);return undefined;}
      }
      if(ts.isVariableStatement(result)&&!result.declarationList.declarations.length)return undefined;
      if(ts.isObjectLiteralExpression(result))return factory.updateObjectLiteralExpression(result,result.properties.filter(item=>
        !(ts.isSpreadAssignment(item)&&ts.isObjectLiteralExpression(unwrap(item.expression))&&!unwrap(item.expression).properties.length)));
      return result;
    };
    return node=>ts.visitNode(node,visit);
  }]);
  let text;try{text=ts.createPrinter({removeComments:true}).printFile(transformed.transformed[0]);}finally{transformed.dispose();}
  return {status:'conditional',source,text,ast:transformed.transformed[0],rollback:old,
    outstanding:['strict source/marker and old private-state partition','read-only attempt capture equivalence','whole runtime/import comparison and tagged retention']};
}

function finiteImageHostProjection(ts,context,rollbackContext) {
  const partition=finiteImageProtocolPartition(ts,context),{nodes,symbol}=partition.producer;
  const source=context.program.getSourceFile(resolve(context.root,'apps/agent-worker/src/native-agent/host-task.ts'));
  const old=rollbackContext.program.getSourceFile(resolve(rollbackContext.root,'apps/agent-worker/src/native-agent/host-task.ts'));
  const fail=node=>{throw {reason:'IMAGE_HOST_RESIDUAL_UNKNOWN',node};};
  const need=(condition,node)=>{if(!condition)fail(node);};
  const one=(values,node)=>{need(values.length===1,node);return values[0];};
  need(source&&old,source);
  const fn=one(source.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='runHostedNativeTask'),source);
  const unwrap=raw=>{let node=raw;while(node&&(ts.isParenthesizedExpression(node)||ts.isAsExpression(node)||ts.isNonNullExpression(node)))node=node.expression;return node;};
  const path=(raw,base,parts)=>{
    const node=unwrap(raw);if(!parts.length)return ts.isIdentifier(node)&&symbol(node)===base;
    return ts.isPropertyAccessExpression(node)&&node.name.text===parts.at(-1)&&path(node.expression,base,parts.slice(0,-1));
  };
  const input=symbol(fn.parameters[0].name);
  const state=one(nodes(fn,node=>ts.isVariableDeclaration(node)&&node.name.text==='state'&&ts.isAwaitExpression(node.initializer)
    &&ts.isCallExpression(node.initializer.expression)&&path(node.initializer.expression.expression,input,['store','read'])
    &&node.parent.parent.parent?.statements?.some(statement=>ts.isIfStatement(statement)
      &&nodes(statement.expression,child=>ts.isPropertyAccessExpression(child)&&child.name.text==='imageResultPolicy').length)),fn);
  const stateSymbol=symbol(state.name);
  const guards=nodes(fn,node=>ts.isIfStatement(node)&&ts.isBinaryExpression(node.expression)
    &&node.expression.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken
    &&ts.isBinaryExpression(node.expression.right)&&path(node.expression.right.left,stateSymbol,['binding','imageReview','imageResultPolicy'])
    &&node.expression.right.operatorToken.kind===ts.SyntaxKind.EqualsEqualsEqualsToken&&ts.isStringLiteral(node.expression.right.right)
    &&node.expression.right.right.text==='image-review-tool-final-v1');
  const guard=one(guards,fn);
  const left=guard.expression.left;
  need(ts.isBinaryExpression(left)&&left.operatorToken.kind===ts.SyntaxKind.EqualsEqualsEqualsToken
    &&path(left.left,stateSymbol,['binding','sourceKind'])&&ts.isStringLiteral(left.right)&&left.right.text==='illustration-image'
    &&state.end<=guard.pos&&!guard.elseStatement,guard);
  const message=one(nodes(fn,node=>ts.isVariableDeclaration(node)&&node.name.text==='message'),fn);
  const receiver=unwrap(message.initializer);
  need(ts.isPropertyAccessExpression(receiver)&&receiver.name.text==='message'&&ts.isElementAccessExpression(unwrap(receiver.expression))
    &&ts.isNumericLiteral(unwrap(receiver.expression).argumentExpression)&&unwrap(receiver.expression).argumentExpression.text==='0',message);
  const response=unwrap(unwrap(receiver.expression).expression);
  need(ts.isPropertyAccessExpression(response)&&response.name.text==='choices'&&ts.isIdentifier(response.expression),message);
  const responseDeclaration=symbol(response.expression)?.valueDeclaration;
  need(responseDeclaration&&ts.isVariableDeclaration(responseDeclaration)&&ts.isAwaitExpression(responseDeclaration.initializer)
    &&ts.isCallExpression(responseDeclaration.initializer.expression)&&path(responseDeclaration.initializer.expression.expression,input,['session','complete']),message);
  const references=nodes(fn,node=>ts.isIdentifier(node)&&symbol(node)===symbol(message.name)&&node!==message.name);
  need(references.length===2,message);
  const selection=one(nodes(fn,node=>ts.isConditionalExpression(node)&&ts.isBinaryExpression(node.condition)
    &&node.condition.operatorToken.kind===ts.SyntaxKind.InKeyword&&ts.isStringLiteral(node.condition.left)
    &&node.condition.left.text==='tool_calls'&&ts.isIdentifier(node.condition.right)&&symbol(node.condition.right)===symbol(message.name)),fn);
  need(ts.isBinaryExpression(selection.whenTrue)&&selection.whenTrue.operatorToken.kind===ts.SyntaxKind.QuestionQuestionToken
    &&path(selection.whenTrue.left,symbol(message.name),['tool_calls'])&&ts.isArrayLiteralExpression(selection.whenTrue.right)
    &&selection.whenTrue.right.elements.length===0&&ts.isArrayLiteralExpression(selection.whenFalse)&&selection.whenFalse.elements.length===0,selection);
  const bridge=context.program.getSourceFile(resolve(context.root,'packages/ai-gateway/src/native-agent-bridge.ts'));
  const sdk=one(bridge.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='nativeAgentSdkResponse'),bridge);
  const sdkReturn=one(sdk.body.statements.filter(ts.isReturnStatement),sdk);
  const property=(object,name)=>one(object.properties.filter(node=>ts.isPropertyAssignment(node)&&node.name.text===name),object).initializer;
  need(ts.isObjectLiteralExpression(sdkReturn.expression),sdkReturn);
  const choices=property(sdkReturn.expression,'choices');
  need(ts.isArrayLiteralExpression(choices)&&choices.elements.length===1&&ts.isObjectLiteralExpression(choices.elements[0]),choices);
  const sdkMessage=property(choices.elements[0],'message');
  need(ts.isObjectLiteralExpression(sdkMessage),sdkMessage);
  for(const item of sdkMessage.properties){
    if(ts.isPropertyAssignment(item)){need(['role','content'].includes(item.name.text),item);continue;}
    need(ts.isSpreadAssignment(item)&&ts.isParenthesizedExpression(item.expression)&&ts.isConditionalExpression(item.expression.expression),item);
    const choice=item.expression.expression;
    need(ts.isObjectLiteralExpression(choice.whenTrue)&&choice.whenTrue.properties.length===1
      &&ts.isPropertyAssignment(choice.whenTrue.properties[0])&&['tool_calls','reasoning_details'].includes(choice.whenTrue.properties[0].name.text)
      &&ts.isObjectLiteralExpression(choice.whenFalse)&&choice.whenFalse.properties.length===0,item);
  }
  const factory=ts.factory;
  const transformed=ts.transform(source,[transformation=>{
    const visit=node=>{
      if(node===guard||node===message)return undefined;
      if(node===selection)return factory.createBinaryExpression(factory.createPropertyAccessExpression(message.initializer,'tool_calls'),
        ts.SyntaxKind.QuestionQuestionToken,factory.createArrayLiteralExpression());
      let result=ts.visitEachChild(node,visit,transformation);
      if(ts.isVariableStatement(result)&&!result.declarationList.declarations.length)return undefined;
      return result;
    };return node=>ts.visitNode(node,visit);
  }]);
  let text;try{text=ts.createPrinter({removeComments:true}).printFile(transformed.transformed[0]);}finally{transformed.dispose();}
  return {status:'conditional',source,text,ast:transformed.transformed[0],rollback:old,
    outstanding:['Session only returns original owned SDK response on ABSENT','private state/Host input binding','whole context/import comparison and tagged retention']};
}

function finiteImageSdkOptionTerms(ts,context) {
  const partition=finiteImageProtocolPartition(ts,context),{nodes,symbol}=partition.producer;
  const fail=node=>{throw {reason:'IMAGE_SDK_OPTION_DOMAIN_UNKNOWN',node};};
  const need=(condition,node)=>{if(!condition)fail(node);};
  const one=(values,node)=>{need(values.length===1,node);return values[0];};
  const bridge=context.program.getSourceFile(resolve(context.root,'packages/ai-gateway/src/native-agent-bridge.ts'));
  const sdk=one(bridge.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='nativeAgentSdkRequest'),bridge);
  const options=one(nodes(sdk,node=>ts.isVariableDeclaration(node)&&node.name.text==='options'),sdk),optionSymbol=symbol(options.name);
  need(Boolean(options.parent.flags&ts.NodeFlags.Const)&&ts.isObjectLiteralExpression(options.initializer)&&options.initializer.properties.length===1,options);
  const spread=options.initializer.properties[0];
  need(ts.isSpreadAssignment(spread)&&ts.isParenthesizedExpression(spread.expression)&&ts.isConditionalExpression(spread.expression.expression),spread);
  const choice=spread.expression.expression;
  need(ts.isObjectLiteralExpression(choice.whenTrue)&&choice.whenTrue.properties.length===1
    &&ts.isShorthandPropertyAssignment(choice.whenTrue.properties[0])&&choice.whenTrue.properties[0].name.text==='tools'
    &&ts.isObjectLiteralExpression(choice.whenFalse)&&choice.whenFalse.properties.length===0,choice);
  const assignments=[];
  for(const node of nodes(sdk,ts.isIdentifier))if(symbol(node)===optionSymbol&&node!==options.name){
    const parent=node.parent;
    if(ts.isShorthandPropertyAssignment(parent)){
      need(context.checker.getShorthandAssignmentValueSymbol(parent)===optionSymbol&&ts.isReturnStatement(parent.parent.parent),node);continue;
    }
    need(ts.isPropertyAccessExpression(parent)&&parent.expression===node&&['maxTokens','temperature','topP'].includes(parent.name.text)
      &&ts.isBinaryExpression(parent.parent)&&parent.parent.left===parent&&parent.parent.operatorToken.kind===ts.SyntaxKind.EqualsToken,parent);
    assignments.push(parent.name.text);
  }
  need(assignments.length===3&&new Set(assignments).size===3,sdk);
  const sites=[],create=partition.session,target=symbol(create.name);
  for(const parsed of context.program.getSourceFiles()){
    if(parsed.isDeclarationFile||!/^(?:apps|packages)\//u.test(relative(context.root,parsed.fileName).replaceAll('\\','/')))continue;
    for(const node of nodes(parsed,ts.isIdentifier))if(symbol(node)===target){
      const parent=node.parent;if(node===create.name||ts.isImportSpecifier(parent)||ts.isExportSpecifier(parent))continue;
      let type=false;for(let cursor=parent;cursor;cursor=cursor.parent)if(ts.isTypeNode(cursor)){type=true;break;}if(type)continue;
      need(ts.isCallExpression(parent)&&parent.expression===node&&parent.arguments.length===1&&ts.isObjectLiteralExpression(parent.arguments[0]),node);
      const object=parent.arguments[0];need(!object.properties.some(ts.isSpreadAssignment),object);
      const bindingProperty=one(object.properties.filter(item=>(ts.isShorthandPropertyAssignment(item)||ts.isPropertyAssignment(item))&&item.name.text==='binding'),object);
      const bound=ts.isShorthandPropertyAssignment(bindingProperty)?context.checker.getShorthandAssignmentValueSymbol(bindingProperty):symbol(bindingProperty.initializer);
      const binding=bound?.valueDeclaration;
      need(binding&&ts.isVariableDeclaration(binding)&&ts.isObjectLiteralExpression(binding.initializer),bindingProperty);
      const generation=one(binding.initializer.properties.filter(item=>ts.isPropertyAssignment(item)&&item.name.text==='generation'),binding).initializer;
      need(ts.isObjectLiteralExpression(generation)&&generation.properties.every(item=>ts.isPropertyAssignment(item)&&ts.isIdentifier(item.name)
        &&['thinking','temperature','topP'].includes(item.name.text)),generation);
      // A later spread/override of generation on the binding is not consumed.
      for(const item of binding.initializer.properties)if(ts.isSpreadAssignment(item)){
        let expression=item.expression;while(ts.isParenthesizedExpression(expression))expression=expression.expression;
        need(ts.isConditionalExpression(expression)&&ts.isObjectLiteralExpression(expression.whenTrue)&&ts.isObjectLiteralExpression(expression.whenFalse)
          &&[...expression.whenTrue.properties,...expression.whenFalse.properties].every(field=>ts.isPropertyAssignment(field)&&field.name.text==='contextWindowTokens'),item);
      }
      sites.push({call:parent,binding,generation});
    }
  }
  need(sites.length>0,create);
  const bounded=one(nodes(create,node=>ts.isVariableDeclaration(node)&&node.name.text==='boundedOptions'),create);
  need(ts.isObjectLiteralExpression(bounded.initializer),bounded);
  const fields=bounded.initializer.properties;
  need(fields.length===5&&ts.isSpreadAssignment(fields[0])&&ts.isSpreadAssignment(fields[1])
    &&ts.isIdentifier(fields[0].expression)&&fields[0].expression.text==='options'
    &&ts.isPropertyAccessExpression(fields[1].expression)&&fields[1].expression.name.text==='generation'
    &&fields.slice(2).every(field=>ts.isPropertyAssignment(field)&&['maxTokens','maxRequestBytes','timeoutMs'].includes(field.name.text)),bounded);
  return {status:'conditional',sdk,options,assignments,sites,bounded,
    keys:['tools','maxTokens','temperature','topP','thinking','maxRequestBytes','timeoutMs'],
    outstanding:['actual allowed-tool constructor/history domain','binding mutation/escape closure','shared Gateway/Provider runtime context']};
}

function finiteImageRecoveryProjections(ts,context,rollbackContext) {
  const partition=finiteImageProtocolPartition(ts,context),{nodes,symbol}=partition.producer;
  const fail=node=>{throw {reason:'IMAGE_RECOVERY_RESIDUAL_UNKNOWN',node};};
  const need=(condition,node)=>{if(!condition)fail(node);};
  const one=(values,node)=>{need(values.length===1,node);return values[0];};
  const unwrap=raw=>{let node=raw;while(node&&(ts.isParenthesizedExpression(node)||ts.isAsExpression(node)||ts.isNonNullExpression(node)))node=node.expression;return node;};
  const factory=ts.factory;
  const agent=context.program.getSourceFile(resolve(context.root,'packages/domain/src/agent/agent.ts'));
  const recover=one(agent.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='canRecoverAgentNativeImageFinal'),agent);
  const execution=one(nodes(recover,node=>ts.isVariableDeclaration(node)&&node.name.text==='execution'),recover);
  const cp=one(nodes(recover,node=>ts.isVariableDeclaration(node)&&node.name.text==='cp'),recover);
  need(ts.isCallExpression(execution.initializer)&&ts.isIdentifier(execution.initializer.expression)
    &&execution.initializer.expression.text==='readNativeAgentExecution'&&execution.initializer.arguments.length===1
    &&ts.isPropertyAccessExpression(execution.initializer.arguments[0])&&execution.initializer.arguments[0].name.text==='result'
    &&symbol(execution.initializer.arguments[0].expression)===symbol(recover.parameters[0].name),execution);
  need(ts.isPropertyAccessExpression(cp.initializer)&&cp.initializer.questionDotToken&&cp.initializer.name.text==='checkpoint'
    &&symbol(cp.initializer.expression)===symbol(execution.name),cp);
  const choice=one(nodes(recover,node=>ts.isConditionalExpression(node)&&ts.isBinaryExpression(node.condition)
    &&ts.isPropertyAccessExpression(node.condition.left)&&node.condition.left.name.text==='imageResultPolicy'
    &&symbol(node.condition.left.expression)===symbol(execution.name)),recover);
  need(choice.condition.operatorToken.kind===ts.SyntaxKind.EqualsEqualsEqualsToken&&ts.isStringLiteral(choice.condition.right)
    &&choice.condition.right.text==='image-review-tool-final-v1',choice);
  need(nodes(recover,node=>ts.isIdentifier(node)&&symbol(node)===symbol(execution.name)).length===3,execution);
  const flatten=raw=>{const node=unwrap(raw);return ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken
    ?[...flatten(node.left),...flatten(node.right)]:[raw];};
  const transformAgent=transformation=>{
    const visit=node=>{
      if(node===execution)return undefined;
      if(node===cp)return factory.updateVariableDeclaration(node,node.name,node.exclamationToken,node.type,
        factory.createPropertyAccessChain(execution.initializer,factory.createToken(ts.SyntaxKind.QuestionDotToken),'checkpoint'));
      if(node===choice)return choice.whenFalse;
      if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken&&ts.isParenthesizedExpression(node.right)
        &&node.right.expression===choice){
        const left=ts.visitNode(node.left,visit);return [...flatten(left),...flatten(choice.whenFalse)]
          .reduce((a,b)=>factory.createBinaryExpression(a,ts.SyntaxKind.AmpersandAmpersandToken,b));
      }
      return ts.visitEachChild(node,visit,transformation);
    };return node=>ts.visitNode(node,visit);
  };
  const run=context.program.getSourceFile(resolve(context.root,'packages/domain/src/agent/research-run.ts'));
  const inspector=one(run.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='inspectGenerationRecovery'),run);
  const raw=one(nodes(inspector,node=>ts.isVariableDeclaration(node)&&node.name.text==='rawMarker'),inspector);
  const block=raw.parent.parent.parent;
  need(ts.isBlock(block)&&ts.isIfStatement(block.parent)&&block.parent.thenStatement===block&&!block.parent.elseStatement
    &&ts.isIdentifier(block.parent.expression)&&block.parent.expression.text==='native',raw);
  const json=one(run.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='jsonRecord'),run);
  need(json.parameters.length===1&&json.body.statements.length===1&&ts.isReturnStatement(json.body.statements[0])
    &&ts.isConditionalExpression(json.body.statements[0].expression),json);
  const jsonBody=json.body.statements[0].expression,jsonParameter=symbol(json.parameters[0].name);
  const conjunctions=raw=>{const node=unwrap(raw);return ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken
    ?[...conjunctions(node.left),...conjunctions(node.right)]:[node];};
  const jsonTerms=conjunctions(jsonBody.condition);
  need(jsonTerms.length===3&&symbol(jsonTerms[0])===jsonParameter&&ts.isBinaryExpression(jsonTerms[1])
    &&jsonTerms[1].operatorToken.kind===ts.SyntaxKind.EqualsEqualsEqualsToken&&ts.isTypeOfExpression(jsonTerms[1].left)
    &&symbol(jsonTerms[1].left.expression)===jsonParameter&&ts.isStringLiteral(jsonTerms[1].right)&&jsonTerms[1].right.text==='object'
    &&ts.isPrefixUnaryExpression(jsonTerms[2])&&jsonTerms[2].operator===ts.SyntaxKind.ExclamationToken
    &&ts.isCallExpression(jsonTerms[2].operand)&&ts.isPropertyAccessExpression(jsonTerms[2].operand.expression)
    &&ts.isIdentifier(jsonTerms[2].operand.expression.expression)&&jsonTerms[2].operand.expression.expression.text==='Array'
    &&!(symbol(jsonTerms[2].operand.expression.expression)?.declarations??[]).some(node=>!node.getSourceFile().isDeclarationFile)
    &&jsonTerms[2].operand.expression.name.text==='isArray'&&jsonTerms[2].operand.arguments.length===1
    &&symbol(jsonTerms[2].operand.arguments[0])===jsonParameter&&symbol(unwrap(jsonBody.whenTrue))===jsonParameter
    &&ts.isObjectLiteralExpression(jsonBody.whenFalse)&&!jsonBody.whenFalse.properties.length,json);
  const outer=raw.initializer;
  need(ts.isCallExpression(outer)&&symbol(outer.expression)===symbol(json.name)&&outer.arguments.length===1
    &&ts.isPropertyAccessExpression(outer.arguments[0])&&outer.arguments[0].name.text==='nativeAgentExecution',raw);
  const inner=outer.arguments[0].expression;
  need(ts.isCallExpression(inner)&&symbol(inner.expression)===symbol(json.name)&&inner.arguments.length===1
    &&ts.isPropertyAccessExpression(inner.arguments[0])&&inner.arguments[0].name.text==='result'
    &&ts.isIdentifier(inner.arguments[0].expression)&&inner.arguments[0].expression.text==='task',raw);
  need(block.statements[0]===raw.parent.parent&&raw.parent.declarations.length===1&&ts.isIfStatement(block.statements[1]),block);
  const guard=block.statements[1],condition=guard.expression;
  need(!guard.elseStatement&&ts.isReturnStatement(guard.thenStatement)&&guard.thenStatement.expression.kind===ts.SyntaxKind.NullKeyword
    &&ts.isBinaryExpression(condition)&&condition.operatorToken.kind===ts.SyntaxKind.BarBarToken&&ts.isPrefixUnaryExpression(condition.left)
    &&condition.left.operator===ts.SyntaxKind.ExclamationToken&&ts.isCallExpression(condition.left.operand),guard);
  const own=condition.left.operand;
  need(ts.isPropertyAccessExpression(own.expression)&&ts.isIdentifier(own.expression.expression)&&own.expression.expression.text==='Object'
    &&own.expression.name.text==='hasOwn'&&own.arguments.length===2&&symbol(own.arguments[0])===symbol(raw.name)
    &&ts.isStringLiteral(own.arguments[1])&&own.arguments[1].text==='imageResultPolicy'
    &&ts.isBinaryExpression(condition.right)&&condition.right.operatorToken.kind===ts.SyntaxKind.ExclamationEqualsEqualsToken
    &&ts.isPropertyAccessExpression(condition.right.left)&&symbol(condition.right.left.expression)===symbol(raw.name)
    &&condition.right.left.name.text==='imageResultPolicy'&&ts.isStringLiteral(condition.right.right)
    &&condition.right.right.text==='image-review-tool-final-v1',guard);
  const transformRun=transformation=>{
    const visit=node=>node===block.parent?factory.updateIfStatement(node,node.expression,factory.createReturnStatement(factory.createNull()),undefined)
      :ts.visitEachChild(node,visit,transformation);return node=>ts.visitNode(node,visit);
  };
  const projected=new Map();
  for(const [source,transform] of [[agent,transformAgent],[run,transformRun]]){
    const result=ts.transform(source,[transform]);let text;
    try{text=ts.createPrinter({removeComments:true}).printFile(result.transformed[0]);}finally{result.dispose();}
    const key=relative(context.root,source.fileName).replaceAll('\\','/');
    const old=rollbackContext.program.getSourceFile(resolve(rollbackContext.root,key));need(old,source);
    projected.set(key,{source,text,ast:result.transformed[0],rollback:old});
  }
  return {status:'conditional',partition,projected,
    outstanding:['actual old JSON decoder/source partition','full runtime/import context comparison','tagged rearm/paid/final recovery retention']};
}

function finiteImageAllowedToolTerms(ts,context) {
  const options=finiteImageSdkOptionTerms(ts,context),{nodes,symbol}=options.sites.length?finiteImageProducerTerms(ts,context):{};
  const fail=node=>{throw {reason:'IMAGE_ALLOWED_TOOL_DOMAIN_UNKNOWN',node};};
  const need=(condition,node)=>{if(!condition)fail(node);};
  const unwrap=raw=>{let node=raw;while(node&&(ts.isParenthesizedExpression(node)||ts.isAsExpression(node)||ts.isNonNullExpression(node)))node=node.expression;return node;};
  const domain=(values=[],paper=false,history=false)=>({values:new Set(values),paper,history});
  const union=values=>{const result=domain();for(const value of values){need(value,undefined);for(const name of value.values)result.values.add(name);result.paper||=value.paper;result.history||=value.history;}return result;};
  const active=new Set(),history=[];
  const declaration=node=>symbol(node)?.valueDeclaration;
  const ownReturns=fn=>nodes(fn,ts.isReturnStatement).filter(node=>{
    let parent=node.parent;while(parent&&!ts.isFunctionLike(parent))parent=parent.parent;return parent===fn;
  });
  const parameterValue=(node,env)=>{const value=env.get(symbol(node));return value&&value.node?value:undefined;};
  const savedState=(raw,env)=>{
    const node=unwrap(raw);if(!node)return false;
    if(ts.isIdentifier(node)){
      const supplied=parameterValue(node,env);if(supplied)return savedState(supplied.node,supplied.env);
      const value=declaration(node);return value&&ts.isVariableDeclaration(value)&&value.initializer?savedState(value.initializer,env):false;
    }
    if(ts.isAwaitExpression(node)&&ts.isCallExpression(node.expression)&&ts.isPropertyAccessExpression(node.expression.expression)
      &&node.expression.expression.name.text==='read'&&ts.isIdentifier(node.expression.expression.expression)){
      const store=declaration(node.expression.expression.expression);
      return store&&ts.isVariableDeclaration(store)&&ts.isCallExpression(store.initializer)&&ts.isIdentifier(store.initializer.expression)
        &&['createNativeTaskStore','createJournalNativeTaskStore'].includes(store.initializer.expression.text);
    }
    return false;
  };
  const field=(raw,key,env)=>{
    const node=unwrap(raw);need(node,raw);
    if(ts.isIdentifier(node)){
      const supplied=parameterValue(node,env);if(supplied)return field(supplied.node,key,supplied.env);
      const value=declaration(node);need(value&&ts.isVariableDeclaration(value)&&value.initializer,node);
      return field(value.initializer,key,env);
    }
    if(ts.isObjectLiteralExpression(node)){
      need(node.properties.every(item=>(ts.isPropertyAssignment(item)||ts.isShorthandPropertyAssignment(item)||ts.isSpreadAssignment(item))
        &&!(item.name&&ts.isComputedPropertyName(item.name))),node);
      for(const item of [...node.properties].reverse()){
        if(ts.isSpreadAssignment(item))return key==='name'?names(item.expression,env):field(item.expression,key,env);
        if((ts.isPropertyAssignment(item)||ts.isShorthandPropertyAssignment(item))&&item.name.text===key)
          return names(ts.isShorthandPropertyAssignment(item)?context.checker.getShorthandAssignmentValueSymbol(item)?.valueDeclaration?.initializer:item.initializer,env);
      }
      fail(node);
    }
    if(ts.isConditionalExpression(node))return union([field(node.whenTrue,key,env),field(node.whenFalse,key,env)]);
    if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)){
      const fn=declaration(node.expression);need(fn&&ts.isFunctionDeclaration(fn)&&fn.body,node);
      need(!nodes(fn,child=>ts.isBinaryExpression(child)&&child.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&child.operatorToken.kind<=ts.SyntaxKind.LastAssignment
        ||ts.isDeleteExpression(child)||ts.isPrefixUnaryExpression(child)&&[ts.SyntaxKind.PlusPlusToken,ts.SyntaxKind.MinusMinusToken].includes(child.operator)
        ||ts.isPostfixUnaryExpression(child)).length,fn);
      const next=new Map(env);fn.parameters.forEach((parameter,index)=>{need(ts.isIdentifier(parameter.name)&&node.arguments[index],parameter);
        next.set(symbol(parameter.name),{node:node.arguments[index],env});});
      return union(ownReturns(fn).map(statement=>field(statement.expression,key,next)));
    }
    fail(node);
  };
  const names=(raw,env=new Map())=>{
    const node=unwrap(raw);need(node,raw);
    if(ts.isStringLiteral(node))return domain([node.text]);
    if(ts.isIdentifier(node)){
      const supplied=env.get(symbol(node));if(supplied?.values)return supplied;if(supplied?.node)return names(supplied.node,supplied.env);
      const value=declaration(node);need(value&&!active.has(value),node);active.add(value);
      try{
        if(ts.isVariableDeclaration(value)&&value.initializer)return names(value.initializer,env);
        if(ts.isBindingElement(value)){
          const parent=value.parent.parent;need(ts.isObjectBindingPattern(value.parent)&&ts.isVariableDeclaration(parent)&&parent.initializer,value);
          return field(parent.initializer,value.propertyName?.text??value.name.text,env);
        }
        fail(node);
      }finally{active.delete(value);}
    }
    if(ts.isArrayLiteralExpression(node))return union(node.elements.map(item=>names(ts.isSpreadElement(item)?item.expression:item,env)));
    if(ts.isObjectLiteralExpression(node))return field(node,'name',env);
    if(ts.isConditionalExpression(node))return union([names(node.whenTrue,env),names(node.whenFalse,env)]);
    if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.QuestionQuestionToken)return union([names(node.left,env),names(node.right,env)]);
    if(ts.isPropertyAccessExpression(node)){
      if(node.name.text==='name'||node.name.text==='function')return names(node.expression,env);
      if(node.name.text==='allowedTools'&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='binding'&&savedState(node.expression.expression,env)){
        history.push(node);return domain([],false,true);
      }
      return field(node.expression,node.name.text,env);
    }
    if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='structuredClone'&&node.arguments.length===1)
      return names(node.arguments[0],env);
    if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&['map','filter','find'].includes(node.expression.name.text)){
      const callback=node.arguments[0];need(node.arguments.length===1&&callback&&ts.isArrowFunction(callback)&&callback.parameters.length===1&&ts.isIdentifier(callback.parameters[0].name),node);
      need(!nodes(callback,child=>ts.isBinaryExpression(child)&&child.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&child.operatorToken.kind<=ts.SyntaxKind.LastAssignment
        ||ts.isDeleteExpression(child)||ts.isPrefixUnaryExpression(child)&&[ts.SyntaxKind.PlusPlusToken,ts.SyntaxKind.MinusMinusToken].includes(child.operator)
        ||ts.isPostfixUnaryExpression(child)).length,callback);
      const parameter=symbol(callback.parameters[0].name),body=unwrap(callback.body);
      if(node.expression.name.text==='filter'&&ts.isCallExpression(body)&&ts.isPropertyAccessExpression(body.expression)&&body.expression.name.text==='startsWith'
        &&ts.isPropertyAccessExpression(body.expression.expression)&&body.expression.expression.name.text==='name'
        &&ts.isPropertyAccessExpression(body.expression.expression.expression)&&body.expression.expression.expression.name.text==='function'
        &&symbol(body.expression.expression.expression.expression)===parameter&&body.arguments.length===1
        &&ts.isStringLiteral(body.arguments[0])&&body.arguments[0].text==='paper_')return domain([],true);
      const input=names(node.expression.expression,env);
      if(node.expression.name.text!=='map')return input;
      const next=new Map(env);next.set(parameter,input);
      return ts.isBlock(body)?union(ownReturns(callback).map(statement=>names(statement.expression,next))):names(body,next);
    }
    fail(node);
  };
  const results=options.sites.map(site=>{
    const property=site.binding.initializer.properties.find(item=>(ts.isPropertyAssignment(item)||ts.isShorthandPropertyAssignment(item))&&item.name.text==='allowedTools');
    need(property,site.binding);
    const value=ts.isShorthandPropertyAssignment(property)?context.checker.getShorthandAssignmentValueSymbol(property)?.valueDeclaration:undefined;
    const result=names(value?value.name:property.initializer);
    need(!result.values.has('image_review_result'),property);
    return {site,result};
  });
  return {status:'conditional',options,results,history,
    outstanding:['saved names fixed point through owned original private constructors','no mutation/escape in tool definitions or binding','Gateway/Provider/import and global residual composition']};
}

function finiteImageLegacyFamilyClosure(ts,context) {
  const partition=finiteImageProtocolPartition(ts,context),tools=finiteImageAllowedToolTerms(ts,context);
  const {nodes,symbol}=partition.producer;
  const fail=node=>{throw {reason:'IMAGE_LEGACY_FAMILY_NOT_CLOSED',node};};
  const need=(condition,node)=>{if(!condition)fail(node);};
  const one=(values,node)=>{need(values.length===1,node);return values[0];};
  const unwrap=raw=>{let node=raw;while(node&&(ts.isParenthesizedExpression(node)||ts.isAsExpression(node)||ts.isNonNullExpression(node)))node=node.expression;return node;};
  need(partition.producer.kind==='absent',partition.producer.call);
  const session=partition.session,binding=one(nodes(session,node=>ts.isVariableDeclaration(node)&&node.name.text==='binding'),session);
  const outside=node=>!(node.pos>=partition.rawGuard.pos&&node.end<=partition.rawGuard.end);
  const started=one(nodes(session,node=>ts.isVariableDeclaration(node)&&node.name.text==='started'&&outside(node)),session);
  const completed=one(nodes(session,node=>ts.isVariableDeclaration(node)&&node.name.text==='completed'&&outside(node)),session);
  const property=(object,name)=>one(object.properties.filter(item=>(ts.isPropertyAssignment(item)||ts.isShorthandPropertyAssignment(item))&&item.name.text===name),object);
  const initial=unwrap(started.initializer);
  need(ts.isBinaryExpression(initial)&&initial.operatorToken.kind===ts.SyntaxKind.QuestionQuestionToken&&ts.isObjectLiteralExpression(initial.right),started);
  const value=initial.right,bound=property(value,'binding'),turns=property(value,'turns').initializer;
  need(ts.isShorthandPropertyAssignment(bound)&&context.checker.getShorthandAssignmentValueSymbol(bound)===symbol(binding.name)
    &&!value.properties.some(item=>ts.isSpreadAssignment(item)||item.name&&ts.isComputedPropertyName(item.name)),value);
  need(ts.isArrayLiteralExpression(turns)&&turns.elements.length===2&&ts.isSpreadElement(turns.elements[0])&&ts.isObjectLiteralExpression(turns.elements[1]),turns);
  const first=turns.elements[1];
  need(first.properties.length===4&&['state','target','request','effectiveOptions'].every(name=>property(first,name))
    &&ts.isStringLiteral(property(first,'state').initializer)&&property(first,'state').initializer.text==='started',first);
  const result=unwrap(completed.initializer);
  need(ts.isObjectLiteralExpression(result)&&result.properties.length===2&&ts.isSpreadAssignment(result.properties[0])
    &&symbol(result.properties[0].expression)===symbol(started.name),completed);
  const finalTurns=property(result,'turns').initializer;
  need(ts.isArrayLiteralExpression(finalTurns)&&finalTurns.elements.length===2&&ts.isSpreadElement(finalTurns.elements[0])
    &&ts.isObjectLiteralExpression(finalTurns.elements[1]),finalTurns);
  const final=finalTurns.elements[1];
  need(ts.isStringLiteral(property(final,'state').initializer)&&property(final,'state').initializer.text==='completed',final);
  for(const item of final.properties){
    if(ts.isSpreadAssignment(item)){
      const choice=unwrap(item.expression);need(ts.isConditionalExpression(choice)&&ts.isObjectLiteralExpression(choice.whenTrue)
        &&choice.whenTrue.properties.length===1&&choice.whenTrue.properties[0].name.text==='rejectedAttempt'
        &&ts.isObjectLiteralExpression(choice.whenFalse)&&choice.whenFalse.properties.length===0,item);
    }else need((ts.isPropertyAssignment(item)||ts.isShorthandPropertyAssignment(item))
      &&['state','target','request','effectiveOptions','response'].includes(item.name.text),item);
  }
  for(const [name,state]of[['compareAndSet',started],['complete',completed]]){
    const calls=nodes(session,node=>ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text===name
      &&node.arguments.length===2&&symbol(node.arguments[1])===symbol(state.name)&&outside(node));
    need(calls.length===1,state);
  }
  // Every saved-name input is a recurrence over these owned private snapshots.
  // Fresh constants and the original paper_ filter are the only name seeds;
  // neither a recurrence nor an exact replay can invent the reserved name.
  const seeds=new Set();
  for(const row of tools.results){for(const name of row.result.values)seeds.add(name);need(!row.result.values.has('image_review_result'),row.site.binding);}
  need(seeds.size>0&&!seeds.has('image_review_result'),session);
  return {status:'conditional',partition,tools,constructors:{started,completed,binding},
    reachable:['legacy','refused'],nameSeeds:[...seeds],historyEdges:tools.history,
    transitions:[{from:'birth',to:'legacy',kind:'trusted-absent',node:partition.producer.call},
      {from:'legacy',to:'legacy',kind:'private-start',node:started},
      {from:'legacy',to:'legacy',kind:'paid-complete',node:completed},
      {from:'legacy',to:'refused',kind:'existing-decoder-authority-or-response-refusal',node:session}],
    outstanding:['strict retained Session/store/Host/caller/ordinary-provider runtime premise','new declaration reference and import initialization closure','actual successful default collector composition']};
}

function finiteImageTransportProjections(ts,context,rollbackContext) {
  const family=finiteImageLegacyFamilyClosure(ts,context),{nodes,symbol}=family.partition.producer;
  const fail=node=>{throw {reason:'IMAGE_TRANSPORT_RESIDUAL_UNKNOWN',node};};
  const need=(condition,node)=>{if(!condition)fail(node);};
  const one=(values,node)=>{need(values.length===1,node);return values[0];};
  const unwrap=raw=>{let node=raw;while(node&&(ts.isParenthesizedExpression(node)||ts.isAsExpression(node)||ts.isNonNullExpression(node)))node=node.expression;return node;};
  const file=key=>{const source=context.program.getSourceFile(resolve(context.root,key));need(source,undefined);return source;};
  const gateway=file('packages/ai-gateway/src/gateway.ts'),provider=file('packages/ai-gateway/src/provider.ts');
  const owner=(source,name)=>one(source.statements.filter(node=>ts.isClassDeclaration(node)&&node.name?.text===name),source);
  const methods=(source,name)=>source.members.filter(node=>ts.isMethodDeclaration(node)&&node.name.text===name);
  const gatewayClass=owner(gateway,'AiGateway'),providerClass=owner(provider,'AnthropicCompatProvider');
  const native=one(methods(gatewayClass,'nativeAgentComplete'),gatewayClass),complete=one(methods(gatewayClass,'completeWithControls'),gatewayClass);
  const input=symbol(native.parameters[1].name),nativeGuard=native.body.statements[0];
  const root=(node,base)=>ts.isIdentifier(unwrap(node))&&symbol(unwrap(node))===base;
  const toolSome=(raw,base)=>{
    const node=unwrap(raw);if(!ts.isCallExpression(node)||!ts.isPropertyAccessExpression(node.expression)||node.expression.name.text!=='some'
      ||!ts.isPropertyAccessExpression(node.expression.expression)||node.expression.expression.name.text!=='tools'
      ||!root(node.expression.expression.expression,base)||node.arguments.length!==1)return false;
    const callback=node.arguments[0];if(!ts.isArrowFunction(callback)||callback.parameters.length!==1)return false;
    const condition=unwrap(callback.body),parameter=symbol(callback.parameters[0].name);
    return ts.isBinaryExpression(condition)&&condition.operatorToken.kind===ts.SyntaxKind.EqualsEqualsEqualsToken
      &&ts.isPropertyAccessExpression(condition.left)&&condition.left.name.text==='name'&&ts.isPropertyAccessExpression(condition.left.expression)
      &&condition.left.expression.name.text==='function'&&root(condition.left.expression.expression,parameter)
      &&ts.isStringLiteral(condition.right)&&condition.right.text==='image_review_result';
  };
  need(ts.isIfStatement(nativeGuard)&&ts.isBinaryExpression(nativeGuard.expression)
    &&nativeGuard.expression.operatorToken.kind===ts.SyntaxKind.BarBarToken&&toolSome(nativeGuard.expression.left,input),nativeGuard);
  const own=nativeGuard.expression.right;
  need(ts.isCallExpression(own)&&ts.isPropertyAccessExpression(own.expression)&&own.expression.name.text==='some'
    &&ts.isCallExpression(own.expression.expression)&&ts.isPropertyAccessExpression(own.expression.expression.expression)
    &&ts.isIdentifier(own.expression.expression.expression.expression)&&own.expression.expression.expression.expression.text==='Object'
    &&!(symbol(own.expression.expression.expression.expression)?.declarations??[]).some(node=>!node.getSourceFile().isDeclarationFile)
    &&own.expression.expression.expression.name.text==='keys'&&own.expression.expression.arguments.length===1
    &&root(own.expression.expression.arguments[0],input)&&own.arguments.length===1&&ts.isArrowFunction(own.arguments[0]),own);
  const keyTest=own.arguments[0],includes=unwrap(keyTest.body);
  need(keyTest.parameters.length===1&&ts.isCallExpression(includes)&&ts.isPropertyAccessExpression(includes.expression)
    &&includes.expression.name.text==='includes'&&ts.isArrayLiteralExpression(includes.expression.expression)
    &&includes.expression.expression.elements.every(value=>ts.isStringLiteral(value)&&!family.tools.options.keys.includes(value.text))
    &&includes.arguments.length===1&&root(includes.arguments[0],symbol(keyTest.parameters[0].name)),own);
  const gatewayCalls=nodes(gateway,node=>ts.isCallExpression(node)&&symbol(node.expression)===symbol(complete.name));
  need(gatewayCalls.length>0,complete);
  for(const call of gatewayCalls){
    const opts=call.arguments[1];need(opts,call);
    if(ts.isObjectLiteralExpression(opts)){
      need(opts.properties.every(item=>ts.isPropertyAssignment(item)&&(ts.isIdentifier(item.name)||ts.isStringLiteral(item.name))&&item.name.text!=='tools'),opts);continue;
    }
    let method=call.parent;while(method&&!ts.isMethodDeclaration(method))method=method.parent;
    need(method&&['nativeAgentComplete','complete'].includes(method.name.text)&&root(opts,symbol(method.parameters[1].name)),call);
    if(method===native)continue;
    const first=method.body.statements[0];
    need(ts.isExpressionStatement(first)&&ts.isCallExpression(first.expression)&&ts.isPropertyAccessExpression(first.expression.expression)
      &&first.expression.expression.name.text==='rejectUnboundTools'&&first.expression.arguments.length===2
      &&root(first.expression.arguments[1],symbol(method.parameters[1].name)),first);
  }
  const reject=one(methods(gatewayClass,'rejectUnboundTools'),gatewayClass),rejectGuard=reject.body.statements[0];
  const alternatives=raw=>{const node=unwrap(raw);return ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.BarBarToken
    ?[...alternatives(node.left),...alternatives(node.right)]:[node];};
  need(ts.isIfStatement(rejectGuard)&&ts.isThrowStatement(rejectGuard.thenStatement.statements?.[0]),rejectGuard);
  const toolReject=alternatives(rejectGuard.expression)[0];
  need(ts.isBinaryExpression(toolReject)&&toolReject.operatorToken.kind===ts.SyntaxKind.ExclamationEqualsEqualsToken
    &&ts.isPropertyAccessExpression(toolReject.left)&&toolReject.left.name.text==='tools'
    &&root(toolReject.left.expression,symbol(reject.parameters[1].name))&&ts.isIdentifier(toolReject.right)&&toolReject.right.text==='undefined',rejectGuard);
  const body=one(methods(providerClass,'requestBody'),providerClass);
  need(body.parameters.length===2&&ts.isIdentifier(body.parameters[1].name),body);
  const choice=symbol(body.parameters[1].name),tools=one(nodes(body,node=>ts.isVariableDeclaration(node)&&node.name.text==='tools'),body);
  const guard=one(body.body.statements.filter(node=>ts.isIfStatement(node)&&ts.isBinaryExpression(node.expression)
    &&node.expression.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken&&ts.isPrefixUnaryExpression(node.expression.left)
    &&node.expression.left.operator===ts.SyntaxKind.ExclamationToken&&root(node.expression.left.operand,choice)),body);
  const toolCheck=guard.expression.right;
  need(ts.isCallExpression(toolCheck)&&ts.isPropertyAccessExpression(toolCheck.expression)&&toolCheck.expression.name.text==='some'
    &&root(toolCheck.expression.expression,symbol(tools.name))&&toolCheck.arguments.length===1,toolCheck);
  const callback=toolCheck.arguments[0];
  need(ts.isArrowFunction(callback)&&callback.parameters.length===1&&ts.isBinaryExpression(callback.body)
    &&callback.body.operatorToken.kind===ts.SyntaxKind.EqualsEqualsEqualsToken&&ts.isPropertyAccessExpression(callback.body.left)
    &&callback.body.left.name.text==='name'&&ts.isPropertyAccessExpression(callback.body.left.expression)
    &&callback.body.left.expression.name.text==='function'&&root(callback.body.left.expression.expression,symbol(callback.parameters[0].name))
    &&ts.isStringLiteral(callback.body.right)&&callback.body.right.text==='image_review_result',callback);
  const bodyCalls=nodes(providerClass,node=>ts.isCallExpression(node)&&symbol(node.expression)===symbol(body.name));
  for(const call of bodyCalls){
    need(call.arguments.length===1||call.arguments.length===2,call);
    if(call.arguments.length===2){
      let method=call.parent;while(method&&!ts.isMethodDeclaration(method))method=method.parent;
      need(method?.name.text==='nativeImageReviewRequest',call);
    }
  }
  for(const parsed of context.program.getSourceFiles()){
    if(parsed.isDeclarationFile||!/^(?:apps|packages)\//u.test(relative(context.root,parsed.fileName).replaceAll('\\','/')))continue;
    for(const node of nodes(parsed,ts.isIdentifier))if(symbol(node)===symbol(body.name)&&node!==body.name){
      let type=false;for(let parent=node.parent;parent;parent=parent.parent)if(ts.isTypeNode(parent)){type=true;break;}if(type)continue;
      const parent=node.parent;
      need(ts.isPropertyAccessExpression(parent)&&parent.name===node&&ts.isCallExpression(parent.parent)
        &&parent.parent.expression===parent&&bodyCalls.includes(parent.parent),node);
    }
  }
  const choiceSpreads=nodes(body,node=>ts.isSpreadAssignment(node)&&ts.isConditionalExpression(unwrap(node.expression))
    &&root(unwrap(node.expression).condition,choice));
  need(choiceSpreads.length===1,body);
  const conditional=unwrap(choiceSpreads[0].expression);
  need(ts.isObjectLiteralExpression(conditional.whenFalse)&&conditional.whenFalse.properties.length===0,conditional);
  const projected=new Map(),factory=ts.factory;
  for(const source of[gateway,provider]){
    const result=ts.transform(source,[transformation=>{
      const visit=node=>{
        if(node===nativeGuard||node===guard||node===choiceSpreads[0])return undefined;
        let output=ts.visitEachChild(node,visit,transformation);
        if(node===body)output=factory.updateMethodDeclaration(output,output.modifiers,output.asteriskToken,output.name,output.questionToken,
          output.typeParameters,[output.parameters[0]],output.type,output.body);
        return output;
      };return node=>ts.visitNode(node,visit);
    }]);
    let text;try{text=ts.createPrinter({removeComments:true}).printFile(result.transformed[0]);}finally{result.dispose();}
    const key=relative(context.root,source.fileName).replaceAll('\\','/'),old=rollbackContext.program.getSourceFile(resolve(rollbackContext.root,key));
    need(old,source);projected.set(key,{source,text,ast:result.transformed[0],rollback:old});
  }
  return {status:'conditional',family,projected,methods:{native,body},gatewayCalls,bodyCalls,
    outstanding:['new prepared-method/declaration no-untagged-reference closure','old caller/Provider argument binding and strict global context','import initialization and actual default collector pair']};
}

function finiteImageConsumerProjections(ts,context,rollbackContext) {
  const family=finiteImageLegacyFamilyClosure(ts,context),flow=finiteImageStoreFlowTerms(ts,context),{nodes,symbol}=family.partition.producer;
  const fail=node=>{throw {reason:'IMAGE_CONSUMER_RESIDUAL_UNKNOWN',node};};
  const need=(condition,node)=>{if(!condition)fail(node);};
  const one=(values,node)=>{need(values.length===1,node);return values[0];};
  const source=key=>{const value=context.program.getSourceFile(resolve(context.root,key));need(value,undefined);return value;};
  const review=source('apps/agent-worker/src/presentation/generated-image-review.ts'),journal=source('apps/agent-worker/src/native-agent/journal-task-store.ts');
  const fn=one(review.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='reviewGeneratedImage'),review);
  const result=one(nodes(fn,node=>ts.isVariableDeclaration(node)&&node.name.text==='result'),fn),decision=one(nodes(fn,node=>ts.isVariableDeclaration(node)&&node.name.text==='decision'),fn);
  const guard=one(fn.body.statements.filter(node=>ts.isIfStatement(node)&&ts.isBinaryExpression(node.expression)&&node.expression.operatorToken.kind===ts.SyntaxKind.InKeyword
    &&ts.isStringLiteral(node.expression.left)&&node.expression.left.text==='imageResultPolicy'&&symbol(node.expression.right)===symbol(result.name)),fn);
  need(!decision.initializer&&ts.isExpressionStatement(guard.elseStatement)&&ts.isBinaryExpression(guard.elseStatement.expression)
    &&guard.elseStatement.expression.operatorToken.kind===ts.SyntaxKind.EqualsToken&&symbol(guard.elseStatement.expression.left)===symbol(decision.name),guard);
  const value=guard.elseStatement.expression.right;
  need(ts.isCallExpression(value)&&ts.isIdentifier(value.expression)&&value.expression.text==='parseDecision'&&value.arguments.length===1
    &&ts.isCallExpression(value.arguments[0])&&ts.isIdentifier(value.arguments[0].expression)&&value.arguments[0].expression.text==='parseStructuredJson'
    &&value.arguments[0].arguments.length===1&&ts.isPropertyAccessExpression(value.arguments[0].arguments[0])
    &&symbol(value.arguments[0].arguments[0].expression)===symbol(result.name)&&value.arguments[0].arguments[0].name.text==='text',guard);
  const callbackCalls=[];
  for(const parsed of context.program.getSourceFiles()){
    if(parsed.isDeclarationFile||!/^(?:apps|packages)\//u.test(relative(context.root,parsed.fileName).replaceAll('\\','/')))continue;
    for(const node of nodes(parsed,ts.isIdentifier))if(symbol(node)===symbol(fn.name)){
      if(node===fn.name||ts.isImportSpecifier(node.parent)||ts.isExportSpecifier(node.parent))continue;
      need(ts.isCallExpression(node.parent)&&node.parent.expression===node,node);callbackCalls.push(node.parent);
    }
  }
  const call=one(callbackCalls,fn),callback=call.arguments[2];
  need(ts.isConditionalExpression(callback)&&ts.isArrowFunction(callback.whenTrue)&&ts.isBlock(callback.whenTrue.body)
    &&ts.isIdentifier(callback.whenFalse)&&callback.whenFalse.text==='undefined',callback);
  const returned=callback.whenTrue.body.statements.at(-1);
  need(ts.isReturnStatement(returned)&&ts.isCallExpression(returned.expression)&&symbol(returned.expression.expression)===symbol(flow.route.name),returned);
  const fiveFields=expression=>ts.isObjectLiteralExpression(expression)&&expression.properties.length===5
    &&expression.properties.every(item=>(ts.isPropertyAssignment(item)||ts.isShorthandPropertyAssignment(item))
      &&['text','promptHash','responseHash','provider','model'].includes(item.name.text))
    &&new Set(expression.properties.map(item=>item.name.text)).size===5;
  const codex=source('packages/ai-gateway/src/codex-sol-review.ts');
  const codexClass=one(codex.statements.filter(node=>ts.isClassDeclaration(node)&&node.name?.text==='CodexSolImageReviewProvider'),codex);
  const output=one(codexClass.members.filter(node=>ts.isMethodDeclaration(node)&&node.name.text==='output'),codexClass);
  const codexResult=one(output.body.statements.filter(node=>ts.isReturnStatement(node)&&fiveFields(node.expression)),output);
  const gatewaySource=source('packages/ai-gateway/src/gateway.ts');
  const gatewayClass=one(gatewaySource.statements.filter(node=>ts.isClassDeclaration(node)&&node.name?.text==='AiGateway'),gatewaySource);
  const controlled=one(gatewayClass.members.filter(node=>ts.isMethodDeclaration(node)&&node.name.text==='reviewScientificControlled'),gatewayClass);
  const firstMode=controlled.body.statements[0];
  need(ts.isIfStatement(firstMode)&&ts.isBlock(firstMode.thenStatement),firstMode);
  const modelResult=one(firstMode.thenStatement.statements.filter(node=>ts.isReturnStatement(node)&&fiveFields(node.expression)),firstMode);
  // The real production Gateway constructor supplies only this existing
  // read-only historical image provider. Other model review output is the
  // five-field literal above; model JSON remains inside text in both cases.
  const constructorCalls=[];
  for(const parsed of context.program.getSourceFiles())if(!parsed.isDeclarationFile&&/^(?:apps|packages)\//u.test(relative(context.root,parsed.fileName).replaceAll('\\','/')))
    constructorCalls.push(...nodes(parsed,node=>ts.isNewExpression(node)&&symbol(node.expression)===symbol(gatewayClass.name)));
  need(constructorCalls.length>0,gatewayClass);
  for(const creation of constructorCalls){
    need(creation.arguments?.length===1&&ts.isObjectLiteralExpression(creation.arguments[0]),creation);
    need(creation.arguments[0].properties.every(item=>(ts.isShorthandPropertyAssignment(item)||ts.isPropertyAssignment(item))
      &&(ts.isIdentifier(item.name)||ts.isStringLiteral(item.name))),creation);
    const supplied=creation.arguments[0].properties.filter(item=>item.name.text==='illustrationImageReviewProvider');
    // Text/OCR-only source self-tests supply no image reviewer; the existing
    // Gateway then refuses historical image mode instead of returning a value.
    if(!supplied.length)continue;
    const provider=one(supplied,creation);need(ts.isShorthandPropertyAssignment(provider),provider);
    const declared=context.checker.getShorthandAssignmentValueSymbol(provider)?.valueDeclaration;
    need(declared&&ts.isVariableDeclaration(declared)&&ts.isConditionalExpression(declared.initializer),provider);
    const choice=declared.initializer;
    need(ts.isNewExpression(choice.whenTrue)&&symbol(choice.whenTrue.expression)===symbol(codexClass.name)
      &&ts.isIdentifier(choice.whenFalse)&&choice.whenFalse.text==='undefined',choice);
  }
  const journalFn=one(journal.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='createJournalNativeTaskStore'),journal);
  const save=one(nodes(journalFn,node=>ts.isFunctionDeclaration(node)&&node.name?.text==='save'),journalFn);
  const turn=one(nodes(save,node=>ts.isVariableDeclaration(node)&&node.name.text==='turn'),save);
  const raw=one(nodes(save,node=>ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.EqualsEqualsEqualsToken
    &&ts.isPropertyAccessExpression(node.left)&&symbol(node.left.expression)===symbol(turn.name)&&node.left.name.text==='state'
    &&ts.isStringLiteral(node.right)&&node.right.text==='received'),save);
  const unwrap=raw=>{let node=raw;while(ts.isParenthesizedExpression(node))node=node.expression;return node;};
  const alternatives=raw=>{const node=unwrap(raw);return ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.BarBarToken
    ?[...alternatives(node.left),...alternatives(node.right)]:[raw];};
  let journalGuard=raw;while(journalGuard.parent&&!ts.isIfStatement(journalGuard))journalGuard=journalGuard.parent;
  need(ts.isIfStatement(journalGuard),raw);
  const clauses=alternatives(journalGuard.expression);
  need(clauses[1]===raw&&ts.isPrefixUnaryExpression(clauses[0])&&clauses[0].operator===ts.SyntaxKind.ExclamationToken
    &&symbol(clauses[0].operand)===symbol(turn.name),journalGuard);
  const projected=new Map(),factory=ts.factory;
  for(const current of[review,journal]){
    const transformation=ts.transform(current,[transformation=>{
      const visit=node=>{
        if(node===guard)return undefined;
        if(node===decision.parent.parent)return factory.createVariableStatement(node.modifiers,factory.createVariableDeclarationList([
          factory.updateVariableDeclaration(decision,decision.name,decision.exclamationToken,decision.type,value)],ts.NodeFlags.Const));
        if(node===journalGuard)return factory.updateIfStatement(node,clauses.filter(clause=>clause!==raw)
          .reduce((a,b)=>factory.createBinaryExpression(a,ts.SyntaxKind.BarBarToken,b)),node.thenStatement,node.elseStatement);
        return ts.visitEachChild(node,visit,transformation);
      };return node=>ts.visitNode(node,visit);
    }]);
    let text;try{text=ts.createPrinter({removeComments:true}).printFile(transformation.transformed[0]);}finally{transformation.dispose();}
    const key=relative(context.root,current.fileName).replaceAll('\\','/'),old=rollbackContext.program.getSourceFile(resolve(rollbackContext.root,key));
    need(old,current);projected.set(key,{source:current,text,ast:transformation.transformed[0],rollback:old});
  }
  return {status:'conditional',family,projected,callback:call,journalGuard,resultConstructors:{codexResult,modelResult,constructorCalls},
    outstanding:['full legacy native materializer five-field result comparison','journal source binding and old turn history','strict shared runtime/import context and tagged retention']};
}

function finiteImageDeclarationClosure(ts,context,rollbackContext,projected,initialization) {
  const producer=finiteImageProducerTerms(ts,context),{nodes}=producer;
  const fail=node=>{throw {reason:'IMAGE_DECLARATION_CONTEXT_UNKNOWN',node};};
  const need=(condition,node)=>{if(!condition)fail(node);};
  const original=node=>ts.getOriginalNode(node);
  const symbol=node=>{
    node=original(node);if(!node?.parent)return undefined;
    let value=ts.isShorthandPropertyAssignment(node.parent)?context.checker.getShorthandAssignmentValueSymbol(node.parent):context.checker.getSymbolAtLocation(node);
    if(value?.flags&ts.SymbolFlags.Alias)value=context.checker.getAliasedSymbol(value);return value;
  };
  const declarations=new Map(),byNode=new Map(),classNames=new Set();
  const name=node=>node.name&&ts.isIdentifier(node.name)?node.name.text:undefined;
  const top=source=>source.statements.flatMap(statement=>ts.isVariableStatement(statement)?[...statement.declarationList.declarations]
    :ts.isFunctionDeclaration(statement)?[statement]:[]);
  const add=(node,source,kind)=>{
    const value=symbol(node.name);need(value&&!declarations.has(value),node);
    need(!nodes(node,ts.isDecorator).length,node);
    if(kind==='method'){
      need(!node.modifiers?.some(item=>item.kind===ts.SyntaxKind.StaticKeyword)&&!ts.isComputedPropertyName(node.name),node);classNames.add(name(node));
    }else if(ts.isVariableDeclaration(node)){
      need(Boolean(node.parent.flags&ts.NodeFlags.Const)&&node.initializer,node);
      need(ts.isArrowFunction(node.initializer)||ts.isFunctionExpression(node.initializer)||initialization.sources.includes(source),node);
    }
    const record={node,source,kind,symbol:value,references:[]};declarations.set(value,record);byNode.set(node,record);
  };
  for(const model of projected.values()){
    const old=model.rollback,oldNames=new Set(top(old).map(name));
    for(const node of top(model.source))if(name(node)&&!oldNames.has(name(node)))add(node,model.source,'top');
    for(const node of model.source.statements)if(ts.isClassDeclaration(node)){
      const previous=old.statements.find(item=>ts.isClassDeclaration(item)&&name(item)===name(node));need(previous,node);
      const methods=new Set(previous.members.filter(ts.isMethodDeclaration).map(name));
      for(const member of node.members)if(ts.isMethodDeclaration(member)&&name(member)&&!methods.has(name(member)))add(member,model.source,'method');
    }
  }
  const namespaces=new Map();
  const exportsOf=specifier=>{
    const module=context.checker.getSymbolAtLocation(specifier);if(!module)return undefined;
    const entries=context.checker.getExportsOfModule(module);
    return entries.some(entry=>{const target=entry.flags&ts.SymbolFlags.Alias?context.checker.getAliasedSymbol(entry):entry;return declarations.has(target);})?entries:undefined;
  };
  const sources=[...context.program.getSourceFiles()].filter(source=>!source.isDeclarationFile&&/^(?:apps|packages)\//u.test(relative(context.root,source.fileName).replaceAll('\\','/')));
  for(const source of sources)for(const statement of source.statements){
    if(ts.isImportDeclaration(statement)&&!statement.importClause?.isTypeOnly&&statement.importClause?.namedBindings
      &&ts.isNamespaceImport(statement.importClause.namedBindings)&&exportsOf(statement.moduleSpecifier))namespaces.set(symbol(statement.importClause.namedBindings.name),statement);
  }
  const edges=[],live=[];
  const receiverProperties=(raw,seen=new Set())=>{
    let node=original(raw);while(ts.isParenthesizedExpression(node)||ts.isAsExpression(node)||ts.isNonNullExpression(node))node=node.expression;
    const properties=context.checker.getTypeAtLocation(node).getProperties();
    if(properties.some(member=>classNames.has(member.name)))return properties;
    if(ts.isIdentifier(node)){
      const value=symbol(node)?.valueDeclaration;
      if(value&&ts.isVariableDeclaration(value)&&value.initializer&&!seen.has(value))return receiverProperties(value.initializer,new Set(seen).add(value));
    }
    return properties;
  };
  const walk=(node,owner)=>{
    if(ts.isTypeNode(node)||ts.isInterfaceDeclaration(node)||ts.isTypeAliasDeclaration(node)||ts.isImportDeclaration(node)||ts.isExportDeclaration(node))return;
    owner=byNode.get(original(node))??owner;
    if(ts.isIdentifier(node)){
      const value=symbol(node),target=declarations.get(value),parent=original(node).parent;
      if(target&&original(node)!==target.node.name){
        const declarationName=ts.isVariableDeclaration(parent)&&parent.name===original(node)||ts.isFunctionDeclaration(parent)&&parent.name===original(node)
          ||ts.isMethodDeclaration(parent)&&parent.name===original(node);
        if(!declarationName){
          const edge={from:owner,to:target,node};edges.push(edge);target.references.push(edge);if(!owner)live.push(edge);
        }
      }
      if(namespaces.has(value)&&!owner){
        need(ts.isPropertyAccessExpression(parent)&&parent.expression===original(node),node);
      }
    }
    if(!owner&&ts.isElementAccessExpression(node)){
      const properties=receiverProperties(node.expression);
      need(!(ts.isStringLiteral(node.argumentExpression)&&classNames.has(node.argumentExpression.text)),node);
      if(properties.some(member=>classNames.has(member.name)))need(ts.isStringLiteral(node.argumentExpression)&&!classNames.has(node.argumentExpression.text),node);
    }
    if(!owner&&ts.isPropertyAccessExpression(node)&&classNames.has(node.name.text)){
      const value=symbol(node.name);need(value&&declarations.has(value),node);
    }
    if(!owner&&ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)
      &&['getPrototypeOf','getOwnPropertyNames','getOwnPropertyDescriptors','ownKeys'].includes(node.expression.name.text)){
      for(const argument of node.arguments){const properties=receiverProperties(argument);
        need(!properties.some(member=>classNames.has(member.name)),node);}
    }
    if(!owner&&ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(node.expression)&&node.expression.text==='require')){
      if(node.arguments.length===1&&ts.isStringLiteral(node.arguments[0]))need(!exportsOf(node.arguments[0]),node);
    }
    ts.forEachChild(node,child=>walk(child,owner));
  };
  for(const source of sources){const key=relative(context.root,source.fileName).replaceAll('\\','/');walk(projected.get(key)?.ast??source,undefined);}
  need(!live.length,live[0]?.node);
  const factory=ts.factory,result=new Map();
  for(const[key,model]of projected){
    const transformed=ts.transform(model.ast,[transformation=>{
      const visit=node=>{
        if(byNode.has(original(node)))return undefined;
        if(ts.isExportSpecifier(node)&&declarations.has(symbol(node.name)))return undefined;
        let value=ts.visitEachChild(node,visit,transformation);
        if(ts.isVariableStatement(value)&&!value.declarationList.declarations.length)return undefined;
        if(ts.isExportDeclaration(value)&&value.exportClause&&ts.isNamedExports(value.exportClause)&&!value.exportClause.elements.length)return undefined;
        return value;
      };return node=>ts.visitNode(node,visit);
    }]);
    let text;try{text=ts.createPrinter({removeComments:true}).printFile(transformed.transformed[0]);}finally{transformed.dispose();}
    result.set(key,{...model,text,ast:transformed.transformed[0]});
  }
  return {status:'conditional',projected:result,declarations,edges,
    outstanding:['retained full-module/dependency equality','actual static import/eager initialization and caller escape premise','successful default collector provenance']};
}

function finiteImageLegacySourceModel(ts,context,rollbackContext) {
  const initialization=finiteImageInitializationTerms(ts,context),projected=new Map();
  const add=model=>{const key=relative(context.root,model.source.fileName).replaceAll('\\','/');
    if(projected.has(key))throw {reason:'IMAGE_PROJECTION_OVERLAP_UNKNOWN',node:model.source};projected.set(key,model);};
  for(const model of[
    finiteImageSessionProjection(ts,context,rollbackContext),finiteImageDecoderProjection(ts,context,rollbackContext),
    finiteImageStoreProjection(ts,context,rollbackContext),finiteImageExecutionProjection(ts,context,rollbackContext),
    finiteImageIllustrationProjection(ts,context,rollbackContext),finiteImageHostProjection(ts,context,rollbackContext),
  ])add(model);
  for(const model of[
    finiteImageRecoveryProjections(ts,context,rollbackContext),finiteImageTransportProjections(ts,context,rollbackContext),
    finiteImageConsumerProjections(ts,context,rollbackContext),
  ])for(const value of model.projected.values())add(value);
  const bridge=context.program.getSourceFile(resolve(context.root,'packages/ai-gateway/src/native-agent-bridge.ts'));
  const index=context.program.getSourceFile(resolve(context.root,'packages/ai-gateway/src/index.ts'));
  for(const source of[bridge,index,initialization.freezer.getSourceFile()]){
    const key=relative(context.root,source.fileName).replaceAll('\\','/'),old=rollbackContext.program.getSourceFile(resolve(rollbackContext.root,key));
    if(!old)throw {reason:'IMAGE_LEGACY_CONTEXT_MODULE_MISSING',node:source};add({source,text:source.text,ast:source,rollback:old});
  }
  const closure=finiteImageDeclarationClosure(ts,context,rollbackContext,projected,initialization);
  return {status:'conditional',initialization,closure,projected:closure.projected,
    outstanding:['every projected module runtime equals actual rollback','all remaining entries strictly equal and justified builtin imports','actual full default collector and original private/callback binding composition']};
}

function finiteImageCollectedContexts(ts,current,previous,candidateRoot,rollbackRoot,roots) {
  const left=rollbackProofContexts.get(current),right=rollbackProofContexts.get(previous);
  if(roots!==APPLICATION_ROLLBACK_READERS||!left||!right||left.ts!==ts||right.ts!==ts||left.roots!==roots||right.roots!==roots
    ||left.root!==candidateRoot||right.root!==rollbackRoot||left.program.getTypeChecker()!==left.checker||right.program.getTypeChecker()!==right.checker)return undefined;
  return {left,right};
}

function finiteImageProjectedRuntime(ts,context,key,model) {
  const path=resolve(context.root,key);
  if(context.modules.get(path)!==model.source||context.program.getSourceFile(path)!==model.source)
    throw {reason:'IMAGE_CAPTURED_SOURCE_IDENTITY_CHANGED',node:model.source};
  const compiled=ts.transpileModule(model.text,{fileName:path,reportDiagnostics:true,
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,removeComments:true}});
  if(compiled.diagnostics?.some(item=>item.category===ts.DiagnosticCategory.Error))throw {reason:'IMAGE_PROJECTED_RUNTIME_INVALID',node:model.source};
  const emitted=ts.createSourceFile('runtime.js',compiled.outputText,ts.ScriptTarget.ES2022,true,ts.ScriptKind.JS);
  if(emitted.parseDiagnostics.length)throw {reason:'IMAGE_PROJECTED_RUNTIME_INVALID',node:model.source};
  const imports=source=>source.statements.filter(node=>(ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier
    &&ts.isStringLiteral(node.moduleSpecifier)).map(node=>node.moduleSpecifier.text);
  return {canonical:context.canonical(emitted),imports:imports(emitted)};
}

// Reader retention is exact. Only the actual trusted fresh initializer call
// may change between the capable deployed I1 and its writer descendant. The
// original raw readers/finalizers and every dependency stay in this comparison.
function finiteImageCapableSourceModel(ts,left,right,current,previous) {
  const candidate=finiteImageProtocolPartition(ts,left),rollback=finiteImageProtocolPartition(ts,right);
  const key=relative(left.root,candidate.producer.source.fileName).replaceAll('\\','/');
  if(key!==relative(right.root,rollback.producer.source.fileName).replaceAll('\\','/'))throw {reason:'IMAGE_CAPABLE_SOURCE_CHANGED'};
  const a=new Map(current),b=new Map(previous),moduleKey=`module:${key}`;
  for(const entry of new Set([...a.keys(),...b.keys()]))if(!a.has(entry)||!b.has(entry)
    ||entry!==moduleKey&&JSON.stringify(a.get(entry))!==JSON.stringify(b.get(entry)))throw {reason:'IMAGE_READER_CAPABILITY_OR_CONTEXT_CHANGED'};
  if(!a.has(moduleKey)||!b.has(moduleKey))throw {reason:'IMAGE_CAPABLE_SOURCE_MISSING'};
  return {status:'conditional',key,candidate,rollback,
    outstanding:['normalized whole producer module equality','original successful full default collector provenance']};
}

function finiteImageCapablePairCompatibility(ts,current,previous,candidateRoot,rollbackRoot,roots) {
  try{
    const captured=finiteImageCollectedContexts(ts,current,previous,candidateRoot,rollbackRoot,roots);if(!captured)return false;
    const {left,right}=captured;
    const {key,candidate,rollback}=finiteImageCapableSourceModel(ts,left,right,current,previous);
    const x=finiteImageProjectedRuntime(ts,left,key,{source:candidate.producer.source,text:candidate.producer.text});
    const y=finiteImageProjectedRuntime(ts,right,key,{source:rollback.producer.source,text:rollback.producer.text});
    return JSON.stringify(x.canonical)===JSON.stringify(y.canonical);
  }catch{return false;}
}

function finiteImageFirstPairCompatibility(ts,current,previous,candidateRoot,rollbackRoot,roots) {
  try{
    const captured=finiteImageCollectedContexts(ts,current,previous,candidateRoot,rollbackRoot,roots);if(!captured)return false;
    const {left,right}=captured;
    const candidate=finiteImageLegacySourceModel(ts,left,right),a=new Map(current),b=new Map(previous);
    const affected=new Set([...candidate.projected.keys()].map(key=>`module:${key}`)),runtime=new Map();
    for(const[key,model]of candidate.projected){
      const moduleKey=`module:${key}`,path=resolve(right.root,key);
      if(!a.has(moduleKey)||!b.has(moduleKey)||right.modules.get(path)!==model.rollback||right.program.getSourceFile(path)!==model.rollback)return false;
      const value=finiteImageProjectedRuntime(ts,left,key,model);runtime.set(key,value);
      if(JSON.stringify(value.canonical)!==JSON.stringify(b.get(moduleKey)))return false;
    }
    for(const key of new Set([...a.keys(),...b.keys()])){
      if(affected.has(key))continue;
      if(a.has(key)&&b.has(key)){if(JSON.stringify(a.get(key))!==JSON.stringify(b.get(key)))return false;continue;}
      // Derive only a dropped core import from the original captured module.
      // No module/package/vendor/configuration entry is omitted, and even a
      // core import must already exist in the actual old runtime's closure.
      const match=/^(.*):external:(node:[A-Za-z0-9_/-]+)$/u.exec(key);
      if(!a.has(key)||b.has(key)||a.get(key)!=='node-builtin'||!match||!candidate.projected.has(match[1])
        ||!builtinModules.includes(match[2].slice(5))&&!builtinModules.includes(match[2]))return false;
      const model=candidate.projected.get(match[1]),compiled=ts.transpileModule(model.source.text,
        {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,removeComments:true}});
      const original=ts.createSourceFile('runtime.js',compiled.outputText,ts.ScriptTarget.ES2022,true,ts.ScriptKind.JS);
      if(!original.statements.some(node=>ts.isImportDeclaration(node)&&node.moduleSpecifier.text===match[2])
        ||runtime.get(match[1]).imports.includes(match[2])
        ||![...b].some(([name,value])=>name.endsWith(`:external:${match[2]}`)&&value==='node-builtin'))return false;
    }
    const ingress=proveNativeVideoReceiptIngress(ts,right.program,right.root);
    if(ingress.reason!=='OTHER_PERSISTENCE_ORIGINS_UNPROVEN'||ingress.storeGraph.status!=='conditional'||ingress.privateStoreChain.status!=='conditional')return false;
    return true;
  }catch{return false;}
}


// This transition is intentionally directional. Reader -> old proves closure
// over states produced by the old application. Once a writer has run, its only
// adjacent rollback is the retained reader; the old-domain proof cannot erase
// that history. The selector-only writer -> reader case compares every other
// captured runtime entry exactly, including all private readers and finalizers.
function finiteVoiceSourceModel(ts, context, rollbackContext) {
  const { program, checker, root } = context;
  const fail = (reason, node) => { throw { reason: `VOICE_${reason}`, node }; };
  const need = (condition, reason, node) => { if (!condition) fail(reason, node); };
  const nodes = (scope, predicate) => { const values = []; const visit = node => {
    if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
    if (predicate(node)) values.push(node); ts.forEachChild(node, visit);
  }; visit(scope); return values; };
  const one = (values, reason) => { need(values.length === 1, reason); return values[0]; };
  const source = path => { const value = program.getSourceFile(resolve(root, path)); need(value, 'SOURCE_MISSING'); return value; };
  const symbol = node => { let value = checker.getSymbolAtLocation(node);
    if (value?.flags & ts.SymbolFlags.Alias) value = checker.getAliasedSymbol(value); return value; };
  const text = node => node.getText(node.getSourceFile());
  const tokens = value => { const scanner = ts.createScanner(ts.ScriptTarget.ES2022, true, ts.LanguageVariant.Standard, value), result = [];
    for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) result.push([token, scanner.getTokenText()]);
    return JSON.stringify(result);
  };
  const same = (node, expected) => !!node && tokens(text(node)) === tokens(expected);
  const functionNamed = (file, name) => one(file.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name), 'FUNCTION_MISSING');
  const contains = (node, expected) => nodes(node, value => same(value, expected)).length > 0;
  const requireNode = (node, expected, reason) => need(contains(node, expected), reason, node);
  const contract = source('packages/domain/src/agent/voice-contract.ts');
  const selector = functionNamed(contract, 'isHermesVoiceWriterEnabled');
  const synchronous = fn => !fn.asteriskToken && !fn.modifiers?.some(value => value.kind === ts.SyntaxKind.AsyncKeyword);
  need(synchronous(selector) && selector.parameters.length === 0 && selector.body?.statements.length === 1
    && ts.isReturnStatement(selector.body.statements[0])
    && [ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.TrueKeyword].includes(selector.body.statements[0].expression?.kind), 'PHASE_SELECTOR_CHANGED', selector);
  const phase = selector.body.statements[0].expression.kind === ts.SyntaxKind.FalseKeyword ? 'reader' : 'writer';
  need(phase === 'reader', 'FRESH_PHASE_NOT_READER', selector);
  const selectorSymbol = symbol(selector.name);
  const disabled = (fn, reason) => {
    const first = fn.body?.statements[0];
    need(first && ts.isIfStatement(first) && ts.isPrefixUnaryExpression(first.expression)
      && first.expression.operator === ts.SyntaxKind.ExclamationToken && ts.isCallExpression(first.expression.operand)
      && symbol(first.expression.operand.expression) === selectorSymbol && !first.expression.operand.arguments.length
      && !first.elseStatement, reason, first);
    const body = ts.isBlock(first.thenStatement) ? first.thenStatement.statements : [first.thenStatement];
    need(body.length === 1 && (same(body[0], 'blocked(HERMES_VOICE_READER_ONLY);')
      || same(body[0], "throw new AgentError('ILLEGAL_TRANSITION', HERMES_VOICE_READER_ONLY);")), reason, first);
  };
  const kind = functionNamed(contract, 'isHermesVoiceTaskKind');
  need(synchronous(kind) && kind.parameters.length === 1 && kind.parameters[0].name.getText() === 'kind' && kind.body.statements.length === 1
    && same(kind.body.statements[0], 'return (HERMES_VOICE_TASK_KINDS as readonly string[]).includes(kind);'), 'KIND_DISCRIMINATOR_CHANGED');
  const kindDeclaration = one(nodes(contract, node => ts.isVariableDeclaration(node) && node.name.getText() === 'HERMES_VOICE_TASK_KINDS'), 'KIND_DOMAIN_MISSING');
  need(same(kindDeclaration.initializer, "['voice.transcribe', 'voice.reply'] as const"), 'KIND_DOMAIN_CHANGED');
  const kindSymbol = symbol(kind.name);
  // These four new modules have no eager work. Imports are separately checked
  // against captured old modules/builtin dependencies by the pair below.
  const capsules = new Map([
    ['packages/domain/src/agent/voice-contract.ts', contract],
    ['packages/domain/src/agent/voice.ts', source('packages/domain/src/agent/voice.ts')],
    ['packages/ai-gateway/src/synclip-voice.ts', source('packages/ai-gateway/src/synclip-voice.ts')],
    ['apps/agent-worker/src/voice.ts', source('apps/agent-worker/src/voice.ts')],
  ]);
  const pureInitializer = value => {
    if (!value) return true;
    if (ts.isArrowFunction(value) || ts.isFunctionExpression(value) || ts.isLiteralExpression(value)
      || [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(value.kind)) return true;
    if (ts.isAsExpression(value) || ts.isParenthesizedExpression(value) || ts.isTypeAssertionExpression(value)) return pureInitializer(value.expression);
    if (ts.isArrayLiteralExpression(value)) return value.elements.every(pureInitializer);
    if (ts.isObjectLiteralExpression(value)) return value.properties.every(item => ts.isPropertyAssignment(item)
      && !ts.isComputedPropertyName(item.name) && pureInitializer(item.initializer));
    return false;
  };
  for (const [path, file] of capsules) {
    need(!rollbackContext.program.getSourceFile(resolve(rollbackContext.root, path)), 'CAPSULE_ALREADY_PRESENT', file);
    for (const statement of file.statements) {
      if (ts.isImportDeclaration(statement)) { need(!!statement.importClause, 'EAGER_IMPORT_UNKNOWN', statement); continue; }
      if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement) || ts.isFunctionDeclaration(statement)) continue;
      need(ts.isVariableStatement(statement) && statement.declarationList.flags & ts.NodeFlags.Const
        && statement.declarationList.declarations.every(item => ts.isIdentifier(item.name) && pureInitializer(item.initializer)),
      'EAGER_INITIALIZATION_OR_DECLARATION_UNKNOWN', statement);
    }
    for (const parameter of nodes(file, ts.isParameter)) if (parameter.initializer) need(ts.isObjectLiteralExpression(parameter.initializer)
      && parameter.initializer.properties.length === 0 || ts.isIdentifier(parameter.initializer)
      && parameter.initializer.text === 'HERMES_VOICE_HOLD' || ts.isLiteralExpression(parameter.initializer)
      || [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword].includes(parameter.initializer.kind), 'PARAMETER_INITIALIZER_EFFECT', parameter);
    const declarations = new Map(file.statements.flatMap(statement => ts.isFunctionDeclaration(statement) && statement.name
      ? [[statement.name.text, symbol(statement.name)]] : ts.isVariableStatement(statement)
        ? statement.declarationList.declarations.filter(item => ts.isIdentifier(item.name)).map(item => [item.name.text, symbol(item.name)]) : []));
    for (const call of nodes(file, ts.isCallExpression)) if (ts.isIdentifier(call.expression) && declarations.has(call.expression.text))
      need(symbol(call.expression) === declarations.get(call.expression.text), 'CAPSULE_SHADOWED_CAPABILITY', call);
  }
  const voice = capsules.get('packages/domain/src/agent/voice.ts');
  const admission = functionNamed(voice, 'requireVoiceWriter');
  need(synchronous(admission) && admission.parameters.length === 0 && admission.body.statements.length === 1, 'FRESH_DOMAIN_ADMISSION_OPEN');
  disabled(admission, 'FRESH_DOMAIN_ADMISSION_OPEN');
  for (const name of ['submitHermesVoiceTranscription', 'submitHermesVoiceReply', 'withHermesVoiceSubmission']) {
    const first = functionNamed(voice, name).body.statements[0];
    need(same(first, 'requireVoiceWriter();') && symbol(first.expression.expression) === symbol(admission.name), 'FRESH_DOMAIN_ADMISSION_OPEN');
  }
  const agent = source('packages/domain/src/agent/agent.ts');
  disabled(functionNamed(agent, 'persistHermesVoiceTaskInTransaction'), 'FRESH_PERSISTENCE_OPEN');
  requireNode(functionNamed(agent, 'persistAgentTaskInTransaction'),
    "if (isHermesVoiceTaskKind(input.kind)) { throw new AgentError('VALIDATION_ERROR', 'Voice tasks require the dedicated Hermes voice submission'); }", 'GENERIC_VOICE_PRODUCER_OPEN');
  const core = functionNamed(agent, 'persistAgentTaskCoreInTransaction'), coreSymbol = symbol(core.name);
  need(!core.modifiers?.some(node => node.kind === ts.SyntaxKind.ExportKeyword), 'CORE_PRODUCER_ESCAPED');
  const fixedCallerKinds = new Map([
    ['persistHermesSourceReviewTechnicalTaskInTransaction', 'sdf.extract'], ['persistSourceRetrieveTaskInTransaction', 'source.retrieve'],
    ['persistSourceMapSearchIndexInTransaction', 'search.index'],
  ]);
  for (const use of nodes(agent, ts.isIdentifier)) if (symbol(use) === coreSymbol && use !== core.name) {
    const call = use.parent; need(ts.isCallExpression(call) && call.expression === use, 'CORE_PRODUCER_ESCAPED', use);
    let scope = use.parent; while (scope && !(ts.isFunctionDeclaration(scope) && scope.name)) scope = scope.parent;
    const name = scope?.name.text;
    if (['persistAgentTaskInTransaction', 'persistHermesVoiceTaskInTransaction'].includes(name)) continue;
    if (fixedCallerKinds.has(name)) {
      const input = call.arguments[2]; need(ts.isObjectLiteralExpression(input), 'CORE_KIND_UNKNOWN', call);
      const kind = one(input.properties.filter(node => ts.isPropertyAssignment(node) && node.name.getText() === 'kind'), 'CORE_KIND_UNKNOWN');
      need(ts.isStringLiteral(kind.initializer) && kind.initializer.text === fixedCallerKinds.get(name)
        && !input.properties.slice(input.properties.indexOf(kind) + 1).some(ts.isSpreadAssignment), 'CORE_KIND_UNKNOWN', input);
      continue;
    }
    const expected = new Map([['persistJournalSponsoredPaperTaskInTransaction', 'sdf.extract'], ['submitDeterministicPresentationTask', 'presentation.generate']]).get(name);
    need(expected, 'CORE_CALLER_UNKNOWN', call);
    const guard = scope.body.statements[0];
    const disjunct = expression => same(expression, `input.kind !== '${expected}'`)
      || ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.BarBarToken
        && (disjunct(expression.left) || disjunct(expression.right));
    need(ts.isIfStatement(guard) && disjunct(guard.expression) && (ts.isThrowStatement(guard.thenStatement)
      || ts.isBlock(guard.thenStatement) && guard.thenStatement.statements.length === 1 && ts.isThrowStatement(guard.thenStatement.statements[0])), 'CORE_KIND_UNKNOWN', guard);
  }
  // The old state domain has no voice kind. Every new callable effect either
  // fails its first admission selector, fails taskAuthority before effects, or
  // requires an existing validated voice receipt and original identity.
  const taskAuthority = functionNamed(voice, 'taskAuthority');
  need(same(taskAuthority.body.statements[0], 'const task = await tx.agentTask.findUnique({ where: { id: taskId } });')
    && same(taskAuthority.body.statements[1], 'if (!task || task.deletedAt || !isHermesVoiceTaskKind(task.kind)) unavailable();'), 'OLD_DOMAIN_AUTHORITY_ESCAPE');
  const blocked = functionNamed(voice, 'blocked'), unavailable = functionNamed(voice, 'unavailable'), invalid = functionNamed(voice, 'invalid');
  for (const fn of [blocked, unavailable, invalid]) need(synchronous(fn) && fn.body.statements.length === 1
    && ts.isThrowStatement(fn.body.statements[0]), 'BLOCKER_DOES_NOT_THROW', fn);
  need(same(blocked.body.statements[0], "throw new AgentError('ILLEGAL_TRANSITION', message);")
    && same(unavailable.body.statements[0], "throw new AgentError('RESEARCH_OBJECT_NOT_FOUND', 'Hermes 语音任务不存在或当前不可访问');")
    && same(invalid.body.statements[0], "throw new AgentError('VALIDATION_ERROR', message);"), 'BLOCKER_DOES_NOT_THROW');
  const originalError = one(nodes(agent, node => ts.isImportSpecifier(node) && node.name.text === 'AgentError'), 'BLOCKER_IMPORT_CHANGED');
  for (const use of nodes(voice, node => ts.isIdentifier(node) && node.text === 'AgentError')) need(symbol(use) === symbol(originalError.name), 'BLOCKER_IMPORT_CHANGED', use);
  // Bind guards to their real declarations; textual lookalikes cannot supply
  // the source-false selector or kind predicate.
  for (const file of [...capsules.values(), agent]) for (const call of nodes(file, ts.isCallExpression)) {
    if (ts.isIdentifier(call.expression) && call.expression.text === 'isHermesVoiceTaskKind') need(symbol(call.expression) === kindSymbol, 'KIND_BINDING_CHANGED', call);
    if (ts.isIdentifier(call.expression) && call.expression.text === 'isHermesVoiceWriterEnabled') need(symbol(call.expression) === selectorSymbol, 'SELECTOR_BINDING_CHANGED', call);
  }
  const authoritySymbol = symbol(taskAuthority.name), lock = functionNamed(voice, 'lockExecutionAuthority'), lockSymbol = symbol(lock.name);
  const readerTransactionEntry = fn => {
    const name = fn.name.text;
    const before = name === 'findHermesVoiceSubmission' ? ['const idempotencyKey = requestKey(input.idempotencyKey);'] : [];
    const after = new Map([
      ['resumeHermesVoiceTask', ['await dispatchCommitted(deps, task);', 'return getHermesVoiceTask(deps, input);']],
      ['getHermesVoiceAudio', ['const head = await deps.storage.headObject(audio.objectKey);',
        'if (!head || head.size !== audio.bytes || head.sha256 !== audio.sha256 || head.contentType !== audio.contentType) unavailable();', 'return audio;']],
      ['saveHermesVoiceCheckpoint', ['if (checkpoint.audio) await rememberDiscardedTaskResult(deps.prisma, identity.taskId, { [HERMES_VOICE_RECEIPT_KEY]: checkpoint });', 'return checkpoint;']],
    ]).get(name) ?? [];
    const binding = new Map([['resumeHermesVoiceTask', 'task'], ['getHermesVoiceAudio', 'audio'], ['saveHermesVoiceCheckpoint', 'checkpoint']]).get(name);
    const statements = fn.body.statements;
    need(statements.length === before.length + 1 + after.length
      && before.every((expected, index) => same(statements[index], expected))
      && after.every((expected, index) => same(statements[before.length + 1 + index], expected)), 'READER_ENTRY_EFFECT_UNKNOWN', fn);
    const entry = statements[before.length];
    let call;
    if (binding) {
      need(ts.isVariableStatement(entry) && entry.declarationList.flags & ts.NodeFlags.Const
        && entry.declarationList.declarations.length === 1, 'READER_ENTRY_EFFECT_UNKNOWN', entry);
      const declaration = entry.declarationList.declarations[0];
      need(ts.isIdentifier(declaration.name) && declaration.name.text === binding
        && declaration.initializer && ts.isAwaitExpression(declaration.initializer), 'READER_ENTRY_EFFECT_UNKNOWN', entry);
      call = declaration.initializer.expression;
    } else {
      need(ts.isReturnStatement(entry), 'READER_ENTRY_EFFECT_UNKNOWN', entry); call = entry.expression;
    }
    need(call && ts.isCallExpression(call) && same(call.expression, 'deps.prisma.$transaction')
      && call.arguments.length >= 1 && call.arguments.length <= 2
      && (call.arguments.length === 1 || pureInitializer(call.arguments[1])), 'READER_ENTRY_EFFECT_UNKNOWN', entry);
    const arrow = call.arguments[0];
    need(ts.isArrowFunction(arrow) && ts.isBlock(arrow.body) && arrow.parameters.length === 1
      && ts.isIdentifier(arrow.parameters[0].name) && arrow.parameters[0].name.text === 'tx'
      && !arrow.parameters[0].initializer && !arrow.parameters[0].dotDotDotToken, 'READER_TRANSACTION_UNKNOWN', arrow);
    return arrow;
  };
  const transaction = (fn, required) => {
    // Close the entire exported entry, then its direct transaction preamble.
    // A nested authority check cannot justify work outside that transaction.
    const arrow = readerTransactionEntry(fn);
    const calls = nodes(arrow.body, node => ts.isCallExpression(node) && symbol(node.expression) === required);
    need(calls.length === 1, 'READER_AUTHORITY_MISSING', fn);
    for (const call of calls) {
      const top = call.parent; let statement = top;
      while (statement.parent !== arrow.body && statement.parent) statement = statement.parent;
      need(ts.isVariableStatement(statement) && statement.declarationList.declarations.length === 1
        && statement.declarationList.declarations[0].initializer && ts.isAwaitExpression(statement.declarationList.declarations[0].initializer)
        && statement.declarationList.declarations[0].initializer.expression === call, 'READER_AUTHORITY_NOT_DIRECT', statement);
      for (const prior of arrow.body.statements.slice(0, arrow.body.statements.indexOf(statement))) {
        need(same(prior, 'await lockTrashReferences(tx);')
          || same(prior, 'const existing = await tx.agentTask.findUnique({ where: { idempotencyKey } });')
          || same(prior, 'if (!existing) unavailable();'), 'EFFECT_BEFORE_READER_AUTHORITY', prior);
      }
    }
  };
  for (const name of ['getHermesVoiceTask', 'findHermesVoiceSubmission', 'loadHermesVoiceExecution', 'resumeHermesVoiceTask', 'getHermesVoiceAudio'])
    transaction(functionNamed(voice, name), authoritySymbol);
  transaction(functionNamed(voice, 'finalizeHermesVoiceTask'), lockSymbol);
  // lockExecutionAuthority locks only, then resolves the kind-constrained live
  // task before any mutation. Raw SQL is restricted to those SELECT row locks.
  const authorityCalls = nodes(lock, node => ts.isCallExpression(node) && symbol(node.expression) === authoritySymbol);
  need(authorityCalls.length === 2, 'LIVE_AUTHORITY_NOT_RECHECKED');
  const firstAuthority = authorityCalls[0].getStart();
  for (const call of nodes(lock, node => ts.isCallExpression(node) && node.getStart() < firstAuthority))
    need(ts.isIdentifier(call.expression) && call.expression.text === 'lockTrashReferences'
      || ts.isIdentifier(call.expression) && call.expression.text === 'lockLiveResearchObject'
      || ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === 'sort', 'EFFECT_BEFORE_LIVE_AUTHORITY', call);
  const lockQueries = [
    'tx.$queryRaw`SELECT id FROM agent_sessions WHERE id = ${execution.identity.sessionId}::uuid FOR UPDATE`',
    'tx.$queryRaw`SELECT id FROM agent_tasks WHERE id = ${id}::uuid FOR UPDATE`',
    'tx.$queryRaw`SELECT id FROM workspaces WHERE id = ${scope.workspaceId}::uuid FOR SHARE`',
    'tx.$queryRaw`SELECT id FROM memberships WHERE workspace_id = ${scope.workspaceId}::uuid AND user_id = ${execution.identity.userId}::uuid FOR KEY SHARE`',
  ];
  for (const tag of nodes(lock, ts.isTaggedTemplateExpression)) need(lockQueries.some(query => same(tag, query)), 'LOCK_SQL_CHANGED', tag);
  const read = functionNamed(voice, 'readHermesVoiceCheckpoint');
  requireNode(read, '!isHermesVoiceTaskKind(cp.identity.kind)', 'RECEIPT_KIND_UNCONSTRAINED');
  const pureFunctions = [
    ...['readHermesVoiceCheckpoint', 'readPayload', 'validAudio', 'voiceResultEquals', 'validateHermesVoiceRecording', 'requestKey'].map(name => functionNamed(voice, name)),
    ...['isHermesVoiceTaskKind', 'hasHermesVoiceCheckpoint', 'isHermesVoiceStopped', 'projectHermesVoiceResult'].map(name => functionNamed(contract, name)),
    ...voice.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]),
  ];
  const pureCalls = new Set(['record', 'keysAllowed', 'nonempty', 'hash', 'credit', 'blocked', 'invalid', 'readPayload',
    'validAudio', 'hasHermesVoiceCheckpoint', 'isHermesVoiceTaskKind', 'Number', 'String', 'encodeURIComponent']);
  const pureMethods = new Set(['isArray', 'hasOwn', 'keys', 'every', 'includes', 'test', 'isFinite', 'isSafeInteger', 'split',
    'startsWith', 'toLowerCase', 'toString', 'readUInt32LE', 'readUInt16LE', 'byteLength', 'trim']);
  for (const fn of pureFunctions) {
    need(!ts.isFunctionDeclaration(fn) || synchronous(fn), 'READER_VALIDATOR_EFFECT', fn);
    for (const effect of nodes(fn, node => ts.isAwaitExpression(node) || ts.isNewExpression(node)
      || ts.isTaggedTemplateExpression(node) || ts.isDeleteExpression(node)
      || ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
      || ts.isPostfixUnaryExpression(node) || ts.isPrefixUnaryExpression(node) && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)))
      fail('READER_VALIDATOR_EFFECT', effect);
    for (const call of nodes(fn, ts.isCallExpression)) need(ts.isIdentifier(call.expression) && pureCalls.has(call.expression.text)
      || ts.isPropertyAccessExpression(call.expression) && pureMethods.has(call.expression.name.text), 'READER_VALIDATOR_CALL_UNKNOWN', call);
    for (const use of nodes(fn, ts.isIdentifier)) if (['Number', 'String', 'Array', 'Object', 'Buffer', 'encodeURIComponent'].includes(use.text))
      need(!(symbol(use)?.declarations ?? []).some(node => !node.getSourceFile().isDeclarationFile), 'READER_INTRINSIC_SHADOWED', use);
  }
  const publicProjector = functionNamed(contract, 'projectHermesVoiceResult');
  const publicKeys = new Set(['operation', 'canResume', 'uncertain', 'transcript', 'audioReady', 'spokenText']);
  for (const object of nodes(publicProjector, ts.isObjectLiteralExpression)) for (const property of object.properties) {
    if (ts.isSpreadAssignment(property)) {
      let expression = property.expression; while (ts.isParenthesizedExpression(expression)) expression = expression.expression;
      need(ts.isConditionalExpression(expression) || ts.isIdentifier(expression) && expression.text === 'common', 'PRIVATE_READER_PROJECTION_ESCAPE', property);
    }
    else need(!ts.isComputedPropertyName(property.name) && publicKeys.has(property.name.text), 'PRIVATE_READER_PROJECTION_ESCAPE', property);
  }
  for (const returned of nodes(publicProjector, ts.isReturnStatement)) need(ts.isObjectLiteralExpression(returned.expression), 'PRIVATE_READER_PROJECTION_ESCAPE', returned);
  const view = functionNamed(voice, 'voiceView');
  const viewReturn = view.body.statements.at(-1);
  need(ts.isReturnStatement(viewReturn) && ts.isObjectLiteralExpression(viewReturn.expression), 'PRIVATE_READER_VIEW_CHANGED');
  for (const property of viewReturn.expression.properties) {
    if (ts.isSpreadAssignment(property)) need(same(property.expression, 'taskToView(task)'), 'PRIVATE_READER_VIEW_CHANGED');
    else need(['canRetry', 'result', 'error'].includes(property.name.text), 'PRIVATE_READER_VIEW_CHANGED');
  }
  requireNode(view, 'result: projectHermesVoiceResult(task.kind, task.status, checkpoint, isHermesVoiceStopped(task))', 'PRIVATE_READER_VIEW_CHANGED');
  requireNode(view, 'canRetry: false', 'GENERIC_RETRY_REARM');
  const save = functionNamed(voice, 'saveHermesVoiceCheckpoint');
  readerTransactionEntry(save);
  const saveBody = one(nodes(save, node => ts.isArrowFunction(node) && ts.isBlock(node.body)
    && nodes(node.body, item => ts.isVariableDeclaration(item) && item.name.getText() === 'prior').length > 0), 'LATE_RECEIPT_BODY_UNKNOWN').body;
  const prefix = [
    'await lockTrashReferences(tx);',
    'await tx.$queryRaw`SELECT id FROM agent_tasks WHERE id = ${identity.taskId}::uuid FOR UPDATE`;',
    'const task = await tx.agentTask.findUnique({ where: { id: identity.taskId } });',
    'const prior = readHermesVoiceCheckpoint(task?.result);',
    "if (!task || !prior || !isDeepStrictEqual(prior.identity, identity) || task.kind !== identity.kind || task.sessionId !== identity.sessionId || !isDeepStrictEqual(task.payload, prior.request)) blocked('原语音付费请求身份不匹配');",
  ];
  need(prefix.every((expected, index) => same(saveBody.statements[index], expected)), 'LATE_ORIGINAL_IDENTITY_CHANGED');
  const update = one(nodes(save, node => ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === 'updateMany'), 'LATE_RESULT_CAS_UNKNOWN');
  need(same(update.arguments[0], '{ where: { id: task.id, kind: task.kind, sessionId: task.sessionId, result: voiceResultEquals(task.result) }, data: { result: result as unknown as Prisma.InputJsonObject } }'), 'LATE_RESULT_ONLY_CAS_CHANGED');
  for (const returned of nodes(saveBody, ts.isReturnStatement)) {
    if (returned.getStart() > update.end) need(same(returned, 'return next;'), 'LATE_RECEIPT_DISCARDED');
    else need(ts.isIfStatement(returned.parent) && same(returned.parent,
      'if (isDeepStrictEqual(prior, next)) return prior;'), 'LATE_RECEIPT_DISCARDED', returned);
  }
  requireNode(save, "if (task.deletedAt || session?.deletedAt || ro?.deletedAt) { await tx.$executeRaw`SELECT set_config('openscience.trash_mutation', 'on', true)`; }", 'LATE_TRASH_RETENTION_CHANGED');
  requireNode(save, 'if (checkpoint.audio) await rememberDiscardedTaskResult(deps.prisma, identity.taskId, { [HERMES_VOICE_RECEIPT_KEY]: checkpoint });', 'LATE_CLEANUP_CHANGED');
  const finalize = functionNamed(voice, 'finalizeHermesVoiceTask'), resume = functionNamed(voice, 'resumeHermesVoiceTask');
  requireNode(finalize, "if (live.checkpoint?.phase !== 'completed') blocked('语音尚未完成');", 'FINALIZER_RECEIPT_CHANGED');
  requireNode(finalize, "{ where: { id: live.task.id, deletedAt: null, status: 'running', executionAttempt: execution.identity.executionAttempt, result: voiceResultEquals(live.task.result) }, data: { status: 'succeeded', progress: 100, error: null } }", 'FINALIZER_RESULT_RETENTION_CHANGED');
  requireNode(resume, "if (isHermesVoiceStopped(live.task) || !cp?.providerId || !['submitted', 'completed'].includes(cp.phase)) blocked('只有已保存供应商任务的暂停语音可以恢复');", 'UNKNOWN_OR_STOPPED_REARM');
  requireNode(resume, "{ where: { id: live.task.id, status: 'failed', deletedAt: null, error: live.task.error, executionAttempt: live.task.executionAttempt, result: voiceResultEquals(live.task.result) }, data: { status: 'pending', error: null, dispatchedAt: null } }", 'RESUME_RECEIPT_CHANGED');
  const gatedRoots = new Set(['submitHermesVoiceTranscription', 'submitHermesVoiceReply', 'withHermesVoiceSubmission']);
  const freshHelpers = new Set(['submissionTransaction', 'storeRecording', 'prepareSubmission']);
  const owner = node => { for (let value = node.parent; value; value = value.parent)
    if (ts.isFunctionDeclaration(value) && value.name) return value.name.text; return undefined; };
  const domainMethods = new Set([...pureMethods, '$transaction', 'findUnique', 'updateMany', 'some', 'sort', 'headObject', 'putObject', 'deleteObject', 'catch', 'timeout']);
  const domainCalls = new Set([...pureCalls, ...voice.statements.filter(ts.isFunctionDeclaration).map(node => node.name?.text),
    'isDeepStrictEqual', 'sha256HexBuffer', 'lockLiveResearchObject', 'lockTrashReferences', 'rememberDiscardedTaskResult',
    'requireActiveMembership', 'recordAudit', 'isOwnedPrismaIdempotencyConflict', 'dispatchAgentTask', 'persistHermesVoiceTaskInTransaction',
    'taskToView', 'isHermesVoiceStopped', 'isHermesVoiceWriterEnabled', 'projectHermesVoiceResult', 'create']);
  for (const call of nodes(voice, ts.isCallExpression)) {
    const scope = owner(call);
    if (ts.isIdentifier(call.expression)) {
      need(domainCalls.has(call.expression.text), 'DOMAIN_EFFECT_UNKNOWN', call);
      if (freshHelpers.has(call.expression.text) || call.expression.text === 'create')
        need(gatedRoots.has(scope) || freshHelpers.has(scope), 'READER_REACHES_FRESH_CAPABILITY', call);
      if (call.expression.text === 'dispatchAgentTask') {
        let guard = call.parent; while (guard && !ts.isIfStatement(guard)) guard = guard.parent;
        need(scope === 'dispatchCommitted' && same(call, 'dispatchAgentTask(deps, task.id)')
          && guard && same(guard.expression, "task.status === 'pending'"), 'READER_DISPATCH_CONTEXT_UNKNOWN', call);
      }
    } else need(ts.isPropertyAccessExpression(call.expression) && domainMethods.has(call.expression.name.text), 'DOMAIN_EFFECT_UNKNOWN', call);
    if (ts.isPropertyAccessExpression(call.expression) && ['putObject', 'deleteObject'].includes(call.expression.name.text))
      need(gatedRoots.has(scope) || freshHelpers.has(scope), 'READER_REACHES_FRESH_STORAGE', call);
    if (ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === 'updateMany')
      need(['prepareSubmission', 'saveHermesVoiceCheckpoint', 'finalizeHermesVoiceTask', 'resumeHermesVoiceTask'].includes(scope), 'READER_WRITE_CONTEXT_UNKNOWN', call);
  }
  for (const name of ['saveHermesVoiceCheckpoint', 'finalizeHermesVoiceTask', 'resumeHermesVoiceTask'])
    need(nodes(functionNamed(voice, name), node => ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'updateMany').length === 1, 'READER_WRITE_CONTEXT_UNKNOWN');
  const equals = functionNamed(voice, 'voiceResultEquals');
  need(equals.body.statements.length === 1 && same(equals.body.statements[0], 'return { equals: result == null ? Prisma.AnyNull : result as Prisma.InputJsonValue };'), 'ABSENT_RESULT_CAS_CHANGED');
  // Projection and generic retry protections are reader capabilities, even
  // though their new-kind arms disappear from the old-domain normalization.
  const projection = functionNamed(agent, 'projectAgentTaskResult');
  need(same(projection.body.statements[0], 'if (isHermesVoiceTaskKind(kind)) return null;'), 'PRIVATE_RESULT_LEAK');
  requireNode(functionNamed(agent, 'taskToView'), '!isHermesVoiceTaskKind(task.kind) && canRetry', 'GENERIC_RETRY_REARM');
  const worker = capsules.get('apps/agent-worker/src/voice.ts');
  const handlers = functionNamed(worker, 'createHermesVoiceHandlers');
  need(handlers.body.statements.length === 3 && ts.isVariableStatement(handlers.body.statements[0])
    && ts.isVariableStatement(handlers.body.statements[1]), 'WORKER_FACTORY_EAGER_EFFECT');
  need(same(handlers.body.statements[0], 'const wait = options.wait ?? (async milliseconds => new Promise<void>(resolve => setTimeout(resolve, milliseconds)));'), 'WORKER_FACTORY_EAGER_EFFECT');
  const handle = handlers.body.statements[1].declarationList.declarations[0]?.initializer;
  need(handle && ts.isArrowFunction(handle) && ts.isBlock(handle.body), 'WORKER_HANDLE_UNKNOWN');
  const workerPrefix = [
    "if (!workerDeps.storage) throw new Error('[blocked] VOICE_STORAGE_UNAVAILABLE');",
    'const deps: HermesVoiceDeps = { ...workerDeps, storage: workerDeps.storage, voicePresets: [] };',
    'const execution = await loadHermesVoiceExecution(deps, { taskId: task.id, executionAttempt: task.executionAttempt });',
    'let checkpoint = execution.checkpoint;',
  ];
  need(workerPrefix.every((expected, index) => same(handle.body.statements[index], expected)), 'WORKER_EFFECT_BEFORE_AUTHORITY');
  const fresh = one(nodes(handlers, node => ts.isIfStatement(node) && same(node.expression, '!checkpoint')), 'FRESH_WORKER_BRANCH_UNKNOWN');
  const guard = one(nodes(handlers, node => ts.isIfStatement(node) && same(node.expression, '!checkpoint && !isHermesVoiceWriterEnabled()')), 'FRESH_WORKER_PUBLICATION_OPEN');
  need(same(guard, 'if (!checkpoint && !isHermesVoiceWriterEnabled()) throw new Error(HERMES_VOICE_READER_ONLY);')
    && guard.parent === fresh.parent && guard.end < fresh.getStart(), 'FRESH_WORKER_PUBLICATION_OPEN');
  requireNode(worker, 'const originalIdentity = checkpoint.identity;', 'LATE_WORKER_IDENTITY_CHANGED');
  requireNode(worker, 'await rememberDiscardedTaskResult(deps.prisma, originalIdentity.taskId, { hermesVoice: { audio: storedAudio } });', 'LATE_WORKER_CLEANUP_CHANGED');
  requireNode(worker, "if (checkpoint?.phase === 'submitting') throw new Error('[blocked] VOICE_SUBMISSION_UNCERTAIN');", 'UNKNOWN_CAN_REPOST');
  requireNode(worker, "if (!checkpoint.providerId) throw new Error('[blocked] VOICE_SUBMISSION_UNCERTAIN');", 'SAVED_ID_REQUIRED');
  const ancestor = (node, parent) => { for (let value = node; value; value = value.parent) if (value === parent) return true; return false; };
  for (const call of nodes(worker, ts.isCallExpression)) {
    need(!ts.isElementAccessExpression(call.expression), 'DYNAMIC_WORKER_CAPABILITY', call);
    if (ts.isIdentifier(call.expression)) need(['validateHermesVoiceWav', 'loadHermesVoiceExecution', 'finalizeHermesVoiceTask',
      'isHermesVoiceWriterEnabled', 'withHermesVoiceSubmission', 'saveHermesVoiceCheckpoint', 'rememberDiscardedTaskResult',
      'sha256HexBuffer', 'recording', 'wait', 'setTimeout', 'resolve'].includes(call.expression.text), 'WORKER_EFFECT_UNKNOWN', call);
    else if (ts.isPropertyAccessExpression(call.expression)) need(['getObject', 'destroy', 'isBuffer', 'from', 'push', 'concat',
      'listPresets', 'some', 'createTranscription', 'create', 'queryTranscription', 'query', 'putObject'].includes(call.expression.name.text), 'WORKER_EFFECT_UNKNOWN', call);
    else need(same(call.expression, '(options.downloadAudio ?? downloadSynclipAudio)'), 'WORKER_EFFECT_UNKNOWN', call);
    if (ts.isPropertyAccessExpression(call.expression) && ['create', 'createTranscription'].includes(call.expression.name.text)) {
      need(ancestor(call, fresh.thenStatement) && nodes(fresh, value => ts.isCallExpression(value)
        && ts.isIdentifier(value.expression) && value.expression.text === 'withHermesVoiceSubmission'
        && value.arguments[2] && ancestor(call, value.arguments[2])).length === 1, 'FIRST_POST_OUTSIDE_ADMISSION', call);
    }
    if (ts.isPropertyAccessExpression(call.expression) && ['query', 'queryTranscription'].includes(call.expression.name.text))
      need(call.arguments.length === 1 && same(call.arguments[0], 'checkpoint.providerId'), 'QUERY_ID_CHANGED', call);
    if (ts.isIdentifier(call.expression) && call.expression.text === 'saveHermesVoiceCheckpoint')
      need(call.arguments.length === 3 && same(call.arguments[1], 'originalIdentity'), 'LATE_WORKER_IDENTITY_CHANGED', call);
    if (ts.isIdentifier(call.expression) && call.expression.text === 'recording') need(ancestor(call, fresh.thenStatement), 'READER_REACHES_FRESH_STORAGE');
  }
  const returns = handlers.body.statements.at(-1);
  need(same(returns, "return { 'voice.transcribe': handle, 'voice.reply': handle };"), 'WORKER_ROUTES_NOT_DISJOINT');
  // Runtime factory may read the existing secret and construct the old client;
  // it must never submit/poll eagerly at boot. Deferred preset GET is confined
  // to the returned listPresets method and exact old client initialization.
  const gateway = capsules.get('packages/ai-gateway/src/synclip-voice.ts');
  const factory = functionNamed(gateway, 'createConfiguredSynclipVoiceRuntime');
  const externalBinding = (name, specifier) => {
    const declaration = one(gateway.statements.filter(node => ts.isImportDeclaration(node) && node.moduleSpecifier.text === specifier), 'FACTORY_IMPORT_CHANGED');
    const bindings = declaration.importClause?.namedBindings;
    need(bindings && ts.isNamedImports(bindings), 'FACTORY_IMPORT_CHANGED');
    const binding = one(bindings.elements.filter(node => node.name.text === name && !node.propertyName && !node.isTypeOnly), 'FACTORY_IMPORT_CHANGED');
    return checker.getSymbolAtLocation(binding.name);
  };
  const fileReader = externalBinding('readFile', 'node:fs/promises'), absolutePath = externalBinding('isAbsolute', 'node:path');
  for (const call of nodes(factory, node => ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
    && ['create', 'createTranscription', 'query', 'queryTranscription'].includes(node.expression.name.text))) fail('EAGER_PROVIDER_CAPABILITY', call);
  const constructors = nodes(factory, ts.isNewExpression);
  need(constructors.every(node => ts.isIdentifier(node.expression) && ['Error', 'SynclipAudioClient'].includes(node.expression.text))
    && constructors.filter(node => node.expression.text === 'SynclipAudioClient').length === 1, 'FACTORY_CONSTRUCTOR_UNKNOWN');
  need(constructors.filter(node => node.expression.text === 'SynclipAudioClient').every(node => same(node,
    'new SynclipAudioClient({ apiKey: key, fetch: options.fetch, timeoutMs: 12_000 })')), 'FACTORY_CONSTRUCTOR_UNKNOWN');
  for (const constructor of constructors) if (constructor.expression.text === 'Error')
    need(!(symbol(constructor.expression)?.declarations ?? []).some(node => !node.getSourceFile().isDeclarationFile), 'FACTORY_CONSTRUCTOR_UNKNOWN');
  const localAssignments = new Set(['key', 'cached', 'loading'].map(name => one(nodes(factory, node => ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name) && node.name.text === name), 'FACTORY_LOCAL_STATE_CHANGED')).map(node => symbol(node.name)));
  for (const assignment of nodes(factory, node => ts.isBinaryExpression(node)
    && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment))
    need(ts.isIdentifier(assignment.left) && localAssignments.has(symbol(assignment.left)), 'FACTORY_EXTERNAL_MUTATION', assignment);
  need(nodes(factory, node => ts.isDeleteExpression(node) || ts.isPostfixUnaryExpression(node)
    || ts.isPrefixUnaryExpression(node) && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)).length === 0, 'FACTORY_EXTERNAL_MUTATION');
  for (const call of nodes(factory, ts.isCallExpression)) {
    if (ts.isPropertyAccessExpression(call.expression)) {
      need(['trim', 'includes', 'listVoices', 'map', 'filter'].includes(call.expression.name.text), 'FACTORY_EFFECT_UNKNOWN', call);
    } else if (ts.isIdentifier(call.expression)) {
      need(['isAbsolute', 'readFile', 'now'].includes(call.expression.text), 'FACTORY_EFFECT_UNKNOWN', call);
      if (call.expression.text === 'readFile') need(checker.getSymbolAtLocation(call.expression) === fileReader, 'FACTORY_IMPORT_CHANGED');
      if (call.expression.text === 'isAbsolute') need(checker.getSymbolAtLocation(call.expression) === absolutePath, 'FACTORY_IMPORT_CHANGED');
    }
    else {
      const expression = ts.isParenthesizedExpression(call.expression) ? call.expression.expression : call.expression;
      let method = call.parent; while (method && !ts.isMethodDeclaration(method)) method = method.parent;
      need(same(call.expression, "(options.readKey ?? (async value => readFile(value, 'utf8')))" )
        || ts.isArrowFunction(expression) && expression.parameters.length === 0 && call.arguments.length === 0
          && method?.name.getText() === 'listPresets', 'FACTORY_EFFECT_UNKNOWN', call);
    }
  }
  const projected = new Map();
  const printTransform = (file, transform) => {
    const result = ts.transform(file, [transformation => node => ts.visitNode(node, function visit(value) {
      const replacement = transform(value); if (replacement !== value) return replacement && ts.visitNode(replacement, visit);
      return ts.visitEachChild(value, visit, transformation);
    })]);
    try { return ts.createPrinter({ removeComments: true }).printFile(result.transformed[0]); } finally { result.dispose(); }
  };
  const add = (file, transformed) => projected.set(relative(root, file.fileName).replaceAll('\\', '/'), { source: file, text: transformed });
  const importsCapsule = node => {
    if (!(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) || !node.moduleSpecifier) return false;
    if (program.getSourceFile(node.getSourceFile().fileName) !== node.getSourceFile()) return false;
    const target = symbol(node.moduleSpecifier)?.declarations?.find(ts.isSourceFile);
    return target && [...capsules.values()].includes(target);
  };
  const enclosing = node => { for (let item = node.parent; item; item = item.parent)
    if (ts.isFunctionDeclaration(item) && item.name) return item.name.text; return undefined; };
  const oldKindArguments = new Map([
    ['evaluateAgentTaskRetryEligibility', 'task.kind'], ['persistAgentTaskCoreInTransaction', 'input.kind'],
    ['persistAgentTaskInTransaction', 'input.kind'], ['prepareAgentTaskForCrashRecovery', 'task.kind'],
    ['markTaskProgressOnce', 'current.kind'], ['projectAgentTaskResult', 'kind'], ['taskToView', 'task.kind'],
  ]);
  const impliesVoice = expression => ts.isCallExpression(expression) && symbol(expression.expression) === kindSymbol
    || ts.isParenthesizedExpression(expression) && impliesVoice(expression.expression)
    || ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
      && (impliesVoice(expression.left) || impliesVoice(expression.right));
  const isolatedVoiceArm = node => {
    for (let value = node; value?.parent; value = value.parent) {
      const parent = value.parent;
      if (ts.isFunctionDeclaration(parent) && parent.name?.text === 'persistHermesVoiceTaskInTransaction') return true;
      if (ts.isIfStatement(parent) && value === parent.thenStatement && impliesVoice(parent.expression)) return true;
      if (ts.isConditionalExpression(parent) && value === parent.whenTrue && impliesVoice(parent.condition)) return true;
    }
    return false;
  };
  const importedCapsuleSymbols = new Set();
  for (const statement of agent.statements) if (ts.isImportDeclaration(statement) && importsCapsule(statement)
    && statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings))
    for (const item of statement.importClause.namedBindings.elements) if (!item.isTypeOnly) importedCapsuleSymbols.add(symbol(item.name));
  for (const use of nodes(agent, ts.isIdentifier)) if (importedCapsuleSymbols.has(symbol(use))
    && !ts.isImportSpecifier(use.parent)) {
    const predicate = ts.isCallExpression(use.parent) && use.parent.expression === use && symbol(use) === kindSymbol;
    need(predicate || isolatedVoiceArm(use), 'LEGACY_CAPSULE_CALLER_ESCAPE', use);
  }
  const boolean = node => node?.kind === ts.SyntaxKind.TrueKeyword ? true : node?.kind === ts.SyntaxKind.FalseKeyword ? false : undefined;
  const booleanContext = node => {
    let value = ts.getOriginalNode(node);
    while (value.parent && (ts.isParenthesizedExpression(value.parent)
      || ts.isBinaryExpression(value.parent) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken].includes(value.parent.operatorToken.kind))) value = value.parent;
    return ts.isIfStatement(value.parent) && value.parent.expression === value
      || ts.isConditionalExpression(value.parent) && value.parent.condition === value
      || ts.isPrefixUnaryExpression(value.parent) && value.parent.operator === ts.SyntaxKind.ExclamationToken;
  };
  const discardableRead = node => {
    if (boolean(node) !== undefined || ts.isLiteralExpression(node) || node.kind === ts.SyntaxKind.NullKeyword) return true;
    const original = ts.getOriginalNode(node);
    if (!ts.isIdentifier(original) || original.getSourceFile() !== agent) return false;
    const declaration = symbol(original)?.valueDeclaration;
    if (declaration && ts.isParameter(declaration) && ts.isIdentifier(declaration.name)) return true;
    if (!declaration || !ts.isVariableDeclaration(declaration) || !declaration.initializer
      || !ts.isVariableDeclarationList(declaration.parent) || !(declaration.parent.flags & ts.NodeFlags.Const)) return false;
    const statement = declaration.parent.parent, block = statement.parent;
    if (!ts.isVariableStatement(statement) || !ts.isBlock(block)) return false;
    let use = original;
    while (use.parent !== block) { if (!use.parent || ts.isFunctionLike(use)) return false; use = use.parent; }
    return block.statements.indexOf(statement) < block.statements.indexOf(use);
  };
  const simplify = node => {
    if (importsCapsule(node)) return undefined;
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'persistHermesVoiceTaskInTransaction') return undefined;
    const original = ts.getOriginalNode(node);
    if (ts.isCallExpression(node) && original.getSourceFile() === agent && symbol(original.expression) === kindSymbol) {
      need(original.arguments.length === 1 && original.arguments[0].getText() === oldKindArguments.get(enclosing(original)), 'OLD_KIND_BRANCH_UNKNOWN', original);
      return ts.factory.createFalse();
    }
    if (ts.isArrayLiteralExpression(node) && node.elements.some(value => ts.isStringLiteral(value) && value.text.startsWith('voice.'))) {
      const owner = enclosing(node);
      let declaration = node.parent; while (declaration && (ts.isAsExpression(declaration) || ts.isParenthesizedExpression(declaration))) declaration = declaration.parent;
      need(owner === 'recoverUndispatchedAgentTasks' || ts.isVariableDeclaration(declaration)
        && declaration.name.getText() === 'AGENT_TASK_KINDS', 'OLD_KIND_ARRAY_UNKNOWN', node);
      return ts.factory.updateArrayLiteralExpression(node, node.elements.filter(value => !ts.isStringLiteral(value) || !['voice.transcribe', 'voice.reply'].includes(value.text)));
    }
    if (ts.isParenthesizedExpression(node) && boolean(node.expression) !== undefined) return node.expression;
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken && boolean(node.operand) !== undefined)
      return boolean(node.operand) ? ts.factory.createFalse() : ts.factory.createTrue();
    if (ts.isBinaryExpression(node)) {
      const a = boolean(node.left), b = boolean(node.right);
      if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
        if (a === false) return ts.factory.createFalse(); if (a === true) return node.right;
        if (booleanContext(node) && b === false) { need(discardableRead(node.left), 'DISCARDED_OPERAND_EFFECT_UNKNOWN', original); return ts.factory.createFalse(); }
        if (booleanContext(node) && b === true) return node.left;
      }
      if (node.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
        if (a === true) return ts.factory.createTrue(); if (a === false) return node.right;
        if (booleanContext(node) && b === true) { need(discardableRead(node.left), 'DISCARDED_OPERAND_EFFECT_UNKNOWN', original); return ts.factory.createTrue(); }
        if (booleanContext(node) && b === false) return node.left;
      }
    }
    if (ts.isIfStatement(node) && boolean(node.expression) !== undefined) return boolean(node.expression) ? node.thenStatement : node.elseStatement;
    if (ts.isConditionalExpression(node) && boolean(node.condition) !== undefined) return boolean(node.condition) ? node.whenTrue : node.whenFalse;
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && ts.isIdentifier(node.initializer)
      && node.name.text === node.initializer.text) return ts.factory.createShorthandPropertyAssignment(node.name);
    return node;
  };
  // Retain original binding/statement identity while simplifying bottom-up.
  // In a Boolean context an evaluated operand may disappear only after its
  // literal or already-initialized lexical read is proven effect-free.
  // Full residual equality below catches any changed legacy arm, query, call,
  // initializer, import, configuration or dependency.
  const agentProjection = ts.transform(agent, [transformation => node => ts.visitNode(node, function visit(value) {
    if (importsCapsule(value) || ts.isFunctionDeclaration(value) && value.name?.text === 'persistHermesVoiceTaskInTransaction') return undefined;
    return simplify(ts.visitEachChild(value, visit, transformation));
  })]);
  try { add(agent, ts.createPrinter({ removeComments: true }).printFile(agentProjection.transformed[0])); }
  finally { agentProjection.dispose(); }
  const index = source('apps/agent-worker/src/index.ts');
  const voiceHandlerSymbol = symbol(handlers.name), runtimeFactorySymbol = symbol(factory.name);
  const runtimeDecl = one(nodes(index, node => ts.isVariableDeclaration(node) && node.name.getText() === 'voiceRuntime'), 'FACTORY_WIRING_UNKNOWN');
  need(contains(runtimeDecl, 'createConfiguredSynclipVoiceRuntime(process.env)'), 'FACTORY_CALL_CHANGED');
  const handlerCalls = nodes(index, node => ts.isCallExpression(node) && symbol(node.expression) === voiceHandlerSymbol);
  need(handlerCalls.length === 1 && ts.isSpreadAssignment(handlerCalls[0].parent)
    && same(handlerCalls[0], 'createHermesVoiceHandlers(options.voiceRuntime)'), 'WORKER_HANDLER_WIRING_CHANGED');
  const runtimeCalls = nodes(index, node => ts.isCallExpression(node) && symbol(node.expression) === runtimeFactorySymbol);
  need(runtimeCalls.length === 1 && enclosing(runtimeCalls[0]) === 'main', 'FACTORY_CALLER_ESCAPE');
  add(index, printTransform(index, node => {
    if (importsCapsule(node)) return undefined;
    if (ts.isImportSpecifier(node) && symbol(node.name) === runtimeFactorySymbol) return undefined;
    if (ts.isSpreadAssignment(node) && node.expression === handlerCalls[0]) return undefined;
    if (ts.isVariableStatement(node) && node.declarationList.declarations.includes(runtimeDecl)) return undefined;
    if (ts.isShorthandPropertyAssignment(node) && node.name.text === 'voiceRuntime') return undefined;
    return node;
  }));
  for (const path of ['packages/domain/src/index.ts', 'packages/ai-gateway/src/index.ts']) {
    const file = source(path); add(file, printTransform(file, node => importsCapsule(node) ? undefined : node));
  }
  const audio = source('packages/ai-gateway/src/synclip-audio-api.ts');
  const audioClass = one(audio.statements.filter(node => ts.isClassDeclaration(node) && node.name?.text === 'SynclipAudioClient'), 'AUDIO_CLIENT_MISSING');
  const request = one(audioClass.members.filter(node => ts.isMethodDeclaration(node) && ts.isPrivateIdentifier(node.name) && node.name.text === '#request'), 'AUDIO_REQUEST_MISSING');
  const mediaType = one(nodes(request, node => ts.isConditionalExpression(node) && same(node.condition, "typeof body === 'string'")), 'LEGACY_STRING_REQUEST_CHANGED');
  need(same(mediaType.whenTrue, "{ 'Content-Type': 'application/json' }") && same(mediaType.whenFalse, '{}'), 'LEGACY_STRING_REQUEST_CHANGED');
  const transcription = one(audioClass.members.filter(node => ts.isMethodDeclaration(node) && node.name.getText() === 'createTranscription'), 'FORMDATA_CONSTRUCTOR_MISSING');
  const query = one(audioClass.members.filter(node => ts.isMethodDeclaration(node) && node.name.getText() === 'queryTranscription'), 'ASR_READER_MISSING');
  requireNode(transcription, "this.#request('POST', '/asr', form)", 'FORMDATA_PATH_CHANGED');
  requireNode(query, "this.#request('GET', '/tasks/' + id)", 'ASR_QUERY_CHANGED');
  need(query.body.statements.length === 2 && same(query.body.statements[0], 'const id = validateSynclipAudioTaskId(taskId);')
    && same(query.body.statements[1], "return transcriptionTask(await this.#request('GET', '/tasks/' + id), id);"), 'ASR_QUERY_CHANGED');
  // Every surviving old #request invocation is compared with the old full
  // class. Its old domain is exactly string | undefined, where these two
  // header discriminators are equivalent; FormData belongs only to fresh ASR.
  add(audio, printTransform(audio, node => {
    if (node === transcription || node === query) return undefined;
    if (ts.isFunctionDeclaration(node) && ['validateHermesVoiceWav', 'transcriptionTask'].includes(node.name?.text)) return undefined;
    if (ts.isVariableStatement(node) && node.declarationList.declarations.some(item => ['HERMES_VOICE_MAX_SECONDS', 'HERMES_VOICE_MAX_WAV_BYTES'].includes(item.name.getText()))) return undefined;
    if (node === mediaType) return ts.factory.createConditionalExpression(
      ts.factory.createBinaryExpression(ts.factory.createIdentifier('body'), ts.SyntaxKind.EqualsEqualsEqualsToken, ts.factory.createIdentifier('undefined')),
      undefined, mediaType.whenFalse, undefined, mediaType.whenTrue);
    return node;
  }));
  // Runtime exports introduced by capsules must be finite entrypoints, and
  // callers in old modules may only be the checked worker bindings above.
  // The pair checks all imports against this captured, side-effect-free graph.
  return { phase, domain: 'rollback-produced-state', projected, capsules, selector, contract,
    outstanding: ['genuine full DEFAULT collector provenance', 'strict residual whole-runtime/dependency equality', 'adjacent deployment history'] };
}

function finiteVoiceWriterSourceModel(ts, left, right, current, previous) {
  const key = 'packages/domain/src/agent/voice-contract.ts';
  const source = left.program.getSourceFile(resolve(left.root, key)), rollback = right.program.getSourceFile(resolve(right.root, key));
  const fail = () => { throw { reason: 'VOICE_WRITER_READER_CONTEXT_CHANGED' }; };
  if (!source || !rollback) fail();
  const select = file => file.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'isHermesVoiceWriterEnabled');
  const x = select(source), y = select(rollback);
  if (x.length !== 1 || y.length !== 1) fail();
  const literal = fn => !fn.asteriskToken && !fn.modifiers?.some(value => value.kind === ts.SyntaxKind.AsyncKeyword)
    && fn.parameters.length === 0 && fn.body?.statements.length === 1 && ts.isReturnStatement(fn.body.statements[0]) ? fn.body.statements[0].expression : undefined;
  if (literal(x[0])?.kind !== ts.SyntaxKind.TrueKeyword || literal(y[0])?.kind !== ts.SyntaxKind.FalseKeyword) fail();
  const a = new Map(current), b = new Map(previous), moduleKey = `module:${key}`;
  if (!a.has(moduleKey) || !b.has(moduleKey)) fail();
  for (const entry of new Set([...a.keys(), ...b.keys()])) if (!a.has(entry) || !b.has(entry)
    || entry !== moduleKey && JSON.stringify(a.get(entry)) !== JSON.stringify(b.get(entry))) fail();
  // Equal readers alone are insufficient: the phase bit must not also select
  // a private projection/recovery implementation or escape as a callback. Bind
  // every runtime use to the actual selector and its finite fresh-only guard.
  const tokenText = value => { const scan = ts.createScanner(ts.ScriptTarget.ES2022, true, ts.LanguageVariant.Standard, value), out = [];
    for (let token = scan.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scan.scan()) out.push([token, scan.getTokenText()]);
    return JSON.stringify(out);
  };
  const same = (node, expected) => node && tokenText(node.getText(node.getSourceFile())) === tokenText(expected);
  for (const [context, selector, entries] of [[left, x[0], a], [right, y[0], b]]) {
    const checker = context.checker ?? context.program.getTypeChecker();
    const symbol = node => { let value = checker.getSymbolAtLocation(node);
      if (value?.flags & ts.SymbolFlags.Alias) value = checker.getAliasedSymbol(value); return value; };
    const selected = symbol(selector.name), uses = [];
    const inspect = node => {
      if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
      if (ts.isIdentifier(node) && node !== selector.name && symbol(node) === selected
        && !ts.isImportSpecifier(node.parent) && !ts.isExportSpecifier(node.parent)) uses.push(node);
      ts.forEachChild(node, inspect);
    };
    for (const [entry] of entries) if (entry.startsWith('module:')) {
      const file = context.program.getSourceFile(resolve(context.root, entry.slice(7)));
      if (file) inspect(file);
    }
    if (uses.length !== 4) fail();
    for (const use of uses) {
      if (!ts.isCallExpression(use.parent) || use.parent.expression !== use || use.parent.arguments.length) fail();
      let owner = use.parent; while (owner && !(ts.isFunctionDeclaration(owner) && owner.name)) owner = owner.parent;
      let guard = use.parent; while (guard && !ts.isIfStatement(guard)) guard = guard.parent;
      const path = relative(context.root, use.getSourceFile().fileName).replaceAll('\\', '/');
      const location = `${path}::${owner?.name.text}`;
      if (location === 'packages/domain/src/agent/voice.ts::requireVoiceWriter') {
        if (owner.body.statements.length !== 1 || guard !== owner.body.statements[0]
          || !same(guard, 'if (!isHermesVoiceWriterEnabled()) blocked(HERMES_VOICE_READER_ONLY);')) fail();
      } else if (location === 'packages/domain/src/agent/agent.ts::persistHermesVoiceTaskInTransaction') {
        if (guard !== owner.body.statements[0] || !same(guard,
          "if (!isHermesVoiceWriterEnabled()) throw new AgentError('ILLEGAL_TRANSITION', HERMES_VOICE_READER_ONLY);")) fail();
      } else if (location === 'packages/domain/src/agent/agent.ts::prepareAgentTaskForCrashRecovery') {
        if (!same(guard, 'if (!receipt && !isHermesVoiceWriterEnabled()) return false;') || !ts.isBlock(guard.parent)
          || !guard.parent.statements.some(node => same(node, 'const receipt = hasHermesVoiceCheckpoint(task.result);'))) fail();
      } else if (location === 'apps/agent-worker/src/voice.ts::createHermesVoiceHandlers') {
        if (!same(guard, 'if (!checkpoint && !isHermesVoiceWriterEnabled()) throw new Error(HERMES_VOICE_READER_ONLY);')
          || !ts.isBlock(guard.parent) || !guard.parent.statements.some(node => same(node, 'let checkpoint = execution.checkpoint;'))) fail();
      } else fail();
    }
  }
  return { phase: 'writer', key, source, rollback,
    text: source.text.slice(0, literal(x[0]).getStart()) + 'false' + source.text.slice(literal(x[0]).end),
    outstanding: ['normalized whole selector-module equality', 'genuine full DEFAULT collector provenance', 'reader is the adjacent deployed rollback'] };
}

function finiteVoiceFormatReaderSourceModel(ts, left, right, current, previous) {
  const fail = (reason, node) => { throw { reason: `VOICE_MP3_${reason}`, node }; };
  const need = (value, reason, node) => { if (!value) fail(reason, node); };
  const nodes = (scope, predicate) => { const result = []; const visit = node => {
    if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
    if (predicate(node)) result.push(node); ts.forEachChild(node, visit);
  }; visit(scope); return result; };
  const one = (values, reason) => { need(values.length === 1, reason); return values[0]; };
  const tokens = text => { const scan = ts.createScanner(ts.ScriptTarget.ES2022, true, ts.LanguageVariant.Standard, text.replace(/\r\n?/gu, '\n')), out = [];
    for (let token = scan.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scan.scan()) out.push([token, scan.getTokenText()]);
    return JSON.stringify(out);
  };
  const same = (node, text) => node && tokens(node.getText(node.getSourceFile())) === tokens(text);
  const symbol = (context, node) => { let value = context.checker.getSymbolAtLocation(node);
    if (value?.flags & ts.SymbolFlags.Alias) value = context.checker.getAliasedSymbol(value); return value; };
  const file = (context, path) => { const value = context.program.getSourceFile(resolve(context.root, path)); need(value, 'SOURCE_MISSING'); return value; };
  const fn = (source, name) => one(source.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name), 'FUNCTION_UNKNOWN');
  const inside = (node, scope) => node.getSourceFile() === scope.getSourceFile() && node.pos >= scope.pos && node.end <= scope.end;
  const edit = (source, changes) => {
    const list = [...changes].sort((a, b) => b.node.getStart() - a.node.getStart()); let end = source.end, text = source.getText();
    for (const change of list) {
      need(change.node.getSourceFile() === source.getSourceFile() && change.node.getStart() >= source.getStart()
        && change.node.end <= end, 'PROJECTION_OVERLAP', change.node);
      text = text.slice(0, change.node.getStart() - source.getStart()) + change.text + text.slice(change.node.end - source.getStart());
      end = change.node.getStart();
    }
    return text;
  };
  const gatewayPath = 'packages/ai-gateway/src/synclip-audio-api.ts', voicePath = 'packages/domain/src/agent/voice.ts';
  const gateway = file(left, gatewayPath), voice = file(left, voicePath);
  const oldGateway = file(right, gatewayPath), oldVoice = file(right, voicePath);
  const a = new Map(current), b = new Map(previous), affected = new Set([`module:${gatewayPath}`, `module:${voicePath}`]);
  for (const key of new Set([...a.keys(), ...b.keys()])) need(a.has(key) && b.has(key)
    && (affected.has(key) || JSON.stringify(a.get(key)) === JSON.stringify(b.get(key))), 'RESIDUAL_ENTRY_CHANGED');
  const canonicalSource = (context, source) => {
    const compiled = ts.transpileModule(source.text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true } });
    const ast = ts.createSourceFile('runtime.js', compiled.outputText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
    need(!ast.parseDiagnostics.length && typeof (context.canonical ?? left.canonical) === 'function', 'SOURCE_ENTRY_UNBOUND');
    return (context.canonical ?? left.canonical)(ast);
  };
  for (const [path, source, old] of [[gatewayPath, gateway, oldGateway], [voicePath, voice, oldVoice]]) {
    need(JSON.stringify(canonicalSource(left, source)) === JSON.stringify(a.get(`module:${path}`))
      && JSON.stringify(canonicalSource(right, old)) === JSON.stringify(b.get(`module:${path}`)), 'SOURCE_ENTRY_UNBOUND');
  }
  const capsules = [fn(gateway, 'validateHermesVoiceAudioBytes'), fn(gateway, 'downloadHermesVoiceAudio')];
  const kernel = fn(gateway, 'downloadAudio'), entry = fn(gateway, 'downloadSynclipAudio'), validator = fn(gateway, 'validateSynclipAudioBytes');
  const capDeclaration = one(gateway.statements.filter(node => ts.isVariableStatement(node)
    && node.declarationList.declarations.some(value => ts.isIdentifier(value.name) && value.name.text === 'hermesVoiceAudioMaxBytes')), 'CAP_UNKNOWN');
  need(capDeclaration.declarationList.flags & ts.NodeFlags.Const && capDeclaration.declarationList.declarations.length === 1
    && same(capDeclaration.declarationList.declarations[0].initializer, '16 * 1024 * 1024'), 'CAP_INITIALIZATION_CHANGED');
  const removable = [...capsules, kernel, capDeclaration];
  const runtimeFiles = context => context.modules ? [...context.modules.values()].filter(source => !source.isDeclarationFile)
    : context.program.getSourceFiles().filter(source => {
      const path = relative(context.root, source.fileName).replaceAll('\\', '/');
      return !source.isDeclarationFile && path && !path.startsWith('../') && !path.startsWith('node_modules/') && !path.includes('/node_modules/');
    });
  const hasExport = (context, module, targets) => {
    const moduleSymbol = context.checker.getSymbolAtLocation(module);
    return moduleSymbol && context.checker.getExportsOfModule(moduleSymbol).some(value => {
      const resolved = value.flags & ts.SymbolFlags.Alias ? context.checker.getAliasedSymbol(value) : value;
      return targets.has(resolved);
    });
  };
  const capsuleSymbols = new Set(capsules.map(value => symbol(left, value.name)));
  const kernelSymbol = symbol(left, kernel.name);
  const constantSymbol = symbol(left, capDeclaration.declarationList.declarations[0].name);
  need(!capsuleSymbols.has(undefined) && constantSymbol, 'BINDING_MISSING');
  const capabilitySpecifiers = new Set(), loaderFactories = new Set(), loaders = new Set();
  for (const source of runtimeFiles(left)) for (const node of nodes(source, () => true)) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier
      && hasExport(left, node.moduleSpecifier, capsuleSymbols)) capabilitySpecifiers.add(node.moduleSpecifier.text);
    if (ts.isImportDeclaration(node) && ['node:module', 'module'].includes(node.moduleSpecifier.text)
      && node.importClause?.namedBindings) {
      need(ts.isNamedImports(node.importClause.namedBindings), 'LOADER_NAMESPACE_UNKNOWN', node);
      for (const imported of node.importClause.namedBindings.elements) if ((imported.propertyName ?? imported.name).text === 'createRequire')
        loaderFactories.add(left.checker.getSymbolAtLocation(imported.name));
    }
  }
  for (const source of runtimeFiles(left)) for (const declaration of nodes(source, ts.isVariableDeclaration)) {
    if (declaration.initializer && ts.isCallExpression(declaration.initializer)
      && loaderFactories.has(left.checker.getSymbolAtLocation(declaration.initializer.expression))) {
      need(ts.isIdentifier(declaration.name), 'LOADER_ESCAPE', declaration);
      loaders.add(left.checker.getSymbolAtLocation(declaration.name));
    }
  }
  // New exported functions may be deferred declarations, never a runtime namespace/dynamic capability.
  for (const source of runtimeFiles(left)) for (const node of nodes(source, () => true)) {
    if (ts.isImportDeclaration(node) && node.importClause?.namedBindings && ts.isNamespaceImport(node.importClause.namedBindings))
      need(!hasExport(left, node.moduleSpecifier, capsuleSymbols), 'NAMESPACE_ESCAPE', node);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
      || ts.isIdentifier(node.expression) && node.expression.text === 'require'
      || loaders.has(left.checker.getSymbolAtLocation(node.expression)))) {
      need(node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]), 'DYNAMIC_MODULE_UNKNOWN', node);
      need(!capabilitySpecifiers.has(node.arguments[0].text) && !hasExport(left, node.arguments[0], capsuleSymbols), 'DYNAMIC_ESCAPE', node);
    }
    if (!ts.isIdentifier(node)) continue;
    const binding = symbol(left, node);
    if (loaderFactories.has(left.checker.getSymbolAtLocation(node)) && !ts.isImportSpecifier(node.parent)) {
      need(ts.isCallExpression(node.parent) && node.parent.expression === node
        && ts.isVariableDeclaration(node.parent.parent) && node.parent.parent.initializer === node.parent
        && ts.isIdentifier(node.parent.parent.name), 'LOADER_FACTORY_ESCAPE', node);
    }
    if (loaders.has(left.checker.getSymbolAtLocation(node)) && !ts.isVariableDeclaration(node.parent))
      need(ts.isCallExpression(node.parent) && node.parent.expression === node, 'LOADER_ESCAPE', node);
    if (binding === kernelSymbol) need(node === kernel.name || inside(node, entry) || capsules.some(scope => inside(node, scope)), 'KERNEL_ESCAPE', node);
    if (!capsuleSymbols.has(binding) && binding !== constantSymbol) continue;
    need(removable.some(scope => inside(node, scope)), 'NEW_CAPABILITY_REFERENCED', node);
  }
  // Bind actual producer and retained-receipt call sites, rather than inferring MP3 from the database or selector.
  for (const context of [left, right]) {
    const contract = file(context, 'packages/domain/src/agent/voice-contract.ts');
    need(same(fn(contract, 'isHermesVoiceWriterEnabled').body, '{ return true; }'), 'PHASE_UNKNOWN');
    const worker = file(context, 'apps/agent-worker/src/voice.ts'), index = file(context, 'apps/agent-worker/src/index.ts');
    const factory = fn(worker, 'createHermesVoiceHandlers'), factorySymbol = symbol(context, factory.name);
    need(factory.parameters.length === 2 && same(factory.parameters[1].initializer, '{}')
      && ts.isIdentifier(factory.parameters[1].name), 'FACTORY_DEFAULT_CHANGED');
    const optionsSymbol = symbol(context, factory.parameters[1].name);
    for (const use of nodes(factory.body, ts.isIdentifier)) if (symbol(context, use) === optionsSymbol) {
      const access = use.parent;
      need(ts.isPropertyAccessExpression(access) && access.expression === use
        && ['wait', 'maxPolls', 'pollIntervalMs', 'downloadAudio'].includes(access.name.text), 'FACTORY_OPTIONS_ESCAPE', use);
      const parent = access.parent;
      need(!(ts.isBinaryExpression(parent) && parent.left === access
        && parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment)
        && !ts.isDeleteExpression(parent) && !ts.isPostfixUnaryExpression(parent)
        && !(ts.isPrefixUnaryExpression(parent) && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(parent.operator)), 'FACTORY_OPTIONS_WRITE', access);
    }
    const save = fn(file(context, voicePath), 'saveHermesVoiceCheckpoint'), saveSymbol = symbol(context, save.name);
    const downloadSymbol = symbol(context, fn(file(context, gatewayPath), 'downloadSynclipAudio').name);
    let factoryCalls = 0, saveCalls = 0;
    for (const source of runtimeFiles(context)) for (const use of nodes(source, ts.isIdentifier)) {
      const selected = symbol(context, use);
      if (selected !== factorySymbol && selected !== saveSymbol) continue;
      if (use === factory.name || use === save.name || ts.isImportSpecifier(use.parent) || ts.isExportSpecifier(use.parent)) continue;
      const call = use.parent; need(ts.isCallExpression(call) && call.expression === use, 'PRODUCER_OR_SAVE_ESCAPE', use);
      if (selected === factorySymbol) {
        need(source === index && same(call, 'createHermesVoiceHandlers(options.voiceRuntime)'), 'DOWNLOAD_INJECTION', call); factoryCalls++;
      } else {
        need(source === worker || source === save.getSourceFile(), 'SAVE_CALLER_CHANGED', call);
        if (source === worker) {
          need(inside(call, factory) && call.arguments.length === 3 && same(call.arguments[1], 'originalIdentity'), 'SAVE_IDENTITY_CHANGED', call);
          const update = call.arguments[2]; need(ts.isObjectLiteralExpression(update), 'SAVE_INPUT_CHANGED', update);
          const phase = one(update.properties.filter(value => ts.isPropertyAssignment(value) && value.name.getText() === 'phase'), 'SAVE_PHASE_CHANGED');
          need(ts.isStringLiteral(phase.initializer) && ['failed', 'completed'].includes(phase.initializer.text), 'SAVE_PHASE_CHANGED', update);
        } else {
          need(same(call, "saveHermesVoiceCheckpoint(deps, prepared.identity, { phase: 'submitted', ...received })"), 'SAVE_INPUT_CHANGED', call);
        }
        saveCalls++;
      }
    }
    need(factoryCalls === 1 && saveCalls === 4, 'PRODUCER_OR_SAVE_INVENTORY_CHANGED');
    const download = one(nodes(factory, ts.isCallExpression).filter(call => same(call,
      '(options.downloadAudio ?? downloadSynclipAudio)(output)')), 'RECOVERY_DOWNLOAD_CHANGED');
    const fallback = download.expression.expression;
    need(ts.isBinaryExpression(fallback) && symbol(context, fallback.right) === downloadSymbol, 'DOWNLOAD_BINDING_CHANGED', download);
    const local = name => {
      const declaration = one(nodes(factory, ts.isVariableDeclaration).filter(node => ts.isIdentifier(node.name) && node.name.text === name), 'MP3_BINDING_CHANGED');
      need(ts.isVariableDeclarationList(declaration.parent) && declaration.parent.flags & ts.NodeFlags.Const
        && declaration.parent.declarations.length === 1, 'MP3_BINDING_CHANGED', declaration);
      need(symbol(context, declaration.name), 'MP3_BINDING_CHANGED', declaration);
      return declaration;
    };
    const audioBytes = local('audio'), digest = local('sha256'), key = local('objectKey'), stored = local('storedAudio');
    need(audioBytes.initializer === download.parent && ts.isAwaitExpression(download.parent)
      && same(digest.initializer, 'sha256HexBuffer(audio.bytes)')
      && symbol(context, digest.initializer.expression) === symbol(context, fn(file(context, 'packages/storage/src/checksum.ts'), 'sha256HexBuffer').name)
      && same(key.initializer, '`derived/hermes-voice/${originalIdentity.userId}/${originalIdentity.taskId}/${sha256}.mp3`')
      && same(stored.initializer, "{ objectKey, sha256, bytes: audio.bytes.length, contentType: 'audio/mpeg' as const }"), 'MP3_RECEIPT_CHANGED');
    const sizeGuard = one(nodes(factory, ts.isIfStatement).filter(node => same(node,
      "if (audio.bytes.length > 20 * 1024 * 1024) throw new Error('[blocked] VOICE_AUDIO_TOO_LARGE');")), 'MP3_SIZE_GUARD_CHANGED');
    const put = one(nodes(factory, ts.isCallExpression).filter(node => ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'putObject'), 'MP3_STORAGE_CHANGED');
    need(same(put, "deps.storage.putObject(objectKey, audio.bytes, { contentType: 'audio/mpeg', sha256 })")
      && ts.isAwaitExpression(put.parent) && ts.isExpressionStatement(put.parent.parent), 'MP3_STORAGE_CHANGED', put);
    const audioSave = one(nodes(factory, ts.isCallExpression).filter(call => symbol(context, call.expression) === saveSymbol
      && same(call.arguments[2], "{ phase: 'completed', ...(output.coins_used === undefined ? {} : { credits: output.coins_used }), audio: storedAudio }")), 'MP3_SAVE_CHANGED');
    const discarded = one(nodes(factory, ts.isCallExpression).filter(call => same(call,
      'rememberDiscardedTaskResult(deps.prisma, originalIdentity.taskId, { hermesVoice: { audio: storedAudio } })')), 'MP3_DISCARD_CHANGED');
    // The saved object is an immutable local construction, not merely near an MP3 put.
    // Bind every value use, including shorthand properties, to its actual declaration.
    const localSymbol = node => ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node
      ? context.checker.getShorthandAssignmentValueSymbol(node.parent) : symbol(context, node);
    const allowed = new Map([
      [symbol(context, audioBytes.name), [audioBytes.name, sizeGuard.expression.left.expression.expression,
        digest.initializer.arguments[0].expression, put.arguments[1].expression,
        stored.initializer.properties[2].initializer.expression.expression]],
      [symbol(context, digest.name), [digest.name, key.initializer.templateSpans[2].expression,
        put.arguments[2].properties[1].name, stored.initializer.properties[1].name]],
      [symbol(context, key.name), [key.name, put.arguments[0], stored.initializer.properties[0].name]],
      [symbol(context, stored.name), [stored.name, audioSave.arguments[2].properties[2].initializer,
        discarded.arguments[2].properties[0].initializer.properties[0].initializer]],
    ]);
    // Check both directions: a same-spelled nested parameter must not replace
    // one of these expected value nodes while the outer const stays unused.
    for (const [binding, references] of allowed) for (const reference of references)
      need(ts.isIdentifier(reference) && localSymbol(reference) === binding, 'LOCAL_BINDING_CHANGED', reference);
    for (const use of nodes(factory, ts.isIdentifier)) {
      const references = allowed.get(localSymbol(use));
      if (references) need(references.includes(use), 'MP3_LOCAL_ESCAPE_OR_WRITE', use);
    }
    const block = audioBytes.parent.parent.parent;
    need(ts.isBlock(block) && [digest, key, stored].every(node => node.parent.parent.parent === block)
      && put.parent.parent.parent === block && sizeGuard.parent === block
      && audioBytes.end < sizeGuard.pos && sizeGuard.end < digest.pos && digest.end < key.pos
      && key.end < put.pos && put.end < stored.pos && stored.end < audioSave.pos, 'MP3_STORAGE_ORDER_CHANGED');
    // No second storage access, alias, computed write, or unclassified dependency escape.
    const depsDeclaration = local('deps'), depsSymbol = symbol(context, depsDeclaration.name);
    need(same(depsDeclaration.initializer, '{ ...workerDeps, storage: workerDeps.storage, voicePresets: [] }'), 'MP3_DEPENDENCY_CHANGED');
    need(symbol(context, put.expression.expression.expression) === depsSymbol
      && symbol(context, audioSave.arguments[0]) === depsSymbol
      && symbol(context, discarded.arguments[0].expression) === depsSymbol, 'MP3_DEPENDENCY_BINDING_CHANGED');
    const handler = local('handle').initializer;
    need(ts.isArrowFunction(handler) && handler.parameters.length === 2 && ts.isIdentifier(handler.parameters[0].name), 'MP3_HANDLER_CHANGED');
    const workerDepsSymbol = symbol(context, handler.parameters[0].name);
    const storageGuard = one(nodes(handler.body, ts.isIfStatement).filter(node => same(node,
      "if (!workerDeps.storage) throw new Error('[blocked] VOICE_STORAGE_UNAVAILABLE');")), 'MP3_STORAGE_GUARD_CHANGED');
    for (const use of nodes(handler.body, ts.isIdentifier)) if (symbol(context, use) === workerDepsSymbol)
      need(inside(use, storageGuard) || inside(use, depsDeclaration.initializer), 'MP3_STORAGE_ESCAPE', use);
    const depsCalls = new Set(['loadHermesVoiceExecution', 'finalizeHermesVoiceTask', 'recording', 'withHermesVoiceSubmission', 'saveHermesVoiceCheckpoint']);
    for (const use of nodes(factory, ts.isIdentifier)) if (symbol(context, use) === depsSymbol && use !== depsDeclaration.name) {
      const parent = use.parent;
      if (ts.isCallExpression(parent) && parent.arguments[0] === use && ts.isIdentifier(parent.expression)) {
        need(depsCalls.has(parent.expression.text)
          && (parent.expression.text === 'recording' ? symbol(context, parent.expression) === symbol(context, fn(worker, 'recording').name)
            : symbol(context, parent.expression)?.declarations?.some(node => relative(context.root, node.getSourceFile().fileName).replaceAll('\\', '/').startsWith('packages/domain/src/'))),
        'MP3_DEPENDENCY_ESCAPE', use);
      } else need(ts.isPropertyAccessExpression(parent) && parent.expression === use
        && (parent.name.text === 'storage' && parent === put.expression.expression
          || parent.name.text === 'prisma' && parent === discarded.arguments[0]
          || parent.name.text === 'voicePresets'), 'MP3_DEPENDENCY_ESCAPE', use);
    }
  }
  // The unprojected worker, receipt/CAS, commercial call sites, imports and configuration must remain exact.
  const literalCall = entry.body?.statements;
  need(literalCall?.length === 1 && ts.isReturnStatement(literalCall[0]) && ts.isCallExpression(literalCall[0].expression), 'DEFAULT_WRAPPER_CHANGED');
  const invoke = literalCall[0].expression;
  need(symbol(left, invoke.expression) === symbol(left, kernel.name) && invoke.arguments.length === 3
    && invoke.arguments.slice(0, 2).every((arg, i) => symbol(left, arg) === symbol(left, entry.parameters[i].name)), 'DEFAULT_BINDING_CHANGED');
  const config = invoke.arguments[2];
  need(same(config, "{ maxBytes: SYNCLIP_AUDIO_MAX_DOWNLOAD_BYTES, accept: 'audio/mpeg,application/octet-stream', types: ['audio/mpeg', 'application/octet-stream'], decode: bytes => validateSynclipAudioBytes(bytes) }"), 'DEFAULT_CONFIG_CHANGED', config);
  const decode = config.properties.find(value => value.name.getText() === 'decode').initializer;
  need(ts.isArrowFunction(decode) && ts.isCallExpression(decode.body)
    && symbol(left, decode.body.expression) === symbol(left, validator.name)
    && symbol(left, decode.body.arguments[0]) === symbol(left, decode.parameters[0].name), 'DEFAULT_DECODER_CHANGED');
  need(kernel.parameters.length === 3 && kernel.parameters.every((parameter, i) => ts.isIdentifier(parameter.name)
    && !parameter.initializer && !parameter.dotDotDotToken && (i === 2 || parameter.name.text === entry.parameters[i].name.getText()))
    && !kernel.asteriskToken && kernel.modifiers?.some(value => value.kind === ts.SyntaxKind.AsyncKeyword)
    && !kernel.modifiers.some(value => value.kind === ts.SyntaxKind.ExportKeyword), 'KERNEL_SIGNATURE_CHANGED');
  const formatSymbol = symbol(left, kernel.parameters[2].name), bodyEdits = [];
  for (const use of nodes(kernel.body, ts.isIdentifier)) if (symbol(left, use) === formatSymbol) {
    const member = use.parent; need(ts.isPropertyAccessExpression(member) && member.expression === use, 'FORMAT_ESCAPE', use);
    const name = member.name.text;
    if (name === 'decode') {
      const call = member.parent;
      need(ts.isCallExpression(call) && call.expression === member && call.arguments.length === 2
        && same(call.arguments[0], 'Buffer.concat(chunks, size)')
        && ts.isIdentifier(call.arguments[1]) && call.arguments[1].text === 'contentType', 'DECODER_EFFECT_CHANGED', call);
      const mimeUse = one(nodes(call.arguments[1], ts.isIdentifier).filter(node => node.text === 'contentType'), 'MIME_BINDING_CHANGED');
      const mimeDeclaration = symbol(left, mimeUse)?.valueDeclaration;
      need(mimeDeclaration && ts.isVariableDeclaration(mimeDeclaration) && mimeDeclaration.parent.flags & ts.NodeFlags.Const
        && same(mimeDeclaration.initializer, "response.headers['content-type']"), 'MIME_BINDING_CHANGED', mimeUse);
      // Only an immutable lexical primitive read is unused by this exact one-argument
      // decoder. No method evaluation or global intrinsic purity is assumed.
      bodyEdits.push({ node: call, text: `validateSynclipAudioBytes(${call.arguments[0].getText()})` });
    } else {
      const replacement = new Map([['maxBytes', 'SYNCLIP_AUDIO_MAX_DOWNLOAD_BYTES'], ['accept', "'audio/mpeg,application/octet-stream'"], ['types', "['audio/mpeg', 'application/octet-stream']"]]).get(name);
      need(replacement, 'FORMAT_MEMBER_CHANGED', member); bodyEdits.push({ node: member, text: replacement });
    }
  }
  const restoredDownload = entry.getText().slice(0, entry.body.getStart() - entry.getStart()) + edit(kernel.body, bodyEdits);
  const gatewayEdits = [{ node: entry, text: restoredDownload }, ...removable.map(node => ({ node, text: '' }))];
  const audio = fn(voice, 'validAudio'), oldAudio = fn(oldVoice, 'validAudio');
  for (const validator of [audio, oldAudio]) need(!validator.asteriskToken
    && !validator.modifiers?.some(value => value.kind === ts.SyntaxKind.AsyncKeyword)
    && validator.parameters.length === 1 && !validator.parameters[0].initializer && !validator.parameters[0].dotDotDotToken,
  'FORMAT_READER_SIGNATURE_CHANGED');
  need(tokens(audio.getText().slice(0, audio.body.getStart() - audio.getStart()))
    === tokens(oldAudio.getText().slice(0, oldAudio.body.getStart() - oldAudio.getStart())), 'FORMAT_READER_SIGNATURE_CHANGED');
  const receipt = fn(voice, 'readHermesVoiceCheckpoint'), oldReceipt = fn(oldVoice, 'readHermesVoiceCheckpoint');
  need(same(oldAudio.body, `{
    return record(audio) && keysAllowed(audio, ['objectKey', 'sha256', 'bytes', 'contentType'])
      && nonempty(audio.objectKey) && /^derived\\/hermes-voice\\/[^\\s?#\\\\]+\\.mp3$/u.test(audio.objectKey)
      && !audio.objectKey.split('/').includes('..') && hash(audio.sha256)
      && Number.isSafeInteger(audio.bytes) && Number(audio.bytes) > 0 && Number(audio.bytes) <= 20 * 1024 * 1024
      && audio.contentType === 'audio/mpeg';
  }`), 'OLD_FORMAT_READER_CHANGED');
  // Only the matched, dominated format extension is erased; all other reader/source/CAS bytes compare below.
  need(same(audio.body, `{
    return record(audio) && keysAllowed(audio, ['objectKey', 'sha256', 'bytes', 'contentType'])
      && nonempty(audio.objectKey) && /^derived\\/hermes-voice\\/[^\\s?#\\\\]+\\.(?:mp3|wav)$/u.test(audio.objectKey)
      && !audio.objectKey.split('/').includes('..') && hash(audio.sha256)
      && Number.isSafeInteger(audio.bytes) && Number(audio.bytes) > 0 && Number(audio.bytes) <= 20 * 1024 * 1024
      && ((audio.contentType === 'audio/mpeg' && audio.objectKey.endsWith('.mp3'))
        || (audio.contentType === 'audio/wav' && audio.objectKey.endsWith('.wav') && Number(audio.bytes) <= 16 * 1024 * 1024));
  }`), 'FORMAT_READER_CHANGED', audio);
  const extension = one(nodes(receipt, ts.isTemplateExpression).filter(node => node.templateSpans.some(span => ts.isConditionalExpression(span.expression)
    && same(span.expression, "cp.audio.contentType === 'audio/wav' ? 'wav' : 'mp3'"))), 'EXTENSION_CHANGED');
  const oldExtension = one(nodes(oldReceipt, ts.isTemplateExpression).filter(node => node.getText().includes('/${cp.identity.taskId}/${cp.audio.sha256}.mp3')), 'OLD_EXTENSION_UNKNOWN');
  const audioCheck = one(nodes(receipt, ts.isCallExpression).filter(call => same(call, 'validAudio(cp.audio)')), 'AUDIO_CHECK_UNKNOWN');
  need(symbol(left, audioCheck.expression) === symbol(left, audio.name), 'AUDIO_CHECK_BINDING_CHANGED');
  let guarded = extension; while (guarded && !ts.isIfStatement(guarded)) guarded = guarded.parent;
  need(guarded && same(guarded, `if (cp.phase === 'completed' && (payload.operation === 'transcription'
    ? typeof cp.transcript !== 'string' || cp.transcript.length > 20_000 || cp.audio !== undefined
    : !validAudio(cp.audio) || cp.transcript !== undefined
      || cp.audio.objectKey !== \`derived/hermes-voice/\${encodeURIComponent(String(cp.identity.userId))}/\${cp.identity.taskId}/\${cp.audio.sha256}.\${cp.audio.contentType === 'audio/wav' ? 'wav' : 'mp3'}\`)) blocked('私有语音完成回执无效');`), 'AUDIO_GUARD_CHANGED');
  const receiptText = edit(receipt, [{ node: extension, text: oldExtension.getText() }]);
  // Match the complete receipt body after its sole bounded extension replacement; this preserves validAudio dominance.
  need(tokens(receiptText) === tokens(oldReceipt.getText()), 'RECEIPT_RESIDUAL_CHANGED');
  const projected = new Map([[gatewayPath, { source: gateway, text: edit(gateway, gatewayEdits) }],
    [voicePath, { source: voice, text: edit(voice, [{ node: audio, text: oldAudio.getText() }, { node: receipt, text: receiptText }]) }]]);
  for (const [path, value] of projected) {
    const compiled = ts.transpileModule(value.text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true } });
    const ast = ts.createSourceFile('runtime.js', compiled.outputText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
    need(!ast.parseDiagnostics.length && JSON.stringify(left.canonical ? left.canonical(ast) : null) === JSON.stringify(b.get(`module:${path}`)), 'PROJECTED_RUNTIME_CHANGED');
  }
  return { phase: 'format-reader', domain: 'old-mp3-produced-state', projected,
    rollbackModules: new Map([[gatewayPath, oldGateway], [voicePath, oldVoice]]) };
}

function finiteVoicePairCompatibility(ts, current, previous, candidateRoot, rollbackRoot, roots) {
  try {
    const left = rollbackProofContexts.get(current), right = rollbackProofContexts.get(previous);
    if (roots !== APPLICATION_ROLLBACK_READERS || !left || !right || left.ts !== ts || right.ts !== ts
      || left.roots !== roots || right.roots !== roots || left.root !== candidateRoot || right.root !== rollbackRoot
      || left.program.getTypeChecker() !== left.checker || right.program.getTypeChecker() !== right.checker) return false;
    const a = new Map(current), b = new Map(previous), selectorPath = 'packages/domain/src/agent/voice-contract.ts';
    const oldContract = right.program.getSourceFile(resolve(right.root, selectorPath));
    if (oldContract) {
      const selectorIsTrue = source => source?.statements.some(node => ts.isFunctionDeclaration(node)
        && node.name?.text === 'isHermesVoiceWriterEnabled' && !node.asteriskToken
        && !node.modifiers?.some(value => value.kind === ts.SyntaxKind.AsyncKeyword) && node.parameters.length === 0
        && node.body?.statements.length === 1 && ts.isReturnStatement(node.body.statements[0])
        && node.body.statements[0].expression?.kind === ts.SyntaxKind.TrueKeyword);
      if (selectorIsTrue(oldContract) && selectorIsTrue(left.program.getSourceFile(resolve(left.root, selectorPath)))) {
        const model = finiteVoiceFormatReaderSourceModel(ts, left, right, current, previous);
        return [...model.projected].every(([path, value]) => left.modules.get(resolve(left.root, path)) === value.source
          && right.modules.get(resolve(right.root, path)) === model.rollbackModules.get(path));
      }
      // The false-to-true selector direction retains its original exact reader proof.
      // Only the pure selector's literal changes; all reader capabilities,
      // import initialization, callers, dependencies and late CAS stay exact.
      const model = finiteVoiceWriterSourceModel(ts, left, right, current, previous);
      const compiled = ts.transpileModule(model.text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true } });
      const ast = ts.createSourceFile('runtime.js', compiled.outputText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
      for (const key of new Set([...a.keys(), ...b.keys()])) {
        if (!a.has(key) || !b.has(key)) return false;
        if (JSON.stringify(key === `module:${selectorPath}` ? left.canonical(ast) : a.get(key)) !== JSON.stringify(b.get(key))) return false;
      }
      return left.modules.get(resolve(left.root, selectorPath)) === model.source && right.modules.get(resolve(right.root, selectorPath)) === model.rollback;
    }
    const model = finiteVoiceSourceModel(ts, left, right);
    if (model.phase !== 'reader') return false;
    const normalized = new Map(), affected = new Set();
    for (const [path, value] of model.projected) {
      const key = `module:${path}`;
      if (!a.has(key) || !b.has(key) || left.modules.get(resolve(left.root, path)) !== value.source) return false;
      const emitted = ts.transpileModule(value.text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true } });
      const ast = ts.createSourceFile('runtime.js', emitted.outputText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
      if (ast.parseDiagnostics.length || JSON.stringify(left.canonical(ast)) !== JSON.stringify(b.get(key))) return false;
      normalized.set(path, ast); affected.add(key);
    }
    for (const [path, file] of model.capsules) {
      if (left.modules.get(resolve(left.root, path)) !== file || !a.has(`module:${path}`) || b.has(`module:${path}`)) return false;
      affected.add(`module:${path}`);
    }
    const importSpecifiers = file => file.statements.filter(node => (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier)
      .map(node => node.moduleSpecifier.text);
    for (const key of new Set([...a.keys(), ...b.keys()])) {
      if (affected.has(key)) continue;
      if (a.has(key) && b.has(key)) { if (JSON.stringify(a.get(key)) !== JSON.stringify(b.get(key))) return false; continue; }
      // A capsule may only add imports of the very same external implementation
      // already retained in the old closure. No package/config/vendor/node is
      // dropped by a path exemption, and unclassified differences always fail.
      const match = /^(.*):external:(.+)$/u.exec(key);
      if (!a.has(key) || b.has(key) || !match || !model.capsules.has(match[1])
        || !importSpecifiers(model.capsules.get(match[1])).includes(match[2])
        || ![...b].some(([name, value]) => name.endsWith(`:external:${match[2]}`) && JSON.stringify(value) === JSON.stringify(a.get(key)))) return false;
    }
    // Each new runtime import must resolve to an unchanged old module or to
    // the analyzed acyclic/declaration-only capsule set. Added arbitrary source
    // dependencies cannot hide behind an unused barrel export.
    for (const [path, file] of model.capsules) for (const statement of file.statements) {
      if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly) continue;
      const specifier = statement.moduleSpecifier.text;
      if (a.has(`${path}:external:${specifier}`)) continue;
      let module = left.checker.getSymbolAtLocation(statement.moduleSpecifier);
      const target = module?.declarations?.find(ts.isSourceFile);
      if (!target) return false;
      const targetPath = relative(left.root, target.fileName).replaceAll('\\', '/');
      if (!model.capsules.has(targetPath) && !b.has(`module:${targetPath}`)) return false;
      if (targetPath === path) return false;
    }
    return true;
  } catch { return false; }
}


// A source lemma only. It does not carry collector authority and is not an
// application compatibility permit. In particular, own null/malformed selected
// data cannot borrow the legacy ABSENT branch.
function finiteSelectedGuideSupplementaryTerms(ts, context, { ui = true } = {}) {
  const fail = node => { throw { reason: 'SELECTED_GUIDE_SUPPLEMENTARY_SOURCE_UNKNOWN', node }; };
  const need = (condition, node) => { if (!condition) fail(node); };
  need(context.ts === ts && context.program.getTypeChecker() === context.checker
    && context.sourceHost && typeof context.resolveSource === 'function', undefined);
  const { root, sourceHost } = context;
  const owns = file => { const path = relative(root, resolve(file)).replaceAll('\\', '/');
    return !path.startsWith('../') && !path.includes('/node_modules/') && !path.startsWith('node_modules/'); };
  const apiPath = resolve(root, 'apps/api/src/routes/agent.ts');
  const apiEntryPath = resolve(root, 'apps/api/src/index.ts');
  const parserEntryPath = resolve(root, 'apps/agent-worker/src/parser-acceptance-runner.ts');
  const drawerPath = resolve(root, 'apps/web/components/hermes/HermesAssistantDrawer.tsx');
  const extras = [apiPath, apiEntryPath, parserEntryPath, ...(ui ? [drawerPath] : [])];
  for (const file of extras) need(owns(file) && sourceHost.fileExists(file), undefined);
  let webConfiguration;
  if (ui) {
    const text = sourceHost.readFile(resolve(root, 'apps/web/tsconfig.json')); need(typeof text === 'string', undefined);
    try { webConfiguration = JSON.parse(text); } catch { fail(undefined); }
    need(webConfiguration.compilerOptions?.baseUrl === '.'
      && JSON.stringify(webConfiguration.compilerOptions?.paths?.['@/*']) === '["./*"]', undefined);
  }
  const originals = new Map(context.program.getSourceFiles().map(source => [resolve(source.fileName), source]));
  const added = new Map();
  const host = { ...sourceHost };
  host.getSourceFile = (file, languageVersion, ...args) => {
    const path = resolve(file), original = originals.get(path);
    if (original) return original;
    if (added.has(path)) return added.get(path);
    need(owns(path), undefined);
    const source = sourceHost.getSourceFile(file, languageVersion, ...args);
    if (source) { need(added.size < 1024, source); added.set(path, source); }
    return source;
  };
  host.resolveModuleNames = (names, containingFile) => names.map(specifier => {
    const web = relative(resolve(root, 'apps/web'), containingFile).replaceAll('\\', '/');
    if (ui && owns(containingFile) && web !== '..' && !web.startsWith('../') && !web.includes(':')
      && (specifier.startsWith('@/') || specifier.startsWith('.'))) {
      const base = specifier.startsWith('@/') ? resolve(root, 'apps/web', specifier.slice(2))
        : resolve(containingFile, '..', specifier.replace(/\.js$/u, ''));
      need(owns(base), undefined);
      const path = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, resolve(base, 'index.ts'), resolve(base, 'index.tsx')]
        .find(file => sourceHost.fileExists(file));
      need(path, undefined);
      return { resolvedFileName: path, extension: path.endsWith('.tsx') ? ts.Extension.Tsx : path.endsWith('.js') ? ts.Extension.Js : ts.Extension.Ts };
    }
    return context.resolveSource(specifier, containingFile);
  });
  // Preserve every captured source node by identity. Supplemental writer analysis
  // neither replaces the successful reader collection nor adds an acceptance token.
  const program = ts.createProgram([...new Set([...originals.keys(), ...extras])],
    { ...context.program.getCompilerOptions(), types: [] }, host);
  need(!program.getSyntacticDiagnostics().length, undefined);
  for (const [path, source] of originals) need(program.getSourceFile(path) === source, source);
  const api = program.getSourceFile(apiPath), drawer = ui ? program.getSourceFile(drawerPath) : undefined;
  need(api && (!ui || drawer), api);
  return { ...context, status: 'conditional', program, checker: program.getTypeChecker(), originalContext: context,
    api, drawer, webConfiguration, supplementalSources: added,
    apiEntry: program.getSourceFile(apiEntryPath), parserEntry: program.getSourceFile(parserEntryPath),
    outstanding: ['successful DEFAULT WeakMap provenance required at the main caller',
      'actual writer and UI emission binding', 'external/package/vendor/config comparison remains original'] };
}

function finiteSelectedGuideDecoderTerms(ts, context, rollbackContext) {
  const fail = node => { throw { reason: 'SELECTED_GUIDE_LEGACY_DECODER_CHANGED', node }; };
  const need = (condition, node) => { if (!condition) fail(node); };
  const source = (ctx, name) => {
    const value = ctx.program.getSourceFile(resolve(ctx.root, name));
    need(value && !value.isDeclarationFile && ctx.program.getTypeChecker() === ctx.checker, value);
    return value;
  };
  const symbol = node => {
    let value = context.checker.getSymbolAtLocation(node);
    if (value?.flags & ts.SymbolFlags.Alias) value = context.checker.getAliasedSymbol(value);
    return value;
  };
  const fn = (parsed, name) => {
    const values = parsed.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    need(values.length === 1 && values[0].body, parsed); return values[0];
  };
  const runtime = (ctx, declaration) => {
    need(typeof ctx.canonical === 'function', declaration);
    const output = ts.transpileModule(declaration.getText(), { fileName: declaration.getSourceFile().fileName,
      reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true } });
    need(!output.diagnostics?.some(item => item.category === ts.DiagnosticCategory.Error), declaration);
    const emitted = ts.createSourceFile('runtime.js', output.outputText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
    need(!emitted.parseDiagnostics.length, declaration); return ctx.canonical(emitted);
  };
  const path = 'packages/domain/src/agent/workspace-guide-contract.ts';
  const current = source(context, path), previous = source(rollbackContext, path);
  const legacyParser = fn(current, 'parseWorkspaceGuidePayload'), oldParser = fn(previous, 'parseWorkspaceGuidePayload');
  need(JSON.stringify(runtime(context, legacyParser)) === JSON.stringify(runtime(rollbackContext, oldParser)), legacyParser);
  const reader = fn(current, 'readWorkspaceGuidePayloadWithSelectedImage');
  need(reader.parameters.length === 1 && ts.isIdentifier(reader.parameters[0].name)
    && reader.parameters[0].name.text === 'value' && !reader.parameters[0].initializer, reader);
  // This is the finite prefix grammar, not a guessed source replacement. It
  // returns the ORIGINAL bound strict parser's result on each absence/invalid
  // container path before any selected-specific validation or construction.
  const grammar = ts.createSourceFile('selected-absence.ts', `function absence(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return parseWorkspaceGuidePayload(value);
    const payload = value as Record<string, unknown>;
    const context = payload.context;
    if (!context || typeof context !== 'object' || Array.isArray(context)) return parseWorkspaceGuidePayload(value);
    const presentation = (context as Record<string, unknown>).presentation;
    if (!presentation || typeof presentation !== 'object' || Array.isArray(presentation)
      || !Object.hasOwn(presentation, 'selectedImageAssetId')) return parseWorkspaceGuidePayload(value);
  }`, ts.ScriptTarget.ES2022, true);
  const expected = grammar.statements[0].body.statements;
  need(reader.body.statements.length > expected.length, reader);
  const target = symbol(legacyParser.name);
  for (let index = 0; index < expected.length; index += 1) {
    const actual = reader.body.statements[index];
    need(JSON.stringify(context.canonical(actual)) === JSON.stringify(context.canonical(expected[index])), actual);
    const visit = node => {
      if (ts.isIdentifier(node) && node.text === 'parseWorkspaceGuidePayload') need(symbol(node) === target, node);
      if (ts.isIdentifier(node) && ['Array', 'Object'].includes(node.text)) {
        need(!(symbol(node)?.declarations ?? []).some(value => !value.getSourceFile().isDeclarationFile), node);
      }
      ts.forEachChild(node, visit);
    };
    visit(actual);
  }
  return { status: 'conditional', capable: true, source: current, legacyParser, oldParser, reader,
    outstanding: ['actual fresh writer/caller closure', 'authenticated historical transition closure',
      'complete residual/import/init equality', 'original successful default collector provenance'] };
}

function finiteSelectedGuideMaintenanceBookingTerms(ts, context, rollbackContext) {
  const fail = node => { throw { reason: 'SELECTED_GUIDE_MAINTENANCE_BOOKING_UNKNOWN', node }; };
  const need = (value, node) => { if (!value) fail(node); };
  const nodes = (root, predicate) => { const result = []; const visit = node => {
    if (predicate(node)) result.push(node); ts.forEachChild(node, visit);
  }; visit(root); return result; };
  const one = (values, node) => { need(values.length === 1, node); return values[0]; };
  const module = (owner, path) => { const source = owner.program.getSourceFile(resolve(owner.root, path)); need(source, undefined); return source; };
  const fn = (source, name) => one(source.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name), source);
  const symbol = node => { let value = context.checker.getSymbolAtLocation(node);
    if (value?.flags & ts.SymbolFlags.Alias) value = context.checker.getAliasedSymbol(value); return value; };
  const same = (node, text) => {
    const grammar = ts.createSourceFile('selected-booking-term.ts', text, ts.ScriptTarget.ES2022, true);
    need(!grammar.parseDiagnostics.length && grammar.statements.length === 1, node);
    need(JSON.stringify(context.canonical(node)) === JSON.stringify(context.canonical(grammar.statements[0])), node);
  };
  const path = 'packages/domain/src/assets/presentation-asset.ts';
  const source = module(context, path), previousSource = module(rollbackContext, path);
  const target = fn(source, 'submitPresentationGeneration'), previous = fn(previousSource, target.name.text);
  const read = one(nodes(target, node => ts.isVariableDeclaration(node) && node.name.text === 'parentOwner'), target);
  const readStatement = read.parent.parent;
  same(readStatement, 'const parentOwner = await tx.agentTask.findUnique({ where: { id: payload.sceneImage!.storyboardAssetId } });');
  const body = readStatement.parent;
  need(ts.isBlock(body) && ts.isArrowFunction(body.parent) && body.parent.parameters.length === 1
    && ts.isIdentifier(body.parent.parameters[0].name) && body.parent.parameters[0].name.text === 'tx', read);
  const callback = body.parent, tx = callback.parameters[0];
  const readIndex = body.statements.indexOf(readStatement);
  need(readIndex >= 2, read);
  same(body.statements[readIndex - 2], 'const currentParent = await requireSceneImageParent(tx, payload);');
  same(body.statements[readIndex - 1], "if (!currentParent || currentParent.identity !== sceneParentForTask!.identity) throw new PresentationAssetError('VALIDATION_ERROR', 'Scene image parent changed before task booking');");
  const commonRead = one(nodes(body.statements[readIndex - 2], ts.isCallExpression), read);
  const scenePath = 'packages/domain/src/assets/scene-image.ts';
  const sceneParent = fn(module(context, scenePath), 'requireSceneImageParent');
  need(symbol(commonRead.expression)?.valueDeclaration === sceneParent
    && JSON.stringify(context.canonical(sceneParent)) === JSON.stringify(rollbackContext.canonical(fn(module(rollbackContext, scenePath), 'requireSceneImageParent'))), commonRead);
  const guard = body.statements[readIndex + 1];
  same(guard, `if (parentOwner?.kind === 'workspace.guide' || recordValue(lockedParent.provenance).nativeIllustration !== undefined) {
    if (parentOwner?.kind !== 'workspace.guide') throw new PresentationAssetError('VALIDATION_ERROR', 'Selected-image parent has no original guide owner');
    const selected = await requireSelectedImageGuideParent(tx, { userId: input.userId, guideTaskId: parentOwner.id, executionAttempt: parentOwner.executionAttempt });
    if (selected.asset.status !== 'approved' || payload.sceneImage!.sceneIndex !== 0
      || input.idempotencyKey !== selectedImageChildKey(parentOwner.id)
      || !isDeepStrictEqual(payload.sourceClaimIds, selected.source.binding.sourceClaimIds)
      || payload.sceneImage!.styleReferenceAssetId || payload.sceneImage!.revisionAssetId)
      throw new PresentationAssetError('VALIDATION_ERROR', 'Selected-image submission no longer matches its guide');
  }`);
  for (const node of nodes(readStatement, ts.isIdentifier).concat(nodes(guard, ts.isIdentifier), nodes(commonRead, ts.isIdentifier))) {
    if (node.text === 'tx') need(symbol(node) === symbol(tx.name), node);
    if (node.text === 'input') need(symbol(node) === symbol(target.parameters[1].name), node);
  }
  const parentCall = one(nodes(guard, node => ts.isCallExpression(node) && node.expression.getText() === 'requireSelectedImageGuideParent'), guard);
  need(symbol(parentCall.expression)?.valueDeclaration === fn(source, 'requireSelectedImageGuideParent'), parentCall);
  const locked = one(nodes(callback, node => ts.isVariableDeclaration(node) && node.name.text === 'lockedParent'), callback);
  same(locked.parent.parent, 'const lockedParent = await tx.presentationAsset.findUnique({ where: { id: payload.sceneImage!.storyboardAssetId }, select: { id: true, updatedAt: true, provenance: true } });');
  const provenance = one(nodes(locked, node => ts.isPropertyAssignment(node) && node.name.getText() === 'provenance'), locked);
  const removed = new Set([readStatement, guard, provenance]);
  const transformed = ts.transform(target, [transformation => {
    const visit = node => removed.has(node) ? undefined : ts.visitEachChild(node, visit, transformation);
    return node => ts.visitNode(node, visit);
  }]);
  let ordinaryText;
  try { ordinaryText = ts.createPrinter().printNode(ts.EmitHint.Unspecified, transformed.transformed[0], source); }
  finally { transformed.dispose(); }
  const ordinary = ts.createSourceFile(path, ordinaryText, ts.ScriptTarget.ES2022, true).statements[0];
  need(JSON.stringify(context.canonical(ordinary.body)) === JSON.stringify(rollbackContext.canonical(previous.body)), target);
  const agentPath = 'packages/domain/src/agent/agent.ts';
  const agent = module(context, agentPath), oldAgent = module(rollbackContext, agentPath);
  const submit = fn(agent, 'submitAgentTask'), oldSubmit = fn(oldAgent, 'submitAgentTask');
  // Bind the complete original transaction/retry/dispatch tail, then the actual
  // callback and persistence order inside that same captured transaction.
  need(JSON.stringify(context.canonical(submit)) === JSON.stringify(rollbackContext.canonical(oldSubmit)), submit);
  const transaction = one(nodes(submit, node => ts.isCallExpression(node) && node.expression.getText() === 'deps.prisma.$transaction'), submit);
  need(transaction.arguments.length === 2 && ts.isArrowFunction(transaction.arguments[0]), transaction);
  const book = transaction.arguments[0];
  need(book.parameters.length === 1 && ts.isIdentifier(book.parameters[0].name), book);
  same(book.body.statements[0], 'await beforePersist?.(tx);');
  same(book.body.statements[1], 'return persistAgentTaskInTransaction(deps, tx, persistenceInput, ctx);');
  same(ts.factory.createExpressionStatement(transaction.arguments[1]), "({ isolationLevel: 'Serializable' });");
  const actualTx = one(nodes(book.body.statements[0], node => ts.isIdentifier(node) && node.text === 'tx'), book);
  need(symbol(actualTx) === symbol(book.parameters[0].name), actualTx);
  const persistence = book.body.statements[1].expression;
  need(symbol(persistence.expression)?.valueDeclaration === fn(agent, 'persistAgentTaskInTransaction'), persistence);
  need(ts.isAwaitExpression(transaction.parent), transaction);
  return { status: 'conditional', source, previousSource, target, previous, ordinary, ordinaryText,
    read, callback, guard, commonRead, parentCall, transaction, submit, persistence,
    relation: 'same-Serializable-prefix-abort-before-persist; ordinary continuation retains old body',
    outstanding: ['qualified selected helper/authority closure', 'actual client/vendor transaction semantics',
      'complete retained-state model, strict remainder and original private collector/history authority'] };
}

function finiteSelectedGuideMaintenanceWorkerTerms(ts, context, rollbackContext) {
  const fail = node => { throw { reason: 'SELECTED_GUIDE_MAINTENANCE_WORKER_UNKNOWN', node }; };
  const need = (value, node) => { if (!value) fail(node); };
  const nodes = (root, predicate) => { const result = []; const visit = node => {
    if (predicate(node)) result.push(node); ts.forEachChild(node, visit);
  }; visit(root); return result; };
  const one = (values, node) => { need(values.length === 1, node); return values[0]; };
  const module = (owner, path) => { const source = owner.program.getSourceFile(resolve(owner.root, path)); need(source, undefined); return source; };
  const fn = (source, name) => one(source.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name), source);
  const symbol = (node, owner = context) => { let value = owner.checker.getSymbolAtLocation(node);
    if (value?.flags & ts.SymbolFlags.Alias) value = owner.checker.getAliasedSymbol(value); return value; };
  const same = (node, text) => {
    const grammar = ts.createSourceFile('selected-worker-term.ts', text, ts.ScriptTarget.ES2022, true);
    need(!grammar.parseDiagnostics.length && grammar.statements.length === 1, node);
    need(JSON.stringify(context.canonical(node)) === JSON.stringify(context.canonical(grammar.statements[0])), node);
  };
  const path = 'apps/agent-worker/src/presentation/handler.ts';
  const source = module(context, path), previousSource = module(rollbackContext, path);
  const target = fn(source, 'createPresentationGenerationHandler'), previous = fn(previousSource, target.name.text);
  const declaration = one(nodes(target, node => ts.isVariableDeclaration(node) && node.name.text === 'requireSelectedGuideParentUnchanged'), target);
  need(!declaration.initializer && declaration.parent.declarations.length === 1, declaration);
  const bound = symbol(declaration.name), removed = new Set([declaration.parent.parent]);
  const scene = one(nodes(target, node => ts.isVariableDeclaration(node) && node.name.text === 'sceneParent'), target);
  same(scene.parent.parent, 'const sceneParent = await requireSceneImageParent(deps.prisma, payload);');
  const block = scene.parent.parent.parent;
  const guard = block.statements[block.statements.indexOf(scene.parent.parent) + 1];
  same(guard, `if (sceneParent && payload.sceneImage) {
    const parentTask = await deps.prisma.agentTask.findUnique({ where: { id: payload.sceneImage.storyboardAssetId } });
    const parentRow = await deps.prisma.presentationAsset.findUnique({ where: { id: payload.sceneImage.storyboardAssetId } });
    const selectedProof = parentRow?.provenance && typeof parentRow.provenance === 'object' && !Array.isArray(parentRow.provenance)
      && Object.hasOwn(parentRow.provenance, 'nativeIllustration');
    if (parentTask?.kind === 'workspace.guide' || selectedProof) {
      if (parentTask?.kind !== 'workspace.guide') throw new Error('[blocked] Selected-image parent has no original guide owner');
      const selected = await requireSelectedImageGuideParent(deps.prisma, { userId: scope.userId, guideTaskId: parentTask.id, executionAttempt: parentTask.executionAttempt });
      const selectedResult = structuredClone(selected.task.result) as Record<string, unknown>;
      const selectedPayload = structuredClone(selected.task.payload), selectedBinding = structuredClone(selected.source.binding);
      const verify = (proof: typeof selected) => {
        const hash = createHash('sha256').update(renderStoryboard(proof.document, proof.settings)).digest('hex');
        if (proof.asset.status !== 'approved' || proof.asset.contentHash !== hash
          || proof.asset.objectKey !== \`presentation/\${payload.researchObjectId}/\${payload.versionId}/\${hash}.html\`
          || payload.sceneImage!.sceneIndex !== 0 || !isDeepStrictEqual(payload.sourceClaimIds, proof.source.binding.sourceClaimIds)
          || !isDeepStrictEqual(sceneParent.view.document, proof.document) || sceneParent.contentHash !== hash)
          throw new Error('[blocked] Selected-image parent bytes or source changed');
      };
      verify(selected);
      requireSelectedGuideParentUnchanged = async tx => {
        const current = await requireSelectedImageGuideParent(tx, { userId: scope.userId, guideTaskId: parentTask.id, executionAttempt: parentTask.executionAttempt });
        verify(current);
        const keys = ['nativeAgentExecution', 'selectedImageContext', 'selectedImageReply', 'selectedImageDraft', 'sourceMapRef', 'storyboardReview', 'nativeIllustration'];
        const currentResult = current.task.result as Record<string, unknown>;
        if (keys.some(key => !isDeepStrictEqual(currentResult[key], selectedResult[key]))
          || !isDeepStrictEqual(current.task.payload, selectedPayload) || !isDeepStrictEqual(current.source.binding, selectedBinding))
          throw new Error('[blocked] Selected-image paid source changed');
      };
    }
  }`);
  removed.add(guard);
  const handler = block.parent;
  need(ts.isArrowFunction(handler) && handler.parameters.length === 2 && ts.isIdentifier(handler.parameters[0].name), handler);
  for (const value of nodes(guard, node => ts.isIdentifier(node) && node.text === 'deps'))
    need(symbol(value) === symbol(handler.parameters[0].name), value);
  const helpers = module(context, 'packages/domain/src/assets/presentation-asset.ts');
  const qualifier = fn(helpers, 'requireSelectedImageGuideParent');
  for (const call of nodes(guard, node => ts.isCallExpression(node) && node.expression.getText() === 'requireSelectedImageGuideParent'))
    need(symbol(call.expression)?.valueDeclaration === qualifier, call);
  const refreshes = nodes(target, node => ts.isIfStatement(node) && ts.isIdentifier(node.expression) && symbol(node.expression) === bound);
  need(refreshes.length === 2, declaration);
  for (const refresh of refreshes) {
    const text = refresh.getText();
    if (text.includes('(prisma as Prisma.TransactionClient)')) same(refresh, 'if (requireSelectedGuideParentUnchanged) await requireSelectedGuideParentUnchanged(prisma as Prisma.TransactionClient);');
    else same(refresh, 'if (requireSelectedGuideParentUnchanged) await requireSelectedGuideParentUnchanged(deps.prisma);');
    removed.add(refresh);
  }
  const late = one(nodes(target, node => ts.isIfStatement(node) && node.expression.getText() === "parentTask?.kind === 'workspace.guide'" && node.elseStatement), target);
  same(late.thenStatement, `{
    if (!requireSelectedGuideParentUnchanged || sceneRevision || styleReference)
      throw new Error('[blocked] Selected-image rendering requires its accepted exact guide parent');
    await requireSelectedGuideParentUnchanged(deps.prisma);
  }`);
  const transformed = ts.transform(target, [transformation => {
    const visit = node => removed.has(node) ? undefined : node === late
      ? ts.visitNode(node.elseStatement, visit) : ts.visitEachChild(node, visit, transformation);
    return node => ts.visitNode(node, visit);
  }]);
  let ordinaryText;
  try { ordinaryText = ts.createPrinter().printNode(ts.EmitHint.Unspecified, transformed.transformed[0], source); }
  finally { transformed.dispose(); }
  const ordinary = ts.createSourceFile(path, ordinaryText, ts.ScriptTarget.ES2022, true).statements[0];
  need(JSON.stringify(context.canonical(ordinary)) === JSON.stringify(rollbackContext.canonical(previous)), target);
  // The SAME actual prefix already includes claim and possibly consumed rearm.
  // Match failures to the original false-handlerCompleted CAS/cleanup tail;
  // never assert zero prior writes or automatic recovery for a failed row.
  const retained = [];
  for (const [file, names] of [
    ['apps/agent-worker/src/index.ts', ['createHandlers', 'createPollOnce']],
    ['packages/domain/src/agent/agent.ts', ['claimAgentTask', 'markTaskProgress', 'markTaskProgressOnce', 'retryAgentTask', 'evaluateAgentTaskRetryEligibility']],
    ['packages/domain/src/agent/native-agent-execution.ts', ['nativeAgentTerminalResult']],
    ['packages/domain/src/assets/scene-image.ts', ['requireSceneImageParent', 'nativeImageReviewTerminalResult']],
  ]) for (const name of names) {
    const current = fn(module(context, file), name), old = fn(module(rollbackContext, file), name);
    need(JSON.stringify(context.canonical(current)) === JSON.stringify(rollbackContext.canonical(old)), current);
    retained.push({ current, old });
  }
  const index = module(context, 'apps/agent-worker/src/index.ts'), poll = fn(index, 'createPollOnce');
  const failure = one(nodes(poll, node => ts.isCallExpression(node) && node.expression.getText() === 'markTaskProgress'
    && node.arguments[1]?.getText().includes("status: 'failed'")), poll);
  same(ts.factory.createExpressionStatement(failure), `markTaskProgress(deps, {
    taskId, status: 'failed', error: e instanceof Error ? e.message.slice(0, 1000) : String(e), expectedExecutionAttempt: claimed?.executionAttempt
  });`);
  const transfer = failure.parent;
  need(ts.isPropertyAccessExpression(transfer) && transfer.name.text === 'catch'
    && ts.isAwaitExpression(transfer.parent.parent), failure);
  need(symbol(failure.expression)?.valueDeclaration === fn(module(context, 'packages/domain/src/agent/agent.ts'), 'markTaskProgress'), failure);
  return { status: 'conditional', source, previousSource, target, previous, ordinary, ordinaryText, declaration, guard, scene,
    late, refreshes, retained, failure, qualifier,
    relation: 'same-claimed/rearm-prefix; original failed-or-retained-running/CAS-race and queue tail',
    outstanding: ['selected qualification and caller/reference closure', 'actual client/vendor and Gateway receipt identity',
      'complete retained-state source/history model; no guarantee of same-task automatic recovery'] };
}

function finiteSelectedGuideMaintenanceViewTerms(ts, context, rollbackContext) {
  const fail = node => { throw { reason: 'SELECTED_GUIDE_MAINTENANCE_VIEW_UNKNOWN', node }; };
  const need = (value, node) => { if (!value) fail(node); };
  const nodes = (root, predicate) => { const result = []; const visit = node => {
    if (predicate(node)) result.push(node); ts.forEachChild(node, visit);
  }; visit(root); return result; };
  const one = (values, node) => { need(values.length === 1, node); return values[0]; };
  const source = context.program.getSourceFile(resolve(context.root, 'packages/domain/src/agent/agent.ts'));
  const previous = rollbackContext.program.getSourceFile(resolve(rollbackContext.root, 'packages/domain/src/agent/agent.ts'));
  need(source && previous, source);
  const fn = (parsed, name) => one(parsed.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name), parsed);
  const symbol = node => { let value = context.checker.getSymbolAtLocation(node);
    if (value?.flags & ts.SymbolFlags.Alias) value = context.checker.getAliasedSymbol(value); return value; };
  const view = fn(source, 'selectedImageChildTaskView');
  need(view.parameters.length === 4 && view.parameters.every((parameter, index) => ts.isIdentifier(parameter.name)
    && parameter.name.text === ['deps', 'task', 'userId', 'canRetry'][index] && !parameter.initializer && !parameter.dotDotDotToken)
    && view.modifiers?.length === 1 && view.modifiers[0].kind === ts.SyntaxKind.AsyncKeyword, view);
  // Display-only conditional string leaves carry no task/source authority.
  // Every status literal, route key, actor binding and object field stays exact.
  const display = root => {
    const result = ts.transform(root, [transformation => {
      const visit = node => ts.isStringLiteral(node) && ts.isConditionalExpression(node.parent)
        && (node.parent.whenTrue === node || node.parent.whenFalse === node)
        ? ts.factory.createStringLiteral('display') : ts.visitEachChild(node, visit, transformation);
      return node => ts.visitNode(node, visit);
    }]);
    try { return context.canonical(result.transformed[0]); } finally { result.dispose(); }
  };
  const grammar = ts.createSourceFile('selected-live-view.ts', `async function selected(deps: unknown, task: unknown, userId: string, canRetry: boolean) {
    const view = taskToView(task, canRetry);
    if (task.kind !== 'workspace.guide' || !isJsonRecord(task.result) || !isJsonRecord(task.result.selectedImageDraft)
      || !isJsonRecord(view.result?.selectedImageDraft)) return view;
    const context = isJsonRecord(task.payload) ? task.payload.context : undefined;
    const presentation = isJsonRecord(context) ? context.presentation : undefined;
    if (!isJsonRecord(presentation) || !Object.hasOwn(presentation, 'selectedImageAssetId')) return view;
    const zh = isJsonRecord(task.payload) && task.payload.locale === 'zh';
    try {
      const child = await deps.prisma.$transaction(tx => readSelectedImageGenerationChild(tx, { userId, guideTaskId: task.id }), { isolationLevel: 'Serializable' });
      if (!child) return view;
      const summary = ['failed', 'cancelled'].includes(child.status)
        ? zh ? 'display' : 'display'
        : child.status === 'succeeded' ? zh ? 'display' : 'display' : zh ? 'display' : 'display';
      return { ...view, result: { ...view.result, summary, nextSteps: [{ intent: 'open-task', targetId: child.id,
        label: zh ? 'display' : 'display' }] } };
    } catch {
      return { ...view, result: { ...view.result, nextSteps: [], summary: zh ? 'display' : 'display' } };
    }
  }`, ts.ScriptTarget.ES2022, true).statements[0];
  need(JSON.stringify(display(view.body)) === JSON.stringify(display(grammar.body)), view);
  for (const name of ['taskToView', 'projectAgentTaskResult', 'isJsonRecord']) {
    const current = fn(source, name), old = fn(previous, name);
    need(JSON.stringify(context.canonical(current)) === JSON.stringify(rollbackContext.canonical(old)), current);
  }
  const base = one(nodes(view, node => ts.isCallExpression(node) && node.expression.getText() === 'taskToView'), view);
  need(symbol(base.expression)?.valueDeclaration === fn(source, 'taskToView') && symbol(base.arguments[0]) === symbol(view.parameters[1].name), base);
  const child = one(nodes(view, node => ts.isCallExpression(node) && node.expression.getText() === 'readSelectedImageGenerationChild'), view);
  const assets = context.program.getSourceFile(resolve(context.root, 'packages/domain/src/assets/presentation-asset.ts'));
  need(assets && symbol(child.expression)?.valueDeclaration === fn(assets, 'readSelectedImageGenerationChild'), child);
  const calls = nodes(source, node => ts.isCallExpression(node) && symbol(node.expression)?.valueDeclaration === view);
  need(calls.length === 2, view);
  const replacements = new Map();
  for (const call of calls) {
    const grammarCall = ts.createSourceFile('selected-call.ts', 'await selectedImageChildTaskView(deps, task, input.userId, await canRetryAgentTask(deps, task, input.userId));', ts.ScriptTarget.ES2022, true).statements[0].expression;
    need(ts.isAwaitExpression(call.parent) && JSON.stringify(context.canonical(call.parent)) === JSON.stringify(context.canonical(grammarCall)), call);
    replacements.set(call.parent, ts.factory.createCallExpression(ts.factory.createIdentifier('taskToView'), undefined, [call.arguments[1], call.arguments[3]]));
  }
  const imported = one(nodes(source, node => ts.isImportSpecifier(node) && symbol(node.name)?.valueDeclaration === fn(assets, 'readSelectedImageGenerationChild')), source);
  const transformed = ts.transform(source, [transformation => {
    const visit = node => {
      if (node === view) return undefined;
      if (replacements.has(node)) return replacements.get(node);
      if (ts.isImportDeclaration(node) && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)
        && node.importClause.namedBindings.elements.includes(imported)) {
        const elements = node.importClause.namedBindings.elements.filter(element => element !== imported);
        if (!elements.length && !node.importClause.name) return undefined;
        return ts.factory.updateImportDeclaration(node, node.modifiers, ts.factory.updateImportClause(node.importClause,
          node.importClause.isTypeOnly, node.importClause.name, ts.factory.updateNamedImports(node.importClause.namedBindings, elements)), node.moduleSpecifier, node.attributes);
      }
      return ts.visitEachChild(node, visit, transformation);
    }; return node => ts.visitNode(node, visit);
  }]);
  let text;
  try { text = ts.createPrinter().printFile(transformed.transformed[0]); } finally { transformed.dispose(); }
  const ordinary = ts.createSourceFile(source.fileName, text, ts.ScriptTarget.ES2022, true);
  need(JSON.stringify(context.canonical(ordinary)) === JSON.stringify(rollbackContext.canonical(previous)), source);
  return { status: 'conditional', source, previous, text, view, calls, child, base,
    relation: 'same-row ordinary opaque view; strict projected selected source plus qualified readonly child extension',
    outstanding: ['complete strict selected qualifier/caller closure', 'actual query source/vendor identities and original retained history'] };
}

function finiteSelectedGuideMaintenanceQualificationTerms(ts, context, rollbackContext) {
  const fail = node => { throw { reason: 'SELECTED_GUIDE_MAINTENANCE_QUALIFICATION_UNKNOWN', node }; };
  const need = (value, node) => { if (!value) fail(node); };
  const source = context.program.getSourceFile(resolve(context.root, 'packages/domain/src/assets/presentation-asset.ts'));
  need(source, undefined);
  const fn = (parsed, name) => { const matches = parsed.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    need(matches.length === 1, parsed); return matches[0]; };
  const bind = (name, body) => {
    const target = fn(source, name), grammar = ts.createSourceFile('selected-qualification.ts', `async function qualified(tx: unknown, input: unknown) ${body}`, ts.ScriptTarget.ES2022, true).statements[0];
    need(!grammar.getSourceFile().parseDiagnostics.length && target.parameters.length >= 2
      && target.parameters.slice(0, 2).every((parameter, index) => ts.isIdentifier(parameter.name)
        && parameter.name.text === ['tx', 'input'][index] && !parameter.initializer && !parameter.dotDotDotToken), target);
    need(!target.asteriskToken && target.modifiers?.length === 2
      && target.modifiers[0].kind === ts.SyntaxKind.ExportKeyword && target.modifiers[1].kind === ts.SyntaxKind.AsyncKeyword, target);
    need(JSON.stringify(context.canonical(target.body)) === JSON.stringify(context.canonical(grammar.body)), target);
    return target;
  };
  const production = bind('requireSelectedImageGuideProduction', `{
    function fail(): never { throw new PresentationAssetError('VALIDATION_ERROR', 'Selected-image production source changed'); }
    const task = await tx.agentTask.findUnique({ where: { id: input.guideTaskId } });
    if (!task || task.deletedAt || task.kind !== 'workspace.guide' || !['succeeded', 'failed', 'running'].includes(task.status)) fail();
    if (task.status === 'running') {
      if (input.executionAttempt === undefined) fail();
      await requireNativeAgentExecutionAuthority(tx, { taskId: task.id, executionAttempt: input.executionAttempt });
    }
    const session = await tx.agentSession.findUnique({ where: { id: task.sessionId } });
    const payload = readWorkspaceGuidePayloadWithSelectedImage(task.payload), scope = payload.context.presentation;
    if (!session || session.deletedAt || session.status !== 'active' || session.kind !== 'workspace.guide' || session.userId !== input.userId
      || !scope?.versionId || !scope.selectedImageAssetId || session.researchObjectId !== scope.researchObjectId) fail();
    await requirePresentationWriteScope(tx, { userId: input.userId, researchObjectId: scope.researchObjectId, versionId: scope.versionId });
    const saved = recordValue(task.result), marker = readNativeAgentExecution(saved), cp = marker?.checkpoint;
    if (marker?.profile !== 'paper-illustration' || !cp || cp.taskId !== task.id || cp.executionAttempt > task.executionAttempt
      || cp.state !== 'completed' || cp.finishReason !== 'stop' || cp.hasToolCalls) fail();
    await requireNativeIllustrationTerminalSource(tx, task);
    const reply = recordValue(saved.selectedImageReply);
    const incoming = Object.fromEntries(['summary', 'nextSteps', 'needsMoreInformation', 'selectedImageReference', 'selectedImageDraft', 'sourceMapRef', 'selectedImageReply', 'storyboardReview']
      .filter(key => Object.hasOwn(saved, key)).map(key => [key, saved[key]]));
    incoming.summary = reply.summary; incoming.nextSteps = []; incoming.needsMoreInformation = reply.kind !== 'proposal' && reply.kind !== 'explanation';
    incoming.selectedImageReference ??= workspaceSelectedImageDraftSource(saved.selectedImageContext as unknown as SelectedImageBinding);
    nativeAgentTerminalResult(task, 'succeeded', incoming);
    if (reply.kind !== 'proposal' || !selectedImageProductionIntent(payload.goal)) return undefined;
    const draft = readWorkspaceSelectedImageDraft(saved.selectedImageDraft);
    const document = parseStoryboardDocument(draft.document, draft.source.sourceClaimIds, 'image');
    const source = await requireSelectedImageSource(tx, { userId: input.userId, researchObjectId: scope.researchObjectId,
      versionId: scope.versionId, assetId: scope.selectedImageAssetId });
    const review = recordValue(saved.storyboardReview), native = recordValue(saved.nativeIllustration);
    if (document.scenes.length !== 1 || review.sourceEvidenceIdentity !== source.binding.sourceEvidenceIdentity
      || native.runtimeId !== marker.runtimeId || native.skillCatalogueId !== marker.skillCatalogueId
      || typeof native.planToolCallId !== 'string' || !native.planToolCallId || typeof native.reviewToolCallId !== 'string'
      || !native.reviewToolCallId || native.reviewToolCallId === native.planToolCallId || native.reviewToolCallId !== reply.reviewToolCallId) fail();
    const supported = source.claims.map(claim => ({ id: claim.id, sourcePassages: source.evidence.filter(row => row.claimId === claim.id)
      .map(row => ({ evidenceId: row.id, text: row.exactQuote ?? '', relation: row.relation })) }));
    for (const scene of document.scenes) {
      if (!scene.illustration || scene.paperOriginal) fail();
      requireIllustrationSourceSupport(scene.illustration, supported);
    }
    const settings = parseStoryboardRequest({ locale: payload.locale, style: source.settings.style,
      instruction: 'Revise only the selected image. Read the complete userRequest and original scientific brief in context.selectedImage.',
      output: 'image', narrative: true, narrativeSceneLimit: 1 });
    return { task, session, payload, scope: { researchObjectId: scope.researchObjectId, versionId: scope.versionId }, source, document, settings, review, native };
  }`);
  const parent = bind('requireSelectedImageGuideParent', `{
    const authority = await requireSelectedImageGuideProduction(tx, input);
    if (!authority) throw new PresentationAssetError('VALIDATION_ERROR', 'Selected guide does not authorize image production');
    const asset = await tx.presentationAsset.findUnique({ where: { id: input.guideTaskId } });
    const p = recordValue(asset?.provenance);
    const links = await tx.presentationAssetClaim.findMany({ where: { presentationAssetId: input.guideTaskId } });
    if (!asset || asset.deletedAt || asset.kind !== 'interactive_html' || !['draft', 'approved'].includes(asset.status)
      || asset.label !== PRESENTATION_ASSET_LABEL || asset.generator !== 'OpenScience Hermes storyboard planner' || asset.generatorVersion !== '1'
      || asset.researchObjectId !== authority.scope.researchObjectId || asset.versionId !== authority.scope.versionId
      || p.taskId !== authority.task.id || p.subtype !== 'sourced_storyboard' || p.source !== 'verified_claims'
      || !isDeepStrictEqual(p.storyboardDocument, authority.document) || !isDeepStrictEqual(p.storyboardSettings, authority.settings)
      || !isDeepStrictEqual(p.illustrationReview, authority.review) || !isDeepStrictEqual(p.nativeIllustration, authority.native)
      || p.sourceEvidenceIdentity !== authority.source.binding.sourceEvidenceIdentity
      || !isDeepStrictEqual(p.sourceEvidenceIds, authority.source.evidence.map(row => row.id))
      || !isDeepStrictEqual(p.sourceClaimIds, authority.source.binding.sourceClaimIds) || p.contentType !== 'text/html; charset=utf-8'
      || !isDeepStrictEqual(links.map(link => link.claimId).sort(), authority.source.binding.sourceClaimIds)
      || (expected && (asset.contentHash !== expected.contentHash || asset.objectKey !== expected.objectKey)))
      throw new PresentationAssetError('VALIDATION_ERROR', 'Selected-image parent no longer matches its original guide');
    return { ...authority, asset };
  }`);
  need(parent.parameters.length === 3 && parent.parameters[2].name.text === 'expected'
    && parent.parameters[2].questionToken && !parent.parameters[2].initializer, parent);
  const child = bind('readSelectedImageGenerationChild', `{
    const child = await tx.agentTask.findUnique({ where: { idempotencyKey: selectedImageChildKey(input.guideTaskId) } });
    if (!child || child.deletedAt) return undefined;
    const owner = await tx.agentTask.findUnique({ where: { id: input.guideTaskId } });
    const parent = await requireSelectedImageGuideParent(tx, { ...input, executionAttempt: owner?.executionAttempt });
    if (parent.asset.status !== 'approved') throw new PresentationAssetError('VALIDATION_ERROR', 'Selected-image child parent is no longer approved');
    const session = await tx.agentSession.findUnique({ where: { id: child.sessionId } });
    const expected = { schemaVersion: 1, ...parent.scope, kind: 'image', sourceClaimIds: [...parent.source.binding.sourceClaimIds], sceneImage: { storyboardAssetId: input.guideTaskId, sceneIndex: 0 } };
    if (child.kind !== 'presentation.generate' || !session || session.deletedAt || session.userId !== input.userId || session.researchObjectId !== parent.scope.researchObjectId
      || session.kind !== 'visualization' || !isDeepStrictEqual(child.payload, expected))
      throw new PresentationAssetError('VALIDATION_ERROR', 'Selected-image child changed');
    return child;
  }`);
  need(production.parameters.length === 2 && child.parameters.length === 2, production);
  const roles = [production, parent, child];
  const declared = new Map(roles.map(node => [node.name.text, node]));
  const originalValidators = new Map();
  for (const [path, names] of [
    ['packages/domain/src/agent/workspace-guide-contract.ts', ['readWorkspaceGuidePayloadWithSelectedImage', 'readWorkspaceSelectedImageDraft', 'workspaceSelectedImageDraftSource']],
    ['packages/domain/src/agent/native-agent-execution.ts', ['readNativeAgentExecution', 'nativeAgentTerminalResult', 'requireNativeAgentExecutionAuthority', 'requireNativeIllustrationTerminalSource']],
    ['packages/domain/src/assets/presentation-asset.ts', ['requirePresentationWriteScope']],
    ['packages/domain/src/assets/storyboard.ts', ['parseStoryboardDocument', 'parseStoryboardRequest']],
    ['packages/domain/src/assets/scene-image.ts', ['requireSelectedImageSource']],
    ['packages/domain/src/assets/illustration-brief.ts', ['requireIllustrationSourceSupport']],
    ['packages/domain/src/commit/research-record-snapshot.ts', ['recordValue']],
  ]) {
    const owner = context.program.getSourceFile(resolve(context.root, path)); need(owner, source);
    for (const name of names) originalValidators.set(name, fn(owner, name));
  }
  const symbol = node => { let value = context.checker.getSymbolAtLocation(node);
    if (value?.flags & ts.SymbolFlags.Alias) value = context.checker.getAliasedSymbol(value); return value; };
  const calls = [], visit = node => { if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) calls.push(node); ts.forEachChild(node, visit); };
  for (const role of roles) visit(role.body);
  for (const call of calls) {
    const name = call.expression.text, target = symbol(call.expression)?.valueDeclaration;
    if (declared.has(name)) { need(target === declared.get(name), call); continue; }
    if (name === 'selectedImageProductionIntent' || name === 'selectedImageChildKey') continue; // separately bound added declarations
    if (name === 'fail') { need(target && target.getSourceFile() === source && target.pos >= production.pos && target.end <= production.end, call); continue; }
    const local = context.checker.getSymbolAtLocation(call.expression)?.declarations?.find(ts.isImportSpecifier);
    if (local) {
      const statement = local.parent.parent.parent;
      if (ts.isImportDeclaration(statement) && builtinModules.includes(statement.moduleSpecifier.text.replace(/^node:/u, ''))) {
        const old = rollbackContext.program.getSourceFile(resolve(rollbackContext.root, relative(context.root, source.fileName)));
        need(old?.statements.some(node => ts.isImportDeclaration(node)
          && JSON.stringify(context.canonical(statement)) === JSON.stringify(rollbackContext.canonical(node))), call);
        continue;
      }
    }
    need(target && target === originalValidators.get(name) && !target.getSourceFile().isDeclarationFile, call);
    const path = relative(context.root, target.getSourceFile().fileName).replaceAll('\\', '/');
    const oldSource = rollbackContext.program.getSourceFile(resolve(rollbackContext.root, path));
    need(oldSource, call);
    const old = oldSource.statements.flatMap(value => ts.isVariableStatement(value) ? [...value.declarationList.declarations] : [value])
      .find(value => value.name?.text === target.name?.text);
    need(old && JSON.stringify(context.canonical(target)) === JSON.stringify(rollbackContext.canonical(old)), call);
  }
  return { status: 'conditional', source, production, parent, child, roles, calls,
    relation: 'same original actor/session/task/CP/source/full-Claims; exact approved parent and qualified fixed child',
    outstanding: ['added intent/key declarations and all caller/namespace/export closure', 'complete ordinary/dormant/residual/history and actual collector/vendor binding'] };
}

function finiteSelectedGuideMaintenanceRemainderTerms(ts, context, rollbackContext, models) {
  const fail = node => { throw { reason: 'SELECTED_GUIDE_MAINTENANCE_REMAINDER_UNKNOWN', node }; };
  const need = (value, node) => { if (!value) fail(node); };
  const nodes = (root, predicate) => { const result = []; const visit = node => {
    if (ts.isTypeNode(node)) return;
    if (predicate(node)) result.push(node); ts.forEachChild(node, visit);
  }; visit(root); return result; };
  const one = (values, node) => { need(values.length === 1, node); return values[0]; };
  const module = (owner, path) => { const source = owner.program.getSourceFile(resolve(owner.root, path)); need(source, undefined); return source; };
  const fn = (source, name) => one(source.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name), source);
  const symbol = node => { let value = ts.isShorthandPropertyAssignment(node.parent)
    ? context.checker.getShorthandAssignmentValueSymbol(node.parent)
    : ts.isExportSpecifier(node.parent) ? context.checker.getExportSpecifierLocalTargetSymbol(node.parent)
      : context.checker.getSymbolAtLocation(node);
    if (value?.flags & ts.SymbolFlags.Alias) value = context.checker.getAliasedSymbol(value); return value; };
  const within = (node, region) => node.getSourceFile() === region.getSourceFile() && node.pos >= region.pos && node.end <= region.end;
  const unwrap = raw => { let node = raw; while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) node = node.expression; return node; };
  const same = (node, text) => { const grammar = ts.createSourceFile('selected-maintained-term.ts', text, ts.ScriptTarget.ES2022, true);
    need(!grammar.parseDiagnostics.length && grammar.statements.length === 1
      && JSON.stringify(context.canonical(node)) === JSON.stringify(context.canonical(grammar.statements[0])), node); };
  const runtime = (text, owner) => {
    const compiled = ts.transpileModule(text, { reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true } });
    need(!compiled.diagnostics?.some(value => value.category === ts.DiagnosticCategory.Error), undefined);
    const parsed = ts.createSourceFile('runtime.js', compiled.outputText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
    need(!parsed.parseDiagnostics.length, parsed);
    return JSON.stringify(owner.canonical(parsed));
  };
  const contract = module(context, 'packages/domain/src/agent/workspace-guide-contract.ts');
  const assets = models.qualification.source, worker = models.worker.source;
  const guide = module(context, 'apps/agent-worker/src/workspace-guide.ts'), index = module(context, 'packages/domain/src/index.ts');
  const intent = fn(contract, 'selectedImageProductionIntent'), adopt = fn(assets, 'adoptSelectedImageGuide');
  const prepare = fn(guide, 'prepareSelectedImageGeneration');
  const key = one(assets.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations])
    .filter(node => node.name.text === 'selectedImageChildKey'), assets);
  same(key.parent.parent, 'const selectedImageChildKey = (guideId: string) => `selected-image:${guideId}:scene:0`;');
  same(prepare.body, '{ return adoptSelectedImageGuide({ ...deps, renderStoryboard }, input); }');
  need(prepare.parameters.length === 2 && prepare.parameters.every((parameter, position) => parameter.name.text === ['deps', 'input'][position]
    && !parameter.initializer && !parameter.dotDotDotToken) && !prepare.asteriskToken, prepare);
  const prepareCall = one(nodes(prepare, ts.isCallExpression), prepare);
  need(symbol(prepareCall.expression)?.valueDeclaration === adopt, prepareCall);
  // The added request predicate is a bounded local primitive computation. It
  // cannot call owned code, Provider, eval, mutate an escaped object or loop on
  // an unbounded iterator. Its production activation remains separately closed.
  need(intent.parameters.length === 1 && intent.parameters[0].name.text === 'goal' && !intent.parameters[0].initializer
    && !intent.parameters[0].dotDotDotToken && !intent.asteriskToken && intent.modifiers?.length === 1
    && intent.modifiers[0].kind === ts.SyntaxKind.ExportKeyword, intent);
  const local = node => symbol(node)?.declarations?.every(value => within(value, intent));
  const intrinsic = node => { const value = context.checker.getSymbolAtLocation(node);
    return !(value?.flags & ts.SymbolFlags.Alias) && !value?.declarations?.some(declaration => !declaration.getSourceFile().isDeclarationFile); };
  const loops = nodes(intent.body, node => ts.isForOfStatement(node) || ts.isForStatement(node) || ts.isWhileStatement(node) || ts.isDoStatement(node));
  need(loops.length === 1 && ts.isForOfStatement(loops[0]) && ts.isIdentifier(loops[0].expression)
    && symbol(loops[0].expression) === symbol(intent.parameters[0].name), intent);
  for (const node of nodes(intent.body, () => true)) {
    if (ts.isAwaitExpression(node) || ts.isYieldExpression(node) || ts.isThrowStatement(node)
      || ts.isDeleteExpression(node) || ts.isFunctionLike(node) || ts.isImportEqualsDeclaration(node)
      || ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isModuleDeclaration(node)
      || ts.isClassDeclaration(node) || ts.isClassExpression(node) || ts.isTaggedTemplateExpression(node)
      || ts.isWithStatement(node)) fail(node);
    if (ts.isNewExpression(node)) need(ts.isIdentifier(node.expression) && node.expression.text === 'Set' && intrinsic(node.expression), node);
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression)) need(node.expression.text === 'Boolean' && intrinsic(node.expression), node);
      else need(ts.isPropertyAccessExpression(node.expression)
        && ['values', 'at', 'pop', 'push', 'has', 'trim', 'replace', 'test', 'exec'].includes(node.expression.name.text), node);
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment)
      need(ts.isIdentifier(node.left) && local(node.left), node);
    if (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
      need(![ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator), node);
    if (ts.isReturnStatement(node)) need(node.expression && (node.expression.kind === ts.SyntaxKind.TrueKeyword || node.expression.kind === ts.SyntaxKind.FalseKeyword
      || ts.isCallExpression(node.expression) && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'Boolean'), node);
    if (ts.isIdentifier(node) && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)
      && !(ts.isPropertyAssignment(node.parent) && node.parent.name === node)
      && !local(node)) need(['Object', 'Set', 'Boolean', 'undefined'].includes(node.text) && intrinsic(node), node);
  }
  const transition = fn(assets, 'transitionPresentationAssetUnderReview');
  need(transition.parameters.length === 6 && transition.parameters[4].name.text === 'selectedGuideTaskId'
    && transition.parameters[5].name.text === 'selectedGuideExecutionAttempt'
    && transition.parameters.slice(4).every(parameter => parameter.questionToken && !parameter.initializer), transition);
  const selectedParameter = symbol(transition.parameters[4].name);
  const transitionGuard = one(nodes(transition.body, node => ts.isIfStatement(node) && ts.isIdentifier(node.expression)
    && symbol(node.expression) === selectedParameter), transition);
  same(transitionGuard, `if (selectedGuideTaskId) {
    const selected = await requireSelectedImageGuideParent(tx, { userId: input.userId, guideTaskId: selectedGuideTaskId, executionAttempt: selectedGuideExecutionAttempt });
    if (internalRunId || selected.asset.id !== asset.id || input.status !== 'approved' || selected.review.decision !== 'accepted')
      throw new PresentationAssetError('VALIDATION_ERROR', 'Selected-image scientific transition does not match its guide');
    if (asset.status === 'approved') return asset;
  }`);
  const qualified = models.qualification;
  for (const call of qualified.calls) {
    if (call.expression.text === 'selectedImageProductionIntent') need(symbol(call.expression)?.valueDeclaration === intent, call);
    if (call.expression.text === 'selectedImageChildKey') need(symbol(call.expression)?.valueDeclaration === key, call);
  }
  const definitions = [intent, key, qualified.production, qualified.parent, qualified.child, adopt, prepare];
  const exported = new Map(definitions.map(node => [symbol(node.name), node]));
  need(exported.size === definitions.length && !exported.has(undefined), assets);
  const exports = index.statements.filter(ts.isExportDeclaration).filter(node => node.exportClause && ts.isNamedExports(node.exportClause))
    .flatMap(node => [...node.exportClause.elements]).filter(node => exported.has(symbol(node.name)));
  need(exports.length === 4 && [adopt, qualified.production, qualified.parent, qualified.child].every(node => exports.some(entry => symbol(entry.name) === symbol(node.name))), index);
  const allowed = new Map([
    [intent, [qualified.production]], [key, [adopt, qualified.child, models.booking.guard]],
    [qualified.production, [qualified.parent, adopt]],
    [qualified.parent, [adopt, qualified.child, models.booking.guard, models.worker.guard, transitionGuard]],
    [qualified.child, [models.view.view]], [adopt, [prepare]], [prepare, []],
  ]);
  const changedModules = new Set([contract, assets, worker, guide, index, models.view.source]);
  for (const parsed of context.program.getSourceFiles()) {
    if (parsed.isDeclarationFile || !/^(?:apps|packages)\//u.test(relative(context.root, parsed.fileName).replaceAll('\\', '/'))) continue;
    for (const node of nodes(parsed, ts.isIdentifier)) {
      const definition = exported.get(symbol(node));
      if (!definition || node === definition.name) continue;
      if (exports.some(entry => node === entry.name || node === entry.propertyName)) continue;
      if (ts.isImportSpecifier(node.parent)) {
        need((allowed.get(definition) ?? []).some(region => region.getSourceFile() === parsed), node); continue;
      }
      need((allowed.get(definition) ?? []).some(region => within(node, region)), node);
    }
    for (const node of nodes(parsed, ts.isNamespaceImport)) {
      const statement = node.parent.parent;
      const target = context.resolveSource(statement.moduleSpecifier.text, parsed.fileName)?.resolvedFileName;
      if (!target || ![...changedModules].some(value => resolve(value.fileName) === resolve(target))) continue;
      const binding = context.checker.getSymbolAtLocation(node.name);
      for (const use of nodes(parsed, ts.isIdentifier).filter(value => context.checker.getSymbolAtLocation(value) === binding && value !== node.name))
        need(ts.isPropertyAccessExpression(use.parent) && use.parent.expression === use, use);
    }
  }
  for (const declaration of definitions) for (const node of nodes(declaration, ts.isRegularExpressionLiteral)) {
    try { new Script(`void (${node.getText()})`); } catch { fail(node); }
  }
  const projected = new Map();
  const add = (source, text) => {
    const path = relative(context.root, source.fileName).replaceAll('\\', '/');
    const previous = module(rollbackContext, path);
    need(!projected.has(path) && runtime(text, context) === runtime(previous.text, rollbackContext), source);
    projected.set(path, { source, previous, text });
  };
  add(models.view.source, models.view.text);
  const drop = new Set([intent, key.parent.parent, qualified.production, qualified.parent, qualified.child, adopt, prepare]);
  const frames = new Map([[models.booking.target, models.booking.ordinary], [models.worker.target, models.worker.ordinary]]);
  const transitionSymbol = symbol(transition.name);
  for (const use of nodes(assets, ts.isIdentifier).filter(node => symbol(node) === transitionSymbol && node !== transition.name))
    need(within(use, adopt) || ts.isCallExpression(use.parent) && use.parent.expression === use && use.parent.arguments.length <= 4, use);
  const specialAudit = one(nodes(transition, node => ts.isSpreadAssignment(node) && ts.isConditionalExpression(unwrap(node.expression))
    && ts.isIdentifier(unwrap(node.expression).condition) && symbol(unwrap(node.expression).condition) === selectedParameter), transition);
  const auditGrammar = ts.createSourceFile('selected-audit.ts', `const audit = { ...(selectedGuideTaskId ? {
    executor: 'hermes', authorizedByUserId: input.userId, guideTaskId: selectedGuideTaskId, userAccepted: false
  } : {}) };`, ts.ScriptTarget.ES2022, true).statements[0].declarationList.declarations[0].initializer.properties[0];
  need(JSON.stringify(context.canonical(specialAudit)) === JSON.stringify(context.canonical(auditGrammar)), specialAudit);
  const auditOrs = nodes(transition, node => ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.BarBarToken
    && ts.isIdentifier(node.right) && symbol(node.right) === selectedParameter);
  need(auditOrs.length === 2 && auditOrs.every(node => node.left.getText() === 'internalRunId'), transition);
  for (const source of [contract, assets, worker, guide, index]) {
    const previous = module(rollbackContext, relative(context.root, source.fileName));
    const oldBindings = new Set(previous.statements.filter(ts.isImportDeclaration).flatMap(statement => {
      const clause = statement.importClause;
      return clause?.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements.map(node =>
        JSON.stringify([statement.moduleSpecifier.text, (node.propertyName ?? node.name).text, node.name.text, !!clause.isTypeOnly, !!node.isTypeOnly])) : [];
    }));
    const transformed = ts.transform(source, [transformation => {
      const visit = node => {
        if (drop.has(node) || node === transitionGuard || node === specialAudit) return undefined;
        // Keep captured nodes in their own SourceFile during this print. A
        // parsed frame from another SourceFile has incompatible text ranges.
        if (frames.has(node)) return node;
        if (auditOrs.includes(node)) return node.left;
        if (node === transition) return ts.factory.updateFunctionDeclaration(node, node.modifiers, node.asteriskToken, node.name,
          node.typeParameters, node.parameters.slice(0, 4), node.type, ts.visitEachChild(node.body, visit, transformation));
        if (ts.isImportDeclaration(node) && (node.importClause?.name || node.importClause?.namedBindings && ts.isNamespaceImport(node.importClause.namedBindings)))
          need(previous.statements.some(value => ts.isImportDeclaration(value)
            && JSON.stringify(context.canonical(node)) === JSON.stringify(rollbackContext.canonical(value))), node);
        if (ts.isImportDeclaration(node) && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
          const elements = node.importClause.namedBindings.elements.filter(value => oldBindings.has(JSON.stringify([
            node.moduleSpecifier.text, (value.propertyName ?? value.name).text, value.name.text, !!node.importClause.isTypeOnly, !!value.isTypeOnly])));
          for (const removed of node.importClause.namedBindings.elements.filter(value => !elements.includes(value))) {
            need(!['Object', 'Array', 'Boolean', 'Set', 'Error', 'structuredClone', 'undefined', 'String', 'Date', 'Buffer', 'Promise'].includes(removed.name.text), removed);
            const binding = context.checker.getSymbolAtLocation(removed.name);
            need(binding?.declarations?.length === 1 && binding.declarations[0] === removed, removed);
            for (const use of nodes(source, ts.isIdentifier).filter(value => context.checker.getSymbolAtLocation(value) === binding
              && value !== removed.name && value !== removed.propertyName))
              need([...drop, ...frames.keys(), transitionGuard].some(region => within(use, region)), use);
          }
          if (!elements.length && !node.importClause.name) return undefined;
          return ts.factory.updateImportDeclaration(node, node.modifiers, ts.factory.updateImportClause(node.importClause,
            node.importClause.isTypeOnly, node.importClause.name, ts.factory.updateNamedImports(node.importClause.namedBindings, elements)), node.moduleSpecifier, node.attributes);
        }
        if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
          const elements = node.exportClause.elements.filter(value => !exports.includes(value));
          return ts.factory.updateExportDeclaration(node, node.modifiers, node.isTypeOnly, ts.factory.updateNamedExports(node.exportClause, elements), node.moduleSpecifier, node.attributes);
        }
        return ts.visitEachChild(node, visit, transformation);
      }; return node => ts.visitNode(node, visit);
    }]);
    let text;
    try { text = ts.createPrinter().printFile(transformed.transformed[0]); } finally { transformed.dispose(); }
    const edits = [];
    const printed = ts.createSourceFile(source.fileName, text, ts.ScriptTarget.ES2022, true);
    for (const target of frames.keys()) if (target.getSourceFile() === source) {
      const current = fn(printed, target.name.text);
      need(runtime(current.getText(), context) === runtime(target.getText(), context), target);
      edits.push({ start: current.getStart(printed), end: current.end,
        text: target === models.booking.target ? models.booking.ordinaryText : models.worker.ordinaryText });
    }
    for (const edit of edits.sort((a, b) => b.start - a.start)) text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
    add(source, text);
  }
  const auxiliary = [];
  for (const source of context.program.getSourceFiles()) {
    const path = relative(context.root, source.fileName).replaceAll('\\', '/');
    if (source.isDeclarationFile || !/^(?:apps|packages)\//u.test(path) || projected.has(path)) continue;
    // Captured entries retain the original collector's whole-module equality,
    // including its already-proved Prisma location/consumer normalization.
    // Re-parsing those bytes here would lose the original literal identities.
    if (context.modules?.has(resolve(source.fileName))) continue;
    const previous = module(rollbackContext, path);
    need(source.text.replaceAll('\r\n', '\n') === previous.text.replaceAll('\r\n', '\n') || runtime(source.text, context) === runtime(previous.text, rollbackContext), source);
    auxiliary.push({ source, previous });
  }
  return { status: 'conditional', projected, auxiliary, intent, key, adopt, prepare, definitions, allowed, transition,
    relation: 'retained complete capable reader; dormant producers have no runtime caller; strict full module remainder',
    outstanding: ['original installed default collector/private snapshot and library/config/vendor identity',
      'locked ordered-pair and root-controlled producer/retainer history; no future W activation grant'] };
}

function finiteSelectedGuideFreshTerms(ts, context, decoder, rollbackContext) {
  const { program, checker, root } = context;
  const fail = node => { throw { reason: 'SELECTED_GUIDE_FRESH_WRITER_UNKNOWN', node }; };
  const need = (condition, node) => { if (!condition) fail(node); };
  const nodes = (scope, predicate) => {
    const values = []; const visit = node => {
      if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
      if (predicate(node)) values.push(node); ts.forEachChild(node, visit);
    }; visit(scope); return values;
  };
  const one = (values, node) => { need(values.length === 1, node); return values[0]; };
  const symbol = node => {
    let value = ts.isIdentifier(node) && ts.isShorthandPropertyAssignment(node.parent)
      ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node);
    if (value?.flags & ts.SymbolFlags.Alias) value = checker.getAliasedSymbol(value);
    return value;
  };
  const source = path => {
    const value = program.getSourceFile(resolve(root, path)); need(value && !value.isDeclarationFile, value); return value;
  };
  const unwrap = raw => {
    let node = raw;
    while (node && (ts.isAsExpression(node) || ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node)
      || ts.isSatisfiesExpression(node))) node = node.expression;
    return node;
  };
  const name = node => ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text
    : ts.isComputedPropertyName(node) && ts.isStringLiteral(node.expression) ? node.expression.text : undefined;
  const declaration = (parsed, target) => one(nodes(parsed, node => ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name) && node.name.text === target), parsed);
  const fn = (parsed, target) => one(parsed.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === target), parsed);
  const chain = (raw, member) => {
    const node = unwrap(raw);
    return ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === member && !node.questionDotToken ? node : undefined;
  };
  const route = source('apps/api/src/routes/agent.ts'), domain = source('packages/domain/src/agent/agent.ts');
  const guide = declaration(route, 'workspaceGuideTaskBody'), generic = declaration(route, 'genericTaskBody');
  const schema = declaration(route, 'agentTaskBodySchema'), publicKinds = declaration(domain, 'PUBLIC_AGENT_TASK_KINDS');
  need(rollbackContext?.program.getTypeChecker() === rollbackContext?.checker, route);
  const previousRoute = rollbackContext.program.getSourceFile(resolve(rollbackContext.root, 'apps/api/src/routes/agent.ts'));
  need(previousRoute && typeof context.canonical === 'function', route);
  // Identical schema syntax is insufficient if its actual factory can be
  // replaced, mutated or passed to an opaque callback before parsing.
  const zodBinding = (parsed, owner) => {
    const imported = one(nodes(parsed, node => ts.isImportSpecifier(node) && node.name.text === 'z'), parsed);
    const statement = imported.parent.parent.parent;
    need(ts.isImportDeclaration(statement) && statement.moduleSpecifier.text === 'zod'
      && !imported.isTypeOnly && !statement.importClause.isTypeOnly
      && (!imported.propertyName || imported.propertyName.text === 'z'), imported);
    const bound = owner.checker.getSymbolAtLocation(imported.name); need(bound, imported);
    for (const node of nodes(parsed, ts.isIdentifier)) {
      if (node === imported.name || owner.checker.getSymbolAtLocation(node) !== bound) continue;
      const member = node.parent;
      need(ts.isPropertyAccessExpression(member) && member.expression === node && !member.questionDotToken, node);
      if (member.name.text === 'NEVER') {
        need(ts.isReturnStatement(member.parent) && member.parent.expression === member, member);
      } else if (member.name.text === 'ZodIssueCode') {
        const code = member.parent;
        need(ts.isPropertyAccessExpression(code) && code.expression === member && code.name.text === 'custom'
          && ts.isPropertyAssignment(code.parent) && code.parent.initializer === code && code.parent.name.text === 'code', member);
      } else {
        need(['enum', 'literal', 'object', 'record', 'string', 'union', 'unknown'].includes(member.name.text)
          && ts.isCallExpression(member.parent) && member.parent.expression === member && !member.parent.questionDotToken, member);
      }
    }
    return imported;
  };
  zodBinding(route, context); zodBinding(previousRoute, rollbackContext);
  for (const value of [generic, schema]) {
    const previous = declaration(previousRoute, value.name.text);
    need(JSON.stringify(context.canonical(value.initializer)) === JSON.stringify(context.canonical(previous.initializer)), value);
  }
  const kinds = unwrap(publicKinds.initializer);
  need(ts.isArrayLiteralExpression(kinds) && kinds.elements.length && kinds.elements.every(ts.isStringLiteral), kinds);
  need(!kinds.elements.some(node => node.text === 'workspace.guide'), kinds);
  const objectCall = raw => {
    let current = unwrap(raw);
    while (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)
      && ['strict', 'superRefine'].includes(current.expression.name.text)) current = unwrap(current.expression.expression);
    need(chain(current, 'object') && current.arguments.length === 1 && ts.isObjectLiteralExpression(current.arguments[0]), current);
    return current.arguments[0];
  };
  const property = (object, key) => one(object.properties.filter(node => ts.isPropertyAssignment(node) && name(node.name) === key), object).initializer;
  const guideObject = objectCall(guide.initializer), genericObject = objectCall(generic.initializer);
  const kind = chain(property(guideObject, 'kind'), 'literal');
  need(kind?.arguments.length === 1 && ts.isStringLiteral(kind.arguments[0]) && kind.arguments[0].text === 'workspace.guide', guide);
  const transform = chain(property(guideObject, 'payload'), 'transform');
  need(transform?.arguments.length === 1 && (ts.isArrowFunction(transform.arguments[0]) || ts.isFunctionExpression(transform.arguments[0])), guide);
  const callback = transform.arguments[0], rawPayload = callback.parameters[0];
  need(rawPayload && ts.isIdentifier(rawPayload.name) && !rawPayload.initializer, callback);
  const strictCalls = nodes(callback, node => ts.isCallExpression(node) && [symbol(decoder.legacyParser.name), symbol(decoder.reader.name)].includes(symbol(node.expression)));
  const strictCall = one(strictCalls, callback);
  const fresh = symbol(strictCall.expression) === symbol(decoder.reader.name) ? 'selected' : 'legacy';
  need(strictCall.arguments.length === 1 && ts.isIdentifier(strictCall.arguments[0])
    && symbol(strictCall.arguments[0]) === symbol(rawPayload.name) && ts.isReturnStatement(strictCall.parent), strictCall);
  const validReturns = nodes(callback, ts.isReturnStatement);
  need(validReturns.every(node => node.expression === strictCall
    || ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'NEVER'), callback);
  const priorGuide = declaration(previousRoute, guide.name.text);
  const projection = ts.transform(guide.initializer, [transformation => {
    const visit = node => node === strictCall.expression && fresh === 'selected'
      ? ts.factory.createIdentifier(decoder.oldParser.name.text) : ts.visitEachChild(node, visit, transformation);
    return node => ts.visitNode(node, visit);
  }]);
  try { need(JSON.stringify(context.canonical(projection.transformed[0])) === JSON.stringify(rollbackContext.canonical(priorGuide.initializer)), guide); }
  finally { projection.dispose(); }
  const enumCall = chain(property(genericObject, 'kind'), 'enum');
  need(enumCall?.arguments.length === 1 && symbol(enumCall.arguments[0]) === symbol(publicKinds.name), generic);
  const union = chain(schema.initializer, 'union');
  need(union?.arguments.length === 1 && ts.isArrayLiteralExpression(union.arguments[0])
    && union.arguments[0].elements.length === 2 && symbol(union.arguments[0].elements[0]) === symbol(guide.name)
    && symbol(union.arguments[0].elements[1]) === symbol(generic.name), schema);
  const post = one(nodes(route, node => ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === 'post' && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === '/agent/tasks'), route);
  need(post.arguments.length === 2 && ts.isArrowFunction(post.arguments[1]) && ts.isBlock(post.arguments[1].body), post);
  const handler = post.arguments[1], body = declaration(handler, 'body');
  const parse = chain(body.initializer, 'parse');
  need(parse && symbol(parse.expression.expression) === symbol(schema.name) && parse.arguments.length === 1
    && ts.isPropertyAccessExpression(parse.arguments[0]) && parse.arguments[0].name.text === 'body'
    && symbol(parse.arguments[0].expression) === symbol(handler.parameters[0].name), body);
  const submit = fn(domain, 'submitAgentTask'), persist = fn(domain, 'persistAgentTaskInTransaction');
  const core = fn(domain, 'persistAgentTaskCoreInTransaction');
  const sources = program.getSourceFiles().filter(parsed => !parsed.isDeclarationFile
    && /^(?:apps|packages)\//u.test(relative(root, parsed.fileName).replaceAll('\\', '/')));
  const references = target => {
    const calls = [];
    for (const parsed of sources) for (const node of nodes(parsed, ts.isIdentifier)) {
      if (symbol(node) !== symbol(target.name)) continue;
      const parent = node.parent;
      if (node === target.name || ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) continue;
      need(ts.isCallExpression(parent) && parent.expression === node && !parent.questionDotToken
        && !parent.arguments.some(ts.isSpreadElement), node); calls.push(parent);
    }
    return calls;
  };
  const apiSubmit = one(references(submit).filter(call => call.getSourceFile() === route
    && call.pos >= handler.pos && call.end <= handler.end), handler);
  need(apiSubmit.arguments.length === 3 && ts.isObjectLiteralExpression(apiSubmit.arguments[1]), apiSubmit);
  const aliases = new Map([[symbol(body.name), []]]);
  const bodyPath = raw => {
    let node = unwrap(raw); const parts = [];
    while (ts.isPropertyAccessExpression(node) && !node.questionDotToken) { parts.unshift(node.name.text); node = unwrap(node.expression); }
    const prefix = ts.isIdentifier(node) ? aliases.get(symbol(node)) : undefined;
    return prefix ? [...prefix, ...parts] : undefined;
  };
  for (let pass = 0; pass < 64; pass += 1) {
    let added = 0;
    for (const value of nodes(handler, ts.isVariableDeclaration)) {
      if (!ts.isIdentifier(value.name) || !value.initializer || aliases.has(symbol(value.name))) continue;
      const path = bodyPath(value.initializer);
      if (path) { need(Boolean(value.parent.flags & ts.NodeFlags.Const), value); aliases.set(symbol(value.name), path); added += 1; }
    }
    if (!added) break;
    need(pass !== 63, handler);
  }
  for (const identifier of nodes(handler, ts.isIdentifier)) {
    if (!aliases.has(symbol(identifier))) continue;
    if (ts.isVariableDeclaration(identifier.parent) && identifier.parent.name === identifier) continue;
    let expression = identifier;
    while (expression.parent && (ts.isPropertyAccessExpression(expression.parent) && expression.parent.expression === expression
      || (ts.isNonNullExpression(expression.parent) || ts.isAsExpression(expression.parent) || ts.isParenthesizedExpression(expression.parent))
        && expression.parent.expression === expression)) expression = expression.parent;
    const parent = expression.parent, path = bodyPath(expression);
    if (ts.isBinaryExpression(parent) && parent.left === expression
      && parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment
      || ts.isDeleteExpression(parent) || (ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent))
        && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(parent.operator)) fail(expression);
    if (ts.isVariableDeclaration(parent) && parent.initializer === expression) continue;
    if (ts.isPropertyAssignment(parent) && parent.initializer === expression && path?.length === 1 && path[0] === 'payload') {
      need(parent.parent === apiSubmit.arguments[1] && name(parent.name) === 'payload', expression); continue;
    }
    if (ts.isCallExpression(parent) && parent.arguments.includes(expression)) {
      need(path?.length && ['kind', 'sessionId', 'activeClaimId', 'currentGoal', 'researchObjectId', 'versionId', 'selectedImageAssetId']
        .includes(path.at(-1)), expression);
    }
    if (ts.isReturnStatement(parent) || ts.isSpreadAssignment(parent) || ts.isSpreadElement(parent)
      || ts.isElementAccessExpression(parent) && parent.expression === expression) fail(expression);
  }
  const active = new Set(), origins = [], nonGuide = [], forwarders = new Set();
  const retainedForwarder = target => {
    if (forwarders.has(target)) return;
    need(ts.isFunctionDeclaration(target) && target.name && target.body && ts.isSourceFile(target.parent), target);
    const path = relative(root, target.getSourceFile().fileName).replaceAll('\\', '/');
    const previousSource = rollbackContext.program.getSourceFile(resolve(rollbackContext.root, path));
    need(previousSource, target);
    const previous = fn(previousSource, target.name.text);
    // A field map from a parameter/rest alias is not a current value proof if
    // the actual forwarder changed before the call. Keep its complete old body.
    // This is conditional on the old writer/alias and shared-runtime premises;
    // it never treats a name or a retained body alone as an absence witness.
    if (JSON.stringify(context.canonical(target.body)) !== JSON.stringify(rollbackContext.canonical(previous.body))) {
      const oldContract = rollbackContext.program.getSourceFile(resolve(rollbackContext.root, 'packages/domain/src/agent/workspace-guide-contract.ts'));
      need(oldContract?.statements.some(node => ts.isFunctionDeclaration(node) && node.name?.text === decoder.reader.name.text), target);
      // A changed forwarding body is accepted only through this actual bounded
      // callback/frame relation, never by its name, kind annotation or a flag.
      const booking = finiteSelectedGuideMaintenanceBookingTerms(ts, context, rollbackContext);
      need(booking.target === target && booking.previous === previous, target);
    }
    forwarders.add(target);
  };
  const variableOwner = declaration => {
    let owner = declaration.parent;
    while (owner && !(ts.isFunctionDeclaration(owner) && ts.isSourceFile(owner.parent)) && !ts.isSourceFile(owner)) owner = owner.parent;
    need(owner, declaration); retainedForwarder(owner);
  };
  const objects = (raw, seen = new Set()) => {
    const node = unwrap(raw); need(node && !seen.has(node) && seen.size < 128, node);
    const next = new Set(seen).add(node);
    if (ts.isConditionalExpression(node)) return [...objects(node.whenTrue, next), ...objects(node.whenFalse, next)];
    if (ts.isObjectLiteralExpression(node)) {
      let alternatives = [new Map()];
      for (const entry of node.properties) {
        if (ts.isSpreadAssignment(entry)) {
          const spread = objects(entry.expression, next);
          alternatives = alternatives.flatMap(value => spread.map(other => new Map([...value, ...other])));
          need(alternatives.length <= 1024, entry);
        } else {
          need((ts.isPropertyAssignment(entry) || ts.isShorthandPropertyAssignment(entry)) && name(entry.name), entry);
          for (const value of alternatives) value.set(name(entry.name), ts.isPropertyAssignment(entry) ? entry.initializer : entry.name);
        }
      }
      return alternatives;
    }
    if (ts.isIdentifier(node)) {
      const bound = symbol(node)?.valueDeclaration;
      if (bound === body) return [new Map([['kind', { guideBody: true }], ['payload', { guidePayload: true }]])];
      if (bound && ts.isVariableDeclaration(bound) && bound.initializer) {
        variableOwner(bound); return objects(bound.initializer, next);
      }
      if (bound && ts.isBindingElement(bound) && bound.dotDotDotToken && ts.isObjectBindingPattern(bound.parent)
        && ts.isVariableDeclaration(bound.parent.parent) && bound.parent.parent.initializer) {
        const excluded = bound.parent.elements.filter(element => !element.dotDotDotToken).map(element => name(element.propertyName ?? element.name));
        need(!excluded.includes('kind') && !excluded.includes('payload'), bound);
        variableOwner(bound);
        return objects(bound.parent.parent.initializer, next);
      }
      if (bound && ts.isParameter(bound) && ts.isFunctionDeclaration(bound.parent)) {
        const target = bound.parent, index = target.parameters.indexOf(bound);
        retainedForwarder(target);
        need(index !== -1 && !active.has(target), target); active.add(target);
        try {
          const calls = references(target); need(calls.length, target);
          return calls.flatMap(call => { need(call.arguments[index], call); return objects(call.arguments[index], next); });
        } finally { active.delete(target); }
      }
    }
    fail(node);
  };
  for (const call of references(core)) {
    need(call.arguments.length >= 3 && call.arguments.length <= 5, call);
    for (const object of objects(call.arguments[2])) {
      const value = unwrap(object.get('kind'));
      if (value && ts.isStringLiteral(value) && value.text !== 'workspace.guide') { nonGuide.push({ call, kind: value.text }); continue; }
      const path = value && bodyPath(value);
      need(path?.length === 1 && path[0] === 'kind', call);
      const payload = bodyPath(object.get('payload'));
      need(payload?.length === 1 && payload[0] === 'payload', call);
      origins.push({ call, handler, body, strictCall });
    }
  }
  need(origins.length > 0 && references(submit).length && references(persist).length, core);
  return { status: 'conditional', fresh, guide, generic, schema, body, handler, strictCall,
    origins, nonGuide, forwarders, core, submit, persist, source: route,
    outstanding: ['complete actual writer inventory and other constructor alias/mutation closure', 'installed Zod implementation identity in actual collection',
      'supplemental source identity under original collector', 'all historical transitions and residual runtime'] };
}

function finiteSelectedGuideRelocationTerms(ts, context, rollbackContext) {
  const fail = node => { throw { reason: 'SELECTED_GUIDE_BYTE_READER_CHANGED', node }; };
  const need = (condition, node) => { if (!condition) fail(node); };
  const source = (ctx, path) => {
    const parsed = ctx.program.getSourceFile(resolve(ctx.root, path));
    need(parsed && !parsed.isDeclarationFile && ctx.program.getTypeChecker() === ctx.checker, parsed); return parsed;
  };
  const fn = parsed => {
    const found = parsed.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'readPresentationInput');
    need(found.length === 1 && found[0].body && found[0].parameters.length === 4, parsed); return found[0];
  };
  const current = source(context, 'apps/agent-worker/src/presentation/generated-image-review.ts');
  const previous = source(rollbackContext, 'apps/agent-worker/src/presentation/handler.ts');
  const reader = fn(current), oldReader = fn(previous);
  const runtime = (ctx, declaration) => {
    need(typeof ctx.canonical === 'function', declaration);
    const normalized = ts.factory.updateFunctionDeclaration(declaration,
      declaration.modifiers?.filter(modifier => modifier.kind !== ts.SyntaxKind.ExportKeyword), declaration.asteriskToken,
      declaration.name, declaration.typeParameters, declaration.parameters, declaration.type, declaration.body);
    const printed = ts.createPrinter({ removeComments: true }).printNode(ts.EmitHint.Unspecified, normalized, declaration.getSourceFile());
    const compiled = ts.transpileModule(printed, { reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true } });
    need(!compiled.diagnostics?.some(item => item.category === ts.DiagnosticCategory.Error), declaration);
    const emitted = ts.createSourceFile('runtime.js', compiled.outputText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
    need(!emitted.parseDiagnostics.length, declaration); return ctx.canonical(emitted);
  };
  need(JSON.stringify(runtime(context, reader)) === JSON.stringify(runtime(rollbackContext, oldReader)), reader);
  const uses = (ctx, declaration) => {
    const symbol = node => {
      let value = ctx.checker.getSymbolAtLocation(node);
      if (value?.flags & ts.SymbolFlags.Alias) value = ctx.checker.getAliasedSymbol(value);
      return value;
    };
    const target = symbol(declaration.name), calls = [];
    for (const parsed of ctx.program.getSourceFiles()) {
      if (parsed.isDeclarationFile || !/^(?:apps|packages)\//u.test(relative(ctx.root, parsed.fileName).replaceAll('\\', '/'))) continue;
      const visit = node => {
        if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
        if (ts.isIdentifier(node) && symbol(node) === target) {
          const parent = node.parent;
          if (node !== declaration.name && !ts.isImportSpecifier(parent) && !ts.isExportSpecifier(parent)) {
            need(ts.isCallExpression(parent) && parent.expression === node && !parent.questionDotToken
              && parent.arguments.length >= 3 && parent.arguments.length <= 4 && !parent.arguments.some(ts.isSpreadElement), node);
            calls.push(parent);
          }
        }
        ts.forEachChild(node, visit);
      }; visit(parsed);
    }
    return calls;
  };
  const calls = uses(context, reader), oldCalls = uses(rollbackContext, oldReader);
  const handler = source(context, 'apps/agent-worker/src/presentation/handler.ts');
  const retained = calls.filter(call => call.getSourceFile() === handler);
  need(retained.length === oldCalls.length && retained.length > 0, handler);
  for (let index = 0; index < retained.length; index += 1)
    need(JSON.stringify(context.canonical(retained[index])) === JSON.stringify(rollbackContext.canonical(oldCalls[index])), retained[index]);
  return { status: 'conditional', reader, oldReader, source: current, oldSource: previous, handler, calls, retained,
    additionalCalls: calls.filter(call => call.getSourceFile() !== handler),
    outstanding: ['new callers confined to selected domain', 'module initialization and complete residual/import equality',
      'original successful default collector provenance'] };
}

function finiteSelectedGuideRelocationResidualTerms(ts, context, rollbackContext, relocation, workspace) {
  const fail = node => { throw { reason: 'SELECTED_GUIDE_RELOCATION_RESIDUAL_UNKNOWN', node }; };
  const need = (condition, node) => { if (!condition) fail(node); };
  need(relocation?.status === 'conditional' && workspace?.status === 'conditional', undefined);
  const { source, handler, reader, oldReader } = relocation;
  need(context.program.getSourceFile(source.fileName) === source && context.program.getSourceFile(handler.fileName) === handler, source);
  for (const call of relocation.additionalCalls) need(call.getSourceFile() === workspace.source
    && call.pos >= workspace.selected.pos && call.end <= workspace.selected.end, call);
  const generatedPath = relative(context.root, source.fileName).replaceAll('\\', '/');
  const handlerPath = relative(context.root, handler.fileName).replaceAll('\\', '/');
  const oldGenerated = rollbackContext.program.getSourceFile(resolve(rollbackContext.root, generatedPath));
  const oldHandler = rollbackContext.program.getSourceFile(resolve(rollbackContext.root, handlerPath));
  need(oldGenerated && oldHandler === oldReader.getSourceFile(), oldReader);
  const globals = (parsed, name) => context.checker.getSymbolsInScope(parsed, ts.SymbolFlags.Value).find(value => value.name === name);
  for (const name of ['Buffer', 'Error']) for (const parsed of [source, handler])
    need(!globals(parsed, name)?.declarations?.some(declaration => !declaration.getSourceFile().isDeclarationFile), parsed);
  const hashImport = parsed => parsed.statements.filter(node => ts.isImportDeclaration(node) && node.moduleSpecifier.text === 'node:crypto'
    && node.importClause && !node.importClause.isTypeOnly && node.importClause.namedBindings && ts.isNamedImports(node.importClause.namedBindings))
    .flatMap(node => node.importClause.namedBindings.elements.filter(entry => entry.name.text === 'createHash' && !entry.isTypeOnly
      && (!entry.propertyName || entry.propertyName.text === 'createHash')));
  need(hashImport(source).length === 1 && hashImport(handler).length === 1, reader);
  const index = oldHandler.statements.indexOf(oldReader), anchor = oldHandler.statements[index + 1];
  need(index >= 0 && ts.isFunctionDeclaration(anchor) && anchor.name, oldReader);
  const currentAnchors = handler.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === anchor.name.text);
  need(currentAnchors.length === 1, handler);
  const moved = ts.factory.updateFunctionDeclaration(reader, reader.modifiers?.filter(modifier => modifier.kind !== ts.SyntaxKind.ExportKeyword),
    reader.asteriskToken, reader.name, reader.typeParameters, reader.parameters, reader.type, reader.body);
  const imports = handler.statements.filter(node => ts.isImportDeclaration(node) && node.moduleSpecifier.text === './generated-image-review'
    && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings));
  need(imports.length === 1, handler);
  const imported = imports[0], entries = imported.importClause.namedBindings.elements.filter(entry => (entry.propertyName ?? entry.name).text === reader.name.text);
  need(entries.length === 1 && entries[0].name.text === reader.name.text && !entries[0].isTypeOnly, imported);
  const replacement = ts.factory.updateImportDeclaration(imported, imported.modifiers, ts.factory.updateImportClause(imported.importClause,
    imported.importClause.isTypeOnly, imported.importClause.name, ts.factory.updateNamedImports(imported.importClause.namedBindings,
      imported.importClause.namedBindings.elements.filter(entry => entry !== entries[0]))), imported.moduleSpecifier, imported.attributes);
  const generated = ts.factory.updateSourceFile(source, source.statements.filter(node => node !== reader));
  const printer = ts.createPrinter(), text = printer.printFile(generated);
  // Print the moved body against its original source before inserting text;
  // cross-file AST positions must never choose literals from the destination.
  const edits = [
    { start: imported.getStart(handler), end: imported.end, value: printer.printNode(ts.EmitHint.Unspecified, replacement, handler) },
    { start: currentAnchors[0].getStart(handler), end: currentAnchors[0].getStart(handler), value: printer.printNode(ts.EmitHint.Unspecified, moved, source) + '\n' },
  ].sort((left, right) => right.start - left.start);
  need(edits[0].start >= edits[1].end, handler);
  let handlerText = handler.text;
  for (const edit of edits) handlerText = handlerText.slice(0, edit.start) + edit.value + handlerText.slice(edit.end);
  const runtime = (value, owner) => JSON.stringify(owner.canonical(ts.createSourceFile('runtime.js', ts.transpileModule(value,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true } }).outputText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS)));
  if (runtime(text, context) !== runtime(oldGenerated.text, rollbackContext)) throw { reason: 'SELECTED_GUIDE_RELOCATION_RESIDUAL_UNKNOWN', node: source, stage: 'generated-runtime' };
  if (runtime(handlerText, context) !== runtime(oldHandler.text, rollbackContext)) throw { reason: 'SELECTED_GUIDE_RELOCATION_RESIDUAL_UNKNOWN', node: handler, stage: 'handler-runtime' };
  return { status: 'conditional', source, handler, text, handlerText, moved, relocation, workspace,
    outstanding: ['whole module initialization/declaration namespace closure', 'original successful collector context and remaining entries'] };
}

function finiteSelectedGuideWorkspaceTerms(ts, context, rollbackContext, decoder) {
  const fail = node => { throw { reason: 'SELECTED_GUIDE_WORKSPACE_RESIDUAL_UNKNOWN', node }; };
  const need = (condition, node) => { if (!condition) fail(node); };
  const file = 'apps/agent-worker/src/workspace-guide.ts';
  const source = context.program.getSourceFile(resolve(context.root, file));
  const previous = rollbackContext.program.getSourceFile(resolve(rollbackContext.root, file));
  need(source && previous && decoder?.status === 'conditional' && decoder.capable, source);
  const nodes = (root, predicate) => { const values = []; const visit = node => {
    if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)
      || ts.isImportDeclaration(node) && node.importClause?.isTypeOnly || ts.isImportSpecifier(node) && node.isTypeOnly) return;
    if (predicate(node)) values.push(node); ts.forEachChild(node, visit);
  }; visit(root); return values; };
  const one = (values, node) => { need(values.length === 1, node); return values[0]; };
  const symbol = (node, owner = context) => {
    let value = ts.isShorthandPropertyAssignment(node.parent) ? owner.checker.getShorthandAssignmentValueSymbol(node.parent)
      : ts.isExportSpecifier(node.parent) ? owner.checker.getExportSpecifierLocalTargetSymbol(node.parent) : owner.checker.getSymbolAtLocation(node);
    if (value?.flags & ts.SymbolFlags.Alias) value = owner.checker.getAliasedSymbol(value); return value;
  };
  const handler = one(source.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'workspaceGuideHandler'), source);
  const oldHandler = one(previous.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === handler.name.text), previous);
  need(handler.parameters.length === 4 && oldHandler.parameters.length === 3 && handler.parameters.every(node => ts.isIdentifier(node.name)
    && !node.initializer && !node.dotDotDotToken), handler);
  const payload = one(nodes(handler, node => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'payload'), handler);
  need(payload.parent.flags & ts.NodeFlags.Const && ts.isCallExpression(payload.initializer)
    && payload.initializer.arguments.length === 1 && symbol(payload.initializer.expression)?.valueDeclaration === decoder.reader, payload);
  const argument = payload.initializer.arguments[0];
  need(ts.isPropertyAccessExpression(argument) && argument.name.text === 'payload' && symbol(argument.expression) === symbol(handler.parameters[2].name), argument);
  const selected = one(handler.body.statements.filter(node => {
    if (!ts.isIfStatement(node)) return false;
    const condition = node.expression, presentation = condition.expression, contextField = presentation?.expression;
    return ts.isPropertyAccessExpression(condition) && condition.name.text === 'selectedImageAssetId' && condition.questionDotToken
      && ts.isPropertyAccessExpression(presentation) && presentation.name.text === 'presentation'
      && ts.isPropertyAccessExpression(contextField) && contextField.name.text === 'context'
      && symbol(contextField.expression) === symbol(payload.name);
  }), handler);
  const insideSelected = node => node.pos >= selected.pos && node.end <= selected.end && node.getSourceFile() === source;
  const native = symbol(handler.parameters[3].name);
  for (const ref of nodes(source, ts.isIdentifier)) if (symbol(ref) === native && ref !== handler.parameters[3].name) need(insideSelected(ref), ref);
  const handlerCalls = [];
  for (const parsed of context.program.getSourceFiles()) if (!parsed.isDeclarationFile && /^(?:apps|packages)\//u.test(relative(context.root, parsed.fileName).replaceAll('\\', '/')))
    for (const ref of nodes(parsed, ts.isIdentifier)) if (symbol(ref) === symbol(handler.name) && ref !== handler.name) {
      if (ts.isImportSpecifier(ref.parent)) continue;
      need(ts.isCallExpression(ref.parent) && ref.parent.expression === ref && ref.parent.arguments.length === 4
        && !ref.parent.arguments.some(ts.isSpreadElement), ref); handlerCalls.push(ref.parent);
    }
  need(handlerCalls.length, handler);
  const oldImports = new Map();
  for (const statement of previous.statements) if (ts.isImportDeclaration(statement) && statement.importClause
    && !statement.importClause.isTypeOnly && statement.importClause.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)) {
    const values = oldImports.get(statement.moduleSpecifier.text) ?? new Set();
    for (const entry of statement.importClause.namedBindings.elements) if (!entry.isTypeOnly) values.add((entry.propertyName ?? entry.name).text);
    oldImports.set(statement.moduleSpecifier.text, values);
  }
  const removed = new Set(), readerImports = [], builtinOmissions = [];
  for (const statement of source.statements) if (ts.isImportDeclaration(statement) && statement.importClause
    && !statement.importClause.isTypeOnly && statement.importClause.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)) {
    for (const entry of statement.importClause.namedBindings.elements) if (!entry.isTypeOnly) {
      const target = symbol(entry.name), local = context.checker.getSymbolAtLocation(entry.name), imported = (entry.propertyName ?? entry.name).text;
      if (target?.valueDeclaration === decoder.reader) { readerImports.push(entry); continue; }
      if (oldImports.get(statement.moduleSpecifier.text)?.has(imported)) continue;
      need(target, entry);
      for (const ref of nodes(source, ts.isIdentifier)) if ((ts.isExportSpecifier(ref.parent)
        ? context.checker.getExportSpecifierLocalTargetSymbol(ref.parent) : context.checker.getSymbolAtLocation(ref)) === local
        && ref !== entry.name && ref !== entry.propertyName) need(insideSelected(ref), ref);
      if (imported === 'isDeepStrictEqual') {
        need(statement.moduleSpecifier.text === 'node:util', entry);
        builtinOmissions.push({ specifier: 'node:util', binding: entry });
      } else need(target.declarations?.some(node => !node.getSourceFile().isDeclarationFile
        && /^(?:apps|packages)\//u.test(relative(context.root, node.getSourceFile().fileName).replaceAll('\\', '/'))), entry);
      removed.add(entry);
    }
  }
  const readerImport = one(readerImports, payload);
  need(oldImports.get(readerImport.parent.parent.parent.moduleSpecifier.text)?.has(decoder.legacyParser.name.text), readerImport);
  for (const ref of nodes(source, ts.isIdentifier)) if (symbol(ref)?.valueDeclaration === decoder.reader && ref !== readerImport.name)
    need(ref === payload.initializer.expression, ref);
  const transformed = ts.transform(source, [factory => {
    const visit = node => {
      if (node === selected) return undefined;
      if (node === payload.initializer.expression) return ts.factory.createIdentifier(decoder.legacyParser.name.text);
      if (node === handler) return ts.factory.updateFunctionDeclaration(node, node.modifiers, node.asteriskToken, node.name,
        node.typeParameters, node.parameters.slice(0, 3), node.type, ts.visitNode(node.body, visit));
      if (ts.isImportDeclaration(node) && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
        const entries = node.importClause.namedBindings.elements.flatMap(entry => entry === readerImport
          ? [ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier(decoder.legacyParser.name.text))] : removed.has(entry) ? [] : [entry]);
        if (!entries.length && !node.importClause.name) return undefined;
        return ts.factory.updateImportDeclaration(node, node.modifiers, ts.factory.updateImportClause(node.importClause,
          node.importClause.isTypeOnly, node.importClause.name, ts.factory.updateNamedImports(node.importClause.namedBindings, entries)), node.moduleSpecifier, node.attributes);
      }
      return ts.visitEachChild(node, visit, factory);
    }; return root => ts.visitNode(root, visit);
  }]);
  let text;
  try { text = ts.createPrinter().printFile(transformed.transformed[0]); } finally { transformed.dispose(); }
  const runtime = (value, owner) => {
    const compiled = ts.transpileModule(value, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true } });
    return JSON.stringify(owner.canonical(ts.createSourceFile('runtime.js', compiled.outputText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS)));
  };
  need(runtime(text, context) === runtime(previous.text, rollbackContext), source);
  return { status: 'conditional', source, previous, handler, selected, payload, text, handlerCalls, removed, builtinOmissions,
    outstanding: ['actual legacy/familyA absence at this handler', 'fourth argument and config supplier lemma',
      'all removed owned imports/eager effects and full declaration context', 'actual successful DEFAULT collection and builtin presence in old entries'] };
}

function finiteSelectedGuideNativeTerms(ts, context, rollbackContext, decoder) {
  const fail = node => { throw { reason: 'SELECTED_GUIDE_NATIVE_RESIDUAL_UNKNOWN', node }; };
  const need = (condition, node) => { if (!condition) fail(node); };
  const path = 'packages/domain/src/agent/native-agent-execution.ts';
  const source = context.program.getSourceFile(resolve(context.root, path)), previous = rollbackContext.program.getSourceFile(resolve(rollbackContext.root, path));
  need(source && previous && decoder?.capable && decoder.status === 'conditional', source);
  const nodes = (root, predicate) => { const values = []; const visit = node => {
    if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)
      || ts.isImportDeclaration(node) && node.importClause?.isTypeOnly || ts.isImportSpecifier(node) && node.isTypeOnly) return;
    if (predicate(node)) values.push(node); ts.forEachChild(node, visit);
  }; visit(root); return values; };
  const one = (values, node) => { need(values.length === 1, node); return values[0]; };
  const symbol = node => { let value = context.checker.getSymbolAtLocation(node);
    if (value?.flags & ts.SymbolFlags.Alias) value = context.checker.getAliasedSymbol(value); return value; };
  const fn = name => one(source.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name), source);
  const selector = fn('selectedGuide');
  const grammar = ts.createSourceFile('selector.ts', `function selectedGuide(task: { kind: string; payload: unknown } | null) {
    if (task?.kind !== 'workspace.guide') return undefined;
    const payload = readWorkspaceGuidePayloadWithSelectedImage(task.payload);
    return payload.context.presentation?.selectedImageAssetId ? payload : undefined;
  }`, ts.ScriptTarget.ES2022, true).statements[0];
  need(JSON.stringify(context.canonical(selector)) === JSON.stringify(context.canonical(grammar)), selector);
  const read = one(nodes(selector, ts.isCallExpression), selector);
  need(symbol(read.expression)?.valueDeclaration === decoder.reader, read);
  const owners = new Set(['requireNativeAgentExecutionAuthority', 'compareNativeAgentCheckpoint', 'requireNativeIllustrationTerminalSource', 'nativeAgentTerminalResult'].map(fn));
  const taskSymbols = new Map(), markerSymbols = new Map();
  for (const owner of owners) {
    const task = one([...owner.parameters.filter(node => ts.isIdentifier(node.name) && node.name.text === 'task'),
      ...nodes(owner.body, node => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'task')], owner);
    taskSymbols.set(owner, symbol(task.name));
    const markers = nodes(owner.body, node => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'marker');
    if (markers.length) markerSymbols.set(owner, symbol(one(markers, owner).name));
  }
  const ownerOf = node => { let parent = node.parent; while (parent && !owners.has(parent)) parent = parent.parent; return parent; };
  const member = (node, name, base) => ts.isPropertyAccessExpression(node) && node.name.text === name && symbol(node.expression) === base;
  const equals = (node, name, base, value) => ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
    && member(node.left, name, base) && ts.isStringLiteral(node.right) && node.right.text === value;
  const selectedPair = node => {
    const owner = ownerOf(node);
    return owner && ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
      && equals(node.left, 'profile', markerSymbols.get(owner), 'paper-illustration')
      && equals(node.right, 'kind', taskSymbols.get(owner), 'workspace.guide');
  };
  const selectedCall = node => ts.isCallExpression(node) && symbol(node.expression) === symbol(selector.name)
    && node.arguments.length === 1 && ts.isIdentifier(node.arguments[0]) && symbol(node.arguments[0]) === taskSymbols.get(ownerOf(node));
  const absent = new Map(), removed = new Set([selector]), selectedRegions = [];
  for (const owner of owners) for (const statement of owner.body.statements) if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      const init = declaration.initializer;
      if (init && (selectedCall(init) || ts.isConditionalExpression(init) && selectedPair(init.condition))) {
        need(statement.declarationList.declarations.length === 1 && statement.declarationList.flags & ts.NodeFlags.Const, statement);
        if (ts.isConditionalExpression(init)) need(selectedCall(init.whenTrue) && ts.isIdentifier(init.whenFalse) && init.whenFalse.text === 'undefined'
          && !symbol(init.whenFalse)?.declarations?.some(node => !node.getSourceFile().isDeclarationFile), init);
        absent.set(symbol(declaration.name), declaration); removed.add(statement);
      }
    }
  }
  const falseValue = node => {
    if (selectedPair(node) || selectedCall(node) || ts.isIdentifier(node) && absent.has(symbol(node))) return true;
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && falseValue(node.right)) {
      const owner = ownerOf(node);
      need(owner && equals(node.left, 'profile', markerSymbols.get(owner), 'paper-illustration'), node.left); return true;
    }
    return false;
  };
  for (const owner of owners) for (const statement of owner.body.statements) if (ts.isIfStatement(statement) && falseValue(statement.expression)) {
    need(!statement.elseStatement, statement); selectedRegions.push(statement); removed.add(statement);
  }
  need(selectedRegions.length === 4 && absent.size === 2, source);
  const insideRemoved = node => [...removed].some(parent => node.pos >= parent.pos && node.end <= parent.end && node.getSourceFile() === source);
  for (const ref of nodes(source, ts.isIdentifier)) if (symbol(ref) === symbol(selector.name) && ref !== selector.name)
    need(insideRemoved(ref) || selectedCall(ref.parent) && owners.has(ownerOf(ref)), ref);
  const oldImports = new Map();
  for (const statement of previous.statements) if (ts.isImportDeclaration(statement) && statement.importClause && !statement.importClause.isTypeOnly
    && statement.importClause.namedBindings && ts.isNamedImports(statement.importClause.namedBindings))
    oldImports.set(statement.moduleSpecifier.text, new Set(statement.importClause.namedBindings.elements.filter(node => !node.isTypeOnly).map(node => (node.propertyName ?? node.name).text)));
  const removedImports = new Set(), builtinOmissions = [];
  for (const statement of source.statements) if (ts.isImportDeclaration(statement) && statement.importClause && !statement.importClause.isTypeOnly
    && statement.importClause.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)) for (const entry of statement.importClause.namedBindings.elements) if (!entry.isTypeOnly) {
    const imported = (entry.propertyName ?? entry.name).text;
    if (oldImports.get(statement.moduleSpecifier.text)?.has(imported)) continue;
    const local = context.checker.getSymbolAtLocation(entry.name); need(local, entry);
    for (const ref of nodes(source, ts.isIdentifier)) if (context.checker.getSymbolAtLocation(ref) === local && ref !== entry.name && ref !== entry.propertyName) need(insideRemoved(ref), ref);
    if (imported === 'createHash') { need(statement.moduleSpecifier.text === 'node:crypto', entry); builtinOmissions.push({ specifier: 'node:crypto', binding: entry }); }
    else need(symbol(entry.name)?.declarations?.some(node => !node.getSourceFile().isDeclarationFile
      && /^(?:apps|packages)\//u.test(relative(context.root, node.getSourceFile().fileName).replaceAll('\\', '/'))), entry);
    removedImports.add(entry);
  }
  const transformed = ts.transform(source, [factory => { const visit = node => {
    if (removed.has(node)) return undefined;
    if (ts.isConditionalExpression(node) && falseValue(node.condition)) return ts.visitNode(node.whenFalse, visit);
    if (ts.isImportDeclaration(node) && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
      const entries = node.importClause.namedBindings.elements.filter(entry => !removedImports.has(entry));
      if (!entries.length && !node.importClause.name) return undefined;
      return ts.factory.updateImportDeclaration(node, node.modifiers, ts.factory.updateImportClause(node.importClause, node.importClause.isTypeOnly,
        node.importClause.name, ts.factory.updateNamedImports(node.importClause.namedBindings, entries)), node.moduleSpecifier, node.attributes);
    }
    return ts.visitEachChild(node, visit, factory);
  }; return root => ts.visitNode(root, visit); }]);
  let text;
  try { text = ts.createPrinter().printFile(transformed.transformed[0]); } finally { transformed.dispose(); }
  const runtime = (text, owner) => JSON.stringify(owner.canonical(ts.createSourceFile('runtime.js', ts.transpileModule(text,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true } }).outputText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS)));
  need(runtime(text, context) === runtime(previous.text, rollbackContext), source);
  return { status: 'conditional', source, previous, text, selector, owners, absent, selectedRegions, removed, removedImports, builtinOmissions,
    outstanding: ['legacy kind/profile/payload and retained-history familyA premise', 'positive selected reader/final/retry familyB contract',
      'global import/declaration/namespace closure', 'actual successful DEFAULT contexts and all remaining entries'] };
}

function finiteSelectedGuideHandlerTerms(ts, context, rollbackContext) {
  const fail = node => { throw { reason: 'SELECTED_GUIDE_HANDLER_INITIALIZATION_CHANGED', node }; };
  const need = (condition, node) => { if (!condition) fail(node); };
  const nodes = (scope, predicate) => {
    const found = []; const visit = node => {
      if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
      if (predicate(node)) found.push(node); ts.forEachChild(node, visit);
    }; visit(scope); return found;
  };
  const one = (values, node) => { need(values.length === 1, node); return values[0]; };
  const source = (ctx, file) => {
    const parsed = ctx.program.getSourceFile(resolve(ctx.root, file));
    need(parsed && !parsed.isDeclarationFile && ctx.program.getTypeChecker() === ctx.checker, parsed); return parsed;
  };
  const fn = (parsed, name) => one(parsed.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name), parsed);
  const symbol = node => {
    let value = ts.isIdentifier(node) && ts.isShorthandPropertyAssignment(node.parent)
      ? context.checker.getShorthandAssignmentValueSymbol(node.parent) : context.checker.getSymbolAtLocation(node);
    if (value?.flags & ts.SymbolFlags.Alias) value = context.checker.getAliasedSymbol(value); return value;
  };
  const unwrap = raw => {
    let node = raw; while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node))) node = node.expression;
    return node;
  };
  const property = (object, name) => one(object.properties.filter(node => ts.isPropertyAssignment(node)
    && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) && node.name.text === name), object);
  const equal = (left, right) => JSON.stringify(context.canonical(left)) === JSON.stringify(rollbackContext.canonical(right));
  const current = source(context, 'apps/agent-worker/src/index.ts'), previous = source(rollbackContext, 'apps/agent-worker/src/index.ts');
  const factory = fn(current, 'createHandlers'), oldFactory = fn(previous, 'createHandlers');
  need(factory.parameters.length === 2 && oldFactory.parameters.length === 2 && factory.body?.statements.length === 3
    && oldFactory.body?.statements.length === 2, factory);
  need(equal(factory.body.statements[0], oldFactory.body.statements[0]), factory);
  const declarationStatement = factory.body.statements[1];
  need(ts.isVariableStatement(declarationStatement) && Boolean(declarationStatement.declarationList.flags & ts.NodeFlags.Const)
    && declarationStatement.declarationList.declarations.length === 1, declarationStatement);
  const native = declarationStatement.declarationList.declarations[0], conditional = unwrap(native.initializer);
  need(ts.isIdentifier(native.name) && ts.isConditionalExpression(conditional) && ts.isObjectLiteralExpression(conditional.whenTrue)
    && ts.isIdentifier(conditional.whenFalse) && conditional.whenFalse.text === 'undefined', native);
  const table = factory.body.statements[2], oldTable = oldFactory.body.statements[1];
  need(ts.isReturnStatement(table) && ts.isObjectLiteralExpression(table.expression)
    && ts.isReturnStatement(oldTable) && ts.isObjectLiteralExpression(oldTable.expression), table);
  const presentation = property(table.expression, 'presentation.generate'), oldPresentation = property(oldTable.expression, 'presentation.generate');
  need(ts.isCallExpression(presentation.initializer) && ts.isCallExpression(oldPresentation.initializer)
    && presentation.initializer.arguments.length === 1 && oldPresentation.initializer.arguments.length === 1
    && ts.isObjectLiteralExpression(presentation.initializer.arguments[0]) && ts.isObjectLiteralExpression(oldPresentation.initializer.arguments[0]), presentation);
  const oldSpread = one(oldPresentation.initializer.arguments[0].properties.filter(ts.isSpreadAssignment), oldPresentation);
  const oldConditional = unwrap(oldSpread.expression);
  need(ts.isConditionalExpression(oldConditional) && ts.isObjectLiteralExpression(oldConditional.whenTrue)
    && ts.isObjectLiteralExpression(oldConditional.whenFalse) && !oldConditional.whenFalse.properties.length, oldSpread);
  const oldNative = property(oldConditional.whenTrue, 'nativeAgent');
  need(oldConditional.whenTrue.properties.length === 1 && equal(conditional.condition, oldConditional.condition)
    && equal(conditional.whenTrue, oldNative.initializer), native);
  const spread = one(presentation.initializer.arguments[0].properties.filter(ts.isSpreadAssignment), presentation);
  const newConditional = unwrap(spread.expression);
  need(ts.isConditionalExpression(newConditional) && ts.isIdentifier(newConditional.condition)
    && symbol(newConditional.condition) === symbol(native.name) && ts.isObjectLiteralExpression(newConditional.whenTrue)
    && newConditional.whenTrue.properties.length === 1 && ts.isShorthandPropertyAssignment(newConditional.whenTrue.properties[0])
    && newConditional.whenTrue.properties[0].name.text === 'nativeAgent'
    && symbol(newConditional.whenTrue.properties[0].name) === symbol(native.name)
    && ts.isObjectLiteralExpression(newConditional.whenFalse) && !newConditional.whenFalse.properties.length, spread);
  const guide = property(table.expression, 'workspace.guide');
  need(ts.isArrowFunction(guide.initializer) && ts.isCallExpression(guide.initializer.body)
    && guide.initializer.body.arguments.length === 4 && symbol(guide.initializer.body.arguments[3]) === symbol(native.name), guide);
  const guideCall = guide.initializer.body;
  const nativeUses = nodes(factory, node => ts.isIdentifier(node) && symbol(node) === symbol(native.name));
  need(nativeUses.length === 4 && nativeUses.every(node => node === native.name || node === newConditional.condition
    || node === newConditional.whenTrue.properties[0].name || node === guideCall.arguments[3]), native);
  // Before the old Native initializer the table allocates closure values only.
  // The combined voice reader adds one concrete factory before that initializer.
  // Its call can commute only after binding its complete allocation-only body,
  // omitted fresh options and actual data-only createHandlers suppliers below.
  const before = oldTable.expression.properties.slice(0, oldTable.expression.properties.indexOf(oldPresentation));
  let voicePredecessor;
  const bound = (owner, node) => {
    let value = ts.isIdentifier(node) && ts.isShorthandPropertyAssignment(node.parent)
      ? owner.checker.getShorthandAssignmentValueSymbol(node.parent) : owner.checker.getSymbolAtLocation(node);
    if (value?.flags & ts.SymbolFlags.Alias) value = owner.checker.getAliasedSymbol(value); return value;
  };
  for (const [index, node] of before.entries()) {
    if (ts.isPropertyAssignment(node) && (ts.isStringLiteral(node.name) || ts.isIdentifier(node.name))
      && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) continue;
    const currentSpread = table.expression.properties[index];
    need(index === 0 && !voicePredecessor && ts.isSpreadAssignment(node) && ts.isSpreadAssignment(currentSpread), node);
    const currentVoice = source(context, 'apps/agent-worker/src/voice.ts');
    const oldVoice = source(rollbackContext, 'apps/agent-worker/src/voice.ts');
    const voiceFactory = fn(currentVoice, 'createHermesVoiceHandlers'), oldVoiceFactory = fn(oldVoice, 'createHermesVoiceHandlers');
    need(equal(voiceFactory, oldVoiceFactory), voiceFactory);
    const callShape = (owner, spreadNode, handlerFactory, target) => {
      const call = unwrap(spreadNode.expression);
      need(ts.isCallExpression(call) && ts.isIdentifier(call.expression) && !call.questionDotToken
        && bound(owner, call.expression)?.valueDeclaration === target && call.arguments.length === 1, spreadNode);
      const argument = call.arguments[0];
      need(ts.isPropertyAccessExpression(argument) && !argument.questionDotToken && argument.name.text === 'voiceRuntime'
        && ts.isIdentifier(argument.expression) && bound(owner, argument.expression) === bound(owner, handlerFactory.parameters[1].name), call);
      const calls = [];
      for (const parsed of owner.program.getSourceFiles()) {
        if (parsed.isDeclarationFile || !/^(?:apps|packages)\//u.test(relative(owner.root, parsed.fileName).replaceAll('\\', '/'))) continue;
        for (const reference of nodes(parsed, ts.isIdentifier)) {
          if (bound(owner, reference)?.valueDeclaration !== target || reference === target.name
            || ts.isImportSpecifier(reference.parent) || ts.isExportSpecifier(reference.parent)) continue;
          need(reference === call.expression, reference); calls.push(reference.parent);
        }
      }
      need(calls.length === 1 && calls[0] === call, call);
      return call;
    };
    const voiceCall = callShape(context, currentSpread, factory, voiceFactory);
    const oldVoiceCall = callShape(rollbackContext, node, oldFactory, oldVoiceFactory);
    need(equal(voiceCall, oldVoiceCall), voiceCall);
    need(!voiceFactory.asteriskToken && !voiceFactory.modifiers?.some(value => value.kind === ts.SyntaxKind.AsyncKeyword)
      && voiceFactory.parameters.length === 2 && voiceFactory.parameters.every(value => ts.isIdentifier(value.name) && !value.dotDotDotToken)
      && !voiceFactory.parameters[0].initializer && voiceFactory.parameters[1].name.text === 'options'
      && voiceFactory.parameters[1].initializer && ts.isObjectLiteralExpression(voiceFactory.parameters[1].initializer)
      && voiceFactory.parameters[1].initializer.properties.length === 0 && voiceFactory.body?.statements.length === 3, voiceFactory);
    const [waitStatement, handleStatement, returned] = voiceFactory.body.statements;
    const constDeclaration = statement => {
      need(ts.isVariableStatement(statement) && Boolean(statement.declarationList.flags & ts.NodeFlags.Const)
        && statement.declarationList.declarations.length === 1 && ts.isIdentifier(statement.declarationList.declarations[0].name), statement);
      return statement.declarationList.declarations[0];
    };
    const wait = constDeclaration(waitStatement), handle = constDeclaration(handleStatement);
    const waitGrammar = ts.createSourceFile('voice-allocation.ts',
      'const wait = options.wait ?? (async milliseconds => new Promise<void>(resolve => setTimeout(resolve, milliseconds)));',
      ts.ScriptTarget.ES2022, true).statements[0];
    need(JSON.stringify(context.canonical(waitStatement)) === JSON.stringify(context.canonical(waitGrammar)), waitStatement);
    const waitInput = unwrap(wait.initializer).left;
    need(bound(context, waitInput.expression) === bound(context, voiceFactory.parameters[1].name), wait);
    need(handle.initializer && ts.isArrowFunction(handle.initializer) && ts.isBlock(handle.initializer.body)
      && handle.initializer.modifiers?.some(value => value.kind === ts.SyntaxKind.AsyncKeyword), handle);
    need(ts.isReturnStatement(returned) && ts.isObjectLiteralExpression(returned.expression)
      && returned.expression.properties.length === 2, returned);
    for (const [position, key] of ['voice.transcribe', 'voice.reply'].entries()) {
      const entry = returned.expression.properties[position];
      need(ts.isPropertyAssignment(entry) && ts.isStringLiteral(entry.name) && entry.name.text === key
        && ts.isIdentifier(entry.initializer) && bound(context, entry.initializer) === bound(context, handle.name), returned);
    }
    voicePredecessor = { factory: voiceFactory, previous: oldVoiceFactory, call: voiceCall, oldCall: oldVoiceCall, wait, handle, returned };
  }
  const handlerSource = source(context, 'apps/agent-worker/src/presentation/handler.ts');
  const handlerFactory = fn(handlerSource, 'createPresentationGenerationHandler');
  need(symbol(presentation.initializer.expression) === symbol(handlerFactory.name)
    && handlerFactory.body.statements.length === 1 && ts.isReturnStatement(handlerFactory.body.statements[0])
    && ts.isArrowFunction(handlerFactory.body.statements[0].expression), handlerFactory);
  const suppliers = [];
  for (const parsed of context.program.getSourceFiles()) {
    if (parsed.isDeclarationFile || !/^(?:apps|packages)\//u.test(relative(context.root, parsed.fileName).replaceAll('\\', '/'))) continue;
    for (const node of nodes(parsed, ts.isIdentifier)) {
      if (symbol(node) !== symbol(factory.name) || node === factory.name || ts.isImportSpecifier(node.parent) || ts.isExportSpecifier(node.parent)) continue;
      const call = node.parent;
      need(ts.isCallExpression(call) && call.expression === node && !call.questionDotToken && call.arguments.length >= 1
        && call.arguments.length <= 2 && !call.arguments.some(ts.isSpreadElement), node);
      if (call.arguments.length === 2) {
        // Whatever effects its VALUES have already happened at the call site.
        // A fresh object literal's own properties are data properties. Accessors,
        // prototype setters and escaped/opaque option objects are not admitted.
        const options = unwrap(call.arguments[1]);
        need(ts.isObjectLiteralExpression(options) && options.properties.every(value => ts.isSpreadAssignment(value)
          || (ts.isPropertyAssignment(value) || ts.isShorthandPropertyAssignment(value))
            && (ts.isIdentifier(value.name) || ts.isStringLiteral(value.name)) && value.name.text !== '__proto__'), options);
        if (voicePredecessor) {
          // In this moved interval options.voiceRuntime must be a data read.
          // A spread of an opaque object could introduce an accessor/prototype
          // premise not established by the old shallow supplier check.
          const dataObject = (raw, depth = 0) => {
            const value = unwrap(raw);
            if (!value || depth > 32) return false;
            if (ts.isConditionalExpression(value)) return dataObject(value.whenTrue, depth + 1) && dataObject(value.whenFalse, depth + 1);
            return ts.isObjectLiteralExpression(value) && value.properties.every(entry => ts.isSpreadAssignment(entry)
              ? dataObject(entry.expression, depth + 1)
              : (ts.isPropertyAssignment(entry) || ts.isShorthandPropertyAssignment(entry))
                && (ts.isIdentifier(entry.name) || ts.isStringLiteral(entry.name)) && entry.name.text !== '__proto__');
          };
          need(dataObject(options), options);
        }
      }
      suppliers.push(call);
    }
  }
  need(suppliers.length > 0, factory);
  const reconstructed = ts.factory.createSpreadAssignment(ts.factory.createParenthesizedExpression(ts.factory.createConditionalExpression(
    conditional.condition, undefined, ts.factory.createObjectLiteralExpression([ts.factory.createPropertyAssignment('nativeAgent', conditional.whenTrue)]),
    undefined, ts.factory.createObjectLiteralExpression([]))));
  const transformed = ts.transform(current, [transformation => {
    const visit = node => node === declarationStatement ? undefined : node === spread ? reconstructed
      : node === guideCall ? ts.factory.updateCallExpression(node, node.expression, node.typeArguments, node.arguments.slice(0, 3))
        : ts.visitEachChild(node, visit, transformation);
    return value => ts.visitNode(value, visit);
  }]);
  let text;
  try { text = ts.createPrinter({ removeComments: true }).printFile(transformed.transformed[0]); }
  finally { transformed.dispose(); }
  return { status: 'conditional', source: current, rollback: previous, factory, oldFactory, native, suppliers, voicePredecessor, text,
    outstanding: ['complete caller inventory under successful collector supplementary source closure',
      'legacy guide branch absence before fourth argument is removed', 'complete remaining module runtime equality'] };
}

function finiteSelectedGuideIllustrationWitness(ts, context) {
  const fail = node => { throw { reason: 'SELECTED_GUIDE_ILLUSTRATION_INPUT_OR_DELEGATION_CHANGED', node }; };
  const need = (condition, node) => { if (!condition) fail(node); };
  const nodes = (scope, predicate, skipNested = false) => {
    const result = []; const visit = node => {
      if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
      if (skipNested && node !== scope && ts.isFunctionLike(node)) return;
      if (predicate(node)) result.push(node); ts.forEachChild(node, visit);
    }; visit(scope); return result;
  };
  const one = (values, node) => { need(values.length === 1, node); return values[0]; };
  const source = (ctx, file) => { const value = ctx.program.getSourceFile(resolve(ctx.root, file)); need(value && !value.isDeclarationFile, value); return value; };
  const fn = (parsed, name) => one(parsed.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name), parsed);
  const variable = (scope, name) => {
    const declaration = one(nodes(scope, node => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name), scope);
    need(ts.isVariableDeclarationList(declaration.parent) && declaration.parent.flags & ts.NodeFlags.Const
      && declaration.parent.declarations.length === 1 && declaration.initializer, declaration); return declaration;
  };
  const symbol = node => { let value = ts.isIdentifier(node) && ts.isShorthandPropertyAssignment(node.parent)
    ? context.checker.getShorthandAssignmentValueSymbol(node.parent) : context.checker.getSymbolAtLocation(node);
    if (value?.flags & ts.SymbolFlags.Alias) value = context.checker.getAliasedSymbol(value); return value; };
  const unwrap = raw => { let node = raw; while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node))) node = node.expression; return node; };
  const key = node => ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : undefined;
  const member = (raw, base, name) => { const node = unwrap(raw); return node && ts.isPropertyAccessExpression(node)
    && node.name.text === name && ts.isIdentifier(unwrap(node.expression)) && symbol(unwrap(node.expression)) === base; };
  const printer = ts.createPrinter({ removeComments: true });
  const equalBody = (left, right) => printer.printNode(ts.EmitHint.Unspecified, left, left.getSourceFile())
    === printer.printNode(ts.EmitHint.Unspecified, right, right.getSourceFile());
  const file = 'apps/agent-worker/src/native-agent/illustration-task.ts';
  const current = source(context, file);
  const wrapper = fn(current, 'runNativeIllustrationTask'), core = fn(current, 'runNativeIllustrationTaskCore');
  const selected = fn(current, 'runNativeSelectedImageGuideTask'), replay = fn(current, 'replayNativeVideoPlan');
  const materializer = fn(current, 'createNativeIllustrationMaterializer'), profile = fn(current, 'nativeIllustrationToolProfile');
  // These are actual declarations and checker symbols, never reconstructed nodes.
  for (const declaration of [wrapper, selected, core, replay, materializer]) need(declaration.parameters.length === 1
    && ts.isIdentifier(declaration.parameters[0].name) && declaration.parameters[0].name.text === 'input'
    && !declaration.parameters[0].dotDotDotToken && !declaration.parameters[0].initializer
    && !declaration.parameters[0].questionToken, declaration);
  const profileReturns = nodes(profile.body, ts.isReturnStatement, true);
  need(profileReturns.length && profileReturns.every(node => ts.isObjectLiteralExpression(node.expression)
    && node.expression.properties.every(property => (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property))
      && key(property.name) && key(property.name) !== 'selectedImage')), profile);
  const references = target => {
    const calls = [];
    for (const parsed of context.program.getSourceFiles()) {
      if (parsed.isDeclarationFile || !/^(?:apps|packages)\//u.test(relative(context.root, parsed.fileName).replaceAll('\\', '/'))) continue;
      for (const node of nodes(parsed, ts.isIdentifier)) {
        if (symbol(node) !== symbol(target.name) || node === target.name || ts.isImportSpecifier(node.parent) || ts.isExportSpecifier(node.parent)) continue;
        need(ts.isCallExpression(node.parent) && node.parent.expression === node && !node.parent.questionDotToken
          && node.parent.arguments.length === 1 && !node.parent.arguments.some(ts.isSpreadElement), node); calls.push(node.parent);
      }
    }
    return calls;
  };
  const ordinaryCalls = references(wrapper), replayCalls = references(replay), coreCalls = references(core);
  const wrapperGrammar = ts.createSourceFile('ordinary-native-wrapper.ts', `async function ordinary(input: unknown) {
    if (input.selectedImage) stopped();
    const result = await runNativeIllustrationTaskCore(input);
    if ('reply' in result) stopped();
    return result;
  }`, ts.ScriptTarget.ES2022, true);
  need(wrapper.parameters.length === 1 && ts.isIdentifier(wrapper.parameters[0].name) && wrapper.parameters[0].name.text === 'input'
    && equalBody(wrapper.body, wrapperGrammar.statements[0].body), wrapper);
  const handler = source(context, 'apps/agent-worker/src/presentation/handler.ts');
  for (const calls of [ordinaryCalls, replayCalls]) {
    need(calls.length === 1 && calls[0].getSourceFile() === handler, calls[0]);
    const input = unwrap(calls[0].arguments[0]);
    need(ts.isObjectLiteralExpression(input) && input.properties.every(property => (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property))
      && key(property.name) && !['selectedImage', '__proto__'].includes(key(property.name))), input);
  }
  need(coreCalls.length === 2 && coreCalls.every(call => (call.pos > wrapper.pos && call.end < wrapper.end)
    || (call.pos > selected.pos && call.end < selected.end)), core);
  const wrapperCall = one(coreCalls.filter(call => call.pos > wrapper.pos && call.end < wrapper.end), wrapper);
  need(ts.isIdentifier(wrapperCall.arguments[0]) && symbol(wrapperCall.arguments[0]) === symbol(wrapper.parameters[0].name), wrapperCall);
  // The second core caller is retained, with its real await/result boundary.
  // Merely counting it would miss input effects or a substituted return value.
  const selectedGrammar = ts.createSourceFile('selected-native-wrapper.ts', `async function selected(input: unknown) {
    if (input.settings.output !== 'image' || input.settings.narrativeSceneLimit !== 1) stopped();
    generatedImageReviewAttachment(input.selectedImageAttachment.bytes, input.selectedImage.binding.contentHash, input.selectedImage.binding.mimeType);
    const result = await runNativeIllustrationTaskCore(input);
    if (result.reply !== undefined) return { kind: 'reply' as const, reply: result.reply, promptHash: result.promptHash,
      provider: result.provider!, model: result.model!, responseHash: result.responseHash! };
    return { ...result, kind: 'proposal' as const };
  }`, ts.ScriptTarget.ES2022, true);
  need(equalBody(selected.body, selectedGrammar.statements[0].body), selected);
  const selectedCoreCall = one(coreCalls.filter(call => call.pos > selected.pos && call.end < selected.end), selected);
  need(ts.isIdentifier(selectedCoreCall.arguments[0]) && symbol(selectedCoreCall.arguments[0]) === symbol(selected.parameters[0].name), selectedCoreCall);
  const selectedCalls = references(selected);
  need(selectedCalls.length === 1 && selectedCalls[0].getSourceFile() === source(context, 'apps/agent-worker/src/workspace-guide.ts'), selected);
  for (const call of [...ordinaryCalls, ...selectedCalls]) {
    need(ts.isAwaitExpression(call.parent), call);
    const object = unwrap(call.arguments[0]);
    need(ts.isObjectLiteralExpression(object) && object.properties.every(property => (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property))
      && key(property.name) && key(property.name) !== '__proto__'), object);
  }
  const constructors = references(materializer);
  need(constructors.length === 2, materializer);
  const coreInput = symbol(core.parameters[0].name), replayInput = symbol(replay.parameters[0].name);
  for (const call of constructors) {
    const owner = call.pos > core.pos && call.end < core.end ? core : call.pos > replay.pos && call.end < replay.end ? replay : undefined;
    const object = unwrap(call.arguments[0]); need(owner && ts.isObjectLiteralExpression(object), call);
    for (const property of object.properties) {
      if (ts.isSpreadAssignment(property)) need(ts.isIdentifier(unwrap(property.expression))
        && (symbol(unwrap(property.expression)) === symbol(owner.parameters[0].name)
          || owner === replay && symbol(unwrap(property.expression)) === symbol(variable(replay, 'profile').name)), property);
      else need((ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property))
        && key(property.name) && !['selectedImage', '__proto__'].includes(key(property.name)), property);
    }
  }
  const allowedSpreads = new Set(constructors.flatMap(call => unwrap(call.arguments[0]).properties.filter(ts.isSpreadAssignment).map(node => unwrap(node.expression))));
  for (const owner of [core, replay, materializer]) {
    const target = symbol(owner.parameters[0].name);
    for (const node of nodes(owner, ts.isIdentifier)) {
      if (symbol(node) !== target || node === owner.parameters[0].name) continue;
      need(ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node || allowedSpreads.has(node), node);
      if (ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node) {
        const parent = node.parent.parent;
        need(!(ts.isBinaryExpression(parent) && parent.left === node.parent && parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
          && parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment) && !ts.isDeleteExpression(parent)
          && !((ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent))
            && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(parent.operator)), node);
      }
    }
  }
  const finish = one(nodes(materializer, node => ts.isFunctionDeclaration(node) && node.name?.text === 'finish'), materializer);
  const finishReturns = nodes(finish.body, ts.isReturnStatement, true);
  need(finishReturns.length === 1 && ts.isObjectLiteralExpression(finishReturns[0].expression)
    && finishReturns[0].expression.properties.every(property => ts.isPropertyAssignment(property)
      && key(property.name) && key(property.name) !== 'reply'), finish);
  const materializerVariable = variable(core, 'materializer');
  need(ts.isCallExpression(materializerVariable.initializer) && symbol(materializerVariable.initializer.expression) === symbol(materializer.name), materializerVariable);
  const result = variable(core, 'result');
  need(ts.isCallExpression(result.initializer) && member(result.initializer.expression, symbol(materializerVariable.name), 'finish'), result);
  const profileBinding = one(nodes(core, node => ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name)
    && ts.isIdentifier(node.initializer) && symbol(node.initializer) === symbol(variable(core, 'profile').name)), core);
  const sourceTools = variable(core, 'sourceTools');
  need(ts.isConditionalExpression(sourceTools.initializer) && member(sourceTools.initializer.whenFalse, symbol(variable(core, 'profile').name), 'sourceTools'), sourceTools);
  const fieldNames = binding => binding.name.elements.map(element => { need(!element.dotDotDotToken && !element.initializer && !element.propertyName && ts.isIdentifier(element.name), element); return element.name.text; });
  const fields = fieldNames(profileBinding);
  const inputs = new Set([coreInput, replayInput, symbol(materializer.parameters[0].name), symbol(wrapper.parameters[0].name)]);
  const falseValue = raw => {
    const node = unwrap(raw);
    if (node && ts.isPropertyAccessExpression(node) && node.name.text === 'selectedImage'
      && ts.isIdentifier(unwrap(node.expression)) && inputs.has(symbol(unwrap(node.expression)))) return true;
    return node && ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && falseValue(node.left);
  };
  need(falseValue(sourceTools.initializer.condition), sourceTools);
  const paper = variable(core, 'paper');
  need(ts.isObjectLiteralExpression(paper.initializer), paper);
  const dispatch = one(paper.initializer.properties.filter(node => ts.isPropertyAssignment(node) && key(node.name) === 'call'), paper);
  need(ts.isArrowFunction(dispatch.initializer) && ts.isBlock(dispatch.initializer.body)
    && dispatch.initializer.parameters.length === 4 && dispatch.initializer.parameters.every(parameter => ts.isIdentifier(parameter.name)
      && !parameter.dotDotDotToken && !parameter.initializer), dispatch);
  const dispatchParameters = dispatch.initializer.parameters.map(parameter => symbol(parameter.name));
  const returnedDispatch = one(dispatch.initializer.body.statements.filter(ts.isReturnStatement), dispatch);
  const dispatchValue = unwrap(returnedDispatch.expression);
  need(ts.isConditionalExpression(dispatchValue), returnedDispatch);
  const condition = unwrap(dispatchValue.condition);
  need(ts.isCallExpression(condition) && member(condition.expression, dispatchParameters[0], 'startsWith')
    && condition.arguments.length === 1 && ts.isStringLiteral(condition.arguments[0])
    && condition.arguments[0].text === 'paper_illustration_', condition);
  const delegatedCall = (raw, target, indices) => { const call = unwrap(raw); return ts.isCallExpression(call)
    && member(call.expression, symbol(target.name), 'call') && call.arguments.length === indices.length
    && call.arguments.every((arg, index) => ts.isIdentifier(unwrap(arg)) && symbol(unwrap(arg)) === dispatchParameters[indices[index]]); };
  need(delegatedCall(dispatchValue.whenTrue, materializerVariable, [0, 1, 2, 3])
    && delegatedCall(dispatchValue.whenFalse, variable(core, 'source'), [0, 1]), returnedDispatch);
  const images = one(paper.initializer.properties.filter(node => ts.isPropertyAssignment(node) && key(node.name) === 'images'), paper);
  need(ts.isArrowFunction(images.initializer) && images.initializer.parameters.length === 2 && ts.isBlock(images.initializer.body), images);
  const sourceVariable = variable(core, 'source');
  need(ts.isCallExpression(sourceVariable.initializer), sourceVariable);
  const paperFactory = symbol(sourceVariable.initializer.expression)?.valueDeclaration;
  need(paperFactory && ts.isFunctionDeclaration(paperFactory)
    && paperFactory.getSourceFile() === source(context, 'apps/agent-worker/src/native-agent/paper-tools.ts'), sourceVariable);
  const paperReturn = one(nodes(paperFactory.body, ts.isReturnStatement, true), paperFactory);
  need(ts.isObjectLiteralExpression(paperReturn.expression), paperReturn);
  const method = one(paperReturn.expression.properties.filter(node => ts.isMethodDeclaration(node) && key(node.name) === 'images'), paperReturn);
  for (const property of paperReturn.expression.properties) {
    need((ts.isMethodDeclaration(property) || ts.isGetAccessorDeclaration(property)) && property.body
      && !nodes(property.body, node => node.kind === ts.SyntaxKind.ThisKeyword || node.kind === ts.SyntaxKind.SuperKeyword
        || ts.isIdentifier(node) && node.text === 'arguments').length, property);
  }
  const hostCall = one(nodes(core, node => ts.isCallExpression(node) && ts.isIdentifier(node.expression)
    && node.expression.text === 'runHostedNativeTask'), core);
  const host = symbol(hostCall.expression)?.valueDeclaration;
  need(host && ts.isFunctionDeclaration(host) && host.getSourceFile() === source(context, 'apps/agent-worker/src/native-agent/host-task.ts'), hostCall);
  const hostInput = symbol(host.parameters[0].name);
  for (const access of nodes(host, node => ts.isPropertyAccessExpression(node) && member(node, hostInput, 'paper'))) {
    const property = access.parent;
    need(ts.isPropertyAccessExpression(property) && property.expression === access
      && ['observedPassageIds', 'call', 'images', 'withAuthorizedToolCall'].includes(property.name.text), access);
    if (property.name.text === 'images') need(ts.isCallExpression(property.parent) && property.parent.expression === property
      && property.parent.arguments.length === 2 && !property.parent.arguments.some(ts.isSpreadElement), property);
  }
  const delegated = one(images.initializer.body.statements.filter(ts.isReturnStatement), images);
  need(ts.isCallExpression(delegated.expression) && member(delegated.expression.expression, symbol(sourceVariable.name), 'images')
    && delegated.expression.arguments.length === 2 && delegated.expression.arguments.every((arg, index) =>
      ts.isIdentifier(arg) && symbol(arg) === symbol(images.initializer.parameters[index].name)), delegated);
  // Ordinary absence is a conditional view only. The selected entry remains a
  // real caller: saved tool histories can select nativeVideo even for image output.
  return { status: 'conditional', source: current, wrapper, selected, core, replay, profile, materializer,
    ordinaryCalls, replayCalls, constructors, coreCalls, wrapperCall, selectedCoreCall, selectedCalls, handler, paper, images, sourceVariable,
    profileBinding, sourceTools, fields, fieldNames, falseValue, wrapperGrammar,
    need, nodes, one, readSource: source, fn, symbol, unwrap, key,
    outstanding: ['selected saved-state L/H/A family and complete caller/result authority',
      'original successful collector full residual/runtime/dependency equality'] };
}

function finiteSelectedGuideIllustrationTerms(ts, context, rollbackContext) {
  const witness = finiteSelectedGuideIllustrationWitness(ts, context);
  const { source: current, wrapper, selected, core, replay, profile, materializer, ordinaryCalls, replayCalls, constructors,
    profileBinding, sourceTools, fields, fieldNames, falseValue, wrapperGrammar, images,
    need, nodes, one, readSource: source, fn, symbol, unwrap, key } = witness;
  const equal = (left, right) => JSON.stringify(context.canonical(left)) === JSON.stringify(rollbackContext.canonical(right));
  const file = 'apps/agent-worker/src/native-agent/illustration-task.ts', previous = source(rollbackContext, file);
  const oldRun = fn(previous, 'runNativeIllustrationTask'), oldProfile = fn(previous, 'nativeIllustrationToolProfile');
  need(equal(profile, oldProfile), profile);
  need(equal(wrapper.body, wrapperGrammar.statements[0].body), wrapper);
  const originalBinding = one(nodes(oldRun, node => ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name)
    && ts.isIdentifier(node.initializer) && node.initializer.text === 'profile'), oldRun);
  const originalFields = fieldNames(originalBinding);
  need(originalFields.filter(name => name !== 'sourceTools').join(',') === fields.join(','), profileBinding);
  const removed = new Set([wrapper, selected, sourceTools.parent.parent, images]);
  const emptySpread = node => {
    if (!ts.isSpreadAssignment(node) && !ts.isSpreadElement(node)) return false;
    const condition = unwrap(node.expression);
    return ts.isConditionalExpression(condition) && falseValue(condition.condition)
      && (ts.isObjectLiteralExpression(condition.whenFalse) && !condition.whenFalse.properties.length
        || ts.isArrayLiteralExpression(condition.whenFalse) && !condition.whenFalse.elements.length);
  };
  const transformed = ts.transform(current, [transformation => {
    const visit = node => {
      if (removed.has(node)) return undefined;
      if (ts.isIfStatement(node) && falseValue(node.expression)) { removed.add(node); return undefined; }
      if (emptySpread(node)) { removed.add(node); return undefined; }
      if (ts.isConditionalExpression(node) && falseValue(node.condition)) return ts.visitNode(node.whenFalse, visit);
      if (node === profileBinding.name) return ts.factory.createObjectBindingPattern(originalFields.map(name => ts.factory.createBindingElement(undefined, undefined, name)));
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        const right = unwrap(node.right);
        if (ts.isConditionalExpression(right) && falseValue(right.condition) && ts.isStringLiteral(right.whenFalse) && !right.whenFalse.text) {
          need(ts.isCallExpression(node.left) && ts.isPropertyAccessExpression(node.left.expression)
            && node.left.expression.name.text === 'join', node); return ts.visitNode(node.left, visit);
        }
      }
      if (ts.isArrowFunction(node) && ts.isBlock(node.body)) {
        const body = ts.visitNode(node.body, visit);
        return ts.factory.updateArrowFunction(node, node.modifiers, node.typeParameters, node.parameters, node.type, node.equalsGreaterThanToken,
          node.body.statements.length > 1 && body.statements.length === 1 && ts.isReturnStatement(body.statements[0]) ? body.statements[0].expression : body);
      }
      if (node === core) return ts.factory.updateFunctionDeclaration(node, wrapper.modifiers, node.asteriskToken, wrapper.name,
        node.typeParameters, node.parameters, node.type, ts.visitNode(node.body, visit));
      if (ts.isVariableStatement(node) && node.declarationList.declarations.every(declaration => ts.isIdentifier(declaration.name)
        && ['imageReceipt', 'selectedImageCaption'].includes(declaration.name.text))) {
        need(node.declarationList.declarations.every(declaration => ts.isConditionalExpression(declaration.initializer)
          && falseValue(declaration.initializer.condition) && ts.isIdentifier(declaration.initializer.whenFalse)
          && declaration.initializer.whenFalse.text === 'undefined'), node); removed.add(node); return undefined;
      }
      return ts.visitEachChild(node, visit, transformation);
    };
    return value => ts.visitNode(value, visit);
  }]);
  let text;
  try { text = ts.createPrinter({ removeComments: true }).printFile(transformed.transformed[0]); }
  finally { transformed.dispose(); }
  const parsed = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
  const projectedRun = fn(parsed, 'runNativeIllustrationTask');
  const emittedFunction = declaration => {
    const output = ts.transpileModule(declaration.getText(), { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true } });
    return context.canonical(ts.createSourceFile('runtime.js', output.outputText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS));
  };
  need(JSON.stringify(emittedFunction(projectedRun)) === JSON.stringify(emittedFunction(oldRun)), projectedRun);
  return { status: 'conditional', source: current, rollback: previous, wrapper, selected, core, replay, profile, materializer, removed,
    ordinaryCalls, replayCalls, constructors, text,
    outstanding: ['selected caller dominance and complete retained wrapper-result family',
      'selected schema initializer and complete declaration/import residual closure', 'original successful collector supplementary caller inventory'] };
}

function finiteSelectedGuideIllustrationResidualTerms(ts, context, rollbackContext, illustration, initialization) {
  const fail = node => { throw { reason: 'SELECTED_GUIDE_ILLUSTRATION_RESIDUAL_UNKNOWN', node }; };
  const need = (condition, node) => { if (!condition) fail(node); };
  need(illustration?.status === 'conditional' && initialization?.status === 'conditional', undefined);
  const { source, rollback } = illustration;
  need(context.program.getSourceFile(source.fileName) === source && rollbackContext.program.getSourceFile(rollback.fileName) === rollback, source);
  const declarations = source.statements.filter(ts.isVariableStatement).flatMap(node => node.declarationList.declarations)
    .filter(node => ts.isIdentifier(node.name) && node.name.text === 'SELECTED_IMAGE_TOOLS');
  need(declarations.length === 1 && initialization.pureInitializers.includes(declarations[0])
    && !declarations[0].parent.parent.modifiers?.some(node => node.kind === ts.SyntaxKind.ExportKeyword), source);
  const tool = declarations[0], target = context.checker.getSymbolAtLocation(tool.name);
  const inside = node => [...illustration.removed].some(parent => node.getSourceFile() === source && node.pos >= parent.pos && node.end <= parent.end);
  const identifiers = [], visit = node => {
    if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
    if (ts.isIdentifier(node)) identifiers.push(node); ts.forEachChild(node, visit);
  }; visit(source);
  for (const ref of identifiers) if (context.checker.getSymbolAtLocation(ref) === target && ref !== tool.name) need(inside(ref), ref);
  const added = source.statements.filter(node => ts.isImportDeclaration(node) && node.moduleSpecifier.text === '../presentation/generated-image-review'
    && node.importClause && !node.importClause.isTypeOnly && node.importClause.namedBindings && ts.isNamedImports(node.importClause.namedBindings));
  need(added.length === 1 && added[0].importClause.namedBindings.elements.length === 1, source);
  const binding = added[0].importClause.namedBindings.elements[0];
  need(!binding.isTypeOnly && binding.name.text === 'generatedImageReviewAttachment' && !binding.propertyName, binding);
  const imported = context.checker.getSymbolAtLocation(binding.name); need(imported, binding);
  for (const ref of identifiers) if (context.checker.getSymbolAtLocation(ref) === imported && ref !== binding.name) need(inside(ref), ref);
  const projected = ts.createSourceFile(source.fileName, illustration.text, ts.ScriptTarget.ES2022, true);
  const selectedTools = projected.statements.filter(ts.isVariableStatement).filter(node => node.declarationList.declarations.some(value => value.name.text === tool.name.text));
  need(selectedTools.length === 1 && JSON.stringify(context.canonical(selectedTools[0])) === JSON.stringify(context.canonical(tool.parent.parent)), source);
  const removedImport = projected.statements.filter(node => ts.isImportDeclaration(node) && node.moduleSpecifier.text === added[0].moduleSpecifier.text
    && !node.importClause?.isTypeOnly && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)
    && node.importClause.namedBindings.elements.some(entry => entry.name.text === binding.name.text));
  need(removedImport.length === 1 && JSON.stringify(context.canonical(removedImport[0])) === JSON.stringify(context.canonical(added[0])), source);
  const text = ts.createPrinter().printFile(ts.factory.updateSourceFile(projected,
    projected.statements.filter(node => node !== selectedTools[0] && node !== removedImport[0])));
  const runtime = (value, owner) => JSON.stringify(owner.canonical(ts.createSourceFile('runtime.js', ts.transpileModule(value,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true } }).outputText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS)));
  need(runtime(text, context) === runtime(rollback.text, rollbackContext), source);
  return { status: 'conditional', source, rollback, text, illustration, initialization, tool,
    outstanding: ['complete selected-vs-ordinary root/history and wrapper outcome families', 'module import/eager order and namespace observers',
      'actual DEFAULT collection and complete remaining entries'] };
}

function finiteSelectedGuideDormantModuleTerms(ts, context, rollbackContext, decoder) {
  const fail = node => { throw { reason: 'SELECTED_GUIDE_DORMANT_MODULE_UNKNOWN', node }; };
  const need = (condition, node) => { if (!condition) fail(node); };
  need(decoder?.status === 'conditional' && decoder.capable, undefined);
  const module = path => { const source = context.program.getSourceFile(resolve(context.root, path));
    const previous = rollbackContext.program.getSourceFile(resolve(rollbackContext.root, path)); need(source && previous, source); return { source, previous }; };
  const symbol = node => { let value = context.checker.getSymbolAtLocation(node);
    if (value?.flags & ts.SymbolFlags.Alias) value = context.checker.getAliasedSymbol(value); return value; };
  const nodes = (root, predicate) => { const values = []; const visit = node => {
    if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
    if (predicate(node)) values.push(node); ts.forEachChild(node, visit);
  }; visit(root); return values; };
  const runtime = (value, owner) => JSON.stringify(owner.canonical(ts.createSourceFile('runtime.js', ts.transpileModule(value,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true } }).outputText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS)));
  const contract = module('packages/domain/src/agent/workspace-guide-contract.ts'), scene = module('packages/domain/src/assets/scene-image.ts');
  need(contract.source === decoder.source, decoder.reader);
  const removed = new Set();
  for (const [entry, names] of [[contract, ['workspaceSelectedImageDraftSource', 'readWorkspaceSelectedImageDraft', 'readWorkspaceSelectedImageReference', decoder.reader.name.text]],
    [scene, ['requireSelectedImageSource']]]) for (const name of names) {
    const functions = entry.source.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    need(functions.length === 1 && functions[0].body && !functions[0].asteriskToken
      && !(functions[0].modifiers ?? []).some(node => node.kind === ts.SyntaxKind.Decorator)
      && !entry.previous.statements.some(node => ts.isFunctionDeclaration(node) && node.name?.text === name), entry.source);
    removed.add(functions[0]);
  }
  const projections = new Map(), removedImports = new Set();
  for (const entry of [contract, scene]) {
    const oldImports = new Map();
    for (const statement of entry.previous.statements) if (ts.isImportDeclaration(statement) && statement.importClause && !statement.importClause.isTypeOnly
      && statement.importClause.namedBindings && ts.isNamedImports(statement.importClause.namedBindings))
      oldImports.set(statement.moduleSpecifier.text, new Set(statement.importClause.namedBindings.elements.filter(node => !node.isTypeOnly).map(node => (node.propertyName ?? node.name).text)));
    for (const statement of entry.source.statements) if (ts.isImportDeclaration(statement) && statement.importClause && !statement.importClause.isTypeOnly
      && statement.importClause.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)) for (const imported of statement.importClause.namedBindings.elements) if (!imported.isTypeOnly
      && !oldImports.get(statement.moduleSpecifier.text)?.has((imported.propertyName ?? imported.name).text)) {
      const local = context.checker.getSymbolAtLocation(imported.name); need(local, imported);
      for (const ref of nodes(entry.source, ts.isIdentifier)) if (context.checker.getSymbolAtLocation(ref) === local && ref !== imported.name && ref !== imported.propertyName)
        need([...removed].some(fn => fn.getSourceFile() === entry.source && ref.pos >= fn.pos && ref.end <= fn.end), ref);
      need(symbol(imported.name)?.declarations?.some(node => !node.getSourceFile().isDeclarationFile
        && /^(?:apps|packages)\//u.test(relative(context.root, node.getSourceFile().fileName).replaceAll('\\', '/'))), imported);
      removedImports.add(imported);
    }
    const statements = entry.source.statements.flatMap(statement => {
      if (removed.has(statement)) return [];
      if (ts.isImportDeclaration(statement) && statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)) {
        const elements = statement.importClause.namedBindings.elements.filter(node => !removedImports.has(node));
        if (!elements.length && !statement.importClause.name) return [];
        return [ts.factory.updateImportDeclaration(statement, statement.modifiers, ts.factory.updateImportClause(statement.importClause,
          statement.importClause.isTypeOnly, statement.importClause.name, ts.factory.updateNamedImports(statement.importClause.namedBindings, elements)), statement.moduleSpecifier, statement.attributes)];
      }
      return [statement];
    });
    const text = ts.createPrinter().printFile(ts.factory.updateSourceFile(entry.source, statements));
    need(runtime(text, context) === runtime(entry.previous.text, rollbackContext), entry.source);
    projections.set(relative(context.root, entry.source.fileName).replaceAll('\\', '/'), { ...entry, text });
  }
  const index = module('packages/domain/src/index.ts'), removedExports = [];
  const statements = index.source.statements.flatMap(statement => {
    if (!ts.isExportDeclaration(statement) || !statement.exportClause || !ts.isNamedExports(statement.exportClause)) return [statement];
    const elements = statement.exportClause.elements.filter(node => {
      const target = symbol(node.propertyName ?? node.name)?.valueDeclaration;
      if (!removed.has(target)) return true;
      removedExports.push(node); return false;
    });
    return elements.length ? [ts.factory.updateExportDeclaration(statement, statement.modifiers, statement.isTypeOnly,
      ts.factory.updateNamedExports(statement.exportClause, elements), statement.moduleSpecifier, statement.attributes)] : [];
  });
  need(removedExports.length === removed.size, index.source);
  const text = ts.createPrinter().printFile(ts.factory.updateSourceFile(index.source, statements));
  need(runtime(text, context) === runtime(index.previous.text, rollbackContext), index.source);
  projections.set('packages/domain/src/index.ts', { ...index, text });
  return { status: 'conditional', projections, removed, removedImports, removedExports,
    outstanding: ['complete legacy call-domain and declaration/namespace reference closure', 'selected source/DTO positive contracts for familyB',
      'import initialization/order and actual successful DEFAULT contexts'] };
}

function finiteSelectedGuidePublicReaderTerms(ts, context, rollbackContext) {
  const fail = node => { throw { reason: 'SELECTED_GUIDE_PUBLIC_READER_UNKNOWN', node }; };
  const need = (value, node) => { if (!value) fail(node); };
  const path = 'packages/domain/src/agent/agent.ts';
  const source = context.program.getSourceFile(resolve(context.root, path));
  const oldSource = rollbackContext.program.getSourceFile(resolve(rollbackContext.root, path));
  need(source && oldSource, source);
  const one = (values, node) => { need(values.length === 1, node); return values[0]; };
  const fn = (parsed, name) => one(parsed.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name), parsed);
  const current = fn(source, 'projectAgentTaskResult'), previous = fn(oldSource, 'projectAgentTaskResult');
  const taskView = fn(source, 'taskToView'), previousTaskView = fn(oldSource, 'taskToView');
  const nodes = (root, predicate, nested = true) => { const result = []; const visit = node => {
    if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
    if (!nested && node !== root && ts.isFunctionLike(node)) return;
    if (predicate(node)) result.push(node); ts.forEachChild(node, visit);
  }; visit(root); return result; };
  const symbol = node => { let value = context.checker.getSymbolAtLocation(node);
    if (value?.flags & ts.SymbolFlags.Alias) value = context.checker.getAliasedSymbol(value); return value; };
  const shape = (actual, text) => {
    const grammar = ts.createSourceFile('task-bound-public-reader.ts', text, ts.ScriptTarget.ES2022, true);
    need(!grammar.parseDiagnostics.length && grammar.statements.length === 1, actual);
    need(JSON.stringify(context.canonical(actual)) === JSON.stringify(context.canonical(grammar.statements[0])), actual);
  };
  need(current.parameters.length === 3 && current.parameters[2].questionToken && !current.parameters[2].initializer
    && current.parameters.every(parameter => ts.isIdentifier(parameter.name))
    && current.parameters.map(parameter => parameter.name.text).join(',') === 'rawResult,kind,task', current);
  const statements = [...current.body.statements];
  const start = statements.findIndex(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(value => value.name.text === 'ordinary'));
  need(start >= 0, current);
  const region = statements.slice(start, start + 7);
  need(region.length === 7, current);
  shape(region[0], 'let ordinary = false;');
  need(ts.isVariableStatement(region[1]) && region[1].declarationList.declarations.length === 1
    && region[1].declarationList.declarations[0].name.text === 'selectedReference' && !region[1].declarationList.declarations[0].initializer, region[1]);
  need(ts.isVariableStatement(region[2]) && region[2].declarationList.declarations.length === 1
    && region[2].declarationList.declarations[0].name.text === 'selectedDraft' && !region[2].declarationList.declarations[0].initializer, region[2]);
  const attempt = region[3]; need(ts.isTryStatement(attempt) && attempt.catchClause && !attempt.finallyBlock, attempt);
  const body = attempt.tryBlock.statements;
  need(body.length === 6, attempt);
  shape(body[0], `if (!task || task.kind !== kind || task.result !== rawResult || !task.id || !task.sessionId
    || !isJsonRecord(task.payload) || !Number.isSafeInteger(task.executionAttempt) || task.executionAttempt < 0) throw new Error('Missing task provenance');`);
  shape(body[1], 'const context = task.payload.context;');
  shape(body[2], 'const presentation = isJsonRecord(context) ? context.presentation : undefined;');
  shape(body[3], "const selectedRequest = isJsonRecord(presentation) && Object.hasOwn(presentation, 'selectedImageAssetId');");
  shape(body[4], 'const marker = readNativeAgentExecution(rawResult);');
  const choice = body[5]; need(ts.isIfStatement(choice) && ts.isIdentifier(choice.expression) && choice.expression.text === 'selectedRequest'
    && ts.isBlock(choice.thenStatement) && choice.elseStatement && ts.isBlock(choice.elseStatement), choice);
  shape(choice.thenStatement.statements[0], "if (kind !== 'workspace.guide' || marker?.profile !== 'paper-illustration') throw new Error('Invalid selected task');");
  shape(choice.elseStatement, `{
    if (kind === 'workspace.guide') readWorkspaceGuidePayloadWithSelectedImage(task.payload);
    if (marker) {
      const expectedKind = ['paper-understanding', 'paper-author', 'paper-source-review'].includes(marker.profile) ? 'sdf.extract'
        : ['paper-illustration', 'image-review'].includes(marker.profile) ? 'presentation.generate' : 'journal.generate';
      if (kind !== expectedKind || marker.checkpoint && marker.checkpoint.taskId !== task.id) throw new Error('Contradictory native association');
    }
    ordinary = true;
  }`);
  shape(attempt.catchClause.block, '{ selectedReference = undefined; selectedDraft = undefined; }');
  shape(region[4], `if (!ordinary) {
    delete publicResult.selectedImageContext; delete publicResult.selectedImageReply;
    delete publicResult.selectedImageReference; delete publicResult.selectedImageDraft;
  }`);
  shape(region[5], 'if (selectedReference) publicResult.selectedImageReference = selectedReference;');
  shape(region[6], 'if (selectedDraft) publicResult.selectedImageDraft = selectedDraft;');
  // Only the authenticated ordinary branch may preserve opaque private-key
  // extensions. Selected/unknown records cannot turn decoder failure into it.
  const ordinary = symbol(region[0].declarationList.declarations[0].name);
  const refs = nodes(current.body, node => ts.isIdentifier(node) && symbol(node) === ordinary);
  need(refs.length === 3 && !nodes(choice.thenStatement, ts.isReturnStatement, false).length, choice);
  need(!nodes(choice.thenStatement, node => ts.isIdentifier(node) && node.text === 'publicResult').length, choice);
  // The ordinary path cannot manufacture either validated selected refill.
  // No root-field names are excluded: arbitrary ordinary opaque values reach
  // the exact old public tail, while selected/unknown take the four deletes.
  const fills = region.slice(1, 3).map(statement => statement.declarationList.declarations[0]);
  for (const fill of fills) for (const node of nodes(current.body, value => ts.isBinaryExpression(value)
    && symbol(value.left) === symbol(fill.name) && value.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
    && value.operatorToken.kind <= ts.SyntaxKind.LastAssignment))
    need(node.operatorToken.kind === ts.SyntaxKind.EqualsToken && (node.pos > choice.thenStatement.pos && node.end < choice.thenStatement.end
      || node.pos > attempt.catchClause.pos && node.end < attempt.catchClause.end), node);
  const newParameters = current.parameters.slice(0, 2);
  const projected = ts.factory.updateFunctionDeclaration(current, current.modifiers, current.asteriskToken, current.name,
    current.typeParameters, newParameters, current.type, ts.factory.updateBlock(current.body, statements.filter(node => !region.includes(node))));
  const calls = nodes(taskView, node => ts.isCallExpression(node) && symbol(node.expression)?.valueDeclaration === current);
  const call = one(calls, taskView);
  shape(ts.factory.createExpressionStatement(call), 'projectAgentTaskResult(task.result, task.kind, task);');
  const task = symbol(taskView.parameters[0].name);
  need(nodes(call, node => ts.isIdentifier(node) && node.text === 'task').every(node => symbol(node) === task), call);
  const transformed = ts.transform(taskView, [transformation => {
    const visit = node => node === call ? ts.factory.updateCallExpression(node, node.expression, node.typeArguments, node.arguments.slice(0, 2))
      : ts.visitEachChild(node, visit, transformation);
    return node => ts.visitNode(node, visit);
  }]);
  const printer = ts.createPrinter();
  const text = printer.printNode(ts.EmitHint.Unspecified, projected, source);
  let taskViewText;
  try { taskViewText = printer.printNode(ts.EmitHint.Unspecified, transformed.transformed[0], source); } finally { transformed.dispose(); }
  const runtime = (value, owner) => JSON.stringify(owner.canonical(ts.createSourceFile('runtime.js', ts.transpileModule(value,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true } }).outputText,
  ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS)));
  need(runtime(text, context) === runtime(previous.getText(), rollbackContext), current);
  need(runtime(taskViewText, context) === runtime(previousTaskView.getText(), rollbackContext), taskView);
  return { status: 'conditional', source, current, previous, text, taskView, previousTaskView, taskViewText, region, call,
    ordinaryRelation: { ordinary, choice, fills, quarantine: region[4], refill: region.slice(5) },
    relation: ['ordinary opaque values preserved', 'unknown/selected private fields quarantined', 'same persisted row required'],
    outstanding: ['actual legacy retained/fresh/history domain for familyA', 'selected-positive binder/terminal projection and familyB',
      'bound intrinsic/codec references, whole agent module and actual DEFAULT composition'] };
}

function finiteSelectedGuideAgentResidualTerms(ts, context, rollbackContext, decoder, publicReader) {
  const fail = node => { throw { reason: 'SELECTED_GUIDE_AGENT_RESIDUAL_UNKNOWN', node }; };
  const need = (value, node) => { if (!value) fail(node); };
  const source = publicReader?.source;
  need(source && decoder?.capable && publicReader.status === 'conditional', source);
  const previous = rollbackContext.program.getSourceFile(resolve(rollbackContext.root, 'packages/domain/src/agent/agent.ts'));
  need(previous, source);
  const nodes = (root, predicate) => { const result = []; const visit = node => {
    if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
    if (predicate(node)) result.push(node); ts.forEachChild(node, visit);
  }; visit(root); return result; };
  const one = (values, node) => { need(values.length === 1, node); return values[0]; };
  const fn = name => one(source.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name), source);
  const symbol = node => { let value = context.checker.getSymbolAtLocation(node);
    if (value?.flags & ts.SymbolFlags.Alias) value = context.checker.getAliasedSymbol(value); return value; };
  const sameShape = (node, expected) => {
    const grammar = ts.createSourceFile('agent-selected-region.ts', expected, ts.ScriptTarget.ES2022, true);
    need(!grammar.parseDiagnostics.length && grammar.statements.length === 1, node);
    need(JSON.stringify(context.canonical(node)) === JSON.stringify(context.canonical(grammar.statements[0])), node);
  };
  const core = fn('persistAgentTaskCoreInTransaction'), eligibility = fn('evaluateAgentTaskRetryEligibility');
  const retryable = fn('canRetryAgentTask'), retry = fn('retryAgentTask'), recover = fn('canRecoverSelectedGuideFinal');
  const selected = one(nodes(core, node => ts.isVariableDeclaration(node) && node.name.text === 'selectedImageSource'), core);
  need(!selected.initializer && selected.parent.declarations.length === 1, selected);
  const selectedSymbol = symbol(selected.name), removed = new Set([selected.parent.parent, recover]);
  const guard = one(core.body.statements.filter(node => ts.isIfStatement(node) && node.expression.getText().includes('Object.hasOwn')), core);
  sameShape(ts.factory.createExpressionStatement(guard.expression), `input.kind === 'workspace.guide' && isJsonRecord(input.payload.context)
    && isJsonRecord(input.payload.context.presentation) && Object.hasOwn(input.payload.context.presentation, 'selectedImageAssetId');`);
  const input = one(core.parameters.filter(parameter => parameter.name.text === 'input'), core);
  need(nodes(guard.expression, node => ts.isIdentifier(node) && node.text === 'input').every(node => symbol(node) === symbol(input.name)), guard);
  removed.add(guard);
  const writes = nodes(core, node => ts.isBinaryExpression(node) && symbol(node.left) === selectedSymbol
    && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment);
  need(writes.length === 1 && writes[0].operatorToken.kind === ts.SyntaxKind.EqualsToken
    && writes[0].pos > guard.pos && writes[0].end < guard.end, selected);
  const falseGuard = one(core.body.statements.filter(node => ts.isIfStatement(node)
    && ts.isBinaryExpression(node.expression) && symbol(node.expression.left) === selectedSymbol), core);
  sameShape(falseGuard, "if (selectedImageSource && !nativeAgentResult) throw new AgentError('ILLEGAL_TRANSITION', 'Native image understanding is unavailable');");
  removed.add(falseGuard);
  const guideRetry = one(eligibility.body.statements.filter(node => ts.isIfStatement(node)
    && node.expression.getText() === "task.kind === 'workspace.guide'"), eligibility);
  sameShape(guideRetry, "if (task.kind === 'workspace.guide') return { authorityValid: true, canRetry: canRecoverSelectedGuideFinal(task) };");
  const recoverCall = one(nodes(guideRetry, ts.isCallExpression), guideRetry);
  need(symbol(recoverCall.expression)?.valueDeclaration === recover, recoverCall); removed.add(guideRetry);
  const guideCheck = one(retryable.body.statements.filter(node => ts.isIfStatement(node)
    && node.expression.getText() === "task.kind === 'workspace.guide'"), retryable);
  // Optional tx has no evaluation effect. Its sole value use must remain in
  // the selected-only source read; ordinary retry behavior is then unchanged.
  need(retryable.parameters.length === 4 && retryable.parameters[3].questionToken && !retryable.parameters[3].initializer, retryable);
  const tx = retryable.parameters[3];
  const txUses = nodes(retryable.body, node => ts.isIdentifier(node) && symbol(node) === symbol(tx.name));
  need(txUses.length === 1 && txUses[0].pos > guideCheck.pos && txUses[0].end < guideCheck.end, tx);
  sameShape(ts.factory.createExpressionStatement(txUses[0].parent), 'tx ?? deps.prisma;');
  removed.add(guideCheck);
  const retryCheck = one(nodes(retry, node => ts.isIfStatement(node)
    && node.expression.getText() === "task.kind === 'workspace.guide' && eligibility.canRetry"), retry);
  sameShape(retryCheck, "if (task.kind === 'workspace.guide' && eligibility.canRetry) eligibility.canRetry = await canRetryAgentTask(deps, task, input.userId, tx);");
  need(symbol(one(nodes(retryCheck, ts.isCallExpression), retryCheck).expression)?.valueDeclaration === retryable, retryCheck);
  removed.add(retryCheck);
  const inRemoved = node => [...removed].some(parent => node.pos >= parent.pos && node.end <= parent.end);
  const choices = new Set(nodes(core, node => ts.isConditionalExpression(node) && symbol(node.condition) === selectedSymbol));
  need(choices.size === 2, core);
  for (const ref of nodes(source, node => ts.isIdentifier(node) && symbol(node) === selectedSymbol)) {
    need(ref === selected.name || inRemoved(ref) || choices.has(ref.parent)
      || ts.isPropertyAccessExpression(ref.parent) && [...choices].some(choice => ref.pos >= choice.whenTrue.pos && ref.end <= choice.whenTrue.end), ref);
  }
  const nativeChoice = [...choices].find(node => ts.isCallExpression(node.whenTrue));
  need(nativeChoice && nativeChoice.whenTrue.arguments.length === 2
    && nativeChoice.whenTrue.arguments[1].text === 'paper-illustration', core);
  const spreadChoice = [...choices].find(node => ts.isObjectLiteralExpression(node.whenFalse));
  let spreadOwner = spreadChoice;
  while (spreadOwner?.parent && ts.isParenthesizedExpression(spreadOwner.parent)) spreadOwner = spreadOwner.parent;
  need(spreadChoice && !spreadChoice.whenFalse.properties.length && ts.isSpreadAssignment(spreadOwner.parent), core);
  const spreadStatement = spreadOwner.parent;
  for (const reference of nodes(source, node => ts.isIdentifier(node) && symbol(node) === symbol(retryable.name)))
    need(reference === retryable.name || ts.isCallExpression(reference.parent) && reference.parent.expression === reference
      && (inRemoved(reference) || reference.parent.arguments.length === 3), reference);
  const removedImports = new Set();
  for (const statement of source.statements) if (ts.isImportDeclaration(statement) && statement.importClause?.namedBindings
    && ts.isNamedImports(statement.importClause.namedBindings)) for (const entry of statement.importClause.namedBindings.elements) {
    if (entry.isTypeOnly || !['requireSelectedImageSource', 'workspaceSelectedImageDraftSource', 'readWorkspaceSelectedImageReference', 'readWorkspaceSelectedImageDraft'].includes((entry.propertyName ?? entry.name).text)) continue;
    const local = context.checker.getSymbolAtLocation(entry.name);
    for (const reference of nodes(source, ts.isIdentifier)) if (context.checker.getSymbolAtLocation(reference) === local && reference !== entry.name)
      need(inRemoved(reference) || reference.pos >= publicReader.current.pos && reference.end <= publicReader.current.end, reference);
    removedImports.add(entry);
  }
  need(removedImports.size === 4, source);
  const printer = ts.createPrinter(), replacement = new Map([[publicReader.current, publicReader.text], [publicReader.taskView, publicReader.taskViewText]]);
  const transformed = ts.transform(source, [transformation => {
    const visit = node => {
      if (removed.has(node)) return undefined;
      if (replacement.has(node)) {
        // Text from another SourceFile is spliced below, never printed using
        // the original source's offsets.
        return node;
      }
      if (node === tx) return undefined;
      if (node === spreadStatement) return undefined;
      if (choices.has(node)) return ts.visitNode(node.whenFalse, visit);
      if (ts.isIdentifier(node) && symbol(node)?.valueDeclaration === decoder.reader) return ts.factory.createIdentifier(decoder.legacyParser.name.text);
      if (ts.isImportDeclaration(node) && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
        const entries = node.importClause.namedBindings.elements.filter(entry => !removedImports.has(entry)).map(entry =>
          symbol(entry.name)?.valueDeclaration === decoder.reader
            ? ts.factory.updateImportSpecifier(entry, entry.isTypeOnly, undefined, ts.factory.createIdentifier(decoder.legacyParser.name.text)) : entry);
        if (!entries.length && !node.importClause.name) return undefined;
        return ts.factory.updateImportDeclaration(node, node.modifiers, ts.factory.updateImportClause(node.importClause, node.importClause.isTypeOnly,
          node.importClause.name, ts.factory.updateNamedImports(node.importClause.namedBindings, entries)), node.moduleSpecifier, node.attributes);
      }
      return ts.visitEachChild(node, visit, transformation);
    }; return node => ts.visitNode(node, visit);
  }]);
  let text;
  try { text = printer.printFile(transformed.transformed[0]); } finally { transformed.dispose(); }
  const parsed = ts.createSourceFile(source.fileName, text, ts.ScriptTarget.ES2022, true), edits = [];
  for (const [original, value] of replacement) {
    const node = one(parsed.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === original.name.text), parsed);
    edits.push({ start: node.getStart(parsed), end: node.end, value });
  }
  for (const edit of edits.sort((left, right) => right.start - left.start)) text = text.slice(0, edit.start) + edit.value + text.slice(edit.end);
  const runtime = (value, owner) => JSON.stringify(owner.canonical(ts.createSourceFile('runtime.js', ts.transpileModule(value,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true } }).outputText,
  ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS)));
  need(runtime(text, context) === runtime(previous.text, rollbackContext), source);
  return { status: 'conditional', source, previous, text, removed, choices, removedImports, publicReader, core, eligibility, retryable, retry, recover,
    outstanding: ['retained familyA legacy payload and old guide retry/refusal relation', 'selected final/binder/tx familyB contract',
      'all removed bindings and intrinsic/declaration/init context', 'actual successful DEFAULT collection and strict remaining entries'] };
}

function finiteSelectedGuideIngestionReaderTerms(ts, context, rollbackContext) {
  const fail = node => { throw { reason: 'SELECTED_GUIDE_INGESTION_READER_UNKNOWN', node }; };
  const need = (value, node) => { if (!value) fail(node); };
  const path = 'packages/domain/src/ingestion/ingestion-service.ts';
  const source = context.program.getSourceFile(resolve(context.root, path));
  const previous = rollbackContext.program.getSourceFile(resolve(rollbackContext.root, path));
  need(source && previous, source);
  const nodes = (root, predicate) => { const result = []; const visit = node => {
    if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
    if (predicate(node)) result.push(node); ts.forEachChild(node, visit);
  }; visit(root); return result; };
  const one = (values, node) => { need(values.length === 1, node); return values[0]; };
  const symbol = node => { let value = context.checker.getSymbolAtLocation(node);
    if (value?.flags & ts.SymbolFlags.Alias) value = context.checker.getAliasedSymbol(value); return value; };
  const reader = one(source.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'getIngestionTask'), source);
  const row = one(nodes(reader, node => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'task'), reader);
  const projector = context.program.getSourceFile(resolve(context.root, 'packages/domain/src/agent/agent.ts'));
  const declaration = one(projector?.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'projectAgentTaskResult') ?? [], source);
  const calls = nodes(source, node => ts.isCallExpression(node) && symbol(node.expression)?.valueDeclaration === declaration);
  const call = one(calls, source);
  need(call.pos >= reader.pos && call.end <= reader.end, call);
  const grammar = ts.createSourceFile('same-persisted-ingestion-row.ts',
    "projectAgentTaskResult(task.agentTask?.result, task.agentTask?.kind ?? '', task.agentTask ?? undefined);", ts.ScriptTarget.ES2022, true)
    .statements[0].expression;
  need(JSON.stringify(context.canonical(call)) === JSON.stringify(context.canonical(grammar)), call);
  const references = nodes(call, node => ts.isIdentifier(node) && node.text === 'task');
  need(references.length === 3 && references.every(node => symbol(node) === symbol(row.name)), call);
  // Dropping only the extra provenance argument is justified by the separately
  // required task-bound projection relation. Every query, permission check,
  // include, original argument and other module statement must remain exact.
  const transformed = ts.transform(source, [transformation => {
    const visit = node => node === call
      ? ts.factory.updateCallExpression(node, node.expression, node.typeArguments, node.arguments.slice(0, 2))
      : ts.visitEachChild(node, visit, transformation);
    return node => ts.visitNode(node, visit);
  }]);
  let text;
  try { text = ts.createPrinter().printFile(transformed.transformed[0]); } finally { transformed.dispose(); }
  const runtime = (value, owner) => JSON.stringify(owner.canonical(ts.createSourceFile('runtime.js', ts.transpileModule(value,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true } }).outputText,
  ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS)));
  need(runtime(text, context) === runtime(previous.text, rollbackContext), source);
  return { status: 'conditional', source, previous, text, row, call, projector: declaration,
    outstanding: ['complete ordinary/unknown/selected public projection relation for this exact persisted row',
      'all retained families and actual successful DEFAULT collector composition'] };
}

function finiteSelectedGuideInitializationTerms(ts, context, rollbackContext, collected) {
  let initializationSite = 'capture-context';
  const fail = node => { throw { reason: 'SELECTED_GUIDE_EAGER_INITIALIZATION_UNKNOWN', node, initializationSite }; };
  const need = (condition, node) => { if (!condition) fail(node); };
  let currentEntries, previousEntries;
  if (collected !== undefined) {
    need(Array.isArray(collected.current) && Array.isArray(collected.previous)
      && rollbackProofContexts.get(collected.current) === context && rollbackProofContexts.get(collected.previous) === rollbackContext
      && context.ts === ts && rollbackContext.ts === ts && context.roots === rollbackContext.roots, undefined);
    currentEntries = new Map(collected.current); previousEntries = new Map(collected.previous);
    need(currentEntries.size === collected.current.length && previousEntries.size === collected.previous.length, undefined);
  }
  const symbol = (node, owner = context) => { let value = owner.checker.getSymbolAtLocation(node);
    if (value?.flags & ts.SymbolFlags.Alias) value = owner.checker.getAliasedSymbol(value); return value; };
  const intrinsic = (node, name, owner) => {
    const value = owner.checker.getSymbolAtLocation(node);
    return ts.isIdentifier(node) && node.text === name && !(value?.flags & ts.SymbolFlags.Alias)
      && !(value?.declarations ?? []).some(declaration => !declaration.getSourceFile().isDeclarationFile);
  };
  const unwrap = raw => { let node = raw; while (node && (ts.isAsExpression(node) || ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node))) node = node.expression; return node; };
  const key = node => ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : undefined;
  const factoryGrammar = ts.createSourceFile('owned-json-schema-factory.ts', `const factory =
    (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });`, ts.ScriptTarget.ES2022, true)
    .statements[0].declarationList.declarations[0].initializer;
  const sceneGrammar = ts.createSourceFile('owned-science-scene.ts',
    `const scene = (domain: Record<string, unknown>, originalRefRequired = true) => {
      const scene = object({ title: str, narration: str, message: str, domain, encoding: str, labels: list, constraints: list,
        subjects: { type: 'array', minItems: 1, maxItems: 4, items: object({ description: str, basis: object({ sourceId: str }) }) },
        paperOriginalAssetId: { type: ['string', 'null'] } });
      if (!originalRefRequired) scene.required = scene.required.filter(key => key !== 'paperOriginalAssetId');
      return scene;
    };`, ts.ScriptTarget.ES2022, true).statements[0].declarationList.declarations[0].initializer;
  const scienceGrammar = ts.createSourceFile('owned-science-schema.ts',
    `const schema = (domain: Record<string, unknown>, originalRefRequired = true) => {
      return object({ title: str, narrative: object({ mainMessage: str, audience: str }), scenes: { type: 'array', minItems: 1, maxItems: 6, items: scienceSceneSchema(domain, originalRefRequired) } });
    };`, ts.ScriptTarget.ES2022, true).statements[0].declarationList.declarations[0].initializer;
  const pureInitializers = [], declarations = [], modules = [], checking = new Set();
  const cache = new Map(), coldCache = new Map();
  const retainedInitializer = (owner, initializer) => {
    if (!ts.isVariableDeclaration(initializer) || !ts.isIdentifier(initializer.name) || !initializer.initializer) return false;
    const other = owner === context ? rollbackContext : context;
    const source = other.program.getSourceFile(resolve(other.root, relative(owner.root, initializer.getSourceFile().fileName)));
    const previous = source?.statements.filter(ts.isVariableStatement).flatMap(statement => [...statement.declarationList.declarations])
      .find(value => ts.isIdentifier(value.name) && value.name.text === initializer.name.text);
    return previous?.initializer && JSON.stringify(owner.canonical(initializer.initializer)) === JSON.stringify(other.canonical(previous.initializer));
  };
  const pure = (raw, initializer, owner = context, locals = new Map(), retainedLoading = true) => {
    const node = unwrap(raw); need(node && !checking.has(node), node);
    checking.add(node);
    const within = (value, seed = initializer) => pure(value, seed, owner, locals, retainedLoading);
    const dataObject = value => ['object', 'tool'].includes(value);
    const dataArray = value => ['array', 'tools'].includes(value);
    const variable = identifier => {
      const bound = symbol(identifier, owner)?.valueDeclaration;
      need(bound && ts.isVariableDeclaration(bound) && bound.initializer && bound.getSourceFile() === initializer.getSourceFile()
        && bound.end < initializer.pos && Boolean(bound.parent.flags & ts.NodeFlags.Const), identifier);
      return bound;
    };
    const ownProperty = (raw, field, seen = new Set()) => {
      const value = unwrap(raw); need(value && !seen.has(value), raw); const next = new Set(seen).add(value);
      if (ts.isIdentifier(value)) return ownProperty(variable(value).initializer, field, next);
      if (ts.isPropertyAccessExpression(value)) return ownProperty(ownProperty(value.expression, value.name.text, next), field, next);
      if (ts.isCallExpression(value) && ts.isIdentifier(value.expression)) {
        const factory = unwrap(variable(value.expression).initializer);
        if (['properties', 'required'].includes(field) && [sceneGrammar, scienceGrammar, factoryGrammar].some(grammar =>
          JSON.stringify(owner.canonical(factory)) === JSON.stringify(owner.canonical(grammar)))) {
          need(within(value) === 'object', value);
          return { verifiedSchemaField: value, type: field === 'properties' ? 'object' : 'array' };
        }
        if (JSON.stringify(owner.canonical(factory)) !== JSON.stringify(owner.canonical(factoryGrammar)))
          throw { reason: 'SELECTED_GUIDE_EAGER_INITIALIZATION_UNKNOWN', node: factory, stage: `own-field:${field}`, initializationSite };
        if (field === 'properties') return value.arguments[0];
        fail(value);
      }
      need(ts.isObjectLiteralExpression(value), value);
      for (const item of [...value.properties].reverse()) {
        if (ts.isSpreadAssignment(item)) return ownProperty(item.expression, field, next);
        if (key(item.name) === field) { need(ts.isPropertyAssignment(item), item); return item.initializer; }
      }
      fail(value);
    };
    try {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return 'string';
      // TS5.5 accepts invalid regex spellings without syntactic diagnostics.
      // Only an exactly retained old initializer has the old loading premise;
      // a new literal is UNKNOWN, never executed or interpreted here.
      if (ts.isRegularExpressionLiteral(node)) { need(retainedLoading && retainedInitializer(owner, initializer), node); return 'primitive'; }
      if (ts.isLiteralExpression(node) || [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(node.kind)) return 'primitive';
      if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return 'function';
      if (ts.isArrayLiteralExpression(node)) {
        const values = node.elements.map(element => {
          if (ts.isSpreadElement(element)) { need(dataArray(within(element.expression)), element); return 'spread'; }
          return within(element);
        });
        return values.length && values.every(value => value === 'tool') ? 'tools' : 'array';
      }
      if (ts.isObjectLiteralExpression(node)) {
        const fields = new Map(); let tool = false, unknownSpread = false;
        for (const property of node.properties) {
          if (ts.isSpreadAssignment(property)) {
            const value = within(property.expression); need(dataObject(value), property);
            if (value === 'tool') { tool = true; fields.set('name', 'string'); fields.set('description', 'string'); fields.set('parameters', 'object'); }
            else unknownSpread = true;
          } else {
            need(ts.isPropertyAssignment(property) && key(property.name) && key(property.name) !== '__proto__', property);
            fields.set(key(property.name), within(property.initializer));
          }
        }
        if (!unknownSpread && (tool || fields.size === 3) && [...fields.keys()].every(name => ['name', 'description', 'parameters'].includes(name))
          && fields.get('name') === 'string' && fields.get('description') === 'string' && dataObject(fields.get('parameters'))) return 'tool';
        return 'object';
      }
      if (ts.isIdentifier(node)) {
        const bound = symbol(node, owner);
        if (locals.has(bound)) return locals.get(bound);
        const declaration = variable(node);
        const memo = retainedLoading ? cache : coldCache;
        if (!memo.has(declaration)) memo.set(declaration, pure(declaration.initializer, declaration, owner, new Map(), retainedLoading));
        return memo.get(declaration);
      }
      if (ts.isPropertyAccessExpression(node)) {
        if (locals.get(symbol(node.expression, owner)) === 'tool') {
          need(['name', 'description', 'parameters'].includes(node.name.text), node);
          return node.name.text === 'parameters' ? 'object' : 'string';
        }
        const field = ownProperty(node.expression, node.name.text);
        return field.verifiedSchemaField ? field.type : within(field);
      }
      if (ts.isTemplateExpression(node)) {
        for (const span of node.templateSpans) need(within(span.expression) === 'string', span);
        return 'string';
      }
      if (ts.isConditionalExpression(node)) {
        const condition = unwrap(node.condition);
        need(ts.isBinaryExpression(condition) && condition.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
          && ts.isPropertyAccessExpression(condition.left) && condition.left.name.text === 'name'
          && locals.get(symbol(condition.left.expression, owner)) === 'tool' && ts.isStringLiteral(condition.right), condition);
        const left = within(node.whenTrue), right = within(node.whenFalse); need(left === right, node); return left;
      }
      if (ts.isNewExpression(node) && node.arguments?.length === 1 && intrinsic(node.expression, 'Set', owner)
        && dataArray(within(node.arguments[0]))) return 'set';
      if (ts.isNewExpression(node) && intrinsic(node.expression, 'Map', owner) && node.arguments?.length === 1) {
        const entries = node.arguments[0];
        need(ts.isArrayLiteralExpression(entries) && entries.elements.every(value => ts.isArrayLiteralExpression(value) && value.elements.length === 2), entries);
        within(entries); return 'map';
      }
      if (ts.isNewExpression(node) && intrinsic(node.expression, 'RegExp', owner) && node.arguments?.length === 2) {
        // Retain only the actual already-existing constant constructors. The
        // grammar does not bless a new, possibly invalid/throwing RegExp.
        const other = (owner === context ? rollbackContext : context).program.getSourceFile(resolve(
          (owner === context ? rollbackContext : context).root, relative(owner.root, initializer.getSourceFile().fileName)));
        const declaration = other?.statements.filter(ts.isVariableStatement).flatMap(statement => [...statement.declarationList.declarations])
          .find(value => value.name.text === initializer.name?.text);
        need(retainedLoading && ts.isVariableDeclaration(initializer) && declaration?.initializer
          && JSON.stringify(owner.canonical(initializer.initializer)) === JSON.stringify(owner.canonical(declaration.initializer))
          && node.arguments.every(value => within(value) === 'string'), node); return 'regexp';
      }
      if (ts.isCallExpression(node) && intrinsic(node.expression, 'Symbol', owner) && !node.questionDotToken
        && node.arguments.length <= 1 && node.arguments.every(ts.isStringLiteral)) return 'symbol';
      const numeric = value => ts.isNumericLiteral(value) || ts.isPrefixUnaryExpression(value)
        && [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken].includes(value.operator) && numeric(unwrap(value.operand))
        || ts.isBinaryExpression(value) && [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.AsteriskToken,
          ts.SyntaxKind.SlashToken, ts.SyntaxKind.AsteriskAsteriskToken].includes(value.operatorToken.kind)
          && numeric(unwrap(value.left)) && numeric(unwrap(value.right));
      if ((ts.isBinaryExpression(node) || ts.isPrefixUnaryExpression(node)) && numeric(node)) return 'primitive';
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        need(within(node.left) === 'string' && within(node.right) === 'string', node); return 'string';
      }
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && !node.questionDotToken) {
        const method = node.expression;
        if (method.name.text === 'join') {
          const values = unwrap(method.expression);
          need(ts.isArrayLiteralExpression(values) && values.elements.every(value => within(value) === 'string')
            && node.arguments.length === 1 && within(node.arguments[0]) === 'string', node); return 'string';
        }
        if (method.name.text === 'replace') {
          need(within(method.expression) === 'string' && node.arguments.length === 2 && node.arguments.every(value => within(value) === 'string'), node); return 'string';
        }
        if (method.name.text === 'map') {
          need(within(method.expression) === 'tools' && node.arguments.length === 1, node);
          const callback = node.arguments[0];
          need(ts.isArrowFunction(callback) && callback.parameters.length === 1 && ts.isIdentifier(callback.parameters[0].name)
            && !callback.parameters[0].initializer && !callback.parameters[0].dotDotDotToken && !ts.isBlock(callback.body)
            && !callback.modifiers?.length, callback);
          const bindings = new Map(locals).set(symbol(callback.parameters[0].name, owner), 'tool');
          need(pure(callback.body, initializer, owner, bindings, retainedLoading) === 'tool', callback); return 'tools';
        }
        fail(node);
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && !node.questionDotToken
        && !node.typeArguments?.length && node.arguments.length >= 1 && node.arguments.length <= 2) {
        const bound = variable(node.expression), factory = unwrap(bound.initializer);
        const equal = grammar => JSON.stringify(owner.canonical(factory)) === JSON.stringify(owner.canonical(grammar));
        if (equal(factoryGrammar)) {
          need(intrinsic(factory.parameters[1].initializer.expression.expression, 'Object', owner), factory);
          need(dataObject(within(node.arguments[0])) && (node.arguments.length === 1 || dataArray(within(node.arguments[1]))), node); return 'object';
        }
        if (!equal(sceneGrammar) && !equal(scienceGrammar)) throw { reason: 'SELECTED_GUIDE_EAGER_INITIALIZATION_UNKNOWN', node: factory, stage: 'schema-grammar', initializationSite };
        need(dataObject(within(node.arguments[0])) && (node.arguments.length === 1
          || [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword].includes(node.arguments[1].kind)), node);
        const object = factory.getSourceFile().statements.flatMap(statement => ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : [])
          .find(value => value.name.text === 'object');
        if (!(object && object.end < bound.pos && JSON.stringify(owner.canonical(unwrap(object.initializer))) === JSON.stringify(owner.canonical(factoryGrammar))))
          throw { reason: 'SELECTED_GUIDE_EAGER_INITIALIZATION_UNKNOWN', node: factory, stage: 'schema-object-factory', initializationSite };
        need(intrinsic(unwrap(object.initializer).parameters[1].initializer.expression.expression, 'Object', owner), object);
        for (const name of ['str', 'list']) {
          const value = factory.getSourceFile().statements.flatMap(statement => ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : [])
            .find(value => value.name.text === name);
          if (!(value && value.end < bound.pos && dataObject(pure(value.initializer, value, owner, new Map(), retainedLoading))))
            throw { reason: 'SELECTED_GUIDE_EAGER_INITIALIZATION_UNKNOWN', node: factory, stage: `schema-${name}`, initializationSite };
        }
        if (equal(scienceGrammar)) {
          const scene = factory.getSourceFile().statements.flatMap(statement => ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : [])
            .find(value => value.name.text === 'scienceSceneSchema');
          need(scene && scene.end < bound.pos && JSON.stringify(owner.canonical(unwrap(scene.initializer))) === JSON.stringify(owner.canonical(sceneGrammar)), factory);
        }
        return 'object';
      }
      fail(node);
    } finally { checking.delete(node); }
  };
  const captured = context.modules ?? new Map(context.program.getSourceFiles().filter(parsed => !parsed.isDeclarationFile
    && /^(?:apps|packages)\//u.test(relative(context.root, parsed.fileName).replaceAll('\\', '/'))).map(parsed => [parsed.fileName, parsed]));
  for (const current of captured.values()) {
    initializationSite = 'module-identity';
    const path = relative(context.root, current.fileName).replaceAll('\\', '/');
    const previous = rollbackContext.program.getSourceFile(resolve(rollbackContext.root, path));
    need(previous && context.program.getSourceFile(current.fileName) === current, current);
    if (currentEntries) {
      const key = `module:${path}`;
      need(context.modules.get(resolve(current.fileName)) === current
        && rollbackContext.modules.get(resolve(rollbackContext.root, path)) === previous
        && currentEntries.has(key) && previousEntries.has(key), current);
      // Consume the original complete emitted fingerprint, including its proved
      // relocation/consumer mapping. Raw generated metadata must not undo that
      // equality. Import ordering and every remaining entry are still checked.
      if (JSON.stringify(currentEntries.get(key)) === JSON.stringify(previousEntries.get(key))) continue;
    }
    if (current.text === previous.text || JSON.stringify(context.canonical(current)) === JSON.stringify(rollbackContext.canonical(previous))) continue;
    const previousVariables = new Map(previous.statements.filter(ts.isVariableStatement).flatMap(statement =>
      statement.declarationList.declarations.map(declaration => [key(declaration.name), declaration])));
    modules.push({ source: current, rollback: previous });
    for (const statement of current.statements) {
      if (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement) || ts.isInterfaceDeclaration(statement)
        || ts.isTypeAliasDeclaration(statement) || ts.isEmptyStatement(statement)) continue;
      if (ts.isFunctionDeclaration(statement)) {
        initializationSite = 'retained-function';
        need(statement.name && !(statement.modifiers ?? []).some(modifier => ![ts.SyntaxKind.AsyncKeyword, ts.SyntaxKind.ExportKeyword].includes(modifier.kind)), statement);
        if (!previous.statements.some(old => ts.isFunctionDeclaration(old) && old.name?.text === statement.name.text)) declarations.push(statement);
        continue;
      }
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          initializationSite = 'declaration-binding';
          need(ts.isIdentifier(declaration.name), declaration);
          const previousDeclaration = previousVariables.get(declaration.name.text);
          if (previousDeclaration) {
            initializationSite = 'retained-declaration';
            need(JSON.stringify(context.canonical(declaration)) === JSON.stringify(rollbackContext.canonical(previousDeclaration)), declaration);
          } else {
            initializationSite = 'added-declaration';
            need(Boolean(statement.declarationList.flags & ts.NodeFlags.Const) && declaration.initializer, declaration);
            pure(declaration.initializer, statement); pureInitializers.push(declaration); declarations.push(declaration);
          }
        }
        continue;
      }
      // No changed class/static/decorator/ambient call/throw/await can hide
      // behind a dormant selected function. Existing other statements must be
      // byte-structurally retained; import graph ordering is a separate lemma.
      initializationSite = 'retained-statement';
      need(previous.statements.some(old => JSON.stringify(context.canonical(statement))
        === JSON.stringify(rollbackContext.canonical(old))), statement);
    }
  }
  const graph = owner => {
    const result = new Map();
    const sources = owner.modules ?? new Map(owner.program.getSourceFiles().filter(parsed => !parsed.isDeclarationFile
      && /^(?:apps|packages)\//u.test(relative(owner.root, parsed.fileName).replaceAll('\\', '/'))).map(parsed => [parsed.fileName, parsed]));
    for (const parsed of sources.values()) {
      initializationSite = 'graph-source';
      const path = relative(owner.root, parsed.fileName).replaceAll('\\', '/');
      if (!/^(?:apps|packages|infra)\//u.test(path)) continue;
      need(owner.program.getSourceFile(parsed.fileName) === parsed, parsed);
      const compiled = ts.transpileModule(parsed.text, { fileName: parsed.fileName, reportDiagnostics: true,
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true } });
      initializationSite = 'graph-transpile';
      need(!compiled.diagnostics?.some(item => item.category === ts.DiagnosticCategory.Error), parsed);
      const runtime = ts.createSourceFile('runtime.js', compiled.outputText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
      need(!runtime.parseDiagnostics.length, parsed);
      const requests = runtime.statements.filter(node => (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
        && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)).map(node => {
        const literal = parsed.statements.find(statement => (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))
          && statement.moduleSpecifier?.text === node.moduleSpecifier.text)?.moduleSpecifier;
        initializationSite = 'graph-import';
        need(literal, parsed);
        const target = owner.checker.getSymbolAtLocation(literal)?.declarations?.find(ts.isSourceFile);
        const path = target && relative(owner.root, target.fileName).replaceAll('\\', '/');
        if (!target || target.isDeclarationFile || !/^(?:apps|packages|infra)\//u.test(path)) return { external: node.moduleSpecifier.text };
        return { owned: path };
      });
      result.set(path, { source: parsed, requests, runtime });
    }
    return result;
  };
  const currentGraph = graph(context), oldGraph = graph(rollbackContext);
  const newEdges = [];
  for (const [path, value] of currentGraph) {
    initializationSite = 'graph-existing';
    const previous = oldGraph.get(path); need(previous, value.source);
    for (const request of value.requests) if (request.owned && !previous.requests.some(old => old.owned === request.owned))
      newEdges.push({ from: path, to: request.owned });
  }
  const components = [], indices = new Map(), low = new Map(), stack = [], active = new Set(); let index = 0;
  const visit = path => {
    indices.set(path, index); low.set(path, index++); stack.push(path); active.add(path);
    for (const { owned } of currentGraph.get(path)?.requests ?? []) if (owned) {
      initializationSite = 'graph-edge';
      need(currentGraph.has(owned), currentGraph.get(path).source);
      if (!indices.has(owned)) { visit(owned); low.set(path, Math.min(low.get(path), low.get(owned))); }
      else if (active.has(owned)) low.set(path, Math.min(low.get(path), indices.get(owned)));
    }
    if (indices.get(path) === low.get(path)) {
      const component = []; let member;
      do { member = stack.pop(); active.delete(member); component.push(member); } while (member !== path);
      components.push(component);
    }
  };
  for (const path of currentGraph.keys()) if (!indices.has(path)) visit(path);
  const changedCycles = components.filter(component => newEdges.some(edge => component.includes(edge.from) && component.includes(edge.to)));
  const moved = new Set(changedCycles.flat()), newlyReachable = new Set(), ordering = [];
  const entryPaths = context.roots?.map(([path]) => path) ?? ['apps/agent-worker/src/index.ts'];
  const builtins = new Set(builtinModules.map(value => value.replace(/^node:/u, '')));
  const order = (graph, entry) => {
    const seen = new Set(), modules = [], external = [];
    const visit = path => {
      if (seen.has(path)) return; seen.add(path);
      initializationSite = 'graph-order';
      const current = graph.get(path); need(current, graph.get(entry)?.source);
      for (const request of current.requests) {
        if (request.owned) visit(request.owned);
        else if (!builtins.has(request.external.replace(/^node:/u, ''))) external.push([path, request.external]);
      }
      modules.push(path);
    }; visit(entry); return { modules, external };
  };
  for (const entry of entryPaths) {
    const before = order(oldGraph, entry), after = order(currentGraph, entry);
    initializationSite = 'graph-order';
    // Resolve/cache/package identity is still consumed from the successful
    // collector's strict remaining entries; source occurrence order is only
    // the additional eager-order obligation checked here.
    need(JSON.stringify(before.external) === JSON.stringify(after.external), currentGraph.get(entry)?.source);
    const a = before.modules, b = after.modules;
    need(a.length <= 1024 && b.length <= 1024
      && a.every(path => b.includes(path)), currentGraph.get(entry)?.source);
    for (const path of b) if (!a.includes(path)) newlyReachable.add(path);
    const lengths = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
    for (let i = a.length - 1; i >= 0; i -= 1) for (let j = b.length - 1; j >= 0; j -= 1)
      lengths[i][j] = a[i] === b[j] ? 1 + lengths[i + 1][j + 1] : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    let i = 0, j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i += 1; j += 1; }
      else if (lengths[i + 1][j] >= lengths[i][j + 1]) moved.add(a[i++]);
      else moved.add(b[j++]);
    }
    for (const path of [...a.slice(i), ...b.slice(j)]) moved.add(path);
    ordering.push({ entry, before, after });
  }
  const cycleInitializers = [];
  for (const path of moved) for (const owner of [context, rollbackContext]) {
    initializationSite = 'moved-source';
    const module = (owner === context ? currentGraph : oldGraph).get(path), parsed = module?.source;
    need(parsed, context.program.getSourceFile(resolve(context.root, path)));
    if (newlyReachable.has(path)) {
      // Loading a newly reachable module parses literals in deferred bodies
      // too. TS syntactic diagnostics do not validate every regexp pattern.
      // Compile only the real emitted literal token, including its flags;
      // never execute it or the module, and never expose the parser error.
      const syntax = node => {
        if (ts.isRegularExpressionLiteral(node)) {
          try { new Script(`(${node.getText(module.runtime)})`); } catch { fail(parsed); }
        }
        ts.forEachChild(node, syntax);
      };
      syntax(module.runtime);
    }
    for (const statement of parsed.statements) {
      if (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement) || ts.isInterfaceDeclaration(statement)
        || ts.isTypeAliasDeclaration(statement) || ts.isFunctionDeclaration(statement) || ts.isEmptyStatement(statement)) continue;
      if (ts.isVariableStatement(statement)) {
        initializationSite = 'moved-initializer';
        for (const declaration of statement.declarationList.declarations) if (declaration.initializer)
          pure(declaration.initializer, declaration, owner, new Map(), !newlyReachable.has(path));
      } else if (ts.isClassDeclaration(statement)) {
        initializationSite = 'moved-class';
        need(!(statement.modifiers ?? []).some(modifier => modifier.kind === ts.SyntaxKind.Decorator), statement);
        for (const clause of statement.heritageClauses ?? []) if (clause.token === ts.SyntaxKind.ExtendsKeyword)
          for (const type of clause.types) need(intrinsic(type.expression, 'Error', owner), type);
        for (const member of statement.members) need(!ts.isClassStaticBlockDeclaration(member)
          && !(member.modifiers ?? []).some(modifier => [ts.SyntaxKind.StaticKeyword, ts.SyntaxKind.Decorator].includes(modifier.kind))
          && (!member.name || ts.isIdentifier(member.name) || ts.isStringLiteral(member.name) || ts.isPrivateIdentifier(member.name)), member);
      } else { initializationSite = 'moved-statement'; fail(statement); }
      cycleInitializers.push({ source: parsed, node: statement });
    }
  }
  return { status: 'conditional', modules, declarations, pureInitializers, currentGraph, oldGraph, newEdges, changedCycles, cycleInitializers, moved, ordering,
    outstanding: ['installed external resolution/cache identity and namespace observers', 'complete declaration/reference/escape closure',
      'captured module identity and residual runtime equality under original collector'] };
}

function finiteSelectedGuideDeclarationTerms(ts, context, rollbackContext, models) {
  const fail = node => { throw { reason: 'SELECTED_GUIDE_DECLARATION_OR_ESCAPE_UNKNOWN', node }; };
  const need = (value, node) => { if (!value) fail(node); };
  const symbol = node => {
    let value = ts.isIdentifier(node) && ts.isShorthandPropertyAssignment(node.parent)
      ? context.checker.getShorthandAssignmentValueSymbol(node.parent)
      : ts.isExportSpecifier(node.parent) ? context.checker.getExportSpecifierLocalTargetSymbol(node.parent)
        : context.checker.getSymbolAtLocation(node);
    if (value?.flags & ts.SymbolFlags.Alias) value = context.checker.getAliasedSymbol(value); return value;
  };
  const within = (node, parent) => node.getSourceFile() === parent.getSourceFile() && node.pos >= parent.pos && node.end <= parent.end;
  const regions = new Set([...models.dormant.removed, ...models.agent.removed, ...models.native.removed,
    ...models.illustration.removed, ...models.publicReader.region, models.workspace.selected]);
  const regionRanges = new Map();
  const inRegion = node => {
    const source = node.getSourceFile();
    return (regionRanges.get(source) ?? []).some(parent => node.pos >= parent.pos && node.end <= parent.end);
  };
  const declarations = new Map();
  for (const node of models.initialization.declarations) {
    need(node.name && ts.isIdentifier(node.name), node);
    const value = symbol(node.name); need(value && !declarations.has(value), node); declarations.set(value, node);
  }
  const decoder = models.decoder, relocation = models.relocation, illustration = models.illustration;
  need(declarations.get(symbol(decoder.reader.name)) === decoder.reader
    && declarations.get(symbol(relocation.reader.name)) === relocation.reader
    && declarations.get(symbol(illustration.core.name)) === illustration.core, decoder.reader);
  const fresh = models.fresh;
  const routeGuards = [];
  const scan = (root, predicate) => { const found = []; const visit = node => {
    if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
    if (predicate(node)) found.push(node); ts.forEachChild(node, visit);
  }; visit(root); return found; };
  for (const node of scan(fresh.handler, ts.isIfStatement)) {
    const expected = ts.createSourceFile('selected-api-guard.ts',
      "body.kind === 'workspace.guide' && body.payload.context.presentation?.selectedImageAssetId;", ts.ScriptTarget.ES2022, true)
      .statements[0].expression;
    if (JSON.stringify(context.canonical(node.expression)) !== JSON.stringify(context.canonical(expected))) continue;
    need(scan(node.expression, value => ts.isIdentifier(value) && value.text === 'body').every(value => symbol(value) === symbol(fresh.body.name)), node);
    routeGuards.push(node);
  }
  need(routeGuards.length === 1, fresh.handler);
  regions.add(routeGuards[0]);
  for (const region of regions) {
    const source = region.getSourceFile(), values = regionRanges.get(source) ?? [];
    values.push(region); regionRanges.set(source, values);
  }
  const ordinaryDecoder = node => {
    const call = node.parent;
    if (!ts.isCallExpression(call) || call.expression !== node || call.arguments.length !== 1 || call.questionDotToken) return false;
    if (node === models.workspace.payload.initializer.expression || call === fresh.strictCall) return true;
    // The one remaining replay call is transformed at its actual bound symbol
    // by the whole-agent residual. It receives the immutable existing payload.
    const replay = models.agent.source.statements.find(value => ts.isFunctionDeclaration(value) && value.name?.text === 'assertTaskReplay');
    if (!replay || !within(call, replay)) return false;
    const actual = call.arguments[0];
    return ts.isPropertyAccessExpression(actual) && actual.name.text === 'payload' && ts.isIdentifier(actual.expression)
      && actual.expression.text === 'existing' && symbol(actual.expression)?.valueDeclaration === replay.parameters[0];
  };
  const references = [];
  const exportsNewDeclaration = literal => {
    const value = context.checker.getSymbolAtLocation(literal);
    return value && context.checker.getExportsOfModule(value).some(exported => {
      const target = exported.flags & ts.SymbolFlags.Alias ? context.checker.getAliasedSymbol(exported) : exported;
      return declarations.has(target);
    });
  };
  const sources = context.program.getSourceFiles().filter(source => !source.isDeclarationFile
    && /^(?:apps|packages|infra)\//u.test(relative(context.root, source.fileName).replaceAll('\\', '/')));
  for (const source of sources) {
    const namespaces = new Set();
    for (const statement of source.statements) if (ts.isImportDeclaration(statement) && !statement.importClause?.isTypeOnly
      && statement.importClause?.namedBindings && ts.isNamespaceImport(statement.importClause.namedBindings)
      && exportsNewDeclaration(statement.moduleSpecifier)) namespaces.add(symbol(statement.importClause.namedBindings.name));
    const visit = node => {
      if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)
        || ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
      if (ts.isIdentifier(node)) {
        const bound = symbol(node), target = declarations.get(bound);
        if (target && node !== target.name) {
          const call = node.parent;
          const movedCall = target === relocation.reader && relocation.calls.includes(call);
          const coreCall = target === illustration.core && [illustration.wrapper, illustration.selected].some(parent => within(node, parent));
          need(inRegion(node) || movedCall || coreCall || target === decoder.reader && ordinaryDecoder(node), node);
          // A name merely appearing in an allowed call region cannot escape
          // as a callback, object field, assignment or function identity.
          if (!ts.isVariableDeclaration(target)) need(ts.isCallExpression(call) && call.expression === node
            && !call.questionDotToken && !call.arguments.some(ts.isSpreadElement), node);
          references.push({ node, target });
        }
        if (namespaces.has(bound)) need(ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node, node);
        if (inRegion(node) && ['Object', 'Array', 'Number', 'JSON', 'Math', 'Error', 'Boolean', 'undefined'].includes(node.text))
          need(!(bound?.declarations ?? []).some(value => !value.getSourceFile().isDeclarationFile), node);
      }
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
        need(node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]), node);
        const resolved = context.resolveSource(node.arguments[0].text, source.fileName);
        const target = resolved && context.program.getSourceFile(resolved.resolvedFileName);
        const module = target && context.checker.getSymbolAtLocation(target);
        if (module) need(!context.checker.getExportsOfModule(module).some(exported => {
          const value = exported.flags & ts.SymbolFlags.Alias ? context.checker.getAliasedSymbol(exported) : exported;
          return declarations.has(value);
        }), node);
      }
      ts.forEachChild(node, visit);
    }; visit(source);
  }
  return { status: 'conditional', declarations, regions, references, routeGuards };
}

function finiteSelectedGuideLegacyRetryTerms(ts, context, agent, decoder, native) {
  const fail = node => { throw { reason: 'SELECTED_GUIDE_LEGACY_GUIDE_RETRY_UNKNOWN', node }; };
  const need = (value, node) => { if (!value) fail(node); };
  const recover = agent.recover;
  const grammar = ts.createSourceFile('selected-retry-absence.ts', `function recovery(task: unknown) {
    try {
      if (task.kind !== 'workspace.guide' || task.session.kind !== 'workspace.guide' || task.status !== 'failed' || task.retryCount !== 0) return false;
      const guide = readWorkspaceGuidePayloadWithSelectedImage(task.payload), scope = guide.context.presentation;
      const marker = readNativeAgentExecution(task.result), cp = marker?.checkpoint;
      if (!scope?.selectedImageAssetId || !scope.versionId || scope.researchObjectId !== task.session.researchObjectId
        || marker?.profile !== 'paper-illustration' || !cp || cp.state !== 'completed' || cp.sourceKind
        || cp.taskId !== task.id || cp.executionAttempt > task.executionAttempt || cp.finishReason !== 'stop' || cp.hasToolCalls !== false
        || !isJsonRecord(task.result) || !isJsonRecord(task.result.sourceMapRef) || !isJsonRecord(task.result.selectedImageContext)) return false;
    } catch { return false; }
  }`, ts.ScriptTarget.ES2022, true).statements[0].body.statements[0];
  need(recover.body.statements.length === 1 && ts.isTryStatement(recover.body.statements[0]), recover);
  const attempt = recover.body.statements[0];
  need(!attempt.finallyBlock && attempt.catchClause && !attempt.catchClause.variableDeclaration
    && JSON.stringify(context.canonical(attempt.catchClause)) === JSON.stringify(context.canonical(grammar.catchClause)), attempt);
  const actual = attempt.tryBlock.statements, expected = grammar.tryBlock.statements;
  need(actual.length >= expected.length, attempt);
  for (let index = 0; index < expected.length; index += 1)
    need(JSON.stringify(context.canonical(actual[index])) === JSON.stringify(context.canonical(expected[index])), actual[index]);
  let markerReader;
  const visit = node => {
    if (ts.isIdentifier(node) && ['readWorkspaceGuidePayloadWithSelectedImage', 'readNativeAgentExecution'].includes(node.text)) {
      let bound = context.checker.getSymbolAtLocation(node);
      if (bound?.flags & ts.SymbolFlags.Alias) bound = context.checker.getAliasedSymbol(bound);
      if (node.text === decoder.reader.name.text) need(bound?.valueDeclaration === decoder.reader, node);
      else { markerReader = bound?.valueDeclaration; need(markerReader?.getSourceFile() === native.source
        && ts.isFunctionDeclaration(markerReader) && markerReader.name?.text === 'readNativeAgentExecution', node); }
    }
    ts.forEachChild(node, visit);
  };
  actual.slice(0, expected.length).forEach(visit);
  need(markerReader, recover);
  return { status: 'conditional', recover, prefix: actual.slice(0, expected.length), markerReader };
}

function finiteSelectedGuideSourceResidual(ts, context, rollbackContext, collected) {
  const fail = (reason, node) => { throw { reason, node }; };
  const left = finiteSelectedGuideSupplementaryTerms(ts, context, { ui: false });
  const right = finiteSelectedGuideSupplementaryTerms(ts, rollbackContext, { ui: false });
  const decoder = finiteSelectedGuideDecoderTerms(ts, left, right);
  // Capability is checked before fresh emission. A capable rollback owns its
  // selected retained families even if its HTTP producer is currently legacy.
  // Identical capable backends use the original exact-equality path; this
  // finite first-install branch never removes that capability on a downgrade.
  const oldContract = right.program.getSourceFile(resolve(right.root, 'packages/domain/src/agent/workspace-guide-contract.ts'));
  if (oldContract.statements.some(node => ts.isFunctionDeclaration(node) && node.name?.text === decoder.reader.name.text))
    fail('SELECTED_GUIDE_READER_CAPABILITY_REMOVED_OR_NONIDENTICAL', oldContract);
  const fresh = finiteSelectedGuideFreshTerms(ts, left, decoder, right);
  if (fresh.fresh !== 'legacy') fail('SELECTED_GUIDE_FAMILY_NOT_CLOSED', fresh.strictCall);
  const initialization = finiteSelectedGuideInitializationTerms(ts, context, rollbackContext, collected);
  const relocation = finiteSelectedGuideRelocationTerms(ts, left, right);
  const workspace = finiteSelectedGuideWorkspaceTerms(ts, left, right, decoder);
  const relocationResidual = finiteSelectedGuideRelocationResidualTerms(ts, left, right, relocation, workspace);
  const native = finiteSelectedGuideNativeTerms(ts, left, right, decoder);
  const handlers = finiteSelectedGuideHandlerTerms(ts, left, right);
  const illustration = finiteSelectedGuideIllustrationTerms(ts, left, right);
  const illustrationResidual = finiteSelectedGuideIllustrationResidualTerms(ts, left, right, illustration, initialization);
  const dormant = finiteSelectedGuideDormantModuleTerms(ts, left, right, decoder);
  const publicReader = finiteSelectedGuidePublicReaderTerms(ts, left, right);
  const agent = finiteSelectedGuideAgentResidualTerms(ts, left, right, decoder, publicReader);
  const ingestion = finiteSelectedGuideIngestionReaderTerms(ts, left, right);
  const legacyRetry = finiteSelectedGuideLegacyRetryTerms(ts, left, agent, decoder, native);
  const models = { decoder, fresh, initialization, relocation, workspace, relocationResidual, native, handlers,
    illustration, illustrationResidual, dormant, publicReader, agent, ingestion, legacyRetry };
  const closure = finiteSelectedGuideDeclarationTerms(ts, left, right, models);
  const projected = new Map();
  const add = value => {
    const key = relative(left.root, value.source.fileName).replaceAll('\\', '/');
    if (projected.has(key)) fail('SELECTED_GUIDE_OVERLAPPING_PROJECTION', value.source);
    const previous = right.program.getSourceFile(resolve(right.root, key));
    if (!previous || typeof value.text !== 'string') fail('SELECTED_GUIDE_RESIDUAL_MISSING', value.source);
    projected.set(key, { ...value, previous });
  };
  for (const value of [workspace, native, handlers, illustrationResidual, agent, ingestion]) add(value);
  // The relocation lemma returns the two independently derived module texts.
  add({ source: relocationResidual.source, text: relocationResidual.text });
  add({ source: relocationResidual.handler, text: relocationResidual.handlerText });
  for (const value of dormant.projections.values()) add(value);
  const api = fresh.source, apiGuard = closure.routeGuards[0];
  const transformedApi = ts.transform(api, [transformation => {
    const visit = node => {
      if (node === apiGuard) return undefined;
      if (ts.isImportDeclaration(node) && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
        const elements = node.importClause.namedBindings.elements.filter(entry => (entry.propertyName ?? entry.name).text !== 'requireSelectedImageSource');
        return ts.factory.updateImportDeclaration(node, node.modifiers, ts.factory.updateImportClause(node.importClause,
          node.importClause.isTypeOnly, node.importClause.name, ts.factory.updateNamedImports(node.importClause.namedBindings, elements)), node.moduleSpecifier, node.attributes);
      }
      return ts.visitEachChild(node, visit, transformation);
    }; return node => ts.visitNode(node, visit);
  }]);
  let apiText;
  try { apiText = ts.createPrinter().printFile(transformedApi.transformed[0]); } finally { transformedApi.dispose(); }
  const runtime = (text, owner) => JSON.stringify(owner.canonical(ts.createSourceFile('runtime.js', ts.transpileModule(text,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true } }).outputText,
  ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS)));
  const auxiliary = [];
  // Supplementary API/caller code cannot smuggle a changed schema factory,
  // global/library mutation or different dispatcher behind unchanged backend
  // fingerprints. These read-only inputs grant no collector authority.
  for (const source of left.program.getSourceFiles()) {
    const key = relative(left.root, source.fileName).replaceAll('\\', '/');
    if (source.isDeclarationFile || !/^(?:apps|packages)\//u.test(key) || projected.has(key)) continue;
    if (context.modules?.has(resolve(source.fileName))) continue; // main strictly compares this original entry
    const previous = right.program.getSourceFile(resolve(right.root, key));
    const text = source === api ? apiText : source.text;
    if (!previous || text.replaceAll('\r\n', '\n') !== previous.text.replaceAll('\r\n', '\n')
      && runtime(text, left) !== runtime(previous.text, right))
      fail('SELECTED_GUIDE_AUXILIARY_RUNTIME_CHANGED', source);
    auxiliary.push({ source, previous });
  }
  return { status: 'conditional', ...models, closure, projected, auxiliary,
    outstanding: ['actual ordinary result/historical root partition is not implied by this residual',
      'original successful DEFAULT private context identity and canonical snapshot',
      'strict remaining module/package/configuration/vendor entries and justified builtin import differences',
      'existing trusted transaction ordered-pair and root-controlled admitted origin premise'] };
}

function finiteSelectedGuideResultOriginTerms(ts, context, rollbackContext, residual) {
  const fail = node => { throw { reason: 'SELECTED_GUIDE_RESULT_ORIGIN_UNKNOWN', node }; };
  const need = (value, node) => { if (!value) fail(node); };
  const nodes = (root, predicate) => { const found = []; const visit = node => {
    if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
    if (predicate(node)) found.push(node); ts.forEachChild(node, visit);
  }; visit(root); return found; };
  const one = (values, node) => { need(values.length === 1, node); return values[0]; };
  const fn = (source, name) => one(source.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name), source);
  const symbol = (owner, node) => { let value = owner.checker.getSymbolAtLocation(node);
    if (value?.flags & ts.SymbolFlags.Alias) value = owner.checker.getAliasedSymbol(value); return value; };
  const unwrap = raw => { let node = raw; while (node && (ts.isAsExpression(node) || ts.isParenthesizedExpression(node))) node = node.expression; return node; };
  const oldAgent = residual.agent.previous, oldNative = residual.native.previous;
  const get = fn(oldAgent, 'getAgentTask'), view = fn(oldAgent, 'taskToView');
  const row = one(nodes(get, node => ts.isVariableDeclaration(node) && node.name.text === 'task'), get);
  const query = row.initializer && unwrap(ts.isAwaitExpression(row.initializer) ? row.initializer.expression : row.initializer);
  need(ts.isCallExpression(query) && ts.isPropertyAccessExpression(query.expression) && query.expression.name.text === 'findUnique'
    && ts.isPropertyAccessExpression(query.expression.expression) && query.expression.expression.name.text === 'agentTask', row);
  const projected = one(nodes(view, node => ts.isCallExpression(node)
    && symbol(rollbackContext, node.expression)?.valueDeclaration === residual.publicReader.previous), view);
  need(ts.isPropertyAccessExpression(projected.arguments[0]) && projected.arguments[0].name.text === 'result'
    && symbol(rollbackContext, projected.arguments[0].expression) === symbol(rollbackContext, view.parameters[0].name), projected);
  need(residual.publicReader.ordinaryRelation && residual.publicReader.region.length === 7, projected);
  // The actual classifier proof makes the ordinary projection equal to the
  // old tail for ANY opaque Json root, not a set of current fresh keys. Its
  // ordinary branch cannot assign a selected refill; all four deletes are
  // conditional on !ordinary. Historical keys therefore need no absence seed.
  const runtime = (node, owner) => JSON.stringify(owner.canonical(ts.createSourceFile('runtime.js', ts.transpileModule(node.getText(),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true } }).outputText,
  ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS)));
  const transfers = [];
  const bindTransfers = (model, names) => {
    const oldSource = model.previous ?? model.rollback;
    const normalized = ts.createSourceFile(model.source.fileName, model.text, ts.ScriptTarget.ES2022, true);
    for (const name of names) {
      const old = fn(oldSource, name), current = fn(model.source, name), ordinary = fn(normalized, name);
      need(runtime(ordinary, context) === runtime(old, rollbackContext), current);
      transfers.push({ old, current, ordinary, model });
    }
  };
  bindTransfers(residual.agent, ['getAgentTask', 'listAgentTasks', 'markTaskProgress', 'markTaskProgressOnce', 'retryAgentTask']);
  bindTransfers(residual.native, ['compareNativeAgentCheckpoint', 'nativeAgentTerminalResult']);
  bindTransfers(residual.ingestion, ['getIngestionTask']);
  const storePath = 'apps/agent-worker/src/native-agent/task-store.ts';
  const store = context.program.getSourceFile(resolve(context.root, storePath));
  const oldStore = rollbackContext.program.getSourceFile(resolve(rollbackContext.root, storePath));
  need(store && oldStore, store);
  bindTransfers({ source: store, previous: oldStore, text: store.text }, ['createNativeTaskStore']);
  // Bind the ordinary no-marker terminal gate as well as the result code:
  // a remote ordinary result cannot mint a server Native association. Marked
  // inputs must retain the identical marker, including task/CP association.
  const terminal = fn(oldNative, 'nativeAgentTerminalResult');
  const terminalGrammar = ts.createSourceFile('ordinary-terminal-retainer.ts', `function retain(task: unknown, status: string, incoming: unknown) {
    if (!marker) { if (record(incoming) && Object.hasOwn(incoming, 'nativeAgentExecution')) blocked(); return incoming; }
    if (record(incoming) && Object.hasOwn(incoming, 'nativeAgentExecution') && !isDeepStrictEqual(incoming.nativeAgentExecution, marker)) blocked();
  }`, ts.ScriptTarget.ES2022, true).statements[0].body.statements;
  const gate = terminal.body.statements.findIndex(node => ts.isIfStatement(node) && ts.isPrefixUnaryExpression(node.expression)
    && node.expression.operator === ts.SyntaxKind.ExclamationToken && node.expression.operand.getText() === 'marker');
  need(gate >= 0, terminal);
  terminalGrammar.forEach((node, index) => need(JSON.stringify(rollbackContext.canonical(terminal.body.statements[gate + index]))
    === JSON.stringify(rollbackContext.canonical(node)), terminal.body.statements[gate + index]));
  const marker = one(nodes(terminal, node => ts.isVariableDeclaration(node) && node.name.text === 'marker'), terminal);
  const reader = fn(oldNative, 'readNativeAgentExecution');
  need(ts.isCallExpression(marker.initializer) && symbol(rollbackContext, marker.initializer.expression)?.valueDeclaration === reader, marker);
  // This is pointwise composition through actual old/new functions on the
  // original authenticated immutable association, including arbitrary retained
  // root extensions. It is not a family-label/self-loop or fresh-fieldset claim.
  // Unknown/contradictory/selected rows still take the separately bound strict
  // quarantine. Erasure of EVERY immutable association is not distinguishable
  // from a legitimate ordinary row and is outside this original trusted seed.
  return { status: 'conditional', domain: 'authenticated-ordinary-opaque-json-root', node: projected.arguments[0],
    seed: { query, row, get, view, projected, ingestion: residual.ingestion.row },
    projection: residual.publicReader.ordinaryRelation, transfers, marker, terminalGate: terminal.body.statements.slice(gate, gate + 2) };
}

function finiteSelectedGuideMaintenanceSourceModel(ts, context, rollbackContext, collected) {
  const left = finiteSelectedGuideSupplementaryTerms(ts, context, { ui: false });
  const right = finiteSelectedGuideSupplementaryTerms(ts, rollbackContext, { ui: false });
  const decoder = finiteSelectedGuideDecoderTerms(ts, left, right);
  const oldContract = right.program.getSourceFile(resolve(right.root, 'packages/domain/src/agent/workspace-guide-contract.ts'));
  if (!oldContract?.statements.some(node => ts.isFunctionDeclaration(node) && node.name?.text === decoder.reader.name.text))
    throw { reason: 'SELECTED_GUIDE_MAINTENANCE_READER_MISSING', node: oldContract };
  const initialization = finiteSelectedGuideInitializationTerms(ts, context, rollbackContext, collected);
  const booking = finiteSelectedGuideMaintenanceBookingTerms(ts, left, right);
  const worker = finiteSelectedGuideMaintenanceWorkerTerms(ts, left, right);
  const view = finiteSelectedGuideMaintenanceViewTerms(ts, left, right);
  const qualification = finiteSelectedGuideMaintenanceQualificationTerms(ts, left, right);
  const fresh = finiteSelectedGuideFreshTerms(ts, left, decoder, right);
  if (fresh.fresh !== 'legacy') throw { reason: 'SELECTED_GUIDE_MAINTENANCE_ACTIVATION_UNKNOWN', node: fresh.strictCall };
  const models = { decoder, initialization, booking, worker, view, qualification, fresh };
  const remainder = finiteSelectedGuideMaintenanceRemainderTerms(ts, left, right, models);
  // The old capable projector, all six old contract functions and every other
  // retained runtime module survive the complete remainder equality. Ordinary
  // source/result/marker supplies are the same captured authenticated rows.
  // Selected reads are the qualified live extension; new producers stay cold.
  return { status: 'conditional', ...models, ...remainder,
    origin: { status: 'conditional', domain: 'authenticated-ordinary-opaque-and-capable-selected-retained',
      current: view.source, previous: view.previous, liveProjection: view.view,
      transfers: worker.retained, sameTransactionalAbort: booking },
    outstanding: ['successful DEFAULT private context/captured-node identities and strict remaining entries',
      'original installed library/configuration/vendor/client identities and transaction contract',
      'exact locked ordered pair/phase and root-controlled admitted producer/retainer history; no future W permission',
      'failed/retained-running states are not automatic same-task recovery, success, refund or availability promises'] };
}

function finiteSelectedGuideSourceModel(ts, context, rollbackContext, collected) {
  const oldContract = rollbackContext.program.getSourceFile(resolve(rollbackContext.root, 'packages/domain/src/agent/workspace-guide-contract.ts'));
  const assets = context.program.getSourceFile(resolve(context.root, 'packages/domain/src/assets/presentation-asset.ts'));
  if (oldContract?.statements.some(node => ts.isFunctionDeclaration(node) && node.name?.text === 'readWorkspaceGuidePayloadWithSelectedImage')
    && assets?.statements.some(node => ts.isFunctionDeclaration(node) && node.name?.text === 'readSelectedImageGenerationChild'))
    return finiteSelectedGuideMaintenanceSourceModel(ts, context, rollbackContext, collected);
  const residual = finiteSelectedGuideSourceResidual(ts, context, rollbackContext, collected);
  const origin = finiteSelectedGuideResultOriginTerms(ts, context, rollbackContext, residual);
  if (origin.status !== 'conditional') throw { reason: 'SELECTED_GUIDE_RESULT_ORIGIN_UNKNOWN', node: origin.node };
  return { ...residual, origin };
}

function finiteSelectedGuideApiLibraryTerms(context, rollbackContext) {
  const fail = () => { throw { reason: 'SELECTED_GUIDE_HTTP_LIBRARY_IDENTITY_UNKNOWN' }; };
  const need = value => { if (!value) fail(); };
  const manifest = (owner, path) => {
    const text = owner.sourceHost.readFile(path); need(typeof text === 'string');
    try { return JSON.parse(text); } catch { fail(); }
  };
  const identify = owner => {
    const importer = manifest(owner, resolve(owner.root, 'apps/api/package.json'));
    const expected = importer.dependencies?.zod;
    // This is the same trusted installed-package name/version boundary as
    // addExternal, plus the actual frozen importer. No source-only fake library
    // or a newly ranged dependency may stand in for the installed HTTP factory.
    need(typeof expected === 'string' && /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/u.test(expected));
    need(typeof owner.sourceHost.realpath === 'function');
    let directory = resolve(owner.root, 'apps/api/src/routes'), library, libraryPath;
    while (true) {
      const path = resolve(directory, 'node_modules/zod/package.json');
      if (owner.sourceHost.fileExists(path)) { library = manifest(owner, path); libraryPath = path; break; }
      if (directory === owner.root) break;
      const parent = resolve(directory, '..');
      need(parent !== directory && !relative(owner.root, parent).replaceAll('\\', '/').startsWith('../'));
      directory = parent;
    }
    need(library?.name === 'zod' && library.version === expected);
    const physicalPath = resolve(owner.sourceHost.realpath(libraryPath));
    const localPath = relative(owner.root, physicalPath).replaceAll('\\', '/');
    // Different temporary release roots are alpha-renamed only inside each
    // original root. A shared external package cache must be the SAME physical
    // package; an unrelated donor directory cannot borrow a matching version.
    const cacheIdentity = localPath !== '..' && !localPath.startsWith('../') && !isAbsolute(localPath)
      ? ['release', localPath] : ['shared', physicalPath];
    return { name: library.name, version: library.version, type: library.type ?? 'commonjs',
      main: library.main ?? null, exports: library.exports ?? null, dependency: expected, cacheIdentity };
  };
  const lock = owner => {
    const value = owner.sourceHost.readFile(resolve(owner.root, 'pnpm-lock.yaml'));
    need(typeof value === 'string' && value.length > 0); return value;
  };
  need(lock(context) === lock(rollbackContext));
  const current = identify(context), previous = identify(rollbackContext);
  need(JSON.stringify(current) === JSON.stringify(previous));
  return { status: 'conditional', current, previous };
}

function finiteSelectedGuidePairCompatibility(ts, current, previous, candidateRoot, rollbackRoot, roots, diagnostics = false) {
  let site = 'context', moduleKey;
  const reject = error => {
    if (diagnostics === true) emitPrivateRollbackDiagnostic(ts, current, previous, candidateRoot, rollbackRoot, roots,
      'selected-guide', site, error, moduleKey);
    return false;
  };
  try {
    const left = rollbackProofContexts.get(current), right = rollbackProofContexts.get(previous);
    if (roots !== APPLICATION_ROLLBACK_READERS || !left || !right || left.ts !== ts || right.ts !== ts
      || left.roots !== roots || right.roots !== roots || left.root !== candidateRoot || right.root !== rollbackRoot
      || left.program.getTypeChecker() !== left.checker || right.program.getTypeChecker() !== right.checker
      || typeof left.canonical !== 'function' || typeof right.canonical !== 'function'
      || typeof left.resolveSource !== 'function' || typeof right.resolveSource !== 'function' || !left.sourceHost || !right.sourceHost) return reject();
    const a = new Map(current), b = new Map(previous);
    if (a.size !== current.length || b.size !== previous.length) return reject();
    // The private synchronous collector/caller lifetime has no yield or
    // externally supplied context. Check its actual captured nodes and retained
    // module keys; source-only Programs and cloned arrays cannot reach here.
    for (const owner of [left, right]) for (const [path, source] of owner.modules) {
      site = 'captured-source'; moduleKey = `module:${relative(owner.root, path).replaceAll('\\', '/')}`;
      if (owner.program.getSourceFile(path) !== source || source.isDeclarationFile
        || !(owner === left ? a : b).has(`module:${relative(owner.root, path).replaceAll('\\', '/')}`)) return reject();
    }
    site = 'library'; moduleKey = undefined;
    finiteSelectedGuideApiLibraryTerms(left, right);
    site = 'model';
    const model = finiteSelectedGuideSourceModel(ts, left, right, { current, previous }), runtime = new Map();
    const affected = new Set([...model.projected.keys()].map(key => `module:${key}`));
    for (const [key, value] of model.projected) {
      const candidatePath = resolve(candidateRoot, key), previousPath = resolve(rollbackRoot, key);
      moduleKey = `module:${key}`;
      site = 'captured-source';
      if (!a.has(moduleKey) || !b.has(moduleKey) || left.modules.get(candidatePath) !== value.source
        || right.modules.get(previousPath) !== value.previous) return reject();
      site = 'projected-runtime';
      const emitted = finiteImageProjectedRuntime(ts, left, key, value); runtime.set(key, emitted);
      site = 'projected-equality';
      if (JSON.stringify(emitted.canonical) !== JSON.stringify(b.get(moduleKey))) return reject();
    }
    for (const key of new Set([...a.keys(), ...b.keys()])) {
      site = 'remaining-entry'; moduleKey = key;
      if (affected.has(key)) continue;
      if (a.has(key) && b.has(key)) { if (JSON.stringify(a.get(key)) !== JSON.stringify(b.get(key))) return reject(); continue; }
      // Exactly the established builtin rule, derived from a real removed
      // binding/use region. No package/config/vendor/module omission is allowed.
      site = 'builtin'; moduleKey = undefined;
      const match = /^(.*):external:(node:[A-Za-z0-9_/-]+)$/u.exec(key);
      if (!a.has(key) || b.has(key) || a.get(key) !== 'node-builtin' || !match || !model.projected.has(match[1])
        || !builtinModules.includes(match[2].slice(5)) && !builtinModules.includes(match[2])) return reject();
      const value = model.projected.get(match[1]), compiled = ts.transpileModule(value.source.text,
        { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true } });
      const original = ts.createSourceFile('runtime.js', compiled.outputText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
      if (!original.statements.some(node => ts.isImportDeclaration(node) && node.moduleSpecifier.text === match[2])
        || runtime.get(match[1]).imports.includes(match[2])
        || ![...b].some(([name, value]) => name.endsWith(`:external:${match[2]}`) && value === 'node-builtin')) return reject();
    }
    // Existing production callers still bind this directional source theorem
    // to the exact locked journal pair and root-controlled original history.
    // No queue emptiness, SHA allowlist, caller boolean or new ledger is used.
    return true;
  } catch (error) { return reject(error); }
}

// Directional reader introduction. Fresh admission can contract, but the old
// object domain is never inferred from a database scan or from a version tag.
// Stored readable objects may only be copied from the locked same-RO source;
// ordinary commits retain the old validator and every persistence operation.
function finiteSdfReadableSourceModel(ts, context, rollbackContext) {
  const fail = (reason, node) => { throw { reason: `SDF_R_${reason}`, node }; };
  const need = (condition, reason, node) => { if (!condition) fail(reason, node); };
  const nodes = (scope, predicate) => { const values = []; const visit = node => {
    if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
    if (predicate(node)) values.push(node); ts.forEachChild(node, visit);
  }; visit(scope); return values; };
  const one = (values, reason) => { need(values.length === 1, reason); return values[0]; };
  const file = (owner, path) => { const value = owner.program.getSourceFile(resolve(owner.root, path)); need(value, 'SOURCE_MISSING'); return value; };
  const symbol = node => { let value = ts.isShorthandPropertyAssignment(node.parent)
    ? context.checker.getShorthandAssignmentValueSymbol(node.parent) : context.checker.getSymbolAtLocation(node);
    if (value?.flags & ts.SymbolFlags.Alias) value = context.checker.getAliasedSymbol(value); return value; };
  const tokens = text => {
    const ast = ts.createSourceFile('sdf-term.ts', text, ts.ScriptTarget.ES2022, true);
    const visit = node => { const children = []; ts.forEachChild(node, child => { children.push(visit(child)); });
      return [node.kind, ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node) ? node.operator
        : ts.isIdentifier(node) || ts.isLiteralExpression(node) || ts.isTemplateLiteralToken(node) ? node.text : null, children]; };
    return JSON.stringify(visit(ast));
  };
  const same = (node, text) => !!node && tokens(node.getText()) === tokens(text);
  const fn = (source, name) => one(source.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name), 'FUNCTION_MISSING');
  const variable = (source, name) => one(nodes(source, node => ts.isVariableDeclaration(node) && node.name.getText() === name), 'VARIABLE_MISSING');
  const term = (scope, text, reason) => { const matches = nodes(scope, node => same(node, text));
    const outer = matches.filter(node => !matches.some(other => other !== node && other.pos <= node.pos && other.end >= node.end));
    need(outer.length === 1, reason, scope); return outer[0]; };
  const schemaPath = 'packages/sdf-schema/src/', domainPath = 'packages/domain/src/';
  const core = file(context, `${schemaPath}core.ts`), validate = file(context, `${schemaPath}validate.ts`);
  // These are real source objects, not invented old schemas. Full residual
  // equality below also retains their installed imports, options and vendors.
  for (const path of [`${schemaPath}core.ts`, `${schemaPath}validate.ts`])
    need(tokens(file(context, path).text) === tokens(file(rollbackContext, path).text), 'LEGACY_SCHEMA_CHANGED');
  need(same(variable(core, 'SDF_CORE_VERSION').initializer, "'0.1.0'"), 'LEGACY_IDENTITY_CHANGED');
  need(same(variable(core, 'SDF_CORE_FIELDS').initializer,
    "['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility',] as const"), 'LEGACY_FIELDS_CHANGED');
  for (const [name, title, full] of [['coreSchema', 'OpenScience SDF Core', true], ['draftCoreSchema', 'OpenScience SDF Draft Core', false]]) {
    const fields = ['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility']
      .map(key => `${key}: { type: 'string'${full ? ', minLength: 1' : ''} }`).join(',');
    need(same(variable(core, name).initializer, `{ $schema: 'http://json-schema.org/draft-07/schema#', title: '${title}',
      type: 'object', required: ['schemaVersion', ...SDF_CORE_FIELDS], properties: {
        schemaVersion: { const: SDF_CORE_VERSION }, ${fields}, }, } as const`), 'LEGACY_OPAQUE_DOMAIN_CHANGED');
  }
  for (const [name, compiled, schema] of [['validateSdfCore', 'coreValidate', 'coreSchema'], ['validateSdfDraftCore', 'draftCoreValidate', 'draftCoreSchema']]) {
    const validator = fn(validate, name);
    need(same(variable(validate, compiled).initializer, `ajv.compile(${schema})`)
      && validator.parameters.length === 1 && same(validator.parameters[0].name, 'doc')
      && !validator.parameters[0].initializer && !validator.parameters[0].dotDotDotToken
      && same(validator.body, `{ const ok = ${compiled}(doc); return { ok, errors: ${compiled}.errors ?? [] }; }`), 'LEGACY_VALIDATOR_CHANGED');
  }
  need(same(variable(validate, 'ajv').initializer, 'new Ajv({ allErrors: true })'), 'LEGACY_VALIDATOR_OPTIONS_CHANGED');
  const readablePath = `${schemaPath}readable-core.ts`, readable = file(context, readablePath);
  need(!rollbackContext.program.getSourceFile(resolve(rollbackContext.root, readablePath)), 'READABLE_ALREADY_PRESENT');
  const full = fn(readable, 'validateReadableSdfCore'), draft = fn(readable, 'validateReadableSdfDraftCore');
  const formatted = fn(readable, 'formattedCoreSchema'), identity = fn(readable, 'isFormattedIdentity'), parse = fn(readable, 'parseReadableSdfCore');
  need(same(variable(readable, 'SDF_READABLE_CORE_VERSION').initializer, "'0.2.0'"), 'READABLE_IDENTITY_CHANGED');
  need(same(formatted.body, `{
    return { type: 'object', required: ['schemaVersion', ...SDF_CORE_FIELDS], properties: {
      schemaVersion: { const: SDF_READABLE_CORE_VERSION },
      ...Object.fromEntries(SDF_CORE_FIELDS.map((field) => [field, { type: 'string', ...(full ? { minLength: 1 } : {}) }])),
      fieldFormats: { type: 'object', properties: Object.fromEntries(SDF_CORE_FIELDS.map((field) => [field, { enum: ['plain', 'markdown'] }])), additionalProperties: false, },
    }, };
  }`), 'READABLE_SCHEMA_CHANGED');
  need(same(identity.body, `{ return !!doc && typeof doc === 'object' && !Array.isArray(doc)
    && (doc as { schemaVersion?: unknown }).schemaVersion === SDF_READABLE_CORE_VERSION; }`), 'OPAQUE_REINTERPRETED');
  for (const [node, old, compiled] of [[full, 'validateSdfCore', 'fullValidate'], [draft, 'validateSdfDraftCore', 'draftValidate']])
    need(same(node.body, `{ if (!isFormattedIdentity(doc)) return ${old}(doc); const ok = ${compiled}(doc); return { ok, errors: ${compiled}.errors ?? [] }; }`), 'READABLE_FALLBACK_CHANGED');
  need(same(parse.body, '{ return validateReadableSdfDraftCore(doc).ok ? doc as ReadableSdfCore : null; }'), 'READABLE_NORMALIZATION');
  // Bound all eager work: a private Ajv with the existing installed package,
  // two finite schemas, no defaults/coercion/removal or arbitrary initializers.
  const declarations = new Map([
    ['SDF_READABLE_CORE_VERSION', "'0.2.0'"], ['ajv', 'new Ajv({ allErrors: true })'],
    ['fullValidate', 'ajv.compile(formattedCoreSchema(true))'], ['draftValidate', 'ajv.compile(formattedCoreSchema(false))'],
  ]);
  const functions = new Set([formatted, identity, full, draft, parse]);
  const imports = ["import Ajv from 'ajv';", "import { SDF_CORE_FIELDS, type SdfCore } from './core';",
    "import { validateSdfCore, validateSdfDraftCore, type ValidationResult } from './validate';"];
  let importCount = 0;
  for (const statement of readable.statements) {
    if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) continue;
    if (ts.isImportDeclaration(statement)) { need(imports.some(text => same(statement, text)), 'INITIALIZATION_IMPORT_CHANGED', statement); importCount++; continue; }
    if (functions.has(statement)) {
      need(!statement.asteriskToken && !statement.modifiers?.some(node => node.kind === ts.SyntaxKind.AsyncKeyword)
        && (statement.modifiers?.map(node => node.kind).join(',') ?? '') === ([full, draft, parse].includes(statement) ? String(ts.SyntaxKind.ExportKeyword) : '')
        && statement.parameters.length === 1 && !statement.parameters[0].initializer
        && !statement.parameters[0].dotDotDotToken
        && same(statement.parameters[0].name, statement === formatted ? 'full' : 'doc'), 'READABLE_FUNCTION_EFFECT_CHANGED', statement);
      continue;
    }
    need(ts.isVariableStatement(statement) && statement.declarationList.flags & ts.NodeFlags.Const
      && statement.declarationList.declarations.length === 1, 'INITIALIZATION_EFFECT_CHANGED', statement);
    const value = statement.declarationList.declarations[0], name = value.name.getText();
    need(declarations.has(name) && same(value.initializer, declarations.get(name)), 'INITIALIZATION_EFFECT_CHANGED', value);
    need((statement.modifiers?.map(node => node.kind).join(',') ?? '')
      === (name === 'SDF_READABLE_CORE_VERSION' ? String(ts.SyntaxKind.ExportKeyword) : ''), 'INITIALIZATION_EXPORT_CHANGED', statement);
    declarations.delete(name);
  }
  need(importCount === 3 && declarations.size === 0, 'INITIALIZATION_INCOMPLETE');
  for (const [name, declaration] of [['SDF_CORE_FIELDS', variable(core, 'SDF_CORE_FIELDS')],
    ['validateSdfCore', fn(validate, 'validateSdfCore')], ['validateSdfDraftCore', fn(validate, 'validateSdfDraftCore')],
    ['formattedCoreSchema', formatted], ['isFormattedIdentity', identity], ['validateReadableSdfDraftCore', draft]]) {
    for (const use of nodes(readable, node => ts.isIdentifier(node) && node.text === name))
      need(symbol(use) === symbol(declaration.name), 'READABLE_BINDING_CHANGED', use);
  }
  const projected = new Map();
  const edit = (path, edits) => {
    const source = file(context, path), rollback = file(rollbackContext, path);
    let text = source.text;
    for (const { node, text: value } of edits.sort((a, b) => b.node.getStart() - a.node.getStart()))
      text = text.slice(0, node.getStart()) + value + text.slice(node.end);
    projected.set(path, { source, rollback, text });
  };
  const commitPath = `${domainPath}commit/commits.ts`, commits = file(context, commitPath), oldCommits = file(rollbackContext, commitPath);
  const wrapper = fn(commits, 'createCommit'), internal = fn(commits, 'createCommitInternal'), stored = fn(commits, 'createStoredSnapshotCommit');
  const oldCommit = fn(oldCommits, 'createCommit');
  need(same(wrapper.body, '{ return createCommitInternal(deps, input, ctx, transaction, systemExecution); }')
    && symbol(wrapper.body.statements[0].expression.expression) === symbol(internal.name), 'FRESH_FORWARD_CHANGED');
  const parameterRuntime = parameters => parameters.map(node => `${node.dotDotDotToken ? '...' : ''}${node.name.getText()}${node.initializer ? `=${node.initializer.getText()}` : ''}`).join(',');
  need(parameterRuntime(wrapper.parameters) === parameterRuntime(oldCommit.parameters)
    && parameterRuntime(internal.parameters) === 'deps,input,ctx,transaction,systemExecution,storedCore'
    && !internal.asteriskToken && internal.modifiers?.length === 1 && internal.modifiers[0].kind === ts.SyntaxKind.AsyncKeyword,
  'COMMIT_SIGNATURE_CHANGED');
  const check = term(internal, 'storedCore === undefined ? validateSdfDraftCore(finalCore) : validateReadableSdfDraftCore(storedCore)', 'COMMIT_VALIDATOR_CHANGED');
  need(symbol(check.whenTrue.expression) === symbol(fn(validate, 'validateSdfDraftCore').name)
    && symbol(check.whenFalse.expression) === symbol(draft.name), 'COMMIT_VALIDATOR_BINDING_CHANGED');
  // Every statement of the only new persistent supplier is accounted for.
  // Its object aliases are never spread, normalized or obtained from caller core.
  const storedStatements = [
    'await transaction.$queryRaw`SELECT id FROM research_objects WHERE id = ${input.researchObjectId}::uuid FOR UPDATE`;',
    'const ro = await transaction.researchObject.findUnique({ where: { id: input.researchObjectId }, include: { sdfDocument: true } });',
    "if (!ro || ro.deletedAt) throw new CommitError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');",
    "await requireCommitAuthority({ ...deps, prisma: transaction as WorkspaceDeps['prisma'] }, ro.workspaceId, input.userId, true);",
    "if (ro.version !== input.version) throw new CommitError('CONCURRENT_UPDATE', '版本冲突，请刷新后重试');",
    'let core: Record<string, unknown>;', 'let artifacts: ArtifactReference[] | undefined;',
    `if (input.source.kind === 'version') {
      const source = await transaction.version.findFirst({ where: { id: input.source.versionId, researchObjectId: ro.id }, include: { manifest: { include: { entries: true } } }, });
      if (!source?.manifest) throw new CommitError('VALIDATION_ERROR', '所选历史稿不存在');
      const artifactIds = source.manifest.entries.map(entry => entry.artifactId);
      if (await transaction.artifact.count({ where: { id: { in: artifactIds }, workspaceId: ro.workspaceId, deletedAt: null } }) !== new Set(artifactIds).size) {
        throw new CommitError('VALIDATION_ERROR', '历史材料已移入回收站，请先恢复相关材料');
      }
      core = source.manifest.coreJson as Record<string, unknown>;
      artifacts = source.manifest.entries.map(entry => ({ artifactId: entry.artifactId, logicalPath: entry.logicalPath }));
    } else {
      if (!ro.sdfDocument) throw new CommitError('VALIDATION_ERROR', 'SDF 文档不存在');
      core = ro.sdfDocument.coreJson as Record<string, unknown>;
    }`,
    `return createCommitInternal(deps, {
      researchObjectId: ro.id, userId: input.userId, version: input.version, message: input.message,
      sdfCore: core, ...(artifacts ? { artifacts } : {}),
    }, ctx, transaction, undefined, core);`,
  ];
  need(stored.body.statements.length === storedStatements.length && stored.body.statements.every((node, index) => same(node, storedStatements[index])), 'STORED_SOURCE_CHANGED', stored);
  need(parameterRuntime(stored.parameters) === 'deps,input,ctx,transaction' && !stored.asteriskToken
    && stored.modifiers?.some(node => node.kind === ts.SyntaxKind.AsyncKeyword), 'STORED_SIGNATURE_CHANGED');
  const authority = fn(commits, 'requireCommitAuthority');
  const authorityCall = term(stored, "requireCommitAuthority({ ...deps, prisma: transaction as WorkspaceDeps['prisma'] }, ro.workspaceId, input.userId, true)", 'STORED_AUTHORITY_CHANGED');
  need(symbol(authorityCall.expression) === symbol(authority.name), 'STORED_AUTHORITY_BINDING_CHANGED');
  const internalCall = stored.body.statements.at(-1).expression;
  need(symbol(internalCall.expression) === symbol(internal.name), 'STORED_INTERNAL_BINDING_CHANGED');
  const restorePath = `${domainPath}commit/restore-draft.ts`, restore = file(context, restorePath);
  const oldRestore = file(rollbackContext, restorePath);
  const restoreEdits = [];
  const newRestoreCalls = [
    `createStoredSnapshotCommit(deps, { researchObjectId: ro.id, userId: input.userId, version: currentRevision, source: { kind: 'current-draft' }, message: 'Save draft before restoring history' }, ctx, tx)`,
    `createStoredSnapshotCommit(deps, { researchObjectId: ro.id, userId: input.userId, version: currentRevision, source: { kind: 'version', versionId: source.id }, message: \`Restore draft from \${source.createdAt.toISOString()}\`, }, ctx, tx)`,
  ];
  const oldRestoreCalls = [
    `createCommit(deps, { researchObjectId: ro.id, userId: input.userId, version: currentRevision, sdfCore: ro.sdfDocument.coreJson as Record<string, unknown>, message: 'Save draft before restoring history' }, ctx, tx)`,
    `createCommit(deps, { researchObjectId: ro.id, userId: input.userId, version: currentRevision, sdfCore: source.manifest.coreJson as Record<string, unknown>, artifacts: source.manifest.entries.map(entry => ({ artifactId: entry.artifactId, logicalPath: entry.logicalPath })), message: \`Restore draft from \${source.createdAt.toISOString()}\`, }, ctx, tx)`,
  ];
  const allowedStoredCalls = new Set();
  for (let index = 0; index < 2; index++) {
    const call = term(restore, newRestoreCalls[index], `RESTORE_SOURCE_${index}_CHANGED`);
    need(symbol(call.expression) === symbol(stored.name), 'RESTORE_SOURCE_BINDING_CHANGED');
    term(oldRestore, oldRestoreCalls[index], 'OLD_RESTORE_SOURCE_CHANGED');
    allowedStoredCalls.add(call.expression); restoreEdits.push({ node: call, text: oldRestoreCalls[index] });
  }
  const newImport = term(restore, "import { createStoredSnapshotCommit } from './commits';", 'RESTORE_IMPORT_CHANGED');
  restoreEdits.push({ node: newImport, text: "import { createCommit } from './commits';" });
  // No extra caller, export, namespace or value escape can borrow this proof.
  const helperSymbol = symbol(stored.name), internalSymbol = symbol(internal.name);
  need(helperSymbol && internalSymbol, 'STORED_SYMBOL_MISSING');
  for (const source of context.program.getSourceFiles()) {
    if (source.isDeclarationFile) continue;
    for (const use of nodes(source, ts.isIdentifier)) {
      const target = symbol(use);
      if (target === internalSymbol) need(use === internal.name || use === wrapper.body.statements[0].expression.expression || use === internalCall.expression, 'INTERNAL_ESCAPE', use);
      if (target === helperSymbol) need(use === stored.name || allowedStoredCalls.has(use)
        || ts.isImportSpecifier(use.parent) && use.parent.name === use && use.getSourceFile() === restore, 'STORED_ESCAPE', use);
    }
    for (const statement of source.statements) if (ts.isImportDeclaration(statement) && statement.importClause?.namedBindings
      && ts.isNamespaceImport(statement.importClause.namedBindings)) {
      const module = context.checker.getSymbolAtLocation(statement.moduleSpecifier);
      need(!module || !context.checker.getExportsOfModule(module).some(value => {
        if (value.flags & ts.SymbolFlags.Alias) value = context.checker.getAliasedSymbol(value); return value === helperSymbol;
      }), 'STORED_NAMESPACE_ESCAPE', statement);
    }
    // Unchanged namespace/dynamic consumers can acquire a newly exported
    // capability without changing their own bytes. They cannot borrow the
    // two explicit restore call sites' authority.
    const exposesStored = specifier => {
      const module = context.checker.getSymbolAtLocation(specifier);
      return module && context.checker.getExportsOfModule(module).some(value => {
        if (value.flags & ts.SymbolFlags.Alias) value = context.checker.getAliasedSymbol(value); return value === helperSymbol;
      });
    };
    for (const statement of source.statements) if (ts.isExportDeclaration(statement) && statement.moduleSpecifier
      && (!statement.exportClause || !ts.isNamedExports(statement.exportClause)))
      need(!exposesStored(statement.moduleSpecifier), 'STORED_NAMESPACE_EXPORT', statement);
    for (const call of nodes(source, ts.isCallExpression)) if ((call.expression.kind === ts.SyntaxKind.ImportKeyword
      || ts.isIdentifier(call.expression) && call.expression.text === 'require') && call.arguments.length === 1 && ts.isStringLiteral(call.arguments[0])) {
      const specifier = call.arguments[0];
      need(!exposesStored(specifier) && !(specifier.text.startsWith('.')
        && resolve(source.fileName, '..', specifier.text.replace(/\.[cm]?js$/u, '')) === resolve(context.root, commitPath.replace(/\.ts$/u, ''))),
      'STORED_DYNAMIC_ESCAPE', call);
    }
  }
  edit(restorePath, restoreEdits);
  const commitImport = term(commits, "import { validateReadableSdfDraftCore, validateSdfDraftCore } from '@openscience/sdf-schema';", 'COMMIT_IMPORT_CHANGED');
  let body = internal.body.getText();
  const position = check.getStart() - internal.body.getStart();
  body = body.slice(0, position) + 'validateSdfDraftCore(finalCore)' + body.slice(check.end - internal.body.getStart());
  const normalized = commits.text.slice(wrapper.getStart(), wrapper.body.getStart()) + body;
  edit(commitPath, [{ node: wrapper, text: '' }, { node: stored, text: '' },
    { node: internal, text: normalized },
    { node: commitImport, text: "import { validateSdfDraftCore } from '@openscience/sdf-schema';" }]);
  const exportPath = `${domainPath}export/validate.ts`, exported = file(context, exportPath);
  const exportImport = term(exported, "import { validateManifest, validateReadableSdfCore } from '@openscience/sdf-schema';", 'EXPORT_IMPORT_CHANGED');
  const exportCall = term(exported, 'validateReadableSdfCore(core)', 'EXPORT_FULL_READER_CHANGED');
  need(symbol(exportCall.expression) === symbol(full.name), 'EXPORT_FULL_BINDING_CHANGED');
  edit(exportPath, [{ node: exportImport, text: "import { validateManifest, validateSdfCore } from '@openscience/sdf-schema';" },
    { node: exportCall, text: 'validateSdfCore(core as never)' }]);
  const roPath = `${domainPath}research-object/research-objects.ts`, roSource = file(context, roPath);
  const roGuard = term(roSource, `if (core.schemaVersion !== undefined && core.schemaVersion !== SDF_CORE_VERSION) {
    throw new ResearchObjectError('VALIDATION_ERROR', '新建研究暂不支持此正文版本'); }`, 'FRESH_RO_ADMISSION_CHANGED');
  const createRO = fn(roSource, 'createResearchObject');
  need(createRO.body.statements.indexOf(roGuard) === createRO.body.statements.findIndex(node => same(node, 'const core = input.sdf?.core ?? emptyCore();')) + 1,
    'FRESH_RO_GUARD_POSITION_CHANGED');
  const roImport = term(roSource, "import { SDF_CORE_FIELDS, SDF_CORE_VERSION } from '@openscience/sdf-schema';", 'FRESH_RO_IMPORT_CHANGED');
  edit(roPath, [{ node: roGuard, text: '' }, { node: roImport, text: "import { SDF_CORE_FIELDS } from '@openscience/sdf-schema';" }]);
  const journalPath = `${domainPath}journal/publishing.ts`, journal = file(context, journalPath);
  const journalContentPath = `${domainPath}journal/content.ts`, journalContent = file(context, journalContentPath);
  const digest = fn(journalContent, 'journalDigest');
  need(tokens(journalContent.text) === tokens(file(rollbackContext, journalContentPath).text)
    && same(digest.body, `{
      const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, item]) => [k, canonical(item)])) : v;
      return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
    }`), 'JOURNAL_DIGEST_ORDER_UNPROVEN');
  for (const use of nodes(journal, node => ts.isIdentifier(node) && node.text === 'journalDigest'))
    need(symbol(use) === symbol(digest.name), 'JOURNAL_DIGEST_BINDING_CHANGED', use);
  const journalVersion = term(journal, 'const explicitCoreVersion = (draft.core as Record<string, unknown>).schemaVersion;', 'JOURNAL_VERSION_CHANGED');
  const journalGuard = term(journal, `if (explicitCoreVersion !== undefined && explicitCoreVersion !== SDF_CORE_VERSION) {
    throw new JournalError('VALIDATION_ERROR', '期刊发布暂不支持此正文版本'); }`, 'JOURNAL_ADMISSION_CHANGED');
  const journalCore = term(journal, 'const core = { ...draft.core, schemaVersion: SDF_CORE_VERSION };', 'JOURNAL_CORE_CHANGED');
  const block = journalVersion.parent;
  need(ts.isBlock(block) && block.statements.indexOf(journalGuard) === block.statements.indexOf(journalVersion) + 1
    && block.statements.indexOf(journalCore) === block.statements.indexOf(journalGuard) + 1
    && same(block.statements[block.statements.indexOf(journalVersion) - 1], 'const draft = validateJournalDraft(article.draft, source);'), 'JOURNAL_GUARD_POSITION_CHANGED');
  const coreSymbol = symbol(journalCore.declarationList.declarations[0].name), journalEdits = [journalVersion, journalGuard, journalCore].map(node => ({ node, text: '' }));
  let coreCopies = 0;
  for (const use of nodes(journal, ts.isIdentifier)) if (symbol(use) === coreSymbol && use !== journalCore.declarationList.declarations[0].name) {
    need(ts.isPropertyAssignment(use.parent) && use.parent.initializer === use && use.parent.name.getText() === 'coreJson'
      || ts.isShorthandPropertyAssignment(use.parent) && use.parent.name === use, 'JOURNAL_CORE_ESCAPE', use);
    journalEdits.push({ node: use.parent, text: `${ts.isShorthandPropertyAssignment(use.parent) ? 'core' : 'coreJson'}: { schemaVersion: SDF_CORE_VERSION, ...draft.core }` }); coreCopies++;
  }
  need(coreCopies === 3, 'JOURNAL_COPY_COUNT_CHANGED');
  edit(journalPath, journalEdits);
  // On absent/old identity the guard is a no-op; the spread reordering changes
  // no value, including opaque extra keys; the real digest sorts object keys.
  // Non-old explicit inputs are rejected
  // before mutation, rather than assumed absent from pre-existing history.
  for (const source of [roSource, journal]) for (const use of nodes(source, node => ts.isIdentifier(node) && node.text === 'SDF_CORE_VERSION'))
    need(symbol(use) === symbol(variable(core, 'SDF_CORE_VERSION').name), 'FRESH_IDENTITY_BINDING_CHANGED', use);
  const indexPath = `${schemaPath}index.ts`, index = file(context, indexPath);
  const readableExport = one(index.statements.filter(node => ts.isExportDeclaration(node) && node.moduleSpecifier?.text === './readable-core'), 'READABLE_EXPORT_CHANGED');
  need(same(readableExport, `export { SDF_READABLE_CORE_VERSION, parseReadableSdfCore, validateReadableSdfCore, validateReadableSdfDraftCore,
    type SdfField, type SdfFieldFormat, type FormattedSdfCore, type ReadableSdfCore, } from './readable-core';`), 'READABLE_EXPORT_CHANGED');
  edit(indexPath, [{ node: readableExport, text: '' }]);
  // Source controls use the actual retained old modules as their oracle. This
  // does not grant collector authority: installed configuration, imports and
  // every unprojected module still have to pass the private pair below.
  const runtime = source => {
    const result = ts.transpileModule(source, { reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true } });
    need(!result.diagnostics?.some(value => value.category === ts.DiagnosticCategory.Error), 'PROJECTED_RUNTIME_INVALID');
    const ast = ts.createSourceFile('sdf-runtime.js', result.outputText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
    need(!ast.parseDiagnostics.length, 'PROJECTED_RUNTIME_INVALID');
    return tokens(result.outputText);
  };
  for (const value of projected.values()) need(runtime(value.text) === runtime(value.rollback.text), 'MODULE_RESIDUAL_CHANGED', value.source);
  return { domain: 'stored-snapshot-copy-and-legacy-fresh', projected, capsules: new Map([[readablePath, readable]]),
    external: { source: readable, specifier: 'ajv', previousSource: file(rollbackContext, `${schemaPath}validate.ts`) } };
}

function finiteSdfReadablePairCompatibility(ts, current, previous, candidateRoot, rollbackRoot, roots) {
  try {
    const captured = finiteImageCollectedContexts(ts, current, previous, candidateRoot, rollbackRoot, roots);
    if (!captured) return false;
    const { left, right } = captured, model = finiteSdfReadableSourceModel(ts, left, right);
    const a = new Map(current), b = new Map(previous), affected = new Set();
    for (const [path, value] of model.projected) {
      const key = `module:${path}`;
      if (!a.has(key) || !b.has(key) || right.modules.get(resolve(right.root, path)) !== value.rollback
        || JSON.stringify(finiteImageProjectedRuntime(ts, left, path, value).canonical) !== JSON.stringify(b.get(key))) return false;
      affected.add(key);
    }
    for (const [path, source] of model.capsules) {
      if (left.modules.get(resolve(left.root, path)) !== source || !a.has(`module:${path}`) || b.has(`module:${path}`)) return false;
      affected.add(`module:${path}`);
    }
    const externalPath = relative(left.root, model.external.source.fileName).replaceAll('\\', '/');
    const oldExternalPath = relative(right.root, model.external.previousSource.fileName).replaceAll('\\', '/');
    const extra = `${externalPath}:external:${model.external.specifier}`, old = `${oldExternalPath}:external:${model.external.specifier}`;
    // The existing collector fingerprints the actual installed package. This
    // additional import must bind that very implementation, never an alias or
    // an ignored dependency/configuration/module initialization difference.
    if (!a.has(extra) || b.has(extra) || !b.has(old) || JSON.stringify(a.get(extra)) !== JSON.stringify(b.get(old))) return false;
    affected.add(extra);
    for (const key of new Set([...a.keys(), ...b.keys()])) if (!affected.has(key)
      && (!a.has(key) || !b.has(key) || JSON.stringify(a.get(key)) !== JSON.stringify(b.get(key)))) return false;
    return true;
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
    if (entries.length === 16) continue;
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
        && (finiteVideoPairCompatibility(ts, current, previous, resolve(candidateRoot), resolve(rollbackRoot), roots, diagnostics === true)
          || finiteImageCapablePairCompatibility(ts, current, previous, resolve(candidateRoot), resolve(rollbackRoot), roots)
          || finiteImageFirstPairCompatibility(ts, current, previous, resolve(candidateRoot), resolve(rollbackRoot), roots)
          || finiteVoicePairCompatibility(ts, current, previous, resolve(candidateRoot), resolve(rollbackRoot), roots)
          || finiteSdfReadablePairCompatibility(ts, current, previous, resolve(candidateRoot), resolve(rollbackRoot), roots)
          || finiteSelectedGuidePairCompatibility(ts, current, previous, resolve(candidateRoot), resolve(rollbackRoot), roots, diagnostics === true)))) {
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
