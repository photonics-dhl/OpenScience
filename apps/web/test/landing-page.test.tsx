import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useLocale: () => 'zh',
  useTranslations: () => (key: string) => {
    const messages: Record<string, string> = {
      'nav.explore': '探索',
      'nav.create': '创建',
      'nav.about': '关于',
      'nav.login': '登录',
      'hero.hermesStatus': 'Hermes 正在解析',
      'hero.title': '让研究，持续演化。',
      'hero.subtitle': '将论文、数据、代码与讨论，组织为开放、可验证、可演化的研究对象。',
      'hero.ctaExplore': '探索研究',
      'hero.ctaCreate': '创建研究对象',
      'latest.title': '最新研究',
      'latest.empty': '暂无公开研究，敬请期待。',
      'trust.title': '开放，但可信',
    };

    return messages[key] ?? key;
  },
}));

vi.mock('../components/LocaleSwitcher', () => ({
  default: () => null,
}));

describe('landing page structure', () => {
  beforeAll(() => {
    vi.stubGlobal('React', React);
  });

  async function renderLandingPage() {
    const { default: Page } = await import('../app/page');

    return renderToStaticMarkup(
      createElement(Page, { searchParams: { symbol: 'a' } }),
    );
  }

  it('uses real content sections as navigation targets', async () => {
    const markup = await renderLandingPage();

    expect(markup).toContain('<section id="latest"');
    expect(markup).toContain('<section id="trust"');
    expect(markup).not.toContain('<a id="latest"');
    expect(markup).toContain('href="/#latest"');
    expect(markup).toContain('href="/#trust"');
  });

  it('renders homepage modules beyond the hero prototype shell', async () => {
    const markup = await renderLandingPage();

    expect(markup).toContain('data-landing-module="hero"');
    expect(markup).toContain('data-landing-module="latest"');
    expect(markup).toContain('data-landing-module="evolution"');
    expect(markup).toContain('data-landing-module="hermes"');
    expect(markup).toContain('data-landing-module="trust"');
  });
});
