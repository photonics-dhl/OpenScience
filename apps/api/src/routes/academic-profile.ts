import type { FastifyInstance } from 'fastify';
import type { AuthDeps } from '@openscience/auth';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { buildErrorBody } from '@openscience/observability';
import { canReadCurrentPublicResearch, readPublicationMetadata } from '@openscience/domain';
import { requireCurrentUser } from './session-guard';

const text = (limit = 500) => z.string().trim().max(limit);
const externalUrl = z.string().trim().max(2048).refine(value => {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password; }
  catch { return false; }
}, 'Only http(s) links are allowed');
function bitmapAvatar(value: string): boolean {
  if (!value) return true;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > 262144 || bytes.length < 12) return false;
  if (match[1] === 'png') return bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (match[1] === 'jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}
const link = z.object({ label: text(120).min(1), url: externalUrl }).strict();
const work = z.object({
  category: text(100), period: text(80), shortTitle: text(180).min(1), summary: text(600),
  fullTitle: text(300), problem: text(3000), contribution: text(4000), process: text(4000),
  outcome: text(1000).default(''), capabilities: z.array(text(80).min(1)).max(5).default([]),
  links: z.array(link).max(100),
}).strict();
const interest = z.object({ title: text(120).min(1), body: text(1000),
  kind: z.enum(['recruitment', 'job_search', 'hiring', 'collaboration', 'custom']).default('custom'),
  contact: text(300).default(''), active: z.boolean().default(true),
}).strict();
const education = z.object({ title: text(180).min(1), details: text(1500), url: z.union([z.literal(''), externalUrl]),
  stage: text(120).default(''), period: text(80).default(''), links: z.array(link).max(100).default([]),
}).strict();
export const academicProfileSchema = z.object({
  avatar: z.string().max(380000).refine(bitmapAvatar, 'Upload a PNG, JPEG, or WebP image up to 256 KB'),
  name: text(160), englishName: text(160), title: text(180), institution: text(180), lab: text(180),
  bio: text(2000), contactEmail: z.union([z.literal(''), z.string().trim().email().max(320)]),
  orcid: z.union([z.literal(''), externalUrl]), scholar: z.union([z.literal(''), externalUrl]),
  works: z.array(work).max(100), interests: z.array(interest).max(100),
  materials: z.array(link).max(100), cv: z.union([z.literal(''), externalUrl]), labUrl: z.union([z.literal(''), externalUrl]),
  education: z.array(education).max(100),
  personalLinks: z.array(link).max(100).default([]), teamLinks: z.array(link).max(100).default([]),
}).strict();
type Profile = z.infer<typeof academicProfileSchema>;
const blank = (name = ''): Profile => ({ avatar: '', name, englishName: '', title: '', institution: '', lab: '', bio: '', contactEmail: '', orcid: '', scholar: '', works: [], interests: [], materials: [], cv: '', labUrl: '', education: [], personalLinks: [], teamLinks: [] });
function normalizeProfile(raw: unknown): Profile {
  const profile = academicProfileSchema.parse(raw);
  const old = raw as Record<string, unknown>;
  const oldEducation = Array.isArray(old.education) ? old.education as Array<Record<string, unknown>> : [];
  return {
    ...profile,
    labUrl: '',
    teamLinks: Object.prototype.hasOwnProperty.call(old, 'teamLinks') ? profile.teamLinks : profile.labUrl ? [{ label: '课题组主页', url: profile.labUrl }] : [],
    education: profile.education.map((item, index) => ({ ...item, url: '', links: Object.prototype.hasOwnProperty.call(oldEducation[index] ?? {}, 'links') ? item.links : item.url ? [{ label: item.title, url: item.url }] : [] })),
  };
}
function verifiedOrcidUrl(url: string, externalId: string): boolean {
  if (!/^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9X]{4}$/.test(externalId)) return false;
  return url === `https://orcid.org/${externalId}`;
}
async function orcidVerified(deps: AuthDeps, userId: string, url: string): Promise<boolean> {
  if (!url) return false;
  const credential = await deps.prisma.identityCredential.findFirst({ where: { userId, type: 'orcid', status: 'verified', revokedAt: null, source: 'orcid_oauth' }, select: { externalId: true } });
  return !!credential && verifiedOrcidUrl(url, credential.externalId);
}
async function ownerOrcid(deps: AuthDeps, userId: string, url: string) {
  const credential = await deps.prisma.identityCredential.findFirst({ where: { userId, type: 'orcid', status: 'verified', revokedAt: null, source: 'orcid_oauth' }, select: { externalId: true } });
  const connectedOrcid = credential?.externalId ?? null;
  return { connectedOrcid, orcidVerified: !!connectedOrcid && verifiedOrcidUrl(url, connectedOrcid) };
}
const writeSchema = z.object({ ownerId: z.string().uuid(), expectedVersion: z.number().int().min(0), profile: academicProfileSchema }).strict();
const transitionSchema = z.object({ ownerId: z.string().uuid(), expectedVersion: z.number().int().positive() }).strict();

export function registerAcademicProfileRoutes(app: FastifyInstance, deps: AuthDeps): void {
  app.addHook('onRequest', async (_req, reply) => { reply.header('Cache-Control', 'private, no-store'); });
  app.get('/academic-profile/me', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply); if (!user) return;
    const row = await deps.prisma.academicProfile.findUnique({ where: { userId: user.userId } });
    const profile = row ? normalizeProfile(row.draft) : blank(user.displayName);
    return { profile, version: row?.version ?? 0, published: !!row?.published, userId: user.userId, ...await ownerOrcid(deps, user.userId, profile.orcid) };
  });
  app.put('/academic-profile/me', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply); if (!user) return;
    const { ownerId, expectedVersion, profile } = writeSchema.parse(req.body);
    if (ownerId !== user.userId) return reply.code(409).send(buildErrorBody('PROFILE_OWNER_CHANGED', '账户已切换，请重新加载', String(req.id)));
    if (expectedVersion === 0) {
      try {
        const row = await deps.prisma.academicProfile.create({ data: { userId: user.userId, draft: profile as Prisma.InputJsonValue } });
        return { profile, version: row.version, published: false, userId: user.userId, ...await ownerOrcid(deps, user.userId, profile.orcid) };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return reply.code(409).send(buildErrorBody('PROFILE_VERSION_CONFLICT', '资料已在其他页面更新，请重新加载', String(req.id)));
        throw error;
      }
    }
    const previous = await deps.prisma.academicProfile.findUnique({ where: { userId: user.userId }, select: { published: true } });
    const result = await deps.prisma.academicProfile.updateMany({ where: { userId: user.userId, version: expectedVersion }, data: { draft: profile as Prisma.InputJsonValue, version: { increment: 1 } } });
    if (!result.count) return reply.code(409).send(buildErrorBody('PROFILE_VERSION_CONFLICT', '资料已在其他页面更新，请重新加载', String(req.id)));
    return { profile, version: expectedVersion + 1, published: !!previous?.published, userId: user.userId, ...await ownerOrcid(deps, user.userId, profile.orcid) };
  });
  app.post('/academic-profile/me/publish', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply); if (!user) return;
    const { ownerId, expectedVersion } = transitionSchema.parse(req.body);
    if (ownerId !== user.userId) return reply.code(409).send(buildErrorBody('PROFILE_OWNER_CHANGED', '账户已切换，请重新加载', String(req.id)));
    const row = await deps.prisma.academicProfile.findUnique({ where: { userId: user.userId } });
    if (!row || row.version !== expectedVersion) return reply.code(409).send(buildErrorBody('PROFILE_VERSION_CONFLICT', '资料已在其他页面更新，请重新加载', String(req.id)));
    const profile = normalizeProfile(row.draft);
    if (!profile.name) return reply.code(400).send(buildErrorBody('PROFILE_NAME_REQUIRED', '请先填写姓名并保存草稿', String(req.id)));
    const result = await deps.prisma.academicProfile.updateMany({ where: { userId: user.userId, version: expectedVersion }, data: { published: profile as Prisma.InputJsonValue, version: { increment: 1 } } });
    if (!result.count) return reply.code(409).send(buildErrorBody('PROFILE_VERSION_CONFLICT', '资料已在其他页面更新，请重新加载', String(req.id)));
    return { profile, version: expectedVersion + 1, published: true, userId: user.userId, ...await ownerOrcid(deps, user.userId, profile.orcid) };
  });
  app.post('/academic-profile/me/unpublish', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply); if (!user) return;
    const { ownerId, expectedVersion } = transitionSchema.parse(req.body);
    if (ownerId !== user.userId) return reply.code(409).send(buildErrorBody('PROFILE_OWNER_CHANGED', '账户已切换，请重新加载', String(req.id)));
    const result = await deps.prisma.academicProfile.updateMany({ where: { userId: user.userId, version: expectedVersion }, data: { published: Prisma.DbNull, version: { increment: 1 } } });
    if (!result.count) return reply.code(409).send(buildErrorBody('PROFILE_VERSION_CONFLICT', '资料已在其他页面更新，请重新加载', String(req.id)));
    return { published: false, version: expectedVersion + 1, userId: user.userId };
  });
  app.get('/academic-profile/:userId', async (req, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(req.params);
    const row = await deps.prisma.academicProfile.findUnique({ where: { userId }, select: { published: true } });
    if (!row?.published) return reply.code(404).send(buildErrorBody('PROFILE_NOT_PUBLISHED', '学术主页尚未公开', String(req.id)));
    const profile = normalizeProfile(row.published);
    // Only a version that has an actual publication and remains public is listed.
    const publications = await deps.prisma.publication.findMany({ where: { version: { researchObject: { authors: { some: { userId } }, visibility: 'public', deletedAt: null } } },
      select: { publicVersionId: true, publishedAt: true, versionId: true, version: { select: { researchObjectId: true, researchRecord: true, researchObject: { select: { publicId: true } } } } }, orderBy: { publishedAt: 'desc' } });
    const readable = await Promise.all(publications.map(item => canReadCurrentPublicResearch({ prisma: deps.prisma }, { researchObjectId: item.version.researchObjectId, versionId: item.versionId })));
    return { profile: { ...profile, interests: profile.interests.filter(item => item.active) }, orcidVerified: await orcidVerified(deps, userId, profile.orcid), publications: publications.flatMap((item, index) => {
      if (!readable[index]) return [];
      const title = readPublicationMetadata(item.version.researchRecord).title;
      return title && item.version.researchObject.publicId ? [{ title, publicId: item.version.researchObject.publicId, publicVersionId: item.publicVersionId, publishedAt: item.publishedAt }] : [];
    }) };
  });
}
