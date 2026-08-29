import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';

import type { AiGateway } from '@openscience/ai-gateway';

import { createHandlers, createWorkerParserCascade } from './index';
import {
  CANONICAL_CORPUS_MANIFEST_SHA256,
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

function proposal() {
  const fields = ['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'];
  return {
    schemaVersion: '0.1.0',
    fields: Object.fromEntries(fields.map((field) => [field, {
      summary: '', sourceQuote: '', needsMoreInformation: true,
    }])),
  };
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
  const gatewaySeam = createAcceptanceGatewaySeam(proposal());
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
    }, { featureFlags: canonicalCascade.featureFlags });
    const handlers = createHandlers(gateway, { parserCascade, externalProcessingPolicy: async () => false });
    const malwareScanner = async () => undefined;
    const deps = {
      storage: { getObject: async () => ({ body: Readable.from([bytes]), size: bytes.length }) },
      malwareScanner,
      prisma: {
        agentTask: { findUnique: async () => ({
          id: `accept-${item.id}`, kind: 'sdf.extract', status: 'running',
          session: { userId: 'accept-user', researchObject: {
            id: 'accept-ro', workspaceId: 'accept-workspace',
            workspace: { id: 'accept-workspace', status: 'active' },
          } },
        }) },
        membership: { findUnique: async () => ({
          userId: 'accept-user', workspaceId: 'accept-workspace', role: 'author',
        }) },
        artifact: { findUnique: async () => ({
          id: `artifact-${item.id}`, workspaceId: 'accept-workspace', size: bytes.length,
          blobSha256: digest, logicalPath: item.filename,
          mimeType: canonicalParserMediaType(item.filename),
        }) },
      },
    };
    const started = performance.now();
    let failureStatus: string | undefined;
    let handlerStatus = 'failed';
    try {
      const handlerResult = await handlers['sdf.extract']!(deps as never, {
        id: `accept-${item.id}`,
        payload: { artifactId: `artifact-${item.id}`, researchObjectId: 'accept-ro' },
        executionAttempt: 1,
      });
      handlerStatus = classifyAcceptanceHandlerResult(handlerResult);
    } catch (error) {
      failureStatus = error instanceof Error ? error.message.replace(/[^a-z0-9_ -]/giu, '').slice(0, 120) : 'unknown_failure';
    }
    const elapsedMs = Math.round((performance.now() - started) * 100) / 100;
    const sourceMap = cascadeResult && cascadeResult.status !== 'blocked' && cascadeResult.status !== 'failed'
      ? cascadeResult.sourceMap : undefined;
    const reproduced = sourceMap
      ? item.expectedLocators.filter((locator) => reproduceAcceptanceLocator(sourceMap, locator, {
        artifactId: `artifact-${item.id}`, contentHash: digest,
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
    schemaVersion: 2,
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

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'parser acceptance failed');
  process.exitCode = 1;
});
