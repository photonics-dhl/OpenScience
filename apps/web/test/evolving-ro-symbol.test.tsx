import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import EvolvingRoSymbol from '../components/landing/evolving-ro-symbol';

const facets = [
  'problem',
  'insight',
  'method',
  'results',
  'limitations',
  'reproducibility',
] as const;

function renderSymbol(
  props: Partial<React.ComponentProps<typeof EvolvingRoSymbol>> = {},
) {
  return renderToStaticMarkup(
    createElement(EvolvingRoSymbol, {
      variant: 'sculptural',
      ...props,
    }),
  );
}

function attributeValues(markup: string, attribute: string): string[] {
  return [...markup.matchAll(new RegExp(`${attribute}="([^"]+)"`, 'g'))].map(
    (match) => match[1],
  );
}

describe('EvolvingRoSymbol', () => {
  it('renders six named facets, one diff node, and a decorative root', () => {
    const markup = renderSymbol();

    expect(markup).toContain('<svg');
    expect(markup).toContain('viewBox="0 0 800 800"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('pointer-events="none"');
    expect(markup.match(/data-facet="/g)).toHaveLength(6);
    expect(attributeValues(markup, 'data-facet')).toEqual(facets);
    expect(markup.match(/data-diff-node="/g)).toHaveLength(1);
    expect(markup).toContain('data-diff-node="branch"');
  });

  it('changes its internal detail layer between sculptural and interface variants', () => {
    const sculptural = renderSymbol({ variant: 'sculptural' });
    const interfaceVariant = renderSymbol({ variant: 'interface' });

    expect(sculptural).toContain('scale(1.04)');
    expect(sculptural).not.toContain('data-content-stroke');
    expect(interfaceVariant.match(/data-content-stroke="/g)?.length).toBeGreaterThanOrEqual(
      12,
    );
    expect(interfaceVariant).not.toEqual(sculptural);
  });

  it('renders tokenized layered facets and a single branching trajectory node', () => {
    const markup = renderSymbol();

    expect(markup).toContain('fill="url(#');
    expect(markup).toContain('stroke-width="1.5"');
    expect(markup).toContain('stroke-width="6"');
    expect(markup).toContain('stroke-width="16"');
    expect(markup).toContain('scale(1.06)');
    expect(markup).toContain('scale(1.12)');
    expect(markup).toContain('x="-35%" y="-35%" width="170%" height="170%"');
    expect(markup).toContain('data-trajectory="main"');
    expect(markup).toContain('data-trajectory="branch"');
    expect(markup).toContain('data-trajectory="merge"');
    expect(markup.match(/var\(--accent-diff\)/g)).toHaveLength(1);
  });

  it('omits animation markup and classes when reduced motion is preferred', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    try {
      const markup = renderSymbol({ animated: true });

      expect(markup).not.toContain('<animate');
      expect(markup).not.toContain('evolving-ro-symbol__breathing');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('renders animated breathing only through an opacity or transform animation', () => {
    const markup = renderSymbol({ animated: true });

    expect(markup).toContain('evolving-ro-symbol__breathing');
    expect(markup).toContain('animation: evolving-ro-symbol-breathe 10s ease-in-out infinite alternate');
    expect(markup).not.toContain('<animate');
  });

  it('connects a single branch from the main trajectory back into the main trajectory', () => {
    const markup = renderSymbol();

    expect(markup).toContain('data-trajectory-junction="branch"');
    expect(markup).toContain('data-trajectory-junction="merge"');
    expect(markup).toContain(
      'data-trajectory="branch" d="M360 390 C420 320 472 270 525 225"',
    );
    expect(markup).toContain(
      'data-trajectory="merge" d="M525 225 C562 275 548 350 440 410"',
    );
    expect(markup).toContain('data-diff-node="branch"');
    expect(markup).toContain('cx="360" cy="390"');
    expect(markup).toContain('cx="440" cy="410"');
  });

  it('renders the required historical outlines and three visible outline layers per facet', () => {
    const markup = renderSymbol();

    expect(markup.match(/data-history-scale="1\.12"/g)).toHaveLength(6);
    expect(markup.match(/data-history-scale="1\.06"/g)).toHaveLength(6);
    expect(markup.match(/opacity="0\.07"/g)).toHaveLength(6);
    expect(markup.match(/opacity="0\.15"/g)).toHaveLength(6);
    expect(markup.match(/data-outline-layer="core"/g)).toHaveLength(6);
    expect(markup.match(/data-outline-layer="inner-glow"/g)).toHaveLength(6);
    expect(markup.match(/data-outline-layer="outer-bloom"/g)).toHaveLength(6);
    expect(markup.match(/stroke-width="1\.5"/g)?.length).toBeGreaterThanOrEqual(12);
    expect(markup).toContain('stdDeviation="6"');
    expect(markup).toContain('stdDeviation="16"');
    expect(markup.match(/x="-35%" y="-35%" width="170%" height="170%"/g)).toHaveLength(
      2,
    );
  });
});
