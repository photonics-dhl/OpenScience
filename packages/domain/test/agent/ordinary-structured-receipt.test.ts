import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';
import { prepareOrdinaryStructuredReceipt, settleOrdinaryStructuredReceipt, readOrdinaryStructuredReceipt,
  ordinaryStructuredPublicResult, ordinaryStructuredTerminalResult, OrdinaryStructuredReceiptConflict,
  type OrdinaryStructuredIdentity } from '../../src/agent/ordinary-structured-receipt';

function fixture() {
  const task = { id: 'receipt-task', kind: 'workspace.guide', sessionId: 'session', status: 'running',
    deletedAt: null, executionAttempt: 1, error: null as string | null, result: null as unknown };
  let writes = 0; let beforeWrite = () => {};
  const tx = { agentTask: {
    findUnique: async () => structuredClone(task),
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: { result: unknown } }) => {
      beforeWrite();
      if (Object.entries(where).some(([key, value]) => key === 'result'
        ? !('equals' in (value as object)) || ((value as { equals: unknown }).equals === Prisma.AnyNull
          ? task.result != null : !isDeepStrictEqual(task.result, (value as { equals: unknown }).equals))
        : !isDeepStrictEqual(task[key as keyof typeof task], value))) return { count: 0 };
      writes++; task.result = structuredClone(data.result); return { count: 1 };
    },
  } };
  const identity: OrdinaryStructuredIdentity = { taskId: task.id, kind: 'workspace.guide', executionAttempt: 1,
    sessionId: task.sessionId, userId: 'actor', researchObjectId: null };
  const input = { identity, sourceJson: JSON.stringify({ payload: { goal: 'original' }, messages: [{ content: 'original source' }], reservation: null }),
    ordinal: 0, target: { provider: 'fixture', model: 'configured-alias', promptHash: 'a'.repeat(64) } };
  return { task, tx: tx as never, input, writes: () => writes, intercept: (run: () => void) => { beforeWrite = run; } };
}

describe('ordinary structured private evidence CAS', () => {
  it('retains >128KiB source and full reported response with opaque objectKey, NUL and lone surrogate', async () => {
    const f = fixture(); const text = '科学'.repeat(80_000) + '\u0000\ud800';
    f.input.sourceJson = JSON.stringify({ payload: { objectKey: 'derived/not-owned', text }, messages: [{ content: text }] });
    const prepared = await prepareOrdinaryStructuredReceipt(f.tx, f.input);
    const response = { text, model: 'reported-version', usage: { inputTokens: 7, outputTokens: 11 },
      providerContent: [{ objectKey: 'derived/provider-not-owned', text }] };
    const responseJson = JSON.stringify(response);
    expect(Buffer.byteLength(f.input.sourceJson)).toBeGreaterThan(131_072);
    expect(Buffer.byteLength(responseJson)).toBeGreaterThan(131_072);
    Object.assign(f.task, { status: 'failed', executionAttempt: 2, error: 'user stopped' });
    await settleOrdinaryStructuredReceipt(f.tx, prepared, { responseJson });
    const cp = readOrdinaryStructuredReceipt(f.task.result)!;
    expect(JSON.parse(cp.sourceJson)).toEqual(JSON.parse(f.input.sourceJson));
    expect(JSON.parse(cp.attempts[0]!.responseJson!)).toEqual(response);
    expect(cp.attempts[0]!.target.model).toBe('configured-alias');
    expect(Object.keys(cp).sort()).toEqual(['attempts', 'identity', 'sourceJson']);
    expect(f.task).toMatchObject({ status: 'failed', executionAttempt: 2, error: 'user stopped' });
    expect(ordinaryStructuredPublicResult(f.task.result)).toEqual({});
  });

  it('does not mint a second capability, and equal completion is idempotent but different data is refused', async () => {
    const f = fixture(); const cp = await prepareOrdinaryStructuredReceipt(f.tx, f.input);
    await expect(prepareOrdinaryStructuredReceipt(f.tx, f.input)).rejects.toThrow('receipt changed');
    await settleOrdinaryStructuredReceipt(f.tx, cp, { responseJson: '{"text":"paid"}' });
    const writes = f.writes(); await settleOrdinaryStructuredReceipt(f.tx, cp, { responseJson: '{"text":"paid"}' });
    expect(f.writes()).toBe(writes);
    await expect(settleOrdinaryStructuredReceipt(f.tx, cp, { responseJson: '{"text":"replacement"}' })).rejects.toThrow();
    expect(readOrdinaryStructuredReceipt(f.task.result)!.attempts[0]!.responseJson).toBe('{"text":"paid"}');
  });

  it('allows only the next original ordinal after saved completion and keeps siblings', async () => {
    const f = fixture(); f.task.result = { sibling: 'keep' };
    const cp = await prepareOrdinaryStructuredReceipt(f.tx, f.input);
    await settleOrdinaryStructuredReceipt(f.tx, cp, { responseJson: 'invalid JSON provider text' });
    const next = await prepareOrdinaryStructuredReceipt(f.tx, { ...f.input, ordinal: 1, target: { ...f.input.target, promptHash: 'b'.repeat(64) } });
    expect(next.attempts).toHaveLength(2);
    await settleOrdinaryStructuredReceipt(f.tx, next, { failureJson: '{"code":"provider_timeout"}' });
    await expect(prepareOrdinaryStructuredReceipt(f.tx, { ...f.input, ordinal: 2 })).rejects.toThrow();
    expect(f.task.result).toMatchObject({ sibling: 'keep' });
  });

  it('compares absent/null result and refuses a concurrent writer rather than overwriting it', async () => {
    const f = fixture(); f.intercept(() => { f.task.result = { ordinaryStructuredReceipt: 'concurrent' }; });
    await expect(prepareOrdinaryStructuredReceipt(f.tx, f.input)).rejects.toBeInstanceOf(OrdinaryStructuredReceiptConflict);
    expect(f.task.result).toEqual({ ordinaryStructuredReceipt: 'concurrent' });
  });

  it.each(['identity', 'source', 'target'])('refuses changed %s on a late completion', async change => {
    const f = fixture(); const cp = await prepareOrdinaryStructuredReceipt(f.tx, f.input);
    const altered = structuredClone(cp);
    if (change === 'identity') altered.identity.executionAttempt++;
    if (change === 'source') altered.sourceJson = 'different source';
    if (change === 'target') altered.attempts[0]!.target.model = 'another model';
    await expect(settleOrdinaryStructuredReceipt(f.tx, altered, { responseJson: 'paid' })).rejects.toThrow();
    expect(readOrdinaryStructuredReceipt(f.task.result)!.attempts[0]!.state).toBe('prepared');
  });

  it('strips malformed and forged private keys, and only merges current server evidence', async () => {
    const malformed = { ordinaryStructuredReceipt: { objectKey: 'derived/secret' } };
    expect(ordinaryStructuredPublicResult(malformed)).toEqual({});
    expect(() => readOrdinaryStructuredReceipt(malformed)).toThrow();
    expect(ordinaryStructuredTerminalResult(null, { summary: 'product', ...malformed })).toEqual({ summary: 'product' });
    expect(ordinaryStructuredTerminalResult({ ...malformed, summary: 'old' }, { summary: 'new', ordinaryStructuredReceipt: 'forged' }))
      .toEqual({ ...malformed, summary: 'new' });
  });
});
