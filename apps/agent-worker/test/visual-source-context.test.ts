import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createBlockSourceLocator, INGESTION_BRIDGE_FIELDS, persistDocumentSourceMapReference, type DocumentSourceMap } from '@openscience/domain';
import type { StorageAdapter } from '@openscience/storage';
import { hasSingleReviewedVisualSource, projectVisualNarrativeSource, readVisualNarrativeSource, resolveVisualNarrativeSource, selectVisualSourceContext } from '../src/scientific-writing-source';
import { createPresentationGenerationHandler } from '../src/presentation/handler';
import { createWritingSourcePacket, materializeWritingCitations } from '../src/citation-management';
import { generateIllustrationStoryboard } from '../src/presentation/illustration-planner';
import { AiGateway } from '@openscience/ai-gateway';
import { isDeepStrictEqual } from 'node:util';

function sourceMapFixture(): DocumentSourceMap {
  const texts = [
    'The measured response follows the waveguide geometry in Fig. 7. The particle follows the open channel.',
    'Its channel has a finite aperture. The plotted width is an intensity FWHM along the particle path.',
    ...Array.from({ length: 35 }, (_, index) => `Unrelated result ${index}. ${'Background measurement details. '.repeat(45)}`),
    'Notations\nx is the driving wave propagation direction; y is its electric polarization; z is particle incidence. Table 3 lists the coordinates.',
    'Table 3. Coordinate definitions\nThe observation angle is measured relative to positive z in the laboratory frame.',
    'Fig. 7. Two long dielectric rods, shown in cross section, flank the open channel. See Fig. S9 for the calculated field.',
    'Fig. S9. The intensity cross section is in the y-z plane. Its spatial FWHM is along z, whereas the gap is along y.',
    'The transverse opening and intensity width have different axes and definitions.',
  ];
  return { artifactId: 'source-artifact', contentHash: 'a'.repeat(64), parser: { name: 'fixture', version: '1' },
    pages: texts.map((text, index) => ({ page: index + 1, width: 600, height: 800,
      blocks: [{ id: `b${index}`, kind: 'paragraph', text, boundingBox: { x: 0, y: 0, width: 600, height: 60 },
        parser: { name: 'fixture', version: '1' }, transformations: [] }] })) };
}

async function reviewedFixture() {
  const sourceMap = sourceMapFixture();
  const objects = new Map<string, Buffer>();
  const storage: StorageAdapter = {
    putObject: async (key, body) => { const bytes = Buffer.isBuffer(body) ? body : Buffer.concat(await (body as Readable).toArray());
      objects.set(key, bytes); return { key, size: bytes.length, etag: 'fixture' }; },
    getObject: vi.fn(async key => { const bytes = objects.get(key)!; return { body: Readable.from([bytes]), size: bytes.length }; }),
    headObject: async key => objects.has(key) ? { size: objects.get(key)!.length, etag: 'fixture' } : null,
    deleteObject: async key => { objects.delete(key); },
  };
  const reference = await persistDocumentSourceMapReference(storage, sourceMap, 'succeeded');
  const scope = { userId: 'owner', workspaceId: 'workspace', researchObjectId: 'ro', versionId: 'version', sourceClaimIds: ['claim'] };
  const claims = [{ id: 'claim', extractionStatus: 'succeeded', provenance: { source: 'reviewed_ingestion', sourceTaskId: 'ingestion' } }];
  const result = { sourceMapRef: reference, core: Object.fromEntries(INGESTION_BRIDGE_FIELDS.map(field => [field, 'Reviewed analysis'])),
    scientificReview: { status: 'review_received', contractVersion: 5, responseHash: 'b'.repeat(64) } };
  const version = { id: 'version', manifest: { id: 'manifest', coreJson: {}, entries: [{ artifactId: sourceMap.artifactId, blobSha256: sourceMap.contentHash }] } };
  const ingestion = { id: 'ingestion', state: 'confirmed', artifactId: sourceMap.artifactId,
    artifact: { workspaceId: 'workspace', blobSha256: sourceMap.contentHash, deletedAt: null, bytesPurgedAt: null },
    batch: { userId: 'owner', researchObjectId: 'ro' }, agentTask: { id: 'extraction', kind: 'sdf.extract', status: 'succeeded',
      updatedAt: new Date('2026-01-01'), deletedAt: null, result,
      session: { userId: 'owner', researchObjectId: 'ro', deletedAt: null } } };
  const prisma = { version: { findFirst: vi.fn(async () => version) }, claimNode: { findMany: vi.fn(async () => claims) },
    ingestionTask: { findUnique: vi.fn(async () => ingestion) } };
  const evidence = [{ artifactId: sourceMap.artifactId, contentHash: sourceMap.contentHash,
    locator: createBlockSourceLocator(sourceMap, 'b0') }];
  return { sourceMap, storage, scope, claims, result, version, ingestion, prisma, evidence };
}

describe('authorized illustration context from an existing reviewed source', () => {
  it.each(['reviewed', 'manual', 'mixed', 'foreign-only', 'mixed-narrative', 'legacy-checkpoint', 'legacy-partial', 'unauthorized', 'changed', 'diagnostics', 'diagnostics-stale', 'diagnostics-cas', 'diagnostics-source', 'diagnostics-success', 'diagnostics-reentry',
    'recovery', 'recovery-invalid', 'recovery-no-receipt', 'recovery-candidate-changed', 'recovery-map-changed', 'recovery-cas',
    'recovery-revoked', 'recovery-source-changed', 'recovery-submitting', 'recovery-audit-changed', 'recovery-receipt-revoked',
    'recovery-attempt-changed', 'recovery-before-art-reentry'] as const)('routes a local illustration through the real task handler (%s)', async mode => {
    const f = await reviewedFixture();
    const ro = '40000000-0000-4000-8000-000000000001';
    const versionId = '50000000-0000-4000-8000-000000000001';
    const claimId = '60000000-0000-4000-8000-000000000001';
    const taskId = '70000000-0000-4000-8000-000000000001';
    f.version.id = versionId;
    f.claims[0]!.id = claimId;
    f.ingestion.batch.researchObjectId = ro;
    f.ingestion.agentTask.session.researchObjectId = ro;
    if (mode === 'unauthorized') f.ingestion.batch.userId = 'other-owner';
    const payload = { schemaVersion: 1, researchObjectId: ro, versionId, kind: 'interactive_html', sourceClaimIds: [claimId],
      storyboard: { locale: 'en', style: 'watercolor', instruction: 'Explain the channel geometry.', output: 'image',
        ...(mode === 'mixed-narrative' ? { narrative: true } : {}) } };
    const task = { id: taskId, executionAttempt: 1, payload };
    const owner = { ...task, kind: 'presentation.generate', status: 'running', retryCount: 0, result: null as Record<string, unknown> | null,
      session: { userId: 'owner', researchObjectId: ro, status: 'active',
        researchObject: { id: ro, workspaceId: 'workspace', workspace: { status: 'active' } } } };
    const claimRows = f.claims.map(claim => ({ ...claim, kind: 'method', statement: 'The particle follows an open channel.',
      assessment: 'supported', conditions: [], limitations: [], ...(mode === 'manual' ? { provenance: {} } : {}) }));
    const evidence = f.evidence.map(row => ({ ...row, id: '80000000-0000-4000-8000-000000000001', claimId,
      exactQuote: f.sourceMap.pages[0]!.blocks[0]!.text, relation: 'supports', extractionStatus: 'succeeded',
      provenance: { source: 'reviewed_ingestion', sourceMapRef: f.result.sourceMapRef } }));
    if (mode === 'mixed' || mode === 'mixed-narrative' || mode === 'foreign-only') {
      const otherMap = { ...f.sourceMap, artifactId: 'second-paper', contentHash: 'c'.repeat(64) };
      const otherReference = await persistDocumentSourceMapReference(f.storage, otherMap, 'succeeded');
      f.version.manifest.entries.push({ artifactId: otherMap.artifactId, blobSha256: otherMap.contentHash });
      evidence.push({ ...evidence[0]!, id: '80000000-0000-4000-8000-000000000002', artifactId: otherMap.artifactId,
        contentHash: otherMap.contentHash, locator: createBlockSourceLocator(otherMap, 'b0'),
        provenance: { source: 'reviewed_ingestion', sourceMapRef: otherReference } });
      if (mode === 'foreign-only') evidence.shift();
    }
    if (mode === 'legacy-checkpoint' || mode === 'legacy-partial') {
      const planned = await generateIllustrationStoryboard({ completeStructured: vi.fn()
        .mockResolvedValueOnce({ title: 'Open channel', scenes: [{ title: 'Open channel', narration: 'The particle follows an open path.',
          message: 'The particle follows an open channel.', domain: 'conceptual', subjects: [{ description: 'The particle follows an open channel.', basis: { sourceId: 's0' } }],
          encoding: 'One arrow represents the path of subject 0.', labels: ['Open channel'], constraints: ['Conceptual, not to scale'] }] })
        .mockResolvedValueOnce({ scenes: [{ layout: 'One focused path.', treatment: 'Quiet ink.' }] }) } as never,
      claimRows.map(claim => ({ ...claim, sourcePassages: [{ evidenceId: evidence[0]!.id, text: evidence[0]!.exactQuote!, relation: 'supports' }] })) as never,
      payload.storyboard as never);
      owner.result = { storyboardCheckpoint: { payload, baseIdentity: null, planned,
        claimContent: JSON.stringify(claimRows.map(({ id, kind, statement, assessment, conditions, limitations, extractionStatus }) =>
          ({ id, kind, statement, assessment, conditions, limitations, extractionStatus }))),
        sourceEvidenceIdentity: createHash('sha256').update(JSON.stringify(evidence.map(({ id, claimId, artifactId, contentHash, exactQuote,
          relation, locator, extractionStatus, provenance }) => ({ id, claimId, artifactId, contentHash, exactQuote, relation, locator, extractionStatus, provenance })))).digest('hex') } };
      if (mode === 'legacy-partial') {
        const { planned: _planned, ...identity } = owner.result.storyboardCheckpoint as Record<string, unknown>;
        owner.result = { storyboardPlanningCheckpoint: { ...identity, schemaVersion: 1,
          science: { intent: { title: 'Saved science', scenes: [] }, designSkills: [] },
          art: { state: 'not_started', executionAttempt: 1, rejectedCandidates: [] } } };
      }
    }
    const updateMany = vi.fn(async ({ where, data }: { where: { executionAttempt: number; result: { equals: unknown } }; data: { result: Record<string, unknown> } }) => {
      if (mode === 'diagnostics-cas' || where.executionAttempt !== owner.executionAttempt
          || (owner.result !== null && !isDeepStrictEqual(where.result.equals, owner.result))) return { count: 0 };
      owner.result = data.result;
      return { count: 1 };
    });
    const prisma = { ...f.prisma,
      version: { ...f.prisma.version, findUnique: async () => ({ ...f.version, researchObjectId: ro, status: 'draft',
        commit: { branchId: 'branch' }, researchObject: { id: ro, workspaceId: 'workspace' } }) },
      claimNode: { findMany: async () => claimRows },
      workspace: { findUnique: async () => ({ id: 'workspace', status: 'active' }) },
      membership: { findUnique: async () => ({ userId: 'owner', workspaceId: 'workspace', role: 'author' }) },
      agentTask: { findUnique: async () => owner, updateMany },
      trashEntry: { findFirst: async () => null },
      artifact: { findMany: async () => [{ id: f.sourceMap.artifactId }] },
      presentationAsset: { findUnique: async () => null },
      evidenceRecord: { findMany: async () => evidence },
    };
    if (mode.startsWith('recovery')) {
      // The original response is provider data, not a successful science checkpoint.
      const candidate = { title: 'Open channel', scenes: [{ title: 'Open channel', narration: 'The particle follows an open path.',
        message: 'The particle follows an open channel.', domain: 'conceptual',
        subjects: [{ description: 'The particle follows an open channel.', basis: { sourceId: 's0' } }],
        encoding: 'One arrow represents the path of subject 0.', labels: [mode === 'recovery-invalid' ? 'w=20 nm' : 'Open channel'],
        constraints: ['Conceptual, not to scale'] }] };
      const sources = [{ sourceId: 's0', claimId, evidenceId: evidence[0]!.id, text: evidence[0]!.exactQuote, relation: 'supports' }];
      const identity = { payload, baseIdentity: null,
        claimContent: JSON.stringify(claimRows.map(({ id, kind, statement, assessment, conditions, limitations, extractionStatus }) =>
          ({ id, kind, statement, assessment, conditions, limitations, extractionStatus }))),
        sourceEvidenceIdentity: createHash('sha256').update(JSON.stringify(evidence.map(({ id, claimId, artifactId, contentHash,
          exactQuote, relation, locator, extractionStatus, provenance }) =>
          ({ id, claimId, artifactId, contentHash, exactQuote, relation, locator, extractionStatus, provenance })))).digest('hex'),
        narrativeSourceIdentity: (await readVisualNarrativeSource(prisma as never, { ...f.scope, researchObjectId: ro, versionId, sourceClaimIds: [claimId] })).identity };
      const candidates = [1, 2, 3].map(structuredAttempt => ({ text: JSON.stringify(candidate), structuredAttempt,
        kind: 'schema_validation', diagnostic: 'old_validator_rejected' }));
      owner.result = { storyboardScienceDiagnostics: { ...identity, executionAttempt: 1, sources, candidates } };
      task.executionAttempt = owner.executionAttempt = 2; owner.retryCount = 1;
      const calls = [1, 2, 3].map(n => ({ id: `paid-${n}`, actorId: null, targetType: 'ai_gateway',
        createdAt: new Date(`2026-01-02T00:0${n}:00Z`), metadata: { operation: 'text', outcome: 'succeeded', error: null,
          finishReason: 'stop', fallbackReason: null, retryCount: 0, model: 'fixture', provider: 'fixture' } }));
      const rejections = candidates.map((c, i) => ({ id: `rejected-${i}`, createdAt: new Date(calls[i]!.createdAt.getTime() + 10),
        metadata: { executionAttempt: 1, structuredAttempt: c.structuredAttempt, kind: c.kind,
          candidateHash: createHash('sha256').update(c.text).digest('hex'), candidateBytes: Buffer.byteLength(c.text) } }));
      const receipt = { id: 'retry-receipt', createdAt: new Date('2026-01-02T00:10:00Z'), metadata: { sourceEvidenceIdentity: identity.sourceEvidenceIdentity,
        recoveryClass: 'saved_science_candidate', taskId, previousExecutionAttempt: 1, authorizedExecutionAttempt: 2, authorizedRetryCount: 1,
        structuredAttempt: 3, candidateHash: rejections[2]!.metadata.candidateHash, candidateBytes: rejections[2]!.metadata.candidateBytes,
        planningAuditIds: calls.map(c => c.id),
        rejectionAuditIds: rejections.map(r => r.id), noScienceSubmission: true, noProviderSwitch: true } };
      if (mode === 'recovery-candidate-changed') candidates[2]!.text += ' ';
      if (mode === 'recovery-map-changed') sources[0]!.text = 'A different source.';
      if (mode === 'recovery-audit-changed') calls[2]!.metadata = { ...calls[2]!.metadata, outcome: 'unknown' };
      let receiptAvailable = mode !== 'recovery-no-receipt';
      const auditLog = { findMany: vi.fn(async ({ where }) => where.action === 'agent.task.retry'
        ? receiptAvailable ? [structuredClone(receipt)] : [] : where.action === 'ai.gateway.call' ? calls : rejections) };
      const update = updateMany.getMockImplementation()!;
      updateMany.mockImplementation(async args => {
        if (mode === 'recovery-cas') return { count: 0 };
        const result = await update(args);
        if (mode === 'recovery-revoked') prisma.membership.findUnique = async () => ({ userId: 'owner', workspaceId: 'workspace', role: 'reader' });
        if (mode === 'recovery-source-changed') f.ingestion.agentTask.updatedAt = new Date('2026-02-01');
        if (mode === 'recovery-receipt-revoked') receiptAvailable = false;
        if (mode === 'recovery-attempt-changed') owner.executionAttempt++;
        return result;
      });
      let providerCalls = 0;
      const gateway = new AiGateway({ providers: [{ name: 'fixture', model: 'fixture', complete: async () => {
        providerCalls++;
        expect(owner.result).toHaveProperty('storyboardPlanningCheckpoint.art.state', 'submitting');
        if (mode === 'recovery-submitting') throw new Error('fixture art timeout');
        return { text: JSON.stringify({ scenes: [{ layout: 'One focused path.', treatment: 'Quiet ink.' }] }),
          model: 'fixture', usage: { inputTokens: 1, outputTokens: 1 } };
      } }] });
      const review = vi.fn(async () => { throw new Error('fixture stopped at scientific review'); });
      const db = { ...prisma, auditLog, $transaction: async (work: (tx: unknown) => Promise<unknown>) => work(db) };
      const handler = createPresentationGenerationHandler({ gateway: { completeStructured: gateway.completeStructured.bind(gateway), reviewScientific: review } as never });
      if (mode === 'recovery-before-art-reentry') {
        // Simulate losing the worker after the durable science save and before any art submission.
        let interrupt = true;
        const interrupted = createPresentationGenerationHandler({ gateway: { completeStructured: async (...args: Parameters<AiGateway['completeStructured']>) => {
          if (interrupt) { interrupt = false; throw new Error('fixture lost worker before art'); }
          return gateway.completeStructured(...args);
        }, reviewScientific: review } as never });
        await expect(interrupted({ prisma: db, storage: f.storage } as never, task as never)).rejects.toThrow('fixture lost worker before art');
        expect(owner.result).toHaveProperty('storyboardPlanningCheckpoint.art.state', 'not_started');
        expect(providerCalls).toBe(0);
      }
      await expect(handler({ prisma: db, storage: f.storage } as never, task as never)).rejects.toThrow(mode === 'recovery'
        || mode === 'recovery-before-art-reentry'
        ? 'fixture stopped at scientific review' : mode === 'recovery-invalid' ? /unbound_numeric/ : mode === 'recovery-submitting' ? /Primary provider failed/ : /blocked|require/);
      expect(providerCalls).toBe(['recovery', 'recovery-submitting', 'recovery-before-art-reentry'].includes(mode) ? 1 : 0);
      expect(review).toHaveBeenCalledTimes(['recovery', 'recovery-before-art-reentry'].includes(mode) ? 1 : 0);
      if (mode === 'recovery') {
        expect(owner.result).toHaveProperty('storyboardCheckpoint');
        expect(owner.result).not.toHaveProperty('storyboardScienceDiagnostics');
        await expect(handler({ prisma: db, storage: f.storage } as never, task as never)).rejects.toThrow('explicit review recovery');
        expect(providerCalls).toBe(1); expect(review).toHaveBeenCalledOnce();
      }
      if (mode === 'recovery-submitting') {
        await expect(handler({ prisma: db, storage: f.storage } as never, task as never)).rejects.toThrow('already submitted art');
        expect(providerCalls).toBe(1);
      }
      return;
    }
    if (mode === 'changed') {
      const read = f.prisma.ingestionTask.findUnique;
      read.mockImplementation(async () => {
        if (read.mock.calls.length > 1) f.ingestion.agentTask.updatedAt = new Date('2026-02-01');
        return f.ingestion;
      });
    }
    const completeStructured = vi.fn(async (_guard: unknown, messages: Array<{ content: string }>) => {
      const input = JSON.parse(messages[1]!.content);
      if (mode === 'manual' || mode === 'mixed' || mode === 'foreign-only') expect(input.paper).toBeUndefined();
      else expect(JSON.stringify(input.paper.sourceContext)).toContain('x is the driving wave propagation direction');
      throw new Error('fixture stopped at model boundary');
    });
    const reviewScientific = vi.fn(async (input: { prompt: string }) => {
      if (mode === 'diagnostics-success') expect(input.prompt).toContain('"paper":');
      else expect(input.prompt).not.toContain('"paper":');
      throw new Error('fixture stopped at saved plan review');
    });
    if (mode.startsWith('diagnostics')) {
      if (mode === 'diagnostics-reentry') owner.result = { storyboardScienceDiagnostics: {
        executionAttempt: owner.executionAttempt, candidates: [{ text: '{"private":"original paid response"}' }],
      } };
      let providerCalls = 0;
      const gateway = new AiGateway({ providers: [{ name: 'fixture', model: 'fixture', complete: async () => {
        providerCalls++;
        if (mode === 'diagnostics-stale') owner.executionAttempt++;
        if (mode === 'diagnostics-source') f.ingestion.agentTask.updatedAt = new Date('2026-02-01');
        const text = mode === 'diagnostics-success' && providerCalls > 1 ? JSON.stringify(providerCalls === 2 ? {
          title: 'Open channel', scenes: [{ title: 'Open channel', narration: 'The particle follows an open path.',
            message: 'The particle follows an open channel.', domain: 'conceptual',
            subjects: [{ description: 'The particle follows an open channel.', basis: { sourceId: 's0' } }],
            encoding: 'One arrow represents the path of subject 0.', labels: ['Open channel'], constraints: ['Conceptual, not to scale'] }],
        } : { scenes: [{ layout: 'One focused path.', treatment: 'Quiet ink.' }] }) : '{"private":"exact failed candidate"}';
        return { text, model: 'fixture', usage: { inputTokens: 1, outputTokens: 1 } };
      } }] });
      const db = { ...prisma, $transaction: async (work: (tx: typeof prisma) => Promise<unknown>) => work(prisma) };
      await expect(createPresentationGenerationHandler({ gateway: {
        completeStructured: gateway.completeStructured.bind(gateway), reviewScientific,
      } as never })(
        { prisma: db, storage: f.storage } as never, task as never)).rejects.toThrow(mode === 'diagnostics-reentry'
          ? 'explicit same-task recovery' : mode === 'diagnostics-success' ? 'fixture stopped at saved plan review'
          : mode === 'diagnostics' ? '结构化输出超过重试上限' : 'Scientific rejection evidence could not be retained');
      expect(providerCalls).toBe(mode === 'diagnostics-reentry' ? 0 : ['diagnostics', 'diagnostics-success'].includes(mode) ? 3 : 1);
      if (mode === 'diagnostics') {
        const diagnostic = owner.result!.storyboardScienceDiagnostics as { candidates: Array<{ text: string }>; sources: unknown[] };
        expect(diagnostic.candidates).toHaveLength(3);
        expect(diagnostic.candidates[2]!.text).toBe('{"private":"exact failed candidate"}');
        expect(diagnostic.sources).toEqual(expect.arrayContaining([expect.objectContaining({ sourceId: 's0', text: evidence[0]!.exactQuote })]));
        expect(owner.result).not.toHaveProperty('storyboardCheckpoint');
        expect(owner.result).not.toHaveProperty('storyboardPlanningCheckpoint');
      } else if (mode === 'diagnostics-success') {
        expect(owner.result).toHaveProperty('storyboardCheckpoint');
        expect(owner.result).not.toHaveProperty('storyboardScienceDiagnostics');
        expect(reviewScientific).toHaveBeenCalledOnce();
      } else if (mode === 'diagnostics-reentry') {
        expect(owner.result).toEqual({ storyboardScienceDiagnostics: {
          executionAttempt: 1, candidates: [{ text: '{"private":"original paid response"}' }],
        } });
      } else expect(owner.result).toBeNull();
      return;
    }
    const run = createPresentationGenerationHandler({ gateway: { completeStructured, reviewScientific } as never })(
      { prisma, storage: f.storage } as never, task as never);
    await expect(run).rejects.toThrow(mode === 'legacy-checkpoint' ? 'fixture stopped at saved plan review'
      : mode === 'legacy-partial' ? 'Saved scientific intent requires explicit same-task continuation'
      : mode === 'mixed-narrative' ? 'context evidence does not belong' : mode === 'unauthorized' ? 'source is unavailable'
      : mode === 'changed' ? 'source changed' : 'fixture stopped at model boundary');
    expect(completeStructured).toHaveBeenCalledTimes(['reviewed', 'manual', 'mixed', 'foreign-only'].includes(mode) ? 1 : 0);
    if (mode === 'legacy-checkpoint') {
      expect(reviewScientific).toHaveBeenCalledOnce();
      expect(f.prisma.ingestionTask.findUnique).not.toHaveBeenCalled();
      expect(owner.result!.storyboardCheckpoint).not.toHaveProperty('narrativeSourceIdentity');
    }
    if (mode === 'legacy-partial') {
      expect(reviewScientific).not.toHaveBeenCalled();
      expect(f.prisma.ingestionTask.findUnique).not.toHaveBeenCalled();
      expect(owner.result!.storyboardPlanningCheckpoint).not.toHaveProperty('narrativeSourceIdentity');
    }
  });

  it('keeps manual, missing-lineage and mixed-paper Claims on the existing path', () => {
    const reviewed = { extractionStatus: 'succeeded', provenance: { source: 'reviewed_ingestion', sourceTaskId: 'paper-a' } };
    expect(hasSingleReviewedVisualSource([reviewed])).toBe(true);
    expect(hasSingleReviewedVisualSource([{ ...reviewed, provenance: { sourceTaskLineage: 'paper-a' } }, reviewed])).toBe(true);
    expect(hasSingleReviewedVisualSource([])).toBe(false);
    expect(hasSingleReviewedVisualSource([{ extractionStatus: 'succeeded', provenance: {} }])).toBe(false);
    expect(hasSingleReviewedVisualSource([reviewed, { ...reviewed, provenance: {} }])).toBe(false);
    expect(hasSingleReviewedVisualSource([reviewed, { ...reviewed, provenance: { sourceTaskLineage: 'paper-b' } }])).toBe(false);
  });

  it('selects late notation and referenced figure paragraphs within the unchanged budget, with honest omissions', async () => {
    const f = await reviewedFixture();
    const resolved = await resolveVisualNarrativeSource({ prisma: f.prisma as never, storage: f.storage }, f.scope, f.evidence);
    const packet = resolved.context.sourceContext;
    const text = packet.excerpts.map(excerpt => excerpt.text).join('\n');
    expect(text).toContain('x is the driving wave propagation direction');
    expect(text).toContain('The observation angle is measured relative to positive z');
    expect(text).toContain('Two long dielectric rods, shown in cross section');
    expect(text).toContain('Its spatial FWHM is along z, whereas the gap is along y');
    expect(packet.coverage.selectedCharacters).toBe(packet.excerpts.reduce((sum, excerpt) => sum + excerpt.text.length, 0));
    expect(packet.coverage.selectedCharacters).toBeLessThanOrEqual(18_000);
    expect(packet.coverage.totalCharacters).toBe(f.sourceMap.pages.reduce((sum, page) => sum + page.blocks[0]!.text!.length, 0));
    expect(packet.coverage.complete).toBe(false);
    expect(packet.coverage.omittedSegments).toBe(f.sourceMap.pages.length - packet.excerpts.length);
    const projected = projectVisualNarrativeSource(resolved.context);
    expect(projected.sourceContext.excerpts[0]).not.toHaveProperty('sourceLocator');
    expect(JSON.stringify(projected)).not.toContain('derived/source-maps/');
    expect(f.prisma.claimNode.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      id: { in: ['claim'] }, researchObjectId: 'ro', versionId: 'version',
    } }));
  });

  it.each(['owner', 'workspace', 'manifest', 'review', 'hash'] as const)('rejects an eligible source with invalid %s before reading or disclosing source bytes', async failure => {
    const f = await reviewedFixture();
    if (failure === 'owner') f.ingestion.batch.userId = 'another-owner';
    if (failure === 'workspace') f.ingestion.artifact.workspaceId = 'another-workspace';
    if (failure === 'manifest') f.version.manifest.entries = [];
    if (failure === 'review') f.result.scientificReview.status = 'incomplete';
    if (failure === 'hash') f.result.sourceMapRef.contentHash = 'c'.repeat(64);
    await expect(resolveVisualNarrativeSource({ prisma: f.prisma as never, storage: f.storage }, f.scope, f.evidence)).rejects.toThrow();
    expect(f.storage.getObject).not.toHaveBeenCalled();
  });

  it('rejects evidence from another artifact and preserves existing freshness identity', async () => {
    const f = await reviewedFixture();
    expect(() => selectVisualSourceContext(f.sourceMap, f.result, [{ ...f.evidence[0]!, contentHash: 'd'.repeat(64) }])).toThrow();
    const first = await readVisualNarrativeSource(f.prisma as never, f.scope);
    f.ingestion.agentTask.updatedAt = new Date('2026-02-01');
    expect((await readVisualNarrativeSource(f.prisma as never, f.scope)).identity).not.toBe(first.identity);
  });

  it('keeps a late neighboring caption and its definition when OCR evidence is stored after many page blocks', () => {
    const sourceMap = sourceMapFixture();
    sourceMap.pages = sourceMap.pages.slice(0, 37);
    const block = (id: string, text: string, kind: 'paragraph' | 'caption' = 'paragraph') => ({ id, text, kind,
      boundingBox: { x: 0, y: 0, width: 600, height: 60 }, parser: sourceMap.parser, transformations: [] });
    sourceMap.pages.push({ page: 48, width: 600, height: 800, blocks: [
      block('late-definition', 'The aperture width and spatial intensity width are measured along distinct directions.'),
      block('late-caption', 'Fig. S8. This cross section shows two dielectric rods and the open particle path.', 'caption'),
    ] }, { page: 49, width: 600, height: 800, blocks: [
      ...Array.from({ length: 15 }, (_, index) => block(`page-layout-${index}`, 'Separate extracted page material. '.repeat(25))),
      block('ocr-evidence', 'The particle interacts with the confined driving field inside an open channel.'),
    ] });
    const selected = selectVisualSourceContext(sourceMap, {}, [{ artifactId: sourceMap.artifactId, contentHash: sourceMap.contentHash,
      locator: createBlockSourceLocator(sourceMap, 'ocr-evidence') }]);
    const text = selected.excerpts.map(excerpt => excerpt.text).join('\n');
    expect(text).toContain('This cross section shows two dielectric rods');
    expect(text).toContain('aperture width and spatial intensity width are measured along distinct directions');
    expect(selected.coverage.selectedCharacters).toBeLessThanOrEqual(18_000);
    expect(selected.coverage.complete).toBe(false);
  });

  it('prioritizes late Evidence and flattened notation before the default 120k writing cutoff', () => {
    const sourceMap = sourceMapFixture();
    const template = sourceMap.pages[0]!;
    sourceMap.pages = Array.from({ length: 120 }, (_, index) => ({ ...template, page: index + 1,
      blocks: [{ ...template.blocks[0]!, id: `long-${index}`, text: 'Unrelated background measurement details. '.repeat(40) }] }));
    sourceMap.pages.push({ ...template, page: 121, blocks: [{ ...template.blocks[0]!, id: 'late-flat',
      text: 'Supplementary context.\nNotations\nThe optical wave, its polarization, and the particle trajectory use three distinct axes.' }] },
    { ...template, page: 122, blocks: [{ ...template.blocks[0]!, id: 'late-evidence',
      text: 'The particle traverses the central aperture. The preceding notation defines the directions.' }] });
    const writing = createWritingSourcePacket(sourceMap, {});
    expect(writing.coverage.selectedCharacters).toBeLessThanOrEqual(120_000);
    expect(writing.excerpts.some(excerpt => excerpt.sourceLocator.blockId === 'late-flat')).toBe(false);
    const selected = selectVisualSourceContext(sourceMap, {}, [{ artifactId: sourceMap.artifactId, contentHash: sourceMap.contentHash,
      locator: createBlockSourceLocator(sourceMap, 'late-evidence') }]);
    expect(selected.excerpts.some(excerpt => excerpt.sourceLocator.blockId === 'late-flat')).toBe(true);
    expect(selected.excerpts.some(excerpt => excerpt.sourceLocator.blockId === 'late-evidence')).toBe(true);
    expect(selected.coverage.selectedCharacters).toBeLessThanOrEqual(18_000);
    expect(selected.coverage.totalCharacters).toBe(writing.coverage.totalCharacters);
    expect(selected.coverage.complete).toBe(false);
    expect(selected.coverage.omittedSegments).toBeGreaterThan(writing.coverage.omittedSegments);
  });

  it('preserves default writing order and exact citation materialization without selection options', () => {
    const sourceMap = sourceMapFixture();
    sourceMap.pages = sourceMap.pages.slice(0, 4);
    sourceMap.pages[0]!.blocks[0]!.kind = 'reference';
    sourceMap.pages[1]!.blocks[0]!.kind = 'heading';
    const result = { evidenceSegments: { method: [{ sourceLocator: createBlockSourceLocator(sourceMap, 'b3') }] } };
    const packet = createWritingSourcePacket(sourceMap, result);
    expect(packet.excerpts.map(excerpt => excerpt.sourceLocator.blockId)).toEqual(['b3', 'b1', 'b2', 'b0']);
    expect(packet.excerpts.map(excerpt => excerpt.id)).toEqual(['S1', 'S2', 'S3', 'S4']);
    expect(packet.coverage).toMatchObject({ complete: true, omittedSegments: 0 });
    expect(packet.coverage.selectedCharacters).toBe(packet.coverage.totalCharacters);
    const citations = materializeWritingCitations('The reviewed source supports this statement [S1].', ['S1'], packet.excerpts);
    expect(citations).toEqual([{ id: 'S1', marker: '[S1]', quote: sourceMap.pages[3]!.blocks[0]!.text,
      sourceLocator: packet.excerpts[0]!.sourceLocator }]);
  });

  it('retains definition tables across page-number gaps and page continuation, ending at the next physical section', () => {
    const sourceMap = sourceMapFixture();
    sourceMap.pages = sourceMap.pages.slice(0, 37);
    const block = (id: string, kind: 'heading' | 'paragraph' | 'table', text: string, y: number) => ({ id, kind, text,
      boundingBox: { x: 60, y, width: 460, height: 25 }, parser: sourceMap.parser, transformations: [] });
    sourceMap.pages.push({ page: 48, width: 600, height: 800, blocks: [
      block('symbol-heading', 'heading', 'Symbols', 80),
      block('symbol-intro', 'paragraph', 'The following table defines the notation used in this section.', 120),
      block('page-number', 'paragraph', '48', 760),
      block('table-start', 'table', 'u: optical propagation. v: electric polarization. w: particle incidence.', 180),
    ] }, { page: 49, width: 600, height: 800, blocks: [
      block('continued-intro', 'paragraph', 'The remaining definitions continue below.', 80),
      block('next-heading', 'heading', 'Independent results', 500),
      block('next-paragraph', 'paragraph', 'This unrelated section reports a separate experiment.', 550),
      // Docling appends tables after the text stream; page geometry locates the continued table before the next heading.
      block('table-continued', 'table', 'α: observation angle relative to w. W: spatial intensity width along w.', 150),
      block('results-table', 'table', 'Unrelated experiment data that must not receive notation priority.', 600),
    ] });
    const selected = selectVisualSourceContext(sourceMap, {}, [{ artifactId: sourceMap.artifactId, contentHash: sourceMap.contentHash,
      locator: createBlockSourceLocator(sourceMap, 'b0') }]);
    const blocks = selected.excerpts.map(excerpt => excerpt.sourceLocator.blockId);
    expect(blocks).toContain('table-start');
    expect(blocks).toContain('table-continued');
    expect(blocks).not.toContain('results-table');
    expect(selected.excerpts.find(excerpt => excerpt.sourceLocator.blockId === 'table-continued')!.text)
      .toContain('observation angle relative to w');
    expect(selected.coverage.selectedCharacters).toBeLessThanOrEqual(18_000);
    expect(selected.coverage.complete).toBe(false);
  });

  it.each(['absent', 'partial', 'complete'] as const)('only demotes duplicate context with proven complete range coverage (%s)', range => {
    const sourceMap = sourceMapFixture();
    const block = (id: string, kind: 'heading' | 'paragraph' | 'caption' | 'table', text: string, y: number) => ({ id, kind, text,
      boundingBox: { x: 60, y, width: 460, height: 40 }, parser: sourceMap.parser, transformations: [] });
    const paragraph = 'As shown in Fig. 7, the geometry has an important qualifier. ' + 'The condition remains essential. '.repeat(30);
    sourceMap.pages = [{ page: 1, width: 600, height: 800, blocks: [
      block('bound-paragraph', 'paragraph', paragraph, 80),
      block('caption-a', 'caption', 'Fig. 7. A source-grounded geometry.', 180),
      block('other-context-a', 'paragraph', 'Another part of the apparatus. '.repeat(50), 280),
      block('caption-b', 'caption', 'Fig. 8. Another component.', 380),
      block('other-context-b', 'paragraph', 'A separate operating condition. '.repeat(45), 480),
    ] }, { page: 9, width: 600, height: 800, blocks: [block('page-footer', 'paragraph', '9', 740)] },
    { page: 10, width: 600, height: 800, blocks: [
      block('notation-heading', 'heading', 'Notations', 80),
      block('notation-table', 'table', 'Definition entry. '.repeat(900), 140),
    ] }];
    const locator = createBlockSourceLocator(sourceMap, 'bound-paragraph', range === 'absent' ? {}
      : { charRange: { start: 0, end: range === 'complete' ? paragraph.length : 30 } });
    const selected = selectVisualSourceContext(sourceMap, {}, [{ artifactId: sourceMap.artifactId, contentHash: sourceMap.contentHash, locator }]);
    expect(selected.excerpts.some(excerpt => excerpt.sourceLocator.blockId === 'bound-paragraph')).toBe(range !== 'complete');
    expect(selected.coverage.selectedCharacters).toBeLessThanOrEqual(18_000);
    expect(selected.coverage.complete).toBe(false);
  });
});
