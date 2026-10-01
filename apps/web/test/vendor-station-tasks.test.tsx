import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HermesRail, type HermesRailTask } from '../components/hermes/HermesRail';
import { ContinueResearch } from '../components/dashboard/ContinueResearch';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
const task = (state: string): HermesRailTask => ({ id: `task-${state}`, researchObjectId: 'ro-a', researchTitle: `Research ${state}`, logicalPath: `${state}.pdf`, state, retryCount: 0, error: null });
describe('station task visibility', () => {
  it('keeps queued, failed and review tasks reachable using their actual projection', () => {
    const html = renderToStaticMarkup(<HermesRail tasks={[task('queued'), task('needs_review'), task('failed_retryable')]} />);
    for (const state of ['queued', 'needs_review', 'failed_retryable']) {
      expect(html).toContain(`/edit?ingestionTask=task-${state}`);
      expect(html).toContain(`Research ${state}`);
    }
  });
  it('never resumes a finished task as pending work', () => {
    const html = renderToStaticMarkup(<ContinueResearch research={{ id: 'ro-a', publicId: 'DRAFT-a', title: 'Study', status: 'draft', pendingCount: 0, versionNo: 1 }} tasks={[task('confirmed')]} />);
    expect(html).not.toContain('ingestionTask=task-confirmed');
    expect(html).toContain('/research-objects/ro-a/edit');
  });
});
