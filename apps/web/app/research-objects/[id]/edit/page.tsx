'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ResearchPresentation } from '@/components/presentation/ResearchPresentation';
import type { WorkspaceGuidePayload, WorkspaceGuideResult } from '@/lib/api';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import EditorLayout from '../../../../components/editor/EditorLayout';
import CoreEditor from '../../../../components/editor/CoreEditor';
import SuggestionsPanel from '../../../../components/editor/SuggestionsPanel';
import ArtifactUploader from '../../../../components/editor/ArtifactUploader';
import { ObjectHeader } from '../../../../components/research/ObjectHeader';
import { HermesAnchor } from '../../../../components/hermes/HermesAnchor';
import { HermesAssistantDrawer } from '../../../../components/hermes/HermesAssistantDrawer';
import { HermesDraftDiff, type HermesDraftTarget } from '../../../../components/hermes/HermesDraftDiff';
import { HermesExtractionEvidence } from '../../../../components/hermes/HermesExtractionEvidence';
import type { HermesGuideSuggestion } from '../../../../components/hermes/hermes-guide';
import { useOptionalHermesWorkspaceStage } from '../../../../components/hermes/HermesWorkspaceStage';
import {
  createCommit,
  apiRequest,
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
  editorReducer,
  emptyCore,
  loadDraft,
  saveDraft,
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
import styles from './workbench.module.css';

type FieldKey = keyof Omit<SdfCore, 'schemaVersion'>;
type EditorDraft = WorkspaceGuidePayload['context']['editorDraft'];
type PreparedVersion = { versionId: string; assertCurrent(): void };
type PrepareVersionIntent = { signature: string; idempotencyKey: string; promise?: Promise<PreparedVersion> };
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
  const tw = useTranslations('workbench');
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
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
  const currentCore = useRef(state.core); currentCore.current = state.core;
  const writingDraft = useRef(false);
  const activeWrite = useRef<Promise<unknown> | null>(null);
  const prepareVersionIntent = useRef<PrepareVersionIntent | null>(null);
  const confirmedSnapshot = useRef<SdfCore | null>(null);
  const lastHermesEdit = useRef<WorkspaceGuideResult['draftEdit']>(undefined);
  const [suggestions, dispatchSuggestions] = useReducer(suggestionReducer, []);
  const [artifacts, setArtifacts] = useState<ArtifactReference[]>([]);
  const currentArtifacts = useRef(artifacts); currentArtifacts.current = artifacts;
  const [committedArtifacts, setCommittedArtifacts] = useState<ArtifactReference[]>([]);
  const currentCommittedArtifacts = useRef(committedArtifacts); currentCommittedArtifacts.current = committedArtifacts;
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [checkedSnapshotVersion, setCheckedSnapshotVersion] = useState('');
  const snapshotReady = Boolean(versions[0] && checkedSnapshotVersion === versions[0].versionId);
  useEffect(() => {
    const versionId = versions[0]?.versionId;
    setCheckedSnapshotVersion('');
    if (!versionId) return;
    let active = true;
    void apiRequest<{ record: { objectId: string; versionId: string; sdf: SdfCore } }>(`/api/research-objects/${encodeURIComponent(roId)}/versions/${encodeURIComponent(versionId)}/record`).then(({ record }) => {
      if (!active || record.objectId !== roId || record.versionId !== versionId) return;
      confirmedSnapshot.current = record.sdf;
      setNeedsConfirmation(SDF_FIELDS.some((field) => currentCore.current[field] !== record.sdf[field]));
      setCheckedSnapshotVersion(versionId);
    }).catch(() => { if (active) setNeedsConfirmation(true); });
    return () => { active = false; };
  }, [roId, versions[0]?.versionId]);
  const [ingestionTasks, setIngestionTasks] = useState<Awaited<ReturnType<typeof loadResearchMaterials>>['ingestion']['tasks']>([]);
  const [selectedIngestionTaskId, setSelectedIngestionTaskId] = useState(ingestionTaskId);
  const [ingestionProposal, setIngestionProposal] = useState<IngestionProposal | null>(null);
  const [ingestionLoading, setIngestionLoading] = useState(false);
  const [ingestionMessage, setIngestionMessage] = useState<string | null>(null);
  const [confirmingIngestion, setConfirmingIngestion] = useState(false);
  const [confirmationIntent, setConfirmationIntent] = useState<IngestionProposal | null>(null);
  const [refreshingLegacyIngestion, setRefreshingLegacyIngestion] = useState(false);
  const [reanalyzingConfirmedIngestion, setReanalyzingConfirmedIngestion] = useState(false);
  const [confirmedReanalysisSource, setConfirmedReanalysisSource] = useState<{ taskId: string; agentTaskId: string } | null>(null);
  const selectedIngestionTask = ingestionTasks.find((task) => task.id === selectedIngestionTaskId);
  const ingestionReviewActive = Boolean(selectedIngestionTask && !selectedIngestionTask.confirmation);
  const ingestionProposalHasContent = Boolean(ingestionProposal && SDF_FIELDS.some((field) => ingestionProposal.core[field].trim()));
  const showIngestionRecoveryLink = Boolean(selectedIngestionTask && (
    selectedIngestionTask.state === 'failed_retryable'
    || selectedIngestionTask.state === 'failed_blocked'
    || (!ingestionLoading && !ingestionProposal && !selectedIngestionTask.confirmation && Boolean(ingestionMessage))
    || (ingestionProposal && !ingestionProposalHasContent)
  ));
  const [activeField, setActiveField] = useState<FieldKey | null>('problem');
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const [objectMeta, setObjectMeta] = useState<{ title: string; visibility: string }>({
    title: t('untitledObject'),
    visibility: 'private',
  });
  const [draftPrompt, setDraftPrompt] = useState(false);
  const ingestionWriteBlocked = useRef(false);
  ingestionWriteBlocked.current = Boolean(draftPrompt || ingestionReviewActive || ingestionProposal || confirmationIntent || confirmingIngestion);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [serverSaveState, setServerSaveState] = useState<'dirty' | 'saving' | 'saved' | 'error'>('saved');
  const [hermesOpen, setHermesOpen] = useState(false);
  const [hermesGoal, setHermesGoal] = useState('');
  useEffect(() => { if (window.matchMedia('(min-width: 1024px)').matches) setHermesOpen(true); }, []);
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
  const protectedEditorDraftFields = useRef<Set<SdfField>>(new Set());
  const serverCore = useRef<SdfCore>(emptyCore());
  const serverVersion = useRef(1);
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
        serverCore.current = core;
        serverVersion.current = ro.researchObject.version;
        // 草稿恢复（§18.3）
        const draft = loadDraft(roId);
        if (draft && Date.now() - draft.savedAt < 24 * 3600 * 1000) {
          protectedEditorDraftFields.current = new Set(SDF_FIELDS.filter((field) => draft.core[field] !== core[field]));
          setDraftPrompt(true);
          dispatch({ type: 'init', core: draft.core, version: ro.researchObject.version, dirty: SDF_FIELDS.some((field) => draft.core[field] !== core[field]) });
        } else {
          protectedEditorDraftFields.current = new Set();
          dispatch({ type: 'init', core, version: ro.researchObject.version });
        }
        const restored = await loadResearchMaterials(roId);
        const vs = { versions: restored.versions };
        if (cancelled) return;
        setArtifacts(restored.artifacts); setCommittedArtifacts(restored.artifacts);
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
          setArtifacts(current.artifacts); setCommittedArtifacts(current.artifacts);
          setVersions(current.versions);
          setIngestionTasks(current.ingestion.tasks);
          dispatch({ type: 'init', core: ro.researchObject.sdf?.core ?? frozen.core, version: ro.researchObject.version });
          setIngestionProposal(null);
          setConfirmationIntent(null);
          setIngestionMessage(t('ingestionConfirmed'));
          return;
        }
      }
      await confirmIngestionTask(frozen.detail.task.id, { version: frozen.detail.version, core: frozen.core });
      clearIngestionProposalDraft(getIngestionProposalStorage(), frozen.scope);
      const [restored, ro] = await Promise.all([loadResearchMaterials(roId), getResearchObject(roId)]);
      setArtifacts(restored.artifacts); setCommittedArtifacts(restored.artifacts);
      setVersions(restored.versions);
      setIngestionTasks(restored.ingestion.tasks);
      dispatch({ type: 'init', core: ro.researchObject.sdf?.core ?? frozen.core, version: ro.researchObject.version });
      clearDraft(roId);
      setIngestionProposal(null);
      setConfirmationIntent(null);
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
          setArtifacts(restored.artifacts); setCommittedArtifacts(restored.artifacts);
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
          setArtifacts(restored.artifacts); setCommittedArtifacts(restored.artifacts);
          setVersions(restored.versions);
          setIngestionTasks(restored.ingestion.tasks);
          dispatch({ type: 'init', core: ro.researchObject.sdf?.core ?? frozen.core, version: ro.researchObject.version });
          setIngestionProposal(null);
          setConfirmationIntent(null);
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
    } catch (cause) {
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

  async function saveCurrentDraftToServer() {
    while (activeWrite.current) {
      const pending = activeWrite.current;
      const versionBeforeWait = serverVersion.current;
      try { await pending; } catch {
        // A prepared commit can succeed and then reject because the user edited while it was writing.
        // In that known-success case the advanced server version is safe to use for the newer draft.
        if (serverVersion.current === versionBeforeWait) return;
      }
    }
    if (!editorLoaded || ingestionWriteBlocked.current) return;
    const frozenCore = { ...currentCore.current };
    if (SDF_FIELDS.every((field) => frozenCore[field] === serverCore.current[field])) return;
    const baseVersion = serverVersion.current;
    let run!: Promise<void>;
    run = (async (): Promise<void> => {
      writingDraft.current = true;
      setServerSaveState('saving');
      setErrorMsg(null);
      try {
        await updateSdf(roId, baseVersion, frozenCore);
        serverCore.current = frozenCore;
        serverVersion.current = baseVersion + 1;
        const unchanged = SDF_FIELDS.every((field) => currentCore.current[field] === frozenCore[field]);
        dispatch({ type: 'saved', version: baseVersion + 1, core: frozenCore });
        setNeedsConfirmation(!confirmedSnapshot.current
          || SDF_FIELDS.some((field) => currentCore.current[field] !== confirmedSnapshot.current![field]));
        if (unchanged) clearDraft(roId);
        setServerSaveState(unchanged ? 'saved' : 'dirty');
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        setServerSaveState('error');
        setErrorMsg(error.message);
        throw error;
      } finally {
        writingDraft.current = false;
        if (activeWrite.current === run) activeWrite.current = null;
      }
    })();
    activeWrite.current = run;
    try { await run; } catch { /* Keep the browser draft and wait for a new edit before retrying. */ }
  }

  // 浏览器草稿与服务端 SDF 自动保存共用一次 debounce；服务端失败后不循环重试。
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (!state.dirty) return;
      saveDraft(roId, state.core);
      void saveCurrentDraftToServer();
    }, 1000);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [confirmationIntent, confirmingIngestion, draftPrompt, editorLoaded, ingestionProposal, ingestionReviewActive, roId, state.core, state.dirty]);

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
    currentCore.current = { ...currentCore.current, [field]: value };
    saveDraft(roId, currentCore.current);
    dispatch({ type: 'edit_field', field, value });
  }

  const draftCore = ingestionProposal?.core ?? state.core;
  const draftScope = ingestionProposal ? `ingestion:${ingestionProposal.detail.task.id}` : 'sdf';
  useEffect(() => { if (state.dirty) setNeedsConfirmation(true); }, [state.dirty]);
  const editorDraft: NonNullable<WorkspaceGuidePayload['context']['editorDraft']> = {
    researchObjectId: roId, scope: draftScope, version: state.version,
    core: { problem: draftCore.problem, insight: draftCore.insight, method: draftCore.method, results: draftCore.results, limitations: draftCore.limitations, reproducibility: draftCore.reproducibility },
  };
  function applyHermesEdit(edit: NonNullable<WorkspaceGuideResult['draftEdit']>, replace = false) {
    const changed = SDF_FIELDS.filter((field) => typeof edit.changes[field] === 'string');
    if (!editorLoaded || confirmingIngestion || confirmationIntent || writingDraft.current || edit.base.researchObjectId !== roId || edit.base.scope !== draftScope || edit.base.version !== state.version) return { applied: 0, conflicts: changed.length };
    const applied: typeof edit.changes = {};
    const base = { ...editorDraft, core: { ...editorDraft.core } };
    let conflicts = 0;
    for (const field of changed) {
      if (!replace && draftCore[field] !== edit.base.core[field]) { conflicts++; continue; }
      const value = edit.changes[field]!;
      if (value === draftCore[field]) continue;
      applied[field] = value;
      if (ingestionProposal) editIngestionProposal(field, value); else editField(field, value);
    }
    if (Object.keys(applied).length) lastHermesEdit.current = { base, changes: applied };
    return { applied: Object.keys(applied).length, conflicts };
  }
  function undoHermesEdit() {
    const last = lastHermesEdit.current;
    if (!last || last.base.scope !== draftScope || last.base.version !== state.version) return;
    for (const field of SDF_FIELDS) if (last.changes[field] !== undefined && draftCore[field] === last.changes[field]) {
      if (ingestionProposal) editIngestionProposal(field, last.base.core[field]); else editField(field, last.base.core[field]);
    }
    lastHermesEdit.current = undefined;
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
    const revised = suggestionReducer(suggestions, { type: 'revise', id, suggestion: value });
    const applied = suggestionReducer(revised, { type: 'apply', id });
    dispatchSuggestions({ type: 'revise', id, suggestion: value });
    dispatchSuggestions({ type: 'apply', id });
    const next = applySuggestionsToCore(state.core, applied);
    for (const [k, v] of Object.entries(next) as [FieldKey, string][]) {
      if (v !== state.core[k]) dispatch({ type: 'edit_field', field: k, value: v });
    }
    saveDraft(roId, next);
    advanceReview(id);
  }

  function dismissSuggestion(id: string) {
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
    const remaining = missingFields.filter((candidate) => candidate !== field);
    setMissingFields(remaining);
    persistReview((checkpoint) => ({
      ...checkpoint,
      acknowledgedMissingFields: [...new Set([...checkpoint.acknowledgedMissingFields, field])],
    }));
    const nextSuggestion = suggestions.find((item) => item.status === 'pending');
    setActiveField(nextSuggestion?.field ?? remaining[0] ?? field);
  }

  /** P1D-3：AI 提取（§9.3 异步长任务 + §18.3 轮询进度）。提取只产出建议，不写 SDF（§9.2）。 */
  async function handleExtract() {
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

  const prepareVersion = useCallback(async (expected: EditorDraft): Promise<PreparedVersion> => {
    if (!expected) throw new Error(tw('versionMismatch'));
    if (expected.researchObjectId !== roId || expected.scope !== 'sdf') throw new Error(tw('versionMismatch'));
    const inFlightPrepare = prepareVersionIntent.current;
    if (inFlightPrepare?.promise) {
      const currentSignature = JSON.stringify([
        expected.researchObjectId,
        serverVersion.current,
        SDF_FIELDS.map((field) => expected.core[field]),
        currentArtifacts.current.map((artifact) => [artifact.artifactId, artifact.logicalPath]),
      ]);
      const sameCore = SDF_FIELDS.every((field) => expected.core[field] === currentCore.current[field]);
      if (!sameCore || currentSignature !== inFlightPrepare.signature) throw new Error(tw('versionMismatch'));
      return inFlightPrepare.promise;
    }
    while (activeWrite.current) {
      const pending = activeWrite.current;
      const concurrentPrepare = prepareVersionIntent.current;
      if (concurrentPrepare?.promise === pending) {
        const currentSignature = JSON.stringify([
          expected.researchObjectId,
          serverVersion.current,
          SDF_FIELDS.map((field) => expected.core[field]),
          currentArtifacts.current.map((artifact) => [artifact.artifactId, artifact.logicalPath]),
        ]);
        const sameCore = SDF_FIELDS.every((field) => expected.core[field] === currentCore.current[field]);
        if (!sameCore || currentSignature !== concurrentPrepare.signature) throw new Error(tw('versionMismatch'));
        return concurrentPrepare.promise;
      }
      await pending;
    }
    const coreMatches = SDF_FIELDS.every((field) => expected.core[field] === currentCore.current[field]);
    if (!editorLoaded || !coreMatches) throw new Error(tw('versionMismatch'));
    if (ingestionWriteBlocked.current) {
      throw new Error(t('ingestionProposalBody'));
    }

    const frozenCore: SdfCore = { ...currentCore.current };
    const frozenArtifacts = [...currentArtifacts.current];
    const baseVersion = serverVersion.current;
    const assertCurrent = () => {
      const coreIsCurrent = expected.researchObjectId === roId
        && expected.scope === 'sdf'
        && SDF_FIELDS.every((field) => currentCore.current[field] === frozenCore[field]);
      const currentArtifactList = currentArtifacts.current;
      const artifactsAreCurrent = currentArtifactList.length === frozenArtifacts.length
        && frozenArtifacts.every((artifact, index) => artifact.artifactId === currentArtifactList[index]?.artifactId
          && artifact.logicalPath === currentArtifactList[index]?.logicalPath);
      if (!coreIsCurrent || !artifactsAreCurrent) throw new Error(tw('versionMismatch'));
    };
    const coreSavedToServer = SDF_FIELDS.every((field) => frozenCore[field] === serverCore.current[field]);
    const savedArtifactList = currentCommittedArtifacts.current;
    const artifactsSavedToServer = savedArtifactList.length === frozenArtifacts.length
      && frozenArtifacts.every((artifact, index) => artifact.artifactId === savedArtifactList[index]?.artifactId
        && artifact.logicalPath === savedArtifactList[index]?.logicalPath);
    if (versions[0] && snapshotReady && coreSavedToServer && artifactsSavedToServer && !needsConfirmation
      && confirmedSnapshot.current && SDF_FIELDS.every((field) => confirmedSnapshot.current![field] === expected.core[field])) {
      assertCurrent();
      return { versionId: versions[0].versionId, assertCurrent };
    }

    const signature = JSON.stringify([
      expected.researchObjectId,
      baseVersion,
      SDF_FIELDS.map((field) => expected.core[field]),
      frozenArtifacts.map((artifact) => [artifact.artifactId, artifact.logicalPath]),
    ]);
    const previous = prepareVersionIntent.current;
    if (previous && previous.signature !== signature) throw new Error(tw('versionMismatch'));
    if (previous?.promise) return previous.promise;
    if (writingDraft.current || activeWrite.current) throw new Error(tw('savingContent'));

    const intent: PrepareVersionIntent = previous ?? { signature, idempotencyKey: crypto.randomUUID() };
    let run!: Promise<PreparedVersion>;
    run = (async (): Promise<PreparedVersion> => {
      writingDraft.current = true;
      setErrorMsg(null);
      try {
        const result = await createCommit(roId, {
          message: t('draftRevision', { version: baseVersion }),
          version: baseVersion,
          sdfCore: frozenCore,
          artifacts: frozenArtifacts,
        }, intent.idempotencyKey);
        const nextObjectVersion = baseVersion + 1;
        const unchanged = SDF_FIELDS.every((field) => currentCore.current[field] === frozenCore[field]);
        setCommittedArtifacts(frozenArtifacts);
        serverCore.current = frozenCore;
        serverVersion.current = nextObjectVersion;
        dispatch({ type: 'saved', version: nextObjectVersion, core: frozenCore });
        confirmedSnapshot.current = frozenCore;
        setNeedsConfirmation(!unchanged);
        if (unchanged) clearDraft(roId);
        if (!suggestions.some((item) => item.status === 'pending') && missingFields.length === 0) {
          clearExtractReviewState(window.localStorage, roId);
        }
        setCheckedSnapshotVersion(result.commit.versionId);
        try {
          const refreshed = await listVersions(roId);
          setVersions(refreshed.versions ?? []);
        } catch {
          setVersions((current) => [
            { versionId: result.commit.versionId, versionNo: result.commit.versionNo, status: 'draft' },
            ...current.filter((version) => version.versionId !== result.commit.versionId),
          ]);
        }
        prepareVersionIntent.current = null;
        assertCurrent();
        return { versionId: result.commit.versionId, assertCurrent };
      } catch (cause) {
        const ambiguous = !(cause instanceof ApiClientError)
          || cause.status === 0 || cause.status === 408 || cause.status === 429 || cause.status >= 500;
        if (!ambiguous) prepareVersionIntent.current = null;
        const error = cause instanceof Error ? cause : new Error(String(cause));
        setErrorMsg(error.message);
        throw error;
      } finally {
        writingDraft.current = false;
        if (activeWrite.current === run) activeWrite.current = null;
        if (prepareVersionIntent.current === intent) intent.promise = undefined;
      }
    })();
    intent.promise = run;
    prepareVersionIntent.current = intent;
    activeWrite.current = run;
    return run;
  }, [editorLoaded, missingFields, needsConfirmation, roId, snapshotReady, suggestions, t, tw, versions]);

  function restoreDraft() {
    setDraftPrompt(false);
  }

  function discardDraft() {
    clearDraft(roId);
    setErrorMsg(null);
    setServerSaveState('saved');
    protectedEditorDraftFields.current = new Set();
    dispatch({ type: 'init', core: serverCore.current, version: serverVersion.current });
    currentCore.current = serverCore.current;
    setNeedsConfirmation(!confirmedSnapshot.current || SDF_FIELDS.some((field) => serverCore.current[field] !== confirmedSnapshot.current![field]));
    setDraftPrompt(false);
  }

  function handleVersionSelect(versionId: string) {
    router.push(`/research-objects/${encodeURIComponent(roId)}/versions?version=${encodeURIComponent(versionId)}`);
  }

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

  if (!editorLoaded) return <EditorLayout objectId={roId} outline={null} aside={null} workflow={<div className="h-16" aria-hidden="true" />} main={<div className="py-8"><p role={errorMsg ? 'alert' : 'status'} className="text-sm leading-6 text-os-muted-paper">{errorMsg || tw('loadingVersion')}</p>{errorMsg && <Link className="mt-4 inline-flex min-h-11 items-center text-sm underline" href={`/research-objects/${encodeURIComponent(roId)}/overview`}>{tw('details')}</Link>}</div>} />;

  return (
    <EditorLayout
        objectId={roId}
        workspaceClassName={`editor-workspace research-product ${styles.workbenchShell}`}
        workflow={<div className={styles.workbenchNav}>
          <span className={styles.navContext}>{tw('navigation')}</span>
          <span className={styles.navSpacer} />
          <Link className={styles.detailsLink} href={`/research-objects/${encodeURIComponent(roId)}/overview`}>{tw('details')}</Link>
        </div>}
        header={
          <ObjectHeader
            objectId={roId}
            saveState={serverSaveState === 'saving' ? 'saving' : serverSaveState === 'error' && state.dirty ? 'error' : state.dirty ? 'dirty' : 'saved'}
            title={objectMeta.title}
            version={state.version}
            visibility={objectMeta.visibility}
          />
        }
        outline={null}
        main={
          <div className={styles.document}>
            <section className={styles.contentSection} id="workbench-content" data-workbench-section="content">
            {draftPrompt && (
              <div className={styles.notice}>
                <span>{t('draftFound')}</span>
                <button className={styles.secondaryButton} onClick={restoreDraft}>{t('restoreDraft')}</button>
                <button className={styles.secondaryButton} onClick={discardDraft}>{t('discardDraft')}</button>
              </div>
            )}
            {errorMsg && (
              <div className={styles.errorNotice} role="alert">
                <span>{errorMsg}</span>
                <button className={styles.secondaryButton} onClick={() => setErrorMsg(null)}>{t('common.cancel')}</button>
              </div>
            )}

            {!ingestionReviewActive ? <CoreEditor sourceHref={versions[0] ? `/research-objects/${encodeURIComponent(roId)}/versions?version=${encodeURIComponent(versions[0].versionId)}#version-evidence` : undefined} core={state.core} onEdit={editField} activeField={activeField} onSelectField={setActiveField} /> : null}

            <details className={styles.disclosure} open={ingestionReviewActive || undefined}>
              <summary><span>{t('artifacts')}</span><small>{tw('confirmedSources')}</small></summary>
              <div className={styles.disclosureBody}>
                <ArtifactUploader workspaceId={workspaceId} researchObjectId={roId} artifacts={artifacts} onArtifactsChange={setArtifacts} onIngestionStarted={(task) => {
                  setIngestionTasks((current) => [...current.filter((candidate) => candidate.id !== task.id), { ...task, confirmation: null }]);
                  setSelectedIngestionTaskId(task.id);
                  router.replace(`/research-objects/${encodeURIComponent(roId)}/edit?ingestionTask=${encodeURIComponent(task.id)}`);
                }} />
                {!ingestionReviewActive ? <HermesDraftDiff
                  disabled={extracting}
                  onCheck={revealDiff}
                  onDraft={(target) => { revealDiff(target); void handleExtract(); }}
                /> : null}
              </div>
            </details>
            {ingestionTasks.length > 0 ? (<details className="mb-5" open={ingestionReviewActive || Boolean(selectedIngestionTaskId) || ingestionTasks.some((task) => !task.confirmation) || undefined}>
              <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-os-vermilion-ink">{tw('sourceReview')}</summary>
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
                <p className="mt-3 text-sm leading-6 text-os-muted-paper">{ingestionReviewActive ? t('ingestionProposalBody') : tw('confirmedSources')}</p>
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
              </section></details>
            ) : null}
            {!ingestionReviewActive ? <details className={styles.disclosure}>
              <summary><span>{tw('analysisSuggestions')}</span><small>{t('suggestions')}</small></summary>
              <div className={styles.disclosureBody}>
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
                    extractError={extractError}
                    extractionComplete={extractionComplete}
                    canExtract={Boolean(aggregateCoreText(state.core)) || Boolean(recoverableExtraction?.taskId && !recoverableExtraction.retryAvailable)}
                    resumeExtraction={Boolean(recoverableExtraction?.taskId && !recoverableExtraction.retryAvailable)}
                    sourceHref={`/research-objects/${encodeURIComponent(roId)}/hermes`}
                  />
                </HermesAnchor>
              </div>
            </details> : null}

            <details className={styles.disclosure}>
              <summary><span>{t('versions')}</span><small>{versions.length ? t('draftRevision', { version: state.version }) : tw('loadingVersion')}</small></summary>
              <div className={styles.versionList}>
                {versions.slice(0, 8).map((version) => (
                  <button key={version.versionId} onClick={() => handleVersionSelect(version.versionId)} type="button">
                    <span>v{version.versionNo}</span><span>{t(`versionStatus.${version.status}`)}</span>
                  </button>
                ))}
                <Link href={`/research-objects/${encodeURIComponent(roId)}/versions`}>{t('versions')}</Link>
              </div>
            </details>

            </section>

            <section className={styles.productSection} id="workbench-media" data-workbench-section="media">
              <header className={styles.productSectionHeader}><h2>{tw('media')}</h2></header>
              {versions.length > 0 && !snapshotReady ? <p className={styles.lockedMessage} role="status">{tw('loadingVersion')}</p> : null}
              {versions[0] && snapshotReady ? <ResearchPresentation key={versions[0].versionId} params={{ id: roId }} embedded selectedVersionId={versions[0].versionId} /> : null}
            </section>
          </div>
        }
        aside={
          <>
            {!hermesOpen && <button type="button" className={styles.hermesButton} onClick={() => { setHermesGoal(''); setHermesOpen(true); }}>Hermes · {tw('talkToHermes')}</button>}
            <HermesAssistantDrawer
              docked
              initialGoal={hermesGoal}
              dashboardContext={{ tasks: [], researchObjects: [{ id: roId, title: objectMeta.title, status: 'draft' }], ...(versions[0] ? { presentation: { researchObjectId: roId, versionId: versions[0].versionId } } : {}), ...(editorLoaded ? { editorDraft } : {}) }}
              onDraftEdit={applyHermesEdit}
              onPrepareVersion={prepareVersion}
              onUndoDraftEdit={undoHermesEdit}
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
