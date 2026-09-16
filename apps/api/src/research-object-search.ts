import type { AuthDeps } from '@openscience/auth';
import { WorkspaceError, type listResearchObjects } from '@openscience/domain';
import type { Prisma } from '@prisma/client';
import type { createHybridSearchService, HybridSearchResponse } from '@openscience/search';

export type ResearchObjectSearchService = Pick<ReturnType<typeof createHybridSearchService>, 'search'>;
type SearchSuccess = Extract<HybridSearchResponse, { status: 'ok' }>;
type ResearchListItem = Awaited<ReturnType<typeof listResearchObjects>>[number];
export interface ResearchObjectSearchResult {
  researchObjects: ResearchListItem[];
  search: {
    mode: SearchSuccess['mode'] | 'metadata_only';
    degradationCode?: SearchSuccess['degradationCode'] | 'search_not_configured' | 'search_unavailable'
      | 'payload_capacity_exceeded';
  };
}

/** Indexed passages remain internal; the core database authorizes every returned entity. */
export async function searchResearchObjects(
  deps: Pick<AuthDeps, 'prisma'> & { researchObjectSearch?: ResearchObjectSearchService },
  input: { userId: string; workspaceId: string; query: string; limit: number },
): Promise<ResearchObjectSearchResult> {
  const membership = await deps.prisma.membership.findUnique({
    where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } },
  });
  if (!membership) throw new WorkspaceError('WORKSPACE_NOT_FOUND', '空间不存在');

  const authorized: Prisma.ResearchObjectWhereInput = {
    workspaceId: input.workspaceId,
    workspace: { members: { some: { userId: input.userId } } },
    deletedAt: null,
    status: { not: 'archived' },
  };
  const select = {
    id: true, workspaceId: true, title: true, status: true, visibility: true, version: true,
    publicId: true, createdAt: true, updatedAt: true,
  } as const;
  // Titles and public identifiers remain searchable for papers whose source index is pending.
  const metadataRows = await deps.prisma.researchObject.findMany({
    where: { ...authorized, OR: [
      { title: { contains: input.query, mode: 'insensitive' } },
      { publicId: { contains: input.query, mode: 'insensitive' } },
    ] },
    select,
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    take: input.limit,
  });
  let result: HybridSearchResponse | undefined;
  if (deps.researchObjectSearch) {
    try {
      result = await deps.researchObjectSearch.search({
        tenantId: input.workspaceId, query: input.query, limit: 100,
      });
    } catch {
      // Do not log the exception or query: storage/provider failures can contain private input.
      result = { status: 'unavailable', code: 'search_unavailable' };
    }
  }
  const ids = result?.status === 'ok'
    ? [...new Set(result.candidates.flatMap(candidate =>
      candidate.tenantId === input.workspaceId && candidate.researchObjectId ? [candidate.researchObjectId] : []))]
    : [];
  // Re-check membership after retrieval, including the metadata fallback, so revocation while
  // BGE is running cannot return a previously authorized list.
  const rows = await deps.prisma.researchObject.findMany({
    where: { ...authorized, id: { in: [...new Set([...metadataRows.map(row => row.id), ...ids])] } },
    select,
  });
  const byId = new Map(rows.map(row => [row.id, row]));
  const orderedIds = [...new Set([...metadataRows.map(row => row.id), ...ids])];
  const researchObjects = orderedIds.flatMap(id => {
    const row = byId.get(id);
    return row ? [row] : [];
  }).slice(0, input.limit);
  const search: ResearchObjectSearchResult['search'] = result?.status === 'ok'
    ? { mode: result.mode, ...(result.degradationCode ? { degradationCode: result.degradationCode } : {}) }
    : { mode: 'metadata_only', degradationCode: result?.code ?? 'search_not_configured' };
  return { researchObjects, search };
}
