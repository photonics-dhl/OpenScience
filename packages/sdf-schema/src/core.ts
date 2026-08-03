/**
 * SDF core JSON Schema（§5.1 六必填字段）。
 *
 * 技术债务（有意为之，0.2.0 收紧）：additionalProperties 宽容（不设 false）——
 * 0.1.0 结构未定型，避免误伤真实数据（编辑器 draft_meta 等附加键）；可选字段
 * 定型时升级 schemaVersion 并收紧 additionalProperties:false（§5.3 语义化版本）。
 */
export const SDF_CORE_VERSION = '0.1.0';

/** 六必填字段常量（§5.1），供消费方遍历/渲染。 */
export const SDF_CORE_FIELDS = [
  'problem',
  'insight',
  'method',
  'results',
  'limitations',
  'reproducibility',
] as const;

export const coreSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'OpenScience SDF Core',
  type: 'object',
  required: ['schemaVersion', ...SDF_CORE_FIELDS],
  properties: {
    schemaVersion: { const: SDF_CORE_VERSION },
    problem: { type: 'string', minLength: 1 },
    insight: { type: 'string', minLength: 1 },
    method: { type: 'string', minLength: 1 },
    results: { type: 'string', minLength: 1 },
    limitations: { type: 'string', minLength: 1 },
    reproducibility: { type: 'string', minLength: 1 },
  },
  // 债务：宽容未知键（可选字段定型时收紧）
} as const;

/** TS 类型：六必填字段均为非空字符串。 */
export type SdfCore = {
  schemaVersion: typeof SDF_CORE_VERSION;
  problem: string;
  insight: string;
  method: string;
  results: string;
  limitations: string;
  reproducibility: string;
};
