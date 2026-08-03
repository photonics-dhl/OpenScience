import type { Readable } from 'node:stream';
import type { StorageAdapter } from '@openscience/storage';
import { getBlobStorageKey, putBlob, streamToBuffer } from '@openscience/storage';
import type { AuditContext } from '@openscience/observability';
import { requireMembership } from '../workspace/helpers';
import { recordAudit } from '../workspace/audit';
import type { WorkspaceDeps } from '../workspace/types';
import { ArtifactError } from './errors';
import { detectMimeType } from './mime';
import { checkUploadQuota } from './quota';
import { scanFile } from './scan';

/** domain artifact 依赖：在 WorkspaceDeps 基础上叠加 StorageAdapter（P1A-2 对象存储）。 */
export interface ArtifactDeps extends WorkspaceDeps {
  storage: StorageAdapter;
}

export interface CreateArtifactInput {
  logicalPath: string;
  content: Buffer | Readable;
  /** 可选：显式 MIME（缺省自动检测，检测失败 mimeType=null + 审计，Design Gate 决策）。 */
  mimeType?: string;
  uploadedBy: string;
  workspaceId: string;
}

export interface CreateArtifactResult {
  artifactId: string;
  logicalPath: string;
  mimeType: string | null;
  size: number;
  blobSha256: string;
  /** Blob 去重标志：true = 内容已存在，未重新上传到对象存储（§7.1） */
  alreadyExists: boolean;
}

export interface ArtifactDetail extends CreateArtifactResult {
  uploadedBy: string;
  workspaceId: string;
  createdAt: Date;
}

/**
 * 上传 Artifact（§7.2.2 逻辑路径/MIME/大小/Blob hash + §17 类型检测/大小限制/恶意扫描）：
 * 1. 成员校验（跨 workspace 越权 → 404）
 * 2. 配额检查（§13.3，超限 FILE_TOO_LARGE）
 * 3. 病毒扫描（P1B-3 占位，P1B-8 实装）
 * 4. MIME 检测（魔数，失败 mimeType=null + 审计）
 * 5. putBlob 内容寻址（去重，§7.1）+ Blob 行 upsert
 * 6. Artifact 行入库 + 审计
 */
export async function createArtifact(
  deps: ArtifactDeps,
  input: CreateArtifactInput,
  ctx: AuditContext = {},
): Promise<CreateArtifactResult> {
  await requireMembership(deps, input.workspaceId, input.uploadedBy);

  const logicalPath = normalizeLogicalPath(input.logicalPath);

  // 统一先转 Buffer（P1B-3 小文件单次上传）：MIME 检测会消费流，后续 putBlob 复用同一 buffer 避免读空流。
  const content = Buffer.isBuffer(input.content) ? input.content : await streamToBuffer(input.content);

  // 配额（§13.3）
  await checkUploadQuota(deps, { workspaceId: input.workspaceId, fileSize: content.length });

  // 病毒扫描（§17 MUST，P1B-3 占位）
  const scan = await scanFile(content);
  if (!scan.safe) {
    throw new ArtifactError('MALICIOUS_FILE', `检测到恶意内容${scan.threat ? `: ${scan.threat}` : ''}`);
  }

  // MIME（Design Gate：检测失败允许上传，mimeType=null）
  let mimeType: string | null = input.mimeType ?? null;
  if (!mimeType) {
    const detected = await detectMimeType(content);
    if (detected) mimeType = detected;
  }

  // 内容寻址去重（§7.1）+ 入库
  const blob = await putBlob(deps.storage, content);

  const created = await deps.prisma.$transaction(async (tx) => {
    await tx.blob.upsert({
      where: { sha256: blob.sha256 },
      create: { sha256: blob.sha256, storageKey: getBlobStorageKey(blob.sha256), size: BigInt(blob.size) },
      update: {},
    });
    const artifact = await tx.artifact.create({
      data: {
        logicalPath,
        mimeType,
        size: BigInt(blob.size),
        blobSha256: blob.sha256,
        uploadedBy: input.uploadedBy,
        workspaceId: input.workspaceId,
      },
    });
    await recordAudit(
      deps, tx,
      {
        actorId: input.uploadedBy, action: 'artifact.create', workspaceId: input.workspaceId,
        targetType: 'artifact', targetId: artifact.id,
        metadata: { logicalPath, mimeType, size: blob.size, blobSha256: blob.sha256, alreadyExists: blob.alreadyExists },
      },
      ctx,
    );
    return artifact;
  });

  return {
    artifactId: created.id,
    logicalPath,
    mimeType,
    size: blob.size,
    blobSha256: blob.sha256,
    alreadyExists: blob.alreadyExists,
  };
}

/** 查 Artifact 详情（含 Blob）。不存在 → 404。 */
export async function getArtifact(
  deps: ArtifactDeps,
  input: { userId: string; artifactId: string },
): Promise<ArtifactDetail> {
  const artifact = await deps.prisma.artifact.findUnique({
    where: { id: input.artifactId },
    include: { blob: true },
  });
  if (!artifact) throw new ArtifactError('ARTIFACT_NOT_FOUND', '文件不存在');
  // 越权防护（§17）：校验调用者是该 workspace 成员（跨 workspace → 404）
  await requireMembership(deps, artifact.workspaceId, input.userId);

  return {
    artifactId: artifact.id,
    logicalPath: artifact.logicalPath,
    mimeType: artifact.mimeType,
    size: Number(artifact.size),
    blobSha256: artifact.blobSha256,
    alreadyExists: false, // 详情不关心去重标志
    uploadedBy: artifact.uploadedBy,
    workspaceId: artifact.workspaceId,
    createdAt: artifact.createdAt,
  };
}

function normalizeLogicalPath(raw: string): string {
  const trimmed = raw.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!trimmed || trimmed.length > 1024) {
    throw new ArtifactError('VALIDATION_ERROR', '逻辑路径需为 1-1024 字符');
  }
  if (trimmed.includes('..') || trimmed.startsWith('.')) {
    throw new ArtifactError('VALIDATION_ERROR', '逻辑路径不能包含相对路径或隐藏文件');
  }
  return trimmed;
}

