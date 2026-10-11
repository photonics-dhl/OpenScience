import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/zh.json';
import { describe, expect, it } from 'vitest';
import { JournalDirectory } from '../components/journals/JournalDirectory';
import type { JournalSummary } from '../lib/journal-api';

const journal: JournalSummary = {
  id: 'journal-optics',
  slug: 'optics',
  nameEn: 'Optics Review',
  nameZh: '光学研究',
  subjects: ['Optics'],
  publicArticleCount: 8,
  homepagePublished: true,
  status: 'active',
};

const renderDirectory = (initial: JournalSummary[]) => renderToStaticMarkup(createElement(NextIntlClientProvider,
  { locale: 'zh', messages, timeZone: 'Asia/Shanghai', children: createElement(JournalDirectory, { initial }) }));

describe('journal directory presentation', () => {
  it('keeps unsupported access classifications unavailable for the real API shape', () => {
    // JournalSummary currently carries no authoritative Open Access field.
    const markup = renderDirectory([journal]);
    expect(markup).toMatch(/<option(?=[^>]*value="open")(?=[^>]*disabled)[^>]*>/);
    expect(markup).toMatch(/<option(?=[^>]*value="closed")(?=[^>]*disabled)[^>]*>/);
    expect(markup).toContain('<option value="unknown">');
    expect(markup).toContain('Optics Review');
  });
  it('retains journal identity and navigation without loading arbitrary external logos', () => {
    const markup = renderDirectory([{ ...journal, logoUrl: 'https://tracking.example/visitor.gif' }]);
    expect(markup).toContain('Optics Review');
    expect(markup).toContain('光学研究');
    expect(markup).toContain('href="/journals/optics"');
    expect(markup).not.toContain('tracking.example');
    expect(markup).not.toContain('<img');
  });

  it('keeps directory cards focused on identity without rendering long source descriptions', () => {
    const description = '🔬'.repeat(219) + '🌌' + '完整简介'.repeat(1200);
    const markup = renderDirectory([{ ...journal, description, publisherName: 'Optics Publisher' }]);
    expect(markup).toContain('Optics Publisher');
    expect(markup).toContain('Optics Review');
    expect(markup).not.toContain('🔬');
    expect(markup).not.toContain('完整简介');
    expect(markup).not.toContain('\ufffd');
    expect(markup).toContain('href="/journals/optics"');
    expect(markup).toContain('平台收录篇数');
    expect(description).toContain('完整简介');
  });
});
