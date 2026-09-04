import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const SHA1 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const EVIDENCE_REF = /^[a-z][a-z0-9-]{1,40}:sha256:[a-f0-9]{64}$/;

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function exact(value, keys, label) {
  const row = object(value, label);
  const actual = Object.keys(row).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has missing or unknown fields`);
  }
  return row;
}

function integer(value, label, { min = 0 } = {}) {
  if (!Number.isSafeInteger(value) || value < min) throw new Error(`${label} must be an integer >= ${min}`);
  return value;
}

function finite(value, label, { min = 0 } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) throw new Error(`${label} must be a finite number >= ${min}`);
  return value;
}

function flag(value, label) {
  if (typeof value !== 'boolean') throw new Error(`${label} must be boolean`);
  return value;
}

function ratio(passed, total, label) {
  integer(passed, `${label} passed`);
  integer(total, `${label} total`, { min: 1 });
  if (passed > total) throw new Error(`${label} passed exceeds total`);
  return passed / total;
}

export function verifyHermesFullReleaseReport(value) {
  const report = exact(value, [
    'schemaVersion', 'sourceSha', 'releaseSha', 'parser', 'claims', 'evidence', 'search', 'lifecycle',
    'presentation', 'retrieval', 'production', 'evidenceRefs',
  ], 'release report');
  if (report.schemaVersion !== 1) throw new Error('release report schemaVersion must be 1');
  if (!SHA1.test(report.sourceSha) || !SHA1.test(report.releaseSha) || report.sourceSha !== report.releaseSha) {
    throw new Error('source and release SHA must be the same exact 40-character commit');
  }

  const parser = exact(report.parser, ['corpusCases', 'succeeded', 'needsReview', 'failed', 'falseReady', 'locatorMatches', 'locatorTotal'], 'parser');
  for (const key of Object.keys(parser)) integer(parser[key], `parser.${key}`);
  if (parser.corpusCases !== 16 || parser.succeeded + parser.needsReview + parser.failed !== parser.corpusCases
    || parser.failed !== 0 || parser.falseReady !== 0) {
    throw new Error('parser corpus must be 16 cases with no failed or false-ready case');
  }
  const locatorRoundTrip = ratio(parser.locatorMatches, parser.locatorTotal, 'locator round-trip');
  if (locatorRoundTrip !== 1) throw new Error('locator round-trip must be 100%');

  const claims = exact(report.claims, ['truePositive', 'falsePositive'], 'claims');
  const claimPrecision = ratio(integer(claims.truePositive, 'claims.truePositive'), integer(claims.truePositive, 'claims.truePositive') + integer(claims.falsePositive, 'claims.falsePositive'), 'Claim precision');
  if (claimPrecision < 0.9) throw new Error('Claim precision must be >= 0.90');

  const evidence = exact(report.evidence, ['correctRelations', 'relationTotal', 'bboxHits', 'bboxTotal'], 'evidence');
  const evidenceRelationPrecision = ratio(evidence.correctRelations, evidence.relationTotal, 'evidence relation precision');
  const bboxHitRate = ratio(evidence.bboxHits, evidence.bboxTotal, 'bbox hit rate');
  if (evidenceRelationPrecision < 0.9) throw new Error('evidence relation precision must be >= 0.90');
  if (bboxHitRate < 0.95) throw new Error('bbox hit rate must be >= 0.95');

  const search = exact(report.search, ['p95Ms', 'lexicalHealthy', 'denseHealthy', 'fallbackVerified'], 'search');
  const searchP95Ms = finite(search.p95Ms, 'search.p95Ms');
  if (searchP95Ms > 2500) throw new Error('search P95 must be <= 2500 ms');
  if (!flag(search.lexicalHealthy, 'search.lexicalHealthy') || !flag(search.denseHealthy, 'search.denseHealthy')
    || !flag(search.fallbackVerified, 'search.fallbackVerified')) throw new Error('search health and fallback checks must pass');

  const lifecycle = exact(report.lifecycle, ['ttlChecksPassed', 'ttlChecksTotal', 'signedLinkChecksPassed', 'signedLinkChecksTotal'], 'lifecycle');
  const ttl = ratio(lifecycle.ttlChecksPassed, lifecycle.ttlChecksTotal, 'TTL');
  const signedLink = ratio(lifecycle.signedLinkChecksPassed, lifecycle.signedLinkChecksTotal, 'signed-link');
  if (ttl !== 1) throw new Error('TTL checks must pass 100%');
  if (signedLink !== 1) throw new Error('signed-link checks must pass 100%');

  const presentation = exact(report.presentation, ['chartHash', 'chartReplayHash', 'htmlHash', 'htmlReplayHash', 'noScript', 'noNetwork', 'labelEnforced', 'sourceClaimsVerified'], 'presentation');
  for (const key of ['chartHash', 'chartReplayHash', 'htmlHash', 'htmlReplayHash']) {
    if (typeof presentation[key] !== 'string' || !SHA256.test(presentation[key])) throw new Error(`presentation.${key} must be SHA-256`);
  }
  if (presentation.chartHash !== presentation.chartReplayHash || presentation.htmlHash !== presentation.htmlReplayHash) {
    throw new Error('presentation replay hashes must be identical');
  }
  if (['noScript', 'noNetwork', 'labelEnforced', 'sourceClaimsVerified'].some((key) => !flag(presentation[key], `presentation.${key}`))) {
    throw new Error('presentation safety checks must pass');
  }

  const retrieval = exact(report.retrieval, ['openAccessPdf', 'institutionalPdf', 'productEntriesPassed', 'productEntriesTotal', 'gracefulDegradationVerified'], 'retrieval');
  if (!flag(retrieval.openAccessPdf, 'retrieval.openAccessPdf') || !flag(retrieval.institutionalPdf, 'retrieval.institutionalPdf')
    || !flag(retrieval.gracefulDegradationVerified, 'retrieval.gracefulDegradationVerified')
    || ratio(retrieval.productEntriesPassed, retrieval.productEntriesTotal, 'retrieval product entries') !== 1
    || retrieval.productEntriesTotal < 4) throw new Error('retrieval production checks must pass all four product entries');

  const productionKeys = ['fullBuild', 'coreMigrationsCurrent', 'searchMigrationsCurrent', 'containersHealthy', 'runtimeDependenciesLoaded', 'internalHealth', 'publicHealth', 'uploadPublishReuseJourney', 'killSwitchesVerified', 'rollbackVerified'];
  const production = exact(report.production, productionKeys, 'production');
  if (productionKeys.some((key) => !flag(production[key], `production.${key}`))) throw new Error('production checks must all pass');

  if (!Array.isArray(report.evidenceRefs) || report.evidenceRefs.length < 3 || report.evidenceRefs.length > 32
    || new Set(report.evidenceRefs).size !== report.evidenceRefs.length
    || report.evidenceRefs.some((ref) => typeof ref !== 'string' || !EVIDENCE_REF.test(ref))) {
    throw new Error('evidence reference must be a unique content-free name:sha256:digest token');
  }

  return {
    ok: true,
    sourceSha: report.sourceSha,
    metrics: { locatorRoundTrip, claimPrecision, evidenceRelationPrecision, bboxHitRate, searchP95Ms, ttl, signedLink },
  };
}

async function main() {
  const reportPath = process.argv[2];
  if (!reportPath) throw new Error('usage: node scripts/hermes-full-release-gate.mjs <report.json>');
  const result = verifyHermesFullReleaseReport(JSON.parse(await readFile(reportPath, 'utf8')));
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
