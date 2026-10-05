import { describe, expect, it } from 'vitest';
import type { AuthDeps } from '@openscience/auth';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { requireCurrentUser } from '../src/routes/session-guard';

describe('requireCurrentUser', () => {
  it('waits for the unauthenticated response before returning null', async () => {
    let releaseSend!: () => void;
    let settled = false;
    const sendFinished = new Promise<void>((resolve) => { releaseSend = resolve; });
    const reply = {
      status: () => reply,
      send: async () => {
        await sendFinished;
        return reply;
      },
    } as unknown as FastifyReply;

    const result = requireCurrentUser(
      {} as AuthDeps,
      { id: 'request-1', cookies: {} } as FastifyRequest,
      reply,
    ).then(() => { settled = true; });

    await Promise.resolve();
    expect(settled).toBe(false);
    releaseSend();
    await result;
    expect(settled).toBe(true);
  });
});
