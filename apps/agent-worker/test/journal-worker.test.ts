import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as domain from '@openscience/domain';
import type { WorkspaceDeps } from '@openscience/domain';
import { processOneJournalJob } from '../src/journal-worker';

vi.mock('@openscience/domain', async (load) => ({
  ...await load<typeof import('@openscience/domain')>(), claimJournalJob: vi.fn(), journalJobInput: vi.fn(), finishJournalJob: vi.fn(), renewJournalJobLease: vi.fn(),
}));
const quote = 'Numerical simulations predict 14.7 TW peak power; full-system experiments have not been performed.';
const source = { kind: 'fulltext' as const, text: quote, url: 'https://example.test/source', label: 'Results' };
const draft = { summary: 'A numerical prediction.', core: { problem: 'Scaling.', insight: 'Numerical prediction.', method: 'Simulation.', results: '14.7 TW predicted.', limitations: 'No full-system experiment.', reproducibility: 'Not reported.' },
  claims: [{ text: '14.7 TW predicted.', kind: 'simulation', evidence: { quote, locator: 'J00001' } }], figures: [],
  faq: [{ question: 'Experimental?', answer: 'No.', evidence: { quote, locator: 'J00001' } }], scope: 'fulltext', language: 'en' };
const runtime = { runtimeId: 'installed-native', skillCatalogueId: 'catalogue', model: 'MiniMax-M3' };

describe('journal worker native producer and private delivery', () => {
  const deps = {} as WorkspaceDeps;
  const generate = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(domain.claimJournalJob).mockResolvedValue({ id: 'job', kind: 'generate', leaseToken: 'lease' } as Awaited<ReturnType<typeof domain.claimJournalJob>>);
    vi.mocked(domain.journalJobInput).mockResolvedValue({ source, language: 'en', kind: 'generate', workspaceId: 'workspace', actorId: 'editor' } as Awaited<ReturnType<typeof domain.journalJobInput>>);
    generate.mockResolvedValue(draft);
  });
  it('delivers only the native producer output through the atomic private boundary', async () => {
    expect(await processOneJournalJob(deps, generate, undefined, runtime)).toBe(true);
    expect(domain.claimJournalJob).toHaveBeenCalledWith(deps, runtime);
    expect(generate).toHaveBeenCalledWith({ jobId: 'job', leaseToken: 'lease', source, language: 'en' });
    expect(domain.finishJournalJob).toHaveBeenCalledWith(deps, 'job', 'lease', draft);
  });
  it('does not make a second model request after a native failure or unknown paid outcome', async () => {
    generate.mockRejectedValue(new Error('submission outcome unknown'));
    await processOneJournalJob(deps, generate, undefined, runtime);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(domain.finishJournalJob).toHaveBeenCalledWith(deps, 'job', 'lease', null, expect.any(String));
  });
  it('performs local source parsing without calling the native model', async () => {
    vi.mocked(domain.claimJournalJob).mockResolvedValue({ id: 'job', kind: 'source_parse', leaseToken: 'lease' } as Awaited<ReturnType<typeof domain.claimJournalJob>>);
    const parse = vi.fn().mockResolvedValue(quote);
    await processOneJournalJob(deps, generate, parse);
    expect(generate).not.toHaveBeenCalled();
    expect(domain.finishJournalJob).toHaveBeenCalledWith(deps, 'job', 'lease', { text: quote });
  });
  it('blocks dispatch after current journal authorization fails', async () => {
    vi.mocked(domain.journalJobInput).mockRejectedValue(new Error('revoked'));
    await processOneJournalJob(deps, generate, undefined, runtime);
    expect(generate).not.toHaveBeenCalled();
    expect(domain.finishJournalJob).toHaveBeenCalledWith(deps, 'job', 'lease', null, expect.any(String));
  });
});
