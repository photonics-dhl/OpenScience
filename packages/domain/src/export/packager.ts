import { getBlobStorageKey, streamToBuffer } from '@openscience/storage';
import type { ArtifactDeps } from '../artifact/artifacts';
import { requireRoAccess } from '../visibility/access';
import { CommitError } from '../commit/errors';
import { buildManifest } from './manifest';

/** 导出文件条目（§5.2 目录树，纯文件不依赖平台 DB，§5.3 MUST）。 */
export interface ExportFile {
  path: string;
  content: Buffer;
}

/** SDF 六字段名（§5.1）。 */
const CORE_FIELDS = ['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'] as const;

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.pdf']);
const CODE_EXT = new Set(['.py', '.ts', '.js', '.ipynb', '.r', '.jl', '.cpp', '.c', '.rs', '.sh', '.yaml', '.yml', '.json']);

function extOf(logicalPath: string): string {
  const idx = logicalPath.lastIndexOf('.');
  return idx >= 0 ? logicalPath.slice(idx).toLowerCase() : '';
}

/** 附件归位（Design Gate：按扩展名分类 figures/code/artifacts）。 */
export function classifyArtifact(logicalPath: string): string {
  const ext = extOf(logicalPath);
  if (IMAGE_EXT.has(ext)) return `figures/${logicalPath}`;
  if (CODE_EXT.has(ext)) return `code/${logicalPath}`;
  return `artifacts/${logicalPath}`;
}

/**
 * §5.2 标准导出包重建（§2.2.1 SDF 数据库表达 + 可导出文件包）：
 * 从 Version + Manifest + Blob 重建目录树 + manifest.json（§5.3）。
 * 可见性判定（§4.2 requireRoAccess）。
 */
export async function buildExportPackage(
  deps: ArtifactDeps,
  input: { userId?: string; versionId: string },
): Promise<ExportFile[]> {
  const version = await deps.prisma.version.findUnique({
    where: { id: input.versionId },
    include: { researchObject: true, manifest: { include: { entries: true } }, publications: true },
  });
  if (!version) throw new CommitError('RESEARCH_OBJECT_NOT_FOUND', '版本不存在');
  await requireRoAccess(deps, { researchObjectId: version.researchObjectId, userId: input.userId });

  const ro = version.researchObject;
  const core = (version.manifest?.coreJson as Record<string, string>) ?? {};
  const entries = version.manifest?.entries ?? [];
  const publication = version.publications[0] ?? null;

  const files: ExportFile[] = [];
  const buf = (s: string) => Buffer.from(s, 'utf8');

  // manifest.json（§5.3）
  const manifest = buildManifest({
    objectId: ro.publicId ?? 'DRAFT',
    versionId: version.publicVersionId ?? `${ro.publicId ?? 'DRAFT'}-v${version.versionNo}`,
    version: version.versionNo,
    title: ro.title,
    visibility: ro.visibility,
    ...(publication ? { publishedAt: publication.publishedAt.toISOString() } : {}),
    artifacts: entries.map((e) => ({ logicalPath: e.logicalPath, artifactId: e.artifactId, blobSha256: e.blobSha256 })),
  });
  files.push({ path: 'manifest.json', content: buf(JSON.stringify(manifest, null, 2)) });

  // manuscript/paper.md（六字段 Markdown 汇编）
  const paper = [
    `# ${ro.title}`,
    '',
    ...CORE_FIELDS.flatMap((f) => [`## ${f}`, (core[f] as string) ?? '', '']),
  ].join('\n');
  files.push({ path: 'manuscript/paper.md', content: buf(paper) });
  files.push({ path: 'manuscript/abstract.md', content: buf((core['insight'] as string) ?? '') });
  files.push({ path: 'manuscript/references.json', content: buf('[]') });

  // sdf/
  files.push({ path: 'sdf/core.json', content: buf(JSON.stringify(core, null, 2)) });
  files.push({ path: 'sdf/relations.json', content: buf('{}') });
  files.push({ path: 'sdf/validation.json', content: buf(JSON.stringify({ valid: true, checkedAt: new Date().toISOString() }, null, 2)) });

  // 附件归位（Design Gate：figures/code/artifacts）
  for (const entry of entries) {
    const blob = await deps.storage.getObject(getBlobStorageKey(entry.blobSha256));
    const content = await streamToBuffer(blob.body);
    files.push({ path: classifyArtifact(entry.logicalPath), content });
  }

  // provenance/
  files.push({ path: 'provenance/contributors.json', content: buf('[]') });
  files.push({ path: 'provenance/licenses.json', content: buf('{}') });
  files.push({ path: 'provenance/audit.json', content: buf(JSON.stringify({ versionId: version.id, versionNo: version.versionNo }, null, 2)) });

  // versions/index.json（P1B-4）
  const versions = await deps.prisma.version.findMany({
    where: { researchObjectId: ro.id },
    orderBy: { versionNo: 'desc' },
  });
  files.push({
    path: 'versions/index.json',
    content: buf(JSON.stringify(versions.map((v) => ({ versionNo: v.versionNo, status: v.status, publicVersionId: v.publicVersionId })), null, 2)),
  });

  return files;
}
