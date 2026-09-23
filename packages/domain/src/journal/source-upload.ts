import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { putBlob, getBlobStorageKey, type StorageAdapter } from '@openscience/storage';
import type { WorkspaceDeps } from '../workspace/types';
import { scanFile } from '../artifact/scan';
import { lockTrashReferences } from '../trash/trash';
import { JournalError } from './contracts';
import { EMPTY_RIGHTS, type JournalSource } from './content';
import { assertArticleRevision, journalArticleEvent, journalArticleInScope, journalJson, journalScope, journalTransaction, JOURNAL_EDIT_ROLES } from './articles';
import { journalSourceDigest } from './processing';
import { journalSourceMaterials, type JournalArticleSourceRecord } from './enhancements';

const MIME: Record<string, string> = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', txt: 'text/plain', md: 'text/markdown' };
export const JOURNAL_FILE_LIMIT = 50 * 1024 * 1024;
export function validateJournalUploadContent(extension: string, bytes: Buffer): void {
  if (extension === 'pdf' && !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new JournalError('VALIDATION_ERROR', '文件内容不是有效的 PDF');
  if (extension === 'docx' && (!bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) || !bytes.includes(Buffer.from('[Content_Types].xml')) || !bytes.includes(Buffer.from('word/document.xml')))) throw new JournalError('VALIDATION_ERROR', '文件内容不是有效的 DOCX 容器');
  if (['txt', 'md'].includes(extension)) {
    try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new JournalError('VALIDATION_ERROR', '文本来源必须使用 UTF-8 编码'); }
    if (bytes.some((b) => b < 32 && ![9, 10, 12, 13].includes(b))) throw new JournalError('VALIDATION_ERROR', '文本文件含有二进制控制内容');
  }
}

async function failStagingUpload(deps: WorkspaceDeps, journalId: string, articleId: string, userId: string, jobId: string, message: string) {
  return journalTransaction(deps, journalId, async (tx) => {
    const job = await tx.journalJob.findFirst({ where: { id: jobId, journalId, articleId, requestedBy: userId } });
    if (!job || job.state !== 'staging') return job;
    const failed = await tx.journalJob.update({ where: { id: job.id }, data: { state: 'failed', error: message } });
    await journalArticleEvent(tx, journalId, userId, 'journal.source.upload_failed', articleId, { jobId, sourceDigest: job.sourceDigest });
    await tx.notification.create({ data: { userId, type: 'journal.job', payload: { journalId, articleId, jobId, state: 'failed' } } });
    return failed;
  });
}

export async function uploadJournalSource(deps: WorkspaceDeps & { storage: StorageAdapter }, userId: string, journalId: string, articleId: string, input: { revision: number; requestKey: string; filename: string; content: Buffer }) {
  await journalScope(deps.prisma, journalId, userId, JOURNAL_EDIT_ROLES, true);
  const ext = input.filename.split('.').at(-1)?.toLowerCase() ?? '';
  if (!MIME[ext] || !input.content.length || input.content.length > JOURNAL_FILE_LIMIT) throw new JournalError('VALIDATION_ERROR', '支持 PDF、DOCX、TXT 和 Markdown，单文件上限 50 MB');
  validateJournalUploadContent(ext, input.content);
  const scan = await scanFile(input.content);
  if (!scan.safe) throw new JournalError('VALIDATION_ERROR', '文件未通过安全检查');
  const contentSha256 = createHash('sha256').update(input.content).digest('hex');
  const label = input.filename.slice(0, 200);
  const staged = await journalTransaction(deps, journalId, async (tx) => {
    const { journal } = await journalScope(tx, journalId, userId, JOURNAL_EDIT_ROLES, true);
    const article = await journalArticleInScope(tx, journalId, articleId);
    const existing = await tx.journalJob.findUnique({ where: { journalId_requestKey: { journalId, requestKey: input.requestKey } } });
    if (existing) {
      const artifact = await tx.artifact.findUnique({ where: { idempotencyKey: `system:journal-source:${existing.id}` } });
      const descriptor = existing.result as { filename?: unknown; artifactId?: unknown; blobSha256?: unknown } | null;
      if (existing.kind !== 'source_parse' || existing.articleId !== articleId || existing.requestedBy !== userId
        || artifact?.blobSha256 !== contentSha256 || artifact.size !== BigInt(input.content.length) || artifact.mimeType !== MIME[ext]
        || (existing.state === 'staging' && (descriptor?.filename !== label || descriptor.artifactId !== artifact.id || descriptor.blobSha256 !== contentSha256))) {
        throw new JournalError('IDEMPOTENCY_CONFLICT', '此请求标识已用于其他来源上传');
      }
      // Only the request that created the staging row writes storage. A replay
      // proves the same bytes first, then observes the durable in-flight result.
      return { job: existing, source: null, needsStorage: false };
    }
    assertArticleRevision(article, input.revision);
    const priorMaterials = journalSourceMaterials(article.source);
    if (priorMaterials.length >= 50) throw new JournalError('INVALID_STATE', '每篇论文最多记录 50 项来源材料');
    if (article.contentState !== 'active') throw new JournalError('FORBIDDEN', '受限或撤回论文不能替换来源文件');
    if (await tx.journalJob.count({ where: { articleId, state: { in: ['staging', 'pending', 'running'] } } })) throw new JournalError('INVALID_STATE', '请先完成或取消此论文的已有作业');
    if (await tx.journalJob.count({ where: { journalId, state: { in: ['staging', 'pending', 'running'] } } }) >= 100) throw new JournalError('INVALID_STATE', '期刊作业队列已满');
    const usage = await tx.artifact.aggregate({ where: { workspaceId: journal.workspaceId }, _sum: { size: true } });
    if ((usage._sum.size ?? 0n) + BigInt(input.content.length) > journal.storageLimitBytes) throw new JournalError('INVALID_STATE', '来源存储已达到期刊容量上限');
    await lockTrashReferences(tx);
    await tx.trashObjectCleanup.updateMany({ where: { objectKey: getBlobStorageKey(contentSha256) }, data: { state: 'retained', lastError: null } });
    await tx.blob.upsert({ where: { sha256: contentSha256 }, update: {}, create: { sha256: contentSha256, size: BigInt(input.content.length), storageKey: getBlobStorageKey(contentSha256) } });
    const jobId = randomUUID();
    const artifact = await tx.artifact.create({ data: { workspaceId: journal.workspaceId, uploadedBy: userId, logicalPath: `journal-sources/${articleId}/${jobId}.${ext}`, blobSha256: contentSha256, size: BigInt(input.content.length), mimeType: MIME[ext], idempotencyKey: `system:journal-source:${jobId}` } });
    const material: JournalArticleSourceRecord = { id: randomUUID(), sourceType: 'editor_uploaded_pdf', title: label, url: (article.source as unknown as JournalSource).url || undefined, fileId: artifact.id, uploadedBy: userId, uploadedAt: (deps.now?.() ?? new Date()).toISOString(), rightsStatus: 'unknown', sourceConfidence: 'editor_claimed', permissions: { internalProcessing: false, derivativeGeneration: false, publicSource: false, publicDerivative: false, externalProcessing: false, figureReuse: false, derivativeIllustration: false }, evidence: { statement: '' }, activeForGeneration: true, contentSha256: createHash('sha256').update('', 'utf8').digest('hex') };
    const materials = priorMaterials.map((item) => ({ ...item, activeForGeneration: false })).concat(material);
    const source = { kind: 'fulltext', text: '', url: (article.source as unknown as JournalSource).url, label, artifactId: artifact.id, materials } as JournalSource;
    const sourceDigest = journalSourceDigest({ source, rights: EMPTY_RIGHTS });
    const job = await tx.journalJob.create({ data: { id: jobId, kind: 'source_parse', state: 'staging', journalId, articleId, requestedBy: userId, requestKey: input.requestKey, revision: input.revision + 1, sourceDigest, language: 'zh', result: journalJson({ filename: label, artifactId: artifact.id, blobSha256: contentSha256, uploadRevision: input.revision }) } });
    await journalArticleEvent(tx, journalId, userId, 'journal.source.stage', articleId, { jobId, bytes: input.content.length, sourceDigest });
    return { job, source, needsStorage: true };
  });

  if (!staged.needsStorage || !staged.source) return { job: staged.job };
  try {
    const blob = await putBlob(deps.storage, input.content);
    if (blob.sha256 !== contentSha256 || blob.size !== input.content.length) throw new JournalError('INVALID_STATE', '来源存储完整性校验失败');
  } catch (error) {
    await failStagingUpload(deps, journalId, articleId, userId, staged.job.id, '来源写入存储失败，请使用新的请求标识重试').catch(() => undefined);
    throw error instanceof JournalError ? error : new JournalError('INVALID_STATE', '来源写入存储失败，请使用新的请求标识重试', error);
  }

  try {
    const job = await journalTransaction(deps, journalId, async (tx) => {
      await journalScope(tx, journalId, userId, JOURNAL_EDIT_ROLES, true);
      const article = await journalArticleInScope(tx, journalId, articleId);
      const current = await tx.journalJob.findUnique({ where: { id: staged.job.id } });
      if (!current || current.journalId !== journalId || current.articleId !== articleId || current.requestedBy !== userId) throw new JournalError('IDEMPOTENCY_CONFLICT', '来源暂存记录不匹配');
      if (current.state !== 'staging') {
        if (['pending', 'running', 'succeeded'].includes(current.state)) return current;
        throw new JournalError('INVALID_STATE', '来源上传已失败或取消，请使用新的请求标识重试');
      }
      assertArticleRevision(article, input.revision);
      if (article.contentState !== 'active') throw new JournalError('FORBIDDEN', '受限或撤回论文不能替换来源文件');
      if (journalSourceDigest({ source: staged.source, rights: EMPTY_RIGHTS }) !== current.sourceDigest) throw new JournalError('REVISION_CONFLICT', '来源或授权已改变，请使用新的请求标识重试');
      if (await tx.journalJob.count({ where: { articleId, id: { not: current.id }, state: { in: ['staging', 'pending', 'running'] } } })) throw new JournalError('INVALID_STATE', '请先完成或取消此论文的已有作业');
      await tx.journalArticle.update({ where: { id: articleId }, data: { source: journalJson(staged.source), rights: journalJson(EMPTY_RIGHTS), draft: Prisma.DbNull, revision: { increment: 1 }, reviewState: 'draft', reviewedRevision: null, reviewedDigest: null, reviewedBy: null } });
      if (await tx.journalRelease.count({ where: { articleId } })) {
        await tx.researchObject.update({ where: { id: article.researchObjectId }, data: { visibility: 'private', status: 'restricted' } });
        await tx.version.updateMany({ where: { researchObjectId: article.researchObjectId, status: 'published' }, data: { status: 'restricted' } });
      }
      const descriptor = current.result as Record<string, unknown> | null;
      const pending = await tx.journalJob.update({ where: { id: current.id }, data: { result: journalJson({ ...descriptor, awaitingRights: true }) } });
      await journalArticleEvent(tx, journalId, userId, 'journal.source.upload', articleId, { jobId: current.id, bytes: input.content.length, sourceDigest: current.sourceDigest });
      return pending;
    });
    return { job };
  } catch (error) {
    const message = error instanceof JournalError ? error.message : '来源上传确认失败，请使用新的请求标识重试';
    await failStagingUpload(deps, journalId, articleId, userId, staged.job.id, message).catch(() => undefined);
    throw error;
  }
}
