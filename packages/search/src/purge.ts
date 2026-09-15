import type { PrismaClient } from '../generated/client';

/** Remove private indexed content after the core lifecycle service has authorized erasure. */
export async function deleteSearchContent(client: PrismaClient, scope: {
  workspaceId?: string; researchObjectId?: string; taskIds: string[]; artifactIds: string[];
}): Promise<void> {
  if (!scope.researchObjectId && !scope.taskIds.length && !scope.artifactIds.length) return;
  const workspace = scope.workspaceId ? { workspaceId: scope.workspaceId } : {};
  const shared = [
    ...(scope.researchObjectId ? [{ researchObjectId: scope.researchObjectId }] : []),
    ...(scope.artifactIds.length ? [{ artifactId: { in: scope.artifactIds } }] : []),
  ];
  await client.$transaction(async tx => {
    await tx.searchChunk.deleteMany({ where: { ...workspace, OR: [...shared,
      ...(scope.taskIds.length ? [{ indexTask: { fenceOwnerTaskId: { in: scope.taskIds } } }] : []),
    ] } });
    await tx.searchIndexTask.deleteMany({ where: { ...workspace, OR: [...shared,
      ...(scope.taskIds.length ? [{ fenceOwnerTaskId: { in: scope.taskIds } }] : []),
    ] } });
  });
}
