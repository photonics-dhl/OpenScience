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
import { RESEARCH_INTELLIGENCE_CORPUS } from './support/research-intelligence-corpus';

describe('Task 8 acceptance runner production composition', () => {
  it.each([
    {
      id: 'table-xlsx-en', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      format: 'xlsx', reason: 'structured-xlsx-review-required',
    },
    {
      id: 'table-csv-mixed', mimeType: 'text/csv',
      format: 'csv', reason: 'structured-csv-review-required',
    },
  ])('keeps $id at needs_review with locator 1/1 and no eleventh structured fake', async ({
    id, mimeType, format, reason,
  }) => {
    const fixture = RESEARCH_INTELLIGENCE_CORPUS.find((candidate) => candidate.id === id);
    expect(fixture).toBeDefined();
    if (!fixture) return;
    const digest = createHash('sha256').update(fixture.content).digest('hex');
    const artifactId = `artifact-${id}`;
    const stageAdapter = createSidecarParserStageProcessor(createDefaultIngestionAdapters());
    const fields = ['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'];
    const gatewaySeam = createAcceptanceGatewaySeam({
      schemaVersion: '0.1.0',
      fields: Object.fromEntries(fields.map((field) => [field, {
        summary: '', sourceQuote: '', needsMoreInformation: true,
      }])),
    });
    for (let index = 0; index < 10; index += 1) {
      await gatewaySeam.gateway.completeStructured();
    }
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
    const dependencies = {
      storage: { getObject: async () => ({ body: Readable.from([fixture.content]), size: fixture.content.length }) },
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

    expect(handlerResult).toEqual({
      status: 'needs_review', format, reason,
    });
    expect(classifyAcceptanceHandlerResult(handlerResult)).toBe('needs_review');
    expect(cascadeResult?.status).toBe('needs_review');
    if (cascadeResult?.status !== 'needs_review') return;
    const locatorMatches = fixture.expectedLocators.filter((locator) => reproduceAcceptanceLocator(
      cascadeResult!.sourceMap,
      locator,
      { artifactId, contentHash: digest },
    )).length;
    expect({ locatorMatches, locatorTotal: fixture.expectedLocators.length }).toEqual({
      locatorMatches: 1, locatorTotal: 1,
    });
    expect(gatewaySeam.snapshot()).toEqual({
      structuredFake: 10,
      externalProvider: 0,
      forbidden: { complete: 0, ocr: 0, stream: 0, unknown: 0 },
    });
  });
});
