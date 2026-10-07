import { describe, expect, it } from 'vitest';
import { journalEvidenceAnchors, normalizeJournalDoi, restoreJournalEvidenceAnchors, restoreJournalEvidenceWhitespace, validateJournalDraft, validateJournalSource, journalGenerationPrompt, type JournalDraft } from '../src/journal/content';
import { validateJournalUploadContent } from '../src/journal/source-upload';

const quote = 'Numerical simulations predict 14.7 TW peak power; full-system experiments have not been performed.';
const source = { kind: 'fulltext' as const, text: quote, url: 'https://example.test/source', label: 'Results' };
const draft: JournalDraft = { summary: 'A numerical prediction.', core: { problem: 'Scaling.', insight: 'Numerical prediction.', method: 'Simulation.', results: '14.7 TW predicted.', limitations: 'No full-system experiment.', reproducibility: 'Not reported.' }, claims: [{ text: '14.7 TW predicted.', kind: 'simulation', evidence: { quote, locator: 'Results' } }], figures: [], faq: [{ question: 'Experimental?', answer: 'No.', evidence: { quote, locator: 'Results' } }], scope: 'fulltext', language: 'en' };
describe('journal scientific source contracts', () => {
  it('normalizes bare DOI, resolver URL, escaping and case to one identity', () => {
    expect(normalizeJournalDoi(' https://doi.org/10.34133/ULTRAFASTSCIENCE.0188 ')).toBe('10.34133/ultrafastscience.0188');
    expect(normalizeJournalDoi('doi:10.34133%2Fultrafastscience.0188')).toBe('10.34133/ultrafastscience.0188');
    for (const value of ['http://127.0.0.1/private', 'https://example.org/10.1/a', '10.1234/a?url=internal', '10.1234/a\nb']) expect(() => normalizeJournalDoi(value)).toThrow();
  });
  it('requires quotes that actually occur in the source and rejects prediction described as an experimental result', () => {
    expect(validateJournalDraft(draft, source)).toEqual(draft);
    expect(() => validateJournalDraft({ ...draft, claims: [{ ...draft.claims[0], evidence: { quote: 'Fabricated passage', locator: 'Fig. 4' } }] }, source)).toThrow();
    expect(() => validateJournalDraft({ ...draft, claims: [{ ...draft.claims[0], kind: 'experimental' }] }, source)).toThrow(/预测或模拟/);
  });
  it('restores only PDF whitespace in evidence, retaining an exact source span and rejecting changed facts', () => {
    const pdfSource = { ...source, text: 'Numerical  simulations\npredict 14.7 TW peak power; full-system experiments have not been performed.' };
    const whitespaceOnly = structuredClone(draft);
    whitespaceOnly.claims[0]!.evidence.quote = quote;
    whitespaceOnly.faq[0]!.evidence.quote = quote;
    restoreJournalEvidenceWhitespace(whitespaceOnly, pdfSource);
    expect(whitespaceOnly.claims[0]!.evidence.quote).toBe(pdfSource.text);
    expect(validateJournalDraft(whitespaceOnly, pdfSource)).toEqual(whitespaceOnly);
    const changedNumber = structuredClone(draft);
    changedNumber.claims[0]!.evidence.quote = quote.replace('14.7', '17.4');
    restoreJournalEvidenceWhitespace(changedNumber, pdfSource);
    expect(() => validateJournalDraft(changedNumber, pdfSource)).toThrow(/精确定位/);
  });
  it('materializes only blank quotes bound to real numbered source spans', () => {
    const anchors = journalEvidenceAnchors(source);
    expect(anchors).toEqual([{ id: 'J00001', quote, start: 0, end: quote.length }]);
    const selected = structuredClone(draft);
    selected.claims[0]!.evidence = { quote: '', locator: 'J00001' };
    selected.faq[0]!.evidence = { quote: '', locator: 'J00001' };
    restoreJournalEvidenceAnchors(selected, source);
    expect(validateJournalDraft(selected, source)).toEqual(selected);
    const forged = structuredClone(draft);
    forged.claims[0]!.evidence = { quote: '', locator: 'J99999' };
    restoreJournalEvidenceAnchors(forged, source);
    expect(() => validateJournalDraft(forged, source)).toThrow(/精确定位/);
    const altered = structuredClone(draft);
    altered.claims[0]!.evidence = { quote: quote.replace('14.7', '17.4'), locator: 'J00001' };
    restoreJournalEvidenceAnchors(altered, source);
    expect(() => validateJournalDraft(altered, source)).toThrow(/精确定位/);
    expect(journalGenerationPrompt(source, 'en')).toContain('[J00001]');
    const longSource = { ...source, text: `${quote} `.repeat(14) };
    const spans = journalEvidenceAnchors(longSource);
    expect(spans.length).toBeGreaterThan(1);
    expect(spans.every(({ quote: span }) => span.length <= 480 && longSource.text.includes(span))).toBe(true);
    expect(spans.map(({ id }) => id)).toEqual(spans.map((_, index) => `J${String(index + 1).padStart(5, '0')}`));
  });
  it('requires explicitly limited abstract scope, disallows abstract figure cards and metadata-only interpretation', () => {
    const abstract = { ...source, kind: 'abstract' as const };
    expect(() => validateJournalDraft(draft, abstract)).toThrow();
    expect(() => validateJournalDraft({ ...draft, scope: 'abstract', figures: [{ label: 'Figure 1', purpose: 'Overview', finding: 'Prediction', evidence: { quote, locator: 'Abstract' } }] }, abstract)).toThrow();
    expect(() => validateJournalDraft(draft, { ...source, kind: 'metadata', text: '' })).toThrow();
    expect(journalGenerationPrompt(abstract, 'en')).toContain('figures MUST be []');
  });
  it('validates actual file content before storing a claimed PDF, DOCX or text file', () => {
    expect(() => validateJournalUploadContent('pdf', Buffer.from('%PDF-1.7\nsynthetic fixture'))).not.toThrow();
    expect(() => validateJournalUploadContent('pdf', Buffer.from('not a pdf'))).toThrow();
    expect(() => validateJournalUploadContent('docx', Buffer.from('PK\x03\x04not a word container'))).toThrow();
    expect(() => validateJournalUploadContent('txt', Buffer.from([0xff, 0x00, 0x01]))).toThrow();
    expect(() => validateJournalUploadContent('md', Buffer.from('# 合成测试\n可读取文本'))).not.toThrow();
  });
  it('accepts longer parser-backed PDF text without relaxing manual source length or artifact binding', () => {
    const text = quote.repeat(2_200);
    const sourceMapRef = { schemaVersion: 1 as const, parserStatus: 'succeeded' as const, artifactId: 'uploaded-pdf',
      contentHash: 'a'.repeat(64), objectKey: `derived/source-maps/${'b'.repeat(64)}.json`, serializedSha256: 'b'.repeat(64), size: 1_000 };
    expect(() => validateJournalSource({ ...source, text })).toThrow();
    expect(() => validateJournalSource({ ...source, text, artifactId: 'uploaded-pdf', sourceMapRef })).not.toThrow();
    expect(() => validateJournalSource({ ...source, text, artifactId: 'another-file', sourceMapRef })).toThrow();
  });
});
