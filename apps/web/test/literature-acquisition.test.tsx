import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    const copy: Record<string, string> = {
      eyebrow: 'Personal literature', title: 'Find a source', description: 'Search by title, DOI, or arXiv ID.',
      queryLabel: 'Title, DOI, or arXiv ID', queryPlaceholder: '10.1000/example', search: 'Search metadata',
      getFullText: 'Get full text', metadata: 'Metadata results', statusPending: 'Waiting in queue', statusRunning: 'Retrieving source',
      statusAuthRequired: 'Institutional access needs attention', statusFailed: 'Retrieval failed', statusSucceeded: 'Source ready',
      statusBlocked: 'Retrieval was blocked and cannot be retried.', statusRetryExhausted: 'The retry has already been used.',
      expires: 'Available until {expiresAt}', download: 'Download source', retry: 'Try again', noResults: 'No matching metadata yet.', source: 'Open source record',
    };
    return Object.entries(values ?? {}).reduce((result, [name, value]) => result.replace(`{${name}}`, String(value)), copy[key] ?? key);
  },
}));

import { LiteratureAcquisition, describeLiteratureTask, isLiteratureIdentifier, isLiteratureTaskRetryEligible, type LiteratureTask } from '@/components/dashboard/LiteratureAcquisition';

const sourceTask: LiteratureTask = {
  id: 'task-1', sessionId: 'session-1', kind: 'source.retrieve', status: 'succeeded', progress: 100, retryCount: 0,
  canRetry: false,
  result: { sources: [{ id: 'source-1', title: 'Ultrafast optical response', sourceUrl: 'https://example.org/source', identifiers: { DOI: '10.1000/example' }, temporaryDocumentId: 'document-1', expiresAt: '2026-09-01T00:00:00.000Z' }] },
  error: null, createdAt: '2026-08-30T00:00:00.000Z', updatedAt: '2026-08-30T00:00:00.000Z',
};

describe('Personal literature acquisition', () => {
  it('recognizes DOI and arXiv identifiers for the explicit full-text path', () => {
    expect(isLiteratureIdentifier('10.1000/example')).toBe(true);
    expect(isLiteratureIdentifier('arXiv:2401.01234')).toBe(true);
    expect(isLiteratureIdentifier('A paper title')).toBe(false);
  });

  it('maps pending, running, auth-required, failed, and succeeded task outcomes to stable states', () => {
    expect(describeLiteratureTask({ ...sourceTask, status: 'pending' })).toEqual({ state: 'pending', messageKey: 'statusPending' });
    expect(describeLiteratureTask({ ...sourceTask, status: 'running' })).toEqual({ state: 'running', messageKey: 'statusRunning' });
    expect(describeLiteratureTask({ ...sourceTask, status: 'succeeded', result: { providers: [{ provider: 'scansci', status: 'unavailable', code: 'auth_required' }] } })).toEqual({ state: 'auth_required', messageKey: 'statusAuthRequired' });
    expect(describeLiteratureTask({ ...sourceTask, status: 'failed' })).toEqual({ state: 'failed', messageKey: 'statusFailed' });
    expect(describeLiteratureTask(sourceTask)).toEqual({ state: 'succeeded', messageKey: 'statusSucceeded' });
  });

  it('offers retry only for one server-eligible failed source task and explains terminal failures', () => {
    const eligible = { ...sourceTask, status: 'failed' as const, retryCount: 0, canRetry: true, error: '[retryable] timeout' };
    const blocked = { ...eligible, canRetry: false, error: '[blocked] policy denied' };
    const exhausted = { ...eligible, retryCount: 1, canRetry: false, error: '[retryable] failed again' };
    expect(isLiteratureTaskRetryEligible(eligible)).toBe(true);
    expect(isLiteratureTaskRetryEligible({ ...eligible, canRetry: false })).toBe(false);
    expect(isLiteratureTaskRetryEligible({ ...eligible, canRetry: undefined } as unknown as LiteratureTask)).toBe(false);
    expect(isLiteratureTaskRetryEligible(blocked)).toBe(false);
    expect(isLiteratureTaskRetryEligible(exhausted)).toBe(false);
    expect(describeLiteratureTask(blocked)).toEqual({ state: 'failed_terminal', messageKey: 'statusBlocked' });
    expect(describeLiteratureTask(exhausted)).toEqual({ state: 'failed_terminal', messageKey: 'statusRetryExhausted' });

    const blockedMarkup = renderToStaticMarkup(<LiteratureAcquisition initialTask={blocked} onAuthenticationRequired={() => undefined} userId="user-1" />);
    const exhaustedMarkup = renderToStaticMarkup(<LiteratureAcquisition initialTask={exhausted} onAuthenticationRequired={() => undefined} userId="user-1" />);
    expect(blockedMarkup).toContain('Retrieval was blocked and cannot be retried.');
    expect(exhaustedMarkup).toContain('The retry has already been used.');
    expect(blockedMarkup).not.toContain('Try again');
    expect(exhaustedMarkup).not.toContain('Try again');
  });

  it('renders a labelled, keyboard-complete rule-separated acquisition instrument without provider controls', () => {
    const markup = renderToStaticMarkup(<LiteratureAcquisition initialTask={sourceTask} onAuthenticationRequired={() => undefined} userId="user-1" />);

    expect(markup).toContain('data-literature-acquisition="true"');
    expect(markup).toContain('for="literature-query"');
    expect(markup).toContain('id="literature-query"');
    expect(markup).toContain('type="submit"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('aria-atomic="true"');
    expect(markup).toContain('data-literature-state="succeeded"');
    expect(markup).toContain('Get full text');
    expect(markup).toContain('Download source');
    expect(markup).toMatch(/<a[^>]*min-h-11[^>]*min-w-11[^>]*>Open source record<\/a>/);
    expect(markup).toContain('min-h-11');
    expect(markup).toContain('sm:grid-cols-');
    expect(markup).not.toMatch(/provider|ScanSci|CARSI|account|mode/i);
    expect(markup).not.toContain('rounded-card');
  });
});
