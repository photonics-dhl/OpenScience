import type { FastifyInstance, FastifyRequest } from 'fastify';
import multipart from '@fastify/multipart';
import { z } from 'zod';
import type { AuthDeps } from '@openscience/auth';
import type { StorageAdapter } from '@openscience/storage';
import { getBlob } from '@openscience/storage';
import { createArtifact, getArtifact } from '@openscience/domain';
import type { AuditContext } from '@openscience/observability';
import { enforceJournalWorkspaceBoundary } from '../journal-boundary';
import { requireCurrentUser } from './session-guard';

/** artifacts 路由依赖：AuthDeps + StorageAdapter（P1B-3 对象存储）。 */
export type ArtifactRouteDeps = AuthDeps & { storage: StorageAdapter; malwareScanner?: import('@openscience/storage').MalwareScanner };

function auditCtx(req: FastifyRequest): AuditContext {
  return { requestId: String(req.id), ip: req.ip };
}

const artifactIdParams = z.object({ id: z.string().uuid() });

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100MB（P1B-3 单次上传上限；P1B-5 大文件分片再放宽）

/** multipart 字段取值（MultipartValue.value | 多值数组取首；文件流则 undefined）。 */
function fieldValue(field: unknown): string | undefined {
  if (Array.isArray(field)) {
    const first = field[0] as { value?: unknown } | undefined;
    return first && typeof first.value === 'string' ? first.value : undefined;
  }
  if (field && typeof field === 'object' && 'value' in field) {
    const v = (field as { value?: unknown }).value;
    return typeof v === 'string' ? v : undefined;
  }
  return undefined;
}

function attachmentDisposition(logicalPath: string): string {
  // UTF-8 roundtrip also replaces malformed legacy surrogate code units.
  const filename = Buffer.from(logicalPath.split(/[\\/]/).pop() ?? '', 'utf8').toString('utf8')
    .replace(/\p{Cc}/gu, '') || 'download';
  const fallback = filename.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/**
 * P1B-3：/artifacts 上传下载（§7.2.2 元数据 + §13.1 上传管线 + §17 类型/大小/扫描）。
 * POST /artifacts/upload：multipart 单文件，字段 file + logicalPath。
 * GET /artifacts/:id/download：流式下载（MIME + Content-Disposition）。
 */
export function registerArtifactRoutes(app: FastifyInstance, deps: ArtifactRouteDeps): void {
  void app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES } });

  app.post('/artifacts/upload', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const data = await req.file();
    if (!data) {
      return reply.status(400).send({ error: { code: 'INVALID_REQUEST', message: '缺少 file 字段' } });
    }
    const workspaceId = fieldValue(data.fields.workspaceId) ?? req.headers['x-workspace-id'];
    if (typeof workspaceId !== 'string' || !workspaceId) {
      return reply.status(400).send({ error: { code: 'INVALID_REQUEST', message: '缺少 workspaceId' } });
    }
    try {
      if (!(await enforceJournalWorkspaceBoundary(deps, req, reply, workspaceId))) {
        void data.file.resume();
        return;
      }
    } catch (error) {
      void data.file.resume();
      throw error;
    }
    const logicalPath = fieldValue(data.fields.logicalPath) ?? data.filename;
    if (typeof logicalPath !== 'string' || !logicalPath) {
      return reply.status(400).send({ error: { code: 'INVALID_REQUEST', message: '缺少 logicalPath' } });
    }
    try {
      const idempotencyKey = z.string().min(1).max(200).optional().parse(req.headers['idempotency-key']);
      const result = await createArtifact(
        deps,
        {
          logicalPath,
          content: data.file, // Readable
          uploadedBy: user.userId,
          workspaceId,
          idempotencyKey,
        },
        auditCtx(req),
      );
      return reply.status(201).send({ artifact: result });
    } finally {
      void data.file.resume(); // 释放流
    }
  });

  app.get('/artifacts/:id/download', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = artifactIdParams.parse(req.params);
    const artifact = await getArtifact(deps, { userId: user.userId, artifactId: id });
    const blob = await getBlob(deps.storage, artifact.blobSha256);
    return reply
      .header('Content-Type', artifact.mimeType ?? 'application/octet-stream')
      .header('Content-Disposition', attachmentDisposition(artifact.logicalPath))
      .header('Cache-Control', 'private, no-store')
      .header('Content-Length', String(artifact.size))
      .send(blob.body);
  });
}
