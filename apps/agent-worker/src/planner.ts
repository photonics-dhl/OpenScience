import type { AiGateway, SchemaGuard } from '@openscience/ai-gateway';

/**
 * P1E-1：可视化方案结构（§10.1-10.2）。
 * Visualization Planner 子 Agent 输出，供后续 AST 检查与沙箱执行。
 */
export interface VisualizationPlan {
  /** 自然语言解释（概念阐述，§10.2）。 */
  explanation: string;
  /** 数学模型与假设（§10.2）。 */
  modelAssumptions: string;
  /** Python 脚本（仅白名单包：NumPy/SciPy/SymPy/Matplotlib/Pillow，§10.3）。 */
  script: string;
  /** 参数表（用户可调参数，§10.2）。 */
  parameters: Record<string, { value: number | string; description: string }>;
  /** 可视化类型（示意图/定量仿真，§10.2）。 */
  visualizationType: 'schematic' | 'quantitative';
  /** 运行环境依赖（NumPy==1.26.0 等，§10.2）。 */
  dependencies: string[];
}

/**
 * VisualizationPlan 类型守卫（§9.3 JSON 输出必须经 Schema 校验）。
 */
export const visualizationPlanGuard: SchemaGuard<VisualizationPlan> = (v: unknown): v is VisualizationPlan => {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.explanation === 'string' &&
    obj.explanation.length > 0 &&
    typeof obj.modelAssumptions === 'string' &&
    obj.modelAssumptions.length > 0 &&
    typeof obj.script === 'string' &&
    obj.script.length > 0 &&
    typeof obj.parameters === 'object' &&
    obj.parameters !== null &&
    ['schematic', 'quantitative'].includes(obj.visualizationType as string) &&
    Array.isArray(obj.dependencies) &&
    obj.dependencies.every((d) => typeof d === 'string')
  );
};

/**
 * Visualization Planner handler（§9.2 子 Agent 表）：
 * - 从用户概念问题生成可视化方案（解释 + 模型 + 脚本 + 参数）
 * - 禁止直接执行系统命令（§9.2 禁止事项）
 * - 脚本仅允许白名单包（§10.3）
 */
export async function visualizationPlanHandler(
  gateway: AiGateway,
  task: { payload: Record<string, unknown> },
): Promise<{ plan: VisualizationPlan }> {
  const concept = typeof task.payload?.concept === 'string' ? task.payload.concept : '';
  if (!concept.trim()) {
    throw new Error('缺少 concept（payload.concept）');
  }
  const prompt = [
    {
      role: 'system' as const,
      content: `你是科学可视化规划器。用户提出科学概念问题，你生成完整可视化方案：
1. explanation：自然语言解释（200-500 字）
2. modelAssumptions：数学模型与假设（说明物理/数学前提）
3. script：Python 脚本（仅允许 import numpy/scipy/sympy/matplotlib/PIL；禁止 os/subprocess/socket/ctypes/eval/exec/__import__；产出 PNG 到 /tmp/sandbox/output.png）
4. parameters：参数表（JSON 对象，每项含 value 和 description）
5. visualizationType：'schematic'（示意图）或 'quantitative'（定量仿真）
6. dependencies：依赖版本列表（如 ["numpy==1.26.0", "matplotlib==3.8.2"]）

禁止：不得包含 os/subprocess/socket/ctypes/动态安装/任意二进制执行/网络访问。
输出：只输出 JSON，不要任何多余文字。`,
    },
    { role: 'user' as const, content: concept.slice(0, 2000) },
  ];
  const plan = await gateway.completeStructured(visualizationPlanGuard, prompt, { temperature: 0.3 });
  return { plan };
}
