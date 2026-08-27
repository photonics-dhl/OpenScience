import type { HermesActionId } from './action-catalog';
import type { HermesMotionSample } from './pet-motion';

export type HermesPartId =
  | 'base'
  | 'torso'
  | 'tail'
  | 'forepaws'
  | 'head'
  | 'crown'
  | 'face'
  | 'evidenceNodes';

export interface HermesPartDefinition {
  id: HermesPartId;
  pivot: { x: number; y: number };
}

interface HermesRigidPartPose {
  angle: number;
  x: number;
  y: number;
}

interface HermesFacePose {
  textureMix: number;
}

export interface HermesPartPoses {
  base: HermesRigidPartPose;
  torso: HermesRigidPartPose;
  tail: HermesRigidPartPose;
  forepaws: HermesRigidPartPose;
  head: HermesRigidPartPose;
  crown: HermesRigidPartPose;
  face: HermesFacePose;
  evidenceNodes: HermesRigidPartPose;
}

export const HERMES_PARTS: readonly HermesPartDefinition[] = [
  { id: 'base', pivot: { x: .50, y: .50 } },
  { id: 'torso', pivot: { x: .43, y: .43 } },
  { id: 'tail', pivot: { x: .62, y: .39 } },
  { id: 'forepaws', pivot: { x: .30, y: .35 } },
  { id: 'head', pivot: { x: .34, y: .61 } },
  { id: 'crown', pivot: { x: .35, y: .78 } },
  { id: 'face', pivot: { x: .29, y: .70 } },
  { id: 'evidenceNodes', pivot: { x: .56, y: .42 } },
] as const;

const neutralPose = (): HermesRigidPartPose => ({
  angle: 0,
  x: 0,
  y: 0,
});

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const actionPulse = (progress: number) => {
  const p = clamp01(progress);
  if (p < .2) return Math.sin((p / .2) * Math.PI * .5);
  if (p <= .65) return 1;
  return Math.cos(((p - .65) / .35) * Math.PI * .5);
};

export function createHermesPartPoses(
  sample: HermesMotionSample,
  action: HermesActionId | undefined,
  progress: number,
): HermesPartPoses {
  const poses: HermesPartPoses = {
    base: neutralPose(),
    torso: neutralPose(),
    tail: neutralPose(),
    forepaws: neutralPose(),
    head: neutralPose(),
    crown: neutralPose(),
    face: { textureMix: 0 },
    evidenceNodes: neutralPose(),
  };
  if (sample.still || action === 'approval-still') return poses;

  const pulse = actionPulse(progress);
  const oscillation = Math.sin(clamp01(progress) * Math.PI * 2);
  poses.torso = {
    ...poses.torso,
    angle: sample.torso.angle,
    x: sample.torso.x,
    y: sample.torso.y,
  };
  poses.tail = {
    ...poses.tail,
    angle: sample.tail.angle,
    x: sample.torso.x * .35,
    y: sample.torso.y * .25,
  };
  poses.head = {
    ...poses.head,
    angle: sample.head.angle,
    x: sample.head.x,
    y: sample.head.y,
  };
  poses.crown = {
    ...poses.crown,
    angle: sample.crownAngle + sample.head.angle * .28,
    x: sample.head.x * 1.08,
    y: sample.head.y * 1.08,
  };
  poses.face = {
    textureMix: clamp01(sample.blink),
  };
  poses.forepaws = {
    ...poses.forepaws,
    angle: sample.torso.angle * .6,
    x: sample.torso.x * .8,
    y: sample.torso.y,
  };
  poses.evidenceNodes = {
    ...poses.evidenceNodes,
    angle: sample.torso.angle * .42,
    x: sample.torso.x * .5,
    y: sample.torso.y * .5,
  };

  if (action === 'evidence-check') {
    poses.forepaws.x -= pulse * 3;
    poses.forepaws.angle -= pulse * 5;
    poses.evidenceNodes.y -= pulse * 5.5;
    poses.evidenceNodes.angle += pulse * 9;
  } else if (action === 'read') {
    poses.forepaws.y -= pulse * 2.5;
    poses.forepaws.angle -= pulse * 4;
    poses.evidenceNodes.x += pulse * 3.5;
    poses.evidenceNodes.angle -= pulse * 7;
  } else if (action === 'compare') {
    poses.forepaws.x -= pulse * 4;
    poses.forepaws.angle += pulse * 7;
    poses.evidenceNodes.x += pulse * 6;
    poses.evidenceNodes.angle -= pulse * 11;
  } else if (action === 'quiet-write') {
    poses.forepaws.x += oscillation * 2.5;
    poses.forepaws.y -= pulse * 2;
    poses.forepaws.angle -= pulse * 5.5;
    poses.crown.angle *= .55;
  } else if (action === 'possible-issue') {
    poses.forepaws.x -= pulse * 3.5;
    poses.forepaws.angle += pulse * 6;
    poses.crown.angle -= pulse * 7;
    poses.evidenceNodes.y += pulse * 3;
    poses.evidenceNodes.angle += pulse * 8;
  } else if (action === 'stretch') {
    poses.forepaws.y -= pulse * 9;
    poses.forepaws.angle -= pulse * 9;
    poses.crown.angle -= pulse * 5;
  } else if (action === 'milestone-dance') {
    poses.forepaws.x += oscillation * 5;
    poses.forepaws.y -= pulse * 7;
    poses.forepaws.angle += oscillation * 14;
  } else if (action === 'guide-arrive') {
    poses.forepaws.y -= pulse * 4;
    poses.forepaws.angle -= pulse * 6;
    poses.crown.angle += pulse * 7;
  } else if (action === 'success') {
    poses.forepaws.y -= pulse * 5;
    poses.forepaws.angle -= pulse * 10;
    poses.crown.angle += pulse * 7;
    poses.evidenceNodes.y -= pulse * 6;
    poses.evidenceNodes.angle += oscillation * 12;
  } else if (action === 'page-tidy' || action === 'draft') {
    poses.forepaws.x += oscillation * 3;
    poses.forepaws.angle += oscillation * 8;
  }

  return poses;
}
