// Server-only, reversible cleanup of the identified legacy showcase and test drafts.
// Does not delete documents, files, publications, accounts, or persistent identifiers.
import { PrismaClient } from '@prisma/client';
import { updateResearchObject } from '../packages/domain/dist/index.js';

if (!process.argv.includes('--confirm')) throw new Error('Explicit --confirm is required');
const prisma = new PrismaClient();
const personalWorkspace = '28d7f25f-aba8-4ffb-adcb-46b4739f2f75';
const catalogWorkspace = 'ebb1c539-e8b0-4372-8cd7-83ecbbf1cc69';
const personalTargets = ['bca18f96-ad0d-4255-aecd-f59c37251aaa', '777e4661-ad25-4b03-af03-cfa672d40284', '0faee789-74ae-4571-a3e8-54f7e76f863d', '84b11cf2-bd4f-4fad-9ace-176f8ddba479', '3425e6e0-37ff-4199-828f-3d827b4b4a43', '87f76e4f-ea39-4d5f-a7c0-2c0a44e0340a', '1247845b-481b-474d-9bea-505121ddf50d', 'dec224ca-de3d-41fb-8712-87e4fc1dd37b', '976dff71-96a1-4383-9467-50a8780a2553', '9129aa9b-8899-40ad-87c3-c5d18ce3f9c0', '5495d0c1-1c31-4e15-8c89-2b7c5a44e14a', 'dfd6516a-ab94-4262-bd1d-b979bdbbc537', '14aea323-2e83-45ba-96df-52c07534b035', 'd4939d80-baab-4bbf-8529-782f2af1297c', '7e9dd410-ed46-4cd4-af86-6b5fae950247', 'ad35cac3-cbd9-4a2a-9a00-9762fcc15e91'];
const catalogIds = Array.from({ length: 18 }, (_, index) => `OSR-DEMO-${String(index + 1).padStart(6, '0')}`);
const protectedPapers = new Set(['9067a2d5-42ad-4c06-b234-753728b71064', '66f80325-3072-4c27-aa07-47019b9a56a6', 'c896802c-35dd-4b59-8db1-5f374f83a6d8']);
// Exact known acceptance records, not a title-prefix sweep of user research.
const retiredAcceptanceRecords = [
  { publicId: 'OSR-2026-000019', title: 'Task 11 public presentation acceptance 8f7b80ae7007' },
  { publicId: 'OSR-2026-000020', title: 'E2E — Attosecond on-chip optical field sampling' },
  { publicId: 'OSR-2026-000021', title: 'E2E acceptance — Attention Is All You Need' },
];
try {
  const candidates = await prisma.researchObject.findMany({
    where: { status: { not: 'archived' }, OR: [
      ...retiredAcceptanceRecords,
      { workspaceId: catalogWorkspace, publicId: { in: catalogIds }, idempotencyKey: { startsWith: 'demo-source:' } },
      { id: { in: personalTargets }, workspaceId: personalWorkspace, visibility: 'private', publicId: null, OR: [
        { title: { startsWith: 'Production ingestion smoke' } },
        { title: { startsWith: 'Production acceptance ' } },
        { title: { startsWith: 'E2E — Hermes blank guidance — ' } },
      ] },
    ] },
    include: { _count: { select: { forkSources: true, forkResults: true, hermesResearchRuns: true } }, workspace: { select: { ownerId: true } } },
    orderBy: { id: 'asc' },
  });
  for (const ro of candidates) {
    if (protectedPapers.has(ro.id) || ro._count.forkSources || ro._count.forkResults || ro._count.hermesResearchRuns) {
      console.log(JSON.stringify({ id: ro.id, state: 'preserved_related_research' })); continue;
    }
    const active = await prisma.agentTask.count({ where: { session: { researchObjectId: ro.id }, status: { in: ['pending', 'running'] } } });
    if (active) { console.log(JSON.stringify({ id: ro.id, state: 'preserved_active_task' })); continue; }
    // The ordinary domain operation retains ownership checks, optimistic locking and audit.
    const previous = ro.status;
    const result = await updateResearchObject({ prisma, audit: { record: async (event, tx) => {
      await tx.auditLog.create({ data: { ...event, actorId: null, metadata: { ...event.metadata, operator: 'authorized-server-maintenance', accessPrincipal: ro.workspace.ownerId, reason: 'quality-first-showcase-cleanup-2026-09-09', previousStatus: previous } } });
    } } }, { userId: ro.workspace.ownerId, roId: ro.id, version: ro.version, patch: { status: 'archived' } });
    console.log(JSON.stringify({ id: ro.id, publicId: ro.publicId, previousStatus: previous, status: result.status, version: result.version }));
  }
} finally { await prisma.$disconnect(); }
