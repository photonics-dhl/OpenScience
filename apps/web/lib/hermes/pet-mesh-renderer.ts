import type { HermesActionId } from './action-catalog';
import type { HermesMotionSample, HermesPetVisualState } from './pet-motion';

export { createWankoRendererController } from './wanko-renderer-controller';
export { createWankoLive2DRenderer } from './wanko-live2d-renderer';
export { HermesPetRendererError } from './hermes-renderer-error';
export {
  getWankoModelPlacement,
  resolveWankoPresentationVariant,
  setWankoNativePresentation,
} from './wanko-model-presentation';

export interface HermesPetMeshInput {
  action?: HermesActionId;
  actionStartedAtMs?: number;
  engaged: boolean;
  motionTimeMs?: number;
  pointer: { x: number; y: number };
  state: HermesPetVisualState;
}

export interface HermesPetMeshSnapshot {
  drawnAt: number;
  firstFrame: boolean;
  gesture: HermesMotionSample['gesture'];
  headAngle: number;
  status: 'ready' | 'disposed';
  tailAngle: number;
  torsoScale: number;
}

export interface HermesPetMeshRenderer {
  dispose(): void;
  resize(): void;
  setSuspended(suspended: boolean): void;
  wake(): void;
}
