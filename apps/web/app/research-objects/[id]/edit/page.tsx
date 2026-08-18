'use client';

import { useEffect, useReducer, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import EditorLayout from '../../../../components/editor/EditorLayout';
import OutlinePanel from '../../../../components/editor/OutlinePanel';
import CoreEditor from '../../../../components/editor/CoreEditor';
import SuggestionsPanel from '../../../../components/editor/SuggestionsPanel';
import ArtifactUploader from '../../../../components/editor/ArtifactUploader';
import { ObjectHeader } from '../../../../components/research/ObjectHeader';
import { HermesAnchor } from '../../../../components/hermes/HermesAnchor';
import { HermesDraftDiff, type HermesDraftTarget } from '../../../../components/hermes/HermesDraftDiff';
import {
  createCommit,
  getAgentTask,
  getResearchObject,
  getVersionDiff,
  listVersions,
  submitExtractTask,
  updateSdf,
  type ArtifactReference,
  type SdfCore,
} from '../../../../lib/api';
import {
  clearDraft,
  editorReducer,
  emptyCore,
  loadDraft,
  saveDraft,
  type EditorState,
} from '../../../../lib/editor-state';
import {
  applySuggestionsToCore,
  coreToSuggestions,
  extractMissingSdfFields,
  suggestionReducer,
  type SdfField,
} from '../../../../lib/suggestions';

type FieldKey = keyof Omit<SdfCore, 'schemaVersion'>;

const HERMES_DIFF_SIDES: Array<'left' | 'top'> = ['left', 'top'];

interface VersionRow {
  versionId: string;
  versionNo: number;
  status: string;
}

export default function EditorPage({ params }: { params: { id: string } }) {
  const t = useTranslations('editor');
  const roId = params.id;
  const [state, dispatch] = useReducer(editorReducer, { core: emptyCore(), version: 1, dirty: false, lastSavedAt: null } as EditorState);
  const [suggestions, dispatchSuggestions] = useReducer(suggestionReducer, []);
  const [artifacts, setArtifacts] = useState<ArtifactReference[]>([]);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [activeField, setActiveField] = useState<FieldKey | null>('problem');
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const [objectMeta, setObjectMeta] = useState<{ title: string; visibility: string }>({
    title: t('untitledObject'),
    visibility: 'private',
  });
  const [draftPrompt, setDraftPrompt] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [commitMsg, setCommitMsg] = useState('');
  // P1D-3：AI 提取状态（§5.4 + §18.3 进度可恢复）
  const [extracting, setExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState(0);
  const [missingFields, setMissingFields] = useState<SdfField[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // 加载 RO + SDF + 版本
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const ro = await getResearchObject(roId);
        if (cancelled) return;
        setWorkspaceId(ro.researchObject.workspaceId);
        setObjectMeta({ title: ro.researchObject.title, visibility: ro.researchObject.visibility });
        const core = ro.researchObject.sdf?.core ?? emptyCore();
        // 草稿恢复（§18.3）
        const draft = loadDraft(roId);
        if (draft && Date.now() - draft.savedAt < 24 * 3600 * 1000) {
          setDraftPrompt(true);
          dispatch({ type: 'init', core: draft.core, version: ro.researchObject.version });
        } else {
          dispatch({ type: 'init', core, version: ro.researchObject.version });
        }
        const vs = await listVersions(roId);
        if (!cancelled) setVersions(vs.versions ?? []);
      } catch (e) {
        if (!cancelled) setErrorMsg(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [roId]);

  // 自动保存草稿（§18.3，debounce 1s）
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (state.dirty) saveDraft(roId, state.core);
    }, 1000);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [state.core, state.dirty, roId]);

  // 卸载时清提取轮询（§18.3）
  useEffect(() => {
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  function editField(field: FieldKey, value: string) {
    dispatch({ type: 'edit_field', field, value });
  }

  /** §5.4 MUST：建议确认 → 写入草稿（不直接写 SDF）。 */
  function advanceReview(id: string, missing = missingFields) {
    const nextSuggestion = suggestions.find((item) => item.id !== id && item.status === 'pending');
    const nextField = nextSuggestion?.field ?? missing[0];
    if (nextField) setActiveField(nextField);
  }

  function applySuggestion(id: string, value: string) {
    const revised = suggestionReducer(suggestions, { type: 'revise', id, suggestion: value });
    const applied = suggestionReducer(revised, { type: 'apply', id });
    dispatchSuggestions({ type: 'revise', id, suggestion: value });
    dispatchSuggestions({ type: 'apply', id });
    const next = applySuggestionsToCore(state.core, applied);
    for (const [k, v] of Object.entries(next) as [FieldKey, string][]) {
      if (v !== state.core[k]) dispatch({ type: 'edit_field', field: k, value: v });
    }
    advanceReview(id);
  }

  function dismissSuggestion(id: string) {
    dispatchSuggestions({ type: 'dismiss', id });
    advanceReview(id);
  }

  function acknowledgeMissing(field: SdfField) {
    const remaining = missingFields.filter((candidate) => candidate !== field);
    setMissingFields(remaining);
    const nextSuggestion = suggestions.find((item) => item.status === 'pending');
    setActiveField(nextSuggestion?.field ?? remaining[0] ?? field);
  }

  /** P1D-3：AI 提取（§9.3 异步长任务 + §18.3 轮询进度）。提取只产出建议，不写 SDF（§9.2）。 */
  async function handleExtract() {
    setExtracting(true);
    setExtractProgress(0);
    setMissingFields([]);
    setErrorMsg(null);
    try {
      const { task } = await submitExtractTask(roId, Object.values(state.core).join('\n\n'));
      pollTimer.current = setInterval(async () => {
        try {
          const cur = await getAgentTask(roId, task.id);
          setExtractProgress(cur.task.progress ?? 0);
          if (cur.task.status === 'succeeded') {
            if (pollTimer.current) clearInterval(pollTimer.current);
            const core = cur.task.result?.core as SdfCore | undefined;
            setMissingFields(extractMissingSdfFields(cur.task.result));
            if (core) {
              dispatchSuggestions({ type: 'reset' });
              for (const s of coreToSuggestions(core, state.core)) dispatchSuggestions({ type: 'add', suggestion: s });
            }
            setExtracting(false);
          } else if (cur.task.status === 'failed') {
            if (pollTimer.current) clearInterval(pollTimer.current);
            setErrorMsg(cur.task.error ?? 'AI 提取失败');
            setExtracting(false);
          }
        } catch (e) {
          if (pollTimer.current) clearInterval(pollTimer.current);
          setErrorMsg(e instanceof Error ? e.message : String(e));
          setExtracting(false);
        }
      }, 1500);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setExtracting(false);
    }
  }

  /** 保存到 SDF（乐观锁，§16）。 */
  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setErrorMsg(null);
    try {
      await updateSdf(roId, state.version, state.core);
      dispatch({ type: 'saved' });
      clearDraft(roId);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setSaveError(message);
      setErrorMsg(message);
    } finally {
      setSaving(false);
    }
  }

  /** 创建提交（P1B-4，版本快照）。 */
  async function handleCommit() {
    setCommitting(true);
    setErrorMsg(null);
    try {
      await createCommit(roId, {
        message: commitMsg || `v${state.version}`,
        version: state.version,
        sdfCore: state.core,
        artifacts,
      });
      dispatch({ type: 'saved' });
      setCommitMsg('');
      const vs = await listVersions(roId);
      setVersions(vs.versions ?? []);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setCommitting(false);
    }
  }

  function restoreDraft() {
    setDraftPrompt(false);
  }

  function discardDraft() {
    clearDraft(roId);
    setDraftPrompt(false);
  }

  async function handleVersionSelect(versionId: string) {
    setErrorMsg(null);
    try {
      const latest = versions[0]?.versionId;
      if (latest && latest !== versionId) {
        const diff = await getVersionDiff(versionId, latest);
        void diff;
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  }

  const saveState = saveError ? 'error' : saving ? 'saving' : state.dirty ? 'dirty' : 'saved';
  const fieldForTarget: Record<HermesDraftTarget, FieldKey> = {
    'sdf-problem': 'problem',
    'sdf-insight': 'insight',
    'sdf-method': 'method',
    'sdf-evidence': 'reproducibility',
    'sdf-results': 'results',
    'sdf-limitations': 'limitations',
  };
  const revealDiff = (target: HermesDraftTarget) => {
    setActiveField(fieldForTarget[target]);
    document.querySelector('[data-hermes-anchor="hermes-diff"]')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  return (
    <EditorLayout
        objectId={roId}
        header={
          <ObjectHeader
            actions={
              <>
                <button aria-label={t('saveToSdf')} className="min-h-9 rounded-panel border border-os-rule-dark bg-transparent px-3 text-os-paper disabled:opacity-40" onClick={handleSave} disabled={saving || !state.dirty}>
                  <span className="hidden sm:inline">{saving ? t('common.saving') ?? '…' : t('saveToSdf')}</span><span className="sm:hidden">SDF</span>
                </button>
                <input
                  aria-label={t('commitMessage')}
                  className="h-9 w-20 min-w-0 border border-os-rule-dark bg-os-black-1 px-2 text-sm text-os-paper placeholder:text-os-muted-dark sm:w-40 sm:px-3"
                  data-reading-role="control"
                  placeholder={t('commitMessage')}
                  value={commitMsg}
                  onChange={(event) => setCommitMsg(event.target.value)}
                />
                <button className="min-h-9 rounded-panel border-0 bg-os-vermilion px-3 font-semibold text-os-black-0 disabled:opacity-40" onClick={handleCommit} disabled={committing}><span className="hidden sm:inline">{t('commit')}</span><span className="sm:hidden">{t('commitShort')}</span></button>
              </>
            }
            objectId={roId}
            saveState={saveState}
            title={objectMeta.title}
            version={state.version}
            visibility={objectMeta.visibility}
          />
        }
        outline={
          <OutlinePanel
            core={state.core}
            activeField={activeField}
            onSelectField={setActiveField}
            versions={versions}
            onSelectVersion={handleVersionSelect}
          />
        }
        main={
          <>
            <HermesDraftDiff
              disabled={extracting}
              onCheck={revealDiff}
              onDraft={(target) => { revealDiff(target); void handleExtract(); }}
            />
            {draftPrompt && (
              <div className="mb-5 flex flex-wrap items-center gap-3 border-y border-os-rule-dark py-3 text-sm text-os-paper">
                <span>{t('draftFound')}</span>
                <button className="min-h-9 rounded-panel border border-os-rule-dark bg-transparent px-3 text-os-paper" onClick={restoreDraft}>{t('restoreDraft')}</button>
                <button className="min-h-9 rounded-panel border border-os-rule-dark bg-transparent px-3 text-os-paper" onClick={discardDraft}>{t('discardDraft')}</button>
              </div>
            )}
            {errorMsg && (
              <div className="mb-5 flex items-center justify-between gap-4 border-l-2 border-os-vermilion py-2 pl-4 text-sm text-os-paper" role="alert">
                <span>{errorMsg}</span>
                <button className="min-h-9 rounded-panel border border-os-rule-dark bg-transparent px-3 text-os-paper" onClick={() => setErrorMsg(null)}>{t('common.cancel')}</button>
              </div>
            )}
            <CoreEditor core={state.core} onEdit={editField} activeField={activeField} onSelectField={setActiveField} />
            <ArtifactUploader workspaceId={workspaceId} artifacts={artifacts} onArtifactsChange={setArtifacts} />
          </>
        }
        aside={
          <HermesAnchor id="hermes-diff" sides={HERMES_DIFF_SIDES}>
            <SuggestionsPanel
              suggestions={suggestions}
              missingFields={missingFields}
              onAcknowledgeMissing={acknowledgeMissing}
              onApply={applySuggestion}
              onDismiss={dismissSuggestion}
              onExtract={handleExtract}
              extracting={extracting}
              extractProgress={extractProgress}
            />
          </HermesAnchor>
        }
      />
  );
}
