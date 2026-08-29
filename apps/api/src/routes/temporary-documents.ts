import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AuthDeps } from '@openscience/auth';
import {
  AgentError,
  issueTemporaryDownloadToken,
  verifyTemporaryDownloadToken,
} from '@openscience/domain';
import type { StorageAdapter } from '@openscience/storage';
import { requireCurrentUser } from './session-guard';

export type TemporaryDocumentRouteDeps = AuthDeps & {
  storage: StorageAdapter;
  downloadSigningSecret: string;
  downloadSigningKeyId: string;
  secureCookies: boolean;
};

const idParams = z.object({ id: z.string().uuid() });

async function requireDownloadableDocument(deps: TemporaryDocumentRouteDeps, documentId: string, userId: string) {
  const document = await deps.prisma.temporaryDocument.findUnique({
    where: { id: documentId },
    include: { rightsDecision: true },
  });
  if (!document || document.state !== 'active' || document.expiresAt <= new Date()) {
    throw new AgentError('RESEARCH_OBJECT_NOT_FOUND', '临时文档不存在或已过期');
  }
  const membership = await deps.prisma.membership.findUnique({
    where: { workspaceId_userId: { workspaceId: document.workspaceId, userId } },
  });
  if (!membership) throw new AgentError('RESEARCH_OBJECT_NOT_FOUND', '临时文档不存在或已过期');
  const rights = document.rightsDecision;
  const latestRights = await deps.prisma.sourceRightsDecision.findFirst({
    where: {
      workspaceId: document.workspaceId,
      externalSourceId: document.externalSourceId,
      OR: [{ subjectUserId: null }, { subjectUserId: userId }],
    },
    orderBy: [{ decidedAt: 'desc' }, { createdAt: 'desc' }],
  });
  if (!latestRights || latestRights.id !== rights.id || rights.contentHash !== document.contentHash) {
    throw new AgentError('ILLEGAL_TRANSITION', '来源权利已变化，请重新获取');
  }
  if (!rights.cacheAllowed || rights.downloadPolicy === 'blocked' || rights.downloadPolicy === 'source_link_only') {
    throw new AgentError('ILLEGAL_TRANSITION', '该来源不允许服务器下载');
  }
  if (rights.basis === 'institutional_access') {
    if (rights.downloadPolicy !== 'authorized_user_only'
      || rights.subjectUserId !== userId || !rights.validUntil || rights.validUntil <= new Date()) {
      throw new AgentError('ILLEGAL_TRANSITION', '机构访问授权不可用于当前用户');
    }
  } else if (rights.downloadPolicy === 'authorized_user_only') {
    throw new AgentError('ILLEGAL_TRANSITION', '来源权利策略不一致');
  }
  return document;
}

export function registerTemporaryDocumentRoutes(app: FastifyInstance, deps: TemporaryDocumentRouteDeps): void {
  app.post('/temporary-documents/:id/download-link', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = idParams.parse(req.params);
    const document = await requireDownloadableDocument(deps, id, user.userId);
    const accessId = randomUUID();
    const now = new Date();
    const ttlSeconds = Math.min(
      600,
      Math.floor(document.expiresAt.getTime() / 1000) - Math.floor(now.getTime() / 1000),
    );
    if (ttlSeconds < 1) throw new AgentError('RESEARCH_OBJECT_NOT_FOUND', '临时文档不存在或已过期');
    const issued = issueTemporaryDownloadToken({
      secret: deps.downloadSigningSecret,
      keyId: deps.downloadSigningKeyId,
      accessId,
      workspaceId: document.workspaceId,
      documentId: document.id,
      userId: user.userId,
      now,
      ttlSeconds,
    });
    await deps.audit?.record({
      actorId: user.userId,
      action: 'temporary_document.download_link.issue',
      workspaceId: document.workspaceId,
      targetType: 'temporary_document',
      targetId: document.id,
      metadata: { accessId, signingKeyId: deps.downloadSigningKeyId, expiresAt: issued.expiresAt.toISOString() },
      requestId: String(req.id),
      ip: req.ip,
    });
    await deps.prisma.temporaryDocumentAccess.create({
      data: {
        id: accessId,
        workspaceId: document.workspaceId,
        temporaryDocumentId: document.id,
        userId: user.userId,
        tokenHash: issued.tokenHash,
        signingKeyId: deps.downloadSigningKeyId,
        expiresAt: issued.expiresAt,
        createdAt: now,
      },
    });
    const downloadUrl = `/api/temporary-documents/${document.id}/download/${accessId}`;
    reply.setCookie(`openscience_temp_download_${accessId}`, issued.token, {
      path: downloadUrl,
      httpOnly: true,
      secure: deps.secureCookies,
      sameSite: 'strict',
      maxAge: ttlSeconds,
    });
    return reply.header('Cache-Control', 'private, no-store').send({ downloadUrl, expiresAt: issued.expiresAt });
  });

  app.get('/temporary-documents/:id/download/:accessId', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    if (req.headers.range) return reply.status(416).send({ error: { code: 'RANGE_NOT_SUPPORTED', message: 'Range requests are not supported' } });
    const { id, accessId } = z.object({ id: z.string().uuid(), accessId: z.string().uuid() }).parse(req.params);
    const token = req.cookies[`openscience_temp_download_${accessId}`];
    if (!token || token.length < 80 || token.length > 2_000) {
      throw new AgentError('RESEARCH_OBJECT_NOT_FOUND', '下载链接无效或已使用');
    }
    const document = await requireDownloadableDocument(deps, id, user.userId);
    const access = await deps.prisma.temporaryDocumentAccess.findUnique({ where: { id: accessId } });
    const tokenHash = createHash('sha256').update(token).digest('hex');
    if (!access || access.workspaceId !== document.workspaceId || access.temporaryDocumentId !== document.id
      || access.userId !== user.userId || access.tokenHash !== tokenHash || access.signingKeyId !== deps.downloadSigningKeyId
      || access.consumedAt || access.revokedAt || access.expiresAt <= new Date()) {
      throw new AgentError('RESEARCH_OBJECT_NOT_FOUND', '下载链接无效或已使用');
    }
    verifyTemporaryDownloadToken({
      secret: deps.downloadSigningSecret,
      keyId: access.signingKeyId,
      accessId: access.id,
      workspaceId: access.workspaceId,
      token,
      documentId: document.id,
      userId: user.userId,
    });
    const head = await deps.storage.headObject(document.objectKey);
    if (!head || head.size !== Number(document.sizeBytes) || head.sha256 !== document.contentHash) {
      throw new Error('[blocked] temporary document integrity mismatch');
    }
    const consumed = await deps.prisma.temporaryDocumentAccess.updateMany({
      where: { id: access.id, consumedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) {
      throw new AgentError('RESEARCH_OBJECT_NOT_FOUND', '下载链接无效或已使用');
    }
    await deps.audit?.record({
      actorId: user.userId,
      action: 'temporary_document.download.consume',
      workspaceId: document.workspaceId,
      targetType: 'temporary_document_access',
      targetId: access.id,
      metadata: { temporaryDocumentId: document.id, signingKeyId: access.signingKeyId },
      requestId: String(req.id),
      ip: req.ip,
    });
    const object = await deps.storage.getObject(document.objectKey);
    reply.clearCookie(`openscience_temp_download_${accessId}`, { path: `/api/temporary-documents/${document.id}/download/${accessId}` });
    const filename = `openscience-source-${document.id}.pdf`;
    return reply
      .header('Cache-Control', 'private, no-store')
      .header('Referrer-Policy', 'no-referrer')
      .header('Content-Type', document.mimeType)
      .header('Content-Length', String(document.sizeBytes))
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(object.body);
  });
}
