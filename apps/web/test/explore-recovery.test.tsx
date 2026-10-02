import * as React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ResearchIndexPageApi } from '../lib/api';

const api = vi.hoisted(() => ({ getExploreIndex: vi.fn() }));
vi.mock('@/lib/api', () => api);
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, useState: vi.fn(), useRef: vi.fn(), useEffect: vi.fn() };
});
import { ResearchIndex } from '../components/explore/ResearchIndex';

beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('React', React); });
afterEach(() => vi.unstubAllGlobals());

type Events = { children?: React.ReactNode; id?: string; type?: string; role?: string; onClick?: () => void; onSubmit?: (event: { preventDefault: () => void }) => void; onChange?: (event: { target: { value: string } }) => void };
function find(node: React.ReactNode, match: (node: React.ReactElement<Events>) => boolean): React.ReactElement<Events> {
  if (React.isValidElement<Events>(node)) {
    if (match(node)) return node;
    for (const child of React.Children.toArray(node.props.children)) {
      try { return find(child, match); } catch { /* Search the remaining siblings. */ }
    }
  }
  throw new Error('Expected index control was not rendered');
}

function mount(initialPage: ResearchIndexPageApi) {
  const states: unknown[] = [];
  const refs: Array<{ current: unknown }> = [];
  let stateIndex = 0; let refIndex = 0;
  vi.mocked(React.useState).mockImplementation((<T,>(initial: T | (() => T)) => {
    const index = stateIndex++;
    if (!(index in states)) states[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
    return [states[index], (value: T | ((previous: T) => T)) => { states[index] = typeof value === 'function' ? (value as (previous: T) => T)(states[index] as T) : value; }];
  }) as typeof React.useState);
  vi.mocked(React.useRef).mockImplementation((<T,>(initial: T) => {
    const index = refIndex++; refs[index] ??= { current: initial }; return refs[index];
  }) as typeof React.useRef);
  return () => { stateIndex = 0; refIndex = 0; return ResearchIndex({ initialPage }); };
}

const item = (publicId: string): ResearchIndexPageApi['items'][number] => ({ publicId, title: publicId, url: `/research/${publicId}`, latestVersion: 1, publishedAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', insight: '', fields: [], artifactTypes: [], authors: [] });
function ids(tree: React.ReactNode) {
  return React.Children.toArray(find(tree, node => node.type === 'ol').props.children).map(child => (child as React.ReactElement<{ children: React.ReactElement<{ item: { publicId: string } }> }>).props.children.props.item.publicId);
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
const retry = (tree: React.ReactNode) => find(find(tree, node => node.props.role === 'alert'), node => node.type === 'button');

it('retries the failed page with its cursor and preserves already loaded research', async () => {
  const render = mount({ items: [item('first')], nextCursor: 'page-2' });
  api.getExploreIndex.mockRejectedValueOnce(new Error('backend detail'));
  find(render(), node => node.type === 'button' && node.props.children === 'loadMore').props.onClick!();
  await flush();
  expect(ids(render())).toEqual(['first']);
  const failedRequest = api.getExploreIndex.mock.calls[0][0];
  api.getExploreIndex.mockResolvedValueOnce({ items: [item('second')], nextCursor: 'page-3' });
  retry(render()).props.onClick!();
  await flush();
  expect(api.getExploreIndex.mock.calls[1][0]).toEqual(failedRequest);
  expect(failedRequest.cursor).toBe('page-2');
  expect(ids(render())).toEqual(['first', 'second']);
});

it('retries the submitted search even if an unsubmitted keyword has since changed', async () => {
  const render = mount({ items: [item('existing')], nextCursor: null });
  find(render(), node => node.props.id === 'research-search').props.onChange!({ target: { value: 'pump probe' } });
  api.getExploreIndex.mockRejectedValueOnce(new Error('backend detail'));
  find(render(), node => node.type === 'form').props.onSubmit!({ preventDefault: () => {} });
  await flush();
  find(render(), node => node.props.id === 'research-search').props.onChange!({ target: { value: 'new keyword' } });
  api.getExploreIndex.mockResolvedValueOnce({ items: [item('matching')], nextCursor: null });
  retry(render()).props.onClick!();
  await flush();
  expect(api.getExploreIndex.mock.calls[1][0]).toEqual(api.getExploreIndex.mock.calls[0][0]);
  expect(api.getExploreIndex.mock.calls[1][0].query).toBe('pump probe');
  expect(ids(render())).toEqual(['matching']);
});
