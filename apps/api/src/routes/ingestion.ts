import type { FastifyInstance, FastifyRequest } from 'fastify';
import multipart from '@fastify/multipart';
import { z } from 'zod';
import { authorizeIngestionWrite, confirmIngestionTask, createIngestionBatch, getIngestionBatch, getIngestionTask, IngestionError, listActionableIngestionTasks, retryIngestionTask, type IngestionDeps } from '@openscience/domain';
import type { AuditContext } from '@openscience/observability';
import { requireCurrentUser } from './session-guard';

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const MAX_BATCH_BYTES = 250 * 1024 * 1024;
let activeIngestions = 0;

async function boundedBuffer(stream: AsyncIterable<Buffer | Uint8Array | string>, currentBytes: number): Promise<{ content: Buffer; totalBytes: number }> {
  const chunks: Buffer[] = [];
  let size = currentBytes;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BATCH_BYTES) throw new IngestionError('FILE_TOO_LARGE', 'Ingestion batch exceeds 250 MB');
    chunks.push(buffer);
  }
  return { content: Buffer.concat(chunks), totalBytes: size };
}

function auditCtx(req: FastifyRequest): AuditContext {
  return { requestId: String(req.id), ip: req.ip };
}

export function registerIngestionRoutes(app: FastifyInstance, deps: IngestionDeps): void {
  void app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 20, fields: 1, parts: 21 } });

  app.post('/research-objects/:id/ingest', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await authorizeIngestionWrite(deps, { userId: user.userId, researchObjectId: id });
    if (activeIngestions > 0) throw new IngestionError('INGESTION_BUSY', 'Another ingestion is already being processed');
    activeIngestions += 1;
    try {
    const idempotencyKey = z.string().min(1).max(200).optional().parse(req.headers['idempotency-key']);
    let processingConsent = false;
    let totalBytes = 0;
    const files: Array<{ filename: string; content: Buffer; mimeType?: string }> = [];
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        const bounded = await boundedBuffer(part.file as AsyncIterable<Buffer>, totalBytes);
        const content = bounded.content;
        if (part.file.truncated) throw new IngestionError('FILE_TOO_LARGE', 'Individual file exceeds 100 MB');
        totalBytes = bounded.totalBytes;
        files.push({ filename: part.filename, content, mimeType: part.mimetype });
      } else if (part.fieldname === 'processingConsent') {
        processingConsent = part.value === 'true';
      }
    }
    const batch = await createIngestionBatch(deps, {
      userId: user.userId, researchObjectId: id, processingConsent, files, idempotencyKey,
    }, auditCtx(req));
    return reply.status(202).send({ batchId: batch.batchId, artifacts: batch.tasks.map((task) => ({ artifactId: task.artifactId, logicalPath: task.logicalPath })), tasks: batch.tasks });
    } finally {
      activeIngestions -= 1;
    }
  });

  app.get('/ingestion', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { researchObjectId } = z.object({ actionable: z.enum(['true']).optional(), researchObjectId: z.string().uuid().optional() }).parse(req.query);
    return reply.send({ tasks: await listActionableIngestionTasks(deps, { userId: user.userId, researchObjectId }) });
  });

  app.get('/ingestion/:batchId', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { batchId } = z.object({ batchId: z.string().uuid() }).parse(req.params);
    return reply.send(await getIngestionBatch(deps, { userId: user.userId, batchId }));
  });

  app.get('/ingestion/tasks/:taskId', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { taskId } = z.object({ taskId: z.string().uuid() }).parse(req.params);
    return reply.send(await getIngestionTask(deps, { userId: user.userId, taskId }));
  });

  app.post('/ingestion/:taskId/retry', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { taskId } = z.object({ taskId: z.string().uuid() }).parse(req.params);
    return reply.send({ task: await retryIngestionTask(deps, { userId: user.userId, taskId }) });
  });

  app.post('/ingestion/:taskId/confirm', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { taskId } = z.object({ taskId: z.string().uuid() }).parse(req.params);
    const body = z.object({ version: z.number().int().nonnegative(), core: z.record(z.string(), z.string()) }).parse(req.body);
    return reply.send(await confirmIngestionTask(deps, { userId: user.userId, taskId, version: body.version, core: body.core }, auditCtx(req)));
  });
}
