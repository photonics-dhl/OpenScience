'use client';

import Link from 'next/link';
import * as React from 'react';
import { SourceRightsFields, emptySourcePermissions, permittedSourcePermissions, sourceRightsIssues, type SourceRightsValue } from './SourceRightsFields';
import { useJournalMaterialsCopy } from './journal-materials-copy';
import { ApiClientError } from '@/lib/api';
import {
  addJournalArticleSource,
  getJournalArticle,
  getJournalArticleSources,
  getJournalDashboard,
  recalculateJournalProcessingCapability,
  updateJournalArticleSourceRights,
  type ArticleProcessingCapability,
  type JournalArticleSourceRecord,
  type JournalRightsStatus,
  type JournalSourceConfidence,
  type JournalSourceHistoryEntry,
  type JournalSourceType,
} from '@/lib/journal-api';

const inputClass = 'min-h-10 border border-os-rule-paper bg-transparent px-3';
const sourceTypes: Array<[JournalSourceType, string]> = [
  ['doi_metadata', 'DOI 元数据'], ['abstract', '摘要'], ['public_full_text', '公开全文'],
  ['publisher_full_text', '出版商全文'], ['editor_uploaded_pdf', '编辑上传 PDF'],
  ['author_material', '作者提供材料'], ['supplementary', '补充材料'], ['figure_asset', '图表素材'],
  ['parsed_text', '已解析文本'], ['ocr_visual_sidecar', 'OCR / 视觉辅助材料'], ['manual_note', '人工备注'],
];
const rightsStatuses: Array<[JournalRightsStatus, string]> = [
  ['unknown', '权限未知'], ['metadata_only_allowed', '仅允许元数据'], ['abstract_processing_allowed', '允许摘要加工'],
  ['internal_processing_only', '仅内部加工'], ['public_summary_allowed', '允许公开摘要/解读'],
  ['figure_reuse_allowed', '允许复用图表'], ['derivative_illustration_allowed', '允许衍生示意图'],
  ['full_public_processing_allowed', '允许完整公开加工'], ['restricted_blocked', '限制 / 阻断'],
];
const confidences: Array<[JournalSourceConfidence, string]> = [
  ['verified', '已核验'], ['editor_claimed', '编辑声明'], ['author_claimed', '作者声明'],
  ['publicly_accessible', '公开可访问'], ['machine_parsed_only', '仅机器解析'], ['conflict', '存在冲突'],
  ['expired', '已过期'], ['revoked', '已撤回'],
];
const permissionLabels = Object.keys(emptySourcePermissions()) as Array<keyof JournalArticleSourceRecord['permissions']>;

function toDateTimeLocal(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function toIsoDate(value: string) {
  return value ? new Date(value).toISOString() : undefined;
}

const permittedValues = permittedSourcePermissions;

function readSessionDraft<T>(key: string): T | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch { return null; }
}

function writeSessionDraft(key: string, value: unknown) {
  try { window.sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* Private browsing may disable storage. */ }
}

function CapabilitySummary({ capability }: { capability: ArticleProcessingCapability }) {
  const generated: Array<[string, boolean]> = [
    ['书目页', capability.canGenerateMetadataPage], ['摘要级解读', capability.canGenerateAbstractSummary],
    ['完整六字段草稿', capability.canGenerateFullSixFields], ['图义说明', capability.canGenerateFigureExplanation],
    ['可复现性字段', capability.canGenerateReproducibilityField], ['衍生示意图', capability.canGenerateDerivativeIllustration],
  ];
  const publicItems: Array<[string, boolean]> = [
    ['公开摘要', capability.canPublishPublicSummary], ['公开完整解读', capability.canPublishFullInterpretation],
    ['公开图表', capability.canPublishFigures], ['公开 API', capability.canExposeViaApi],
  ];
  return (
    <section className="border border-os-rule-paper p-4" aria-labelledby="capability-heading">
      <h2 id="capability-heading" className="text-xl font-normal">加工与公开范围</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div><h3 className="text-base font-normal">可生成</h3><ul className="mt-2 space-y-1 text-sm">{generated.map(([label, enabled]) => <li key={label}>{enabled ? '可生成' : '不可生成'}：{label}</li>)}</ul></div>
        <div><h3 className="text-base font-normal">可公开</h3><ul className="mt-2 space-y-1 text-sm">{publicItems.map(([label, enabled]) => <li key={label}>{enabled ? '可公开' : '不可公开'}：{label}</li>)}</ul></div>
      </div>
      {capability.limitations.length ? <p className="mt-3 text-sm text-os-muted-paper">限制：{capability.limitations.join('；')}</p> : null}
      {capability.blockingReasons.length ? <p className="mt-2 text-sm text-os-vermilion-ink">阻断原因：{capability.blockingReasons.join('；')}</p> : null}
      <p className="mt-3 text-xs text-os-muted-paper">最近评估：{new Date(capability.lastEvaluatedAt).toLocaleString('zh-CN')}</p>
    </section>
  );
}

function History({ entries }: { entries: JournalSourceHistoryEntry[] }) {
  return (
    <section className="border-t border-os-rule-paper pt-6" aria-labelledby="source-history-heading">
      <h2 id="source-history-heading" className="text-xl font-normal">授权变更记录</h2>
      {!entries.length ? <p className="mt-3 text-sm text-os-muted-paper">尚无授权变更记录。</p> : (
        <ol className="mt-3 grid gap-3">
          {entries.map((entry) => {
            const before = entry.after?.before;
            const after = entry.after?.after;
            const changes = after ? [
              before?.rightsStatus !== after.rightsStatus && `权限状态：${rightsStatuses.find(([value]) => value === after.rightsStatus)?.[1] ?? after.rightsStatus}`,
              before?.sourceConfidence !== after.sourceConfidence && `可信度：${confidences.find(([value]) => value === after.sourceConfidence)?.[1] ?? after.sourceConfidence}`,
              before?.evidence?.license !== after.evidence?.license && `许可：${after.evidence?.license || '未填写'}`,
              before?.evidence?.expiresAt !== after.evidence?.expiresAt && `到期时间：${after.evidence?.expiresAt ? new Date(after.evidence.expiresAt).toLocaleString('zh-CN') : '无'}`,
              before?.evidence?.statement !== after.evidence?.statement && '核验依据已更新',
              before?.activeForGeneration !== after.activeForGeneration && (after.activeForGeneration ? '已绑定为当前加工依据' : '已取消当前加工绑定'),
            ].filter(Boolean) as string[] : [];
            const typeLabel = entry.after?.sourceType
              ? sourceTypes.find(([value]) => value === entry.after?.sourceType)?.[1] ?? entry.after.sourceType
              : null;
            return (
              <li key={entry.id} className="border border-os-rule-paper p-3 text-sm">
                <p>{entry.action === 'journal.source.add' ? '添加来源材料' : '更新来源授权'} · {new Date(entry.createdAt).toLocaleString('zh-CN')}</p>
                {entry.actorId ? <p className="mt-1 text-xs text-os-muted-paper">操作者：{entry.actorId}</p> : null}
                {changes.length ? <p className="mt-2 text-os-muted-paper">{changes.join('；')}</p> : typeLabel ? <p className="mt-2 text-os-muted-paper">材料类型：{typeLabel}</p> : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export function JournalSourceRightsMatrix({ journalId, articleId }: { journalId: string; articleId: string }) {
  const t = useJournalMaterialsCopy();
  const [sources, setSources] = React.useState<JournalArticleSourceRecord[]>([]);
  const [history, setHistory] = React.useState<JournalSourceHistoryEntry[]>([]);
  const [capability, setCapability] = React.useState<ArticleProcessingCapability | null>(null);
  const [revision, setRevision] = React.useState<number | null>(null);
  const [title, setTitle] = React.useState('');
  const [currentSource, setCurrentSource] = React.useState<{ kind: 'metadata' | 'abstract' | 'fulltext'; url: string; artifactId?: string }>({ kind: 'metadata', url: '' });
  const [canEdit, setCanEdit] = React.useState(false);
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [form, setForm] = React.useState({
    sourceType: 'abstract' as JournalSourceType,
    title: '',
    url: '',
    rightsStatus: 'unknown' as JournalRightsStatus,
    sourceConfidence: 'editor_claimed' as JournalSourceConfidence,
    notes: '',
    evidence: '',
    license: '',
    expiresAt: '',
    activeForGeneration: false,
    permissions: emptySourcePermissions(),
  });
  const newDraftKey = `journal-materials:${journalId}:${articleId}:new`;
  const newDraftReady = React.useRef(false);
  React.useEffect(() => {
    const restored = readSessionDraft<typeof form>(newDraftKey);
    if (restored) setForm((current) => ({ ...current, ...restored }));
    newDraftReady.current = true;
  }, [newDraftKey]);
  React.useEffect(() => { if (newDraftReady.current) writeSessionDraft(newDraftKey, form); }, [form, newDraftKey]);

  const load = React.useCallback(async () => {
    try {
      const [matrix, article, dashboard] = await Promise.all([
        getJournalArticleSources(journalId, articleId),
        getJournalArticle(journalId, articleId),
        getJournalDashboard(journalId),
      ]);
      setSources(matrix.sources);
      setHistory(matrix.history);
      setCapability(matrix.capability);
      setRevision(matrix.articleRevision);
      setTitle(article.article.metadata.title);
      setCurrentSource(article.article.source as typeof currentSource);
      setCanEdit(dashboard.membership.role !== 'reviewer');
      setError('');
    } catch (cause) {
      setError(cause instanceof ApiClientError && cause.status === 403
        ? t.denied
        : cause instanceof Error ? cause.message : t.loadFailed);
    }
  }, [articleId, journalId, t]);

  React.useEffect(() => { void load(); }, [load]);

  async function addSource() {
    if (revision === null) return false;
    if (sourceRightsIssues(formToRights(form), form.sourceType, form.activeForGeneration).length || activeBindingIssue(form, currentSource)) return false;
    setBusy(true);
    setMessage('');
    try {
      await addJournalArticleSource(journalId, articleId, {
        revision,
        source: {
          sourceType: form.sourceType,
          title: form.title || undefined,
          url: form.url || undefined,
          ...(form.activeForGeneration && currentSource.artifactId ? { fileId: currentSource.artifactId } : {}),
          rightsStatus: form.rightsStatus,
          sourceConfidence: form.sourceConfidence,
          notes: form.notes || undefined,
          permissions: permittedValues(form.rightsStatus, form.permissions),
          evidence: {
            statement: form.evidence,
            license: form.license || undefined,
            expiresAt: toIsoDate(form.expiresAt),
          },
          activeForGeneration: form.activeForGeneration,
        },
      });
      await load();
      setForm({ sourceType: 'abstract', title: '', url: '', rightsStatus: 'unknown', sourceConfidence: 'editor_claimed', notes: '', evidence: '', license: '', expiresAt: '', activeForGeneration: false, permissions: emptySourcePermissions() });
      setMessage(t.added);
      return true;
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : t.addFailed);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function updateRights(source: JournalArticleSourceRecord, input: Omit<Parameters<typeof updateJournalArticleSourceRights>[3], 'revision'>) {
    if (revision === null) return false;
    setBusy(true);
    setMessage('');
    try {
      await updateJournalArticleSourceRights(journalId, articleId, source.id, { ...input, revision });
      await load();
      setMessage(t.saved);
      return true;
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : t.saveFailed);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function recalculate() {
    if (revision === null) return;
    setBusy(true);
    setMessage('');
    try {
      await recalculateJournalProcessingCapability(journalId, articleId, { revision });
      await load();
      setMessage('已根据当前来源与授权重新评估。');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '重新评估失败。');
    } finally {
      setBusy(false);
    }
  }

  if (error) return <section role="alert"><p>{error}</p><button className="border border-os-rule-paper px-3 py-2" onClick={() => void load()}>{t.retry}</button></section>;
  if (!capability) return <p aria-live="polite">{t.loading}</p>;

  return (
    <div className="grid gap-7">
      <header className="border-b border-os-rule-paper pb-5">
        <Link className="text-sm text-os-muted-paper" href={`/journals/manage/${journalId}/articles/${articleId}`}>← {t.back}</Link>
        <p className="mt-5 text-sm text-os-muted-paper">{t.page}</p>
        <h1 className="mt-2 text-3xl font-normal">{title}</h1>
        <p className="text-os-muted-paper">{t.intro}</p>
        {!canEdit ? <p className="mt-2 text-sm text-os-muted-paper">{t.reviewOnly}</p> : null}
      </header>
      <CapabilitySummary capability={capability} />
      <section aria-labelledby="source-list-heading">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="source-list-heading" className="text-xl font-normal">{t.list}</h2>
          {canEdit ? <button disabled={busy} className="border border-os-rule-paper px-3 py-2 text-sm disabled:opacity-50" onClick={() => void recalculate()}>重新评估范围</button> : null}
        </div>
        {!sources.length ? <p className="mt-4 text-os-muted-paper">{t.sourceEmpty}</p> : (
          <div className="mt-4 grid gap-4">{sources.map((source) => <SourceRow key={source.id} source={source} busy={busy} canEdit={canEdit} onSave={updateRights} />)}</div>
        )}
      </section>
      {canEdit ? <AddSourceForm form={form} currentSource={currentSource} busy={busy} setForm={setForm} onAdd={addSource} /> : null}
      <History entries={history} />
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}

type NewSourceForm = {
  sourceType: JournalSourceType;
  title: string;
  url: string;
  rightsStatus: JournalRightsStatus;
  sourceConfidence: JournalSourceConfidence;
  notes: string;
  evidence: string;
  license: string;
  expiresAt: string;
  activeForGeneration: boolean;
  permissions: JournalArticleSourceRecord['permissions'];
};

function formToRights(form: NewSourceForm | SourceDraft): SourceRightsValue {
  return { rightsStatus: form.rightsStatus, sourceConfidence: form.sourceConfidence, license: form.license, evidence: form.evidence, expiresAt: form.expiresAt, permissions: form.permissions };
}

function activeBindingIssue(form: NewSourceForm, currentSource: { kind: 'metadata' | 'abstract' | 'fulltext'; url: string; artifactId?: string }): 'activeSourceTypeIssue' | 'activeBindingIssue' | null {
  if (!form.activeForGeneration) return null;
  const fullTypes: JournalSourceType[] = ['public_full_text', 'publisher_full_text', 'editor_uploaded_pdf', 'author_material', 'parsed_text', 'ocr_visual_sidecar'];
  if (currentSource.kind === 'metadata' || currentSource.kind === 'abstract' && form.sourceType !== 'abstract' || currentSource.kind === 'fulltext' && !fullTypes.includes(form.sourceType)) return 'activeSourceTypeIssue';
  if (!currentSource.artifactId && (!currentSource.url || form.url !== currentSource.url)) return 'activeBindingIssue';
  return null;
}

function AddSourceForm({ form, currentSource, busy, setForm, onAdd }: {
  form: NewSourceForm;
  currentSource: { kind: 'metadata' | 'abstract' | 'fulltext'; url: string; artifactId?: string };
  busy: boolean;
  setForm: React.Dispatch<React.SetStateAction<NewSourceForm>>;
  onAdd: () => Promise<boolean>;
}) {
  const t = useJournalMaterialsCopy();
  const [feedback, setFeedback] = React.useState('');
  const issues = sourceRightsIssues(formToRights(form), form.sourceType, form.activeForGeneration);
  const bindingIssue = activeBindingIssue(form, currentSource);
  return (
    <section className="border-t border-os-rule-paper pt-6" aria-labelledby="add-source-heading">
      <h2 id="add-source-heading" className="text-xl font-normal">{t.add}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">{t.material}<select aria-label={t.material} className={inputClass} value={form.sourceType} onChange={(event) => setForm({ ...form, sourceType: event.target.value as JournalSourceType })}>{sourceTypes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label className="grid gap-1 text-sm">{t.title}<input className={inputClass} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        <label className="grid gap-1 text-sm">{t.url}<input type="url" className={inputClass} value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} /></label>
        <div className="sm:col-span-2"><SourceRightsFields idPrefix="new-source" sourceType={form.sourceType} activeForGeneration={form.activeForGeneration} value={formToRights(form)} onChange={(value) => setForm((current) => ({ ...current, ...value }))} /></div>
        <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={form.activeForGeneration} onChange={(event) => setForm({ ...form, activeForGeneration: event.target.checked, url: event.target.checked && !form.url && !currentSource.artifactId ? currentSource.url : form.url })} /><span>{t.active}<span className="mt-1 block text-os-muted-paper">{t.activeHelp}</span></span></label>
      </div>
      {bindingIssue ? <p className="mt-3 text-sm text-os-vermilion-ink" role="alert">{t[bindingIssue]}</p> : null}
      {form.activeForGeneration && form.permissions.internalProcessing ? <p className="mt-3 text-sm text-os-muted-paper">{t.parseStartHelp}</p> : null}
      <button disabled={busy || issues.length > 0 || Boolean(bindingIssue)} className="mt-4 border border-os-rule-paper px-4 py-2 text-sm disabled:opacity-50" onClick={async () => { setFeedback(''); setFeedback(await onAdd() ? t.added : t.addFailed); }}>{busy ? t.saving : t.saveNew}</button>
      {feedback ? <p className="mt-2 text-sm" role="status">{feedback}</p> : null}
    </section>
  );
}

type SourceDraft = {
  rightsStatus: JournalRightsStatus;
  sourceConfidence: JournalSourceConfidence;
  notes: string;
  evidence: string;
  license: string;
  expiresAt: string;
  permissions: JournalArticleSourceRecord['permissions'];
  activeForGeneration: boolean;
};

function draftFromSource(source: JournalArticleSourceRecord): SourceDraft {
  return {
    rightsStatus: source.rightsStatus,
    sourceConfidence: source.sourceConfidence,
    notes: source.evidence.statement || source.notes || '',
    evidence: source.evidence.statement || '',
    license: source.evidence.license ?? '',
    expiresAt: toDateTimeLocal(source.evidence.expiresAt),
    permissions: source.permissions,
    activeForGeneration: source.activeForGeneration,
  };
}

function SourceRow({ source, busy, canEdit, onSave }: {
  source: JournalArticleSourceRecord;
  busy: boolean;
  canEdit: boolean;
  onSave: (source: JournalArticleSourceRecord, input: Omit<Parameters<typeof updateJournalArticleSourceRights>[3], 'revision'>) => Promise<boolean>;
}) {
  const t = useJournalMaterialsCopy();
  const [draft, setDraft] = React.useState(() => draftFromSource(source));
  const [dirty, setDirty] = React.useState<Set<string>>(() => new Set());
  const [feedback, setFeedback] = React.useState('');
  const rowDraftKey = `journal-materials:${source.id}:rights`;
  const rowDraftReady = React.useRef(false);
  React.useEffect(() => {
    const restored = readSessionDraft<SourceDraft>(rowDraftKey);
    if (restored) {
      setDraft(restored);
      setDirty(new Set([...Object.keys(restored), ...permissionLabels.map((key) => `permission.${key}`)]));
    }
    rowDraftReady.current = true;
  }, [rowDraftKey]);
  React.useEffect(() => { if (rowDraftReady.current && dirty.size) writeSessionDraft(rowDraftKey, draft); }, [draft, dirty, rowDraftKey]);

  React.useEffect(() => {
    if (!dirty.size && readSessionDraft<SourceDraft>(rowDraftKey)) return;
    const next = draftFromSource(source);
    setDraft((current) => {
      const merged = {
        rightsStatus: dirty.has('rightsStatus') ? current.rightsStatus : next.rightsStatus,
        sourceConfidence: dirty.has('sourceConfidence') ? current.sourceConfidence : next.sourceConfidence,
        notes: dirty.has('notes') ? current.notes : next.notes,
        evidence: dirty.has('evidence') ? current.evidence : next.evidence,
        license: dirty.has('license') ? current.license : next.license,
        expiresAt: dirty.has('expiresAt') ? current.expiresAt : next.expiresAt,
        activeForGeneration: dirty.has('activeForGeneration') ? current.activeForGeneration : next.activeForGeneration,
        permissions: Object.fromEntries(permissionLabels.map((key) => [
        key,
        dirty.has(`permission.${key}`) ? current.permissions[key] : next.permissions[key],
        ])) as JournalArticleSourceRecord['permissions'],
      };
      return { ...merged, permissions: permittedValues(merged.rightsStatus, merged.permissions) };
    });
  }, [source, dirty, rowDraftKey]);

  function change<K extends keyof SourceDraft>(key: K, value: SourceDraft[K]) {
    setDirty((current) => new Set(current).add(key));
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (sourceRightsIssues(formToRights(draft), source.sourceType, draft.activeForGeneration).length) return;
    const saved = await onSave(source, {
      rightsStatus: draft.rightsStatus,
      sourceConfidence: draft.sourceConfidence,
      permissions: permittedValues(draft.rightsStatus, draft.permissions),
      evidence: {
        ...source.evidence,
        statement: draft.evidence,
        license: draft.license || undefined,
        expiresAt: toIsoDate(draft.expiresAt),
      },
      notes: draft.notes || undefined,
      activeForGeneration: draft.activeForGeneration,
    });
    setFeedback(saved ? t.saved : t.saveFailed);
    if (saved) {
      setDirty(new Set());
      try { window.sessionStorage.removeItem(rowDraftKey); } catch { /* Storage is optional. */ }
    }
  }

  return (
    <article className="border border-os-rule-paper p-4">
      <h3 className="text-lg font-normal">{source.title || sourceTypes.find(([type]) => type === source.sourceType)?.[1] || source.sourceType}</h3>
      <p className="text-sm text-os-muted-paper">{source.url ? <a className="underline" href={source.url} rel="noreferrer" target="_blank">查看来源</a> : '未提供来源链接'}{source.uploadedAt ? ` · 记录于 ${new Date(source.uploadedAt).toLocaleString('zh-CN')}` : ''}</p>
      <div className="mt-3"><SourceRightsFields idPrefix={`source-${source.id}`} disabled={!canEdit} sourceType={source.sourceType} activeForGeneration={draft.activeForGeneration} value={formToRights(draft)} onChange={(value) => { setDirty((current) => new Set([...current, ...Object.keys(value), ...permissionLabels.map((key) => `permission.${key}`)])); setDraft((current) => ({ ...current, ...value })); }} /></div>
      <label className="mt-3 flex items-start gap-2 text-sm"><input disabled={!canEdit} type="checkbox" checked={draft.activeForGeneration} onChange={(event) => change('activeForGeneration', event.target.checked)} /><span>{t.active}<span className="mt-1 block text-os-muted-paper">{t.activeHelp}</span></span></label>
      {draft.activeForGeneration && draft.permissions.internalProcessing ? <p className="mt-3 text-sm text-os-muted-paper">{t.parseStartHelp}</p> : null}
      {canEdit ? <button disabled={busy || sourceRightsIssues(formToRights(draft), source.sourceType, draft.activeForGeneration).length > 0} className="mt-3 border border-os-rule-paper px-3 py-2 text-sm disabled:opacity-50" onClick={() => void save()}>{busy ? t.saving : t.save}</button> : null}
      {feedback ? <p className="mt-2 text-sm" role="status">{feedback}</p> : null}
    </article>
  );
}
