import type { AuditContext } from '@openscience/observability';
import type { EditorialSelection } from '@prisma/client';
import type { WorkspaceDeps } from '../workspace/types';
import { recordAudit } from '../workspace/audit';
import { EditorialError } from './errors';

export const EDITORIAL_DISCLOSURE = 'Selected by Ultrafast Science. Editorial selection, not peer-review acceptance.';
export const EDITORIAL_STATES = ['draft', 'internal_review', 'scheduled', 'published'] as const;
export type EditorialState = (typeof EDITORIAL_STATES)[number];

export interface EditorialMedia {
  type: 'image' | 'video';
  url: string;
  alt: string;
  credit: string;
  licenseId: string;
  sourceUrl: string;
}

export interface EditorialSnapshotInput {
  researchObjectId: string;
  versionId: string;
  title: string;
  publicId: string;
  versionNo: number;
  sdf: Record<string, unknown>;
}

export interface EditorialSelectionView extends EditorialSnapshotInput {
  id: string;
  collectionId: string;
  selectedBy: string;
  note: string;
  media: EditorialMedia[];
  sortOrder: number;
  state: EditorialState;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  disclosure: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EditorialCollectionView {
  id: string;
  slug: string;
  title: string;
  description: string;
  selections: EditorialSelectionView[];
}

export function assertEditorialRole(role: string | null | undefined): void {
  if (role !== 'platform_admin') {
    throw new EditorialError('FORBIDDEN', 'Editorial curation is limited to a platform administrator.');
  }
}

const NEXT_STATES: Record<EditorialState, readonly EditorialState[]> = {
  draft: ['internal_review'],
  internal_review: ['draft', 'scheduled'],
  scheduled: ['internal_review', 'published'],
  published: [],
};

export function assertEditorialTransition(from: EditorialState, to: EditorialState): void {
  if (!NEXT_STATES[from].includes(to)) {
    throw new EditorialError('ILLEGAL_TRANSITION', `Illegal editorial transition: ${from} → ${to}`);
  }
}

function secureUrl(value: string, label: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new EditorialError('INVALID_MEDIA', `${label} must be an absolute HTTPS URL.`); }
  if (url.protocol !== 'https:') throw new EditorialError('INVALID_MEDIA', `${label} must be an absolute HTTPS URL.`);
  return url.toString();
}

export function validateEditorialMedia(input: EditorialMedia[]): EditorialMedia[] {
  if (input.length > 8) throw new EditorialError('INVALID_MEDIA', 'A selection supports at most eight media items.');
  return input.map((item) => {
    if (item.type !== 'image' && item.type !== 'video') throw new EditorialError('INVALID_MEDIA', 'Media type must be image or video.');
    const alt = item.alt?.trim();
    const credit = item.credit?.trim();
    const licenseId = item.licenseId?.trim();
    const sourceUrl = item.sourceUrl?.trim();
    if (!alt || !credit || !licenseId || !sourceUrl) {
      throw new EditorialError('INVALID_MEDIA', 'Media provenance requires alt text, credit, license and source URL.');
    }
    return {
      type: item.type,
      url: secureUrl(item.url, 'Media URL'),
      alt: alt.slice(0, 300),
      credit: credit.slice(0, 200),
      licenseId: licenseId.slice(0, 80),
      sourceUrl: secureUrl(sourceUrl, 'Media provenance source URL'),
    };
  });
}

export function buildEditorialSnapshot(input: EditorialSnapshotInput): EditorialSnapshotInput & { disclosure: string } {
  return { ...input, sdf: structuredClone(input.sdf), disclosure: EDITORIAL_DISCLOSURE };
}

function toView(row: EditorialSelection): EditorialSelectionView {
  return {
    id: row.id,
    collectionId: row.collectionId,
    researchObjectId: row.researchObjectId,
    versionId: row.versionId,
    selectedBy: row.selectedBy,
    title: row.titleSnapshot,
    publicId: row.publicIdSnapshot,
    versionNo: row.versionNoSnapshot,
    sdf: row.sdfSnapshot as Record<string, unknown>,
    note: row.note,
    media: row.media as unknown as EditorialMedia[],
    sortOrder: row.sortOrder,
    state: row.state as EditorialState,
    scheduledAt: row.scheduledAt,
    publishedAt: row.publishedAt,
    disclosure: row.disclosure,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function requireAdmin(deps: WorkspaceDeps, userId: string): Promise<void> {
  const user = await deps.prisma.user.findUnique({ where: { id: userId }, select: { platformRole: true } });
  assertEditorialRole(user?.platformRole);
}

export async function createEditorialSelection(
  deps: WorkspaceDeps,
  input: { userId: string; collectionSlug: string; versionId: string; note?: string; media?: EditorialMedia[]; sortOrder?: number },
  ctx: AuditContext = {},
): Promise<EditorialSelectionView> {
  await requireAdmin(deps, input.userId);
  const collection = await deps.prisma.editorialCollection.findUnique({ where: { slug: input.collectionSlug } });
  if (!collection) throw new EditorialError('NOT_FOUND', 'Editorial collection not found.');
  const version = await deps.prisma.version.findUnique({
    where: { id: input.versionId },
    include: { researchObject: true, manifest: true, publications: true },
  });
  if (!version) throw new EditorialError('NOT_FOUND', 'Version not found.');
  if (version.status !== 'published' || version.researchObject.visibility !== 'public' || !version.researchObject.publicId || !version.manifest) {
    throw new EditorialError('VERSION_NOT_PUBLIC', 'Only a published public Research Object version can be selected.');
  }
  const snapshot = buildEditorialSnapshot({
    researchObjectId: version.researchObjectId,
    versionId: version.id,
    title: version.researchObject.title,
    publicId: version.researchObject.publicId,
    versionNo: version.versionNo,
    sdf: version.manifest.coreJson as Record<string, unknown>,
  });
  try {
    const row = await deps.prisma.editorialSelection.create({
      data: {
        collectionId: collection.id,
        researchObjectId: snapshot.researchObjectId,
        versionId: snapshot.versionId,
        selectedBy: input.userId,
        titleSnapshot: snapshot.title,
        publicIdSnapshot: snapshot.publicId,
        versionNoSnapshot: snapshot.versionNo,
        sdfSnapshot: snapshot.sdf as never,
        note: input.note?.trim().slice(0, 4000) ?? '',
        media: validateEditorialMedia(input.media ?? []) as never,
        sortOrder: input.sortOrder ?? 0,
        disclosure: snapshot.disclosure,
      },
    });
    await recordAudit(deps, deps.prisma, {
      actorId: input.userId, action: 'editorial.selection.create', targetType: 'editorial_selection', targetId: row.id,
      metadata: { collectionSlug: input.collectionSlug, researchObjectId: snapshot.researchObjectId, versionId: snapshot.versionId },
    }, ctx);
    return toView(row);
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') throw new EditorialError('DUPLICATE_SELECTION', 'This version is already selected.');
    throw error;
  }
}

export async function updateEditorialSelection(
  deps: WorkspaceDeps,
  input: { userId: string; selectionId: string; note?: string; media?: EditorialMedia[]; sortOrder?: number },
  ctx: AuditContext = {},
): Promise<EditorialSelectionView> {
  await requireAdmin(deps, input.userId);
  const existing = await deps.prisma.editorialSelection.findUnique({ where: { id: input.selectionId } });
  if (!existing) throw new EditorialError('NOT_FOUND', 'Editorial selection not found.');
  if (existing.state === 'published') throw new EditorialError('IMMUTABLE_SELECTION', 'A published editorial selection is immutable.');
  const row = await deps.prisma.editorialSelection.update({
    where: { id: existing.id },
    data: {
      ...(input.note === undefined ? {} : { note: input.note.trim().slice(0, 4000) }),
      ...(input.media === undefined ? {} : { media: validateEditorialMedia(input.media) as never }),
      ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
    },
  });
  await recordAudit(deps, deps.prisma, {
    actorId: input.userId, action: 'editorial.selection.update', targetType: 'editorial_selection', targetId: row.id,
    metadata: { changed: Object.keys(input).filter((key) => !['userId', 'selectionId'].includes(key)) },
  }, ctx);
  return toView(row);
}

export async function transitionEditorialSelection(
  deps: WorkspaceDeps,
  input: { userId: string; selectionId: string; state: EditorialState; scheduledAt?: Date },
  ctx: AuditContext = {},
): Promise<EditorialSelectionView> {
  await requireAdmin(deps, input.userId);
  const existing = await deps.prisma.editorialSelection.findUnique({ where: { id: input.selectionId } });
  if (!existing) throw new EditorialError('NOT_FOUND', 'Editorial selection not found.');
  assertEditorialTransition(existing.state as EditorialState, input.state);
  if (input.state === 'scheduled' && !input.scheduledAt) throw new EditorialError('ILLEGAL_TRANSITION', 'A scheduled selection requires scheduledAt.');
  const now = deps.now?.() ?? new Date();
  if (input.state === 'published' && (!existing.scheduledAt || existing.scheduledAt > now)) {
    throw new EditorialError('ILLEGAL_TRANSITION', 'A selection cannot publish before its schedule.');
  }
  const row = await deps.prisma.editorialSelection.update({
    where: { id: existing.id },
    data: {
      state: input.state,
      ...(input.state === 'scheduled' ? { scheduledAt: input.scheduledAt } : {}),
      ...(input.state === 'published' ? { publishedAt: now } : {}),
    },
  });
  await recordAudit(deps, deps.prisma, {
    actorId: input.userId, action: 'editorial.selection.transition', targetType: 'editorial_selection', targetId: row.id,
    metadata: { from: existing.state, to: input.state },
  }, ctx);
  return toView(row);
}

export async function listEditorialSelections(
  deps: WorkspaceDeps,
  input: { userId: string; collectionSlug: string },
): Promise<EditorialCollectionView> {
  await requireAdmin(deps, input.userId);
  return getCollection(deps, input.collectionSlug, false);
}

export async function getPublicEditorialCollection(deps: WorkspaceDeps, slug: string): Promise<EditorialCollectionView> {
  return getCollection(deps, slug, true);
}

async function getCollection(deps: WorkspaceDeps, slug: string, publicOnly: boolean): Promise<EditorialCollectionView> {
  const collection = await deps.prisma.editorialCollection.findUnique({ where: { slug } });
  if (!collection) throw new EditorialError('NOT_FOUND', 'Editorial collection not found.');
  const rows = await deps.prisma.editorialSelection.findMany({
    where: {
      collectionId: collection.id,
      ...(publicOnly ? { state: 'published', researchObject: { visibility: 'public' }, version: { status: 'published' } } : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return { id: collection.id, slug: collection.slug, title: collection.title, description: collection.description, selections: rows.map(toView) };
}
