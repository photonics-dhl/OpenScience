/** One-time, user-authorized correction of the first real publication (2026-09-14).
 * Run only in the existing API container: node <this-file> --confirm
 * No scientific regeneration, new publication, new hash, or physical deletion.
 * The transaction's audit entry retains every changed value for compensation.
 */
import { PrismaClient } from '@prisma/client';

if (process.argv.length !== 3 || process.argv[2] !== '--confirm') {
  throw new Error('Usage: node correct-deep-sub-cycle-publication.mjs --confirm');
}
const prisma = new PrismaClient();
const roId = 'c896802c-35dd-4b59-8db1-5f374f83a6d8';
const versionId = 'f4e2dc71-1fe8-406f-8c19-e1849503d698';
const userId = '10baa655-772e-4aca-9a5d-00ca0547084f';
const publicId = 'OSR-2026-000022';
const artifactId = '7bb96cc1-bb6f-4d3b-b0bf-352f41971faf';
const action = 'publication.correct_legacy_identity';

try {
  const receipt = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728413920)`;
    await tx.$queryRaw`SELECT id FROM research_objects WHERE id = ${roId}::uuid FOR UPDATE`;
    const ro = await tx.researchObject.findUniqueOrThrow({ where: { id: roId }, include: {
      authors: true, workspace: { select: { status: true } },
      versions: { where: { publications: { some: {} } }, include: { publications: true } },
    } });
    const priorAudit = await tx.auditLog.findFirst({ where: { action, targetId: versionId } });
    const version = ro.versions.find(item => item.id === versionId);
    if (priorAudit) {
      if (version?.publicationNo !== 1 || version.publicVersionId !== `${publicId}-v1`
        || version.publications.length !== 1 || version.publications[0].publicVersionId !== `${publicId}-v1`
        || !ro.authors.some(author => author.userId === userId && !author.isCorresponding)
        || version.researchRecord?.publicationCorrection?.correctedPublicVersionId !== `${publicId}-v1`
        || version.researchRecord?.publicationMetadata?.authors?.[0]?.displayName !== 'DHL'
        || version.researchRecord?.publicationMetadata?.citation?.publicationNo !== 1
        || !version.researchRecord?.dto?.manifest?.some(entry => entry.artifactId === artifactId
          && entry.downloadAccess === 'public' && entry.downloadUrl === `/api/research/${publicId}/v/1/artifacts/${artifactId}/download`)) {
        throw new Error('Previously corrected identity has changed; inspect audit before proceeding');
      }
      return { state: 'already_corrected', auditId: priorAudit.id, publicId, publicationNo: 1 };
    }
    if (ro.deletedAt || ro.visibility !== 'public' || ro.publicId !== publicId || ro.createdBy !== userId
      || ro.workspace.status !== 'active' || ro.versions.length !== 1 || version?.id !== versionId
      || version.status !== 'published' || version.versionNo !== 10 || version.publicationNo !== 10
      || version.publicVersionId !== `${publicId}-v10` || version.publications.length !== 1
      || version.publications[0].publicVersionId !== `${publicId}-v10` || ro.authors.length !== 0) {
      throw new Error('Correction target no longer matches the authorized legacy first publication');
    }
    const member = await tx.membership.findUnique({ where: { workspaceId_userId: { workspaceId: ro.workspaceId, userId } } });
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { displayName: true, status: true } });
    if (member?.role !== 'owner' || user.displayName !== 'DHL') throw new Error('Confirmed author identity no longer matches');
    const record = version.researchRecord;
    const metadata = record?.publicationMetadata;
    if (metadata?.captureSource !== 'legacy_captured_at_migration' || metadata.authors?.length !== 0
      || record.publicationCorrection || record.dto?.objectId !== roId || record.dto?.versionId !== versionId) {
      throw new Error('Legacy publication record no longer matches');
    }
    const occupied = await tx.version.findFirst({ where: { researchObjectId: roId, publicationNo: 1 }, select: { id: true } });
    if (occupied) throw new Error('Canonical first-publication number is already occupied');
    const publication = version.publications[0];
    const correctedAt = new Date().toISOString();
    const entry = record.dto.manifest?.[0];
    const artifact = await tx.artifact.findUniqueOrThrow({ where: { id: artifactId }, select: {
      workspaceId: true, blobSha256: true, mimeType: true, deletedAt: true, bytesPurgedAt: true,
    } });
    if (record.dto.manifest.length !== 1 || entry.artifactId !== artifactId
      || entry.blobSha256 !== artifact.blobSha256 || artifact.workspaceId !== ro.workspaceId
      || artifact.mimeType !== 'application/pdf' || artifact.deletedAt || artifact.bytesPurgedAt
      || metadata.licenses.data !== 'CC0-1.0' || metadata.licenses.text !== 'CC-BY-4.0' || metadata.licenses.code !== 'MIT') {
      throw new Error('Previously authorized original PDF or its license has changed');
    }
    const author = { displayName: user.displayName, identityStatus: user.status, isCorresponding: false, affiliation: null, sortOrder: 0 };
    const citation = { ...metadata.citation, publicId, publicVersionId: `${publicId}-v1`, publicationNo: 1,
      publishedAt: publication.publishedAt.toISOString(),
      text: `${user.displayName}. ${metadata.title}. ${publicId}-v1. ${metadata.citation.year}.` };
    const correction = { previousPublicationNo: 10, previousPublicVersionId: `${publicId}-v10`,
      correctedPublicationNo: 1, correctedPublicVersionId: `${publicId}-v1`, correctedAt,
      attachmentAccessGrantedAt: correctedAt, attachmentId: artifactId,
      reason: 'User confirmed this was the first public release; correct the internal-revision label and add the confirmed nickname attribution.' };
    const correctedMetadata = { ...metadata, authors: [author], citation, captureSource: 'administrative_correction', capturedAt: correctedAt,
      fieldSources: { ...metadata.fieldSources, authors: 'user_confirmed_administrative_correction',
        citation: `corrected_first_publication_identity_from_${publicId}-v10_to_${publicId}-v1`,
        attachmentAccess: `user_authorized_public_download_granted_at_${correctedAt}` } };
    // Apply the user's download permission to the one already published original PDF.
    // This is a new access grant, not a claim that it existed at the original publication time.
    const manifest = [{ ...entry, mimeType: artifact.mimeType, downloadAccess: 'public',
      downloadUrl: `/api/research/${publicId}/v/1/artifacts/${artifactId}/download` }];
    const correctedRecord = { ...record, publicationMetadata: correctedMetadata, publicationCorrection: correction,
      dto: { ...record.dto, identity: { ...record.dto.identity,
        platformAuthors: [{ name: user.displayName, affiliation: null, isCorresponding: false }] }, manifest } };
    const authorRow = await tx.author.create({ data: { researchObjectId: roId, userId, sortOrder: 0, isCorresponding: false } });
    await tx.version.update({ where: { id: versionId }, data: { publicationNo: 1, publicVersionId: `${publicId}-v1`, researchRecord: correctedRecord } });
    await tx.publication.update({ where: { id: publication.id }, data: { publicVersionId: `${publicId}-v1` } });
    const selections = await tx.editorialSelection.findMany({ where: { versionId }, select: { id: true, versionNoSnapshot: true } });
    await tx.editorialSelection.updateMany({ where: { versionId }, data: { versionNoSnapshot: 1 } });
    const audit = await tx.auditLog.create({ data: { action, actorId: userId, workspaceId: ro.workspaceId,
      targetType: 'version', targetId: versionId, metadata: {
        reason: correction.reason, researchObjectId: roId, createdAuthorId: authorRow.id,
        attachmentAccessGrantedAt: correctedAt, attachmentId: artifactId,
        before: { publicationNo: version.publicationNo, publicVersionId: version.publicVersionId,
          publication: { ...publication, publishedAt: publication.publishedAt.toISOString() }, publicationMetadata: metadata, dtoIdentity: record.dto.identity, manifest: record.dto.manifest, selections },
        after: { publicationNo: 1, publicVersionId: `${publicId}-v1`, publicationMetadata: correctedMetadata },
        preserved: { internalVersionNo: version.versionNo, contentSha256: publication.contentSha256, publishedAt: publication.publishedAt.toISOString() },
      },
    } });
    return { state: 'corrected', auditId: audit.id, publicId, publicationNo: 1, author: user.displayName,
      publishedAt: publication.publishedAt.toISOString(), contentSha256: publication.contentSha256, selectionCount: selections.length };
  }, { isolationLevel: 'Serializable', timeout: 15000 });
  console.log(JSON.stringify(receipt));
} finally {
  await prisma.$disconnect();
}
