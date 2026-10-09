import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';

const effects = vi.hoisted(() => [] as Array<() => void | (() => void)>);
const api = vi.hoisted(() => ({
  getExploreIndex: vi.fn(),
  getPublicResearchVersion: vi.fn(),
}));
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof React>();
  // This server-rendering harness exposes window only for request timers.
  return { ...actual, useLayoutEffect: actual.useEffect, useEffect: (effect: () => void | (() => void)) => effects.push(effect) };
});
vi.mock('@/lib/api', () => api);
vi.mock('next/navigation', () => ({ usePathname: () => '/guide', useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

beforeEach(() => {
  vi.stubGlobal('React', React);
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  effects.length = 0;
  vi.clearAllMocks();
  api.getExploreIndex.mockResolvedValue({ items: [], nextCursor: null });
  api.getPublicResearchVersion.mockResolvedValue({ research: null });
});

it('keeps the guide example on its cited public version independently of discovery ranking', async () => {
  const { ResearchGuide } = await import('../components/guide/ResearchGuide');
  renderToStaticMarkup(<ResearchGuide />);
  const dispose = effects[0]();
  await Promise.resolve();
  expect(api.getPublicResearchVersion).toHaveBeenCalledWith('OSR-2026-000022', 4, expect.any(AbortSignal));
  expect(api.getExploreIndex).not.toHaveBeenCalled();
  if (dispose) dispose();
});

it('cancels the public example request when the guide is left', async () => {
  const { ResearchGuide } = await import('../components/guide/ResearchGuide');
  renderToStaticMarkup(<ResearchGuide />);
  const dispose = effects[0]();
  const signal = api.getPublicResearchVersion.mock.calls[0]?.[2] as AbortSignal | undefined;
  expect(signal?.aborted).toBe(false);
  if (dispose) dispose();
  expect(signal?.aborted).toBe(true);
});
