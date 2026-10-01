import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import type { JournalSummary } from '../lib/journal-api';

const api = vi.hoisted(() => ({ listJournals: vi.fn(), listMyJournals: vi.fn() }));
const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('@/lib/journal-api', () => api);
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/components/shell/DashboardShell', () => ({ DashboardShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, useState: vi.fn(), useRef: vi.fn(), useCallback: (callback: unknown) => callback, useEffect: vi.fn() };
});
import { JournalDirectory } from '../components/journals/JournalDirectory';
import MyJournalsPage from '../app/journals/manage/page';

beforeEach(() => { vi.clearAllMocks(); vi.mocked(React.useEffect).mockImplementation(() => {}); });

// An isolated Node hook host runs the component's actual event handlers.
// The existing project tests use this approach without a browser/DOM dependency.
function mountDirectory(initial: JournalSummary[], initialNextCursor: string | null = null, component?: () => React.ReactNode) {
  const states: unknown[] = [];
  const refs: Array<{ current: unknown }> = [];
  let stateIndex = 0; let refIndex = 0;
  vi.mocked(React.useState).mockImplementation((<T,>(initialValue: T | (() => T)) => {
    const index = stateIndex++;
    if (!(index in states)) states[index] = typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue;
    return [states[index], (next: T | ((value: T) => T)) => { states[index] = typeof next === 'function' ? (next as (value: T) => T)(states[index] as T) : next; }];
  }) as typeof React.useState);
  vi.mocked(React.useRef).mockImplementation((<T,>(initialValue: T) => {
    const index = refIndex++; refs[index] ??= { current: initialValue }; return refs[index];
  }) as typeof React.useRef);
  return () => {
    stateIndex = 0; refIndex = 0;
    return component ? component() : JournalDirectory({ initial, initialNextCursor });
  };
}

type EventProps = {
  children?: React.ReactNode;
  onSubmit?: (event: { preventDefault: () => void }) => void;
  onChange?: (event: { target: { value: string } }) => void;
  onClick?: () => void;
  type?: string;
  id?: string;
  disabled?: boolean;
  role?: string;
};
function find(node: React.ReactNode, match: (element: React.ReactElement<EventProps>) => boolean): React.ReactElement<EventProps> {
  if (React.isValidElement<EventProps>(node)) {
    if (match(node)) return node;
    for (const child of React.Children.toArray(node.props.children)) {
      const result = maybeFind(child, match);
      if (result) return result;
    }
  }
  throw new Error('Control missing');
}
function maybeFind(node: React.ReactNode, match: (element: React.ReactElement<EventProps>) => boolean): React.ReactElement<EventProps> | undefined {
  try { return find(node, match); } catch { return undefined; }
}
const journal = (id: string, name: string) => ({ id, slug: id, nameEn: name, nameZh: '', subjects: ['Optics'], publicArticleCount: 2 }) as JournalSummary;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
async function settle() { await Promise.resolve(); await Promise.resolve(); }
const submit = (tree: React.ReactNode) => find(tree, element => element.type === 'form').props.onSubmit!({ preventDefault: vi.fn() });

it('disables search while pending and ignores a repeated submit before React rerenders', async () => {
  const request = deferred<{ items: JournalSummary[]; nextCursor: null }>();
  api.listJournals.mockReturnValue(request.promise);
  const render = mountDirectory([journal('one', 'Optics Journal')]);
  const tree = render();
  submit(tree); submit(tree);
  expect(api.listJournals).toHaveBeenCalledTimes(1);
  expect(find(render(), element => element.type === 'button' && element.props.type === 'submit').props.disabled).toBe(true);
  request.resolve({ items: [journal('two', 'Photonics Journal')], nextCursor: null });
  await settle();
  expect(find(render(), element => element.type === 'button' && element.props.type === 'submit').props.disabled).toBe(false);
  expect(renderToStaticMarkup(render())).toContain('Photonics Journal');
});

it('retains the previous directory on failure and permits retry with the entered query', async () => {
  const request = deferred<{ items: JournalSummary[]; nextCursor: null }>();
  api.listJournals.mockReturnValueOnce(request.promise).mockResolvedValueOnce({ items: [journal('two', 'Photonics Journal')], nextCursor: null });
  const render = mountDirectory([journal('one', 'Optics Journal')]);
  find(render(), element => element.props.id === 'journal-search').props.onChange!({ target: { value: 'Photonics' } });
  submit(render());
  request.reject(new Error('Directory unavailable'));
  await settle();
  expect(renderToStaticMarkup(render())).toContain('Optics Journal');
  const alert = find(render(), element => element.props.role === 'alert');
  find(alert, element => element.type === 'button').props.onClick!();
  await settle();
  expect(api.listJournals).toHaveBeenLastCalledWith({ query: 'Photonics', limit: 20, cursor: undefined });
  expect(renderToStaticMarkup(render())).toContain('Photonics Journal');
});

it('appends a cursor page once without duplicating entries or using an unsubmitted query', async () => {
  api.listJournals.mockResolvedValue({ items: [journal('one', 'Optics Journal'), journal('two', 'Photonics Journal')], nextCursor: null });
  const render = mountDirectory([journal('one', 'Optics Journal')], 'next-page');
  find(render(), element => element.props.id === 'journal-search').props.onChange!({ target: { value: 'unsubmitted' } });
  find(render(), element => element.type === 'button' && element.props.children === '加载更多期刊').props.onClick!();
  await settle();
  expect(api.listJournals).toHaveBeenCalledWith({ query: '', limit: 20, cursor: 'next-page' });
  const markup = renderToStaticMarkup(render());
  expect(markup.match(/href="\/journals\/one"/g)).toHaveLength(1);
  expect(markup).toContain('Photonics Journal');
});

it('shows account journal loading without claiming the account has no journals', () => {
  const render = mountDirectory([], null, MyJournalsPage);
  const markup = renderToStaticMarkup(render());
  expect(markup).toContain('正在加载我的期刊');
  expect(markup).not.toContain('尚未加入期刊');
});

it('recovers the account journal list from a failed load using the local retry action', async () => {
  let load: (() => void) | undefined;
  vi.mocked(React.useEffect).mockImplementationOnce(effect => { load = effect as () => void; });
  api.listMyJournals.mockRejectedValueOnce(new Error('Journal list unavailable'))
    .mockResolvedValueOnce({ items: [journal('optics', 'Optics Journal')] });
  const render = mountDirectory([], null, MyJournalsPage);
  render(); load!(); await settle();
  const alert = find(render(), element => element.props.role === 'alert');
  expect(renderToStaticMarkup(alert)).toContain('Journal list unavailable');
  find(alert, element => element.type === 'button').props.onClick!();
  expect(renderToStaticMarkup(render())).toContain('正在加载我的期刊');
  await settle();
  const markup = renderToStaticMarkup(render());
  expect(markup).toContain('Optics Journal');
  expect(markup).toContain('href="/journals/manage/optics"');
  expect(markup).not.toContain('role="alert"');
});
