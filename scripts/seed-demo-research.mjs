#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { DEMO_RESEARCH_CORPUS } from './demo-research-corpus.mjs';

const CATALOG_EMAIL = 'catalog@demo.openscience.invalid';
const CATALOG_NAME = 'OpenScience Demonstration Catalog';
const SDF_FIELDS = ['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'];

function fallbackSdf(entry) {
  return {
    problem: `Source scope: ${entry.summary}`,
    insight: `This index record connects discoverable scientific context with explicit provenance and license evidence.`,
    method: `OpenScience catalogued public repository metadata without copying or interpreting the upstream scientific results.`,
    results: `The source is available for public discovery through the Research Index and remains linked to its upstream repository.`,
    limitations: `This is a lightweight metadata record, not a reproduced experiment or an endorsement of the upstream conclusions.`,
    reproducibility: `Use the upstream documentation and verify the recorded license evidence before reusing source materials.`,
  };
}

export function buildSeedPlan() {
  return DEMO_RESEARCH_CORPUS.map((entry, index) => ({
    ...entry,
    publicId: `OSR-DEMO-${String(index + 1).padStart(6, '0')}`,
    publicVersionId: `OSR-DEMO-${String(index + 1).padStart(6, '0')}-v1`,
    idempotencyKey: `demo-source:${entry.slug}`,
    sdf: entry.sdf ?? fallbackSdf(entry),
    provenanceArtifact: entry.tier === 'complete' ? `provenance/${entry.slug}.md` : null,
  }));
}

export function renderProvenanceArtifact(record) {
  return `# ${record.title}\n\n` +
    `> OpenScience demonstration metadata. This Research Object is not an upstream-author submission and does not claim to reproduce its scientific conclusions.\n\n` +
    `- Source: ${record.sourceUrl}\n` +
    `- Upstream attribution: ${record.author}\n` +
    `- Upstream license identifier: ${record.licenseId}\n` +
    `- License evidence: ${record.licenseUrl}\n` +
    `- Verified license blob SHA: ${record.licenseBlobSha}\n` +
    `- Verified at: ${record.verifiedAt}\n\n` +
    `The upstream license evidence applies to the upstream project materials described by that project. ` +
    `OpenScience-authored catalog metadata is published as CC-BY-4.0.\n`;
}

async function seedConfirmed(plan) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required with --confirm');
  const [{ PrismaClient }, storageModule] = await Promise.all([
    import('@prisma/client'), import('@openscience/storage'),
  ]);
  const prisma = new PrismaClient();
  const storage = storageModule.createStorageAdapter(storageModule.storageConfigFromEnv());
  try {
    const catalogUser = await prisma.user.upsert({
      where: { email: CATALOG_EMAIL },
      create: {
        email: CATALOG_EMAIL, displayName: CATALOG_NAME, passwordHash: '!demo-account-disabled!',
        status: 'email_verified', platformRole: 'user',
      },
      update: { displayName: CATALOG_NAME },
    });
    let workspace = await prisma.workspace.findFirst({ where: { ownerId: catalogUser.id, name: CATALOG_NAME } });
    workspace ??= await prisma.workspace.create({
      data: { type: 'team', name: CATALOG_NAME, ownerId: catalogUser.id },
    });
    await prisma.membership.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: catalogUser.id } },
      create: { workspaceId: workspace.id, userId: catalogUser.id, role: 'owner' }, update: { role: 'owner' },
    });

    let created = 0;
    let existing = 0;
    for (const record of plan) {
      const replay = await prisma.researchObject.findUnique({ where: { idempotencyKey: record.idempotencyKey } });
      if (replay) {
        console.log(`EXISTS ${record.publicId} ${record.slug}`);
        existing += 1;
        continue;
      }

      let artifact = null;
      if (record.provenanceArtifact) {
        const body = Buffer.from(renderProvenanceArtifact(record), 'utf8');
        const blob = await storageModule.putBlob(storage, body);
        await prisma.blob.upsert({
          where: { sha256: blob.sha256 },
          create: { sha256: blob.sha256, storageKey: storageModule.getBlobStorageKey(blob.sha256), size: BigInt(blob.size) },
          update: {},
        });
        artifact = await prisma.artifact.upsert({
          where: { idempotencyKey: `${record.idempotencyKey}:provenance` },
          create: {
            logicalPath: record.provenanceArtifact, mimeType: 'text/markdown', size: BigInt(blob.size),
            blobSha256: blob.sha256, uploadedBy: catalogUser.id, workspaceId: workspace.id,
            idempotencyKey: `${record.idempotencyKey}:provenance`,
          }, update: {},
        });
      }

      const coreJson = { schemaVersion: '0.1.0', ...record.sdf };
      await prisma.$transaction(async (tx) => {
        const ro = await tx.researchObject.create({
          data: {
            workspaceId: workspace.id, title: record.title, status: 'published', visibility: 'public',
            publicId: record.publicId, createdBy: catalogUser.id, idempotencyKey: record.idempotencyKey,
          },
        });
        await tx.sdfDocument.create({
          data: {
            researchObjectId: ro.id, coreJson,
            nodes: { create: SDF_FIELDS.map((nodeType, sortOrder) => ({ nodeType, sortOrder, content: record.sdf[nodeType] })) },
          },
        });
        const branch = await tx.branch.create({ data: { researchObjectId: ro.id, name: 'main', isDefault: true } });
        const commit = await tx.commit.create({
          data: { researchObjectId: ro.id, branchId: branch.id, message: 'Seed verified public demonstration metadata', authorId: catalogUser.id, idempotencyKey: `${record.idempotencyKey}:commit` },
        });
        await tx.branch.update({ where: { id: branch.id }, data: { headCommitId: commit.id } });
        const version = await tx.version.create({
          data: { researchObjectId: ro.id, commitId: commit.id, versionNo: 1, publicVersionId: record.publicVersionId, status: 'published' },
        });
        await tx.versionManifest.create({
          data: {
            versionId: version.id, coreJson,
            entries: artifact ? { create: [{ logicalPath: artifact.logicalPath, artifactId: artifact.id, blobSha256: artifact.blobSha256 }] } : undefined,
          },
        });
        await tx.identifier.create({ data: { researchObjectId: ro.id, publicId: record.publicId, issuedAt: new Date() } });
        await tx.author.create({ data: { researchObjectId: ro.id, userId: catalogUser.id, sortOrder: 0, isCorresponding: false, affiliation: 'OpenScience demonstration catalog; upstream attribution is recorded in SDF provenance' } });
        await tx.licenseAssignment.create({ data: { researchObjectId: ro.id, versionId: version.id, licenseType: 'text', licenseId: 'CC-BY-4.0' } });
        const contentSha256 = createHash('sha256').update(JSON.stringify(coreJson)).update(artifact?.blobSha256 ?? '').digest('hex');
        await tx.publication.create({ data: { versionId: version.id, publicVersionId: record.publicVersionId, contentSha256, publishedAt: new Date(), legalDisclaimer: 'Demonstration metadata; see provenance and upstream source.' } });
      });
      console.log(`CREATED ${record.publicId} ${record.slug}`);
      created += 1;
    }
    console.log(`SEEDED created=${created} existing=${existing} total=${plan.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const plan = buildSeedPlan();
  if (!process.argv.includes('--confirm')) {
    console.log(`DRY_RUN ${plan.length} research records (${plan.filter((entry) => entry.provenanceArtifact).length} with stored provenance artifacts)`);
    for (const record of plan) console.log(`WOULD_SEED ${record.publicId} ${record.slug}`);
    console.log('Run with --confirm to write database and object storage.');
    return;
  }
  await seedConfirmed(plan);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
