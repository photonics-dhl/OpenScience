import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AuthDeps } from '@openscience/auth';
import type { AuditContext } from '@openscience/observability';
import {
  createEditorialSelection,
  EDITORIAL_STATES,
  listEditorialSelections,
  transitionEditorialSelection,
  updateEditorialSelection,
} from '@openscience/domain';
import { requireCurrentUser } from './session-guard';
import { requirePlatformAdmin } from './admin';

const collectionParams = z.object({ slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80) });
const selectionParams = z.object({ id: z.string().uuid() });
const mediaSchema = z.object({
  type: z.enum(['image', 'video']),
  url: z.string().url().max(2000),
  alt: z.string().min(1).max(300),
  credit: z.string().min(1).max(200),
  licenseId: z.string().min(1).max(80),
  sourceUrl: z.string().url().max(2000),
});

function auditCtx(req: FastifyRequest): AuditContext {
  return { requestId: String(req.id), ip: req.ip };
}

/** Application-authenticated editorial workflow; domain enforces platform_admin on every operation. */
export function registerAdminEditorialRoutes(app: FastifyInstance, deps: AuthDeps): void {
  app.get('/editorial/candidates', async (req, reply) => {
    if (!(await requirePlatformAdmin(deps, req, reply))) return;
    const rows = await deps.prisma.researchObject.findMany({
      where: { visibility: 'public', publicId: { not: null }, versions: { some: { status: 'published' } } },
      orderBy: { publicId: 'asc' },
      take: 200,
      include: { versions: { where: { status: 'published' }, orderBy: { versionNo: 'desc' }, take: 1 } },
    });
    return reply.send({ candidates: rows.flatMap((row) => row.versions[0] ? [{ publicId: row.publicId!, title: row.title, versionId: row.versions[0].id, versionNo: row.versions[0].versionNo }] : []) });
  });

  app.get('/editorial/collections/:slug/selections', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { slug } = collectionParams.parse(req.params);
    return reply.send({ collection: await listEditorialSelections(deps, { userId: user.userId, collectionSlug: slug }) });
  });

  app.post('/editorial/collections/:slug/selections', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { slug } = collectionParams.parse(req.params);
    const body = z.object({
      versionId: z.string().uuid(),
      note: z.string().max(4000).optional(),
      media: z.array(mediaSchema).max(8).optional(),
      sortOrder: z.number().int().min(-10000).max(10000).optional(),
    }).parse(req.body);
    const selection = await createEditorialSelection(deps, {
      userId: user.userId, collectionSlug: slug, ...body,
    }, auditCtx(req));
    return reply.status(201).send({ selection });
  });

  app.patch('/editorial/selections/:id', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = selectionParams.parse(req.params);
    const body = z.object({
      note: z.string().max(4000).optional(),
      media: z.array(mediaSchema).max(8).optional(),
      sortOrder: z.number().int().min(-10000).max(10000).optional(),
    }).refine((value) => Object.keys(value).length > 0, 'At least one editable field is required.').parse(req.body);
    return reply.send({ selection: await updateEditorialSelection(deps, { userId: user.userId, selectionId: id, ...body }, auditCtx(req)) });
  });

  app.post('/editorial/selections/:id/transition', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = selectionParams.parse(req.params);
    const body = z.object({ state: z.enum(EDITORIAL_STATES), scheduledAt: z.string().datetime().optional() }).parse(req.body);
    return reply.send({
      selection: await transitionEditorialSelection(deps, {
        userId: user.userId,
        selectionId: id,
        state: body.state,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
      }, auditCtx(req)),
    });
  });
}
