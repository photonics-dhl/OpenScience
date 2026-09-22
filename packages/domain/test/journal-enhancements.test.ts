import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { calculateJournalArticlePriority, evaluateArticleProcessingCapability, type JournalArticleSourceRecord, type JournalSourcePermissions } from '../src/journal/enhancements';

const now = new Date('2026-09-22T00:00:00.000Z');
const text = 'A bounded synthetic source paragraph long enough to establish a precise, testable source capability without external data.';
const digest = createHash('sha256').update(text, 'utf8').digest('hex');
const permissions = (extra: Partial<JournalSourcePermissions> = {}): JournalSourcePermissions => ({ internalProcessing: true, derivativeGeneration: true, publicSource: false, publicDerivative: true, externalProcessing: true, figureReuse: false, derivativeIllustration: false, ...extra });
const main = (extra: Partial<JournalArticleSourceRecord> = {}): JournalArticleSourceRecord => ({ id: 'main', sourceType: 'publisher_full_text', url: 'https://example.test/paper', rightsStatus: 'full_public_processing_allowed', sourceConfidence: 'verified', permissions: permissions(), evidence: { statement: 'Publisher authorization for this source.', license: 'CC-BY-4.0' }, activeForGeneration: true, contentSha256: digest, ...extra });
const article = (materials?: JournalArticleSourceRecord[]) => ({ id: 'article', contentState: 'active', metadata: { title: 'A method for deterministic testing', authors: ['A'], publishedDate: '2026', issns: [], originalUrl: 'https://example.test/paper' }, source: { kind: 'fulltext' as const, text, url: 'https://example.test/paper', label: 'paper', ...(materials ? { materials } : {}) }, rights: { internalProcessing: true, derivativeGeneration: true, publicSource: false, publicDerivative: true, externalProcessing: true, license: 'CC-BY-4.0', evidence: 'Publisher authorization for this source.' } });

describe('journal source capability and priority', () => {
  it('keeps legacy publication compatible when external AI processing is disabled', () => {
    const value = article(); value.rights.externalProcessing = false;
    const capability = evaluateArticleProcessingCapability(value, now);
    expect(capability.canGenerateFullSixFields).toBe(false);
    expect(capability.canPublishFullInterpretation).toBe(true);
  });

  it('does not let a supplementary permission authorize the main source', () => {
    const supplement = main({ id: 'supp', sourceType: 'supplementary', activeForGeneration: false });
    const capability = evaluateArticleProcessingCapability(article([main({ sourceConfidence: 'revoked' }), supplement]), now);
    expect(capability.canGenerateFullSixFields).toBe(false);
    expect(capability.canPublishPublicSummary).toBe(false);
  });

  it('calculates all eight dimensions deterministically and names unknown inputs', () => {
    const priority = calculateJournalArticlePriority(article([main()]), ['method'], { editorPriorityScore: 7, deferredUntil: null, reason: 'Editorial focus' }, now);
    expect(priority.totalScore).toBe(priority.sourceCompletenessScore + priority.rightsClarityScore + priority.recencyScore + priority.showcaseValueScore + priority.academicCentralityScore + priority.parseSuccessScore + priority.editorPriorityScore + priority.topicMatchScore);
    expect(priority.totalScore).toBeGreaterThanOrEqual(60);
    expect(priority.unknownDimensions).toContain('showcaseValue');
    expect(priority.estimatedCreditCost).toBe(1);
  });

  it('evaluates expiry at the supplied clock without waiting for a cleanup task', () => {
    const capability = evaluateArticleProcessingCapability(article([main({ evidence: { statement: 'Expired authorization.', license: 'CC-BY-4.0', expiresAt: '2026-09-21T23:59:59.000Z' } })]), now);
    expect(capability.canGenerateFullSixFields).toBe(false);
    expect(capability.canExposeViaApi).toBe(false);
  });

  it('caps malformed auxiliary JSON by its rights status', () => {
    const unknownFigure = main({ id: 'figure', sourceType: 'figure_asset', activeForGeneration: false, rightsStatus: 'unknown', permissions: permissions({ figureReuse: true }), evidence: { statement: 'Unverified figure assertion.', license: 'unknown' } });
    const unknownSupplement = main({ id: 'supplement', sourceType: 'supplementary', activeForGeneration: false, rightsStatus: 'unknown', permissions: permissions(), evidence: { statement: 'Unverified supplement assertion.', license: 'unknown' } });
    const capability = evaluateArticleProcessingCapability(article([main(), unknownFigure, unknownSupplement]), now);
    expect(capability.canPublishFigures).toBe(false);
    expect(capability.canGenerateReproducibilityField).toBe(false);
  });
});
