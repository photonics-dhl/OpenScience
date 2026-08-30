import { createHmac, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  buildTemporaryDocumentObjectKey,
  parseSourceRetrievePayload,
  temporaryDocumentExpiresAt,
  type AgentDeps,
} from '@openscience/domain';
import type { StorageAdapter } from '@openscience/storage';
import { executeSourceRetrieval, type RetrievalRuntime } from './orchestrator';
import type { NormalizedExternalSource } from './contracts';

interface RetrievalHandlerDeps extends Pick<AgentDeps, 'prisma' | 'audit'> {
  storage?: StorageAdapter;
  malwareScanner?: (bytes: Buffer) => Promise<void>;
}

function queryFingerprint(secret: string, query: string): string {
  if (Buffer.byteLength(secret, 'utf8') < 32) throw new Error('[blocked] retrieval query HMAC secret is invalid');
  return createHmac('sha256', secret).update(query.trim().toLocaleLowerCase('en-US')).digest('hex');
}

function institutionalSubjectFingerprint(secret: string, userId: string): string {
  return createHmac('sha256', secret).update(`scansci-subject:${userId}`).digest('hex');
}

function sourceData(source: NormalizedExternalSource) {
  return {
    title: source.title,
    sourceUrl: source.sourceUrl,
    abstract: source.abstract,
    authors: source.authors,
    year: source.year,
    venue: source.venue,
    citationCount: source.citationCount,
    doi: source.identifiers.doi,
    arxivId: source.identifiers.arxiv,
    openAccessUrl: source.openAccess?.url,
    openAccessStatus: source.openAccess?.status,
    openAccessLicense: source.openAccess?.license,
  };
}

export function createSourceRetrieveHandler(options: {
  queryHmacSecret: string;
  semanticScholar: RetrievalRuntime['semanticScholar'];
  tavily: RetrievalRuntime['tavily'];
  scansci: RetrievalRuntime['scansci'];
}) {
  return async (
    deps: RetrievalHandlerDeps,
    task: { id: string; payload: Record<string, unknown> },
  ): Promise<Record<string, unknown>> => {
    const payload = parseSourceRetrievePayload(task.payload);
    const ownerTask = await deps.prisma.agentTask.findUnique({
      where: { id: task.id },
      include: { session: { include: { researchObject: { include: { workspace: true } } } } },
    });
    const researchObject = ownerTask?.session.researchObject;
    if (!ownerTask || ownerTask.kind !== 'source.retrieve' || ownerTask.status !== 'running' || !researchObject) {
      throw new Error('[blocked] source retrieval task authority mismatch');
    }
    const membership = await deps.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId: researchObject.workspaceId, userId: ownerTask.session.userId } },
    });
    if (!membership || researchObject.workspace.status !== 'active') {
      throw new Error('[blocked] source retrieval workspace authority revoked');
    }
    const fingerprint = queryFingerprint(options.queryHmacSecret, payload.query);
    const now = new Date();
    const result = await executeSourceRetrieval(payload, {
      semanticScholar: options.semanticScholar,
      tavily: options.tavily,
      scansci: options.scansci,
      persist: async ({ source, rights, fullText }) => {
        const persisted = await deps.prisma.externalSource.upsert({
          where: {
            workspaceId_provider_providerRecordId: {
              workspaceId: researchObject.workspaceId,
              provider: source.provider,
              providerRecordId: source.providerRecordId,
            },
          },
          create: {
            workspaceId: researchObject.workspaceId,
            requestedBy: ownerTask.session.userId,
            provider: source.provider,
            providerRecordId: source.providerRecordId,
            ...sourceData(source),
            queryFingerprint: fingerprint,
            retrievedAt: now,
          },
          update: { ...sourceData(source), queryFingerprint: fingerprint, retrievedAt: now },
        });
        const institutional = source.access.kind === 'institutional_access';
        const rightsData = {
            agentTaskId: task.id,
            workspaceId: researchObject.workspaceId,
            externalSourceId: persisted.id,
            basis: rights.basis,
            cacheAllowed: rights.cacheAllowed,
            downloadPolicy: rights.downloadPolicy,
            reasonCode: rights.reasonCode,
            evidence: {
              kind: source.access.kind,
              ...(source.access.kind === 'open_access' && source.access.license ? { license: source.access.license } : {}),
              ...(fullText ? { acquisitionRoute: fullText.route } : {}),
            },
            contentHash: fullText?.contentHash,
            ...(institutional ? {
              subjectUserId: ownerTask.session.userId,
              validUntil: fullText?.entitlementValidUntil,
            } : {}),
            checkerVersion: rights.checkerVersion,
            decidedAt: now,
        };
        const rightsRow = await deps.prisma.sourceRightsDecision.upsert({
          where: {
            agentTaskId_externalSourceId: { agentTaskId: task.id, externalSourceId: persisted.id },
          },
          create: rightsData,
          update: rightsData,
        });
        let temporaryDocumentId: string | undefined;
        if (fullText) {
          if (!deps.storage || !rights.cacheAllowed) throw new Error('[blocked] temporary document storage is unavailable');
          if (!deps.malwareScanner) throw new Error('[blocked] temporary document malware scanner is unavailable');
          if (institutional && !fullText.entitlementValidUntil) throw new Error('[blocked] institutional entitlement expiry is unavailable');
          await deps.malwareScanner(fullText.bytes);
          const existing = await deps.prisma.temporaryDocument.findUnique({ where: { agentTaskId: task.id } });
          temporaryDocumentId = existing?.id ?? randomUUID();
          const objectKey = buildTemporaryDocumentObjectKey({
            workspaceId: researchObject.workspaceId,
            documentId: temporaryDocumentId,
            contentHash: fullText.contentHash,
          });
          if (existing && (existing.workspaceId !== researchObject.workspaceId
            || existing.externalSourceId !== persisted.id
            || existing.rightsDecisionId !== rightsRow.id
            || existing.objectKey !== objectKey
            || existing.contentHash !== fullText.contentHash
            || existing.sizeBytes !== BigInt(fullText.bytes.byteLength))) {
            throw new Error('[blocked] source retrieval replay metadata mismatch');
          }
          if (!existing) {
            await deps.prisma.temporaryDocument.create({
              data: {
              id: temporaryDocumentId,
              agentTaskId: task.id,
              workspaceId: researchObject.workspaceId,
              externalSourceId: persisted.id,
              rightsDecisionId: rightsRow.id,
              requestedBy: ownerTask.session.userId,
              objectKey,
              contentHash: fullText.contentHash,
              mimeType: fullText.mimeType,
              sizeBytes: BigInt(fullText.bytes.byteLength),
              state: 'staging',
              expiresAt: temporaryDocumentExpiresAt(now),
              createdAt: now,
              updatedAt: now,
              parserProvenance: Prisma.JsonNull,
              locator: Prisma.JsonNull,
              },
            });
          } else if (!['active', 'staging', 'cleanup_failed'].includes(existing.state)) {
            throw new Error('[blocked] source retrieval replay targets an expired document');
          }
          if (existing?.state !== 'active') {
            const head = await deps.storage.headObject(objectKey);
            if (!head || head.size !== fullText.bytes.byteLength || head.sha256 !== fullText.contentHash) {
              if (existing?.state === 'cleanup_failed') {
                const reset = await deps.prisma.temporaryDocument.updateMany({
                  where: { id: temporaryDocumentId, state: 'cleanup_failed' },
                  data: { state: 'staging', lastErrorCode: null, cleanupRetryAt: null },
                });
                if (reset.count !== 1) throw new Error('[retryable] temporary document replay claim lost');
              }
              try {
                await deps.storage.putObject(objectKey, fullText.bytes, { contentType: fullText.mimeType, sha256: fullText.contentHash });
              } catch (error) {
                await deps.prisma.temporaryDocument.updateMany({
                  where: { id: temporaryDocumentId, state: 'staging' },
                  data: {
                    state: 'cleanup_failed',
                    lastErrorCode: 'object_upload_failed',
                    cleanupRetryAt: new Date(now.getTime() + 60_000),
                  },
                }).catch(() => undefined);
                throw error;
              }
            }
            const activated = await deps.prisma.temporaryDocument.updateMany({
              where: { id: temporaryDocumentId, state: 'staging' },
              data: { state: 'active', lastErrorCode: null, cleanupRetryAt: null },
            });
            if (activated.count !== 1) throw new Error('[retryable] temporary document activation lost');
          }
        }
        return {
          id: persisted.id,
          provider: persisted.provider,
          title: persisted.title,
          sourceUrl: persisted.sourceUrl,
          rights,
          ...(temporaryDocumentId ? { temporaryDocumentId } : {}),
        };
      },
    }, { institutionalSubjectId: institutionalSubjectFingerprint(options.queryHmacSecret, ownerTask.session.userId) });
    await deps.audit?.record({
      actorId: ownerTask.session.userId,
      action: 'external_retrieval.complete',
      workspaceId: researchObject.workspaceId,
      targetType: 'agent_task',
      targetId: task.id,
      metadata: {
        sources: result.sources.length,
        providers: result.providers.map(({ provider, status, code }) => ({ provider, status, ...(code ? { code } : {}) })),
      },
    });
    return result as unknown as Record<string, unknown>;
  };
}
