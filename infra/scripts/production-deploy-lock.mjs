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
    return [node.kind, ts.isIdentifier(node) || ts.isLiteralExpression(node) || ts.isTemplateLiteralToken(node) ? (locationLiterals.get(node) ?? node.text) : null, children];
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
  return [...selected.entries()].sort(([left], [right]) => left.localeCompare(right));
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
    if (JSON.stringify(current) !== JSON.stringify(previous)) {
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
