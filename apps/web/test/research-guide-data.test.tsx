import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => { vi.stubGlobal('React', React); });

vi.mock('next-intl', () => ({ useLocale: () => 'zh' }));
vi.mock('@/components/guide/GuideResearchWorkspace', () => ({
  GuideResearchWorkspace: () => <section aria-label="Research workspace"><textarea aria-label="Hermes" /></section>,
}));

it('keeps the Guide public and hands creation off through the research desk', async () => {
  const { ResearchGuide } = await import('../components/guide/ResearchGuide');
  const html = renderToStaticMarkup(<ResearchGuide />);
  expect(html).toContain('/research/OSR-2026-000022/v/4');
  expect(html).toContain('target="_blank"');
  expect(html).toContain('rel="noopener noreferrer"');
  expect(html).toContain('href="/dashboard"');
  expect(html).not.toContain('P04');
  expect(html).not.toContain('P05');
  expect(html).toContain('研究者');
  expect(html).toContain('Hermes');
  expect(html).toContain('读者');
  expect(html).toContain('期刊 · 协作者');
  expect(html).toContain('进入研究桌面');
  expect(html).toContain('role="tablist"');
  expect(html).toContain('aria-selected="true"');
  expect(html).not.toContain('<textarea');
  expect(html).not.toContain('href="/research-objects/new');
  expect(html).toContain('界面与评论为示意');
});
