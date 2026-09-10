import type { SdfNodeType } from '@prisma/client';
import { SDF_CORE_FIELDS } from '@openscience/sdf-schema';
import type { WorkspaceDeps } from '../workspace/types';

export const EXPLORE_ARTIFACT_TYPES = ['document', 'image', 'data', 'code', 'video', 'other'] as const;
export type ExploreArtifactType = (typeof EXPLORE_ARTIFACT_TYPES)[number];

export interface ResearchIndexItem {
  publicId: string;
  title: string;
  url: string;
  latestVersion: number;
  publishedAt: string | null;
  updatedAt: string;
  insight: string | null;
  fields: SdfNodeType[];
  artifactTypes: ExploreArtifactType[];
  authors: string[];
}

export interface ResearchIndexPage {
  items: ResearchIndexItem[];
  nextCursor: string | null;
}

const EXTENSIONS: Record<Exclude<ExploreArtifactType, 'other'>, string[]> = {
  document: ['.pdf', '.doc', '.docx', '.md', '.tex', '.txt', '.rtf'],
  image: ['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.webp'],
  data: ['.csv', '.tsv', '.json', '.yaml', '.yml', '.parquet', '.h5', '.hdf5'],
  code: ['.py', '.r', '.ipynb', '.jl', '.m', '.sh'],
  video: ['.mp4', '.webm', '.mov', '.avi'],
};

export function classifyExploreArtifact(logicalPath: string): ExploreArtifactType {
  const normalized = logicalPath.toLocaleLowerCase();
  for (const [type, extensions] of Object.entries(EXTENSIONS) as Array<[Exclude<ExploreArtifactType, 'other'>, string[]]>) {
    if (extensions.some((extension) => normalized.endsWith(extension))) return type;
  }
  return 'other';
}

export async function listPublicResearchIndex(
  deps: Pick<WorkspaceDeps, 'prisma'>,
  input: { query?: string; cursor?: string; limit: number; field?: SdfNodeType; artifactType?: ExploreArtifactType },
): Promise<ResearchIndexPage> {
  const query = input.query?.trim().toLocaleLowerCase();
  const loadPage = (cursor?: string) => deps.prisma.researchObject.findMany({
    where: {
      visibility: 'public',
      status: { not: 'archived' },
      publicId: { not: null, ...(cursor ? { gt: cursor } : {}) },
      versions: { some: { status: 'published', publications: { some: {} } } },
    },
    include: {
      versions: {
        where: { status: 'published', publications: { some: {} } }, orderBy: { versionNo: 'desc' }, take: 1,
        include: { manifest: { include: { entries: true } }, publications: true },
      },
      authors: { orderBy: { sortOrder: 'asc' }, include: { user: { select: { displayName: true } } } },
    },
    orderBy: { publicId: 'asc' },
    take: 100,
  });
  // Evaluate all content filters against the same latest published snapshot that
  // is displayed. In particular, never search unpublished SDF edits.
  const rows: Awaited<ReturnType<typeof loadPage>> = [];
  let cursor = input.cursor;
  while (rows.length <= input.limit) {
    const page = await loadPage(cursor);
    if (page.length === 0) break;
    for (const row of page) {
      const manifest = row.versions[0].manifest;
      const core = (manifest?.coreJson ?? {}) as Record<string, unknown>;
      if (query && ![row.title, ...SDF_CORE_FIELDS.map(field => core[field])].some(value => typeof value === 'string' && value.toLocaleLowerCase().includes(query))) continue;
      if (input.field && (typeof core[input.field] !== 'string' || !(core[input.field] as string).trim())) continue;
      if (input.artifactType && !manifest?.entries.some(entry => classifyExploreArtifact(entry.logicalPath) === input.artifactType)) continue;
      rows.push(row);
      if (rows.length > input.limit) break;
    }
    if (page.length < 100) break;
    cursor = page[page.length - 1].publicId!;
  }

  const hasMore = rows.length > input.limit;
  const visible = rows.slice(0, input.limit);
  const items = visible.map((row): ResearchIndexItem => {
    const version = row.versions[0];
    const core = (version.manifest?.coreJson ?? {}) as Record<string, unknown>;
    const fields = SDF_CORE_FIELDS.filter((field) => typeof core[field] === 'string' && (core[field] as string).trim());
    const artifactTypes = [...new Set((version?.manifest?.entries ?? []).map((entry) => classifyExploreArtifact(entry.logicalPath)))];
    return {
      publicId: row.publicId!,
      title: row.title,
      url: `/research/${row.publicId}`,
      latestVersion: version.versionNo,
      publishedAt: version.publications[0]?.publishedAt.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
      insight: typeof core.insight === 'string' && core.insight.trim() ? core.insight : null,
      fields: [...fields],
      artifactTypes,
      authors: row.authors.map((author) => author.user.displayName),
    };
  });
  return { items, nextCursor: hasMore ? items.at(-1)?.publicId ?? null : null };
}
