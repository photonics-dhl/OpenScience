import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { JournalSummary } from '../lib/journal-api';

const api = vi.hoisted(() => ({ listJournals: vi.fn(), listMyJournals: vi.fn() }));
const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('@/lib/journal-api', () => api);
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('next-intl', async importOriginal => {
  const actual = await importOriginal<typeof import('next-intl')>();
  const { default: messages } = await import('../messages/zh.json');
  return { ...actual, useLocale: () => 'zh', useTranslations: (namespace: 'journalDirectory') => actual.createTranslator({ locale: 'zh', messages, namespace }) };
});
vi.mock('@/components/shell/DashboardShell', () => ({ DashboardShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, useState: vi.fn(), useRef: vi.fn(), useCallback: (callback: unknown) => callback, useEffect: vi.fn() };
});
import { JournalDirectory } from '../components/journals/JournalDirectory';
import MyJournalsPage from '../app/journals/manage/page';

beforeEach(() => {
  vi.clearAllMocks(); vi.mocked(React.useEffect).mockImplementation(() => {});
  vi.stubGlobal('window', { location: { href: 'https://example.test/journals', search: '' }, history: { pushState: vi.fn() }, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

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
  open?: boolean;
  value?: string;
  'data-journal-refinement'?: boolean;
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
async function settle() { for (let turn = 0; turn < 8; turn++) await Promise.resolve(); }
const submit = (tree: React.ReactNode) => find(tree, element => element.type === 'form').props.onSubmit!({ preventDefault: vi.fn() });

it('keeps optional filters collapsed while search and journal results stay in the main path', () => {
  const render = mountDirectory([journal('one', 'Optics Journal')]);
  const tree = render();
  const disclosure = find(tree, element => element.type === 'details' && element.props['data-journal-refinement'] === true);
  expect(disclosure.props.open).toBeUndefined();
  const summary = find(disclosure, element => element.type === 'summary');
  expect(renderToStaticMarkup(summary)).toContain('筛选与排序');
  expect(renderToStaticMarkup(summary)).toContain('全部学科');
  expect(renderToStaticMarkup(disclosure).match(/<select\b/g)).toHaveLength(3);
  expect(maybeFind(disclosure, element => element.props.id === 'journal-search')).toBeUndefined();
  expect(renderToStaticMarkup(disclosure)).not.toContain('Optics Journal');
  expect(renderToStaticMarkup(tree)).toContain('Optics Journal');
});

it('keeps active filters explicit when a URL is restored or changed through history', () => {
  Object.assign(window.location, { href: 'https://example.test/journals?subject=Optics&access=open&sort=paper_count', search: '?subject=Optics&access=open&sort=paper_count' });
  let restoreEffect!: () => void;
  vi.mocked(React.useEffect).mockImplementationOnce(() => {}).mockImplementationOnce(effect => { restoreEffect = effect as () => void; });
  const entries = [
    Object.assign(journal('one', 'Optics Journal'), { openAccess: true, publicArticleCount: 9 }),
    Object.assign(journal('two', 'Photonics Journal'), { subjects: ['Photonics'], openAccess: false, publicArticleCount: 2 }),
  ];
  const render = mountDirectory(entries);
  render(); restoreEffect();
  const getSummary = () => renderToStaticMarkup(find(render(), element => element.type === 'summary'));
  expect(getSummary()).toContain('Optics');
  expect(getSummary()).toContain('开放获取');
  expect(getSummary()).toContain('平台收录篇数');
  expect(renderToStaticMarkup(render())).toContain('Optics Journal');
  expect(renderToStaticMarkup(render())).not.toContain('Photonics Journal');
  Object.assign(window.location, { href: 'https://example.test/journals?subject=Photonics&access=closed', search: '?subject=Photonics&access=closed' });
  const popstate = vi.mocked(window.addEventListener).mock.calls.find(([event]) => event === 'popstate')![1] as () => void;
  popstate();
  expect(getSummary()).toContain('Photonics');
  expect(getSummary()).toContain('非开放获取');
  expect(getSummary()).not.toContain('平台收录篇数');
  expect(renderToStaticMarkup(render())).toContain('Photonics Journal');
  expect(api.listJournals).not.toHaveBeenCalled();
});

it('explains unavailable citation sorting without pretending it is active', () => {
  Object.assign(window.location, { href: 'https://example.test/journals?sort=citation_count', search: '?sort=citation_count' });
  let restoreEffect!: () => void;
  vi.mocked(React.useEffect).mockImplementationOnce(() => {}).mockImplementationOnce(effect => { restoreEffect = effect as () => void; });
  const render = mountDirectory([journal('one', 'Optics Journal')]);
  render(); restoreEffect();
  const disclosure = find(render(), element => element.type === 'details' && element.props['data-journal-refinement'] === true);
  expect(renderToStaticMarkup(find(disclosure, element => element.type === 'summary'))).toContain('引用量暂不可用，当前按 A–Z 排序');
  const sort = find(disclosure, element => element.type === 'select' && element.props.value === 'az');
  expect(find(sort, element => element.type === 'option' && element.props.value === 'citation_count').props.disabled).toBe(true);
  expect(api.listJournals).not.toHaveBeenCalled();
});

it('recovers an unsupported access link while retaining the requested search', () => {
  Object.assign(window.location, {href:'https://example.test/journals?q=Optics&access=open',search:'?q=Optics&access=open'});
  let restore!: () => void;
  vi.mocked(React.useEffect).mockImplementationOnce(() => {}).mockImplementationOnce(effect => {restore=effect as () => void;});
  const render=mountDirectory([journal('one','Optics Journal')]);
  render();restore();
  expect(renderToStaticMarkup(render())).toContain('当前目录暂未提供开放获取信息');
  find(render(),element => element.type==='button' && element.props.children==='显示全部获取方式').props.onClick!();
  expect(renderToStaticMarkup(render())).toContain('Optics Journal');
  const saved=new URL(String(vi.mocked(window.history.pushState).mock.calls.at(-1)![2]));
  expect(saved.searchParams.get('access')).toBeNull();expect(saved.searchParams.get('q')).toBe('Optics');
  expect(api.listJournals).not.toHaveBeenCalled();
});

it('filters the complete directory locally without using an unsubmitted query', () => {
  const render = mountDirectory([journal('one', 'Optics Journal'), journal('two', 'Photonics Journal')]);
  find(render(), element => element.props.id === 'journal-search').props.onChange!({ target: { value: 'Photonics' } });
  expect(renderToStaticMarkup(render())).toContain('Optics Journal');
  submit(render());
  expect(renderToStaticMarkup(render())).not.toContain('Optics Journal');
  expect(renderToStaticMarkup(render())).toContain('Photonics Journal');
  expect(api.listJournals).not.toHaveBeenCalled();
  const saved = vi.mocked(window.history.pushState).mock.calls.at(-1)![2];
  expect(String(saved)).toContain('q=Photonics');
});

it('disables filtering while the full directory loads and retains initial entries', async () => {
  const request = deferred<{ items: JournalSummary[]; nextCursor: null }>();
  api.listJournals.mockReturnValue(request.promise);
  let load!: () => void;
  vi.mocked(React.useEffect).mockImplementationOnce(effect => { load = effect as () => void; });
  const render = mountDirectory([journal('one', 'Optics Journal')], 'more');
  const tree = render();
  load();
  submit(tree); submit(tree);
  expect(api.listJournals).toHaveBeenCalledTimes(1);
  expect(find(render(), element => element.type === 'button' && element.props.type === 'submit').props.disabled).toBe(true);
  expect(renderToStaticMarkup(render())).toContain('Optics Journal');
  expect(renderToStaticMarkup(render())).toContain('完整目录加载后');
  expect(window.history.pushState).not.toHaveBeenCalled();
  request.resolve({ items: [journal('two', 'Photonics Journal')], nextCursor: null });
  await settle();
  expect(find(render(), element => element.type === 'button' && element.props.type === 'submit').props.disabled).toBe(false);
  expect(renderToStaticMarkup(render())).toContain('Photonics Journal');
});

it('retains loaded entries on failure and ignores repeated retry before React rerenders', async () => {
  const request = deferred<{ items: JournalSummary[]; nextCursor: null }>();
  api.listJournals.mockReturnValueOnce(request.promise).mockResolvedValueOnce({ items: [journal('two', 'Photonics Journal')], nextCursor: null });
  let load!: () => void;
  vi.mocked(React.useEffect).mockImplementationOnce(effect => { load = effect as () => void; });
  const render = mountDirectory([journal('one', 'Optics Journal')], 'more');
  render(); load();
  find(render(), element => element.props.id === 'journal-search').props.onChange!({ target: { value: 'Photonics' } });
  submit(render());
  request.reject(new Error('Directory unavailable'));
  await settle();
  expect(renderToStaticMarkup(render())).toContain('Optics Journal');
  const alert = find(render(), element => element.props.role === 'alert');
  const retry = find(alert, element => element.type === 'button').props.onClick!;
  retry(); retry();
  await settle();
  expect(api.listJournals).toHaveBeenCalledTimes(2);
  expect(api.listJournals).toHaveBeenLastCalledWith({ limit: 100, cursor: undefined });
  submit(render());
  expect(renderToStaticMarkup(render())).toContain('Photonics Journal');
});

it('collects all cursor pages without duplicate entries or using an unsubmitted query', async () => {
  api.listJournals.mockResolvedValueOnce({ items: [journal('one', 'Optics Journal')], nextCursor: 'next-page' })
    .mockResolvedValueOnce({ items: [journal('one', 'Optics Journal'), journal('two', 'Photonics Journal')], nextCursor: null });
  let load!: () => void;
  vi.mocked(React.useEffect).mockImplementationOnce(effect => { load = effect as () => void; });
  const render = mountDirectory([journal('one', 'Optics Journal')], 'next-page');
  find(render(), element => element.props.id === 'journal-search').props.onChange!({ target: { value: 'unsubmitted' } });
  load();
  await settle();
  expect(api.listJournals).toHaveBeenCalledWith({ limit: 100, cursor: 'next-page' });
  const markup = renderToStaticMarkup(render());
  expect(markup.match(/href="\/journals\/one"/g)).toHaveLength(1);
  expect(markup).toContain('Photonics Journal');
});

it('refetches the complete directory after a cursor failure without claiming partial totals', async () => {
  const request = deferred<{ items: JournalSummary[]; nextCursor: null }>();
  api.listJournals.mockResolvedValueOnce({ items: [journal('one', 'Optics Journal')], nextCursor: 'next-page' })
    .mockReturnValueOnce(request.promise)
    .mockResolvedValueOnce({ items: [journal('one', 'Optics Journal'), journal('two', 'Photonics Journal')], nextCursor: null });
  let load!: () => void;
  vi.mocked(React.useEffect).mockImplementationOnce(effect => { load = effect as () => void; });
  const render = mountDirectory([journal('one', 'Optics Journal')], 'next-page');
  find(render(), element => element.props.id === 'journal-search').props.onChange!({ target: { value: 'unsubmitted' } });
  load(); await settle();
  request.reject(new Error('Page unavailable'));
  await settle();
  const alert = find(render(), element => element.props.role === 'alert');
  expect(renderToStaticMarkup(render())).toContain('完整目录加载后');
  find(alert, element => element.type === 'button').props.onClick!();
  await settle();
  expect(api.listJournals).toHaveBeenLastCalledWith({ limit: 100, cursor: undefined });
  const markup = renderToStaticMarkup(render());
  expect(markup).toContain('Optics Journal');
  expect(markup).toContain('Photonics Journal');
});

it('shows account journal loading without claiming the account has no journals', () => {
  const render = mountDirectory([], null, MyJournalsPage);
  const markup = renderToStaticMarkup(render());
  expect(markup).toContain('正在加载我的期刊');
  expect(markup).not.toContain('尚未加入期刊');
});

it('recovers the account journal list from a failed load and opens its sole workbench', async () => {
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
  expect(router.replace).toHaveBeenCalledWith('/journals/manage/optics');
  expect(markup).toContain('正在加载我的期刊');
  expect(markup).not.toContain('href="/journals/manage/optics"');
  expect(markup).not.toContain('role="alert"');
});

it('shows a journal selector when an account manages multiple journals', async () => {
  let load: (() => void) | undefined;
  vi.mocked(React.useEffect).mockImplementationOnce(effect => { load = effect as () => void; });
  api.listMyJournals.mockResolvedValueOnce({ items: [journal('optics', 'Optics Journal'), journal('photonics', 'Photonics Journal')] });
  const render = mountDirectory([], null, MyJournalsPage);
  render(); load!(); await settle();
  const markup = renderToStaticMarkup(render());
  expect(markup).toContain('href="/journals/manage/optics"');
  expect(markup).toContain('href="/journals/manage/photonics"');
  expect(router.replace).not.toHaveBeenCalled();
});
