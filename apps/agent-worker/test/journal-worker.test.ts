import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as domain from '@openscience/domain';
import type { WorkspaceDeps } from '@openscience/domain';
import type { AiGateway } from '@openscience/ai-gateway';
import { processOneJournalJob } from '../src/journal-worker';

vi.mock('@openscience/domain', async (load) => ({
  ...await load<typeof import('@openscience/domain')>(), claimJournalJob: vi.fn(), journalJobInput: vi.fn(), finishJournalJob: vi.fn(), renewJournalJobLease: vi.fn(),
}));
const quote = 'Numerical simulations predict 14.7 TW peak power; full-system experiments have not been performed.';
const source = { kind: 'fulltext', text: quote, url: 'https://example.test/source', label: 'Results' };
const draft = { summary: 'A numerical prediction.', core: { problem: 'Scaling.', insight: 'Numerical prediction.', method: 'Simulation.', results: '14.7 TW predicted.', limitations: 'No full-system experiment.', reproducibility: 'Not reported.' }, claims: [{ text: '14.7 TW predicted.', kind: 'simulation', evidence: { quote, locator: 'Results' } }], figures: [], faq: [{ question: 'Experimental?', answer: 'No.', evidence: { quote, locator: 'Results' } }], scope: 'fulltext', language: 'en' };
describe('journal worker producer and validation boundary', () => {
  const deps = {} as WorkspaceDeps;
  const complete = vi.fn(); const gateway = { complete } as unknown as Pick<AiGateway, 'complete'>;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(domain.claimJournalJob).mockResolvedValue({ id: 'job', kind: 'generate', leaseToken: 'lease' } as Awaited<ReturnType<typeof domain.claimJournalJob>>);
    vi.mocked(domain.journalJobInput).mockResolvedValue({ source, language: 'en', kind: 'generate', workspaceId: 'workspace', actorId: 'editor' } as Awaited<ReturnType<typeof domain.journalJobInput>>);
    complete.mockResolvedValue({ text: JSON.stringify(draft) });
  });
  it('passes validated structured producer output to the atomic delivery boundary', async () => {
    expect(await processOneJournalJob(deps, gateway)).toBe(true);
    expect(domain.finishJournalJob).toHaveBeenCalledWith(deps, 'job', 'lease', draft);
    expect(complete.mock.calls[0]![0][1].content).toContain('SOURCE DATA');
  });
  it('does not deliver a simulation wrongly classified as experimental, even after bounded provider retries', async () => {
    complete.mockResolvedValue({ text: JSON.stringify({ ...draft, claims: [{ ...draft.claims[0], kind: 'experimental' }] }) });
    await processOneJournalJob(deps, gateway);
    expect(complete).toHaveBeenCalledTimes(3);
    expect(domain.journalJobInput).toHaveBeenCalledTimes(3);
    expect(domain.finishJournalJob).toHaveBeenCalledWith(deps, 'job', 'lease', null, expect.any(String));
  });
  it('performs local source parsing without calling a paid model', async () => {
    vi.mocked(domain.claimJournalJob).mockResolvedValue({ id: 'job', kind: 'source_parse', leaseToken: 'lease' } as Awaited<ReturnType<typeof domain.claimJournalJob>>);
    const parse = vi.fn().mockResolvedValue(quote);
    await processOneJournalJob(deps, gateway, parse);
    expect(complete).not.toHaveBeenCalled();
    expect(domain.finishJournalJob).toHaveBeenCalledWith(deps, 'job', 'lease', { text: quote });
  });
  it('blocks provider dispatch after current authorization fails', async () => {
    vi.mocked(domain.journalJobInput).mockRejectedValue(new Error('revoked'));
    await processOneJournalJob(deps, gateway);
    expect(complete).not.toHaveBeenCalled();
    expect(domain.finishJournalJob).toHaveBeenCalledWith(deps, 'job', 'lease', null, expect.any(String));
  });
});
