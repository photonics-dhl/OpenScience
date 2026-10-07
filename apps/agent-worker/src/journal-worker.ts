import type { AiGateway } from '@openscience/ai-gateway';
import { NATIVE_IMAGE_REQUEST_MAX_BYTES } from '@openscience/ai-gateway';
import { createHash } from 'node:crypto';
import { getBlob } from '@openscience/storage';
import type { ParserCascadeRunner, WorkerDeps } from './index';
import { sourceMapToManuscriptText } from './extractor';
import { canonicalParserMediaType } from './parser-media-type';
import { claimJournalJob, finishJournalJob, journalJobInput, nativeAgentRuntimeFromEnv, recoverJournalJobs, renewJournalJobLease,
  persistDocumentSourceMapReference, type DocumentSourceMapReference,
  type JournalNativeRuntime, type JournalRights, type JournalSource, type WorkspaceDeps } from '@openscience/domain';
import { runNativeJournalTask } from './native-agent/journal-task';

/** PDF OCR may call an external model only under the editor's current explicit source permission. */
export function journalParserExternalEligible(rights: JournalRights): boolean {
  return rights.internalProcessing === true && rights.externalProcessing === true
    && typeof rights.license === 'string' && !!rights.license.trim()
    && typeof rights.evidence === 'string' && !!rights.evidence.trim();
}

/** The installed Agent owns generation; the journal job owns permissions, leases and private delivery. */
export async function processOneJournalJob(deps: WorkspaceDeps, generate: (input: { jobId: string; leaseToken: string;
  source: JournalSource; language: 'zh' | 'en' }) => Promise<unknown>,
  parseSource?: (input: Awaited<ReturnType<typeof journalJobInput>>, jobId: string) => Promise<{ text: string; sourceMapRef?: DocumentSourceMapReference }>,
  nativeRuntime?: JournalNativeRuntime): Promise<boolean> {
  const job = await claimJournalJob(deps, nativeRuntime);
  if (!job?.leaseToken) return false;
  const token = job.leaseToken;
  const heartbeats = new Set<Promise<unknown>>();
  let leaseLost = false;
  const heartbeat = setInterval(() => {
    const pending = renewJournalJobLease(deps, job.id, token).then(result => { if (result.count !== 1) leaseLost = true; }, () => { leaseLost = true; });
    heartbeats.add(pending);
    void pending.finally(() => { heartbeats.delete(pending); });
  }, 30_000);
  heartbeat.unref();
  try {
    if (job.kind === 'source_parse') {
      if (!parseSource) throw new Error('Source parser not configured');
      const input = await journalJobInput(deps, job.id, token);
      const parsed = await parseSource(input, job.id);
      await finishJournalJob(deps, job.id, token, parsed);
      return true;
    }
    const input = await journalJobInput(deps, job.id, token);
    const draft = await generate({ jobId: job.id, leaseToken: token, source: input.source, language: input.language });
    if (leaseLost) throw new Error('Journal job lease renewal failed');
    await finishJournalJob(deps, job.id, token, draft);
    return true;
  } catch {
    // Provider exceptions can include response bodies. Persist only a safe operational explanation.
    await finishJournalJob(deps, job.id, token, null, 'AI 服务不可用、来源许可变更或作业已中止；请检查后重试');
    return true;
  } finally {
    clearInterval(heartbeat);
    await Promise.all(heartbeats);
  }
}
export function startJournalWorker(deps: WorkerDeps, gateway: AiGateway, parserCascade?: ParserCascadeRunner, enabled: () => boolean = () => process.env.JOURNALS_ENABLED !== 'false') {
  const nativeRuntime = nativeAgentRuntimeFromEnv(process.env);
  let stopped = false; let active = 0; let recovering = false;
  let resolveDrained!: () => void;
  const drained = new Promise<void>(resolve => { resolveDrained = resolve; });
  const finishDraining = () => { if (stopped && active === 0 && !recovering) resolveDrained(); };
  const timer = setInterval(() => {
    if (!stopped && enabled() && active < 2) {
      active++;
      void processOneJournalJob(deps, async input => {
        if (!deps.storage || !process.env.HERMES_NATIVE_AGENT_INBOX) throw new Error('Installed Hermes is unavailable');
        return runNativeJournalTask({ deps: { ...deps, storage: deps.storage }, gateway, ...input, inboxRoot: process.env.HERMES_NATIVE_AGENT_INBOX,
          renderPages: async pages => {
            if (!parserCascade || !input.source.artifactId) throw new Error('[blocked] Journal page renderer unavailable');
            const artifact = await deps.prisma.artifact.findUnique({ where: { id: input.source.artifactId } });
            if (!artifact) throw new Error('[blocked] Journal source artifact unavailable');
            const blob = await getBlob(deps.storage!, artifact.blobSha256);
            const chunks: Buffer[] = []; let size = 0;
            for await (const chunk of blob.body as AsyncIterable<Uint8Array>) {
              size += chunk.byteLength;
              if (size > 50 * 1024 * 1024) throw new Error('[blocked] Journal source too large');
              chunks.push(Buffer.from(chunk));
            }
            const bytes = Buffer.concat(chunks);
            if (bytes.length !== Number(artifact.size) || createHash('sha256').update(bytes).digest('hex') !== artifact.blobSha256)
              throw new Error('[blocked] Journal page source integrity mismatch');
            return (await parserCascade.renderPages({ artifactId: artifact.id, contentHash: artifact.blobSha256, content: bytes,
              mediaType: canonicalParserMediaType(artifact.logicalPath, artifact.mimeType) }, pages, NATIVE_IMAGE_REQUEST_MAX_BYTES)).pages;
          } });
      }, async (input, jobId) => {
        if (!deps.storage || !deps.malwareScanner || !parserCascade || !input.source.artifactId) throw new Error('Source parser unavailable');
        const artifact = await deps.prisma.artifact.findFirst({ where: { id: input.source.artifactId, workspaceId: input.workspaceId } });
        if (!artifact || Number(artifact.size) > 50 * 1024 * 1024) throw new Error('Invalid source artifact');
        const blob = await getBlob(deps.storage, artifact.blobSha256);
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of blob.body as AsyncIterable<Uint8Array>) { size += chunk.byteLength; if (size > 50 * 1024 * 1024) throw new Error('Source too large'); chunks.push(Buffer.from(chunk)); }
        const bytes = Buffer.concat(chunks);
        if (bytes.length !== Number(artifact.size) || createHash('sha256').update(bytes).digest('hex') !== artifact.blobSha256) throw new Error('Source integrity mismatch');
        await deps.malwareScanner(bytes);
        const externalProcessingEligible = journalParserExternalEligible(input.rights);
        const parsed = await parserCascade({ artifactId: artifact.id, contentHash: artifact.blobSha256, content: bytes, mediaType: canonicalParserMediaType(artifact.logicalPath, artifact.mimeType) }, { trustedAuthorizationContext: { taskId: jobId, actorId: input.actorId, workspaceId: input.workspaceId }, externalProcessingEligible });
        if (parsed.status !== 'succeeded') throw new Error('Source parsing requires editorial correction');
        const text = sourceMapToManuscriptText(parsed.sourceMap);
        if (artifact.mimeType !== 'application/pdf') return { text };
        const sourceMapRef = await persistDocumentSourceMapReference(deps.storage, parsed.sourceMap, parsed.status);
        if (sourceMapRef.artifactId !== artifact.id || sourceMapRef.contentHash !== artifact.blobSha256)
          throw new Error('Journal source map does not match uploaded artifact');
        return { text, sourceMapRef };
      }, nativeRuntime && process.env.HERMES_NATIVE_AGENT_INBOX ? nativeRuntime : undefined)
        .catch(() => { console.error('journal worker database operation failed; lease recovery will reconcile'); }).finally(() => { active--; finishDraining(); });
    }
  }, 1000);
  const recovery = setInterval(() => {
    if (stopped || recovering) return;
    recovering = true;
    void recoverJournalJobs(deps).catch(() => { console.error('journal lease reconciliation failed'); }).finally(() => { recovering = false; finishDraining(); });
  }, 60_000);
  timer.unref(); recovery.unref();
  return {
    stopAccepting() { stopped = true; clearInterval(timer); clearInterval(recovery); finishDraining(); },
    drained,
  };
}
