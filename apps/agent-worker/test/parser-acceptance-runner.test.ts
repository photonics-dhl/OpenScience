import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

import type { AiGateway } from '@openscience/ai-gateway';

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
    },
    {
      id: 'table-csv-mixed', mimeType: 'text/csv',
    },
    { id: 'notebook-en', mimeType: 'application/x-ipynb+json' },
    { id: 'python-code-en', mimeType: 'text/x-python' },
  ])('accepts actionable $id with its full locator and two structured semantic fakes', async ({
    id, mimeType,
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
      prisma: {
        agentTask: { findUnique: async () => ({
          id: `accept-${id}`, kind: 'sdf.extract', status: 'running',
          session: { userId: 'accept-user', researchObject: {
            id: 'accept-ro', workspaceId: 'accept-workspace', workspace: { id: 'accept-workspace', status: 'active' },
          } },
        }) },
        membership: { findUnique: async () => ({
          userId: 'accept-user', workspaceId: 'accept-workspace', role: 'author',
        }) },
        artifact: { findUnique: async () => ({
          id: artifactId, workspaceId: 'accept-workspace', size: fixture.content.length,
          blobSha256: digest, logicalPath: fixture.filename,
          mimeType,
        }) },
      },
    };

    const handlerResult = await handlers['sdf.extract']!(dependencies as never, {
      id: `accept-${id}`,
      payload: { artifactId, researchObjectId: 'accept-ro' },
      executionAttempt: 1,
    });

    expect(classifyAcceptanceHandlerResult(handlerResult, true)).toBe('completed');
    expect(cascadeResult?.status).toBe('succeeded');
    if (cascadeResult?.status !== 'succeeded') return;
    const extraction = handlerResult as unknown as {
      evidenceSegments: { problem: Array<{ quote: string; sourceLocator: Parameters<typeof reproduceAcceptanceLocator>[1] }> };
    };
    expect(extraction.evidenceSegments.problem).toHaveLength(1);
    const exactSegment = extraction.evidenceSegments.problem[0]!;
    const sourceBlock = cascadeResult.sourceMap.pages.flatMap((page) => page.blocks)
      .find((block) => block.id === exactSegment.sourceLocator.blockId)!;
    expect(sourceBlock.text?.slice(
      exactSegment.sourceLocator.charRange!.start,
      exactSegment.sourceLocator.charRange!.end,
    )).toBe(exactSegment.quote);
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
