import { describe, it, expect, vi } from 'vitest';
import { visualizationPlanHandler, visualizationPlanGuard } from '../src/planner';
import type { AiGateway } from '@openscience/ai-gateway';

describe('P1E-1: Visualization Planner', () => {
  describe('visualizationPlanGuard', () => {
    it('接受合法的可视化方案', () => {
      const plan = {
        explanation: '电磁波干涉是指...',
        modelAssumptions: '假设平面波...',
        script: 'import numpy as np\nimport matplotlib.pyplot as plt\n...',
        parameters: { wavelength: { value: 500, description: '波长(nm)' } },
        visualizationType: 'quantitative',
        dependencies: ['numpy==1.26.0', 'matplotlib==3.8.2'],
      };
      expect(visualizationPlanGuard(plan)).toBe(true);
    });

    it('拒绝缺少字段的方案', () => {
      const plan = {
        explanation: '电磁波干涉...',
        // 缺少 modelAssumptions
        script: 'import numpy',
        parameters: {},
        visualizationType: 'schematic',
        dependencies: [],
      };
      expect(visualizationPlanGuard(plan)).toBe(false);
    });

    it('拒绝 visualizationType 非法值', () => {
      const plan = {
        explanation: 'test',
        modelAssumptions: 'test',
        script: 'test',
        parameters: {},
        visualizationType: 'invalid',
        dependencies: [],
      };
      expect(visualizationPlanGuard(plan)).toBe(false);
    });

    it('拒绝空 explanation', () => {
      const plan = {
        explanation: '',
        modelAssumptions: 'test',
        script: 'test',
        parameters: {},
        visualizationType: 'schematic',
        dependencies: [],
      };
      expect(visualizationPlanGuard(plan)).toBe(false);
    });
  });

  describe('visualizationPlanHandler', () => {
    it('生成结构化可视化方案', async () => {
      const mockGateway: Partial<AiGateway> = {
        completeStructured: vi.fn().mockResolvedValue({
          explanation: '电磁波干涉是两束相干光波叠加产生明暗条纹的现象...',
          modelAssumptions: '假设平面波、单色光、无衍射效应...',
          script: 'import numpy as np\nimport matplotlib.pyplot as plt\n# 生成干涉图样\nplt.savefig("/output/output.png")',
          parameters: {
            wavelength: { value: 500, description: '波长(nm)' },
            distance: { value: 1.0, description: '屏距(m)' },
          },
          visualizationType: 'quantitative',
          dependencies: ['numpy==1.26.0', 'matplotlib==3.8.2'],
        }),
      };

      const result = await visualizationPlanHandler(mockGateway as AiGateway, {
        payload: { concept: '电磁波干涉' },
      });

      expect(result.plan.script).toContain('import numpy');
      expect(result.plan.visualizationType).toBe('quantitative');
      expect(result.plan.parameters.wavelength).toBeDefined();
      expect(result.plan.dependencies).toContain('numpy==1.26.0');
    });

    it('拒绝空 concept', async () => {
      const mockGateway: Partial<AiGateway> = {
        completeStructured: vi.fn(),
      };

      await expect(
        visualizationPlanHandler(mockGateway as AiGateway, {
          payload: {},
        }),
      ).rejects.toThrow('缺少 concept');
    });

    it('concept 过长时截断到 2000 字符', async () => {
      const mockGateway: Partial<AiGateway> = {
        completeStructured: vi.fn().mockResolvedValue({
          explanation: 'test',
          modelAssumptions: 'test',
          script: 'import numpy',
          parameters: {},
          visualizationType: 'schematic',
          dependencies: [],
        }),
      };

      const longConcept = 'x'.repeat(3000);
      await visualizationPlanHandler(mockGateway as AiGateway, {
        payload: { concept: longConcept },
      });

      const callArgs = (mockGateway.completeStructured as ReturnType<typeof vi.fn>).mock.calls[0];
      const userMessage = callArgs[1][1]; // messages[1] 是 user 消息
      expect(userMessage.content.length).toBe(2000);
    });
  });
});
