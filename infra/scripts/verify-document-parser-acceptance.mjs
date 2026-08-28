#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { createRequire } from 'node:module';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  verifyReleaseInputManifest,
  verifyReleaseRuntimeSnapshot,
} from '../../scripts/release-input-manifest.mjs';

const SHA_PATTERN = /^[a-f0-9]{40}$/u;
const IMAGE_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const MAX_REPORT_BYTES = 16 * 1024 * 1024;
const FINAL_REPORT_KEYS = [
  'schemaVersion', 'sourceSha', 'manifestSha256', 'images', 'runtimeProcess',
  'gatewayCalls', 'summary', 'cases', 'resources',
].sort();

async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

function requireIdentity(sourceSha, workerImageId, parserImageId) {
  if (!SHA_PATTERN.test(sourceSha)) throw new Error('parser acceptance source SHA is invalid');
  if (!IMAGE_PATTERN.test(workerImageId) || !IMAGE_PATTERN.test(parserImageId)) {
    throw new Error('parser acceptance image identity is invalid');
  }
}

export async function verifyParserAcceptance({
  releaseRoot, reportPath, sourceSha, workerImageId, parserImageId,
}) {
  requireIdentity(sourceSha, workerImageId, parserImageId);
  const canonicalReleaseRoot = resolve(releaseRoot);
  if (basename(canonicalReleaseRoot) !== sourceSha || await realpath(canonicalReleaseRoot) !== canonicalReleaseRoot) {
    throw new Error('parser acceptance release source path is not the exact SHA root');
  }
  await verifyReleaseInputManifest({ root: canonicalReleaseRoot, sourceSha });

  const canonicalReport = resolve(reportPath);
  const reportInfo = await lstat(canonicalReport);
  if (!reportInfo.isFile() || reportInfo.isSymbolicLink() || reportInfo.size <= 0
    || reportInfo.size > MAX_REPORT_BYTES || await realpath(canonicalReport) !== canonicalReport) {
    throw new Error('parser acceptance report is missing, unsafe or too large');
  }
  if (process.platform !== 'win32' && (reportInfo.uid !== 0 || (reportInfo.mode & 0o022) !== 0)) {
    throw new Error('parser acceptance report owner or mode is unsafe');
  }
  const report = JSON.parse(await readFile(canonicalReport, 'utf8'));
  if (!report || typeof report !== 'object' || Array.isArray(report)
    || Object.keys(report).sort().join(',') !== FINAL_REPORT_KEYS.join(',')) {
    throw new Error('parser acceptance final report shape is invalid');
  }
  const { resources, ...draft } = report;
  if (draft.sourceSha !== sourceSha || draft.images?.worker !== workerImageId
    || draft.images?.parser !== parserImageId) {
    throw new Error('parser acceptance report source or image identity mismatch');
  }

  const contractPath = join(canonicalReleaseRoot, 'apps', 'agent-worker', 'dist', 'parser-acceptance-contract.js');
  if (resources?.build?.contractSha256 !== await sha256(contractPath)) {
    throw new Error('parser acceptance contract build identity mismatch');
  }
  await verifyReleaseRuntimeSnapshot({
    root: canonicalReleaseRoot,
    sourceSha,
    expected: resources?.build?.runtimeInputs,
  });
  const contract = createRequire(import.meta.url)(contractPath);
  for (const name of [
    'validateAcceptanceDraft', 'validateRuntimeEvidence', 'verifyAcceptanceRuntimeGraphManifest',
  ]) {
    if (typeof contract[name] !== 'function') throw new Error(`parser acceptance contract export missing: ${name}`);
  }
  const validatedDraft = contract.validateAcceptanceDraft(draft);
  contract.validateRuntimeEvidence(resources, validatedDraft);
  await contract.verifyAcceptanceRuntimeGraphManifest(canonicalReleaseRoot, resources.build.runtimeGraph);
  await verifyReleaseRuntimeSnapshot({
    root: canonicalReleaseRoot,
    sourceSha,
    expected: resources.build.runtimeInputs,
  });
  await verifyReleaseInputManifest({ root: canonicalReleaseRoot, sourceSha });
}

function parseCli(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || !value || values.has(flag)) throw new Error('invalid parser acceptance verifier arguments');
    values.set(flag, value);
  }
  const expected = ['--release-root', '--report', '--source-sha', '--worker-image-id', '--parser-image-id'];
  if (argv.length !== expected.length * 2 || expected.some((flag) => !values.has(flag))) {
    throw new Error(`usage: ${basename(process.argv[1] ?? 'verify-document-parser-acceptance.mjs')} ${expected.map((flag) => `${flag} <value>`).join(' ')}`);
  }
  const sourceSha = values.get('--source-sha');
  const releaseRoot = values.get('--release-root');
  const reportPath = values.get('--report');
  if (releaseRoot !== `/opt/openscience-releases/${sourceSha}`
    || reportPath !== `/opt/openscience-acceptance/document-parser/${sourceSha}/report.json`) {
    throw new Error('parser acceptance verifier requires fixed production paths');
  }
  return {
    releaseRoot, reportPath, sourceSha,
    workerImageId: values.get('--worker-image-id'), parserImageId: values.get('--parser-image-id'),
  };
}

async function main() {
  await verifyParserAcceptance(parseCli(process.argv.slice(2)));
  process.stdout.write('PARSER_ACCEPTANCE_DEPLOY_CONTRACT_OK\n');
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'parser acceptance verification failed');
    process.exitCode = 65;
  });
}
