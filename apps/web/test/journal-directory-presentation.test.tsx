import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
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

describe('journal directory presentation', () => {
  it('retains journal identity and navigation without loading arbitrary external logos', () => {
    const markup = renderToStaticMarkup(createElement(JournalDirectory, {
      initial: [{ ...journal, logoUrl: 'https://tracking.example/visitor.gif' }],
    }));
    expect(markup).toContain('Optics Review');
    expect(markup).toContain('光学研究');
    expect(markup).toContain('href="/journals/optics"');
    expect(markup).not.toContain('tracking.example');
    expect(markup).not.toContain('<img');
  });

  it('bounds a long source description without splitting Unicode characters', () => {
    const description = '🔬'.repeat(219) + '🌌' + '完整简介'.repeat(1200);
    const markup = renderToStaticMarkup(createElement(JournalDirectory, {
      initial: [{ ...journal, description }],
    }));
    expect(markup).toContain('🔬'.repeat(219) + '🌌…');
    expect(markup).not.toContain('完整简介');
    expect(markup).not.toContain('\ufffd');
    expect(markup).toContain('href="/journals/optics"');
    expect(markup).toContain('公开论文 8 篇');
    expect(description).toContain('完整简介');
  });
});
