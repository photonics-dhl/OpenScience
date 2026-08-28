import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { Readable } from 'node:stream';

import type { AiGateway } from '@openscience/ai-gateway';
import type { DocumentSourceMap } from '@openscience/domain';

import { createHandlers, createWorkerParserCascade } from './index';
import {
  createParserStageJobClient,
  TRANSITION_PARSER_METADATA,
} from './parser-job-isolation';
import { PDF_PAGE_INVENTORY_METADATA, TESSERACT_METADATA } from './parsers/ocr-parser';

type ExpectedLocator = Record<string, unknown> & { kind: string };
interface ManifestCase {
  id: string;
  filename: string;
  sha256: string;
  expectedCurrentStatus: 'ready' | 'needs_review';
  expectedLocators: ExpectedLocator[];
}

interface Manifest { schemaVersion: 2; cases: ManifestCase[] }

const MEDIA_TYPES: Record<string, string> = {
  '.csv': 'text/csv', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.md': 'text/markdown', '.pdf': 'application/pdf',
  '.png': 'image/png', '.tex': 'application/x-tex',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function boundedManifest(value: unknown): Manifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid acceptance manifest');
  const manifest = value as Partial<Manifest>;
  if (manifest.schemaVersion !== 2 || !Array.isArray(manifest.cases) || manifest.cases.length !== 16) {
    throw new Error('acceptance requires the exact 16-case schema-v2 corpus');
  }
  for (const item of manifest.cases) {
    if (!item || typeof item.id !== 'string' || typeof item.filename !== 'string'
      || !/^[a-f0-9]{64}$/.test(item.sha256) || !Array.isArray(item.expectedLocators)
      || (item.expectedCurrentStatus !== 'ready' && item.expectedCurrentStatus !== 'needs_review')) {
      throw new Error('invalid acceptance corpus case');
    }
  }
  return manifest as Manifest;
}

function overlaps(block: { x: number; y: number; width: number; height: number }, box: readonly number[]): boolean {
  return box.length === 4
    && block.x < Number(box[2]) && block.x + block.width > Number(box[0])
    && block.y < Number(box[3]) && block.y + block.height > Number(box[1]);
}

function locatorMatches(sourceMap: DocumentSourceMap, locator: ExpectedLocator): boolean {
  if (locator.kind === 'file') return true;
  const quote = typeof locator.quote === 'string' ? locator.quote : undefined;
  const pageNumber = typeof locator.page === 'number' ? locator.page : undefined;
  const pages = pageNumber === undefined ? sourceMap.pages : sourceMap.pages.filter(({ page }) => page === pageNumber);
  const blocks = pages.flatMap(({ blocks: pageBlocks }) => pageBlocks);
  if (locator.kind === 'page-text-order' && Array.isArray(locator.quotes)) {
    const text = blocks.map(({ text }) => text ?? '').join('\n');
    let offset = 0;
    return locator.quotes.every((candidate) => {
      if (typeof candidate !== 'string') return false;
      const index = text.indexOf(candidate, offset);
      if (index < 0) return false;
      offset = index + candidate.length;
      return true;
    });
  }
  const region = Array.isArray(locator.bbox) ? locator.bbox.map(Number) : undefined;
  const candidates = region ? blocks.filter(({ boundingBox }) => overlaps(boundingBox, region)) : blocks;
  if (locator.kind === 'page-region' || locator.kind === 'image-region') return candidates.length > 0;
  if (quote) return candidates.some(({ text }) => text?.includes(quote));
  return false;
}

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
  const manifest = boundedManifest(JSON.parse(await readFile(join(corpusDir, 'manifest.json'), 'utf8')));
  const jobDir = process.env.PARSER_JOB_DIR;
  if (!jobDir) throw new Error('PARSER_JOB_DIR is required');
  const stageAdapter = createParserStageJobClient(jobDir, (request) => (
    request.operation === 'inventory_pages' ? PDF_PAGE_INVENTORY_METADATA
      : request.operation === 'render_page' || request.operation === 'ocr_page' ? TESSERACT_METADATA
        : TRANSITION_PARSER_METADATA
  ));
  let providerCalls = 0;
  const gateway = {
    completeStructured: async () => proposal(),
    ocr: async () => { providerCalls += 1; throw new Error('provider calls forbidden in acceptance'); },
  } as unknown as AiGateway;
  const canonicalCascade = createWorkerParserCascade(gateway, stageAdapter);
  const results = [];
  let falseReadyCount = 0;

  for (const item of [...manifest.cases].sort((left, right) => left.id.localeCompare(right.id))) {
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
          mimeType: MEDIA_TYPES[extname(item.filename).toLowerCase()] ?? 'application/octet-stream',
        }) },
      },
    };
    const rssBefore = process.memoryUsage().rss;
    const cpuBefore = process.cpuUsage();
    const started = performance.now();
    let failureStatus: string | undefined;
    try {
      await handlers['sdf.extract']!(deps as never, {
        id: `accept-${item.id}`,
        payload: { artifactId: `artifact-${item.id}`, researchObjectId: 'accept-ro' },
        executionAttempt: 1,
      });
    } catch (error) {
      failureStatus = error instanceof Error ? error.message.replace(/[^a-z0-9_ -]/giu, '').slice(0, 120) : 'unknown_failure';
    }
    const elapsedMs = Math.round((performance.now() - started) * 100) / 100;
    const cpu = process.cpuUsage(cpuBefore);
    const sourceMap = cascadeResult && cascadeResult.status !== 'blocked' && cascadeResult.status !== 'failed'
      ? cascadeResult.sourceMap : undefined;
    const reproduced = sourceMap ? item.expectedLocators.filter((locator) => locatorMatches(sourceMap, locator)).length : 0;
    const ready = cascadeResult?.status === 'succeeded';
    const falseReady = ready && reproduced !== item.expectedLocators.length;
    if (falseReady) falseReadyCount += 1;
    const blocks = sourceMap?.pages.flatMap(({ blocks: pageBlocks }) => pageBlocks) ?? [];
    results.push({
      id: item.id,
      contentHash: digest,
      status: cascadeResult?.status ?? 'failed',
      expectedCurrentStatus: item.expectedCurrentStatus,
      locatorMatches: reproduced,
      locatorTotal: item.expectedLocators.length,
      falseReady,
      elapsedMs,
      cpuMicros: cpu.user + cpu.system,
      peakRssBytes: Math.max(rssBefore, process.memoryUsage().rss),
      stages: blocks.map((block) => ({
        parser: block.parser.name, version: block.parser.version,
        confidence: block.confidence ?? null,
        transformations: block.transformations.map(({ stage, processor }) => ({
          stage, parser: processor.name, version: processor.version,
        })),
      })),
      ...(failureStatus ? { failureStatus } : {}),
    });
  }
  const report = {
    schemaVersion: 2,
    sourceSha,
    images: { worker: workerImageId, parser: parserImageId },
    topology: { network: 'none', providerCalls, corpusCases: results.length },
    summary: {
      falseReadyCount,
      p50ElapsedMs: percentile(results.map(({ elapsedMs }) => elapsedMs), 0.5),
      p95ElapsedMs: percentile(results.map(({ elapsedMs }) => elapsedMs), 0.95),
      peakCpuMicros: Math.max(...results.map(({ cpuMicros }) => cpuMicros)),
      peakRssBytes: Math.max(...results.map(({ peakRssBytes }) => peakRssBytes)),
      failed: results.filter(({ status }) => status === 'failed' || status === 'blocked').length,
    },
    cases: results,
  };
  if (providerCalls !== 0 || results.length !== 16) throw new Error('acceptance isolation contract failed');
  const temporaryPath = `${reportPath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  await rename(temporaryPath, reportPath);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'parser acceptance failed');
  process.exitCode = 1;
});
