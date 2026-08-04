'use client';

import { useEffect, useReducer, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import EditorLayout from '../../../../components/editor/EditorLayout';
import OutlinePanel from '../../../../components/editor/OutlinePanel';
import CoreEditor from '../../../../components/editor/CoreEditor';
import SuggestionsPanel from '../../../../components/editor/SuggestionsPanel';
import ArtifactUploader from '../../../../components/editor/ArtifactUploader';
import {
  createCommit,
  getResearchObject,
  getVersionDiff,
  listVersions,
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
  demoSuggestions,
  suggestionReducer,
} from '../../../../lib/suggestions';

type FieldKey = keyof Omit<SdfCore, 'schemaVersion'>;

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
  const [activeField, setActiveField] = useState<FieldKey | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const [draftPrompt, setDraftPrompt] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitMsg, setCommitMsg] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 加载 RO + SDF + 版本
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const ro = await getResearchObject(roId);
        if (cancelled) return;
        setWorkspaceId(ro.researchObject.workspaceId);
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

  // 预置建议（Phase 1D extractor 接同通路）
  useEffect(() => {
    dispatchSuggestions({ type: 'reset' });
    for (const s of demoSuggestions(state.core)) dispatchSuggestions({ type: 'add', suggestion: s });
  }, []);

  function editField(field: FieldKey, value: string) {
    dispatch({ type: 'edit_field', field, value });
  }

  /** §5.4 MUST：建议确认 → 写入草稿（不直接写 SDF）。 */
  function applySuggestion(id: string) {
    dispatchSuggestions({ type: 'apply', id });
    const next = applySuggestionsToCore(state.core, suggestions.map((s) => (s.id === id ? { ...s, status: 'applied' as const } : s)));
    for (const [k, v] of Object.entries(next) as [FieldKey, string][]) {
      if (v !== state.core[k]) dispatch({ type: 'edit_field', field: k, value: v });
    }
  }

  function dismissSuggestion(id: string) {
    dispatchSuggestions({ type: 'dismiss', id });
  }

  /** 保存到 SDF（乐观锁，§16）。 */
  async function handleSave() {
    setSaving(true);
    setErrorMsg(null);
    try {
      await updateSdf(roId, state.version, state.core);
      dispatch({ type: 'saved' });
      clearDraft(roId);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
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

  return (
    <div>
      <div className="toolbar">
        <span className="toolbar-title">{t('title')}</span>
        <button className="btn" onClick={handleSave} disabled={saving || !state.dirty}>
          {saving ? t('common.saving') ?? '…' : t('saveToSdf')}
        </button>
        <input
          placeholder={t('commitMessage')}
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          style={{ width: 160, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
        />
        <button className="btn btn-primary" onClick={handleCommit} disabled={committing}>{t('commit')}</button>
      </div>

      {draftPrompt && (
        <div className="draft-banner">
          {t('draftFound')}
          <button className="btn" onClick={restoreDraft}>{t('restoreDraft')}</button>
          <button className="btn" onClick={discardDraft}>{t('discardDraft')}</button>
        </div>
      )}
      {errorMsg && (
        <div className="error-panel" role="alert">
          {errorMsg}
          <div className="error-actions">
            <button className="btn" onClick={() => setErrorMsg(null)}>{t('common.cancel')}</button>
          </div>
        </div>
      )}

      <EditorLayout
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
            <CoreEditor core={state.core} onEdit={editField} activeField={activeField} />
            <ArtifactUploader workspaceId={workspaceId} artifacts={artifacts} onArtifactsChange={setArtifacts} />
          </>
        }
        aside={
          <SuggestionsPanel
            suggestions={suggestions}
            onApply={applySuggestion}
            onDismiss={dismissSuggestion}
          />
        }
      />
    </div>
  );
}
