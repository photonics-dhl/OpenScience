import { describe, expect, it } from 'vitest';
import type { AiGateway, Provider } from '@openscience/ai-gateway';
import { aiWarningGuard, reviewAnalyzeHandler, WARNING_CATEGORIES } from '../src/reviewer';
import { createFakePrisma, seedUser } from '@openscience/domain/test-helpers';

const WARNINGS = [
  {
    id: 'w1', category: 'method_logic', evidence: '§方法第 2 段', uncertainty: '无法确认对照组设置',
    suggestion: '补充对照组说明',
  },
];

describe('aiWarningGuard（§11.2 结构化报告 + §9.3 Schema 校验）', () => {
  it('合法警告（evidence + uncertainty 非空）通过', () => {
    expect(aiWarningGuard(WARNINGS)).toBe(true);
    expect(aiWarningGuard([])).toBe(true);
  });

  it('缺 evidence/uncertainty / 非法 category → 拒绝', () => {
    expect(aiWarningGuard([{ ...WARNINGS[0], evidence: '' }])).toBe(false);
    expect(aiWarningGuard([{ ...WARNINGS[0], uncertainty: '' }])).toBe(false);
    expect(aiWarningGuard([{ ...WARNINGS[0], category: 'nope' }])).toBe(false);
    expect(aiWarningGuard('not-array')).toBe(false);
  });

  it('七类枚举完整（§11.2）', () => {
    // 直接消费 WARNING_CATEGORIES（消除重复字面量，防枚举漂移）
    expect(aiWarningGuard(WARNING_CATEGORIES.map((category) => ({ id: 'w', category, evidence: 'e', uncertainty: 'u', suggestion: 's' })))).toBe(true);
    expect(WARNING_CATEGORIES).toHaveLength(7);
  });
});

describe('reviewAnalyzeHandler（§11.2 警告层 + 不阻断）', () => {
  it('调 completeStructured → 写 warnings + 返回 count（不触 status）', async () => {
    const { prisma, db } = createFakePrisma();
    const user = seedUser(db, { id: 'rvw-user' });
    db.researchObjects.push({ id: 'ro-1', workspaceId: 'ws', title: 'R', createdBy: user.id, status: 'draft', visibility: 'private', version: 1, createdAt: new Date(), updatedAt: new Date() });
    const ver = { id: 'v-1', researchObjectId: 'ro-1', commitId: 'c', versionNo: 1, status: 'draft', createdAt: new Date() };
    db.versions.push(ver);

    const provider: Provider = { name: 'mock', complete: async () => ({ text: JSON.stringify(WARNINGS), usage: { inputTokens: 1, outputTokens: 1 }, model: 'mock' }) };
    const gateway = new (await import('@openscience/ai-gateway')).AiGateway({ providers: [provider] }) as AiGateway;
    const deps = { prisma, mailer: {} as never, redis: { lpush: async () => 1 } } as never;

    const result = await reviewAnalyzeHandler(gateway, deps, { payload: { versionId: 'v-1', coreText: '研究正文……' } });
    expect(result.warningCount).toBe(1);
    const review = await prisma.aiReview.findUnique({ where: { versionId: 'v-1' } });
    expect(review!.warnings).toHaveLength(1);
    // 不阻断：status 仍 passed（无 hardBlocks）
    expect(review!.status).toBe('passed');
  });
});
