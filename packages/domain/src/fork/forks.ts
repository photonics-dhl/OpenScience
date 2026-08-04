import type { AuditContext } from '@openscience/observability';
import { requireMembership } from '../workspace/helpers';
import { recordAudit } from '../workspace/audit';
import { canAccessRo } from '../visibility/access';
import type { ArtifactDeps } from '../artifact/artifacts';
import { computeContentSha256 } from '../identity/identifiers';
import { generatePublicId } from '@openscience/identity';
import { getEffectiveLicenses, validateLicenseInheritance, type Licenses } from '../license/licenses';
import { SDF_CORE_FIELDS } from '@openscience/sdf-schema';
import { ForkError } from './errors';

export interface ForkSourceDetail {
  forkedRoId: string;
  sourceRoId: string;
  sourceVersionId: string;
  sourceContentHash: string;
  createdAt: Date;
}

export interface ForkResult {
  researchObject: {
    id: string;
    title: string;
    workspaceId: string;
    visibility: string;
    publicId: string;
  };
  forkRelation: ForkSourceDetail;
}

export interface ForkResearchObjectInput {
  sourceResearchObjectId: string;
  userId: string;
  /** 目标 workspace（fork 者空间，§8.1 新 RO 独立）。 */
  workspaceId: string;
  title?: string;
  /** 显式目标许可覆盖（缺省复制源，§6.3 继承）。 */
  licenses?: Licenses;
  /** 公开 ID 前缀（PUBLIC_ID_PREFIX env，§24 配置项）。 */
  publicIdPrefix: string;
}

function emptyCore(): Record<string, string> {
  const core: Record<string, string> = { schemaVersion: '0.1.0' };
  for (const field of SDF_CORE_FIELDS) core[field] = '';
  return core;
}

/**
 * Fork（§8.1 + §4.2 + §6.3 + §7.1）：
 * 1. 源 RO public 校验（仅 public 可 fork）+ 目标 workspace 成员校验（§17 越权）
 * 2. 源版本 manifest 读取（§7.2.3 快照）
 * 3. 许可继承校验（Q3）：默认复制源；显式覆盖须 validateLicenseInheritance 通过
 * 4. 单事务：新 RO + sdf core 快照 + artifact 复制（同 blobSha256 物理共享）+ main branch + initial commit + version + manifest + ForkRelation
 * 5. assignPublicId（§8.1 unique ID 永不复用）
 * 6. 审计 fork.create + research_object.create
 */
export async function forkResearchObject(
  deps: ArtifactDeps,
  input: ForkResearchObjectInput,
  ctx: AuditContext = {},
): Promise<ForkResult> {
  const source = await deps.prisma.researchObject.findUnique({ where: { id: input.sourceResearchObjectId } });
  if (!source || source.visibility !== 'public') {
    throw new ForkError('SOURCE_NOT_PUBLIC', '仅公开的 RO 可被 Fork（§4.2）');
  }
  await requireMembership(deps, input.workspaceId, input.userId);

  // 源最新版本 + manifest（§7.2.3 快照）
  const sourceVersion = await deps.prisma.version.findFirst({
    where: { researchObjectId: source.id },
    orderBy: { versionNo: 'desc' },
    include: { manifest: { include: { entries: true } } },
  });
  if (!sourceVersion || !sourceVersion.manifest || sourceVersion.manifest.entries.length === 0) {
    throw new ForkError('VERSION_NO_MANIFEST', '源 RO 无可复刻版本（需至少一次 Commit 生成 Manifest）');
  }
  const sourceManifest = sourceVersion.manifest;
  const sourceEntries = sourceManifest.entries;

  // 许可继承（§6.3 + Q3）：默认复制源有效许可
  const sourceLicenses = await getEffectiveLicenses(deps, { researchObjectId: source.id, userId: input.userId });
  if (!sourceLicenses.licenses) {
    throw new ForkError('VALIDATION_ERROR', '源 RO 未选择三类许可，无法 Fork');
  }
  const targetLicenses = input.licenses ?? sourceLicenses.licenses;
  const inheritance = validateLicenseInheritance(sourceLicenses.licenses, targetLicenses);
  if (!inheritance.ok) {
    throw new ForkError(
      'INHERITANCE_VIOLATION',
      `许可继承校验不通过（§6.3）: ${inheritance.violations.map((v) => `${v.type}: ${v.source}→${v.target}`).join('; ')}`,
    );
  }

  const title = (input.title ?? source.title).trim();
  if (!title || title.length > 200) throw new ForkError('VALIDATION_ERROR', '标题长度需为 1-200 字符');
  const core = (sourceManifest.coreJson as Record<string, string>) ?? emptyCore();

  const result = await deps.prisma.$transaction(async (tx) => {
    // 新 RO + sdf core 快照
    const ro = await tx.researchObject.create({
      data: {
        workspaceId: input.workspaceId,
        title,
        createdBy: input.userId,
        sdfDocument: { create: { coreJson: core as object } },
      },
    });

    // 复制 artifact 行（§7.1 内容寻址：同 blobSha256，物理 Blob MinIO 共享，不复制数据）
    const artifactIdByPath = new Map<string, string>();
    for (const entry of sourceEntries) {
      const srcArtifact = await tx.artifact.findUnique({ where: { id: entry.artifactId } });
      if (!srcArtifact) continue;
      const copy = await tx.artifact.create({
        data: {
          workspaceId: input.workspaceId,
          logicalPath: entry.logicalPath,
          mimeType: srcArtifact.mimeType,
          size: srcArtifact.size,
          blobSha256: srcArtifact.blobSha256,
          uploadedBy: input.userId,
        },
      });
      artifactIdByPath.set(entry.logicalPath, copy.id);
    }

    // main branch + initial commit + version + manifest
    const branch = await tx.branch.create({
      data: { researchObjectId: ro.id, name: 'main', isDefault: true },
    });
    const commit = await tx.commit.create({
      data: { researchObjectId: ro.id, branchId: branch.id, parentCommitId: null, message: `Fork from ${source.id}`, authorId: input.userId },
    });
    const version = await tx.version.create({
      data: { researchObjectId: ro.id, commitId: commit.id, versionNo: 1 },
    });
    await tx.versionManifest.create({
      data: {
        versionId: version.id,
        coreJson: core as object,
        entries: {
          create: sourceEntries.map((e) => ({
            logicalPath: e.logicalPath,
            artifactId: artifactIdByPath.get(e.logicalPath) ?? e.artifactId,
            blobSha256: e.blobSha256,
          })),
        },
      },
    });

    // ForkRelation（§8.1 来源永久保留；forkedRoId 唯一）
    const forkRelation = await tx.forkRelation.create({
      data: {
        forkedRoId: ro.id,
        sourceRoId: source.id,
        sourceVersionId: sourceVersion.id,
        sourceContentHash: computeContentSha256(sourceEntries.map((e) => ({ logicalPath: e.logicalPath, blobSha256: e.blobSha256 }))),
      },
    }).catch((e: unknown) => {
      if (typeof (e as { code?: unknown })?.code === 'string' && (e as { code: string }).code === 'P2002') {
        throw new ForkError('ALREADY_FORKED', '该 RO 已是 Fork 产物（§8.1 一 RO 至多一个来源）', e);
      }
      throw e;
    });

    // 许可继承复制到新 RO（RO 级）
    for (const [type, licenseId] of Object.entries(targetLicenses) as Array<[string, string]>) {
      await tx.licenseAssignment.create({
        data: { researchObjectId: ro.id, versionId: null, licenseType: type, licenseId },
      });
    }

    // unique ID（§8.1 + §6.1；外层事务已开，内联分配避免嵌套事务，§6.1 永不复用并发安全）
    const year = ro.createdAt.getUTCFullYear();
    const seq = (await tx.identifier.count()) + 1;
    const publicId = generatePublicId(input.publicIdPrefix, year, seq);
    const idUpdated = await tx.researchObject.updateMany({
      where: { id: ro.id, publicId: null },
      data: { publicId },
    });
    if (idUpdated.count === 0) {
      throw new ForkError('VALIDATION_ERROR', '公开 ID 分配冲突（§6.1）');
    }
    await tx.identifier.create({
      data: { researchObjectId: ro.id, publicId, issuedAt: new Date() },
    });

    await recordAudit(deps, tx, {
      actorId: input.userId, action: 'fork.create', workspaceId: input.workspaceId,
      targetType: 'research_object', targetId: ro.id,
      metadata: { sourceRoId: source.id, sourceVersionId: sourceVersion.id, title },
    }, ctx);

    const final = await tx.researchObject.findUnique({ where: { id: ro.id } });
    return { ro, final, forkRelation };
  });

  return {
    researchObject: {
      id: result.ro.id,
      title: result.ro.title,
      workspaceId: result.ro.workspaceId,
      visibility: result.ro.visibility,
      publicId: result.final?.publicId ?? '',
    },
    forkRelation: {
      forkedRoId: result.forkRelation.forkedRoId,
      sourceRoId: result.forkRelation.sourceRoId,
      sourceVersionId: result.forkRelation.sourceVersionId,
      sourceContentHash: result.forkRelation.sourceContentHash,
      createdAt: result.forkRelation.createdAt,
    },
  };
}

/**
 * 来源关系只读（§8.1 不可移除 + Q4：无 delete/update API）。
 * 读权限 canAccessRo（public 匿名可读，§4.2）。
 */
export async function getForkSource(
  deps: ArtifactDeps,
  input: { researchObjectId: string; userId?: string },
): Promise<ForkSourceDetail | null> {
  const access = await canAccessRo(deps, { researchObjectId: input.researchObjectId, userId: input.userId });
  if (access === 'denied') return null;
  const rel = await deps.prisma.forkRelation.findUnique({ where: { forkedRoId: input.researchObjectId } });
  if (!rel) return null;
  return {
    forkedRoId: rel.forkedRoId,
    sourceRoId: rel.sourceRoId,
    sourceVersionId: rel.sourceVersionId,
    sourceContentHash: rel.sourceContentHash,
    createdAt: rel.createdAt,
  };
}
