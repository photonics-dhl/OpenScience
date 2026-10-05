import { describe, expect, it } from 'vitest';
import { createNativeJournalTextTools, NATIVE_JOURNAL_TEXT_TOOLS } from '../src/native-agent/journal-text-tools';

describe('journal text tools for the installed Agent', () => {
  const source = { kind: 'fulltext' as const, text: 'Numerical simulations predict 14.7 TW peak power. '.repeat(30), url: '', label: 'Source' };
  it('advertises only text overview/search/read, with no invented page pixels', async () => {
    expect(NATIVE_JOURNAL_TEXT_TOOLS.map(tool => tool.name)).toEqual(['paper_overview', 'paper_search', 'paper_read']);
    const tools = createNativeJournalTextTools(source);
    const overview = await tools.call('paper_overview', {});
    expect(overview).toMatchObject({ source: { kind: 'journal-text', scope: 'fulltext' } });
    expect(JSON.stringify(overview)).not.toContain('pageNumber');
    await expect(tools.images()).rejects.toThrow('no authorized page pixels');
  });
  it('searches snippets but marks an evidence anchor observed only after full read', async () => {
    const tools = createNativeJournalTextTools(source);
    expect((await tools.call('paper_search', { query: '14.7 TW' })).matches).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'J00001' })]));
    expect(tools.observedPassageIds).toEqual([]);
    const exact = await tools.call('paper_read', { passageIds: ['J00001'] });
    expect(exact).toMatchObject({ passages: [expect.objectContaining({ id: 'J00001', start: 0 })] });
    expect(tools.observedPassageIds).toEqual(['J00001']);
    expect(await tools.call('paper_read', { passageIds: ['J99999'] })).toHaveProperty('error');
  });
});
