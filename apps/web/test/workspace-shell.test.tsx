import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => ({
    outline: 'Outline',
    coreEdit: 'Write & SDF',
    suggestions: 'Evidence & Hermes',
  })[key] ?? key,
}));

import EditorLayout from '../components/editor/EditorLayout';
import { ArtifactRow } from '../components/research/ArtifactRow';
import { BeforeAfterProposal } from '../components/research/BeforeAfterProposal';
import { EvidenceSnippet } from '../components/research/EvidenceSnippet';
import { ObjectHeader } from '../components/research/ObjectHeader';
import { SDFNode } from '../components/research/SDFNode';

describe('Optical Editorial Research Object workspace', () => {
  beforeAll(() => {
    vi.stubGlobal('React', React);
  });

  it('renders one object header and three stable work planes', () => {
    const markup = renderToStaticMarkup(createElement(EditorLayout, {
      header: createElement(ObjectHeader, {
        objectId: 'OSR-2026-0017',
        title: 'Ultrafast carrier dynamics',
        version: 4,
        visibility: 'private',
        saveState: 'saved',
      }),
      objectId: 'OSR-2026-0017',
      outline: createElement('nav', { 'data-plane-content': 'outline' }, 'Outline'),
      main: createElement('article', { 'data-plane-content': 'sdf' }, 'SDF'),
      aside: createElement('aside', { 'data-plane-content': 'evidence' }, 'Evidence'),
    }));

    expect(markup.match(/<main\b/g)).toHaveLength(1);
    expect(markup.match(/data-object-header=/g)).toHaveLength(1);
    expect(markup).toContain('data-object-context-bar="true"');
    expect(markup).toContain('data-workspace-mode-tabs="true"');
    expect(markup).not.toContain('aria-disabled="true"');
    expect(markup).toContain('data-research-workspace-nav="true"');
    expect(markup).toContain('/research-objects/OSR-2026-0017/files');
    expect(markup).toContain('/research-objects/OSR-2026-0017/versions');
    expect(markup).toContain('Ultrafast carrier dynamics');
    expect(markup).toContain('v4');
    expect(markup).toContain('data-workspace-plane="19"');
    expect(markup).toContain('data-workspace-plane="56"');
    expect(markup).toContain('data-workspace-plane="25"');
    expect(markup).toContain('data-mobile-workspace-navigation="true"');
    expect(markup.match(/data-plane-content="outline"/g)).toHaveLength(1);
    expect(markup.match(/data-plane-content="sdf"/g)).toHaveLength(1);
    expect(markup.match(/data-plane-content="evidence"/g)).toHaveLength(1);
  });

  it('renders six numbered SDF nodes with vermilion reserved for the active node', () => {
    const markup = Array.from({ length: 6 }, (_, index) => renderToStaticMarkup(createElement(
      SDFNode,
      {
        active: index === 2,
        label: `Field ${index + 1}`,
        number: index + 1,
        onActivate: () => undefined,
      },
      createElement('p', null, 'Evidence-backed content'),
    ))).join('');

    expect(markup.match(/data-sdf-node=/g)).toHaveLength(6);
    expect(markup.match(/data-active-vermilion="true"/g)).toHaveLength(1);
    expect(markup).toContain('>06<');
  });

  it('keeps evidence collapsible and proposals explicit about source and scope', () => {
    const evidence = renderToStaticMarkup(createElement(EvidenceSnippet, {
      label: 'Source evidence',
      source: 'manuscript.pdf · p. 12',
      children: 'The measured lifetime was 43 fs.',
    }));
    const proposal = renderToStaticMarkup(createElement(BeforeAfterProposal, {
      before: 'Lifetime was short.',
      after: 'The measured lifetime was 43 fs.',
      source: 'Hermes extractor · manuscript.pdf',
      scope: 'Results / paragraph 2',
      onReview: () => undefined,
      risk: 'high',
    }));

    expect(evidence).toContain('<details');
    expect(evidence).toContain('manuscript.pdf · p. 12');
    expect(proposal).toContain('data-proposal-source=');
    expect(proposal).toContain('data-proposal-scope=');
    expect(proposal).toContain('data-risk="high"');
    expect(proposal).not.toContain('suggestion-card');
    const proposalSource = readFileSync(new URL('../components/research/BeforeAfterProposal.tsx', import.meta.url), 'utf8');
    expect(proposalSource).toContain('@radix-ui/react-dialog');
    expect(proposalSource).toContain('Dialog.Portal');
    expect(proposalSource).toContain('fixed inset-0');
  });

  it('presents artifacts as rule-based rows instead of cards', () => {
    const markup = renderToStaticMarkup(createElement(ArtifactRow, {
      name: 'manuscript.pdf',
      status: 'ready',
      meta: 'PDF · primary manuscript',
    }));
    expect(markup).toContain('data-artifact-row="true"');
    expect(markup).not.toMatch(/card|rounded-(?:xl|2xl|3xl)/);
  });
});
