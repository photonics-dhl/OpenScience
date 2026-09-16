import { describe, expect, it } from 'vitest';
import { normalizeJournalDoi, validateJournalDraft, journalGenerationPrompt, type JournalDraft } from '../src/journal/content';
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
});
