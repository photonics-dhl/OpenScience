import type { AiGateway, SchemaGuard } from '@openscience/ai-gateway';
import type { AgentDeps } from '@openscience/domain';
import { saveWarnings } from '@openscience/domain';

/** §11.2 七类警告。 */
export const WARNING_CATEGORIES = [
  'method_logic',       // 方法逻辑疑点
  'statistical',        // 统计合理性
  'figure_spec',        // 图表规范
  'data_consistency',   // 数据一致性
  'reproducibility',    // 可复现性不足
  'missing_citation',   // 潜在引用缺失
  'overreach',          // 结论过度外推
] as const;

export interface AiWarning {
  id: string;
  category: (typeof WARNING_CATEGORIES)[number];
  /** §11.2 证据位置（必须）。 */
  evidence: string;
  /** §11.2 不确定性说明（必须，不得只输出单一分数）。 */
  uncertainty: string;
  suggestion: string;
}

/** 结构化报告类型守卫（§9.3 JSON 校验）。 */
export const aiWarningGuard: SchemaGuard<AiWarning[]> = (v: unknown): v is AiWarning[] => {
  if (!Array.isArray(v)) return false;
  return v.every((w) => {
    if (typeof w !== 'object' || w === null) return false;
    const o = w as Record<string, unknown>;
    return (
      (WARNING_CATEGORIES as readonly string[]).includes(o.category as string) &&
      typeof o.evidence === 'string' && o.evidence.length > 0 &&
      typeof o.uncertainty === 'string' && o.uncertainty.length > 0 &&
      typeof o.suggestion === 'string' && o.suggestion.length > 0
    );
  });
};

/**
 * §11.2 警告层分析 handler（§9.2 不裁定对错/不伪造来源——prompt 约束 + 结构化校验）：
 * - 从 core 文本生成七类警告（Gateway 结构化输出 + Schema 校验）
 * - 写 AIReview.warnings（不阻断，§11.2 警告不替代作者判断）
 */
export async function reviewAnalyzeHandler(
  gateway: AiGateway,
  deps: AgentDeps,
  task: { id: string },
): Promise<{ warningCount: number }> {
  const persistedTask = await deps.prisma.agentTask.findUnique({
    where: { id: task.id }, include: { session: true },
  });
  const payload = persistedTask?.payload && typeof persistedTask.payload === 'object' && !Array.isArray(persistedTask.payload)
    ? persistedTask.payload as Record<string, unknown> : {};
  const coreText = typeof payload.coreText === 'string' ? payload.coreText : '';
  const versionId = typeof payload.versionId === 'string' ? payload.versionId : '';
  if (!coreText.trim() || !versionId) {
    throw new Error('缺少 coreText/versionId');
  }
  const version = await deps.prisma.version.findUnique({ where: { id: versionId } });
  if (!persistedTask || persistedTask.kind !== 'review.analyze' || !persistedTask.session?.researchObjectId || !version
    || version.researchObjectId !== persistedTask.session.researchObjectId) {
    throw new Error('review task Version does not belong to its research object');
  }
  const prompt = [
    { role: 'system' as const, content: '你是科研评审助手。基于 SDF core 文本生成结构化警告。只输出 JSON 数组，每项含 category（method_logic/statistical/figure_spec/data_consistency/reproducibility/missing_citation/overreach）、evidence（具体证据位置）、uncertainty（不确定性说明）、suggestion（建议）。只报告疑点，不裁定研究对错，不伪造引用来源。' },
    { role: 'user' as const, content: coreText.slice(0, 8000) },
  ];
  const warnings = await gateway.completeStructured(aiWarningGuard, prompt, { temperature: 0.3 });
  await saveWarnings(deps, { versionId, warnings });
  return { warningCount: warnings.length };
}
