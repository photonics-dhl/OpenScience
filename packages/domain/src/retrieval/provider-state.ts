import { Prisma } from '@prisma/client';

export type ScanSciProviderObservation =
  | { kind: 'auth_required'; actorId: string; taskId: string; workspaceId?: string }
  | { kind: 'succeeded'; actorId: string; taskId: string; workspaceId?: string }
  | { kind: 'other_failure'; actorId: string; taskId: string; workspaceId?: string };

export async function observeScanSciProviderState(
  deps: { prisma: { $transaction<T>(work: (tx: any) => Promise<T>, options?: { isolationLevel: 'Serializable' }): Promise<T> } },
  observation: ScanSciProviderObservation,
): Promise<{ transitioned: boolean; generation?: number }> {
  if (observation.kind === 'other_failure') return { transitioned: false };
  for (let attempt = 0; attempt < 3; attempt += 1) try {
    return await deps.prisma.$transaction(async (tx) => {
    if (observation.kind === 'succeeded') {
      await tx.$executeRaw(Prisma.sql`INSERT INTO "external_provider_states" ("provider", "status", "auth_required_generation", "created_at", "updated_at") VALUES ('scansci', 'healthy', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT ("provider") DO UPDATE SET "status" = 'healthy', "updated_at" = CURRENT_TIMESTAMP`);
      return { transitioned: false };
    }
    await tx.$executeRaw(Prisma.sql`INSERT INTO "external_provider_states" ("provider", "status", "auth_required_generation", "created_at", "updated_at") VALUES ('scansci', 'healthy', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT ("provider") DO NOTHING`);
    const updated = await tx.$queryRaw(Prisma.sql`UPDATE "external_provider_states" SET "status" = 'auth_required', "auth_required_generation" = "auth_required_generation" + 1, "updated_at" = CURRENT_TIMESTAMP WHERE "provider" = 'scansci' AND "status" <> 'auth_required' RETURNING "auth_required_generation" AS "generation"`) as Array<{ generation: number }>;
    const generation = updated[0]?.generation;
    if (generation === undefined) return { transitioned: false };
    await tx.auditLog.create({ data: { actorId: observation.actorId, action: 'external_retrieval.auth_required', workspaceId: observation.workspaceId ?? null, targetType: 'agent_task', targetId: observation.taskId, metadata: { provider: 'scansci', generation } } });
    const administrators = await tx.user.findMany({ where: { platformRole: 'platform_admin' }, select: { id: true } });
    await Promise.all(administrators.map(({ id }: { id: string }) => tx.notification.create({ data: { userId: id, type: 'external_retrieval.auth_required', idempotencyKey: `external_retrieval.auth_required:scansci:${generation}:${id}`, payload: { provider: 'scansci', generation, taskId: observation.taskId } } })));
    return { transitioned: true, generation };
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if ((error as { code?: unknown })?.code === 'P2034' && attempt < 2) continue;
    throw error;
  }
  throw new Error('unreachable');
}
