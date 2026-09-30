import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createSession } from '@openscience/auth';
import { fixture, fields } from '../../../packages/domain/test/agent/direct-source-review-fixture';
import { seedHistoricalIndependentSourceReview } from '../../../packages/domain/test/agent/historical-source-review-fixture';
import { buildApp } from '../src/app';
import { createFakeMailer, createFakeRedis } from './helpers/fakes';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });

async function apiFixture(canRetrySourceReviewBeforeSubmission?: Parameters<typeof buildApp>[0]['canRetrySourceReviewBeforeSubmission']) {
  const f = fixture(); const redis = createFakeRedis();
  Object.assign(redis, { lpush: f.redis.lpush });
  const token = await createSession(redis, { userId: f.input.actorId, status: 'email_verified' });
  const app = await buildApp({ prisma: f.prisma, redis, audit: f.deps.audit, mailer: createFakeMailer(),
    cookieSecret: 'test-secret', secureCookies: false, canRetrySourceReviewBeforeSubmission });
  apps.push(app);
  return { ...f, app, cookies: { openscience_session: token }, url: `/research-objects/${f.ids.ro}/hermes-runs/${f.ids.run}` };
}

describe('fresh source review recovery HTTP contract', () => {
  it('uses positive broker evidence for one disclosed uncharged technical successor through GET and POST', async () => {
    const verifier = vi.fn(async () => true);
    const f = await apiFixture(verifier);
    const result = f.db.agentTasks[1].result;
    const text = JSON.stringify({ fields: fields(field => ({ verdict: 'accepted', summary: `Original ${field}`,
      sourcePassageIds: ['P00001'], issues: [] })), needsMoreEvidence: [], claimSuggestions: [{ parentClientKey: 'missing' }] });
    result.fieldDiagnosticsDetails = fields(() => 'scientificReview=review_contract_incomplete;reviewedClaims=source_unmaterializable');
    result.scientificReview.rejectedOutputs = [{ structuredAttempt: 2, kind: 'schema_validation', diagnostic: 'claims_source_unmaterializable',
      provider: 'primary', model: 'MiniMax-M3', promptHash: '2'.repeat(64), responseHash: createHash('sha256').update(text).digest('hex'),
      byteLength: Buffer.byteLength(text), usage: { inputTokens: 100, outputTokens: 100 }, finishReason: 'stop', text }];
    const request = { method: 'POST' as const, url: `${f.url}/retry-generation`, cookies: f.cookies,
      headers: { 'idempotency-key': 'initial-independent' }, payload: { expectedVersion: 7 } };
    const root = seedHistoricalIndependentSourceReview(f);
    root.status = 'succeeded'; root.executionAttempt = 1;
    root.result = structuredClone(f.failedResult);
    root.result.scientificReview = { ...root.result.scientificReview, kind: 'independent_review',
      provider: 'chatgpt-web-science-review', model: 'chatgpt-web/6-pro', attemptId: '00000000-0000-5000-8000-000000000777' };
    root.result.fieldDiagnosticsDetails = fields(() => 'scientificReview=unavailable');
    f.db.auditLogs.push({ id: 'web-call', action: 'ai.gateway.call', requestId: root.id, actorId: null, targetType: 'ai_gateway',
      metadata: { operation: 'scientific_review', outcome: 'failed', provider: 'chatgpt-web-science-review', model: 'chatgpt-web/6-pro',
        promptHash: 'c'.repeat(64), inputContentHash: 'a'.repeat(64), fallbackReason: null, retryCount: 0, error: 'scientific_review_failed' } });
    f.db.hermesResearchSteps.at(-1)!.status = 'failed'; f.db.hermesResearchRuns[0].status = 'failed';
    f.db.ingestionTasks[0].state = 'needs_review';
    const read = () => f.app.inject({ method: 'GET', url: f.url, cookies: f.cookies });
    expect((await read()).json().run).toMatchObject({ generationRecovery: 'source-review-not-submitted', chargeableAttempts: 0 });
    expect(verifier).toHaveBeenCalledWith(expect.objectContaining({ requestId: root.result.scientificReview.attemptId, promptHash: 'c'.repeat(64) }));
    verifier.mockResolvedValue(false);
    expect((await read()).json().run.canRetryGeneration).not.toBe(true);
    const retry = { ...request, headers: { 'idempotency-key': 'technical-successor' }, payload: { expectedVersion: f.db.hermesResearchRuns[0].version } };
    const ledger = structuredClone(f.db.usageLedger);
    const rejected = await f.app.inject(retry);
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR', message: 'This source review has no safe source recovery' } });
    expect(f.db.usageLedger).toEqual(ledger);
    expect(f.redis.lpush).not.toHaveBeenCalled();
    verifier.mockResolvedValue(true);
    expect((await f.app.inject(retry)).statusCode).toBe(202);
    expect((await f.app.inject(retry)).statusCode).toBe(202);
    expect(f.db.usageLedger).toEqual(ledger);
    expect(f.redis.lpush).toHaveBeenCalledTimes(1);
  });
  it('projects saved-body correction privately and reuses the same explicit endpoint and replay receipt', async () => {
    const f = await apiFixture(); const result = f.db.agentTasks[1].result;
    const text = JSON.stringify({ fields: fields(field => ({ verdict: 'accepted', summary: `Original ${field}`,
      sourcePassageIds: ['P00001'], issues: [] })), needsMoreEvidence: [], claimSuggestions: [{ parentClientKey: 'missing' }] });
    result.fieldDiagnosticsDetails = fields(() => 'scientificReview=review_contract_incomplete;reviewedClaims=invalid_structure');
    result.scientificReview.rejectedOutputs = [{ structuredAttempt: 2, kind: 'schema_validation', diagnostic: 'claims_invalid_structure',
      provider: 'primary', model: 'MiniMax-M3', promptHash: '2'.repeat(64), responseHash: createHash('sha256').update(text).digest('hex'),
      byteLength: Buffer.byteLength(text), usage: { inputTokens: 100, outputTokens: 100 }, finishReason: 'stop', text }];
    const read = await f.app.inject({ method: 'GET', url: f.url, cookies: f.cookies });
    expect(read.statusCode).toBe(200);
    expect(read.json().run).toMatchObject({ generationRecovery: 'source-review-saved', chargeableAttempts: 1, canRetryGeneration: true });
    for (const privateKey of ['rejectedOutputs', 'savedOutputEvidence', 'claimSuggestions', 'sourceMapRef']) expect(read.body).not.toContain(privateKey);
    expect(f.redis.lpush).not.toHaveBeenCalled();
    const request = { method: 'POST' as const, url: `${f.url}/retry-generation`, cookies: f.cookies,
      headers: { 'idempotency-key': 'saved-review' }, payload: { expectedVersion: 7 } };
    expect((await f.app.inject(request)).statusCode).toBe(202);
    f.db.hermesResearchRuns[0].status = 'failed';
    expect((await f.app.inject(request)).statusCode).toBe(202);
    expect(f.redis.lpush).toHaveBeenCalledTimes(1);
    expect(f.db.usageLedger.filter(row => row.kind === 'consume')).toHaveLength(1);
  });

  it('discloses fresh paid review on read and requires one explicit versioned idempotent POST', async () => {
    const f = await apiFixture();
    const read = await f.app.inject({ method: 'GET', url: f.url, cookies: f.cookies });
    expect(read.statusCode).toBe(200);
    expect(read.json().run).toMatchObject({ generationRecovery: 'source-review-fresh', chargeableAttempts: 1, canRetryGeneration: true });
    expect(read.body).not.toContain('sourceMapRef'); expect(read.body).not.toContain('unverifiedSummaries');
    expect(f.redis.lpush).not.toHaveBeenCalled();
    const request = { method: 'POST' as const, url: `${f.url}/retry-generation`, cookies: f.cookies,
      headers: { 'idempotency-key': f.input.idempotencyKey }, payload: { expectedVersion: 7 } };
    const first = await f.app.inject(request);
    expect(first.statusCode).toBe(202);
    expect(first.json().run).toMatchObject({ id: f.ids.run, version: 8, status: 'running', maxAgentTasks: 9 });
    expect((await f.app.inject(request)).statusCode).toBe(202);
    expect(f.redis.lpush).toHaveBeenCalledTimes(1);
    expect(f.db.usageLedger.filter(row => row.kind === 'consume')).toHaveLength(1);
    expect((await f.app.inject({ ...request, payload: { expectedVersion: 8 } })).statusCode).toBe(409);
  });

  it('rejects source selection/grant expansion and reader POST without scheduling or charging', async () => {
    const f = await apiFixture();
    const request = { method: 'POST' as const, url: `${f.url}/retry-generation`, cookies: f.cookies,
      headers: { 'idempotency-key': 'explicit' }, payload: { expectedVersion: 7 } };
    for (const extra of [{ compositionSourceAgentTaskId: f.ids.anchor }, { maxAgentTasks: 11 }, { savedOutputReused: true }])
      expect((await f.app.inject({ ...request, payload: { ...request.payload, ...extra } })).statusCode).toBe(400);
    expect((await f.app.inject({ ...request, headers: {} })).statusCode).toBe(400);
    f.db.memberships[0].role = 'viewer';
    const view = (await f.app.inject({ method: 'GET', url: f.url, cookies: f.cookies })).json().run;
    expect(view.canRetryGeneration).not.toBe(true);
    expect((await f.app.inject(request)).statusCode).toBe(403);
    expect(f.redis.lpush).not.toHaveBeenCalled(); expect(f.db.usageLedger.filter(row => row.kind === 'consume')).toHaveLength(0);
  });
});
