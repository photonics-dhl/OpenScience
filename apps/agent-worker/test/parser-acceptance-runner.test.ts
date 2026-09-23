import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

import type { AiGateway } from '@openscience/ai-gateway';
import { Prisma } from '@prisma/client';

import { createHandlers, createWorkerParserCascade } from '../src/index';
import { createDefaultIngestionAdapters } from '../src/ingestion-parser';
import {
  classifyAcceptanceHandlerResult,
  createAcceptanceGatewaySeam,
  reproduceAcceptanceLocator,
} from '../src/parser-acceptance-contract';
import { createSidecarParserStageProcessor } from '../src/parser-job-isolation';
import { PDF_TEXT_ITEM_METADATA } from '../src/parsers/native-pdf-contract';
import {
  buildAcceptanceProposal,
  canonicalAcceptanceReviewReasons,
} from '../src/parser-acceptance-runner';
import { RESEARCH_INTELLIGENCE_CORPUS } from './support/research-intelligence-corpus';

describe('Task 8 acceptance runner production composition', () => {
  it('builds the bounded semantic bridge fake from exact canonical passage ids', () => {
    const value = buildAcceptanceProposal([undefined, [
      { role: 'system', content: 'fields chosenRepresentativeCase' },
      { role: 'user', content: '[P00001 page:1 blocks:1 chars:22]\nExact fixture passage.\n[/P00001]' },
    ]]) as { fields: Record<string, unknown>; chosenRepresentativeCase: string | null };

    expect(value.fields.problem).toEqual([{
      statement: 'Exact fixture passage.', type: 'observation', conditionCase: '', comparison: null,
      operation: null, evidenceIds: ['P00001'],
    }]);
    expect(value.fields.method).toEqual([]);
    expect(value.chosenRepresentativeCase).toBeNull();
  });

  it('builds the final composition fake from the selected canonical passage only', () => {
    const value = buildAcceptanceProposal([undefined, [
      { role: 'system', content: 'scientific summary' },
      { role: 'user', content: '从下列原始P段重新组织六段研究精华\n\n[P00007 page:2 blocks:1 chars:17]\nMeasured fixture.\n[/P00007]' },
    ]]) as { fields: Record<string, { summary: string; sourcePassageIds: string[] }>; needsMoreEvidence: unknown[] };
    expect(value.fields.problem).toEqual({
      summary: '验收来源记录：Measured fixture.', sourcePassageIds: ['P00007'],
    });
    expect(value.fields.results).toEqual({ summary: '', sourcePassageIds: [] });
    expect(value.needsMoreEvidence).toEqual([]);
  });

  it.each([
    ['corrupt-pdf-en', ['parser-failed', 'page_inventory failed', 'all local parser stages failed'], 'unreadable-or-corrupt-document'],
    ['scan-png-empty', ['parser-failed', 'all local parser stages failed'], 'no-meaningful-content'],
  ])('canonicalizes only the exact bounded cascade reasons for %s', (id, reasons, canonical) => {
    const fixture = RESEARCH_INTELLIGENCE_CORPUS.find((candidate) => candidate.id === id)!;
    expect(canonicalAcceptanceReviewReasons(fixture, { status: 'needs_review', reasons } as never))
      .toEqual([canonical]);
    expect(() => canonicalAcceptanceReviewReasons(fixture, {
      status: 'needs_review', reasons: ['parser-unavailable'],
    } as never)).toThrow(/review reason evidence/i);
    expect(() => canonicalAcceptanceReviewReasons(fixture, {
      status: 'needs_review', reasons: [...reasons, 'provider exception'],
    } as never)).toThrow(/review reason evidence/i);
  });

  it('canonicalizes formula review only with the exact unresolved reason and native equation evidence', () => {
    const fixture = RESEARCH_INTELLIGENCE_CORPUS.find(({ id }) => id === 'formula-pdf-en')!;
    const equation = {
      id: 'formula-equation', kind: 'equation', text: 'I(t) = I0 exp(-t/tau)',
      boundingBox: { x: 54, y: 100, width: 96.372, height: 12 },
      parser: PDF_TEXT_ITEM_METADATA,
      transformations: [{ stage: 'extract_text', processor: PDF_TEXT_ITEM_METADATA }],
    };
    const result = {
      status: 'needs_review', reasons: ['unresolved pages remain'],
      sourceMap: {
        artifactId: 'formula', contentHash: createHash('sha256').update(fixture.content).digest('hex'),
        parser: PDF_TEXT_ITEM_METADATA,
        pages: [{ page: 1, width: 612, height: 792, blocks: [equation] }],
      },
    };
    expect(canonicalAcceptanceReviewReasons(fixture, result as never))
      .toEqual(['formula-visual-transcription-required']);
    expect(() => canonicalAcceptanceReviewReasons(fixture, {
      ...result, reasons: ['unresolved pages remain', 'provider exception'],
    } as never)).toThrow(/review reason evidence/i);
    expect(() => canonicalAcceptanceReviewReasons(fixture, {
      ...result,
      sourceMap: { ...result.sourceMap, pages: [{ ...result.sourceMap.pages[0]!, blocks: [] }] },
    } as never)).toThrow(/native equation evidence/i);
  });

  it.each([
    {
      id: 'table-xlsx-en', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      expectedQuotes: ['Evidence', 'Claim', 'Value', 'pulse_width_fs', '42'],
    },
    {
      id: 'table-csv-mixed', mimeType: 'text/csv',
      expectedQuotes: ['metric', 'value', 'unit', 'pulse_width', '42'],
    },
    { id: 'notebook-en', mimeType: 'application/x-ipynb+json', expectedQuotes: ['pulse_width_fs = 42'] },
    {
      id: 'python-code-en', mimeType: 'text/x-python',
      expectedQuotes: ['# Self-authored corpus fixture', 'pulse_width_fs = 42'],
    },
  ])('accepts actionable $id with its full locator and two structured semantic fakes', async ({
    id, mimeType, expectedQuotes,
  }) => {
    const fixture = RESEARCH_INTELLIGENCE_CORPUS.find((candidate) => candidate.id === id);
    expect(fixture).toBeDefined();
    if (!fixture) return;
    const digest = createHash('sha256').update(fixture.content).digest('hex');
    const artifactId = `artifact-${id}`;
    const stageAdapter = createSidecarParserStageProcessor(createDefaultIngestionAdapters());
    const gatewaySeam = createAcceptanceGatewaySeam(buildAcceptanceProposal);
    const canonicalCascade = createWorkerParserCascade(
      gatewaySeam.gateway as unknown as AiGateway,
      stageAdapter,
    );
    let cascadeResult: Awaited<ReturnType<typeof canonicalCascade>> | undefined;
    const parserCascade = Object.assign(async (...args: Parameters<typeof canonicalCascade>) => {
      cascadeResult = await canonicalCascade(...args);
      return cascadeResult;
    }, { featureFlags: canonicalCascade.featureFlags });
    const handlers = createHandlers(gatewaySeam.gateway as unknown as AiGateway, {
      parserCascade,
      externalProcessingPolicy: async () => false,
    });
    const derivedObjects = new Map<string, Buffer>();
    const taskId = `accept-${id}`;
    const sessionId = `accept-session-${id}`;
    const researchObject = {
      id: 'accept-ro', workspaceId: 'accept-workspace', deletedAt: null,
      workspace: { id: 'accept-workspace', status: 'active' },
    };
    const session = {
      id: sessionId, userId: 'accept-user', researchObjectId: researchObject.id,
      status: 'active', deletedAt: null, researchObject,
    };
    const taskPayload = { artifactId, researchObjectId: researchObject.id };
    const ownerTask = {
      id: taskId, kind: 'sdf.extract', status: 'running', executionAttempt: 1,
      sessionId, payload: taskPayload, result: null as unknown, deletedAt: null,
      idempotencyKey: null, session,
    };
    const artifact = {
      id: artifactId, workspaceId: researchObject.workspaceId, size: fixture.content.length,
      blobSha256: digest, logicalPath: fixture.filename, mimeType,
      deletedAt: null, bytesPurgedAt: null,
    };
    const sameJson = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
    const artifactMatches = (where: Record<string, unknown>) => where.id === artifact.id
      && where.workspaceId === artifact.workspaceId && where.blobSha256 === artifact.blobSha256
      && where.size === artifact.size && where.deletedAt === artifact.deletedAt
      && where.bytesPurgedAt === artifact.bytesPurgedAt;
    const taskMatches = (where: Record<string, unknown>) => {
      const expectedSession = where.session as {
        status?: unknown; deletedAt?: unknown; userId?: unknown; researchObjectId?: unknown;
        researchObject?: Record<string, unknown>;
      } | undefined;
      const expectedPayload = where.payload as { equals?: unknown } | undefined;
      const alternatives = Array.isArray(where.OR)
        ? where.OR as Array<{ result?: { equals?: unknown } }>
        : [];
      const resultMatches = alternatives.some((alternative) => ownerTask.result === null
        ? alternative.result?.equals === Prisma.AnyNull
        : sameJson(alternative.result?.equals, ownerTask.result));
      return where.id === ownerTask.id && where.kind === ownerTask.kind && where.status === ownerTask.status
        && where.executionAttempt === ownerTask.executionAttempt && where.sessionId === ownerTask.sessionId
        && where.deletedAt === ownerTask.deletedAt && expectedSession?.status === session.status
        && expectedSession.deletedAt === session.deletedAt && expectedSession.userId === session.userId
        && expectedSession.researchObjectId === session.researchObjectId
        && expectedSession.researchObject?.deletedAt === researchObject.deletedAt
        && expectedSession.researchObject.workspaceId === researchObject.workspaceId
        && sameJson(expectedPayload?.equals, ownerTask.payload) && resultMatches;
    };
    type AcceptancePrisma = {
      $executeRaw: (...args: unknown[]) => Promise<number>;
      agentTask: {
        findUnique: () => Promise<typeof ownerTask>;
        updateMany: (args: {
          where: Record<string, unknown>; data: { result?: unknown };
        }) => Promise<{ count: number }>;
      };
      membership: { findUnique: () => Promise<{ userId: string; workspaceId: string; role: string }> };
      artifact: {
        findUnique: () => Promise<typeof artifact>;
        findFirst: (args: { where: Record<string, unknown> }) => Promise<{ id: string } | null>;
      };
      $transaction: <T>(callback: (tx: AcceptancePrisma) => Promise<T>, options?: unknown) => Promise<T>;
    };
    const prisma: AcceptancePrisma = {
      $executeRaw: async () => 1,
      agentTask: {
        findUnique: async () => ownerTask,
        updateMany: async ({ where, data }) => {
          if (!Object.hasOwn(data, 'result') || !taskMatches(where)) return { count: 0 };
          ownerTask.result = data.result;
          return { count: 1 };
        },
      },
      membership: { findUnique: async () => ({
        userId: session.userId, workspaceId: researchObject.workspaceId, role: 'author',
      }) },
      artifact: {
        findUnique: async () => artifact,
        findFirst: async ({ where }) => artifactMatches(where) ? { id: artifact.id } : null,
      },
      $transaction: async <T>(callback: (tx: AcceptancePrisma) => Promise<T>) => callback(prisma),
    };
    const dependencies = {
      storage: {
        getObject: async (key: string) => {
          const derived = derivedObjects.get(key);
          return derived
            ? { body: Readable.from([derived]), size: derived.length }
            : { body: Readable.from([fixture.content]), size: fixture.content.length };
        },
        headObject: async (key: string) => {
          const derived = derivedObjects.get(key);
          return derived ? { size: derived.length, etag: 'fixture' } : null;
        },
        putObject: async (key: string, body: Buffer | Readable) => {
          const chunks: Buffer[] = [];
          if (Buffer.isBuffer(body)) chunks.push(body);
          else for await (const chunk of body) chunks.push(Buffer.from(chunk));
          const value = Buffer.concat(chunks);
          derivedObjects.set(key, value);
          return { key, size: value.length, etag: 'fixture' };
        },
        deleteObject: async (key: string) => void derivedObjects.delete(key),
      },
      malwareScanner: vi.fn(async () => undefined),
      prisma,
    };

    const handlerResult = await handlers['sdf.extract']!(dependencies as never, {
      id: taskId,
      payload: taskPayload,
      executionAttempt: 1,
    });

    expect(classifyAcceptanceHandlerResult(handlerResult, true)).toBe('completed');
    expect(ownerTask.result).toEqual({
      sourceMapRef: (handlerResult as { sourceMapRef: unknown }).sourceMapRef,
    });
    expect(cascadeResult?.status).toBe('succeeded');
    if (cascadeResult?.status !== 'succeeded') return;
    const extraction = handlerResult as unknown as {
      evidenceSegments: { problem: Array<{ quote: string; sourceLocator: Parameters<typeof reproduceAcceptanceLocator>[1] }> };
    };
    expect(extraction.evidenceSegments.problem.map(({ quote }) => quote)).toEqual(expectedQuotes);
    for (const exactSegment of extraction.evidenceSegments.problem) {
      const sourceBlock = cascadeResult.sourceMap.pages.flatMap((page) => page.blocks)
        .find((block) => block.id === exactSegment.sourceLocator.blockId)!;
      expect(sourceBlock.text?.slice(
        exactSegment.sourceLocator.charRange!.start,
        exactSegment.sourceLocator.charRange!.end,
      )).toBe(exactSegment.quote);
    }
    const locatorMatches = fixture.expectedLocators.filter((locator) => reproduceAcceptanceLocator(
      cascadeResult!.sourceMap,
      locator,
      { artifactId, contentHash: digest },
    )).length;
    expect({ locatorMatches, locatorTotal: fixture.expectedLocators.length }).toEqual({
      locatorMatches: 1, locatorTotal: 1,
    });
    expect(gatewaySeam.snapshot()).toEqual({
      structuredFake: 2,
      externalProvider: 0,
      forbidden: { complete: 0, ocr: 0, stream: 0, unknown: 0 },
    });
  });
});
