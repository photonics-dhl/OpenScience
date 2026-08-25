import type { HermesActionId } from './action-catalog';

export type HermesContextActionGroup = 'companion' | 'research';
export type HermesContextActionKey =
  | 'greet'
  | 'encourage'
  | 'think'
  | 'listen'
  | 'stretch'
  | 'rest'
  | 'celebrate'
  | 'read-together'
  | 'continue'
  | 'evidence'
  | 'sources'
  | 'compare';

export type HermesContextActionIcon =
  | 'spark'
  | 'sunrise'
  | 'thought'
  | 'listen'
  | 'stretch'
  | 'rest'
  | 'celebrate'
  | 'book'
  | 'route'
  | 'evidence'
  | 'sources'
  | 'compare';

export interface HermesContextAction {
  action: HermesActionId;
  feedbackKeys: readonly [string, string, string];
  group: HermesContextActionGroup;
  icon: HermesContextActionIcon;
  key: HermesContextActionKey;
  labelKey: string;
}

export interface HermesMenuFeedback {
  action: HermesActionId;
  messageKey: string;
  speechDelayMs?: number;
}

const feedbackKeys = (key: HermesContextActionKey): readonly [string, string, string] => [
  `guide.menu.actions.${key}.feedback.one`,
  `guide.menu.actions.${key}.feedback.two`,
  `guide.menu.actions.${key}.feedback.three`,
];

export function resolveHermesIntroSequence(
  kind: 'actionable-task' | 'continue-research' | 'neutral',
): readonly [HermesMenuFeedback, HermesMenuFeedback] {
  const context = kind === 'actionable-task'
    ? { action: 'evidence-check' as const, messageKey: 'guide.menu.intro.actionable' }
    : kind === 'continue-research'
      ? { action: 'return-dock' as const, messageKey: 'guide.menu.intro.continue' }
      : { action: 'thinking-pause' as const, messageKey: 'guide.menu.intro.neutral' };
  return [
    { action: 'ear-perk', messageKey: 'guide.menu.intro.presence' },
    context,
  ];
}

const companion = (
  key: HermesContextActionKey,
  action: HermesActionId,
  icon: HermesContextActionIcon,
): HermesContextAction => ({
  action,
  feedbackKeys: feedbackKeys(key),
  group: 'companion',
  icon,
  key,
  labelKey: `guide.menu.actions.${key}.label`,
});

const research = (
  key: HermesContextActionKey,
  action: HermesActionId,
  icon: HermesContextActionIcon,
): HermesContextAction => ({
  action,
  feedbackKeys: feedbackKeys(key),
  group: 'research',
  icon,
  key,
  labelKey: `guide.menu.actions.${key}.label`,
});

export const HERMES_CONTEXT_ACTIONS: readonly HermesContextAction[] = [
  companion('greet', 'ear-perk', 'spark'),
  companion('encourage', 'happy-wiggle', 'sunrise'),
  companion('think', 'thinking-pause', 'thought'),
  companion('listen', 'lamp-listen', 'listen'),
  companion('stretch', 'stretch', 'stretch'),
  companion('rest', 'doze', 'rest'),
  companion('celebrate', 'milestone-dance', 'celebrate'),
  companion('read-together', 'read', 'book'),
  research('continue', 'return-dock', 'route'),
  research('evidence', 'evidence-check', 'evidence'),
  research('sources', 'citation-trace', 'sources'),
  research('compare', 'compare', 'compare'),
] as const;

export function resolveHermesActionFeedback(
  item: HermesContextAction,
  seed: number,
  previousMessageKey: string | null,
): HermesMenuFeedback {
  let index = Math.abs(Math.trunc(seed)) % item.feedbackKeys.length;
  if (item.feedbackKeys[index] === previousMessageKey) index = (index + 1) % item.feedbackKeys.length;
  return {
    action: item.action,
    messageKey: item.feedbackKeys[index],
    // Give the physical reaction a readable beat before language arrives.
    speechDelayMs: item.group === 'companion' ? 520 : 320,
  };
}

export interface HermesResearchRouteContext {
  href?: string;
  researchObjectId?: string;
}

export function resolveHermesResearchHref(
  key: Extract<HermesContextActionKey, 'continue' | 'evidence' | 'sources' | 'compare'>,
  context: HermesResearchRouteContext,
): string {
  if (key === 'continue') return context.href ?? '/research-objects/new?mode=import';
  if (!context.researchObjectId) return '/research-objects/new?mode=import';

  const base = `/research-objects/${encodeURIComponent(context.researchObjectId)}`;
  if (key === 'evidence') return `${base}/hermes`;
  if (key === 'sources') return `${base}/files`;
  return `${base}/versions`;
}
