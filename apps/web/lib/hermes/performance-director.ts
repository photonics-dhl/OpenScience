import {
  createInitialHermesBehavior,
  stepHermesBehavior,
  type HermesBehaviorFrame,
  type HermesBehaviorInput,
} from './behavior-director';
import {
  createHermesSpeechState,
  stepHermesSpeech,
  type HermesSpeechState,
} from './performance-beat';

export interface HermesPerformanceState {
  behavior: HermesBehaviorFrame;
  speech: HermesSpeechState;
}

export interface HermesPerformanceInput {
  behaviorInput: HermesBehaviorInput;
  speechAllowed: boolean;
}

export function createHermesPerformanceState(
  behaviorInput: HermesBehaviorInput,
  speechNowMs = behaviorInput.nowMs,
): HermesPerformanceState {
  return {
    behavior: createInitialHermesBehavior(behaviorInput),
    speech: createHermesSpeechState(speechNowMs, behaviorInput.seed),
  };
}

export function stepHermesPerformance(
  previous: HermesPerformanceState,
  input: HermesPerformanceInput,
): HermesPerformanceState {
  const candidate = stepHermesBehavior(previous.behavior, input.behaviorInput);
  const cue = previous.speech.cue;
  const cueOwnsPreviousBeat = cue?.beatId === `${previous.behavior.primary}:${previous.behavior.startedAtMs}`;
  const holdAutonomousBeat = Boolean(
    input.speechAllowed
    && cueOwnsPreviousBeat
    && cue
    && input.behaviorInput.nowMs < cue.visibleUntilMs
    && previous.behavior.kind !== 'priority'
    && candidate.kind !== 'priority',
  );
  const behavior = holdAutonomousBeat ? previous.behavior : candidate;
  const speech = stepHermesSpeech(previous.speech, {
    action: behavior.primary,
    actionStartedAtMs: behavior.startedAtMs,
    allowed: input.speechAllowed,
    nowMs: input.behaviorInput.nowMs,
    seed: input.behaviorInput.seed,
  });
  if (behavior === previous.behavior && speech === previous.speech) return previous;
  return { behavior, speech };
}
