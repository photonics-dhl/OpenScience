import { diffSdfCore, type Operation } from '@openscience/versioning';
import type { DiffChange } from './types';

/** SDF 字段 diff（§7.3 + §7.2.5）：RFC 6902 patch 序列 → sdf_field changes。 */
export function diffSdfFields(path: string, before: Record<string, unknown>, after: Record<string, unknown>): DiffChange[] {
  const patch: Operation[] = diffSdfCore(before, after);
  return patch.map((op) => ({
    type: 'sdf_field',
    path: op.path,
    kind: op.op === 'remove' ? 'removed' : op.op === 'add' ? 'added' : 'modified',
    before: op.op === 'remove' ? getAt(before, op.path) : getAt(before, op.path),
    after: 'value' in op ? op.value : undefined,
    patchOp: op,
  }));
}

/** RFC 6902 path（/a/b）取值。 */
function getAt(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.replace(/^\//, '').split('/').filter(Boolean);
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur && typeof cur === 'object') cur = (cur as Record<string, unknown>)[part];
    else return undefined;
  }
  return cur;
}

/** 结论变化摘要（§7.3）：results/limitations 字段变化 → conclusion change。 */
export function diffConclusion(path: string, before: Record<string, unknown>, after: Record<string, unknown>): DiffChange[] {
  const beforeResults = before['results'] as string | undefined;
  const afterResults = after['results'] as string | undefined;
  const beforeLimits = before['limitations'] as string | undefined;
  const afterLimits = after['limitations'] as string | undefined;
  if (beforeResults === afterResults && beforeLimits === afterLimits) return [];
  return [{
    type: 'conclusion',
    path,
    kind: 'modified',
    before: { results: beforeResults, limitations: beforeLimits },
    after: { results: afterResults, limitations: afterLimits },
  }];
}
