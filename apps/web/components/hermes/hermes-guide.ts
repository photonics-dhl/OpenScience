import type { HermesRailTask } from './HermesRail';
import { hermesTaskHref } from './hermes-state';

export type HermesGuideKind = 'actionable-task' | 'continue-research' | 'neutral';

export interface HermesGuideSuggestion {
  kind: HermesGuideKind;
  titleKey: string;
  bodyKey: string;
  href?: string;
  taskId?: string;
  researchObjectId?: string;
}

export interface HermesGuideResearch {
  id: string;
  title: string;
  status: string;
}

export function deriveHermesGuide(input: {
  tasks: HermesRailTask[];
  researchObjects: HermesGuideResearch[];
}): HermesGuideSuggestion {
  const task = input.tasks[0];
  if (task) {
    const prompt = task.state === 'needs_review'
      ? 'review'
      : task.state.startsWith('failed_')
        ? 'failed'
        : task.state === 'parsing' || task.state === 'uploading'
          ? 'processing'
          : task.state === 'queued'
            ? 'queued'
            : 'actionable';
    return {
      kind: 'actionable-task',
      titleKey: `guide.${prompt}.title`,
      bodyKey: `guide.${prompt}.body`,
      href: hermesTaskHref(task),
      taskId: task.id,
      researchObjectId: task.researchObjectId,
    };
  }

  const research = input.researchObjects[0];
  if (research) {
    return {
      kind: 'continue-research',
      titleKey: 'guide.continue.title',
      bodyKey: 'guide.continue.body',
      href: `/research-objects/${encodeURIComponent(research.id)}/edit`,
      researchObjectId: research.id,
    };
  }

  return {
    kind: 'neutral',
    titleKey: 'guide.neutral.title',
    bodyKey: 'guide.neutral.body',
  };
}
