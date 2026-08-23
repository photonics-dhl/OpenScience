export type HermesActionId =
  | 'blink-single'
  | 'blink-double'
  | 'observe-left'
  | 'observe-right'
  | 'evidence-check'
  | 'page-tidy'
  | 'citation-trace'
  | 'stretch'
  | 'doze'
  | 'wake'
  | 'surprise-settle'
  | 'cap-check'
  | 'ear-perk'
  | 'lamp-listen'
  | 'happy-wiggle'
  | 'thinking-pause'
  | 'patrol'
  | 'return-dock'
  | 'pointer-approach'
  | 'pointer-avoid'
  | 'drag'
  | 'guide-travel'
  | 'guide-arrive'
  | 'quiet-write'
  | 'read'
  | 'compare'
  | 'draft'
  | 'possible-issue'
  | 'success'
  | 'milestone-dance'
  | 'failed-settle'
  | 'approval-still';

export type HermesExpression = 'neutral' | 'curious' | 'focused' | 'doubt' | 'success' | 'failed';
export type HermesEffect = 'none' | 'star-wake' | 'evidence-sequence' | 'citation-arc' | 'particles';

export interface HermesActionDefinition {
  durationMs: number;
  effect: HermesEffect;
  expression: HermesExpression;
  id: HermesActionId;
  interruptible: boolean;
  personality: 'scholar' | 'spirit-pet';
  signature: boolean;
}

const action = (
  id: HermesActionId,
  personality: HermesActionDefinition['personality'],
  durationMs: number,
  expression: HermesExpression = 'neutral',
  effect: HermesEffect = 'none',
  signature = false,
  interruptible = true,
): HermesActionDefinition => ({ durationMs, effect, expression, id, interruptible, personality, signature });

export const HERMES_ACTION_CATALOG: Record<HermesActionId, HermesActionDefinition> = {
  'blink-single': action('blink-single', 'scholar', 420),
  'blink-double': action('blink-double', 'scholar', 720),
  'observe-left': action('observe-left', 'scholar', 1_500, 'curious'),
  'observe-right': action('observe-right', 'scholar', 1_500, 'curious'),
  'evidence-check': action('evidence-check', 'scholar', 1_650, 'focused', 'evidence-sequence'),
  'page-tidy': action('page-tidy', 'scholar', 1_250, 'focused'),
  'citation-trace': action('citation-trace', 'scholar', 2_100, 'curious', 'citation-arc', true),
  stretch: action('stretch', 'scholar', 1_450),
  doze: action('doze', 'spirit-pet', 1_800),
  wake: action('wake', 'spirit-pet', 900, 'curious'),
  'surprise-settle': action('surprise-settle', 'spirit-pet', 850, 'curious'),
  'cap-check': action('cap-check', 'spirit-pet', 1_150, 'focused'),
  'ear-perk': action('ear-perk', 'spirit-pet', 850, 'curious'),
  'lamp-listen': action('lamp-listen', 'spirit-pet', 1_500, 'curious'),
  'happy-wiggle': action('happy-wiggle', 'spirit-pet', 1_300, 'success'),
  'thinking-pause': action('thinking-pause', 'spirit-pet', 1_650, 'focused'),
  patrol: action('patrol', 'scholar', 4_200, 'curious', 'star-wake', true),
  'return-dock': action('return-dock', 'scholar', 2_800, 'neutral', 'star-wake', true),
  'pointer-approach': action('pointer-approach', 'spirit-pet', 900, 'curious'),
  'pointer-avoid': action('pointer-avoid', 'spirit-pet', 700, 'curious'),
  drag: action('drag', 'spirit-pet', 1_000, 'focused'),
  'guide-travel': action('guide-travel', 'scholar', 2_400, 'focused', 'star-wake'),
  'guide-arrive': action('guide-arrive', 'scholar', 900, 'curious'),
  'quiet-write': action('quiet-write', 'scholar', 2_000, 'focused'),
  read: action('read', 'scholar', 2_200, 'focused', 'evidence-sequence'),
  compare: action('compare', 'scholar', 2_400, 'focused', 'evidence-sequence'),
  draft: action('draft', 'scholar', 2_300, 'focused', 'citation-arc'),
  'possible-issue': action('possible-issue', 'scholar', 1_800, 'doubt'),
  success: action('success', 'scholar', 1_200, 'success', 'citation-arc'),
  'milestone-dance': action('milestone-dance', 'spirit-pet', 3_200, 'success', 'particles', true),
  'failed-settle': action('failed-settle', 'spirit-pet', 900, 'failed', 'none', false, false),
  'approval-still': action('approval-still', 'scholar', 0, 'focused', 'none', false, false),
};

export const HERMES_MICRO_ACTIONS: readonly HermesActionId[] = [
  'blink-single',
  'blink-double',
  'observe-left',
  'observe-right',
  'evidence-check',
  'page-tidy',
  'stretch',
  'doze',
  'wake',
  'surprise-settle',
  'cap-check',
  'ear-perk',
  'lamp-listen',
  'happy-wiggle',
  'thinking-pause',
];

export const HERMES_SIGNATURE_ACTIONS: readonly HermesActionId[] = [
  'citation-trace',
  'patrol',
  'return-dock',
];

export {
  resolveWankoPerformance,
  type WankoMotionGroup,
  type WankoParameterId,
  type WankoPerformance,
} from './wanko-action-director';
