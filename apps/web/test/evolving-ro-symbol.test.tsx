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
      'data-trajectory="branch" d="M470 405 C490 472 506 542 522 611"',
    );
    expect(markup).toContain(
      'data-trajectory="merge" d="M522 611 C546 542 560 474 566 406"',
    );
    expect(markup).toContain('data-diff-node="branch"');
    expect(markup).toContain('cx="470" cy="405"');
    expect(markup).toContain('cx="566" cy="406"');
    expect(markup).toContain('cx="522" cy="611"');
  });

  it('builds every facet as an annular wedge around an open center', () => {
    const markup = renderSymbol();

    // six wedges => six outer arcs on the outer radius per visible layer
    expect(markup.match(/A330 330 0 0 1/g)?.length).toBeGreaterThanOrEqual(18);
    // and six closing arcs on the inner radius (open center hole)
    expect(markup.match(/A158 158 0 0 0/g)?.length).toBeGreaterThanOrEqual(18);
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

  it('dims the ring and hides the trajectory in the create stage', () => {
    const markup = renderSymbol({ stage: 'create' });

    expect(markup).not.toContain('data-diff-node="branch"');
    expect(markup).not.toContain('data-trajectory="branch"');
    expect(markup).toContain('opacity:0.35');
    // the problem facet stays lit as the starting point
    expect(markup).toContain('data-facet="problem"');
  });

  it('shows only the main trajectory in the parse stage', () => {
    const markup = renderSymbol({ stage: 'parse' });

    expect(markup).toContain('data-trajectory="main"');
    expect(markup).not.toContain('data-trajectory="branch"');
    expect(markup).not.toContain('data-diff-node');
    expect(markup).toContain('opacity:0.75');
  });

  it('emphasizes branch, merge, and the diff node in the diff stage', () => {
    const markup = renderSymbol({ stage: 'diff' });

    expect(markup).toContain('data-trajectory="branch"');
    expect(markup).toContain('data-trajectory="merge"');
    expect(markup.match(/data-diff-node="/g)).toHaveLength(1);
  });
});
