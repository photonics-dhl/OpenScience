import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AuthDeps } from '@openscience/auth';
import { z } from 'zod';
import { TRASH_KINDS, TrashError, listTrash, listCleanableContent, moveToTrash, restoreTrash, purgeTrash, type TrashDeps } from '@openscience/domain';
import { requireCurrentUser } from './session-guard';

export type TrashRouteDeps = AuthDeps & Pick<TrashDeps, 'storage' | 'deleteSearchContent' | 'deletePrivateJobCopies' | 'setSearchContentVisibility'>;
const idParams = z.object({ id: z.string().uuid() });
const trashBody = z.object({ kind: z.enum(TRASH_KINDS), resourceId: z.string().uuid(), deleteUnadopted: z.boolean().optional() }).strict();
function auditContext(req: FastifyRequest) { return { requestId: String(req.id), ip: req.ip }; }

/** Authenticated ownership is rechecked in the domain transaction for every mutation. */
export function registerTrashRoutes(app: FastifyInstance, deps: TrashRouteDeps): void {
  app.get('/trash', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply); if (!user) return;
    const rows = await listTrash(deps, { userId: user.userId });
    return { items: rows.map(row => ({ ...row, title: row.label })) };
  });
  for (const path of ['/content-items', '/research-objects/:id/content-items']) app.get(path, async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply); if (!user) return;
    const researchObjectId = path.includes(':id') ? idParams.parse(req.params).id : undefined;
    return { items: await listCleanableContent(deps, { userId: user.userId, researchObjectId }) };
  });
  app.post('/trash', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply); if (!user) return;
    const result = await moveToTrash(deps, { ...trashBody.parse(req.body), userId: user.userId }, auditContext(req));
    return reply.status(201).send({ ...result, archived: Boolean(result.entry.retainedReason) });
  });
  app.post('/trash/:id/restore', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply); if (!user) return;
    return { entry: await restoreTrash(deps, { ...idParams.parse(req.params), userId: user.userId }, auditContext(req)) };
  });
  app.post('/trash/:id/purge', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply); if (!user) return;
    try {
      const entry = await purgeTrash(deps, { ...idParams.parse(req.params), userId: user.userId }, auditContext(req));
      return reply.status(entry.state === 'purge_pending' ? 202 : 200).send({ entry });
    } catch (error) {
      if (error instanceof TrashError && error.code === 'CLEANUP_PENDING') return reply.status(202).send({ pending: true, message: error.message });
      throw error;
    }
  });
}
