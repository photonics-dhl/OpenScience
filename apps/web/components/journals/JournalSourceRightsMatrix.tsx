'use client';
import Link from 'next/link';
import * as React from 'react';
import { useLocale } from 'next-intl';
import { ApiClientError } from '@/lib/api';
import { addJournalArticleSource, getJournalArticle, getJournalArticleSources, getJournalDashboard, recalculateJournalProcessingCapability, updateJournalArticleSourceRights, type ArticleProcessingCapability, type JournalArticle, type JournalArticleSourceRecord, type JournalRightsStatus, type JournalSourceConfidence, type JournalSourceHistoryEntry, type JournalSourceType } from '@/lib/journal-api';
import { editSourceEvidence, limitPermissions, type SourcePermissions } from '@/lib/journal-rights-form';
import { SourceRightsFields, emptySourcePermissions, sourceRightsIssues } from './SourceRightsFields';
import { useJournalMaterialsCopy } from './journal-materials-copy';
const control = 'min-h-11 max-w-full border border-os-rule-paper bg-transparent px-3 text-sm disabled:opacity-50';
const statuses: Array<[JournalRightsStatus, string]> = [['unknown', '权限未知'], ['metadata_only_allowed', '仅允许书目信息'], ['abstract_processing_allowed', '允许摘要加工'], ['internal_processing_only', '仅内部解读'], ['public_summary_allowed', '允许公开文字解读'], ['figure_reuse_allowed', '允许公开使用原图'], ['derivative_illustration_allowed', '允许生成示意图'], ['full_public_processing_allowed', '允许完整加工与公开'], ['restricted_blocked', '限制或禁止使用']];
const confidences: Array<[JournalSourceConfidence, string]> = [['verified', '已核验'], ['editor_claimed', '编辑声明'], ['author_claimed', '作者声明'], ['publicly_accessible', '公开可访问'], ['machine_parsed_only', '仅机器解析'], ['conflict', '存在冲突'], ['expired', '已过期'], ['revoked', '已撤回']];
const sourceTypes: Array<[JournalSourceType, string]> = [['doi_metadata', 'DOI 书目信息'], ['abstract', '摘要'], ['public_full_text', '公开全文'], ['publisher_full_text', '出版商全文'], ['editor_uploaded_pdf', '编辑上传的 PDF'], ['author_material', '作者提供材料'], ['supplementary', '辅助材料'], ['figure_asset', '论文图片'], ['parsed_text', '解析文本'], ['ocr_visual_sidecar', '视觉辅助材料'], ['manual_note', '人工说明']];
const sourceTypeEn: Record<JournalSourceType, string> = { doi_metadata: 'DOI metadata', abstract: 'Abstract', public_full_text: 'Public full text', publisher_full_text: 'Publisher full text', editor_uploaded_pdf: 'Editor-uploaded PDF', author_material: 'Author material', supplementary: 'Supplement', figure_asset: 'Paper figure', parsed_text: 'Parsed text', ocr_visual_sidecar: 'Visual analysis', manual_note: 'Editorial note' };
type CurrentSource = Pick<JournalArticle['source'], 'kind' | 'url' | 'label'> & { artifactId?: string };
const fullTextTypes = new Set<JournalSourceType>(['public_full_text', 'publisher_full_text', 'editor_uploaded_pdf', 'author_material', 'parsed_text', 'ocr_visual_sidecar']);
export function sourceBindingIssue(current: CurrentSource, sourceType: JournalSourceType, url: string, active: boolean): string | null {
  if (!active) return null;
  if (current.kind === 'metadata') return '当前只有书目信息，不能关联为解读来源。';
  if (current.kind === 'abstract' ? sourceType !== 'abstract' : !fullTextTypes.has(sourceType)) return '材料类型必须与当前摘要或全文一致。';
  if (current.artifactId) return url && url !== current.url ? '来源地址与当前文件记录的网址不一致。' : null;
  return !current.url || url !== current.url ? '来源地址必须与当前论文文本的网址完全一致。' : null;
}
export function sourceBindingFileId(current: CurrentSource, active: boolean): string | undefined {
  return active ? current.artifactId || undefined : undefined;
}
type RightsDraft = { status: JournalRightsStatus; confidence: JournalSourceConfidence; statement: string; license: string; expiresAt: string; permissions: SourcePermissions; active: boolean };
function initialDraft(source?: JournalArticleSourceRecord): RightsDraft { return { status: source?.rightsStatus ?? 'unknown', confidence: source?.sourceConfidence ?? 'editor_claimed', statement: source?.evidence.statement || source?.notes || '', license: source?.evidence.license ?? '', expiresAt: source?.evidence.expiresAt ?? '', permissions: source ? { ...source.permissions } : emptySourcePermissions(), active: source?.activeForGeneration ?? false }; }
function sourceEvidence(prior: JournalArticleSourceRecord['evidence'], value: RightsDraft): JournalArticleSourceRecord['evidence'] { return { ...editSourceEvidence(prior, value.statement, value.license), expiresAt: prior.expiresAt ?? null }; }
function RightsFields({ value, onChange, disabled, idPrefix, sourceType }: { value: RightsDraft; onChange: (value: RightsDraft) => void; disabled: boolean; idPrefix: string; sourceType?: JournalSourceType }) {
  const copy = useJournalMaterialsCopy();
  return <div className="grid gap-4"><SourceRightsFields idPrefix={idPrefix} value={{ rightsStatus: value.status, sourceConfidence: value.confidence, license: value.license, evidence: value.statement, expiresAt: value.expiresAt, permissions: value.permissions }} onChange={(next) => onChange({ ...value, status: next.rightsStatus, confidence: next.sourceConfidence, statement: next.evidence, license: next.license, expiresAt: next.expiresAt, permissions: next.permissions })} disabled={disabled} sourceType={sourceType} activeForGeneration={value.active} /><label className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" disabled={disabled} checked={value.active} onChange={(event) => onChange({ ...value, active: event.target.checked })} /><span>{copy.active}<small className="mt-1 block leading-5 text-os-muted-paper">{copy.activeHelp}</small></span></label></div>;
}function Scope({ capability, busy, onRecalculate }: { capability: ArticleProcessingCapability; busy: boolean; onRecalculate?: () => void }) {
  const en = useLocale() === 'en';
  const generated: Array<[string, boolean]> = en ? [['Metadata', capability.canGenerateMetadataPage], ['Abstract interpretation', capability.canGenerateAbstractSummary], ['Full six-field interpretation', capability.canGenerateFullSixFields], ['Figure explanations', capability.canGenerateFigureExplanation], ['Reproducibility', capability.canGenerateReproducibilityField], ['Derivative illustrations', capability.canGenerateDerivativeIllustration]] : [['书目信息', capability.canGenerateMetadataPage], ['摘要级解读', capability.canGenerateAbstractSummary], ['完整六字段', capability.canGenerateFullSixFields], ['图义说明', capability.canGenerateFigureExplanation], ['可复现性说明', capability.canGenerateReproducibilityField], ['衍生示意图', capability.canGenerateDerivativeIllustration]];
  const visible: Array<[string, boolean]> = en ? [['Text summary', capability.canPublishPublicSummary], ['Full interpretation', capability.canPublishFullInterpretation], ['Original figures', capability.canPublishFigures], ['Public API', capability.canExposeViaApi]] : [['文字摘要', capability.canPublishPublicSummary], ['完整解读', capability.canPublishFullInterpretation], ['论文原图', capability.canPublishFigures], ['公开 API', capability.canExposeViaApi]];
  return <section className="border border-os-rule-paper p-5" aria-labelledby="journal-scope-heading"><div className="flex flex-wrap items-center justify-between gap-4"><h2 id="journal-scope-heading" className="m-0 text-xl font-normal">{en ? 'Processing and publication scope' : '加工与公开范围'}</h2>{onRecalculate ? <button className={control} disabled={busy} onClick={onRecalculate}>{en ? 'Reevaluate scope' : '重新评估范围'}</button> : null}</div><div className="mt-4 grid gap-5 sm:grid-cols-2">{([[en ? 'Private processing' : '私有加工', generated], [en ? 'Public release' : '公开发布', visible]] as Array<[string, Array<[string, boolean]>]>).map(([title, entries]) => <div key={title}><h3 className="text-base font-normal">{title}</h3>{entries.map(([label, enabled]) => <p key={label} className="my-1 text-sm">{enabled ? (en ? 'Allowed' : '允许') : (en ? 'Not allowed' : '不允许')}：{label}</p>)}</div>)}</div>{capability.limitations.length ? <p className="text-sm text-os-muted-paper">{en ? 'Limits' : '限制'}：{capability.limitations.join('；')}</p> : null}{capability.blockingReasons.length ? <p className="text-sm text-os-vermilion-ink">{en ? 'Needs attention' : '需要处理'}：{capability.blockingReasons.join('；')}</p> : null}<p className="mb-0 text-xs text-os-muted-paper">{en ? 'Public release still requires separate journal approval.' : '允许公开仍需经过期刊审批。'}</p></section>;
}
function SourceCard({ source, busy, canEdit, onSave }: { source: JournalArticleSourceRecord; busy: boolean; canEdit: boolean; onSave: (source: JournalArticleSourceRecord, draft: RightsDraft) => Promise<boolean> }) {
  const [draft, setDraft] = React.useState(() => initialDraft(source)); const dirty = React.useRef(false);
  const copy = useJournalMaterialsCopy(); const en = useLocale() === 'en';
  React.useEffect(() => { if (!dirty.current) setDraft(initialDraft(source)); }, [source]);
  const issues = sourceRightsIssues({ rightsStatus: draft.status, sourceConfidence: draft.confidence, evidence: draft.statement, license: draft.license, expiresAt: draft.expiresAt, permissions: draft.permissions }, source.sourceType, draft.active);
  return <details className="min-w-0 border border-os-rule-paper p-5"><summary className="cursor-pointer break-words">{source.title || (en ? sourceTypeEn[source.sourceType] : sourceTypes.find(([key]) => key === source.sourceType)?.[1]) || source.sourceType} · {copy[source.rightsStatus]}</summary><form className="mt-5 grid gap-4" onSubmit={(event) => { event.preventDefault(); if (!canEdit || issues.length) return; dirty.current = false; void onSave(source, draft).then((saved) => { if (!saved) dirty.current = true; }); }}><RightsFields idPrefix={`source-${source.id}`} sourceType={source.sourceType} value={draft} onChange={(value) => { dirty.current = true; setDraft(value); }} disabled={busy || !canEdit} />{canEdit ? <button type="submit" className={`${control} justify-self-start`} disabled={busy || issues.length > 0}>{en ? 'Save these rights' : '保存此项授权'}</button> : null}</form></details>;
}
export function JournalSourceRightsMatrix({ journalId, articleId }: { journalId: string; articleId: string }) {
  const copy = useJournalMaterialsCopy(); const en = useLocale() === 'en';
  const [sources, setSources] = React.useState<JournalArticleSourceRecord[]>([]);
  const [history, setHistory] = React.useState<JournalSourceHistoryEntry[]>([]);
  const [capability, setCapability] = React.useState<ArticleProcessingCapability | null>(null);
  const [revision, setRevision] = React.useState<number | null>(null);
  const [title, setTitle] = React.useState('');
  const [currentSource, setCurrentSource] = React.useState<CurrentSource>({ kind: 'metadata', url: '', label: '' });
  const [canEdit, setCanEdit] = React.useState(false);
  const [error, setError] = React.useState(''); const [message, setMessage] = React.useState(''); const [busy, setBusy] = React.useState(false);
  const inFlight = React.useRef(false); const generation = React.useRef(0);
  const [draft, setDraft] = React.useState<RightsDraft>(() => initialDraft());
  const [sourceType, setSourceType] = React.useState<JournalSourceType>('abstract');
  const [sourceTitle, setSourceTitle] = React.useState(''); const [url, setUrl] = React.useState('');
  const load = React.useCallback(async (): Promise<boolean> => {
    const request = ++generation.current;
    try {
      const [matrix, article, dashboard] = await Promise.all([getJournalArticleSources(journalId, articleId), getJournalArticle(journalId, articleId), getJournalDashboard(journalId)]);
      if (request !== generation.current) return false;
      setSources(matrix.sources); setHistory(matrix.history); setCapability(matrix.capability); setRevision(matrix.articleRevision);
      setTitle(article.article.metadata.title); setCurrentSource(article.article.source as CurrentSource);
      setSourceType(article.article.source.kind === 'fulltext' ? 'editor_uploaded_pdf' : 'abstract');
      setCanEdit(['owner', 'admin', 'editor'].includes(dashboard.membership.role)); setError(''); return true;
    } catch (cause) {
      if (request === generation.current) {
        setCanEdit(false); setError(cause instanceof Error ? cause.message : copy.loadFailed);
        if (cause instanceof ApiClientError && [401, 403, 404].includes(cause.status)) { setCapability(null); setSources([]); setHistory([]); }
      }
      return false;
    }
  }, [articleId, journalId, copy.loadFailed]);
  React.useEffect(() => { void load(); return () => { generation.current += 1; }; }, [load]);
  async function mutate(action: () => Promise<unknown>, success = copy.saved): Promise<boolean> {
    if (inFlight.current || revision === null || !canEdit) return false;
    inFlight.current = true; setBusy(true); setMessage('');
    try { await action(); const fresh = await load(); setMessage(fresh ? success : copy.loadFailed); return fresh; }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : copy.saveFailed); return false; }
    finally { inFlight.current = false; setBusy(false); }
  }
  function save(source: JournalArticleSourceRecord, value: RightsDraft) {
    return mutate(() => updateJournalArticleSourceRights(journalId, articleId, source.id, {
      revision: revision!, rightsStatus: value.status, sourceConfidence: value.confidence,
      permissions: limitPermissions(value.status, value.permissions), evidence: sourceEvidence(source.evidence, value),
      notes: value.statement.trim(), activeForGeneration: value.active,
    }));
  }
  const draftIssues = sourceRightsIssues({ rightsStatus: draft.status, sourceConfidence: draft.confidence,
    evidence: draft.statement, license: draft.license, expiresAt: draft.expiresAt, permissions: draft.permissions }, sourceType, draft.active);
  const bindingIssue = sourceBindingIssue(currentSource, sourceType, url.trim(), draft.active);
  const bindingText = bindingIssue ? (en ? copy.activeBindingIssue : bindingIssue) : '';
  if (error && !capability) return <section role="alert"><p>{error}</p><button className={control} onClick={() => void load()}>{copy.retry}</button></section>;
  if (!capability) return <p role="status">{copy.loading}</p>;
  return <div className="grid min-w-0 gap-7">
    <header className="border-b border-os-rule-paper pb-5"><Link href={`/journals/manage/${journalId}/articles/${articleId}`} className="text-sm">← {copy.back}</Link><h1 className="mt-5 break-words text-3xl font-normal">{title}</h1><p className="text-sm text-os-muted-paper">{copy.intro} {en ? 'Saving permission never starts Hermes or publishes content.' : '保存授权不会启动 Hermes，也不会公开内容。'}</p></header>
    {error ? <div role="alert"><p>{error}</p><button className={control} onClick={() => void load()}>{copy.retry}</button></div> : null}
    <Scope capability={capability} busy={busy} onRecalculate={canEdit ? () => { void mutate(() => recalculateJournalProcessingCapability(journalId, articleId, { revision: revision! }), en ? 'Scope reevaluated. No AI processing or publication started.' : '范围已重新评估；未运行 AI，也未公开材料。'); } : undefined} />
    <section className="grid gap-4" aria-labelledby="journal-material-rights"><h2 id="journal-material-rights" className="m-0 text-xl font-normal">{copy.list}</h2>{!sources.length ? <p className="text-sm text-os-muted-paper">{copy.sourceEmpty}</p> : sources.map((source) => <SourceCard key={source.id} source={source} busy={busy} canEdit={canEdit} onSave={save} />)}</section>
    {canEdit ? <details className="border-t border-os-rule-paper pt-5"><summary className="cursor-pointer text-lg">{copy.add}</summary><p className="text-sm text-os-muted-paper">{en ? 'Record the origin and permission for an existing material here. Upload files in Paper and files; keep authorization evidence private.' : '在此登记已有材料的来源与授权。文件请从“论文与文件”上传；授权证明仅供内部核验。'}</p><p className="break-words text-sm text-os-muted-paper">{en ? 'Current paper source' : '当前论文来源'}：{currentSource.label || (currentSource.kind === 'fulltext' ? (en ? 'Full paper' : '全文') : currentSource.kind === 'abstract' ? (en ? 'Abstract' : '摘要') : (en ? 'Metadata only' : '书目信息'))} · {currentSource.artifactId ? (en ? 'Bound to the uploaded file' : '关联当前上传的文件') : currentSource.url ? currentSource.url : (en ? 'No file or URL bound' : '尚无关联文件或网址')}</p>
      <form className="mt-5 grid gap-4" onSubmit={(event) => { event.preventDefault(); if (bindingIssue || draftIssues.length) { setMessage(bindingText || copy[draftIssues[0]!]); return; } void mutate(() => addJournalArticleSource(journalId, articleId, { revision: revision!, source: { sourceType, title: sourceTitle.trim() || undefined, url: url.trim() || undefined, fileId: sourceBindingFileId(currentSource, draft.active), rightsStatus: draft.status, sourceConfidence: draft.confidence, permissions: limitPermissions(draft.status, draft.permissions), evidence: sourceEvidence({ statement: '' }, draft), notes: draft.statement.trim(), activeForGeneration: draft.active } }), copy.added).then((saved) => { if (saved) { setDraft(initialDraft()); setSourceTitle(''); setUrl(''); } }); }}>
        <fieldset disabled={busy} className="grid min-w-0 gap-4 border-0 p-0 sm:grid-cols-2"><label className="grid gap-2 text-sm">{copy.material}<select aria-label={copy.material} className={control} value={sourceType} onChange={(event) => setSourceType(event.target.value as JournalSourceType)}>{sourceTypes.map(([key, label]) => <option key={key} value={key}>{en ? sourceTypeEn[key] : label}</option>)}</select></label><label className="grid gap-2 text-sm">{copy.title}<input className={control} value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} /></label><label className="grid gap-2 text-sm sm:col-span-2">{copy.url}<input type="url" className={control} value={url} placeholder="https://…" onChange={(event) => setUrl(event.target.value)} /></label></fieldset>
        <RightsFields idPrefix="new-source" sourceType={sourceType} value={draft} onChange={(value) => { if (value.active && !draft.active && !currentSource.artifactId && !url.trim()) setUrl(currentSource.url); setDraft(value); }} disabled={busy} />
        {bindingIssue ? <p role="alert" className="text-sm text-os-vermilion-ink">{bindingText}</p> : null}
        <button type="submit" className={`${control} justify-self-start`} disabled={busy || !!bindingIssue || draftIssues.length > 0}>{copy.saveNew}</button>
      </form></details> : <p className="text-sm text-os-muted-paper">{copy.reviewOnly}</p>}
    <details className="border-t border-os-rule-paper pt-5"><summary className="cursor-pointer text-lg">{en ? 'Permission history' : '授权变更记录'}</summary>{history.length ? history.map((entry) => <div className="border-b border-os-rule-paper py-3 text-sm" key={entry.id}><p>{entry.action === 'journal.source.add' ? (en ? 'Material added' : '登记来源与授权') : (en ? 'Permission updated' : '更新授权')} · {new Date(entry.createdAt).toLocaleString(en ? 'en' : 'zh-CN')}</p></div>) : <p className="text-sm text-os-muted-paper">{en ? 'No changes recorded.' : '暂无变更记录。'}</p>}</details>
    {busy || message ? <p role="status">{busy ? copy.saving : message}</p> : null}
  </div>;
}
