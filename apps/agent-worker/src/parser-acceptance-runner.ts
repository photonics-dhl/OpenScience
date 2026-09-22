import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';

import type { AiGateway } from '@openscience/ai-gateway';
import { Prisma } from '@prisma/client';

import { createHandlers, createWorkerParserCascade } from './index';
import {
  ACCEPTANCE_PROFILE,
  CANONICAL_CORPUS_MANIFEST_SHA256,
  type AcceptanceManifestCase,
  classifyAcceptanceHandlerResult,
  createAcceptanceGatewaySeam,
  parseCanonicalManifest,
  reproduceAcceptanceLocator,
  validateAcceptanceDraft,
  writeAtomicAcceptanceReport,
} from './parser-acceptance-contract';
import {
  createParserStageJobClient,
  expectedSidecarParserMetadata,
} from './parser-job-isolation';
import { canonicalParserMediaType } from './parser-media-type';

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

const ACCEPTANCE_FIELDS = ['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'] as const;

/**
 * The acceptance gateway is deterministic, but it still exercises the canonical
 * block-ID contract. Explicit fixture labels become reviewed extraction fields;
 * no text or locator is invented by the runner.
 */
export function buildAcceptanceProposal(gatewayArgs: unknown[]) {
  const prompt = Array.isArray(gatewayArgs[1]) ? gatewayArgs[1] : [];
  const userMessage = prompt.find((message) => message && typeof message === 'object'
    && (message as { role?: unknown }).role === 'user') as { content?: unknown } | undefined;
  const source = typeof userMessage?.content === 'string' ? userMessage.content : '';
  const blocks = [...source.matchAll(/--- SOURCE_BLOCK id:(B\d{6}) ---\n([\s\S]*?)(?=\n\n--- SOURCE_BLOCK id:B\d{6} ---|$)/gu)]
    .map((match) => ({ id: match[1]!, text: match[2]!.trim() }));
  const selected = new Map<string, { id: string; summary: string }>();
  for (const block of blocks) {
    const label = /^(problem|insight|method|results|limitations|reproducibility)\s*:\s*([\s\S]+)$/iu.exec(block.text);
    if (!label) continue;
    const field = label[1]!.toLowerCase();
    if (!selected.has(field) && label[2]!.trim()) {
      selected.set(field, { id: block.id, summary: label[2]!.trim() });
    }
  }
  // Canonical corpus files are parser fixtures rather than semantic SDF fixtures.
  // Select one exact bounded block so successful cases exercise materialization
  // and locator round-trip instead of passing with an all-missing response.
  if (selected.size === 0 && blocks[0] && blocks[0].text.length <= 8_000) {
    selected.set('problem', { id: blocks[0].id, summary: blocks[0].text });
  }
  return {
    schemaVersion: '0.1.0',
    fields: Object.fromEntries(ACCEPTANCE_FIELDS.map((field) => {
      const evidence = selected.get(field);
      return [field, evidence
        ? { summary: evidence.summary, sourceBlockIds: [evidence.id], needsMoreInformation: false }
        : { summary: '', sourceBlockIds: [], needsMoreInformation: true }];
    })),
  };
}

type AcceptanceCascadeResult = Awaited<ReturnType<ReturnType<typeof createWorkerParserCascade>>>;

const INTENTIONAL_REVIEW_EVIDENCE = Object.freeze({
  'corrupt-pdf-en': {
    canonical: 'unreadable-or-corrupt-document',
    cascadeReasons: ['parser-failed', 'page_inventory failed', 'all local parser stages failed'],
  },
  'scan-png-empty': {
    canonical: 'no-meaningful-content',
    cascadeReasons: ['parser-failed', 'all local parser stages failed'],
  },
});

export function canonicalAcceptanceReviewReasons(
  item: AcceptanceManifestCase,
  result: AcceptanceCascadeResult | undefined,
): string[] {
  if (result?.status !== 'needs_review') return [];
  const evidence = INTENTIONAL_REVIEW_EVIDENCE[item.id as keyof typeof INTENTIONAL_REVIEW_EVIDENCE];
  if (evidence === undefined) return [];
  if (JSON.stringify(result.reasons) !== JSON.stringify(evidence.cascadeReasons)) {
    throw new Error(`unexpected intentional review reason evidence: ${item.id}`);
  }
  return [evidence.canonical];
}

async function main(): Promise<void> {
  const [corpusDir, reportPath, sourceSha, workerImageId, parserImageId] = process.argv.slice(2);
  if (!corpusDir || !reportPath || !/^[a-f0-9]{40}$/.test(sourceSha ?? '')
    || !/^sha256:[a-f0-9]{64}$/.test(workerImageId ?? '')
    || !/^sha256:[a-f0-9]{64}$/.test(parserImageId ?? '')) {
    throw new Error('usage: parser-acceptance-runner <corpus> <report> <sha> <worker-image-id> <parser-image-id>');
  }
  const manifest = parseCanonicalManifest(await readFile(join(corpusDir, 'manifest.json')));
  const jobDir = process.env.PARSER_JOB_DIR ?? '/parser-jobs';
  const stageAdapter = createParserStageJobClient(jobDir, expectedSidecarParserMetadata);
  const gatewaySeam = createAcceptanceGatewaySeam(buildAcceptanceProposal);
  const gateway = gatewaySeam.gateway as unknown as AiGateway;
  const canonicalCascade = createWorkerParserCascade(gateway, stageAdapter);
  const results = [];
  let falseReadyCount = 0;

  for (const item of manifest.cases) {
    const bytes = await readFile(join(corpusDir, basename(item.filename)));
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== item.sha256) throw new Error(`fixture hash mismatch: ${item.id}`);
    let cascadeResult: Awaited<ReturnType<typeof canonicalCascade>> | undefined;
    const parserCascade = Object.assign(async (...args: Parameters<typeof canonicalCascade>) => {
      cascadeResult = await canonicalCascade(...args);
      return cascadeResult;
    }, {
      featureFlags: canonicalCascade.featureFlags,
      renderPages: canonicalCascade.renderPages,
    });
    const handlers = createHandlers(gateway, { parserCascade, externalProcessingPolicy: async () => false });
    const malwareScanner = async () => undefined;
    const derivedObjects = new Map<string, Buffer>();
    const taskId = `accept-${item.id}`;
    const artifactId = `artifact-${item.id}`;
    const sessionId = `accept-session-${item.id}`;
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
      id: artifactId, workspaceId: researchObject.workspaceId, size: bytes.length,
      blobSha256: digest, logicalPath: item.filename,
      mimeType: canonicalParserMediaType(item.filename), deletedAt: null, bytesPurgedAt: null,
    };
    const sameJson = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
    const artifactMatches = (where: Record<string, unknown>) => where.id === artifact.id
      && where.workspaceId === artifact.workspaceId && where.blobSha256 === artifact.blobSha256
      && where.size === artifact.size && where.deletedAt === artifact.deletedAt
      && where.bytesPurgedAt === artifact.bytesPurgedAt;
    const taskMatches = (where: Record<string, unknown>) => {
      const expectedSession = where.session as { status?: unknown; deletedAt?: unknown; userId?: unknown; researchObjectId?: unknown; researchObject?: Record<string, unknown> } | undefined;
      const expectedPayload = where.payload as { equals?: unknown } | undefined;
      const alternatives = Array.isArray(where.OR) ? where.OR as Array<{ result?: { equals?: unknown } }> : [];
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
        updateMany: (args: { where: Record<string, unknown>; data: { result?: unknown } }) => Promise<{ count: number }>;
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
        updateMany: async ({ where, data }: { where: Record<string, unknown>; data: { result?: unknown } }) => {
          if (!Object.hasOwn(data, 'result') || !taskMatches(where)) return { count: 0 };
          ownerTask.result = data.result;
          return { count: 1 };
        },
      },
      membership: { findUnique: async () => ({
        userId: 'accept-user', workspaceId: 'accept-workspace', role: 'author',
      }) },
      artifact: {
        findUnique: async () => artifact,
        findFirst: async ({ where }: { where: Record<string, unknown> }) => artifactMatches(where) ? { id: artifact.id } : null,
      },
      $transaction: async <T>(callback: (tx: AcceptancePrisma) => Promise<T>) => callback(prisma),
    };
    const deps = {
      storage: {
        getObject: async (key: string) => {
          const derived = derivedObjects.get(key);
          return derived
            ? { body: Readable.from([derived]), size: derived.length }
            : { body: Readable.from([bytes]), size: bytes.length };
        },
        headObject: async (key: string) => {
          const derived = derivedObjects.get(key);
          return derived ? { size: derived.length, etag: 'acceptance' } : null;
        },
        putObject: async (key: string, body: Buffer | Readable) => {
          const chunks: Buffer[] = [];
          if (Buffer.isBuffer(body)) chunks.push(body);
          else for await (const chunk of body) chunks.push(Buffer.from(chunk));
          const value = Buffer.concat(chunks);
          derivedObjects.set(key, value);
          return { key, size: value.length, etag: 'acceptance' };
        },
        deleteObject: async (key: string) => void derivedObjects.delete(key),
      },
      malwareScanner,
      prisma,
    };
    const started = performance.now();
    let failureStatus: string | undefined;
    let handlerStatus = 'failed';
    try {
      const handlerResult = await handlers['sdf.extract']!(deps as never, {
        id: taskId,
        payload: taskPayload,
        executionAttempt: 1,
      });
      handlerStatus = classifyAcceptanceHandlerResult(handlerResult);
    } catch (error) {
      failureStatus = error instanceof Error ? 'handler-execution-failed' : 'unknown-failure';
    }
    const elapsedMs = Math.round((performance.now() - started) * 100) / 100;
    const sourceMap = cascadeResult && cascadeResult.status !== 'blocked' && cascadeResult.status !== 'failed'
      ? cascadeResult.sourceMap : undefined;
    const reproduced = sourceMap
      ? item.expectedLocators.filter((locator) => reproduceAcceptanceLocator(sourceMap, locator, {
        artifactId, contentHash: digest,
      })).length : 0;
    const ready = cascadeResult?.status === 'succeeded';
    const falseReady = ready && reproduced !== item.expectedLocators.length;
    if (falseReady) falseReadyCount += 1;
    const blocks = sourceMap?.pages.flatMap(({ blocks: pageBlocks }) => pageBlocks) ?? [];
    results.push({
      id: item.id,
      contentHash: digest,
      status: cascadeResult?.status ?? 'failed',
      handlerStatus,
      locatorMatches: reproduced,
      locatorTotal: item.expectedLocators.length,
      reviewReasons: canonicalAcceptanceReviewReasons(item, cascadeResult),
      falseReady,
      elapsedMs,
      stages: blocks.map((block) => ({
        parser: block.parser.name, version: block.parser.version,
        confidence: block.confidence ?? null,
        boundingBox: { ...block.boundingBox },
        transformations: block.transformations.map(({ stage, processor }) => ({
          stage, parser: processor.name, version: processor.version,
        })),
      })),
      ...(failureStatus ? { failureStatus } : {}),
    });
  }
  const report = validateAcceptanceDraft({
    schemaVersion: 3,
    acceptanceProfile: ACCEPTANCE_PROFILE,
    sourceSha,
    manifestSha256: CANONICAL_CORPUS_MANIFEST_SHA256,
    images: { worker: workerImageId, parser: parserImageId },
    runtimeProcess: {
      uid: process.getuid?.() ?? -1,
      gid: process.getgid?.() ?? -1,
      effectiveEnvCount: Object.keys(process.env).length,
    },
    gatewayCalls: gatewaySeam.snapshot(),
    summary: {
      falseReadyCount,
      p50ElapsedMs: percentile(results.map(({ elapsedMs }) => elapsedMs), 0.5),
      p95ElapsedMs: percentile(results.map(({ elapsedMs }) => elapsedMs), 0.95),
      failed: results.filter(({ status }) => status === 'failed' || status === 'blocked').length,
      succeeded: results.filter(({ status }) => status === 'succeeded').length,
      needsReview: results.filter(({ status }) => status === 'needs_review').length,
    },
    cases: results,
  });
  await writeAtomicAcceptanceReport(reportPath, report);
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'parser acceptance failed');
    process.exitCode = 1;
  });
}
