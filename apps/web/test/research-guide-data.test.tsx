import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => { vi.stubGlobal('React', React); });

vi.mock('next-intl', () => ({ useLocale: () => 'zh' }));
vi.mock('@/components/guide/GuideResearchWorkspace', () => ({
  GuideResearchWorkspace: () => <section aria-label="Research workspace"><textarea aria-label="Hermes" /></section>,
}));

it('keeps the public example out of the workspace and opens it without discarding local work', async () => {
  const { ResearchGuide } = await import('../components/guide/ResearchGuide');
  const html = renderToStaticMarkup(<ResearchGuide />);
  expect(html).toContain('/research/OSR-2026-000022/v/4');
  expect(html).toContain('target="_blank"');
  expect(html).toContain('rel="noopener noreferrer"');
  expect(html.match(/href="\/dashboard"/g)).toHaveLength(1);
  expect(html).not.toContain('进入研究桌面');
  expect(html).not.toContain('role="tablist"');
});
