'use client';

import Link from 'next/link';
import * as React from 'react';
import { z } from 'zod';
import { useLocale } from 'next-intl';
import { journalEditorMessages } from '@/messages/journal-editor';
import ArtifactUploader from '@/components/editor/ArtifactUploader';
import { JournalDraftEditor } from '@/components/journals/JournalDraftEditor';
import { HermesResearchRunPanel } from '@/components/hermes/HermesResearchRunPanel';
import {
  assignJournalReviewer, cancelJournalJob, confirmJournalSharedInterpretation, getJournalArticle,
  getJournalArticleSources, getJournalDashboard, getJournalSharedCandidate, getJournalSharedFiles, listJournalMembers, publishJournalArticle,
  restrictJournalArticle, retryJournalSharedProcessing, reviewJournalArticle, updateJournalArticle,
  startJournalSharedProcessing, type ArticleProcessingCapability, type JournalArticle, type JournalMember, type JournalRole, type JournalDraft, type JournalSharedFiles, type JournalSharedCandidate,
} from '@/lib/journal-api';

const stateOf = (job: JournalArticle['jobs'][number]) => job.state ?? job.status ?? 'unknown';

export function journalArticlePermissions(role: JournalRole) {
  return {
    edit: role !== 'reviewer',
    assign: role === 'owner' || role === 'admin',
    review: role === 'owner' || role === 'admin' || role === 'reviewer',
    confirm: role !== 'reviewer',
    publish: role === 'owner' || role === 'admin',
  };
}

export function canConfirmJournalContent(article: Pick<JournalArticle, 'contentState' | 'draft' | 'reviewState'>, role: JournalRole, checked: boolean, dirty: boolean, busy: boolean) {
  return journalArticlePermissions(role).confirm && article.contentState === 'active' && Boolean(article.draft) && article.reviewState !== 'approved' && checked && !dirty && !busy;
}

export function canPublishJournalContent(article: Pick<JournalArticle, 'contentState' | 'draft' | 'reviewState' | 'reviewedRevision' | 'revision'>, role: JournalRole, dirty: boolean, busy: boolean) {
  return journalArticlePermissions(role).publish && article.contentState === 'active' && Boolean(article.draft) && article.reviewState === 'approved' && article.reviewedRevision === article.revision && !dirty && !busy;
}

export function journalGenerationIssues(article: Pick<JournalArticle, 'contentState' | 'source' | 'rights'>, canEdit: boolean, sourceBindingDirty: boolean, processing: boolean, copy: Record<string, string>, nativeGenerationReady?: boolean) {
  return [
    !canEdit && copy.readingOnly,
    article.contentState !== 'active' && copy.inactive,
    sourceBindingDirty && copy.needBinding,
    (article.source.kind === 'metadata' || article.source.text.trim().length < 50) && copy.needText,
    !article.rights.internalProcessing && copy.needInternal,
    !article.rights.derivativeGeneration && copy.needDerivative,
    !article.rights.externalProcessing && copy.needExternal,
    !article.rights.license.trim() && copy.needLicense,
    !article.rights.evidence.trim() && copy.needEvidence,
    processing && copy.processing,
    nativeGenerationReady === false && copy.nativeUnavailable,
  ].filter(Boolean) as string[];
}

const comparisonEvidence = z.object({ quote: z.string(), locator: z.string() });
const comparisonSchema = z.object({
  summary: z.string(), scope: z.enum(['abstract', 'fulltext']), language: z.enum(['zh', 'en']),
  core: z.object({ problem: z.string(), insight: z.string(), method: z.string(), results: z.string(), limitations: z.string(), reproducibility: z.string() }),
  claims: z.array(z.object({ text: z.string(), kind: z.enum(['experimental', 'simulation', 'theoretical', 'review', 'other']), evidence: comparisonEvidence })),
  figures: z.array(z.object({ label: z.string(), purpose: z.string(), finding: z.string(), evidence: comparisonEvidence })),
  faq: z.array(z.object({ question: z.string(), answer: z.string(), evidence: comparisonEvidence })),
});

export function JournalArticleWorkbench({ journalId, articleId }: { journalId: string; articleId: string }) {
  const locale = useLocale();
  const copy = journalEditorMessages[locale === 'en' ? 'en' : 'zh'];
  const [article, setArticle] = React.useState<JournalArticle | null>(null);
  const [capability, setCapability] = React.useState<ArticleProcessingCapability | null>(null);
  const [sharedFiles, setSharedFiles] = React.useState<JournalSharedFiles | null>(null);
  const [candidate, setCandidate] = React.useState<JournalSharedCandidate | null>(null);
  const [candidateError, setCandidateError] = React.useState('');
  const [candidateChecked, setCandidateChecked] = React.useState(false);
  const [nativeGenerationReady, setNativeGenerationReady] = React.useState<boolean | undefined>(undefined);
  const [role, setRole] = React.useState<JournalRole | null>(null);
  const [members, setMembers] = React.useState<JournalMember[]>([]);
  const [reviewerId, setReviewerId] = React.useState('');
  const [reviewNote, setReviewNote] = React.useState('');
  const [confirmedRevision, setConfirmedRevision] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [dirty, setDirty] = React.useState(false);
  const dirtyRef = React.useRef(false);
  const savedArticle = React.useRef<JournalArticle | null>(null);
  const [remoteDraft, setRemoteDraft] = React.useState<JournalDraft | null>(null);
  function editArticle(value: JournalArticle) { dirtyRef.current = true; setDirty(true); setConfirmedRevision(null); setArticle(value); }

  const load = React.useCallback(async () => {
    try {
      const [articleResult, dashboard, sourceMatrix, shared] = await Promise.all([getJournalArticle(journalId, articleId), getJournalDashboard(journalId), getJournalArticleSources(journalId, articleId), getJournalSharedFiles(journalId, articleId)]);
      savedArticle.current = articleResult.article; dirtyRef.current = false; setDirty(false); setRemoteDraft(null); setArticle(articleResult.article);
      setNativeGenerationReady(articleResult.nativeGenerationReady);
      setCapability(sourceMatrix.capability);
      setSharedFiles(shared);
      setCandidate(null); setCandidateChecked(false); setCandidateError('');
      setRole(dashboard.membership.role);
      if (journalArticlePermissions(dashboard.membership.role).assign) {
        const result = await listJournalMembers(journalId);
        setMembers(result.items.filter((member) => ['owner', 'admin', 'reviewer'].includes(member.role)));
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : copy.loadFailed); }
  }, [articleId, journalId, copy.loadFailed]);

  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  React.useEffect(() => {
    if (sharedFiles?.processing?.state !== 'needs_review' || !article || dirty) return;
    let active = true;
    void getJournalSharedCandidate(journalId, articleId, locale === 'en' ? 'en' : 'zh').then((value) => {
      if (active && value.articleRevision === article.revision) { setCandidate(value); setCandidateError(''); }
    }).catch((error) => { if (active) setCandidateError(error instanceof Error ? error.message : copy.candidateUnavailable); });
    return () => { active = false; };
  }, [article?.revision, articleId, dirty, journalId, locale, sharedFiles?.processing?.state]);
  const parsing = article?.jobs.some((job) => job.kind === 'source_parse' && ['staging', 'pending', 'running'].includes(stateOf(job))) ?? false;
  const sharedState = sharedFiles?.processing?.state;
  const sharedProcessing = Boolean(sharedState && ['queued', 'uploading', 'stored', 'parsing'].includes(sharedState));
  const processing = (article?.jobs.some((job) => ['staging', 'pending', 'running'].includes(stateOf(job))) ?? false) || sharedProcessing;
  React.useEffect(() => {
    if (!processing) return;
    let active = true;
    const timer = window.setInterval(() => {
      void getJournalSharedFiles(journalId, articleId).then((files) => { if (active) setSharedFiles(files); }).catch(() => undefined);
      void getJournalArticle(journalId, articleId).then(({ article: fresh, nativeGenerationReady: ready }) => {
        if (!active) return;
        setNativeGenerationReady(ready);
        if (dirtyRef.current) {
          setArticle((current) => current ? { ...current, jobs: fresh.jobs } : current);
          if (fresh.revision !== savedArticle.current?.revision) {
            setRemoteDraft(fresh.draft); setMessage(copy.remoteRevision);
          }
        } else { savedArticle.current = fresh; setArticle(fresh); }
      }).catch((error) => { if (active) setMessage(error instanceof Error ? error.message : copy.statusFailed); });
    }, 2000);
    return () => { active = false; window.clearInterval(timer); };
  }, [articleId, journalId, processing]);
  if (!article || !role) return <p aria-live="polite">{message || copy.loading}</p>;
  const permissions = journalArticlePermissions(role);
  const hasSourceMatrix = Boolean(article.source.materials?.length);
  const sourceBindingDirty = hasSourceMatrix && JSON.stringify(article.source) !== JSON.stringify(savedArticle.current?.source);
  const awaitingSourceRights = article.jobs.some((job) => job.kind === 'source_parse' && stateOf(job) === 'staging');
  const comparison = article.jobs.find((job) => job.comparisonDraft)?.comparisonDraft;
  const parsedComparison = comparisonSchema.safeParse(comparison);
  const activeSource = article.source.materials?.find((item) => item.activeForGeneration && item.fileId === article.source.artifactId);
  const sourceExpired = activeSource?.evidence.expiresAt ? Date.parse(activeSource.evidence.expiresAt) <= Date.now() : false;
  const scopeIssues = [
    !permissions.edit && copy.readingOnly,
    article.contentState !== 'active' && copy.inactive,
    (dirty || sourceBindingDirty) && copy.needBinding,
    !sharedFiles?.sourceArtifactId && copy.needFile,
    activeSource && !['abstract_processing_allowed', 'internal_processing_only', 'public_summary_allowed', 'full_public_processing_allowed'].includes(activeSource.rightsStatus) && copy.invalidRights,
    !activeSource?.permissions.internalProcessing && copy.needInternal,
    !activeSource?.permissions.derivativeGeneration && copy.needDerivative,
    !activeSource?.permissions.externalProcessing && copy.needExternal,
    (!activeSource?.evidence.license?.trim() || !article.rights.license.trim()) && copy.needLicense,
    (!activeSource?.evidence.statement?.trim() || !article.rights.evidence.trim()) && copy.needEvidence,
    sourceExpired && copy.expiredRights,
    activeSource && ['conflict', 'expired', 'revoked'].includes(activeSource.sourceConfidence) && copy.invalidRights,
    sharedState === 'needs_review' && copy.sharedReview,
    sharedState === 'confirmed' && copy.sharedReady,
    sharedState === 'written' && !article.draft && copy.sharedReady,
    processing && copy.processing,
  ].filter(Boolean) as string[];
  const canGenerate = scopeIssues.length === 0;

  async function save() {
    if (!article) return null;
    setBusy(true);
    try {
      const result = await updateJournalArticle(journalId, articleId, {
        revision: article.revision, directoryVisible: article.directoryVisible,
        ...(JSON.stringify(article.metadata) !== JSON.stringify(savedArticle.current?.metadata) ? { metadata: article.metadata } : {}),
        ...(JSON.stringify(article.source) !== JSON.stringify(savedArticle.current?.source) ? { source: { kind: article.source.kind, text: article.source.text, url: article.source.url, label: article.source.label } } : {}),
        ...(JSON.stringify(article.rights) !== JSON.stringify(savedArticle.current?.rights) ? { rights: article.rights } : {}),
        ...(article.draft && JSON.stringify(article.draft) !== JSON.stringify(savedArticle.current?.draft) ? { draft: article.draft } : {}),
      });
      savedArticle.current = result.article; dirtyRef.current = false; setDirty(false); setRemoteDraft(null); setArticle(result.article);
      setConfirmedRevision(null); setMessage(copy.saveHint);
      return result.article;
    } catch (error) { setMessage(error instanceof Error ? error.message : copy.saveFailed); return null; }
    finally { setBusy(false); }
  }

  async function createDraft() {
    if (!article || !canGenerate) return;
    setBusy(true);
    try {
      const request = { revision: article.revision, requestKey: crypto.randomUUID(), processingConsent: true as const };
      await (['failed_retryable', 'failed_blocked'].includes(sharedState ?? '') ? retryJournalSharedProcessing : startJournalSharedProcessing)(journalId, articleId, request);
      setSharedFiles(await getJournalSharedFiles(journalId, articleId));
      setMessage(copy.sharedStarted);
    }
    catch (error) { setMessage(error instanceof Error ? error.message : copy.startFailed); }
    finally { setBusy(false); }
  }

  async function confirmCandidate() {
    if (!article || !candidate || !candidateChecked || dirty || busy || candidate.articleRevision !== article.revision) return;
    setBusy(true);
    try {
      await confirmJournalSharedInterpretation(journalId, articleId, { revision: article.revision, language: locale === 'en' ? 'en' : 'zh' });
      await load(); setMessage(copy.candidateSaved);
    } catch (error) { setCandidateError(error instanceof Error ? error.message : copy.candidateConfirmFailed); }
    finally { setBusy(false); }
  }

  async function review(decision: 'submit' | 'approve' | 'request_changes' | 'confirm') {
    if (!article || !role || busy || dirty || (decision === 'confirm' && !canConfirmJournalContent(article, role, confirmedRevision === article.revision, dirty, busy))) return;
    setBusy(true);
    try { await reviewJournalArticle(journalId, articleId, { revision: article.revision, decision, note: reviewNote, ...(decision === 'confirm' ? { humanConfirmed: true } : {}) }); setReviewNote(''); setConfirmedRevision(null); await load(); setMessage(decision === 'submit' ? copy.submitted : decision === 'request_changes' ? copy.changesRecorded : copy.confirmed); }
    catch (error) { setMessage(error instanceof Error ? error.message : copy.confirmFailed); }
    finally { setBusy(false); }
  }

  async function assign() {
    if (!article || !reviewerId) { setMessage(copy.selectColleague); return; }
    setBusy(true);
    try { const result = await assignJournalReviewer(journalId, articleId, { revision: article.revision, reviewerId }); setArticle({ ...article, ...result.article }); setConfirmedRevision(null); setMessage(copy.assigned); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : copy.assignmentFailed); }
    finally { setBusy(false); }
  }

  async function publish() {
    if (!article || !role || !canPublishJournalContent(article, role, dirty, busy) || !window.confirm(copy.publishConfirm)) return;
    setBusy(true);
    try { const result = await publishJournalArticle(journalId, articleId, { revision: article.revision, requestKey: crypto.randomUUID() }); setMessage(`${copy.publishedVersion} v${result.release.versionNo}`); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : copy.publishFailed); }
    finally { setBusy(false); }
  }

  async function changeVisibility(state: 'restricted' | 'withdrawn') {
    if (dirty || busy) return;
    const reason = window.prompt(state === 'withdrawn' ? copy.withdrawReason : copy.restrictReason);
    if (!reason?.trim()) return;
    setBusy(true);
    try { await restrictJournalArticle(journalId, articleId, { state, reason: reason.trim() }); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : copy.actionFailed); }
    finally { setBusy(false); }
  }

  async function cancel(jobId: string) {
    setBusy(true);
    try {
      await cancelJournalJob(journalId, jobId);
      const { article: fresh } = await getJournalArticle(journalId, articleId);
      if (dirtyRef.current) setArticle((current) => current ? { ...current, jobs: fresh.jobs } : current);
      else { savedArticle.current = fresh; setArticle(fresh); }
      setMessage(copy.cancelledSafely);
    } catch (error) { setMessage(error instanceof Error ? error.message : copy.cancelFailed); }
    finally { setBusy(false); }
  }

  function guardNavigation(event: React.MouseEvent<HTMLAnchorElement>) {
    if (dirty && !window.confirm(copy.leaveWithChanges)) event.preventDefault();
  }

  const reviewLabel = article.contentState === 'restricted' ? copy.restricted : article.contentState === 'withdrawn' ? copy.withdrawn : ({ draft: copy.privateDraft, submitted: copy.pendingCheck, approved: copy.interpretationConfirmed, changes_requested: copy.changesNeeded } as Record<string, string>)[article.reviewState] || copy.privateDraft;
  return <article className="mx-auto max-w-4xl pb-16">
    <Link className="text-sm text-os-muted-paper" href={`/journals/manage/${journalId}`} onClick={guardNavigation}>← {copy.backToWorkbench}</Link>
    <header className="mt-6 border-b border-os-rule-paper pb-7">
      <p className="text-sm text-os-muted-paper">{reviewLabel} · {copy.currentRevision} {article.revision} · {article.releases.length ? `${copy.publishedVersion} v${article.releases[0].versionNo}` : copy.unpublished}</p>
      <h1 className="mt-2 break-words text-3xl font-normal sm:text-4xl">{article.metadata.title}</h1>
      <p className="mt-3 break-words text-os-muted-paper">{article.metadata.authors.join('，')}{article.metadata.publishedDate ? ` · ${article.metadata.publishedDate}` : ''}{article.metadata.doi ? ` · DOI ${article.metadata.doi}` : ''}</p>
      <nav className="mt-4 flex flex-wrap gap-5 text-sm" aria-label={locale === 'en' ? 'Paper links' : '论文链接'}><a className="underline" href={article.metadata.originalUrl} target="_blank" rel="noopener noreferrer">{locale === 'en' ? 'Original paper' : '查看原文'}</a>{article.releases[0] ? <Link className="underline" href={article.releases[0].url} onClick={guardNavigation}>{locale === 'en' ? 'Public version' : '查看已公开版本'} v{article.releases[0].versionNo}</Link> : null}</nav>
    </header>

    <nav className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-b border-os-rule-paper pb-5 text-sm" aria-label={locale === 'en' ? 'Paper workflow' : '论文流程'}><a href="#paper-files">01 {copy.paperAndFiles}</a><a href="#paper-scope">02 {copy.permissionsScope}</a><a href="#paper-hermes">03 {copy.hermesSection}</a><a href="#paper-interpretation">04 {copy.interpretationSection}</a><a href="#paper-approval">05 {copy.approvalSection}</a></nav>

    <section className="mt-8 scroll-mt-8" id="paper-files" aria-labelledby="paper-files-title">
      <p className="text-xs font-medium tracking-[.14em] text-os-muted-paper">01 / 05</p><h2 id="paper-files-title" className="mt-2 text-2xl font-normal">{copy.paperAndFiles}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-os-muted-paper">{copy.materialIntro}</p>
      <ArtifactUploader journalScope={{ journalId, articleId, revision: article.revision, disabled: dirty || busy || !permissions.edit || processing, onChanged: load }} />
      {awaitingSourceRights ? <p className="mt-3 text-sm" role="status">{copy.waiting}。<Link className="underline" href={`/journals/manage/${journalId}/articles/${articleId}/sources`}>{copy.confirmMaterial}</Link></p> : parsing ? <p className="mt-3 text-sm" role="status">{copy.parsing}</p> : null}
      {permissions.edit ? <>
        <details className="mt-5 border-t border-os-rule-paper pt-4"><summary className="min-h-11 cursor-pointer text-sm text-os-ink">{locale === 'en' ? 'Review extracted text' : '核对提取的论文文本'}</summary><div className="mt-3 grid gap-3"><label className="grid gap-2 text-sm">{locale === 'en' ? 'Text scope' : '文本范围'}<select value={article.source.kind} onChange={(event) => editArticle({ ...article, source: { ...article.source, kind: event.target.value as JournalArticle['source']['kind'] } })} className="min-h-11 border border-os-rule-paper bg-transparent px-3"><option value="metadata">{locale === 'en' ? 'Metadata only' : '仅元数据'}</option><option value="abstract">{locale === 'en' ? 'Abstract' : '摘要'}</option><option value="fulltext">{locale === 'en' ? 'Full paper' : '完整正文'}</option></select></label><label className="grid gap-2 text-sm">{locale === 'en' ? 'Paper text' : '来源文本'}<textarea rows={6} value={article.source.text} onChange={(event) => editArticle({ ...article, source: { ...article.source, text: event.target.value } })} className="min-w-0 border border-os-rule-paper bg-transparent p-3" /></label></div></details>
      </> : <div className="mt-3 border border-os-rule-paper p-4 text-sm"><p>{copy.readOnlySource}：{article.source.label}</p><p className="whitespace-pre-wrap">{article.source.text}</p></div>}
    </section>

    <section className="mt-10 scroll-mt-8 border-t border-os-rule-paper pt-7" id="paper-scope" aria-labelledby="paper-scope-title">
      <p className="text-xs font-medium tracking-[.14em] text-os-muted-paper">02 / 05</p><h2 id="paper-scope-title" className="mt-2 text-2xl font-normal">{copy.permissionsScope}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-os-muted-paper">{copy.scopeIntro}</p>
      <div className="mt-5 grid gap-5 border-l-2 border-os-ink pl-5 sm:grid-cols-2"><div><p className="text-sm font-medium">{canGenerate ? copy.scopeAllowed : copy.scopeBlocked}</p>{capability?.limitations.length ? <p className="mt-2 text-sm text-os-muted-paper">{capability.limitations.join('；')}</p> : null}</div><div><p className="text-sm font-medium">{copy.publicScope}</p><p className="mt-2 text-sm text-os-muted-paper">{capability?.canPublishPublicSummary ? copy.summaryPermitted : copy.summaryNotPermitted} · {capability?.canPublishFigures ? copy.figuresPermitted : copy.figuresNotPermitted}</p></div></div>
      <p className="mt-4 text-sm text-os-muted-paper">{copy.scopePublication}</p><Link className="mt-3 inline-flex min-h-11 items-center border border-os-rule-paper px-4 text-sm no-underline" href={`/journals/manage/${journalId}/articles/${articleId}/sources`} onClick={guardNavigation}>{copy.openMaterials} →</Link>
    </section>

    <section className="mt-10 scroll-mt-8 border-t border-os-rule-paper pt-7" id="paper-hermes" aria-labelledby="paper-hermes-title">
      <p className="text-xs font-medium tracking-[.14em] text-os-muted-paper">03 / 05</p><h2 id="paper-hermes-title" className="mt-2 text-2xl font-normal">{copy.hermesSection}</h2>
      <HermesResearchRunPanel journalScope={{ journalId, articleId, researchObjectId: article.researchObjectId, sourceLabel: article.source.label, sourceRevision: article.revision, jobs: article.jobs, processing: sharedFiles?.processing, hasDraft: Boolean(article.draft), canStart: canGenerate && permissions.edit, busy, issues: scopeIssues, onStart: createDraft, onCancel: cancel }} />
    </section>

    <section className="mt-10 scroll-mt-8 border-t border-os-rule-paper pt-7" id="paper-interpretation" aria-labelledby="paper-interpretation-title">
      <p className="text-xs font-medium tracking-[.14em] text-os-muted-paper">04 / 05</p><h2 id="paper-interpretation-title" className="mt-2 text-2xl font-normal">{copy.interpretationSection}</h2>
      {candidate && candidate.articleRevision === article.revision && sharedFiles?.processing?.state === 'needs_review' ? <section className="mt-5 border-l-2 border-os-ink bg-os-paper-raised/40 p-4 sm:p-6" aria-label={copy.candidateTitle}><h3 className="text-lg font-normal">{copy.candidateTitle}</h3><p className="mt-2 text-sm leading-6 text-os-muted-paper">{copy.candidateHint}</p><details className="mt-4 border-t border-os-rule-paper pt-3"><summary className="min-h-11 cursor-pointer text-sm underline">{copy.reviewCandidate}</summary><JournalDraftEditor draft={candidate.draft} readOnly onChange={() => undefined} /></details><label className="mt-5 flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={candidateChecked} disabled={busy || dirty} onChange={(event) => setCandidateChecked(event.target.checked)} />{copy.candidateConfirmation}</label><button type="button" disabled={!candidateChecked || busy || dirty} className="mt-4 min-h-11 border border-os-ink px-4 text-sm disabled:opacity-50" onClick={() => void confirmCandidate()}>{busy ? copy.confirming : copy.confirmGenerated}</button></section> : null}
      {candidateError && sharedFiles?.processing?.state === 'needs_review' ? <div className="mt-3 flex flex-wrap items-center gap-3 text-sm" role="alert"><span className="text-state-danger">{candidateError}</span><button type="button" className="min-h-11 underline" onClick={() => { setCandidateError(''); void getJournalSharedCandidate(journalId, articleId, locale === 'en' ? 'en' : 'zh').then(setCandidate).catch((error) => setCandidateError(error instanceof Error ? error.message : copy.candidateUnavailable)); }}>{copy.retry}</button></div> : null}
      {article.draft ? <JournalDraftEditor draft={article.draft} readOnly={!permissions.edit} onChange={(draft) => editArticle({ ...article, draft })} /> : <p className="mt-4 text-sm text-os-muted-paper">{locale === 'en' ? 'The private interpretation will appear here after Hermes finishes. Nothing is published automatically.' : 'Hermes 完成后，私有解读会出现在这里；生成结果不会自动公开。'}</p>}
      {permissions.edit && comparison ? <details className="mt-5 border border-os-rule-paper p-4"><summary>{copy.alternativeResult}</summary><p className="text-sm text-os-muted-paper">{copy.alternativeHint}</p><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(comparison, null, 2)}</pre>{parsedComparison.success ? <button className="mt-3 border border-os-rule-paper px-3 py-2 text-sm" onClick={() => editArticle({ ...article, draft: parsedComparison.data })}>{copy.adoptAlternative}</button> : null}</details> : null}
      {remoteDraft ? <details className="mt-5 border border-os-rule-paper p-4"><summary>{copy.compareRemote}</summary><JournalDraftEditor draft={remoteDraft} readOnly onChange={() => undefined} /><button className="mt-3 border px-3 py-2" onClick={() => { if (window.confirm(copy.replaceRemoteConfirm)) void load(); }}>{copy.loadRemote}</button></details> : null}
    </section>

    <section className="mt-10 scroll-mt-8 border-t border-os-rule-paper pt-7" id="paper-approval" aria-labelledby="paper-approval-title">
      <p className="text-xs font-medium tracking-[.14em] text-os-muted-paper">05 / 05</p><h2 id="paper-approval-title" className="mt-2 text-2xl font-normal">{copy.approvalSection}</h2>
      {article.draft ? <div className="mt-5" aria-labelledby="editor-confirm-title"><h3 id="editor-confirm-title" className="text-lg">{copy.confirmTitle}</h3><p className="mt-2 text-sm text-os-muted-paper">{copy.confirmHint}</p>{permissions.confirm && article.reviewState !== 'approved' ? <label className="mt-3 flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" disabled={busy || dirty} checked={confirmedRevision === article.revision} onChange={(event) => setConfirmedRevision(event.target.checked ? article.revision : null)} />{copy.confirmation}</label> : article.reviewState === 'approved' ? <p className="mt-3 text-sm" role="status">{copy.confirmed}</p> : null}</div> : null}
      {permissions.assign ? <details className="mt-5 border-t border-os-rule-paper pt-4"><summary className="cursor-pointer text-sm">{copy.optionalTeam}</summary><p className="mt-2 text-sm text-os-muted-paper">{copy.assignHint}</p><div className="mt-3 flex flex-wrap items-end gap-2"><label className="grid gap-1 text-sm">{copy.collaborator}<select aria-label={copy.collaborator} value={reviewerId} onChange={(event) => setReviewerId(event.target.value)} className="min-h-10 border border-os-rule-paper bg-transparent px-3"><option value="">—</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName || member.email}</option>)}</select></label><button disabled={busy || dirty || !reviewerId} className="min-h-10 border border-os-rule-paper px-4 text-sm disabled:opacity-50" onClick={() => void assign()}>{copy.assign}</button>{permissions.edit ? <button disabled={busy || dirty || !article.draft} className="min-h-10 border border-os-rule-paper px-4 text-sm disabled:opacity-50" onClick={() => void review('submit')}>{copy.submit}</button> : null}</div></details> : null}
      {(permissions.edit || permissions.review) && article.draft ? <label className="mt-5 grid gap-2 text-sm">{copy.note}<textarea rows={3} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} className="border border-os-rule-paper bg-transparent p-3" /></label> : null}
      {permissions.edit ? <label className="mt-5 flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={article.directoryVisible} onChange={(event) => editArticle({ ...article, directoryVisible: event.target.checked })} />{locale === 'en' ? 'Show this paper in the journal directory' : '在期刊目录中显示这篇论文'}</label> : null}
      <p className="mt-3 text-sm" role="status">{dirty ? copy.dirty : ''}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        {permissions.edit ? <button disabled={busy} className="min-h-10 border border-os-rule-paper px-4 text-sm" onClick={() => void save()}>{copy.save}</button> : null}
        {permissions.confirm && article.draft && article.reviewState !== 'approved' ? <button disabled={!canConfirmJournalContent(article, role, confirmedRevision === article.revision, dirty, busy)} className="min-h-10 border border-os-rule-paper px-4 text-sm disabled:opacity-50" onClick={() => void review('confirm')}>{busy ? copy.confirming : copy.confirm}</button> : null}
        {permissions.review && role === 'reviewer' ? <><button disabled={busy || dirty || article.reviewState !== 'submitted'} className="min-h-10 border border-os-rule-paper px-4 text-sm disabled:opacity-50" onClick={() => void review('approve')}>{copy.approve}</button><button disabled={busy || dirty || article.reviewState !== 'submitted'} className="min-h-10 border border-os-rule-paper px-4 text-sm disabled:opacity-50" onClick={() => void review('request_changes')}>{copy.changes}</button></> : null}
        {permissions.publish ? <><button disabled={!canPublishJournalContent(article, role, dirty, busy)} className="min-h-10 bg-accent-primary-strong px-4 text-sm font-semibold text-os-black-0 disabled:opacity-50" onClick={() => void publish()}>{copy.publish}</button><button disabled={busy || dirty} className="min-h-10 border border-os-rule-paper px-4 text-sm disabled:opacity-50" onClick={() => void changeVisibility('restricted')}>{copy.restrictAction}</button><button disabled={busy || dirty} className="min-h-10 border border-os-rule-paper px-4 text-sm disabled:opacity-50" onClick={() => void changeVisibility('withdrawn')}>{copy.withdrawAction}</button></> : null}
      </div>
      <p className="mt-2 text-sm text-os-muted-paper">{copy.publishHint}</p>
      {message ? <p className="mt-3 text-sm" role="status">{message}</p> : null}
    </section>
    {dirty && permissions.edit ? <div className="sticky bottom-0 z-20 mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-os-rule-paper bg-paper-bg/95 px-3 py-3 shadow-lg backdrop-blur"><p className="m-0 text-sm">{copy.unsavedNotice}</p><button type="button" disabled={busy} className="min-h-11 bg-os-ink px-5 text-sm text-paper-bg disabled:opacity-50" onClick={() => void save()}>{copy.saveNow}</button></div> : null}
  </article>;
}
