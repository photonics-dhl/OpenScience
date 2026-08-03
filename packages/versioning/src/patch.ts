import { applyPatch, compare, type Operation } from 'fast-json-patch';

export type { Operation };

/** RFC 6902 op 白名单（§7.2.5 JSON Patch）。 */
const ALLOWED_OPS = new Set(['add', 'remove', 'replace', 'move', 'copy', 'test']);

/**
 * 对 SDF core 应用 RFC 6902 patch（§7.2.5），返回新对象。
 * - 只接受纯 JSON 值（SdfCore 六字段字符串，§5.1）
 * - 失败抛错（非法 op/path）
 */
export function applySdfPatch(core: Record<string, unknown>, patch: Operation[]): Record<string, unknown> {
  validatePatch(patch);
  const result = applyPatch(structuredClone(core), patch);
  return result.newDocument as Record<string, unknown>;
}

/**
 * 对比两个 SDF core，生成 RFC 6902 patch（用于 commit 前计算 diff）。
 * 相同对象 → 空 patch（[]）。
 */
export function diffSdfCore(before: Record<string, unknown>, after: Record<string, unknown>): Operation[] {
  return compare(before, after);
}

/** 校验 patch 合法：op 白名单 + path 以 / 开头（RFC 6902）。非法抛错。 */
export function validatePatch(patch: Operation[]): void {
  for (const op of patch) {
    if (!ALLOWED_OPS.has(op.op)) {
      throw new Error(`非法 JSON Patch op: ${String((op as { op?: string }).op)}`);
    }
    if (typeof op.path !== 'string' || !op.path.startsWith('/')) {
      throw new Error(`非法 JSON Patch path: ${String((op as { path?: unknown }).path)}`);
    }
  }
}
