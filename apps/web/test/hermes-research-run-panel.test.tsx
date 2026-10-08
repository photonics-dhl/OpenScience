import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HermesResearchRunPanel } from '@/components/hermes/HermesResearchRunPanel';
import type { DashboardTaskApi } from '@/lib/api';

vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string, values?: Record<string, string>) => values?.source ? `${key}:${values.source}` : key }));
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, useState: vi.fn(actual.useState) };
});
afterEach(() => { vi.clearAllMocks(); });

const task = (id: string, logicalPath: string, state: DashboardTaskApi['state']): DashboardTaskApi => ({
  id, logicalPath, state, researchObjectId: 'ro-1', researchTitle: 'Study', retryCount: 0, error: null,
});

describe('Hermes research run panel', () => {
  it('requires explicit per-file processing consent in journal scope and shows shared analysis honestly', () => {
    const html = renderToStaticMarkup(<HermesResearchRunPanel journalScope={{
      journalId: 'journal-1', articleId: 'paper-1', researchObjectId: null, sourceLabel: 'paper.pdf', sourceRevision: 3,
      jobs: [], processing: { ingestionTaskId: 'ing-1', state: 'parsing', agentStatus: 'running', progress: 38, error: null, hermesRunId: 'run-1', confirmedVersionId: null },
      hasDraft: false, canStart: false, busy: false, issues: ['Wait for the current task'], onStart: () => {}, onCancel: () => {},
    }} />);
    expect(html).toContain('paper.pdf');
    expect(html).toContain('agree to start parsing');
    expect(html).toContain('Parsing and analyzing paper materials');
    expect(html).not.toContain('Interpretation generated');
    expect(html).toContain('disabled=""');
  });
  it('uses the explicit task context rather than silently choosing another paper', () => {
    // This entry is visible only after the account and existing-run read resolve.
    for (const state of [null, '', 'en', 'auto', 'actor-1', 'actor-1:ro-1', false, false, 'actor-1:ro-1:current'])
      vi.mocked(React.useState).mockReturnValueOnce([state, vi.fn()]);
    const html = renderToStaticMarkup(<HermesResearchRunPanel
      researchObjectId="ro-1"
      tasks={[task('older', 'older-paper.pdf', 'parsing'), task('current', 'current-paper.pdf', 'queued')]}
      activeTaskId="current"
      runId=""
      onRunCreated={() => {}}
    />);
    expect(html).toContain('current-paper.pdf');
    expect(html).toContain('startFor:current-paper.pdf');
    expect(html).not.toContain('>current<');
  });

  it('does not offer a failed ingestion as a workflow source', () => {
    const html = renderToStaticMarkup(<HermesResearchRunPanel
      researchObjectId="ro-1"
      tasks={[task('failed', 'broken-paper.pdf', 'failed_retryable')]}
      runId=""
      onRunCreated={() => {}}
    />);
    expect(html).toContain('unavailableDescription');
    expect(html).not.toContain('broken-paper.pdf');
  });
});
