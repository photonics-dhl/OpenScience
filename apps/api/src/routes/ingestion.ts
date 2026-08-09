import type { FastifyInstance, FastifyRequest } from 'fastify';
import multipart from '@fastify/multipart';
import { z } from 'zod';
import { streamToBuffer } from '@openscience/storage';
import { createIngestionBatch, getIngestionBatch, IngestionError, retryIngestionTask, type IngestionDeps } from '@openscience/domain';
import type { AuditContext } from '@openscience/observability';
import { requireCurrentUser } from './session-guard';

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const MAX_BATCH_BYTES = 250 * 1024 * 1024;

function auditCtx(req: FastifyRequest): AuditContext {
  return { requestId: String(req.id), ip: req.ip };
}

export function registerIngestionRoutes(app: FastifyInstance, deps: IngestionDeps): void {
  void app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 20 } });

  app.post('/research-objects/:id/ingest', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const idempotencyKey = z.string().min(1).max(200).optional().parse(req.headers['idempotency-key']);
    let processingConsent = false;
    let totalBytes = 0;
    const files: Array<{ filename: string; content: Buffer; mimeType?: string }> = [];
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        const content = await streamToBuffer(part.file);
        totalBytes += content.length;
        if (totalBytes > MAX_BATCH_BYTES) throw new IngestionError('VALIDATION_ERROR', 'Ingestion batch exceeds 250 MB');
        files.push({ filename: part.filename, content, mimeType: part.mimetype });
      } else if (part.fieldname === 'processingConsent') {
        processingConsent = part.value === 'true';
      }
    }
    const batch = await createIngestionBatch(deps, {
      userId: user.userId, researchObjectId: id, processingConsent, files, idempotencyKey,
    }, auditCtx(req));
    return reply.status(202).send({ batchId: batch.batchId, artifacts: batch.tasks.map((task) => ({ artifactId: task.artifactId, logicalPath: task.logicalPath })), tasks: batch.tasks });
  });

  app.get('/ingestion/:batchId', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { batchId } = z.object({ batchId: z.string().uuid() }).parse(req.params);
    return reply.send(await getIngestionBatch(deps, { userId: user.userId, batchId }));
  });

  app.post('/ingestion/:taskId/retry', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { taskId } = z.object({ taskId: z.string().uuid() }).parse(req.params);
    return reply.send({ task: await retryIngestionTask(deps, { userId: user.userId, taskId }) });
  });
}
