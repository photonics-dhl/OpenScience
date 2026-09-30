import { afterEach, describe, expect, it, vi } from 'vitest';
import { ids, newTask, sourceRun } from './fixtures/source-reanalysis';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('paid private source reanalysis API contract', () => {
  it('sends the strict new intent with the original source, version, consent and key', async () => {
    const fetcher = vi.fn().mockImplementation(async (path: string) => new Response(JSON.stringify(
      path === '/api/csrf-token' ? { csrfToken: 'csrf' } : { task: newTask },
    ), { status: path === '/api/csrf-token' ? 200 : 202 }));
    vi.stubGlobal('fetch', fetcher);
    const api = await import('@/lib/api');
    expect(api.reanalyzeHermesRunSource).toBeTypeOf('function');
    await expect(api.reanalyzeHermesRunSource(ids.oldIngestion, ids.sourceAgent, {
      intent: 'new_paid_private_analysis', sourceRunId: ids.oldRun, expectedRunVersion: 4,
    }, 'analysis-key')).resolves.toEqual(newTask);
    expect(fetcher).toHaveBeenLastCalledWith(`/api/ingestion/${ids.oldIngestion}/reanalyze`, expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ 'idempotency-key': 'analysis-key', 'x-csrf-token': 'csrf' }),
      body: JSON.stringify({ processingConsent: true, sourceAgentTaskId: ids.sourceAgent,
        sourceReanalysis: { intent: 'new_paid_private_analysis', sourceRunId: ids.oldRun, expectedRunVersion: 4 } }),
    }));
  });

  it('reads the optional source handle from the actual serialized server DTO', async () => {
    const run = sourceRun();
    run.sourceReanalysis!.existingIngestionTaskId = ids.newIngestion;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ run }), { status: 200 })));
    const { getHermesResearchRun } = await import('@/lib/api');
    const result = await getHermesResearchRun(ids.ro, ids.oldRun);
    expect(result.run.sourceReanalysis).toEqual({ ingestionTaskId: ids.oldIngestion,
      sourceAgentTaskId: ids.sourceAgent, existingIngestionTaskId: ids.newIngestion });
    expect(result.run.steps[0]!.presentationAssetId).toBeNull();
  });

  it('preserves the confirmed-source request body without the new intent', async () => {
    const fetcher = vi.fn().mockImplementation(async (path: string) => new Response(JSON.stringify(
      path === '/api/csrf-token' ? { csrfToken: 'csrf' } : { task: newTask },
    ), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const { reanalyzeConfirmedIngestion } = await import('@/lib/api');
    await reanalyzeConfirmedIngestion(ids.oldIngestion, ids.sourceAgent, 'legacy-key');
    expect(fetcher).toHaveBeenLastCalledWith(`/api/ingestion/${ids.oldIngestion}/reanalyze`, expect.objectContaining({
      body: JSON.stringify({ processingConsent: true, sourceAgentTaskId: ids.sourceAgent }),
      headers: expect.objectContaining({ 'idempotency-key': 'legacy-key' }),
    }));
  });
});
