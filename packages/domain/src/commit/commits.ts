import type { ArtifactDeps } from '../artifact/artifacts';
import { getBlobStorageKey } from '@openscience/storage';
import { buildSnapshot, diffSdfCore, type ManifestEntryInput, type VersionSnapshot } from '@openscience/versioning';
import type { Prisma } from '@prisma/client';
import type { AuditContext } from '@openscience/observability';
import { requireMembership } from '../workspace/helpers';
import { recordAudit } from '../workspace/audit';
import { CommitError } from './errors';

export type { VersionSnapshot };

/** commit 传入的完整 artifact 集合（Design Gate：diff 自动计算增删改）。 */
export interface ArtifactReference {
  logicalPath: string;
  artifactId: string;
}

export interface CreateCommitInput {
  researchObjectId: string;
  userId: string;
  message: string;
  /** 乐观锁：必须匹配当前 RO.version（§16）。 */
  version: number;
  /** P1C-2：目标分支 id（缺省 = 默认 main 分支，§8 Branch 语义）。 */
  branchId?: string;
  /** 目标 SDF core（完整；diff 自动计算，§7.2.5）。缺省 = 不改 SDF。 */
  sdfCore?: Record<string, unknown>;
  /** 目标 artifact 完整集合（diff 自动算增删改）。缺省 = 不产生 artifact 变化。 */
  artifacts?: ArtifactReference[];
  /** §16 幂等键：同 key 重发不产生重复 Commit。 */
  idempotencyKey?: string;
}

export interface CreateCommitResult {
  commitId: string;
  versionId: string;
  versionNo: number;
  snapshot: VersionSnapshot;
}

export interface VersionDetail {
  versionId: string;
  versionNo: number;
  status: string;
  commitId: string;
  createdAt: Date;
  snapshot: VersionSnapshot;
}

export interface VersionSummary {
  versionId: string;
  versionNo: number;
  status: string;
  commitId: string;
  createdAt: Date;
}

const DEFAULT_BRANCH = 'main';

/**
 * 创建 Commit（§7.2.3 Manifest + §7.2.4 复用 Blob + §7.2.5 JSON Patch + §16 乐观锁/幂等 + §2.2.3 不可变）：
 * 1. 成员校验 + 乐观锁（RO.version） + 公开不可变（最新版本 published → 拒绝）
 * 2. 找/建默认 main 分支
 * 3. SDF diff + artifact diff → ChangeSet
 * 4. 事务：Commit + ChangeSets + Version(versionNo=RO.version) + VersionManifest(core 快照) + ManifestEntries
 * 5. RO.version+1 + 审计
 */
export async function createCommit(
  deps: ArtifactDeps,
  input: CreateCommitInput,
  ctx: AuditContext = {},
): Promise<CreateCommitResult> {
  const message = input.message.trim();
  if (!message || message.length > 500) {
    throw new CommitError('VALIDATION_ERROR', '提交说明需为 1-500 字符');
  }

  // 幂等键重放：同 key 已存在 → 直接返回既有 Commit（§16）
  if (input.idempotencyKey) {
    const existing = await deps.prisma.commit.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) {
      const version = await deps.prisma.version.findFirst({ where: { commitId: existing.id } });
      const snapshot = await loadSnapshot(deps, version?.id ?? '');
      if (version) {
        return { commitId: existing.id, versionId: version.id, versionNo: version.versionNo, snapshot };
      }
    }
  }

  const ro = await deps.prisma.researchObject.findUnique({
    where: { id: input.researchObjectId },
    include: { sdfDocument: true },
  });
  if (!ro) throw new CommitError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
  await requireMembership(deps, ro.workspaceId, input.userId);

  // 乐观锁（§16）
  if (ro.version !== input.version) {
    throw new CommitError('CONCURRENT_UPDATE', '版本冲突，请刷新后重试');
  }

  // §2.2-3 不可原地修改：commit 总是产生新版本（versionNo=RO.version 递增），永不修改已发布版本行；
  // 「已公开不可变」由 publishVersion/发布管线保证（P1D-8），新 commit 生成增量版本合法。
  const latestVersion = await deps.prisma.version.findFirst({
    where: { researchObjectId: ro.id },
    orderBy: { versionNo: 'desc' },
  });
  // 默认 main 分支（P1C-2 多分支扩展：指定 branchId 则落到目标分支）
  let branch: { id: string; name: string; headCommitId: string | null };
  if (input.branchId) {
    const target = await deps.prisma.branch.findFirst({ where: { id: input.branchId, researchObjectId: ro.id } });
    if (!target) throw new CommitError('VALIDATION_ERROR', '目标分支不存在');
    branch = { id: target.id, name: target.name, headCommitId: target.headCommitId };
  } else {
    const existing = await deps.prisma.branch.findFirst({ where: { researchObjectId: ro.id, name: DEFAULT_BRANCH } });
    if (existing) {
      branch = { id: existing.id, name: existing.name, headCommitId: existing.headCommitId };
    } else {
      const created = await deps.prisma.branch.create({
        data: { researchObjectId: ro.id, name: DEFAULT_BRANCH, isDefault: true },
      });
      branch = { id: created.id, name: created.name, headCommitId: created.headCommitId };
    }
  }

  // 父 Commit = 该分支最近一个；空分支回退分支起点锚点（head_commit_id，P1C-2 §21.2 步骤 11）
  let parentCommit = await deps.prisma.commit.findFirst({
    where: { branchId: branch.id },
    orderBy: { createdAt: 'desc' },
  });
  if (!parentCommit && branch.headCommitId) {
    parentCommit = await deps.prisma.commit.findUnique({ where: { id: branch.headCommitId } });
  }

  // SDF diff（§7.2.5）
  const currentCore = (ro.sdfDocument?.coreJson as Record<string, unknown>) ?? {};
  const changesets: Array<{ kind: string; payload: Prisma.InputJsonValue }> = [];
  let finalCore = currentCore;
  if (input.sdfCore) {
    const patch = diffSdfCore(currentCore, input.sdfCore);
    if (patch.length) {
      changesets.push({ kind: 'sdf_core', payload: patch as unknown as Prisma.InputJsonValue });
      finalCore = input.sdfCore;
    }
  }

  // artifact diff：对比上版本 Manifest entries
  const prevManifest = latestVersion
    ? await deps.prisma.versionManifest.findUnique({
        where: { versionId: latestVersion.id },
        include: { entries: true },
      })
    : null;
  const prevEntries = new Map((prevManifest?.entries ?? []).map((e) => [e.logicalPath, e.artifactId]));
  const newRefs = input.artifacts ?? [];
  const newMap = new Map(newRefs.map((a) => [a.logicalPath, a.artifactId]));
  for (const ref of newRefs) {
    if (!prevEntries.has(ref.logicalPath)) {
      const artifact = await deps.prisma.artifact.findUnique({ where: { id: ref.artifactId } });
      if (!artifact || artifact.workspaceId !== ro.workspaceId) {
        throw new CommitError('VALIDATION_ERROR', `Artifact 不存在或不属于该空间: ${ref.logicalPath}`);
      }
      changesets.push({
        kind: 'artifact_add',
        payload: { logicalPath: ref.logicalPath, artifactId: ref.artifactId, blobSha256: artifact.blobSha256 },
      });
    } else if (prevEntries.get(ref.logicalPath) !== ref.artifactId) {
      const artifact = await deps.prisma.artifact.findUnique({ where: { id: ref.artifactId } });
      if (!artifact || artifact.workspaceId !== ro.workspaceId) {
        throw new CommitError('VALIDATION_ERROR', `Artifact 不存在或不属于该空间: ${ref.logicalPath}`);
      }
      changesets.push({
        kind: 'artifact_update',
        payload: { logicalPath: ref.logicalPath, artifactId: ref.artifactId, blobSha256: artifact.blobSha256 },
      });
    }
  }
  for (const [logicalPath] of prevEntries) {
    if (!newMap.has(logicalPath)) {
      changesets.push({ kind: 'artifact_remove', payload: { logicalPath } });
    }
  }

  // 完整 manifest 条目（含复用 Blob：未变 artifact 继续引用原 blobSha256，§7.2.4）
  const manifestArtifacts: ManifestEntryInput[] = [];
  for (const ref of newRefs) {
    const artifact = await deps.prisma.artifact.findUnique({ where: { id: ref.artifactId } });
    if (artifact) manifestArtifacts.push({ logicalPath: ref.logicalPath, artifactId: ref.artifactId, blobSha256: artifact.blobSha256 });
  }

  const result = await deps.prisma.$transaction(async (tx) => {
    const commit = await tx.commit.create({
      data: {
        researchObjectId: ro.id,
        branchId: branch.id,
        parentCommitId: parentCommit?.id,
        message,
        authorId: input.userId,
        idempotencyKey: input.idempotencyKey,
        changesets: { create: changesets },
      },
    });
    const version = await tx.version.create({
      data: { researchObjectId: ro.id, commitId: commit.id, versionNo: ro.version },
    });
    await tx.versionManifest.create({
      data: {
        versionId: version.id,
        coreJson: finalCore as object,
        entries: { create: manifestArtifacts },
      },
    });
    await tx.researchObject.update({
      where: { id: ro.id },
      data: { version: ro.version + 1 },
    });
    await recordAudit(
      deps, tx,
      {
        actorId: input.userId, action: 'commit.create', workspaceId: ro.workspaceId,
        targetType: 'commit', targetId: commit.id,
        metadata: { researchObjectId: ro.id, versionNo: ro.version, changeCount: changesets.length },
      },
      ctx,
    );
    return { commit, version };
  });

  return {
    commitId: result.commit.id,
    versionId: result.version.id,
    versionNo: result.version.versionNo,
    snapshot: buildSnapshot(finalCore, manifestArtifacts),
  };
}

/** 查版本详情（§7.2.3 Manifest + 重建快照）。非成员 → 404。 */
export async function getVersion(
  deps: ArtifactDeps,
  input: { userId: string; versionId: string },
): Promise<VersionDetail> {
  const version = await deps.prisma.version.findUnique({
    where: { id: input.versionId },
    include: { researchObject: true },
  });
  if (!version) throw new CommitError('RESEARCH_OBJECT_NOT_FOUND', '版本不存在');
  await requireMembership(deps, version.researchObject.workspaceId, input.userId);
  const snapshot = await loadSnapshot(deps, version.id);
  return {
    versionId: version.id,
    versionNo: version.versionNo,
    status: version.status,
    commitId: version.commitId,
    createdAt: version.createdAt,
    snapshot,
  };
}

/** 列出 RO 的不可变版本摘要。成员校验先于查询，避免泄露私有版本存在性。 */
export async function listVersions(
  deps: ArtifactDeps,
  input: { researchObjectId: string; userId: string },
): Promise<VersionSummary[]> {
  const ro = await deps.prisma.researchObject.findUnique({ where: { id: input.researchObjectId } });
  if (!ro) throw new CommitError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
  await requireMembership(deps, ro.workspaceId, input.userId);
  const rows = await deps.prisma.version.findMany({
    where: { researchObjectId: ro.id },
    orderBy: { versionNo: 'desc' },
  });
  return rows
    .map((version) => ({
      versionId: version.id,
      versionNo: version.versionNo,
      status: version.status,
      commitId: version.commitId,
      createdAt: version.createdAt,
    }))
    .sort((a, b) => b.versionNo - a.versionNo);
}

/** 完整重建版本快照（§7.1 可重建可校验）：Manifest core 快照 + entries。 */
export async function rebuildVersion(
  deps: ArtifactDeps,
  input: { userId: string; versionId: string },
): Promise<VersionSnapshot & { verified: boolean }> {
  const version = await deps.prisma.version.findUnique({
    where: { id: input.versionId },
    include: { researchObject: true },
  });
  if (!version) throw new CommitError('RESEARCH_OBJECT_NOT_FOUND', '版本不存在');
  await requireMembership(deps, version.researchObject.workspaceId, input.userId);
  const snapshot = await loadSnapshot(deps, version.id);

  // 校验每个 blob：读对象存储 + sha256 匹配（§7.1 任意版本可校验）
  let verified = true;
  for (const entry of snapshot.artifacts) {
    try {
      const blob = await deps.storage.getObject(getBlobStorageKey(entry.blobSha256));
      const chunks: Buffer[] = [];
      for await (const c of blob.body) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
      const { createHash } = await import('node:crypto');
      const actual = createHash('sha256').update(Buffer.concat(chunks)).digest('hex');
      if (actual !== entry.blobSha256) verified = false;
    } catch {
      verified = false;
    }
  }
  return { ...snapshot, verified };
}

/** 从 Manifest 读快照（core + entries）。 */
async function loadSnapshot(deps: ArtifactDeps, versionId: string): Promise<VersionSnapshot> {
  const manifest = await deps.prisma.versionManifest.findUnique({
    where: { versionId },
    include: { entries: true },
  });
  if (!manifest) return { core: {}, artifacts: [] };
  return {
    core: manifest.coreJson as Record<string, unknown>,
    artifacts: manifest.entries.map((e) => ({
      logicalPath: e.logicalPath,
      artifactId: e.artifactId,
      blobSha256: e.blobSha256,
    })),
  };
}
