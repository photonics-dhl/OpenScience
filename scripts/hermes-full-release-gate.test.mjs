import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyHermesFullReleaseReport } from './hermes-full-release-gate.mjs';

const sha = 'a'.repeat(40);
function passingReport() {
  return {
    schemaVersion: 1,
    sourceSha: sha,
    releaseSha: sha,
    parser: { corpusCases: 16, succeeded: 14, needsReview: 2, failed: 0, falseReady: 0, locatorMatches: 26, locatorTotal: 26 },
    claims: { truePositive: 18, falsePositive: 1 },
    evidence: { correctRelations: 19, relationTotal: 20, bboxHits: 20, bboxTotal: 20 },
    search: { p95Ms: 240, lexicalHealthy: true, denseHealthy: true, fallbackVerified: true },
    lifecycle: { ttlChecksPassed: 4, ttlChecksTotal: 4, signedLinkChecksPassed: 4, signedLinkChecksTotal: 4 },
    presentation: { chartHash: 'b'.repeat(64), chartReplayHash: 'b'.repeat(64), htmlHash: 'c'.repeat(64), htmlReplayHash: 'c'.repeat(64), noScript: true, noNetwork: true, labelEnforced: true, sourceClaimsVerified: true },
    retrieval: { openAccessPdf: true, institutionalPdf: true, productEntriesPassed: 4, productEntriesTotal: 4, gracefulDegradationVerified: true },
    production: { fullBuild: true, coreMigrationsCurrent: true, searchMigrationsCurrent: true, containersHealthy: true, runtimeDependenciesLoaded: true, internalHealth: true, publicHealth: true, uploadPublishReuseJourney: true, killSwitchesVerified: true, rollbackVerified: true },
    evidenceRefs: ['parser-report:sha256:' + 'd'.repeat(64), 'search-report:sha256:' + 'e'.repeat(64), 'production-gate:sha256:' + 'f'.repeat(64)],
  };
}

test('accepts one content-free exact-release report when every threshold passes', () => {
  const result = verifyHermesFullReleaseReport(passingReport());
  assert.equal(result.ok, true);
  assert.equal(result.metrics.claimPrecision, 18 / 19);
  assert.equal(result.metrics.locatorRoundTrip, 1);
});

for (const [name, mutate, pattern] of [
  ['SHA mismatch', (report) => { report.releaseSha = 'f'.repeat(40); }, /source and release SHA/i],
  ['Claim precision', (report) => { report.claims.falsePositive = 3; }, /Claim precision/i],
  ['evidence relation', (report) => { report.evidence.correctRelations = 17; }, /evidence relation precision/i],
  ['bbox hit rate', (report) => { report.evidence.bboxHits = 18; }, /bbox hit rate/i],
  ['search P95', (report) => { report.search.p95Ms = 2501; }, /search P95/i],
  ['signed link', (report) => { report.lifecycle.signedLinkChecksPassed = 3; }, /signed-link/i],
  ['presentation replay', (report) => { report.presentation.chartReplayHash = '9'.repeat(64); }, /presentation replay/i],
  ['production journey', (report) => { report.production.uploadPublishReuseJourney = false; }, /production checks/i],
]) {
  test(`rejects ${name} below the release gate`, () => {
    const report = passingReport();
    mutate(report);
    assert.throws(() => verifyHermesFullReleaseReport(report), pattern);
  });
}

test('rejects unknown fields and evidence references that could smuggle content', () => {
  const unknown = passingReport();
  unknown.secret = 'no';
  assert.throws(() => verifyHermesFullReleaseReport(unknown), /unknown fields/i);
  const unsafe = passingReport();
  unsafe.evidenceRefs = ['file:///root/private-report.json'];
  assert.throws(() => verifyHermesFullReleaseReport(unsafe), /evidence reference/i);
});
