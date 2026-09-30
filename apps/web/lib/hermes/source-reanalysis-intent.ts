import { z } from 'zod';
import { ApiClientError, createHermesResearchRun, getCurrentUser, getExistingHermesResearchRun,
  reanalyzeHermesRunSource, type HermesResearchRun } from '@/lib/api';

const generationSchema = z.object({ profile: z.literal('visual-narrative-v1'), maxAgentTasks: z.literal(9),
  locale: z.enum(['zh', 'en']), style: z.string().min(1).max(100), instruction: z.string().min(1).max(1000) }).strict();
const intentSchema = z.object({
  actorId: z.string().uuid(), researchObjectId: z.string().uuid(), sourceRunId: z.string().uuid(),
  expectedRunVersion: z.number().int().positive(), ingestionTaskId: z.string().uuid(), sourceAgentTaskId: z.string().uuid(),
  generation: generationSchema, reanalysisKey: z.string().min(1).max(200), runKey: z.string().min(1).max(200),
  newIngestionTaskId: z.string().uuid().optional(), newRunId: z.string().uuid().optional(), savedAt: z.number().finite(),
}).strict();

export type SourceReanalysisIntent = z.infer<typeof intentSchema>;
export type SourceReanalysisScope = Pick<SourceReanalysisIntent, 'actorId' | 'researchObjectId' | 'sourceRunId'>;
export class SourceReanalysisIntentError extends Error {
  constructor(readonly reason: 'storage' | 'context' | 'response') {
    super(reason); this.name = 'SourceReanalysisIntentError';
  }
}

function storageKey(scope: SourceReanalysisScope): string {
  return `openscience:hermes-draft:${encodeURIComponent(scope.actorId)}:${encodeURIComponent(scope.researchObjectId)}:${encodeURIComponent(scope.sourceRunId)}:source-reanalysis:v1`;
}

export function loadSourceReanalysisIntent(storage: Storage | null, scope: SourceReanalysisScope): SourceReanalysisIntent | null {
  try {
    const raw = storage?.getItem(storageKey(scope));
    if (raw === null || raw === undefined) return null;
    const intent = intentSchema.parse(JSON.parse(raw));
    if (intent.actorId !== scope.actorId || intent.researchObjectId !== scope.researchObjectId || intent.sourceRunId !== scope.sourceRunId)
      throw new Error('Stored scope changed');
    return intent;
  } catch { throw new SourceReanalysisIntentError('storage'); }
}

export function isSourceReanalysisCurrent(intent: SourceReanalysisIntent, run: HermesResearchRun | null): boolean {
  const handle = run?.sourceReanalysis;
  const settings = run?.generationSettings;
  return Boolean(run && run.id === intent.sourceRunId && run.actorId === intent.actorId
    && run.researchObjectId === intent.researchObjectId && run.version === intent.expectedRunVersion
    && run.status === 'failed' && run.profile === 'visual-narrative-v1' && run.maxAgentTasks === 9 && !run.versionId
    && settings?.locale === intent.generation.locale && settings.style === intent.generation.style && settings.instruction === intent.generation.instruction
    && run.steps.filter(step => step.stage === 'source_ingestion').length === 1
    && run.steps.some(step => step.stage === 'source_ingestion' && step.ingestionTaskId === intent.ingestionTaskId)
    && (!handle || (handle.ingestionTaskId === intent.ingestionTaskId && handle.sourceAgentTaskId === intent.sourceAgentTaskId
      && (!handle.existingIngestionTaskId || !intent.newIngestionTaskId || handle.existingIngestionTaskId === intent.newIngestionTaskId))));
}

/** One explicit click advances the saved operation; uncertain writes are never resent here. */
export async function continueSourceReanalysis(input: {
  run: HermesResearchRun;
  actorId: string;
  researchObjectId: string;
  storage: Storage | null;
  isCurrent(intent: SourceReanalysisIntent): boolean;
  onIntentSaved?(intent: SourceReanalysisIntent): void;
  onPhase?(phase: 'analysis' | 'run'): void;
}): Promise<HermesResearchRun> {
  const scope = { actorId: input.actorId, researchObjectId: input.researchObjectId, sourceRunId: input.run.id };
  let intent = loadSourceReanalysisIntent(input.storage, scope);
  if (!intent) {
    const handle = input.run.sourceReanalysis;
    const generation = generationSchema.safeParse({ profile: 'visual-narrative-v1', maxAgentTasks: 9, ...input.run.generationSettings });
    if (!handle || !generation.success) throw new SourceReanalysisIntentError('context');
    intent = intentSchema.parse({ ...scope, expectedRunVersion: input.run.version,
      ingestionTaskId: handle.ingestionTaskId, sourceAgentTaskId: handle.sourceAgentTaskId, generation: generation.data,
      reanalysisKey: crypto.randomUUID(), runKey: crypto.randomUUID(), savedAt: Date.now(),
      ...(handle.existingIngestionTaskId ? { newIngestionTaskId: handle.existingIngestionTaskId } : {}) });
  } else if (!intent.newIngestionTaskId && input.run.sourceReanalysis?.existingIngestionTaskId) {
    intent = { ...intent, newIngestionTaskId: input.run.sourceReanalysis.existingIngestionTaskId };
  }
  let current = intent;
  const check = () => {
    if (!isSourceReanalysisCurrent(current, input.run) || !input.isCurrent(current)) throw new SourceReanalysisIntentError('context');
  };
  const checkAccount = async () => {
    check();
    const user = await getCurrentUser({ fresh: true });
    check();
    if (user.userId !== current.actorId) throw new SourceReanalysisIntentError('context');
  };
  const save = (value: SourceReanalysisIntent) => {
    try {
      if (!input.storage) throw new Error('No storage');
      input.storage.setItem(storageKey(scope), JSON.stringify(intentSchema.parse(value)));
    } catch { throw new SourceReanalysisIntentError('storage'); }
    current = value;
    input.onIntentSaved?.(current);
  };
  input.onPhase?.(current.newIngestionTaskId ? 'run' : 'analysis');
  await checkAccount();
  save(current);
  if (!current.newIngestionTaskId) {
    check();
    const task = await reanalyzeHermesRunSource(current.ingestionTaskId, current.sourceAgentTaskId, {
      intent: 'new_paid_private_analysis', sourceRunId: current.sourceRunId, expectedRunVersion: current.expectedRunVersion,
    }, current.reanalysisKey);
    const source = input.run.steps.find(step => step.stage === 'source_ingestion');
    if (!z.string().uuid().safeParse(task.id).success || task.id === current.ingestionTaskId
      || (source?.artifactId && task.artifactId !== source.artifactId)) throw new SourceReanalysisIntentError('response');
    // Retain a successful first phase even if the viewer changed while its reply was in flight.
    save({ ...current, newIngestionTaskId: task.id });
    check();
  }
  const newIngestionTaskId = current.newIngestionTaskId!;
  if (newIngestionTaskId === current.ingestionTaskId) throw new SourceReanalysisIntentError('response');
  input.onPhase?.('run');
  const finish = async (run: HermesResearchRun) => {
    check();
    if (!z.string().uuid().safeParse(run.id).success || run.id === current.sourceRunId
      || (current.newRunId && run.id !== current.newRunId)
      || run.actorId !== current.actorId || run.researchObjectId !== current.researchObjectId
      || run.profile !== 'visual-narrative-v1' || run.maxAgentTasks !== 9
      || run.generationSettings?.locale !== current.generation.locale || run.generationSettings.style !== current.generation.style
      || run.generationSettings.instruction !== current.generation.instruction
      || run.steps.filter(step => step.stage === 'source_ingestion').length !== 1
      || !run.steps.some(step => step.stage === 'source_ingestion' && step.ingestionTaskId === newIngestionTaskId))
      throw new SourceReanalysisIntentError('response');
    await checkAccount();
    save({ ...current, newRunId: run.id });
    check();
    return run;
  };
  const existing = await getExistingHermesResearchRun(current.researchObjectId, newIngestionTaskId);
  check();
  if (existing.run) return finish(existing.run);
  if (current.newRunId) throw new SourceReanalysisIntentError('response');
  await checkAccount();
  save(current);
  check();
  let result: { run: HermesResearchRun };
  try {
    result = await createHermesResearchRun(current.researchObjectId, [newIngestionTaskId], current.runKey, current.generation);
  } catch (cause) {
    // A conflict can mean another tab already attached a run to this exact new source.
    if (cause instanceof ApiClientError && cause.status === 409) {
      check();
      const reconciled = await getExistingHermesResearchRun(current.researchObjectId, newIngestionTaskId);
      check();
      if (reconciled.run) return finish(reconciled.run);
    }
    throw cause;
  }
  return finish(result.run);
}
