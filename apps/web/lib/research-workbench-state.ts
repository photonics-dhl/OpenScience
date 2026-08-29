export const RESEARCH_WORKBENCH_VIEWS = [
  'dashboard',
  'editor',
  'review',
  'explore',
  'reading',
  'mobile',
] as const;

export type ResearchWorkbenchView =
  (typeof RESEARCH_WORKBENCH_VIEWS)[number];

export interface ResearchWorkbenchState {
  assistantOpen: boolean;
  reviewAccepted: boolean;
  speech: 'prompt' | 'quiet';
  view: ResearchWorkbenchView;
}

export type ResearchWorkbenchAction =
  | { open: boolean; type: 'assistant' }
  | { type: 'accept-review' }
  | { type: 'quiet' }
  | { type: 'view'; view: ResearchWorkbenchView };

export function parseResearchWorkbenchView(
  value: string | null,
): ResearchWorkbenchView {
  return RESEARCH_WORKBENCH_VIEWS.find((view) => view === value) ?? 'dashboard';
}

export function createResearchWorkbenchState(
  view: ResearchWorkbenchView = 'dashboard',
): ResearchWorkbenchState {
  return {
    assistantOpen: false,
    reviewAccepted: false,
    speech: 'prompt',
    view,
  };
}

export function reduceResearchWorkbenchState(
  state: ResearchWorkbenchState,
  action: ResearchWorkbenchAction,
): ResearchWorkbenchState {
  switch (action.type) {
    case 'assistant':
      return { ...state, assistantOpen: action.open };
    case 'accept-review':
      return state.view === 'review'
        ? { ...state, reviewAccepted: true }
        : state;
    case 'quiet':
      return { ...state, speech: 'quiet' };
    case 'view':
      return {
        ...state,
        assistantOpen: false,
        reviewAccepted: false,
        speech: 'prompt',
        view: action.view,
      };
  }
}
