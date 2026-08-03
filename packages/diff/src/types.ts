import type { Operation } from '@openscience/versioning';

/** §7.3 九类确定性 diff 类型（§7.1 差异区分）。 */
export type DiffType =
  | 'text' // 文本行级
  | 'sdf_field' // SDF 字段（RFC 6902）
  | 'conclusion' // 结论变化摘要
  | 'authors' // 作者/贡献者变化
  | 'citations' // 引用变化
  | 'file' // 文件增删与哈希（§7.2.6 大二进制仅元数据）
  | 'table' // 表格数据摘要
  | 'code' // 代码行级
  | 'license'; // 许可证与可见性

/** 变化种类。 */
export type ChangeKind = 'added' | 'removed' | 'modified' | 'metadata_only';

/** 行级 diff 块（text/code）。 */
export interface LineHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: Array<{ prefix: ' ' | '+' | '-'; content: string }>;
}

/** 单条 diff 变化。 */
export interface DiffChange {
  type: DiffType;
  path: string; // 定位（文件路径 / SDF 字段 / 代码段）
  kind: ChangeKind;
  before?: unknown;
  after?: unknown;
  hunks?: LineHunk[];
  patchOp?: Operation; // SDF 字段 RFC 6902 op
  metadata?: { size?: number; sha256?: string; mimeType?: string }; // 文件级仅元数据（§7.2.6）
}

/** 结构化 diff 结果（供编辑器版本导航 + Phase 1D Versions & Diff 标签消费，§4.3）。 */
export interface DiffResult {
  versionFrom: string;
  versionTo: string;
  changes: DiffChange[];
}

/** Manifest 文件条目输入（对比两版本文件清单）。 */
export interface FileEntryInput {
  logicalPath: string;
  artifactId: string;
  blobSha256: string;
}

/** 大二进制阈值：> 该字节数不生成行级 diff，仅元数据（§7.2.6）。 */
export const LARGE_BINARY_THRESHOLD = 1 * 1024 * 1024; // 1MB

/** 版本附带元数据（作者/引用/表格/许可证/可见性，Phase 1C 建表前由 input 传入）。 */
export interface VersionMetaInput {
  authors?: string[];
  citations?: string[];
  table?: string; // CSV/TSV
  license?: string;
  visibility?: string;
}
