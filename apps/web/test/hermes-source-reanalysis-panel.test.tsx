import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HermesResearchRunPanel } from '@/components/hermes/HermesResearchRunPanel';
import type { HermesResearchRun } from '@/lib/api';
import en from '@/messages/en.json';
import zh from '@/messages/zh.json';
import { ids, newRun, newTask, sourceRun } from './fixtures/source-reanalysis';

const translation = vi.hoisted(() => ({ locale: 'en' }));
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, useState: vi.fn(actual.useState), useRef: vi.fn(actual.useRef), useEffect: vi.fn(actual.useEffect),
    useMemo: vi.fn(actual.useMemo), useCallback: vi.fn(actual.useCallback) };
});
vi.mock('next-intl', () => {
  const translators = new Map<string, (key: string) => string>();
  return { useLocale: () => translation.locale, useTranslations: (namespace: string) => {
    const id = `${translation.locale}:${namespace}`;
    if (translators.has(id)) return translators.get(id)!;
    const translate = (key: string) => {
    let value: unknown = translation.locale === 'zh' ? zh : en;
    for (const part of `${namespace}.${key}`.split('.')) value = (value as Record<string, unknown>)?.[part];
    return String(value);
    };
    translators.set(id, translate); return translate;
  } };
});
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
afterEach(async () => {
  translation.locale = 'en'; vi.unstubAllGlobals(); vi.clearAllMocks();
  const actual = await vi.importActual<typeof React>('react');
  vi.mocked(React.useState).mockImplementation(actual.useState);
  vi.mocked(React.useRef).mockImplementation(actual.useRef);
  vi.mocked(React.useEffect).mockImplementation(actual.useEffect);
  vi.mocked(React.useMemo).mockImplementation(actual.useMemo);
  vi.mocked(React.useCallback).mockImplementation(actual.useCallback);
});

function renderRun(run: HermesResearchRun) {
  vi.mocked(React.useState).mockReturnValueOnce([run, vi.fn()]);
  return renderToStaticMarkup(<HermesResearchRunPanel researchObjectId={ids.ro} tasks={[]}
    runId={ids.oldRun} onRunCreated={() => {}} />);
}

describe('failed Hermes source reanalysis entry', () => {
  it.each(['en', 'zh'])('offers the new paid operation only with the server handle (%s)', locale => {
    translation.locale = locale;
    const run = sourceRun();
    const html = renderRun(run);
    expect(html).toContain(locale === 'zh' ? '新建付费分析并继续' : 'Start new paid analysis');
    expect(html).toContain('PDF/OCR');
    expect(html).toContain('ChatGPT');
    run.sourceReanalysis = undefined;
    expect(renderRun(run)).not.toContain(locale === 'zh' ? '新建付费分析并继续' : 'Start new paid analysis');
  });

  it('offers restoration when the server already created the new analysis', () => {
    const run = sourceRun(); run.sourceReanalysis!.existingIngestionTaskId = ids.newIngestion;
    const html = renderRun(run);
    expect(html).toContain('Continue analysis');
    expect(html).not.toContain('Start new paid analysis');
  });
});

// Node-only hook lifecycle: effects, refs and event handlers run; HTTP is the external boundary.
// This avoids a browser or a new DOM/test-renderer dependency for the bounded component tests.
function mountedPanel(run = sourceRun()) {
  const states: unknown[] = []; const refs: Array<{ current: unknown }> = [];
  const memos: Array<{ deps: React.DependencyList; value: unknown }> = [];
  const effects: Array<{ deps?: React.DependencyList; cleanup?: () => void }> = [];
  const pending: Array<{ index: number; effect: React.EffectCallback }> = [];
  let stateCursor = 0; let refCursor = 0; let effectCursor = 0; let memoCursor = 0; let dirty = true;
  vi.mocked(React.useState).mockImplementation((<T,>(initial: T | (() => T)): [T, React.Dispatch<React.SetStateAction<T>>] => {
    const index = stateCursor++;
    if (!(index in states)) states[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
    return [states[index] as T, next => {
      const value = typeof next === 'function' ? (next as (value: T) => T)(states[index] as T) : next;
      if (!Object.is(value, states[index])) { states[index] = value; dirty = true; }
    }];
  }) as typeof React.useState);
  vi.mocked(React.useRef).mockImplementation((<T,>(initial: T) => {
    const index = refCursor++; refs[index] ??= { current: initial }; return refs[index] as React.MutableRefObject<T>;
  }) as typeof React.useRef);
  const memo = <T,>(make: () => T, deps: React.DependencyList): T => {
    const index = memoCursor++; const previous = memos[index];
    if (!previous || deps.length !== previous.deps.length || deps.some((value, i) => !Object.is(value, previous.deps[i])))
      memos[index] = { deps, value: make() };
    return memos[index]!.value as T;
  };
  vi.mocked(React.useMemo).mockImplementation((make, deps) => memo(make, deps));
  vi.mocked(React.useCallback).mockImplementation((callback, deps) => memo(() => callback, deps));
  vi.mocked(React.useEffect).mockImplementation((effect, deps) => {
    const index = effectCursor++; const previous = effects[index];
    if (!previous || !deps || !previous.deps || deps.some((value, i) => value !== previous.deps![i])) {
      pending.push({ index, effect }); effects[index] = { ...previous, deps };
    }
  });
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); },
  } as Storage;
  vi.stubGlobal('window', Object.assign(new EventTarget(), { sessionStorage: storage, setTimeout: () => 1, clearTimeout: () => {} }));
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
  let actor = ids.actor;
  const analysis = vi.fn(async () => json({ task: newTask }, 202));
  const create = vi.fn(async () => json({ run: newRun() }, 202));
  const retry = vi.fn(async () => {
    Object.assign(run, { status: 'running', canRetryGeneration: false, error: null, version: run.version + 1 });
    return json({ run }, 202);
  });
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === '/api/csrf-token') return json({ csrfToken: 'csrf' });
    if (path === '/api/auth/me') return json({ userId: actor, email: 'researcher@example.test' });
    if (path.endsWith(`/hermes-runs/${ids.oldRun}`)) return json({ run });
    if (path.includes('hermes-runs?ingestionTaskId=')) return json({ run: null });
    if (path === `/api/ingestion/${ids.oldIngestion}/reanalyze`) return analysis();
    if (path.endsWith('/retry-generation') && init?.method === 'POST') return retry();
    if (path.endsWith('/hermes-runs') && init?.method === 'POST') return create();
    throw new Error(`Unexpected request: ${path}`);
  });
  vi.stubGlobal('fetch', fetcher);
  const onRunCreated = vi.fn();
  const onRunUpdated = vi.fn();
  const props = { researchObjectId: ids.ro, tasks: [], runId: ids.oldRun, onRunCreated, onRunUpdated };
  let tree: React.ReactElement;
  const render = () => {
    dirty = false; stateCursor = 0; refCursor = 0; effectCursor = 0; memoCursor = 0;
    tree = HermesResearchRunPanel(props);
  };
  const settle = async () => {
    for (let turn = 0; turn < 25; turn++) {
      if (dirty) render();
      for (const { index, effect } of pending.splice(0)) {
        effects[index]!.cleanup?.(); const cleanup = effect(); effects[index]!.cleanup = cleanup || undefined;
      }
      await new Promise(resolve => setImmediate(resolve));
      if (!dirty && !pending.length) return;
    }
    throw new Error('Panel effects did not settle');
  };
  const button = (label: string) => {
    const find = (node: React.ReactNode): React.ReactElement<{ disabled?: boolean; onClick(): void; children: React.ReactNode }> | undefined => {
      for (const child of React.Children.toArray(node)) {
        if (!React.isValidElement<{ children: React.ReactNode }>(child)) continue;
        if (child.type === 'button' && child.props.children === label) return child as ReturnType<typeof find>;
        const match = find(child.props.children); if (match) return match;
      }
      return undefined;
    };
    const found = find(tree!); if (!found) throw new Error(`Missing button: ${label}`); return found;
  };
  return { settle, button, data, analysis, create, retry, fetcher, onRunCreated, onRunUpdated,
    html: () => renderToStaticMarkup(tree!), setActor: (value: string) => { actor = value; },
    saved: () => JSON.parse([...data.values()][0]!),
  };
}

describe('source reanalysis panel interactions', () => {
  it('disables final composition while pending and prevents duplicate paid clicks', async () => {
    const run = sourceRun(); run.sourceReanalysis = undefined; run.canRetryGeneration = true;
    run.generationRecovery = 'source-composition'; run.chargeableAttempts = 1;
    const panel = mountedPanel(run); let finish!: (response: Response) => void;
    panel.retry.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await panel.settle(); panel.onRunUpdated.mockClear(); const button = panel.button(en.hermesRun.sourceCompositionContinue);
    button.props.onClick(); button.props.onClick(); await panel.settle();
    expect(panel.retry).toHaveBeenCalledOnce();
    expect(panel.html()).toContain('disabled=""');
    expect(panel.analysis).not.toHaveBeenCalled(); expect(panel.create).not.toHaveBeenCalled();
    finish(new Response(JSON.stringify({ run: { ...run, status: 'running', canRetryGeneration: false } }), { status: 202 }));
    await panel.settle(); expect(panel.onRunUpdated).toHaveBeenCalledOnce();
  });

  it('does not submit final composition when the freshly checked account changed', async () => {
    const run = sourceRun(); run.sourceReanalysis = undefined; run.canRetryGeneration = true;
    run.generationRecovery = 'source-composition'; run.chargeableAttempts = 1;
    const panel = mountedPanel(run); await panel.settle(); panel.onRunUpdated.mockClear(); panel.setActor(ids.ro);
    panel.button(en.hermesRun.sourceCompositionContinue).props.onClick(); await panel.settle();
    expect(panel.retry).not.toHaveBeenCalled(); expect(panel.onRunUpdated).not.toHaveBeenCalled();
    expect(panel.html()).toContain(en.hermesRun.narrative.identityChanged);
  });

  it('one click advances both phases with disabled feedback and ignores a double click', async () => {
    const panel = mountedPanel();
    let finishAnalysis!: (reply: Response) => void; let finishRun!: (reply: Response) => void;
    panel.analysis.mockImplementationOnce(() => new Promise(resolve => { finishAnalysis = resolve; }));
    panel.create.mockImplementationOnce(() => new Promise(resolve => { finishRun = resolve; }));
    await panel.settle();
    const button = panel.button(en.hermesRun.sourceReanalysis.start);
    expect(button.props.disabled).toBe(false); button.props.onClick(); button.props.onClick();
    await panel.settle();
    expect(panel.analysis).toHaveBeenCalledTimes(1); expect(panel.create).not.toHaveBeenCalled();
    expect(panel.button(en.hermesRun.sourceReanalysis.analyzing).props.disabled).toBe(true);
    expect(panel.html()).toContain('role="status"');
    finishAnalysis(new Response(JSON.stringify({ task: newTask }), { status: 202 })); await panel.settle();
    expect(panel.saved().newIngestionTaskId).toBe(ids.newIngestion);
    expect(panel.button(en.hermesRun.sourceReanalysis.startingRun).props.disabled).toBe(true);
    finishRun(new Response(JSON.stringify({ run: newRun() }), { status: 202 })); await panel.settle();
    expect(panel.onRunCreated).toHaveBeenCalledTimes(1); expect(panel.onRunCreated).toHaveBeenCalledWith(newRun());
  });

  it('shows explicit Continue after an ambiguous reply and retains the original keys', async () => {
    const panel = mountedPanel(); panel.analysis.mockRejectedValueOnce(new TypeError('lost reply'));
    await panel.settle(); panel.button(en.hermesRun.sourceReanalysis.start).props.onClick(); await panel.settle();
    expect(panel.html()).toContain(en.hermesRun.sourceReanalysis.uncertain);
    expect(panel.onRunCreated).not.toHaveBeenCalled();
    const saved = panel.saved(); const button = panel.button(en.hermesRun.sourceReanalysis.continue);
    expect(button.props.disabled).toBe(false); button.props.onClick(); await panel.settle();
    const posts = panel.fetcher.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(new Headers(posts[0]![1]!.headers).get('idempotency-key')).toBe(saved.reanalysisKey);
    expect(new Headers(posts[1]![1]!.headers).get('idempotency-key')).toBe(saved.reanalysisKey);
    expect(new Headers(posts[2]![1]!.headers).get('idempotency-key')).toBe(saved.runKey);
    expect(panel.onRunCreated).toHaveBeenCalledTimes(1);
  });

  it('keeps the new source but performs no second mutation or callback after an account change', async () => {
    const panel = mountedPanel(); panel.analysis.mockImplementationOnce(async () => {
      panel.setActor(ids.ro); return new Response(JSON.stringify({ task: newTask }), { status: 202 });
    });
    await panel.settle(); panel.button(en.hermesRun.sourceReanalysis.start).props.onClick(); await panel.settle();
    expect(panel.saved().newIngestionTaskId).toBe(ids.newIngestion);
    expect(panel.html()).toContain(en.hermesRun.sourceReanalysis.contextError);
    expect(panel.create).not.toHaveBeenCalled(); expect(panel.onRunCreated).not.toHaveBeenCalled();
  });
});
