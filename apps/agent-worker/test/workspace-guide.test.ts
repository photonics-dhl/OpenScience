import { describe, expect, it, vi } from 'vitest';
import type { AiGateway } from '@openscience/ai-gateway';
import { buildInterestContext } from '@openscience/domain';
import { fixture as firstImageFixture } from '../../../packages/domain/test/agent/first-image-continuation-fixture';

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

function trustedDeps(overrides: { taskUserId?: string; researchObjectIds?: string[]; ingestionTaskIds?: string[]; sessionResearchObjectId?: string } = {}) {
  const userId = overrides.taskUserId ?? 'user-1';
  return {
    prisma: {
      agentTask: { findUnique: vi.fn().mockResolvedValue({ id: 'guide-1', kind: 'workspace.guide', session: {
        userId, ...(overrides.sessionResearchObjectId ? { researchObjectId: overrides.sessionResearchObjectId } : {}),
      } }),
        findMany: vi.fn().mockResolvedValue([]) },
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
  it('starts the bounded native continuation without a guide routing model and replays its original run', async () => {
    const f = firstImageFixture();
    const gateway = { completeStructured: vi.fn() } as unknown as AiGateway;
    const current = { id: f.input.guideTaskId, executionAttempt: f.input.executionAttempt, payload: f.input.payload };
    const response = await workspaceGuideHandler(gateway, f.deps, current);
    expect(response).toMatchObject({ firstImageRun: { runId: f.db.hermesResearchRuns[0].id }, nextSteps: [], needsMoreInformation: false });
    expect(response).not.toHaveProperty('presentationDraft');
    expect(gateway.completeStructured).not.toHaveBeenCalled();
    const ledger = structuredClone(f.db.usageLedger);
    expect(await workspaceGuideHandler(gateway, f.deps, current)).toEqual(response);
    expect(f.db.usageLedger).toEqual(ledger);
    expect(f.db.agentTasks.filter(task => task.kind === 'presentation.generate')).toHaveLength(1);
  });
  it('does not accept a model-provided first-image run as execution authority', () => {
    expect(workspaceGuideResultGuard({ ...result, firstImageRun: {
      runId: '10000000-0000-4000-8000-000000000001', versionId: '10000000-0000-4000-8000-000000000002',
    } })).toBe(false);
  });
  it('does not fall back to a routing model when current execution authority is missing', async () => {
    const gateway = { completeStructured: vi.fn() } as unknown as AiGateway;
    const marked = { ...payload, goal: 'Generate one image explaining this paper.', route: 'research-object-edit', executionIntent: 'first-image',
      context: { tasks: [], researchObjects: [], presentation: { researchObjectId: 'ro-1', versionId: 'version-1' } } };
    await expect(workspaceGuideHandler(gateway, trustedDeps() as never, { id: 'guide-1', payload: marked })).rejects.toThrow('Current first-image execution');
    expect(gateway.completeStructured).not.toHaveBeenCalled();
  });
  const runSource = '30000000-0000-4000-8000-000000000001';
  const runGoal = '请理解整篇论文，制作有自然旁白的讲解视频。';
  const runPayload = { ...payload, goal: runGoal, route: 'research-object-edit', context: {
    ...payload.context, tasks: [{ id: runSource, researchObjectId: 'ro-1', state: 'needs_review' }],
    researchRunSource: { ingestionTaskId: runSource },
  } };
  const runDraft = { researchObjectId: 'ro-1', ingestionTaskId: runSource, locale: 'zh', style: 'auto', instruction: runGoal };
  const runResult = { summary: '已准备制作参数。', nextSteps: [], needsMoreInformation: false, researchRunDraft: runDraft };
  function runGateway(answer: unknown) {
    return { completeStructured: vi.fn().mockImplementation((guard: (value: unknown) => boolean) => {
      if (!guard(answer)) throw new Error('test guide response rejected by actual boundary');
      return answer;
    }) } as unknown as AiGateway;
  }

  function currentVersionDeps(plans: unknown[] = []) {
    const deps = trustedDeps({ sessionResearchObjectId: 'ro-1', ingestionTaskIds: [runSource] });
    return { ...deps, prisma: { ...deps.prisma,
      agentTask: { ...deps.prisma.agentTask, findFirst: vi.fn().mockResolvedValue(null) },
      version: { findFirst: vi.fn().mockResolvedValue({ id: 'version-1', researchObjectId: 'ro-1', manifest: { coreJson: { method: 'Saved reviewed mechanism.' } } }) },
      presentationAsset: { findMany: vi.fn().mockResolvedValue(plans) },
    } };
  }
  const currentVersionPayload = { ...runPayload, context: { ...runPayload.context,
    presentation: { researchObjectId: 'ro-1', versionId: 'version-1' },
  } };
  function savedPlan(output: 'image' | 'video', status: 'draft' | 'approved' = 'approved') {
    const claimId = '40000000-0000-4000-8000-000000000001';
    return { id: `${output}-plan`, kind: 'interactive_html', status, updatedAt: new Date('2026-10-01'),
      sourceClaims: [{ claimId, claim: { extractionStatus: 'succeeded' } }],
      provenance: { subtype: 'sourced_storyboard', storyboardSettings: { locale: 'zh', style: 'auto', instruction: 'Explain.', output },
        storyboardDocument: { schemaVersion: 1, title: 'Saved plan', scenes: Array.from({ length: 3 }, () => ({
          title: 'Scene', narration: 'Saved finding.', visualAction: 'Show the saved relation.', sourceClaimIds: [claimId],
          ...(output === 'video' ? { durationSeconds: 8 } : {}),
        })) } },
    };
  }

  it.each(['zh', 'en'] as const)('keeps current-version video planning separate from a whole-paper run in %s', async locale => {
    const goal = locale === 'zh'
      ? '基于当前已审版本只规划中文视频与自然旁白，不重新分析全文，不生成图片或视频。'
      : 'Only plan a narrated video from this reviewed version; do not reanalyse the whole paper or render images or video.';
    const answer = { summary: 'Video plan parameters prepared.', nextSteps: [], needsMoreInformation: false,
      presentationDraft: { action: 'video.create', instruction: goal, researchObjectId: 'ro-1', versionId: 'version-1' } };
    const gateway = runGateway(answer);
    const deps = currentVersionDeps([savedPlan('image')]);
    const actual = await workspaceGuideHandler(gateway, deps as never, { id: 'guide-1', payload: { ...currentVersionPayload, goal, locale } });
    expect(actual).toEqual(answer);
    expect(actual).not.toHaveProperty('researchRunDraft');
    expect(gateway.completeStructured).toHaveBeenCalledOnce();
    expect(deps.prisma.version.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { researchObjectId: 'ro-1', id: 'version-1' } }));
    const messages = (gateway.completeStructured as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Array<{ role: string; content: string }>;
    const sent = JSON.parse(messages.find(message => message.role === 'user')!.content);
    expect(sent.context.presentationContext).toMatchObject({ researchObjectId: 'ro-1', versionId: 'version-1', core: { method: 'Saved reviewed mechanism.' } });
    expect(sent.context.presentationContext.planState).toEqual([expect.objectContaining({ id: 'image-plan', output: 'image', status: 'approved' })]);
    const system = messages.find(message => message.role === 'system')!.content;
    expect(system).toContain(locale === 'zh' ? '当前已审版本的视频规划' : 'video planning from the current reviewed version');
  });

  it.each(['draft', 'approved'] as const)('keeps %s video plan context and unchanged execution suggestions on the guide contract', async status => {
    const answer = { summary: 'Use the qualified video plan.', nextSteps: [], needsMoreInformation: false,
      presentationDraft: { action: 'video.create', instruction: '', researchObjectId: 'ro-1', versionId: 'version-1' } };
    const gateway = runGateway(answer);
    const actual = await workspaceGuideHandler(gateway, currentVersionDeps([savedPlan('video', status)]) as never,
      { id: 'guide-1', payload: { ...currentVersionPayload, goal: 'Generate the qualified video unchanged.' } });
    expect(actual).toEqual(answer);
    const messages = (gateway.completeStructured as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Array<{ role: string; content: string }>;
    expect(JSON.parse(messages.find(message => message.role === 'user')!.content).context.presentationContext.planState)
      .toEqual([expect.objectContaining({ id: 'video-plan', output: 'video', status })]);
  });

  it.each([
    '视频规划有什么用？先别规划或生成。',
    'Do not plan or generate a video. Explain the available options.',
  ])('does not add an action to a consultation or negated response: %s', async goal => {
    const answer = { summary: 'You can discuss the available options.', nextSteps: [], needsMoreInformation: false };
    const deps = currentVersionDeps();
    deps.prisma.agentTask.findMany.mockResolvedValue([{ payload: { goal: runGoal }, result: { summary: 'Prepare a whole-paper video.' } }]);
    const actual = await workspaceGuideHandler(runGateway(answer), deps as never,
      { id: 'guide-1', payload: { ...currentVersionPayload, goal } });
    expect(actual).toEqual(answer);
    expect(actual).not.toHaveProperty('presentationDraft');
    expect(actual).not.toHaveProperty('researchRunDraft');
  });

  it('still allows an explicitly requested whole-paper video with a current version present', async () => {
    const answer = { ...runResult, researchRunDraft: { ...runDraft, output: 'video' } };
    await expect(workspaceGuideHandler(runGateway(answer), currentVersionDeps() as never,
      { id: 'guide-1', payload: currentVersionPayload })).resolves.toEqual(answer);
  });

  it.each([{ versionId: 'other-version' }, { researchObjectId: 'other-ro' }, { instruction: 'x'.repeat(1001) }])('rejects changed presentation scope or oversized video instructions %j', async altered => {
    const answer = { summary: 'Prepare video.', nextSteps: [], needsMoreInformation: false,
      presentationDraft: { action: 'video.create', instruction: 'Plan only.', researchObjectId: 'ro-1', versionId: 'version-1', ...altered } };
    await expect(workspaceGuideHandler(runGateway(answer), currentVersionDeps() as never,
      { id: 'guide-1', payload: { ...currentVersionPayload, goal: 'Plan video only.' } })).rejects.toThrow('actual boundary');
  });

  it.each(['zh', 'en'] as const)('preserves the explicit video production intent through the %s guide boundary and normalization', async locale => {
    const goal = locale === 'zh' ? runGoal : 'Understand this paper and make a narrated explanatory video.';
    const answer = { ...runResult, researchRunDraft: { ...runDraft, locale, instruction: goal, output: 'video' } };
    const gateway = runGateway(answer);
    const deps = trustedDeps({ sessionResearchObjectId: 'ro-1', ingestionTaskIds: [runSource] });
    const actual = await workspaceGuideHandler(gateway, deps as never, { id: 'guide-1', payload: { ...runPayload, locale, goal } });
    expect(actual).toEqual(answer);
    expect(gateway.completeStructured).toHaveBeenCalledOnce();
    const messages = (gateway.completeStructured as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Array<{ role: string; content: string }>;
    expect(JSON.parse(messages.find(message => message.role === 'user')!.content).context.researchRunContext).toMatchObject({
      researchObjectId: 'ro-1', ingestionTaskId: runSource, profile: 'visual-narrative-v1', maxAgentTasks: 9,
    });
  });

  it('keeps the legacy illustration draft without adding an output or changing the initial grant', async () => {
    const goal = '请理解整篇论文，制作六维内容和完整图解。';
    const answer = { ...runResult, researchRunDraft: { ...runDraft, instruction: goal } };
    const gateway = runGateway(answer);
    const deps = trustedDeps({ sessionResearchObjectId: 'ro-1', ingestionTaskIds: [runSource] });
    const actual = await workspaceGuideHandler(gateway, deps as never, { id: 'guide-1', payload: { ...runPayload, goal } });
    expect(actual).toEqual(answer);
    expect(Object.hasOwn(actual.researchRunDraft!, 'output')).toBe(false);
  });

  it('does not guess the video source when the existing source selector must choose between PDFs', async () => {
    const secondSource = '30000000-0000-4000-8000-000000000002';
    const { ingestionTaskId: _selected, ...withoutSource } = runDraft; void _selected;
    const answer = { ...runResult, researchRunDraft: { ...withoutSource, output: 'video' } };
    const deps = trustedDeps({ sessionResearchObjectId: 'ro-1', ingestionTaskIds: [runSource, secondSource] });
    const actual = await workspaceGuideHandler(runGateway(answer), deps as never, { id: 'guide-1', payload: {
      ...runPayload, context: { researchObjects: payload.context.researchObjects,
        tasks: [runSource, secondSource].map(id => ({ id, researchObjectId: 'ro-1', state: 'needs_review' })) },
    } });
    expect(actual).toEqual(answer);
    expect(Object.hasOwn(actual.researchRunDraft!, 'ingestionTaskId')).toBe(false);
  });

  it.each(['image', 'audio', null, 1])('rejects unsupported explicit research output %s without changing the documented draft shape', output => {
    expect(workspaceGuideResultGuard({ ...runResult, researchRunDraft: { ...runDraft, output } })).toBe(false);
  });

  it('rejects a video draft that changes the authorized paper or original instruction', async () => {
    for (const altered of [{ researchObjectId: 'other-ro' }, { ingestionTaskId: 'other-source' }, { instruction: 'A different paid task' }]) {
      const deps = trustedDeps({ sessionResearchObjectId: 'ro-1', ingestionTaskIds: [runSource] });
      await expect(workspaceGuideHandler(runGateway({ ...runResult, researchRunDraft: { ...runDraft, output: 'video', ...altered } }),
        deps as never, { id: 'guide-1', payload: runPayload })).rejects.toThrow('actual boundary');
    }
  });

  it.each(['sdf-method', 'sdf-evidence'])('passes selected passage %s through to the model', async target => {
    const gateway = { completeStructured: vi.fn().mockResolvedValue(result) } as unknown as AiGateway;
    await workspaceGuideHandler(gateway, trustedDeps() as never, { id: 'guide-1', payload: { ...payload, route: 'research-object-edit', target, goal: 'Explain this passage' } });
    const messages = (gateway.completeStructured as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as Array<{ role: string; content: string }>;
    const sent = JSON.parse(messages.find(message => message.role === 'user')!.content);
    expect(sent.target).toBe(target);
    expect(messages.find(message => message.role === 'system')!.content).toContain('sdf-evidence');
    expect(sent.context.researchObjects[0].id).toBe('ro-1');
  });

  it('returns a validated read-only guidance result for a bounded dashboard payload', async () => {
    const gateway = { completeStructured: vi.fn().mockResolvedValue(result) } as unknown as AiGateway;
    const deps = trustedDeps();

    await expect(workspaceGuideHandler(gateway, deps as never, { id: 'guide-1', payload, interestContext })).resolves.toEqual(result);
    expect(gateway.completeStructured).toHaveBeenCalledOnce();
    const messages = (gateway.completeStructured as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as Array<{ role: string; content: string }>;
    const system = messages.find((message) => message.role === 'system')?.content ?? '';
    expect(system).toContain('needsMoreInformation（boolean）');
    expect(system).toContain('每项只能包含 label、intent、targetId');
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
        batch: expect.objectContaining({ userId: 'user-1', researchObject: expect.objectContaining({
          workspace: { members: { some: { userId: 'user-1' } } },
        }) }),
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
      id: `ro-${index}-${'i'.repeat(30)}`,
      title: `Paper ${index} ${'t'.repeat(80)}`,
      status: `draft-${'s'.repeat(20)}`,
      sdfDocument: { coreJson: Object.fromEntries(['problem', 'insight', 'method', 'evidence', 'results', 'limitations', 'reproducibility'].map((field) => [field, `${field}-${index}-${'x'.repeat(1200)}`])) },
    }));
    const gateway = { completeStructured: vi.fn().mockResolvedValue({ ...result, nextSteps: [] }) } as unknown as AiGateway;
    const deps = trustedDeps({ researchObjectIds: researchObjects.map((item) => item.id), ingestionTaskIds: [] });
    deps.prisma.researchObject.findMany.mockResolvedValue(researchObjects);
    const tasks = Array.from({ length: 20 }, (_, index) => ({
      id: `task-${index}-${'k'.repeat(30)}`,
      researchObjectId: researchObjects[index]!.id,
      state: `needs-review-${'q'.repeat(20)}`,
    }));
    deps.prisma.ingestionTask.findMany.mockResolvedValue(tasks.map((task) => ({ ...task, batch: { userId: 'user-1', researchObjectId: task.researchObjectId } })));
    const manyPayload = {
      ...payload,
      goal: 'g'.repeat(500),
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

  it('authorizes a presentation-only context through the session research object', async () => {
    const gateway = { completeStructured: vi.fn().mockResolvedValue({ ...result, nextSteps: [] }) } as unknown as AiGateway;
    const deps = trustedDeps({ ingestionTaskIds: [] });
    deps.prisma.agentTask.findUnique.mockResolvedValue({
      id: 'guide-1', kind: 'workspace.guide', session: { userId: 'user-1', researchObjectId: 'ro-1' },
    });
    deps.prisma.agentTask.findFirst = vi.fn().mockResolvedValue(null);
    deps.prisma.version = {
      findFirst: vi.fn().mockResolvedValue({ id: 'version-1', researchObjectId: 'ro-1', manifest: { coreJson: null } }),
    };
    deps.prisma.presentationAsset = { findMany: vi.fn().mockResolvedValue([]) };
    const presentationOnly = {
      ...payload,
      route: 'research-object-edit' as const,
      context: {
        tasks: [],
        researchObjects: [],
        presentation: { researchObjectId: 'ro-1', versionId: 'version-1' },
      },
    };

    await expect(workspaceGuideHandler(gateway, deps as never, { id: 'guide-1', payload: presentationOnly })).resolves.toEqual({ ...result, nextSteps: [] });
    expect(gateway.completeStructured).toHaveBeenCalledOnce();
    const messages = (gateway.completeStructured as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as Array<{ role: string; content: string }>;
    expect(messages.find((message) => message.role === 'user')?.content).toContain('Optical memory');
  });

  it('registers workspace.guide instead of falling through to demo.echo', async () => {
    const gateway = { completeStructured: vi.fn().mockResolvedValue(result) } as unknown as AiGateway;
    const handlers = createHandlers(gateway);

    await expect(handlers['workspace.guide']!(trustedDeps() as never, { id: 'guide-1', payload })).resolves.toEqual(result);
    expect(gateway.completeStructured).toHaveBeenCalledOnce();
  });
});
