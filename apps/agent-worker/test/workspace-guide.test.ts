import { describe, expect, it, vi } from 'vitest';
import type { AiGateway } from '@openscience/ai-gateway';
import { buildInterestContext } from '@openscience/domain';

import { createHandlers } from '../src/index';
import {
  workspaceGuideHandler,
  workspaceGuideResultGuard,
} from '../src/workspace-guide';

const payload = {
  goal: '帮我整理今天导入的论文',
  locale: 'zh',
  route: 'dashboard',
  target: null,
  context: {
    tasks: [{ id: 'task-1', researchObjectId: 'ro-1', state: 'needs_review' }],
    researchObjects: [{ id: 'ro-1', title: 'Optical memory', status: 'draft' }],
  },
};

const result = {
  summary: '先确认已经提取的证据，再补全研究对象结构。',
  nextSteps: [
    { label: '确认待审核证据', intent: 'open-task', targetId: 'task-1' },
    { label: '继续研究对象', intent: 'open-ro', targetId: 'ro-1' },
  ],
  needsMoreInformation: false,
};
const interestContext = buildInterestContext({
  profile: {
    identities: ['author', 'reviewer'],
    primaryIdentity: 'reviewer',
    disciplines: ['optics'],
    methods: ['spectroscopy'],
    topics: ['ultrafast science'],
    languages: ['zh'],
    profileVersion: 3,
    acceptedSignals: ['open data'],
    rejectedSignals: ['clinical medicine'],
  },
  currentGoal: payload.goal,
});

const CORE_FIELDS = ['problem', 'insight', 'method', 'evidence', 'results', 'limitations', 'reproducibility'] as const;

function trustedDeps(overrides: { taskUserId?: string; researchObjectIds?: string[]; ingestionTaskIds?: string[] } = {}) {
  const userId = overrides.taskUserId ?? 'user-1';
  return {
    prisma: {
      agentTask: { findUnique: vi.fn().mockResolvedValue({ id: 'guide-1', kind: 'workspace.guide', session: { userId } }) },
      ingestionTask: { findMany: vi.fn().mockResolvedValue((overrides.ingestionTaskIds ?? ['task-1']).map((id) => ({ id, state: 'needs_review', batch: { userId, researchObjectId: 'ro-1' } }))) },
      researchObject: { findMany: vi.fn().mockResolvedValue((overrides.researchObjectIds ?? ['ro-1']).map((id) => ({
        id,
        title: 'Optical memory',
        status: 'draft',
        sdfDocument: { coreJson: { problem: 'Existing optical memories lose phase information.', method: 'Interferometric reconstruction.' } },
      }))) },
    },
  };
}

describe('workspace.guide handler', () => {
  it('returns a validated read-only guidance result for a bounded dashboard payload', async () => {
    const gateway = { completeStructured: vi.fn().mockResolvedValue(result) } as unknown as AiGateway;
    const deps = trustedDeps();

    await expect(workspaceGuideHandler(gateway, deps as never, { id: 'guide-1', payload, interestContext })).resolves.toEqual(result);
    expect(gateway.completeStructured).toHaveBeenCalledOnce();
    const messages = (gateway.completeStructured as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as Array<{ role: string; content: string }>;
    const system = messages.find((message) => message.role === 'system')?.content ?? '';
    expect(system).toContain('needsMoreInformation 必须是 boolean');
    expect(system).toContain('每个 nextSteps 项只能包含 label、intent、targetId');
    expect(system).toContain('禁止 title、description');
    expect(system).toContain('open-task 只能使用下列 task id：task-1');
    expect(system).toContain('open-ro 只能使用下列 research object id：ro-1');
    const userMessage = messages.find((message) => message.role === 'user')?.content ?? '';
    expect(userMessage).toContain('Existing optical memories lose phase information.');
    expect(userMessage).toContain('"primaryIdentity":"reviewer"');
    expect(userMessage).toContain('"rejectedSignals":["clinical medicine"]');
    expect(deps.prisma.researchObject.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ sdfDocument: { select: { coreJson: true } } }),
    }));
    expect(deps.prisma.ingestionTask.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        batch: { userId: 'user-1', researchObject: { workspace: { members: { some: { userId: 'user-1' } } } } },
      }),
    }));
  });

  it('rejects empty goals before calling the provider', async () => {
    const gateway = { completeStructured: vi.fn() } as unknown as AiGateway;

    await expect(workspaceGuideHandler(gateway, trustedDeps() as never, { id: 'guide-1', payload: { ...payload, goal: '   ' } })).rejects.toThrow('goal');
    expect(gateway.completeStructured).not.toHaveBeenCalled();
  });

  it('rejects unsupported intents and more than three next steps', () => {
    expect(workspaceGuideResultGuard({
      ...result,
      nextSteps: [{ label: '直接发布', intent: 'publish', targetId: 'ro-1' }],
    })).toBe(false);
    expect(workspaceGuideResultGuard({
      ...result,
      nextSteps: Array.from({ length: 4 }, (_, index) => ({ label: `Step ${index}`, intent: 'start-import' })),
    })).toBe(false);
  });

  it('rejects extra root and step keys even when the documented fields are valid', () => {
    expect(workspaceGuideResultGuard({ ...result, writeCompleted: false })).toBe(false);
    expect(workspaceGuideResultGuard({
      ...result,
      nextSteps: [{ ...result.nextSteps[0], description: '模型不应输出的额外说明' }],
    })).toBe(false);
  });

  it('bounds the complete trusted model context across many research objects', async () => {
    const researchObjects = Array.from({ length: 20 }, (_, index) => ({
      id: `ro-${index}-${'i'.repeat(90)}`,
      title: `Paper ${index} ${'t'.repeat(220)}`,
      status: `draft-${'s'.repeat(50)}`,
      sdfDocument: { coreJson: Object.fromEntries(['problem', 'insight', 'method', 'evidence', 'results', 'limitations', 'reproducibility'].map((field) => [field, `${field}-${index}-${'x'.repeat(1200)}`])) },
    }));
    const gateway = { completeStructured: vi.fn().mockResolvedValue({ ...result, nextSteps: [] }) } as unknown as AiGateway;
    const deps = trustedDeps({ researchObjectIds: researchObjects.map((item) => item.id), ingestionTaskIds: [] });
    deps.prisma.researchObject.findMany.mockResolvedValue(researchObjects);
    const tasks = Array.from({ length: 20 }, (_, index) => ({
      id: `task-${index}-${'k'.repeat(88)}`,
      researchObjectId: researchObjects[index]!.id,
      state: `needs-review-${'q'.repeat(45)}`,
    }));
    deps.prisma.ingestionTask.findMany.mockResolvedValue(tasks.map((task) => ({ ...task, batch: { userId: 'user-1', researchObjectId: task.researchObjectId } })));
    const manyPayload = {
      ...payload,
      goal: 'g'.repeat(2_000),
      context: { tasks, researchObjects: researchObjects.map(({ id, title, status }) => ({ id, title, status })) },
    };

    await workspaceGuideHandler(gateway, deps as never, { id: 'guide-1', payload: manyPayload });
    const messages = (gateway.completeStructured as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as Array<{ role: string; content: string }>;
    const userMessage = messages.find((message) => message.role === 'user')?.content ?? '';
    const totalMessageChars = messages.reduce((sum, message) => sum + message.content.length, 0);
    expect(userMessage.length).toBeLessThanOrEqual(30_000);
    expect(totalMessageChars).toBeLessThanOrEqual(30_000);
    expect(userMessage).toContain('ro-0-');
    expect(userMessage).toContain('ro-19-');
  });

  it('bounds the final JSON-escaped model messages, not only the source text', async () => {
    const escaped = '\\\\'.repeat(1_200);
    const researchObjects = Array.from({ length: 20 }, (_, index) => ({
      id: `ro-${index}`,
      title: `Escaped ${index}`,
      status: 'draft',
      sdfDocument: { coreJson: Object.fromEntries(CORE_FIELDS.map((field) => [field, escaped])) },
    }));
    const gateway = { completeStructured: vi.fn().mockResolvedValue({ ...result, nextSteps: [] }) } as unknown as AiGateway;
    const deps = trustedDeps({ researchObjectIds: researchObjects.map((item) => item.id), ingestionTaskIds: [] });
    deps.prisma.researchObject.findMany.mockResolvedValue(researchObjects);
    const escapedPayload = {
      ...payload,
      goal: '\\\\'.repeat(1_000),
      context: { tasks: [], researchObjects: researchObjects.map(({ id, title, status }) => ({ id, title, status })) },
    };

    await workspaceGuideHandler(gateway, deps as never, { id: 'guide-1', payload: escapedPayload });
    const messages = (gateway.completeStructured as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as Array<{ content: string }>;
    expect(messages.reduce((sum, message) => sum + message.content.length, 0)).toBeLessThanOrEqual(30_000);
  });

  it('rejects navigation targets that are absent from the submitted dashboard context', async () => {
    const gateway = { completeStructured: vi.fn().mockResolvedValue({
      ...result,
      nextSteps: [{ label: 'Open an invented object', intent: 'open-ro', targetId: 'ro-invented' }],
    }) } as unknown as AiGateway;

    await expect(workspaceGuideHandler(gateway, trustedDeps() as never, { id: 'guide-1', payload })).rejects.toThrow('target');
  });

  it('rejects client context that is not owned by the task session user', async () => {
    const gateway = { completeStructured: vi.fn().mockResolvedValue(result) } as unknown as AiGateway;

    await expect(workspaceGuideHandler(
      gateway,
      trustedDeps({ researchObjectIds: [] }) as never,
      { id: 'guide-1', payload },
    )).rejects.toThrow('服务端');
    expect(gateway.completeStructured).not.toHaveBeenCalled();
  });

  it('registers workspace.guide instead of falling through to demo.echo', async () => {
    const gateway = { completeStructured: vi.fn().mockResolvedValue(result) } as unknown as AiGateway;
    const handlers = createHandlers(gateway);

    await expect(handlers['workspace.guide']!(trustedDeps() as never, { id: 'guide-1', payload })).resolves.toEqual(result);
    expect(gateway.completeStructured).toHaveBeenCalledOnce();
  });
});
