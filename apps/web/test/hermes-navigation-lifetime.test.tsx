import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({ pathname: '/research-objects/first/edit', push: vi.fn() }));
const effects = vi.hoisted(() => ({ values: [] as Array<{ start: () => void | (() => void); deps?: unknown[] }> }));
const actions = vi.hoisted(() => ({ values: new Map<string, () => void>() }));
vi.mock('react', async (original) => {
  const actual = await original<typeof React>();
  return { ...actual, useEffect: (start: () => void | (() => void), deps?: unknown[]) => { effects.values.push({ start, deps }); } };
});
vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }));
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname, useRouter: () => ({ push: navigation.push }) }));
vi.mock('../components/ui/context-menu', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  return {
    ContextMenu: Pass, ContextMenuTrigger: Pass, ContextMenuContent: Pass,
    ContextMenuGroup: Pass, ContextMenuLabel: Pass, ContextMenuSeparator: () => null,
    ContextMenuItem: (props: { children: React.ReactNode; onSelect: () => void; 'data-hermes-action-key'?: string }) => {
      if (props['data-hermes-action-key']) actions.values.set(props['data-hermes-action-key'], props.onSelect);
      return <button>{props.children}</button>;
    },
  };
});

import { HermesVisualAdapter } from '../components/hermes/HermesVisualAdapter';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { setTimeout });
  navigation.pathname = '/research-objects/first/edit';
  navigation.push.mockClear();
  effects.values = [];
  actions.values.clear();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function renderPrivateMenu() {
  renderToStaticMarkup(<HermesVisualAdapter state="scanning" reducedMotion protectedGeometryVersion={0}
    onInvoke={() => {}} suggestion={{ kind: 'neutral', bodyKey: 'guide.neutral.body', titleKey: 'guide.neutral.title', researchObjectId: 'first', href: '/research-objects/first/edit' }} />);
}

it('completes delayed research navigation when the reader stays on the same route', () => {
  renderPrivateMenu();
  actions.values.get('continue')!();
  vi.advanceTimersByTime(900);
  expect(navigation.push).toHaveBeenCalledWith('/research-objects/first/edit');
});

it.each(['/explore', '/research-objects/second/edit'])('cancels a pending private action when leaving for %s', (nextRoute) => {
  renderPrivateMenu();
  const routeEffect = effects.values.find(({ deps }) => deps?.includes(navigation.pathname));
  expect(routeEffect).toBeDefined();
  const cleanup = routeEffect!.start();
  expect(cleanup).toBeTypeOf('function');
  actions.values.get('continue')!();
  vi.advanceTimersByTime(899);
  navigation.pathname = nextRoute;
  (cleanup as () => void)();
  vi.advanceTimersByTime(2);
  expect(navigation.push).not.toHaveBeenCalled();
});
