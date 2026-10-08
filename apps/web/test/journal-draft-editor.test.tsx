import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { JournalDraftEditor } from '@/components/journals/JournalDraftEditor';
import type { JournalDraft } from '@/lib/journal-api';

vi.mock('next-intl', () => ({ useLocale: () => 'en' }));

const draft: JournalDraft = {
  summary: 'Private summary', scope: 'fulltext', language: 'en',
  core: { problem: 'Question', insight: 'Insight', method: 'Method', results: 'Results', limitations: 'Limits', reproducibility: 'Protocol' },
  claims: [{ text: 'Claim one', kind: 'experimental', evidence: { quote: 'Quoted source', locator: 'p. 2' } }],
  figures: [], faq: [],
};

describe('journal private draft editor', () => {
  it('shows six editable fields while keeping evidence secondary and empty figure/FAQ states clear', () => {
    const html = renderToStaticMarkup(<JournalDraftEditor draft={draft} readOnly={false} onChange={() => undefined} />);
    expect(html).toContain('Six-field interpretation');
    expect(html).toContain('Research question');
    expect(html).toContain('Reproducibility');
    expect(html).toContain('<details');
    expect(html).toContain('Show source evidence');
    expect(html).toContain('Figure cards');
    expect(html).toContain('Frequently asked questions');
    expect(html).toContain('Add figure card');
    expect(html).not.toContain('Quoted source</summary>');
  });

  it('keeps published or reviewer content read only', () => {
    const html = renderToStaticMarkup(<JournalDraftEditor draft={draft} readOnly onChange={() => undefined} />);
    expect(html).toContain('readonly=""');
    expect(html).not.toContain('Add claim');
    expect(html).not.toContain('Add figure card');
    expect(html).not.toContain('Add question');
  });
});
