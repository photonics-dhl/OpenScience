import { describe, expect, it } from 'vitest';
import { canConfirmJournalContent, canPublishJournalContent, journalGenerationIssues } from '../components/journals/JournalArticleWorkbench';
import { journalEditorMessages } from '../messages/journal-editor';
import type { JournalArticle } from '../lib/journal-api';

const draft = { summary: 'Interpretation' } as JournalArticle['draft'];
const article = (changes: Partial<JournalArticle> = {}) => ({
  contentState: 'active', draft, reviewState: 'draft', revision: 7, reviewedRevision: null,
  source: { kind: 'abstract', text: 'x'.repeat(80), url: 'https://publisher.example/paper', label: 'Publisher abstract' },
  rights: { internalProcessing: true, derivativeGeneration: true, externalProcessing: true, publicSource: false, publicDerivative: false, license: 'Publisher permission', evidence: 'Contract dated 2026-01-01' },
  ...changes,
}) as JournalArticle;

describe('journal editor action boundaries', () => {
  it('requires an explicit confirmation for the current revision and resets when revision changes', () => {
    const current = article();
    const confirmedRevision = current.revision;
    expect(canConfirmJournalContent(current, 'editor', false, false, false)).toBe(false);
    expect(canConfirmJournalContent(current, 'editor', confirmedRevision === current.revision, false, false)).toBe(true);
    expect(canConfirmJournalContent(article({ revision: 8 }), 'editor', confirmedRevision === 8, false, false)).toBe(false);
    expect(canConfirmJournalContent(current, 'editor', true, true, false)).toBe(false);
    expect(canConfirmJournalContent(current, 'reviewer', true, false, false)).toBe(false);
  });

  it('keeps publication closed until approval matches the current revision', () => {
    expect(canPublishJournalContent(article(), 'owner', false, false)).toBe(false);
    expect(canPublishJournalContent(article({ reviewState: 'approved', reviewedRevision: 6 }), 'owner', false, false)).toBe(false);
    expect(canPublishJournalContent(article({ reviewState: 'approved', reviewedRevision: 7 }), 'editor', false, false)).toBe(false);
    expect(canPublishJournalContent(article({ reviewState: 'approved', reviewedRevision: 7 }), 'owner', true, false)).toBe(false);
    expect(canPublishJournalContent(article({ reviewState: 'approved', reviewedRevision: 7 }), 'owner', false, false)).toBe(true);
  });

  it('names missing private-processing permissions without requiring public source or figure rights', () => {
    const copy = journalEditorMessages.zh;
    const missing = article({ rights: { ...article().rights, internalProcessing: false, derivativeGeneration: false, externalProcessing: false, license: '', evidence: '' } });
    expect(journalGenerationIssues(missing, true, false, false, copy)).toEqual([
      copy.needInternal, copy.needDerivative, copy.needExternal, copy.needLicense, copy.needEvidence,
    ]);
    expect(journalGenerationIssues(article(), true, false, false, copy)).toEqual([]);
    expect(journalGenerationIssues(article(), true, false, false, copy, false)).toEqual([copy.nativeUnavailable]);
    expect(journalGenerationIssues(article(), true, false, false, copy, true)).toEqual([]);
    expect(journalGenerationIssues(article(), true, true, false, copy)).toContain(copy.needBinding);
  });
});
