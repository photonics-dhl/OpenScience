import { applySdfPatch, type Operation } from './patch';

/** Manifest 条目的最小输入（重建时无需 join Blob，blobSha256 冗余在 ManifestEntry）。 */
export interface ManifestEntryInput {
  logicalPath: string;
  artifactId: string;
  blobSha256: string;
}

/** 重建后的完整版本快照（§7.1 任意版本可完整重建）。 */
export interface VersionSnapshot {
  core: Record<string, unknown>;
  artifacts: ManifestEntryInput[];
}

/**
 * 从初始 core + 沿 commit 链的 patch 序列重建版本 SDF core（§7.2.5 apply 链）。
 * - baseCore：RO 创建时 SdfDocument.coreJson 基准（Design Gate：初始 core 来源）
 * - corePatches：沿 commit 链的 sdf_core 单 op 序列（按 commit 顺序）
 */
export function rebuildCore(
  baseCore: Record<string, unknown>,
  corePatches: Operation[][],
): Record<string, unknown> {
  let core = structuredClone(baseCore);
  for (const patch of corePatches) {
    core = applySdfPatch(core, patch);
  }
  return core;
}

/** 组装完整版本快照（core + artifact 引用）。 */
export function buildSnapshot(
  core: Record<string, unknown>,
  artifacts: ManifestEntryInput[],
): VersionSnapshot {
  return { core, artifacts };
}
