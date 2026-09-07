import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    const labels: Record<string, string> = {
      suggestions: 'AI Suggestions', hermesEvidenceLabel: 'Hermes / Evidence', extract: 'AI Extract',
      extracting: 'Extracting', sourceLocatorUnavailable: 'Source locator unavailable', currentSdfAggregate: 'Current SDF aggregate',
      hermesExtractor: 'Hermes extractor', researcherPrompt: 'Researcher prompt', evidenceLocationLocated: 'Located',
      evidenceLocationAmbiguous: 'Multiple matches', evidenceLocationCrossBlock: 'Cross-block', evidenceLocationMissing: 'Not located',
      evidenceLocationUnverified: 'Unverified', evidenceLocationPage: `page ${values?.page}`, evidenceLocationBlock: `block ${values?.blockId}`,
      evidenceLocationNotice: 'Location indicates where a quote was found, not whether the conclusion is correct.',
      proposalSource: 'Source', proposalScope: 'Scope', proposalBefore: 'Before', proposalAfter: 'After', proposalEmpty: 'Empty',
      dismissSuggestion: 'Dismiss', editSuggestion: 'Edit suggestion', reviewChanges: 'Review changes',
    };
    return labels[key] ?? key;
  },
}));

import SuggestionsPanel from '../components/editor/SuggestionsPanel';
import type { AiSuggestion } from '../lib/suggestions';

const base: Omit<AiSuggestion, 'id' | 'evidenceLocation'> = {
  field: 'method', suggestion: 'Proposed method.', before: '', status: 'pending', source: 'extractor',
  sourceContext: 'sdf_aggregate', sourceLocator: 'chars:0-16', evidence: { quote: '<quoted source>', locator: 'chars:0-16' }, risk: 'normal',
};

describe('SuggestionsPanel evidence locations', () => {
  beforeAll(() => {
    vi.stubGlobal('React', React);
  });

  it('shows each normalized status with only validated page/block details, keeps the quote escaped, and leaves review actions available', () => {
    const statuses: AiSuggestion[] = [
      { ...base, id: 'located', evidenceLocation: { status: 'located', blockId: 'block-2', page: 2 } },
      { ...base, id: 'ambiguous', evidenceLocation: { status: 'ambiguous' } },
      { ...base, id: 'cross', evidenceLocation: { status: 'cross_block' } },
      { ...base, id: 'missing', evidenceLocation: { status: 'missing' } },
      { ...base, id: 'unverified', evidenceLocation: { status: 'unverified' } },
    ];
    const markup = renderToStaticMarkup(createElement(SuggestionsPanel, {
      suggestions: statuses, missingFields: [], onApply: () => undefined, onDismiss: () => undefined, onAcknowledgeMissing: () => undefined,
    }));

    expect(markup).toContain('data-suggestion-evidence-location="located"');
    expect(markup).toContain('data-suggestion-evidence-location="ambiguous"');
    expect(markup).toContain('data-suggestion-evidence-location="cross_block"');
    expect(markup).toContain('data-suggestion-evidence-location="missing"');
    expect(markup).toContain('data-suggestion-evidence-location="unverified"');
    expect(markup).toContain('page 2');
    expect(markup).toContain('block block-2');
    expect(markup).toContain('&lt;quoted source&gt;');
    expect(markup).not.toContain('chars:0-16');
    expect(markup).toContain('Review changes');
    expect(markup).toContain('Dismiss');
  });

  it('keeps legacy manual evidence and source rendering while extractor fallbacks remain unverified', () => {
    const manual: AiSuggestion = {
      ...base, id: 'manual', source: 'manual', sourceLocator: 'research-notes.md · p. 4',
      evidence: { quote: 'Manual source quote.', locator: 'research-notes.md · p. 4' },
    };
    const legacyExtractor: AiSuggestion = {
      ...base, id: 'legacy-extractor', evidenceLocation: undefined,
    };
    const markup = renderToStaticMarkup(createElement(SuggestionsPanel, {
      suggestions: [manual, legacyExtractor], missingFields: [], onApply: () => undefined, onDismiss: () => undefined, onAcknowledgeMissing: () => undefined,
    }));

    expect(markup).toContain('data-proposal-evidence="research-notes.md · p. 4"');
    expect(markup).toContain('Manual source quote.');
    expect(markup).toContain('Source / research-notes.md · p. 4 · Researcher prompt');
    expect(markup).toContain('data-suggestion-evidence-location="unverified"');
  });
});
