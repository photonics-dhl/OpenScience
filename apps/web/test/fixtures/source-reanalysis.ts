import type { HermesResearchRunView } from '../../../../packages/domain/src/agent/research-run';
import type { HermesResearchRun, IngestionTaskSummary } from '@/lib/api';

export const ids = {
  actor: '00000000-0000-4000-8000-000000000901',
  ro: '00000000-0000-4000-8000-000000000902',
  oldRun: '00000000-0000-4000-8000-000000000903',
  oldIngestion: '00000000-0000-4000-8000-000000000904',
  sourceAgent: '00000000-0000-4000-8000-000000000905',
  artifact: '00000000-0000-4000-8000-000000000906',
  newIngestion: '00000000-0000-4000-8000-000000000907',
  newRun: '00000000-0000-4000-8000-000000000908',
};

export const generation = {
  profile: 'visual-narrative-v1' as const, maxAgentTasks: 9 as const,
  locale: 'en' as const, style: 'auto', instruction: 'Explain the physics and its limits',
};

// Fastify serializes the Domain view directly, including nullable source fields.
export function sourceRun(): HermesResearchRun {
  const view: HermesResearchRunView = {
    id: ids.oldRun, actorId: ids.actor, researchObjectId: ids.ro,
    status: 'failed', version: 4, versionId: null,
    profile: 'visual-narrative-v1', maxAgentTasks: 9,
    generationSettings: { locale: 'en', style: 'auto', instruction: 'Explain the physics and its limits' },
    sourceClaimIds: [], error: 'Independent review was not submitted',
    createdAt: new Date('2026-09-29T00:00:00Z'), updatedAt: new Date('2026-09-29T00:01:00Z'),
    sourceReanalysis: { ingestionTaskId: ids.oldIngestion, sourceAgentTaskId: ids.sourceAgent },
    steps: [{ id: '00000000-0000-4000-8000-000000000909', stage: 'source_ingestion',
      ordinal: 0, status: 'failed', ingestionTaskId: ids.oldIngestion, artifactId: ids.artifact,
      agentTaskId: ids.sourceAgent, presentationAssetId: null, error: 'Review failed' }],
  };
  return JSON.parse(JSON.stringify(view)) as HermesResearchRun;
}

export function newRun(): HermesResearchRun {
  const run = sourceRun();
  return { ...run, id: ids.newRun, status: 'running', version: 1, error: null,
    sourceReanalysis: undefined,
    steps: [{ ...run.steps[0]!, ingestionTaskId: ids.newIngestion, status: 'waiting', error: null }],
  };
}

export const newTask: IngestionTaskSummary = {
  id: ids.newIngestion, artifactId: ids.artifact, logicalPath: 'source.pdf',
  state: 'extracting', retryCount: 0, error: null,
  agentTaskId: '00000000-0000-4000-8000-000000000910',
};
