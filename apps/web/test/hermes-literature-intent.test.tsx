import { afterEach, describe, expect, it, vi } from 'vitest';

import { submitLiteratureAcquisition } from '@/lib/api';
import { routeHermesLiteratureIntent } from '@/lib/hermes/literature-intent';

describe('Hermes literature intent routing', () => {
  it.each([
    ['10.1038/nature12373', '10.1038/nature12373'],
    ['download paper arXiv:2401.01234v2', 'arXiv:2401.01234v2'],
    ['请帮我下载论文 10.1000/example', '10.1000/example'],
  ])('routes an explicit identifier to literature acquisition without a model classifier', (goal, identifier) => {
    expect(routeHermesLiteratureIntent({ goal, activeResearchObjectId: null })).toEqual({
      kind: 'literature.acquire',
      input: { identifier, query: identifier },
      target: { kind: 'personal' },
    });
  });

  it.each([
    ['find paper Attention Is All You Need', 'Attention Is All You Need'],
    ['search for the article Scaling laws for neural language models', 'Scaling laws for neural language models'],
    ['查找论文 阿秒脉冲产生与测量', '阿秒脉冲产生与测量'],
    ['获取文献 超快光谱中的相干动力学', '超快光谱中的相干动力学'],
  ])('keeps explicit title-only intent on query-only metadata search', (goal, query) => {
    expect(routeHermesLiteratureIntent({ goal, activeResearchObjectId: null })).toEqual({
      kind: 'literature.acquire',
      input: { query },
      target: { kind: 'personal' },
    });
  });

  it('targets the active research object and otherwise uses the personal library', () => {
    expect(routeHermesLiteratureIntent({
      goal: 'download paper 10.1038/nature12373',
      activeResearchObjectId: '00000000-0000-4000-8000-000000000701',
    })).toMatchObject({
      kind: 'literature.acquire',
      target: { kind: 'research_object', researchObjectId: '00000000-0000-4000-8000-000000000701' },
    });
    expect(routeHermesLiteratureIntent({ goal: 'download paper 10.1038/nature12373', activeResearchObjectId: null })).toMatchObject({
      kind: 'literature.acquire',
      target: { kind: 'personal' },
    });
  });

  it.each([
    'Help me plan the next experiment',
    'Summarize the current evidence',
    '帮我检查这项研究的局限',
    'The paper draft needs a clearer conclusion',
    'get source control working',
    'find source of the bug',
  ])('leaves unrelated goals on workspace.guide', (goal) => {
    expect(routeHermesLiteratureIntent({ goal, activeResearchObjectId: null })).toEqual({ kind: 'workspace.guide', goal });
  });
});

describe('literature target serialization', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('serializes the exact active-RO target without exposing provider or access controls', async () => {
    const requests: Array<{ path: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
      requests.push({ path, init });
      if (path === '/api/csrf-token') return new Response(JSON.stringify({ csrfToken: 'csrf' }), { status: 200 });
      return new Response(JSON.stringify({ researchObject: {}, session: {}, task: {} }), { status: 202 });
    }));

    await submitLiteratureAcquisition(
      { query: '10.1038/nature12373', identifier: '10.1038/nature12373' },
      'intent-key',
      { kind: 'research_object', researchObjectId: '00000000-0000-4000-8000-000000000701' },
    );

    const request = requests.find(({ path }) => path === '/api/literature/acquisitions');
    expect(JSON.parse(String(request?.init?.body))).toEqual({
      query: '10.1038/nature12373',
      identifier: '10.1038/nature12373',
      target: { kind: 'research_object', researchObjectId: '00000000-0000-4000-8000-000000000701' },
    });
  });
});
