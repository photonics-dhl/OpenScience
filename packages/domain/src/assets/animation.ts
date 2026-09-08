import { PresentationAssetError } from './errors';

export interface AnimationObject {
  id: string; kind: 'rect' | 'ellipse' | 'arrow' | 'trace' | 'label';
  x: number; y: number; width: number; height: number;
  color: 'ink' | 'blue' | 'teal' | 'amber' | 'muted';
  sourceClaimIds: string[]; label?: string; points?: Array<{ x: number; y: number }>;
}
export interface AnimationAction {
  kind: 'enter' | 'fade' | 'translate' | 'pulse' | 'draw' | 'highlight';
  target: string; start: number; end: number; toX?: number; toY?: number;
  meaning: string; basis: { claimId: string; quote: string };
}
export interface SceneAnimation { objects: AnimationObject[]; actions: AnimationAction[] }
function invalid(): never { throw new PresentationAssetError('VALIDATION_ERROR', 'Animation plan is invalid or exceeds supported bounds'); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, expected: string[]) {
  if (Object.keys(value).sort().join(',') !== expected.sort().join(',')) invalid();
}
function unit(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1; }

/** Data only: no executable code, external assets, CSS, or renderer-selected scientific content. */
export function parseSceneAnimation(value: unknown, sceneClaimIds: readonly string[]): SceneAnimation {
  const plan = record(value); keys(plan, ['objects', 'actions']);
  if (!Array.isArray(plan.objects) || plan.objects.length < 1 || plan.objects.length > 12
    || !Array.isArray(plan.actions) || plan.actions.length < 1 || plan.actions.length > 16) return invalid();
  const objects = plan.objects.map(raw => {
    const item = record(raw);
    keys(item, ['id', 'kind', 'x', 'y', 'width', 'height', 'color', 'sourceClaimIds',
      ...(item.kind === 'label' ? ['label'] : []), ...(['trace', 'arrow'].includes(String(item.kind)) ? ['points'] : [])]);
    if (typeof item.id !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(item.id)
      || !['rect', 'ellipse', 'arrow', 'trace', 'label'].includes(String(item.kind))
      || !['ink', 'blue', 'teal', 'amber', 'muted'].includes(String(item.color))
      || !unit(item.x) || !unit(item.y) || !unit(item.width) || item.width === 0 || !unit(item.height) || item.height === 0
      || item.x + item.width > 1 || item.y + item.height > 1
      || !Array.isArray(item.sourceClaimIds) || item.sourceClaimIds.length < 1 || item.sourceClaimIds.length > 12
      || new Set(item.sourceClaimIds).size !== item.sourceClaimIds.length
      || item.sourceClaimIds.some(id => typeof id !== 'string' || !sceneClaimIds.includes(id))) return invalid();
    if (item.kind === 'label' && (typeof item.label !== 'string' || !item.label.trim() || item.label.length > 60 || /[\u0000-\u001f]/.test(item.label))) return invalid();
    if (item.kind === 'trace' || item.kind === 'arrow') {
      if (!Array.isArray(item.points) || item.points.length < 2 || item.points.length > 32) return invalid();
      if (item.kind === 'arrow' && item.points.length !== 2) return invalid();
      for (const rawPoint of item.points) { const point = record(rawPoint); keys(point, ['x', 'y']); if (!unit(point.x) || !unit(point.y)) invalid(); }
    }
    return item as unknown as AnimationObject;
  });
  const byId = new Map(objects.map(item => [item.id, item]));
  if (byId.size !== objects.length) return invalid();
  const actions = plan.actions.map(raw => {
    const item = record(raw); keys(item, ['kind', 'target', 'start', 'end', 'meaning', 'basis', ...(item.kind === 'translate' ? ['toX', 'toY'] : [])]);
    const target = typeof item.target === 'string' ? byId.get(item.target) : undefined;
    if (!target || !['enter', 'fade', 'translate', 'pulse', 'draw', 'highlight'].includes(String(item.kind))
      || !unit(item.start) || !unit(item.end) || item.start >= item.end) return invalid();
    const basis = record(item.basis); keys(basis, ['claimId', 'quote']);
    if (typeof item.meaning !== 'string' || !item.meaning.trim() || item.meaning.length > 180 || /[\u0000-\u001f]/.test(item.meaning)
      || typeof basis.claimId !== 'string' || !target.sourceClaimIds.includes(basis.claimId)
      || typeof basis.quote !== 'string' || basis.quote.trim().length < 12 || basis.quote.length > 400) return invalid();
    if (item.kind === 'translate' && (!unit(item.toX) || !unit(item.toY)
      || item.toX + target.width > 1 || item.toY + target.height > 1)) return invalid();
    if (item.kind === 'draw' && !['arrow', 'trace'].includes(target.kind)) return invalid();
    return item as unknown as AnimationAction;
  });
  if (new Set(actions.map(action => `${action.target}:${action.kind}`)).size !== actions.length
    || !actions.some(action => ['translate', 'pulse', 'draw'].includes(action.kind) && byId.get(action.target)!.kind !== 'label')) return invalid();
  return { objects, actions };
}

export function requireAnimationSourceSupport(animation: SceneAnimation, claims: readonly { id: string; statement: string }[]): void {
  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
  const byId = new Map(claims.map(claim => [claim.id, normalize(claim.statement)]));
  for (const action of animation.actions) {
    if (!byId.get(action.basis.claimId)?.includes(normalize(action.basis.quote))) invalid();
  }
}
