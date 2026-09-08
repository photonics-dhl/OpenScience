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
function invalid(reason: string): never { throw new PresentationAssetError('VALIDATION_ERROR', `animation:${reason}`); }
function record(value: unknown, reason: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid(reason);
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, expected: string[], reason: string) {
  if (Object.keys(value).sort().join(',') !== expected.sort().join(',')) invalid(reason);
}
function unit(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1; }

/** Data only: no executable code, external assets, CSS, or renderer-selected scientific content. */
export function parseSceneAnimation(value: unknown, sceneClaimIds: readonly string[]): SceneAnimation {
  const plan = record(value, 'plan_shape'); keys(plan, ['objects', 'actions'], 'plan_keys');
  if (!Array.isArray(plan.objects) || plan.objects.length < 1 || plan.objects.length > 12) return invalid('object_count');
  if (!Array.isArray(plan.actions) || plan.actions.length < 1 || plan.actions.length > 16) return invalid('action_count');
  const objects = plan.objects.map((raw, index) => {
    const prefix = `object_${index}`;
    const item = record(raw, `${prefix}:shape`);
    keys(item, ['id', 'kind', 'x', 'y', 'width', 'height', 'color', 'sourceClaimIds',
      ...(item.kind === 'label' ? ['label'] : []), ...(['trace', 'arrow'].includes(String(item.kind)) ? ['points'] : [])], `${prefix}:keys`);
    if (typeof item.id !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(item.id)) return invalid(`${prefix}:id`);
    if (!['rect', 'ellipse', 'arrow', 'trace', 'label'].includes(String(item.kind))) return invalid(`${prefix}:kind`);
    if (!['ink', 'blue', 'teal', 'amber', 'muted'].includes(String(item.color))) return invalid(`${prefix}:color`);
    if (!unit(item.x) || !unit(item.y) || !unit(item.width) || item.width === 0 || !unit(item.height) || item.height === 0
      || item.x + item.width > 1 || item.y + item.height > 1) return invalid(`${prefix}:bounds`);
    if (!Array.isArray(item.sourceClaimIds) || item.sourceClaimIds.length < 1 || item.sourceClaimIds.length > 12
      || new Set(item.sourceClaimIds).size !== item.sourceClaimIds.length
      || item.sourceClaimIds.some(id => typeof id !== 'string' || !sceneClaimIds.includes(id))) return invalid(`${prefix}:source_claims`);
    if (item.kind === 'label' && (typeof item.label !== 'string' || !item.label.trim() || item.label.length > 60 || /[\u0000-\u001f]/.test(item.label))) return invalid(`${prefix}:label`);
    if (item.kind === 'trace' || item.kind === 'arrow') {
      if (!Array.isArray(item.points) || item.points.length < 2 || item.points.length > 32
        || (item.kind === 'arrow' && item.points.length !== 2)) return invalid(`${prefix}:points_count`);
      for (const rawPoint of item.points) { const point = record(rawPoint, `${prefix}:point_shape`); keys(point, ['x', 'y'], `${prefix}:point_keys`); if (!unit(point.x) || !unit(point.y)) invalid(`${prefix}:point_bounds`); }
    }
    return item as unknown as AnimationObject;
  });
  const byId = new Map(objects.map(item => [item.id, item]));
  if (byId.size !== objects.length) return invalid('duplicate_object_id');
  const actions = plan.actions.map((raw, index) => {
    const prefix = `action_${index}`;
    const item = record(raw, `${prefix}:shape`); keys(item, ['kind', 'target', 'start', 'end', 'meaning', 'basis', ...(item.kind === 'translate' ? ['toX', 'toY'] : [])], `${prefix}:keys`);
    const target = typeof item.target === 'string' ? byId.get(item.target) : undefined;
    if (!target) return invalid(`${prefix}:target`);
    if (!['enter', 'fade', 'translate', 'pulse', 'draw', 'highlight'].includes(String(item.kind))) return invalid(`${prefix}:kind`);
    if (!unit(item.start) || !unit(item.end) || item.start >= item.end) return invalid(`${prefix}:timing`);
    const basis = record(item.basis, `${prefix}:basis_shape`); keys(basis, ['claimId', 'quote'], `${prefix}:basis_keys`);
    if (typeof item.meaning !== 'string' || !item.meaning.trim() || item.meaning.length > 180 || /[\u0000-\u001f]/.test(item.meaning)
      || typeof basis.claimId !== 'string' || !target.sourceClaimIds.includes(basis.claimId)
      || typeof basis.quote !== 'string' || basis.quote.trim().length < 12 || basis.quote.length > 400) return invalid(`${prefix}:meaning_basis`);
    if (item.kind === 'translate' && (!unit(item.toX) || !unit(item.toY)
      || item.toX + target.width > 1 || item.toY + target.height > 1)) return invalid(`${prefix}:translate_bounds`);
    if (item.kind === 'draw' && !['arrow', 'trace'].includes(target.kind)) return invalid(`${prefix}:draw_target`);
    return item as unknown as AnimationAction;
  });
  if (new Set(actions.map(action => `${action.target}:${action.kind}`)).size !== actions.length) return invalid('duplicate_target_action');
  return { objects, actions };
}

export function requireAnimationSourceSupport(animation: SceneAnimation, claims: readonly { id: string; statement: string }[]): void {
  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
  const byId = new Map(claims.map(claim => [claim.id, normalize(claim.statement)]));
  for (const [index, action] of animation.actions.entries()) {
    if (!byId.get(action.basis.claimId)?.includes(normalize(action.basis.quote))) invalid(`action_${index}:basis_quote_unsupported`);
  }
}
