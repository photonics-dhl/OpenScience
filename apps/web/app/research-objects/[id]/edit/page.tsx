'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import EditorLayout from '../../../../components/editor/EditorLayout';
import OutlinePanel from '../../../../components/editor/OutlinePanel';
import CoreEditor from '../../../../components/editor/CoreEditor';
import SuggestionsPanel from '../../../../components/editor/SuggestionsPanel';
import ArtifactUploader from '../../../../components/editor/ArtifactUploader';
import ConflictResolutionPanel, { type EditorConflict } from '../../../../components/editor/ConflictResolutionPanel';
import { ObjectHeader } from '../../../../components/research/ObjectHeader';
import { HermesAnchor } from '../../../../components/hermes/HermesAnchor';
import { HermesAssistantDrawer } from '../../../../components/hermes/HermesAssistantDrawer';
import { HermesDockAnchor } from '../../../../components/hermes/HermesDockAnchor';
import { HermesDraftDiff, type HermesDraftTarget } from '../../../../components/hermes/HermesDraftDiff';
import { HermesExtractionEvidence } from '../../../../components/hermes/HermesExtractionEvidence';
import type { HermesGuideSuggestion } from '../../../../components/hermes/hermes-guide';
import { useOptionalHermesWorkspaceStage } from '../../../../components/hermes/HermesWorkspaceStage';
import {
  createCommit,
  ApiClientError,
  confirmIngestionTask,
  getAgentTask,
  getCurrentUser,
  getIngestionTask,
  getResearchObject,
  isConfirmedIngestionReanalysisSource,
  isRefreshableIngestionAnalysis,
  listVersions,
  reanalyzeConfirmedIngestion,
  retryAgentTask,
  refreshIngestionAnalysis,
  submitExtractTask,
  updateSdf,
  type ArtifactReference,
  type IngestionTaskDetail,
  type SdfCore,
} from '../../../../lib/api';
import {
  clearDraft,
  chooseConflictField,
  conflictChoicesComplete,
  createCoreConflict,
  editorReducer,
  emptyCore,
  loadDraft,
  saveDraft,
  resolveCoreConflict,
  resolveDraftChoice,
  type ConflictChoice,
  type DraftData,
  type EditorState,
} from '../../../../lib/editor-state';
import {
  clearExtractReviewState,
  loadExtractReviewState,
  saveExtractReviewState,
  type ExtractReviewCheckpoint,
} from '../../../../lib/extract-review-state';
import {
  applySuggestionsToCore,
  coreToSuggestions,
  extractMissingSdfFields,
  SDF_FIELDS,
  suggestionReducer,
  type SdfField,
} from '../../../../lib/suggestions';
import { loadResearchMaterials } from '../../../../lib/research-materials';
import {
  clearIngestionProposalDraft,
  getIngestionProposalStorage,
  loadIngestionProposalDraft,
  saveIngestionProposalDraft,
  type IngestionProposalScope,
} from '../../../../lib/ingestion-proposal-draft';
import type { Locale } from '../../../../i18n/locale';

type FieldKey = keyof Omit<SdfCore, 'schemaVersion'>;
type ActiveExtraction = Pick<ExtractReviewCheckpoint, 'idempotencyKey' | 'taskId' | 'retryAvailable' | 'dismissedFields' | 'acknowledgedMissingFields'> & {
  manuscriptText: string;
  sourceCore: SdfCore;
};
type IngestionProposal = { scope: IngestionProposalScope; detail: IngestionTaskDetail; core: SdfCore; baseCore: SdfCore; touched: SdfField[] };

const HERMES_DIFF_SIDES: Array<'left' | 'top'> = ['left', 'top'];
const aggregateCoreText = (core: SdfCore) => SDF_FIELDS.map((field) => core[field].trim()).filter(Boolean).join('\n\n');
interface VersionRow {
  versionId: string;
  versionNo: number;
  status: string;
}

type EditorPageProps = { params: { id: string }; searchParams?: { ingestionTask?: string | string[] } };

export default function EditorPage(props: EditorPageProps) {
  return <EditorWorkspace key={`${props.params.id}:${props.searchParams?.ingestionTask ?? ''}`} {...props} />;
}

function EditorWorkspace({ params, searchParams }: EditorPageProps) {
  const t = useTranslations('editor');
  const ingestionStatusT = useTranslations('ingestion.status');
  const locale = useLocale() as Locale;
  const roId = params.id;
  const router = useRouter();
  const ingestionTaskId = typeof searchParams?.ingestionTask === 'string' ? searchParams.ingestionTask : '';
  const editorSuggestion = useMemo<HermesGuideSuggestion>(() => ({
    bodyKey: 'guide.continue.body',
    href: `/research-objects/${encodeURIComponent(roId)}/edit`,
    kind: 'continue-research',
    researchObjectId: roId,
    titleKey: 'guide.continue.title',
  }), [roId]);
  const [state, dispatch] = useReducer(editorReducer, { core: emptyCore(), version: 1, dirty: false, lastSavedAt: null } as EditorState);
  const [suggestions, dispatchSuggestions] = useReducer(suggestionReducer, []);
  const [artifacts, setArtifacts] = useState<ArtifactReference[]>([]);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [ingestionTasks, setIngestionTasks] = useState<Awaited<ReturnType<typeof loadResearchMaterials>>['ingestion']['tasks']>([]);
  const [selectedIngestionTaskId, setSelectedIngestionTaskId] = useState(ingestionTaskId);
  const [ingestionProposal, setIngestionProposal] = useState<IngestionProposal | null>(null);
  const [ingestionLoading, setIngestionLoading] = useState(false);
  const [ingestionMessage, setIngestionMessage] = useState<string | null>(null);
  const [confirmingIngestion, setConfirmingIngestion] = useState(false);
  const [confirmationIntent, setConfirmationIntent] = useState<IngestionProposal | null>(null);
  const [confirmedIngestion, setConfirmedIngestion] = useState(false);
  const [refreshingLegacyIngestion, setRefreshingLegacyIngestion] = useState(false);
  const [reanalyzingConfirmedIngestion, setReanalyzingConfirmedIngestion] = useState(false);
  const [confirmedReanalysisSource, setConfirmedReanalysisSource] = useState<{ taskId: string; agentTaskId: string } | null>(null);
  const [activeField, setActiveField] = useState<FieldKey | null>('problem');
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const [objectMeta, setObjectMeta] = useState<{ title: string; visibility: string }>({
    title: t('untitledObject'),
    visibility: 'private',
  });
  const [draftPrompt, setDraftPrompt] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<DraftData | null>(null);
  const [conflict, setConflict] = useState<EditorConflict | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [commitMsg, setCommitMsg] = useState('');
  const [hermesOpen, setHermesOpen] = useState(false);
  // P1D-3：AI 提取状态（§5.4 + §18.3 进度可恢复）
  const [extracting, setExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState(0);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractionComplete, setExtractionComplete] = useState(false);
  const [missingFields, setMissingFields] = useState<SdfField[]>([]);
  const [editorLoaded, setEditorLoaded] = useState(false);
  const [activeExtraction, setActiveExtraction] = useState<ActiveExtraction | null>(null);
  const [recoverableExtraction, setRecoverableExtraction] = useState<ActiveExtraction | null>(null);
  const hermesStage = useOptionalHermesWorkspaceStage();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoredExtraction = useRef(false);
  const serverSnapshot = useRef<{ core: SdfCore; version: number } | null>(null);
  const latestCore = useRef(state.core);
  const latestArtifacts = useRef(artifacts);
  const mutationRequestInFlight = useRef(false);
  latestCore.current = state.core;
  latestArtifacts.current = artifacts;
  const protectedEditorDraftFields = useRef<Set<SdfField>>(new Set());
  const confirmedReanalysisIntent = useRef<{ sourceTaskId: string; sourceAgentTaskId: string; idempotencyKey: string } | null>(null);

  // 加载 RO + SDF + 版本
  useEffect(() => {
    let cancelled = false;
    setEditorLoaded(false);
    void (async () => {
      try {
        const ro = await getResearchObject(roId);
        if (cancelled) return;
        setWorkspaceId(ro.researchObject.workspaceId);
        setObjectMeta({ title: ro.researchObject.title, visibility: ro.researchObject.visibility });
        const core = ro.researchObject.sdf?.core ?? emptyCore();
        serverSnapshot.current = { core, version: ro.researchObject.version };
        dispatch({ type: 'init', core, version: ro.researchObject.version });
        // 草稿恢复（§18.3）
        const draft = loadDraft(roId);
        if (draft && Date.now() - draft.savedAt < 24 * 3600 * 1000) {
          protectedEditorDraftFields.current = new Set(SDF_FIELDS.filter((field) => draft.core[field] !== core[field]));
          setPendingDraft(draft);
          setDraftPrompt(true);
        } else {
          setPendingDraft(null);
          setDraftPrompt(false);
          protectedEditorDraftFields.current = new Set();
        }
        const restored = await loadResearchMaterials(roId);
        const vs = { versions: restored.versions };
        if (cancelled) return;
        latestArtifacts.current = restored.artifacts;
        setArtifacts(restored.artifacts);
        setIngestionTasks(restored.ingestion.tasks);
        if (!cancelled) {
          setVersions(vs.versions ?? []);
          setEditorLoaded(true);
        }
      } catch (e) {
        if (!cancelled) setErrorMsg(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [roId, ingestionTaskId, locale]);

  useEffect(() => { setSelectedIngestionTaskId(ingestionTaskId); }, [ingestionTaskId]);

  useEffect(() => {
    if (!editorLoaded || draftPrompt || !selectedIngestionTaskId) {
      setIngestionProposal(null);
      setConfirmedReanalysisSource(null);
      setIngestionLoading(false);
      return;
    }
    const summary = ingestionTasks.find((task) => task.id === selectedIngestionTaskId);
    if (!summary) {
      setIngestionMessage(t('ingestionScopeMismatch'));
      setIngestionProposal(null);
      setConfirmedReanalysisSource(null);
      return;
    }
    if (summary.confirmation) {
      setIngestionProposal(null);
      setConfirmedReanalysisSource(null);
      setIngestionLoading(true);
      let active = true;
      void getIngestionTask(summary.id).then((detail) => {
        if (!active) return;
        const eligible = detail.researchObjectId === roId && detail.task.id === summary.id
          && detail.task.artifactId === summary.artifactId && isConfirmedIngestionReanalysisSource(detail.task)
          && Boolean(detail.task.agentTaskId);
        setConfirmedReanalysisSource(eligible
          ? { taskId: detail.task.id, agentTaskId: detail.task.agentTaskId! }
          : null);
        setIngestionMessage(t('ingestionAlreadyConfirmed'));
      }).catch(() => {
        if (active) setIngestionMessage(t('ingestionAlreadyConfirmed'));
      }).finally(() => {
        if (active) setIngestionLoading(false);
      });
      return () => { active = false; };
    }
    setConfirmedReanalysisSource(null);
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setIngestionLoading(true);
    setIngestionMessage(null);
    const load = async () => {
      try {
        const [viewer, detail] = await Promise.all([getCurrentUser(), getIngestionTask(selectedIngestionTaskId)]);
        if (!active) return;
        if (detail.researchObjectId !== roId || detail.task.id !== summary.id || detail.task.artifactId !== summary.artifactId) {
          setIngestionMessage(t('ingestionScopeMismatch'));
          setIngestionProposal(null);
          return;
        }
        if (detail.version !== state.version) {
          setIngestionMessage(t('ingestionVersionChanged'));
          setIngestionProposal(null);
          return;
        }
        if (['queued', 'uploading', 'stored', 'parsing'].includes(detail.task.state)) {
          setIngestionMessage(t('ingestionProcessing', { file: detail.task.logicalPath }));
          timer = setTimeout(load, 1500);
          return;
        }
        if (detail.task.state !== 'needs_review') {
          setIngestionMessage(detail.task.error || t('ingestionUnavailable'));
          setIngestionProposal(null);
          return;
        }
        const proposed = detail.task.result?.core as Partial<SdfCore> | undefined;
        if (!proposed || SDF_FIELDS.some((field) => typeof proposed[field] !== 'string')) {
          setIngestionMessage(t('ingestionUnavailable'));
          setIngestionProposal(null);
          return;
        }
        const scope = { userId: viewer.userId, researchObjectId: roId, researchObjectVersion: detail.version, taskId: detail.task.id };
        const stored = loadIngestionProposalDraft(getIngestionProposalStorage(), scope);
        const seededCore = SDF_FIELDS.reduce<SdfCore>((next, field) => {
          next[field] = protectedEditorDraftFields.current.has(field) || state.core[field].trim() ? state.core[field] : proposed[field] ?? '';
          return next;
        }, { ...state.core });
        const core = stored ? SDF_FIELDS.reduce<SdfCore>((next, field) => {
          next[field] = stored.touched.includes(field) ? stored.core[field] : seededCore[field];
          return next;
        }, { ...seededCore }) : seededCore;
        setIngestionProposal({ scope, detail, core, baseCore: state.core, touched: stored?.touched ?? SDF_FIELDS.filter((field) => protectedEditorDraftFields.current.has(field) || Boolean(state.core[field].trim())) });
        setIngestionMessage(null);
      } catch (cause) {
        if (active) setIngestionMessage(cause instanceof Error ? cause.message : t('ingestionUnavailable'));
      } finally {
        if (active) setIngestionLoading(false);
      }
    };
    void load();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [draftPrompt, editorLoaded, ingestionTasks, roId, selectedIngestionTaskId, state.version, t]);

  function editIngestionProposal(field: SdfField, value: string) {
    setIngestionProposal((current) => {
      if (!current) return current;
      const next = { ...current, core: { ...current.core, [field]: value }, touched: [...new Set([...current.touched, field])] };
      saveIngestionProposalDraft(getIngestionProposalStorage(), next.scope, { core: next.core, touched: next.touched, savedAt: Date.now() });
      return next;
    });
  }

  async function confirmIngestionProposal() {
    if (!ingestionProposal || confirmingIngestion) return;
    const frozen = confirmationIntent ?? ingestionProposal;
    setConfirmationIntent(frozen);
    setConfirmingIngestion(true);
    setIngestionMessage(null);
    try {
      if (confirmationIntent) {
        const current = await loadResearchMaterials(roId);
        if (current.ingestion.tasks.find((task) => task.id === frozen.detail.task.id)?.confirmation) {
          const ro = await getResearchObject(roId);
          clearIngestionProposalDraft(getIngestionProposalStorage(), frozen.scope);
          setArtifacts(current.artifacts);
          setVersions(current.versions);
          setIngestionTasks(current.ingestion.tasks);
          dispatch({ type: 'init', core: ro.researchObject.sdf?.core ?? frozen.core, version: ro.researchObject.version });
          setIngestionProposal(null);
          setConfirmationIntent(null);
          setConfirmedIngestion(true);
          setIngestionMessage(t('ingestionConfirmed'));
          return;
        }
      }
      await confirmIngestionTask(frozen.detail.task.id, { version: frozen.detail.version, core: frozen.core });
      clearIngestionProposalDraft(getIngestionProposalStorage(), frozen.scope);
      const [restored, ro] = await Promise.all([loadResearchMaterials(roId), getResearchObject(roId)]);
      setArtifacts(restored.artifacts);
      setVersions(restored.versions);
      setIngestionTasks(restored.ingestion.tasks);
      dispatch({ type: 'init', core: ro.researchObject.sdf?.core ?? frozen.core, version: ro.researchObject.version });
      clearDraft(roId);
      setIngestionProposal(null);
      setConfirmationIntent(null);
      setConfirmedIngestion(true);
      setIngestionMessage(t('ingestionConfirmed'));
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.status === 409) {
        try {
          const [restored, ro, detail] = await Promise.all([loadResearchMaterials(roId), getResearchObject(roId), getIngestionTask(frozen.detail.task.id)]);
          const currentCore = ro.researchObject.sdf?.core ?? emptyCore();
          const conflictingFields = SDF_FIELDS.filter((field) => currentCore[field] !== frozen.baseCore[field] && frozen.core[field] !== frozen.baseCore[field]);
          const rebasedCore = SDF_FIELDS.reduce<SdfCore>((next, field) => {
            const serverChanged = currentCore[field] !== frozen.baseCore[field];
            const reviewerChanged = frozen.core[field] !== frozen.baseCore[field];
            next[field] = serverChanged && !reviewerChanged ? currentCore[field] : frozen.core[field];
            return next;
          }, { ...currentCore });
          const rebasedTouched = [...new Set([
            ...frozen.touched,
            ...SDF_FIELDS.filter((field) => currentCore[field] !== frozen.baseCore[field]),
          ])];
          const nextScope = { ...frozen.scope, researchObjectVersion: ro.researchObject.version };
          clearIngestionProposalDraft(getIngestionProposalStorage(), frozen.scope);
          saveIngestionProposalDraft(getIngestionProposalStorage(), nextScope, { core: rebasedCore, touched: rebasedTouched, savedAt: Date.now() });
          setArtifacts(restored.artifacts);
          setVersions(restored.versions);
          setIngestionTasks(restored.ingestion.tasks);
          dispatch({ type: 'init', core: currentCore, version: ro.researchObject.version });
          setIngestionProposal({ ...frozen, scope: nextScope, detail: { ...detail, version: ro.researchObject.version }, core: rebasedCore, baseCore: currentCore, touched: rebasedTouched });
          setConfirmationIntent(null);
          setIngestionMessage(conflictingFields.length
            ? t('ingestionRebasedConflicts', { fields: conflictingFields.map((field) => t(field)).join('、') })
            : t('ingestionRebased'));
          return;
        } catch { /* Fall through to read-only confirmation reconciliation. */ }
      }
      // A lost response may follow a successful server confirmation. Reconcile read-only before offering another write.
      try {
        const restored = await loadResearchMaterials(roId);
        const confirmed = restored.ingestion.tasks.find((task) => task.id === frozen.detail.task.id)?.confirmation;
        if (confirmed) {
          const ro = await getResearchObject(roId);
          clearIngestionProposalDraft(getIngestionProposalStorage(), frozen.scope);
          setArtifacts(restored.artifacts);
          setVersions(restored.versions);
          setIngestionTasks(restored.ingestion.tasks);
          dispatch({ type: 'init', core: ro.researchObject.sdf?.core ?? frozen.core, version: ro.researchObject.version });
          setIngestionProposal(null);
          setConfirmationIntent(null);
          setConfirmedIngestion(true);
          setIngestionMessage(t('ingestionConfirmed'));
          return;
        }
      } catch { /* Keep the frozen local proposal available for an explicit retry. */ }
      if (cause instanceof ApiClientError && cause.status > 0 && cause.status < 500) setConfirmationIntent(null);
      setIngestionMessage(cause instanceof Error ? cause.message : t('ingestionConfirmFailed'));
    } finally {
      setConfirmingIngestion(false);
    }
  }

  async function refreshLegacyProposal() {
    if (!ingestionProposal?.detail.task.agentTaskId || refreshingLegacyIngestion || !isRefreshableIngestionAnalysis(ingestionProposal.detail.task)) return;
    setRefreshingLegacyIngestion(true);
    setIngestionMessage(null);
    try {
      const task = await refreshIngestionAnalysis(ingestionProposal.detail.task.id, ingestionProposal.detail.task.agentTaskId);
      setIngestionProposal(null);
      setConfirmationIntent(null);
      setIngestionTasks((current) => current.map((candidate) => candidate.id === task.id ? { ...task, confirmation: null } : candidate));
      setIngestionMessage(t('legacyRefreshStarted'));
    } catch {
      try {
        const detail = await getIngestionTask(ingestionProposal.detail.task.id);
        if (detail.task.agentTaskId && detail.task.agentTaskId !== ingestionProposal.detail.task.agentTaskId) {
          setIngestionProposal(null);
          setConfirmationIntent(null);
          setIngestionTasks((current) => current.map((candidate) => candidate.id === detail.task.id ? { ...detail.task, confirmation: null } : candidate));
          setIngestionMessage(t('legacyRefreshStarted'));
          return;
        }
      } catch { /* Keep the same task selected so the user can reconcile it again. */ }
      setIngestionMessage(t('legacyRefreshUncertain'));
    } finally {
      setRefreshingLegacyIngestion(false);
    }
  }

  async function createConfirmedReanalysisDraft() {
    const source = ingestionTasks.find((task) => task.id === selectedIngestionTaskId);
    if (!source?.confirmation || confirmedReanalysisSource?.taskId !== source.id || reanalyzingConfirmedIngestion) return;
    const sourceAgentTaskId = confirmedReanalysisSource.agentTaskId;
    const storageKey = `openscience:ingestion-reanalysis:${roId}:${source.id}:${sourceAgentTaskId}`;
    const storedIdempotencyKey = window.localStorage.getItem(storageKey);
    const intent = confirmedReanalysisIntent.current?.sourceTaskId === source.id
      && confirmedReanalysisIntent.current.sourceAgentTaskId === sourceAgentTaskId
      ? confirmedReanalysisIntent.current
      : { sourceTaskId: source.id, sourceAgentTaskId, idempotencyKey: storedIdempotencyKey || crypto.randomUUID() };
    confirmedReanalysisIntent.current = intent;
    window.localStorage.setItem(storageKey, intent.idempotencyKey);
    setReanalyzingConfirmedIngestion(true);
    setIngestionMessage(null);
    try {
      const task = await reanalyzeConfirmedIngestion(intent.sourceTaskId, intent.sourceAgentTaskId, intent.idempotencyKey);
      confirmedReanalysisIntent.current = null;
      window.localStorage.removeItem(storageKey);
      setIngestionTasks((current) => [...current.filter((candidate) => candidate.id !== task.id), { ...task, confirmation: null }]);
      setSelectedIngestionTaskId(task.id);
      setConfirmedIngestion(false);
      setConfirmedReanalysisSource(null);
      setIngestionMessage(t('confirmedReanalysisStarted'));
      window.history.replaceState(
        window.history.state,
        '',
        `/research-objects/${encodeURIComponent(roId)}/edit?ingestionTask=${encodeURIComponent(task.id)}`,
      );
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.status > 0 && cause.status < 500
        && cause.status !== 408 && cause.status !== 429) {
        confirmedReanalysisIntent.current = null;
        window.localStorage.removeItem(storageKey);
        setIngestionMessage(cause.message);
      } else {
        setIngestionMessage(t('confirmedReanalysisUncertain'));
      }
    } finally {
      setReanalyzingConfirmedIngestion(false);
    }
  }

  // 自动保存草稿（§18.3，debounce 1s）
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (state.dirty) saveDraft(roId, state.core);
    }, 1000);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [state.core, state.dirty, roId]);

  // 刷新后恢复同一个已计费任务或尚未完成的逐字段 review。
  useEffect(() => {
    if (!editorLoaded || restoredExtraction.current) return;
    restoredExtraction.current = true;
    const checkpoint = loadExtractReviewState(window.localStorage, roId);
    if (!checkpoint) return;
    const manuscriptText = aggregateCoreText(state.core);
    if (!checkpoint.taskId && !manuscriptText) {
      clearExtractReviewState(window.localStorage, roId);
      setExtractError(t('extractNeedsContent'));
      return;
    }
    setExtracting(true);
    setActiveExtraction({
      idempotencyKey: checkpoint.idempotencyKey,
      taskId: checkpoint.taskId,
      retryAvailable: checkpoint.retryAvailable,
      dismissedFields: checkpoint.dismissedFields,
      acknowledgedMissingFields: checkpoint.acknowledgedMissingFields,
      manuscriptText,
      sourceCore: state.core,
    });
  }, [editorLoaded, roId, state.core, t]);

  // 单一串行轮询 owner：每次 await 完成后才安排下一次，避免重叠 GET 与重复完成回调。
  useEffect(() => {
    if (!activeExtraction) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const persist = (run: typeof activeExtraction) => {
      saveExtractReviewState(window.localStorage, roId, {
        version: 1,
        idempotencyKey: run.idempotencyKey,
        taskId: run.taskId,
        retryAvailable: run.retryAvailable,
        dismissedFields: run.dismissedFields,
        acknowledgedMissingFields: run.acknowledgedMissingFields,
        updatedAt: Date.now(),
      });
    };
    const poll = async () => {
      try {
        if (!activeExtraction.taskId) {
          const { task } = await submitExtractTask(
            roId,
            activeExtraction.manuscriptText,
            activeExtraction.idempotencyKey,
          );
          if (cancelled) return;
          const next = { ...activeExtraction, taskId: task.id };
          persist(next);
          setActiveExtraction(next);
          return;
        }
        const cur = await getAgentTask(roId, activeExtraction.taskId);
        if (cancelled) return;
        setExtractProgress(cur.task.progress ?? 0);
        if (cur.task.status === 'succeeded') {
          const core = cur.task.result?.core as SdfCore | undefined;
          const nextMissing = extractMissingSdfFields(cur.task.result).filter((field) => !activeExtraction.acknowledgedMissingFields.includes(field));
          const evidence = cur.task.result?.evidence as Partial<Record<SdfField, { quote: string; locator: string }>> | undefined;
          const nextSuggestions = core
            ? coreToSuggestions(core, activeExtraction.sourceCore, evidence, cur.task.result).filter((item) => !activeExtraction.dismissedFields.includes(item.field))
            : [];
          dispatchSuggestions({ type: 'reset' });
          for (const suggestion of nextSuggestions) dispatchSuggestions({ type: 'add', suggestion });
          setMissingFields(nextMissing);
          setExtractionComplete(true);
          setExtractError(null);
          setActiveField(nextSuggestions[0]?.field ?? nextMissing[0] ?? 'problem');
          if (nextSuggestions.length === 0 && nextMissing.length === 0) clearExtractReviewState(window.localStorage, roId);
          else persist(activeExtraction);
          setRecoverableExtraction(null);
          setActiveExtraction(null);
          setExtracting(false);
          return;
        }
        if (cur.task.status === 'failed') {
          const paused = { ...activeExtraction, retryAvailable: cur.task.retryCount < 1 };
          persist(paused);
          setRecoverableExtraction(paused);
          setActiveExtraction(null);
          setErrorMsg(cur.task.error ?? 'AI 提取失败');
          setExtractError(cur.task.error ?? t('extractFailed'));
          setExtracting(false);
          return;
        }
        timer = setTimeout(() => { void poll(); }, 1500);
      } catch (error) {
        if (cancelled) return;
        setErrorMsg(error instanceof Error ? error.message : String(error));
        setExtractError(error instanceof Error ? error.message : t('extractFailed'));
        setRecoverableExtraction(activeExtraction);
        setActiveExtraction(null);
        setExtracting(false);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeExtraction, roId, t]);

  const hermesRouteState = extracting
    ? 'scanning'
    : suggestions.some((suggestion) => suggestion.status === 'pending') || missingFields.length > 0
      ? 'awaiting_approval'
      : 'idle';
  useEffect(() => {
    hermesStage?.setRouteState(hermesRouteState);
  }, [hermesRouteState, hermesStage]);
  useEffect(() => () => hermesStage?.setRouteState('idle'), [hermesStage]);

  function editField(field: FieldKey, value: string) {
    if (interactionBlocked || mutationRequestInFlight.current) return;
    latestCore.current = { ...latestCore.current, [field]: value };
    dispatch({ type: 'edit_field', field, value });
  }

  /** §5.4 MUST：建议确认 → 写入草稿（不直接写 SDF）。 */
  function advanceReview(id: string, missing = missingFields) {
    const nextSuggestion = suggestions.find((item) => item.id !== id && item.status === 'pending');
    const nextField = nextSuggestion?.field ?? missing[0];
    if (nextField) setActiveField(nextField);
  }

  function persistReview(update: (checkpoint: ExtractReviewCheckpoint) => ExtractReviewCheckpoint) {
    const checkpoint = loadExtractReviewState(window.localStorage, roId);
    if (!checkpoint) return;
    saveExtractReviewState(window.localStorage, roId, update({ ...checkpoint, updatedAt: Date.now() }));
  }

  function applySuggestion(id: string, value: string) {
    if (interactionBlocked || mutationRequestInFlight.current) return;
    const revised = suggestionReducer(suggestions, { type: 'revise', id, suggestion: value });
    const applied = suggestionReducer(revised, { type: 'apply', id });
    dispatchSuggestions({ type: 'revise', id, suggestion: value });
    dispatchSuggestions({ type: 'apply', id });
    const currentCore = latestCore.current;
    const next = applySuggestionsToCore(currentCore, applied);
    for (const [k, v] of Object.entries(next) as [FieldKey, string][]) {
      if (v !== currentCore[k]) dispatch({ type: 'edit_field', field: k, value: v });
    }
    latestCore.current = next;
    saveDraft(roId, next);
    advanceReview(id);
  }

  function dismissSuggestion(id: string) {
    if (interactionBlocked || mutationRequestInFlight.current) return;
    const dismissed = suggestionReducer(suggestions, { type: 'dismiss', id });
    dispatchSuggestions({ type: 'dismiss', id });
    const field = dismissed.find((item) => item.id === id)?.field;
    if (field) persistReview((checkpoint) => ({
      ...checkpoint,
      dismissedFields: [...new Set([...checkpoint.dismissedFields, field])],
    }));
    advanceReview(id);
  }

  function acknowledgeMissing(field: SdfField) {
    if (interactionBlocked || mutationRequestInFlight.current) return;
    const remaining = missingFields.filter((candidate) => candidate !== field);
    setMissingFields(remaining);
    persistReview((checkpoint) => ({
      ...checkpoint,
      acknowledgedMissingFields: [...new Set([...checkpoint.acknowledgedMissingFields, field])],
    }));
    const nextSuggestion = suggestions.find((item) => item.status === 'pending');
    setActiveField(nextSuggestion?.field ?? remaining[0] ?? field);
  }

  function artifactsEqual(left: ArtifactReference[], right: ArtifactReference[]) {
    const normalized = (items: ArtifactReference[]) => [...items]
      .sort((a, b) => a.logicalPath.localeCompare(b.logicalPath) || a.artifactId.localeCompare(b.artifactId));
    return JSON.stringify(normalized(left)) === JSON.stringify(normalized(right));
  }

  function updateArtifacts(next: ArtifactReference[]) {
    // A previously started upload may finish while Save/Commit is in flight.
    // Keep the ref current so a later 409 captures that artifact as local input.
    latestArtifacts.current = next;
    setArtifacts(next);
    setConflict((current) => current?.operation === 'commit' ? {
      ...current,
      localArtifacts: next,
      artifactsDiffer: !artifactsEqual(next, current.serverArtifacts),
      artifactChoice: undefined,
    } : current);
  }

  async function captureConflict(operation: 'save' | 'commit') {
    const latest = await getResearchObject(roId);
    const serverCore = latest.researchObject.sdf?.core ?? emptyCore();
    const serverArtifacts = operation === 'commit' ? (await loadResearchMaterials(roId)).artifacts : latestArtifacts.current;
    const localCore = latestCore.current;
    const localArtifacts = latestArtifacts.current;
    setConflict({
      ...createCoreConflict(localCore, serverCore, latest.researchObject.version),
      operation,
      localArtifacts,
      serverArtifacts,
      artifactsDiffer: operation === 'commit' && !artifactsEqual(localArtifacts, serverArtifacts),
    });
    setSaveError(null);
    setErrorMsg(null);
  }

  function isConcurrentUpdate(error: unknown): error is ApiClientError {
    return error instanceof ApiClientError && (error.status === 409 || error.code === 'CONCURRENT_UPDATE');
  }

  function chooseConflict(field: string, choice: ConflictChoice) {
    setConflict((current) => current ? { ...current, ...chooseConflictField(current, field, choice) } : current);
  }

  function resolveConflict() {
    if (!conflict) return;
    const resolved = resolveCoreConflict(conflict);
    if (!resolved || (conflict.artifactsDiffer && !conflict.artifactChoice)) return;
    const nextArtifacts = conflict.operation === 'commit' && conflict.artifactsDiffer
      ? (conflict.artifactChoice === 'mine' ? conflict.localArtifacts : conflict.serverArtifacts)
      : artifacts;
    latestCore.current = resolved.core;
    latestArtifacts.current = nextArtifacts;
    dispatch({ type: 'replace', ...resolved });
    setArtifacts(nextArtifacts);
    serverSnapshot.current = { core: conflict.serverCore, version: conflict.serverVersion };
    if (resolved.dirty) saveDraft(roId, resolved.core);
    else clearDraft(roId);
    setConflict(null);
    setSaveError(null);
    setErrorMsg(null);
  }

  const conflictReady = !!conflict && conflictChoicesComplete(conflict)
    && (!conflict.artifactsDiffer || !!conflict.artifactChoice);

  /** P1D-3：AI 提取（§9.3 异步长任务 + §18.3 轮询进度）。提取只产出建议，不写 SDF（§9.2）。 */
  async function handleExtract() {
    if (interactionBlocked || mutationRequestInFlight.current) return;
    const manuscriptText = aggregateCoreText(state.core);
    const checkpoint = loadExtractReviewState(window.localStorage, roId);
    const recovery = recoverableExtraction;
    const existingTaskId = recovery?.taskId ?? checkpoint?.taskId;
    const existingRetryAvailable = recovery?.retryAvailable ?? checkpoint?.retryAvailable ?? false;
    if ((!existingTaskId || existingRetryAvailable) && !manuscriptText) {
      setExtractError(t('extractNeedsContent'));
      setExtractionComplete(false);
      return;
    }
    setExtracting(true);
    setExtractProgress(0);
    setMissingFields([]);
    setErrorMsg(null);
    setExtractError(null);
    setExtractionComplete(false);
    let taskId = recovery?.taskId ?? checkpoint?.taskId;
    const retryAvailable = recovery?.retryAvailable ?? checkpoint?.retryAvailable ?? false;
    if (retryAvailable && taskId) {
      try {
        const retried = await retryAgentTask(taskId);
        taskId = retried.task.id;
      } catch (error) {
        setErrorMsg(error instanceof Error ? error.message : String(error));
        setExtractError(error instanceof Error ? error.message : t('extractFailed'));
        const resumed: ActiveExtraction = recovery ?? {
          idempotencyKey: checkpoint?.idempotencyKey ?? crypto.randomUUID(),
          taskId,
          retryAvailable: false,
          dismissedFields: checkpoint?.dismissedFields ?? [],
          acknowledgedMissingFields: checkpoint?.acknowledgedMissingFields ?? [],
          manuscriptText,
          sourceCore: state.core,
        };
        setRecoverableExtraction(null);
        setActiveExtraction({ ...resumed, retryAvailable: false });
        return;
      }
    }
    const run: ActiveExtraction = recovery ? {
      ...recovery,
      taskId,
      retryAvailable: false,
    } : {
      idempotencyKey: checkpoint?.idempotencyKey ?? crypto.randomUUID(),
      taskId,
      retryAvailable: false,
      dismissedFields: checkpoint?.dismissedFields ?? [],
      acknowledgedMissingFields: checkpoint?.acknowledgedMissingFields ?? [],
      manuscriptText,
      sourceCore: state.core,
    };
    saveExtractReviewState(window.localStorage, roId, {
      version: 1,
      idempotencyKey: run.idempotencyKey,
      taskId: run.taskId,
      retryAvailable: run.retryAvailable,
      dismissedFields: run.dismissedFields,
      acknowledgedMissingFields: run.acknowledgedMissingFields,
      updatedAt: Date.now(),
    });
    setRecoverableExtraction(null);
    setActiveExtraction(run);
  }

  /** 保存到 SDF（乐观锁，§16）。 */
  async function handleSave() {
    if (interactionBlocked || mutationRequestInFlight.current) return;
    mutationRequestInFlight.current = true;
    setSaving(true);
    setSaveError(null);
    setErrorMsg(null);
    try {
      await updateSdf(roId, state.version, state.core);
      dispatch({ type: 'saved', version: state.version + 1 });
      serverSnapshot.current = { core: state.core, version: state.version + 1 };
      clearDraft(roId);
      if (!suggestions.some((item) => item.status === 'pending') && missingFields.length === 0) {
        clearExtractReviewState(window.localStorage, roId);
      }
    } catch (e) {
      if (isConcurrentUpdate(e)) {
        try { await captureConflict('save'); } catch (refreshError) {
          const message = refreshError instanceof Error ? refreshError.message : String(refreshError);
          setSaveError(message);
          setErrorMsg(message);
        }
        return;
      }
      const message = e instanceof Error ? e.message : String(e);
      setSaveError(message);
      setErrorMsg(message);
    } finally {
      mutationRequestInFlight.current = false;
      setSaving(false);
    }
  }

  /** 创建提交（P1B-4，版本快照）。 */
  async function handleCommit() {
    if (interactionBlocked || mutationRequestInFlight.current) return;
    mutationRequestInFlight.current = true;
    setCommitting(true);
    setErrorMsg(null);
    try {
      await createCommit(roId, {
        message: commitMsg || t('draftRevision', { version: state.version }),
        version: state.version,
        sdfCore: state.core,
        artifacts,
      });
      dispatch({ type: 'saved', version: state.version + 1 });
      serverSnapshot.current = { core: state.core, version: state.version + 1 };
      clearDraft(roId);
      if (!suggestions.some((item) => item.status === 'pending') && missingFields.length === 0) {
        clearExtractReviewState(window.localStorage, roId);
      }
      setCommitMsg('');
      const vs = await listVersions(roId);
      setVersions(vs.versions ?? []);
    } catch (e) {
      if (isConcurrentUpdate(e)) {
        try { await captureConflict('commit'); } catch (refreshError) {
          setErrorMsg(refreshError instanceof Error ? refreshError.message : String(refreshError));
        }
        return;
      }
      setErrorMsg(e instanceof Error ? e.message : String(e));
    } finally {
      mutationRequestInFlight.current = false;
      setCommitting(false);
    }
  }

  function restoreDraft() {
    const server = serverSnapshot.current;
    if (pendingDraft && server) {
      const restored = resolveDraftChoice(server, pendingDraft, 'restore');
      latestCore.current = restored.core;
      dispatch({ type: 'replace', ...restored });
    }
    setPendingDraft(null);
    setDraftPrompt(false);
  }

  function discardDraft() {
    clearDraft(roId);
    const server = serverSnapshot.current;
    if (server && pendingDraft) {
      const discarded = resolveDraftChoice(server, pendingDraft, 'discard');
      latestCore.current = discarded.core;
      dispatch({ type: 'replace', ...discarded });
    }
    setPendingDraft(null);
    protectedEditorDraftFields.current = new Set();
    setDraftPrompt(false);
  }

  function handleVersionSelect(versionId: string) {
    router.push(`/research-objects/${encodeURIComponent(roId)}/versions?version=${encodeURIComponent(versionId)}`);
  }

  const saveState = saveError ? 'error' : saving ? 'saving' : state.dirty ? 'dirty' : 'saved';
  const interactionBlocked = draftPrompt || !!conflict || saving || committing;
  const selectedIngestionTask = ingestionTasks.find((task) => task.id === selectedIngestionTaskId);
  const ingestionReviewActive = Boolean(selectedIngestionTask && !selectedIngestionTask.confirmation);
  const ingestionProposalHasContent = Boolean(ingestionProposal && SDF_FIELDS.some((field) => ingestionProposal.core[field].trim()));
  const showIngestionRecoveryLink = Boolean(selectedIngestionTask && (
    selectedIngestionTask.state === 'failed_retryable'
    || selectedIngestionTask.state === 'failed_blocked'
    || (!ingestionLoading && !ingestionProposal && !selectedIngestionTask.confirmation && Boolean(ingestionMessage))
    || (ingestionProposal && !ingestionProposalHasContent)
  ));
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
                <button aria-label={t('saveToSdf')} className="min-h-9 rounded-panel border border-os-rule-dark bg-transparent px-3 text-os-paper disabled:opacity-40" onClick={handleSave} disabled={saving || committing || !state.dirty || !editorLoaded || interactionBlocked || ingestionReviewActive}>
                  <span className="hidden sm:inline">{saving ? t('common.saving') ?? '…' : t('saveToSdf')}</span><span className="sm:hidden">SDF</span>
                </button>
                <input
                  aria-label={t('commitMessage')}
                  disabled={!editorLoaded || committing || interactionBlocked}
                  className="h-9 w-20 min-w-0 border border-os-rule-dark bg-os-black-1 px-2 text-sm text-os-paper placeholder:text-os-muted-dark sm:w-40 sm:px-3"
                  data-reading-role="control"
                  placeholder={t('commitMessage')}
                  value={commitMsg}
                  onChange={(event) => setCommitMsg(event.target.value)}
                />
                <button className="min-h-9 rounded-panel border-0 bg-os-vermilion px-3 font-semibold text-os-black-0 disabled:opacity-40" onClick={handleCommit} disabled={committing || saving || !editorLoaded || interactionBlocked || ingestionReviewActive}><span className="hidden sm:inline">{t('commit')}</span><span className="sm:hidden">{t('commitShort')}</span></button>
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
            {!ingestionReviewActive ? <HermesDraftDiff
              disabled={extracting || interactionBlocked}
              onCheck={revealDiff}
              onDraft={(target) => { revealDiff(target); void handleExtract(); }}
            /> : null}
            {draftPrompt && (
              <div className="mb-5 flex flex-wrap items-center gap-3 border-y border-os-rule-dark py-3 text-sm text-os-paper">
                <span>{t('draftFound')}</span>
                <button className="min-h-9 rounded-panel border border-os-rule-dark bg-transparent px-3 text-os-paper" onClick={restoreDraft}>{t('restoreDraft')}</button>
                <button className="min-h-9 rounded-panel border border-os-rule-dark bg-transparent px-3 text-os-paper" onClick={discardDraft}>{t('discardDraft')}</button>
              </div>
            )}
            {conflict ? (
              <ConflictResolutionPanel
                conflict={conflict}
                onChooseArtifacts={(choice) => setConflict((current) => current ? { ...current, artifactChoice: choice } : current)}
                onChooseField={chooseConflict}
                onResolve={resolveConflict}
                ready={conflictReady}
              />
            ) : null}
            {errorMsg && (
              <div className="mb-5 flex items-center justify-between gap-4 border-l-2 border-os-vermilion py-2 pl-4 text-sm text-os-paper" role="alert">
                <span>{errorMsg}</span>
                <button className="min-h-9 rounded-panel border border-os-rule-dark bg-transparent px-3 text-os-paper" onClick={() => setErrorMsg(null)}>{t('common.cancel')}</button>
              </div>
            )}
            {ingestionTasks.length > 0 ? (
              <section className="mb-6 border-y border-os-rule-paper bg-white px-4 py-5 text-os-ink" aria-labelledby="ingestion-proposal-heading">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-data text-[10px] uppercase tracking-[0.14em] text-os-vermilion-ink">{t('ingestionProposalKicker')}</p>
                    <h2 className="mt-2 text-xl font-normal text-os-ink" id="ingestion-proposal-heading">{t('ingestionProposalTitle')}</h2>
                  </div>
                  <label className="grid w-full min-w-0 gap-1 text-xs text-os-muted-paper sm:w-auto sm:max-w-full">
                    {t('ingestionSource')}
                    <select className="block min-h-10 w-full min-w-0 max-w-full truncate border border-os-rule-paper bg-white px-3 text-sm text-os-ink" disabled={confirmingIngestion || reanalyzingConfirmedIngestion || Boolean(confirmationIntent)} value={selectedIngestionTaskId} onChange={(event) => {
                      const taskId = event.target.value;
                      setSelectedIngestionTaskId(taskId);
                      setIngestionProposal(null);
                      router.replace(taskId ? `/research-objects/${encodeURIComponent(roId)}/edit?ingestionTask=${encodeURIComponent(taskId)}` : `/research-objects/${encodeURIComponent(roId)}/edit`);
                    }}>
                      <option value="">{t('chooseIngestionSource')}</option>
                      {ingestionTasks.map((task) => <option key={task.id} value={task.id}>{task.logicalPath} · {ingestionStatusT(ingestionProposal?.detail.task.id === task.id ? ingestionProposal.detail.task.state : task.state)}</option>)}
                    </select>
                  </label>
                </div>
                <p className="mt-3 text-sm leading-6 text-os-muted-paper">{t('ingestionProposalBody')}</p>
                {ingestionProposal && isRefreshableIngestionAnalysis(ingestionProposal.detail.task) ? (
                  <div className="mt-4 border-l-2 border-os-vermilion-ink pl-4">
                    <p className="text-sm leading-6 text-os-muted-paper">{t('legacyRefreshBody')}</p>
                    <button type="button" className="mt-3 min-h-11 rounded-panel border border-os-vermilion-ink px-4 text-sm font-semibold text-os-vermilion-ink disabled:opacity-50" disabled={refreshingLegacyIngestion || confirmingIngestion} onClick={() => void refreshLegacyProposal()}>{refreshingLegacyIngestion ? t('legacyRefreshing') : t('legacyRefreshAction')}</button>
                  </div>
                ) : null}
                {selectedIngestionTask?.confirmation && confirmedReanalysisSource?.taskId === selectedIngestionTask.id ? (
                  <div className="mt-4 border-l-2 border-os-vermilion-ink pl-4">
                    <p className="text-sm leading-6 text-os-muted-paper">{t('confirmedReanalysisBody')}</p>
                    <button type="button" className="mt-3 min-h-11 rounded-panel border border-os-vermilion-ink px-4 text-sm font-semibold text-os-vermilion-ink transition-transform active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50" disabled={reanalyzingConfirmedIngestion || confirmingIngestion} onClick={() => void createConfirmedReanalysisDraft()}>{reanalyzingConfirmedIngestion ? t('confirmedReanalyzing') : t('confirmedReanalysisAction')}</button>
                  </div>
                ) : null}
                {ingestionLoading ? <p className="mt-3 text-sm text-os-ink" role="status">{t('ingestionLoading')}</p> : null}
                {ingestionMessage ? <p className="mt-3 text-sm text-os-ink" role="status">{ingestionMessage}</p> : null}
                {showIngestionRecoveryLink ? <Link className="mt-3 inline-block border-b border-os-vermilion-ink pb-1 text-sm text-os-vermilion-ink" href={`/research-objects/${encodeURIComponent(roId)}/hermes?task=${encodeURIComponent(selectedIngestionTask!.id)}`}>{t('openIngestionRecovery')}</Link> : null}
                {ingestionProposal ? (
                  <div className="mt-5 space-y-5">
                    {SDF_FIELDS.map((field) => (
                      <div className="block text-sm font-medium text-os-ink" key={field}>
                        <label htmlFor={`ingestion-proposal-${field}`}>{t(field)}</label>
                        <textarea id={`ingestion-proposal-${field}`} className="mt-2 min-h-24 w-full resize-y border border-os-rule-paper bg-white p-3 text-base leading-7 text-os-ink outline-none focus:border-os-vermilion-ink focus:ring-2 focus:ring-os-vermilion-ink/20" disabled={confirmingIngestion || Boolean(confirmationIntent)} value={ingestionProposal.core[field]} onChange={(event) => editIngestionProposal(field, event.target.value)} rows={3} />
                        {ingestionProposal.touched.includes(field) ? <span className="mt-1 block text-xs font-normal text-os-muted-paper">{t('originalExtractionEvidence')}</span> : null}
                        <HermesExtractionEvidence field={field} result={ingestionProposal.detail.task.result} />
                      </div>
                    ))}
                    {extractMissingSdfFields(ingestionProposal.detail.task.result).length ? <p className="text-sm text-os-muted-paper">{t('ingestionMissingFields', { fields: extractMissingSdfFields(ingestionProposal.detail.task.result).map((field) => t(field)).join('、') })}</p> : null}
                    {!ingestionProposalHasContent ? <p className="text-sm text-state-danger" role="alert">{t('emptyIngestionProposal')}</p> : null}
                    <div className="flex flex-wrap items-center gap-4 border-t border-os-rule-paper pt-4">
                      <button className="min-h-11 rounded-panel bg-os-vermilion-ink px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={confirmingIngestion || refreshingLegacyIngestion || !ingestionProposalHasContent} onClick={() => void confirmIngestionProposal()}>{confirmingIngestion ? t('confirmingIngestion') : confirmationIntent ? t('reconcileIngestionConfirmation') : t('confirmIngestionProposal')}</button>
                      <span className="text-xs leading-5 text-os-muted-paper">{confirmationIntent ? t('ambiguousIngestionConfirmation') : t('confirmIngestionNotice')}</span>
                    </div>
                  </div>
                ) : null}
                {confirmedIngestion || ingestionMessage === t('ingestionAlreadyConfirmed') ? <Link className="mt-4 inline-block border-b border-os-vermilion pb-1 text-sm text-os-vermilion" href={`/research-objects/${encodeURIComponent(roId)}/hermes`}>{t('continueHermesResearch')}</Link> : null}
              </section>
            ) : null}
            {!ingestionReviewActive ? <CoreEditor disabled={interactionBlocked} sourceHref={versions[0] ? `/research-objects/${encodeURIComponent(roId)}/versions?version=${encodeURIComponent(versions[0].versionId)}#version-evidence` : undefined} core={state.core} onEdit={editField} activeField={activeField} onSelectField={setActiveField} /> : null}
            <ArtifactUploader disabled={interactionBlocked} workspaceId={workspaceId} researchObjectId={roId} artifacts={artifacts} onArtifactsChange={updateArtifacts} onIngestionStarted={(task) => {
              setIngestionTasks((current) => [...current.filter((candidate) => candidate.id !== task.id), { ...task, confirmation: null }]);
              setSelectedIngestionTaskId(task.id);
              router.replace(`/research-objects/${encodeURIComponent(roId)}/edit?ingestionTask=${encodeURIComponent(task.id)}`);
            }} />
          </>
        }
        aside={
          <>
            <HermesAnchor id="hermes-diff" sides={HERMES_DIFF_SIDES}>
              <SuggestionsPanel
                suggestions={suggestions}
                disabled={interactionBlocked}
                missingFields={missingFields}
                onAcknowledgeMissing={acknowledgeMissing}
                onApply={applySuggestion}
                onDismiss={dismissSuggestion}
                onExtract={handleExtract}
                extracting={extracting}
                extractProgress={extractProgress}
                extractError={extractError}
                extractionComplete={extractionComplete}
                canExtract={Boolean(aggregateCoreText(state.core)) || Boolean(recoverableExtraction?.taskId && !recoverableExtraction.retryAvailable)}
                resumeExtraction={Boolean(recoverableExtraction?.taskId && !recoverableExtraction.retryAvailable)}
                sourceHref={`/research-objects/${encodeURIComponent(roId)}/hermes`}
              />
            </HermesAnchor>
            <div className="mt-8 border-t border-os-rule-paper pt-4">
              <HermesDockAnchor assistantOpen={hermesOpen} onInvoke={() => setHermesOpen(true)} state={hermesRouteState} suggestion={editorSuggestion} workspaceId={roId} />
            </div>
            <HermesAssistantDrawer
              dashboardContext={{ tasks: [], researchObjects: [{ id: roId, title: objectMeta.title, status: 'draft' }] }}
              locale={locale}
              onOpenChange={setHermesOpen}
              open={hermesOpen}
              route="research-object-edit"
              routeResearchObjectId={params.id}
              suggestion={editorSuggestion}
              target={activeField ? `sdf-${activeField === 'reproducibility' ? 'evidence' : activeField}` as HermesDraftTarget : null}
            />
          </>
        }
      />
  );
}
