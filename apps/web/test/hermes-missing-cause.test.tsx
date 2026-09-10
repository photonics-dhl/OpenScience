import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { getHermesMissingCause, HermesMissingCause, HERMES_MISSING_CAUSES } from '@/components/hermes/HermesMissingCause';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

describe('Hermes missing-field cause', () => {
  it.each(HERMES_MISSING_CAUSES)('renders the recorded %s extraction cause', (cause) => {
    const result = { missingDetails: { limitations: { cause } } };
    expect(getHermesMissingCause(result, 'limitations')).toBe(cause);
    const html = renderToStaticMarkup(<HermesMissingCause field="limitations" result={result} />);
    expect(html).toContain(`data-hermes-missing-cause="${cause}"`);
    expect(html).toContain(cause);
  });

  it('does not invent a reason for absent or unknown worker metadata', () => {
    expect(getHermesMissingCause({}, 'results')).toBeNull();
    expect(getHermesMissingCause({ missingDetails: { results: { cause: 'paper_has_no_information' } } }, 'results')).toBeNull();
    expect(renderToStaticMarkup(<HermesMissingCause field="results" result={{}} />)).toBe('');
  });
});
