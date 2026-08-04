import type { AiGateway, SchemaGuard } from '@openscience/ai-gateway';
import { SDF_CORE_FIELDS, SDF_CORE_VERSION } from '@openscience/sdf-schema';

/** 六字段 core 结构（§5.1：schemaVersion + 6 字段，全部 string）。 */
export interface ExtractedCore {
  schemaVersion: string;
  problem: string;
  insight: string;
  method: string;
  results: string;
  limitations: string;
  reproducibility: string;
}

/**
 * SDF core 类型守卫（§9.3 JSON 输出必须经 Schema 校验；对齐 sdf-schema JSON Schema §5.1/§5.3）。
 */
export const sdfCoreGuard: SchemaGuard<ExtractedCore> = (v: unknown): v is ExtractedCore => {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  if (obj.schemaVersion !== SDF_CORE_VERSION) return false; // 对齐 coreSchema const（§5.3）
  for (const field of SDF_CORE_FIELDS) {
    if (typeof obj[field] !== 'string') return false;
  }
  return true;
};

/**
 * SDF Extractor handler（§9.2 + §5.4）：
 * - 从正文提取六字段建议（Gateway 结构化输出 + Schema 校验）
 * - **不写 SDF**（§9.2 禁止直接覆盖正文；建议由用户确认后经前端 updateSdf 落库）
 */
export async function extractHandler(
  gateway: AiGateway,
  task: { payload: Record<string, unknown> },
): Promise<{ core: ExtractedCore }> {
  const manuscriptText = typeof task.payload?.manuscriptText === 'string' ? task.payload.manuscriptText : '';
  if (!manuscriptText.trim()) {
    throw new Error('缺少正文（payload.manuscriptText）');
  }
  const prompt = [
    { role: 'system' as const, content: '你是科研结构化提取器。从用户正文提取 SDF 六字段（problem/insight/method/results/limitations/reproducibility）与 schemaVersion="0.1.0"。只输出 JSON，不要多余文字。' },
    { role: 'user' as const, content: manuscriptText.slice(0, 8000) },
  ];
  const core = await gateway.completeStructured(sdfCoreGuard, prompt, { temperature: 0.2 });
  return { core };
}
