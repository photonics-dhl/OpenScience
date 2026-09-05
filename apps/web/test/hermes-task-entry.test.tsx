import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { DashboardTaskApi, IngestionTaskDetail } from '@/lib/api';
import { HermesTaskEntry, loadScopedHermesReview } from '@/components/hermes/HermesTaskEntry';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
const task = (id: string, ro: string, state: DashboardTaskApi['state'] = 'needs_review'): DashboardTaskApi => ({ id, researchObjectId: ro, researchTitle: 'Paper', logicalPath: `${id}.pdf`, state, retryCount: 0, error: null });
const render = (tasks: DashboardTaskApi[], loading = false, error = '') => renderToStaticMarkup(<HermesTaskEntry researchObjectId="ro-1" tasks={tasks} loading={loading} error={error} onRetry={() => {}} />);

describe('Hermes research task entry', () => {
  it('lists only the current research tasks with real review and material destinations', () => {
    const html = render([task('review', 'ro-1'), task('waiting', 'ro-1', 'parsing'), task('private', 'ro-2')]);
    expect(html).toContain('/research-objects/ro-1/hermes?task=review');
    expect(html).toContain('/research-objects/ro-1/files');
    expect(html).not.toContain('/ingest?task=');
    expect(html).not.toContain('private.pdf');
  });
  it('provides editing and material links when there are no tasks', () => {
    const html = render([]);
    expect(html).toContain('entryEmpty');
    expect(html).toContain('/research-objects/ro-1/edit');
    expect(html).toContain('/research-objects/ro-1/files');
  });
  it('renders an actionable error without an endless loading or misleading empty state', () => {
    const html = render([], false, 'Unavailable');
    expect(html).toContain('role="alert"');
    expect(html).toContain('retry');
    expect(html).not.toContain('entryEmpty');
    expect(html).not.toContain('role="status"');
  });
  it('does not show empty copy before loading completes', () => {
    expect(render([], true)).toContain('role="status"');
    expect(render([], true)).not.toContain('entryEmpty');
  });
  it('rejects a task that belongs to another research object before returning content', async () => {
    const detail = { researchObjectId: 'other', task: { id: 'task' } } as IngestionTaskDetail;
    await expect(loadScopedHermesReview('ro-1', 'task', async () => detail)).rejects.toThrow('HERMES_TASK_SCOPE_MISMATCH');
  });
  it('returns the matching task unchanged for the existing confirmation contract', async () => {
    const detail = { researchObjectId: 'ro-1', task: { id: 'task' } } as IngestionTaskDetail;
    expect(await loadScopedHermesReview('ro-1', 'task', async () => detail)).toBe(detail);
  });
});
