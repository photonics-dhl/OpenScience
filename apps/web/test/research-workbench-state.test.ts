import { describe, expect, it } from 'vitest';

import {
  createResearchWorkbenchState,
  parseResearchWorkbenchView,
  reduceResearchWorkbenchState,
  RESEARCH_WORKBENCH_VIEWS,
} from '@/lib/research-workbench-state';

describe('research workbench review state', () => {
  it('allowlists the six review views and falls back to Dashboard', () => {
    expect(RESEARCH_WORKBENCH_VIEWS).toEqual([
      'dashboard',
      'editor',
      'review',
      'explore',
      'reading',
      'mobile',
    ]);

    for (const view of RESEARCH_WORKBENCH_VIEWS) {
      expect(parseResearchWorkbenchView(view)).toBe(view);
    }

    expect(parseResearchWorkbenchView(null)).toBe('dashboard');
    expect(parseResearchWorkbenchView('admin')).toBe('dashboard');
  });

  it('switches scene without leaving the assistant fixture open', () => {
    const withAssistant = reduceResearchWorkbenchState(
      createResearchWorkbenchState(),
      { type: 'assistant', open: true },
    );

    expect(
      reduceResearchWorkbenchState(withAssistant, {
        type: 'view',
        view: 'editor',
      }),
    ).toMatchObject({
      view: 'editor',
      assistantOpen: false,
      speech: 'prompt',
    });
  });

  it('records quiet companion feedback without losing scene context', () => {
    const editor = createResearchWorkbenchState('editor');

    expect(
      reduceResearchWorkbenchState(editor, { type: 'quiet' }),
    ).toMatchObject({
      view: 'editor',
      speech: 'quiet',
      assistantOpen: false,
    });
  });

  it('records review acceptance only in the review scene', () => {
    const review = createResearchWorkbenchState('review');
    const dashboard = createResearchWorkbenchState('dashboard');

    expect(
      reduceResearchWorkbenchState(review, { type: 'accept-review' }),
    ).toMatchObject({ view: 'review', reviewAccepted: true });
    expect(
      reduceResearchWorkbenchState(dashboard, { type: 'accept-review' }),
    ).toEqual(dashboard);
  });

  it('opens and closes the assistant fixture explicitly', () => {
    const initial = createResearchWorkbenchState('reading');
    const opened = reduceResearchWorkbenchState(initial, {
      type: 'assistant',
      open: true,
    });

    expect(opened.assistantOpen).toBe(true);
    expect(
      reduceResearchWorkbenchState(opened, {
        type: 'assistant',
        open: false,
      }).assistantOpen,
    ).toBe(false);
  });
});
